import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { AppShell, PageHeader } from "@/components/app-shell";
import { HubSupportGate } from "@/components/hub-support";
import { getHubSupportStatus } from "@/lib/hub-support.functions";
import { getSimflyPayload, getUpgradeAdvisor } from "@/lib/simfly.functions";
import { getCommunityWeek } from "@/lib/community-radar.functions";
import {
  getCommandActivity,
  getCommandLive,
  getCommandPulse,
  getCommandValue,
} from "@/lib/airport-command.functions";
import { useSimflyArgs } from "@/lib/viewed-user";
import {
  ActivityFeed,
  AdvisorPanel,
  CapacityPanel,
  CommunityPanel,
  DispatchPanel,
  DnaPanel,
  LiveBoard,
  OwnerImpactPanel,
  PulseHeader,
  RevenuePanel,
  ValueProfilePanel,
} from "@/components/airport-command/panels";
import { cn } from "@/lib/utils";
import { Radio } from "lucide-react";

export const Route = createFileRoute("/airport-command")({
  component: AirportCommandPage,
  head: () => ({
    meta: [
      { title: "Airport Command Center — SimFly Hub" },
      {
        name: "description",
        content:
          "A private operations room for one owned SimFly airport — live inbound traffic, capacity pressure, traffic value and upgrade outlook.",
      },
      { property: "og:title", content: "Airport Command Center — SimFly Hub" },
      {
        property: "og:description",
        content:
          "Live inbound traffic, capacity pressure, traffic value and upgrade outlook for a single owned airport.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

const STORAGE_KEY = "simfly:command:icao";

function AirportCommandPage() {
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
          title="Airport Command Center"
          description="A private control tower for one of your airports."
        />
        <HubSupportGate featureName="Airport Command Center" />
      </AppShell>
    );
  }
  return <CommandCenter />;
}

function CommandCenter() {
  const { keyTag, payload, username } = useSimflyArgs();
  const payloadFn = useServerFn(getSimflyPayload);
  const { data: base } = useSuspenseQuery(
    queryOptions({
      queryKey: ["simfly", keyTag],
      queryFn: () => payloadFn(payload ? { data: payload } : undefined),
      staleTime: 30 * 60_000,
    }),
  );

  const airports = base.airports;
  const [icao, setIcao] = useState<string | null>(null);
  const [feedFilter, setFeedFilter] = useState<"all" | "owned" | "others">("all");

  useEffect(() => {
    if (icao || airports.length === 0) return;
    const stored =
      typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
    const match = airports.find((a) => a.icao.toUpperCase() === (stored ?? "").toUpperCase());
    setIcao(match ? match.icao.toUpperCase() : null);
  }, [airports, icao]);

  function select(next: string) {
    setIcao(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* storage unavailable — selection stays in memory */
    }
  }

  const args = useMemo(() => (username ? { username } : {}), [username]);

  const pulseFn = useServerFn(getCommandPulse);
  const activityFn = useServerFn(getCommandActivity);
  const liveFn = useServerFn(getCommandLive);
  const valueFn = useServerFn(getCommandValue);
  const advisorFn = useServerFn(getUpgradeAdvisor);
  const communityFn = useServerFn(getCommunityWeek);

  const enabled = !!icao;

  const pulseQ = useQuery({
    queryKey: ["cmd-pulse", keyTag, icao],
    queryFn: () => pulseFn({ data: { icao: icao!, ...args } }),
    enabled,
    staleTime: 10 * 60_000,
  });
  const activityQ = useQuery({
    queryKey: ["cmd-activity", keyTag, icao],
    queryFn: () => activityFn({ data: { icao: icao!, pages: 10, ...args } }),
    enabled,
    staleTime: 10 * 60_000,
  });
  const liveQ = useQuery({
    queryKey: ["cmd-live", keyTag, icao],
    queryFn: () => liveFn({ data: { icao: icao!, ...args } }),
    enabled,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
  const valueQ = useQuery({
    queryKey: ["cmd-value", keyTag, icao],
    queryFn: () => valueFn({ data: { icao: icao!, pages: 40, ...args } }),
    enabled,
    staleTime: 30 * 60_000,
  });
  const communityQ = useQuery({
    queryKey: ["community-week", 0],
    queryFn: () => communityFn({ data: { weekOffset: 0 } }),
    enabled,
    staleTime: 10 * 60_000,
  });

  const selected = airports.find((a) => a.icao.toUpperCase() === icao);
  const advisorQ = useQuery({
    queryKey: ["cmd-advisor", keyTag, icao],
    queryFn: () =>
      advisorFn({
        data: {
          ...args,
          airports: [
            {
              icao: selected!.icao,
              name: selected!.name,
              tier: selected!.category,
              level: selected!.level,
              percToUser: selected!.percToUser ?? 0,
            },
          ],
        },
      }),
    enabled: enabled && !!selected,
    staleTime: 60 * 60_000,
  });

  const communityRank = useMemo(() => {
    if (!communityQ.data || !icao) return null;
    const ranked = communityQ.data.airports
      .slice()
      .sort((a, b) => b.operations - a.operations);
    const i = ranked.findIndex((a) => a.icao.toUpperCase() === icao);
    return i >= 0 ? i + 1 : null;
  }, [communityQ.data, icao]);

  return (
    <AppShell>
      <PageHeader
        eyebrow="Premium · Command"
        title="Airport Command Center"
        description="Pick one of your airports and open its private operations room. Every panel is a live read of an existing intelligence module — nothing here is recomputed."
      />

      <div className="panel mb-8 flex flex-wrap items-center gap-2 rounded-xl p-3">
        <span className="mono mr-1 flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-muted-foreground">
          <Radio className="size-3.5 text-runway" /> Airport
        </span>
        {airports.map((a) => (
          <button
            key={a.icao}
            onClick={() => select(a.icao.toUpperCase())}
            className={cn(
              "mono rounded-full border px-3 py-1 text-xs transition-colors",
              icao === a.icao.toUpperCase()
                ? "border-runway/60 bg-runway/10 text-runway"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {a.icao.toUpperCase()}
          </button>
        ))}
        {airports.length === 0 && (
          <span className="text-sm text-muted-foreground">
            You do not own any airports yet.
          </span>
        )}
      </div>

      {!icao && airports.length > 0 && (
        <div className="panel rounded-xl p-8 text-center">
          <p className="text-sm text-muted-foreground">
            Select an airport above to power up its control tower. Nothing is loaded until you
            choose one.
          </p>
        </div>
      )}

      {icao && (
        <div className="space-y-6">
          {pulseQ.data ? (
            <PulseHeader
              pulse={pulseQ.data}
              confidence={activityQ.data?.confidence}
              communityRank={communityRank}
            />
          ) : (
            <div className="panel rounded-xl p-6 text-sm text-muted-foreground">
              {pulseQ.error ? "Airport pulse unavailable." : "Powering up the tower…"}
            </div>
          )}

          <div className="grid gap-6 lg:grid-cols-2">
            <LiveBoard live={liveQ.data} loading={liveQ.isLoading} />
            {pulseQ.data && <CapacityPanel pulse={pulseQ.data} activity={activityQ.data} />}
          </div>

          <ActivityFeed
            activity={activityQ.data}
            loading={activityQ.isLoading}
            filter={feedFilter}
            onFilter={setFeedFilter}
          />

          <div className="grid gap-6 lg:grid-cols-2">
            <ValueProfilePanel value={valueQ.data} loading={valueQ.isLoading} />
            <RevenuePanel value={valueQ.data} loading={valueQ.isLoading} />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <OwnerImpactPanel activity={activityQ.data} />
            <DnaPanel activity={activityQ.data} />
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <AdvisorPanel advisor={advisorQ.data} icao={icao} loading={advisorQ.isLoading} />
            <CommunityPanel week={communityQ.data} icao={icao} loading={communityQ.isLoading} />
            <DispatchPanel icao={icao} />
          </div>
        </div>
      )}
    </AppShell>
  );
}
