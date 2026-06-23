import { jsxs, jsx } from "react/jsx-runtime";
import { useRouter, isRedirect, Link } from "@tanstack/react-router";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { CheckCircle2, WifiOff, AlertTriangle, KeyRound, X, Plane, LayoutDashboard, Building2, IdCard, Trophy, Activity, BarChart3, GitCompareArrows, Users, Coffee } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import * as React from "react";
import { useState } from "react";
import { j as checkSimflySession } from "./router-CWBWKmOn.js";
function useServerFn(serverFn) {
  const router = useRouter();
  return React.useCallback(async (...args) => {
    try {
      const res = await serverFn(...args);
      if (isRedirect(res)) throw res;
      return res;
    } catch (err) {
      if (isRedirect(err)) {
        err.options._fromLocation = router.stores.location.get();
        return router.navigate(router.resolveRedirect(err).options);
      }
      throw err;
    }
  }, [router, serverFn]);
}
function cn(...inputs) {
  return twMerge(clsx(inputs));
}
function SessionBanner() {
  const check = useServerFn(checkSimflySession);
  const [dismissed, setDismissed] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["simfly", "session-check"],
    queryFn: () => check(),
    staleTime: 6e4,
    refetchOnWindowFocus: false
  });
  if (isLoading || !data || dismissed) return null;
  if (data.status === "ok") return null;
  const variants = {
    missing: {
      tone: "bg-amber-500/10 border-amber-500/40 text-amber-200",
      icon: KeyRound,
      label: "SimFly user not found"
    },
    unauthorized: {
      tone: "bg-destructive/10 border-destructive/40 text-destructive",
      icon: AlertTriangle,
      label: "SimFly session rejected"
    },
    error: {
      tone: "bg-destructive/10 border-destructive/40 text-destructive",
      icon: WifiOff,
      label: "SimFly session unreachable"
    },
    ok: {
      tone: "",
      icon: CheckCircle2,
      label: ""
    }
  };
  const v = variants[data.status];
  const Icon = v.icon;
  return /* @__PURE__ */ jsxs(
    "div",
    {
      role: "alert",
      className: cn(
        "mb-4 flex items-start gap-3 rounded-xl border px-4 py-3 text-sm",
        v.tone
      ),
      children: [
        /* @__PURE__ */ jsx(Icon, { className: "mt-0.5 h-4 w-4 shrink-0" }),
        /* @__PURE__ */ jsxs("div", { className: "min-w-0 flex-1", children: [
          /* @__PURE__ */ jsxs("div", { className: "mono text-[11px] uppercase tracking-widest opacity-80", children: [
            v.label,
            data.httpStatus ? ` · HTTP ${data.httpStatus}` : ""
          ] }),
          /* @__PURE__ */ jsx("p", { className: "mt-0.5 leading-snug", children: data.message })
        ] }),
        /* @__PURE__ */ jsx(
          "button",
          {
            type: "button",
            onClick: () => setDismissed(true),
            "aria-label": "Dismiss",
            className: "shrink-0 rounded p-1 opacity-70 transition hover:bg-white/5 hover:opacity-100",
            children: /* @__PURE__ */ jsx(X, { className: "h-4 w-4" })
          }
        )
      ]
    }
  );
}
const NAV = [
  { to: "/", label: "Overview", icon: LayoutDashboard },
  { to: "/airports", label: "Airports", icon: Building2 },
  { to: "/aircraft", label: "Aircraft", icon: Plane },
  { to: "/licenses", label: "Licenses", icon: IdCard },
  { to: "/rankings", label: "Rankings", icon: Trophy },
  { to: "/activity", label: "Activity", icon: Activity },
  { to: "/stats", label: "Stats", icon: BarChart3 },
  { to: "/compare", label: "Compare", icon: GitCompareArrows },
  { to: "/community", label: "Community", icon: Users }
];
function AppShell({ children }) {
  return /* @__PURE__ */ jsx("div", { className: "flight-deck-grad min-h-screen text-foreground", children: /* @__PURE__ */ jsxs("div", { className: "mx-auto flex max-w-[1500px] flex-col gap-6 px-4 py-6 lg:flex-row lg:px-8", children: [
    /* @__PURE__ */ jsx(Sidebar, {}),
    /* @__PURE__ */ jsxs("main", { className: "min-w-0 flex-1 pb-20", children: [
      /* @__PURE__ */ jsx(SessionBanner, {}),
      children
    ] })
  ] }) });
}
function Sidebar() {
  return /* @__PURE__ */ jsxs("aside", { className: "lg:sticky lg:top-6 lg:h-[calc(100vh-3rem)] lg:w-64 lg:shrink-0", children: [
    /* @__PURE__ */ jsxs("div", { className: "panel flex items-center gap-3 rounded-xl px-4 py-3", children: [
      /* @__PURE__ */ jsx("div", { className: "grid h-9 w-9 place-items-center rounded-lg bg-primary text-primary-foreground", children: /* @__PURE__ */ jsx(Plane, { className: "h-5 w-5 -rotate-45" }) }),
      /* @__PURE__ */ jsxs("div", { className: "leading-tight", children: [
        /* @__PURE__ */ jsx("div", { className: "font-display text-base font-semibold tracking-tight", children: "SimFly Hub" }),
        /* @__PURE__ */ jsx("div", { className: "mono text-[10px] uppercase tracking-widest text-muted-foreground", children: "Assets Intelligence" })
      ] })
    ] }),
    /* @__PURE__ */ jsx("nav", { className: "mt-4 flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible", children: NAV.map(({ to, label, icon: Icon }) => /* @__PURE__ */ jsxs(
      Link,
      {
        to,
        activeOptions: { exact: to === "/" },
        className: cn(
          "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors",
          "hover:bg-secondary hover:text-foreground"
        ),
        activeProps: {
          className: "bg-secondary text-foreground ring-1 ring-primary/30 shadow-[0_0_0_1px_rgba(34,211,238,0.15)]"
        },
        children: [
          /* @__PURE__ */ jsx(Icon, { className: "h-4 w-4 shrink-0" }),
          /* @__PURE__ */ jsx("span", { className: "whitespace-nowrap", children: label })
        ]
      },
      to
    )) }),
    /* @__PURE__ */ jsxs("div", { className: "mt-6 hidden lg:block", children: [
      /* @__PURE__ */ jsxs(
        "a",
        {
          href: "https://paypal.me/shilliash",
          target: "_blank",
          rel: "noopener noreferrer",
          title: "Support SimFly Hub via PayPal",
          className: "group flex items-center gap-2.5 rounded-lg border border-border/60 bg-secondary/30 px-3 py-2 text-xs text-muted-foreground transition-colors hover:border-runway/40 hover:bg-secondary/60 hover:text-foreground",
          children: [
            /* @__PURE__ */ jsx(Coffee, { className: "h-3.5 w-3.5 shrink-0 text-runway transition-transform group-hover:-rotate-12" }),
            /* @__PURE__ */ jsx("span", { className: "mono uppercase tracking-widest text-[10px]", children: "Buy me a coffee" })
          ]
        }
      ),
      /* @__PURE__ */ jsx("p", { className: "mt-2 px-1 text-[11px] leading-relaxed text-muted-foreground", children: "This dashboard is build and maintained on free time. If it helps your operations, consider chipping in via link above. Every tip covers hosting and funds new features + keeps the lights on." })
    ] })
  ] });
}
function PageHeader({
  eyebrow,
  title,
  description,
  actions
}) {
  return /* @__PURE__ */ jsxs("header", { className: "mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", children: [
    /* @__PURE__ */ jsxs("div", { children: [
      eyebrow && /* @__PURE__ */ jsx("div", { className: "mono mb-2 text-[11px] uppercase tracking-[0.2em] text-runway", children: eyebrow }),
      /* @__PURE__ */ jsx("h1", { className: "font-display text-3xl font-semibold tracking-tight sm:text-4xl", children: title }),
      description && /* @__PURE__ */ jsx("p", { className: "mt-2 max-w-2xl text-sm text-muted-foreground", children: description })
    ] }),
    actions && /* @__PURE__ */ jsx("div", { className: "flex shrink-0 gap-2", children: actions })
  ] });
}
function StatCard({
  label,
  value,
  hint,
  trend,
  icon: Icon
}) {
  return /* @__PURE__ */ jsxs("div", { className: "panel relative overflow-hidden rounded-xl p-5", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex items-start justify-between gap-3", children: [
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("div", { className: "mono text-[10px] uppercase tracking-widest text-muted-foreground", children: label }),
        /* @__PURE__ */ jsx("div", { className: "mt-2 font-display text-3xl font-semibold tracking-tight", children: value }),
        hint && /* @__PURE__ */ jsx("div", { className: "mt-1 text-xs text-muted-foreground", children: hint })
      ] }),
      Icon && /* @__PURE__ */ jsx("div", { className: "grid h-10 w-10 place-items-center rounded-lg bg-secondary text-runway", children: /* @__PURE__ */ jsx(Icon, { className: "h-5 w-5" }) })
    ] }),
    trend && /* @__PURE__ */ jsxs(
      "div",
      {
        className: cn(
          "mt-3 inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs",
          trend.dir === "up" ? "bg-runway/10 text-runway" : "bg-destructive/10 text-destructive"
        ),
        children: [
          trend.dir === "up" ? "▲" : "▼",
          " ",
          trend.value
        ]
      }
    ),
    /* @__PURE__ */ jsx("div", { className: "scanline absolute inset-x-0 bottom-0 h-px opacity-60" })
  ] });
}
function TierBadge({ tier }) {
  const cls = {
    bronze: "bg-tier-bronze/15 text-tier-bronze ring-tier-bronze/30",
    silver: "bg-tier-silver/15 text-tier-silver ring-tier-silver/30",
    gold: "bg-tier-gold/15 text-tier-gold ring-tier-gold/30",
    platinum: "bg-tier-platinum/15 text-tier-platinum ring-tier-platinum/30"
  };
  return /* @__PURE__ */ jsx(
    "span",
    {
      className: cn(
        "mono inline-flex items-center rounded px-1.5 py-0.5 text-[10px] uppercase tracking-widest ring-1",
        cls[tier]
      ),
      children: tier
    }
  );
}
function TierPill({
  tier,
  label
}) {
  const cls = {
    T6: "bg-tier-platinum/15 text-tier-platinum ring-tier-platinum/30",
    T5: "bg-tier-gold/15 text-tier-gold ring-tier-gold/30",
    T4: "bg-runway/15 text-runway ring-runway/30",
    T3: "bg-instrument/15 text-instrument ring-instrument/30",
    T2: "bg-tier-silver/15 text-tier-silver ring-tier-silver/30",
    T1: "bg-secondary text-muted-foreground ring-border"
  };
  return /* @__PURE__ */ jsxs(
    "span",
    {
      className: cn(
        "mono inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] uppercase tracking-widest ring-1",
        cls[tier]
      ),
      children: [
        /* @__PURE__ */ jsx("span", { className: "font-semibold", children: tier }),
        label && /* @__PURE__ */ jsx("span", { className: "text-foreground/70 normal-case tracking-normal", children: label })
      ]
    }
  );
}
function RotationCell({ rotation, max }) {
  const remaining = Math.max(0, max - rotation);
  const pct = max > 0 ? remaining / max : 0;
  const tone = remaining === 0 ? "text-destructive" : pct < 0.25 ? "text-instrument" : "text-runway";
  if (max === 0) return /* @__PURE__ */ jsx("span", { className: "text-muted-foreground", children: "—" });
  return /* @__PURE__ */ jsxs("span", { className: "mono", children: [
    /* @__PURE__ */ jsxs("span", { className: "text-muted-foreground", children: [
      rotation,
      "/",
      max
    ] }),
    " ",
    /* @__PURE__ */ jsxs("span", { className: tone, children: [
      "(",
      remaining,
      ")"
    ] })
  ] });
}
function formatNumber(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 1 : 2) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(n >= 1e4 ? 0 : 1) + "k";
  return n.toLocaleString();
}
function relativeTime(iso) {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  return new Date(t).toISOString().slice(0, 10);
}
export {
  AppShell as A,
  PageHeader as P,
  RotationCell as R,
  StatCard as S,
  TierPill as T,
  TierBadge as a,
  formatNumber as f,
  relativeTime as r,
  useServerFn as u
};
