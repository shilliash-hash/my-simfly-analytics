import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { getSimflyPayload, getMyLiveFlights } from "@/lib/simfly.functions";
import { useSimflyArgs } from "@/lib/viewed-user";
import { AppShell, PageHeader, formatNumber, relativeTime } from "@/components/app-shell";
import { FlightMap } from "@/components/flight-map";
import { Plane, ArrowUpRight, Route as RouteIcon, IdCard } from "lucide-react";
import type { ActivityKind } from "@/lib/types";

const PAGE_SIZE = 50;

// 1. Detektory ruchu hubowego (Visitor), najmu (Rental) oraz lotów własnych (Own Route)
const isOwnFlightEntry = (entry: { message: string }) => (entry.message || "").includes("my aircraft + my airport");

const isVisitorEntry = (entry: { message: string }) => {
  const msg = entry.message || "";
  // Jeśli to lot własną flotą na własne lotnisko, to NIE JEST to obcy odwiedzający (Visitor)
  if (isOwnFlightEntry(entry)) return false;
  return msg.includes("my airport") || msg.startsWith("(Visitor)");
};

const isRentalEntry = (entry: { message: string }) => {
  const msg = entry.message || "";
  // Jeśli to lot własną flotą na własne lotnisko, to NIE JEST to leasing (Rental)
  if (isOwnFlightEntry(entry)) return false;
  return msg.includes("my aircraft") || msg.toLowerCase().includes("your aircraft");
};



export const Route = createFileRoute("/activity")({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(
      queryOptions({ queryKey: ["simfly", "__self__"], queryFn: () => getSimflyPayload(), staleTime: 30_000 }),
    ),
  component: ActivityFeed,
  head: () => ({
    meta: [
      { title: "Activity — SimFly Hub" },
      { name: "description", content: "Chronological feed of routes, licenses and aircraft rental logs across SimFly." },
    ],
  }),
});

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  route: RouteIcon,
  license: IdCard,
  rental: Plane,
};

const COLORS: Record<string, string> = {
  route: "bg-tier-silver/15 text-tier-silver",
  license: "bg-instrument/15 text-instrument",
  rental: "bg-purple-500/15 text-purple-400 border border-purple-500/20",
};

