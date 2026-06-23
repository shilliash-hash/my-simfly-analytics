import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useSuspenseQuery, useQuery, queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getSimflyPayload, getAirportVisitors } from "@/lib/simfly.functions";
import { useSimflyArgs } from "@/lib/viewed-user";
import {
  AppShell, PageHeader, StatCard, TierPill, RotationCell, formatNumber, relativeTime,
} from "@/components/app-shell";
import { Coins, TrendingUp, Users, Percent, ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/airports/$id")({
  component: AirportDetail,
  head: ({ params }) => ({
    meta: [
      { title: `Hub ${params.id} — SimFly Hub` },
      { name: "description", content: "Airport detail: tier, level, rotations, lifetime PAX and live visitors." },
    ],
  }),
  notFoundComponent: () => (
    <AppShell>
      <PageHeader title="Airport not found" description="That airport isn't in your SimFly network." />
      <Link to="/airports" className="text-runway hover:underline">← Back to airports</Link>
    </AppShell>
  ),
});

function AirportDetail() {
  const { id } = Route.useParams();
  const fn = useServerFn(getSimflyPayload);
  const visFn = useServerFn(getAirportVisitors);
  const { keyTag, payload, username } = useSimflyArgs();
  const { data } = useSuspenseQuery(queryOptions({
    queryKey: ["simfly", keyTag],
    queryFn: () => fn(payload ? { data: payload } : undefined),
  }));
  const a = data.airports.find((x) => x.icao === id);
  if (!a) throw notFound();

  const visitorsQ = useQuery({
    queryKey: ["simfly", "visitors", keyTag, a.icao],
    queryFn: () => visFn({ data: { icao: a.icao, ...(username ? { username } : {}) } }),
    staleTime: 30_000,
  });
  const visitors = visitorsQ.data ?? [];

  const myFlightsHere = data.flights
    .filter((f) => f.departure === a.icao || f.destination === a.icao)
    .slice(0, 20);

  return (
    <AppShell>
      <Link to="/airports" className="mono mb-4 inline-flex items-center gap-1 text-[11px] uppercase tracking-widest text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3 w-3" /> All airports
      </Link>
      <PageHeader
        eyebrow={a.icao}
        title={a.name}
        description={`${a.country} · ${a.tierLabel}`}
        actions={<TierPill tier={a.tier} label={a.tierLabel} />}
      />

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Lifetime PAX" value={formatNumber(Math.round(a.totalEarnedPax))} icon={Coins}
          hint={`${formatNumber(Math.round(a.pax7d))} in 7d`} />
        <StatCard label="Level" value={`L${a.level}`} hint={`${Math.round(a.levelProgress)}% to next`} icon={TrendingUp} />
        <StatCard label="Rotation" value={`${a.rotation}/${a.maxRotation}`}
          hint={<RotationCell rotation={a.rotation} max={a.maxRotation} />} icon={Users} />
        <StatCard label="Owner cut" value={`${a.percToUser}%`} hint={`${a.totalRotations} lifetime rotations`} icon={Percent} />
      </section>

      <section className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="panel rounded-xl p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold">Live visitors</h2>
            <div className="mono rounded bg-runway/15 px-2 py-1 text-xs text-runway">
              {visitorsQ.isLoading ? "…" : `${visitors.length} now`}
            </div>
          </div>
          {visitors.length === 0 ? (
            <p className="text-sm text-muted-foreground">No live visitors right now.</p>
          ) : (
            <ul className="space-y-2">
              {visitors.map((v) => (
                <li key={v.id} className="flex items-center justify-between gap-3 text-sm">
                  <Link to="/players/$handle" params={{ handle: v.username }}
                    className="font-display truncate font-medium hover:text-runway">
                    @{v.username}
                  </Link>
                  <span className="mono shrink-0 text-[11px] text-muted-foreground">
                    {v.origin}→{v.destination} · {v.aircraftICAO} · {v.sim}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="panel rounded-xl p-5">
          <h2 className="font-display mb-3 text-lg font-semibold">My recent flights here</h2>
          {myFlightsHere.length === 0 ? (
            <p className="text-sm text-muted-foreground">No recent flights to or from {a.icao}.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {myFlightsHere.map((f) => (
                <li key={f.id} className="flex items-center justify-between gap-3">
                  <span className="mono text-runway">{f.departure} → {f.destination}</span>
                  <span className="mono text-[11px] text-muted-foreground">
                    {relativeTime(f.ts)} · +{f.pax.toFixed(2)} PAX
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <a
        href={`https://simfly.io/assets/airport/${a.icao}/details`}
        target="_blank"
        rel="noreferrer"
        className="mono mt-6 inline-block text-[11px] uppercase tracking-widest text-runway hover:underline"
      >
        Open on simfly.io →
      </a>
    </AppShell>
  );
}
