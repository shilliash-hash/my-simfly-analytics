import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import {
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ZAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  ReferenceLine,
  Legend,
} from "recharts";
import { Gauge, Info, Plane, Sparkles } from "lucide-react";

import { AppShell, PageHeader, formatNumber } from "@/components/app-shell";
import { useSimflyArgs } from "@/lib/viewed-user";
import {
  getAircraftEfficiency,
  type EfficiencyRow,
  type EfficiencyConfidence,
} from "@/lib/aircraft-efficiency.functions";

export const Route = createFileRoute("/aircraft-efficiency")({
  component: EfficiencyLabPage,
  head: () => ({
    meta: [
      { title: "Aircraft Efficiency Lab — SimFly Hub" },
      {
        name: "description",
        content:
          "PAX generated per hour of your own flight time, per owned aircraft, compared against generic SimFly aircraft.",
      },
      { property: "og:title", content: "Aircraft Efficiency Lab — SimFly Hub" },
      {
        property: "og:description",
        content:
          "Private analytics on how much PAX each of your aircraft produces per hour you personally fly it.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const RANGES = [
  { label: "90D", days: 90 },
  { label: "180D", days: 180 },
  { label: "365D", days: 365 },
  { label: "All", days: 0 },
] as const;

const CONF: Record<EfficiencyConfidence, { label: string; cls: string }> = {
  HIGH: { label: "High", cls: "text-runway" },
  MEDIUM: { label: "Medium", cls: "text-instrument" },
  LOW: { label: "Low", cls: "text-muted-foreground" },
};

const OWNED_COLOR = "hsl(189 94% 55%)";
const GENERIC_COLOR = "hsl(38 92% 55%)";

function hoursLabel(minutes: number): string {
  const h = minutes / 60;
  return h >= 10 ? `${Math.round(h)} h` : `${h.toFixed(1)} h`;
}

function EfficiencyLabPage() {
  const fn = useServerFn(getAircraftEfficiency);
  const { keyTag, username } = useSimflyArgs();
  const [days, setDays] = useState<number>(180);
  const [showHistogram, setShowHistogram] = useState(true);

  const { data, isLoading, error } = useQuery({
    queryKey: ["aircraftEfficiency", keyTag, days],
    queryFn: () =>
      fn({ data: { ...(username ? { username } : {}), ...(days ? { days } : {}) } }),
    staleTime: 60_000,
  });

  const rows = data?.rows ?? [];
  const scatter = useMemo(
    () =>
      rows.map((r) => ({
        x: r.minutes / 60,
        y: r.paxPerHour,
        z: r.flights,
        name: r.name,
        registration: r.registration,
        kind: r.kind,
        flights: r.flights,
      })),
    [rows],
  );
  const ranking = useMemo(() => rows.slice(0, 12), [rows]);

  return (
    <AppShell>
      <PageHeader
        eyebrow="Private analytics"
        title="Aircraft Efficiency Lab"
        description="PAX generated per hour of your own flight time — owned fleet versus generic aircraft. Read-only; no existing accounting is affected."
      />

      <div className="panel mb-4 flex flex-wrap items-center gap-2 rounded-xl p-3">
        <span className="mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Window
        </span>
        {RANGES.map((r) => (
          <button
            key={r.label}
            onClick={() => setDays(r.days)}
            className={`mono rounded-lg px-3 py-1.5 text-[11px] uppercase tracking-widest transition-colors ${
              days === r.days
                ? "bg-runway/20 text-runway"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {r.label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2 text-[11px] text-muted-foreground">
          <Info className="h-3.5 w-3.5" />
          Flights you personally piloted, ownership-period aware.
        </div>
      </div>

      {error && (
        <div className="panel rounded-xl p-6 text-sm text-destructive">
          {(error as Error).message}
        </div>
      )}

      {isLoading && (
        <div className="panel rounded-xl p-10 text-center text-sm text-muted-foreground">
          Reconstructing your flight production…
        </div>
      )}

      {data && !isLoading && (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-4">
            <Stat label="Analyzed flights" value={formatNumber(data.overall.flights)} />
            <Stat label="Your flight time" value={hoursLabel(data.overall.minutes)} />
            <Stat
              label="Average"
              value={`${data.overall.paxPerHour.toFixed(1)} PAX/h`}
              accent="runway"
            />
            <Stat
              label="Median"
              value={`${data.overall.medianPaxPerHour.toFixed(1)} PAX/h`}
              accent="instrument"
            />
          </div>

          <div className="panel mb-4 flex flex-wrap gap-x-6 gap-y-1 rounded-xl p-3 text-[11px] text-muted-foreground">
            <span className="mono uppercase tracking-widest">Excluded from efficiency</span>
            <span>Zero-income flights: <b className="text-foreground">{data.excluded.zeroIncomeFlights}</b></span>
            <span>Zero-PAX flights: <b className="text-foreground">{data.excluded.zeroPaxFlights}</b></span>
            <span>No duration: <b className="text-foreground">{data.excluded.noDurationFlights}</b></span>
            <span>Rental (other owner): <b className="text-foreground">{data.excluded.rentalFlights}</b></span>
          </div>

          {/* Scatter */}
          <section className="panel mb-4 rounded-xl p-4">
            <div className="mb-3 flex items-center gap-2">
              <Gauge className="h-4 w-4 text-runway" />
              <h2 className="font-display text-base font-semibold">Efficiency scatter</h2>
              <span className="ml-auto flex items-center gap-3 text-[11px] text-muted-foreground">
                <LegendDot color={OWNED_COLOR} label="Owned" />
                <LegendDot color={GENERIC_COLOR} label="Generic" />
              </span>
            </div>
            <div className="h-[340px]">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 10, right: 16, bottom: 24, left: 4 }}>
                  <CartesianGrid stroke="hsl(var(--border))" strokeOpacity={0.3} />
                  <XAxis
                    type="number"
                    dataKey="x"
                    name="Flight time"
                    unit="h"
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    type="number"
                    dataKey="y"
                    name="PAX/h"
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                  />
                  <ZAxis type="number" dataKey="z" range={[60, 420]} name="Flights" />
                  <ReferenceLine
                    y={data.overall.paxPerHour}
                    stroke="hsl(var(--muted-foreground))"
                    strokeDasharray="4 4"
                  />
                  <Tooltip
                    cursor={{ strokeDasharray: "3 3" }}
                    contentStyle={{
                      background: "hsl(var(--popover))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 10,
                      fontSize: 12,
                    }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const p = payload[0].payload as (typeof scatter)[number];
                      return (
                        <div className="rounded-lg border border-border bg-popover p-2 text-xs">
                          <div className="font-display font-semibold">{p.name}</div>
                          <div className="mono text-[10px] text-muted-foreground">
                            {p.registration}
                          </div>
                          <div className="mt-1">{p.y.toFixed(1)} PAX/h</div>
                          <div className="text-muted-foreground">
                            {p.x.toFixed(1)} h · {p.flights} flights
                          </div>
                        </div>
                      );
                    }}
                  />
                  <Scatter data={scatter} isAnimationActive={false}>
                    {scatter.map((p, i) => (
                      <Cell
                        key={i}
                        fill={p.kind === "owned" ? OWNED_COLOR : GENERIC_COLOR}
                        fillOpacity={0.7}
                      />
                    ))}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              X = total hours you flew the aircraft, Y = PAX per hour, bubble size = flight count.
              Dashed line marks your fleet-wide average.
            </p>
          </section>

          {/* Ranking */}
          <section className="panel mb-4 rounded-xl p-4">
            <div className="mb-3 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-instrument" />
              <h2 className="font-display text-base font-semibold">Efficiency ranking</h2>
            </div>
            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={ranking}
                  layout="vertical"
                  margin={{ top: 4, right: 24, bottom: 4, left: 8 }}
                >
                  <CartesianGrid stroke="hsl(var(--border))" strokeOpacity={0.3} horizontal={false} />
                  <XAxis
                    type="number"
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={150}
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    cursor={{ fill: "hsl(var(--secondary))", fillOpacity: 0.3 }}
                    contentStyle={{
                      background: "hsl(var(--popover))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 10,
                      fontSize: 12,
                    }}
                    formatter={(v: number) => [`${v.toFixed(1)} PAX/h`, "Average"]}
                  />
                  <Bar dataKey="paxPerHour" radius={[0, 4, 4, 0]} isAnimationActive={false}>
                    {ranking.map((r) => (
                      <Cell
                        key={r.key}
                        fill={r.kind === "owned" ? OWNED_COLOR : GENERIC_COLOR}
                        fillOpacity={0.8}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          {/* Distribution */}
          <section className="panel mb-4 rounded-xl p-4">
            <div className="mb-3 flex items-center gap-2">
              <h2 className="font-display text-base font-semibold">Flight distribution</h2>
              <button
                onClick={() => setShowHistogram((v) => !v)}
                className="mono ml-auto rounded-lg px-2 py-1 text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground"
              >
                {showHistogram ? "Hide" : "Show"}
              </button>
            </div>
            {showHistogram && (
              <div className="h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={data.histogram.map((b) => ({ ...b, band: `${b.from}–${b.to}` }))}
                    margin={{ top: 4, right: 16, bottom: 16, left: 4 }}
                  >
                    <CartesianGrid stroke="hsl(var(--border))" strokeOpacity={0.3} vertical={false} />
                    <XAxis dataKey="band" stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                    <Tooltip
                      cursor={{ fill: "hsl(var(--secondary))", fillOpacity: 0.3 }}
                      contentStyle={{
                        background: "hsl(var(--popover))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 10,
                        fontSize: 12,
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="owned" name="Owned" stackId="a" fill={OWNED_COLOR} fillOpacity={0.8} isAnimationActive={false} />
                    <Bar dataKey="generic" name="Generic" stackId="a" fill={GENERIC_COLOR} fillOpacity={0.8} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
            <p className="mt-2 text-[11px] text-muted-foreground">
              Per-flight PAX/hour, bucketed. Average {data.overall.paxPerHour.toFixed(1)} · median{" "}
              {data.overall.medianPaxPerHour.toFixed(1)} PAX/h.
            </p>
          </section>

          {/* Table */}
          <section className="panel overflow-hidden rounded-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="mono bg-secondary/40 text-[10px] uppercase tracking-widest text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 text-left">Aircraft</th>
                    <th className="px-4 py-3 text-left">Registration</th>
                    <th className="px-4 py-3 text-right">Flights</th>
                    <th className="px-4 py-3 text-right">Flight time</th>
                    <th className="px-4 py-3 text-right">Income</th>
                    <th className="px-4 py-3 text-right">PAX</th>
                    <th className="px-4 py-3 text-right">PAX/h</th>
                    <th className="px-4 py-3 text-right">PAX/min</th>
                    <th className="px-4 py-3 text-right">Median</th>
                    <th className="px-4 py-3 text-left">Best / worst</th>
                    <th className="px-4 py-3 text-left">Confidence</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <Row key={r.key} r={r} />
                  ))}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={11} className="px-4 py-10 text-center text-sm text-muted-foreground">
                        No qualifying flights in this window.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </AppShell>
  );
}

function Row({ r }: { r: EfficiencyRow }) {
  const conf = CONF[r.confidence];
  return (
    <tr className="border-t border-border transition-colors hover:bg-secondary/30">
      <td className="px-4 py-3 font-display font-semibold">
        <div className="flex items-center gap-2">
          <Plane
            className={`h-3.5 w-3.5 -rotate-45 ${r.kind === "owned" ? "text-runway" : "text-instrument"}`}
          />
          {r.name}
        </div>
      </td>
      <td className="mono px-4 py-3 text-muted-foreground">{r.registration}</td>
      <td className="mono px-4 py-3 text-right">{r.flights}</td>
      <td className="mono px-4 py-3 text-right">{hoursLabel(r.minutes)}</td>
      <td className="mono px-4 py-3 text-right">{formatNumber(Math.round(r.income))}</td>
      <td className="mono px-4 py-3 text-right text-runway">{formatNumber(Math.round(r.pax))}</td>
      <td className="mono px-4 py-3 text-right font-semibold">{r.paxPerHour.toFixed(1)}</td>
      <td className="mono px-4 py-3 text-right">{r.paxPerMinute.toFixed(2)}</td>
      <td className="mono px-4 py-3 text-right">{r.medianPaxPerHour.toFixed(1)}</td>
      <td className="mono px-4 py-3 text-[11px] text-muted-foreground">
        {r.best ? (
          <>
            <span className="text-runway">{r.best.paxPerHour.toFixed(1)}</span> {r.best.route}
            <br />
            <span className="text-instrument">{r.worst?.paxPerHour.toFixed(1)}</span>{" "}
            {r.worst?.route}
          </>
        ) : (
          "—"
        )}
      </td>
      <td className={`mono px-4 py-3 text-[11px] uppercase tracking-widest ${conf.cls}`}>
        {conf.label}
      </td>
    </tr>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2 w-2 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "runway" | "instrument";
}) {
  const tone =
    accent === "runway" ? "text-runway" : accent === "instrument" ? "text-instrument" : "text-foreground";
  return (
    <div className="panel rounded-xl p-4">
      <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className={`mt-1 font-display text-2xl font-semibold ${tone}`}>{value}</div>
    </div>
  );
}
