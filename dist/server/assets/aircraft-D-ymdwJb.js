import { jsxs, jsx } from "react/jsx-runtime";
import { Link } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions, useQuery } from "@tanstack/react-query";
import { u as useServerFn, A as AppShell, P as PageHeader, f as formatNumber } from "./app-shell-WR70AMg9.js";
import { useMemo, useState } from "react";
import { g as getSimflyPayload, c as getMyLiveFlights } from "./router-CWBWKmOn.js";
import { u as useSimflyArgs } from "./viewed-user-CKu9yEli.js";
import { Search, Plane } from "lucide-react";
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
function AircraftPage() {
  const fn = useServerFn(getSimflyPayload);
  const {
    keyTag,
    payload,
    username
  } = useSimflyArgs();
  const {
    data
  } = useSuspenseQuery(queryOptions({
    queryKey: ["simfly", keyTag],
    queryFn: () => fn(payload ? {
      data: payload
    } : void 0)
  }));
  const liveFn = useServerFn(getMyLiveFlights);
  const icaos = useMemo(() => Array.from(new Set(data.airports.map((a) => a.icao).filter(Boolean))), [data.airports]);
  const {
    data: liveFlights = []
  } = useQuery({
    queryKey: ["simfly", "myLive", keyTag, icaos],
    queryFn: () => liveFn({
      data: {
        icaos,
        ...username ? {
          username
        } : {}
      }
    }),
    enabled: icaos.length > 0,
    refetchInterval: 6e4,
    staleTime: 3e4
  });
  const liveByTail = useMemo(() => {
    const m = /* @__PURE__ */ new Map();
    for (const f of liveFlights) {
      if (f.tailNumber) m.set(f.tailNumber.toLowerCase(), f);
    }
    return m;
  }, [liveFlights]);
  const liveByType = useMemo(() => {
    const m = /* @__PURE__ */ new Map();
    for (const f of liveFlights) {
      if (f.aircraftICAO && !m.has(f.aircraftICAO.toLowerCase())) {
        m.set(f.aircraftICAO.toLowerCase(), f);
      }
    }
    return m;
  }, [liveFlights]);
  function liveFor(p) {
    if (p.tailNumber && liveByTail.has(p.tailNumber.toLowerCase())) {
      return liveByTail.get(p.tailNumber.toLowerCase());
    }
    if (p.icao && liveByType.has(p.icao.toLowerCase())) {
      return liveByType.get(p.icao.toLowerCase());
    }
    return void 0;
  }
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState("totalEarnedPax");
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = data.airplanes.filter((p) => !q || p.tailNumber.toLowerCase().includes(q) || p.name.toLowerCase().includes(q) || p.icao.toLowerCase().includes(q));
    return filtered.sort((a, b) => {
      if (sortKey === "tail") return (a.tailNumber || a.icao).localeCompare(b.tailNumber || b.icao);
      return b[sortKey] - a[sortKey];
    });
  }, [data.airplanes, query, sortKey]);
  const totalPax = data.airplanes.reduce((s, a) => s + a.totalEarnedPax, 0);
  const airborneCount = data.airplanes.filter((p) => !!liveFor(p)).length;
  return /* @__PURE__ */ jsxs(AppShell, { children: [
    /* @__PURE__ */ jsx(PageHeader, { eyebrow: `@${data.me.handle}`, title: "My aircraft", description: `${data.airplanes.length} owned aircraft — lifetime PAX as primary metric.` }),
    /* @__PURE__ */ jsxs("div", { className: "mb-4 grid gap-3 sm:grid-cols-4", children: [
      /* @__PURE__ */ jsx(Stat, { label: "Aircraft", value: String(data.airplanes.length) }),
      /* @__PURE__ */ jsx(Stat, { label: "Lifetime PAX", value: formatNumber(Math.round(totalPax)), accent: "runway" }),
      /* @__PURE__ */ jsx(Stat, { label: "Airborne", value: String(airborneCount), accent: "runway" }),
      /* @__PURE__ */ jsx(Stat, { label: "Grounded", value: String(data.airplanes.filter((p) => p.inGroundOperation).length), accent: "instrument" })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "panel mb-4 flex flex-col gap-3 rounded-xl p-3 sm:flex-row sm:items-center", children: /* @__PURE__ */ jsxs("div", { className: "relative flex-1", children: [
      /* @__PURE__ */ jsx(Search, { className: "pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" }),
      /* @__PURE__ */ jsx("input", { value: query, onChange: (e) => setQuery(e.target.value), placeholder: "Search tail, type, ICAO…", className: "w-full rounded-lg border border-border bg-background/50 py-2 pl-9 pr-3 text-sm outline-none transition-colors focus:border-primary" })
    ] }) }),
    /* @__PURE__ */ jsx("div", { className: "panel overflow-hidden rounded-xl", children: /* @__PURE__ */ jsx("div", { className: "overflow-x-auto", children: /* @__PURE__ */ jsxs("table", { className: "w-full text-sm", children: [
      /* @__PURE__ */ jsx("thead", { className: "mono bg-secondary/40 text-[10px] uppercase tracking-widest text-muted-foreground", children: /* @__PURE__ */ jsxs("tr", { children: [
        /* @__PURE__ */ jsx(Th, { sortable: true, active: sortKey === "tail", onClick: () => setSortKey("tail"), children: "Tail" }),
        /* @__PURE__ */ jsx(Th, { children: "Type" }),
        /* @__PURE__ */ jsx(Th, { children: "Based" }),
        /* @__PURE__ */ jsx(Th, { sortable: true, active: sortKey === "level", onClick: () => setSortKey("level"), children: "Level" }),
        /* @__PURE__ */ jsx(Th, { sortable: true, active: sortKey === "totalEarnedPax", onClick: () => setSortKey("totalEarnedPax"), children: "Lifetime PAX" }),
        /* @__PURE__ */ jsx(Th, { sortable: true, active: sortKey === "totalEarnedXp", onClick: () => setSortKey("totalEarnedXp"), children: "Lifetime XP" }),
        /* @__PURE__ */ jsx(Th, { children: "Ground op" }),
        /* @__PURE__ */ jsx(Th, { children: "Status" })
      ] }) }),
      /* @__PURE__ */ jsxs("tbody", { children: [
        rows.map((p) => /* @__PURE__ */ jsxs("tr", { className: "border-t border-border transition-colors hover:bg-secondary/30", children: [
          /* @__PURE__ */ jsx("td", { className: "mono px-4 py-3 text-runway", children: /* @__PURE__ */ jsx(Link, { to: "/aircraft/$id", params: {
            id: p.aircraftId
          }, className: "hover:underline", children: p.tailNumber || p.icao }) }),
          /* @__PURE__ */ jsx("td", { className: "px-4 py-3 font-display font-semibold", children: /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
            /* @__PURE__ */ jsx(Plane, { className: "h-3.5 w-3.5 -rotate-45 text-runway" }),
            p.name
          ] }) }),
          /* @__PURE__ */ jsx("td", { className: "mono px-4 py-3 text-muted-foreground", children: (() => {
            const live = liveFor(p);
            if (live) {
              return /* @__PURE__ */ jsxs("span", { className: "text-runway", children: [
                live.origin,
                " → ",
                live.destination
              ] });
            }
            return p.currentIcao || "—";
          })() }),
          /* @__PURE__ */ jsxs("td", { className: "mono px-4 py-3", children: [
            "L",
            p.level,
            /* @__PURE__ */ jsxs("span", { className: "ml-1 text-[10px] text-muted-foreground", children: [
              Math.round(p.levelProgress),
              "%"
            ] })
          ] }),
          /* @__PURE__ */ jsx("td", { className: "mono px-4 py-3 text-runway", children: formatNumber(Math.round(p.totalEarnedPax)) }),
          /* @__PURE__ */ jsx("td", { className: "mono px-4 py-3", children: formatNumber(Math.round(p.totalEarnedXp)) }),
          /* @__PURE__ */ jsx("td", { className: "mono px-4 py-3", children: /* @__PURE__ */ jsx(GroundTimer, { until: p.groundedUntil, grounded: p.inGroundOperation }) }),
          /* @__PURE__ */ jsx("td", { className: "px-4 py-3", children: /* @__PURE__ */ jsx(StatusPill, { grounded: p.inGroundOperation, live: liveFor(p) }) })
        ] }, p.aircraftId)),
        rows.length === 0 && /* @__PURE__ */ jsx("tr", { children: /* @__PURE__ */ jsx("td", { colSpan: 8, className: "px-4 py-10 text-center text-sm text-muted-foreground", children: "No aircraft." }) })
      ] })
    ] }) }) })
  ] });
}
function GroundTimer({
  until,
  grounded
}) {
  if (!grounded || !until) {
    return /* @__PURE__ */ jsx("span", { className: "text-muted-foreground", children: "—" });
  }
  const ms = new Date(until).getTime() - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return /* @__PURE__ */ jsx("span", { className: "text-muted-foreground", children: "—" });
  const mins = Math.floor(ms / 6e4);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return /* @__PURE__ */ jsx("span", { className: "text-instrument", children: h > 0 ? `${h}h ${m}m` : `${m}m` });
}
function StatusPill({
  grounded,
  live
}) {
  if (live) {
    return /* @__PURE__ */ jsxs("span", { className: "mono inline-flex items-center gap-1 rounded bg-runway/20 px-1.5 py-0.5 text-[10px] uppercase tracking-widest text-runway", children: [
      /* @__PURE__ */ jsx("span", { className: "h-1.5 w-1.5 animate-pulse rounded-full bg-runway" }),
      "Airborne"
    ] });
  }
  return grounded ? /* @__PURE__ */ jsx("span", { className: "mono inline-flex rounded bg-instrument/15 px-1.5 py-0.5 text-[10px] uppercase tracking-widest text-instrument", children: "Ground op" }) : /* @__PURE__ */ jsx("span", { className: "mono inline-flex rounded bg-runway/15 px-1.5 py-0.5 text-[10px] uppercase tracking-widest text-runway", children: "Ready" });
}
function Stat({
  label,
  value,
  accent
}) {
  const tone = accent === "runway" ? "text-runway" : accent === "instrument" ? "text-instrument" : "text-foreground";
  return /* @__PURE__ */ jsxs("div", { className: "panel rounded-xl p-4", children: [
    /* @__PURE__ */ jsx("div", { className: "mono text-[10px] uppercase tracking-widest text-muted-foreground", children: label }),
    /* @__PURE__ */ jsx("div", { className: `mt-1 font-display text-2xl font-semibold ${tone}`, children: value })
  ] });
}
function Th({
  children,
  sortable,
  active,
  onClick
}) {
  return /* @__PURE__ */ jsxs("th", { onClick, className: `px-4 py-3 text-left ${sortable ? "cursor-pointer select-none hover:text-foreground" : ""} ${active ? "text-runway" : ""}`, children: [
    children,
    sortable && /* @__PURE__ */ jsx("span", { className: "ml-1", children: active ? "▼" : "↕" })
  ] });
}
export {
  AircraftPage as component
};
