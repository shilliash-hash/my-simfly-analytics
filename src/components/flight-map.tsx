import { useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { getAirportGeo, type AirportGeo } from "@/lib/simfly.functions";
import type { AirportExt, FlightLog } from "@/lib/types";

type Props = {
  hubs: AirportExt[];
  flights: FlightLog[];
};

export function FlightMap({ hubs, flights }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const layerRef = useRef<import("leaflet").LayerGroup | null>(null);

  const hubIcaos = useMemo(
    () => new Set(hubs.map((h) => h.icao.toUpperCase())),
    [hubs],
  );

  const allIcaos = useMemo(() => {
    const s = new Set<string>();
    hubs.forEach((h) => s.add(h.icao.toUpperCase()));
    flights.forEach((f) => {
      if (f.departure) s.add(f.departure.toUpperCase());
      if (f.destination) s.add(f.destination.toUpperCase());
    });
    return Array.from(s);
  }, [hubs, flights]);

  const geoQuery = useQuery({
    queryKey: ["airport-geo", allIcaos.sort().join(",")],
    queryFn: () => getAirportGeo({ data: { icaos: allIcaos } }),
    enabled: allIcaos.length > 0,
    staleTime: 60 * 60 * 1000,
  });

  // Aggregate route weights (how many times we flew that pair).
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

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!containerRef.current) return;
      const L = await import("leaflet");
      if (cancelled || !containerRef.current) return;

      let mapInstance = mapRef.current;
      if (!mapInstance) {
        mapInstance = L.map(containerRef.current, {
          zoomControl: true,
          attributionControl: false,
          worldCopyJump: true,
        }).setView([20, 0], 2);
        L.tileLayer(
          "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
          { maxZoom: 18, subdomains: "abcd" },
        ).addTo(mapInstance);
        mapRef.current = mapInstance;
      }

      if (layerRef.current) {
        layerRef.current.remove();
        layerRef.current = null;
      }
      const layerGroup = L.layerGroup().addTo(mapInstance);
      layerRef.current = layerGroup;

      const geo: AirportGeo[] = geoQuery.data ?? [];
      const byIcao = new Map(geo.map((g) => [g.icao.toUpperCase(), g]));

      const bounds: [number, number][] = [];
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
            color: "#475569",
            weight: Math.min(2.5, 0.6 + r.count * 0.25),
            opacity: 0.55,
            interactive: false,
          },
        ).addTo(layerGroup);
        bounds.push([a.lat, a.lon], [b.lat, b.lon]);
      }

      for (const g of geo) {
        const isHub = hubIcaos.has(g.icao.toUpperCase());
        const marker = L.circleMarker([g.lat, g.lon], {
          radius: isHub ? 8 : 4,
          color: isHub ? "#22D3EE" : "#F59E0B",
          weight: isHub ? 2 : 1,
          fillColor: isHub ? "#22D3EE" : "#F59E0B",
          fillOpacity: isHub ? 0.55 : 0.7,
        }).addTo(layerGroup);
        marker.bindTooltip(
          `<span style="font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.08em">${g.icao}</span> ${g.name}`,
          { direction: "top", offset: L.point(0, -6) },
        );
        bounds.push([g.lat, g.lon]);
      }

      if (bounds.length > 1) {
        mapInstance.fitBounds(bounds, { padding: [24, 24], maxZoom: 6 });
      } else if (bounds.length === 1) {
        mapInstance.setView(bounds[0], 5);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [routes, hubIcaos, geoQuery.data]);

  // Tear down on unmount.
  useEffect(() => {
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  return (
    <div className="panel overflow-hidden rounded-xl">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Flight Map
          </div>
          <h2 className="text-sm font-semibold text-foreground">
            Hubs & routes flown
          </h2>
        </div>
        <div className="mono flex items-center gap-3 text-[10px] uppercase tracking-widest text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-runway" />
            My hubs
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-instrument" />
            Other airports
          </span>
        </div>
      </div>
      <div
        ref={containerRef}
        className="h-[360px] w-full bg-[#0A0F1C]"
        aria-label="Map of flown routes"
      />
      {geoQuery.isLoading && (
        <div className="mono border-t border-border px-4 py-2 text-[10px] uppercase tracking-widest text-muted-foreground">
          Loading airport coordinates…
        </div>
      )}
    </div>
  );
}
