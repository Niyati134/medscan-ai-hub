import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { ParsedMedicine } from "./scan.functions";
import { assertOwnsMember, assertOwnsScan } from "./ownership";
import { dbError } from "./safeError";

export type ShareRow = {
  id: string;
  token: string;
  share_type: string;
  scan_id: string | null;
  member_id: string | null;
  title: string | null;
  expires_at: string | null;
  revoked: boolean;
  view_count: number;
  last_viewed_at: string | null;
  has_password: boolean;
  include_emergency: boolean;
  include_adherence: boolean;
  include_ai: boolean;
  created_at: string;
};

/** Cryptographically random, URL-safe token (~160 bits of entropy at len=32). */
function randomToken(len = 32) {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}

// ---------- Password hashing (versioned PBKDF2-SHA256, legacy SHA-256 aware) ----------
const PBKDF2_ITERATIONS = 210_000;
const PBKDF2_PREFIX = "pbkdf2$v1$";

function toB64(bytes: Uint8Array) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
function fromB64(s: string): Uint8Array | null {
  try {
    const bin = atob(s);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

/** Constant-time byte comparison (no early exit, length-safe). */
function timingSafeEqualBytes(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

async function pbkdf2(password: string, salt: Uint8Array, iterations: number) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as unknown as BufferSource, iterations },
    key,
    256,
  );
  return new Uint8Array(bits);
}

/** Produces `pbkdf2$v1$<iterations>$<saltB64>$<hashB64>`. */
async function hashPassword(pw: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(pw, salt, PBKDF2_ITERATIONS);
  return `${PBKDF2_PREFIX}${PBKDF2_ITERATIONS}$${toB64(salt)}$${toB64(hash)}`;
}

/** Legacy: bare hex SHA-256 of the password (no salt). */
async function legacySha256Hex(pw: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(pw));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

type VerifyResult = { ok: boolean; upgradedHash?: string };

/** Verifies against both new versioned hashes and legacy bare-hex SHA-256. */
async function verifyPassword(pw: string, stored: string): Promise<VerifyResult> {
  if (stored.startsWith(PBKDF2_PREFIX)) {
    const parts = stored.split("$");
    // ["pbkdf2","v1",iterations,salt,hash]
    if (parts.length !== 5) return { ok: false };
    const iterations = Number(parts[2]);
    if (!Number.isInteger(iterations) || iterations < 1000 || iterations > 1_000_000)
      return { ok: false };
    const salt = fromB64(parts[3] ?? "");
    const expected = fromB64(parts[4] ?? "");
    if (!salt || !expected || salt.length === 0 || expected.length !== 32) return { ok: false };
    const actual = await pbkdf2(pw, salt, iterations);
    return { ok: timingSafeEqualBytes(actual, expected) };
  }

  // Legacy path: 64-char hex SHA-256.
  if (!/^[0-9a-f]{64}$/.test(stored)) return { ok: false };
  const enc = new TextEncoder();
  const ok = timingSafeEqualBytes(enc.encode(await legacySha256Hex(pw)), enc.encode(stored));
  if (!ok) return { ok: false };
  // Transparent upgrade to the versioned format.
  return { ok: true, upgradedHash: await hashPassword(pw) };
}


/**
 * Progressive backoff for repeated wrong share passwords.
 * First few mistakes are free; then short, growing lockouts capped at 15 min
 * so a legitimate viewer is never permanently locked out.
 */
function lockoutMs(failedAttempts: number): number {
  if (failedAttempts < 5) return 0;
  const step = failedAttempts - 4; // 1, 2, 3, ...
  return Math.min(15 * 60_000, 30_000 * 2 ** (step - 1));
}

const expirySchema = z.enum(["24h", "7d", "30d", "never"]);

function expiryToDate(v: z.infer<typeof expirySchema>): string | null {
  const now = Date.now();
  const ms: Record<string, number> = {
    "24h": 24 * 3600e3,
    "7d": 7 * 24 * 3600e3,
    "30d": 30 * 24 * 3600e3,
  };
  if (v === "never") return null;
  return new Date(now + ms[v]).toISOString();
}

