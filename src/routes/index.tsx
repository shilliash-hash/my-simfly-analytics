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
      staleTime: 30 * 60_000,
      refetchInterval: 30 * 60_000,
    }),
  );

  // Licznik przechowujący w pamięci przeglądarki dokładny czas ostatniego czyszczenia cache
  const lastInvalidateRef = useRef<number>(0);

  // Bezpiecznik: Czyści cache hub-support maksymalnie raz na 30 minut, blokując nieskończoną pętlę
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
                <YAxis stroke="var(--muted-foreground)" fontSize={11} />
                <Tooltip />
                <Area type="monotone" dataKey="pax" stroke="var(--runway)" fillOpacity={1} fill="url(#gradPax)" />
                <Area type="monotone" dataKey="visitorPax" stroke="var(--instrument)" fillOpacity={1} fill="url(#gradVisitors)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>
    </AppShell>
  );
}
