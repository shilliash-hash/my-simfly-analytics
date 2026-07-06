import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useSuspenseQuery, useQuery, queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getSimflyPayload, getAirportVisitors, getHubSupportStatus, getHubTrafficStats, getPilotSupportTimeline } from "@/lib/simfly.functions";
import { useSimflyArgs } from "@/lib/viewed-user";
import {
  AppShell, PageHeader, StatCard, TierPill, RotationCell, formatNumber, relativeTime,
} from "@/components/app-shell";
import { Coins, TrendingUp, Users, Percent, ArrowLeft, Lock, Heart, Plane, Coffee, ShieldCheck, MapPin, Calendar } from "lucide-react";
import { ResponsiveContainer, BarChart, CartesianGrid, XAxis, YAxis, Tooltip, Legend, Bar } from "recharts";

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

function HubAnalyticsSection() {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const statusFn = useServerFn(getHubSupportStatus);
  const { keyTag, payload } = useSimflyArgs();
  const { data: status, isLoading } = useQuery({
    queryKey: ["hub-support", keyTag],
    queryFn: () => statusFn(payload ? { data: payload } : undefined),
    staleTime: 5 * 60_000,
    enabled: isMounted, // <- ZAPOBIEGA URUCHAMIANIU ZAPYTANIA NA SERWERZE (SSR)
  });

  if (!isMounted) {
    return (
      <section className="mt-10">
        <div className="panel rounded-xl border border-border/40 bg-background/30 p-6 text-center text-xs text-muted-foreground animate-pulse">
          Syncing analytics data...
        </div>
      </section>
    );
  }

  return (

    <section className="mt-10">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-semibold">Hub Analytics</h2>
          <p className="text-xs text-muted-foreground">
            Weekly traffic aggregates and your supporter timeline.
          </p>
        </div>
      </div>
      {isLoading ? (
        <div className="panel rounded-xl p-6 text-sm text-muted-foreground">Loading…</div>
      ) : status?.active ? (
        <div className="space-y-6">
          <HubTrafficChart />
          <PilotTimeline />
        </div>
      ) : (
        <LockedGate />
      )}
    </section>
  );
}
function LockedGate() {
  return (
    <div className="panel relative overflow-hidden rounded-2xl p-8 text-center">
      <div
        className="pointer-events-none absolute inset-0 opacity-30"
        style={{ background: "radial-gradient(circle at 50% 0%, var(--runway) 0%, transparent 60%)" }}
        aria-hidden
      />
      <div className="relative">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-runway/10 text-runway ring-1 ring-runway/40">
          <Lock className="h-6 w-6" />
        </div>
        <h3 className="font-display mt-4 text-lg font-semibold tracking-tight">
          Supporter Status Required
        </h3>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          Hub Analytics unlock for pilots active in the current weekly cycle. Land at any of your owned airports this week — or activate your support — to open the door.
        </p>
        <div className="mono mt-5 inline-flex items-center gap-2 rounded-full border border-border bg-background/40 px-4 py-1.5 text-[11px] uppercase tracking-widest text-muted-foreground">
          <Heart className="h-3.5 w-3.5 text-runway" />
          Weekly Supporters Only
        </div>
      </div>
    </div>
  );
}
function HubTrafficChart() {
  const [isMounted, setIsMounted] = useState(false);
  
  useEffect(() => {
    setIsMounted(true);
  }, []);

  const fn = useServerFn(getHubTrafficStats);
  const { data, isLoading } = useQuery({

    queryKey: ["hub-support", "traffic-stats"],
    queryFn: () => fn(),
    staleTime: 5 * 60_000,
  });
  const rows = data ?? [];
  return (
    <div className="panel rounded-xl p-5">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h3 className="font-display text-lg font-semibold">Hub Traffic by Airport</h3>
          <p className="text-xs text-muted-foreground">
            Qualifying flights and PAX per hub across all weekly supporters.
          </p>
        </div>
        <div className="flex items-center gap-4 text-[11px] font-medium">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-sm bg-[var(--runway)]" /> Flights
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-sm bg-[var(--instrument)]" /> PAX
          </span>
        </div>
      </div>
           <div className="h-80 w-full">
        {isLoading ? (
          <div className="grid h-full place-items-center text-sm text-muted-foreground">Loading traffic…</div>
        ) : rows.length === 0 ? (
          <div className="grid h-full place-items-center text-sm text-muted-foreground">No qualifying arrivals recorded yet.</div>
        ) : !isMounted ? (
          <div className="grid h-full place-items-center text-sm text-muted-foreground animate-pulse">Initializing charts...</div>
        ) : (
          <ResponsiveContainer>
            <BarChart data={rows} margin={{ left: -10, right: 6, top: 6, bottom: 0 }}>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis dataKey="icao" stroke="var(--muted-foreground)" fontSize={11} />
              <YAxis yAxisId="left" stroke="var(--muted-foreground)" fontSize={11} tickFormatter={(v) => formatNumber(Number(v))} />
              <YAxis yAxisId="right" orientation="right" stroke="var(--muted-foreground)" fontSize={11} tickFormatter={(v) => formatNumber(Number(v))} />
              <Tooltip
                cursor={{ fill: "rgba(251,191,36,0.08)" }}
                contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                formatter={(v: number, name: string) => [formatNumber(v), name]}
              />
              <Legend wrapperStyle={{ display: "none" }} />
      <Bar yAxisId="left" dataKey="flights" name="Flights" fill="var(--runway)" radius={[4, 4, 0, 0]} />
      <Bar yAxisId="right" dataKey="pax" name="PAX" fill="var(--instrument)" radius={[4, 4, 0, 0]} />

            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

function sourceMeta(src: string | null) {
  if (src === "airport") return { icon: <Plane className="h-3.5 w-3.5" />, label: "Airport Visit", tone: "text-runway" };
  if (src === "donation") return { icon: <Coffee className="h-3.5 w-3.5" />, label: "Donation", tone: "text-instrument" };
  if (src === "admin") return { icon: <ShieldCheck className="h-3.5 w-3.5" />, label: "Admin Grant", tone: "text-muted-foreground" };
  return { icon: <Heart className="h-3.5 w-3.5" />, label: "Support", tone: "text-runway" };
}

function fmtDateUtc(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}

function milestoneAt(n: number): string | null {
  if (n === 1) return "First Active Week";
  if (n === 4) return "One Month Supporter";
  if (n === 12) return "Quarter-Year Loyalist";
  if (n === 26) return "Half-Year Veteran";
  if (n === 52) return "One-Year Legend";
  if (n > 0 && n % 52 === 0) return `${n / 52}-Year Legend`;
  return null;
}

export function PilotTimeline() {
  const fn = useServerFn(getPilotSupportTimeline);
  const { keyTag, payload, username } = useSimflyArgs();
  const { data, isLoading } = useQuery({
    queryKey: ["hub-support", "timeline", keyTag],
    queryFn: () => fn(payload ? { data: payload } : undefined),
    staleTime: 5 * 60_000,
  });

  const rows = data ?? [];
  const totalWeeks = rows.length;
  const uniqueIcaos = new Set(rows.map((r) => r.qualifyingIcao).filter(Boolean)).size;

  return (
    <div className="panel rounded-xl p-5">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="font-display text-lg font-semibold">Pilot Career Timeline</h3>
          <p className="text-xs text-muted-foreground">
            {username ? `@${username}` : "Your"} weekly supporter history and loyalty milestones.
          </p>
        </div>
        <div className="flex gap-3 text-[11px]">
          <div className="mono rounded bg-runway/10 px-3 py-1.5 text-runway ring-1 ring-runway/30">
            {totalWeeks} active week{totalWeeks === 1 ? "" : "s"}
          </div>
          <div className="mono rounded bg-instrument/10 px-3 py-1.5 text-instrument ring-1 ring-instrument/30">
            {uniqueIcaos} unique hub{uniqueIcaos === 1 ? "" : "s"}
          </div>
        </div>
      </div>
      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading timeline…</div>
      ) : rows.length === 0 ? (
        <div className="text-sm text-muted-foreground">
          No active weeks recorded yet. Your journey starts with your first qualifying arrival.
        </div>
      ) : (
        <ol className="relative ml-3 space-y-4 border-l border-border/60 pl-6">
          {rows.map((r, idx) => {
            const meta = sourceMeta(r.source);
            const milestone = milestoneAt(totalWeeks - idx);
            return (
              <li key={`${r.weekStartUtc}-${idx}`} className="relative">
                <span className="absolute -left-[31px] top-1 grid h-5 w-5 place-items-center rounded-full bg-background ring-2 ring-runway/50">
                  <span className="h-2 w-2 rounded-full bg-runway" />
                </span>
                <div className="rounded-lg border border-border/60 bg-background/40 p-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div className="font-display text-sm font-semibold">
                      {r.weekLabel}
                      <span className="mono ml-2 text-[11px] font-normal text-muted-foreground">
                        <Calendar className="mr-1 inline h-3 w-3" />
                        {fmtDateUtc(r.weekStartUtc)}
                      </span>
                    </div>
                    <div className={`flex items-center gap-1.5 text-[11px] ${meta.tone}`}>
                      {meta.icon}
                      {meta.label}
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-[12px] text-muted-foreground">
                    {r.qualifyingIcao ? (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3 text-runway" />
                        <span className="mono font-semibold text-foreground">{r.qualifyingIcao}</span>
                      </span>
                    ) : null}
                    {r.qualifyingArrivalAt ? (
                      <span className="mono text-[11px]">Arrived {fmtDateUtc(r.qualifyingArrivalAt)}</span>
                    ) : null}
                  </div>
                  {milestone ? (
                    <div className="mono mt-2 inline-flex items-center gap-1.5 rounded bg-instrument/10 px-2 py-1 text-[10px] uppercase tracking-widest text-instrument ring-1 ring-instrument/30">
                      {milestone} 🏆
                    </div>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

