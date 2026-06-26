import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { getSimflyPayload, getAirportPayoutMatrix } from "@/lib/simfly.functions";
import type { AirportPayoutMatrix, PayoutMatrixCell } from "@/lib/simfly.functions";
import { useSimflyArgs } from "@/lib/viewed-user";
import { AppShell, PageHeader } from "@/components/app-shell";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

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
        description="Estimated base per-flight PAX payout for every Aircraft Tier × Level, calculated from every completed flight in this airport's history. The Weekly Cycle First Movement (3×) bonus and other temporary multipliers are recorded as a separate transaction — we ignore only that bonus line and use the standard Airport Profit Split as the base payout, so bonus flights still count toward the sample. This normalization applies only to this matrix — Income, Activity, Stats, Visitors, Consistency and all other reports continue to show actual payouts received, bonuses included."
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
  const [selected, setSelected] = useState<PayoutMatrixCell | null>(null);

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
            {matrix.flightsExcluded.toLocaleString()} skipped (incomplete / missing tier)
            {" · "}
            {matrix.flightsSampled.toLocaleString()} sampled across {matrix.pagesFetched} pages
            {isFetching ? " · refreshing…" : ""}
          </p>
        </div>
        <p className="text-[10px] uppercase tracking-wider text-foreground/50 max-w-sm text-right">
          Base payout estimate · bonus filter applied only here.
          Income, Activity, Stats and Consistency keep showing real payouts with all bonuses.
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
                    return (
                      <MatrixCellTd
                        key={l}
                        cell={cell}
                        maxAvg={maxAvg}
                        onOpen={() => cell && setSelected(cell)}
                      />
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <footer className="px-5 py-3 border-t border-border text-[11px] text-foreground/50">
        Click any cell to inspect the individual flights contributing to its average.
        Cells with fewer than 3 flights are marked as low confidence; cells with no
        data show "Insufficient data". Results are cached for 15 minutes.
      </footer>

      <CellDetailsDialog
        icao={icao}
        cell={selected}
        onClose={() => setSelected(null)}
      />
    </section>
  );
}

function MatrixCellTd({
  cell,
  maxAvg,
  onOpen,
}: {
  cell?: PayoutMatrixCell;
  maxAvg: number;
  onOpen?: () => void;
}) {
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
      className="p-0"
      style={{
        backgroundColor: `rgba(34, 211, 238, ${0.05 + intensity * 0.22})`,
      }}
    >
      <button
        type="button"
        onClick={onOpen}
        title={`${cell.flights} flight${cell.flights === 1 ? "" : "s"} — click to see contributing flights`}
        className={cn(
          "w-full px-3 py-2 text-right tabular-nums cursor-pointer transition-colors hover:bg-cyan-400/10 focus:outline-none focus:ring-1 focus:ring-cyan-400/60",
          lowConfidence ? "text-foreground/60" : "text-foreground",
        )}
      >
        <div className="font-semibold">{cell.avgPax.toFixed(2)}</div>
        <div className="text-[10px] text-foreground/50">
          n={cell.flights}{lowConfidence ? " ·  low" : ""}
        </div>
      </button>
    </td>
  );
}

function CellDetailsDialog({
  icao,
  cell,
  onClose,
}: {
  icao: string;
  cell: PayoutMatrixCell | null;
  onClose: () => void;
}) {
  const open = !!cell;
  const [distSort, setDistSort] = useState<"none" | "asc" | "desc">("none");

  const sortedSamples = useMemo(() => {
    if (!cell) return [];
    if (distSort === "none") return cell.samples;
    const arr = [...cell.samples];
    arr.sort((a, b) => {
      const av = typeof a.distanceNm === "number" ? a.distanceNm : Number.POSITIVE_INFINITY;
      const bv = typeof b.distanceNm === "number" ? b.distanceNm : Number.POSITIVE_INFINITY;
      return distSort === "asc" ? av - bv : bv - av;
    });
    return arr;
  }, [cell, distSort]);

  const cycleDistSort = () =>
    setDistSort((s) => (s === "none" ? "asc" : s === "asc" ? "desc" : "none"));

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setDistSort("none");
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-2xl">
        {cell && (
          <>
            <DialogHeader>
              <DialogTitle>
                {icao} · Tier {cell.tier} · Level {cell.level}
              </DialogTitle>
              <DialogDescription>
                {cell.flights.toLocaleString()} flight{cell.flights === 1 ? "" : "s"} averaged{" "}
                <span className="text-foreground font-medium">{cell.avgPax.toFixed(3)} PAX</span>{" "}
                base payout. Bonus transactions (e.g. Weekly Cycle 3×) are shown for reference but
                are not part of the matrix average.
              </DialogDescription>
            </DialogHeader>

            <div className="mt-2 max-h-[60vh] overflow-y-auto rounded border border-border">
              <table className="w-full text-xs">
                <thead className="bg-muted/40 sticky top-0">
                  <tr className="text-[10px] uppercase tracking-wider text-foreground/60">
                    <th className="text-left px-3 py-2">When</th>
                    <th className="text-left px-3 py-2">Route</th>
                    <th className="text-right px-3 py-2">
                      <button
                        type="button"
                        onClick={cycleDistSort}
                        className="inline-flex items-center gap-1 uppercase tracking-wider hover:text-foreground transition-colors"
                        title="Sort by distance"
                      >
                        Distance
                        <span className="text-foreground/50">
                          {distSort === "asc" ? "▲" : distSort === "desc" ? "▼" : "↕"}
                        </span>
                      </button>
                    </th>
                    <th className="text-left px-3 py-2">Aircraft</th>
                    <th className="text-left px-3 py-2">Pilot</th>
                    <th className="text-right px-3 py-2">Base</th>
                    <th className="text-right px-3 py-2">Bonus</th>
                    <th className="text-right px-3 py-2">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedSamples.map((s) => (

                    <tr key={s.flightId} className="border-t border-border/60">
                      <td className="px-3 py-1.5 text-foreground/70 whitespace-nowrap">
                        {s.ts ? new Date(s.ts).toLocaleString() : "—"}
                      </td>
                      <td className="px-3 py-1.5 font-mono">
                        {s.role === "takeoff"
                          ? `${icao} → ${s.otherIcao}`
                          : `${s.otherIcao} → ${icao}`}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-foreground/70 whitespace-nowrap">
                        {typeof s.distanceNm === "number" ? `${Math.round(s.distanceNm)} NM` : "—"}
                      </td>
                      <td className="px-3 py-1.5">
                        {s.aircraftName}
                        {s.tailNumber ? (
                          <span className="text-foreground/50"> · {s.tailNumber}</span>
                        ) : null}
                      </td>
                      <td className="px-3 py-1.5 text-foreground/70">{s.pilot}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums font-semibold">
                        {s.basePax.toFixed(2)}
                      </td>
                      <td
                        className={cn(
                          "px-3 py-1.5 text-right tabular-nums",
                          s.bonusPax > 0 ? "text-amber-400" : "text-foreground/30",
                        )}
                      >
                        {s.bonusPax > 0 ? `+${s.bonusPax.toFixed(2)}` : "—"}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-foreground/70">
                        {s.totalPax.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {cell.samples.length < cell.flights ? (
              <p className="mt-2 text-[10px] text-foreground/50">
                Showing the {cell.samples.length} most recent of {cell.flights} contributing
                flights.
              </p>
            ) : null}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
