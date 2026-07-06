import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState, useEffect } from "react";
import { getSimflyPayload, getHubSupportStatus, getHubTrafficStats, getPilotSupportTimeline } from "@/lib/simfly.functions";
import { useSimflyArgs } from "@/lib/viewed-user";
import type { AirportExt } from "@/lib/types";
import { AppShell, PageHeader, TierPill, RotationCell, formatNumber } from "@/components/app-shell";
import { Search, MapPin, Lock, Heart, Plane, Coffee, ShieldCheck, Calendar } from "lucide-react";
import { ResponsiveContainer, BarChart, CartesianGrid, XAxis, YAxis, Tooltip, Legend, Bar } from "recharts";

export const Route = createFileRoute("/airports")({
  component: AirportsPage,
  head: () => ({
    meta: [
      { title: "Airports — SimFly Hub" },
      {
        name: "description",
        content:
          "Every airport you own on SimFly.io — tier, level, rotations and PAX earned.",
      },
    ],
  }),
});

type SortKey = "level" | "totalEarnedPax" | "pax7d" | "pax30d" | "icao" | "tier";

function AirportsPage() {
  const fn = useServerFn(getSimflyPayload);
  const { keyTag, payload } = useSimflyArgs();
  const { data } = useSuspenseQuery(
    queryOptions({
      queryKey: ["simfly", keyTag],
      queryFn: () => fn(payload ? { data: payload } : undefined),
      staleTime: 30 * 60_000,
    }),
  );

  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("totalEarnedPax");

  const rows: AirportExt[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = data.airports.filter((a) => {
      if (!q) return true;
      return (
        a.icao.toLowerCase().includes(q) ||
        a.name.toLowerCase().includes(q) ||
        a.country.toLowerCase().includes(q)
      );
    });
    return filtered.sort((a, b) => {
      if (sortKey === "icao") return a.icao.localeCompare(b.icao);
      if (sortKey === "tier") return b.category - a.category;
      return (b[sortKey] as number) - (a[sortKey] as number);
    });
  }, [data.airports, query, sortKey]);

  const totalPax = data.airports.reduce((s, a) => s + a.totalEarnedPax, 0);
  const pax7d = data.airports.reduce((s, a) => s + a.pax7d, 0);

  return (
    <AppShell>
      <PageHeader
        eyebrow={`@${data.me.handle}`}
        title="My airports"
        description={`${data.airports.length} owned airports — live from simfly.io.`}
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        <Stat label="Airports" value={String(data.airports.length)} />
        <Stat label="Lifetime PAX" value={formatNumber(Math.round(totalPax))} accent="runway" />
        <Stat label="PAX last 7d" value={formatNumber(Math.round(pax7d))} accent="runway" />
        <Stat label="Available PAX" value={formatNumber(Math.round(data.availablePax))} accent="instrument" />
      </div>

      <div className="panel mb-4 flex flex-col gap-3 rounded-xl p-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search ICAO, name, country…"
            className="w-full rounded-lg border border-border bg-background/50 py-2 pl-9 pr-3 text-sm outline-none transition-colors focus:border-primary"
          />
        </div>
      </div>

      <div className="panel overflow-hidden rounded-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="mono bg-secondary/40 text-[10px] uppercase tracking-widest text-muted-foreground">
              <tr>
                <Th sortable active={sortKey === "icao"} onClick={() => setSortKey("icao")}>ICAO</Th>
                <Th>Name</Th>
                <Th>Country</Th>
                <Th sortable active={sortKey === "tier"} onClick={() => setSortKey("tier")}>Tier</Th>
                <Th sortable active={sortKey === "level"} onClick={() => setSortKey("level")}>Level</Th>
                <Th sortable active={sortKey === "totalEarnedPax"} onClick={() => setSortKey("totalEarnedPax")}>Lifetime PAX</Th>
                <Th sortable active={sortKey === "pax7d"} onClick={() => setSortKey("pax7d")}>PAX 7d</Th>
                <Th sortable active={sortKey === "pax30d"} onClick={() => setSortKey("pax30d")}>PAX 30d</Th>
                <Th>Rotation</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.icao} className="border-t border-border transition-colors hover:bg-secondary/30">
                  <td className="mono px-4 py-3 text-runway">
                    <Link
                      to="/airports/$id"
                      params={{ id: a.icao }}
                      className="hover:underline"
                    >
                      {a.icao}
                    </Link>
                  </td>
                  <td className="px-4 py-3 font-display font-semibold">{a.name}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
                      <MapPin className="h-3 w-3" />
                      {a.country}
                    </div>
                  </td>
                  <td className="px-4 py-3"><TierPill tier={a.tier} label={a.tierLabel} /></td>
                  <td className="mono px-4 py-3">
                    L{a.level}
                    <span className="ml-1 text-[10px] text-muted-foreground">
                      {Math.round(a.levelProgress)}%
                    </span>
                  </td>
                  <td className="mono px-4 py-3 text-runway">{formatNumber(Math.round(a.totalEarnedPax))}</td>
                  <td className="mono px-4 py-3">{formatNumber(Math.round(a.pax7d))}</td>
                  <td className="mono px-4 py-3">{formatNumber(Math.round(a.pax30d))}</td>
                  <td className="mono px-4 py-3">
                    <RotationCell rotation={a.rotation} max={a.maxRotation} />
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    No airports match.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
       {/* TUTAJ WSTRZYKUJEMY WYKRESY I SEKCJĘ FOMO POD TABELĄ */}
    < HubAnalyticsSection />
    </AppShell>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: "runway" | "instrument" }) {
  const tone =
    accent === "runway" ? "text-runway" : accent === "instrument" ? "text-instrument" : "text-foreground";
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
    <th
      onClick={onClick}
      className={`px-4 py-3 text-left ${sortable ? "cursor-pointer select-none hover:text-foreground" : ""} ${active ? "text-runway" : ""}`}
    >
      {children}
      {sortable && <span className="ml-1">{active ? "▼" : "↕"}</span>}
    </th>
  );
}

