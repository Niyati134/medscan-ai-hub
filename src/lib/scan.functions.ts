import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertOwnsMember, assertOwnsScan } from "./ownership";
import { AiError, callAi, parseAiJson } from "./ai.server";
import { dbError } from "./safeError";
import {
  insightsSchema,
  interactionsSchema,
  risksSchema,
  scanResponseSchema,
  validateAi,
} from "./ai-schemas";


export type MedicineEquivalent = { name: string; price: number };
export type TimeSlot = "morning" | "afternoon" | "evening" | "night";

export type ParsedMedicine = {
  id: string;
  name: string;
  generic: string;
  dosage: string;
  timing: string;
  frequency: string;
  duration: string;
  category: string;
  uses: string[];
  sideEffects: string[];
  precautions: string[];
  foodInteractions: string[];
  aiExplanation: string;
  price: number;
  equivalents: MedicineEquivalent[];
  confidence: number;
  // Advanced safety knowledge
  rxStatus: "Rx" | "OTC" | "Unknown";
  alcoholInteraction: string;
  pregnancyWarning: string;
  drivingWarning: string;
  storage: string;
  slots: TimeSlot[];
};

const SYSTEM_PROMPT = `You are an expert medical prescription analysis AI trained on handwritten and printed prescriptions, short forms (e.g. "tab", "cap", "OD", "BD", "TDS", "QID", "HS", "SOS", "PC", "AC"), and Indian medicine brands.

Carefully read the image even if it is blurry, low-contrast, or handwritten. Expand short forms. If multiple medicines are listed, extract each one separately.

Return ONLY valid JSON of this exact shape (no markdown, no commentary):
{
  "ocr_text": "raw text you can read from the prescription",
  "summary": "1-2 sentence plain-language summary of what the prescription treats",
  "medicines": [
    {
      "name": "Brand Name + strength (e.g. 'Augmentin 625mg')",
      "generic": "generic chemical name",
      "dosage": "human-readable dose per intake (e.g. '1 tablet')",
      "timing": "when in the day to take (e.g. 'morning and night, after food')",
      "frequency": "how often (e.g. 'twice daily')",
      "duration": "for how long (e.g. '5 days')",
      "category": "drug class (e.g. 'Antibiotic', 'Analgesic', 'PPI', 'Antihistamine')",
      "uses": ["primary use", "secondary use"],
      "sideEffects": ["common side effect 1", "..."],
      "precautions": ["important precaution 1", "..."],
      "foodInteractions": ["e.g. 'Avoid dairy within 2 hours'", "..."],
      "aiExplanation": "2-3 sentences in simple non-medical language explaining what this medicine does and why a doctor might prescribe it",
      "price": 0,
      "equivalents": [{"name": "generic brand", "price": 0}],
      "confidence": 0.0,
      "rxStatus": "Rx" | "OTC" | "Unknown",
      "alcoholInteraction": "short warning about alcohol use, or empty string if none",
      "pregnancyWarning": "short pregnancy/breastfeeding warning, or empty string",
      "drivingWarning": "short driving/machinery warning if it causes drowsiness, else empty",
      "storage": "e.g. 'Store below 25°C, away from moisture'",
      "slots": ["morning" | "afternoon" | "evening" | "night"]
    }
  ]
}

Rules:
- price is approximate INR per strip/bottle. Use 0 if unknown.
- equivalents are cheaper generic alternatives with the SAME active ingredient.
- confidence is 0..1 reflecting how sure you are this medicine name was read correctly.
- slots MUST be inferred from timing/frequency (BD = morning+night, TDS = morning+afternoon+night, QID = all four, HS = night, OD = morning).
- If a field is unknown leave it as an empty string or empty array — never invent dosage.
- If the image is unreadable or contains no medicines, return medicines: [].`;

// Convert bytes to base64 in chunks. Spreading a whole image buffer into
// String.fromCharCode(...) overflows the call stack for anything above ~100KB.
function toBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

// Decide the real file type from its first bytes. The browser-supplied
// Content-Type is not trusted: it can be wrong or missing, and a wrong MIME type
// makes Gemini reject the image.
function ascii(b: Uint8Array, from: number, to: number): string {
  return String.fromCharCode(...b.subarray(from, to));
}
function sniffMime(b: Uint8Array): string | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b.length >= 12 && ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 12) === "WEBP") return "image/webp";
  if (b.length >= 5 && ascii(b, 0, 5) === "%PDF-") return "application/pdf";
  if (b.length >= 12 && ascii(b, 4, 8) === "ftyp") {
    const brand = ascii(b, 8, 12);
    if (["heic", "heix", "hevc", "hevx"].includes(brand)) return "image/heic";
    if (["heif", "heim", "heis", "mif1", "msf1"].includes(brand)) return "image/heif";
  }
  return null;
}

