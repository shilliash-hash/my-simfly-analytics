import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Telescope } from "lucide-react";
import { AppShell, PageHeader } from "@/components/app-shell";
import { useSimflyArgs } from "@/lib/viewed-user";
import {
  getAirportSpyIntel,
  getAirportSpyNearby,
  startAirportSpyInvestigation,
  type SpyIntel,
} from "@/lib/airport-spy.functions";
import {
  DemandHistory,
  EconomicProfile,
  InvestigationConsole,
  NearbyAirports,
  NotObserved,
  OperationalProfile,
  PerformanceExplanation,
  RecordHeader,
  TrafficComposition,
  VisitorIntelligence,
} from "@/components/airport-spy/panels";
import {
  addSystemAirportWatch,
  getSystemAirportAccess,
  getSystemAirportDiscovery,
  listSystemAirportWatch,
  openSystemAirportWatch,
  removeSystemAirportWatch,
  runSystemAirportScan,
} from "@/lib/system-airports.functions";
import {
  AnalyzerControls,
  DiscoveryTable,
  WatchlistPanel,
} from "@/components/system-airports/panels";

export const Route = createFileRoute("/system-airports")({
  component: SystemAirportsPage,
  head: () => ({
    meta: [
      { title: "System Airports Analyzer — SimFly Hub" },
      {
        name: "description",
        content:
          "Private research tool for finding SimFly-owned airports that already carry real player demand, with a persistent watchlist.",
      },
      { property: "og:title", content: "System Airports Analyzer — SimFly Hub" },
      {
        property: "og:description",
        content:
          "Discover system-owned SimFly airports with observed player traffic and keep the interesting ones on a permanent watchlist.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
});

const TIER_KEY = "simfly:sysair:tiers";
const WINDOW_KEY = "simfly:sysair:window";
const ICAO_KEY = "simfly:sysair:icao";

function SystemAirportsPage() {
  const { keyTag, payload } = useSimflyArgs();
  const accessFn = useServerFn(getSystemAirportAccess);
  const { data: access, isLoading } = useQuery({
    queryKey: ["system-airports-access", keyTag],
    queryFn: () => accessFn(payload ? { data: payload } : undefined),
    staleTime: 5 * 60_000,
  });

  if (isLoading) {
    return (
      <AppShell>
        <div className="panel rounded-xl p-6 text-sm text-muted-foreground">Loading…</div>
      </AppShell>
    );
  }

  if (!access?.allowed) {
    return (
      <AppShell>
        <PageHeader
          eyebrow="Research programme"
          title="System Airports Analyzer"
          description="Private airport research tool."
        />
        <div className="panel rounded-xl p-8 text-center">
          <Telescope className="mx-auto h-8 w-8 text-runway" />
          <h2 className="font-display mt-3 text-lg font-semibold">Access by invitation</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            The analyzer shares the Airport Spy participant list. Signed in as{" "}
            <span className="mono text-foreground">{access?.username ?? "—"}</span>.
          </p>
        </div>
      </AppShell>
    );
  }

  return <AnalyzerTerminal />;
}

function AnalyzerTerminal() {
  const qc = useQueryClient();
  const { keyTag, username } = useSimflyArgs();
  const args = useMemo(() => (username ? { username } : {}), [username]);

  const [tiers, setTiers] = useState<number[]>([3, 4]);
  const [windowDays, setWindowDays] = useState(90);
  const [icao, setIcao] = useState<string | null>(null);
  const [busyIcao, setBusyIcao] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    try {
      const t = window.localStorage.getItem(TIER_KEY);
      if (t) {
        const parsed = JSON.parse(t) as number[];
        if (Array.isArray(parsed) && parsed.length) setTiers(parsed);
      }
      const w = window.localStorage.getItem(WINDOW_KEY);
      if (w !== null) setWindowDays(Number(w));
      const a = window.localStorage.getItem(ICAO_KEY);
      if (a) setIcao(a.toUpperCase());
    } catch {
      /* storage unavailable */
    }
  }, []);

  function persist(key: string, value: string) {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      /* storage unavailable */
    }
  }

  function toggleTier(t: number) {
    setTiers((prev) => {
      const next = prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t].sort();
      persist(TIER_KEY, JSON.stringify(next));
      return next;
    });
  }

  function pickWindow(days: number) {
    setWindowDays(days);
    persist(WINDOW_KEY, String(days));
  }

  function open(next: string) {
    const value = next.trim().toUpperCase();
    setIcao(value);
    persist(ICAO_KEY, value);
    openFn({ data: { icao: value, ...args } }).catch(() => undefined);
  }

  const openFn = useServerFn(openSystemAirportWatch);
  const discoveryFn = useServerFn(getSystemAirportDiscovery);
  const { data: discovery, isFetching: discoveryLoading } = useQuery({
    queryKey: ["system-airports-discovery", keyTag, tiers.join(","), windowDays],
    queryFn: () => discoveryFn({ data: { tiers, windowDays, ...args } }),
    staleTime: 5 * 60_000,
    enabled: tiers.length > 0,
  });

  const watchFn = useServerFn(listSystemAirportWatch);
  const { data: watchlist } = useQuery({
    queryKey: ["system-airports-watch", keyTag],
    queryFn: () => watchFn(args.username ? { data: args } : undefined),
    staleTime: 60_000,
  });

  const scanFn = useServerFn(runSystemAirportScan);
  const scan = useMutation({
    mutationFn: () => scanFn({ data: { tiers, windowDays, ...args } }),
    onSuccess: (r) => {
      setMessage(r.message);
      qc.invalidateQueries({ queryKey: ["system-airports-discovery"] });
      qc.invalidateQueries({ queryKey: ["system-airports-watch"] });
    },
    onError: (e) => setMessage(e instanceof Error ? e.message : String(e)),
  });

  const addFn = useServerFn(addSystemAirportWatch);
  const removeFn = useServerFn(removeSystemAirportWatch);
  const watchToggle = useMutation({
    mutationFn: async (v: { icao: string; watched: boolean }) =>
      v.watched
        ? removeFn({ data: { icao: v.icao, ...args } })
        : addFn({ data: { icao: v.icao, ...args } }),
    onMutate: (v) => setBusyIcao(v.icao),
    onSettled: () => {
      setBusyIcao(null);
      qc.invalidateQueries({ queryKey: ["system-airports-discovery"] });
      qc.invalidateQueries({ queryKey: ["system-airports-watch"] });
    },
  });

  const startFn = useServerFn(startAirportSpyInvestigation);
  const analyze = useMutation({
    mutationFn: (v: { icao: string; depthPages: number }) =>
      startFn({ data: { icao: v.icao, depthPages: v.depthPages, ...args } }),
    onMutate: (v) => setBusyIcao(v.icao),
    onSuccess: (r) => setMessage(r.message),
    onError: (e) => setMessage(e instanceof Error ? e.message : String(e)),
    onSettled: () => {
      setBusyIcao(null);
      qc.invalidateQueries({ queryKey: ["airport-spy-intel"] });
      qc.invalidateQueries({ queryKey: ["system-airports-discovery"] });
      qc.invalidateQueries({ queryKey: ["system-airports-watch"] });
    },
  });

  if (icao) {
    return (
      <AirportDetail
        icao={icao}
        windowDays={windowDays}
        onBack={() => {
          setIcao(null);
          persist(ICAO_KEY, "");
        }}
        onSelect={open}
        watched={Boolean(watchlist?.some((w) => w.icao === icao))}
        onWatch={(watched) => watchToggle.mutate({ icao, watched })}
        onAnalyze={(depthPages) => analyze.mutate({ icao, depthPages })}
        analyzing={analyze.isPending}
        message={message}
      />
    );
  }

  return (
    <AppShell>
      <PageHeader
        eyebrow="Private research"
        title="System Airports Analyzer"
        description="Find SimFly-owned airports that already carry real player traffic. Every figure is an observation — potential demand, never guaranteed return."
      />

      <AnalyzerControls
        tiers={tiers}
        onToggleTier={toggleTier}
        windowDays={windowDays}
        onWindow={pickWindow}
        onScan={() => scan.mutate()}
        scanning={scan.isPending}
        scan={discovery?.scan ?? null}
        pending={discovery?.pending ?? 0}
      />

      <WatchlistPanel
        rows={watchlist}
        onOpen={open}
        onRemove={(code) => watchToggle.mutate({ icao: code, watched: true })}
        onAnalyze={(code) => analyze.mutate({ icao: code, depthPages: 18 })}
        busyIcao={busyIcao}
      />

      {message ? (
        <div className="mono mb-3 rounded-lg bg-secondary/40 px-3 py-2 text-[11px] text-muted-foreground ring-1 ring-border/60">
          {message}
        </div>
      ) : null}

      {discoveryLoading && !discovery ? (
        <div className="panel rounded-xl p-6 text-sm text-muted-foreground">
          Reading observed activity…
        </div>
      ) : (
        <>
          <DiscoveryTable
            rows={discovery?.rows ?? []}
            onOpen={open}
            onWatch={(code, watched) => watchToggle.mutate({ icao: code, watched })}
            busyIcao={busyIcao}
          />
          <p className="mono mt-2 text-[11px] text-muted-foreground">
            {(discovery?.candidates ?? 0).toLocaleString()} candidate airports observed in the
            selected period · {(discovery?.rows.length ?? 0).toLocaleString()} system-owned in the
            selected tiers · detailed history is only read for airports you open.
          </p>
        </>
      )}
    </AppShell>
  );
}

