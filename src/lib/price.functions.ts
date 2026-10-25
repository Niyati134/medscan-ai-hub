import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { AiError, callAi, parseAiJson } from "./ai.server";
import { priceSchema, validateAi } from "./ai-schemas";
import { assertOwnsMember, assertOwnsScan } from "./ownership";
import { dbError } from "./safeError";

export type PriceAlternative = {
  name: string;
  manufacturer: string;
  price: number;
  savingsPercent: number;
};

export type PriceComparison = {
  medicineKey: string;
  brandName: string;
  genericName: string;
  manufacturer: string;
  marketPrice: number;
  pricePerStrip: number;
  pricePerTablet: number;
  packSize: number;
  alternatives: PriceAlternative[];
  substitutionNotes: string;
  warnings: string;
};

const PRICE_PROMPT = `You are a pharmaceutical pricing AI specialised in the Indian market (INR).

You will receive a list of medicines.

For EACH medicine, return one pricing object containing:
- realistic estimated Indian retail price
- active ingredient/generic name
- manufacturer when reasonably known
- pack size
- price per strip
- price per tablet
- 3-5 cheaper generic/brand alternatives with the SAME active ingredient
- savings percentage
- substitution notes
- safety warnings

IMPORTANT:
- Return EXACTLY one object for each input medicine.
- Keep the same order as the input medicines.
- Do not invent an exact price when uncertain; use 0 if unknown.
- Prices must be plain numbers in INR with no currency symbols.
- savingsPercent should be the rounded percentage saved versus marketPrice.
- Alternatives must have the SAME active ingredient.
- This is estimated informational pricing, not live pharmacy pricing.

Respond ONLY with a valid JSON ARRAY.

Each object must have exactly this shape:
{
  "brandName": "brand + strength as written",
  "genericName": "active ingredient(s) with strength",
  "manufacturer": "originator manufacturer",
  "marketPrice": 0,
  "packSize": 10,
  "pricePerStrip": 0,
  "pricePerTablet": 0,
  "alternatives": [
    {
      "name": "Alternative brand + strength",
      "manufacturer": "maker",
      "price": 0,
      "savingsPercent": 0
    }
  ],
  "substitutionNotes": "1-2 sentences explaining equivalence and when substitution is appropriate.",
  "warnings": "Short clinical caveats before switching."
}`;

function keyOf(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 200);
}

function fallbackFor(name: string): PriceComparison {
  return {
    medicineKey: keyOf(name),
    brandName: name,
    genericName: "",
    manufacturer: "",
    marketPrice: 0,
    pricePerStrip: 0,
    pricePerTablet: 0,
    packSize: 10,
    alternatives: [],
    substitutionNotes: "",
    warnings: "",
  };
}

function normalizePrice(
  name: string,
  p: import("zod").infer<typeof priceSchema>,
): PriceComparison {
  const marketPrice = Number(p.marketPrice) || 0;
  const packSize = Number(p.packSize) || 10;

  const pricePerStrip =
    Number(p.pricePerStrip) || marketPrice;

  const pricePerTablet =
    Number(p.pricePerTablet) ||
    (packSize > 0 ? pricePerStrip / packSize : 0);

  const alternatives: PriceAlternative[] = p.alternatives
    .map((a) => {
      const alternativePrice = Number(a.price) || 0;

      const calculatedSavings =
        marketPrice > 0
          ? Math.max(
              0,
              Math.round(
                ((marketPrice - alternativePrice) / marketPrice) * 100,
              ),
            )
          : 0;

      return {
        name: a.name,
        manufacturer: a.manufacturer,
        price: alternativePrice,
        savingsPercent:
          Number(a.savingsPercent) || calculatedSavings,
      };
    })
    .slice(0, 6);

  return {
    medicineKey: keyOf(name),
    brandName: p.brandName || name,
    genericName: p.genericName || "",
    manufacturer: p.manufacturer || "",
    marketPrice,
    pricePerStrip,
    pricePerTablet: Number(pricePerTablet.toFixed(2)),
    packSize,
    alternatives,
    substitutionNotes: p.substitutionNotes || "",
    warnings: p.warnings || "",
  };
}

