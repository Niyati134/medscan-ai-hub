import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { dbError } from "./safeError";

/** Shape of a medicine entry stored on a scan (only the fields admin analytics needs). */
type MedicineLite = { name?: string; category?: string };

/** Minimal shape of the authenticated context needed for the admin role check. */
type AdminCheckContext = {
  supabase: {
    rpc: (
      fn: "has_role",
      args: { _user_id: string; _role: "admin" },
    ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
  };
  userId: string;
};

async function assertAdmin(context: AdminCheckContext) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error) throw dbError("admin", error);
  if (data !== true) throw new Error("Forbidden: admin access required");
}


function daysAgoISO(days: number) {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

/** Whether the signed-in user is an administrator. Safe for every authenticated user. */
export const amIAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (error) throw dbError("admin", error);
    return { isAdmin: data === true };
  });

export const getAdminOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const c = (t: "profiles" | "reminders" | "family_members" | "shared_links" | "chat_messages") =>
      supabaseAdmin.from(t).select("id", { count: "exact", head: true });

    const [
      users,
      reminders,
      family,
      shares,
      chats,
      scansAll,
      scans7,
      scans30,
      recentScanUsers,
    ] = await Promise.all([
      c("profiles"),
      c("reminders"),
      c("family_members"),
      c("shared_links"),
      c("chat_messages"),
      supabaseAdmin.from("scans").select("id", { count: "exact", head: true }),
      supabaseAdmin
        .from("scans")
        .select("id", { count: "exact", head: true })
        .gte("created_at", daysAgoISO(7)),
      supabaseAdmin
        .from("scans")
        .select("id", { count: "exact", head: true })
        .gte("created_at", daysAgoISO(30)),
      supabaseAdmin.from("scans").select("user_id").gte("created_at", daysAgoISO(30)),
    ]);

    // Single pass over scan medicines for the detected-medicine total.
    const { data: medRows, error: medErr } = await supabaseAdmin
      .from("scans")
      .select("medicines");
    if (medErr) throw dbError("admin", medErr);
    let totalMedicines = 0;
    for (const row of medRows ?? []) {
      if (Array.isArray(row.medicines)) totalMedicines += row.medicines.length;
    }

    const activeUsers = new Set((recentScanUsers.data ?? []).map((r) => r.user_id)).size;

    return {
      totalUsers: users.count ?? 0,
      activeUsers,
      totalScans: scansAll.count ?? 0,
      scans7d: scans7.count ?? 0,
      scans30d: scans30.count ?? 0,
      totalMedicines,
      totalReminders: reminders.count ?? 0,
      totalFamilyMembers: family.count ?? 0,
      totalShares: shares.count ?? 0,
      totalChatMessages: chats.count ?? 0,
    };
  });

export const getAdminAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const since = daysAgoISO(180);
    const [profilesRes, scansRes] = await Promise.all([
      supabaseAdmin.from("profiles").select("created_at").gte("created_at", since),
      supabaseAdmin.from("scans").select("created_at,medicines").gte("created_at", since),
    ]);
    if (profilesRes.error) throw dbError("admin", profilesRes.error);
    if (scansRes.error) throw dbError("admin", scansRes.error);

    const months: string[] = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    }
    const label = (key: string) => {
      const [y, m] = key.split("-");
      return new Date(Number(y), Number(m) - 1, 1).toLocaleString("en-US", { month: "short" });
    };
    const bucket = (iso: string) => iso.slice(0, 7);

    const signupsBy = new Map(months.map((m) => [m, 0]));
    for (const p of profilesRes.data ?? []) {
      const k = bucket(p.created_at);
      if (signupsBy.has(k)) signupsBy.set(k, (signupsBy.get(k) ?? 0) + 1);
    }
    const scansBy = new Map(months.map((m) => [m, 0]));
    const medsBy = new Map(months.map((m) => [m, 0]));
    const medCounts = new Map<string, number>();
    const catCounts = new Map<string, number>();

    for (const s of scansRes.data ?? []) {
      const k = bucket(s.created_at);
      const meds = (Array.isArray(s.medicines) ? s.medicines : []) as MedicineLite[];
      if (scansBy.has(k)) {
        scansBy.set(k, (scansBy.get(k) ?? 0) + 1);
        medsBy.set(k, (medsBy.get(k) ?? 0) + meds.length);
      }
      for (const m of meds) {
        const name = (m?.name ?? "").trim();
        if (name) medCounts.set(name, (medCounts.get(name) ?? 0) + 1);
        const cat = (m?.category ?? "Other").trim() || "Other";
        catCounts.set(cat, (catCounts.get(cat) ?? 0) + 1);
      }
    }

    return {
      timeline: months.map((m) => ({
        month: label(m),
        signups: signupsBy.get(m) ?? 0,
        scans: scansBy.get(m) ?? 0,
        medicines: medsBy.get(m) ?? 0,
      })),
      topMedicines: [...medCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([name, count]) => ({ name, count })),
      categories: [...catCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([name, value]) => ({ name, value })),
    };
  });