export const createShare = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        shareType: z.enum(["scan", "emergency", "member"]).default("scan"),
        scanId: z.string().uuid().nullable().optional(),
        memberId: z.string().uuid().nullable().optional(),
        title: z.string().trim().max(200).optional().nullable(),
        expiry: expirySchema.default("7d"),
        password: z.string().min(4).max(60).optional().nullable(),
        includeEmergency: z.boolean().default(true),
        includeAdherence: z.boolean().default(true),
        includeAi: z.boolean().default(true),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    // A share exposes data through an unauthenticated endpoint, so the caller
    // must own every record they reference.
    await assertOwnsScan(context.supabase, context.userId, data.scanId);
    await assertOwnsMember(context.supabase, context.userId, data.memberId);
    const token = randomToken(32);
    const password_hash = data.password ? await hashPassword(data.password) : null;
    const { data: row, error } = await context.supabase
      .from("shared_links")
      .insert({
        user_id: context.userId,
        token,
        share_type: data.shareType,
        scan_id: data.scanId ?? null,
        member_id: data.memberId ?? null,
        title: data.title ?? null,
        password_hash,
        expires_at: expiryToDate(data.expiry),
        include_emergency: data.includeEmergency,
        include_adherence: data.includeAdherence,
        include_ai: data.includeAi,
      })
      .select("token")
      .single();
    if (error) throw dbError("shares", error);
    return { token: row.token };
  });

export const listShares = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("shared_links")
      .select(
        "id,token,share_type,scan_id,member_id,title,expires_at,revoked,view_count,last_viewed_at,password_hash,include_emergency,include_adherence,include_ai,created_at",
      )
      .order("created_at", { ascending: false });
    if (error) throw dbError("shares", error);
    return (data ?? []).map((r) => ({
      ...r,
      has_password: !!r.password_hash,
      password_hash: undefined,
    })) as unknown as ShareRow[];
  });

export const revokeShare = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("shared_links")
      .update({ revoked: true })
      .eq("id", data.id);
    if (error) throw dbError("shares", error);
    return { ok: true };
  });

export const deleteShare = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("shared_links").delete().eq("id", data.id);
    if (error) throw dbError("shares", error);
    return { ok: true };
  });

// ============================================================
// PUBLIC access — admin client, no auth required
// ============================================================
export type PublicShare = {
  ok: true;
  title: string | null;
  shareType: string;
  createdAt: string;
  expiresAt: string | null;
  viewCount: number;
  include: { emergency: boolean; adherence: boolean; ai: boolean };
  patient: {
    name: string;
    subline: string;
    blood: string | null;
    allergies: string | null;
    conditions: string | null;
    contactName: string | null;
    contactPhone: string | null;
  };
  scan: {
    id: string;
    file_name: string;
    created_at: string;
    ocr_text: string | null;
    medicines: ParsedMedicine[];
  } | null;
  adherenceDays: { date: string; total: number; taken: number }[];
};