/**
 * Fetch pricing for all medicines in ONE Gemini request.
 *
 * Previously:
 *   4 medicines = 4 Gemini requests
 *
 * Now:
 *   4 medicines = 1 Gemini request
 *
 * This greatly reduces Gemini free-tier quota usage.
 */
async function fetchBatch(
  medicines: string[],
): Promise<PriceComparison[]> {
  const fallbacks = medicines.map(fallbackFor);

  try {
    const raw = await callAi({
      responseFormat: "json_object",
      thinkingLevel: "low",
      maxOutputTokens: 16_384,
      timeoutMs: 60_000,
      totalTimeoutMs: 90_000,
      messages: [
        {
          role: "system",
          content: PRICE_PROMPT,
        },
        {
          role: "user",
          content: JSON.stringify({
            medicines,
          }),
        },
      ],
    });

    const parsed = parseAiJson<unknown>(raw);

    // The model is instructed to return an array, but JSON mode sometimes wraps it
    // in an object such as { "results": [...] }; accept both shapes.
    const list = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === "object"
        ? Object.values(parsed as Record<string, unknown>).find((v) => Array.isArray(v)) ?? null
        : null;

    const parsedResults = validateAi(z.array(priceSchema), list);

    if (parsedResults && parsedResults.length !== medicines.length) {
      console.warn(
        `[price] expected ${medicines.length} results, got ${parsedResults.length}; missing ones fall back`,
      );
    }

    if (!parsedResults || parsedResults.length === 0) {
      console.error("[price] Gemini returned no pricing results");
      return fallbacks;
    }

    return medicines.map((name, index) => {
      const item = parsedResults[index];

      if (!item) {
        return fallbacks[index];
      }

      return normalizePrice(name, item);
    });
  } catch (e) {
    console.error(
      `[price] batch AI failure category=${
        e instanceof AiError ? e.code : "unknown"
      }`,
    );

    return fallbacks;
  }
}

export const getPriceComparison = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        medicines: z
          .array(z.string().min(1).max(200))
          .min(1)
          .max(20),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const medicines = data.medicines;
    const keys = medicines.map(keyOf);

    // ---------------------------------------------------------
    // 1. Read existing cached prices from Supabase
    // ---------------------------------------------------------

    const { data: cached, error: cacheReadError } = await supabase
      .from("price_comparisons")
      .select("*")
      .in("medicine_key", keys);

    if (cacheReadError) {
      console.warn(
        "[price] cache read failed:",
        cacheReadError.message,
      );
    }

    const cacheMap = new Map<string, PriceComparison>();

    for (const r of cached ?? []) {
      cacheMap.set(r.medicine_key, {
        medicineKey: r.medicine_key,
        brandName: r.brand_name,
        genericName: r.generic_name ?? "",
        manufacturer: r.manufacturer ?? "",
        marketPrice: Number(r.market_price) || 0,
        pricePerStrip: Number(r.price_per_strip) || 0,
        pricePerTablet: Number(r.price_per_tablet) || 0,
        packSize: r.pack_size ?? 10,
        alternatives:
          (r.alternatives as PriceAlternative[]) ?? [],
        substitutionNotes: r.substitution_notes ?? "",
        warnings: r.warnings ?? "",
      });
    }

    // ---------------------------------------------------------
    // 2. Separate cached and uncached medicines
    // ---------------------------------------------------------

    const resultsByKey = new Map<string, PriceComparison>();
    const missingMedicines: string[] = [];

    for (const name of medicines) {
      const key = keyOf(name);
      const cachedResult = cacheMap.get(key);

      if (cachedResult) {
        resultsByKey.set(key, cachedResult);
      } else {
        missingMedicines.push(name);
      }
    }

    // ---------------------------------------------------------
    // 3. ONE Gemini request for all uncached medicines
    // ---------------------------------------------------------

    if (missingMedicines.length > 0) {
      const freshResults = await fetchBatch(missingMedicines);

      for (const result of freshResults) {
        resultsByKey.set(result.medicineKey, result);
      }

      // -------------------------------------------------------
      // 4. Try to save fresh results to Supabase cache.
      //
      // If service-role credentials are missing, don't crash
      // the whole price-comparison feature.
      // -------------------------------------------------------

      const toUpsert = freshResults.filter(
        (result) => result.marketPrice > 0,
      );

      if (toUpsert.length > 0) {
        try {
          const { supabaseAdmin } =
            await import(
              "@/integrations/supabase/client.server"
            );

          const rows = toUpsert.map((fresh) => ({
            medicine_key: fresh.medicineKey,
            brand_name: fresh.brandName,
            generic_name: fresh.genericName,
            manufacturer: fresh.manufacturer,
            market_price: fresh.marketPrice,
            price_per_strip: fresh.pricePerStrip,
            price_per_tablet: fresh.pricePerTablet,
            pack_size: fresh.packSize,
            alternatives: fresh.alternatives,
            substitution_notes: fresh.substitutionNotes,
            warnings: fresh.warnings,
          }));

          const { error: upsertError } =
            await supabaseAdmin
              .from("price_comparisons")
              .upsert(rows, {
                onConflict: "medicine_key",
              });

          if (upsertError) {
            console.warn(
              "[price] cache write failed:",
              upsertError.message,
            );
          }
        } catch (e) {
          console.warn(
            "[price] service-role cache unavailable; returning AI results without cache.",
            e instanceof Error ? e.message : e,
          );
        }
      }
    }

    // ---------------------------------------------------------
    // 5. Return results in the SAME order as the input
    // ---------------------------------------------------------

    return medicines.map((name) => {
      const key = keyOf(name);

      return resultsByKey.get(key) ?? fallbackFor(name);
    });
  });

