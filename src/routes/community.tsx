import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, useQueries, useQuery, queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getSimflyPayload,
  getAirportVisitors,
  getVisitorHistory,
} from "@/lib/simfly.functions";
import { useSimflyArgs } from "@/lib/viewed-user";
import { AppShell, PageHeader, formatNumber } from "@/components/app-shell";

export const Route = createFileRoute("/community")({
  component: Community,
  head: () => ({
    meta: [
      { title: "Community — SimFly Hub" },
      { name: "description", content: "Live and historical visitors flying through your airports." },
    ],
  }),
});

function fmtPax(n: number) {
  return n >= 100 ? formatNumber(Math.round(n)) : n.toFixed(1);
}

function Community() {
  const fn = useServerFn(getSimflyPayload);
  const visFn = useServerFn(getAirportVisitors);
  const histFn = useServerFn(getVisitorHistory);
  const { keyTag, payload, username } = useSimflyArgs();
  const { data } = useSuspenseQuery(queryOptions({
    queryKey: ["simfly", keyTag],
    queryFn: () => fn(payload ? { data: payload } : undefined),
  }));

  const airports = [...data.airports].sort((a, b) => b.totalEarnedPax - a.totalEarnedPax);

  const liveQueries = useQueries({
    queries: airports.map((a) => ({
      queryKey: ["simfly", "visitors", keyTag, a.icao],
      queryFn: () => visFn({ data: { icao: a.icao, ...(username ? { username } : {}) } }),
      staleTime: 30_000,
    })),
  });

  const history = useQuery({
    queryKey: ["simfly", "visitor-history", keyTag, 5],
    queryFn: () => histFn({ data: { pages: 5, ...(username ? { username } : {}) } }),
    staleTime: 5 * 60_000,
  });

  // Live aggregate (right now)
  const liveAgg = new Map<string, { handle: string; visits: number; airports: Set<string> }>();
  liveQueries.forEach((q, i) => {
    for (const v of q.data ?? []) {
      const row = liveAgg.get(v.username) ?? {
        handle: v.username,
        visits: 0,
        airports: new Set<string>(),
      };
      row.visits += 1;
      row.airports.add(airports[i].icao);
      liveAgg.set(v.username, row);
    }
  });
  const topLive = [...liveAgg.values()].sort((a, b) => b.visits - a.visits).slice(0, 12);

  const visitors = history.data?.visitors ?? [];
  const topByPaxForMe = visitors.slice(0, 20);

  return (
    <AppShell>
      <PageHeader
        eyebrow="Live + history"
        title="My visitors"
        description="Live traffic at your hubs plus a paginated history of who is flying through them and how much PAX you both earn."
      />

      {/* Historical fallback — visitor revenue across cycles */}
      <section className="mb-10">
        <div className="mb-3 flex items-end justify-between">
          <h2 className="font-display text-lg font-semibold">Visitor revenue (sampled history)</h2>
          <p className="mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {history.isLoading
              ? "Sampling latest flights…"
              : `${history.data?.scannedAirports.length ?? 0} hubs · ~${history.data?.pagesPerAirport ?? 0} pages each`}
          </p>
        </div>
        <p className="mb-3 text-xs text-muted-foreground">
          SimFly has no historical visitor-revenue API. We estimate it by paging the public
          per-airport flight log and aggregating earned PAX per pilot. The 7-day cycle
          window is exact for sampled flights; raise the page depth to widen the window.
        </p>

        <div className="panel overflow-x-auto rounded-xl">
          <table className="min-w-full text-sm">
            <thead className="border-b border-border/60 text-left">
              <tr className="mono text-[10px] uppercase tracking-widest text-muted-foreground">
                <th className="px-4 py-2">#</th>
                <th className="px-4 py-2">Visitor</th>
                <th className="px-4 py-2 text-right">Visits</th>
                <th className="px-4 py-2 text-right">PAX for me</th>
                <th className="px-4 py-2 text-right">PAX for visitor</th>
                <th className="px-4 py-2 text-right">7d cycle (me/visitor)</th>
                <th className="px-4 py-2">Hubs touched</th>
                <th className="px-4 py-2">Last seen</th>
              </tr>
            </thead>
            <tbody>
              {topByPaxForMe.map((v, i) => (
                <tr key={v.handle} className="border-b border-border/30 last:border-0">
                  <td className="mono px-4 py-2 text-xs text-muted-foreground">{i + 1}</td>
                  <td className="px-4 py-2">
                    <Link
                      to="/players/$handle"
                      params={{ handle: v.handle }}
                      className="font-display font-medium hover:text-runway"
                    >
                      @{v.handle}
                    </Link>
                  </td>
                  <td className="mono px-4 py-2 text-right text-xs">{v.visits}</td>
                  <td className="mono px-4 py-2 text-right text-sm text-runway">
                    {fmtPax(v.paxForMe)}
                  </td>
                  <td className="mono px-4 py-2 text-right text-xs text-muted-foreground">
                    {fmtPax(v.paxForVisitor)}
                  </td>
                  <td className="mono px-4 py-2 text-right text-xs">
                    <span className="text-instrument">{fmtPax(v.paxForMe7d)}</span>
                    <span className="text-muted-foreground"> / {fmtPax(v.paxForVisitor7d)}</span>
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex flex-wrap gap-1">
                      {v.airports.slice(0, 6).map((a) => (
                        <span
                          key={a.icao}
                          className="mono rounded bg-secondary px-1.5 py-0.5 text-[10px]"
                          title={`${a.visits} visits · ${fmtPax(a.paxForMe)} PAX for me`}
                        >
                          {a.icao}·{a.visits}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="mono px-4 py-2 text-[10px] text-muted-foreground">
                    {v.lastSeenAt.slice(0, 10)}
                  </td>
                </tr>
              ))}
              {topByPaxForMe.length === 0 && !history.isLoading && (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-xs text-muted-foreground">
                    No third-party flights found in the sampled window.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="font-display mb-3 text-lg font-semibold">Top live visitors (right now)</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {topLive.length === 0 && (
            <div className="panel rounded-xl p-5 text-sm text-muted-foreground">
              No live visitors at your airports right now.
            </div>
          )}
          {topLive.map((p) => (
            <Link
              key={p.handle}
              to="/players/$handle"
              params={{ handle: p.handle }}
              className="panel block rounded-xl p-4 transition-colors hover:bg-secondary/40"
            >
              <div className="flex items-center justify-between">
                <div className="font-display truncate text-base font-semibold">@{p.handle}</div>
                <div className="mono rounded bg-runway/15 px-2 py-0.5 text-xs text-runway">
                  {p.visits} live
                </div>
              </div>
              <div className="mono mt-2 text-[11px] uppercase tracking-widest text-muted-foreground">
                Touching: {[...p.airports].join(", ")}
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <h2 className="font-display mb-3 text-lg font-semibold">Per-airport visitor feed</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {airports.map((a, i) => {
            const q = liveQueries[i];
            const visitorsLive = q.data ?? [];
            const sample = history.data?.scannedAirports.find((x) => x.icao === a.icao);
            return (
              <div key={a.icao} className="panel rounded-xl p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <div className="mono text-[11px] uppercase tracking-widest text-runway">{a.icao}</div>
                    <div className="font-display text-sm font-semibold">{a.name}</div>
                  </div>
                  <div className="mono rounded bg-secondary px-2 py-1 text-xs">
                    {q.isLoading ? "…" : `${visitorsLive.length} live`}
                  </div>
                </div>
                <div className="mb-2 mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  Lifetime PAX: {formatNumber(Math.round(a.totalEarnedPax))}
                  {sample && (
                    <span className="ml-2">
                      · {sample.totalLandings} land / {sample.totalTakeoffs} takeoff
                    </span>
                  )}
                </div>
                {visitorsLive.length === 0 ? (
                  <div className="text-xs text-muted-foreground">No live visitors.</div>
                ) : (
                  <ul className="space-y-1.5 text-xs">
                    {visitorsLive.slice(0, 8).map((v) => (
                      <li key={v.id} className="flex items-center justify-between gap-2">
                        <Link to="/players/$handle" params={{ handle: v.username }}
                          className="truncate font-display font-medium hover:text-runway">
                          @{v.username}
                        </Link>
                        <span className="mono shrink-0 text-[10px] text-muted-foreground">
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
      </section>
    </AppShell>
  );
}
