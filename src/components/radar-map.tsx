import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getAirportGeo, type AirportGeo } from "@/lib/simfly.functions";
import type { RadarAirport, RadarMetric, RadarRoute } from "@/lib/community-radar.types";
import { formatAirportOwner } from "@/lib/airport-owner";

/** Zoom at which the tier/level signature becomes legible. */
const SIG_MIN_ZOOM = 4;
/** Tick slots around the ring — level fills them clockwise from north. */
const SIG_SLOTS = 12;

type Props = {
  airports: RadarAirport[];
  routes: RadarRoute[];
  metric: RadarMetric;
  discovery: boolean;
  arcs: boolean;
  focusIcao: string | null;
  onSelect: (icao: string) => void;
};

const BANDS = [
  { label: "Quiet", color: "#22D3EE" },
  { label: "Active", color: "#34D399" },
  { label: "Busy", color: "#F59E0B" },
  { label: "Hotspot", color: "#F43F5E" },
];

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

function bandFor(value: number, sorted: number[]): number {
  if (!sorted.length) return 0;
  const idx = sorted.findIndex((v) => v >= value);
  const pct = idx < 0 ? 1 : idx / sorted.length;
  if (pct >= 0.9) return 3;
  if (pct >= 0.7) return 2;
  if (pct >= 0.4) return 1;
  return 0;
}