export const getPublicShare = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        token: z.string().min(8).max(64),
        password: z.string().max(60).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: link, error } = await supabaseAdmin
      .from("shared_links")
      .select("*")
      .eq("token", data.token)
      .maybeSingle();
    if (error) {
      console.error("[share] lookup failed", error.message);
      return { ok: false as const, reason: "not_found" as const };
    }
    if (!link) return { ok: false as const, reason: "not_found" as const };
    if (link.revoked) return { ok: false as const, reason: "revoked" as const };
    if (link.expires_at && new Date(link.expires_at).getTime() < Date.now())
      return { ok: false as const, reason: "expired" as const };
    if (link.password_hash) {
      if (!data.password) return { ok: false as const, reason: "password_required" as const };

      // Brute-force throttle: per-share counter + progressive lockout.
      // Bounded state — two columns on the existing row, no per-request records.
      const now = Date.now();
      const lockedUntil = link.lock_until ? new Date(link.lock_until).getTime() : 0;
      if (lockedUntil > now) {
        // Generic response: never reveal lockout state or remaining time.
        return { ok: false as const, reason: "bad_password" as const };
      }

      const verdict = await verifyPassword(data.password, link.password_hash);
      if (!verdict.ok) {
        const attempts = (link.failed_attempts ?? 0) + 1;
        const lock = lockoutMs(attempts);
        await supabaseAdmin
          .from("shared_links")
          .update({
            failed_attempts: attempts,
            lock_until: lock ? new Date(now + lock).toISOString() : null,
          })
          .eq("id", link.id);
        return { ok: false as const, reason: "bad_password" as const };
      }

      // Successful auth clears the counter (and any expired lock).
      if ((link.failed_attempts ?? 0) > 0 || link.lock_until) {
        await supabaseAdmin
          .from("shared_links")
          .update({ failed_attempts: 0, lock_until: null })
          .eq("id", link.id);
      }

      if (verdict.upgradedHash) {
        // Transparently migrate legacy unsalted hashes; best effort.
        await supabaseAdmin
          .from("shared_links")
          .update({ password_hash: verdict.upgradedHash })
          .eq("id", link.id);
      }
    }

    // Fetch related content
    let scan: PublicShare["scan"] = null;
    if (link.scan_id) {
      const { data: s } = await supabaseAdmin
        .from("scans")
        .select("id,file_name,created_at,ocr_text,medicines")
        .eq("id", link.scan_id)
        .eq("user_id", link.user_id)
        .maybeSingle();
      if (s) {
        const shaped = s as PublicShare["scan"];
        if (shaped && !link.include_ai) {
          shaped.medicines = (shaped.medicines ?? []).map((m) => ({
            ...m,
            aiExplanation: "",
          }));
        }
        scan = shaped;
      }
    }

    // Patient details
    let patient: PublicShare["patient"] = {
      name: "Patient",
      subline: "",
      blood: null,
      allergies: null,
      conditions: null,
      contactName: null,
      contactPhone: null,
    };
    if (link.member_id) {
      const { data: m } = await supabaseAdmin
        .from("family_members")
        .select("*")
        .eq("id", link.member_id)
        .eq("user_id", link.user_id)
        .maybeSingle();
      if (m) {
        patient = {
          name: m.name,
          subline: `${m.relationship}${m.age != null ? ` · ${m.age} yrs` : ""}${m.gender ? ` · ${m.gender}` : ""}`,
          blood: m.blood_group,
          allergies: m.allergies,
          conditions: m.medical_conditions,
          contactName: m.emergency_contact_name,
          contactPhone: m.emergency_contact_phone,
        };
      }
    } else {
      const { data: p } = await supabaseAdmin
        .from("profiles")
        .select("display_name,blood_group,allergies,emergency_contact_name,emergency_contact_phone")
        .eq("id", link.user_id)
        .maybeSingle();
      if (p) {
        patient = {
          name: p.display_name ?? "Patient",
          subline: "Account owner",
          blood: p.blood_group,
          allergies: p.allergies,
          conditions: null,
          contactName: p.emergency_contact_name,
          contactPhone: p.emergency_contact_phone,
        };
      }
    }

    if (!link.include_emergency) {
      patient = {
        ...patient,
        blood: null,
        allergies: null,
        conditions: null,
        contactName: null,
        contactPhone: null,
      };
    }

    // Adherence: last 7 days for this scan
    let adherenceDays: PublicShare["adherenceDays"] = [];
    if (link.include_adherence && link.scan_id && scan) {
      const since = new Date(Date.now() - 7 * 24 * 3600e3).toISOString().slice(0, 10);
      const { data: logs } = await supabaseAdmin
        .from("medicine_logs")
        .select("taken_on,slot")
        .eq("scan_id", link.scan_id)
        .eq("user_id", link.user_id)
        .gte("taken_on", since);
      const byDay = new Map<string, number>();
      (logs ?? []).forEach((l) => byDay.set(l.taken_on, (byDay.get(l.taken_on) ?? 0) + 1));
      const meds = (scan.medicines as Array<{ slots?: string[] }>) ?? [];
      const dailyTotal = meds.reduce((sum, m) => sum + (m.slots?.length ?? 0), 0);
      adherenceDays = Array.from({ length: 7 }).map((_, i) => {
        const d = new Date(Date.now() - (6 - i) * 24 * 3600e3).toISOString().slice(0, 10);
        return { date: d, total: dailyTotal, taken: byDay.get(d) ?? 0 };
      });
    }

    // Track view (best effort)
    await supabaseAdmin
      .from("shared_links")
      .update({
        view_count: (link.view_count ?? 0) + 1,
        last_viewed_at: new Date().toISOString(),
      })
      .eq("id", link.id);

    return {
      ok: true as const,
      title: link.title,
      shareType: link.share_type,
      createdAt: link.created_at,
      expiresAt: link.expires_at,
      viewCount: (link.view_count ?? 0) + 1,
      include: {
        emergency: link.include_emergency,
        adherence: link.include_adherence,
        ai: link.include_ai,
      },
      patient,
      scan,
      adherenceDays,
    } satisfies PublicShare;
  });
