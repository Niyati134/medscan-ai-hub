import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { dbError } from "./safeError";

export type FamilyMember = {
  id: string;
  name: string;
  relationship: string;
  gender: string | null;
  date_of_birth: string | null;
  age: number | null;
  blood_group: string | null;
  allergies: string | null;
  medical_conditions: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  avatar_url: string | null;
  notes: string | null;
  created_at: string;
};

const memberInput = z.object({
  name: z.string().trim().min(1).max(100),
  relationship: z.enum(["Father", "Mother", "Child", "Spouse", "Sibling", "Other"]),
  gender: z.string().trim().max(20).optional().nullable(),
  date_of_birth: z.string().optional().nullable(),
  age: z.number().int().min(0).max(130).optional().nullable(),
  blood_group: z.string().trim().max(10).optional().nullable(),
  allergies: z.string().trim().max(500).optional().nullable(),
  medical_conditions: z.string().trim().max(1000).optional().nullable(),
  emergency_contact_name: z.string().trim().max(100).optional().nullable(),
  emergency_contact_phone: z.string().trim().max(30).optional().nullable(),
  avatar_url: z.string().trim().max(500).optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
});

export const listFamilyMembers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("family_members")
      .select("*")
      .order("created_at", { ascending: true });
    if (error) throw dbError("family", error);
    return (data ?? []) as FamilyMember[];
  });

export const createFamilyMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => memberInput.parse(input))
  .handler(async ({ data, context }) => {
    const { error, data: row } = await context.supabase
      .from("family_members")
      .insert({ ...data, user_id: context.userId })
      .select()
      .single();
    if (error) throw dbError("family", error);
    return row as FamilyMember;
  });

export const updateFamilyMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    memberInput.extend({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { id, ...patch } = data;
    const { error } = await context.supabase
      .from("family_members")
      .update(patch)
      .eq("id", id)
      .eq("user_id", context.userId);
    if (error) throw dbError("family", error);
    return { ok: true };
  });

export const deleteFamilyMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("family_members")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw dbError("family", error);
    return { ok: true };
  });
