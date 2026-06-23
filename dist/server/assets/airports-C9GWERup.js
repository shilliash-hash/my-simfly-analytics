import { jsxs, jsx } from "react/jsx-runtime";
import { Link } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { u as useServerFn, A as AppShell, P as PageHeader, f as formatNumber, T as TierPill, R as RotationCell } from "./app-shell-WR70AMg9.js";
import { useState, useMemo } from "react";
import { g as getSimflyPayload } from "./router-CWBWKmOn.js";
import { u as useSimflyArgs } from "./viewed-user-CKu9yEli.js";
import { Search, MapPin } from "lucide-react";
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
function AirportsPage() {
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
    staleTime: 5 * 6e4
  }));
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState("totalEarnedPax");
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = data.airports.filter((a) => {
      if (!q) return true;
      return a.icao.toLowerCase().includes(q) || a.name.toLowerCase().includes(q) || a.country.toLowerCase().includes(q);
    });
    return filtered.sort((a, b) => {
      if (sortKey === "icao") return a.icao.localeCompare(b.icao);
      if (sortKey === "tier") return b.category - a.category;
      return b[sortKey] - a[sortKey];
    });
  }, [data.airports, query, sortKey]);
  const totalPax = data.airports.reduce((s, a) => s + a.totalEarnedPax, 0);
  const pax7d = data.airports.reduce((s, a) => s + a.pax7d, 0);
  return /* @__PURE__ */ jsxs(AppShell, { children: [
    /* @__PURE__ */ jsx(PageHeader, { eyebrow: `@${data.me.handle}`, title: "My airports", description: `${data.airports.length} owned airports — live from simfly.io.` }),
    /* @__PURE__ */ jsxs("div", { className: "mb-4 grid gap-3 sm:grid-cols-4", children: [
      /* @__PURE__ */ jsx(Stat, { label: "Airports", value: String(data.airports.length) }),
      /* @__PURE__ */ jsx(Stat, { label: "Lifetime PAX", value: formatNumber(Math.round(totalPax)), accent: "runway" }),
      /* @__PURE__ */ jsx(Stat, { label: "PAX last 7d", value: formatNumber(Math.round(pax7d)), accent: "runway" }),
      /* @__PURE__ */ jsx(Stat, { label: "Available PAX", value: formatNumber(Math.round(data.availablePax)), accent: "instrument" })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "panel mb-4 flex flex-col gap-3 rounded-xl p-3 sm:flex-row sm:items-center", children: /* @__PURE__ */ jsxs("div", { className: "relative flex-1", children: [
      /* @__PURE__ */ jsx(Search, { className: "pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" }),
      /* @__PURE__ */ jsx("input", { value: query, onChange: (e) => setQuery(e.target.value), placeholder: "Search ICAO, name, country…", className: "w-full rounded-lg border border-border bg-background/50 py-2 pl-9 pr-3 text-sm outline-none transition-colors focus:border-primary" })
    ] }) }),
    /* @__PURE__ */ jsx("div", { className: "panel overflow-hidden rounded-xl", children: /* @__PURE__ */ jsx("div", { className: "overflow-x-auto", children: /* @__PURE__ */ jsxs("table", { className: "w-full text-sm", children: [
      /* @__PURE__ */ jsx("thead", { className: "mono bg-secondary/40 text-[10px] uppercase tracking-widest text-muted-foreground", children: /* @__PURE__ */ jsxs("tr", { children: [
        /* @__PURE__ */ jsx(Th, { sortable: true, active: sortKey === "icao", onClick: () => setSortKey("icao"), children: "ICAO" }),
        /* @__PURE__ */ jsx(Th, { children: "Name" }),
        /* @__PURE__ */ jsx(Th, { children: "Country" }),
        /* @__PURE__ */ jsx(Th, { sortable: true, active: sortKey === "tier", onClick: () => setSortKey("tier"), children: "Tier" }),
        /* @__PURE__ */ jsx(Th, { sortable: true, active: sortKey === "level", onClick: () => setSortKey("level"), children: "Level" }),
        /* @__PURE__ */ jsx(Th, { sortable: true, active: sortKey === "totalEarnedPax", onClick: () => setSortKey("totalEarnedPax"), children: "Lifetime PAX" }),
        /* @__PURE__ */ jsx(Th, { sortable: true, active: sortKey === "pax7d", onClick: () => setSortKey("pax7d"), children: "PAX 7d" }),
        /* @__PURE__ */ jsx(Th, { sortable: true, active: sortKey === "pax30d", onClick: () => setSortKey("pax30d"), children: "PAX 30d" }),
        /* @__PURE__ */ jsx(Th, { children: "Rotation" })
      ] }) }),
      /* @__PURE__ */ jsxs("tbody", { children: [
        rows.map((a) => /* @__PURE__ */ jsxs("tr", { className: "border-t border-border transition-colors hover:bg-secondary/30", children: [
          /* @__PURE__ */ jsx("td", { className: "mono px-4 py-3 text-runway", children: /* @__PURE__ */ jsx(Link, { to: "/airports/$id", params: {
            id: a.icao
          }, className: "hover:underline", children: a.icao }) }),
          /* @__PURE__ */ jsx("td", { className: "px-4 py-3 font-display font-semibold", children: a.name }),
          /* @__PURE__ */ jsx("td", { className: "px-4 py-3", children: /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-1.5 text-[12px] text-muted-foreground", children: [
            /* @__PURE__ */ jsx(MapPin, { className: "h-3 w-3" }),
            a.country
          ] }) }),
          /* @__PURE__ */ jsx("td", { className: "px-4 py-3", children: /* @__PURE__ */ jsx(TierPill, { tier: a.tier, label: a.tierLabel }) }),
          /* @__PURE__ */ jsxs("td", { className: "mono px-4 py-3", children: [
            "L",
            a.level,
            /* @__PURE__ */ jsxs("span", { className: "ml-1 text-[10px] text-muted-foreground", children: [
              Math.round(a.levelProgress),
              "%"
            ] })
          ] }),
          /* @__PURE__ */ jsx("td", { className: "mono px-4 py-3 text-runway", children: formatNumber(Math.round(a.totalEarnedPax)) }),
          /* @__PURE__ */ jsx("td", { className: "mono px-4 py-3", children: formatNumber(Math.round(a.pax7d)) }),
          /* @__PURE__ */ jsx("td", { className: "mono px-4 py-3", children: formatNumber(Math.round(a.pax30d)) }),
          /* @__PURE__ */ jsx("td", { className: "mono px-4 py-3", children: /* @__PURE__ */ jsx(RotationCell, { rotation: a.rotation, max: a.maxRotation }) })
        ] }, a.icao)),
        rows.length === 0 && /* @__PURE__ */ jsx("tr", { children: /* @__PURE__ */ jsx("td", { colSpan: 9, className: "px-4 py-10 text-center text-sm text-muted-foreground", children: "No airports match." }) })
      ] })
    ] }) }) })
  ] });
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
  AirportsPage as component
};
