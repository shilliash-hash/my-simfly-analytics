import { Eye, EyeOff, Radar, Star, Trash2, TrendingDown, TrendingUp, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { SYSTEM_OWNER_LABEL } from "@/lib/airport-owner";
import type {
  RadarDetail,
  SystemAirportRow,
  SystemAirportWatchRow,
  SystemScanState,
} from "@/lib/system-airports.types";
import { TIER_OPTIONS, WINDOW_OPTIONS } from "@/lib/system-airports.types";

const n = (v: number) => v.toLocaleString();

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  const t = Date.parse(iso);
  return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : "—";
}

export function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "mono rounded-lg px-3 py-1.5 text-[11px] uppercase tracking-widest ring-1 transition",
        active
          ? "bg-runway/15 text-runway ring-runway/40"
          : "bg-secondary/50 text-muted-foreground ring-border hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

export function AnalyzerControls({
  tiers,
  onToggleTier,
  windowDays,
  onWindow,
  onScan,
  scanning,
  scan,
  pending,
  systemOwned,
  playerOwned,
}: {
  tiers: number[];
  onToggleTier: (tier: number) => void;
  windowDays: number;
  onWindow: (days: number) => void;
  onScan: () => void;
  scanning: boolean;
  scan: SystemScanState | null;
  pending: number;
  systemOwned: number;
  playerOwned: number;
}) {
  return (
    <section className="panel mb-4 rounded-xl p-4">
      <div className="flex flex-wrap items-center gap-6">
        <div>
          <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Airport tier
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {TIER_OPTIONS.map((t) => (
              <Chip key={t} active={tiers.includes(t)} onClick={() => onToggleTier(t)}>
                T{t}
              </Chip>
            ))}
          </div>
        </div>
        <div>
          <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Analysis period
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {WINDOW_OPTIONS.map((w) => (
              <Chip key={w.label} active={windowDays === w.days} onClick={() => onWindow(w.days)}>
                {w.label}
              </Chip>
            ))}
          </div>
        </div>
        <div className="ml-auto">
          <button
            onClick={onScan}
            disabled={scanning || tiers.length === 0}
            className={cn(
              "mono rounded-lg px-4 py-2 text-xs uppercase tracking-widest ring-1 transition",
              scanning || tiers.length === 0
                ? "bg-secondary text-muted-foreground ring-border"
                : "bg-runway/15 text-runway ring-runway/40 hover:bg-runway/25",
            )}
          >
            {scanning ? "Scanning…" : pending > 0 ? "Continue tier scan" : "Scan tier"}
          </button>
        </div>
      </div>

      <div className="mono mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        <span>
          Classified:{" "}
          <span className="text-foreground">
            {n(scan?.resolved ?? 0)} / {n(scan?.total ?? 0)}
          </span>
        </span>
        <span>
          System-owned: <span className="text-runway">{n(systemOwned)}</span>
        </span>
        <span>
          Player-owned: <span className="text-foreground">{n(playerOwned)}</span>
        </span>
        <span>
          Unresolved: <span className="text-foreground">{n(pending)}</span>
        </span>
        <span>Last scanned: {fmtDate(scan?.lastScannedAt ?? null)}</span>
        {scan?.message ? <span className="text-runway/80">{scan.message}</span> : null}
      </div>

      {scan && scan.total > 0 ? (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary">
          <div
            className={cn("h-full rounded-full bg-runway transition-all", scanning && "animate-pulse")}
            style={{ width: `${Math.min(100, Math.round((scan.resolved / scan.total) * 100))}%` }}
          />
        </div>
      ) : null}
    </section>
  );
}

function TrendMark({ trend }: { trend: SystemAirportRow["trend"] }) {
  if (trend === "rising")
    return (
      <span className="inline-flex items-center gap-1 text-runway">
        <TrendingUp className="h-3 w-3" /> rising
      </span>
    );
  if (trend === "falling")
    return (
      <span className="inline-flex items-center gap-1 text-destructive">
        <TrendingDown className="h-3 w-3" /> falling
      </span>
    );
  if (trend === "flat")
    return (
      <span className="inline-flex items-center gap-1 text-muted-foreground">
        <Minus className="h-3 w-3" /> flat
      </span>
    );
  return <span className="text-muted-foreground">not yet observed</span>;
}

