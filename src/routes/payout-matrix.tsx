import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { getSimflyPayload, getAirportPayoutMatrix } from "@/lib/simfly.functions";
import type { AirportPayoutMatrix, PayoutMatrixCell } from "@/lib/simfly.functions";
import { useSimflyArgs } from "@/lib/viewed-user";
import { AppShell, PageHeader } from "@/components/app-shell";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/payout-matrix")({
  component: PayoutMatrixPage,
  head: () => ({
    meta: [
      { title: "Payout Matrix — SimFly Hub" },
      {
        name: "description",
        content:
          "Estimated base PAX payout per aircraft Tier × Level for each of your airports, derived from real flight history with weekly bonuses excluded.",
      },
    ],
  }),
});

function PayoutMatrixPage() {
  const fn = useServerFn(getSimflyPayload);
  const { keyTag, payload } = useSimflyArgs();
  const { data } = useSuspenseQuery(
    queryOptions({
      queryKey: ["simfly", keyTag],
      queryFn: () => fn(payload ? { data: payload } : undefined),
      staleTime: 5 * 60_000,
    }),
  );

  const airports = useMemo(
    () => [...data.airports].sort((a, b) => b.totalEarnedPax - a.totalEarnedPax),
    [data.airports],
  );

  const [icao, setIcao] = useState<string>(airports[0]?.icao ?? "");
  const [pages, setPages] = useState<number>(50);

  return (
    <AppShell>
      <PageHeader
        eyebrow="Analytics"
        title="Airport Flat PAX Payout Matrix"
        description="Estimated base per-flight PAX payout for every Aircraft Tier × Level, calculated from this airport's real flight history. Flights with weekly 3× or other bonus multipliers are excluded so the matrix reflects the expected payout of a standard flight."
      />

      <div className="mb-6 flex flex-wrap gap-3 items-end">
        <label className="text-xs uppercase tracking-wider text-foreground/60">
          Airport
          <select
            value={icao}
            onChange={(e) => setIcao(e.target.value)}
            className="mt-1 block bg-card border border-border rounded-md px-3 py-2 text-sm text-foreground min-w-[14rem]"
          >
            {airports.map((a) => (
              <option key={a.icao} value={a.icao}>
                {a.icao} · {a.name} (T{a.category} L{a.level})
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs uppercase tracking-wider text-foreground/60">
          Sample depth
          <select
            value={pages}
            onChange={(e) => setPages(Number(e.target.value))}
            className="mt-1 block bg-card border border-border rounded-md px-3 py-2 text-sm text-foreground"
          >
            <option value={25}>25 pages (~100 flights)</option>
            <option value={50}>50 pages (~200 flights)</option>
            <option value={80}>80 pages (~320 flights)</option>
            <option value={120}>120 pages (~480 flights)</option>
          </select>
        </label>
      </div>

      {icao ? <MatrixCard icao={icao} pages={pages} /> : (
        <p className="text-foreground/70 text-sm">No airports available for this pilot.</p>
      )}
    </AppShell>
  );
}

function MatrixCard({ icao, pages }: { icao: string; pages: number }) {
  const fn = useServerFn(getAirportPayoutMatrix);
  const { keyTag, payload } = useSimflyArgs();
  const { data, isFetching, isError, refetch } = useQuery({
    queryKey: ["payout-matrix", keyTag, icao, pages],
    queryFn: () => fn({ data: { icao, pages, username: payload?.username } }),
    staleTime: 15 * 60_000,
  });

  if (isError) {
    return (
      <div className="rounded-lg border border-border bg-card p-6">
        <p className="text-sm text-destructive">Failed to load payout history for {icao}.</p>
        <button onClick={() => refetch()} className="mt-3 text-xs underline">Retry</button>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-sm text-foreground/60">
        Sampling flight history for {icao}…
      </div>
    );
  }

  return <MatrixTable icao={icao} matrix={data} isFetching={isFetching} />;
}

function MatrixTable({
  icao,
  matrix,
  isFetching,
}: {
  icao: string;
  matrix: AirportPayoutMatrix;
  isFetching: boolean;
}) {
  const byKey = useMemo(() => {
    const m = new Map<string, PayoutMatrixCell>();
    for (const c of matrix.cells) m.set(`${c.tier}:${c.level}`, c);
    return m;
  }, [matrix.cells]);

  const tiers = matrix.tiers;
  const levels = matrix.levels;
  const maxAvg = useMemo(
    () => matrix.cells.reduce((m, c) => Math.max(m, c.avgPax), 0) || 1,
    [matrix.cells],
  );

  return (
    <section className="rounded-lg border border-border bg-card overflow-hidden">
      <header className="flex flex-wrap items-baseline justify-between gap-3 px-5 py-4 border-b border-border">
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            {icao} · base PAX payout per Tier × Level
          </h2>
          <p className="text-xs text-foreground/60 mt-1">
            {matrix.flightsUsed.toLocaleString()} flights used
            {" · "}
            {matrix.flightsExcluded.toLocaleString()} excluded (bonus / incomplete)
            {" · "}
            {matrix.flightsSampled.toLocaleString()} sampled across {matrix.pagesFetched} pages
            {isFetching ? " · refreshing…" : ""}
          </p>
        </div>
        <p className="text-[10px] uppercase tracking-wider text-foreground/50 max-w-sm text-right">
          Estimated base payout — averages your airport's actual share
          (profit split already applied), excluding triple-payout and other bonuses.
        </p>
      </header>

      {tiers.length === 0 || levels.length === 0 ? (
        <div className="p-6 text-sm text-foreground/60">
          Not enough non-bonus flights in the sampled history yet. Try a deeper sample.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wider text-foreground/60">
                <th className="text-left px-4 py-2">Aircraft Tier</th>
                {levels.map((l) => (
                  <th key={l} className="px-3 py-2 text-right">L{l}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tiers.map((t) => (
                <tr key={t} className="border-t border-border/60">
                  <th className="text-left px-4 py-2 font-medium text-foreground/80">
                    Tier {t}
                  </th>
                  {levels.map((l) => {
                    const cell = byKey.get(`${t}:${l}`);
                    return <MatrixCellTd key={l} cell={cell} maxAvg={maxAvg} />;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <footer className="px-5 py-3 border-t border-border text-[11px] text-foreground/50">
        Confidence shown as flight count. Cells with fewer than 3 flights are
        marked as low confidence; cells with no data show "Insufficient data".
        Recalculate by re-selecting the airport — results are cached for 15 minutes.
      </footer>
    </section>
  );
}

function MatrixCellTd({ cell, maxAvg }: { cell?: PayoutMatrixCell; maxAvg: number }) {
  if (!cell) {
    return (
      <td className="px-3 py-2 text-right text-[11px] text-foreground/30 italic">
        Insufficient data
      </td>
    );
  }
  const intensity = Math.min(1, cell.avgPax / maxAvg);
  const lowConfidence = cell.flights < 3;
  return (
    <td
      className={cn(
        "px-3 py-2 text-right tabular-nums",
        lowConfidence ? "text-foreground/60" : "text-foreground",
      )}
      style={{
        backgroundColor: `rgba(34, 211, 238, ${0.05 + intensity * 0.22})`,
      }}
      title={`${cell.flights} flight${cell.flights === 1 ? "" : "s"} averaged${lowConfidence ? " (low confidence)" : ""}`}
    >
      <div className="font-semibold">{cell.avgPax.toFixed(2)}</div>
      <div className="text-[10px] text-foreground/50">
        n={cell.flights}{lowConfidence ? " ·  low" : ""}
      </div>
    </td>
  );
}
