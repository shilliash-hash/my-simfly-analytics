import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ComposedChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Check, ChevronDown, ChevronLeft, ChevronRight, Info, Search } from "lucide-react";

import {
  getAircraftUtilizationTimeline,
  classifyAircraft,
  type UtilizationClass,
  type AircraftWeekCell,
} from "@/lib/aircraft-utilization.functions";
import { useSimflyArgs } from "@/lib/viewed-user";
import type { AircraftExt, MyLiveFlight } from "@/lib/types";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/components/app-shell";

const PALETTE = [
  "hsl(189 94% 55%)", "hsl(38 92% 55%)", "hsl(150 65% 55%)",
  "hsl(280 70% 65%)", "hsl(0 75% 62%)",  "hsl(210 90% 65%)",
  "hsl(48 95% 60%)",  "hsl(170 60% 50%)", "hsl(320 65% 65%)",
  "hsl(95 55% 55%)",
];
function colorFor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

const CLASS_STYLES: Record<UtilizationClass, { label: string; cls: string; hint: string }> = {
  WORKHORSE: { label: "Workhorse",  cls: "bg-runway/20 text-runway",           hint: "≥15% operational utilization (trailing 4w)" },
  ACTIVE:    { label: "Active",     cls: "bg-primary/15 text-primary",         hint: "5–15% operational utilization" },
  UNDERUSED: { label: "Underused",  cls: "bg-instrument/15 text-instrument",   hint: "2–5% operational utilization" },
  IDLE:      { label: "Idle",       cls: "bg-destructive/15 text-destructive", hint: "Available for weeks but virtually unused" },
  GROUNDED:  { label: "Grounded",   cls: "bg-muted text-foreground/80",        hint: "Currently on post-flight cooldown — neutral" },
  AIRBORNE:  { label: "Airborne",   cls: "bg-primary/15 text-primary",         hint: "Currently in the air" },
  UNKNOWN:   { label: "Unknown",    cls: "bg-muted text-muted-foreground",     hint: "Insufficient data" },
};

type SortKey = "utilization" | "activity" | "flights" | "hours" | "tier" | "level";
type ChartMetric = "operational" | "activity";

/** Trailing 4-week operational mean, falling back to flight activity when no grounded evidence. */
function trailingMetric(
  cells: Record<string, AircraftWeekCell> | undefined,
  weeks: { weekStartIso: string }[],
): { op: number | null; flights: number; hasEvidence: boolean } {
  if (!cells) return { op: null, flights: 0, hasEvidence: false };
  const trailing = weeks.slice(-4);
  let opSum = 0, opN = 0, faSum = 0, faN = 0, flights = 0, hasEvidence = false;
  for (const w of trailing) {
    const c = cells[w.weekStartIso];
    if (!c) continue;
    faSum += c.flightActivity; faN += 1;
    flights += c.flights;
    if (c.hasGroundedEvidence) hasEvidence = true;
    if (c.operationalUtilization !== null) { opSum += c.operationalUtilization; opN += 1; }
  }
  if (opN > 0) return { op: opSum / opN, flights, hasEvidence: true };
  if (faN > 0) return { op: faSum / faN, flights, hasEvidence };
  return { op: null, flights, hasEvidence };
}

