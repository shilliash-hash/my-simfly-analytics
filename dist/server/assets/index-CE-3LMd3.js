import { jsxs, jsx } from "react/jsx-runtime";
import { Link } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions, useQuery } from "@tanstack/react-query";
import { u as useServerFn, A as AppShell, P as PageHeader, S as StatCard, f as formatNumber, r as relativeTime, T as TierPill, R as RotationCell } from "./app-shell-WR70AMg9.js";
import { useMemo, useState } from "react";
import { g as getSimflyPayload, e as getMyHubsIncomingTraffic, c as getMyLiveFlights } from "./router-CWBWKmOn.js";
import { u as useSimflyArgs, s as setViewedUser } from "./viewed-user-CKu9yEli.js";
import { Wallet, Coins, Trophy, Plane, Building2, ArrowUpRight, UserCog, X, Radio, PlaneLanding, PlaneTakeoff } from "lucide-react";
import { ResponsiveContainer, AreaChart, CartesianGrid, XAxis, YAxis, Tooltip, Area } from "recharts";
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
function Overview() {
  const fn = useServerFn(getSimflyPayload);
  const {
    keyTag,
    payload,
    username: viewedUser
  } = useSimflyArgs();
  const {
    data
  } = useSuspenseQuery(queryOptions({
    queryKey: ["simfly", keyTag],
    queryFn: () => fn(payload ? {
      data: payload
    } : void 0),
    staleTime: 3e4
  }));
  const trafficFn = useServerFn(getMyHubsIncomingTraffic);
  const myFlightsFn = useServerFn(getMyLiveFlights);
  const icaos = useMemo(() => Array.from(new Set(data.airports.map((a) => a.icao).filter(Boolean))), [data.airports]);
  const {
    data: hubTraffic = []
  } = useQuery({
    queryKey: ["simfly", "hubTraffic", keyTag, icaos],
    queryFn: () => trafficFn({
      data: {
        icaos,
        ...viewedUser ? {
          username: viewedUser
        } : {}
      }
    }),
    enabled: icaos.length > 0,
    refetchInterval: 6e4,
    staleTime: 3e4
  });
  const {
    data: myFlights = []
  } = useQuery({
    queryKey: ["simfly", "myLiveFlights", keyTag, icaos],
    queryFn: () => myFlightsFn({
      data: {
        icaos,
        ...viewedUser ? {
          username: viewedUser
        } : {}
      }
    }),
    enabled: icaos.length > 0,
    refetchInterval: 6e4,
    staleTime: 3e4
  });
  return /* @__PURE__ */ jsxs(AppShell, { children: [
    /* @__PURE__ */ jsx(PageHeader, { eyebrow: viewedUser ? `Viewing pilot @${viewedUser}` : "Welcome back", title: `Captain ${data.me.displayName}`, description: "Real-time intelligence on your SimFly.io operations — PAX-first.", actions: /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3", children: [
      /* @__PURE__ */ jsx(PilotSwitcher, { current: viewedUser }),
      data.me.avatarUrl ? /* @__PURE__ */ jsx("img", { src: data.me.avatarUrl, alt: `@${data.me.handle} avatar`, width: 64, height: 64, className: "h-16 w-16 rounded-full border border-border/40 object-cover shadow-lg" }) : null
    ] }) }),
    /* @__PURE__ */ jsxs("section", { className: "grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6", children: [
      /* @__PURE__ */ jsx(StatCard, { label: "Available PAX", value: formatNumber(Math.round(data.availablePax)), hint: `${formatNumber(data.lifetimePax)} lifetime`, icon: Wallet }),
      /* @__PURE__ */ jsx(StatCard, { label: "PAX last 7d", value: formatNumber(data.paxLast7d), hint: "Earned this week", icon: Coins }),
      /* @__PURE__ */ jsx(StatCard, { label: "PAX last 30d", value: formatNumber(data.paxLast30d), hint: "Earned this month", icon: Coins }),
      /* @__PURE__ */ jsx(StatCard, { label: "Pilot level", value: `L${data.level}`, hint: `${formatNumber(data.xp)} XP`, icon: Trophy }),
      /* @__PURE__ */ jsx(StatCard, { label: "Aircraft", value: String(data.airplanes.length), hint: `${data.airplanes.filter((a) => !a.inGroundOperation).length} ready`, icon: Plane }),
      /* @__PURE__ */ jsx(StatCard, { label: "Hubs", value: String(data.airports.length), hint: "Owned airports", icon: Building2 })
    ] }),
    /* @__PURE__ */ jsx(IncomingTraffic, { traffic: hubTraffic, myFlights, airports: data.airports }),
    /* @__PURE__ */ jsxs("section", { className: "mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3", children: [
      /* @__PURE__ */ jsxs("div", { className: "panel rounded-xl p-5 lg:col-span-2", children: [
        /* @__PURE__ */ jsxs("div", { className: "mb-4 flex items-end justify-between", children: [
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("h2", { className: "font-display text-lg font-semibold", children: "PAX earnings · 30 days" }),
            /* @__PURE__ */ jsxs("p", { className: "text-xs text-muted-foreground", children: [
              "Daily token income · ",
              /* @__PURE__ */ jsx("span", { className: "text-runway", children: "cyan" }),
              " your flights ·",
              " ",
              /* @__PURE__ */ jsx("span", { style: {
                color: "var(--instrument)"
              }, children: "amber" }),
              " visitor traffic to your hubs"
            ] })
          ] }),
          /* @__PURE__ */ jsx(Link, { to: "/stats", className: "mono text-[11px] uppercase tracking-widest text-runway hover:underline", children: "All stats →" })
        ] }),
        /* @__PURE__ */ jsx("div", { className: "h-64 w-full", children: /* @__PURE__ */ jsx(ResponsiveContainer, { children: /* @__PURE__ */ jsxs(AreaChart, { data: data.earningsTimeseries, margin: {
          left: -10,
          right: 6,
          top: 6,
          bottom: 0
        }, children: [
          /* @__PURE__ */ jsxs("defs", { children: [
            /* @__PURE__ */ jsxs("linearGradient", { id: "gradPax", x1: "0", y1: "0", x2: "0", y2: "1", children: [
              /* @__PURE__ */ jsx("stop", { offset: "0%", stopColor: "var(--runway)", stopOpacity: 0.5 }),
              /* @__PURE__ */ jsx("stop", { offset: "100%", stopColor: "var(--runway)", stopOpacity: 0 })
            ] }),
            /* @__PURE__ */ jsxs("linearGradient", { id: "gradVisitors", x1: "0", y1: "0", x2: "0", y2: "1", children: [
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
          }, formatter: (v, name) => [formatNumber(v) + " PAX", name === "paxVisitors" ? "Visitor PAX" : "Your PAX"] }),
          /* @__PURE__ */ jsx(Area, { type: "monotone", dataKey: "pax", name: "paxKept", stroke: "var(--runway)", strokeWidth: 2, fill: "url(#gradPax)" }),
          /* @__PURE__ */ jsx(Area, { type: "monotone", dataKey: "paxVisitors", name: "paxVisitors", stroke: "var(--instrument)", strokeWidth: 2, fill: "url(#gradVisitors)" })
        ] }) }) })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "panel rounded-xl p-5", children: [
        /* @__PURE__ */ jsxs("div", { className: "mb-3 flex items-center justify-between", children: [
          /* @__PURE__ */ jsx("h2", { className: "font-display text-lg font-semibold", children: "Recent flights" }),
          /* @__PURE__ */ jsx(Link, { to: "/activity", className: "mono text-[11px] uppercase tracking-widest text-runway hover:underline", children: "All →" })
        ] }),
        /* @__PURE__ */ jsx("ul", { className: "space-y-3", children: data.activity.slice(0, 8).map((a) => {
          const isVisitor = a.message.startsWith("(Visitor)");
          return /* @__PURE__ */ jsxs("li", { className: "flex items-start gap-3 text-sm", children: [
            /* @__PURE__ */ jsx(ArrowUpRight, { className: `mt-0.5 h-4 w-4 shrink-0 ${isVisitor ? "" : "text-runway"}`, style: isVisitor ? {
              color: "var(--instrument)"
            } : void 0 }),
            /* @__PURE__ */ jsxs("div", { className: "min-w-0 flex-1", children: [
              /* @__PURE__ */ jsxs("div", { className: "truncate", children: [
                isVisitor && /* @__PURE__ */ jsx("span", { className: "mono mr-1.5 rounded-sm px-1 py-px text-[9px] font-semibold uppercase tracking-widest", style: {
                  background: "color-mix(in oklab, var(--instrument) 18%, transparent)",
                  color: "var(--instrument)"
                }, children: "Visitor" }),
                isVisitor ? a.message.replace(/^\(Visitor\)\s*/, "") : a.message
              ] }),
              /* @__PURE__ */ jsxs("div", { className: "mono mt-0.5 text-[10px] uppercase tracking-widest text-muted-foreground", children: [
                relativeTime(a.at),
                a.delta ? ` · +${a.delta.toFixed(2)} PAX` : ""
              ] })
            ] })
          ] }, a.id);
        }) })
      ] })
    ] }),
    /* @__PURE__ */ jsxs("section", { className: "mt-8", children: [
      /* @__PURE__ */ jsxs("div", { className: "mb-3 flex items-end justify-between", children: [
        /* @__PURE__ */ jsx("h2", { className: "font-display text-xl font-semibold", children: "Your top hubs" }),
        /* @__PURE__ */ jsx(Link, { to: "/airports", className: "mono text-[11px] uppercase tracking-widest text-runway hover:underline", children: "All airports →" })
      ] }),
      /* @__PURE__ */ jsx("div", { className: "grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3", children: [...data.airports].sort((a, b) => b.totalEarnedPax - a.totalEarnedPax).slice(0, 6).map((a) => /* @__PURE__ */ jsxs(Link, { to: "/airports/$id", params: {
        id: a.icao
      }, className: "panel group block rounded-xl p-5 transition-colors hover:bg-secondary/40", children: [
        /* @__PURE__ */ jsxs("div", { className: "flex items-start justify-between gap-3", children: [
          /* @__PURE__ */ jsxs("div", { className: "min-w-0", children: [
            /* @__PURE__ */ jsx("div", { className: "mono text-[11px] uppercase tracking-widest text-runway", children: a.icao }),
            /* @__PURE__ */ jsx("div", { className: "font-display mt-1 truncate text-lg font-semibold", children: a.name }),
            /* @__PURE__ */ jsxs("div", { className: "text-xs text-muted-foreground", children: [
              a.country,
              " · L",
              a.level
            ] })
          ] }),
          /* @__PURE__ */ jsx(TierPill, { tier: a.tier, label: a.tierLabel })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "mt-4 grid grid-cols-3 gap-3 border-t border-border pt-4 text-xs", children: [
          /* @__PURE__ */ jsx(Stat, { label: "Lifetime PAX", value: formatNumber(Math.round(a.totalEarnedPax)) }),
          /* @__PURE__ */ jsx(Stat, { label: "PAX 7d", value: formatNumber(Math.round(a.pax7d)) }),
          /* @__PURE__ */ jsx(Stat, { label: "Rotation", value: "", custom: /* @__PURE__ */ jsx(RotationCell, { rotation: a.rotation, max: a.maxRotation }) })
        ] })
      ] }, a.icao)) })
    ] })
  ] });
}
function Stat({
  label,
  value,
  custom
}) {
  return /* @__PURE__ */ jsxs("div", { children: [
    /* @__PURE__ */ jsx("div", { className: "mono text-[10px] uppercase tracking-widest text-muted-foreground", children: label }),
    /* @__PURE__ */ jsx("div", { className: "font-display mt-0.5 text-base font-semibold", children: custom ?? value })
  ] });
}
function IncomingTraffic({
  traffic,
  myFlights,
  airports
}) {
  const airportByIcao = useMemo(() => {
    const m = /* @__PURE__ */ new Map();
    for (const a of airports) m.set(a.icao.toUpperCase(), a);
    return m;
  }, [airports]);
  const myByHub = useMemo(() => {
    const m = /* @__PURE__ */ new Map();
    const ensure = (icao) => {
      const k = icao.toUpperCase();
      if (!m.has(k)) m.set(k, {
        inbound: [],
        outbound: []
      });
      return m.get(k);
    };
    for (const f of myFlights) {
      if (f.origin && airportByIcao.has(f.origin.toUpperCase())) ensure(f.origin).outbound.push(f);
      if (f.destination && airportByIcao.has(f.destination.toUpperCase())) ensure(f.destination).inbound.push(f);
    }
    return m;
  }, [myFlights, airportByIcao]);
  const active = useMemo(() => {
    const hubIcaos = /* @__PURE__ */ new Set([...traffic.map((t) => t.icao.toUpperCase()), ...Array.from(myByHub.keys())]);
    return Array.from(hubIcaos).map((icao) => {
      const airport = airportByIcao.get(icao);
      const visitors = traffic.find((t) => t.icao.toUpperCase() === icao)?.visitors ?? [];
      const mine = myByHub.get(icao) ?? {
        inbound: [],
        outbound: []
      };
      return airport ? {
        icao,
        airport,
        visitors,
        mine
      } : null;
    }).filter((r) => !!r).sort((a, b) => b.visitors.length + b.mine.inbound.length + b.mine.outbound.length - (a.visitors.length + a.mine.inbound.length + a.mine.outbound.length));
  }, [traffic, myByHub, airportByIcao]);
  const totalVisitors = active.reduce((s, t) => s + t.visitors.length, 0);
  const totalMine = active.reduce((s, t) => s + t.mine.inbound.length + t.mine.outbound.length, 0);
  return /* @__PURE__ */ jsxs("section", { className: "mt-8", children: [
    /* @__PURE__ */ jsxs("div", { className: "mb-3 flex items-end justify-between", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsx(Radio, { className: `h-4 w-4 ${active.length ? "animate-pulse text-runway" : "text-muted-foreground"}` }),
        /* @__PURE__ */ jsx("h2", { className: "font-display text-xl font-semibold", children: "Incoming traffic" }),
        /* @__PURE__ */ jsx("span", { className: "mono text-[10px] uppercase tracking-widest text-muted-foreground", children: active.length ? `${totalVisitors} visitor${totalVisitors === 1 ? "" : "s"} · ${totalMine} of mine · ${active.length} hub${active.length === 1 ? "" : "s"}` : "No live traffic right now" })
      ] }),
      /* @__PURE__ */ jsx(Link, { to: "/airports", className: "mono text-[11px] uppercase tracking-widest text-runway hover:underline", children: "All airports →" })
    ] }),
    active.length === 0 ? /* @__PURE__ */ jsx("div", { className: "panel rounded-xl p-6 text-sm text-muted-foreground", children: "No other pilots are currently flying to or from your hubs, and you have no aircraft airborne. Traffic appears here as it happens." }) : /* @__PURE__ */ jsx("div", { className: "grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3", children: active.map(({
      airport: a,
      visitors,
      mine
    }) => {
      const mineTotal = mine.inbound.length + mine.outbound.length;
      return /* @__PURE__ */ jsxs(Link, { to: "/airports/$id", params: {
        id: a.icao
      }, className: "panel group block rounded-xl p-5 transition-colors hover:bg-secondary/40", children: [
        /* @__PURE__ */ jsxs("div", { className: "flex items-start justify-between gap-3", children: [
          /* @__PURE__ */ jsxs("div", { className: "min-w-0", children: [
            /* @__PURE__ */ jsx("div", { className: "mono text-[11px] uppercase tracking-widest text-runway", children: a.icao }),
            /* @__PURE__ */ jsx("div", { className: "font-display mt-1 truncate text-lg font-semibold", children: a.name }),
            /* @__PURE__ */ jsxs("div", { className: "text-xs text-muted-foreground", children: [
              a.country,
              " · L",
              a.level
            ] })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "flex flex-col items-end gap-2", children: [
            /* @__PURE__ */ jsx(TierPill, { tier: a.tier, label: a.tierLabel }),
            /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap items-center justify-end gap-1", children: [
              visitors.length > 0 && /* @__PURE__ */ jsxs("span", { className: "mono inline-flex items-center gap-1 rounded-full border border-runway/40 bg-runway/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-runway", children: [
                /* @__PURE__ */ jsx("span", { className: "h-1.5 w-1.5 animate-pulse rounded-full bg-runway shadow-[0_0_8px_var(--runway)]" }),
                visitors.length,
                " visitor",
                visitors.length === 1 ? "" : "s"
              ] }),
              mineTotal > 0 && /* @__PURE__ */ jsxs("span", { className: "mono inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest", style: {
                borderColor: "color-mix(in oklab, var(--instrument) 45%, transparent)",
                background: "color-mix(in oklab, var(--instrument) 12%, transparent)",
                color: "var(--instrument)"
              }, children: [
                /* @__PURE__ */ jsx("span", { className: "h-1.5 w-1.5 animate-pulse rounded-full", style: {
                  background: "var(--instrument)",
                  boxShadow: "0 0 8px var(--instrument)"
                } }),
                mineTotal,
                " mine"
              ] })
            ] })
          ] })
        ] }),
        /* @__PURE__ */ jsxs("ul", { className: "mt-4 space-y-2 border-t border-border pt-3", children: [
          mine.inbound.slice(0, 2).map((f) => /* @__PURE__ */ jsxs("li", { className: "flex items-center gap-2 text-xs", children: [
            /* @__PURE__ */ jsx("div", { className: "h-6 w-6 shrink-0 rounded-full border", style: {
              borderColor: "color-mix(in oklab, var(--instrument) 45%, transparent)",
              background: "color-mix(in oklab, var(--instrument) 12%, transparent)"
            } }),
            /* @__PURE__ */ jsxs("div", { className: "min-w-0 flex-1", children: [
              /* @__PURE__ */ jsx("div", { className: "truncate font-medium", style: {
                color: "var(--instrument)"
              }, children: "You · Inbound" }),
              /* @__PURE__ */ jsxs("div", { className: "mono truncate text-[10px] uppercase tracking-widest text-muted-foreground", children: [
                f.aircraftICAO,
                " · ",
                f.origin ?? "—",
                " → ",
                f.destination ?? "—"
              ] })
            ] }),
            /* @__PURE__ */ jsx(PlaneLanding, { className: "h-3.5 w-3.5 shrink-0", style: {
              color: "var(--instrument)"
            } })
          ] }, `mi-${f.id}`)),
          mine.outbound.slice(0, 2).map((f) => /* @__PURE__ */ jsxs("li", { className: "flex items-center gap-2 text-xs", children: [
            /* @__PURE__ */ jsx("div", { className: "h-6 w-6 shrink-0 rounded-full border", style: {
              borderColor: "color-mix(in oklab, var(--instrument) 45%, transparent)",
              background: "color-mix(in oklab, var(--instrument) 12%, transparent)"
            } }),
            /* @__PURE__ */ jsxs("div", { className: "min-w-0 flex-1", children: [
              /* @__PURE__ */ jsx("div", { className: "truncate font-medium", style: {
                color: "var(--instrument)"
              }, children: "You · Outbound" }),
              /* @__PURE__ */ jsxs("div", { className: "mono truncate text-[10px] uppercase tracking-widest text-muted-foreground", children: [
                f.aircraftICAO,
                " · ",
                f.origin ?? "—",
                " → ",
                f.destination ?? "—"
              ] })
            ] }),
            /* @__PURE__ */ jsx(PlaneTakeoff, { className: "h-3.5 w-3.5 shrink-0", style: {
              color: "var(--instrument)"
            } })
          ] }, `mo-${f.id}`)),
          visitors.slice(0, 4).map((v) => {
            const arriving = v.destination?.toUpperCase() === a.icao.toUpperCase();
            return /* @__PURE__ */ jsxs("li", { className: "flex items-center gap-2 text-xs", children: [
              v.userAvatar ? /* @__PURE__ */ jsx("img", { src: v.userAvatar, alt: "", className: "h-6 w-6 shrink-0 rounded-full border border-border/40 object-cover" }) : /* @__PURE__ */ jsx("div", { className: "h-6 w-6 shrink-0 rounded-full border border-border/40 bg-secondary/40" }),
              /* @__PURE__ */ jsxs("div", { className: "min-w-0 flex-1", children: [
                /* @__PURE__ */ jsxs("div", { className: "truncate font-medium", children: [
                  "@",
                  v.username
                ] }),
                /* @__PURE__ */ jsxs("div", { className: "mono truncate text-[10px] uppercase tracking-widest text-muted-foreground", children: [
                  v.aircraftICAO,
                  " · ",
                  v.origin ?? "—",
                  " → ",
                  v.destination ?? "—"
                ] })
              ] }),
              arriving ? /* @__PURE__ */ jsx(PlaneLanding, { className: "h-3.5 w-3.5 shrink-0 text-runway" }) : /* @__PURE__ */ jsx(PlaneTakeoff, { className: "h-3.5 w-3.5 shrink-0 text-muted-foreground" })
            ] }, v.id);
          }),
          visitors.length > 4 && /* @__PURE__ */ jsxs("li", { className: "mono text-[10px] uppercase tracking-widest text-muted-foreground", children: [
            "+ ",
            visitors.length - 4,
            " more"
          ] })
        ] })
      ] }, a.icao);
    }) })
  ] });
}
function PilotSwitcher({
  current
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(current ?? "");
  function apply(e) {
    e?.preventDefault();
    const v = value.trim();
    setViewedUser(v || null);
    setOpen(false);
  }
  function reset() {
    setValue("");
    setViewedUser(null);
    setOpen(false);
  }
  return /* @__PURE__ */ jsxs("div", { className: "relative", children: [
    /* @__PURE__ */ jsxs("button", { type: "button", onClick: () => setOpen((o) => !o), className: "mono inline-flex items-center gap-2 rounded-md border border-border bg-secondary/40 px-3 py-1.5 text-[11px] uppercase tracking-widest text-foreground transition hover:bg-secondary", "aria-haspopup": "dialog", "aria-expanded": open, children: [
      /* @__PURE__ */ jsx(UserCog, { className: "h-3.5 w-3.5 text-runway" }),
      "@",
      current ?? "you"
    ] }),
    open && /* @__PURE__ */ jsxs("form", { onSubmit: apply, className: "panel absolute right-0 z-30 mt-2 w-72 rounded-xl p-4 shadow-xl", children: [
      /* @__PURE__ */ jsxs("div", { className: "mb-2 flex items-center justify-between", children: [
        /* @__PURE__ */ jsx("div", { className: "mono text-[10px] uppercase tracking-widest text-runway", children: "View as pilot" }),
        /* @__PURE__ */ jsx("button", { type: "button", onClick: () => setOpen(false), className: "text-muted-foreground hover:text-foreground", children: /* @__PURE__ */ jsx(X, { className: "h-3.5 w-3.5" }) })
      ] }),
      /* @__PURE__ */ jsx("p", { className: "mb-2 text-[11px] text-muted-foreground", children: "Enter any SimFly.io username. Empty = your own account." }),
      /* @__PURE__ */ jsx("input", { autoFocus: true, value, onChange: (e) => setValue(e.target.value), placeholder: "e.g. shill", className: "mono w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-runway" }),
      /* @__PURE__ */ jsxs("div", { className: "mt-3 flex items-center justify-between gap-2", children: [
        /* @__PURE__ */ jsx("button", { type: "button", onClick: reset, className: "mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground", children: "Reset to me" }),
        /* @__PURE__ */ jsx("button", { type: "submit", className: "mono rounded-md bg-runway/20 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-widest text-runway transition hover:bg-runway/30", children: "View pilot" })
      ] })
    ] })
  ] });
}
export {
  Overview as component
};