const SCAN_FAILED_MESSAGE = "Unable to analyze this prescription right now. Please try again.";
const SCAN_UNREADABLE_MESSAGE = "The AI service returned an unreadable response. Please try again.";

// Small text-only follow-up calls (interactions, insights, risks): quick, low reasoning effort.
const LIGHT_AI = {
  responseFormat: "json_object" as const,
  thinkingLevel: "low" as const,
  maxOutputTokens: 4096,
  timeoutMs: 40_000,
  totalTimeoutMs: 60_000,
};


export const scanPrescription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        imagePath: z.string().min(1).max(500),
        fileName: z.string().min(1).max(255),
        memberId: z.string().uuid().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // The client supplies both the storage path and the member id: verify the
    // path lives in this user's folder and the member belongs to this user.
    if (!data.imagePath.startsWith(`${userId}/`) || data.imagePath.includes("..")) {
      throw new Error("Invalid upload path");
    }
    await assertOwnsMember(supabase, userId, data.memberId);

    // Best-effort cleanup so failed scans do not leave private files behind.
    const removeUpload = async () => {
      const { error } = await supabase.storage.from("prescriptions").remove([data.imagePath]);
      if (error) console.warn("[scan] could not remove upload after failure:", error.message);
    };
    const failScan = async (message: string): Promise<never> => {
      await removeUpload();
      throw new Error(message);
    };

    const { data: file, error: dlErr } = await supabase.storage
      .from("prescriptions")
      .download(data.imagePath);
    if (dlErr || !file) {
      console.error("[scan] storage download failed:", dlErr?.message);
      throw new Error("Could not read the uploaded file. Please try uploading again.");
    }

    if (file.size > 10 * 1024 * 1024) {
      return failScan("File too large (max 10MB).");
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const mime = sniffMime(bytes);
    if (!mime) {
      return failScan("Unsupported file type. Upload a JPG, PNG, WEBP, HEIC or PDF.");
    }
    const dataUrl = `data:${mime};base64,${toBase64(bytes)}`;

    let raw: string;
    try {
      raw = await callAi({
        responseFormat: "json_object",
        // OCR + structured extraction does not need deep reasoning. gemini-3.8-flash
        // defaults to "medium" thinking, which is what made scans exceed the timeout.
        thinkingLevel: "low",
        maxOutputTokens: 32_768,
        timeoutMs: 75_000, // one attempt
        totalTimeoutMs: 110_000, // retries + fallback model included
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Analyze this prescription. Read carefully, expand short forms, and return the JSON.",
              },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ],
      });
    } catch (e) {
      // AiError messages are already safe to show; anything else is generic.
      console.error(`[scan] ai failure category=${e instanceof AiError ? e.code : "unknown"}`);
      return failScan(e instanceof AiError ? e.message : SCAN_FAILED_MESSAGE);
    }

    // Never turn a malformed AI answer into an empty-but-"successful" scan.
    const json = parseAiJson<unknown>(raw);
    const candidate = Array.isArray(json) ? { medicines: json } : json;
    const parsed =
      candidate &&
      typeof candidate === "object" &&
      Array.isArray((candidate as { medicines?: unknown }).medicines)
        ? validateAi(scanResponseSchema, candidate)
        : null;
    if (!parsed) {
      console.error("[scan] malformed ai response rejected (no medicines array)");
      return failScan(SCAN_UNREADABLE_MESSAGE);
    }

    const medicines: ParsedMedicine[] = parsed.medicines.map((m, i) => ({
      ...m,
      id: `m${i + 1}`,
      category: m.category || "General",
      confidence: m.confidence || 0.85,
      slots: inferSlots(m.slots, m.timing, m.frequency),
    }));

    const ocrCombined = parsed.summary
      ? `${parsed.summary}\n\n---\n${parsed.ocr_text}`
      : parsed.ocr_text || null;


    const { data: scan, error: insErr } = await supabase
      .from("scans")
      .insert({
        user_id: userId,
        member_id: data.memberId ?? null,
        file_name: data.fileName,
        image_path: data.imagePath,
        ocr_text: ocrCombined,
        medicines,
        status: medicines.length > 0 ? "completed" : "failed",
      })
      .select("id")
      .single();

    if (insErr) {
      await removeUpload();
      throw dbError("scan.insert", insErr);
    }
    return { scanId: scan.id, medicines, ocrText: parsed.ocr_text ?? "" };
  });

export const getScan = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: scan, error } = await context.supabase
      .from("scans")
      .select("*")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw dbError("scan", error);
    if (!scan) throw new Error("Scan not found");
    return scan;
  });

