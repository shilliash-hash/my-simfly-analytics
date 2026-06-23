import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, useQuery, queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getSimflyPayload, getVisitorHistory } from "@/lib/simfly.functions";
import { useSimflyArgs } from "@/lib/viewed-user";
import { AppShell, PageHeader, TierPill, formatNumber } from "@/components/app-shell";
import { Crown } from "lucide-react";

export const Route = createFileRoute("/rankings")({
  component: Rankings,
  head: () => ({
    meta: [
      { title: "Rankings — SimFly Hub" },
      { name: "description", content: "Leaderboards: top hubs by PAX, top visitors, and PAX per rotation efficiency." },
    ],
  }),
});

function fmtPax(n: number) {
  return n >= 100 ? formatNumber(Math.round(n)) : n.toFixed(1);
}

function Rankings() {
  const fn = useServerFn(getSimflyPayload);
  const histFn = useServerFn(getVisitorHistory);
  const { keyTag, payload, username } = useSimflyArgs();
  const { data } = useSuspenseQuery(queryOptions({
    queryKey: ["simfly", keyTag],
    queryFn: () => fn(payload ? { data: payload } : undefined),
  }));
  const PAGES = 25; // 25 pages × 4 items = up to 100 flights per airport
  const history = useQuery({
    queryKey: ["simfly", "visitor-history", keyTag, PAGES],
    queryFn: () => histFn({ data: { pages: PAGES, ...(username ? { username } : {}) } }),
    staleTime: 5 * 60_000,
  });

  const topHubsByPax = [...data.airports].sort((a, b) => b.totalEarnedPax - a.totalEarnedPax).slice(0, 10);
  const topVisitors = (history.data?.visitors ?? []).slice(0, 10);
  const scanned = history.data?.scannedAirports ?? [];
  const sampledFlights = scanned.reduce((s, a) => s + a.flightsSampled, 0);
  const efficiency = [...data.airports]
    .filter((a) => a.totalRotations > 0)
    .map((a) => ({ ...a, ppr: a.totalEarnedPax / a.totalRotations }))
    .sort((a, b) => b.ppr - a.ppr)
    .slice(0, 10);

  return (
    <AppShell>
      <PageHeader
        eyebrow="Leaderboards"
        title="Rankings"
        description="Your airports ranked by PAX earned, lifetime efficiency, and community standing."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="panel rounded-xl p-5">
          <h2 className="font-display mb-4 text-lg font-semibold">Top hubs by lifetime PAX</h2>
          <ol className="space-y-2">
            {topHubsByPax.map((a, i) => (
              <li key={a.icao}>
                <Link to="/airports/$id" params={{ id: a.icao }}
                  className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-secondary/40">
                  <Rank n={i + 1} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-display truncate text-sm font-semibold">{a.icao}</span>
                      <TierPill tier={a.tier} />
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <div className="h-1 flex-1 overflow-hidden rounded-full bg-secondary">
                        <div
                          className="h-full bg-runway"
                          style={{ width: `${Math.min(100, a.levelProgress)}%` }}
                        />
                      </div>
                      <span className="mono text-[10px] text-muted-foreground">
                        L{a.level} · {Math.round(a.levelProgress)}% to next
                      </span>
                    </div>
                  </div>
                  <div className="mono shrink-0 text-sm text-runway">
                    {formatNumber(Math.round(a.totalEarnedPax))}
                  </div>
                </Link>
              </li>
            ))}
          </ol>
        </div>

        <div className="panel rounded-xl p-5">
          <h2 className="font-display mb-1 text-lg font-semibold">Top visitors to my hubs</h2>
          <p className="mb-3 text-[11px] text-muted-foreground">
            Aggregated from {formatNumber(sampledFlights)} sampled flights across {scanned.length} owned hub{scanned.length === 1 ? "" : "s"}.
            <br />
            <span className="text-runway">PAX I earned</span>{" / "}
            <span className="text-muted-foreground">PAX they earned</span>.
          </p>
          <ol className="space-y-2">
            {history.isLoading && (
              <li className="px-2 py-4 text-xs text-muted-foreground">Sampling visitor history…</li>
            )}
            {!history.isLoading && topVisitors.length === 0 && (
              <li className="px-2 py-4 text-xs text-muted-foreground">No visitor flights sampled yet.</li>
            )}
            {topVisitors.map((v, i) => (
              <li key={v.handle}>
                <Link
                  to="/players/$handle"
                  params={{ handle: v.handle }}
                  className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-secondary/40"
                >
                  <Rank n={i + 1} />
                  <div className="min-w-0 flex-1">
                    <div className="font-display truncate text-sm font-semibold">@{v.handle}</div>
                    <div className="truncate text-[11px] text-muted-foreground">
                      {v.visits} visits · {v.airports.length} hub{v.airports.length === 1 ? "" : "s"}
                    </div>
                  </div>
                  <div className="mono shrink-0 text-right text-sm">
                    <div className="text-runway">{fmtPax(v.paxForMe)}</div>
                    <div className="text-[10px] text-muted-foreground">{fmtPax(v.paxForVisitor)}</div>
                  </div>
                </Link>
              </li>
            ))}
          </ol>
        </div>


        <div className="panel rounded-xl p-5">
          <h2 className="font-display mb-1 text-lg font-semibold">PAX per rotation</h2>
          <p className="mb-3 text-[11px] text-muted-foreground">Lifetime PAX ÷ rotations · efficiency by hub.</p>
          <ol className="space-y-2">
            {efficiency.map((a, i) => (
              <li key={a.icao}>
                <Link to="/airports/$id" params={{ id: a.icao }}
                  className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-secondary/40">
                  <Rank n={i + 1} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-display truncate text-sm font-semibold">{a.icao}</span>
                      <TierPill tier={a.tier} />
                    </div>
                    <div className="truncate text-[11px] text-muted-foreground">
                      {a.totalRotations} rotations · {formatNumber(Math.round(a.totalEarnedPax))} PAX
                    </div>
                  </div>
                  <div className="mono shrink-0 text-sm text-runway">{a.ppr.toFixed(2)}/r</div>
                </Link>
              </li>
            ))}
            {efficiency.length === 0 && (
              <li className="px-2 py-4 text-xs text-muted-foreground">No rotation history yet.</li>
            )}
          </ol>
        </div>
      </div>
    </AppShell>
  );
}

function Rank({ n }: { n: number }) {
  return (
    <div
      className={`mono grid h-7 w-7 shrink-0 place-items-center rounded text-xs font-semibold ${
        n === 1
          ? "bg-tier-gold/20 text-tier-gold"
          : n <= 3
            ? "bg-tier-silver/15 text-tier-silver"
            : "bg-secondary text-muted-foreground"
      }`}
    >
      {n === 1 ? <Crown className="h-3.5 w-3.5" /> : n}
    </div>
  );
}
