import { z } from "zod";

/**
 * Validation layer for every Gemini response before it is stored or rendered.
 * Each schema is permissive-but-bounded: unexpected shapes are normalised or
 * dropped, never stored raw and never allowed to crash a route.
 */

const str = (max: number) =>
  z
    .unknown()
    .transform((v) => (typeof v === "string" ? v : v == null ? "" : String(v)))
    .transform((s) => s.trim().slice(0, max));

const strArray = (max: number, items: number) =>
  z
    .unknown()
    .transform((v) => (Array.isArray(v) ? v : []))
    .transform((arr) =>
      arr
        .filter((x) => typeof x === "string" || typeof x === "number")
        .map((x) => String(x).trim().slice(0, max))
        .filter(Boolean)
        .slice(0, items),
    );

const num = (min: number, max: number, fallback = 0) =>
  z
    .unknown()
    .transform((v) => {
      const n = typeof v === "number" ? v : Number(v);
      if (!Number.isFinite(n)) return fallback;
      return Math.min(max, Math.max(min, n));
    });

export const SLOTS = ["morning", "afternoon", "evening", "night"] as const;
export const SEVERITIES = ["low", "moderate", "high"] as const;

export const aiMedicineSchema = z.object({
  name: str(200),
  generic: str(200),
  dosage: str(200),
  timing: str(200),
  frequency: str(120),
  duration: str(120),
  category: str(80),
  uses: strArray(200, 10),
  sideEffects: strArray(200, 15),
  precautions: strArray(240, 10),
  foodInteractions: strArray(240, 10),
  aiExplanation: str(1200),
  price: num(0, 1_000_000),
  equivalents: z
    .unknown()
    .transform((v) => (Array.isArray(v) ? v : []))
    .transform((arr) =>
      arr
        .map((e) => {
          const o = (e ?? {}) as Record<string, unknown>;
          const name = typeof o.name === "string" ? o.name.trim().slice(0, 200) : "";
          const price = Number(o.price);
          return { name, price: Number.isFinite(price) ? Math.max(0, Math.min(1_000_000, price)) : 0 };
        })
        .filter((e) => e.name)
        .slice(0, 8),
    ),
  confidence: num(0, 1, 0.85),
  rxStatus: z
    .unknown()
    .transform((v) => (v === "Rx" || v === "OTC" ? v : "Unknown")),
  alcoholInteraction: str(300),
  pregnancyWarning: str(300),
  drivingWarning: str(300),
  storage: str(200),
  slots: z
    .unknown()
    .transform((v) => (Array.isArray(v) ? v : []))
    .transform((arr) =>
      Array.from(
        new Set(
          arr
            .map((s) => String(s).toLowerCase().trim())
            .filter((s): s is (typeof SLOTS)[number] => (SLOTS as readonly string[]).includes(s)),
        ),
      ),
    ),
});

export type AiMedicine = z.infer<typeof aiMedicineSchema>;

export const scanResponseSchema = z.object({
  ocr_text: str(20_000).optional().default(""),
  summary: str(2000).optional().default(""),
  medicines: z
    .unknown()
    .transform((v) => (Array.isArray(v) ? v.slice(0, 30) : []))
    .transform((arr) =>
      arr
        .map((m) => {
          const parsed = aiMedicineSchema.safeParse(m ?? {});
          return parsed.success ? parsed.data : null;
        })
        .filter((m): m is AiMedicine => !!m && !!m.name),
    ),
});

export const interactionsSchema = z.object({
  interactions: z
    .unknown()
    .transform((v) => (Array.isArray(v) ? v.slice(0, 30) : []))
    .transform((arr) =>
      arr
        .map((raw) => {
          const o = (raw ?? {}) as Record<string, unknown>;
          const meds = Array.isArray(o.medicines)
            ? o.medicines.map((m) => String(m).trim().slice(0, 200)).filter(Boolean).slice(0, 6)
            : [];
          const severity = (SEVERITIES as readonly string[]).includes(String(o.severity))
            ? (o.severity as (typeof SEVERITIES)[number])
            : "low";
          return {
            medicines: meds,
            severity,
            description: String(o.description ?? "").trim().slice(0, 800),
            recommendation: String(o.recommendation ?? "").trim().slice(0, 800),
          };
        })
        .filter((i) => i.medicines.length > 0 && i.description),
    ),
  overallRisk: z
    .unknown()
    .transform((v) =>
      (SEVERITIES as readonly string[]).includes(String(v))
        ? (v as (typeof SEVERITIES)[number])
        : "low",
    ),
  summary: str(600),
});

export const insightsSchema = z.object({
  summary: str(800),
  tips: strArray(200, 6),
  redFlags: strArray(200, 5),
  lifestyle: strArray(200, 5),
});

export const risksSchema = z.object({
  risks: strArray(200, 6),
  redFlags: strArray(200, 6),
  emergencySymptoms: strArray(200, 6),
  whenToCallDoctor: strArray(200, 6),
  overall: z
    .unknown()
    .transform((v) =>
      (SEVERITIES as readonly string[]).includes(String(v))
        ? (v as (typeof SEVERITIES)[number])
        : "low",
    ),
});

export const priceSchema = z.object({
  brandName: str(200),
  genericName: str(200),
  manufacturer: str(200),
  marketPrice: num(0, 1_000_000),
  packSize: num(1, 1000, 10),
  pricePerStrip: num(0, 1_000_000),
  pricePerTablet: num(0, 1_000_000),
  alternatives: z
    .unknown()
    .transform((v) => (Array.isArray(v) ? v.slice(0, 10) : []))
    .transform((arr) =>
      arr
        .map((raw) => {
          const o = (raw ?? {}) as Record<string, unknown>;
          const price = Number(o.price);
          const pct = Number(o.savingsPercent);
          return {
            name: String(o.name ?? "").trim().slice(0, 200),
            manufacturer: String(o.manufacturer ?? "").trim().slice(0, 200),
            price: Number.isFinite(price) ? Math.max(0, Math.min(1_000_000, price)) : 0,
            savingsPercent: Number.isFinite(pct) ? Math.max(0, Math.min(100, Math.round(pct))) : 0,
          };
        })
        .filter((a) => a.name),
    ),
  substitutionNotes: str(1000),
  warnings: str(1000),
});

/**
 * Run a schema over unknown model output; returns null when unusable.
 * Missing / non-JSON output (null, strings, numbers) is rejected instead of being
 * coerced to `{}`, which the lenient schemas would otherwise accept as an empty result.
 */
export function validateAi<T extends z.ZodTypeAny>(schema: T, value: unknown): z.infer<T> | null {
  if (value === null || value === undefined || typeof value !== "object") return null;
  const res = schema.safeParse(value);
  return res.success ? res.data : null;
}
