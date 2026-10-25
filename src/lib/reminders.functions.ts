import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertOwnsMember, assertOwnsScan } from "./ownership";
import { dbError } from "./safeError";

const timeRe = /^([01]\d|2[0-3]):[0-5]\d$/;

const reminderInput = z.object({
  medicine_name: z.string().trim().min(1).max(200),
  dosage: z.string().trim().max(100).optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
  times: z.array(z.string().regex(timeRe)).min(1).max(8),
  days_of_week: z.array(z.number().int().min(0).max(6)).min(1).max(7),
  start_date: z.string().optional(),
  end_date: z.string().optional().nullable(),
  scan_id: z.string().uuid().optional().nullable(),
  member_id: z.string().uuid().optional().nullable(),
});

export const listReminders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ memberId: z.string().uuid().nullable().optional() })
      .optional()
      .transform((v) => v ?? {})
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("reminders")
      .select("*")
      .order("created_at", { ascending: false });
    if (data.memberId === null) q = q.is("member_id", null);
    else if (typeof data.memberId === "string") q = q.eq("member_id", data.memberId);
    const { data: rows, error } = await q;
    if (error) throw dbError("reminders", error);
    return rows ?? [];
  });

export const createReminder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => reminderInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertOwnsScan(context.supabase, context.userId, data.scan_id);
    await assertOwnsMember(context.supabase, context.userId, data.member_id);
    const { error, data: row } = await context.supabase
      .from("reminders")
      .insert({
        user_id: context.userId,
        medicine_name: data.medicine_name,
        dosage: data.dosage ?? null,
        notes: data.notes ?? null,
        times: data.times,
        days_of_week: data.days_of_week,
        start_date: data.start_date ?? new Date().toISOString().slice(0, 10),
        end_date: data.end_date ?? null,
        scan_id: data.scan_id ?? null,
        member_id: data.member_id ?? null,
      })
      .select()
      .single();
    if (error) throw dbError("reminders", error);
    return row;
  });

export const updateReminder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        active: z.boolean().optional(),
        snooze_minutes: z.number().int().min(1).max(720).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const patch: { active?: boolean; snooze_until?: string } = {};
    if (typeof data.active === "boolean") patch.active = data.active;
    if (data.snooze_minutes) {
      patch.snooze_until = new Date(Date.now() + data.snooze_minutes * 60_000).toISOString();
    }
    const { error } = await context.supabase
      .from("reminders")
      .update(patch)
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw dbError("reminders", error);
    return { ok: true };
  });

export const deleteReminder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("reminders")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw dbError("reminders", error);
    return { ok: true };
  });