export function RadarMap({ airports, routes, metric, discovery, arcs, focusIcao, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const layerRef = useRef<import("leaflet").LayerGroup | null>(null);
  const arcRef = useRef<import("leaflet").LayerGroup | null>(null);
  const markerRef = useRef<Map<string, import("leaflet").Marker>>(new Map());
  const fittedRef = useRef(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const icaos = useMemo(() => airports.map((a) => a.icao), [airports]);
  const geoQuery = useQuery({
    queryKey: ["airport-geo", icaos.slice().sort().join(",")],
    queryFn: () => getAirportGeo({ data: { icaos } }),
    enabled: icaos.length > 0,
    staleTime: 60 * 60 * 1000,
  });

  useEffect(() => {
    if (!mounted) return;
    let cancelled = false;
    (async () => {
      if (!containerRef.current) return;
      const L = await import("leaflet");
      if (cancelled || !containerRef.current) return;

      let map = mapRef.current;
      if (!map) {
        map = L.map(containerRef.current, {
          zoomControl: true,
           attributionControl: true,
            worldCopyJump: true,
        }).setView([25, 10], 2);
        L.tileLayer(
  "https://{s}.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}.png?key=cb1_2a77_1_ea2b4c77037024fcc2caffa8",
  {
    maxZoom: 18,
    subdomains: "abcd",
    attribution:
      '&copy; OpenStreetMap contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
  },
).addTo(map);
        mapRef.current = map;
      }

      layerRef.current?.remove();
      arcRef.current?.remove();
      markerRef.current.clear();

      const geo: AirportGeo[] = geoQuery.data ?? [];
      const byIcao = new Map(geo.map((g) => [g.icao.toUpperCase(), g]));

      const values = airports
        .map((a) => (metric === "operations" ? a.operations : a.uniquePilots))
        .sort((a, b) => a - b);
      const max = values[values.length - 1] ?? 1;

      const arcLayer = L.layerGroup();
      if (arcs) {
        for (const r of routes) {
          const a = byIcao.get(r.from);
          const b = byIcao.get(r.to);
          if (!a || !b) continue;
          L.polyline(
            [
              [a.lat, a.lon],
              [b.lat, b.lon],
            ],
            {
              color: "#22D3EE",
              weight: Math.min(2.5, 0.5 + r.count * 0.2),
              opacity: 0.3,
              dashArray: "4 6",
              interactive: false,
            },
          ).addTo(arcLayer);
        }
        arcLayer.addTo(map);
      }
      arcRef.current = arcLayer;

      const layer = L.layerGroup();
      const bounds: [number, number][] = [];

      for (const a of airports) {
        const g = byIcao.get(a.icao);
        if (!g) continue;
        const value = metric === "operations" ? a.operations : a.uniquePilots;
        const band = bandFor(value, values);
        const radius = 5 + Math.sqrt(value / Math.max(1, max)) * 15;
        const dim = discovery && !a.isNew;
        const color = BANDS[band]!.color;
        const ownerLabel = formatAirportOwner(a.owner);
        
        const tier = a.tier ?? null;
        const level = a.level ?? 0;
        
        
        // One marker per airport: bubble, pulse, tier numeral and level ticks are
        // drawn in a single SVG icon anchored to one LatLng, so nothing can drift.
        const pad = 14;
        const box = Math.ceil(radius * 2 + pad * 2);
        const c = box / 2;
        const weight = a.owner ? 2 : 1;

        const pulse =
          discovery && a.isNew
            ? `<circle class="radar-pulse-ring" cx="${c}" cy="${c}" r="${radius + 8}" fill="none" stroke="#F59E0B" stroke-width="1.5" opacity="0.8" />`
            : "";

        const showSig = (tier || level > 0) && radius >= 7;
        let sig = "";
        if (showSig) {
          const ticks = Array.from({ length: Math.min(level, SIG_SLOTS) }, (_, i) => {
                        const rad = ((i * (360 / SIG_SLOTS) - 90) * Math.PI) / 180;
            const x1 = c + Math.cos(rad) * (radius + 1.5);
            const y1 = c + Math.sin(rad) * (radius + 1.5);
            const x2 = c + Math.cos(rad) * (radius + 5.5);
            const y2 = c + Math.sin(rad) * (radius + 5.5);
            return `<line x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" stroke="${color}" stroke-width="1.5" stroke-linecap="round" opacity="0.8" />`;
          }).join("");
            const numeral = tier
            ? `<text class="radar-sig-tier" x="${c}" y="${c}" fill="${color}" text-anchor="middle" dominant-baseline="central">${esc(String(tier))}</text>`
            : "";
          sig = `<g class="radar-sig-g">${ticks}${numeral}</g>`;
        }

                const html = `<svg class="radar-marker-svg" width="${box}" height="${box}" viewBox="0 0 ${box} ${box}" style="opacity:${dim ? 0.3 : 1}">
            ${pulse}
            <circle class="radar-hit" cx="${c}" cy="${c}" r="${radius}" fill="${color}" fill-opacity="${dim ? 0.12 : 0.45}" stroke="${color}" stroke-opacity="${dim ? 0.25 : 0.95}" stroke-width="${weight}" />
            ${sig}
          </svg>`;

        const marker = L.marker([g.lat, g.lon], {
          icon: L.divIcon({
            html,
            className: "radar-marker",
            iconSize: [box, box],
            iconAnchor: [c, c],
            popupAnchor: [0, -radius],
          }),
          keyboard: false,
        });

        marker.bindTooltip(
          `<div class="radar-tip-body">
            <div class="radar-tip-icao">${esc(a.icao)}</div>
            <div class="radar-tip-meta">Tier ${tier ?? "—"} · Level ${level || "—"}</div>
            <div class="radar-tip-meta">Owner: ${esc(ownerLabel)}</div>
            <div class="radar-tip-meta">Operations: ${a.operations} · Pilots: ${a.uniquePilots}</div>
          </div>`,
          { direction: "top", offset: [0, -radius], className: "radar-tip", opacity: 1, sticky: false },
        );

        marker.bindPopup(
          `<div style="min-width:200px;font-family:inherit">
            <div style="display:flex;align-items:baseline;gap:8px">
              <span style="font-family:'JetBrains Mono',monospace;font-size:14px;letter-spacing:.08em;color:#22D3EE">${esc(a.icao)}</span>
              <span style="font-size:11px;opacity:.7">${esc(g.name ?? "")}</span>
            </div>
            <div style="margin-top:6px;font-size:11px;opacity:.75">Owner · ${esc(ownerLabel)}</div>
            <div style="margin-top:2px;font-size:11px;opacity:.75">Tier ${tier ?? "—"} · Level ${level || "—"}</div>
            <div style="margin-top:8px;display:grid;grid-template-columns:1fr auto;gap:2px 10px;font-size:12px">
              <span style="opacity:.7">Weekly operations</span><b>${a.operations}</b>
              <span style="opacity:.7">Arrivals</span><b>${a.arrivals}</b>
              <span style="opacity:.7">Departures</span><b>${a.departures}</b>
              <span style="opacity:.7">Unique pilots</span><b>${a.uniquePilots}</b>
              <span style="opacity:.7">Most frequent</span><b>${esc(a.topVisitor ?? "—")}</b>
            </div>
            <button data-radar-detail="${esc(a.icao)}" style="margin-top:10px;width:100%;border:1px solid rgba(34,211,238,.4);background:rgba(34,211,238,.1);color:#22D3EE;border-radius:6px;padding:5px 0;font-size:11px;letter-spacing:.08em;text-transform:uppercase;cursor:pointer">View details</button>
          </div>`,
          { className: "radar-popup" },
        );

        marker.addTo(layer);
        markerRef.current.set(a.icao, marker);
        bounds.push([g.lat, g.lon]);
      }

      layer.addTo(map);
      layerRef.current = layer;
      
      // Tier/level signature legibility is a pure CSS toggle on the map container,
      // so marker geometry never changes with zoom.

      const syncSig = () => {
        const m = mapRef.current;
        if (!m) return;
        const el = m.getContainer();
        el.classList.toggle("radar-hide-sig", m.getZoom() < SIG_MIN_ZOOM);
      };
      map.off("zoomend");
      map.on("zoomend", syncSig);
      syncSig();

      if (!fittedRef.current && bounds.length) {
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 5 });
        fittedRef.current = true;
      }

      map.off("popupopen");
      map.on("popupopen", (e: { popup: { getElement: () => HTMLElement | undefined } }) => {
        const el = e.popup.getElement();
        const btn = el?.querySelector("[data-radar-detail]") as HTMLElement | null;
        if (btn) {
          btn.onclick = () => onSelect(btn.getAttribute("data-radar-detail") ?? "");
        }
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [mounted, airports, routes, metric, discovery, arcs, geoQuery.data, onSelect]);

  // Fly to a selected airport from the rail.
  useEffect(() => {
    if (!focusIcao) return;
    const marker = markerRef.current.get(focusIcao);
    const map = mapRef.current;
    if (!marker || !map) return;
    map.flyTo(marker.getLatLng(), Math.max(map.getZoom(), 5), { duration: 0.8 });
    marker.openPopup();
  }, [focusIcao]);

  useEffect(() => {
    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full rounded-xl bg-background" />
      {geoQuery.isLoading ? (
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-xs uppercase tracking-[0.2em] text-muted-foreground">
          Plotting airports…
        </div>
      ) : null}
    </div>
  );
}

export { BANDS as RADAR_BANDS };
