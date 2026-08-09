import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { formatAirportOwner } from "@/lib/airport-owner";
import type {
  SpyIntel,
  SpyNearby,
  SpyPilot,
  SpyWeek,
} from "@/lib/airport-spy.functions";

/* ------------------------------------------------------------------ atoms */

export function NotObserved({ hint }: { hint?: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border/70 bg-secondary/30 px-3 py-4 text-center">
      <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground">
        Not yet observed
      </div>
      {hint ? <div className="mt-1 text-xs text-muted-foreground/80">{hint}</div> : null}
    </div>
  );
}

export function SourceTag({ source }: { source: "simfly" | "hub" }) {
  return (
    <span
      className={cn(
        "mono rounded px-1.5 py-0.5 text-[9px] uppercase tracking-widest ring-1",
        source === "simfly"
          ? "bg-runway/10 text-runway ring-runway/30"
          : "bg-instrument/10 text-instrument ring-instrument/30",
      )}
    >
      {source === "simfly" ? "SimFly investigation" : "Hub enrichment"}
    </span>
  );
}

export function Panel({
  title,
  source,
  right,
  children,
}: {
  title: string;
  source: "simfly" | "hub";
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="panel rounded-xl p-4">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="font-display text-sm font-semibold tracking-tight">{title}</h2>
          <SourceTag source={source} />
        </div>
        {right}
      </header>
      {children}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-secondary/40 px-3 py-2 ring-1 ring-border/60">
      <div className="mono text-[9px] uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
      <div className="mono mt-0.5 text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

const n = (v: number) => v.toLocaleString();

/* -------------------------------------------------------------- sections */

export function RecordHeader({ intel }: { intel: SpyIntel }) {
  return (
    <section className="panel rounded-xl p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Airport record
          </div>
          <div className="font-display mt-1 flex items-baseline gap-3">
            <span className="mono text-3xl font-semibold tracking-tight">{intel.icao}</span>
            <span className="text-sm text-muted-foreground">{intel.name ?? "Name not yet observed"}</span>
          </div>
          <div className="mono mt-2 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
            <span>Tier {intel.tier ?? "—"}</span>
            <span>Level {intel.level ?? "—"}</span>
            <span>{intel.country ?? "—"}</span>
            <span>Owner {formatAirportOwner(intel.owner)}</span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Flights analysed" value={n(intel.flightsAnalyzed)} />
          <Stat label="Weeks covered" value={n(intel.weeksCovered)} />
          <Stat label="First observed" value={fmtDate(intel.firstObservedAt)} />
          <Stat label="Last refreshed" value={fmtDate(intel.lastRefreshedAt)} />
        </div>
      </div>
    </section>
  );
}

export function OperationalProfile({ intel }: { intel: SpyIntel }) {
  if (!intel.flightsAnalyzed) {
    return (
      <Panel title="Operational profile" source="simfly">
        <NotObserved hint="Start an investigation to record operations for this airport." />
      </Panel>
    );
  }
  const perWeek = intel.weeksCovered ? intel.operations / intel.weeksCovered : 0;
  return (
    <Panel title="Operational profile" source="simfly">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Operations" value={n(intel.operations)} />
        <Stat label="Arrivals" value={n(intel.arrivals)} />
        <Stat label="Departures" value={n(intel.departures)} />
        <Stat label="Unique pilots" value={n(intel.uniquePilots)} />
        <Stat label="Aircraft types" value={n(intel.uniqueAircraft)} />
        <Stat label="Ops / week" value={perWeek ? perWeek.toFixed(1) : "—"} />
      </div>
      <div className="mono mt-3 text-[11px] text-muted-foreground">
        Observed range {fmtDate(intel.oldestFlightAt)} → {fmtDate(intel.newestFlightAt)} ·{" "}
        {intel.investigations} investigation{intel.investigations === 1 ? "" : "s"} ·{" "}
        {intel.pagesWalked} log pages walked
      </div>
    </Panel>
  );
}

function Bars({
  rows,
  unit,
}: {
  rows: { label: string; value: number; sub?: string }[];
  unit: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="space-y-1.5">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-2">
          <div className="mono w-28 shrink-0 truncate text-[11px] text-muted-foreground">
            {r.label}
          </div>
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full bg-runway/70"
              style={{ width: `${(r.value / max) * 100}%` }}
            />
          </div>
          <div className="mono w-20 shrink-0 text-right text-[11px] tabular-nums">
            {n(Math.round(r.value))} {unit}
          </div>
        </div>
      ))}
    </div>
  );
}

