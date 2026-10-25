import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { searchText, reverseGeocode, type PlaceResult } from "./places.server";
import { callAi, parseAiJson } from "./ai.server";
import { dbError } from "./safeError";

export type { PlaceResult };

export type FacilityKind = "pharmacy" | "hospital";
export type HospitalFilter =
  | "all"
  | "emergency"
  | "government"
  | "private"
  | "specialty";

const searchSchema = z.object({
  kind: z.enum(["pharmacy", "hospital"]),
  lat: z.number(),
  lng: z.number(),
  query: z.string().max(120).optional(),
  filter: z
    .enum(["all", "emergency", "government", "private", "specialty"])
    .optional(),
  radiusKm: z.number().min(1).max(50).optional(),
  openNow: z.boolean().optional(),
});

/** Build a natural-language Places query from the selected filters. */
function buildQuery(input: z.infer<typeof searchSchema>) {
  const q = (input.query ?? "").trim();
  if (input.kind === "pharmacy") {
    return q ? `pharmacy medical store selling ${q}` : "pharmacy medical store chemist";
  }
  const byFilter: Record<HospitalFilter, string> = {
    all: "hospital",
    emergency: "emergency hospital 24 hour casualty",
    government: "government hospital public hospital",
    private: "private hospital multispeciality",
    specialty: "specialty hospital clinic",
  };
  const base = byFilter[input.filter ?? "all"];
  return q ? `${base} ${q}` : base;
}

/** Search nearby pharmacies or hospitals and log the search for history. */
export const searchFacilities = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => searchSchema.parse(d))
  .handler(async ({ data, context }) => {
    const results = await searchText({
      textQuery: buildQuery(data),
      lat: data.lat,
      lng: data.lng,
      radiusMeters: (data.radiusKm ?? 10) * 1000,
      openNow: data.openNow,
      maxResults: 20,
    });
    results.sort((a, b) => (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9));

    // Log the search (best-effort — never block results on history writes).
    await context.supabase.from("place_searches").insert({
      user_id: context.userId,
      query: data.query ?? "",
      kind: data.kind,
      lat: data.lat,
      lng: data.lng,
      result_count: results.length,
    });

    return { results };
  });

/** Turn coordinates into a human-readable address label. */
export const describeLocation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ lat: z.number(), lng: z.number() }).parse(d))
  .handler(async ({ data }) => ({ address: await reverseGeocode(data.lat, data.lng) }));

/* ---------------- Favorites ---------------- */

export const listFavorites = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("favorite_places")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw dbError("places", error);
    return data ?? [];
  });

export const toggleFavorite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        placeId: z.string().min(1),
        kind: z.enum(["pharmacy", "hospital"]),
        name: z.string(),
        address: z.string().optional(),
        phone: z.string().nullable().optional(),
        lat: z.number().optional(),
        lng: z.number().optional(),
        rating: z.number().nullable().optional(),
        mapsUri: z.string().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: existing } = await context.supabase
      .from("favorite_places")
      .select("id")
      .eq("place_id", data.placeId)
      .maybeSingle();

    if (existing) {
      const { error } = await context.supabase
        .from("favorite_places")
        .delete()
        .eq("id", existing.id);
      if (error) throw dbError("places", error);
      return { favorited: false };
    }

    const { error } = await context.supabase.from("favorite_places").insert({
      user_id: context.userId,
      place_id: data.placeId,
      kind: data.kind,
      name: data.name,
      address: data.address ?? "",
      phone: data.phone ?? null,
      lat: data.lat ?? null,
      lng: data.lng ?? null,
      rating: data.rating ?? null,
      maps_uri: data.mapsUri ?? null,
    });
    if (error) throw dbError("places", error);
    return { favorited: true };
  });

/* ---------------- Recent searches ---------------- */

export const listRecentSearches = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("place_searches")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(10);
    if (error) throw dbError("places", error);
    return data ?? [];
  });

/* ---------------- AI care recommendations ---------------- */

export type CareRecommendation = {
  summary: string;
  specialists: Array<{ specialty: string; reason: string }>;
  facilities: string[];
  urgency: "routine" | "soon" | "urgent";
};

const CARE_PROMPT = `You are a clinical triage assistant. Given a list of prescribed medicines,
infer likely treated conditions and recommend which medical specialists and healthcare facility
types the patient may need nearby. Respond ONLY with valid JSON:
{
  "summary": "2 sentence plain-language summary of what these medicines suggest",
  "specialists": [{ "specialty": "Cardiologist", "reason": "short reason" }],
  "facilities": ["Multispeciality hospital", "24-hour pharmacy"],
  "urgency": "routine" | "soon" | "urgent"
}
Never diagnose definitively; use cautious language. Max 4 specialists, max 4 facilities.`;

export const recommendCare = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ medicines: z.array(z.string()).min(1).max(30) }).parse(d),
  )
  .handler(async ({ data }): Promise<CareRecommendation> => {
    const raw = await callAi({
      responseFormat: "json_object",
      thinkingLevel: "low",
      maxOutputTokens: 4096,
      messages: [
        { role: "system", content: CARE_PROMPT },
        { role: "user", content: `Medicines: ${data.medicines.join(", ")}` },
      ],
    });
    const p = parseAiJson<Partial<CareRecommendation>>(raw) ?? {};
    return {
      summary: String(p.summary ?? ""),
      specialists: Array.isArray(p.specialists) ? p.specialists.slice(0, 4) : [],
      facilities: Array.isArray(p.facilities) ? p.facilities.slice(0, 4) : [],
      urgency: p.urgency === "urgent" || p.urgency === "soon" ? p.urgency : "routine",
    };
  });

/* ---------------- Maps availability ---------------- */

/**
 * Reports whether the Google Maps connector credentials are present.
 * The locator degrades to a clean fallback UI when this is false, so a
 * missing Maps connection never breaks the rest of MedScan AI.
 */
export const getMapsStatus = createServerFn({ method: "GET" }).handler(async () => ({
  configured: Boolean(process.env["LOVABLE_API_KEY"] && process.env["GOOGLE_MAPS_API_KEY"]),
}));
