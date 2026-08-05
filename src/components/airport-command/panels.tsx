// Airport Command Center — presentation panels.
// Pure rendering of already-computed module outputs.

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/components/app-shell";
import { SimbriefLink } from "@/components/simbrief-link";
import type {
  CommandActivity,
  CommandLive,
  CommandLiveMovement,
  CommandPulse,
  CommandValue,
} from "@/lib/airport-command.functions";
import type { RadarWeek } from "@/lib/community-radar.types";
import type { UpgradeAdvisorResult } from "@/lib/simfly.functions";
import {
  Activity,
  ArrowDownLeft,
  ArrowUpRight,
  Gauge,
  Radar,
  Star,
  Timer,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react";

export function Panel({
  title,
  eyebrow,
  icon: Icon,
  right,
  children,
  className,
}: {
  title: string;
  eyebrow?: string;
  icon?: React.ComponentType<{ className?: string }>;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("panel rounded-xl p-5", className)}>
      <header className="mb-4 flex items-start justify-between gap-3">
        <div>
          {eyebrow && (
            <div className="mono text-[10px] uppercase tracking-[0.2em] text-runway">{eyebrow}</div>
          )}
          <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
            {Icon && <Icon className="size-4 text-runway" />}
            {title}
          </h2>
        </div>
        {right}
      </header>
      {children}
    </section>
  );
}