export function TrafficComposition({ intel }: { intel: SpyIntel }) {
  const byDim = (dimension: string) =>
    intel.traffic
      .filter((t) => t.dimension === dimension && t.bucket !== "0")
      .sort((a, b) => b.flights - a.flights)
      .slice(0, 10);

  const types = byDim("type");
  const tiers = byDim("tier");
  const levels = byDim("level");

  return (
    <Panel title="Traffic composition" source="simfly">
      {types.length === 0 ? (
        <NotObserved />
      ) : (
        <div className="grid gap-5 lg:grid-cols-3">
          <div>
            <div className="mono mb-2 text-[10px] uppercase tracking-widest text-muted-foreground">
              Aircraft types
            </div>
            <Bars rows={types.map((t) => ({ label: t.bucket, value: t.flights }))} unit="fl" />
          </div>
          <div>
            <div className="mono mb-2 text-[10px] uppercase tracking-widest text-muted-foreground">
              Aircraft tier
            </div>
            <Bars
              rows={tiers
                .sort((a, b) => Number(a.bucket) - Number(b.bucket))
                .map((t) => ({ label: `Tier ${t.bucket}`, value: t.flights }))}
              unit="fl"
            />
          </div>
          <div>
            <div className="mono mb-2 text-[10px] uppercase tracking-widest text-muted-foreground">
              Aircraft level
            </div>
            <Bars
              rows={levels
                .sort((a, b) => Number(a.bucket) - Number(b.bucket))
                .map((t) => ({ label: `Level ${t.bucket}`, value: t.flights }))}
              unit="fl"
            />
          </div>
        </div>
      )}
    </Panel>
  );
}

