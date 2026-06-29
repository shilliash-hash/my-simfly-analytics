import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getAirportGeo, type AirportGeo } from "@/lib/simfly.functions";
import type {
  AirportExt,
  AircraftExt,
  FlightLog,
  LicenseExt,
  MyLiveFlight,
} from "@/lib/types";

type Props = {
  hubs: AirportExt[];
  flights: FlightLog[];
  airplanes?: AircraftExt[];
  licenses?: LicenseExt[];
  liveFlights?: MyLiveFlight[];
};

type LayerState = {
  routes: boolean;
  airports: boolean;
  aircraft: boolean;
  licenses: boolean;
  inflight: boolean;
};

const DEFAULT_LAYERS: LayerState = {
  routes: true,
  airports: true,
  aircraft: false,
  licenses: false,
  inflight: true,
};

function formatRemaining(rawMins: number) {
  const mins = Math.max(0, Math.floor(rawMins));
  if (mins <= 0) return "Ready shortly";
  if (mins < 60) return `Ready in ${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `Ready in ${h}h ${m}m`;
}

function aircraftStatus(p: AircraftExt, live?: MyLiveFlight) {
  if (live) return { label: "Active Flight", remaining: "" };
  if (p.inGroundOperation) {
    let remaining = "";
    if (p.groundedUntil) {
      const mins = (new Date(p.groundedUntil).getTime() - Date.now()) / 60000;
      remaining = formatRemaining(mins);
    }
    return { label: "Ground Operations", remaining };
  }
  return { label: "Ready", remaining: "" };
}

function licenseStatus(l: LicenseExt, live?: MyLiveFlight) {
  if (live) return { label: "Active Flight", remaining: "" };
  const pending = l.timers.filter((t) => t.minutesAvailable < t.minutesCap);
  if (pending.length === 0) return { label: "Ready", remaining: "" };
  const soonest = pending.reduce((a, b) => (a.minsUntilNextRestore < b.minsUntilNextRestore ? a : b));
  const remaining = formatRemaining(soonest.minsUntilNextRestore);
  const allEmpty = l.timers.every((t) => t.minutesAvailable === 0);
  return { label: allEmpty ? "Cooldown" : "Ready", remaining };
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

export function FlightMap({ hubs, flights, airplanes = [], licenses = [], liveFlights = [] }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const layersRef = useRef<Record<keyof LayerState, import("leaflet").LayerGroup | null>>({
    routes: null,
    airports: null,
    aircraft: null,
    licenses: null,
    inflight: null,
  });
  const fittedRef = useRef(false);
  const [mounted, setMounted] = useState(false);
  const [layers, setLayers] = useState<LayerState>(DEFAULT_LAYERS);

  useEffect(() => setMounted(true), []);

  const hubIcaos = useMemo(
    () => new Set(hubs.map((h) => h.icao.toUpperCase())),
    [hubs],
  );

  // Resolve live flight by tail / licence code
  const liveByTail = useMemo(() => {
    const m = new Map<string, MyLiveFlight>();
    for (const f of liveFlights) if (f.tailNumber) m.set(f.tailNumber.toLowerCase(), f);
    return m;
  }, [liveFlights]);

  const liveByLicence = useMemo(() => {
    const m = new Map<string, MyLiveFlight>();
    for (const f of liveFlights) if (f.licenceCode) m.set(f.licenceCode.toLowerCase(), f);
    return m;
  }, [liveFlights]);

  // Resolve license "last known location" from latest matching flight
  const lastIcaoByLicence = useMemo(() => {
    const m = new Map<string, string>();
    // flights are sorted newest-first by convention; pick first match
    for (const f of flights) {
      if (!f.licenceCode) continue;
      const k = f.licenceCode.toLowerCase();
      if (!m.has(k) && f.destination) m.set(k, f.destination.toUpperCase());
    }
    return m;
  }, [flights]);

  const aircraftPositions = useMemo(() => {
    return airplanes.map((p) => {
      const live = p.tailNumber ? liveByTail.get(p.tailNumber.toLowerCase()) : undefined;
      const icao = (live?.destination || p.currentIcao || "").toUpperCase();
      return { p, live, icao };
    }).filter((r) => r.icao);
  }, [airplanes, liveByTail]);

  const licensePositions = useMemo(() => {
    return licenses.map((l) => {
      const live = liveByLicence.get(l.code.toLowerCase());
      const icao = (live?.destination || lastIcaoByLicence.get(l.code.toLowerCase()) || "").toUpperCase();
      return { l, live, icao };
    }).filter((r) => r.icao);
  }, [licenses, liveByLicence, lastIcaoByLicence]);

  const allIcaos = useMemo(() => {
    const s = new Set<string>();
    hubs.forEach((h) => s.add(h.icao.toUpperCase()));
    flights.forEach((f) => {
      if (f.departure) s.add(f.departure.toUpperCase());
      if (f.destination) s.add(f.destination.toUpperCase());
    });
    aircraftPositions.forEach((r) => s.add(r.icao));
    licensePositions.forEach((r) => s.add(r.icao));
    return Array.from(s);
  }, [hubs, flights, aircraftPositions, licensePositions]);

  const geoQuery = useQuery({
    queryKey: ["airport-geo", allIcaos.sort().join(",")],
    queryFn: () => getAirportGeo({ data: { icaos: allIcaos } }),
    enabled: allIcaos.length > 0,
    staleTime: 60 * 60 * 1000,
  });

  const routes = useMemo(() => {
    const m = new Map<string, { from: string; to: string; count: number }>();
    for (const f of flights) {
      if (!f.departure || !f.destination) continue;
      const a = f.departure.toUpperCase();
      const b = f.destination.toUpperCase();
      const key = `${a}->${b}`;
      const row = m.get(key);
      if (row) row.count += 1;
      else m.set(key, { from: a, to: b, count: 1 });
    }
    return Array.from(m.values());
  }, [flights]);

  // Build / rebuild layers whenever data changes
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!containerRef.current) return;
      const L = await import("leaflet");
      if (cancelled || !containerRef.current) return;

      let map = mapRef.current;
      if (!map) {
        map = L.map(containerRef.current, {
          zoomControl: true,
          attributionControl: false,
          worldCopyJump: true,
        }).setView([20, 0], 2);
        L.tileLayer(
          "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
          { maxZoom: 18, subdomains: "abcd" },
        ).addTo(map);
        mapRef.current = map;
      }

      // Drop previous layer groups
      (Object.keys(layersRef.current) as (keyof LayerState)[]).forEach((k) => {
        layersRef.current[k]?.remove();
        layersRef.current[k] = null;
      });

      const geo: AirportGeo[] = geoQuery.data ?? [];
      const byIcao = new Map(geo.map((g) => [g.icao.toUpperCase(), g]));

      // Routes layer (polylines + non-hub airport endpoint markers)
      const routesLayer = L.layerGroup();
      const bounds: [number, number][] = [];
      for (const r of routes) {
        const a = byIcao.get(r.from);
        const b = byIcao.get(r.to);
        if (!a || !b) continue;
        L.polyline([[a.lat, a.lon], [b.lat, b.lon]], {
          color: "#A78BFA",
          weight: Math.min(2.5, 0.6 + r.count * 0.25),
          opacity: 0.55,
          interactive: false,
        }).addTo(routesLayer);
        bounds.push([a.lat, a.lon], [b.lat, b.lon]);
      }
      for (const g of geo) {
        if (hubIcaos.has(g.icao.toUpperCase())) continue;
        const marker = L.circleMarker([g.lat, g.lon], {
          radius: 4,
          color: "#A78BFA",
          weight: 1,
          fillColor: "#A78BFA",
          fillOpacity: 0.6,
        });
        marker.bindTooltip(
          `<span style="font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.08em">${esc(g.icao)}</span> ${esc(g.name)}`,
          { direction: "top", offset: L.point(0, -6) },
        );
        marker.addTo(routesLayer);
      }
      layersRef.current.routes = routesLayer;

      // Hubs (airports) layer
      const airportsLayer = L.layerGroup();
      for (const g of geo) {
        if (!hubIcaos.has(g.icao.toUpperCase())) continue;
        const marker = L.circleMarker([g.lat, g.lon], {
          radius: 8,
          color: "#22D3EE",
          weight: 2,
          fillColor: "#22D3EE",
          fillOpacity: 0.6,
        });
        marker.bindTooltip(
          `<span style="font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.08em">${esc(g.icao)}</span> ${esc(g.name)}`,
          { direction: "top", offset: L.point(0, -6) },
        );
        marker.addTo(airportsLayer);
        bounds.push([g.lat, g.lon]);
      }
      layersRef.current.airports = airportsLayer;

      // Aircraft layer (green)
      const aircraftLayer = L.layerGroup();
      // Group by icao to apply small offsets when multiple share location
      const acByIcao = new Map<string, typeof aircraftPositions>();
      for (const r of aircraftPositions) {
        const arr = acByIcao.get(r.icao) ?? [];
        arr.push(r);
        acByIcao.set(r.icao, arr);
      }
      for (const [icao, arr] of acByIcao) {
        const g = byIcao.get(icao);
        if (!g) continue;
        arr.forEach((r, i) => {
          const offset = i * 0.18;
          const status = aircraftStatus(r.p, r.live);
          const where = r.live ? "In Flight" : icao;
          const marker = L.circleMarker([g.lat + offset, g.lon + offset], {
            radius: 6,
            color: "#0A0F1C",
            weight: 1.5,
            fillColor: "#22C55E",
            fillOpacity: 0.95,
          });
          marker.bindTooltip(
            `<div style="font-family:Inter,sans-serif;font-size:12px;line-height:1.5">
              <div style="font-family:'JetBrains Mono',monospace;font-size:13px;letter-spacing:.06em;color:#FACC15;font-weight:800">${esc(r.p.tailNumber || r.p.icao)}</div>
              <div style="color:#E5E7EB;font-weight:600;font-size:11px">${esc(r.p.name)}</div>
              <div style="margin-top:4px"><span style="color:#FFFFFF;font-weight:600">Location:</span> <span style="color:#7DD3FC;font-weight:700">${esc(where)}</span></div>
              <div><span style="color:#FFFFFF;font-weight:600">Status:</span> <span style="color:#7DD3FC;font-weight:700">${esc(status.label)}</span></div>
              ${status.remaining ? `<div style="color:#7DD3FC;font-weight:700">${esc(status.remaining)}</div>` : ""}
            </div>`,
            { direction: "top", offset: L.point(0, -6), className: "simfly-tip" },
          );
          marker.addTo(aircraftLayer);
        });
      }
      layersRef.current.aircraft = aircraftLayer;

      // License layer (yellow diamonds via divIcon)
      const licenseLayer = L.layerGroup();
      const lcByIcao = new Map<string, typeof licensePositions>();
      for (const r of licensePositions) {
        const arr = lcByIcao.get(r.icao) ?? [];
        arr.push(r);
        lcByIcao.set(r.icao, arr);
      }
      for (const [icao, arr] of lcByIcao) {
        const g = byIcao.get(icao);
        if (!g) continue;
        arr.forEach((r, i) => {
          const offset = -0.22 - i * 0.18;
          const status = licenseStatus(r.l, r.live);
          const where = r.live ? "In Flight" : icao;
          const icon = L.divIcon({
            className: "",
            html: `<div style="width:12px;height:12px;background:#FACC15;border:1.5px solid #0A0F1C;transform:rotate(45deg);box-shadow:0 0 0 1px rgba(250,204,21,.35)"></div>`,
            iconSize: [12, 12],
            iconAnchor: [6, 6],
          });
          const marker = L.marker([g.lat + offset, g.lon + offset], { icon });
          marker.bindTooltip(
            `<div style="font-family:Inter,sans-serif;font-size:12px;line-height:1.5">
              <div style="font-family:'JetBrains Mono',monospace;font-size:13px;letter-spacing:.06em;color:#FACC15;font-weight:800">${esc(r.l.code)} · L${r.l.level}</div>
              <div style="color:#E5E7EB;font-weight:600;font-size:11px">${esc(r.l.name)}</div>
              <div style="margin-top:4px"><span style="color:#FFFFFF;font-weight:600">Location:</span> <span style="color:#7DD3FC;font-weight:700">${esc(where)}</span></div>
              <div><span style="color:#FFFFFF;font-weight:600">Status:</span> <span style="color:#7DD3FC;font-weight:700">${esc(status.label)}</span></div>
              ${status.remaining ? `<div style="color:#7DD3FC;font-weight:700">${esc(status.remaining)}</div>` : ""}
            </div>`,
            { direction: "top", offset: L.point(0, -6), className: "simfly-tip" },
          );
          marker.addTo(licenseLayer);
        });
      }
      layersRef.current.licenses = licenseLayer;

      // In-flight layer (red takeoff at origin, landing at destination, faint route)
      const inflightLayer = L.layerGroup();
      // Lucide-style takeoff / landing SVGs (stroke=white over red disc) — matches site iconography
      const takeoffSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.639 10.258 4 8l-1 3 9 5 2-1 6 1 1-3-6.361-2.742Z"/><path d="M2 22h20"/></svg>`;
      const landingSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 22h20"/><path d="M3.77 10.77 2 9l2-2 5.5 1.5L15 3l3 1-3 7 5.5 1.5L21 14l-2 2-15.23-5.23Z"/></svg>`;
      const makePlaneIcon = (svg: string) =>
        L.divIcon({
          className: "",
          html: `<div style="display:grid;place-items:center;width:22px;height:22px;border-radius:50%;background:#DC2626;border:1.5px solid #0A0F1C;box-shadow:0 0 0 1px rgba(220,38,38,.45)">${svg}</div>`,
          iconSize: [22, 22],
          iconAnchor: [11, 11],
        });
      for (const f of liveFlights) {
        const o = f.origin ? byIcao.get(f.origin.toUpperCase()) : undefined;
        const d = f.destination ? byIcao.get(f.destination.toUpperCase()) : undefined;
        if (!o || !d) continue;
        L.polyline([[o.lat, o.lon], [d.lat, d.lon]], {
          color: "#EF4444",
          weight: 1.5,
          opacity: 0.45,
          dashArray: "4 6",
          interactive: false,
        }).addTo(inflightLayer);
        const tipHtml = `<div style="font-family:Inter,sans-serif;font-size:12px;line-height:1.5">
          <div style="font-family:'JetBrains Mono',monospace;font-size:13px;letter-spacing:.06em;color:#FACC15;font-weight:800">${esc(f.tailNumber || f.aircraftICAO)}</div>
          <div style="color:#E5E7EB;font-weight:600;font-size:11px">${esc(f.aircraftName)}</div>
          <div style="margin-top:4px"><span style="color:#FFFFFF;font-weight:600">Route:</span> <span style="color:#7DD3FC;font-weight:700">${esc(f.origin)} → ${esc(f.destination)}</span></div>
          ${f.pilotUsername ? `<div><span style="color:#FFFFFF;font-weight:600">Pilot:</span> <span style="color:#7DD3FC;font-weight:700">@${esc(f.pilotUsername)}</span></div>` : ""}
        </div>`;
        const oM = L.marker([o.lat, o.lon], { icon: makePlaneIcon(takeoffSvg), zIndexOffset: 500 });
        oM.bindTooltip(tipHtml, { direction: "top", offset: L.point(0, -10), className: "simfly-tip" });
        oM.addTo(inflightLayer);
        const dM = L.marker([d.lat, d.lon], { icon: makePlaneIcon(landingSvg), zIndexOffset: 500 });
        dM.bindTooltip(tipHtml, { direction: "top", offset: L.point(0, -10), className: "simfly-tip" });
        dM.addTo(inflightLayer);
      }
      layersRef.current.inflight = inflightLayer;

      // Apply current toggle state
      (Object.keys(layers) as (keyof LayerState)[]).forEach((k) => {
        const grp = layersRef.current[k];
        if (!grp) return;
        if (layers[k]) grp.addTo(map!);
      });

      if (!fittedRef.current && bounds.length > 1) {
        map.fitBounds(bounds, { padding: [24, 24], maxZoom: 6 });
        fittedRef.current = true;
      } else if (!fittedRef.current && bounds.length === 1) {
        map.setView(bounds[0], 5);
        fittedRef.current = true;
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routes, hubIcaos, geoQuery.data, aircraftPositions, licensePositions, liveFlights]);

  // Cheap toggle: add/remove existing layer groups without rebuilding
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    (Object.keys(layers) as (keyof LayerState)[]).forEach((k) => {
      const grp = layersRef.current[k];
      if (!grp) return;
      const has = map.hasLayer(grp);
      if (layers[k] && !has) grp.addTo(map);
      else if (!layers[k] && has) grp.remove();
    });
  }, [layers]);

  useEffect(() => {
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  const Toggle = ({ k, label, dot }: { k: keyof LayerState; label: string; dot: string }) => (
    <label className="mono flex cursor-pointer select-none items-center gap-1.5 text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground">
      <input
        type="checkbox"
        checked={layers[k]}
        onChange={(e) => setLayers((s) => ({ ...s, [k]: e.target.checked }))}
        className="h-3 w-3 accent-runway"
      />
      <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: dot }} />
      {label}
    </label>
  );

  return (
    <div className="panel overflow-hidden rounded-xl">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Flight Map
          </div>
          <h2 className="text-sm font-semibold text-foreground">
            Hubs, routes, aircraft & licenses
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Toggle k="routes" label="Routes" dot="#A78BFA" />
          <Toggle k="airports" label="My airports" dot="#22D3EE" />
          <Toggle k="aircraft" label="My aircraft" dot="#22C55E" />
          <Toggle k="licenses" label="My licenses" dot="#FACC15" />
        </div>
      </div>
      <div
        ref={containerRef}
        className="h-[360px] w-full bg-[#0A0F1C]"
        aria-label="Map of flown routes"
      />
      {mounted && geoQuery.isLoading && (
        <div className="mono border-t border-border px-4 py-2 text-[10px] uppercase tracking-widest text-muted-foreground">
          Loading airport coordinates…
        </div>
      )}
    </div>
  );
}