export function EmptyNote({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}

export function ConfidenceBadge({ level }: { level: "HIGH" | "MEDIUM" | "LOW" }) {
  const tone =
    level === "HIGH"
      ? "border-runway/40 text-runway"
      : level === "MEDIUM"
        ? "border-instrument/40 text-instrument"
        : "border-border text-muted-foreground";
  return (
    <span className={cn("mono rounded-full border px-2 py-0.5 text-[10px] tracking-widest", tone)}>
      {level} CONFIDENCE
    </span>
  );
}

// --------------------------------------------------------------------------
// Airport pulse
// --------------------------------------------------------------------------

export function PulseHeader({
  pulse,
  confidence,
  communityRank,
}: {
  pulse: CommandPulse;
  confidence?: CommandActivity["confidence"];
  communityRank: number | null;
}) {
  const trend = pulse.trendPct;
  const TrendIcon = trend === null ? Activity : trend >= 0 ? TrendingUp : TrendingDown;
  return (
    <section className="panel relative overflow-hidden rounded-xl p-6">
      <div className="pointer-events-none absolute inset-x-0 -top-24 h-48 bg-[radial-gradient(closest-side,var(--color-runway)/18,transparent)]" />
      <div className="relative flex flex-wrap items-start justify-between gap-6">
        <div>
          <div className="mono text-[11px] uppercase tracking-[0.25em] text-runway">
            Command Center · Week {pulse.snapshot.weekNumber}
          </div>
          <h1 className="font-display text-4xl font-semibold tracking-tight">
            {pulse.icao}
            <span className="ml-3 text-lg font-normal text-muted-foreground">{pulse.name}</span>
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <span className="mono rounded-full border border-border px-2 py-0.5">
              TIER {pulse.tier}
            </span>
            <span className="mono rounded-full border border-border px-2 py-0.5">
              LEVEL {pulse.level}
            </span>
            <span
              className={cn(
                "mono rounded-full border px-2 py-0.5",
                pulse.status === "ACTIVE HUB"
                  ? "border-runway/40 text-runway"
                  : "border-border text-muted-foreground",
              )}
            >
              {pulse.status}
            </span>
            {confidence && <ConfidenceBadge level={confidence.level} />}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-6 text-right">
          <Metric label="Ops this week" value={formatNumber(pulse.weeklyOperations)} />
          <Metric
            label="vs last week"
            value={trend === null ? "—" : `${trend >= 0 ? "+" : ""}${trend.toFixed(0)}%`}
            icon={<TrendIcon className="size-3.5" />}
          />
          <Metric
            label="Community rank"
            value={communityRank ? `#${communityRank}` : "—"}
          />
        </div>
      </div>
    </section>
  );
}

function Metric({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
}) {
  return (
    <div>
      <div className="mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 flex items-center justify-end gap-1.5 font-display text-2xl font-semibold">
        {icon}
        {value}
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------
// Live movements board (inbound + outbound)
// --------------------------------------------------------------------------

function etaLabel(etaMs?: number) {
  if (!etaMs) return "—";
  const mins = Math.round((etaMs - Date.now()) / 60_000);
  if (mins <= 0) return "ARRIVING";
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function airborneLabel(departureMs?: number) {
  if (!departureMs) return "AIRBORNE";
  const mins = Math.max(0, Math.round((Date.now() - departureMs) / 60_000));
  if (mins < 60) return `${mins} min out`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m out`;
}

function MovementRow({
  f,
  icao,
  direction,
}: {
  f: CommandLiveMovement;
  icao: string;
  direction: "in" | "out";
}) {
  const inbound = direction === "in";
  return (
    <li className="flex items-center justify-between gap-3 py-2.5 text-sm">
      <div className="flex min-w-0 items-center gap-2.5">
        {inbound ? (
          <ArrowDownLeft className="size-4 shrink-0 text-runway" />
        ) : (
          <ArrowUpRight className="size-4 shrink-0 text-instrument" />
        )}
        <div className="min-w-0">
          <div className="truncate font-medium">
            {f.pilot}
            {f.isOwnPilot && (
              <span className="mono ml-2 text-[10px] uppercase tracking-widest text-runway">
                you
              </span>
            )}
          </div>
          <div className="mono truncate text-xs text-muted-foreground">
            {inbound
              ? `${f.origin || "????"} → ${icao}`
              : `${icao} → ${f.destination || "????"}`}{" "}
            · {f.aircraftName || f.aircraftICAO}
            {f.tailNumber ? ` · ${f.tailNumber}` : ""}
          </div>
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div className={cn("mono text-sm", inbound ? "text-instrument" : "text-runway")}>
          {inbound ? etaLabel(f.etaMs) : airborneLabel(f.departureMs)}
        </div>
        <div className="mono text-[10px] text-muted-foreground">
          {f.distanceNm ? `${Math.round(f.distanceNm)} nm` : "—"}
        </div>
      </div>
    </li>
  );
}

export function LiveBoard({ live, loading }: { live?: CommandLive; loading: boolean }) {
  const [mode, setMode] = useState<"all" | "in" | "out">("all");
  const inbound = live?.inbound ?? [];
  const outbound = live?.outbound ?? [];
  const showIn = mode !== "out";
  const showOut = mode !== "in";

  return (
    <Panel
      title="Live traffic"
      eyebrow="Live feed"
      icon={Timer}
      right={
        <span className="mono text-[10px] uppercase tracking-widest text-muted-foreground">
          {loading
            ? "Scanning…"
            : `${inbound.length} inbound · ${outbound.length} outbound`}
        </span>
      }
    >
      <div className="mb-3 flex gap-1.5">
        {(
          [
            ["all", "All"],
            ["in", "Inbound"],
            ["out", "Outbound"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setMode(key)}
            className={cn(
              "mono rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-widest transition-colors",
              mode === key
                ? "border-runway/60 bg-runway/10 text-runway"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {loading && <EmptyNote>Reading the live flight feed…</EmptyNote>}

      {!loading && inbound.length === 0 && outbound.length === 0 && (
        <EmptyNote>No live movements at this airport. The board fills as flights launch.</EmptyNote>
      )}

      {!loading && (inbound.length > 0 || outbound.length > 0) && (
        <div className="space-y-4">
          {showIn && (
            <div>
              {mode === "all" && (
                <div className="mono mb-1 text-[10px] uppercase tracking-[0.2em] text-runway">
                  Inbound
                </div>
              )}
              {inbound.length === 0 ? (
                <EmptyNote>No aircraft currently inbound.</EmptyNote>
              ) : (
                <ul className="divide-y divide-border/60">
                  {inbound.map((f) => (
                    <MovementRow key={f.id} f={f} icao={live!.icao} direction="in" />
                  ))}
                </ul>
              )}
            </div>
          )}
          {showOut && (
            <div>
              {mode === "all" && (
                <div className="mono mb-1 text-[10px] uppercase tracking-[0.2em] text-instrument">
                  Outbound
                </div>
              )}
              {outbound.length === 0 ? (
                <EmptyNote>No aircraft currently outbound.</EmptyNote>
              ) : (
                <ul className="divide-y divide-border/60">
                  {outbound.map((f) => (
                    <MovementRow key={f.id} f={f} icao={live!.icao} direction="out" />
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}

// --------------------------------------------------------------------------
// Capacity pressure
// --------------------------------------------------------------------------

export function CapacityPanel({
  pulse,
  activity,
}: {
  pulse: CommandPulse;
  activity?: CommandActivity;
}) {
  const capacity = pulse.capacity || 0;
  const used = pulse.weeklyOperations;
  const pct = capacity > 0 ? Math.min(100, (used / capacity) * 100) : 0;
  const max = Math.max(1, ...pulse.weeks.map((w) => Math.max(w.capacity, w.used)));
  return (
    <Panel title="Capacity pressure" eyebrow="Airport intelligence" icon={Gauge}>
      <div className="mb-4 flex items-end justify-between">
        <div>
          <div className="font-display text-3xl font-semibold">
            {formatNumber(used)}
            <span className="ml-1 text-base font-normal text-muted-foreground">
              / {capacity ? formatNumber(capacity) : "—"} ops
            </span>
          </div>
          <div className="mono mt-1 text-[11px] text-muted-foreground">
            Week {pulse.snapshot.weekNumber} · {pct.toFixed(0)}% of weekly capacity
          </div>
        </div>
        {activity && (
          <div className="flex gap-4 text-right text-sm">
            <div>
              <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Arrivals
              </div>
              <div className="flex items-center justify-end gap-1 font-display text-xl">
                <ArrowDownLeft className="size-3.5 text-runway" />
                {activity.currentWeek.arrivals}
              </div>
            </div>
            <div>
              <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Departures
              </div>
              <div className="flex items-center justify-end gap-1 font-display text-xl">
                <ArrowUpRight className="size-3.5 text-instrument" />
                {activity.currentWeek.departures}
              </div>
            </div>
          </div>
        )}
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-runway transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-5 flex h-28 items-end gap-1">
        {pulse.weeks.map((w) => (
          <div key={w.weekNumber} className="group relative flex-1">
            <div
              className="w-full rounded-sm bg-border/70"
              style={{ height: `${(w.capacity / max) * 100}px` }}
            />
            <div
              className="absolute bottom-0 w-full rounded-sm bg-runway/70"
              style={{ height: `${(w.used / max) * 100}px` }}
            />
            <div className="pointer-events-none absolute -top-8 left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-card px-2 py-1 text-[10px] group-hover:block">
              W{w.weekNumber} · {w.used}/{w.capacity}
            </div>
          </div>
        ))}
      </div>
      <p className="mono mt-2 text-[10px] uppercase tracking-widest text-muted-foreground">
        Weekly operations vs capacity — Airport Capacity Utilization
      </p>
    </Panel>
  );
}

// --------------------------------------------------------------------------
// Activity feed
// --------------------------------------------------------------------------

export function ActivityFeed({
  activity,
  loading,
  filter,
  onFilter,
}: {
  activity?: CommandActivity;
  loading: boolean;
  filter: "all" | "owned" | "others";
  onFilter: (f: "all" | "owned" | "others") => void;
}) {
  const rows = useMemo(() => {
    const all = activity?.rows ?? [];
    if (filter === "owned") return all.filter((r) => r.ownedAircraft);
    if (filter === "others") return all.filter((r) => !r.isOwnerPilot);
    return all;
  }, [activity, filter]);

  return (
    <Panel
      title="Activity feed"
      eyebrow="Operations log"
      icon={Activity}
      right={
        <div className="flex gap-1">
          {(["all", "owned", "others"] as const).map((f) => (
            <button
              key={f}
              onClick={() => onFilter(f)}
              className={cn(
                "mono rounded-full border px-2.5 py-0.5 text-[10px] uppercase tracking-widest transition-colors",
                filter === f
                  ? "border-runway/50 text-runway"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {f === "owned" ? "My aircraft" : f === "others" ? "Visitors" : "All"}
            </button>
          ))}
        </div>
      }
    >
      {loading && <EmptyNote>Loading airport operations…</EmptyNote>}
      {!loading && rows.length === 0 && <EmptyNote>No operations recorded in this window.</EmptyNote>}
      {rows.length > 0 && (
        <div className="max-h-96 overflow-y-auto">
          <table className="w-full text-sm">
            <tbody className="divide-y divide-border/60">
              {rows.slice(0, 120).map((r) => (
                <tr key={r.id}>
                  <td className="py-2 pr-2">
                    <span
                      className={cn(
                        "mono text-[10px] uppercase tracking-widest",
                        r.operation === "ARRIVAL" ? "text-runway" : "text-instrument",
                      )}
                    >
                      {r.operation === "ARRIVAL" ? "ARR" : "DEP"}
                    </span>
                  </td>
                  <td className="py-2 pr-2 font-medium">{r.visitor || "—"}</td>
                  <td className="py-2 pr-2 text-muted-foreground">{r.aircraft}</td>
                  <td className="mono py-2 pr-2 text-muted-foreground">{r.otherIcao}</td>
                  <td className="mono py-2 pr-2 text-right">{formatNumber(r.paxAirport)}</td>
                  <td className="mono py-2 text-right text-muted-foreground">
                    {new Date(r.ts).toISOString().slice(5, 16).replace("T", " ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

// --------------------------------------------------------------------------
// Owner impact
// --------------------------------------------------------------------------

export function OwnerImpactPanel({ activity }: { activity?: CommandActivity }) {
  if (!activity) return null;
  const o = activity.ownerImpact;
  const items = [
    { label: "Owned aircraft involved", value: formatNumber(o.ownedAircraftInvolved) },
    { label: "Operations they generated", value: formatNumber(o.operationsGenerated) },
    { label: "Flights by other pilots", value: formatNumber(o.flightsByOtherPilots) },
    { label: "PAX attributed to you", value: formatNumber(Math.round(o.revenueAttributed)) },
  ];
  return (
    <Panel title="Owner impact" eyebrow="Attribution" icon={Users}>
      <div className="grid grid-cols-2 gap-4">
        {items.map((i) => (
          <div key={i.label} className="rounded-lg border border-border/60 p-3">
            <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground">
              {i.label}
            </div>
            <div className="mt-1 font-display text-xl font-semibold">{i.value}</div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Attribution mirrors the credits already published by Income Intelligence — airport share
        plus aircraft rental share on the same flights.
      </p>
    </Panel>
  );
}

// --------------------------------------------------------------------------
// Traffic value profile + revenue intelligence
// --------------------------------------------------------------------------

export function ValueProfilePanel({
  value,
  loading,
}: {
  value?: CommandValue;
  loading: boolean;
}) {
  return (
    <Panel title="Traffic value profile" eyebrow="Payout intelligence" icon={Star}>
      {loading && <EmptyNote>Sampling the airport payout matrix…</EmptyNote>}
      {!loading && !value && <EmptyNote>No payout samples available for this airport.</EmptyNote>}
      {value && (
        <div className="space-y-5">
          <div>
            <div className="mono mb-2 text-[10px] uppercase tracking-widest text-muted-foreground">
              Share of PAX by aircraft tier
            </div>
            <div className="space-y-2">
              {value.tiers.map((t) => (
                <div key={t.tier} className="flex items-center gap-3">
                  <span className="mono w-14 text-xs">TIER {t.tier}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-instrument" style={{ width: `${t.share}%` }} />
                  </div>
                  <span className="mono w-24 text-right text-xs text-muted-foreground">
                    {t.share.toFixed(0)}% · {t.operations} ops
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="mono mb-2 text-[10px] uppercase tracking-widest text-muted-foreground">
              Best paying tier / level combinations
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {value.combos.map((c) => (
                <div key={`${c.tier}:${c.level}`} className="rounded-lg border border-border/60 p-2.5">
                  <div className="mono text-[10px] text-muted-foreground">
                    T{c.tier} · L{c.level}
                  </div>
                  <div className="font-display text-lg">{Math.round(c.avgPax)}</div>
                  <div className="mono text-[10px] text-muted-foreground">
                    avg PAX · {c.operations} ops
                  </div>
                </div>
              ))}
            </div>
          </div>
          <p className="mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {formatNumber(value.sampledFlights)} sampled flights
          </p>
        </div>
      )}
    </Panel>
  );
}

export function RevenuePanel({ value, loading }: { value?: CommandValue; loading: boolean }) {
  const weeks = value?.revenueWeeks ?? [];
  const max = Math.max(1, ...weeks.map((w) => w.basePax + w.bonusPax));
  return (
    <Panel title="Airport revenue intelligence" eyebrow="Historical" icon={TrendingUp}>
      {loading && <EmptyNote>Correlating operations with payouts…</EmptyNote>}
      {!loading && weeks.length === 0 && <EmptyNote>Not enough sampled history yet.</EmptyNote>}
      {weeks.length > 0 && (
        <>
          <div className="flex h-32 items-end gap-1">
            {weeks.map((w) => {
              const total = w.basePax + w.bonusPax;
              return (
                <div key={w.weekNumber} className="group relative flex flex-1 flex-col justify-end">
                  <div
                    className="w-full rounded-t-sm bg-instrument/70"
                    style={{ height: `${(w.bonusPax / max) * 110}px` }}
                  />
                  <div
                    className="w-full rounded-b-sm bg-runway/70"
                    style={{ height: `${(w.basePax / max) * 110}px` }}
                  />
                  <div className="pointer-events-none absolute -top-10 left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-card px-2 py-1 text-[10px] group-hover:block">
                    W{w.weekNumber} · {formatNumber(Math.round(total))} PAX · {w.operations} ops
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mono mt-3 flex gap-4 text-[10px] uppercase tracking-widest text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-sm bg-runway/70" /> Base PAX
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-sm bg-instrument/70" /> Weekly bonus
            </span>
          </div>
        </>
      )}
    </Panel>
  );
}

// --------------------------------------------------------------------------
// Community position + DNA
// --------------------------------------------------------------------------

export function CommunityPanel({
  week,
  icao,
  loading,
}: {
  week?: RadarWeek;
  icao: string;
  loading: boolean;
}) {
  const ranked = useMemo(
    () => (week?.airports ?? []).slice().sort((a, b) => b.operations - a.operations),
    [week],
  );
  const idx = ranked.findIndex((a) => a.icao.toUpperCase() === icao);
  const entry = idx >= 0 ? ranked[idx] : null;
  return (
    <Panel title="Community position" eyebrow="Community Radar" icon={Radar}>
      {loading && <EmptyNote>Reading the community week…</EmptyNote>}
      {!loading && !entry && (
        <EmptyNote>
          This airport has no community traffic recorded in the current radar week.
        </EmptyNote>
      )}
      {entry && (
        <div className="grid grid-cols-3 gap-4">
          <Stat label="Rank" value={`#${idx + 1}`} />
          <Stat label="Operations" value={formatNumber(entry.operations)} />
          <Stat label="Unique pilots" value={formatNumber(entry.uniquePilots)} />
        </div>
      )}
    </Panel>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/60 p-3">
      <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="mt-1 font-display text-xl font-semibold">{value}</div>
    </div>
  );
}

export function DnaPanel({ activity }: { activity?: CommandActivity }) {
  if (!activity) return null;
  const { dna, confidence } = activity;
  const totalOps = dna.weekdayOps + dna.weekendOps;
  const weekendShare = totalOps > 0 ? (dna.weekendOps / totalOps) * 100 : 0;
  return (
    <Panel
      title="Airport DNA"
      eyebrow="Character"
      icon={Activity}
      right={<ConfidenceBadge level={confidence.level} />}
    >
      <dl className="space-y-3 text-sm">
        <Row label="Dominant aircraft" value={dna.dominantAircraft ?? "—"} />
        <Row
          label="Weekend share"
          value={totalOps > 0 ? `${weekendShare.toFixed(0)}% of operations` : "—"}
        />
        <Row label="Sample" value={`${confidence.operations} ops · ${confidence.pilots} pilots · ${confidence.weeks} weeks`} />
      </dl>
      {dna.topVisitors.length > 0 && (
        <div className="mt-4">
          <div className="mono mb-2 text-[10px] uppercase tracking-widest text-muted-foreground">
            Most loyal visitors
          </div>
          <ul className="space-y-1.5 text-sm">
            {dna.topVisitors.map((v) => (
              <li key={v.pilot} className="flex justify-between">
                <span>{v.pilot}</span>
                <span className="mono text-muted-foreground">{v.operations} ops</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}

// --------------------------------------------------------------------------
// Upgrade advisor (single airport)
// --------------------------------------------------------------------------

export function AdvisorPanel({
  advisor,
  icao,
  loading,
}: {
  advisor?: UpgradeAdvisorResult;
  icao: string;
  loading: boolean;
}) {
  const row = advisor?.rows.find((r) => r.icao.toUpperCase() === icao);
  return (
    <Panel title="Upgrade outlook" eyebrow="Upgrade Advisor" icon={Star}>
      {loading && <EmptyNote>Reading the upgrade advisor…</EmptyNote>}
      {!loading && !row && <EmptyNote>No advisor verdict cached for this airport yet.</EmptyNote>}
      {row && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-display text-2xl font-semibold">
                Level {row.level} → {row.nextLevel}
              </div>
              <div className="mono text-[11px] text-muted-foreground">{row.ratingLabel}</div>
            </div>
            <div className="flex gap-0.5">
              {Array.from({ length: 5 }, (_, i) => (
                <Star
                  key={i}
                  className={cn(
                    "size-4",
                    i < row.stars ? "fill-instrument text-instrument" : "text-border",
                  )}
                />
              ))}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Upgrade cost" value={formatNumber(Math.round(row.upgradeCost))} />
            <Stat label="Daily PAX gain" value={formatNumber(Math.round(row.dailyIncrease))} />
            <Stat
              label="Payback"
              value={row.paybackDays > 0 ? `${Math.round(row.paybackDays)} d` : "—"}
            />
          </div>
        </div>
      )}
    </Panel>
  );
}

export function DispatchPanel({ icao }: { icao: string }) {
  return (
    <Panel title="Quick dispatch" eyebrow="SimBrief" icon={ArrowUpRight}>
      <p className="mb-3 text-sm text-muted-foreground">
        Open SimBrief with {icao} pre-filled as the destination.
      </p>
      <SimbriefLink icao={icao} showIcon className="mono text-sm text-runway hover:underline" />
    </Panel>
  );
}
