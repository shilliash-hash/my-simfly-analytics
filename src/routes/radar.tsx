import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useMemo, useState } from "react";
import { AppShell, PageHeader, formatNumber } from "@/components/app-shell";
import { HubSupportGate } from "@/components/hub-support";
import { getHubSupportStatus } from "@/lib/hub-support.functions";
import { useSimflyArgs } from "@/lib/viewed-user";
import { getCommunityWeek, getRadarAirportIdentity } from "@/lib/community-radar.functions";
import type { RadarAirport, RadarMetric } from "@/lib/community-radar.types";
import { RadarMap, RADAR_BANDS } from "@/components/radar-map";
import { SimbriefLink } from "@/components/simbrief-link";
import { cn } from "@/lib/utils";
import {
  Radar as RadarIcon,
  Sparkles,
  Users,
  Activity,
  Route as RouteIcon,
  ChevronRight,
  Search,
  X,
} from "lucide-react";

export const Route = createFileRoute("/radar")({
  component: RadarRoute,
  head: () => ({
    meta: [
      { title: "Community Radar — SimFly Hub" },
      {
        name: "description",
        content:
          "An interactive live map of SimFly community traffic — discover busy airports, emerging hotspots and where pilots are flying this week.",
      },
      { property: "og:title", content: "Community Radar — SimFly Hub" },
      {
        property: "og:description",
        content:
          "Explore SimFly community traffic on an interactive world map: weekly operations, unique pilots and newly discovered airports.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

const WEEKS = [
  { offset: 0, label: "Current week" },
  { offset: 1, label: "Previous week" },
  { offset: 2, label: "Two weeks ago" },
];

function RadarRoute() {
  const statusFn = useServerFn(getHubSupportStatus);
  const { keyTag, payload } = useSimflyArgs();
  const { data: status, isLoading } = useQuery({
    queryKey: ["hub-support", keyTag],
    queryFn: () => statusFn(payload ? { data: payload } : undefined),
    staleTime: 5 * 60_000,
  });

  if (isLoading) {
    return (
      <AppShell>
        <div className="panel rounded-xl p-6 text-sm text-muted-foreground">Loading…</div>
      </AppShell>
    );
  }
  if (!status?.active) {
    return (
      <AppShell>
        <PageHeader
          eyebrow="Premium"
          title="Community Radar"
          description="An interactive intelligence map of where the SimFly community is flying right now."
        />
        <HubSupportGate featureName="Community Radar" />
      </AppShell>
    );
  }
  return <CommunityRadar />;
}

function CommunityRadar() {
  const fn = useServerFn(getCommunityWeek);
  const [weekOffset, setWeekOffset] = useState(0);
  const [metric, setMetric] = useState<RadarMetric>("operations");
  const [discovery, setDiscovery] = useState(false);
  const [arcs, setArcs] = useState(false);
  const [railOpen, setRailOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [focusIcao, setFocusIcao] = useState<string | null>(null);
  const [detailIcao, setDetailIcao] = useState<string | null>(null);

  const { data } = useSuspenseQuery(
    queryOptions({
      queryKey: ["community-radar", weekOffset],
      queryFn: () => fn({ data: { weekOffset } }),
      staleTime: 60_000,
    }),
  );

  const ranked = useMemo(() => {
    const list = data.airports.slice();
    list.sort((a, b) =>
      metric === "operations" ? b.operations - a.operations : b.uniquePilots - a.uniquePilots,
    );
    return list;
  }, [data.airports, metric]);

  const emerging = useMemo(
    () => data.airports.filter((a) => a.isNew).sort((a, b) => b.operations - a.operations),
    [data.airports],
  );

  const detail = useMemo(
    () => data.airports.find((a) => a.icao === detailIcao) ?? null,
    [data.airports, detailIcao],
  );

  const onSelect = useCallback((icao: string) => setDetailIcao(icao), []);

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = search.trim().toUpperCase();
    if (!q) return;
    const hit = data.airports.find((a) => a.icao === q);
    if (hit) setFocusIcao(`${hit.icao}`);
  };

  const range = `${new Date(data.weekStartIso).toUTCString().slice(5, 11)} – ${new Date(
    data.weekEndIso,
  )
    .toUTCString()
    .slice(5, 11)}`;

  return (
    <AppShell>
      <PageHeader
        eyebrow="Premium"
        title="Community Radar"
        description="Explore where the SimFly community is flying. Zoom, hunt for hotspots and discover airports nobody was using last week."
      />

      {/* Control bar */}
      <div className="panel mt-4 flex flex-wrap items-center gap-2 rounded-xl px-3 py-2 text-xs">
        <div className="flex items-center gap-1 rounded-lg bg-muted/40 p-0.5">
          {WEEKS.map((w) => (
            <button
              key={w.offset}
              onClick={() => setWeekOffset(w.offset)}
              className={cn(
                "rounded-md px-2.5 py-1 transition-colors",
                weekOffset === w.offset
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {w.label}
            </button>
          ))}
        </div>

        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          Week {data.weekNumber} · {range}
        </span>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg bg-muted/40 p-0.5">
            <span className="px-2 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              Hotspots
            </span>
            <button
              onClick={() => setMetric("operations")}
              className={cn(
                "flex items-center gap-1 rounded-md px-2.5 py-1 transition-colors",
                metric === "operations"
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Activity className="h-3 w-3" /> Operations
            </button>
            <button
              onClick={() => setMetric("pilots")}
              className={cn(
                "flex items-center gap-1 rounded-md px-2.5 py-1 transition-colors",
                metric === "pilots"
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Users className="h-3 w-3" /> Unique pilots
            </button>
          </div>

          <Toggle active={discovery} onClick={() => setDiscovery((v) => !v)} icon={Sparkles}>
            Discovery
          </Toggle>
          <Toggle active={arcs} onClick={() => setArcs((v) => !v)} icon={RouteIcon}>
            Arcs
          </Toggle>

          <form onSubmit={submitSearch} className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ICAO"
              className="w-24 rounded-md border border-border/60 bg-muted/30 py-1 pl-6 pr-2 font-mono text-[11px] uppercase tracking-[0.12em] outline-none focus:border-primary/50"
            />
          </form>

          <Toggle active={railOpen} onClick={() => setRailOpen((v) => !v)} icon={RadarIcon}>
            Community
          </Toggle>
        </div>
      </div>

      {/* Map + rail */}
      <div className="mt-3 flex gap-3">
        <div className="panel relative min-w-0 flex-1 overflow-hidden rounded-xl p-0 h-[72vh]">
          <RadarMap
            airports={data.airports}
            routes={data.routes}
            metric={metric}
            discovery={discovery}
            arcs={arcs}
            focusIcao={focusIcao}
            onSelect={onSelect}
          />
          <div className="pointer-events-none absolute bottom-3 left-3 z-[500] flex flex-wrap items-center gap-2 rounded-lg bg-background/80 px-2.5 py-1.5 text-[10px] uppercase tracking-[0.14em] backdrop-blur">
            {RADAR_BANDS.map((b) => (
              <span key={b.label} className="flex items-center gap-1 text-muted-foreground">
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: b.color }}
                />
                {b.label}
              </span>
            ))}
            <span className="text-muted-foreground/70">
              · {formatNumber(data.totalFlights)} flights ({formatNumber(data.recordedFlights)}{" "}
              recorded / {formatNumber(data.observedFlights)} community) · {data.totalPilots} pilots
              · {data.newAirports} new
            </span>
            <span className="text-muted-foreground/70">
              ·{" "}
              {data.lastObservationAt
                ? `community sweep ${new Date(data.lastObservationAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                : "community layer cold — hub flights only"}
            </span>

          </div>
        </div>

        {railOpen ? (
          <aside className="panel hidden w-72 shrink-0 overflow-y-auto rounded-xl p-3 h-[72vh] lg:block">
            <RailSection
              title={metric === "operations" ? "Hotspots · operations" : "Hotspots · unique pilots"}
              rows={ranked.slice(0, 10)}
              metric={metric}
              onPick={setFocusIcao}
            />
            <RailSection
              title="Emerging this week"
              rows={emerging.slice(0, 8)}
              metric={metric}
              onPick={setFocusIcao}
              empty="No new airports this week."
            />
            <RailSection
              title="Busiest by movements"
              rows={data.airports.slice(0, 8)}
              metric="operations"
              onPick={setFocusIcao}
            />
          </aside>
        ) : null}
      </div>

      {detail ? <DetailPanel airport={detail} onClose={() => setDetailIcao(null)} /> : null}
    </AppShell>
  );
}

function Toggle({
  active,
  onClick,
  icon: Icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof Sparkles;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1 rounded-md border px-2.5 py-1 transition-colors",
        active
          ? "border-primary/50 bg-primary/15 text-primary"
          : "border-border/60 text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className="h-3 w-3" />
      {children}
    </button>
  );
}

function RailSection({
  title,
  rows,
  metric,
  onPick,
  empty,
}: {
  title: string;
  rows: RadarAirport[];
  metric: RadarMetric;
  onPick: (icao: string) => void;
  empty?: string;
}) {
  return (
    <section className="mb-4">
      <h2 className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        {title}
      </h2>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground/70">{empty ?? "Nothing here yet."}</p>
      ) : (
        <ul className="space-y-0.5">
          {rows.map((a) => (
            <li key={a.icao}>
              <button
                onClick={() => onPick(a.icao)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs transition-colors hover:bg-muted/40"
              >
                <span className="font-mono tracking-[0.08em] text-primary">{a.icao}</span>
                <span className="truncate text-muted-foreground">{a.owner ?? "—"}</span>
                <span className="ml-auto tabular-nums">
                  {metric === "operations" ? a.operations : a.uniquePilots}
                </span>
                <ChevronRight className="h-3 w-3 text-muted-foreground/60" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function DetailPanel({ airport, onClose }: { airport: RadarAirport; onClose: () => void }) {
  const identityFn = useServerFn(getRadarAirportIdentity);
  const { data: identity } = useQuery({
    queryKey: ["radar-identity", airport.icao],
    queryFn: () => identityFn({ data: { icao: airport.icao } }),
    staleTime: 60 * 60_000,
  });

  return (
    <div className="fixed inset-y-0 right-0 z-[1000] w-full max-w-sm overflow-y-auto border-l border-border/60 bg-background/95 p-5 backdrop-blur">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-mono text-lg tracking-[0.12em] text-primary">{airport.icao}</div>
          <div className="text-xs text-muted-foreground">{identity?.name ?? "Airport"}</div>
        </div>
        <button onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-y-2 text-sm">
        <dt className="text-muted-foreground">Owner</dt>
        <dd className="text-right">{airport.owner ?? identity?.owner ?? "Unknown"}</dd>
        <dt className="text-muted-foreground">Tier</dt>
        <dd className="text-right">{identity?.tier ?? "—"}</dd>
        <dt className="text-muted-foreground">Operations</dt>
        <dd className="text-right tabular-nums">{airport.operations}</dd>
        <dt className="text-muted-foreground">Arrivals</dt>
        <dd className="text-right tabular-nums">{airport.arrivals}</dd>
        <dt className="text-muted-foreground">Departures</dt>
        <dd className="text-right tabular-nums">{airport.departures}</dd>
        <dt className="text-muted-foreground">Unique pilots</dt>
        <dd className="text-right tabular-nums">{airport.uniquePilots}</dd>
      </dl>

      {airport.isNew ? (
        <p className="mt-3 flex items-center gap-1.5 rounded-lg border border-instrument/40 bg-instrument/10 px-2.5 py-1.5 text-[11px] text-instrument">
          <Sparkles className="h-3 w-3" /> Emerging — no activity here last week.
        </p>
      ) : null}

      <h3 className="mt-5 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        Top pilots
      </h3>
      <ul className="mt-1.5 space-y-1 text-xs">
        {airport.pilots.map((p) => (
          <li key={p.username} className="flex justify-between">
            <span className="truncate">{p.username}</span>
            <span className="tabular-nums text-muted-foreground">{p.operations}</span>
          </li>
        ))}
      </ul>

      <h3 className="mt-4 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        Common aircraft
      </h3>
      <ul className="mt-1.5 space-y-1 text-xs">
        {airport.aircraft.length ? (
          airport.aircraft.map((a) => (
            <li key={a.name} className="flex justify-between">
              <span className="truncate">{a.name}</span>
              <span className="tabular-nums text-muted-foreground">{a.operations}</span>
            </li>
          ))
        ) : (
          <li className="text-muted-foreground/70">No aircraft recorded.</li>
        )}
      </ul>

      <div className="mt-5">
        <SimbriefLink icao={airport.icao} showIcon>
          Dispatch to {airport.icao}
        </SimbriefLink>

      </div>
    </div>
  );
}
