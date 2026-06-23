import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getSimflyPayload } from "@/lib/simfly.functions";
import { useSimflyArgs } from "@/lib/viewed-user";
import { AppShell, PageHeader, StatCard, formatNumber, relativeTime } from "@/components/app-shell";
import { ArrowLeft, Coins, Trophy, IdCard } from "lucide-react";

export const Route = createFileRoute("/licenses/$slug")({
  component: LicenseDetail,
  head: ({ params }) => ({ meta: [{ title: `License ${params.slug} — SimFly Hub` }] }),
  notFoundComponent: () => (
    <AppShell>
      <PageHeader title="License not found" description="That license isn't in your collection." />
      <Link to="/licenses" className="text-runway hover:underline">← Back to licenses</Link>
    </AppShell>
  ),
});

function LicenseDetail() {
  const { slug } = Route.useParams();
  const fn = useServerFn(getSimflyPayload);
  const { keyTag, payload } = useSimflyArgs();
  const { data } = useSuspenseQuery(queryOptions({
    queryKey: ["simfly", keyTag],
    queryFn: () => fn(payload ? { data: payload } : undefined),
  }));
  const lic = data.licenses.find((l) => l.code === slug || l.slug === slug);
  if (!lic) throw notFound();

  const flights = data.flights.filter((f) => f.licenceCode === lic.code).slice(0, 30);

  return (
    <AppShell>
      <Link to="/licenses" className="mono mb-4 inline-flex items-center gap-1 text-[11px] uppercase tracking-widest text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3 w-3" /> All licenses
      </Link>
      <PageHeader
        eyebrow={lic.code || lic.sku}
        title={lic.name}
        description={`${lic.rankName} · Rank #${lic.rank}`}
      />

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Lifetime PAX" value={formatNumber(Math.round(lic.totalEarnedPax))} icon={Coins} />
        <StatCard label="Lifetime XP" value={formatNumber(Math.round(lic.totalEarnedXp))} icon={Trophy} />
        <StatCard label="Level" value={`L${lic.level}`} hint={`${Math.round(lic.levelProgress)}% to next`} icon={IdCard} />
        <StatCard label="Recent PAX (7d)" value={formatNumber(Math.round(lic.pax7d))} hint={`${formatNumber(Math.round(lic.pax30d))} in 30d`} icon={Coins} />
      </section>

      <section className="mt-8">
        <h2 className="font-display mb-3 text-xl font-semibold">Flights on this license ({flights.length})</h2>
        <div className="panel overflow-hidden rounded-xl">
          <table className="w-full text-sm">
            <thead className="mono bg-secondary/40 text-[10px] uppercase tracking-widest text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left">Date</th>
                <th className="px-4 py-3 text-left">Route</th>
                <th className="px-4 py-3 text-left">Aircraft</th>
                <th className="px-4 py-3 text-left">Distance</th>
                <th className="px-4 py-3 text-left">PAX</th>
                <th className="px-4 py-3 text-left">XP</th>
              </tr>
            </thead>
            <tbody>
              {flights.map((f) => (
                <tr key={f.id} className="border-t border-border">
                  <td className="mono px-4 py-3 text-muted-foreground">{relativeTime(f.ts)}</td>
                  <td className="mono px-4 py-3 text-runway">{f.departure} → {f.destination}</td>
                  <td className="px-4 py-3">{f.aircraftName}</td>
                  <td className="mono px-4 py-3">{Math.round(f.distance)} nm</td>
                  <td className="mono px-4 py-3 text-runway">{f.pax.toFixed(2)}</td>
                  <td className="mono px-4 py-3">{f.xp.toFixed(1)}</td>
                </tr>
              ))}
              {flights.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-xs text-muted-foreground">No flights on this license in the recent log.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </AppShell>
  );
}
