import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { getSimflyPayload } from "@/lib/simfly.functions";
import { useSimflyArgs } from "@/lib/viewed-user";
import type { AirportExt } from "@/lib/types";
import { AppShell, PageHeader, TierPill, RotationCell, formatNumber } from "@/components/app-shell";
import { Search, MapPin } from "lucide-react";

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
      staleTime: 5 * 60_000,
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
