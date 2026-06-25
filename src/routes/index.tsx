import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, useQuery, queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { getSimflyPayload, getMyHubsIncomingTraffic, getMyLiveFlights } from "@/lib/simfly.functions";
import { useSimflyArgs, setViewedUser } from "@/lib/viewed-user";
import type { AirportExt, AirportLiveVisitor, MyLiveFlight } from "@/lib/types";
import {
  AppShell, PageHeader, StatCard, TierPill, RotationCell, formatNumber, relativeTime,
} from "@/components/app-shell";
import { Coins, Trophy, Plane, Building2, ArrowUpRight, Wallet, Radio, PlaneLanding, PlaneTakeoff, UserCog, X, Heart, Coffee } from "lucide-react";
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
  const { keyTag, payload, username: viewedUser } = useSimflyArgs();
  const { data } = useSuspenseQuery(
    queryOptions({
      queryKey: ["simfly", keyTag],
      queryFn: () => fn(payload ? { data: payload } : undefined),
      staleTime: 30_000,
    }),
  );

  const trafficFn = useServerFn(getMyHubsIncomingTraffic);
  const myFlightsFn = useServerFn(getMyLiveFlights);
  const icaos = useMemo(
    () => Array.from(new Set(data.airports.map((a) => a.icao).filter(Boolean))),
    [data.airports],
  );
  const { data: hubTraffic = [] } = useQuery({
    queryKey: ["simfly", "hubTraffic", keyTag, icaos],
    queryFn: () => trafficFn({ data: { icaos, ...(viewedUser ? { username: viewedUser } : {}) } }),
    enabled: icaos.length > 0,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
  const { data: myFlights = [] } = useQuery({
    queryKey: ["simfly", "myLiveFlights", keyTag, icaos],
    queryFn: () => myFlightsFn({ data: { icaos, ...(viewedUser ? { username: viewedUser } : {}) } }),
    enabled: icaos.length > 0,
    refetchInterval: 60_000,
    staleTime: 30_000,
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


      <section className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
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
          label="Pilot level"
          value={`L${data.level}`}
          hint={`${formatNumber(data.xp)} XP`}
          icon={Trophy}
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
