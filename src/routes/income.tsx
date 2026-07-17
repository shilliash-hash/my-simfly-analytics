import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import {
  ComposedChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
} from "recharts";
import {
  Coins,
  TrendingUp,
  Building2,
  Percent,
  Sparkles,
  Target,
  Activity,
  Info,
} from "lucide-react";
import { HubSupportGate } from "@/components/hub-support";
import { getHubSupportStatus } from "@/lib/hub-support.functions";
import {
  getIncomeSummary,
  type IncomeRange,
  type IncomeSummaryPayload,
} from "@/lib/income.functions";
import { AppShell, PageHeader, formatNumber } from "@/components/app-shell";
import { useSimflyArgs } from "@/lib/viewed-user";
import { cn } from "@/lib/utils";
import { IncomeLoadingSequence } from "@/components/income-loading-sequence";

export const Route = createFileRoute("/income")({
  component: IncomeRoute,
  head: () => ({
    meta: [
      { title: "Income Intelligence — SimFly Hub" },
      {
        name: "description",
        content:
          "Active vs passive income breakdown across your flights and airports — trends, composition, and concentration.",
      },
    ],
  }),
});

const RANGES: { id: IncomeRange; label: string }[] = [
  { id: "7d", label: "7d" },
  { id: "30d", label: "30d" },
  { id: "90d", label: "90d" },
  { id: "180d", label: "180d" },
  { id: "365d", label: "1y" },
  { id: "all", label: "All" },
];

function IncomeRoute() {
  const statusFn = useServerFn(getHubSupportStatus);
  const { keyTag, payload } = useSimflyArgs();
  const { data: status, isLoading } = useQuery({
    queryKey: ["hub-support", keyTag],
    queryFn: () => statusFn(payload ? { data: payload } : undefined),
    staleTime: 5 * 60_000,
  });

  if (isLoading) {
    return (
      <AppShell>
         <IncomeLoadingSequence variant="page" />
      </AppShell>
    );
  }
  if (!status?.active) {
    return (
      <AppShell>
        <PageHeader
          eyebrow="Premium"
          title="Income Intelligence"
          description="Active vs passive income across your flights and airport ecosystem."
        />
        <HubSupportGate featureName="Income Intelligence" />
      </AppShell>
    );
  }
  return <IncomeIntelligence />;
}

function IncomeIntelligence() {
  const fn = useServerFn(getIncomeSummary);
  const { keyTag, username } = useSimflyArgs();
  const [range, setRange] = useState<IncomeRange>("30d");

  const { data, isFetching } = useQuery({
    queryKey: ["income", keyTag, range],
    queryFn: () => fn({ data: { range, ...(username ? { username } : {}) } }),
    staleTime: 15 * 60_000,
  });

  return (
    <AppShell>
      <PageHeader
        eyebrow="Financial intelligence"
        title="Income Intelligence"
        description="How much you earn actively from your own missions vs passively from visitors to your airports — and where the momentum is."
        actions={
          <div className="flex items-center gap-1 rounded-lg border border-border/40 bg-secondary/40 p-1">
            {RANGES.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setRange(r.id)}
                className={cn(
                  "mono rounded-md px-2.5 py-1 text-[11px] uppercase tracking-widest transition-colors",
                  range === r.id
                    ? "bg-runway/15 text-runway ring-1 ring-runway/40"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {r.label}
          </button>
        )))
      }
    </div>
  }
/>

      {!data ? (
        <div className="panel rounded-xl p-6 text-sm text-muted-foreground">
          {isFetching ? "Computing income breakdown…" : "No data yet."}
        </div>
         <IncomeLoadingSequence variant="page" />
      ) : (
        <div className="relative">
          <IncomeContent data={data} />
          {isFetching && <IncomeLoadingSequence variant="overlay" />}
        </div>
      )}
    </AppShell>
  );
}

