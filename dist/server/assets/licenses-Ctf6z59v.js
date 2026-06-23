import { jsxs, jsx } from "react/jsx-runtime";
import { Link } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { u as useServerFn, A as AppShell, P as PageHeader, f as formatNumber } from "./app-shell-WR70AMg9.js";
import { g as getSimflyPayload } from "./router-CWBWKmOn.js";
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
function LicensesPage() {
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
  const rows = [...data.licenses].sort((a, b) => b.totalEarnedPax - a.totalEarnedPax);
  const totalPax = rows.reduce((s, l) => s + l.totalEarnedPax, 0);
  return /* @__PURE__ */ jsxs(AppShell, { children: [
    /* @__PURE__ */ jsx(PageHeader, { eyebrow: `@${data.me.handle}`, title: "My licenses", description: `${rows.length} pilot licenses — lifetime PAX as primary metric, rank as secondary.` }),
    /* @__PURE__ */ jsxs("div", { className: "mb-6 grid gap-3 sm:grid-cols-3", children: [
      /* @__PURE__ */ jsx(Stat, { label: "Licenses", value: String(rows.length) }),
      /* @__PURE__ */ jsx(Stat, { label: "Lifetime PAX", value: formatNumber(Math.round(totalPax)), accent: "runway" }),
      /* @__PURE__ */ jsx(Stat, { label: "Top rank", value: rows[0]?.rankName || "—", accent: "instrument" })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3", children: [
      rows.map((l) => /* @__PURE__ */ jsxs(Link, { to: "/licenses/$slug", params: {
        slug: l.code || l.slug
      }, className: "panel group block rounded-xl p-5 transition-colors hover:bg-secondary/40", children: [
        /* @__PURE__ */ jsxs("div", { className: "flex items-start gap-3", children: [
          l.imageSrc && /* @__PURE__ */ jsx("img", { src: l.imageSrc.startsWith("http") ? l.imageSrc : `https://simfly.io${l.imageSrc}`, alt: "", className: "h-12 w-12 shrink-0 rounded-md object-cover" }),
          /* @__PURE__ */ jsxs("div", { className: "min-w-0 flex-1", children: [
            /* @__PURE__ */ jsx("div", { className: "font-display truncate text-base font-semibold", children: l.name }),
            /* @__PURE__ */ jsx("div", { className: "mono text-[11px] uppercase tracking-widest text-muted-foreground", children: l.code || l.sku })
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "mt-4 grid grid-cols-3 gap-3 border-t border-border pt-4 text-xs", children: [
          /* @__PURE__ */ jsx(KV, { label: "Lifetime PAX", value: formatNumber(Math.round(l.totalEarnedPax)), tone: "runway" }),
          /* @__PURE__ */ jsx(KV, { label: "Rank", value: `#${l.rank}`, sub: l.rankName }),
          /* @__PURE__ */ jsx(KV, { label: "Level", value: `L${l.level}`, sub: `${Math.round(l.levelProgress)}%` })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "mt-3 grid grid-cols-2 gap-3 border-t border-border pt-3 text-xs", children: [
          /* @__PURE__ */ jsx(TimerKV, { label: "24h timer", timer: l.timers.find((t) => t.kind === "TIMER24") }),
          /* @__PURE__ */ jsx(TimerKV, { label: "84h timer", timer: l.timers.find((t) => t.kind === "TIMER84") })
        ] })
      ] }, l.sku + l.code)),
      rows.length === 0 && /* @__PURE__ */ jsx("div", { className: "panel rounded-xl p-5 text-sm text-muted-foreground", children: "No licenses yet." })
    ] })
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
function KV({
  label,
  value,
  sub,
  tone
}) {
  const t = tone === "runway" ? "text-runway" : "text-foreground";
  return /* @__PURE__ */ jsxs("div", { children: [
    /* @__PURE__ */ jsx("div", { className: "mono text-[10px] uppercase tracking-widest text-muted-foreground", children: label }),
    /* @__PURE__ */ jsx("div", { className: `font-display mono mt-0.5 text-base font-semibold ${t}`, children: value }),
    sub && /* @__PURE__ */ jsx("div", { className: "mono text-[10px] text-muted-foreground", children: sub })
  ] });
}
function formatHM(mins) {
  if (!Number.isFinite(mins) || mins <= 0) return "0m";
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
function TimerKV({
  label,
  timer
}) {
  if (!timer) {
    return /* @__PURE__ */ jsxs("div", { children: [
      /* @__PURE__ */ jsx("div", { className: "mono text-[10px] uppercase tracking-widest text-muted-foreground", children: label }),
      /* @__PURE__ */ jsx("div", { className: "font-display mono mt-0.5 text-base font-semibold text-muted-foreground", children: "—" })
    ] });
  }
  const ready = timer.minutesAvailable >= timer.minutesCap && timer.minutesCap > 0;
  const empty = timer.minutesAvailable <= 0;
  const tone = ready ? "text-runway" : empty ? "text-instrument" : "text-foreground";
  const sub = empty ? `refills in ${formatHM(timer.minsUntilNextRestore)}` : `cap ${formatHM(timer.minutesCap)}`;
  return /* @__PURE__ */ jsxs("div", { onClick: (e) => e.preventDefault(), children: [
    /* @__PURE__ */ jsx("div", { className: "mono text-[10px] uppercase tracking-widest text-muted-foreground", children: label }),
    /* @__PURE__ */ jsx("div", { className: `font-display mono mt-0.5 text-base font-semibold ${tone}`, children: formatHM(timer.minutesAvailable) }),
    /* @__PURE__ */ jsx("div", { className: "mono text-[10px] text-muted-foreground", children: sub })
  ] });
}
export {
  LicensesPage as component
};
