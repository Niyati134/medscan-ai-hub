import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { AiError, callAi, parseAiJson } from "./ai.server";
import { LANGUAGE_CODES, languageName } from "./i18n";

/** Batch-translate UI/AI text into a target language using Gemini. */
export const translateTexts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        texts: z.array(z.string().min(1).max(4000)).min(1).max(40),
        targetLanguage: z.enum(LANGUAGE_CODES),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    if (data.targetLanguage === "en") return { translations: data.texts };
    const target = languageName(data.targetLanguage);
    let raw: string;
    try {
      raw = await callAi({
      responseFormat: "json_object",
      thinkingLevel: "low",
      maxOutputTokens: 16_384,
      messages: [
        {
          role: "system",
          content:
            `You are a professional medical translator. Translate each string in the JSON ` +
            `array "texts" into ${target}. Keep medical meaning accurate, use simple words, ` +
            `preserve numbers, dosages and medicine names in their original form. ` +
            `Respond ONLY with valid JSON: { "translations": ["..."] } with the same length and order.`,
        },
        { role: "user", content: JSON.stringify({ texts: data.texts }) },
      ],
      });
    } catch (e) {
      // Never surface provider details; fall back to the original text.
      console.warn(
        `[i18n] translate_failed category=${e instanceof AiError ? e.code : "unexpected"}`,
      );
      return { translations: data.texts, degraded: true };
    }

    const parsed = parseAiJson<{ translations?: unknown }>(raw);
    let translations: string[] = [];
    if (parsed && Array.isArray(parsed.translations)) {
      translations = parsed.translations
        .filter((t) => typeof t === "string" || typeof t === "number")
        .map((t) => String(t).slice(0, 4000));
    }
    // Safety: never return fewer translations than inputs.
    if (translations.length !== data.texts.length) {
      return { translations: data.texts, degraded: true };
    }
    // Preserve original text for any empty translation.
    return {
      translations: translations.map((t, i) => (t.trim() ? t : data.texts[i]!)),
      degraded: false,
    };
  });