export const listAdminUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(5).max(50).default(10),
        search: z.string().trim().max(120).default(""),
        language: z.string().trim().max(10).default("all"),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let query = supabaseAdmin
      .from("profiles")
      .select("id,display_name,preferred_language,created_at", { count: "exact" })
      .order("created_at", { ascending: false });
    if (data.search) query = query.ilike("display_name", `%${data.search}%`);
    if (data.language !== "all") query = query.eq("preferred_language", data.language);

    const from = (data.page - 1) * data.pageSize;
    const { data: profiles, count, error } = await query.range(from, from + data.pageSize - 1);
    if (error) throw dbError("admin", error);

    const ids = (profiles ?? []).map((p) => p.id);
    // Batched (no N+1): one scan query for the whole page, aggregated in memory.
    const scanCounts = new Map<string, number>();
    const lastActivity = new Map<string, string>();
    if (ids.length) {
      const { data: scanRows, error: scanErr } = await supabaseAdmin
        .from("scans")
        .select("user_id,created_at")
        .in("user_id", ids);
      if (scanErr) throw dbError("admin", scanErr);
      for (const r of scanRows ?? []) {
        scanCounts.set(r.user_id, (scanCounts.get(r.user_id) ?? 0) + 1);
        const prev = lastActivity.get(r.user_id);
        if (!prev || r.created_at > prev) lastActivity.set(r.user_id, r.created_at);
      }
    }

    // Emails come from the Auth admin API in one paged call, matched by id.
    const emails = new Map<string, string>();
    const { data: authUsers } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    for (const u of authUsers?.users ?? []) if (u.email) emails.set(u.id, u.email);

    const cutoff = daysAgoISO(30);
    return {
      total: count ?? 0,
      page: data.page,
      pageSize: data.pageSize,
      users: (profiles ?? []).map((p) => {
        const last = lastActivity.get(p.id) ?? null;
        return {
          id: p.id,
          displayName: p.display_name ?? "Unnamed user",
          email: emails.get(p.id) ?? "—",
          language: p.preferred_language,
          createdAt: p.created_at,
          lastActivity: last,
          scans: scanCounts.get(p.id) ?? 0,
          status: last && last >= cutoff ? "active" : "inactive",
        };
      }),
    };
  });

export const listAdminScans = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(5).max(50).default(10),
        status: z.string().trim().max(30).default("all"),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let query = supabaseAdmin
      .from("scans")
      // Operational metadata only — no OCR text, no image path.
      .select("id,user_id,created_at,status,medicines", { count: "exact" })
      .order("created_at", { ascending: false });
    if (data.status !== "all") query = query.eq("status", data.status);

    const from = (data.page - 1) * data.pageSize;
    const { data: scans, count, error } = await query.range(from, from + data.pageSize - 1);
    if (error) throw dbError("admin", error);

    const ids = [...new Set((scans ?? []).map((s) => s.user_id))];
    const names = new Map<string, string>();
    if (ids.length) {
      const { data: profiles } = await supabaseAdmin
        .from("profiles")
        .select("id,display_name")
        .in("id", ids);
      for (const p of profiles ?? []) names.set(p.id, p.display_name ?? "Unnamed user");
    }

    return {
      total: count ?? 0,
      page: data.page,
      pageSize: data.pageSize,
      scans: (scans ?? []).map((s) => ({
        id: s.id,
        user: names.get(s.user_id) ?? "Unknown",
        createdAt: s.created_at,
        status: s.status,
        medicineCount: Array.isArray(s.medicines) ? s.medicines.length : 0,
      })),
    };
  });

export const getSystemHealth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let database = false;
    let storage = false;
    try {
      const { error } = await supabaseAdmin.from("profiles").select("id", { head: true, count: "exact" });
      database = !error;
    } catch {
      database = false;
    }
    try {
      const { data, error } = await supabaseAdmin.storage.listBuckets();
      storage = !error && (data ?? []).some((b) => b.name === "prescriptions");
    } catch {
      storage = false;
    }

    // Booleans only — never the secret values themselves.
    return {
      ai: Boolean(process.env["GEMINI_API_KEY"]),
      storage,
      database,
      maps: Boolean(process.env["GOOGLE_MAPS_API_KEY"]),
    };
  });

export const listAuditLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ limit: z.number().int().min(1).max(100).default(25) }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("admin_audit_log")
      .select("id,actor_id,action,target_type,target_id,details,created_at")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) throw dbError("admin", error);

    const ids = [...new Set((rows ?? []).map((r) => r.actor_id))];
    const names = new Map<string, string>();
    if (ids.length) {
      const { data: profiles } = await supabaseAdmin
        .from("profiles")
        .select("id,display_name")
        .in("id", ids);
      for (const p of profiles ?? []) names.set(p.id, p.display_name ?? "Unnamed user");
    }
    return (rows ?? []).map((r) => ({
      id: r.id,
      actor: names.get(r.actor_id) ?? "Unknown",
      action: r.action,
      target: r.target_type ? `${r.target_type}${r.target_id ? `:${r.target_id}` : ""}` : null,
      createdAt: r.created_at,
    }));
  });

export const recordAdminAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        action: z.string().trim().min(1).max(80),
        targetType: z.string().trim().max(40).optional(),
        targetId: z.string().trim().max(80).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("admin_audit_log").insert({
      actor_id: context.userId,
      action: data.action,
      target_type: data.targetType ?? null,
      target_id: data.targetId ?? null,
    });
    if (error) throw dbError("admin", error);
    return { ok: true };
  });
