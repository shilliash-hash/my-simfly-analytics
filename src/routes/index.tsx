import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, useQuery, queryOptions, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { getSimflyPayload, getMyHubsIncomingTraffic, getMyLiveFlights } from "@/lib/simfly.functions";
import { useSimflyArgs, setViewedUser } from "@/lib/viewed-user";
import type { AirportExt, AirportLiveVisitor, MyLiveFlight } from "@/lib/types";
import {
  AppShell, PageHeader, StatCard, TierPill, RotationCell, formatNumber, relativeTime,
} from "@/components/app-shell";
import { HubSupportCard } from "@/components/hub-support";
import { Coins, Plane, Building2, ArrowUpRight, Wallet, Radio, PlaneLanding, PlaneTakeoff, UserCog, X, Heart, Coffee, IdCard } from "lucide-react";
import type { FlightLog } from "@/lib/types";
import { formatEtaUtc, formatRemainingFromNow } from "@/lib/aircraft-specs";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";

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
  const fn = useServerFn(getSimflyPayload);
  const qc = useQueryClient();
  const { keyTag, payload, username: viewedUser } = useSimflyArgs();
  const { data } = useSuspenseQuery(
    queryOptions({
      queryKey: ["simfly", keyTag],
      queryFn: () => fn(payload ? { data: payload } : undefined),
      staleTime: 5 * 60_000,
      refetchInterval: 5 * 60_000,
    }),
  );

  useEffect(() => {
    qc.invalidateQueries({ queryKey: ["hub-support", keyTag] });
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
  // Live feeds — 30 s cadence. The server memoises the upstream /flights
  // response for 10 s so concurrent tabs / callers share a single fetch.
  const { data: hubTraffic = [] } = useQuery({
    queryKey: ["simfly", "hubTraffic", keyTag, icaos],
    queryFn: () => trafficFn({ data: { icaos, ...(viewedUser ? { username: viewedUser } : {}) } }),
    enabled: icaos.length > 0,
    refetchInterval: 30_000,
    staleTime: 20_000,
  });
  const { data: myFlights = [] } = useQuery({
    queryKey: ["simfly", "myLiveFlights", keyTag, icaos, tails],
    queryFn: () => myFlightsFn({ data: { icaos, tails, ...(viewedUser ? { username: viewedUser } : {}) } }),
    enabled: icaos.length > 0 || tails.length > 0,
    refetchInterval: 30_000,
    staleTime: 20_000,
  });


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
          // Mission IDs SimFly still reports anywhere in our hub feeds.
          // Primary trigger: when our snapshot id leaves this set, mark ARRIVED.
          const ids = new Set<string>();
          for (const f of myFlights) ids.add(f.id);
          for (const h of hubTraffic) for (const v of h.visitors) ids.add(v.id);
          return ids;
        }, [myFlights, hubTraffic])}
        completedIds={useMemo(() => new Set(data.flights.map((f) => f.id)), [data.flights])}
        lastFlight={data.flights[0] ?? null}
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
                  formatter={(v: number, name) =>
                    [formatNumber(v) + " PAX", name === "paxVisitors" ? "Visitor PAX" : "Your PAX"]
                  }
                />
                <Area type="monotone" dataKey="pax" name="paxKept" stroke="var(--runway)" strokeWidth={2} fill="url(#gradPax)" />
                <Area type="monotone" dataKey="paxVisitors" name="paxVisitors" stroke="var(--instrument)" strokeWidth={2} fill="url(#gradVisitors)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="panel rounded-xl p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold">Recent flights</h2>
            <Link to="/activity" className="mono text-[11px] uppercase tracking-widest text-runway hover:underline">All →</Link>
          </div>
          <ul className="space-y-3">
            {data.activity.slice(0, 8).map((a) => {
              const isVisitor = a.message.startsWith("(Visitor)");
              return (
                <li key={a.id} className="flex items-start gap-3 text-sm">
                  <ArrowUpRight
                    className={`mt-0.5 h-4 w-4 shrink-0 ${isVisitor ? "" : "text-runway"}`}
                    style={isVisitor ? { color: "var(--instrument)" } : undefined}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate">
                      {isVisitor && (
                        <span
                          className="mono mr-1.5 rounded-sm px-1 py-px text-[9px] font-semibold uppercase tracking-widest"
                          style={{ background: "color-mix(in oklab, var(--instrument) 18%, transparent)", color: "var(--instrument)" }}
                        >
                          Visitor
                        </span>
                      )}
                      {isVisitor ? a.message.replace(/^\(Visitor\)\s*/, "") : a.message}
                    </div>
                    <div className="mono mt-0.5 text-[10px] uppercase tracking-widest text-muted-foreground">
                      {relativeTime(a.at)}
                      {a.delta ? ` · +${a.delta.toFixed(2)} PAX` : ""}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      <section className="mt-8">
        <div className="mb-3 flex items-end justify-between">
          <h2 className="font-display text-xl font-semibold">Your top hubs</h2>
          <Link to="/airports" className="mono text-[11px] uppercase tracking-widest text-runway hover:underline">
            All airports →
          </Link>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[...data.airports]
            .sort((a, b) => b.totalEarnedPax - a.totalEarnedPax)
            .slice(0, 6)
            .map((a) => (
              <Link
                key={a.icao}
                to="/airports/$id"
                params={{ id: a.icao }}
                className="panel group block rounded-xl p-5 transition-colors hover:bg-secondary/40"
              >
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

function IncomingTraffic({
  traffic,
  myFlights,
  airports,
}: {
  traffic: { icao: string; visitors: AirportLiveVisitor[] }[];
  myFlights: MyLiveFlight[];
  airports: AirportExt[];
}) {
  const airportByIcao = useMemo(() => {
    const m = new Map<string, AirportExt>();
    for (const a of airports) m.set(a.icao.toUpperCase(), a);
    return m;
  }, [airports]);

  // Group my live flights by hub (origin = outbound, destination = inbound).
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
    const hubIcaos = new Set<string>([
      ...traffic.map((t) => t.icao.toUpperCase()),
      ...Array.from(myByHub.keys()),
    ]);
    return Array.from(hubIcaos)
      .map((icao) => {
        const airport = airportByIcao.get(icao);
        const visitors = traffic.find((t) => t.icao.toUpperCase() === icao)?.visitors ?? [];
        const mine = myByHub.get(icao) ?? { inbound: [], outbound: [] };
        return airport ? { icao, airport, visitors, mine } : null;
      })
      .filter((r): r is { icao: string; airport: AirportExt; visitors: AirportLiveVisitor[]; mine: { inbound: MyLiveFlight[]; outbound: MyLiveFlight[] } } => !!r)
      .sort((a, b) => (b.visitors.length + b.mine.inbound.length + b.mine.outbound.length) - (a.visitors.length + a.mine.inbound.length + a.mine.outbound.length));
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
            {active.length
              ? `${totalVisitors} visitor${totalVisitors === 1 ? "" : "s"} · ${totalMine} of mine · ${active.length} hub${active.length === 1 ? "" : "s"}`
              : "No live traffic right now"}
          </span>
        </div>
        <Link to="/airports" className="mono text-[11px] uppercase tracking-widest text-runway hover:underline">
          All airports →
        </Link>
      </div>

      {active.length === 0 ? (
        <div className="panel rounded-xl p-6 text-sm text-muted-foreground">
          No other pilots are currently flying to or from your hubs, and you have no aircraft airborne. Traffic appears here as it happens.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {active.map(({ airport: a, visitors, mine }) => {
            const mineTotal = mine.inbound.length + mine.outbound.length;
            return (
            <Link
              key={a.icao}
              to="/airports/$id"
              params={{ id: a.icao }}
              className="panel group block rounded-xl p-5 transition-colors hover:bg-secondary/40"
            >
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
                      <span
                        className="mono inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest"
                        style={{
                          borderColor: "color-mix(in oklab, var(--instrument) 45%, transparent)",
                          background: "color-mix(in oklab, var(--instrument) 12%, transparent)",
                          color: "var(--instrument)",
                        }}
                      >
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
                      <div className="mono truncate text-[10px] uppercase tracking-widest text-muted-foreground">
                        {f.aircraftICAO} · {f.origin ?? "—"} → {f.destination ?? "—"}
                      </div>
                      {f.etaMs && (
                        <div className="mono mt-0.5 text-[10px] uppercase tracking-widest" style={{ color: "var(--instrument)" }}>
                          ETA {formatEtaUtc(f.etaMs)} · {formatRemainingFromNow(f.etaMs)}
                        </div>
                      )}
                    </div>
                    <PlaneLanding className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--instrument)" }} />
                  </li>
                ))}
                {mine.outbound.slice(0, 2).map((f) => (
                  <li key={`mo-${f.id}`} className="flex items-center gap-2 text-xs">
                    <div className="h-6 w-6 shrink-0 rounded-full border" style={{ borderColor: "color-mix(in oklab, var(--instrument) 45%, transparent)", background: "color-mix(in oklab, var(--instrument) 12%, transparent)" }} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium" style={{ color: "var(--instrument)" }}>You · Outbound</div>
                      <div className="mono truncate text-[10px] uppercase tracking-widest text-muted-foreground">
                        {f.aircraftICAO} · {f.origin ?? "—"} → {f.destination ?? "—"}
                      </div>
                      {f.etaMs && (
                        <div className="mono mt-0.5 text-[10px] uppercase tracking-widest" style={{ color: "var(--instrument)" }}>
                          ETA {formatEtaUtc(f.etaMs)} · {formatRemainingFromNow(f.etaMs)}
                        </div>
                      )}
                    </div>
                    <PlaneTakeoff className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--instrument)" }} />
                  </li>
                ))}
                {visitors.slice(0, 4).map((v) => {
                  const arriving = v.destination?.toUpperCase() === a.icao.toUpperCase();
                  return (
                    <li key={v.id} className="flex items-center gap-2 text-xs">
                      {v.userAvatar ? (
                        <img
                          src={v.userAvatar}
                          alt=""
                          className="h-6 w-6 shrink-0 rounded-full border border-border/40 object-cover"
                        />
                      ) : (
                        <div className="h-6 w-6 shrink-0 rounded-full border border-border/40 bg-secondary/40" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">@{v.username}</div>
                        <div className="mono truncate text-[10px] uppercase tracking-widest text-muted-foreground">
                          {v.aircraftICAO} · {v.origin ?? "—"} → {v.destination ?? "—"}
                        </div>
                        {v.etaMs && (
                          <div className="mono mt-0.5 text-[10px] uppercase tracking-widest text-runway/90">
                            ETA {formatEtaUtc(v.etaMs)} · {formatRemainingFromNow(v.etaMs)}
                          </div>
                        )}
                      </div>
                      {arriving ? (
                        <PlaneLanding className="h-3.5 w-3.5 shrink-0 text-runway" />
                      ) : (
                        <PlaneTakeoff className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      )}
                    </li>
                  );
                })}
                {visitors.length > 4 && (
                  <li className="mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    + {visitors.length - 4} more
                  </li>
                )}
              </ul>
            </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}

type FlightSnapshot = {
  id: string;
  origin: string;
  destination: string;
  aircraft: string;
  tail?: string;
  licence?: string;
  sim?: string;
  etaMs?: number;
  distanceNm?: number;
};

function snapshotFromLive(f: MyLiveFlight): FlightSnapshot {
  return {
    id: f.id,
    origin: f.origin,
    destination: f.destination,
    aircraft: f.aircraftICAO,
    tail: f.tailNumber,
    licence: f.licenceCode,
    sim: f.sim,
    etaMs: f.etaMs,
    distanceNm: f.distanceNm,
  };
}

function CurrentFlightHero({
  live,
  liveMissionIds,
  completedIds,
  lastFlight,
}: {
  live: MyLiveFlight | null;
  liveMissionIds?: Set<string>;
  completedIds?: Set<string>;
  lastFlight: FlightLog | null;
}) {
  // Snapshot of the currently-displayed mission. We freeze it on first sight
  // (so a mid-flight aircraft/registration swap in SimFly's live feed cannot
  // mutate the card) and only replace it when a NEW mission id is detected.
  const [snapshot, setSnapshot] = useState<FlightSnapshot | null>(() =>
    live ? snapshotFromLive(live) : null,
  );
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (live && live.id !== snapshot?.id) {
      // New mission started → swap snapshot (and reset expand state).
      setSnapshot(snapshotFromLive(live));
      setExpanded(false);
    }
  }, [live, snapshot?.id]);

  // Decide ARRIVED with two explicit signals (whichever fires first):
  //   1. PRIMARY — snapshot mission id is no longer reported anywhere in the
  //      live hub feeds for a sustained grace period (debounces brief drops
  //      caused by SimFly feed jitter, refetch gaps, or network blips).
  //   2. FALLBACK — snapshot mission id appears in the completed flights /
  //      activities feed (server payload refresh, typically 60–90s later).
  const GRACE_MS = 25_000;
  const snapPresentNow =
    !!snapshot &&
    (liveMissionIds ? liveMissionIds.has(snapshot.id) : !!live && live.id === snapshot.id);
  const snapCompleted = !!snapshot && !!completedIds && completedIds.has(snapshot.id);

  // Track the last time the snapshot was observed in any live feed.
  const lastSeenRef = useRef<{ id: string; at: number } | null>(null);
  const [, force] = useState(0);
  useEffect(() => {
    if (!snapshot) {
      lastSeenRef.current = null;
      return;
    }
    if (snapPresentNow) {
      lastSeenRef.current = { id: snapshot.id, at: Date.now() };
      return;
    }
    if (lastSeenRef.current?.id !== snapshot.id) {
      // First time we see this snapshot id missing → seed the timer now so
      // the grace window starts from this observation, not from epoch.
      lastSeenRef.current = { id: snapshot.id, at: Date.now() };
    }
    // Schedule a re-render when the grace window elapses so we transition.
    const elapsed = Date.now() - (lastSeenRef.current?.at ?? Date.now());
    const remaining = Math.max(0, GRACE_MS - elapsed);
    const t = setTimeout(() => force((n) => n + 1), remaining + 50);
    return () => clearTimeout(t);
  }, [snapshot, snapPresentNow]);

  const withinGrace =
    !!snapshot &&
    !snapPresentNow &&
    !snapCompleted &&
    !!lastSeenRef.current &&
    lastSeenRef.current.id === snapshot.id &&
    Date.now() - lastSeenRef.current.at < GRACE_MS;

  const snapStillLive = snapPresentNow || withinGrace;

  // Phase 1: snapshot still present in live feeds (or within grace) → "EN ROUTE".
  if (snapshot && snapStillLive && !snapCompleted) {
    return <ExpandedBanner snap={snapshot} status="enroute" />;
  }

  // Phase 2: no snapshot yet but a live flight just appeared (between renders).
  if (live && !snapshot) {
    return <ExpandedBanner snap={snapshotFromLive(live)} status="enroute" />;
  }

  // Phase 3: snapshot dropped from live feeds OR is now in completed flights →
  // freeze as "ARRIVED" until a brand-new mission appears.
  if (snapshot) {
    return <ExpandedBanner snap={snapshot} status="arrived" />;
  }

  // Phase 4: cold start with no live and no prior snapshot → compact last-flight row.
  if (!lastFlight) return null;
  const origin = lastFlight.departure;
  const destination = lastFlight.destination;
  const aircraft = lastFlight.aircraftName;
  const tail = lastFlight.tailNumber;
  const licence = lastFlight.licenceCode;
  return (
    <section className="panel mb-4 overflow-hidden rounded-xl">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-muted/30"
      >
        <span className="mono inline-flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-muted-foreground">
          <Plane className="h-3 w-3" /> Last flight
        </span>
        <span className="font-display text-sm font-semibold tracking-tight md:text-base">
          {origin} <span className="text-muted-foreground">→</span> {destination}
        </span>
        <span className="mono hidden text-[11px] uppercase tracking-widest text-muted-foreground sm:inline">
          · {aircraft}
          {tail && ` · ${tail}`}
        </span>
        <span className="mono hidden text-[11px] uppercase tracking-widest text-muted-foreground md:inline">
          · {formatNumber(Math.round(lastFlight.distance))} NM · {lastFlight.flightTime}
        </span>
        <span className="ml-auto font-display text-sm font-semibold text-runway">
          +{lastFlight.pax.toFixed(2)} PAX
        </span>
        <span className="mono text-[10px] uppercase tracking-widest text-muted-foreground">
          {relativeTime(lastFlight.ts)}
        </span>
      </button>
      {expanded && (
        <div className="grid grid-cols-2 gap-3 border-t border-border px-4 py-3 text-xs sm:grid-cols-4">
          <div>
            <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground">Aircraft</div>
            <div className="font-display mt-0.5 text-sm font-semibold">{aircraft}{tail ? ` · ${tail}` : ""}</div>
          </div>
          {licence && (
            <div>
              <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground">License</div>
              <div className="font-display mt-0.5 inline-flex items-center gap-1 text-sm font-semibold">
                <IdCard className="h-3 w-3" /> {licence}
              </div>
            </div>
          )}
          <div>
            <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground">Distance</div>
            <div className="font-display mt-0.5 text-sm font-semibold">{formatNumber(Math.round(lastFlight.distance))} NM</div>
          </div>
          <div>
            <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground">Flight time</div>
            <div className="font-display mt-0.5 text-sm font-semibold">{lastFlight.flightTime}</div>
          </div>
        </div>
      )}
    </section>
  );
}

function ExpandedBanner({ snap, status }: { snap: FlightSnapshot; status: "enroute" | "arrived" }) {
  const isLive = status === "enroute";
  // Tick once a minute so "remaining" stays fresh while en route.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!isLive || !snap.etaMs) return;
    const t = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, [isLive, snap.etaMs]);
  const showEta = isLive && !!snap.etaMs;
  return (
    <section className="panel relative mb-4 overflow-hidden rounded-xl px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className={`mono inline-flex items-center gap-2 text-[11px] uppercase tracking-widest ${isLive ? "text-runway" : "text-instrument"}`}>
          <Plane className="h-3.5 w-3.5" />
          {isLive ? "Current flight" : "Last flight"}
        </div>
        <div className="mono inline-flex items-center gap-1.5 text-[10px] uppercase tracking-widest">
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              isLive
                ? "animate-pulse bg-runway shadow-[0_0_8px_var(--runway)]"
                : "bg-instrument shadow-[0_0_8px_var(--instrument)]"
            }`}
          />
          <span className={isLive ? "text-runway" : "text-instrument"}>{isLive ? "Live" : "Arrived"}</span>
        </div>
      </div>

      <div className="mt-2 flex items-center gap-3">
        <div className="font-display text-xl font-semibold tracking-tight md:text-2xl">{snap.origin}</div>
        <div className="relative flex-1">
          <div className={`h-px w-full ${isLive ? "bg-gradient-to-r from-runway/40 via-runway/30 to-instrument/40" : "bg-gradient-to-r from-instrument/30 via-instrument/20 to-instrument/30"}`} />
          <Plane
            className={`absolute top-1/2 h-4 w-4 ${isLive ? "text-runway" : "text-instrument"}`}
            style={{ left: isLive ? "50%" : "100%", transform: "translate(-50%, -50%)" }}
          />
        </div>
        <div className="font-display text-xl font-semibold tracking-tight md:text-2xl">{snap.destination}</div>
      </div>

      <div className="mono mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] uppercase tracking-widest text-muted-foreground">
        <span className="text-foreground">{snap.aircraft}</span>
        {snap.tail && <span>· {snap.tail}</span>}
        {snap.licence && (
          <span className="inline-flex items-center gap-1">
            · <IdCard className="h-3 w-3" /> {snap.licence}
          </span>
        )}
        {snap.sim && <span>· {snap.sim}</span>}
        <span className={`ml-auto ${isLive ? "text-runway/80" : "text-instrument/80"}`}>
          {isLive ? "En route" : "Arrived"}
        </span>
      </div>

      {showEta && (
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border pt-2 text-xs">
          <span className="mono text-[10px] uppercase tracking-widest text-muted-foreground">ETA</span>
          <span className="font-display text-sm font-semibold text-runway">{formatEtaUtc(snap.etaMs!)}</span>
          <span className="mono text-[11px] uppercase tracking-widest text-foreground">
            {formatRemainingFromNow(snap.etaMs!)}
          </span>
          {snap.distanceNm && (
            <span className="mono ml-auto text-[10px] uppercase tracking-widest text-muted-foreground">
              {Math.round(snap.distanceNm)} NM
            </span>
          )}
        </div>
      )}
    </section>
  );
}


function PilotSwitcher({ current }: { current: string | null }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(current ?? "");

  function apply(e?: React.FormEvent) {
    e?.preventDefault();
    const v = value.trim();
    setViewedUser(v || null);
    setOpen(false);
  }
  function reset() {
    setValue("");
    setViewedUser(null);
    setOpen(false);
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="mono inline-flex items-center gap-2 rounded-md border border-border bg-secondary/40 px-3 py-1.5 text-[11px] uppercase tracking-widest text-foreground transition hover:bg-secondary"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <UserCog className="h-3.5 w-3.5 text-runway" />
        @{current ?? "you"}
      </button>
      {open && (
        <form
          onSubmit={apply}
          className="panel absolute right-0 z-30 mt-2 w-72 rounded-xl p-4 shadow-xl"
        >
          <div className="mb-2 flex items-center justify-between">
            <div className="mono text-[10px] uppercase tracking-widest text-runway">View as pilot</div>
            <button type="button" onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <p className="mb-2 text-[11px] text-muted-foreground">
            Enter any SimFly.io username. Empty = your own account.
          </p>
          <input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="e.g. shill"
            className="mono w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-runway"
          />
          <div className="mt-3 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={reset}
              className="mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground"
            >
              Reset to me
            </button>
            <button
              type="submit"
              className="mono rounded-md bg-runway/20 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-widest text-runway transition hover:bg-runway/30"
            >
              View pilot
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
