import { jsxs, jsx } from "react/jsx-runtime";
import { notFound, Link } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { u as useServerFn, A as AppShell, P as PageHeader, S as StatCard, f as formatNumber, r as relativeTime } from "./app-shell-WR70AMg9.js";
import { i as Route, g as getSimflyPayload } from "./router-CWBWKmOn.js";
import { u as useSimflyArgs } from "./viewed-user-CKu9yEli.js";
import { ArrowLeft, Plane, MapPin, Coins, Trophy } from "lucide-react";
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
function AircraftDetail() {
  const {
    id
  } = Route.useParams();
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
    } : void 0)
  }));
  const plane = data.airplanes.find((p) => p.aircraftId === id);
  if (!plane) throw notFound();
  const flights = data.flights.filter((f) => f.aircraftId === id).slice(0, 20);
  return /* @__PURE__ */ jsxs(AppShell, { children: [
    /* @__PURE__ */ jsxs(Link, { to: "/aircraft", className: "mono mb-4 inline-flex items-center gap-1 text-[11px] uppercase tracking-widest text-muted-foreground hover:text-foreground", children: [
      /* @__PURE__ */ jsx(ArrowLeft, { className: "h-3 w-3" }),
      " All aircraft"
    ] }),
    /* @__PURE__ */ jsx(PageHeader, { eyebrow: plane.tailNumber || plane.icao, title: plane.name, description: /* @__PURE__ */ jsxs("span", { className: "inline-flex items-center gap-2", children: [
      /* @__PURE__ */ jsx(Plane, { className: "h-4 w-4 -rotate-45" }),
      " ",
      plane.icao,
      " · based at",
      " ",
      /* @__PURE__ */ jsx(MapPin, { className: "h-3 w-3" }),
      " ",
      plane.currentIcao || "—"
    ] }) }),
    /* @__PURE__ */ jsxs("section", { className: "grid grid-cols-2 gap-4 lg:grid-cols-4", children: [
      /* @__PURE__ */ jsx(StatCard, { label: "Lifetime PAX", value: formatNumber(Math.round(plane.totalEarnedPax)), icon: Coins }),
      /* @__PURE__ */ jsx(StatCard, { label: "Lifetime XP", value: formatNumber(Math.round(plane.totalEarnedXp)), icon: Trophy }),
      /* @__PURE__ */ jsx(StatCard, { label: "Level", value: `L${plane.level}`, hint: `${Math.round(plane.levelProgress)}% to next`, icon: Trophy }),
      /* @__PURE__ */ jsx(StatCard, { label: "Status", value: plane.inGroundOperation ? "Ground op" : "Ready", hint: plane.groundedUntil ? `Until ${plane.groundedUntil.slice(0, 16).replace("T", " ")}` : "" })
    ] }),
    /* @__PURE__ */ jsxs("section", { className: "mt-8", children: [
      /* @__PURE__ */ jsxs("h2", { className: "font-display mb-3 text-xl font-semibold", children: [
        "Recent flights (",
        flights.length,
        ")"
      ] }),
      /* @__PURE__ */ jsx("div", { className: "panel overflow-hidden rounded-xl", children: /* @__PURE__ */ jsxs("table", { className: "w-full text-sm", children: [
        /* @__PURE__ */ jsx("thead", { className: "mono bg-secondary/40 text-[10px] uppercase tracking-widest text-muted-foreground", children: /* @__PURE__ */ jsxs("tr", { children: [
          /* @__PURE__ */ jsx("th", { className: "px-4 py-3 text-left", children: "Date" }),
          /* @__PURE__ */ jsx("th", { className: "px-4 py-3 text-left", children: "Route" }),
          /* @__PURE__ */ jsx("th", { className: "px-4 py-3 text-left", children: "Distance" }),
          /* @__PURE__ */ jsx("th", { className: "px-4 py-3 text-left", children: "Time" }),
          /* @__PURE__ */ jsx("th", { className: "px-4 py-3 text-left", children: "PAX" }),
          /* @__PURE__ */ jsx("th", { className: "px-4 py-3 text-left", children: "XP" })
        ] }) }),
        /* @__PURE__ */ jsxs("tbody", { children: [
          flights.map((f) => /* @__PURE__ */ jsxs("tr", { className: "border-t border-border", children: [
            /* @__PURE__ */ jsx("td", { className: "mono px-4 py-3 text-muted-foreground", children: relativeTime(f.ts) }),
            /* @__PURE__ */ jsxs("td", { className: "mono px-4 py-3 text-runway", children: [
              f.departure,
              " → ",
              f.destination
            ] }),
            /* @__PURE__ */ jsxs("td", { className: "mono px-4 py-3", children: [
              Math.round(f.distance),
              " nm"
            ] }),
            /* @__PURE__ */ jsx("td", { className: "mono px-4 py-3", children: f.flightTime }),
            /* @__PURE__ */ jsx("td", { className: "mono px-4 py-3 text-runway", children: f.pax.toFixed(2) }),
            /* @__PURE__ */ jsx("td", { className: "mono px-4 py-3", children: f.xp.toFixed(1) })
          ] }, f.id)),
          flights.length === 0 && /* @__PURE__ */ jsx("tr", { children: /* @__PURE__ */ jsx("td", { colSpan: 6, className: "px-4 py-8 text-center text-xs text-muted-foreground", children: "No recent flights for this aircraft." }) })
        ] })
      ] }) })
    ] }),
    /* @__PURE__ */ jsx("a", { href: `https://simfly.io/assets/airplane/${plane.aircraftId}/details`, target: "_blank", rel: "noreferrer", className: "mono mt-6 inline-block text-[11px] uppercase tracking-widest text-runway hover:underline", children: "Open on simfly.io →" })
  ] });
}
export {
  AircraftDetail as component
};
