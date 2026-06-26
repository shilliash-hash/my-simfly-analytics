import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { getRevenueConsistencyCheck } from "@/lib/simfly.functions";
import { useViewedUser } from "@/lib/viewed-user";
import { AppShell, PageHeader, formatNumber } from "@/components/app-shell";
import { CheckCircle2, AlertTriangle, RefreshCw } from "lucide-react";

export const Route = createFileRoute("/consistency")({
  component: ConsistencyPage,
  head: () => ({
    meta: [
      { title: "Revenue Consistency — SimFly Hub" },
      {
        name: "description",
        content:
          "Verify that PAX revenue attribution matches SimFly's payout distribution for every merged aircraft and airport flight.",
      },
    ],
  }),
});

function fmt(n: number) {
  return (Math.round(n * 100) / 100).toFixed(2);
}

function ConsistencyPage() {
  const fn = useServerFn(getRevenueConsistencyCheck);
  const username = useViewedUser();

  const keyTag = username?.toLowerCase() ?? "__self__";
  const [onlyMismatches, setOnlyMismatches] = useState(false);

  const { data, refetch, isFetching } = useSuspenseQuery(
    queryOptions({
      queryKey: ["consistency", keyTag],
      queryFn: () => fn(username ? { data: { username } } : undefined),
      staleTime: 60_000,
    }),
  );

  const rows = onlyMismatches ? data.rows.filter((r) => Math.abs(r.diff) > 0.01) : data.rows;
  const cleanRun = data.mismatches === 0;

  return (
    <AppShell>
      <PageHeader
        eyebrow="Audit"
        title="Revenue consistency"
        description="Compare per-flight payout from SimFly against what the hub credits you. Mismatches flag any flight where we under- or over-attribute PAX."
      />

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Flights examined" value={formatNumber(data.flightsExamined)} />
        <Stat label="Matches" value={formatNumber(data.matches)} tone="ok" />
        <Stat label="Mismatches" value={formatNumber(data.mismatches)} tone={cleanRun ? "ok" : "warn"} />
        <Stat label="Δ Attributed − Expected" value={fmt(data.totalAttributed - data.totalExpected)} tone={Math.abs(data.totalAttributed - data.totalExpected) < 0.01 ? "ok" : "warn"} />
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {cleanRun ? (
            <>
              <CheckCircle2 className="h-4 w-4 text-runway" />
              <span>Every flight's attribution matches the SimFly payout.</span>
            </>
          ) : (
            <>
              <AlertTriangle className="h-4 w-4 text-instrument" />
              <span>
                {data.mismatches} flight{data.mismatches === 1 ? "" : "s"} disagree with payout. Total drift{" "}
                {fmt(data.totalAttributed - data.totalExpected)} PAX.
              </span>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <label className="mono flex items-center gap-2 text-[11px] uppercase tracking-widest text-muted-foreground">
            <input
              type="checkbox"
              checked={onlyMismatches}
              onChange={(e) => setOnlyMismatches(e.target.checked)}
              className="accent-runway"
            />
            Only mismatches
          </label>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="mono inline-flex items-center gap-1 rounded border border-border px-3 py-1 text-[11px] uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
          >
            <RefreshCw className={`h-3 w-3 ${isFetching ? "animate-spin" : ""}`} />
            Re-scan
          </button>
        </div>
      </div>

      <div className="panel overflow-x-auto rounded-xl">
        <table className="mono w-full min-w-[900px] text-[11px]">
          <thead className="bg-background/40 text-[10px] uppercase tracking-widest text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">When</th>
              <th className="px-3 py-2 text-left">Pilot</th>
              <th className="px-3 py-2 text-left">Route</th>
              <th className="px-3 py-2 text-left">Own</th>
              <th className="px-3 py-2 text-right">Exp. Airport</th>
              <th className="px-3 py-2 text-right">Exp. Aircraft</th>
              <th className="px-3 py-2 text-right">Attributed</th>
              <th className="px-3 py-2 text-right">Δ</th>
              <th className="px-3 py-2 text-left">Sources</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => {
              const bad = Math.abs(r.diff) > 0.01;
              const own = [
                r.ownsOrigin && "O",
                r.ownsDestination && "D",
                r.ownsAircraft && "A",
              ].filter(Boolean).join("·") || "—";
              return (
                <tr key={r.flightID} className={bad ? "bg-instrument/5" : ""}>
                  <td className="px-3 py-2 text-muted-foreground">{r.ts.slice(0, 16).replace("T", " ")}</td>
                  <td className="px-3 py-2">@{r.pilot}</td>
                  <td className="px-3 py-2 text-runway">{r.origin || "—"} → {r.destination || "—"}</td>
                  <td className="px-3 py-2 text-instrument">{own}</td>
                  <td className="px-3 py-2 text-right">{fmt(r.expectedAirport)}</td>
                  <td className="px-3 py-2 text-right">{fmt(r.expectedAircraft)}</td>
                  <td className="px-3 py-2 text-right">{fmt(r.attributedTotal)}</td>
                  <td className={`px-3 py-2 text-right ${bad ? "text-instrument" : "text-muted-foreground"}`}>
                    {r.diff > 0 ? "+" : ""}{fmt(r.diff)}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{r.sources.join("+")}</td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-6 text-center text-muted-foreground">
                  Nothing to show.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="mono mt-4 text-[10px] uppercase tracking-widest text-muted-foreground">
        Scanned {data.scannedAirports} airports · {data.scannedAircraft} aircraft · {new Date(data.checkedAt).toLocaleTimeString()}
      </p>
    </AppShell>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "ok" | "warn" }) {
  const color = tone === "ok" ? "text-runway" : tone === "warn" ? "text-instrument" : "text-foreground";
  return (
    <div className="panel rounded-xl p-4">
      <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${color}`}>{value}</div>
    </div>
  );
}
