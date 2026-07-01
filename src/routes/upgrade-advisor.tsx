import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { getSimflyPayload, getUpgradeAdvisor } from "@/lib/simfly.functions";
import type { UpgradeAdvisorRow } from "@/lib/simfly.functions";
import { useSimflyArgs } from "@/lib/viewed-user";
import { AppShell, PageHeader, formatNumber } from "@/components/app-shell";
import { cn } from "@/lib/utils";
import { Star } from "lucide-react";

export const Route = createFileRoute("/upgrade-advisor")({
  component: UpgradeAdvisorPage,
  head: () => ({
    meta: [
      { title: "Upgrade Advisor — SimFly Hub" },
      {
        name: "description",
        content:
          "ROI-based recommendation of which airport to upgrade next, derived from your real flight history and the Airport Payout Matrix.",
      },
    ],
  }),
});

type SortKey = "payback" | "daily" | "annual" | "cost" | "name";

function UpgradeAdvisorPage() {
  const fn = useServerFn(getSimflyPayload);
  const { keyTag, payload } = useSimflyArgs();
  const { data } = useSuspenseQuery(
    queryOptions({
      queryKey: ["simfly", keyTag],
      queryFn: () => fn(payload ? { data: payload } : undefined),
      staleTime: 5 * 60_000,
    }),
  );

  const airportsInput = useMemo(
    () =>
      data.airports.map((a) => ({
        icao: a.icao,
        name: a.name,
        tier: a.category,
        level: a.level,
        percToUser: a.percToUser ?? 0,
      })),
    [data.airports],
  );

  const advisorFn = useServerFn(getUpgradeAdvisor);
  const [windowDays, setWindowDays] = useState(60);
  const { data: advisor, isFetching, isError, refetch } = useQuery({
    queryKey: ["upgrade-advisor", keyTag, windowDays, airportsInput.length],
    queryFn: () =>
      advisorFn({
        data: { username: payload?.username, airports: airportsInput, windowDays },
      }),
    staleTime: 5 * 60_000,
    enabled: airportsInput.length > 0,
  });

  const [sortKey, setSortKey] = useState<SortKey>("payback");

  const rows = useMemo(() => {
    const list = [...(advisor?.rows ?? [])];
    list.sort((a, b) => {
      switch (sortKey) {
        case "daily":
          return b.dailyIncrease - a.dailyIncrease;
        case "annual":
          return b.annualIncrease - a.annualIncrease;
        case "cost":
          return a.upgradeCost - b.upgradeCost;
        case "name":
          return a.icao.localeCompare(b.icao);
        case "payback":
        default: {
          const av = a.paybackDays > 0 ? a.paybackDays : Number.POSITIVE_INFINITY;
          const bv = b.paybackDays > 0 ? b.paybackDays : Number.POSITIVE_INFINITY;
          return av - bv;
        }
      }
    });
    return list;
  }, [advisor, sortKey]);

  return (
    <AppShell>
      <PageHeader
        eyebrow="Analytics"
        title="Airport Upgrade Advisor"
        description="Purely data-driven. Uses the real TOTAL PAX your airports have received on landing (Airport Profit Split + Weekly Cycle ×3 bonus) and shows how long the current income needs to earn back the next upgrade cost. Advisory only — no game data is changed."
      />

      <div className="mb-5 flex flex-wrap items-end gap-3">
        <label className="text-xs uppercase tracking-wider text-foreground/60">
          History window
          <select
            value={windowDays}
            onChange={(e) => setWindowDays(Number(e.target.value))}
            className="mt-1 block bg-card border border-border rounded-md px-3 py-2 text-sm text-foreground"
          >
            <option value={30}>Last 30 days</option>
            <option value={60}>Last 60 days</option>
            <option value={90}>Last 90 days</option>
            <option value={180}>Last 180 days</option>
          </select>
        </label>
        <label className="text-xs uppercase tracking-wider text-foreground/60">
          Sort by
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="mt-1 block bg-card border border-border rounded-md px-3 py-2 text-sm text-foreground"
          >
            <option value="payback">Fastest payback</option>
            <option value="daily">Highest daily increase</option>
            <option value="annual">Highest annual increase</option>
            <option value="cost">Lowest upgrade cost</option>
            <option value="name">Airport name</option>
          </select>
        </label>
        <div className="ml-auto text-[11px] text-foreground/50">
          {isFetching ? "Crunching history…" : advisor ? `${rows.length} airports analysed` : ""}
        </div>
      </div>

      {isError && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">
          Failed to compute advisor.{" "}
          <button onClick={() => refetch()} className="underline">Retry</button>
        </div>
      )}

      {!advisor && !isError && (
        <div className="rounded-lg border border-border bg-card p-6 text-sm text-foreground/60">
          Sampling recent flight history…
        </div>
      )}

      {advisor && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((r) => (
            <AdvisorCard key={r.icao} row={r} />
          ))}
          {rows.length === 0 && (
            <div className="rounded-lg border border-border bg-card p-6 text-sm text-foreground/60">
              No owned airports.
            </div>
          )}
        </div>
      )}

      <p className="mt-6 text-[11px] text-foreground/50 max-w-3xl">
        Methodology: purely data-driven. Average per-arrival income is the
        mean TOTAL PAX credited to each airport (Airport Profit Split +
        Weekly Cycle ×3 bonus — the "Total" column in the Payout Matrix, i.e.
        what actually hits your wallet on landing) across every flight
        touching the airport in the last {advisor?.windowDays ?? windowDays}{" "}
        days, sampled from the same public airport history as the Payout
        Matrix. Payback = upgrade cost ÷ current daily income. No assumed
        per-level growth is applied — as new flights land after an upgrade,
        the historical average will naturally reflect the higher payout.
        Upgrade cost uses a tunable Tier × Level table in{" "}
        <code>src/lib/airport-upgrade-costs.ts</code>.
      </p>
    </AppShell>
  );
}

