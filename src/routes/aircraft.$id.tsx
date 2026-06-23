import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getSimflyPayload } from "@/lib/simfly.functions";
import { useSimflyArgs } from "@/lib/viewed-user";
import { AppShell, PageHeader, StatCard, formatNumber, relativeTime } from "@/components/app-shell";
import { ArrowLeft, Coins, Trophy, Plane, MapPin } from "lucide-react";

export const Route = createFileRoute("/aircraft/$id")({
  component: AircraftDetail,
  head: ({ params }) => ({
    meta: [{ title: `Aircraft ${params.id} — SimFly Hub` }],
  }),
  notFoundComponent: () => (
    <AppShell>
      <PageHeader title="Aircraft not found" description="That aircraft isn't in your fleet." />
      <Link to="/aircraft" className="text-runway hover:underline">← Back to aircraft</Link>
    </AppShell>
  ),
});

function AircraftDetail() {
  const { id } = Route.useParams();
  const fn = useServerFn(getSimflyPayload);
  const { keyTag, payload } = useSimflyArgs();
  const { data } = useSuspenseQuery(queryOptions({
    queryKey: ["simfly", keyTag],
    queryFn: () => fn(payload ? { data: payload } : undefined),
  }));
  const plane = data.airplanes.find((p) => p.aircraftId === id);
  if (!plane) throw notFound();

  const flights = data.flights.filter((f) => f.aircraftId === id).slice(0, 20);

  return (
    <AppShell>
      <Link to="/aircraft" className="mono mb-4 inline-flex items-center gap-1 text-[11px] uppercase tracking-widest text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3 w-3" /> All aircraft
      </Link>
      <PageHeader
        eyebrow={plane.tailNumber || plane.icao}
        title={plane.name}
        description={
          <span className="inline-flex items-center gap-2">
            <Plane className="h-4 w-4 -rotate-45" /> {plane.icao} · based at{" "}
            <MapPin className="h-3 w-3" /> {plane.currentIcao || "—"}
          </span>
        }
      />

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Lifetime PAX" value={formatNumber(Math.round(plane.totalEarnedPax))} icon={Coins} />
        <StatCard label="Lifetime XP" value={formatNumber(Math.round(plane.totalEarnedXp))} icon={Trophy} />
        <StatCard label="Level" value={`L${plane.level}`} hint={`${Math.round(plane.levelProgress)}% to next`} icon={Trophy} />
        <StatCard
          label="Status"
          value={plane.inGroundOperation ? "Ground op" : "Ready"}
          hint={plane.groundedUntil ? `Until ${plane.groundedUntil.slice(0, 16).replace("T", " ")}` : ""}
        />
      </section>

      <section className="mt-8">
        <h2 className="font-display mb-3 text-xl font-semibold">Recent flights ({flights.length})</h2>
        <div className="panel overflow-hidden rounded-xl">
          <table className="w-full text-sm">
            <thead className="mono bg-secondary/40 text-[10px] uppercase tracking-widest text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left">Date</th>
                <th className="px-4 py-3 text-left">Route</th>
                <th className="px-4 py-3 text-left">Distance</th>
                <th className="px-4 py-3 text-left">Time</th>
                <th className="px-4 py-3 text-left">PAX</th>
                <th className="px-4 py-3 text-left">XP</th>
              </tr>
            </thead>
            <tbody>
              {flights.map((f) => (
                <tr key={f.id} className="border-t border-border">
                  <td className="mono px-4 py-3 text-muted-foreground">{relativeTime(f.ts)}</td>
                  <td className="mono px-4 py-3 text-runway">{f.departure} → {f.destination}</td>
                  <td className="mono px-4 py-3">{Math.round(f.distance)} nm</td>
                  <td className="mono px-4 py-3">{f.flightTime}</td>
                  <td className="mono px-4 py-3 text-runway">{f.pax.toFixed(2)}</td>
                  <td className="mono px-4 py-3">{f.xp.toFixed(1)}</td>
                </tr>
              ))}
              {flights.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-xs text-muted-foreground">No recent flights for this aircraft.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <a
        href={`https://simfly.io/assets/airplane/${plane.aircraftId}/details`}
        target="_blank"
        rel="noreferrer"
        className="mono mt-6 inline-block text-[11px] uppercase tracking-widest text-runway hover:underline"
      >
        Open on simfly.io →
      </a>
    </AppShell>
  );
}