/** Clip an intel record to the selected analysis window, evidence only. */
function windowIntel(intel: SpyIntel, windowDays: number): SpyIntel {
  if (!windowDays) return intel;
  const cutoff = Date.now() - windowDays * 24 * 60 * 60_000;
  const weeks = intel.weeks.filter((w) => Date.parse(w.weekStartUtc) >= cutoff);
  if (weeks.length === intel.weeks.length) return intel;
  const sum = (pick: (w: (typeof weeks)[number]) => number) =>
    weeks.reduce((s, w) => s + pick(w), 0);
  return {
    ...intel,
    weeks,
    weeksCovered: weeks.length,
    operations: sum((w) => w.operations),
    arrivals: sum((w) => w.arrivals),
    departures: sum((w) => w.departures),
    uniquePilots: Math.max(...weeks.map((w) => w.uniquePilots), 0),
    uniqueAircraft: Math.max(...weeks.map((w) => w.uniqueAircraft), 0),
  };
}

function AirportDetail({
  icao,
  windowDays,
  onBack,
  onSelect,
  watched,
  onWatch,
  onAnalyze,
  analyzing,
  message,
}: {
  icao: string;
  windowDays: number;
  onBack: () => void;
  onSelect: (icao: string) => void;
  watched: boolean;
  onWatch: (watched: boolean) => void;
  onAnalyze: (depthPages: number) => void;
  analyzing: boolean;
  message: string | null;
}) {
  const { keyTag, username } = useSimflyArgs();
  const args = useMemo(() => (username ? { username } : {}), [username]);

  const intelFn = useServerFn(getAirportSpyIntel);
  const { data: full } = useQuery({
    queryKey: ["airport-spy-intel", keyTag, icao],
    queryFn: () => intelFn({ data: { icao, ...args } }),
    refetchInterval: (q) => (q.state.data?.status === "running" ? 2000 : false),
  });

  const nearbyFn = useServerFn(getAirportSpyNearby);
  const { data: nearby } = useQuery({
    queryKey: ["airport-spy-nearby", keyTag, icao],
    queryFn: () => nearbyFn({ data: { icao, ...args } }),
    staleTime: 10 * 60_000,
  });

  const running = analyzing || full?.status === "running";
  const intel = full ? windowIntel(full, windowDays) : undefined;
  const windowLabel = windowDays ? `${windowDays}D` : "all observed";
  const coverageShort = Boolean(
    full && windowDays && full.weeks.length * 7 < windowDays && full.exists,
  );

  return (
    <AppShell>
      <PageHeader
        eyebrow="Private research"
        title={`${icao} — airport analysis`}
        description={`Observed history over the selected period (${windowLabel}). Nothing is estimated; gaps stay visible.`}
        actions={
          <div className="flex gap-2">
            <button
              onClick={onBack}
              className="mono inline-flex items-center gap-1 rounded-lg bg-secondary px-3 py-2 text-xs uppercase tracking-widest text-muted-foreground ring-1 ring-border hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Results
            </button>
            <button
              onClick={() => onWatch(watched)}
              className="mono rounded-lg bg-secondary px-3 py-2 text-xs uppercase tracking-widest text-muted-foreground ring-1 ring-border hover:text-foreground"
            >
              {watched ? "Unwatch" : "Watch"}
            </button>
            <button
              disabled={running}
              onClick={() => onAnalyze(18)}
              className="mono rounded-lg bg-runway/15 px-3 py-2 text-xs uppercase tracking-widest text-runway ring-1 ring-runway/40 disabled:opacity-50"
            >
              {running ? "Analyzing…" : full?.exists ? "Deepen investigation" : "Analyze"}
            </button>
          </div>
        }
      />

      {!intel || !full ? (
        <div className="panel rounded-xl p-6 text-sm text-muted-foreground">Reading record…</div>
      ) : (
        <div className="space-y-4">
          <RecordHeader intel={intel} />
          <InvestigationConsole intel={full} running={running} message={message} />
          {!full.exists && !running ? (
            <div className="panel rounded-xl p-6">
              <NotObserved hint="This airport has never been analyzed. Start an analysis to build its record." />
            </div>
          ) : null}
          {coverageShort ? (
            <div className="mono rounded-lg bg-instrument/10 px-3 py-2 text-[11px] text-instrument ring-1 ring-instrument/30">
              Observed coverage: {full.weeks.length} weeks of the selected {windowLabel} window.
              Deepen the investigation to extend it — nothing is extrapolated to fill the gap.
            </div>
          ) : null}
          <OperationalProfile intel={intel} />
          <div className="grid gap-4 lg:grid-cols-2">
            <DemandHistory weeks={intel.weeks} />
            <VisitorIntelligence pilots={full.pilots} intel={full} />
          </div>
          <TrafficComposition intel={full} />
          <EconomicProfile intel={full} />
          <PerformanceExplanation intel={intel} weeks={intel.weeks} pilots={full.pilots} />
          <NearbyAirports nearby={nearby} onSelect={onSelect} />
        </div>
      )}
    </AppShell>
  );
}
