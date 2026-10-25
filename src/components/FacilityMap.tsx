import { useEffect, useRef } from "react";
import { MapPin } from "lucide-react";
import type { PlaceResult } from "@/lib/places.functions";

declare global {
  interface Window {
    google?: unknown;
    __medscanMapReady?: boolean;
    __initMedscanMap?: () => void;
  }
}

const SCRIPT_ID = "medscan-google-maps";

/** True when a browser Maps API key is present. */
export function hasMapsKey(): boolean {
  return Boolean(import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY);
}

/** Load the Maps JS API once, resolving when it is fully initialised. */
function loadMaps(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.__medscanMapReady) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.getElementById(SCRIPT_ID);
    const prev = window.__initMedscanMap;
    window.__initMedscanMap = () => {
      window.__medscanMapReady = true;
      prev?.();
      resolve();
    };
    if (existing) return;
    const key = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY;
    const channel = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID ?? "";
    if (!key) return reject(new Error("Maps browser key missing"));
    const s = document.createElement("script");
    s.id = SCRIPT_ID;
    s.async = true;
    s.src = `https://maps.googleapis.com/maps/api/js?key=${key}&loading=async&callback=__initMedscanMap&channel=${channel}`;
    s.onerror = () => reject(new Error("Failed to load Google Maps"));
    document.head.appendChild(s);
  });
}

export default function FacilityMap({
  center,
  places,
  selectedId,
  onSelect,
}: {
  center: { lat: number; lng: number };
  places: PlaceResult[];
  selectedId?: string | null;
  onSelect?: (placeId: string) => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);

  useEffect(() => {
    let cancelled = false;
    loadMaps()
      .then(() => {
        if (cancelled || !ref.current) return;
        const g = window.google as any;
        mapRef.current ??= new g.maps.Map(ref.current, {
          center,
          zoom: 13,
          disableDefaultUI: true,
          zoomControl: true,
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const g = (window as any).google;
    const map = mapRef.current;
    if (!g || !map) return;
    map.setCenter(center);

    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];

    // User location marker
    markersRef.current.push(
      new g.maps.Marker({
        position: center,
        map,
        title: "You are here",
        icon: {
          path: g.maps.SymbolPath.CIRCLE,
          scale: 7,
          fillColor: "#0ea5a4",
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 2,
        },
      }),
    );

    const bounds = new g.maps.LatLngBounds();
    bounds.extend(center);
    places.forEach((p) => {
      if (!p.lat || !p.lng) return;
      const marker = new g.maps.Marker({
        position: { lat: p.lat, lng: p.lng },
        map,
        title: p.name,
        animation: selectedId === p.placeId ? g.maps.Animation.BOUNCE : undefined,
      });
      marker.addListener("click", () => onSelect?.(p.placeId));
      markersRef.current.push(marker);
      bounds.extend({ lat: p.lat, lng: p.lng });
    });
    if (places.length) map.fitBounds(bounds, 48);
  }, [center, places, selectedId, onSelect]);

  if (!hasMapsKey()) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 rounded-2xl bg-muted/40 p-6 text-center">
        <MapPin className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm font-medium">Map preview unavailable</p>
        <p className="max-w-xs text-xs text-muted-foreground">
          Google Maps is not configured, so the interactive map is turned off. Search results still
          work in the list view.
        </p>
      </div>
    );
  }

  return <div ref={ref} className="h-full w-full rounded-2xl" />;
}
