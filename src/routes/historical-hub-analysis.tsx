import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { useState } from "react";

import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";
import {
  getHubSupportStatus, getHubTrafficStats, getPilotSupportTimeline,
  type PilotTimelineRow,
} from "@/lib/hub-support.functions";
import { getVisitorHistory } from "@/lib/simfly.functions";
import { useSimflyArgs } from "@/lib/viewed-user";
import { AppShell, PageHeader, formatNumber } from "@/components/app-shell";
import { HubSupportGate } from "@/components/hub-support";
import { Plane, Coffee, ShieldCheck, Heart, Calendar, MapPin, Users, Award } from "lucide-react";


export const Route = createFileRoute("/historical-hub-analysis")({
  component: HistoricalHubAnalysisPage,
  head: () => ({
    meta: [
      { title: "Historical Hub Analysis — SimFly Hub" },
      {
        name: "description",
        content:
          "Weekly hub traffic aggregates and personal supporter career timeline for active pilots.",
      },
    ],
  }),
});

function HistoricalHubAnalysisPage() {
  const statusFn = useServerFn(getHubSupportStatus);
  const { keyTag, payload } = useSimflyArgs();
  const { data: status, isLoading } = useQuery({
    queryKey: ["hub-support", keyTag],
    queryFn: () => statusFn(payload ? { data: payload } : undefined),
    staleTime: 5 * 60_000,
  });

  return (
    <AppShell>
      <PageHeader
        eyebrow="Analytics"
        title="Historical Hub Analysis"
        description="Analytical Data Coverage: Analytics are based on currently indexed pilot histories and improve automatically as the Hub indexes more flights."
      />
      {isLoading ? (
        <div className="panel rounded-xl p-6 text-sm text-muted-foreground">Loading…</div>
      ) : status?.active ? (
        <div className="space-y-6">
          <HubTrafficChart />
          <TopVisitorsChart />
          <PilotTimeline />
        </div>

      ) : (
        <HubSupportGate featureName="Historical Hub Analysis" />
      )}
    </AppShell>
  );
}

