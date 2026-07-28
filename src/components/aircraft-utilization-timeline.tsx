import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ComposedChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Check, ChevronDown, ChevronLeft, ChevronRight, Search } from "lucide-react";

import {
  getAircraftUtilizationTimeline,
  classifyAircraft,
  type UtilizationClass,
  type AircraftWeekCell,
} from "@/lib/aircraft-utilization.functions";
import { useSimflyArgs } from "@/lib/viewed-user";
import type { AircraftExt, MyLiveFlight } from "@/lib/types";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/components/app-shell";

const PALETTE = [
  "hsl(189 94% 55%)",
  "hsl(38 92% 55%)",
  "hsl(150 65% 55%)",
  "hsl(280 70% 65%)",
  "hsl(0 75% 62%)",
  "hsl(210 90% 65%)",
  "hsl(48 95% 60%)",
  "hsl(170 60% 50%)",
  "hsl(320 65% 65%)",
  "hsl(95 55% 55%)",
];
function colorFor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

const CLASS_STYLES: Record<UtilizationClass, { label: string; cls: string; hint: string }> = {
  WORKHORSE: { label: "Workhorse", cls: "bg-runway/20 text-runway", hint: "≥30% weekly utilization" },
  ACTIVE: { label: "Active", cls: "bg-primary/15 text-primary", hint: "10–30% weekly utilization" },
  UNDERUSED: { label: "Underused", cls: "bg-instrument/15 text-instrument", hint: "2–10% weekly utilization" },
  IDLE: { label: "Idle", cls: "bg-destructive/15 text-destructive", hint: "Available but virtually unused" },
  UNKNOWN: { label: "Unknown", cls: "bg-muted text-muted-foreground", hint: "Insufficient data" },
};