export const saveAlternativeSelection = createServerFn({
  method: "POST",
})
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        scanId: z.string().uuid().optional(),
        memberId: z.string().uuid().nullable().optional(),
        originalName: z.string().min(1).max(200),
        originalPrice: z.number().min(0),
        alternativeName: z.string().min(1).max(200),
        alternativeManufacturer: z.string().max(200).optional(),
        alternativePrice: z.number().min(0),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertOwnsScan(
      context.supabase,
      context.userId,
      data.scanId,
    );

    await assertOwnsMember(
      context.supabase,
      context.userId,
      data.memberId,
    );

    const savings = Math.max(
      0,
      data.originalPrice - data.alternativePrice,
    );

    const { error } = await context.supabase
      .from("alternative_selections")
      .insert({
        user_id: context.userId,
        scan_id: data.scanId ?? null,
        member_id: data.memberId ?? null,
        original_name: data.originalName,
        original_price: data.originalPrice,
        alternative_name: data.alternativeName,
        alternative_manufacturer:
          data.alternativeManufacturer ?? null,
        alternative_price: data.alternativePrice,
        savings,
      });

    if (error) {
      throw dbError("price", error);
    }

    return {
      ok: true,
      savings,
    };
  });

export const getSavingsSummary = createServerFn({
  method: "POST",
})
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        memberId: z.string().uuid().nullable().optional(),
      })
      .optional()
      .transform((v) => v ?? {})
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("alternative_selections")
      .select(
        "original_name,original_price,alternative_name,alternative_price,savings,created_at,member_id",
      )
      .order("created_at", {
        ascending: false,
      })
      .limit(200);

    if (data.memberId === null) {
      q = q.is("member_id", null);
    } else if (typeof data.memberId === "string") {
      q = q.eq("member_id", data.memberId);
    }

    const { data: rows, error } = await q;

    if (error) {
      throw dbError("price", error);
    }

    const totalSaved = (rows ?? []).reduce(
      (s, r) => s + (Number(r.savings) || 0),
      0,
    );

    return {
      totalSaved,
      count: rows?.length ?? 0,
      recent: rows ?? [],
    };
  });