export const listScans = createServerFn({ method: "POST" })
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
      .from("scans")
      .select("id,file_name,medicines,status,created_at,member_id")
      .order("created_at", { ascending: false })
      .limit(100);
    if (data.memberId === null) q = q.is("member_id", null);
    else if (typeof data.memberId === "string") q = q.eq("member_id", data.memberId);
    const { data: rows, error } = await q;
    if (error) throw dbError("scan", error);
    return rows ?? [];
  });

export const getScanImageUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ path: z.string().min(1).max(500) }).parse(input))
  .handler(async ({ data, context }) => {
    if (!data.path.startsWith(`${context.userId}/`) || data.path.includes("..")) {
      throw new Error("Invalid file path");
    }
    const { data: signed, error } = await context.supabase.storage
      .from("prescriptions")
      .createSignedUrl(data.path, 60 * 10);
    if (error) throw dbError("scan", error);
    return { url: signed.signedUrl };
  });

export const deleteScan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row } = await supabase
      .from("scans")
      .select("image_path")
      .eq("id", data.id)
      .eq("user_id", userId)
      .maybeSingle();

    const { error } = await supabase.from("scans").delete().eq("id", data.id).eq("user_id", userId);
    if (error) throw dbError("scan.delete", error);

    // Also remove the prescription image so deleted scans leave no private file behind.
    const path = row?.image_path;
    if (path && path.startsWith(`${userId}/`) && !path.includes("..")) {
      const { error: rmErr } = await supabase.storage.from("prescriptions").remove([path]);
      if (rmErr) console.warn("[scan] stored file could not be removed:", rmErr.message);
    }
    return { ok: true };
  });

export type InteractionSeverity = "low" | "moderate" | "high";
export type DrugInteraction = {
  medicines: string[];
  severity: InteractionSeverity;
  description: string;
  recommendation: string;
};

const INTERACTION_PROMPT = `You are a clinical pharmacology AI. Given a list of medicines, return possible drug-drug interactions.
Respond ONLY with valid JSON:
{
  "interactions": [
    {
      "medicines": ["Drug A", "Drug B"],
      "severity": "low" | "moderate" | "high",
      "description": "what happens when taken together",
      "recommendation": "safe usage guidance"
    }
  ],
  "overallRisk": "low" | "moderate" | "high",
  "summary": "1-2 sentence overall safety summary"
}
If there are no meaningful interactions, return interactions: [] and overallRisk: "low".`;

export const checkInteractions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        medicines: z.array(z.string().min(1).max(200)).min(2).max(20),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const empty = {
      interactions: [] as DrugInteraction[],
      overallRisk: "low" as InteractionSeverity,
      summary: "",
    };
    try {
      const raw = await callAi({
        ...LIGHT_AI,
        messages: [
          { role: "system", content: INTERACTION_PROMPT },
          {
            role: "user",
            content: `Analyze interactions among: ${data.medicines.join(", ")}`,
          },
        ],
      });
      return validateAi(interactionsSchema, parseAiJson(raw)) ?? empty;
    } catch (e) {
      console.error(`[interactions] ai failure category=${e instanceof AiError ? e.code : "unknown"}`);
      return empty;
    }
  });


const INSIGHTS_PROMPT = `You are a friendly clinical AI assistant. Given a list of medicines from a prescription, return short patient-friendly health insights.
Respond ONLY with valid JSON:
{
  "summary": "1-2 sentences in plain language summarising what condition(s) this regimen likely treats",
  "tips": ["3-5 short actionable health tips, each under 100 chars"],
  "redFlags": ["0-3 symptoms that mean the patient should contact a doctor immediately"],
  "lifestyle": ["0-3 lifestyle suggestions (food, sleep, hydration, activity)"]
}
Do NOT diagnose. Do NOT replace medical advice. Keep wording warm and clear.`;

export const getHealthInsights = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ medicines: z.array(z.string().min(1).max(200)).min(1).max(20) })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const empty = { summary: "", tips: [] as string[], redFlags: [] as string[], lifestyle: [] as string[] };
    try {
      const raw = await callAi({
        ...LIGHT_AI,
        messages: [
          { role: "system", content: INSIGHTS_PROMPT },
          { role: "user", content: `Medicines: ${data.medicines.join(", ")}` },
        ],
      });
      return validateAi(insightsSchema, parseAiJson(raw)) ?? empty;
    } catch (e) {
      console.error(`[insights] ai failure category=${e instanceof AiError ? e.code : "unknown"}`);
      return empty;
    }
  });


// ============================================================
// Helpers
// ============================================================
const ALL_SLOTS: TimeSlot[] = ["morning", "afternoon", "evening", "night"];

