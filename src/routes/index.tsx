import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, useQuery, queryOptions, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { getSimflyPayload, getMyHubsIncomingTraffic, getMyLiveFlights, getLatestChangelog } from "@/lib/simfly.functions";
import type { AirportExt, AirportLiveVisitor, MyLiveFlight } from "@/lib/types";
import { AppShell, PageHeader, StatCard, TierPill, RotationCell, formatNumber, relativeTime } from "@/components/app-shell";
import { HubSupportCard } from "@/components/hub-support";
import { Coins, Plane, Building2, ArrowUpRight, Wallet, Radio, PlaneLanding, PlaneTakeoff, UserCog, X, Heart, Coffee, IdCard, History } from "lucide-react";
import type { FlightLog } from "@/lib/types";
import { formatEtaUtc, formatRemainingFromNow } from "@/lib/aircraft-specs";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { useSimflyArgs } from "@/lib/viewed-user";

export const Route = createFileRoute("/")({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(
      queryOptions({ queryKey: ["simfly", "__self__"], queryFn: () => getSimflyPayload(), staleTime: 30_000 }),
    ),
  component: Overview,
  head: () => ({
    meta: [
      { title: "Overview — SimFly Hub" },
      { name: "description", content: "Your SimFly account at a glance: available PAX, fleet, hubs and recent earnings." },
      { property: "og:title", content: "SimFly Hub — Overview" },
      { property: "og:description", content: "Airport Intelligence Hub for SimFly.io players." },
    ],
  }),
});
function Overview() {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const pilot = typeof window !== "undefined" 
    ? new URLSearchParams(window.location.search).get("pilot") || localStorage.getItem("simfly:viewedPilot") || ""
    : "";

  const fn = useServerFn(getSimflyPayload);
  const qc = useQueryClient();
  const { keyTag, payload, username: viewedUser } = useSimflyArgs();
  
  const { data } = useSuspenseQuery(
    queryOptions({
      queryKey: ["simfly", pilot || "__self__"],
      queryFn: () => fn(pilot ? { data: { username: pilot } } : undefined),
      staleTime: 30 * 60_000,
      refetchInterval: 30 * 60_000,
    }),
  );
  
  const lastInvalidateRef = useRef<number>(0);

  useEffect(() => {
    const now = Date.now();
    if (now - lastInvalidateRef.current >= 30 * 60_000) {
      qc.invalidateQueries({ queryKey: ["hub-support", keyTag] });
      lastInvalidateRef.current = now;
    }
  }, [qc, keyTag, data._fetchedAt]);

  const trafficFn = useServerFn(getMyHubsIncomingTraffic);
  const myFlightsFn = useServerFn(getMyLiveFlights);
 
  const icaos = useMemo(
    () => Array.from(new Set(data.airports.map((a) => a.icao).filter(Boolean))),
    [data.airports],
  );
 
  const tails = useMemo(
    () => Array.from(new Set(data.airplanes.map((p) => p.tailNumber).filter(Boolean))),
    [data.airplanes],
  );

  const { data: hubTraffic = [] } = useQuery({
    queryKey: ["simfly", "hubTraffic", keyTag, icaos],
    queryFn: () => trafficFn({ data: { icaos, ...(viewedUser ? { username: viewedUser } : {}) } }),
    enabled: icaos.length > 0,
    refetchInterval: 300_000,
    staleTime: 20_000,
  });

  const { data: myFlights = [] } = useQuery({
    queryKey: ["simfly", "myLiveFlights", keyTag, icaos, tails],
    queryFn: () => myFlightsFn({ data: { icaos, tails, ...(viewedUser ? { username: viewedUser } : {}) } }),
    enabled: icaos.length > 0 || tails.length > 0,
    refetchInterval: 300_000,
    staleTime: 300_000,
  });

  const changelogFn = useServerFn(getLatestChangelog);
  const { data: appUpdates = [] } = useQuery({
    queryKey: ["app-changelog"],
    queryFn: () => changelogFn(),
    staleTime: 5 * 60_000,
  });

  if (!isMounted) {
    return (
      <AppShell>
        <PageHeader
          eyebrow="Welcome back"
          title="Loading Intel..."
          description="Fetching live operations from SimFly.io API..."
        />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageHeader
        eyebrow={viewedUser ? `Viewing pilot @${viewedUser}` : "Welcome back"}
        title={`Captain ${data.me.displayName}`}
        description="Real-time intelligence on your SimFly.io operations — PAX-first."
        actions={
          <div className="flex items-center gap-3">
            <PilotSwitcher current={viewedUser} />
            {data.me.avatarUrl ? (
              <img
                src={data.me.avatarUrl}
                alt={`@${data.me.handle} avatar`}
                width={64}
                height={64}
                className="h-16 w-16 rounded-full border border-border/40 object-cover shadow-lg"
              />
            ) : null}
          </div>
        }
      />
      <CurrentFlightHero
        live={(() => {
          const completedIds = new Set(data.flights.map((f) => f.id));
          return myFlights.find((f) => !completedIds.has(f.id)) ?? null;
        })()}
        liveMissionIds={useMemo(() => {
          const ids = new Set<string>();
          for (const f of myFlights) ids.add(f.id);
          for (const h of hubTraffic) for (const v of h.visitors) ids.add(v.id);
          return ids;
        }, [myFlights, hubTraffic])}
        completedIds={useMemo(() => new Set(data.flights.map((f) => f.id)), [data.flights])}
        lastFlight={data.flights ?? null}
      />
      <section className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5">
        <StatCard
          label="Available PAX"
          value={formatNumber(Math.round(data.availablePax))}
          hint={`${formatNumber(data.lifetimePax)} lifetime`}
          icon={Wallet}
        />
        <StatCard
          label="PAX last 7d"
          value={formatNumber(data.paxLast7d)}
          hint="Earned this week"
          icon={Coins}
        />
        <StatCard
          label="PAX last 30d"
          value={formatNumber(data.paxLast30d)}
          hint="Earned this month"
          icon={Coins}
        />
        <StatCard
          label="Aircraft"
          value={String(data.airplanes.length)}
          hint={`${data.airplanes.filter((a) => !a.inGroundOperation).length} ready`}
          icon={Plane}
        />
        <StatCard
          label="Hubs"
          value={String(data.airports.length)}
          hint="Owned airports"
          icon={Building2}
        />
        <HubSupportCard username={data.me.handle} />
      </section>
      <IncomingTraffic traffic={hubTraffic} myFlights={myFlights} airports={data.airports} />
      <section className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="panel rounded-xl p-5 lg:col-span-2">
          <div className="mb-4 flex items-end justify-between">
            <div>
              <h2 className="font-display text-lg font-semibold">PAX earnings · 30 days</h2>
              <p className="text-xs text-muted-foreground">
                Daily token income · <span className="text-runway">cyan</span> your flights ·{" "}
                <span style={{ color: "var(--instrument)" }}>amber</span> visitor traffic to your hubs
              </p>
            </div>
            <Link to="/stats" className="mono text-[11px] uppercase tracking-widest text-runway hover:underline">
              All stats →
            </Link>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer>
              <AreaChart data={data.earningsTimeseries} margin={{ left: -10, right: 6, top: 6, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradPax" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--runway)" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="var(--runway)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradVisitors" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--instrument)" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="var(--instrument)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis dataKey="date" tickFormatter={(d) => d.slice(5)} stroke="var(--muted-foreground)" fontSize={11} />
                <YAxis stroke="var(--muted-foreground)" fontSize={11} tickFormatter={(v) => formatNumber(Number(v))} />
                <Tooltip
                  contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                  formatter={(v: number, name) => [formatNumber(v) + " PAX", name === "paxVisitors" ? "Visitor PAX" : "Your PAX"]}
                />
                <Area type="monotone" dataKey="pax" name="paxKept" stroke="var(--runway)" strokeWidth={2} fill="url(#gradPax)" />
                <Area type="monotone" dataKey="paxVisitors" name="paxVisitors" stroke="var(--instrument)" strokeWidth={2} fill="url(#gradVisitors)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="panel rounded-xl p-5 border border-border/40 bg-background/20">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <History className="h-4 w-4 text-runway" />
              <h2 className="font-display text-lg font-semibold">Recent Updates</h2>
            </div>
            <Link to="/changelog" className="mono text-[11px] uppercase tracking-widest text-runway hover:underline">
              View All →
            </Link>
          </div>
          <div className="overflow-y-auto max-h-64 pr-1">
            <ul className="space-y-3">
              {appUpdates.slice(0, 3).map((update: any, index: number) => {
                return (
                  <li key={index} className="flex flex-col gap-1 border-b border-border/20 pb-2 last:border-0 last:pb-0">
                    <span className="mono text-[10px] font-bold text-runway uppercase tracking-wider">
                      {update.version}
                    </span>
                    <span className="text-xs text-foreground/80 leading-relaxed inline-flex flex-wrap items-baseline gap-1.5">
                      {update.text?.startsWith("[FIX]") && (
                        <span className="mono rounded bg-rose-500/10 border border-rose-500/25 px-1 py-px text-[9px] font-bold uppercase tracking-wider text-rose-400 shrink-0">Fix</span>
                      )}
                      {update.text?.startsWith("[FEATURE]") && (
                        <span className="mono rounded bg-emerald-500/10 border border-emerald-500/25 px-1 py-px text-[9px] font-bold uppercase tracking-wider text-emerald-400 shrink-0">Feature</span>
                      )}
                      {update.text?.startsWith("[PERF]") && (
                        <span className="mono rounded bg-purple-500/10 border border-purple-500/25 px-1 py-px text-[9px] font-bold uppercase tracking-wider text-purple-400 shrink-0">Perf</span>
                      )}
                      <span>
                        {update.text
                          ? update.text
                              .replace(/^\[FIX\]\s*/, "")
                              .replace(/^\[FEATURE\]\s*/, "")
                              .replace(/^\[PERF\]\s*/, "")
                          : ""}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </section>
      <div className="panel rounded-xl p-5 mt-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold">Recent flights</h2>
          <Link to="/activity" className="mono text-[11px] uppercase tracking-widest text-runway hover:underline">All →</Link>
        </div>
        <ul className="space-y-3">
          {data.activity.slice(0, 8).map((a: any) => {
            const isVisitor = a.message?.startsWith("(Visitor)") ?? false;
            return (
              <li key={a.id} className="flex items-start gap-3 text-sm border-b border-border/40 pb-2 last:border-0 last:pb-0">
                <ArrowUpRight className={`mt-0.5 h-4 w-4 shrink-0 ${isVisitor ? "" : "text-runway"}`} style={isVisitor ? { color: "var(--instrument)" } : undefined} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-muted-foreground">
                    {isVisitor && (
                      <span className="mono mr-1.5 rounded-sm px-1 py-px text-[9px] font-semibold uppercase tracking-wider" style={{ background: "color-mix(in oklab, var(--instrument) 18%, transparent)", color: "var(--instrument)" }}>
                        Visitor
                      </span>
                    )}
                    <span className="text-foreground">
                      {isVisitor ? a.message.replace(/^\(Visitor\)\s*/, "") : a.message}
                    </span>
                  </div>
                  <div className="mono mt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground/60">
                    {typeof window !== "undefined" && a.at ? relativeTime(a.at) : "Just now"}
                  </div>
                </div>
                <div className="mono text-xs font-semibold pl-3 shrink-0 text-runway">
                  +{formatNumber(Number(a.delta) || 0)} PAX
                </div>
              </td>
            );
          })}
        </ul>
      </div>
      <section className="mt-8">
        <div className="mb-3 flex items-end justify-between">
          <h2 className="font-display text-xl font-semibold">Your top hubs</h2>
          <Link to="/airports" className="mono text-[11px] uppercase tracking-widest text-runway hover:underline">All airports →</Link>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[...data.airports]
            .sort((a, b) => b.totalEarnedPax - a.totalEarnedPax)
            .slice(0, 6)
            .map((a) => (
              <Link key={a.icao} to="/airports/$id" params={{ id: a.icao }} className="panel group block rounded-xl p-5 transition-colors hover:bg-secondary/40">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="mono text-[11px] uppercase tracking-widest text-runway">{a.icao}</div>
                    <div className="font-display mt-1 truncate text-lg font-semibold">{a.name}</div>
                    <div className="text-xs text-muted-foreground">{a.country} · L{a.level}</div>
                  </div>
                  <TierPill tier={a.tier} label={a.tierLabel} />
                </div>
                <div className="mt-4 grid grid-cols-3 gap-3 border-t border-border pt-4 text-xs">
                  <Stat label="Lifetime PAX" value={formatNumber(Math.round(a.totalEarnedPax))} />
                  <Stat label="PAX 7d" value={formatNumber(Math.round(a.pax7d))} />
                  <Stat label="Rotation" value="" custom={<RotationCell rotation={a.rotation} max={a.maxRotation} />} />
                </div>
              </Link>
            ))}
        </div>
      </section>
    </AppShell>
  );
}

function Stat({ label, value, custom }: { label: string; value: string; custom?: React.ReactNode }) {
  return (
    <div>
      <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="font-display mt-0.5 text-base font-semibold">{custom ?? value}</div>
    </div>
  );
}

function IncomingTraffic({ traffic, myFlights, airports }: { traffic: { icao: string; visitors: AirportLiveVisitor[] }[]; myFlights: MyLiveFlight[]; airports: AirportExt[]; }) {
  const airportByIcao = useMemo(() => {
    const m = new Map<string, AirportExt>();
    for (const a of airports) m.set(a.icao.toUpperCase(), a);
    return m;
  }, [airports]);
  const myByHub = useMemo(() => {
    const m = new Map<string, { inbound: MyLiveFlight[]; outbound: MyLiveFlight[] }>();
    const ensure = (icao: string) => {
      const k = icao.toUpperCase();
      if (!m.has(k)) m.set(k, { inbound: [], outbound: [] });
      return m.get(k)!;
    };
    for (const f of myFlights) {
      if (f.origin && airportByIcao.has(f.origin.toUpperCase())) ensure(f.origin).outbound.push(f);
      if (f.destination && airportByIcao.has(f.destination.toUpperCase())) ensure(f.destination).inbound.push(f);
    }
    return m;
  }, [myFlights, airportByIcao]);
  const active = useMemo(() => {
    const hubIcaos = new Set<string>([...traffic.map((t) => t.icao.toUpperCase()), ...Array.from(myByHub.keys())]);
    return Array.from(hubIcaos).map((icao) => {
      const airport = airportByIcao.get(icao);
      const visitors = traffic.find((t) => t.icao.toUpperCase() === icao)?.visitors ?? [];
      const mine = myByHub.get(icao) ?? { inbound: [], outbound: [] };
      return airport ? { icao, airport, visitors, mine } : null;
    }).filter((r): r is { icao: string; airport: AirportExt; visitors: AirportLiveVisitor[]; mine: { inbound: MyLiveFlight[]; outbound: MyLiveFlight[] } } => !!r).sort((a, b) => (b.visitors.length + b.mine.inbound.length + b.mine.outbound.length) - (a.visitors.length + a.mine.inbound.length + a.mine.outbound.length));
  }, [traffic, myByHub, airportByIcao]);
  const totalVisitors = active.reduce((s, t) => s + t.visitors.length, 0);
  const totalMine = active.reduce((s, t) => s + t.mine.inbound.length + t.mine.outbound.length, 0);
  return (
    <section className="mt-8">
      <div className="mb-3 flex items-end justify-between">
        <div className="flex items-center gap-2">
          <Radio className={`h-4 w-4 ${active.length ? "animate-pulse text-runway" : "text-muted-foreground"}`} />
          <h2 className="font-display text-xl font-semibold">Incoming traffic</h2>
          <span className="mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {active.length ? `${totalVisitors} visitor${totalVisitors === 1 ? "" : "s"} · ${totalMine} of mine · ${active.length} hub${active.length === 1 ? "" : "s"}` : "No live traffic right now"}
          </span>
        </div>
        <Link to="/airports" className="mono text-[11px] uppercase tracking-widest text-runway hover:underline">All airports →</Link>
      </div>
      {active.length === 0 ? (
        <div className="panel rounded-xl p-6 text-sm text-muted-foreground">No other pilots are currently flying to or from your hubs, and you have no aircraft airborne. Traffic appears here as it happens.</div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {active.map(({ airport: a, visitors, mine }) => {
            const mineTotal = mine.inbound.length + mine.outbound.length;
            return (
              <Link key={a.icao} to="/airports/$id" params={{ id: a.icao }} className="panel group block rounded-xl p-5 transition-colors hover:bg-secondary/40">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="mono text-[11px] uppercase tracking-widest text-runway">{a.icao}</div>
                    <div className="font-display mt-1 truncate text-lg font-semibold">{a.name}</div>
                    <div className="text-xs text-muted-foreground">{a.country} · L{a.level}</div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <TierPill tier={a.tier} label={a.tierLabel} />
                    <div className="flex flex-wrap items-center justify-end gap-1">
                      {visitors.length > 0 && (
                        <span className="mono inline-flex items-center gap-1 rounded-full border border-runway/40 bg-runway/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-runway">
                          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-runway shadow-[0_0_8px_var(--runway)]" />
                          {visitors.length} visitor{visitors.length === 1 ? "" : "s"}
                        </span>
                      )}
                      {mineTotal > 0 && (
                        <span className="mono inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest" style={{ borderColor: "color-mix(in oklab, var(--instrument) 45%, transparent)", background: "color-mix(in oklab, var(--instrument) 12%, transparent)", color: "var(--instrument)" }}>
                          <span className="h-1.5 w-1.5 animate-pulse rounded-full" style={{ background: "var(--instrument)", boxShadow: "0 0 8px var(--instrument)" }} />
                          {mineTotal} mine
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <ul className="mt-4 space-y-2 border-t border-border pt-3">
                  {mine.inbound.slice(0, 2).map((f) => (
                    <li key={`mi-${f.id}`} className="flex items-center gap-2 text-xs">
                      <div className="h-6 w-6 shrink-0 rounded-full border" style={{ borderColor: "color-mix(in oklab, var(--instrument) 45%, transparent)", background: "color-mix(in oklab, var(--instrument) 12%, transparent)" }} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium" style={{ color: "var(--instrument)" }}>You · Inbound</div>
                        <div className="mono truncate text-[10px] uppercase tracking-widest text-muted-foreground">{f.aircraftICAO} · {f.origin ?? "—"} → {f.destination ?? "—"}</div>
                        {f.etaMs && <div className="mono mt-0.5 text-[10px] uppercase tracking-widest" style={{ color: "var(--instrument)" }}>ETA {formatEtaUtc(f.etaMs)} · {formatRemainingFromNow(f.etaMs)}</div>}
                      </div>
                      <PlaneLanding className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--instrument)" }} />
                    </li>
                  ))}
                  {mine.outbound.slice(0, 2).map((f) => (
                    <li key={`mo-${f.id}`} className="flex items-center gap-2 text-xs">
                      <div className="h-6 w-6 shrink-0 rounded-full border" style={{ borderColor: "color-mix(in oklab, var(--instrument) 45%, transparent)", background: "color-mix(in oklab, var(--instrument) 12%, transparent)" }} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium" style={{ color: "var(--instrument)" }}>You · Outbound</div>
                        <div className="mono truncate text-[10px] uppercase tracking-widest text-muted-foreground">{f.aircraftICAO} · {f.origin ?? "—"} → {f.destination ?? "—"}</div>
                        {f.etaMs && <div className="mono mt-0.5 text-[10px] uppercase tracking-widest" style={{ color: "var(--instrument)" }}>ETA {formatEtaUtc(f.etaMs)} · {formatRemainingFromNow(f.etaMs)}</div>}
                      </div>
                      <PlaneTakeoff className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--instrument)" }} />
                    </li>
                  ))}
                  {visitors.slice(0, 4).map((v) => {
                    const arriving = v.destination?.toUpperCase() === a.icao.toUpperCase();
                    return (
                      <li key={v.id} className="flex items-center gap-2 text-xs">
                        {v.userAvatar ? <img src={v.userAvatar} alt="" className="h-6 w-6 shrink-0 rounded-full border border-border/40 object-cover" /> : <div className="h-6 w-6 shrink-0 rounded-full border border-border/40 bg-secondary/40" />}
                </div>
              </li>
            );
          })}
        </ul>
      </Link>
    );
  })}
</div>
)}
</section>
);
}
type FlightSnapshot = { id: string; origin: string; destination: string; aircraft: string; tail?: string; licence?: string; sim?: string; etaMs?: number; distanceNm?: number; };
function snapshotFromLive(f: MyLiveFlight): FlightSnapshot { return { id: f.id, origin: f.origin, destination: f.destination, aircraft: f.aircraftICAO, tail: f.tailNumber, licence: f.licenceCode, sim: f.sim, etaMs: f.etaMs, distanceNm: f.distanceNm, }; }

function CurrentFlightHero({ live, liveMissionIds, completedIds, lastFlight }: { live: MyLiveFlight | null; liveMissionIds?: Set<string>; completedIds?: Set<string>; lastFlight: FlightLog | null; }) {
  const [snapshot, setSnapshot] = useState<FlightSnapshot | null>(() => live ? snapshotFromLive(live) : null);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => { if (live && live.id !== snapshot?.id) { setSnapshot(snapshotFromLive(live)); setExpanded(false); } }, [live, snapshot?.id]);
  if (!lastFlight) return null;
  return (
    <section className="panel mb-4 overflow-hidden rounded-xl p-4">
      <div className="text-sm font-semibold">Last flight: {lastFlight.departure} → {lastFlight.destination} · {lastFlight.aircraftName}</div>
    </section>
  );
}

function ExpandedBanner({ snap, status }: { snap: FlightSnapshot; status: "enroute" | "arrived" }) { return null; }
function Stat({ label, value, custom }: { label: string; value: string; custom?: React.ReactNode }) {
  return (
    <div>
      <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="font-display mt-0.5 text-base font-semibold">{custom ?? value}</div>
    </div>
  );
}
function PilotSwitcher({ current }: { current: string | null }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(current ?? "");
  function apply(e?: React.FormEvent) {
    e?.preventDefault();
    const username = value.trim();
    if (username) {
      localStorage.setItem("simfly:viewedPilot", username);
      window.location.href = `/?pilot=${username}`;
    } else {
      localStorage.removeItem("simfly:viewedPilot");
      window.location.href = "/";
    }
    setOpen(false);
  }
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} className="mono inline-flex items-center gap-2 rounded-md border border-border bg-secondary/40 px-3 py-1.5 text-[11px] uppercase tracking-widest text-foreground transition hover:bg-secondary">
        <UserCog className="h-3.5 w-3.5 text-runway" /> @{current ?? "you"}
      </button>
      {open && (
        <form onSubmit={apply} className="panel absolute right-0 z-30 mt-2 w-72 rounded-xl p-4 shadow-xl bg-popover border border-border">
          <input autoFocus value={value} onChange={(e) => setValue(e.target.value)} placeholder="SimFly username..." className="mono w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-runway text-foreground" />
          <button type="submit" className="mono w-full mt-2 rounded bg-runway/20 border border-runway/30 py-1.5 text-[10px] font-bold uppercase tracking-widest text-runway">View Pilot</button>
        </form>
      )}
    </div>
  );
}