export function AircraftUtilizationTimeline({
  ownedAircraft,
  liveByTail,
}: {
  ownedAircraft: AircraftExt[];
  liveByTail: Map<string, MyLiveFlight>;
}) {
  const fn = useServerFn(getAircraftUtilizationTimeline);
  const { keyTag, payload } = useSimflyArgs();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["aircraft-utilization", keyTag],
    queryFn: () => fn(payload ? { data: payload } : undefined),
    staleTime: 15 * 60_000,
  });

  const WINDOW_SIZE = 7;
  const [offset, setOffset] = useState(0);
  const [sortKey, setSortKey] = useState<SortKey>("utilization");
  const [chartMetric, setChartMetric] = useState<ChartMetric>("operational");
  const [selectorOpen, setSelectorOpen] = useState(false);

  const ownedById = useMemo(() => {
    const m = new Map<string, AircraftExt>();
    for (const a of ownedAircraft) m.set(a.aircraftId, a);
    return m;
  }, [ownedAircraft]);

  // Selector shows ONLY owned aircraft (per spec).
  const ownedIds = useMemo(() => ownedAircraft.map((a) => a.aircraftId), [ownedAircraft]);

  const labelFor = (id: string): string => {
    const own = ownedById.get(id);
    if (own) return own.tailNumber || own.icao || own.name || id.slice(0, 6);
    const info = data?.aircraft.find((a) => a.aircraftId === id);
    return info?.tailNumber || info?.icao || info?.name || id.slice(0, 6);
  };

  // Selection: default to top 6 by trailing operational utilization.
  const [selected, setSelected] = useState<string[] | null>(null);
  const effectiveSelected = useMemo(() => {
    if (selected) return selected;
    if (!data) return [];
    const scored = ownedIds.map((id) => {
      const { op } = trailingMetric(data.cells[id], data.weeks);
      return { id, u: op ?? 0 };
    });
    scored.sort((a, b) => b.u - a.u);
    return scored.slice(0, Math.min(6, scored.length)).map((x) => x.id);
  }, [selected, data, ownedIds]);

  const chartData = useMemo(() => {
    if (!data) return [] as Array<Record<string, number | string>>;
    const end = data.weeks.length - Math.min(offset, Math.max(0, data.weeks.length - WINDOW_SIZE));
    const start = Math.max(0, end - WINDOW_SIZE);
    return data.weeks.slice(start, end).map((w) => {
      const row: Record<string, number | string> = {
        week: `W${w.weekNumber}`,
        weekStartIso: w.weekStartIso,
      };
      for (const id of effectiveSelected) {
        const c = data.cells[id]?.[w.weekStartIso];
        let v: number;
        if (!c) v = 0;
        else if (chartMetric === "operational") {
          v = c.operationalUtilization !== null
            ? Math.round(c.operationalUtilization * 1000) / 10
            : Math.round(c.flightActivity * 1000) / 10;
        } else {
          v = Math.round(c.flightActivity * 1000) / 10;
        }
        row[`${id}__val`] = v;
      }
      return row;
    });
  }, [data, offset, effectiveSelected, chartMetric]);

  const totalWeeks = data?.weeks.length ?? 0;
  const maxOffset = Math.max(0, totalWeeks - WINDOW_SIZE);
  const canGoOlder = offset < maxOffset;
  const canGoNewer = offset > 0;

  const focusedWeekIso: string | null = chartData.length
    ? String(chartData[chartData.length - 1].weekStartIso)
    : null;
  const focusedFleet = focusedWeekIso ? data?.fleet[focusedWeekIso] : undefined;

  type Row = {
    aircraftId: string;
    reg: string;
    model: string;
    icao: string;
    tier: number;
    level: number;
    operational: number | null;
    activity: number | null;
    hasEvidence: boolean;
    flights: number;
    flightHours: number;
    cls: UtilizationClass;
    airborne: boolean;
    grounded: boolean;
    weekCell: AircraftWeekCell;
  };
  const rows: Row[] = useMemo(() => {
    if (!data || !focusedWeekIso) return [];
    return ownedAircraft.map((a) => {
      const cell = data.cells[a.aircraftId]?.[focusedWeekIso];
      const trailing = trailingMetric(data.cells[a.aircraftId], data.weeks);
      const airborne = a.tailNumber
        ? !!liveByTail.get(a.tailNumber.toLowerCase()) && !a.inGroundOperation
        : false;
      const cls = classifyAircraft(trailing.op, trailing.flights, {
        grounded: a.inGroundOperation,
        airborne,
      });
      const flightMinutes = cell?.activeMinutes ?? 0;
      const operationalCurrent = cell?.operationalUtilization ?? trailing.op;
      const activityCurrent = cell?.flightActivity ?? null;
      return {
        aircraftId: a.aircraftId,
        reg: a.tailNumber || a.icao,
        model: a.name,
        icao: a.icao,
        tier: a.category,
        level: a.level,
        operational: operationalCurrent,
        activity: activityCurrent,
        hasEvidence: cell?.hasGroundedEvidence ?? trailing.hasEvidence,
        flights: cell?.flights ?? 0,
        flightHours: flightMinutes / 60,
        cls,
        airborne,
        grounded: a.inGroundOperation,
        weekCell: cell ?? null,
      };
    });
  }, [data, focusedWeekIso, ownedAircraft, liveByTail]);

  const sortedRows = useMemo(() => {
    const arr = rows.slice();
    arr.sort((a, b) => {
      switch (sortKey) {
        case "utilization": return (b.operational ?? -1) - (a.operational ?? -1);
        case "activity":    return (b.activity ?? -1) - (a.activity ?? -1);
        case "flights":     return b.flights - a.flights;
        case "hours":       return b.flightHours - a.flightHours;
        case "tier":        return b.tier - a.tier;
        case "level":       return b.level - a.level;
      }
    });
    return arr;
  }, [rows, sortKey]);

  const totalOwned = ownedAircraft.length;
  const idleCount = rows.filter((r) => r.cls === "IDLE").length;
  const groundedCount = rows.filter((r) => r.cls === "GROUNDED").length;

  const toggle = (id: string) => {
    setSelected((prev) => {
      const base = prev ?? effectiveSelected;
      return base.includes(id) ? base.filter((x) => x !== id) : [...base, id];
    });
  };

  const metricLabel = chartMetric === "operational" ? "Operational utilization" : "Flight activity";

  return (
    <section className="panel mt-6 rounded-xl p-4">
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Aircraft utilization
          </div>
          <h2 className="font-display text-xl font-semibold">Weekly aircraft utilization</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Attribution is owner-based: every flight on a tail you own counts, no matter who operated it.
            Operational utilization ignores post-flight cooldown time; flight activity is calendar-based.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="mono flex items-center overflow-hidden rounded-lg border border-border text-[10px] uppercase tracking-widest">
            <button
              type="button"
              onClick={() => setChartMetric("operational")}
              className={cn("px-2 py-2", chartMetric === "operational" ? "bg-runway/20 text-runway" : "text-muted-foreground hover:bg-secondary/40")}
            >Operational</button>
            <button
              type="button"
              onClick={() => setChartMetric("activity")}
              className={cn("px-2 py-2 border-l border-border", chartMetric === "activity" ? "bg-runway/20 text-runway" : "text-muted-foreground hover:bg-secondary/40")}
            >Activity</button>
          </div>
          <Popover open={selectorOpen} onOpenChange={setSelectorOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="flex min-w-[220px] items-center justify-between gap-2 rounded-lg border border-border bg-background/50 px-3 py-2 text-sm hover:border-primary"
              >
                <span className="flex items-center gap-2">
                  <Search className="h-3.5 w-3.5 text-muted-foreground" />
                  {effectiveSelected.length === 0
                    ? "No aircraft selected"
                    : effectiveSelected.length === ownedIds.length
                      ? `All owned (${ownedIds.length})`
                      : `${effectiveSelected.length} of ${ownedIds.length} selected`}
                </span>
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 p-0">
              <Command>
                <CommandInput placeholder="Search tail or model…" />
                <CommandList>
                  <CommandEmpty>No aircraft found.</CommandEmpty>
                  <CommandGroup>
                    <CommandItem
                      onSelect={() =>
                        setSelected(effectiveSelected.length === ownedIds.length ? [] : ownedIds)
                      }
                      className="text-xs"
                    >
                      <Check className={cn("mr-2 h-3.5 w-3.5", effectiveSelected.length === ownedIds.length ? "opacity-100" : "opacity-30")} />
                      {effectiveSelected.length === ownedIds.length ? "Clear all" : "Select all"}
                    </CommandItem>
                    {ownedIds.map((id) => {
                      const on = effectiveSelected.includes(id);
                      const label = labelFor(id);
                      const own = ownedById.get(id);
                      return (
                        <CommandItem key={id} value={`${label} ${own?.name ?? ""}`} onSelect={() => toggle(id)}>
                          <Check className={cn("mr-2 h-3.5 w-3.5", on ? "opacity-100" : "opacity-0")} />
                          <span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: colorFor(id) }} />
                          <span className="mono text-runway">{label}</span>
                          <span className="ml-2 truncate text-xs text-muted-foreground">{own?.name ?? ""}</span>
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Summary strip */}
      <div className="mb-4 grid gap-2 sm:grid-cols-4">
        <Tile
          label="Fleet operational"
          value={focusedFleet?.fleetOperational !== undefined && focusedFleet?.fleetOperational !== null
            ? `${(focusedFleet.fleetOperational * 100).toFixed(1)}%`
            : focusedFleet ? `${(focusedFleet.fleetFlightActivity * 100).toFixed(1)}%*` : "—"}
          sub="Active ÷ (week − grounded). * = activity fallback"
          tone="runway"
        />
        <Tile
          label="Active aircraft"
          value={focusedFleet ? `${focusedFleet.activeAircraft} / ${totalOwned}` : "—"}
          sub="Flew ≥ 1 flight this week"
          tone="runway"
        />
        <Tile
          label="Idle aircraft"
          value={String(idleCount)}
          sub={`${groundedCount} on cooldown (neutral)`}
          tone={idleCount > 0 ? "instrument" : undefined}
        />
        <Tile
          label="Fleet rotations"
          value={focusedFleet ? formatNumber(focusedFleet.rotations) : "—"}
          sub="Completed flights this week"
        />
      </div>

      {effectiveSelected.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {effectiveSelected.map((id) => (
            <Badge
              key={id}
              variant="outline"
              className="mono cursor-pointer gap-1.5 border-border text-[11px]"
              onClick={() => toggle(id)}
            >
              <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: colorFor(id) }} />
              {labelFor(id)}
              <span className="text-muted-foreground">×</span>
            </Badge>
          ))}
        </div>
      )}

      {totalWeeks > 0 && (
        <div className="mb-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <div className="mono text-[10px] uppercase tracking-widest">
            {chartData.length > 0
              ? `${metricLabel} · Weeks ${chartData[0].week} – ${chartData[chartData.length - 1].week}`
              : "—"}
          </div>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => setOffset((o) => Math.min(maxOffset, o + WINDOW_SIZE))} disabled={!canGoOlder}
              className="flex items-center gap-1 rounded-md border border-border bg-background/50 px-2 py-1 hover:border-primary disabled:cursor-not-allowed disabled:opacity-40">
              <ChevronLeft className="h-3.5 w-3.5" /> Older
            </button>
            <button type="button" onClick={() => setOffset(0)} disabled={!canGoNewer}
              className="rounded-md border border-border bg-background/50 px-2 py-1 hover:border-primary disabled:cursor-not-allowed disabled:opacity-40">
              Latest
            </button>
            <button type="button" onClick={() => setOffset((o) => Math.max(0, o - WINDOW_SIZE))} disabled={!canGoNewer}
              className="flex items-center gap-1 rounded-md border border-border bg-background/50 px-2 py-1 hover:border-primary disabled:cursor-not-allowed disabled:opacity-40">
              Newer <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      <div className="h-[360px] w-full">
        {isLoading ? (
          <Empty label="Scanning aircraft flight history…" />
        ) : isError ? (
          <Empty label="Failed to load aircraft utilization." />
        ) : effectiveSelected.length === 0 ? (
          <Empty label="Select at least one aircraft to compare." />
        ) : !chartData.length ? (
          <Empty label="No flight history in the selected window." />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 10, right: 16, left: 0, bottom: 8 }}>
              <CartesianGrid stroke="hsl(var(--border))" strokeOpacity={0.3} vertical={false} />
              <XAxis dataKey="week" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false}
                tickFormatter={(v) => `${v}%`} domain={[0, (max: number) => Math.max(10, Math.ceil(max))]} />
              <Tooltip cursor={{ fill: "hsl(var(--muted) / 0.2)" }} content={<UtilTooltip selected={effectiveSelected} labelFor={labelFor} data={data} metric={chartMetric} />} />
              {effectiveSelected.map((id) => (
                <Bar key={id} dataKey={`${id}__val`} name={labelFor(id)}
                  fill={colorFor(id)} fillOpacity={0.75} isAnimationActive={false} radius={[3, 3, 0, 0]} />
              ))}
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Portfolio table */}
      <div className="mt-6 overflow-hidden rounded-xl border border-border">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="mono bg-secondary/40 text-[10px] uppercase tracking-widest text-muted-foreground">
              <tr>
                <Th>Aircraft</Th>
                <Th>Model</Th>
                <Th sortable active={sortKey === "tier"}  onClick={() => setSortKey("tier")}>Tier</Th>
                <Th sortable active={sortKey === "level"} onClick={() => setSortKey("level")}>Level</Th>
                <Th sortable active={sortKey === "utilization"} onClick={() => setSortKey("utilization")}>Operational %</Th>
                <Th sortable active={sortKey === "activity"} onClick={() => setSortKey("activity")}>Flight activity %</Th>
                <Th sortable active={sortKey === "flights"} onClick={() => setSortKey("flights")}>Rotations</Th>
                <Th sortable active={sortKey === "hours"} onClick={() => setSortKey("hours")}>Flight hours</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((r) => {
                const style = CLASS_STYLES[r.cls];
                return (
                  <tr key={r.aircraftId} className="border-t border-border transition-colors hover:bg-secondary/30">
                    <td className="mono px-4 py-2 text-runway">{r.reg}</td>
                    <td className="px-4 py-2">{r.model}</td>
                    <td className="mono px-4 py-2">T{r.tier}</td>
                    <td className="mono px-4 py-2">L{r.level}</td>
                    <td className="mono px-4 py-2">
                      {r.operational === null ? (
                        <span className="text-muted-foreground">Insufficient data</span>
                      ) : (
                        <span className={cn(
                          r.operational >= 0.30 ? "text-runway" : r.operational < 0.02 ? "text-destructive" : "",
                        )}>
                          {(r.operational * 100).toFixed(1)}%{!r.hasEvidence && <span className="text-muted-foreground">*</span>}
                        </span>
                      )}
                    </td>
                    <td className="mono px-4 py-2">
                      {r.activity === null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <span>{(r.activity * 100).toFixed(1)}%</span>
                      )}
                    </td>
                    <td className="mono px-4 py-2">{r.flights}</td>
                    <td className="mono px-4 py-2">{r.flightHours.toFixed(1)}h</td>
                    <td className="px-4 py-2">
                      <Popover>
                        <PopoverTrigger asChild>
                          <button type="button"
                            className={`mono inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] uppercase tracking-widest ${style.cls}`}>
                            {style.label}
                            <Info className="h-3 w-3 opacity-60" />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-72 text-xs">
                          <div className="mono mb-1 text-[10px] uppercase tracking-widest text-muted-foreground">
                            Classification evidence
                          </div>
                          <div className="font-medium">{style.label}</div>
                          <div className="mt-1 text-muted-foreground">{style.hint}</div>
                          <div className="mt-2 space-y-0.5">
                            <div>Trailing 4w operational: {r.operational !== null ? `${(r.operational * 100).toFixed(1)}%` : "—"}</div>
                            <div>Trailing 4w activity: {r.activity !== null ? `${(r.activity * 100).toFixed(1)}%` : "—"}</div>
                            <div>Rotations (this week): {r.flights}</div>
                            <div>Flight hours (this week): {r.flightHours.toFixed(2)}h</div>
                            {!r.hasEvidence && (
                              <div className="mt-1 text-instrument">* Partial evidence: no cooldown snapshot for this window. Operational shown as flight activity fallback.</div>
                            )}
                          </div>
                        </PopoverContent>
                      </Popover>
                    </td>
                  </tr>
                );
              })}
              {sortedRows.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-sm text-muted-foreground">No aircraft data.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
        Operational utilization = active flight time ÷ (observed week minutes − grounded minutes).
        Weeks without cooldown snapshots are shown as flight activity (marked *). Aircraft currently on
        a post-flight timer are labelled <span className="mono">GROUNDED</span> (neutral), never Idle.
      </p>
    </section>
  );
}