export function demandSignals(r: SystemAirportRow): string[] {
  const s: string[] = [];
  if (r.operations >= 40) s.push(`${n(r.operations)} observed operations`);
  if (r.uniquePilots >= 5) s.push(`${n(r.uniquePilots)} unique pilots`);
  if (r.aircraftVariety >= 4) s.push(`${n(r.aircraftVariety)} aircraft types`);
  if (r.weeksObserved >= 4) s.push(`${n(r.weeksObserved)} weeks with traffic`);
  if (r.trend === "rising") s.push("rising weekly traffic");
  return s;
}

export function DiscoveryTable({
  rows,
  onOpen,
  onWatch,
  busyIcao,
}: {
  rows: SystemAirportRow[];
  onOpen: (icao: string) => void;
  onWatch: (icao: string, watched: boolean) => void;
  busyIcao: string | null;
}) {
  if (rows.length === 0) {
    return (
      <div className="panel rounded-xl p-8 text-center text-sm text-muted-foreground">
        No system-owned airports with observed activity for the selected tiers yet. Run a tier scan
        to resolve airport ownership, then results appear here.
      </div>
    );
  }
  return (
    <div className="panel overflow-x-auto rounded-xl">
      <table className="w-full min-w-[900px] text-sm">
        <thead>
          <tr className="mono border-b border-border text-left text-[10px] uppercase tracking-widest text-muted-foreground">
            <th className="px-3 py-2">Airport</th>
            <th className="px-3 py-2">Ownership</th>
            <th className="px-3 py-2 text-right">T/L</th>
            <th className="px-3 py-2 text-right">Ops</th>
            <th className="px-3 py-2 text-right">Arr</th>
            <th className="px-3 py-2 text-right">Dep</th>
            <th className="px-3 py-2 text-right">Pilots</th>
            <th className="px-3 py-2 text-right">A/C types</th>
            <th className="px-3 py-2">Recent</th>
            <th className="px-3 py-2">Trend</th>
            <th className="px-3 py-2">Analyzed</th>
            <th className="px-3 py-2 text-right">Watch</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const signals = demandSignals(r);
            return (
              <tr key={r.icao} className="border-b border-border/50 last:border-0 hover:bg-secondary/30">
                <td className="px-3 py-2">
                  <button onClick={() => onOpen(r.icao)} className="text-left">
                    <span className="mono block text-xs text-runway">{r.icao}</span>
                    <span className="block max-w-[220px] truncate text-[11px] text-muted-foreground">
                      {r.name ?? "—"}
                    </span>
                  </button>
                  {signals.length >= 3 ? (
                    <span
                      title={signals.join(" · ")}
                      className="mono mt-1 inline-flex items-center gap-1 rounded bg-instrument/15 px-1.5 py-0.5 text-[9px] uppercase tracking-widest text-instrument ring-1 ring-instrument/30"
                    >
                      <Star className="h-2.5 w-2.5" /> Potential demand
                    </span>
                  ) : null}
                </td>
                <td className="mono px-3 py-2 text-[11px] text-muted-foreground">
                  {SYSTEM_OWNER_LABEL}
                </td>
                <td className="mono px-3 py-2 text-right text-[11px] tabular-nums">
                  T{r.tier ?? "—"} · L{r.level ?? "—"}
                </td>
                <td className="mono px-3 py-2 text-right tabular-nums">{n(r.operations)}</td>
                <td className="mono px-3 py-2 text-right tabular-nums text-muted-foreground">
                  {n(r.arrivals)}
                </td>
                <td className="mono px-3 py-2 text-right tabular-nums text-muted-foreground">
                  {n(r.departures)}
                </td>
                <td className="mono px-3 py-2 text-right tabular-nums">{n(r.uniquePilots)}</td>
                <td className="mono px-3 py-2 text-right tabular-nums">{n(r.aircraftVariety)}</td>
                <td className="mono px-3 py-2 text-[11px] text-muted-foreground">
                  {fmtDate(r.lastActivityAt)}
                </td>
                <td className="mono px-3 py-2 text-[11px]">
                  <TrendMark trend={r.trend} />
                </td>
                <td className="mono px-3 py-2 text-[11px] text-muted-foreground">
                  {r.analyzed ? fmtDate(r.lastAnalyzedAt) : "not yet analyzed"}
                </td>
                <td className="px-3 py-2 text-right">
                  <button
                    disabled={busyIcao === r.icao}
                    onClick={() => onWatch(r.icao, r.watched)}
                    className={cn(
                      "mono inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] uppercase tracking-widest ring-1 transition",
                      r.watched
                        ? "bg-runway/15 text-runway ring-runway/40"
                        : "bg-secondary/50 text-muted-foreground ring-border hover:text-foreground",
                    )}
                  >
                    {r.watched ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                    {r.watched ? "Watched" : "Watch"}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function WatchlistPanel({
  rows,
  onOpen,
  onRemove,
  onAnalyze,
  busyIcao,
}: {
  rows: SystemAirportWatchRow[] | undefined;
  onOpen: (icao: string) => void;
  onRemove: (icao: string) => void;
  onAnalyze: (icao: string) => void;
  busyIcao: string | null;
}) {
  return (
    <section className="panel mb-4 rounded-xl p-4">
      <div className="mono flex items-center gap-2 text-[10px] uppercase tracking-widest text-muted-foreground">
        <Radar className="h-3.5 w-3.5 text-runway" />
        Watched system airports
      </div>
      {!rows || rows.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Nothing watched yet. Watch an airport from the results below to keep it here permanently,
          independent of the current tier filter.
        </p>
      ) : (
        <div className="mt-3 grid gap-1.5 lg:grid-cols-2">
          {rows.map((w) => (
            <div
              key={w.icao}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg bg-secondary/40 px-3 py-2 ring-1 ring-border/60"
            >
              <button onClick={() => onOpen(w.icao)} className="min-w-0 text-left">
                <span className="mono block text-xs text-runway">{w.icao}</span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {w.name ?? "name not yet resolved"}
                </span>
                <span className="mono block text-[10px] text-muted-foreground">
                  {w.ownershipKnown
                    ? w.owner
                      ? `owned by ${w.owner}`
                      : SYSTEM_OWNER_LABEL
                    : "ownership not yet observed"}
                  {" · "}
                  {w.analyzed ? `analyzed ${fmtDate(w.lastAnalyzedAt)}` : "never analyzed"}
                </span>
              </button>
              <div className="flex shrink-0 gap-1">
                <button
                  onClick={() => onOpen(w.icao)}
                  className="mono rounded px-2 py-1 text-[10px] uppercase tracking-widest text-muted-foreground ring-1 ring-border hover:text-foreground"
                >
                  Open
                </button>
                <button
                  disabled={busyIcao === w.icao}
                  onClick={() => onAnalyze(w.icao)}
                  className="mono rounded bg-runway/10 px-2 py-1 text-[10px] uppercase tracking-widest text-runway ring-1 ring-runway/30 disabled:opacity-50"
                >
                  {w.analyzed ? "Refresh" : "Analyze"}
                </button>
                <button
                  onClick={() => onRemove(w.icao)}
                  className="mono rounded px-2 py-1 text-[10px] text-muted-foreground ring-1 ring-border hover:text-destructive"
                  title="Remove from watchlist"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------- radar-observed detail

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="panel rounded-xl p-4">
      <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground">{title}</div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="mono mt-1 text-lg tabular-nums text-foreground">{value}</div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="text-sm text-muted-foreground">{text}</p>;
}

export function RadarDetailPanels({ detail }: { detail: RadarDetail }) {
  const maxWeek = Math.max(1, ...detail.weeks.map((w) => w.operations));
  const windowLabel = detail.windowDays ? `${detail.windowDays}D` : "all observed";

  return (
    <div className="space-y-4">
      <section className="panel rounded-xl p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mono text-xs text-runway">{detail.icao}</div>
            <h2 className="font-display text-lg font-semibold">{detail.name ?? "Name not yet resolved"}</h2>
            <div className="mono mt-1 text-[11px] text-muted-foreground">
              {detail.ownershipKnown
                ? detail.owner
                  ? `owned by ${detail.owner}`
                  : SYSTEM_OWNER_LABEL
                : "ownership not yet observed"}
              {" · "}T{detail.tier ?? "—"} · L{detail.level ?? "—"}
            </div>
          </div>
          <div className="mono text-right text-[11px] text-muted-foreground">
            <div>Evidence source: Community Radar observations</div>
            <div>
              Observed weeks: {detail.weeks.length} of {detail.retainedWeeks} retained
            </div>
            <div>
              First seen {fmtDate(detail.firstObservedAt)} · last {fmtDate(detail.lastObservedAt)}
            </div>
          </div>
        </div>
      </section>

      <Panel title={`Operational profile · ${windowLabel}`}>
        {detail.operations === 0 ? (
          <Empty text="Not yet observed — the radar has not caught any traffic at this airport inside the selected period." />
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            <Stat label="Operations" value={n(detail.operations)} />
            <Stat label="Arrivals" value={n(detail.arrivals)} />
            <Stat label="Departures" value={n(detail.departures)} />
            <Stat label="Unique pilots" value={n(detail.uniquePilots)} />
            <Stat label="Aircraft types" value={n(detail.uniqueAircraft)} />
            <Stat label="Trend" value={<TrendMark trend={detail.trend} />} />
          </div>
        )}
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Demand history (observed weeks)">
          {detail.weeks.length === 0 ? (
            <Empty text="Not yet observed." />
          ) : (
            <div className="space-y-2">
              {detail.weeks.map((w) => (
                <div key={w.weekStartUtc} className="grid grid-cols-[92px_minmax(0,1fr)_auto] items-center gap-3">
                  <span className="mono text-[11px] text-muted-foreground">{fmtDate(w.weekStartUtc)}</span>
                  <span className="h-2 overflow-hidden rounded-full bg-secondary">
                    <span
                      className="block h-full rounded-full bg-runway"
                      style={{ width: `${Math.round((w.operations / maxWeek) * 100)}%` }}
                    />
                  </span>
                  <span className="mono text-[11px] tabular-nums text-foreground">
                    {n(w.operations)} ops · {n(w.uniquePilots)} pilots
                  </span>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Visitor intelligence">
          {detail.pilots.length === 0 ? (
            <Empty text="Not yet observed." />
          ) : (
            <div className="space-y-1.5">
              {detail.pilots.map((p) => (
                <div
                  key={p.username}
                  className="mono flex items-center justify-between rounded-lg bg-secondary/40 px-3 py-1.5 text-[11px] ring-1 ring-border/60"
                >
                  <span className="truncate text-foreground">{p.username}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {n(p.visits)} visits · {n(p.arrivals)} arr / {n(p.departures)} dep
                  </span>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <Panel title="Traffic composition (aircraft observed)">
        {detail.aircraft.length === 0 ? (
          <Empty text="Not yet observed." />
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {detail.aircraft.map((a) => (
              <span
                key={a.name}
                className="mono rounded-lg bg-secondary/50 px-2.5 py-1 text-[11px] text-muted-foreground ring-1 ring-border"
              >
                {a.name} <span className="tabular-nums text-foreground">×{n(a.visits)}</span>
              </span>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

export function RadarSourceNote({ detail }: { detail: RadarDetail }) {
  return (
    <div className="mono rounded-lg bg-instrument/10 px-3 py-2 text-[11px] leading-relaxed text-instrument ring-1 ring-instrument/30">
      SimFly publishes a flight log only for player-owned airports, so a full investigation cannot
      run here. Everything shown is what the Community Radar actually observed in the live feed,
      retained for {detail.retainedWeeks} SimFly weeks. Nothing is estimated to fill the gap.
    </div>
  );
}
