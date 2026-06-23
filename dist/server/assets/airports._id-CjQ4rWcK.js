import { jsxs, jsx } from "react/jsx-runtime";
import { notFound, Link } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions, useQuery } from "@tanstack/react-query";
import { u as useServerFn, A as AppShell, P as PageHeader, T as TierPill, S as StatCard, f as formatNumber, R as RotationCell, r as relativeTime } from "./app-shell-WR70AMg9.js";
import { h as Route, g as getSimflyPayload, a as getAirportVisitors } from "./router-CWBWKmOn.js";
import { u as useSimflyArgs } from "./viewed-user-CKu9yEli.js";
import { ArrowLeft, Coins, TrendingUp, Users, Percent } from "lucide-react";
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
function AirportDetail() {
  const {
    id
  } = Route.useParams();
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
  const a = data.airports.find((x) => x.icao === id);
  if (!a) throw notFound();
  const visitorsQ = useQuery({
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
  });
  const visitors = visitorsQ.data ?? [];
  const myFlightsHere = data.flights.filter((f) => f.departure === a.icao || f.destination === a.icao).slice(0, 20);
  return /* @__PURE__ */ jsxs(AppShell, { children: [
    /* @__PURE__ */ jsxs(Link, { to: "/airports", className: "mono mb-4 inline-flex items-center gap-1 text-[11px] uppercase tracking-widest text-muted-foreground hover:text-foreground", children: [
      /* @__PURE__ */ jsx(ArrowLeft, { className: "h-3 w-3" }),
      " All airports"
    ] }),
    /* @__PURE__ */ jsx(PageHeader, { eyebrow: a.icao, title: a.name, description: `${a.country} · ${a.tierLabel}`, actions: /* @__PURE__ */ jsx(TierPill, { tier: a.tier, label: a.tierLabel }) }),
    /* @__PURE__ */ jsxs("section", { className: "grid grid-cols-2 gap-4 lg:grid-cols-4", children: [
      /* @__PURE__ */ jsx(StatCard, { label: "Lifetime PAX", value: formatNumber(Math.round(a.totalEarnedPax)), icon: Coins, hint: `${formatNumber(Math.round(a.pax7d))} in 7d` }),
      /* @__PURE__ */ jsx(StatCard, { label: "Level", value: `L${a.level}`, hint: `${Math.round(a.levelProgress)}% to next`, icon: TrendingUp }),
      /* @__PURE__ */ jsx(StatCard, { label: "Rotation", value: `${a.rotation}/${a.maxRotation}`, hint: /* @__PURE__ */ jsx(RotationCell, { rotation: a.rotation, max: a.maxRotation }), icon: Users }),
      /* @__PURE__ */ jsx(StatCard, { label: "Owner cut", value: `${a.percToUser}%`, hint: `${a.totalRotations} lifetime rotations`, icon: Percent })
    ] }),
    /* @__PURE__ */ jsxs("section", { className: "mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2", children: [
      /* @__PURE__ */ jsxs("div", { className: "panel rounded-xl p-5", children: [
        /* @__PURE__ */ jsxs("div", { className: "mb-3 flex items-center justify-between", children: [
          /* @__PURE__ */ jsx("h2", { className: "font-display text-lg font-semibold", children: "Live visitors" }),
          /* @__PURE__ */ jsx("div", { className: "mono rounded bg-runway/15 px-2 py-1 text-xs text-runway", children: visitorsQ.isLoading ? "…" : `${visitors.length} now` })
        ] }),
        visitors.length === 0 ? /* @__PURE__ */ jsx("p", { className: "text-sm text-muted-foreground", children: "No live visitors right now." }) : /* @__PURE__ */ jsx("ul", { className: "space-y-2", children: visitors.map((v) => /* @__PURE__ */ jsxs("li", { className: "flex items-center justify-between gap-3 text-sm", children: [
          /* @__PURE__ */ jsxs(Link, { to: "/players/$handle", params: {
            handle: v.username
          }, className: "font-display truncate font-medium hover:text-runway", children: [
            "@",
            v.username
          ] }),
          /* @__PURE__ */ jsxs("span", { className: "mono shrink-0 text-[11px] text-muted-foreground", children: [
            v.origin,
            "→",
            v.destination,
            " · ",
            v.aircraftICAO,
            " · ",
            v.sim
          ] })
        ] }, v.id)) })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "panel rounded-xl p-5", children: [
        /* @__PURE__ */ jsx("h2", { className: "font-display mb-3 text-lg font-semibold", children: "My recent flights here" }),
        myFlightsHere.length === 0 ? /* @__PURE__ */ jsxs("p", { className: "text-sm text-muted-foreground", children: [
          "No recent flights to or from ",
          a.icao,
          "."
        ] }) : /* @__PURE__ */ jsx("ul", { className: "space-y-2 text-sm", children: myFlightsHere.map((f) => /* @__PURE__ */ jsxs("li", { className: "flex items-center justify-between gap-3", children: [
          /* @__PURE__ */ jsxs("span", { className: "mono text-runway", children: [
            f.departure,
            " → ",
            f.destination
          ] }),
          /* @__PURE__ */ jsxs("span", { className: "mono text-[11px] text-muted-foreground", children: [
            relativeTime(f.ts),
            " · +",
            f.pax.toFixed(2),
            " PAX"
          ] })
        ] }, f.id)) })
      ] })
    ] }),
    /* @__PURE__ */ jsx("a", { href: `https://simfly.io/assets/airport/${a.icao}/details`, target: "_blank", rel: "noreferrer", className: "mono mt-6 inline-block text-[11px] uppercase tracking-widest text-runway hover:underline", children: "Open on simfly.io →" })
  ] });
}
export {
  AirportDetail as component
};
