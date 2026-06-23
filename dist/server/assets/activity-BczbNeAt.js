import { jsxs, jsx } from "react/jsx-runtime";
import { Link } from "@tanstack/react-router";
import { useQuery, useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { u as useServerFn, A as AppShell, P as PageHeader, r as relativeTime, f as formatNumber } from "./app-shell-WR70AMg9.js";
import { useRef, useMemo, useEffect, useState } from "react";
import { d as getAirportGeo, g as getSimflyPayload } from "./router-CWBWKmOn.js";
import { u as useSimflyArgs } from "./viewed-user-CKu9yEli.js";
import { ArrowUpRight, IdCard, Route, ArrowUp, ShoppingCart, Wrench } from "lucide-react";
import "clsx";
import "tailwind-merge";
import "./server-BfI8uGY9.js";
import "node:async_hooks";
import "h3-v2";
import "@tanstack/router-core";
import "seroval";
import "@tanstack/history";
import "@tanstack/router-core/ssr/client";
import "@tanstack/router-core/ssr/server";
import "@tanstack/react-router/ssr/server";
function FlightMap({ hubs, flights }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);
  const hubIcaos = useMemo(
    () => new Set(hubs.map((h) => h.icao.toUpperCase())),
    [hubs]
  );
  const allIcaos = useMemo(() => {
    const s = /* @__PURE__ */ new Set();
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
    staleTime: 60 * 60 * 1e3
  });
  const routes = useMemo(() => {
    const m = /* @__PURE__ */ new Map();
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
          worldCopyJump: true
        }).setView([20, 0], 2);
        L.tileLayer(
          "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
          { maxZoom: 18, subdomains: "abcd" }
        ).addTo(mapInstance);
        mapRef.current = mapInstance;
      }
      if (layerRef.current) {
        layerRef.current.remove();
        layerRef.current = null;
      }
      const layerGroup = L.layerGroup().addTo(mapInstance);
      layerRef.current = layerGroup;
      const geo = geoQuery.data ?? [];
      const byIcao = new Map(geo.map((g) => [g.icao.toUpperCase(), g]));
      const bounds = [];
      for (const r of routes) {
        const a = byIcao.get(r.from);
        const b = byIcao.get(r.to);
        if (!a || !b) continue;
        L.polyline(
          [
            [a.lat, a.lon],
            [b.lat, b.lon]
          ],
          {
            color: "#475569",
            weight: Math.min(2.5, 0.6 + r.count * 0.25),
            opacity: 0.55,
            interactive: false
          }
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
          fillOpacity: isHub ? 0.55 : 0.7
        }).addTo(layerGroup);
        marker.bindTooltip(
          `<span style="font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.08em">${g.icao}</span> ${g.name}`,
          { direction: "top", offset: L.point(0, -6) }
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
  useEffect(() => {
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);
  return /* @__PURE__ */ jsxs("div", { className: "panel overflow-hidden rounded-xl", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between border-b border-border px-4 py-3", children: [
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("div", { className: "mono text-[10px] uppercase tracking-widest text-muted-foreground", children: "Flight Map" }),
        /* @__PURE__ */ jsx("h2", { className: "text-sm font-semibold text-foreground", children: "Hubs & routes flown" })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "mono flex items-center gap-3 text-[10px] uppercase tracking-widest text-muted-foreground", children: [
        /* @__PURE__ */ jsxs("span", { className: "flex items-center gap-1.5", children: [
          /* @__PURE__ */ jsx("span", { className: "inline-block h-2.5 w-2.5 rounded-full bg-runway" }),
          "My hubs"
        ] }),
        /* @__PURE__ */ jsxs("span", { className: "flex items-center gap-1.5", children: [
          /* @__PURE__ */ jsx("span", { className: "inline-block h-2 w-2 rounded-full bg-instrument" }),
          "Other airports"
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsx(
      "div",
      {
        ref: containerRef,
        className: "h-[360px] w-full bg-[#0A0F1C]",
        "aria-label": "Map of flown routes"
      }
    ),
    geoQuery.isLoading && /* @__PURE__ */ jsx("div", { className: "mono border-t border-border px-4 py-2 text-[10px] uppercase tracking-widest text-muted-foreground", children: "Loading airport coordinates…" })
  ] });
}
const PAGE_SIZE = 50;
const isVisitorEntry = (entry) => entry.message.startsWith("(Visitor)");
const ICONS = {
  upgrade: Wrench,
  purchase: ShoppingCart,
  levelup: ArrowUp,
  route: Route,
  license: IdCard
};
const COLORS = {
  upgrade: "bg-runway/15 text-runway",
  purchase: "bg-instrument/15 text-instrument",
  levelup: "bg-tier-gold/15 text-tier-gold",
  route: "bg-tier-silver/15 text-tier-silver",
  license: "bg-instrument/15 text-instrument"
};
function ActivityFeed() {
  const fn = useServerFn(getSimflyPayload);
  const {
    keyTag,
    payload
  } = useSimflyArgs();
  const {
    data
  } = useSuspenseQuery(queryOptions({
    queryKey: ["simfly", keyTag],
    queryFn: () => fn(payload ? {
      data: payload
    } : void 0),
    staleTime: 3e4
  }));
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(0);
  const items = filter === "all" ? data.activity : filter === "visitors" ? data.activity.filter(isVisitorEntry) : data.activity.filter((a) => a.kind === filter);
  const pageCount = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const start = safePage * PAGE_SIZE;
  const visible = items.slice(start, start + PAGE_SIZE);
  const setFilterReset = (k) => {
    setFilter(k);
    setPage(0);
  };
  return /* @__PURE__ */ jsxs(AppShell, { children: [
    /* @__PURE__ */ jsx(PageHeader, { eyebrow: "Live feed", title: "Activity", description: "Everything happening across the SimFly network — chronological and filterable." }),
    /* @__PURE__ */ jsx("div", { className: "mb-6", children: /* @__PURE__ */ jsx(FlightMap, { hubs: data.airports, flights: data.flights }) }),
    /* @__PURE__ */ jsx("div", { className: "mb-4 flex flex-wrap gap-1 rounded-lg border border-border bg-background/50 p-1", children: ["all", "visitors", "upgrade", "purchase", "levelup", "route", "license"].map((k) => /* @__PURE__ */ jsx("button", { onClick: () => setFilterReset(k), className: `mono rounded px-2.5 py-1 text-[11px] uppercase tracking-widest transition-colors ${filter === k ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"}`, children: k }, k)) }),
    /* @__PURE__ */ jsxs("ol", { className: "panel divide-y divide-border rounded-xl", children: [
      visible.map((a) => {
        const isVisitor = isVisitorEntry(a);
        const Icon = isVisitor ? ArrowUpRight : ICONS[a.kind];
        const message = isVisitor ? a.message.replace(/^\(Visitor\)\s*/, "") : a.message;
        return /* @__PURE__ */ jsxs("li", { className: "flex items-start gap-4 p-4", children: [
          /* @__PURE__ */ jsx("div", { className: `grid h-9 w-9 shrink-0 place-items-center rounded-lg ${isVisitor ? "bg-instrument/15 text-instrument" : COLORS[a.kind]}`, children: /* @__PURE__ */ jsx(Icon, { className: "h-4 w-4" }) }),
          /* @__PURE__ */ jsxs("div", { className: "min-w-0 flex-1", children: [
            /* @__PURE__ */ jsxs("div", { className: "text-sm", children: [
              isVisitor && /* @__PURE__ */ jsx("span", { className: "mono mr-2 rounded-sm bg-instrument/15 px-1 py-px text-[9px] font-semibold uppercase tracking-widest text-instrument", children: "Visitor" }),
              message
            ] }),
            /* @__PURE__ */ jsxs("div", { className: "mono mt-1 flex flex-wrap items-center gap-x-3 text-[10px] uppercase tracking-widest text-muted-foreground", children: [
              /* @__PURE__ */ jsxs(Link, { to: "/players/$handle", params: {
                handle: a.actorHandle
              }, className: "hover:text-runway", children: [
                "@",
                a.actorHandle
              ] }),
              a.hubIcao && /* @__PURE__ */ jsx("span", { className: "text-runway", children: a.hubIcao }),
              /* @__PURE__ */ jsx("span", { children: relativeTime(a.at) })
            ] })
          ] }),
          a.delta !== void 0 && a.kind !== "levelup" && /* @__PURE__ */ jsxs("div", { className: `mono shrink-0 text-xs ${isVisitor ? "text-instrument" : "text-runway"}`, children: [
            "+",
            formatNumber(a.delta)
          ] })
        ] }, a.id);
      }),
      visible.length === 0 && /* @__PURE__ */ jsx("li", { className: "p-6 text-center text-xs text-muted-foreground", children: "No activity for this filter." })
    ] }),
    items.length > PAGE_SIZE && /* @__PURE__ */ jsxs("div", { className: "mt-4 flex items-center justify-between gap-3", children: [
      /* @__PURE__ */ jsxs("div", { className: "mono text-[11px] uppercase tracking-widest text-muted-foreground", children: [
        formatNumber(start + 1),
        "–",
        formatNumber(Math.min(start + PAGE_SIZE, items.length)),
        " of ",
        formatNumber(items.length)
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-1", children: [
        /* @__PURE__ */ jsx("button", { onClick: () => setPage((p) => Math.max(0, p - 1)), disabled: safePage === 0, className: "mono rounded border border-border px-3 py-1 text-[11px] uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30", children: "Prev" }),
        /* @__PURE__ */ jsxs("span", { className: "mono px-2 text-[11px] uppercase tracking-widest text-muted-foreground", children: [
          safePage + 1,
          " / ",
          pageCount
        ] }),
        /* @__PURE__ */ jsx("button", { onClick: () => setPage((p) => Math.min(pageCount - 1, p + 1)), disabled: safePage >= pageCount - 1, className: "mono rounded border border-border px-3 py-1 text-[11px] uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30", children: "Next" })
      ] })
    ] })
  ] });
}
export {
  ActivityFeed as component
};
