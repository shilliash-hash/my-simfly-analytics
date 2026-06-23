import { jsxs, jsx } from "react/jsx-runtime";
import { Link } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions, useQuery } from "@tanstack/react-query";
import { u as useServerFn, A as AppShell, P as PageHeader, T as TierPill, f as formatNumber } from "./app-shell-WR70AMg9.js";
import { g as getSimflyPayload, b as getVisitorHistory } from "./router-CWBWKmOn.js";
import { u as useSimflyArgs } from "./viewed-user-CKu9yEli.js";
import { Crown } from "lucide-react";
import "clsx";
import "tailwind-merge";
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
function fmtPax(n) {
  return n >= 100 ? formatNumber(Math.round(n)) : n.toFixed(1);
}
function Rankings() {
  const fn = useServerFn(getSimflyPayload);
  const histFn = useServerFn(getVisitorHistory);
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
  const PAGES = 25;
  const history = useQuery({
    queryKey: ["simfly", "visitor-history", keyTag, PAGES],
    queryFn: () => histFn({
      data: {
        pages: PAGES,
        ...username ? {
          username
        } : {}
      }
    }),
    staleTime: 5 * 6e4
  });
  const topHubsByPax = [...data.airports].sort((a, b) => b.totalEarnedPax - a.totalEarnedPax).slice(0, 10);
  const topVisitors = (history.data?.visitors ?? []).slice(0, 10);
  const scanned = history.data?.scannedAirports ?? [];
  const sampledFlights = scanned.reduce((s, a) => s + a.flightsSampled, 0);
  const efficiency = [...data.airports].filter((a) => a.totalRotations > 0).map((a) => ({
    ...a,
    ppr: a.totalEarnedPax / a.totalRotations
  })).sort((a, b) => b.ppr - a.ppr).slice(0, 10);
  return /* @__PURE__ */ jsxs(AppShell, { children: [
    /* @__PURE__ */ jsx(PageHeader, { eyebrow: "Leaderboards", title: "Rankings", description: "Your airports ranked by PAX earned, lifetime efficiency, and community standing." }),
    /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-1 gap-6 lg:grid-cols-3", children: [
      /* @__PURE__ */ jsxs("div", { className: "panel rounded-xl p-5", children: [
        /* @__PURE__ */ jsx("h2", { className: "font-display mb-4 text-lg font-semibold", children: "Top hubs by lifetime PAX" }),
        /* @__PURE__ */ jsx("ol", { className: "space-y-2", children: topHubsByPax.map((a, i) => /* @__PURE__ */ jsx("li", { children: /* @__PURE__ */ jsxs(Link, { to: "/airports/$id", params: {
          id: a.icao
        }, className: "flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-secondary/40", children: [
          /* @__PURE__ */ jsx(Rank, { n: i + 1 }),
          /* @__PURE__ */ jsxs("div", { className: "min-w-0 flex-1", children: [
            /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
              /* @__PURE__ */ jsx("span", { className: "font-display truncate text-sm font-semibold", children: a.icao }),
              /* @__PURE__ */ jsx(TierPill, { tier: a.tier })
            ] }),
            /* @__PURE__ */ jsxs("div", { className: "mt-1 flex items-center gap-2", children: [
              /* @__PURE__ */ jsx("div", { className: "h-1 flex-1 overflow-hidden rounded-full bg-secondary", children: /* @__PURE__ */ jsx("div", { className: "h-full bg-runway", style: {
                width: `${Math.min(100, a.levelProgress)}%`
              } }) }),
              /* @__PURE__ */ jsxs("span", { className: "mono text-[10px] text-muted-foreground", children: [
                "L",
                a.level,
                " · ",
                Math.round(a.levelProgress),
                "% to next"
              ] })
            ] })
          ] }),
          /* @__PURE__ */ jsx("div", { className: "mono shrink-0 text-sm text-runway", children: formatNumber(Math.round(a.totalEarnedPax)) })
        ] }) }, a.icao)) })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "panel rounded-xl p-5", children: [
        /* @__PURE__ */ jsx("h2", { className: "font-display mb-1 text-lg font-semibold", children: "Top visitors to my hubs" }),
        /* @__PURE__ */ jsxs("p", { className: "mb-3 text-[11px] text-muted-foreground", children: [
          "Aggregated from ",
          formatNumber(sampledFlights),
          " sampled flights across ",
          scanned.length,
          " owned hub",
          scanned.length === 1 ? "" : "s",
          ".",
          /* @__PURE__ */ jsx("br", {}),
          /* @__PURE__ */ jsx("span", { className: "text-runway", children: "PAX I earned" }),
          " / ",
          /* @__PURE__ */ jsx("span", { className: "text-muted-foreground", children: "PAX they earned" }),
          "."
        ] }),
        /* @__PURE__ */ jsxs("ol", { className: "space-y-2", children: [
          history.isLoading && /* @__PURE__ */ jsx("li", { className: "px-2 py-4 text-xs text-muted-foreground", children: "Sampling visitor history…" }),
          !history.isLoading && topVisitors.length === 0 && /* @__PURE__ */ jsx("li", { className: "px-2 py-4 text-xs text-muted-foreground", children: "No visitor flights sampled yet." }),
          topVisitors.map((v, i) => /* @__PURE__ */ jsx("li", { children: /* @__PURE__ */ jsxs(Link, { to: "/players/$handle", params: {
            handle: v.handle
          }, className: "flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-secondary/40", children: [
            /* @__PURE__ */ jsx(Rank, { n: i + 1 }),
            /* @__PURE__ */ jsxs("div", { className: "min-w-0 flex-1", children: [
              /* @__PURE__ */ jsxs("div", { className: "font-display truncate text-sm font-semibold", children: [
                "@",
                v.handle
              ] }),
              /* @__PURE__ */ jsxs("div", { className: "truncate text-[11px] text-muted-foreground", children: [
                v.visits,
                " visits · ",
                v.airports.length,
                " hub",
                v.airports.length === 1 ? "" : "s"
              ] })
            ] }),
            /* @__PURE__ */ jsxs("div", { className: "mono shrink-0 text-right text-sm", children: [
              /* @__PURE__ */ jsx("div", { className: "text-runway", children: fmtPax(v.paxForMe) }),
              /* @__PURE__ */ jsx("div", { className: "text-[10px] text-muted-foreground", children: fmtPax(v.paxForVisitor) })
            ] })
          ] }) }, v.handle))
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "panel rounded-xl p-5", children: [
        /* @__PURE__ */ jsx("h2", { className: "font-display mb-1 text-lg font-semibold", children: "PAX per rotation" }),
        /* @__PURE__ */ jsx("p", { className: "mb-3 text-[11px] text-muted-foreground", children: "Lifetime PAX ÷ rotations · efficiency by hub." }),
        /* @__PURE__ */ jsxs("ol", { className: "space-y-2", children: [
          efficiency.map((a, i) => /* @__PURE__ */ jsx("li", { children: /* @__PURE__ */ jsxs(Link, { to: "/airports/$id", params: {
            id: a.icao
          }, className: "flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-secondary/40", children: [
            /* @__PURE__ */ jsx(Rank, { n: i + 1 }),
            /* @__PURE__ */ jsxs("div", { className: "min-w-0 flex-1", children: [
              /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
                /* @__PURE__ */ jsx("span", { className: "font-display truncate text-sm font-semibold", children: a.icao }),
                /* @__PURE__ */ jsx(TierPill, { tier: a.tier })
              ] }),
              /* @__PURE__ */ jsxs("div", { className: "truncate text-[11px] text-muted-foreground", children: [
                a.totalRotations,
                " rotations · ",
                formatNumber(Math.round(a.totalEarnedPax)),
                " PAX"
              ] })
            ] }),
            /* @__PURE__ */ jsxs("div", { className: "mono shrink-0 text-sm text-runway", children: [
              a.ppr.toFixed(2),
              "/r"
            ] })
          ] }) }, a.icao)),
          efficiency.length === 0 && /* @__PURE__ */ jsx("li", { className: "px-2 py-4 text-xs text-muted-foreground", children: "No rotation history yet." })
        ] })
      ] })
    ] })
  ] });
}
function Rank({
  n
}) {
  return /* @__PURE__ */ jsx("div", { className: `mono grid h-7 w-7 shrink-0 place-items-center rounded text-xs font-semibold ${n === 1 ? "bg-tier-gold/20 text-tier-gold" : n <= 3 ? "bg-tier-silver/15 text-tier-silver" : "bg-secondary text-muted-foreground"}`, children: n === 1 ? /* @__PURE__ */ jsx(Crown, { className: "h-3.5 w-3.5" }) : n });
}
export {
  Rankings as component
};
