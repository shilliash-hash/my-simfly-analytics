import { jsxs, jsx } from "react/jsx-runtime";
import { useSuspenseQuery, queryOptions, useQueries } from "@tanstack/react-query";
import { u as useServerFn, A as AppShell, P as PageHeader, f as formatNumber } from "./app-shell-WR70AMg9.js";
import { g as getSimflyPayload, a as getAirportVisitors } from "./router-CWBWKmOn.js";
import { u as useSimflyArgs } from "./viewed-user-CKu9yEli.js";
import { ResponsiveContainer, ComposedChart, CartesianGrid, XAxis, YAxis, Tooltip, Bar, Area, BarChart, Cell } from "recharts";
import "@tanstack/react-router";
import "clsx";
import "tailwind-merge";
import "lucide-react";
import "react";
import "./server-BfI8uGY9.js";
import "node:async_hooks";
import "h3-v2";
import "@tanstack/router-core";
import "seroval";
import "@tanstack/history";
import "@tanstack/router-core/ssr/client";
import "@tanstack/router-core/ssr/server";
import "@tanstack/react-router/ssr/server";
function Stats() {
  const fn = useServerFn(getSimflyPayload);
  const visFn = useServerFn(getAirportVisitors);
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
  const topAirports = [...data.airports].sort((a, b) => b.totalEarnedPax - a.totalEarnedPax).slice(0, 6);
  const visitorQueries = useQueries({
    queries: topAirports.map((a) => ({
      queryKey: ["simfly", "visitors", keyTag, a.icao],
      queryFn: () => visFn({
        data: {
          icao: a.icao,
          ...username ? {
            username
          } : {}
        }
      }),
      staleTime: 3e4
    }))
  });
  return /* @__PURE__ */ jsxs(AppShell, { children: [
    /* @__PURE__ */ jsx(PageHeader, { eyebrow: "Analytics", title: "Stats", description: "Charts and live visitor activity across your airports." }),
    /* @__PURE__ */ jsxs("div", { className: "panel mb-6 rounded-xl p-5", children: [
      /* @__PURE__ */ jsxs("div", { className: "mb-4 flex flex-wrap items-baseline justify-between gap-3", children: [
        /* @__PURE__ */ jsx("h2", { className: "font-display text-lg font-semibold", children: "PAX earnings · 30 days" }),
        /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-4 text-[11px] text-muted-foreground", children: [
          /* @__PURE__ */ jsxs("span", { className: "flex items-center gap-1.5", children: [
            /* @__PURE__ */ jsx("span", { className: "inline-block h-2 w-2 rounded-sm bg-[var(--runway)]" }),
            "Your PAX"
          ] }),
          /* @__PURE__ */ jsxs("span", { className: "flex items-center gap-1.5", children: [
            /* @__PURE__ */ jsx("span", { className: "inline-block h-2 w-2 rounded-sm", style: {
              background: "var(--instrument)"
            } }),
            "Visitor PAX"
          ] }),
          /* @__PURE__ */ jsxs("span", { className: "flex items-center gap-1.5", children: [
            /* @__PURE__ */ jsx("span", { className: "inline-block h-2 w-2 rounded-sm bg-[var(--foreground)] opacity-60" }),
            "Total PAX"
          ] }),
          /* @__PURE__ */ jsx("span", { className: "hidden sm:inline opacity-70", children: "Combined daily token income (A + B)." })
        ] })
      ] }),
      /* @__PURE__ */ jsx("div", { className: "h-72 w-full", children: /* @__PURE__ */ jsx(ResponsiveContainer, { children: /* @__PURE__ */ jsxs(ComposedChart, { data: data.earningsTimeseries.map((d) => ({
        ...d,
        paxTotal: (d.pax ?? 0) + (d.paxVisitors ?? 0)
      })), margin: {
        left: -10,
        right: 6,
        top: 6,
        bottom: 0
      }, children: [
        /* @__PURE__ */ jsxs("defs", { children: [
          /* @__PURE__ */ jsxs("linearGradient", { id: "gPax", x1: "0", y1: "0", x2: "0", y2: "1", children: [
            /* @__PURE__ */ jsx("stop", { offset: "0%", stopColor: "var(--runway)", stopOpacity: 0.45 }),
            /* @__PURE__ */ jsx("stop", { offset: "100%", stopColor: "var(--runway)", stopOpacity: 0 })
          ] }),
          /* @__PURE__ */ jsxs("linearGradient", { id: "gVisitors", x1: "0", y1: "0", x2: "0", y2: "1", children: [
            /* @__PURE__ */ jsx("stop", { offset: "0%", stopColor: "var(--instrument)", stopOpacity: 0.45 }),
            /* @__PURE__ */ jsx("stop", { offset: "100%", stopColor: "var(--instrument)", stopOpacity: 0 })
          ] })
        ] }),
        /* @__PURE__ */ jsx(CartesianGrid, { stroke: "var(--border)", vertical: false }),
        /* @__PURE__ */ jsx(XAxis, { dataKey: "date", tickFormatter: (d) => d.slice(5), stroke: "var(--muted-foreground)", fontSize: 11 }),
        /* @__PURE__ */ jsx(YAxis, { stroke: "var(--muted-foreground)", fontSize: 11, tickFormatter: (v) => formatNumber(Number(v)) }),
        /* @__PURE__ */ jsx(Tooltip, { contentStyle: {
          background: "var(--popover)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          fontSize: 12
        }, formatter: (v, name) => {
          const label = name === "paxVisitors" ? "Visitor PAX" : name === "paxTotal" ? "Total PAX" : "Your PAX";
          return [formatNumber(v) + " PAX", label];
        } }),
        /* @__PURE__ */ jsx(Bar, { dataKey: "paxTotal", name: "paxTotal", fill: "rgba(255,255,255,0.12)", radius: [3, 3, 0, 0] }),
        /* @__PURE__ */ jsx(Area, { type: "monotone", dataKey: "pax", name: "pax", stroke: "var(--runway)", strokeWidth: 2, fill: "url(#gPax)" }),
        /* @__PURE__ */ jsx(Area, { type: "monotone", dataKey: "paxVisitors", name: "paxVisitors", stroke: "var(--instrument)", strokeWidth: 2, fill: "url(#gVisitors)" })
      ] }) }) })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "panel mb-6 rounded-xl p-5", children: [
      /* @__PURE__ */ jsx("h2", { className: "font-display mb-4 text-lg font-semibold", children: "PAX by asset" }),
      /* @__PURE__ */ jsx("div", { className: "h-72 w-full", children: /* @__PURE__ */ jsx(ResponsiveContainer, { children: /* @__PURE__ */ jsxs(BarChart, { data: data.paxByAsset, margin: {
        left: -10,
        right: 6,
        top: 6,
        bottom: 0
      }, children: [
        /* @__PURE__ */ jsx(CartesianGrid, { stroke: "var(--border)", vertical: false }),
        /* @__PURE__ */ jsx(XAxis, { dataKey: "label", stroke: "var(--muted-foreground)", fontSize: 10, interval: 0, angle: -20, textAnchor: "end", height: 60 }),
        /* @__PURE__ */ jsx(YAxis, { stroke: "var(--muted-foreground)", fontSize: 11, tickFormatter: (v) => formatNumber(Number(v)) }),
        /* @__PURE__ */ jsx(Tooltip, { contentStyle: {
          background: "var(--popover)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          fontSize: 12
        }, formatter: (v) => formatNumber(v) + " PAX" }),
        /* @__PURE__ */ jsx(Bar, { dataKey: "pax", radius: [4, 4, 0, 0], children: data.paxByAsset.map((d, i) => /* @__PURE__ */ jsx(Cell, { fill: d.kind === "hub" ? "var(--runway)" : d.kind === "aircraft" ? "var(--instrument)" : "var(--tier-platinum)" }, i)) })
      ] }) }) })
    ] }),
    /* @__PURE__ */ jsxs("div", { children: [
      /* @__PURE__ */ jsx("h2", { className: "font-display mb-3 text-xl font-semibold", children: "Live visitors on my airports" }),
      /* @__PURE__ */ jsx("p", { className: "mb-4 text-xs text-muted-foreground", children: "Players currently in flight to or from one of your owned airports (excluding yourself)." }),
      /* @__PURE__ */ jsx("div", { className: "grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3", children: topAirports.map((a, i) => {
        const q = visitorQueries[i];
        const visitors = q.data ?? [];
        return /* @__PURE__ */ jsxs("div", { className: "panel rounded-xl p-4", children: [
          /* @__PURE__ */ jsxs("div", { className: "mb-3 flex items-center justify-between", children: [
            /* @__PURE__ */ jsxs("div", { children: [
              /* @__PURE__ */ jsx("div", { className: "mono text-[11px] uppercase tracking-widest text-runway", children: a.icao }),
              /* @__PURE__ */ jsx("div", { className: "font-display text-sm font-semibold", children: a.name })
            ] }),
            /* @__PURE__ */ jsxs("div", { className: "mono rounded bg-runway/15 px-2 py-1 text-xs text-runway", children: [
              q.isLoading ? "…" : visitors.length,
              " live"
            ] })
          ] }),
          visitors.length === 0 ? /* @__PURE__ */ jsx("div", { className: "text-xs text-muted-foreground", children: "No live visitors right now." }) : /* @__PURE__ */ jsx("ul", { className: "space-y-2 text-xs", children: visitors.slice(0, 6).map((v) => /* @__PURE__ */ jsxs("li", { className: "flex items-center justify-between gap-2", children: [
            /* @__PURE__ */ jsxs("span", { className: "truncate font-display font-medium", children: [
              "@",
              v.username
            ] }),
            /* @__PURE__ */ jsxs("span", { className: "mono text-[10px] text-muted-foreground", children: [
              v.origin,
              "→",
              v.destination,
              " · ",
              v.aircraftICAO
            ] })
          ] }, v.id)) })
        ] }, a.icao);
      }) })
    ] })
  ] });
}
export {
  Stats as component
};
