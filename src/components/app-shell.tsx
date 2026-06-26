import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Building2,
  Trophy,
  Activity,
  BarChart3,
  GitCompareArrows,
  Users,
  Plane,
  IdCard,
  Coffee,
  ShieldCheck,
  Grid3x3,

} from "lucide-react";
import type { ReactNode } from "react";
import { SessionBanner } from "./session-banner";

const NAV = [
  { to: "/",           label: "Overview",  icon: LayoutDashboard },
  { to: "/airports",   label: "Airports",  icon: Building2 },
  { to: "/aircraft",   label: "Aircraft",  icon: Plane },
  { to: "/licenses",   label: "Licenses",  icon: IdCard },
  { to: "/rankings",   label: "Rankings",  icon: Trophy },
  { to: "/activity",   label: "Activity",  icon: Activity },
  { to: "/stats",       label: "Stats",       icon: BarChart3 },
  { to: "/payout-matrix", label: "Payout Matrix", icon: Grid3x3 },
  { to: "/consistency", label: "Consistency", icon: ShieldCheck },
  { to: "/compare",     label: "Compare",     icon: GitCompareArrows },
  { to: "/community",   label: "Community",   icon: Users },
] as const;


export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flight-deck-grad min-h-screen text-foreground">
      <div className="mx-auto flex max-w-[1500px] flex-col gap-6 px-4 py-6 lg:flex-row lg:px-8">
        <Sidebar />
        <main className="min-w-0 flex-1 pb-20">
          <SessionBanner />
          {children}
        </main>
      </div>
    </div>
  );
}

function Sidebar() {
  return (
    <aside className="lg:sticky lg:top-6 lg:h-[calc(100vh-3rem)] lg:w-64 lg:shrink-0">
      <div className="panel flex items-center gap-3 rounded-xl px-4 py-3">
        <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary text-primary-foreground">
          <Plane className="h-5 w-5 -rotate-45" />
        </div>
        <div className="leading-tight">
          <div className="font-display text-base font-semibold tracking-tight">SimFly Hub</div>
          <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Assets Intelligence
          </div>
        </div>
      </div>

      <nav className="mt-4 flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
        {NAV.map(({ to, label, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            activeOptions={{ exact: to === "/" }}
            className={cn(
              "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors",
              "hover:bg-secondary hover:text-foreground",
            )}
            activeProps={{
              className:
                "bg-secondary text-foreground ring-1 ring-primary/30 shadow-[0_0_0_1px_rgba(34,211,238,0.15)]",
            }}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="whitespace-nowrap">{label}</span>
          </Link>
        ))}
      </nav>

      <div className="mt-6 hidden lg:block">
        <a
          href="https://paypal.me/shilliash"
          target="_blank"
          rel="noopener noreferrer"
          title="Support SimFly Hub via PayPal"
          className="group flex items-center gap-2.5 rounded-lg border border-border/60 bg-secondary/30 px-3 py-2 text-xs text-muted-foreground transition-colors hover:border-runway/40 hover:bg-secondary/60 hover:text-foreground"
        >
          <Coffee className="h-3.5 w-3.5 shrink-0 text-runway transition-transform group-hover:-rotate-12" />
          <span className="mono uppercase tracking-widest text-[10px]">Buy me a coffee</span>
        </a>
        <p className="mt-2 px-1 text-[11px] leading-relaxed text-muted-foreground">
          Like what you see? ☕ Help keep SimFly Hub cruising by buying me a coffee with above link
          <br />
          <strong>Or file a flight plan few times every week to one of my airports — every landing is</strong> appreciated just as much. ❤️
        </p>
      </div>
    </aside>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow && (
          <div className="mono mb-2 text-[11px] uppercase tracking-[0.2em] text-runway">
            {eyebrow}
          </div>
        )}
        <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
        {description && (
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
    </header>
  );
}

export function StatCard({
  label,
  value,
  hint,
  trend,
  icon: Icon,
}: {
  label: string;
  value: string;
  hint?: ReactNode;
  trend?: { dir: "up" | "down"; value: string };
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="panel relative overflow-hidden rounded-xl p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {label}
          </div>
          <div className="mt-2 font-display text-3xl font-semibold tracking-tight">{value}</div>
          {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
        </div>
        {Icon && (
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-secondary text-runway">
            <Icon className="h-5 w-5" />
          </div>
        )}
      </div>
      {trend && (
        <div
          className={cn(
            "mt-3 inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs",
            trend.dir === "up"
              ? "bg-runway/10 text-runway"
              : "bg-destructive/10 text-destructive",
          )}
        >
          {trend.dir === "up" ? "▲" : "▼"} {trend.value}
        </div>
      )}
      <div className="scanline absolute inset-x-0 bottom-0 h-px opacity-60" />
    </div>
  );
}

export function TierBadge({ tier }: { tier: "bronze" | "silver" | "gold" | "platinum" }) {
  const cls: Record<typeof tier, string> = {
    bronze:   "bg-tier-bronze/15 text-tier-bronze ring-tier-bronze/30",
    silver:   "bg-tier-silver/15 text-tier-silver ring-tier-silver/30",
    gold:     "bg-tier-gold/15 text-tier-gold ring-tier-gold/30",
    platinum: "bg-tier-platinum/15 text-tier-platinum ring-tier-platinum/30",
  };
  return (
    <span
      className={cn(
        "mono inline-flex items-center rounded px-1.5 py-0.5 text-[10px] uppercase tracking-widest ring-1",
        cls[tier],
      )}
    >
      {tier}
    </span>
  );
}

/** Airport-size tier pill (T1..T6). */
export function TierPill({
  tier,
  label,
}: {
  tier: "T1" | "T2" | "T3" | "T4" | "T5" | "T6";
  label?: string;
}) {
  // T6 mega → platinum, T5 major → gold, T4 large → runway/cyan,
  // T3 medium → instrument/amber, T2 regional → violet, T1 airstrip → muted.
  const cls: Record<typeof tier, string> = {
    T6: "bg-tier-platinum/15 text-tier-platinum ring-tier-platinum/30",
    T5: "bg-tier-gold/15 text-tier-gold ring-tier-gold/30",
    T4: "bg-runway/15 text-runway ring-runway/30",
    T3: "bg-instrument/15 text-instrument ring-instrument/30",
    T2: "bg-tier-silver/15 text-tier-silver ring-tier-silver/30",
    T1: "bg-secondary text-muted-foreground ring-border",
  };
  return (
    <span
      className={cn(
        "mono inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] uppercase tracking-widest ring-1",
        cls[tier],
      )}
    >
      <span className="font-semibold">{tier}</span>
      {label && <span className="text-foreground/70 normal-case tracking-normal">{label}</span>}
    </span>
  );
}

/** Render "used/max (remaining)" with remaining tinted by capacity. */
export function RotationCell({ rotation, max }: { rotation: number; max: number }) {
  const remaining = Math.max(0, max - rotation);
  const pct = max > 0 ? remaining / max : 0;
  const tone =
    remaining === 0
      ? "text-destructive"
      : pct < 0.25
        ? "text-instrument"
        : "text-runway";
  if (max === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="mono">
      <span className="text-muted-foreground">{rotation}/{max}</span>{" "}
      <span className={tone}>({remaining})</span>
    </span>
  );
}

export function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(n >= 10_000_000 ? 1 : 2) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(n >= 10_000 ? 0 : 1) + "k";
  return n.toLocaleString();
}

export function relativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  return new Date(t).toISOString().slice(0, 10);
}