function IncomeContent({ data }: { data: IncomeSummaryPayload }) {
  const { totals, composition, timeseries, kpis, perAirportPassive, perAircraft, reconciliation } = data;

  return (
    <>
      {!reconciliation.withinTolerance && (
        <div className="mb-4 rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-300">
          <div className="mono mb-1 text-[10px] uppercase tracking-widest">Reconciliation warning</div>
          Active + Passive ({formatNumber(Math.round(reconciliation.computedTotal))}) does not equal the ledger total ({formatNumber(Math.round(reconciliation.ledgerTotal))}) — diff {reconciliation.diff.toFixed(2)}. Please report.
        </div>
      )}

      <section className="mb-6 grid gap-4 sm:grid-cols-3">
        <HeadlineTile
          label="Active Income"
          value={formatNumber(Math.round(totals.active))}
          hint={`${formatNumber(totals.activeFlights)} flights analysed Includes mission rewards, airports, aircraft and licence earnings.`}
          accent="runway"
          icon={Activity}
        />
        <HeadlineTile
          label="Passive Income"
          value={formatNumber(Math.round(totals.passive))}
          hint={`${formatNumber(totals.passiveFlights)} visitor events analysed Airport owner income and aircraft rental earnings.`}
          accent="instrument"
          icon={Building2}
        />
        <HeadlineTile
          label="Total Income"
          value={formatNumber(Math.round(totals.total))}
          hint={`All active and passive income events across ${totals.ownedAirports} owned airport${totals.ownedAirports === 1 ? "" : "s"}`}
          accent="gold"
          icon={Coins}
        />
      </section>

      {/* Composition donut + description */}
      <section className="mb-6 grid gap-4 lg:grid-cols-[380px_1fr]">
        <CompositionDonut composition={composition} total={totals.total} />
        <TrendChart series={timeseries} />
      </section>

      {/* KPI strip */}
      <section className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile
          icon={Percent}
          label="Passive Share"
          value={`${Math.round(kpis.passiveShare * 100)}%`}
          hint="of total income"
          accent="instrument"
        />
        <KpiTile
          icon={TrendingUp}
          label="Passive Momentum"
          value={
            kpis.passiveMomentum == null
              ? "—"
              : `${(kpis.passiveMomentum).toFixed(2)}×`
          }
          hint="last 30d ÷ prior 30d"
          accent={
            kpis.passiveMomentum != null && kpis.passiveMomentum >= 1
              ? "runway"
              : "muted"
          }
        />
        <KpiTile
          icon={Sparkles}
          label="Daily Average"
          value={formatNumber(Math.round(kpis.dailyAverage))}
          hint="income per day"
          accent="gold"
        />
        <KpiTile
          icon={Target}
          label="Concentration"
          value={`${Math.round(kpis.concentration * 100)}%`}
          hint={
            kpis.topAirport
              ? `top: ${kpis.topAirport.icao}`
              : "HHI across airports"
          }
          accent={kpis.concentration > 0.5 ? "instrument" : "runway"}
        />
      </section>

      {/* Component breakdown grid */}
      <section className="panel mb-6 rounded-xl p-5">
        <h2 className="font-display mb-4 text-lg font-semibold">Income by component</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {composition.map((c) => (
            <ComponentRow key={c.key} c={c} total={totals.total} series={timeseries} which={c.key} />
          ))}
        </div>
      </section>

      {/* Passive airport table */}
      {perAirportPassive.length > 0 && (
        <section className="panel mb-6 rounded-xl p-5">
          <h2 className="font-display mb-4 text-lg font-semibold">Passive income by airport</h2>
          <div className="overflow-hidden rounded-lg border border-border/40">
            <table className="w-full text-sm">
              <thead className="bg-secondary/40">
                <tr className="mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  <th className="p-2 text-left">Airport</th>
                  <th className="p-2 text-right">Visitor arrivals</th>
                  <th className="p-2 text-right">PAX generated</th>
                  <th className="p-2 text-right">Share</th>
                </tr>
              </thead>
              <tbody>
                {perAirportPassive.slice(0, 12).map((a) => {
                  const share = totals.passive > 0 ? a.pax / totals.passive : 0;
                  return (
                    <tr key={a.icao} className="border-t border-border/40">
                      <td className="p-2">
                        <span className="mono text-runway">{a.icao}</span>{" "}
                        <span className="text-muted-foreground">· {a.name}</span>
                      </td>
                      <td className="mono p-2 text-right">{formatNumber(a.flights)}</td>
                      <td className="mono p-2 text-right">{formatNumber(Math.round(a.pax))}</td>
                      <td className="mono p-2 text-right text-instrument">
                        {(share * 100).toFixed(1)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Income by aircraft */}
      {perAircraft.length > 0 && (
        <section className="panel mb-6 rounded-xl p-5">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="font-display text-lg font-semibold">Income by aircraft</h2>
            <span className="text-[11px] text-muted-foreground">
              Aircraft income only — airport and licence earnings are shown elsewhere.
            </span>
          </div>
          <div className="overflow-hidden rounded-lg border border-border/40">
            <table className="w-full text-sm">
              <thead className="bg-secondary/40">
                <tr className="mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  <th className="p-2 text-left">Aircraft</th>
                  <th className="p-2 text-left">Reg</th>
                  <th className="p-2 text-right">Flights (me)</th>
                  <th className="p-2 text-right">Flights (others)</th>
                  <th className="p-2 text-right">Active</th>
                  <th className="p-2 text-right">Passive rental</th>
                  <th className="p-2 text-right">Total</th>
                  <th className="p-2 text-right">Active %</th>
                  <th className="p-2 text-right">Passive %</th>
                </tr>
              </thead>
              <tbody>
                {perAircraft.map((a) => (
                  <tr key={a.aircraftId} className="border-t border-border/40">
                    <td className="p-2">{a.label}</td>
                    <td className="mono p-2 text-muted-foreground">{a.registration ?? "—"}</td>
                    <td className="mono p-2 text-right">{formatNumber(a.flightsMe)}</td>
                    <td className="mono p-2 text-right">{formatNumber(a.flightsOthers)}</td>
                    <td className="mono p-2 text-right text-runway">{formatNumber(Math.round(a.active))}</td>
                    <td className="mono p-2 text-right text-instrument">{formatNumber(Math.round(a.passive))}</td>
                    <td className="mono p-2 text-right">{formatNumber(Math.round(a.total))}</td>
                    <td className="mono p-2 text-right">{(a.activePct * 100).toFixed(0)}%</td>
                    <td className="mono p-2 text-right">{(a.passivePct * 100).toFixed(0)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Coverage note */}
      <section className="panel rounded-xl border border-instrument/30 bg-instrument/5 p-4">
        <div className="flex items-start gap-3">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-instrument" />
          <div className="text-xs leading-relaxed text-muted-foreground">
            <div className="mono mb-1 text-[10px] uppercase tracking-widest text-instrument">
              Coverage
            </div>
            {data.coverage.note} Range: {data.coverage.earliestFlight ?? "—"} →{" "}
            {data.coverage.latestFlight ?? "—"} · {formatNumber(kpis.coverageFlights)} flights
            analysed.
            {data.rangeStart && data.coverage.visitorEarliestFlight &&
              data.rangeStart < data.coverage.visitorEarliestFlight && (
                <div className="mt-1.5 text-[11px] text-instrument/90">
                  Passive history available from {data.coverage.visitorEarliestFlight.slice(0, 10)} — earlier visitor arrivals were not fetched by the accounting engine, so longer ranges may report the same passive totals.
                </div>
              )}
          </div>
        </div>
      </section>
    </>
  );
}

function HeadlineTile({
  label,
  value,
  hint,
  accent,
  icon: Icon,
}: {
  label: string;
  value: string;
  hint: string;
  accent: "runway" | "instrument" | "gold";
  icon: React.ComponentType<{ className?: string }>;
}) {
  const bar =
    accent === "runway"
      ? "bg-runway"
      : accent === "instrument"
        ? "bg-instrument"
        : "bg-tier-gold";
  const text =
    accent === "runway"
      ? "text-runway"
      : accent === "instrument"
        ? "text-instrument"
        : "text-tier-gold";
  return (
    <div className="panel relative overflow-hidden rounded-xl p-5">
      <div className={cn("absolute inset-x-0 top-0 h-0.5", bar)} />
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {label}
          </div>
          <div className={cn("mt-2 font-display text-3xl font-semibold tracking-tight", text)}>
            {value}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
        </div>
        <div
          className={cn(
            "grid h-10 w-10 place-items-center rounded-lg bg-secondary",
            text,
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

function KpiTile({
  icon: Icon,
  label,
  value,
  hint,
  accent,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint: string;
  accent: "runway" | "instrument" | "gold" | "muted";
}) {
  const text =
    accent === "runway"
      ? "text-runway"
      : accent === "instrument"
        ? "text-instrument"
        : accent === "gold"
          ? "text-tier-gold"
          : "text-muted-foreground";
  return (
    <div className="panel rounded-xl p-4">
      <div className="flex items-center justify-between">
        <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground">
          {label}
        </div>
        <Icon className={cn("h-4 w-4", text)} />
      </div>
      <div className={cn("mt-2 font-display text-2xl font-semibold", text)}>{value}</div>
      <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div>
    </div>
  );
}

function CompositionDonut({
  composition,
  total,
}: {
  composition: IncomeSummaryPayload["composition"];
  total: number;
}) {
  const data = composition.map((c) => ({
    name: c.label,
    value: c.amount,
    key: c.key,
  }));
  const colors: Record<string, string> = {
    active_missions: "var(--runway)",
    passive_visitors: "var(--instrument)",
  };
  return (
    <div className="panel rounded-xl p-5">
      <h2 className="font-display mb-4 text-lg font-semibold">Composition</h2>
      <div className="h-56 w-full">
        <ResponsiveContainer>
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              innerRadius={55}
              outerRadius={85}
              paddingAngle={2}
              stroke="var(--background)"
            >
              {data.map((d) => (
                <Cell key={d.key} fill={colors[d.key]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                background: "var(--popover)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                fontSize: 12,
              }}
              formatter={(v: number) => formatNumber(Math.round(v))}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="mt-2 space-y-1.5 text-xs">
        {composition.map((c) => {
          const pct = total > 0 ? (c.amount / total) * 100 : 0;
          return (
            <li key={c.key} className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <span
                  className="inline-block h-2 w-2 rounded-sm"
                  style={{ background: colors[c.key] }}
                />
                <span className="text-foreground">{c.label}</span>
              </span>
              <span className="mono text-muted-foreground">
                {formatNumber(Math.round(c.amount))} · {pct.toFixed(1)}%
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function TrendChart({ series }: { series: IncomeSummaryPayload["timeseries"] }) {
  const trimmed = useMemo(() => {
    if (series.length <= 90) return series;
    return series.slice(series.length - 90);
  }, [series]);

  return (
    <div className="panel rounded-xl p-5">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="font-display text-lg font-semibold">Historical trend</h2>
        <span className="mono text-[10px] uppercase tracking-widest text-muted-foreground">
          stacked · daily
        </span>
      </div>
      <div className="h-56 w-full">
        <ResponsiveContainer>
          <ComposedChart data={trimmed} margin={{ left: -10, right: 6, top: 6, bottom: 0 }}>
            <defs>
              <linearGradient id="gActive" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--runway)" stopOpacity={0.55} />
                <stop offset="100%" stopColor="var(--runway)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gPassive" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--instrument)" stopOpacity={0.55} />
                <stop offset="100%" stopColor="var(--instrument)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={(d: string) => d.slice(5)}
              stroke="var(--muted-foreground)"
              fontSize={11}
            />
            <YAxis
              stroke="var(--muted-foreground)"
              fontSize={11}
              tickFormatter={(v) => formatNumber(Number(v))}
            />
            <Tooltip
              contentStyle={{
                background: "var(--popover)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                fontSize: 12,
              }}
              formatter={(v: number, name: string) => [
                formatNumber(Math.round(Number(v))),
                name === "active" ? "Active" : "Passive",
              ]}
            />
            <Area
              type="monotone"
              dataKey="active"
              stackId="1"
              stroke="var(--runway)"
              strokeWidth={2}
              fill="url(#gActive)"
            />
            <Area
              type="monotone"
              dataKey="passive"
              stackId="1"
              stroke="var(--instrument)"
              strokeWidth={2}
              fill="url(#gPassive)"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function ComponentRow({
  c,
  total,
  series,
  which,
}: {
  c: IncomeSummaryPayload["composition"][number];
  total: number;
  series: IncomeSummaryPayload["timeseries"];
  which: "active_missions" | "passive_visitors";
}) {
  const pct = total > 0 ? (c.amount / total) * 100 : 0;
  const color = which === "active_missions" ? "var(--runway)" : "var(--instrument)";
  const key = which === "active_missions" ? "active" : "passive";
  const spark = useMemo(() => {
    if (series.length <= 60) return series;
    return series.slice(series.length - 60);
  }, [series]);
  return (
    <div className="rounded-lg border border-border/40 bg-secondary/20 p-4">
      <div className="flex items-baseline justify-between">
        <div>
          <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {c.label}
          </div>
          <div className="mt-1 font-display text-xl font-semibold" style={{ color }}>
            {formatNumber(Math.round(c.amount))}
          </div>
          <div className="text-[11px] text-muted-foreground">
            {formatNumber(c.flights)} flights · {pct.toFixed(1)}% share
          </div>
        </div>
        <div className="h-12 w-32 shrink-0">
          <ResponsiveContainer>
            <LineChart data={spark} margin={{ top: 4, bottom: 4, left: 0, right: 0 }}>
              <Line
                type="monotone"
                dataKey={key}
                stroke={color}
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
