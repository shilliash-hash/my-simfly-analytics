import { jsxs, jsx } from "react/jsx-runtime";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { u as useServerFn, A as AppShell, P as PageHeader, T as TierPill, f as formatNumber, R as RotationCell } from "./app-shell-WR70AMg9.js";
import { useState } from "react";
import { g as getSimflyPayload } from "./router-CWBWKmOn.js";
import { u as useSimflyArgs } from "./viewed-user-CKu9yEli.js";
import { X, Plus } from "lucide-react";
import "@tanstack/react-router";
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
function Compare() {
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
  const [selected, setSelected] = useState([...data.airports].sort((a, b) => b.totalEarnedPax - a.totalEarnedPax).slice(0, 3).map((a) => a.icao));
  const airports = selected.map((id) => data.airports.find((h) => h.icao === id)).filter((a) => !!a);
  return /* @__PURE__ */ jsxs(AppShell, { children: [
    /* @__PURE__ */ jsx(PageHeader, { eyebrow: "Side-by-side", title: "Compare hubs", description: "Pick up to 4 airports and benchmark them across tier, level and PAX flow." }),
    /* @__PURE__ */ jsxs("div", { className: "panel mb-6 flex flex-wrap items-center gap-2 rounded-xl p-3", children: [
      /* @__PURE__ */ jsx("span", { className: "mono mr-2 text-[11px] uppercase tracking-widest text-muted-foreground", children: "Available:" }),
      data.airports.map((h) => {
        const on = selected.includes(h.icao);
        const disabled = !on && selected.length >= 4;
        return /* @__PURE__ */ jsxs("button", { disabled, onClick: () => setSelected((s) => on ? s.filter((x) => x !== h.icao) : [...s, h.icao]), className: `mono rounded px-2 py-1 text-[11px] uppercase tracking-widest transition-colors ${on ? "bg-primary text-primary-foreground" : disabled ? "cursor-not-allowed bg-secondary/40 text-muted-foreground/40" : "bg-secondary text-muted-foreground hover:text-foreground"}`, children: [
          on ? /* @__PURE__ */ jsx(X, { className: "mr-1 inline h-3 w-3" }) : /* @__PURE__ */ jsx(Plus, { className: "mr-1 inline h-3 w-3" }),
          h.icao
        ] }, h.icao);
      })
    ] }),
    airports.length === 0 ? /* @__PURE__ */ jsx("p", { className: "text-sm text-muted-foreground", children: "Pick at least one airport to compare." }) : /* @__PURE__ */ jsx("div", { className: "panel overflow-x-auto rounded-xl", children: /* @__PURE__ */ jsxs("table", { className: "w-full text-sm", children: [
      /* @__PURE__ */ jsx("thead", { className: "mono bg-secondary/40 text-[10px] uppercase tracking-widest text-muted-foreground", children: /* @__PURE__ */ jsxs("tr", { children: [
        /* @__PURE__ */ jsx("th", { className: "px-4 py-3 text-left", children: "Metric" }),
        airports.map((a) => /* @__PURE__ */ jsxs("th", { className: "px-4 py-3 text-left", children: [
          /* @__PURE__ */ jsx("div", { className: "text-runway", children: a.icao }),
          /* @__PURE__ */ jsx("div", { className: "font-display mt-0.5 text-sm font-semibold normal-case tracking-normal text-foreground", children: a.name })
        ] }, a.icao))
      ] }) }),
      /* @__PURE__ */ jsxs("tbody", { children: [
        /* @__PURE__ */ jsx(Row, { label: "Tier", hubs: airports, render: (a) => /* @__PURE__ */ jsx(TierPill, { tier: a.tier, label: a.tierLabel }) }),
        /* @__PURE__ */ jsx(Row, { label: "Level", hubs: airports, mono: true, best: (a) => a.level, render: (a) => /* @__PURE__ */ jsxs("span", { children: [
          "L",
          a.level,
          " ",
          /* @__PURE__ */ jsxs("span", { className: "text-[10px] text-muted-foreground", children: [
            Math.round(a.levelProgress),
            "% to next"
          ] })
        ] }) }),
        /* @__PURE__ */ jsx(Row, { label: "Lifetime PAX", hubs: airports, mono: true, best: (a) => a.totalEarnedPax, render: (a) => formatNumber(Math.round(a.totalEarnedPax)) }),
        /* @__PURE__ */ jsx(Row, { label: "PAX / week (avg 30d)", hubs: airports, mono: true, best: (a) => a.pax30d, render: (a) => formatNumber(Math.round(a.pax30d * 7 / 30)) }),
        /* @__PURE__ */ jsx(Row, { label: "PAX last 7d", hubs: airports, mono: true, best: (a) => a.pax7d, render: (a) => formatNumber(Math.round(a.pax7d)) }),
        /* @__PURE__ */ jsx(Row, { label: "Rotation", hubs: airports, render: (a) => /* @__PURE__ */ jsx(RotationCell, { rotation: a.rotation, max: a.maxRotation }) }),
        /* @__PURE__ */ jsx(Row, { label: "Owner cut", hubs: airports, mono: true, best: (a) => a.percToUser, render: (a) => `${a.percToUser}%` }),
        /* @__PURE__ */ jsx(Row, { label: "Owner", hubs: airports, render: () => `@${data.me.handle}` })
      ] })
    ] }) })
  ] });
}
function Row({
  label,
  hubs,
  render,
  mono,
  best
}) {
  const max = best ? Math.max(...hubs.map(best)) : null;
  return /* @__PURE__ */ jsxs("tr", { className: "border-t border-border", children: [
    /* @__PURE__ */ jsx("td", { className: "mono px-4 py-3 text-[11px] uppercase tracking-widest text-muted-foreground", children: label }),
    hubs.map((a) => {
      const isBest = best && best(a) === max && max !== 0;
      return /* @__PURE__ */ jsx("td", { className: `px-4 py-3 ${mono ? "mono" : ""} ${isBest ? "text-runway" : ""}`, children: render(a) }, a.icao);
    })
  ] });
}
export {
  Compare as component
};
