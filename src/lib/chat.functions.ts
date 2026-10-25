import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { AiError, callAi } from "./ai.server";
import { dbError } from "./safeError";

const CHAT_FALLBACK =
  "I'm having trouble responding right now. Please try again in a moment.";

const CHAT_SYSTEM = `You are MedScan AI, a friendly healthcare assistant.
Help users understand medications, dosages, side effects, drug interactions, and general
health questions. Always remind users to consult a licensed physician for personal medical
advice. Keep answers concise, structured with short bullet points when helpful, and avoid
diagnostic certainty.`;

/**
 * Send a message inside a specific conversation.
 *
 * If conversationId is not provided, a new conversation is created.
 */
export const sendChatMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        message: z.string().min(1).max(2000),
        conversationId: z.string().uuid().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Create a new conversation ID when starting a fresh chat.
    const conversationId =
      data.conversationId ?? crypto.randomUUID();

    // Save user message.
    const { error: userMessageError } = await supabase
      .from("chat_messages")
      .insert({
        user_id: userId,
        conversation_id: conversationId,
        role: "user",
        content: data.message,
      });

    if (userMessageError) {
      throw dbError("chat.save_user_message", userMessageError);
    }

    // Load the most RECENT messages of the CURRENT conversation. (Ordering ascending
    // + limit would return the oldest 20 and drop the newest turns - including the
    // message that was just sent - once a conversation grows past 20 messages.)
    const { data: recent, error: historyError } = await supabase
      .from("chat_messages")
      .select("role,content")
      .eq("user_id", userId)
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(20);

    if (historyError) {
      throw dbError("chat.history", historyError);
    }
    const history = (recent ?? []).slice().reverse();

    // Honour the user's preferred language.
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("preferred_language")
      .eq("id", userId)
      .maybeSingle();
    if (profileError) {
      console.warn("[chat] could not read preferred language:", profileError.message);
    }

    const langName =
      (
        [
          ["hi", "Hindi"],
          ["mr", "Marathi"],
          ["ml", "Malayalam"],
          ["ta", "Tamil"],
          ["te", "Telugu"],
        ] as const
      ).find(([c]) => c === profile?.preferred_language)?.[1] ?? null;

    const system = langName
      ? `${CHAT_SYSTEM}\nIMPORTANT: The user's preferred language is ${langName}. Reply entirely in ${langName}, keeping medicine names and dosages in their original form.`
      : CHAT_SYSTEM;

    let reply: string;
    let ok = true;

    try {
      reply = await callAi({
        messages: [
          { role: "system", content: system },
          ...history.map((m) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
          })),
        ],
      });

      if (typeof reply !== "string" || !reply.trim()) {
        ok = false;
        reply = CHAT_FALLBACK;
      }
    } catch (e) {
      console.warn(
        `[chat] ai_failed category=${e instanceof AiError ? e.code : "unexpected"}`,
      );

      ok = false;
      reply = e instanceof AiError ? e.message : CHAT_FALLBACK;
    }

    if (ok) {
      // Save genuine assistant response in the same conversation.
      const { error: assistantMessageError } = await supabase
        .from("chat_messages")
        .insert({
          user_id: userId,
          conversation_id: conversationId,
          role: "assistant",
          content: reply,
        });

      if (assistantMessageError) {
        throw dbError("chat.save_reply", assistantMessageError);
      }
    }

    return {
      reply,
      conversationId,
      degraded: !ok,
    };
  });

/**
 * Get the most recent chat messages (oldest first) for the logged-in user.
 * The UI groups them by conversationId.
 */
export const getChatHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // Newest 500 (so recent conversations never fall off the end), returned oldest-first.
    const { data, error } = await context.supabase
      .from("chat_messages")
      .select("id,conversation_id,role,content,created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(500);

    if (error) throw dbError("chat.list", error);

    return (data ?? []).slice().reverse();
  });