function HubTrafficChart() {
  const fn = useServerFn(getHubTrafficStats);
  const { data, isLoading } = useQuery({
    queryKey: ["hub-support", "traffic-stats"],
    queryFn: () => fn(),
    staleTime: 5 * 60_000,
  });
  const rows = data ?? [];

  return (
    <div className="panel rounded-xl p-5">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h3 className="font-display text-lg font-semibold">Hub Traffic by Airport</h3>
          <p className="text-xs text-muted-foreground">
            Qualifying flights and PAX per hub across all weekly supporters.
          </p>
        </div>
        <div className="flex items-center gap-4 text-[11px] font-medium">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-sm bg-[var(--runway)]" /> Flights
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-sm bg-[var(--instrument)]" /> PAX
          </span>
        </div>
      </div>
      <div className="h-80 w-full">
        {isLoading ? (
          <div className="grid h-full place-items-center text-sm text-muted-foreground">Loading traffic…</div>
        ) : rows.length === 0 ? (
          <div className="grid h-full place-items-center text-sm text-muted-foreground">No qualifying arrivals recorded yet.</div>
        ) : (
          <ResponsiveContainer>
            <BarChart data={rows} margin={{ left: -10, right: 6, top: 6, bottom: 0 }}>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis dataKey="icao" stroke="var(--muted-foreground)" fontSize={11} />
              <YAxis yAxisId="left" stroke="var(--muted-foreground)" fontSize={11} tickFormatter={(v) => formatNumber(Number(v))} />
              <YAxis yAxisId="right" orientation="right" stroke="var(--muted-foreground)" fontSize={11} tickFormatter={(v) => formatNumber(Number(v))} />
              <Tooltip
                cursor={{ fill: "rgba(251,191,36,0.08)" }}
                contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                formatter={(v: number, name: string) => [formatNumber(v), name]}
              />
              <Legend wrapperStyle={{ display: "none" }} />
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
  if (n > 0 && n % 52 === 0) return `${n / 52}-Year Legend`;
  return null;
}

function TopVisitorsChart() {
  const fn = useServerFn(getVisitorHistory);
  const { keyTag, payload, username } = useSimflyArgs();
  const { data, isLoading } = useQuery({
    queryKey: ["visitor-history", keyTag],
    queryFn: () => fn(payload ? { data: { ...payload, pages: 10 } } : { data: { pages: 10 } }),
    staleTime: 5 * 60_000,
  });

  const visitors = data?.visitors ?? [];
  const topAll = [...visitors].sort((a, b) => b.paxForMe - a.paxForMe).slice(0, 15);
  const top30 = [...visitors].sort((a, b) => b.paxForMe30d - a.paxForMe30d).slice(0, 15);
  const totalPaxAllTime = visitors.reduce((s, v) => s + v.paxForMe, 0);
  const totalVisits = visitors.reduce((s, v) => s + v.visits, 0);
  const scanned = data?.scannedAirports?.length ?? 0;

  return (
    <div className="panel rounded-xl p-5">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="font-display text-lg font-semibold">Top Visitors — {username ? `@${username}` : "Your"} Airports</h3>
          <p className="text-xs text-muted-foreground">
            Pilots flying through your hubs, ranked by PAX generated for the airport owner. Includes historical sample across {scanned} hub{scanned === 1 ? "" : "s"}.
          </p>
        </div>
        <div className="flex gap-3 text-[11px]">
          <div className="mono rounded bg-runway/10 px-3 py-1.5 text-runway ring-1 ring-runway/30">
            <Users className="mr-1 inline h-3 w-3" />
            {visitors.length} visitors
          </div>
          <div className="mono rounded bg-instrument/10 px-3 py-1.5 text-instrument ring-1 ring-instrument/30">
            {formatNumber(Math.round(totalPaxAllTime))} PAX · {formatNumber(totalVisits)} visits
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="grid h-72 place-items-center text-sm text-muted-foreground">Scanning airport history…</div>
      ) : topAll.length === 0 ? (
        <div className="grid h-72 place-items-center text-sm text-muted-foreground">No visitor flights recorded yet.</div>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <VisitorBarPanel title="All-time" data={topAll} dataKey="paxForMe" visitsKey="visits" />
            <VisitorBarPanel title="Last 30 days" data={top30} dataKey="paxForMe30d" visitsKey="visits" />
          </div>
          
          {/* POPRAWNE I BEZPIECZNE WYWOŁANIE TABELI WE WŁAŚCIWYM MIEJSCU */}
          <FrequentFlyersTable visitors={visitors} />
        </div>
      )}
    </div>
  );
}

type VisitorBarRow = {
  handle: string;
  visits: number;
  paxForMe: number;
  paxForMe30d: number;
};

function VisitorBarPanel({
  title,
  data,
  dataKey,
  visitsKey,
}: {
  title: string;
  data: VisitorBarRow[];
  dataKey: "paxForMe" | "paxForMe30d";
  visitsKey: "visits";
}) {
  return (
    <div>
      <div className="mono mb-2 text-[11px] uppercase tracking-widest text-muted-foreground">{title}</div>
      <div className="h-72 w-full">
        <ResponsiveContainer>
          <BarChart data={data} layout="vertical" margin={{ left: 8, right: 12, top: 4, bottom: 0 }}>
            <CartesianGrid stroke="var(--border)" horizontal={false} />
            <XAxis type="number" stroke="var(--muted-foreground)" fontSize={11} tickFormatter={(v) => formatNumber(Number(v))} />
            <YAxis type="category" dataKey="handle" stroke="var(--muted-foreground)" fontSize={11} width={90} />
            <Tooltip
              cursor={{ fill: "rgba(251,191,36,0.08)" }}
              contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
              formatter={(v: number, name: string) => [formatNumber(Math.round(v)), name]}
              labelFormatter={(l) => `@${l}`}
            />
            <Legend wrapperStyle={{ display: "none" }} />
            <Bar dataKey={dataKey} name="PAX for owner" fill="var(--runway)" radius={[0, 4, 4, 0]} />
            <Bar dataKey={visitsKey} name="Visits" fill="var(--instrument)" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function PilotTimeline() {

  const fn = useServerFn(getPilotSupportTimeline);
  const { keyTag, payload, username } = useSimflyArgs();
  const { data, isLoading } = useQuery({
    queryKey: ["hub-support", "timeline", keyTag],
    queryFn: () => fn(payload ? { data: payload } : undefined),
    staleTime: 5 * 60_000,
  });
  const rows: PilotTimelineRow[] = data ?? [];
  const totalWeeks = rows.length;
  const uniqueIcaos = new Set(rows.map((r) => r.qualifyingIcao).filter(Boolean)).size;

  return (
    <div className="panel rounded-xl p-5">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="font-display text-lg font-semibold">Pilot Career Timeline</h3>
          <p className="text-xs text-muted-foreground">
            {username ? `@${username}` : "Your"} weekly supporter history and loyalty milestones.
          </p>
        </div>
        <div className="flex gap-3 text-[11px]">
          <div className="mono rounded bg-runway/10 px-3 py-1.5 text-runway ring-1 ring-runway/30">
            {totalWeeks} active week{totalWeeks === 1 ? "" : "s"}
          </div>
          <div className="mono rounded bg-instrument/10 px-3 py-1.5 text-instrument ring-1 ring-instrument/30">
            {uniqueIcaos} unique hub{uniqueIcaos === 1 ? "" : "s"}
          </div>
        </div>
      </div>
      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading timeline…</div>
      ) : rows.length === 0 ? (
        <div className="text-sm text-muted-foreground">
          No active weeks recorded yet. Your journey starts with your first qualifying arrival.
        </div>
      ) : (
        <ol className="relative ml-3 space-y-4 border-l border-border/60 pl-6">
          {rows.map((r, idx) => {
            const meta = sourceMeta(r.source);
            const milestone = milestoneAt(totalWeeks - idx);
            return (
              <li key={`${r.weekStartUtc}-${idx}`} className="relative">
                <span className="absolute -left-[31px] top-1 grid h-5 w-5 place-items-center rounded-full bg-background ring-2 ring-runway/50">
                  <span className="h-2 w-2 rounded-full bg-runway" />
                </span>
                <div className="rounded-lg border border-border/60 bg-background/40 p-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div className="font-display text-sm font-semibold">
                      {r.weekLabel}
                      <span className="mono ml-2 text-[11px] font-normal text-muted-foreground">
                        <Calendar className="mr-1 inline h-3 w-3" />
                        {fmtDateUtc(r.weekStartUtc)}
                      </span>
                    </div>
                    <div className={`flex items-center gap-1.5 text-[11px] ${meta.tone}`}>
                      {meta.icon}
                      {meta.label}
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-[12px] text-muted-foreground">
                    {r.qualifyingIcao ? (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3 text-runway" />
                        <span className="mono font-semibold text-foreground">{r.qualifyingIcao}</span>
                      </span>
                    ) : null}
                    {r.qualifyingArrivalAt ? (
                      <span className="mono text-[11px]">Arrived {fmtDateUtc(r.qualifyingArrivalAt)}</span>
                    ) : null}
                  </div>
                  {milestone ? (
                    <div className="mono mt-2 inline-flex items-center gap-1.5 rounded bg-instrument/10 px-2 py-1 text-[10px] uppercase tracking-widest text-instrument ring-1 ring-instrument/30">
                      🏆 {milestone}
                    </div>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

import { useState } from "react";

export function FrequentFlyersTable({ visitors }: { visitors: any[] }) {
  // Stan kontrolujący, czy tabela jest rozwinięta
  const [isExpanded, setIsExpanded] = useState(false);

  // Sortujemy wszystkich pilotów od najbardziej dochodowego
  const sortedFlyers = [...visitors].sort((a, b) => b.paxForMe - a.paxForMe);
  
  // Jeśli tabela jest rozwinięta, pokazujemy wszystkich (max 50), w przeciwnym wypadku tylko top 8
  const visibleFlyers = isExpanded ? sortedFlyers.slice(0, 50) : sortedFlyers.slice(0, 8);

  return (
    <Card className="panel rounded-xl p-5 bg-background/40 border-border/60">
      <div className="mb-4">
        <h3 className="font-display text-lg font-semibold flex items-center gap-2 text-foreground">
          <Award className="h-5 w-5 text-amber-500" /> Frequent Flyers Ranking
        </h3>
        <p className="text-xs text-muted-foreground">
          Top visiting pilots ranked by total operations and cumulative PAX brought to your hubs.
        </p>
      </div>
      <div className="rounded-md border border-border/60 overflow-hidden bg-background/20">
        <Table>
          <TableHeader className="bg-muted/40">
            <TableRow className="border-border/60 hover:bg-transparent">
              <TableHead className="w-[80px] text-center font-bold text-muted-foreground">Rank</TableHead>
              <TableHead className="text-muted-foreground">Pilot Handle</TableHead>
              <TableHead className="text-center text-muted-foreground">Operations</TableHead>
              <TableHead className="text-right text-muted-foreground">Profit Generated</TableHead>
              <TableHead className="text-right text-muted-foreground">Last 30 Days Contribution</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleFlyers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  No visitor flights recorded yet.
                </td>
              </TableRow>
            ) : (
              visibleFlyers.map((pilot, index) => (
                <TableRow key={pilot.handle} className="border-border/60 hover:bg-muted/20 transition-colors">
                  <TableCell className="text-center font-bold text-sm">
                    {index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : `#${index + 1}`}
                  </TableCell>
                  <TableCell className="font-semibold text-foreground">
                    @{pilot.handle}
                  </TableCell>
                  <TableCell className="text-center text-muted-foreground mono text-xs">
                    {pilot.visits} visits
                  </TableCell>
                  <TableCell className="text-right mono text-xs font-semibold text-runway">
                    +{formatNumber(Math.round(pilot.paxForMe))} PAX
                  </TableCell>
                  <TableCell className="text-right mono text-xs text-instrument">
                    +{formatNumber(Math.round(pilot.paxForMe30d))} PAX
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* DYNAMICZNY PRZYCISK POKAZUJĄCY SIĘ TYLKO GDY MAMY WIĘCEJ NIŻ 8 PILOTÓW */}
      {sortedFlyers.length > 8 && (
        <div className="mt-4 flex justify-center">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="rounded-lg border border-border/80 bg-background/50 px-4 py-2 text-xs font-medium text-foreground hover:bg-muted/40 transition-colors shadow-sm cursor-pointer"
          >
            {isExpanded ? "Show Less" : `Show More (${sortedFlyers.length - 8} more)`}
          </button>
        </div>
      )}
    </Card>
  );
}
