import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { Search, Telescope } from "lucide-react";
import { AppShell, PageHeader } from "@/components/app-shell";
import { useSimflyArgs } from "@/lib/viewed-user";
import { searchAirports } from "@/lib/simfly.functions";
import { getCommunityWeek } from "@/lib/community-radar.functions";
import {
  getAirportSpyAccess,
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
  Panel,
  PerformanceExplanation,
  RecordHeader,
  TrafficComposition,
  VisitorIntelligence,
} from "@/components/airport-spy/panels";
import { airportUpgradeCost } from "@/lib/airport-upgrade-costs";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/airport-spy")({
  component: AirportSpyPage,
  head: () => ({
    meta: [
      { title: "Airport Spy — SimFly Intelligence Laboratory" },
      {
        name: "description",
        content:
          "An invitation-only research module that investigates SimFly airports and accumulates permanent, evidence-only intelligence about how they perform.",
      },
      { property: "og:title", content: "Airport Spy — SimFly Intelligence Laboratory" },
      {
        property: "og:description",
        content:
          "Reverse-engineer how SimFly airports perform from observed public flight logs. Evidence only, never estimates.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
});

const STORAGE_KEY = "simfly:spy:icao";

function AirportSpyPage() {
  const { keyTag, payload } = useSimflyArgs();
  const accessFn = useServerFn(getAirportSpyAccess);
  const { data: access, isLoading } = useQuery({
    queryKey: ["airport-spy-access", keyTag],
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
          title="Airport Spy"
          description="The Hub's internal intelligence laboratory."
        />
        <div className="panel rounded-xl p-8 text-center">
          <Telescope className="mx-auto h-8 w-8 text-runway" />
          <h2 className="font-display mt-3 text-lg font-semibold">Access by invitation</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Airport Spy is a research programme with a manually managed participant list.
            Supporter status alone does not grant access. Signed in as{" "}
            <span className="mono text-foreground">{access?.username ?? "—"}</span>.
          </p>
        </div>
      </AppShell>
    );
  }

  return <SpyTerminal />;
}

function SpyTerminal() {
  const qc = useQueryClient();
  const { keyTag, username } = useSimflyArgs();
  const args = useMemo(() => (username ? { username } : {}), [username]);

  const [icao, setIcao] = useState<string | null>(null);
  const [term, setTerm] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (icao) return;
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) setIcao(stored.toUpperCase());
    } catch {
      /* storage unavailable */
    }
  }, [icao]);

  function select(next: string) {
    const value = next.trim().toUpperCase();
    setIcao(value);
    setTerm("");
    setMessage(null);
    try {
      window.localStorage.setItem(STORAGE_KEY, value);
    } catch {
      /* storage unavailable */
    }
  }

  const searchFn = useServerFn(searchAirports);
  const { data: results } = useQuery({
    queryKey: ["airport-spy-search", term],
    queryFn: () => searchFn({ data: { query: term, limit: 8 } }),
    enabled: term.trim().length >= 2,
    staleTime: 60_000,
  });

  const intelFn = useServerFn(getAirportSpyIntel);
  const { data: intel } = useQuery({
    queryKey: ["airport-spy-intel", keyTag, icao],
    queryFn: () => intelFn({ data: { icao: icao!, ...args } }),
    enabled: Boolean(icao),
    refetchInterval: (q) => (q.state.data?.status === "running" ? 2000 : false),
  });

  const nearbyFn = useServerFn(getAirportSpyNearby);
  const { data: nearby } = useQuery({
    queryKey: ["airport-spy-nearby", keyTag, icao],
    queryFn: () => nearbyFn({ data: { icao: icao!, ...args } }),
    enabled: Boolean(icao),
    staleTime: 10 * 60_000,
  });

  const radarFn = useServerFn(getCommunityWeek);
  const { data: radar } = useQuery({
    queryKey: ["airport-spy-radar"],
    queryFn: () => radarFn({ data: { weekOffset: 0 } }),
    staleTime: 10 * 60_000,
  });

  const startFn = useServerFn(startAirportSpyInvestigation);
  const investigate = useMutation({
    mutationFn: (depthPages: number) =>
      startFn({ data: { icao: icao!, depthPages, ...args } }),
    onSuccess: (r) => {
      setMessage(r.message);
      qc.invalidateQueries({ queryKey: ["airport-spy-intel"] });
      qc.invalidateQueries({ queryKey: ["airport-spy-nearby"] });
    },
    onError: (e) => setMessage(e instanceof Error ? e.message : String(e)),
  });

  const running = investigate.isPending || intel?.status === "running";

  return (
    <AppShell>
      <PageHeader
        eyebrow="Intelligence laboratory"
        title="Airport Spy"
        description="How does this airport perform, and why? Every figure here is an observation recorded from SimFly's public flight log — nothing is estimated."
      />

      <div className="panel mb-4 rounded-xl p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[240px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Search any SimFly airport — ICAO or name"
              className="mono w-full rounded-lg bg-secondary/60 py-2 pl-9 pr-3 text-sm outline-none ring-1 ring-border focus:ring-runway/50"
            />
            {results && results.length > 0 && term.trim().length >= 2 ? (
              <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-border bg-card shadow-xl">
                {results.map((r) => (
                  <button
                    key={r.icao}
                    onClick={() => select(r.icao)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-secondary"
                  >
                    <span className="mono text-xs text-runway">{r.icao}</span>
                    <span className="truncate text-muted-foreground">{r.name}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <button
            disabled={!icao || running}
            onClick={() => investigate.mutate(18)}
            className={cn(
              "mono rounded-lg px-4 py-2 text-xs uppercase tracking-widest ring-1 transition",
              !icao || running
                ? "bg-secondary text-muted-foreground ring-border"
                : "bg-runway/15 text-runway ring-runway/40 hover:bg-runway/25",
            )}
          >
            {running ? "Investigating…" : intel?.exists ? "Extend investigation" : "Investigate"}
          </button>
          <button
            disabled={!icao || running}
            onClick={() => investigate.mutate(48)}
            className="mono rounded-lg bg-secondary px-4 py-2 text-xs uppercase tracking-widest text-muted-foreground ring-1 ring-border transition hover:text-foreground disabled:opacity-50"
          >
            Deep scan
          </button>
        </div>
      </div>

      {!icao ? (
        <div className="panel rounded-xl p-8 text-center text-sm text-muted-foreground">
          Select an airport to open its intelligence record. Records are permanent and grow with
          every investigation.
        </div>
      ) : !intel ? (
        <div className="panel rounded-xl p-6 text-sm text-muted-foreground">Reading record…</div>
      ) : (
        <div className="space-y-4">
          <RecordHeader intel={intel} />
          <InvestigationConsole intel={intel} running={running} message={message} />
          {!intel.exists && !running ? (
            <div className="panel rounded-xl p-6">
              <NotObserved hint="This airport has never been investigated. Start an investigation to create its record." />
            </div>
          ) : null}
          <OperationalProfile intel={intel} />
          <div className="grid gap-4 lg:grid-cols-2">
            <DemandHistory weeks={intel.weeks} />
            <VisitorIntelligence pilots={intel.pilots} intel={intel} />
          </div>
          <TrafficComposition intel={intel} />
          <EconomicProfile intel={intel} />
          <PerformanceExplanation intel={intel} weeks={intel.weeks} pilots={intel.pilots} />
          <div className="grid gap-4 lg:grid-cols-2">
            <NearbyAirports nearby={nearby} onSelect={select} />
            <UpgradeOutlook intel={intel} />
          </div>
          <HubEnrichment icao={intel.icao} radar={radar} />
        </div>
      )}
    </AppShell>
  );
}

function UpgradeOutlook({ intel }: { intel: SpyIntel }) {
  const weeks = intel.weeks;
  if (!intel.tier || !intel.level || weeks.length < 2) {
    return (
      <Panel title="Upgrade outlook" source="simfly">
        <NotObserved hint="At least two observed weeks and a known tier and level are required." />
      </Panel>
    );
  }
  const paying = intel.traffic.filter((t) => t.dimension === "tier_level");
  const flights = paying.reduce((s, t) => s + t.flights, 0);
  const ownerPax = paying.reduce((s, t) => s + t.observedOwnerPax, 0);
  if (!flights) {
    return (
      <Panel title="Upgrade outlook" source="simfly">
        <NotObserved hint="No flights with an observed airport payout yet." />
      </Panel>
    );
  }
  const opsPerDay = intel.operations / Math.max(1, weeks.length * 7);
  const avgOwner = ownerPax / flights;
  const dailyNow = opsPerDay * avgOwner;
  const cost = airportUpgradeCost(intel.tier, intel.level + 1);
  const dailyGain = dailyNow * 0.1; // observed payout scale per level, existing Hub constant
  const paybackDays = dailyGain > 0 ? cost / dailyGain : null;

  return (
    <Panel title="Upgrade outlook" source="simfly">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ["Observed daily credit", dailyNow.toFixed(1)],
          ["Next level", `L${intel.level + 1}`],
          ["Upgrade cost", cost.toLocaleString()],
          ["Payback", paybackDays ? `${Math.round(paybackDays)} d` : "—"],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg bg-secondary/40 px-3 py-2 ring-1 ring-border/60">
            <div className="mono text-[9px] uppercase tracking-widest text-muted-foreground">
              {label}
            </div>
            <div className="mono mt-0.5 text-lg font-semibold tabular-nums">{value}</div>
          </div>
        ))}
      </div>
      <div className="mono mt-2 text-[11px] text-muted-foreground">
        Derived from {flights.toLocaleString()} observed paying flights over {weeks.length} weeks.
      </div>
    </Panel>
  );
}

function HubEnrichment({
  icao,
  radar,
}: {
  icao: string;
  radar: Awaited<ReturnType<typeof getCommunityWeek>> | undefined;
}) {
  const hit = radar?.airports.find((a) => a.icao.toUpperCase() === icao);
  const rank = hit
    ? (radar?.airports ?? [])
        .slice()
        .sort((a, b) => b.operations - a.operations)
        .findIndex((a) => a.icao.toUpperCase() === icao) + 1
    : null;

  return (
    <Panel title="Hub community enrichment" source="hub">
      {!hit ? (
        <NotObserved hint="No tracked Hub community activity for this airport this week. SimFly intelligence above is unaffected." />
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            ["Community rank", rank ? `#${rank}` : "—"],
            ["Tracked operations", hit.operations.toLocaleString()],
            ["Unique pilots", hit.uniquePilots.toLocaleString()],
            ["Top visitor", hit.topVisitor ?? "—"],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg bg-secondary/40 px-3 py-2 ring-1 ring-border/60">
              <div className="mono text-[9px] uppercase tracking-widest text-muted-foreground">
                {label}
              </div>
              <div className="mono mt-0.5 truncate text-lg font-semibold tabular-nums">{value}</div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
