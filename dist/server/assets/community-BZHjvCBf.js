import { jsxs, jsx } from "react/jsx-runtime";
import { Link } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions, useQueries, useQuery } from "@tanstack/react-query";
import { u as useServerFn, A as AppShell, P as PageHeader, f as formatNumber } from "./app-shell-WR70AMg9.js";
import { g as getSimflyPayload, a as getAirportVisitors, b as getVisitorHistory } from "./router-CWBWKmOn.js";
import { u as useSimflyArgs } from "./viewed-user-CKu9yEli.js";
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
function fmtPax(n) {
  return n >= 100 ? formatNumber(Math.round(n)) : n.toFixed(1);
}
function Community() {
  const fn = useServerFn(getSimflyPayload);
  const visFn = useServerFn(getAirportVisitors);
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
  const airports = [...data.airports].sort((a, b) => b.totalEarnedPax - a.totalEarnedPax);
  const liveQueries = useQueries({
    queries: airports.map((a) => ({
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
  const history = useQuery({
    queryKey: ["simfly", "visitor-history", keyTag, 5],
    queryFn: () => histFn({
      data: {
        pages: 5,
        ...username ? {
          username
        } : {}
      }
    }),
    staleTime: 5 * 6e4
  });
  const liveAgg = /* @__PURE__ */ new Map();
  liveQueries.forEach((q, i) => {
    for (const v of q.data ?? []) {
      const row = liveAgg.get(v.username) ?? {
        handle: v.username,
        visits: 0,
        airports: /* @__PURE__ */ new Set()
      };
      row.visits += 1;
      row.airports.add(airports[i].icao);
      liveAgg.set(v.username, row);
    }
  });
  const topLive = [...liveAgg.values()].sort((a, b) => b.visits - a.visits).slice(0, 12);
  const visitors = history.data?.visitors ?? [];
  const topByPaxForMe = visitors.slice(0, 20);
  return /* @__PURE__ */ jsxs(AppShell, { children: [
    /* @__PURE__ */ jsx(PageHeader, { eyebrow: "Live + history", title: "My visitors", description: "Live traffic at your hubs plus a paginated history of who is flying through them and how much PAX you both earn." }),
    /* @__PURE__ */ jsxs("section", { className: "mb-10", children: [
      /* @__PURE__ */ jsxs("div", { className: "mb-3 flex items-end justify-between", children: [
        /* @__PURE__ */ jsx("h2", { className: "font-display text-lg font-semibold", children: "Visitor revenue (sampled history)" }),
        /* @__PURE__ */ jsx("p", { className: "mono text-[10px] uppercase tracking-widest text-muted-foreground", children: history.isLoading ? "Sampling latest flights…" : `${history.data?.scannedAirports.length ?? 0} hubs · ~${history.data?.pagesPerAirport ?? 0} pages each` })
      ] }),
      /* @__PURE__ */ jsx("p", { className: "mb-3 text-xs text-muted-foreground", children: "SimFly has no historical visitor-revenue API. We estimate it by paging the public per-airport flight log and aggregating earned PAX per pilot. The 7-day cycle window is exact for sampled flights; raise the page depth to widen the window." }),
      /* @__PURE__ */ jsx("div", { className: "panel overflow-x-auto rounded-xl", children: /* @__PURE__ */ jsxs("table", { className: "min-w-full text-sm", children: [
        /* @__PURE__ */ jsx("thead", { className: "border-b border-border/60 text-left", children: /* @__PURE__ */ jsxs("tr", { className: "mono text-[10px] uppercase tracking-widest text-muted-foreground", children: [
          /* @__PURE__ */ jsx("th", { className: "px-4 py-2", children: "#" }),
          /* @__PURE__ */ jsx("th", { className: "px-4 py-2", children: "Visitor" }),
          /* @__PURE__ */ jsx("th", { className: "px-4 py-2 text-right", children: "Visits" }),
          /* @__PURE__ */ jsx("th", { className: "px-4 py-2 text-right", children: "PAX for me" }),
          /* @__PURE__ */ jsx("th", { className: "px-4 py-2 text-right", children: "PAX for visitor" }),
          /* @__PURE__ */ jsx("th", { className: "px-4 py-2 text-right", children: "7d cycle (me/visitor)" }),
          /* @__PURE__ */ jsx("th", { className: "px-4 py-2", children: "Hubs touched" }),
          /* @__PURE__ */ jsx("th", { className: "px-4 py-2", children: "Last seen" })
        ] }) }),
        /* @__PURE__ */ jsxs("tbody", { children: [
          topByPaxForMe.map((v, i) => /* @__PURE__ */ jsxs("tr", { className: "border-b border-border/30 last:border-0", children: [
            /* @__PURE__ */ jsx("td", { className: "mono px-4 py-2 text-xs text-muted-foreground", children: i + 1 }),
            /* @__PURE__ */ jsx("td", { className: "px-4 py-2", children: /* @__PURE__ */ jsxs(Link, { to: "/players/$handle", params: {
              handle: v.handle
            }, className: "font-display font-medium hover:text-runway", children: [
              "@",
              v.handle
            ] }) }),
            /* @__PURE__ */ jsx("td", { className: "mono px-4 py-2 text-right text-xs", children: v.visits }),
            /* @__PURE__ */ jsx("td", { className: "mono px-4 py-2 text-right text-sm text-runway", children: fmtPax(v.paxForMe) }),
            /* @__PURE__ */ jsx("td", { className: "mono px-4 py-2 text-right text-xs text-muted-foreground", children: fmtPax(v.paxForVisitor) }),
            /* @__PURE__ */ jsxs("td", { className: "mono px-4 py-2 text-right text-xs", children: [
              /* @__PURE__ */ jsx("span", { className: "text-instrument", children: fmtPax(v.paxForMe7d) }),
              /* @__PURE__ */ jsxs("span", { className: "text-muted-foreground", children: [
                " / ",
                fmtPax(v.paxForVisitor7d)
              ] })
            ] }),
            /* @__PURE__ */ jsx("td", { className: "px-4 py-2", children: /* @__PURE__ */ jsx("div", { className: "flex flex-wrap gap-1", children: v.airports.slice(0, 6).map((a) => /* @__PURE__ */ jsxs("span", { className: "mono rounded bg-secondary px-1.5 py-0.5 text-[10px]", title: `${a.visits} visits · ${fmtPax(a.paxForMe)} PAX for me`, children: [
              a.icao,
              "·",
              a.visits
            ] }, a.icao)) }) }),
            /* @__PURE__ */ jsx("td", { className: "mono px-4 py-2 text-[10px] text-muted-foreground", children: v.lastSeenAt.slice(0, 10) })
          ] }, v.handle)),
          topByPaxForMe.length === 0 && !history.isLoading && /* @__PURE__ */ jsx("tr", { children: /* @__PURE__ */ jsx("td", { colSpan: 8, className: "px-4 py-6 text-center text-xs text-muted-foreground", children: "No third-party flights found in the sampled window." }) })
        ] })
      ] }) })
    ] }),
    /* @__PURE__ */ jsxs("section", { className: "mb-8", children: [
      /* @__PURE__ */ jsx("h2", { className: "font-display mb-3 text-lg font-semibold", children: "Top live visitors (right now)" }),
      /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3", children: [
        topLive.length === 0 && /* @__PURE__ */ jsx("div", { className: "panel rounded-xl p-5 text-sm text-muted-foreground", children: "No live visitors at your airports right now." }),
        topLive.map((p) => /* @__PURE__ */ jsxs(Link, { to: "/players/$handle", params: {
          handle: p.handle
        }, className: "panel block rounded-xl p-4 transition-colors hover:bg-secondary/40", children: [
          /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between", children: [
            /* @__PURE__ */ jsxs("div", { className: "font-display truncate text-base font-semibold", children: [
              "@",
              p.handle
            ] }),
            /* @__PURE__ */ jsxs("div", { className: "mono rounded bg-runway/15 px-2 py-0.5 text-xs text-runway", children: [
              p.visits,
              " live"
            ] })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "mono mt-2 text-[11px] uppercase tracking-widest text-muted-foreground", children: [
            "Touching: ",
            [...p.airports].join(", ")
          ] })
        ] }, p.handle))
      ] })
    ] }),
    /* @__PURE__ */ jsxs("section", { children: [
      /* @__PURE__ */ jsx("h2", { className: "font-display mb-3 text-lg font-semibold", children: "Per-airport visitor feed" }),
      /* @__PURE__ */ jsx("div", { className: "grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3", children: airports.map((a, i) => {
        const q = liveQueries[i];
        const visitorsLive = q.data ?? [];
        const sample = history.data?.scannedAirports.find((x) => x.icao === a.icao);
        return /* @__PURE__ */ jsxs("div", { className: "panel rounded-xl p-4", children: [
          /* @__PURE__ */ jsxs("div", { className: "mb-3 flex items-center justify-between", children: [
            /* @__PURE__ */ jsxs("div", { children: [
              /* @__PURE__ */ jsx("div", { className: "mono text-[11px] uppercase tracking-widest text-runway", children: a.icao }),
              /* @__PURE__ */ jsx("div", { className: "font-display text-sm font-semibold", children: a.name })
            ] }),
            /* @__PURE__ */ jsx("div", { className: "mono rounded bg-secondary px-2 py-1 text-xs", children: q.isLoading ? "…" : `${visitorsLive.length} live` })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "mb-2 mono text-[10px] uppercase tracking-widest text-muted-foreground", children: [
            "Lifetime PAX: ",
            formatNumber(Math.round(a.totalEarnedPax)),
            sample && /* @__PURE__ */ jsxs("span", { className: "ml-2", children: [
              "· ",
              sample.totalLandings,
              " land / ",
              sample.totalTakeoffs,
              " takeoff"
            ] })
          ] }),
          visitorsLive.length === 0 ? /* @__PURE__ */ jsx("div", { className: "text-xs text-muted-foreground", children: "No live visitors." }) : /* @__PURE__ */ jsx("ul", { className: "space-y-1.5 text-xs", children: visitorsLive.slice(0, 8).map((v) => /* @__PURE__ */ jsxs("li", { className: "flex items-center justify-between gap-2", children: [
            /* @__PURE__ */ jsxs(Link, { to: "/players/$handle", params: {
              handle: v.username
            }, className: "truncate font-display font-medium hover:text-runway", children: [
              "@",
              v.username
            ] }),
            /* @__PURE__ */ jsxs("span", { className: "mono shrink-0 text-[10px] text-muted-foreground", children: [
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
  Community as component
};
