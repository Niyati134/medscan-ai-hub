import { createFileRoute } from "@tanstack/react-router";
import { ClientOnly } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { lazy, Suspense, useEffect, useState } from "react";
import { z } from "zod";
import {
  AlertTriangle,
  Ambulance,
  Clock,
  Crosshair,
  Heart,
  Hospital,
  MapPin,
  Navigation,
  Phone,
  Pill,
  Search,
  Star,
  Stethoscope,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  searchFacilities,
  describeLocation,
  listFavorites,
  toggleFavorite,
  listRecentSearches,
  recommendCare,
  getMapsStatus,
  type PlaceResult,
} from "@/lib/places.functions";
import { listScans, type ParsedMedicine } from "@/lib/scan.functions";
import { useMember } from "@/lib/useMember";

const FacilityMap = lazy(() => import("@/components/FacilityMap"));

export const Route = createFileRoute("/locator")({
  validateSearch: z.object({
    kind: z.enum(["pharmacy", "hospital"]).optional(),
    q: z.string().optional(),
    emergency: z.boolean().optional(),
  }),
  head: () => ({
    meta: [
      { title: "Pharmacy & Hospital Locator | MedScan AI" },
      {
        name: "description",
        content:
          "Find nearby pharmacies and hospitals, check open hours, distance and emergency care with MedScan AI.",
      },
      { property: "og:title", content: "Pharmacy & Hospital Locator | MedScan AI" },
      {
        property: "og:description",
        content: "Locate nearby pharmacies, emergency and specialty hospitals around you.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <AppShell>
      <Locator />
    </AppShell>
  ),
});

type Kind = "pharmacy" | "hospital";
type HospitalFilter = "all" | "emergency" | "government" | "private" | "specialty";

const HOSPITAL_FILTERS: Array<{ id: HospitalFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "emergency", label: "Emergency" },
  { id: "government", label: "Government" },
  { id: "private", label: "Private" },
  { id: "specialty", label: "Specialty" },
];

function Locator() {
  const search = Route.useSearch();
  const qc = useQueryClient();
  const { activeMemberId } = useMember();

  const doSearch = useServerFn(searchFacilities);
  const doDescribe = useServerFn(describeLocation);
  const doToggleFav = useServerFn(toggleFavorite);
  const fetchFavorites = useServerFn(listFavorites);
  const fetchRecents = useServerFn(listRecentSearches);
  const fetchScans = useServerFn(listScans);
  const doRecommend = useServerFn(recommendCare);
  const fetchMapsStatus = useServerFn(getMapsStatus);

  // Maps services are optional — the page falls back gracefully when absent.
  const mapsStatus = useQuery({
    queryKey: ["mapsStatus"],
    staleTime: Infinity,
    queryFn: () => fetchMapsStatus({}),
  });
  const mapsReady = mapsStatus.data?.configured === true;
  const mapsUnavailable = mapsStatus.isSuccess && !mapsReady;

  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [address, setAddress] = useState("");
  const [locating, setLocating] = useState(true);
  const [locError, setLocError] = useState<string | null>(null);
  const [kind, setKind] = useState<Kind>(search.kind ?? "pharmacy");
  const [filter, setFilter] = useState<HospitalFilter>(search.emergency ? "emergency" : "all");
  const [query, setQuery] = useState(search.q ?? "");
  const [submitted, setSubmitted] = useState(search.q ?? "");
  const [openNow, setOpenNow] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    if (search.emergency) setKind("hospital");
  }, [search.emergency]);

  // Detect the user's location on mount.
  useEffect(() => {
    if (!("geolocation" in navigator)) {
      setLocError("Location is not supported by this browser.");
      setLocating(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
      },
      () => {
        setLocError("We couldn't access your location. Allow location access and retry.");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }, []);

  useEffect(() => {
    if (!coords || !mapsReady) return;
    doDescribe({ data: coords })
      .then((r) => setAddress(r.address))
      .catch(() => undefined);
  }, [coords, mapsReady]);

  const results = useQuery({
    queryKey: ["places", kind, filter, submitted, openNow, coords?.lat, coords?.lng],
    enabled: !!coords && mapsReady,
    queryFn: () =>
      doSearch({
        data: {
          kind,
          lat: coords!.lat,
          lng: coords!.lng,
          query: submitted || undefined,
          filter: kind === "hospital" ? filter : undefined,
          openNow,
          radiusKm: 15,
        },
      }),
  });

  const favorites = useQuery({ queryKey: ["favPlaces"], queryFn: () => fetchFavorites({}) });
  const recents = useQuery({ queryKey: ["placeSearches"], queryFn: () => fetchRecents({}) });

  const scans = useQuery({
    queryKey: ["scans", activeMemberId],
    queryFn: () => fetchScans({ data: { memberId: activeMemberId } }),
  });
  const recentMeds = (() => {
    const s = scans.data?.[0];
    const meds = Array.isArray(s?.medicines) ? (s!.medicines as unknown as ParsedMedicine[]) : [];
    return meds.map((m) => m.name).filter(Boolean).slice(0, 10);
  })();

  const care = useQuery({
    queryKey: ["careRec", recentMeds.join("|")],
    enabled: recentMeds.length > 0,
    staleTime: 1000 * 60 * 60,
    queryFn: () => doRecommend({ data: { medicines: recentMeds } }),
  });

  const favSet = new Set((favorites.data ?? []).map((f) => f.place_id));
  const favMutation = useMutation({
    mutationFn: (p: PlaceResult) =>
      doToggleFav({
        data: {
          placeId: p.placeId,
          kind,
          name: p.name,
          address: p.address,
          phone: p.phone,
          lat: p.lat,
          lng: p.lng,
          rating: p.rating,
          mapsUri: p.mapsUri,
        },
      }),
    onSuccess: (r) => {
      toast.success(r.favorited ? "Saved to favourites" : "Removed from favourites");
      qc.invalidateQueries({ queryKey: ["favPlaces"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const list = results.data?.results ?? [];

  const emergencyMode = () => {
    setKind("hospital");
    setFilter("emergency");
    setQuery("");
    setSubmitted("");
    setOpenNow(true);
    toast.info("Showing nearest emergency care");
  };

  const retryLocation = () => {
    setLocating(true);
    setLocError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
      },
      () => {
        setLocError("Location access denied.");
        setLocating(false);
      },
    );
  };

  return (
    <div className="space-y-6 animate-fade-up">
      {/* Header */}
      <div className="overflow-hidden rounded-2xl bg-gradient-hero p-6 text-primary-foreground shadow-glow md:p-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <Badge variant="secondary" className="mb-2 border-0 bg-background/20 text-primary-foreground">
              <MapPin className="mr-1 h-3 w-3" /> Healthcare near you
            </Badge>
            <h1 className="font-display text-3xl font-bold md:text-4xl">Pharmacy &amp; hospital locator</h1>
            <p className="mt-1 text-sm opacity-85">
              {locating
                ? "Detecting your location…"
                : address || (coords ? `${coords.lat.toFixed(3)}, ${coords.lng.toFixed(3)}` : "Location unavailable")}
            </p>
          </div>
          <Button
            size="lg"
            onClick={emergencyMode}
            className="h-11 bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            <Ambulance className="mr-2 h-4 w-4" /> Find emergency care
          </Button>
        </div>
      </div>

      {locError && (
        <Card className="glass flex flex-col items-start gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3 text-sm">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            {locError}
          </div>
          <Button size="sm" variant="outline" onClick={retryLocation}>
            <Crosshair className="mr-2 h-4 w-4" /> Retry
          </Button>
        </Card>
      )}

      {/* Maps unavailable fallback banner */}
      {mapsUnavailable && (
        <Card className="glass flex flex-col items-start gap-3 border-primary/30 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3 text-sm">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <div>
              <p className="font-medium">Interactive map &amp; nearby search unavailable</p>
              <p className="text-xs text-muted-foreground">
                Google Maps is not configured for this workspace, so live maps and nearby facility
                search are turned off. Everything else in MedScan AI works normally.
              </p>
            </div>
          </div>
          <Button asChild size="sm" variant="outline" className="shrink-0">
            <a
              href={`https://www.google.com/maps/search/${encodeURIComponent(
                `${query.trim() || (kind === "pharmacy" ? "pharmacies" : "hospitals")} near me`,
              )}`}
              target="_blank"
              rel="noreferrer"
            >
              <Navigation className="mr-2 h-4 w-4" /> Search on Google Maps
            </a>
          </Button>
        </Card>
      )}

      {/* Controls */}
      <Card className="glass space-y-4 p-4 md:p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <Tabs value={kind} onValueChange={(v) => setKind(v as Kind)} className="w-full md:w-auto">
            <TabsList className="grid w-full grid-cols-2 md:w-64">
              <TabsTrigger value="pharmacy">
                <Pill className="mr-1.5 h-3.5 w-3.5" /> Pharmacies
              </TabsTrigger>
              <TabsTrigger value="hospital">
                <Hospital className="mr-1.5 h-3.5 w-3.5" /> Hospitals
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <form
            className="flex flex-1 gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              setSubmitted(query.trim());
            }}
          >
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={
                  kind === "pharmacy" ? "Search a medicine or store name" : "Search a specialty or hospital"
                }
                className="pl-9"
              />
            </div>
            <Button type="submit" className="bg-gradient-primary">
              Search
            </Button>
          </form>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {kind === "hospital" &&
            HOSPITAL_FILTERS.map((f) => (
              <Button
                key={f.id}
                size="sm"
                variant={filter === f.id ? "default" : "outline"}
                className={filter === f.id ? "bg-gradient-primary" : ""}
                onClick={() => setFilter(f.id)}
              >
                {f.label}
              </Button>
            ))}
          <Button
            size="sm"
            variant={openNow ? "default" : "outline"}
            className={openNow ? "bg-gradient-primary" : ""}
            onClick={() => setOpenNow((v) => !v)}
          >
            <Clock className="mr-1.5 h-3.5 w-3.5" /> Open now
          </Button>
        </div>
      </Card>

      {/* Map + list hybrid */}
      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="glass overflow-hidden p-0 lg:col-span-3">
          <div className="h-[320px] w-full md:h-[460px]">
            {!mapsReady ? (
              <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-muted/40 p-6 text-center">
                <MapPin className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm font-medium">Map preview unavailable</p>
                <p className="max-w-xs text-xs text-muted-foreground">
                  Live maps are turned off right now. You can still search facilities on Google Maps below.
                </p>
              </div>
            ) : coords ? (
              <ClientOnly fallback={<Skeleton className="h-full w-full" />}>
                <Suspense fallback={<Skeleton className="h-full w-full" />}>
                  <FacilityMap
                    center={coords}
                    places={list}
                    selectedId={selected}
                    onSelect={setSelected}
                  />
                </Suspense>
              </ClientOnly>
            ) : (
              <Skeleton className="h-full w-full" />
            )}
          </div>
        </Card>

        <div className="space-y-3 lg:col-span-2">
          {results.isLoading &&
            Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 w-full rounded-2xl" />)}
          {results.error && (
            <Card className="glass p-5 text-sm text-destructive">
              {(results.error as Error).message}
            </Card>
          )}
          {!results.isLoading && !results.error && list.length === 0 && coords && (
            <Card className="glass p-6 text-center text-sm text-muted-foreground">
              No {kind === "pharmacy" ? "pharmacies" : "hospitals"} found nearby. Try widening your search.
            </Card>
          )}
          <div className="max-h-[460px] space-y-3 overflow-y-auto pr-1">
            {list.map((p) => (
              <PlaceCard
                key={p.placeId}
                place={p}
                selected={selected === p.placeId}
                favorited={favSet.has(p.placeId)}
                onSelect={() => setSelected(p.placeId)}
                onFavorite={() => favMutation.mutate(p)}
              />
            ))}
          </div>
        </div>
      </div>

      {/* AI care recommendations */}
      {recentMeds.length > 0 && (
        <Card className="glass p-6">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-primary shadow-soft">
              <Stethoscope className="h-5 w-5 text-primary-foreground" />
            </div>
            <div className="flex-1">
              <h2 className="font-display text-lg font-bold">AI care recommendations</h2>
              <p className="text-xs text-muted-foreground">
                Based on your latest prescription: {recentMeds.join(", ")}
              </p>
              {care.isLoading && <Skeleton className="mt-3 h-20 w-full" />}
              {care.data && (
                <div className="mt-3 space-y-3">
                  <p className="text-sm text-foreground/80">{care.data.summary}</p>
                  <div className="flex flex-wrap gap-2">
                    {care.data.specialists.map((s) => (
                      <Badge key={s.specialty} variant="outline" className="font-normal">
                        {s.specialty} · {s.reason}
                      </Badge>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {care.data.facilities.map((f) => (
                      <Button
                        key={f}
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setKind("hospital");
                          setQuery(f);
                          setSubmitted(f);
                        }}
                      >
                        <Search className="mr-1.5 h-3 w-3" /> {f}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* Favourites + recent searches */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card className="glass p-6">
          <h2 className="font-display text-lg font-bold">Favourite facilities</h2>
          <div className="mt-3 space-y-2">
            {(favorites.data ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground">Tap the heart on a result to save it here.</p>
            )}
            {(favorites.data ?? []).map((f) => (
              <div
                key={f.id}
                className="flex items-center justify-between rounded-xl border border-border bg-card p-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{f.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{f.address}</p>
                </div>
                {f.maps_uri && (
                  <Button asChild size="sm" variant="ghost">
                    <a href={f.maps_uri} target="_blank" rel="noreferrer">
                      <Navigation className="h-4 w-4" />
                    </a>
                  </Button>
                )}
              </div>
            ))}
          </div>
        </Card>

        <Card className="glass p-6">
          <h2 className="font-display text-lg font-bold">Recent searches</h2>
          <div className="mt-3 space-y-2">
            {(recents.data ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground">Your recent locator searches will appear here.</p>
            )}
            {(recents.data ?? []).map((r) => (
              <button
                key={r.id}
                onClick={() => {
                  setKind(r.kind === "hospital" ? "hospital" : "pharmacy");
                  setQuery(r.query ?? "");
                  setSubmitted(r.query ?? "");
                }}
                className="flex w-full items-center justify-between rounded-xl border border-border bg-card p-3 text-left transition hover:bg-accent"
              >
                <span className="truncate text-sm">
                  {r.query?.trim() ? r.query : r.kind === "hospital" ? "Hospitals nearby" : "Pharmacies nearby"}
                </span>
                <span className="text-xs text-muted-foreground">{r.result_count} results</span>
              </button>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function PlaceCard({
  place,
  selected,
  favorited,
  onSelect,
  onFavorite,
}: {
  place: PlaceResult;
  selected: boolean;
  favorited: boolean;
  onSelect: () => void;
  onFavorite: () => void;
}) {
  const directions = place.mapsUri
    ? place.mapsUri
    : `https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lng}`;
  return (
    <Card
      onClick={onSelect}
      className={`glass cursor-pointer p-4 transition hover:shadow-glow ${
        selected ? "ring-2 ring-primary" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium">{place.name}</p>
          <p className="truncate text-xs text-muted-foreground">{place.address}</p>
        </div>
        <Button
          size="icon"
          variant="ghost"
          onClick={(e) => {
            e.stopPropagation();
            onFavorite();
          }}
          aria-label={favorited ? "Remove favourite" : "Save favourite"}
        >
          <Heart className={`h-4 w-4 ${favorited ? "fill-destructive text-destructive" : ""}`} />
        </Button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {place.distanceKm !== null && (
          <Badge variant="secondary" className="border-0">
            {place.distanceKm < 1
              ? `${Math.round(place.distanceKm * 1000)} m`
              : `${place.distanceKm.toFixed(1)} km`}
          </Badge>
        )}
        {place.openNow !== null && (
          <Badge
            variant="outline"
            className={place.openNow ? "border-success/40 text-success" : "border-destructive/40 text-destructive"}
          >
            {place.openNow ? "Open now" : "Closed"}
          </Badge>
        )}
        {place.rating !== null && (
          <Badge variant="outline" className="font-normal">
            <Star className="mr-1 h-3 w-3 fill-current" /> {place.rating}
            {place.ratingCount ? ` (${place.ratingCount})` : ""}
          </Badge>
        )}
        {place.primaryType && (
          <Badge variant="outline" className="font-normal">
            {place.primaryType}
          </Badge>
        )}
      </div>
      {place.hours.length > 0 && (
        <p className="mt-2 text-xs text-muted-foreground">{place.hours[new Date().getDay() === 0 ? 6 : new Date().getDay() - 1]}</p>
      )}
      <div className="mt-3 flex gap-2">
        <Button asChild size="sm" className="bg-gradient-primary" onClick={(e) => e.stopPropagation()}>
          <a href={directions} target="_blank" rel="noreferrer">
            <Navigation className="mr-1.5 h-3.5 w-3.5" /> Directions
          </a>
        </Button>
        {place.phone && (
          <Button asChild size="sm" variant="outline" onClick={(e) => e.stopPropagation()}>
            <a href={`tel:${place.phone.replace(/\s/g, "")}`}>
              <Phone className="mr-1.5 h-3.5 w-3.5" /> Call
            </a>
          </Button>
        )}
      </div>
    </Card>
  );
}
