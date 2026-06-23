import { jsxs, jsx } from "react/jsx-runtime";
import { notFound, Link } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { u as useServerFn, A as AppShell, P as PageHeader, S as StatCard, f as formatNumber, r as relativeTime } from "./app-shell-WR70AMg9.js";
import { f as Route, g as getSimflyPayload } from "./router-CWBWKmOn.js";
import { u as useSimflyArgs } from "./viewed-user-CKu9yEli.js";
import { ArrowLeft, Coins, Trophy, IdCard } from "lucide-react";
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
function LicenseDetail() {
  const {
    slug
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
  const lic = data.licenses.find((l) => l.code === slug || l.slug === slug);
  if (!lic) throw notFound();
  const flights = data.flights.filter((f) => f.licenceCode === lic.code).slice(0, 30);
  return /* @__PURE__ */ jsxs(AppShell, { children: [
    /* @__PURE__ */ jsxs(Link, { to: "/licenses", className: "mono mb-4 inline-flex items-center gap-1 text-[11px] uppercase tracking-widest text-muted-foreground hover:text-foreground", children: [
      /* @__PURE__ */ jsx(ArrowLeft, { className: "h-3 w-3" }),
      " All licenses"
    ] }),
    /* @__PURE__ */ jsx(PageHeader, { eyebrow: lic.code || lic.sku, title: lic.name, description: `${lic.rankName} · Rank #${lic.rank}` }),
    /* @__PURE__ */ jsxs("section", { className: "grid grid-cols-2 gap-4 lg:grid-cols-4", children: [
      /* @__PURE__ */ jsx(StatCard, { label: "Lifetime PAX", value: formatNumber(Math.round(lic.totalEarnedPax)), icon: Coins }),
      /* @__PURE__ */ jsx(StatCard, { label: "Lifetime XP", value: formatNumber(Math.round(lic.totalEarnedXp)), icon: Trophy }),
      /* @__PURE__ */ jsx(StatCard, { label: "Level", value: `L${lic.level}`, hint: `${Math.round(lic.levelProgress)}% to next`, icon: IdCard }),
      /* @__PURE__ */ jsx(StatCard, { label: "Recent PAX (7d)", value: formatNumber(Math.round(lic.pax7d)), hint: `${formatNumber(Math.round(lic.pax30d))} in 30d`, icon: Coins })
    ] }),
    /* @__PURE__ */ jsxs("section", { className: "mt-8", children: [
      /* @__PURE__ */ jsxs("h2", { className: "font-display mb-3 text-xl font-semibold", children: [
        "Flights on this license (",
        flights.length,
        ")"
      ] }),
      /* @__PURE__ */ jsx("div", { className: "panel overflow-hidden rounded-xl", children: /* @__PURE__ */ jsxs("table", { className: "w-full text-sm", children: [
        /* @__PURE__ */ jsx("thead", { className: "mono bg-secondary/40 text-[10px] uppercase tracking-widest text-muted-foreground", children: /* @__PURE__ */ jsxs("tr", { children: [
          /* @__PURE__ */ jsx("th", { className: "px-4 py-3 text-left", children: "Date" }),
          /* @__PURE__ */ jsx("th", { className: "px-4 py-3 text-left", children: "Route" }),
          /* @__PURE__ */ jsx("th", { className: "px-4 py-3 text-left", children: "Aircraft" }),
          /* @__PURE__ */ jsx("th", { className: "px-4 py-3 text-left", children: "Distance" }),
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
            /* @__PURE__ */ jsx("td", { className: "px-4 py-3", children: f.aircraftName }),
            /* @__PURE__ */ jsxs("td", { className: "mono px-4 py-3", children: [
              Math.round(f.distance),
              " nm"
            ] }),
            /* @__PURE__ */ jsx("td", { className: "mono px-4 py-3 text-runway", children: f.pax.toFixed(2) }),
            /* @__PURE__ */ jsx("td", { className: "mono px-4 py-3", children: f.xp.toFixed(1) })
          ] }, f.id)),
          flights.length === 0 && /* @__PURE__ */ jsx("tr", { children: /* @__PURE__ */ jsx("td", { colSpan: 6, className: "px-4 py-8 text-center text-xs text-muted-foreground", children: "No flights on this license in the recent log." }) })
        ] })
      ] }) })
    ] })
  ] });
}
export {
  LicenseDetail as component
};
