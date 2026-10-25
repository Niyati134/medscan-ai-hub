// Server-only helpers for the Google Maps Platform connector (via Lovable gateway).
const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_maps";

export type PlaceResult = {
  placeId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  rating: number | null;
  ratingCount: number | null;
  openNow: boolean | null;
  hours: string[];
  phone: string | null;
  mapsUri: string | null;
  primaryType: string | null;
  distanceKm: number | null;
};

function gatewayHeaders(extra: Record<string, string> = {}) {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const mapsKey = process.env["GOOGLE_MAPS_API_KEY"];
  if (!lovableKey || !mapsKey) throw new Error("Google Maps connector is not configured");
  return {
    Authorization: `Bearer ${lovableKey}`,
    "X-Connection-Api-Key": mapsKey,
    "Content-Type": "application/json",
    ...extra,
  };
}

/** Great-circle distance in km. */
export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(la1) * Math.cos(la2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.location",
  "places.rating",
  "places.userRatingCount",
  "places.currentOpeningHours.openNow",
  "places.regularOpeningHours.weekdayDescriptions",
  "places.nationalPhoneNumber",
  "places.googleMapsUri",
  "places.primaryTypeDisplayName",
].join(",");

type RawPlace = {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  rating?: number;
  userRatingCount?: number;
  currentOpeningHours?: { openNow?: boolean };
  regularOpeningHours?: { weekdayDescriptions?: string[] };
  nationalPhoneNumber?: string;
  googleMapsUri?: string;
  primaryTypeDisplayName?: { text?: string };
};

async function handleError(res: Response): Promise<never> {
  const body = await res.text();
  if (res.status === 403) {
    let reason: string | undefined;
    try {
      reason = JSON.parse(body)?.error?.details?.find((d: { reason?: string }) => d.reason)?.reason;
    } catch {
      /* ignore */
    }
    if (reason === "API_KEY_HTTP_REFERRER_BLOCKED")
      throw new Error(
        'Google Maps server key is referrer-restricted. Set the server key\'s application restrictions to "None" or "IP addresses".',
      );
    if (reason === "API_KEY_SERVICE_BLOCKED")
      throw new Error(
        "Google Maps server key does not allow the Places API. Add it to the key's allowed-APIs list.",
      );
    throw new Error("Google Maps request was denied (403). Check the server key restrictions.");
  }
  console.warn(`[places] request_failed category=http_${res.status}`);
  throw new Error("Nearby search is unavailable right now. Please try again.");
}

/** Text search around a point (Places API New). */
export async function searchText(opts: {
  textQuery: string;
  lat: number;
  lng: number;
  radiusMeters: number;
  maxResults?: number;
  openNow?: boolean;
}): Promise<PlaceResult[]> {
  const res = await fetch(`${GATEWAY_URL}/places/v1/places:searchText`, {
    method: "POST",
    headers: gatewayHeaders({ "X-Goog-FieldMask": FIELD_MASK }),
    body: JSON.stringify({
      textQuery: opts.textQuery,
      maxResultCount: Math.min(opts.maxResults ?? 15, 20),
      openNow: opts.openNow || undefined,
      locationBias: {
        circle: {
          center: { latitude: opts.lat, longitude: opts.lng },
          radius: Math.min(Math.max(opts.radiusMeters, 500), 50000),
        },
      },
    }),
  });
  if (!res.ok) await handleError(res);
  const json = (await res.json()) as { places?: RawPlace[] };
  const origin = { lat: opts.lat, lng: opts.lng };
  return (json.places ?? []).map((p) => {
    const lat = p.location?.latitude ?? 0;
    const lng = p.location?.longitude ?? 0;
    return {
      placeId: p.id ?? "",
      name: p.displayName?.text ?? "Unknown",
      address: p.formattedAddress ?? "",
      lat,
      lng,
      rating: p.rating ?? null,
      ratingCount: p.userRatingCount ?? null,
      openNow: p.currentOpeningHours?.openNow ?? null,
      hours: p.regularOpeningHours?.weekdayDescriptions ?? [],
      phone: p.nationalPhoneNumber ?? null,
      mapsUri: p.googleMapsUri ?? null,
      primaryType: p.primaryTypeDisplayName?.text ?? null,
      distanceKm: lat && lng ? haversineKm(origin, { lat, lng }) : null,
    } satisfies PlaceResult;
  });
}

/** Reverse geocode a coordinate to a readable address. */
export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  const res = await fetch(
    `${GATEWAY_URL}/maps/api/geocode/json?latlng=${lat},${lng}`,
    { headers: gatewayHeaders() },
  );
  if (!res.ok) await handleError(res);
  const json = (await res.json()) as { results?: Array<{ formatted_address?: string }> };
  return json.results?.[0]?.formatted_address ?? "";
}