function ActivityFeed() {
  const fn = useServerFn(getSimflyPayload);
  const { keyTag, payload, username } = useSimflyArgs();
  const { data } = useSuspenseQuery(
    queryOptions({
      queryKey: ["simfly", keyTag],
      queryFn: () => fn(payload ? { data: payload } : undefined),
      staleTime: 30_000,
    }),
  );

  const liveFn = useServerFn(getMyLiveFlights);
  const icaos = useMemo(
    () => Array.from(new Set(data.airports.map((a) => a.icao).filter(Boolean))),
    [data.airports],
  );
  const tails = useMemo(
    () => Array.from(new Set(data.airplanes.map((p) => p.tailNumber).filter(Boolean) as string[])),
    [data.airplanes],
  );

  const { data: liveFlights = [] } = useQuery({
    queryKey: ["simfly", "myLive", keyTag, icaos, tails, "withUnmatched"],
    queryFn: () => liveFn({ data: { icaos, tails, includeUnmatched: false, ...(username ? { username } : {}) } }),
    enabled: icaos.length > 0,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  // Uproszczony stan filtra — usuwamy martwe kategorie, dodajemy 'rental'
  const [filter, setFilter] = useState<"all" | "visitors" | "rental" | "route" | "license">("all");
  const [page, setPage] = useState(0);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  // Logika podziału danych — rental filtruje wyłącznie loty sub-leasingu maszyn
  const items =
    filter === "all"
      ? data.activity
      : filter === "visitors"
      ? data.activity.filter(isVisitorEntry)
      : filter === "rental"
      ? data.activity.filter(isRentalEntry)
      : data.activity.filter((a) => a.kind === filter);

  const pageCount = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const start = safePage * PAGE_SIZE;
  const visible = items.slice(start, start + PAGE_SIZE);

  return (
    <AppShell>
      <PageHeader
        eyebrow="Live feed"
        title="Activity"
        description="Everything happening across the SimFly network — chronological and filterable."
      />
      
      <div className="mb-6">
        <FlightMap
          hubs={data.airports}
          flights={data.flights}
          airplanes={data.airplanes}
          licenses={data.licenses}
          liveFlights={liveFlights}
        />
      </div>

      {/* Zoptymalizowany pod rynek wynajmu pasek nawigacyjny filtrów */}
      <div className="mb-4 flex flex-wrap gap-1 rounded-lg border border-border bg-background/50 p-1">
        {(["all", "visitors", "rental", "route", "license"] as const).map((k) => (
          <button
            key={k}
            onClick={() => {
              setFilter(k);
              setPage(0);
            }}
            className={`mono rounded px-2.5 py-1 text-[11px] uppercase tracking-widest transition-colors cursor-pointer ${
              filter === k ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {k === "rental" ? "My Rented Aircrafts ✈️" : k === "visitors" ? "visitors" : k}
          </button>
        ))}
      </div>

      <ol className="panel divide-y divide-border rounded-xl">
        {!hydrated && <li className="p-6 text-center text-xs text-muted-foreground">Loading activity…</li>}
        {hydrated && visible.map((a) => {
          
          const isVisitor = isVisitorEntry(a);
            const isRental = isRentalEntry(a);
              const isOwnFlight = isOwnFlightEntry(a);
 
 // Przypisanie ikony i koloru tła z uwzględnieniem operacji własnych
 const Icon = isRental ? Plane : isVisitor ? ArrowUpRight : isOwnFlight ? RouteIcon : (ICONS[a.kind] || RouteIcon);
 const rowColorClass = isRental 
 ? "bg-purple-500/15 text-purple-400 border border-purple-500/20" 
 : isVisitor 
 ? "bg-instrument/15 text-instrument" 
 : isOwnFlight
 ? "bg-tier-silver/15 text-tier-silver" // Elegancki, srebrzysto-biały kolor dla Twojej własnej floty!
 : (COLORS[a.kind] || "bg-secondary text-muted-foreground");


          let message = a.message || "";
          if (isVisitor) message = message.replace(/^\(Visitor\)\s*/, "");

          return (
            <li key={a.id} className="flex items-start gap-4 p-4">
              <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${rowColorClass}`}>
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1 text-left">
                <div className="text-sm text-slate-200">
                  {isOwnFlight ? (
 <span className="mono mr-2 rounded-sm bg-tier-silver/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-tier-silver border border-tier-silver/30 shadow-[0_0_10px_rgba(255,255,255,0.05)]">
 Own Route
 </span>
 ) : isRental ? (
 <span className="mono mr-2 rounded-sm bg-purple-500/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-purple-300 border border-purple-500/30 shadow-[0_0_10px_rgba(168,85,247,0.1)]">
 Rental
 </span>
 ) : isVisitor ? (
 <span className="mono mr-2 rounded-sm bg-instrument/15 px-1 py-px text-[9px] font-semibold uppercase tracking-widest text-instrument">
 Visitor
 </span>
 ) : null}

                  {message}
                </div>
                <div className="mono mt-1 flex flex-wrap items-center gap-x-3 text-[10px] uppercase tracking-widest text-muted-foreground">
                  <Link to="/players/$handle" params={{ handle: a.actorHandle }} className="hover:text-runway">
                    @{a.actorHandle}
                  </Link>
                  {a.hubIcao && <span className="text-runway">{a.hubIcao}</span>}
                  <span>{relativeTime(a.at)}</span>
                </div>
              </div>
              {a.delta !== undefined && (
                <div className={`mono shrink-0 text-xs font-semibold ${isRental ? "text-purple-400" : isVisitor ? "text-instrument" : "text-runway"}`}>
                  +{formatNumber(a.delta)} PAX
                </div>
              )}
            </li>
          );
        })}
        {hydrated && visible.length === 0 && (
          <li className="p-6 text-center text-xs text-muted-foreground">No activity for this filter.</li>
        )}
      </ol>

      {hydrated && items.length > PAGE_SIZE && (
        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="mono text-[11px] uppercase tracking-widest text-muted-foreground">
            {formatNumber(start + 1)}–{formatNumber(Math.min(start + PAGE_SIZE, items.length))} of {formatNumber(items.length)}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={safePage === 0}
              className="mono rounded border border-border px-3 py-1 text-[11px] uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
            >
              Prev
            </button>
            <span className="mono px-2 text-[11px] uppercase tracking-widest text-muted-foreground">
              {safePage + 1} / {pageCount}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              disabled={safePage >= pageCount - 1}
              className="mono rounded border border-border px-3 py-1 text-[11px] uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </AppShell>
  );
}
