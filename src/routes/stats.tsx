import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions, useQueries } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getSimflyPayload, getAirportVisitors } from "@/lib/simfly.functions";
import { useSimflyArgs } from "@/lib/viewed-user";
import { AppShell, PageHeader, formatNumber } from "@/components/app-shell";
import {
  ComposedChart, AreaChart, Area, BarChart, Bar, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";

export const Route = createFileRoute("/stats")({
  component: Stats,
  head: () => ({
    meta: [
      { title: "Stats — SimFly Hub" },
      { name: "description", content: "PAX earnings over time, PAX by asset, and live visitors on your airports." },
    ],
  }),
});

function Stats() {
  const fn = useServerFn(getSimflyPayload);
  const visFn = useServerFn(getAirportVisitors);
  const { keyTag, payload, username } = useSimflyArgs();
  const { data } = useSuspenseQuery(queryOptions({
    queryKey: ["simfly", keyTag],
    queryFn: () => fn(payload ? { data: payload } : undefined),
  }));

  const topAirports = [...data.airports]
    .sort((a, b) => b.totalEarnedPax - a.totalEarnedPax)
    .slice(0, 6);

  const visitorQueries = useQueries({
    queries: topAirports.map((a) => ({
      queryKey: ["simfly", "visitors", keyTag, a.icao],
      queryFn: () => visFn({ data: { icao: a.icao, ...(username ? { username } : {}) } }),
      staleTime: 30_000,
    })),
  });

  return (
    <AppShell>
      <PageHeader
        eyebrow="Analytics"
        title="Stats"
        description="Charts and live visitor activity across your airports."
      />

      <div className="panel mb-6 rounded-xl p-5">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="font-display text-lg font-semibold">PAX earnings · 30 days</h2>
          <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-sm bg-[var(--runway)]" />
              Your PAX
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-sm" style={{ background: "var(--instrument)" }} />
              Visitor PAX
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-sm bg-[var(--foreground)] opacity-60" />
              Total PAX
            </span>
            <span className="hidden sm:inline opacity-70">Combined daily token income (A + B).</span>
          </div>
        </div>
        <div className="h-72 w-full">
          <ResponsiveContainer>
            <ComposedChart
              data={data.earningsTimeseries.map((d) => ({
                ...d,
                paxTotal: (d.pax ?? 0) + (d.paxVisitors ?? 0),
              }))}
              margin={{ left: -10, right: 6, top: 6, bottom: 0 }}
            >
              <defs>
                <linearGradient id="gPax" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--runway)" stopOpacity={0.45} />
                  <stop offset="100%" stopColor="var(--runway)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gVisitors" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--instrument)" stopOpacity={0.45} />
                  <stop offset="100%" stopColor="var(--instrument)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis dataKey="date" tickFormatter={(d) => d.slice(5)} stroke="var(--muted-foreground)" fontSize={11} />
              <YAxis stroke="var(--muted-foreground)" fontSize={11} tickFormatter={(v) => formatNumber(Number(v))} />
              <Tooltip
                contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                formatter={(v: number, name) => {
                  const label =
                    name === "paxVisitors" ? "Visitor PAX" : name === "paxTotal" ? "Total PAX" : "Your PAX";
                  return [formatNumber(v) + " PAX", label];
                }}
              />
              <Bar dataKey="paxTotal" name="paxTotal" fill="rgba(255,255,255,0.12)" radius={[3, 3, 0, 0]} />
              <Area type="monotone" dataKey="pax" name="pax" stroke="var(--runway)" strokeWidth={2} fill="url(#gPax)" />
              <Area type="monotone" dataKey="paxVisitors" name="paxVisitors" stroke="var(--instrument)" strokeWidth={2} fill="url(#gVisitors)" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="panel mb-6 rounded-xl p-5">
        <h2 className="font-display mb-4 text-lg font-semibold">PAX by asset</h2>
        <div className="h-72 w-full">
          <ResponsiveContainer>
            <BarChart data={data.paxByAsset} margin={{ left: -10, right: 6, top: 6, bottom: 0 }}>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis dataKey="label" stroke="var(--muted-foreground)" fontSize={10} interval={0} angle={-20} textAnchor="end" height={60} />
              <YAxis stroke="var(--muted-foreground)" fontSize={11} tickFormatter={(v) => formatNumber(Number(v))} />
              <Tooltip
                contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                formatter={(v: number) => formatNumber(v) + " PAX"}
              />
              <Bar dataKey="pax" radius={[4, 4, 0, 0]}>
                {data.paxByAsset.map((d, i) => (
                  <Cell key={i} fill={d.kind === "hub" ? "var(--runway)" : d.kind === "aircraft" ? "var(--instrument)" : "var(--tier-platinum)"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div>
        <h2 className="font-display mb-3 text-xl font-semibold">Live visitors on my airports</h2>
        <p className="mb-4 text-xs text-muted-foreground">
          Players currently in flight to or from one of your owned airports (excluding yourself).
        </p>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {topAirports.map((a, i) => {
            const q = visitorQueries[i];
            const visitors = q.data ?? [];
            return (
              <div key={a.icao} className="panel rounded-xl p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <div className="mono text-[11px] uppercase tracking-widest text-runway">{a.icao}</div>
                    <div className="font-display text-sm font-semibold">{a.name}</div>
                  </div>
                  <div className="mono rounded bg-runway/15 px-2 py-1 text-xs text-runway">
                    {q.isLoading ? "…" : visitors.length} live
                  </div>
                </div>
                {visitors.length === 0 ? (
                  <div className="text-xs text-muted-foreground">No live visitors right now.</div>
                ) : (
                  <ul className="space-y-2 text-xs">
                    {visitors.slice(0, 6).map((v) => (
                      <li key={v.id} className="flex items-center justify-between gap-2">
                        <span className="truncate font-display font-medium">@{v.username}</span>
                        <span className="mono text-[10px] text-muted-foreground">
                          {v.origin}→{v.destination} · {v.aircraftICAO}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </AppShell>
  );
}