export function EconomicProfile({ intel }: { intel: SpyIntel }) {
  const tierLevel = intel.traffic
    .filter((t) => t.dimension === "tier_level" && t.flights > 0 && t.bucket !== "0:0")
    .map((t) => {
      const [tier, level] = t.bucket.split(":");
      return {
        tier: Number(tier),
        level: Number(level),
        flights: t.flights,
        avgPax: t.observedPax / t.flights,
        avgOwnerPax: t.observedOwnerPax / t.flights,
      };
    })
    .sort((a, b) => b.avgPax - a.avgPax);

  return (
    <Panel title="Economic profile" source="simfly">
      {tierLevel.length === 0 ? (
        <NotObserved hint="Payouts appear once flights with a recorded payout are observed." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="mono text-[10px] uppercase tracking-widest text-muted-foreground">
                <th className="py-1.5 text-left">Tier</th>
                <th className="py-1.5 text-left">Level</th>
                <th className="py-1.5 text-right">Flights</th>
                <th className="py-1.5 text-right">Avg PAX observed</th>
                <th className="py-1.5 text-right">Avg airport credit</th>
              </tr>
            </thead>
            <tbody className="mono tabular-nums">
              {tierLevel.slice(0, 14).map((r) => (
                <tr key={`${r.tier}:${r.level}`} className="border-t border-border/50">
                  <td className="py-1.5">T{r.tier}</td>
                  <td className="py-1.5">L{r.level}</td>
                  <td className="py-1.5 text-right">{n(r.flights)}</td>
                  <td className="py-1.5 text-right text-runway">{r.avgPax.toFixed(1)}</td>
                  <td className="py-1.5 text-right">{r.avgOwnerPax.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

export function VisitorIntelligence({ pilots, intel }: { pilots: SpyPilot[]; intel: SpyIntel }) {
  const total = pilots.reduce((s, p) => s + p.operations, 0);
  const recurring = pilots.filter((p) => p.operations > 1);
  const recurringShare = total ? recurring.reduce((s, p) => s + p.operations, 0) / total : 0;
  const topShare = total && pilots[0] ? pilots[0].operations / total : 0;

  return (
    <Panel title="Visitor intelligence" source="simfly">
      {pilots.length === 0 ? (
        <NotObserved />
      ) : (
        <>
          <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Pilots observed" value={n(intel.uniquePilots)} />
            <Stat label="Recurring pilots" value={n(recurring.length)} />
            <Stat label="Recurring share" value={`${Math.round(recurringShare * 100)}%`} />
            <Stat label="Top pilot share" value={`${Math.round(topShare * 100)}%`} />
          </div>
          <div className="space-y-1">
            {pilots.slice(0, 12).map((p) => (
              <div
                key={p.pilot}
                className="flex items-center justify-between gap-3 rounded-lg bg-secondary/30 px-3 py-1.5"
              >
                <span className="mono truncate text-xs">{p.pilot}</span>
                <span className="mono shrink-0 text-[11px] tabular-nums text-muted-foreground">
                  {n(p.operations)} ops · {n(Math.round(p.observedPax))} PAX · last{" "}
                  {fmtDate(p.lastSeenAt)}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </Panel>
  );
}

export function DemandHistory({ weeks }: { weeks: SpyWeek[] }) {
  const max = Math.max(1, ...weeks.map((w) => w.operations));
  const trend = useMemo(() => {
    if (weeks.length < 4) return null;
    const half = Math.floor(weeks.length / 2);
    const a = weeks.slice(0, half).reduce((s, w) => s + w.operations, 0) / half;
    const b =
      weeks.slice(half).reduce((s, w) => s + w.operations, 0) / (weeks.length - half);
    if (!a) return null;
    const delta = (b - a) / a;
    if (delta > 0.15) return "Rising over the observed weeks";
    if (delta < -0.15) return "Falling over the observed weeks";
    return "Flat over the observed weeks";
  }, [weeks]);

  return (
    <Panel
      title="Demand history"
      source="simfly"
      right={
        trend ? (
          <span className="mono rounded bg-secondary px-2 py-0.5 text-[10px] uppercase tracking-widest text-muted-foreground">
            {trend}
          </span>
        ) : null
      }
    >
      {weeks.length === 0 ? (
        <NotObserved />
      ) : (
        <>
          <div className="flex h-32 items-end gap-1">
            {weeks.map((w) => (
              <div key={w.weekStartUtc} className="group flex-1" title={`${w.operations} ops`}>
                <div
                  className="w-full rounded-t bg-runway/60 transition-colors group-hover:bg-runway"
                  style={{ height: `${Math.max(3, (w.operations / max) * 100)}%` }}
                />
              </div>
            ))}
          </div>
          <div className="mono mt-2 flex justify-between text-[10px] text-muted-foreground">
            <span>{fmtDate(weeks[0]?.weekStartUtc ?? null)}</span>
            <span>{weeks.length} weeks observed</span>
            <span>{fmtDate(weeks[weeks.length - 1]?.weekStartUtc ?? null)}</span>
          </div>
        </>
      )}
    </Panel>
  );
}

export function NearbyAirports({
  nearby,
  onSelect,
}: {
  nearby: SpyNearby[] | undefined;
  onSelect: (icao: string) => void;
}) {
  return (
    <Panel title="Nearby airports" source="simfly">
      {!nearby || nearby.length === 0 ? (
        <NotObserved hint="No neighbours within range in the geo dataset." />
      ) : (
        <div className="grid gap-1.5 sm:grid-cols-2">
          {nearby.map((a) => (
            <button
              key={a.icao}
              onClick={() => onSelect(a.icao)}
              className="flex items-center justify-between gap-2 rounded-lg bg-secondary/30 px-3 py-2 text-left ring-1 ring-transparent transition hover:ring-runway/40"
            >
              <span className="min-w-0">
                <span className="mono text-xs">{a.icao}</span>
                <span className="ml-2 truncate text-[11px] text-muted-foreground">{a.name}</span>
              </span>
              <span className="mono shrink-0 text-[10px] tabular-nums text-muted-foreground">
                {a.distanceNm} NM ·{" "}
                {a.investigated ? `${n(a.operations)} ops observed` : "not yet investigated"}
              </span>
            </button>
          ))}
        </div>
      )}
    </Panel>
  );
}

export function PerformanceExplanation({
  intel,
  weeks,
  pilots,
}: {
  intel: SpyIntel;
  weeks: SpyWeek[];
  pilots: SpyPilot[];
}) {
  const claims: { claim: string; evidence: string }[] = [];

  if (intel.weeksCovered > 0) {
    const perWeek = intel.operations / intel.weeksCovered;
    claims.push({
      claim:
        perWeek >= 40
          ? "High operational volume."
          : perWeek >= 12
            ? "Moderate operational volume."
            : "Low operational volume.",
      evidence: `${perWeek.toFixed(1)} operations per observed week across ${intel.weeksCovered} weeks.`,
    });
  }

  const types = intel.traffic.filter((t) => t.dimension === "type").length;
  if (types > 0) {
    claims.push({
      claim: types >= 12 ? "Diverse traffic mix." : types >= 5 ? "Mixed traffic." : "Narrow traffic mix.",
      evidence: `${types} distinct aircraft types observed.`,
    });
  }

  if (weeks.length >= 3) {
    const values = weeks.map((w) => w.operations);
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    const sd = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length);
    const cv = mean ? sd / mean : 0;
    claims.push({
      claim: cv < 0.35 ? "Consistent week to week." : "Volatile week to week.",
      evidence: `Weekly operations vary by ${Math.round(cv * 100)}% around a mean of ${mean.toFixed(1)}.`,
    });
  }

  const totalOps = pilots.reduce((s, p) => s + p.operations, 0);
  if (totalOps > 0 && pilots[0]) {
    const share = pilots[0].operations / totalOps;
    claims.push({
      claim:
        share > 0.4
          ? "Traffic concentrated on a single pilot."
          : "Traffic spread across multiple pilots.",
      evidence: `${pilots[0].pilot} accounts for ${Math.round(share * 100)}% of observed operations.`,
    });
  }

  const paid = intel.traffic.find((t) => t.dimension === "tier_level" && t.flights > 0);
  if (paid) {
    const all = intel.traffic.filter((t) => t.dimension === "tier_level");
    const flights = all.reduce((s, t) => s + t.flights, 0);
    const pax = all.reduce((s, t) => s + t.observedPax, 0);
    claims.push({
      claim: "Observed payout per flight.",
      evidence: `${(pax / Math.max(1, flights)).toFixed(1)} PAX average over ${n(flights)} paying flights observed.`,
    });
  }

  return (
    <Panel title="Performance explanation" source="simfly">
      {claims.length === 0 ? (
        <NotObserved hint="Explanations are only produced from recorded observations." />
      ) : (
        <ul className="space-y-2">
          {claims.map((c) => (
            <li key={c.claim} className="rounded-lg bg-secondary/30 px-3 py-2">
              <div className="text-sm font-medium">{c.claim}</div>
              <div className="mono mt-0.5 text-[11px] text-muted-foreground">{c.evidence}</div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

export function InvestigationConsole({
  intel,
  running,
  message,
}: {
  intel: SpyIntel;
  running: boolean;
  message: string | null;
}) {
  const pct = intel.progressTotal
    ? Math.min(100, Math.round((intel.progressPage / intel.progressTotal) * 100))
    : running
      ? 5
      : 0;
  return (
    <section className="panel rounded-xl p-4">
      <div className="mono flex items-center justify-between text-[10px] uppercase tracking-widest text-muted-foreground">
        <span>Investigation</span>
        <span>
          {running ? intel.progressMessage ?? "Working…" : (message ?? "Idle")}
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary">
        <div
          className={cn(
            "h-full rounded-full bg-runway transition-all duration-500",
            running && "animate-pulse",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      {intel.errorMessage ? (
        <div className="mono mt-2 text-[11px] text-destructive">{intel.errorMessage}</div>
      ) : null}
    </section>
  );
}
