import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, useQuery, queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { getSimflyPayload, getMyLiveFlights } from "@/lib/simfly.functions";
import { useSimflyArgs } from "@/lib/viewed-user";
import type { AircraftExt, MyLiveFlight } from "@/lib/types";
import { AppShell, PageHeader, formatNumber } from "@/components/app-shell";
import { Search, Plane } from "lucide-react";

export const Route = createFileRoute("/aircraft")({
  component: AircraftPage,
  head: () => ({
    meta: [
      { title: "Aircraft — SimFly Hub" },
      { name: "description", content: "All your SimFly aircraft with lifetime PAX, level and current location." },
    ],
  }),
});

type SortKey = "totalEarnedPax" | "totalEarnedXp" | "level" | "tail";

function AircraftPage() {
  const fn = useServerFn(getSimflyPayload);
  const { keyTag, payload, username } = useSimflyArgs();
  const { data } = useSuspenseQuery(queryOptions({
    queryKey: ["simfly", keyTag],
    queryFn: () => fn(payload ? { data: payload } : undefined),
  }));

  const liveFn = useServerFn(getMyLiveFlights);
  const icaos = useMemo(
    () => Array.from(new Set(data.airports.map((a) => a.icao).filter(Boolean))),
    [data.airports],
  );
  const { data: liveFlights = [] } = useQuery({
    queryKey: ["simfly", "myLive", keyTag, icaos],
    queryFn: () => liveFn({ data: { icaos, ...(username ? { username } : {}) } }),
    enabled: icaos.length > 0,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  // Map by tailNumber (case-insensitive) and fall back to aircraft type ICAO.
  const liveByTail = useMemo(() => {
    const m = new Map<string, MyLiveFlight>();
    for (const f of liveFlights) {
      if (f.tailNumber) m.set(f.tailNumber.toLowerCase(), f);
    }
    return m;
  }, [liveFlights]);
  const liveByType = useMemo(() => {
    const m = new Map<string, MyLiveFlight>();
    for (const f of liveFlights) {
      if (f.aircraftICAO && !m.has(f.aircraftICAO.toLowerCase())) {
        m.set(f.aircraftICAO.toLowerCase(), f);
      }
    }
    return m;
  }, [liveFlights]);

  function liveFor(p: AircraftExt): MyLiveFlight | undefined {
    if (p.tailNumber && liveByTail.has(p.tailNumber.toLowerCase())) {
      return liveByTail.get(p.tailNumber.toLowerCase());
    }
    if (p.icao && liveByType.has(p.icao.toLowerCase())) {
      return liveByType.get(p.icao.toLowerCase());
    }
    return undefined;
  }

  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("totalEarnedPax");

  const rows: AircraftExt[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = data.airplanes.filter((p) =>
      !q ||
      p.tailNumber.toLowerCase().includes(q) ||
      p.name.toLowerCase().includes(q) ||
      p.icao.toLowerCase().includes(q),
    );
    return filtered.sort((a, b) => {
      if (sortKey === "tail") return (a.tailNumber || a.icao).localeCompare(b.tailNumber || b.icao);
      return (b[sortKey] as number) - (a[sortKey] as number);
    });
  }, [data.airplanes, query, sortKey]);

  const totalPax = data.airplanes.reduce((s, a) => s + a.totalEarnedPax, 0);
  const airborneCount = data.airplanes.filter((p) => !!liveFor(p)).length;

  return (
    <AppShell>
      <PageHeader
        eyebrow={`@${data.me.handle}`}
        title="My aircraft"
        description={`${data.airplanes.length} owned aircraft — lifetime PAX as primary metric.`}
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        <Stat label="Aircraft" value={String(data.airplanes.length)} />
        <Stat label="Lifetime PAX" value={formatNumber(Math.round(totalPax))} accent="runway" />
        <Stat label="Airborne" value={String(airborneCount)} accent="runway" />
        <Stat
          label="Grounded"
          value={String(data.airplanes.filter((p) => p.inGroundOperation).length)}
          accent="instrument"
        />
      </div>

      <div className="panel mb-4 flex flex-col gap-3 rounded-xl p-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tail, type, ICAO…"
            className="w-full rounded-lg border border-border bg-background/50 py-2 pl-9 pr-3 text-sm outline-none transition-colors focus:border-primary"
          />
        </div>
      </div>

      <div className="panel overflow-hidden rounded-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="mono bg-secondary/40 text-[10px] uppercase tracking-widest text-muted-foreground">
              <tr>
                <Th sortable active={sortKey === "tail"} onClick={() => setSortKey("tail")}>Tail</Th>
                <Th>Type</Th>
                <Th>Based</Th>
                <Th sortable active={sortKey === "level"} onClick={() => setSortKey("level")}>Level</Th>
                <Th sortable active={sortKey === "totalEarnedPax"} onClick={() => setSortKey("totalEarnedPax")}>Lifetime PAX</Th>
                <Th sortable active={sortKey === "totalEarnedXp"} onClick={() => setSortKey("totalEarnedXp")}>Lifetime XP</Th>
                <Th>Ground op</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.aircraftId} className="border-t border-border transition-colors hover:bg-secondary/30">
                  <td className="mono px-4 py-3 text-runway">
                    <Link to="/aircraft/$id" params={{ id: p.aircraftId }} className="hover:underline">
                      {p.tailNumber || p.icao}
                    </Link>
                  </td>
                  <td className="px-4 py-3 font-display font-semibold">
                    <div className="flex items-center gap-2">
                      <Plane className="h-3.5 w-3.5 -rotate-45 text-runway" />
                      {p.name}
                    </div>
                  </td>
                  <td className="mono px-4 py-3 text-muted-foreground">
                    {(() => {
                      const live = liveFor(p);
                      if (live) {
                        return (
                          <span className="text-runway">
                            {live.origin} → {live.destination}
                          </span>
                        );
                      }
                      return p.currentIcao || "—";
                    })()}
                  </td>
                  <td className="mono px-4 py-3">
                    L{p.level}
                    <span className="ml-1 text-[10px] text-muted-foreground">
                      {Math.round(p.levelProgress)}%
                    </span>
                  </td>
                  <td className="mono px-4 py-3 text-runway">{formatNumber(Math.round(p.totalEarnedPax))}</td>
                  <td className="mono px-4 py-3">{formatNumber(Math.round(p.totalEarnedXp))}</td>
                  <td className="mono px-4 py-3">
                    <GroundTimer until={p.groundedUntil} grounded={p.inGroundOperation} />
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill grounded={p.inGroundOperation} live={liveFor(p)} />
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-sm text-muted-foreground">No aircraft.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}

function GroundTimer({ until, grounded }: { until: string | null; grounded: boolean }) {
  if (!grounded || !until) {
    return <span className="text-muted-foreground">—</span>;
  }
  const ms = new Date(until).getTime() - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return <span className="text-muted-foreground">—</span>;
  const mins = Math.floor(ms / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return <span className="text-instrument">{h > 0 ? `${h}h ${m}m` : `${m}m`}</span>;
}

function StatusPill({ grounded, live }: { grounded: boolean; live?: MyLiveFlight }) {
  if (live) {
    return (
      <span className="mono inline-flex items-center gap-1 rounded bg-runway/20 px-1.5 py-0.5 text-[10px] uppercase tracking-widest text-runway">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-runway" />
        Airborne
      </span>
    );
  }
  return grounded ? (
    <span className="mono inline-flex rounded bg-instrument/15 px-1.5 py-0.5 text-[10px] uppercase tracking-widest text-instrument">
      Ground op
    </span>
  ) : (
    <span className="mono inline-flex rounded bg-runway/15 px-1.5 py-0.5 text-[10px] uppercase tracking-widest text-runway">
      Ready
    </span>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: "runway" | "instrument" }) {
  const tone = accent === "runway" ? "text-runway" : accent === "instrument" ? "text-instrument" : "text-foreground";
  return (
    <div className="panel rounded-xl p-4">
      <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className={`mt-1 font-display text-2xl font-semibold ${tone}`}>{value}</div>
    </div>
  );
}

function Th({
  children, sortable, active, onClick,
}: { children: React.ReactNode; sortable?: boolean; active?: boolean; onClick?: () => void }) {
  return (
    <th onClick={onClick}
      className={`px-4 py-3 text-left ${sortable ? "cursor-pointer select-none hover:text-foreground" : ""} ${active ? "text-runway" : ""}`}>
      {children}
      {sortable && <span className="ml-1">{active ? "▼" : "↕"}</span>}
    </th>
  );
}
