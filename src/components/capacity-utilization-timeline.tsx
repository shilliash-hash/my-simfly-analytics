import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Check, ChevronDown, ChevronLeft, ChevronRight, Search } from "lucide-react";

import { getAirportUtilizationTimeline } from "@/lib/simfly.functions";
import { useSimflyArgs } from "@/lib/viewed-user";
import type { AirportExt } from "@/lib/types";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// Randomizer kolorow dla lotnisk
function colorForIcao(icao: string): string {
  if (!icao) return "hsl(0, 0%, 50%)";
  
  // Generujemy unikalną, dużą liczbę (hash) z liter ICAO lotniska
  let hash = 0;
  for (let i = 0; i < icao.length; i++) {
    hash = (hash * 31 + icao.charCodeAt(i)) >>> 0;
  }
  
  // Mapujemy wynik na pełne koło barw (od 0 do 359 stopni)
  const hue = hash % 360;
  
  // Rozrzucamy nasycenie (75%-95%) i jasność (52%-62%), aby kolory były żywe na ciemnym tle
  const saturation = 75 + (hash % 20); 
  const lightness = 52 + (hash % 10);  
  
  return `hsl(${hue} ${saturation}% ${lightness}%)`;
}


export function CapacityUtilizationTimeline({
  airports,
}: {
  airports: AirportExt[];
}) {
  const fn = useServerFn(getAirportUtilizationTimeline);
  const { keyTag, payload } = useSimflyArgs();
  const allIcaos = useMemo(() => airports.map((a) => a.icao), [airports]);
  const [selected, setSelected] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const WINDOW_SIZE = 7;
  // offset = number of weeks to shift back from the most recent window (0 = latest)
  const [offset, setOffset] = useState(0);

  const selectedKey = selected.slice().sort().join(",");
  const { data, isLoading, isError } = useQuery({
    queryKey: ["airport-utilization", keyTag, selectedKey],
    queryFn: () =>
      fn({
        data: {
          icaos: selected,
          ...(payload?.username ? { username: payload.username } : {}),
        },
      }),
    enabled: selected.length > 0,
    staleTime: 15 * 60_000,
  });

  const allChartData = useMemo(() => {
    if (!data?.weeks) return [];
    return data.weeks.map((w) => {
      const row: Record<string, number | string> = {
        week: `W${w.weekNumber}`,
        weekNumber: w.weekNumber,
        weekStartIso: w.weekStartIso,
      };
      for (const b of w.byAirport) {
        row[`${b.icao}__cap`] = b.capacity;
        row[`${b.icao}__used`] = b.used;
      }
      return row;
    });
  }, [data]);

  const totalWeeks = allChartData.length;
  const maxOffset = Math.max(0, totalWeeks - WINDOW_SIZE);
  const clampedOffset = Math.min(offset, maxOffset);
  const end = totalWeeks - clampedOffset;
  const start = Math.max(0, end - WINDOW_SIZE);
  const chartData = allChartData.slice(start, end);
  const canGoOlder = clampedOffset < maxOffset;
  const canGoNewer = clampedOffset > 0;

  const toggle = (icao: string) => {
    setSelected((prev) =>
      prev.includes(icao) ? prev.filter((x) => x !== icao) : [...prev, icao],
    );
  };

  return (
    <section className="panel mb-4 rounded-xl p-4">
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Capacity utilization
          </div>
          <h2 className="font-display text-xl font-semibold">
            Weekly arrivals vs capacity
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Bars show each airport's maximum weekly arrival slots. Lines show
            actual completed arrivals per SimFly week.
          </p>
        </div>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="flex min-w-[220px] items-center justify-between gap-2 rounded-lg border border-border bg-background/50 px-3 py-2 text-sm hover:border-primary"
            >
              <span className="flex items-center gap-2">
                <Search className="h-3.5 w-3.5 text-muted-foreground" />
                {selected.length === 0
                  ? "No airports selected"
                  : selected.length === allIcaos.length
                    ? `All airports (${allIcaos.length})`
                    : `${selected.length} of ${allIcaos.length} selected`}
              </span>
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72 p-0">
            <Command>
              <CommandInput placeholder="Search ICAO or name…" />
              <CommandList>
                <CommandEmpty>No airport found.</CommandEmpty>
                <CommandGroup>
                  <CommandItem
                    onSelect={() =>
                      setSelected((prev) =>
                        prev.length === allIcaos.length ? [] : allIcaos,
                      )
                    }
                    className="text-xs"
                  >
                    <Check
                      className={cn(
                        "mr-2 h-3.5 w-3.5",
                        selected.length === allIcaos.length
                          ? "opacity-100"
                          : "opacity-30",
                      )}
                    />
                    {selected.length === allIcaos.length
                      ? "Clear all"
                      : "Select all"}
                  </CommandItem>
                  {airports.map((a) => {
                    const on = selected.includes(a.icao);
                    return (
                      <CommandItem
                        key={a.icao}
                        value={`${a.icao} ${a.name}`}
                        onSelect={() => toggle(a.icao)}
                      >
                        <Check
                          className={cn(
                            "mr-2 h-3.5 w-3.5",
                            on ? "opacity-100" : "opacity-0",
                          )}
                        />
                        <span
                          className="mr-2 inline-block h-2 w-2 rounded-full"
                          style={{ backgroundColor: colorForIcao(a.icao) }}
                        />
                        <span className="mono text-runway">{a.icao}</span>
                        <span className="ml-2 truncate text-xs text-muted-foreground">
                          {a.name}
                        </span>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      {selected.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {selected.map((icao) => (
            <Badge
              key={icao}
              variant="outline"
              className="mono cursor-pointer gap-1.5 border-border text-[11px]"
              onClick={() => toggle(icao)}
            >
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: colorForIcao(icao) }}
              />
              {icao}
              <span className="text-muted-foreground">×</span>
            </Badge>
          ))}
        </div>
      )}

      {totalWeeks > 0 && (
        <div className="mb-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <div className="mono text-[10px] uppercase tracking-widest">
            {chartData.length > 0
              ? `Weeks ${chartData[0].week} – ${chartData[chartData.length - 1].week}`
              : "—"}
            <span className="ml-2 opacity-60">
              ({start + 1}–{end} of {totalWeeks})
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setOffset((o) => Math.min(maxOffset, o + WINDOW_SIZE))}
              disabled={!canGoOlder}
              className="flex items-center gap-1 rounded-md border border-border bg-background/50 px-2 py-1 hover:border-primary disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Older weeks"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Older
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
              aria-label="Newer weeks"
            >
              Newer
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      <div className="h-[380px] w-full">
        {selected.length === 0 ? (
          <EmptyState label="Select at least one airport to compare." />
        ) : isLoading ? (
          <EmptyState label="Scanning historical flight records…" />
        ) : isError ? (
          <EmptyState label="Failed to load utilization data." />
        ) : !chartData.length ? (
          <EmptyState label="No historical arrivals recorded yet." />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={chartData}
              margin={{ top: 10, right: 16, left: 0, bottom: 8 }}
            >
              <CartesianGrid
                stroke="hsl(var(--border))"
                strokeOpacity={0.3}
                vertical={false}
              />
              <XAxis
                dataKey="week"
                stroke="hsl(var(--muted-foreground))"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                minTickGap={16}
              />
              <YAxis
                stroke="hsl(var(--muted-foreground))"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
              />
              <Tooltip
                cursor={{ fill: "hsl(var(--muted) / 0.2)" }}
                content={<UtilizationTooltip selected={selected} />}
              />
                {selected.map((icao) => (
                <Bar
                  key={`bar-${icao}`}
                  dataKey={`${icao}__cap`}
                  name={`${icao} capacity`}
                  fill={colorForIcao(icao)}
                  fillOpacity={0.12}
                  stroke={colorForIcao(icao)}
                  strokeOpacity={0.25}
                  legendType="none"
                  isAnimationActive={false}
                />
              ))}
              {selected.map((icao) => (
                <Line
                  key={`line-${icao}`}
                  type="monotone"
                  dataKey={`${icao}__used`}
                  name={icao}
                  stroke={colorForIcao(icao)}
                  strokeWidth={2}
                  dot={{ r: 2.5, fill: colorForIcao(icao), strokeWidth: 0 }}
                  activeDot={{ r: 4 }}
                  isAnimationActive={false}
                />
              ))}
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-border/60 text-sm text-muted-foreground">
      {label}
    </div>
  );
}

function formatWeekRangeIso(isoString: string): string {
  if (!isoString) return "";
  const start = new Date(isoString);
  // Dodajemy 6 dni, aby wyznaczyć pełny tydzień SimFly (od poniedziałku do niedzieli)
  const end = new Date(start.getTime() + 6 * 24 * 60 * 60 * 1000);
  
  const formatOptions = { weekday: 'short', day: '2-digit', month: 'short' } as const;
  const startStr = start.toLocaleDateString('en-US', { ...formatOptions, timeZone: 'UTC' });
  const endStr = end.toLocaleDateString('en-US', { ...formatOptions, timeZone: 'UTC' });
  
  return `${startStr.replace(',', '')} – ${endStr.replace(',', '')}`;
}


type TooltipPayloadItem = {
  dataKey?: string | number;
  payload?: Record<string, number | string>;
};

function UtilizationTooltip({
  active,
  payload,
  label,
  selected,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string | number;
  selected: string[];
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload ?? {};
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-lg">
      <div className="mono mb-1.5 text-[10px] uppercase tracking-widest text-muted-foreground">
        {typeof row.weekStartIso === "string" ? formatWeekRangeIso(row.weekStartIso) : String(label)}
      </div>
      <div className="space-y-1">
        {selected.map((icao) => {
          const cap = Number(row[`${icao}__cap`] ?? 0);
          const used = Number(row[`${icao}__used`] ?? 0);
          const util = cap > 0 ? (used / cap) * 100 : 0;
          const unused = Math.max(0, cap - used);
          return (
            <div key={icao} className="flex items-center gap-2">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: colorForIcao(icao) }}
              />
              <span className="mono text-runway">{icao}</span>
              <span className="ml-auto tabular-nums text-foreground">
                {used}/{cap}
              </span>
              <span className="w-12 text-right tabular-nums text-muted-foreground">
                {util.toFixed(1)}%
              </span>
              <span className="w-10 text-right tabular-nums text-muted-foreground">
                {unused}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
