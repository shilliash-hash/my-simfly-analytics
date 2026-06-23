import { jsxs, jsx } from "react/jsx-runtime";
import { notFound, Link } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { u as useServerFn, A as AppShell, S as StatCard, f as formatNumber, a as TierBadge, r as relativeTime } from "./app-shell-WR70AMg9.js";
import { R as Route, g as getSimflyPayload } from "./router-CWBWKmOn.js";
import { u as useSimflyArgs } from "./viewed-user-CKu9yEli.js";
import { ArrowLeft, Coins, Trophy, Building2, Plane } from "lucide-react";
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
function Avatar({
  hue,
  url,
  size = 40
}) {
  if (url) {
    return /* @__PURE__ */ jsx("img", { src: url, alt: "", width: size, height: size, className: "shrink-0 rounded-full border border-border/40 object-cover", style: {
      width: size,
      height: size
    } });
  }
  return /* @__PURE__ */ jsx("div", { className: "grid shrink-0 place-items-center rounded-full font-display text-sm font-semibold text-deck", style: {
    width: size,
    height: size,
    background: `linear-gradient(135deg, hsl(${hue} 80% 65%), hsl(${(hue + 40) % 360} 75% 50%))`
  }, children: "✈" });
}
function PlayerProfile() {
  const {
    handle
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
  const player = data.community.find((p) => p.handle === handle);
  if (!player) throw notFound();
  const hubs = data.hubs.filter((h) => h.ownerHandle === player.handle);
  const aircraft = data.aircraft.filter((a) => a.ownerHandle === player.handle);
  const activity = data.activity.filter((a) => a.actorHandle === player.handle).slice(0, 10);
  return /* @__PURE__ */ jsxs(AppShell, { children: [
    /* @__PURE__ */ jsxs(Link, { to: "/community", className: "mono mb-4 inline-flex items-center gap-1 text-[11px] uppercase tracking-widest text-muted-foreground hover:text-foreground", children: [
      /* @__PURE__ */ jsx(ArrowLeft, { className: "h-3 w-3" }),
      " Community"
    ] }),
    /* @__PURE__ */ jsxs("header", { className: "mb-8 flex flex-col gap-4 sm:flex-row sm:items-center", children: [
      /* @__PURE__ */ jsx(Avatar, { hue: player.avatarHue, url: player.avatarUrl, size: 64 }),
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsxs("div", { className: "mono text-[11px] uppercase tracking-[0.2em] text-runway", children: [
          "@",
          player.handle
        ] }),
        /* @__PURE__ */ jsx("h1", { className: "font-display text-3xl font-semibold tracking-tight sm:text-4xl", children: player.displayName }),
        /* @__PURE__ */ jsxs("p", { className: "text-sm text-muted-foreground", children: [
          player.country,
          " · Joined ",
          new Date(player.joinedAt).toLocaleDateString()
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxs("section", { className: "grid grid-cols-2 gap-4 lg:grid-cols-4", children: [
      /* @__PURE__ */ jsx(StatCard, { label: "PAX Tokens", value: formatNumber(player.paxTokens), icon: Coins }),
      /* @__PURE__ */ jsx(StatCard, { label: "Level / XP", value: `L${player.level}`, hint: formatNumber(player.xp) + " XP", icon: Trophy }),
      /* @__PURE__ */ jsx(StatCard, { label: "Hubs owned", value: String(hubs.length), icon: Building2 }),
      /* @__PURE__ */ jsx(StatCard, { label: "Aircraft", value: String(aircraft.length), icon: Plane })
    ] }),
    /* @__PURE__ */ jsxs("section", { className: "mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3", children: [
      /* @__PURE__ */ jsxs("div", { className: "lg:col-span-2", children: [
        /* @__PURE__ */ jsx("h2", { className: "font-display mb-3 text-xl font-semibold", children: "Owned hubs" }),
        hubs.length === 0 ? /* @__PURE__ */ jsx("p", { className: "text-sm text-muted-foreground", children: "No hubs owned yet." }) : /* @__PURE__ */ jsx("div", { className: "grid grid-cols-1 gap-3 md:grid-cols-2", children: hubs.map((h) => /* @__PURE__ */ jsxs(Link, { to: "/airports/$id", params: {
          id: h.id
        }, className: "panel block rounded-xl p-4 transition-colors hover:bg-secondary/40", children: [
          /* @__PURE__ */ jsxs("div", { className: "flex items-start justify-between", children: [
            /* @__PURE__ */ jsxs("div", { children: [
              /* @__PURE__ */ jsx("div", { className: "mono text-[11px] uppercase tracking-widest text-runway", children: h.icao }),
              /* @__PURE__ */ jsx("div", { className: "font-display text-sm font-semibold", children: h.name }),
              /* @__PURE__ */ jsx("div", { className: "text-[11px] text-muted-foreground", children: h.city })
            ] }),
            /* @__PURE__ */ jsx(TierBadge, { tier: h.tier })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "mono mt-3 flex items-center justify-between text-xs", children: [
            /* @__PURE__ */ jsxs("span", { children: [
              "L",
              h.level
            ] }),
            /* @__PURE__ */ jsxs("span", { className: "text-runway", children: [
              formatNumber(h.dailyEarnings),
              "/d"
            ] })
          ] })
        ] }, h.id)) })
      ] }),
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("h2", { className: "font-display mb-3 text-xl font-semibold", children: "Recent activity" }),
        /* @__PURE__ */ jsxs("ul", { className: "panel divide-y divide-border rounded-xl", children: [
          activity.length === 0 && /* @__PURE__ */ jsx("li", { className: "p-4 text-xs text-muted-foreground", children: "No activity yet." }),
          activity.map((a) => /* @__PURE__ */ jsxs("li", { className: "p-4 text-sm", children: [
            /* @__PURE__ */ jsx("div", { children: a.message }),
            /* @__PURE__ */ jsx("div", { className: "mono mt-1 text-[10px] uppercase tracking-widest text-muted-foreground", children: relativeTime(a.at) })
          ] }, a.id))
        ] })
      ] })
    ] })
  ] });
}
export {
  PlayerProfile as component
};