function AdvisorCard({ row }: { row: UpgradeAdvisorRow }) {
  const hasData = row.flightsSampled > 0 && row.dailyIncrease > 0;
  return (
    <article className="panel rounded-xl p-4 flex flex-col gap-3">
      <header className="flex items-baseline justify-between gap-3">
        <div>
          <div className="font-display text-xl font-semibold tracking-tight text-runway">
            {row.icao}
          </div>
          <div className="text-xs text-foreground/70 truncate max-w-[14rem]">{row.name}</div>
        </div>
        <div className="text-right">
          <div className="mono text-[10px] uppercase tracking-widest text-foreground/50">
            Tier {row.tier}
          </div>
          <div className="text-sm">
            L{row.level} <span className="text-foreground/50">→</span>{" "}
            <span className="text-instrument font-semibold">L{row.nextLevel}</span>
          </div>
        </div>
      </header>

      <dl className="grid grid-cols-2 gap-2 text-sm">
        <Field label="Upgrade cost" value={`${formatNumber(row.upgradeCost)} PAX`} />
        <Field
          label="Est. payback"
          value={
            hasData && row.paybackDays > 0
              ? `${Math.round(row.paybackDays)} d`
              : "—"
          }
          accent="instrument"
        />
        <Field
          label="Current daily PAX"
          value={hasData ? `${row.dailyIncrease.toFixed(2)} PAX` : "—"}
          accent="runway"
        />
        <Field
          label="Annual @ current rate"
          value={hasData ? `${formatNumber(Math.round(row.annualIncrease))} PAX` : "—"}
          accent="runway"
        />
      </dl>

      <footer className="flex items-center justify-between pt-2 border-t border-border/60">
        <Stars stars={row.stars} />
        <div className="text-right text-[11px]">
          <div className="text-foreground/70">{row.ratingLabel}</div>
          <div className="text-foreground/40">
            {row.flightsSampled} flights · {row.arrivalsPerDay.toFixed(1)}/day
          </div>
          {row.avgTotalPaxPerFlight > 0 && (
            <div className="text-instrument/80">
              avg {row.avgTotalPaxPerFlight.toFixed(2)} PAX/flight (incl. bonus)
            </div>
          )}
        </div>
      </footer>
    </article>
  );
}

function Field({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "runway" | "instrument";
}) {
  const tone =
    accent === "runway"
      ? "text-runway"
      : accent === "instrument"
        ? "text-instrument"
        : "text-foreground";
  return (
    <div>
      <dt className="mono text-[10px] uppercase tracking-widest text-foreground/50">
        {label}
      </dt>
      <dd className={cn("mono mt-0.5 font-semibold", tone)}>{value}</dd>
    </div>
  );
}

function Stars({ stars }: { stars: 1 | 2 | 3 | 4 | 5 }) {
  return (
    <div className="flex gap-0.5" aria-label={`${stars} of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={cn(
            "h-4 w-4",
            i <= stars ? "fill-instrument text-instrument" : "text-foreground/20",
          )}
        />
      ))}
    </div>
  );
}
