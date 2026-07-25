import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { getSimflyPayload, getAirportPayoutMatrix, getAllAirportPayoutMatrices, type AirportPayoutMatrix } from "@/lib/simfly.functions";
import { useAdminToken } from "@/lib/auth";
import { useSimflyArgs } from "@/lib/viewed-user";
import { AppShell, PageHeader, formatNumber } from "@/components/app-shell";
import { cn } from "@/lib/utils";
import { RefreshCw } from "lucide-react";

export const Route = createFileRoute("/payout-matrix")({
  component: PayoutMatrixPage,
  head: () => ({
    meta: [
      { title: "Payout Matrix — SimFly Hub" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
});

interface AirportMeta {
  icao: string;
  name: string;
  category: number;
  level: number;
  totalEarnedPax: number;
}

function PayoutMatrixPage() {
  const fn = useServerFn(getSimflyPayload);
  const { keyTag, payload } = useSimflyArgs();

  // Oryginalny useSuspenseQuery z wersji 1.0 — zablokowany twardym staleTime dla ochrony bazy
  const { data } = useSuspenseQuery({
    queryKey: ["simfly", keyTag, "v1.0.0-pure"],
    queryFn: () => fn(payload ? { data: payload } : undefined),
    staleTime: 30 * 60_000,
  });

  const airports = useMemo(
    () => [...data.airports].sort((a, b) => b.totalEarnedPax - a.totalEarnedPax),
    [data.airports],
  );

  const [icao, setIcao] = useState<string>(airports[0]?.icao ?? "");
  const pages = 63;

  return (
    <AppShell>
      <PageHeader
        eyebrow="Analytics"
        title="Airport Flat PAX Payout Matrix"
        description="Estimated base per-flight PAX payout for every Aircraft Tier × Level, calculated from every completed flight in this airport's history. The Weekly Cycle First Movement (3×) bonus and other temporary multipliers are recorded separately — the matrix average uses the standard Airport Profit Split as the base payout, while the drawer's Total column shows the actual airport-owner wallet credit after bonus and share adjustments."
      />

      <div className="mb-6 flex flex-wrap gap-3 items-end mt-6">
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
        <div className="text-[11px] text-foreground/50">
          Sample depth: fixed ~250 flights (≈2 months of activity for most airports).
        </div>
      </div>

      {icao && <MatrixCard icao={icao} pages={pages} />}

      <div className="mt-10">
        <CompareCard airports={airports} pages={pages} />
      </div>
    </AppShell>
  );
}
function CompareCard({ airports, pages }: { airports: AirportMeta[]; pages: number }) {
  const fn = useServerFn(getAllAirportPayoutMatrices);
  const { keyTag, payload } = useSimflyArgs();
  const adminToken = useAdminToken();
  const [tier, setTier] = useState<number>(1);

  const { data, isFetching } = useQuery({
    queryKey: ["payout-matrix", "compare-v1", keyTag, pages, adminToken ? "admin" : "user"],
    queryFn: () => fn({ data: { pages, username: payload?.username, ...(adminToken ? { adminToken } : {}) } }),
    staleTime: 15 * 60_000,
  });

  const columns = useMemo(
    () => [...airports].sort((a, b) => b.category - a.category || b.level - a.level || a.icao.localeCompare(b.icao)),
    [airports],
  );

  const matrixByIcao = useMemo(() => {
    const m = new Map<string, AirportPayoutMatrix>();
    for (const mx of data?.matrices ?? []) m.set(mx.icao.toUpperCase(), mx);
    return m;
  }, [data]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-xl font-semibold">Cross-airport comparison · Aircraft Tier {tier}</h2>
        <p className="text-xs text-muted-foreground">Same 250-flight sample as the table above. Pick an aircraft tier; each column is one of your airports (highest tier/level first) and each row is that tier's aircraft level. Click any cell to inspect its flights. {isFetching && <span className="text-runway animate-pulse ml-1">refreshing...</span>}</p>
      </div>
      <div className="flex gap-2">
        {[1, 2, 3, 4, 5].map((t) => (
          <button key={t} onClick={() => setTier(t)} className={cn("px-3 py-1.5 text-xs border border-border rounded-md font-medium transition-colors", tier === t ? "bg-runway text-background border-runway" : "bg-card text-foreground hover:bg-secondary")}>Tier {t}</button>
        ))}
      </div>
      <div className="panel overflow-x-auto rounded-xl">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[10px] uppercase tracking-widest text-muted-foreground">
              <th className="px-3 py-2 w-24">AC Level</th>
              {columns.map((c) => (
                <th key={c.icao} className="px-3 py-2 text-right">
                  <div className="font-display text-xs text-foreground font-semibold tracking-wide">{c.icao}</div>
                  <div className="text-[9px] lowercase text-muted-foreground/80 font-normal">t{c.category} l{c.level}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((lvl) => (
              <tr key={lvl} className="border-b border-border/40 hover:bg-secondary/30 last:border-none">
                <td className="mono px-3 py-2 font-medium text-xs text-muted-foreground">Level {lvl}</td>
                {columns.map((c) => {
                  const mx = matrixByIcao.get(c.icao.toUpperCase());
                  const cell = mx?.cells.find((x) => x.tier === tier && x.level === lvl);
                  return (
                    <td key={c.icao} className="mono px-3 py-2 text-right text-xs">
                      {cell && cell.count > 0 ? (
                        <div className="text-runway font-semibold">{cell.avgPayout.toFixed(2)}<span className="text-[10px] text-muted-foreground font-normal ml-0.5">PAX</span></div>
                      ) : (
                        <span className="text-muted-foreground/30">—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MatrixCard({ icao, pages }: { icao: string; pages: number }) {
  const fn = useServerFn(getAirportPayoutMatrix);
  const { keyTag, payload } = useSimflyArgs();
  const adminToken = useAdminToken();

  const { data, isFetching } = useQuery({
    queryKey: ["payout-matrix", "airport-credit-v2", keyTag, icao, pages, adminToken ? "admin" : "user"],
    queryFn: () => fn({ data: { icao, pages, username: payload?.username, ...(adminToken ? { adminToken } : {}) } }),
    staleTime: 15 * 60_000,
  });

  return <MatrixTable icao={icao} matrix={data} isFetching={isFetching} />;
}

function MatrixTable({ icao, matrix, isFetching }: { icao: string; matrix: AirportPayoutMatrix | undefined; isFetching: boolean }) {
  return (
    <div className="panel rounded-xl p-4 space-y-3 bg-card/40 border border-border/50">
      <div className="text-sm font-semibold flex items-center justify-between">
        <span>Flight History Matrix for {icao}</span>
        {isFetching && <span className="text-runway text-xs animate-pulse">sampling...</span>}
      </div>
      <div className="text-xs text-muted-foreground italic">
        {matrix ? `Sampled ${matrix.totalFlights} flights between ${fmtDate(matrix.oldestFlight)} and ${fmtDate(matrix.newestFlight)}.` : "Sampling flight history..."}
      </div>
    </div>
  );
}

function fmtDate(s: string | null | undefined): string {
  if (!s) return "—";
  try {
    return new Date(s).toISOString().replace("T", " ").slice(0, 16) + "Z";
  } catch {
    return s;
  }
}
