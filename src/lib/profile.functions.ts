import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { dbError } from "./safeError";

export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("profiles")
      .select(
        "id,display_name,avatar_url,created_at,blood_group,allergies,emergency_contact_name,emergency_contact_phone,preferred_language",
      )
      .eq("id", userId)
      .maybeSingle();
    if (error) throw dbError("profile", error);
    return data;
  });

export const updateMyProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        display_name: z.string().trim().min(1).max(100),
        blood_group: z.string().trim().max(10).optional().nullable(),
        allergies: z.string().trim().max(500).optional().nullable(),
        emergency_contact_name: z.string().trim().max(100).optional().nullable(),
        emergency_contact_phone: z.string().trim().max(30).optional().nullable(),
        preferred_language: z.enum(["en", "hi", "mr", "ml", "ta", "te"]).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("profiles")
      .update({
        display_name: data.display_name,
        blood_group: data.blood_group ?? null,
        allergies: data.allergies ?? null,
        emergency_contact_name: data.emergency_contact_name ?? null,
        emergency_contact_phone: data.emergency_contact_phone ?? null,
        preferred_language: data.preferred_language ?? "en",
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId);
    if (error) throw dbError("profile", error);
    return { ok: true };
  });