type SortKey = "utilization" | "flights" | "pax" | "income" | "tier" | "level";

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
  const [selectorOpen, setSelectorOpen] = useState(false);

  // Aircraft the user owns right now. Timeline may include older aircraft too;
  // we surface every owned aircraft in the table regardless.
  const ownedById = useMemo(() => {
    const m = new Map<string, AircraftExt>();
    for (const a of ownedAircraft) m.set(a.aircraftId, a);
    return m;
  }, [ownedAircraft]);

  const timelineAircraftIds = useMemo(() => (data ? data.aircraft.map((a) => a.aircraftId) : []), [data]);

  // Union: everything owned now + anything with historical evidence.
  const allIds = useMemo(() => {
    const s = new Set<string>();
    for (const a of ownedAircraft) s.add(a.aircraftId);
    for (const id of timelineAircraftIds) s.add(id);
    return Array.from(s);
  }, [ownedAircraft, timelineAircraftIds]);

  const labelFor = (id: string): string => {
    const own = ownedById.get(id);
    if (own) return own.tailNumber || own.icao || own.name || id.slice(0, 6);
    const info = data?.aircraft.find((a) => a.aircraftId === id);
    return info?.tailNumber || info?.icao || info?.name || id.slice(0, 6);
  };

  // Selection: default to top 6 by trailing utilization (recomputed once data loads).
  const [selected, setSelected] = useState<string[] | null>(null);
  const effectiveSelected = useMemo(() => {
    if (selected) return selected;
    if (!data) return [];
    const scored = allIds.map((id) => {
      const perWeek = data.cells[id];
      if (!perWeek) return { id, u: 0 };
      const weeks = data.weeks.slice(-4);
      let s = 0,
        n = 0;
      for (const w of weeks) {
        const c = perWeek[w.weekStartIso];
        if (c) {
          s += c.utilization;
          n += 1;
        }
      }
      return { id, u: n > 0 ? s / n : 0 };
    });
    scored.sort((a, b) => b.u - a.u);
    return scored.slice(0, Math.min(6, scored.length)).map((x) => x.id);
  }, [selected, data, allIds]);

  // Weekly windowed data for the chart.
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
        row[`${id}__util`] = c ? Math.round(c.utilization * 1000) / 10 : 0;
        row[`${id}__missing`] = c === null ? 1 : 0;
      }
      return row;
    });
  }, [data, offset, effectiveSelected]);

  const totalWeeks = data?.weeks.length ?? 0;
  const maxOffset = Math.max(0, totalWeeks - WINDOW_SIZE);
  const canGoOlder = offset < maxOffset;
  const canGoNewer = offset > 0;

  // Currently-viewed week = last visible week in the window.
  const focusedWeekIso: string | null = chartData.length ? String(chartData[chartData.length - 1].weekStartIso) : null;
  const focusedFleet = focusedWeekIso ? data?.fleet[focusedWeekIso] : undefined;

  // Table rows — every owned aircraft.
  type Row = {
    aircraftId: string;
    reg: string;
    model: string;
    icao: string;
    tier: number;
    level: number;
    utilization: number | null;
    flights: number;
    pax: number;
    income: number;
    cls: UtilizationClass;
    airborne: boolean;
    grounded: boolean;
  };
  const rows: Row[] = useMemo(() => {
    if (!data || !focusedWeekIso) return [];
    return ownedAircraft.map((a) => {
      const cell = data.cells[a.aircraftId]?.[focusedWeekIso];
      // trailing 4-week avg for classification
      const trailing = data.weeks.slice(-4);
      let tSum = 0,
        tObs = 0,
        tFlights = 0;
      for (const w of trailing) {
        const c = data.cells[a.aircraftId]?.[w.weekStartIso];
        if (c) {
          tSum += c.utilization;
          tObs += 1;
          tFlights += c.flights;
        }
      }
      const trailingUtil = tObs > 0 ? tSum / tObs : null;
      const airborne = a.tailNumber ? !!liveByTail.get(a.tailNumber.toLowerCase()) && !a.inGroundOperation : false;
      const cls = classifyAircraft(trailingUtil, tFlights, {
        grounded: a.inGroundOperation,
        airborne,
      });
      return {
        aircraftId: a.aircraftId,
        reg: a.tailNumber || a.icao,
        model: a.name,
        icao: a.icao,
        tier: a.category,
        level: a.level,
        utilization: cell ? cell.utilization : trailingUtil,
        flights: cell?.flights ?? 0,
        pax: cell?.pax ?? 0,
        income: cell?.income ?? 0,
        cls,
        airborne,
        grounded: a.inGroundOperation,
      };
    });
  }, [data, focusedWeekIso, ownedAircraft, liveByTail]);

  const sortedRows = useMemo(() => {
    const arr = rows.slice();
    arr.sort((a, b) => {
      switch (sortKey) {
        case "utilization":
          return (b.utilization ?? -1) - (a.utilization ?? -1);
        case "flights":
          return b.flights - a.flights;
        case "pax":
          return b.pax - a.pax;
        case "income":
          return b.income - a.income;
        case "tier":
          return b.tier - a.tier;
        case "level":
          return b.level - a.level;
      }
    });
    return arr;
  }, [rows, sortKey]);

  const totalOwned = ownedAircraft.length;
  const idleCount = rows.filter((r) => r.cls === "IDLE").length;

  const toggle = (id: string) => {
    setSelected((prev) => {
      const base = prev ?? effectiveSelected;
      return base.includes(id) ? base.filter((x) => x !== id) : [...base, id];
    });
  };

  return (
    <section className="panel mt-6 rounded-xl p-4">
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground">Aircraft utilization</div>
          <h2 className="font-display text-xl font-semibold">Weekly aircraft utilization</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            How actively each aircraft was used during each SimFly week. Under-used aircraft are aircraft that were
            available but rarely flown — not aircraft currently on a post-flight timer.
          </p>
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
                  : effectiveSelected.length === allIds.length
                    ? `All aircraft (${allIds.length})`
                    : `${effectiveSelected.length} of ${allIds.length} selected`}
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
                    onSelect={() => setSelected(effectiveSelected.length === allIds.length ? [] : allIds)}
                    className="text-xs"
                  >
                    <Check
                      className={cn(
                        "mr-2 h-3.5 w-3.5",
                        effectiveSelected.length === allIds.length ? "opacity-100" : "opacity-30",
                      )}
                    />
                    {effectiveSelected.length === allIds.length ? "Clear all" : "Select all"}
                  </CommandItem>
                  {allIds.map((id) => {
                    const on = effectiveSelected.includes(id);
                    const label = labelFor(id);
                    const own = ownedById.get(id);
                    return (
                      <CommandItem key={id} value={`${label} ${own?.name ?? ""}`} onSelect={() => toggle(id)}>
                        <Check className={cn("mr-2 h-3.5 w-3.5", on ? "opacity-100" : "opacity-0")} />
                        <span
                          className="mr-2 inline-block h-2 w-2 rounded-full"
                          style={{ backgroundColor: colorFor(id) }}
                        />
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

      {/* Summary strip */}
      <div className="mb-4 grid gap-2 sm:grid-cols-4">
        <Tile
          label="Fleet utilization"
          value={focusedFleet ? `${(focusedFleet.fleetUtilization * 100).toFixed(1)}%` : "—"}
          sub={`Average across ${data?.aircraft.length ?? 0} aircraft with data`}
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
          sub="Available but virtually unused (trailing 4w)"
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
            {chartData.length > 0 ? `Weeks ${chartData[0].week} – ${chartData[chartData.length - 1].week}` : "—"}
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setOffset((o) => Math.min(maxOffset, o + WINDOW_SIZE))}
              disabled={!canGoOlder}
              className="flex items-center gap-1 rounded-md border border-border bg-background/50 px-2 py-1 hover:border-primary disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft className="h-3.5 w-3.5" /> Older
            </button>
            <button
              type="button"
              onClick={() => setOffset(0)}
              disabled={!canGoNewer}
              className="rounded-md border border-border bg-background/50 px-2 py-1 hover:border-primary disabled:cursor-not-allowed disabled:opacity-40"
            >
              Latest
            </button>
            <button
              type="button"
              onClick={() => setOffset((o) => Math.max(0, o - WINDOW_SIZE))}
              disabled={!canGoNewer}
              className="flex items-center gap-1 rounded-md border border-border bg-background/50 px-2 py-1 hover:border-primary disabled:cursor-not-allowed disabled:opacity-40"
            >
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
              <XAxis
                dataKey="week"
                stroke="hsl(var(--muted-foreground))"
                fontSize={11}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                stroke="hsl(var(--muted-foreground))"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `${v}%`}
                domain={[0, (max: number) => Math.max(10, Math.ceil(max))]}
              />
              <Tooltip
                cursor={{ fill: "hsl(var(--muted) / 0.2)" }}
                content={<UtilTooltip selected={effectiveSelected} labelFor={labelFor} data={data} />}
              />
              {effectiveSelected.map((id) => (
                <Bar
                  key={id}
                  dataKey={`${id}__util`}
                  name={labelFor(id)}
                  fill={colorFor(id)}
                  fillOpacity={0.75}
                  isAnimationActive={false}
                  radius={[3, 3, 0, 0]}
                />
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
                <Th sortable active={sortKey === "tier"} onClick={() => setSortKey("tier")}>
                  Tier
                </Th>
                <Th sortable active={sortKey === "level"} onClick={() => setSortKey("level")}>
                  Level
                </Th>
                <Th sortable active={sortKey === "utilization"} onClick={() => setSortKey("utilization")}>
                  Utilization
                </Th>
                <Th sortable active={sortKey === "flights"} onClick={() => setSortKey("flights")}>
                  Flights
                </Th>
                <Th sortable active={sortKey === "pax"} onClick={() => setSortKey("pax")}>
                  PAX
                </Th>
                <Th sortable active={sortKey === "income"} onClick={() => setSortKey("income")}>
                  Income
                </Th>
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
                      {r.utilization === null ? (
                        <span className="text-muted-foreground">Insufficient data</span>
                      ) : (
                        <span
                          className={
                            r.utilization >= 0.3 ? "text-runway" : r.utilization < 0.02 ? "text-destructive" : ""
                          }
                        >
                          {(r.utilization * 100).toFixed(1)}%
                        </span>
                      )}
                    </td>
                    <td className="mono px-4 py-2">{r.flights}</td>
                    <td className="mono px-4 py-2 text-runway">{formatNumber(Math.round(r.pax))}</td>
                    <td className="mono px-4 py-2">{formatNumber(Math.round(r.income))}</td>
                    <td className="px-4 py-2">
                      <span
                        className={`mono inline-flex rounded px-1.5 py-0.5 text-[10px] uppercase tracking-widest ${style.cls}`}
                        title={style.hint}
                      >
                        {style.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {sortedRows.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-sm text-muted-foreground">
                    No aircraft data.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
        Utilization = active flight time ÷ observed week minutes. Historical weeks before an aircraft was owned are
        shown as “Insufficient data”, not zero. Classification uses trailing 4-week activity; aircraft currently on a
        post-flight timer are never labelled Idle.
      </p>
    </section>
  );
}

function Th({
  children,
  sortable,
  active,
  onClick,
}: {
  children: React.ReactNode;
  sortable?: boolean;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <th
      onClick={onClick}
      className={`px-4 py-3 text-left ${sortable ? "cursor-pointer select-none hover:text-foreground" : ""} ${active ? "text-runway" : ""}`}
    >
      {children}
      {sortable && <span className="ml-1">{active ? "▼" : "↕"}</span>}
    </th>
  );
}

function Tile({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "runway" | "instrument";
}) {
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
  active,
  payload,
  label,
  selected,
  labelFor,
  data,
}: {
  active?: boolean;
  payload?: TooltipItem[];
  label?: string | number;
  selected: string[];
  labelFor: (id: string) => string;
  data?: { cells: Record<string, Record<string, AircraftWeekCell>> };
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload ?? {};
  const wsIso = typeof row.weekStartIso === "string" ? row.weekStartIso : "";
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-lg">
      <div className="mono mb-1.5 text-[10px] uppercase tracking-widest text-muted-foreground">
        {String(label)} · {wsIso ? new Date(wsIso).toUTCString().slice(0, 16) : ""}
      </div>
      <div className="space-y-1">
        {selected.map((id) => {
          const cell = data?.cells[id]?.[wsIso];
          return (
            <div key={id} className="flex items-center gap-2">
              <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: colorFor(id) }} />
              <span className="mono text-runway">{labelFor(id)}</span>
              {cell === null || cell === undefined ? (
                <span className="ml-auto text-muted-foreground">no data</span>
              ) : (
                <>
                  <span className="ml-auto tabular-nums">{(cell.utilization * 100).toFixed(1)}%</span>
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