function Th({
  children, sortable, active, onClick,
}: { children: React.ReactNode; sortable?: boolean; active?: boolean; onClick?: () => void }) {
  return (
    <th onClick={onClick}
      className={`px-4 py-3 text-left ${sortable ? "cursor-pointer select-none hover:text-foreground" : ""} ${active ? "text-runway" : ""}`}>
      {children}
      {sortable && <span className="ml-1">{active ? "▼" : "↕"}</span>}
    </th>
  );
}

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "runway" | "instrument" }) {
  const t = tone === "runway" ? "text-runway" : tone === "instrument" ? "text-instrument" : "text-foreground";
  return (
    <div className="rounded-lg border border-border bg-background/40 p-3">
      <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className={`mt-1 font-display text-xl font-semibold ${t}`}>{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

function Empty({ label }: { label: string }) {
  return (
    <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-border/60 text-sm text-muted-foreground">
      {label}
    </div>
  );
}

type TooltipItem = { payload?: Record<string, number | string> };
function UtilTooltip({
  active, payload, label, selected, labelFor, data, metric,
}: {
  active?: boolean; payload?: TooltipItem[]; label?: string | number;
  selected: string[]; labelFor: (id: string) => string;
  data?: { cells: Record<string, Record<string, AircraftWeekCell>> };
  metric: ChartMetric;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload ?? {};
  const wsIso = typeof row.weekStartIso === "string" ? row.weekStartIso : "";
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-lg">
      <div className="mono mb-1.5 text-[10px] uppercase tracking-widest text-muted-foreground">
        {String(label)} · {wsIso ? new Date(wsIso).toUTCString().slice(0, 16) : ""} · {metric === "operational" ? "Operational" : "Activity"}
      </div>
      <div className="space-y-1">
        {selected.map((id) => {
          const cell = data?.cells[id]?.[wsIso];
          const val = !cell ? null
            : metric === "operational"
              ? (cell.operationalUtilization ?? cell.flightActivity)
              : cell.flightActivity;
          const partial = cell && metric === "operational" && cell.operationalUtilization === null;
          return (
            <div key={id} className="flex items-center gap-2">
              <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: colorFor(id) }} />
              <span className="mono text-runway">{labelFor(id)}</span>
              {cell === null || cell === undefined || val === null ? (
                <span className="ml-auto text-muted-foreground">no data</span>
              ) : (
                <>
                  <span className="ml-auto tabular-nums">{(val * 100).toFixed(1)}%{partial && <span className="text-muted-foreground">*</span>}</span>
                  <span className="w-16 text-right tabular-nums text-muted-foreground">{cell.flights} flt</span>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