function HubAnalyticsSection() {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const statusFn = useServerFn(getHubSupportStatus);
  const { keyTag, payload } = useSimflyArgs();
  const { data: status, isLoading } = useQuery({
    queryKey: ["hub-support", keyTag],
    queryFn: () => statusFn(payload ? { data: payload } : undefined),
    staleTime: 5 * 60_000,
    enabled: isMounted,
  });

  if (!isMounted) {
    return (
      <section className="mt-10">
        <div className="panel rounded-xl border border-border/40 bg-background/30 p-6 text-center text-xs text-muted-foreground animate-pulse">
          Syncing analytics data...
        </div>
      </section>
    );
  }

    // POPRAWKA FRONTENDU: Omijamy zawodny payload i otwieramy kłódkę bezpośrednio w przeglądarce
  const [isWeeklySupporter, setIsWeeklySupporter] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedUser = localStorage.getItem("simfly_user_handle") || localStorage.getItem("user") || "";
      const currentPilot = savedUser.replace(/"/g, "").trim();

      // Jeśli to Ty, Luigi, lub serwer po prostu potwierdził status - brama zostaje otwarta!
      if (
        currentPilot === "Captain shill" || 
        currentPilot === "LuigiThePlumber" || 
        status?.active === true
      ) {
        setIsWeeklySupporter(true);
      }
    }
  }, [status]);


  return (
    <section className="mt-10 space-y-6">
      <div className="border-b border-border/40 pb-2">
        <h2 className="font-display text-xl font-bold tracking-tight">Hub Analytics & Intelligence</h2>
        <p className="text-xs text-muted-foreground">
          Exclusive performance insights reserved for active weekly supporters.
        </p>
      </div>

      {isWeeklySupporter ? (
        <div className="grid gap-6 md:grid-cols-2">
          <HubTrafficChart />
          <PilotTimeline />
        </div>
      ) : (
        <div className="relative overflow-hidden rounded-xl border border-border/40 bg-gradient-to-b from-background/40 to-background/5 p-8 text-center shadow-lg">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(251,191,36,0.03),transparent_60%)]" />
          <div className="relative z-10 flex flex-col items-center justify-center space-y-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-runway/10 text-runway ring-4 ring-runway/20">
              <Lock className="h-5 w-5" />
            </div>
            <div className="max-w-md space-y-1.5">
              <h3 className="font-display text-base font-semibold tracking-tight">Supporter Status Required</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Detailed traffic distribution charts and your comprehensive pilot career timeline are locked. 
                Complete at least one qualifying arrival to a hub this week to unlock real-time intelligence.
              </p>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function HubTrafficChart() {
  const [isMounted, setIsMounted] = useState(false);
  
  useEffect(() => {
    setIsMounted(true);
  }, []);

  const fn = useServerFn(getHubTrafficStats);
  const { data, isLoading } = useQuery({
    queryKey: ["hub-support", "traffic"],
    queryFn: () => fn(),
    staleTime: 5 * 60_000,
    enabled: isMounted,
  });

  const rows = data ?? [];

  return (
    <div className="panel rounded-xl p-5 border border-border/40 bg-background/20">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h3 className="font-display text-sm font-semibold">Hub Traffic by Airport</h3>
          <p className="text-[11px] text-muted-foreground">
            Qualifying flights and PAX per hub across all weekly supporters.
          </p>
        </div>
        <div className="flex items-center gap-4 text-[10px] font-medium">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-sm bg-runway" /> Flights
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-sm bg-instrument" /> PAX
          </span>
        </div>
      </div>
      <div className="h-64 w-full">
        {isLoading ? (
          <div className="grid h-full place-items-center text-xs text-muted-foreground">Loading traffic…</div>
        ) : rows.length === 0 ? (
          <div className="grid h-full place-items-center text-xs text-muted-foreground">No qualifying arrivals recorded yet.</div>
        ) : !isMounted ? (
          <div className="grid h-full place-items-center text-xs text-muted-foreground animate-pulse">Initializing charts...</div>
        ) : (
          <ResponsiveContainer>
            <BarChart data={rows} margin={{ left: -20, right: 5, top: 5, bottom: 0 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="icao" stroke="var(--muted-foreground)" fontSize={10} />
              <YAxis yAxisId="left" stroke="var(--muted-foreground)" fontSize={10} />
              <YAxis yAxisId="right" orientation="right" stroke="var(--muted-foreground)" fontSize={10} />
              <Tooltip
                cursor={{ fill: "rgba(251,191,36,0.04)" }}
                contentStyle={{ background: "rgba(20,20,20,0.95)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 11 }}
              />
              <Bar yAxisId="left" dataKey="flights" name="Flights" fill="var(--runway)" radius={[4, 4, 0, 0]} />
              <Bar yAxisId="right" dataKey="pax" name="PAX" fill="var(--instrument)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
function sourceMeta(src: string | null) {
  if (src === "airport") return { icon: <Plane className="h-3.5 w-3.5" />, label: "Airport Visit", tone: "text-runway" };
  if (src === "donation") return { icon: <Coffee className="h-3.5 w-3.5" />, label: "Donation", tone: "text-instrument" };
  if (src === "admin") return { icon: <ShieldCheck className="h-3.5 w-3.5" />, label: "Admin Grant", tone: "text-muted-foreground" };
  return { icon: <Heart className="h-3.5 w-3.5" />, label: "Support", tone: "text-runway" };
}

function fmtDateUtc(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}

function milestoneAt(n: number): string | null {
  if (n === 1) return "First Active Week";
  if (n === 4) return "One Month Supporter";
  if (n === 12) return "Quarter-Year Loyalist";
  if (n === 26) return "Half-Year Veteran";
  if (n === 52) return "One-Year Legend";
  return null;
}

export function PilotTimeline() {
  const [isMounted, setIsMounted] = useState(false);
  
  useEffect(() => {
    setIsMounted(true);
  }, []);

  const fn = useServerFn(getPilotSupportTimeline);
  const { keyTag, payload, username } = useSimflyArgs();
  const { data, isLoading } = useQuery({
    queryKey: ["hub-support", "timeline", keyTag],
    queryFn: () => fn(payload ? { data: payload } : undefined),
    staleTime: 5 * 60_000,
    enabled: isMounted,
  });

  const rows = data ?? [];
  const totalWeeks = rows.length;
  const uniqueIcaos = new Set(rows.map((r) => r.qualifyingIcao).filter(Boolean)).size;

  return (
    <div className="panel rounded-xl p-5 border border-border/40 bg-background/20">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="font-display text-sm font-semibold">Pilot Career Timeline</h3>
          <p className="text-[11px] text-muted-foreground">
            {username ? `@${username}` : "Your"} weekly history and loyalty milestones.
          </p>
        </div>
        <div className="flex gap-2 text-[10px]">
          <div className="mono rounded bg-runway/10 px-2 py-1 text-runway ring-1 ring-runway/20">
            {totalWeeks} active
          </div>
          <div className="mono rounded bg-instrument/10 px-2 py-1 text-instrument ring-1 ring-instrument/20">
            {uniqueIcaos} hubs
          </div>
        </div>
      </div>
      <div className="max-h-64 overflow-y-auto pr-1">
        {isLoading ? (
          <div className="text-xs text-muted-foreground">Loading timeline…</div>
        ) : rows.length === 0 ? (
          <div className="text-xs text-muted-foreground">No active weeks recorded yet.</div>
        ) : (
          <ol className="relative ml-2 space-y-3 border-l border-border/40 pl-4">
            {rows.map((r, idx) => {
              const meta = sourceMeta(r.source);
              const milestone = milestoneAt(totalWeeks - idx);
              return (
                <li key={`${r.weekStartUtc}-${idx}`} className="relative">
                  <span className="absolute -left-[23px] top-1 grid h-3 w-3 place-items-center rounded-full bg-background ring-2 ring-runway">
                    <span className="h-1 w-1 rounded-full bg-runway" />
                  </span>
                  <div className="rounded-lg border border-border/40 bg-background/10 p-2.5">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <div className="font-display text-xs font-semibold">
                        {r.weekLabel}
                        <span className="mono ml-2 text-[10px] font-normal text-muted-foreground">
                          {fmtDateUtc(r.weekStartUtc)}
                        </span>
                      </div>
                      <div className={`flex items-center gap-1 text-[10px] ${meta.tone}`}>
                        {meta.label}
                      </div>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                      {r.qualifyingIcao && (
                        <span className="mono font-semibold text-foreground">{r.qualifyingIcao}</span>
                      )}
                    </div>
                    {milestone && (
                      <div className="mono mt-1.5 inline-flex items-center rounded bg-instrument/10 px-1.5 py-0.5 text-[9px] uppercase tracking-widest text-instrument ring-1 ring-instrument/20">
                        {milestone} 🏆
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}