function inferSlots(
  raw: unknown,
  timing: string | undefined,
  frequency: string | undefined,
): TimeSlot[] {
  if (Array.isArray(raw)) {
    const cleaned = raw
      .map((s) => String(s).toLowerCase().trim())
      .filter((s): s is TimeSlot => (ALL_SLOTS as string[]).includes(s));
    if (cleaned.length) return Array.from(new Set(cleaned));
  }
  const text = `${timing ?? ""} ${frequency ?? ""}`.toLowerCase();
  const slots = new Set<TimeSlot>();
  if (/\b(morning|am|breakfast|od\b|qd\b|sunrise)/.test(text)) slots.add("morning");
  if (/\b(noon|afternoon|lunch|midday)/.test(text)) slots.add("afternoon");
  if (/\b(evening|tea|dinner)/.test(text)) slots.add("evening");
  if (/\b(night|hs\b|bedtime|sleep|pm)/.test(text)) slots.add("night");
  if (/\bbd\b|\bbid\b|twice/.test(text)) {
    slots.add("morning");
    slots.add("night");
  }
  if (/\btds\b|\btid\b|three times/.test(text)) {
    slots.add("morning");
    slots.add("afternoon");
    slots.add("night");
  }
  if (/\bqid\b|four times/.test(text)) {
    ALL_SLOTS.forEach((s) => slots.add(s));
  }
  if (slots.size === 0) slots.add("morning");
  return ALL_SLOTS.filter((s) => slots.has(s));
}

// ============================================================
// Health risk analysis (Gemini)
// ============================================================
export type HealthRisks = {
  risks: string[];
  redFlags: string[];
  emergencySymptoms: string[];
  whenToCallDoctor: string[];
  overall: "low" | "moderate" | "high";
};

const RISK_PROMPT = `You are a clinical safety AI. Given a list of medicines, return a structured risk assessment in JSON only:
{
  "risks": ["3-5 short possible risks of this regimen"],
  "redFlags": ["2-4 warning signs to watch for"],
  "emergencySymptoms": ["2-4 symptoms that require IMMEDIATE emergency care"],
  "whenToCallDoctor": ["2-4 situations to contact a doctor"],
  "overall": "low" | "moderate" | "high"
}
Keep each item under 120 chars, plain English, no diagnoses.`;

export const getHealthRisks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ medicines: z.array(z.string().min(1).max(200)).min(1).max(20) }).parse(input),
  )
  .handler(async ({ data }): Promise<HealthRisks> => {
    const empty: HealthRisks = {
      risks: [],
      redFlags: [],
      emergencySymptoms: [],
      whenToCallDoctor: [],
      overall: "low",
    };
    try {
      const raw = await callAi({
        ...LIGHT_AI,
        messages: [
          { role: "system", content: RISK_PROMPT },
          { role: "user", content: `Medicines: ${data.medicines.join(", ")}` },
        ],
      });
      return validateAi(risksSchema, parseAiJson(raw)) ?? empty;
    } catch (e) {
      console.error(`[risks] ai failure category=${e instanceof AiError ? e.code : "unknown"}`);
      return empty;
    }
  });


// ============================================================
// Adherence tracking
// ============================================================
export const logMedicineTaken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        scanId: z.string().uuid(),
        medicineId: z.string().min(1).max(50),
        medicineName: z.string().min(1).max(200),
        slot: z.enum(["morning", "afternoon", "evening", "night"]),
        takenOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        taken: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertOwnsScan(supabase, userId, data.scanId);
    if (data.taken) {
      const { error } = await supabase.from("medicine_logs").upsert(
        {
          user_id: userId,
          scan_id: data.scanId,
          medicine_id: data.medicineId,
          medicine_name: data.medicineName,
          slot: data.slot,
          taken_on: data.takenOn,
        },
        { onConflict: "user_id,scan_id,medicine_id,slot,taken_on" },
      );
      if (error) throw dbError("scan", error);
    } else {
      const { error } = await supabase
        .from("medicine_logs")
        .delete()
        .eq("user_id", userId)
        .eq("scan_id", data.scanId)
        .eq("medicine_id", data.medicineId)
        .eq("slot", data.slot)
        .eq("taken_on", data.takenOn);
      if (error) throw dbError("scan", error);
    }
    return { ok: true };
  });

export const getAdherence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ scanId: z.string().uuid().optional(), days: z.number().min(1).max(60).default(7) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const from = new Date();
    from.setDate(from.getDate() - data.days + 1);
    const fromStr = from.toISOString().slice(0, 10);

    let q = context.supabase
      .from("medicine_logs")
      .select("scan_id,medicine_id,slot,taken_on")
      .gte("taken_on", fromStr);
    if (data.scanId) q = q.eq("scan_id", data.scanId);
    const { data: logs, error } = await q;
    if (error) throw dbError("scan", error);
    return { logs: logs ?? [] };
  });

