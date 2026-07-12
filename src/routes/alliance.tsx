import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import {
  getAllianceIntel,
  type AllianceCamp,
  type AlliancePilot,
  type AllianceAirport,
} from "@/lib/alliance.functions";
import { AppShell, PageHeader, formatNumber } from "@/components/app-shell";
import { useSimflyArgs } from "@/lib/viewed-user";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { cn } from "@/lib/utils";
import { Mountain, Sparkles, Users, Radar, ArrowUpRight } from "lucide-react";

export const Route = createFileRoute("/alliance")({
  component: AllianceIntelligence,
  head: () => ({
    meta: [
      { title: "Alliance Intelligence — SimFly Hub" },
      {
        name: "description",
        content:
          "Premium relationship analytics — see which pilots invest most in your airport ecosystem and where to fly next.",
      },
    ],
  }),
});

// -----------------------------------------------------------------------------
// Camps
// -----------------------------------------------------------------------------

type CampDef = {
  id: AllianceCamp;
  label: string;
  cap: number;
  altitudePct: number; // 0 (base) → 100 (summit)
  glow: string;
};

const CAMPS: CampDef[] = [
  { id: "summit", label: "Summit", cap: 1, altitudePct: 92, glow: "shadow-[0_0_40px_-4px_var(--color-tier-gold)]" },
  { id: "camp3", label: "Camp III", cap: 2, altitudePct: 74, glow: "shadow-[0_0_30px_-6px_var(--color-runway)]" },
  { id: "camp2", label: "Camp II", cap: 3, altitudePct: 55, glow: "shadow-[0_0_24px_-8px_var(--color-runway)]" },
  { id: "camp1", label: "Camp I", cap: 4, altitudePct: 36, glow: "shadow-[0_0_20px_-8px_var(--color-instrument)]" },
  { id: "base", label: "Base Camp", cap: 6, altitudePct: 18, glow: "shadow-[0_0_16px_-8px_var(--color-tier-silver)]" },
  { id: "trek", label: "Trekking", cap: Infinity, altitudePct: 4, glow: "" },
];

function AllianceIntelligence() {
  const fn = useServerFn(getAllianceIntel);
  const { keyTag, username } = useSimflyArgs();
  const { data } = useSuspenseQuery(
    queryOptions({
      queryKey: ["alliance", keyTag],
      queryFn: () =>
        fn(username ? { data: { username } } : undefined),
      staleTime: 5 * 60_000,
    }),
  );

  const grouped = useMemo(() => {
    const map = new Map<AllianceCamp, AlliancePilot[]>();
    for (const c of CAMPS) map.set(c.id, []);
    for (const p of data.pilots) map.get(p.camp)?.push(p);
    return map;
  }, [data.pilots]);

  return (
    <AppShell>
      <PageHeader
        eyebrow="Relationship intelligence"
        title="Alliance Intelligence"
        description="Who invests most in your ecosystem — and where to fly next to strengthen the strongest alliances."
        actions={
          <div className="mono flex items-center gap-2 rounded-lg border border-border/40 bg-secondary/40 px-3 py-1.5 text-[10px] uppercase tracking-widest text-muted-foreground">
            <Radar className="h-3.5 w-3.5 text-runway" />
            {new Date(data.generatedAt).toISOString().slice(11, 16)}Z
          </div>
        }
      />

      {/* KPI strip */}
      <section className="mb-8 grid gap-3 sm:grid-cols-3">
        <KpiTile
          icon={Users}
          label="Allied pilots"
          value={formatNumber(data.totals.pilots)}
          accent="runway"
        />
        <KpiTile
          icon={Sparkles}
          label="Total Alliance Factor"
          value={formatNumber(Math.round(data.totals.totalAllianceFactor))}
          accent="gold"
        />
        <KpiTile
          icon={ArrowUpRight}
          label="Outstanding returns"
          value={String(data.totals.outstandingReturns)}
          accent="instrument"
        />
      </section>

      {/* Mountain */}
      <section className="panel relative overflow-hidden rounded-2xl p-6">
        <div className="pointer-events-none absolute inset-0">
          <MountainSilhouette />
        </div>

        <div className="relative flex items-center justify-between">
          <div>
            <div className="mono text-[10px] uppercase tracking-[0.25em] text-runway">
              Expedition
            </div>
            <div className="font-display text-xl">Alliance Mountain</div>
          </div>
          <div className="mono flex items-center gap-2 text-[11px] uppercase tracking-widest text-muted-foreground">
            <Mountain className="h-4 w-4 text-tier-gold" />
            AF = visits × PAX
          </div>
        </div>

        {/* Mountain layout: absolute-positioned camp rows over the SVG */}
        <div className="relative mt-8 h-[520px] w-full">
          {CAMPS.map((camp) => {
            const pilots = grouped.get(camp.id) ?? [];
            if (camp.id === "trek") return null;
            return (
              <CampRow
                key={camp.id}
                camp={camp}
                pilots={pilots}
              />
            );
          })}
        </div>

        {/* Trekking strip */}
        {(grouped.get("trek") ?? []).length > 0 && (
          <div className="relative mt-6 rounded-xl border border-border/40 bg-background/40 p-4">
            <div className="mono mb-3 text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
              Trekking to Base Camp
            </div>
            <div className="flex flex-wrap gap-2">
              {(grouped.get("trek") ?? []).map((p) => (
                <PilotMarker key={p.username} pilot={p} size="sm" />
              ))}
            </div>
          </div>
        )}
      </section>
    </AppShell>
  );
}

// -----------------------------------------------------------------------------
// Camp row
// -----------------------------------------------------------------------------

function CampRow({ camp, pilots }: { camp: CampDef; pilots: AlliancePilot[] }) {
  const bottomPct = camp.altitudePct;
  return (
    <div
      className="absolute left-0 right-0 flex flex-col items-center gap-2"
      style={{ bottom: `${bottomPct}%` }}
    >
      <div className="flex items-center gap-4">
        {pilots.length === 0 ? (
          <EmptyCamp label={camp.label} />
        ) : (
          pilots.map((p) => <PilotMarker key={p.username} pilot={p} />)
        )}
      </div>
      <div className="mono flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
        <span className="h-px w-6 bg-border/60" />
        {camp.label}
        <span className="h-px w-6 bg-border/60" />
      </div>
    </div>
  );
}

function EmptyCamp({ label }: { label: string }) {
  return (
    <div className="mono flex h-10 items-center rounded-full border border-dashed border-border/40 px-3 text-[10px] uppercase tracking-widest text-muted-foreground/60">
      awaiting {label.toLowerCase()}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Pilot marker + intelligence popup
// -----------------------------------------------------------------------------

function PilotMarker({
  pilot,
  size = "md",
}: {
  pilot: AlliancePilot;
  size?: "sm" | "md";
}) {
  const [imgOk, setImgOk] = useState<boolean>(Boolean(pilot.avatarUrl));
  const dim = size === "sm" ? "h-9 w-9" : "h-12 w-12";
  const ring =
    pilot.returnStatus === "completed"
      ? "ring-runway/70"
      : pilot.allianceFactor > 100
        ? "ring-tier-gold/70"
        : "ring-instrument/60";
  const glow =
    pilot.returnStatus === "completed"
      ? "shadow-[0_0_18px_-4px_var(--color-runway)]"
      : pilot.allianceFactor > 100
        ? "shadow-[0_0_20px_-4px_var(--color-tier-gold)]"
        : "shadow-[0_0_16px_-6px_var(--color-instrument)]";

  return (
    <HoverCard openDelay={80} closeDelay={80}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          className={cn(
            "group relative rounded-full outline-none transition-transform hover:scale-110 focus-visible:scale-110",
            dim,
          )}
          aria-label={`Pilot ${pilot.username}`}
        >
          <span
            className={cn(
              "absolute inset-0 rounded-full ring-2 transition-all",
              ring,
              glow,
            )}
          />
          {imgOk && pilot.avatarUrl ? (
            <img
              src={pilot.avatarUrl}
              alt={pilot.username}
              className="relative h-full w-full rounded-full object-cover"
              onError={() => setImgOk(false)}
            />
          ) : (
            <AvatarBadge username={pilot.username} />
          )}
        </button>
      </HoverCardTrigger>
      <HoverCardContent
        side="top"
        align="center"
        sideOffset={12}
        className="w-[420px] border-border/60 bg-background/85 p-0 backdrop-blur-xl"
      >
        <IntelligencePopup pilot={pilot} />
      </HoverCardContent>
    </HoverCard>
  );
}

function AvatarBadge({ username }: { username: string }) {
  // Aviation-themed placeholder: compass rosette + first letter.
  const initial = (username[0] ?? "?").toUpperCase();
  return (
    <span className="relative grid h-full w-full place-items-center rounded-full bg-gradient-to-br from-secondary via-deck-elevated to-deck">
      <svg
        viewBox="0 0 40 40"
        className="absolute inset-0 h-full w-full opacity-40"
        aria-hidden
      >
        <circle cx="20" cy="20" r="18" fill="none" stroke="currentColor" strokeWidth="0.5" className="text-runway" />
        <path d="M20 4 L22 20 L20 36 L18 20 Z" fill="currentColor" className="text-runway/70" />
        <path d="M4 20 L20 18 L36 20 L20 22 Z" fill="currentColor" className="text-instrument/70" />
      </svg>
      <span className="mono relative text-xs font-semibold text-foreground/90">
        {initial}
      </span>
    </span>
  );
}

// -----------------------------------------------------------------------------
// Intelligence popup
// -----------------------------------------------------------------------------

function IntelligencePopup({ pilot }: { pilot: AlliancePilot }) {
  const [imgOk, setImgOk] = useState<boolean>(Boolean(pilot.avatarUrl));
  const toneCls: Record<string, string> = {
    runway: "bg-runway/10 text-runway ring-runway/30",
    instrument: "bg-instrument/10 text-instrument ring-instrument/30",
    gold: "bg-tier-gold/10 text-tier-gold ring-tier-gold/30",
    muted: "bg-secondary text-muted-foreground ring-border",
  };
  return (
    <div className="overflow-hidden rounded-md">
      {/* Header */}
      <div className="flex items-start gap-3 border-b border-border/40 p-4">
        <div className="relative h-12 w-12 shrink-0">
          <span className="absolute inset-0 rounded-full ring-2 ring-runway/40" />
          {imgOk && pilot.avatarUrl ? (
            <img
              src={pilot.avatarUrl}
              alt={pilot.username}
              className="relative h-full w-full rounded-full object-cover"
              onError={() => setImgOk(false)}
            />
          ) : (
            <AvatarBadge username={pilot.username} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <div className="font-display text-base font-semibold tracking-tight">
              @{pilot.username}
            </div>
            <span className="mono rounded-md bg-tier-gold/10 px-2 py-0.5 text-[10px] uppercase tracking-widest text-tier-gold ring-1 ring-tier-gold/30">
              AF {formatNumber(Math.round(pilot.allianceFactor))}
            </span>
          </div>
          <div className="mono mt-1.5 grid grid-cols-3 gap-2 text-[10px] uppercase tracking-widest text-muted-foreground">
            <Stat label="Visits" value={String(pilot.visits)} />
            <Stat label="PAX for me" value={formatNumber(Math.round(pilot.paxForMe))} />
            <Stat
              label="Last visit"
              value={
                pilot.lastVisitAt
                  ? new Date(pilot.lastVisitAt).toISOString().slice(0, 10)
                  : "—"
              }
            />
          </div>
          <div className="mt-2">
            <span
              className={cn(
                "mono inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 text-[10px] uppercase tracking-widest ring-1",
                pilot.returnStatus === "completed"
                  ? "bg-runway/10 text-runway ring-runway/30"
                  : "bg-instrument/10 text-instrument ring-instrument/30",
              )}
            >
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  pilot.returnStatus === "completed"
                    ? "bg-runway"
                    : "bg-instrument",
                )}
              />
              {pilot.returnStatus === "completed"
                ? "Return completed"
                : "Outstanding return"}
            </span>
          </div>
        </div>
      </div>

      {/* Airport matrix */}
      <div className="max-h-[280px] overflow-y-auto p-4">
        <div className="mono mb-3 text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
          Airport portfolio · {pilot.airports.length}
        </div>
        {pilot.airports.length === 0 ? (
          <div className="mono rounded-md border border-dashed border-border/40 p-3 text-[11px] text-muted-foreground">
            Portfolio unavailable — pilot nonce could not be resolved.
          </div>
        ) : (
          <ul className="grid gap-2">
            {pilot.airports.map((a) => (
              <AirportCard key={a.icao} airport={a} />
            ))}
          </ul>
        )}
      </div>

      {/* Legend */}
      <Legend />

      {/* Recommendation */}
      <div className="border-t border-border/40 p-3">
        <div
          className={cn(
            "flex items-center gap-2 rounded-md px-3 py-2 text-xs ring-1",
            toneCls[pilot.recommendation.tone] ?? toneCls.muted,
          )}
        >
          <span className="text-base leading-none">
            {pilot.recommendation.icon}
          </span>
          <span className="mono uppercase tracking-widest text-[10px]">
            {pilot.recommendation.label}
          </span>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[9px] tracking-[0.2em]">{label}</div>
      <div className="mt-0.5 font-display text-sm text-foreground">{value}</div>
    </div>
  );
}

function Legend() {
  return (
    <div className="border-t border-border/40 bg-secondary/20 px-4 py-3">
      <div className="mono mb-2 text-[9px] uppercase tracking-[0.25em] text-muted-foreground/80">
        Legend
      </div>
      <dl className="mono grid grid-cols-1 gap-x-4 gap-y-1.5 text-[10px] leading-snug text-muted-foreground sm:grid-cols-2">
        <div className="flex gap-1.5">
          <dt className="text-tier-gold">AF</dt>
          <dd>Alliance Factor · visits × PAX</dd>
        </div>
        <div className="flex gap-1.5">
          <dt className="text-foreground">Visits</dt>
          <dd>Flights they made to/from your airports</dd>
        </div>
        <div className="flex gap-1.5">
          <dt className="text-foreground">PAX for me</dt>
          <dd>PAX credited to your airports</dd>
        </div>
        <div className="flex gap-1.5">
          <dt className="text-runway">Return ✓</dt>
          <dd>You've flown to one of their airports</dd>
        </div>
        <div className="flex items-center gap-1.5">
          <dt className="flex items-center gap-1">
            <span
              className="inline-block h-2.5 w-2 bg-instrument/70"
              style={{ clipPath: "polygon(20% 0, 80% 0, 100% 100%, 0 100%)" }}
              aria-hidden
            />
            <span>used</span>
            <span
              className="ml-1 inline-block h-2.5 w-2 bg-runway/70"
              style={{ clipPath: "polygon(20% 0, 80% 0, 100% 100%, 0 100%)" }}
              aria-hidden
            />
            <span>free</span>
          </dt>
          <dd>Weekly apron stands</dd>
        </div>
        <div className="flex gap-1.5 text-muted-foreground/70">
          <dt>Source</dt>
          <dd>SimFly flights on your airports · cached 6h</dd>
        </div>
      </dl>
    </div>
  );
}

function AirportCard({ airport }: { airport: AllianceAirport }) {
  return (
    <li className="rounded-lg border border-border/40 bg-secondary/30 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-display text-sm font-semibold tracking-tight">
            {airport.icao}
          </span>
          <span className="mono rounded bg-runway/10 px-1.5 py-0.5 text-[9px] uppercase tracking-widest text-runway ring-1 ring-runway/30">
            {airport.tier}
          </span>
          <span className="mono rounded bg-secondary px-1.5 py-0.5 text-[9px] uppercase tracking-widest text-muted-foreground ring-1 ring-border">
            L{airport.level}
          </span>
        </div>
        <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground">
          {airport.usedSlots}/{airport.weeklySlots}
          <span className="ml-1 text-runway">({airport.freeSlots})</span>
        </div>
      </div>
      <ApronStands
        used={airport.usedSlots}
        total={airport.weeklySlots}
      />
    </li>
  );
}

// Aviation-native slot viz: apron stands. Each slot is a parking stand glyph.
function ApronStands({ used, total }: { used: number; total: number }) {
  if (total === 0) {
    return (
      <div className="mono mt-2 text-[10px] uppercase tracking-widest text-muted-foreground">
        No weekly capacity
      </div>
    );
  }
  const stands = Array.from({ length: total }, (_, i) => i < used);
  return (
    <div className="mt-2 flex flex-wrap gap-1">
      {stands.map((occupied, i) => (
        <span
          key={i}
          title={occupied ? "Occupied" : "Free"}
          className={cn(
            "block h-3 w-2.5 rounded-[2px] transition-colors",
            occupied
              ? "bg-instrument/70 shadow-[0_0_6px_-1px_var(--color-instrument)]"
              : "bg-runway/70 shadow-[0_0_6px_-1px_var(--color-runway)]",
          )}
          style={{
            clipPath:
              "polygon(20% 0, 80% 0, 100% 100%, 0 100%)",
          }}
          aria-hidden
        />
      ))}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Small pieces
// -----------------------------------------------------------------------------

function KpiTile({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  accent: "runway" | "instrument" | "gold";
}) {
  const cls =
    accent === "runway"
      ? "text-runway"
      : accent === "instrument"
        ? "text-instrument"
        : "text-tier-gold";
  return (
    <div className="panel relative overflow-hidden rounded-xl p-4">
      <div className="flex items-center justify-between">
        <div className="mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          {label}
        </div>
        <Icon className={cn("h-4 w-4", cls)} />
      </div>
      <div className="mt-2 font-display text-2xl font-semibold tracking-tight">
        {value}
      </div>
    </div>
  );
}

function MountainSilhouette() {
  return (
    <svg
      viewBox="0 0 800 520"
      preserveAspectRatio="none"
      className="h-full w-full opacity-60"
      aria-hidden
    >
      <defs>
        <linearGradient id="sky" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="var(--color-runway)" stopOpacity="0.15" />
          <stop offset="60%" stopColor="var(--color-deck)" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="rock" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="var(--color-tier-silver)" stopOpacity="0.35" />
          <stop offset="100%" stopColor="var(--color-deck-elevated)" stopOpacity="0.8" />
        </linearGradient>
        <linearGradient id="snow" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="var(--color-tier-platinum)" stopOpacity="0.55" />
          <stop offset="100%" stopColor="var(--color-tier-silver)" stopOpacity="0.15" />
        </linearGradient>
      </defs>
      <rect width="800" height="520" fill="url(#sky)" />
      {/* Back range */}
      <polygon
        points="0,520 130,320 240,380 360,240 500,340 620,280 800,360 800,520"
        fill="url(#rock)"
        opacity="0.5"
      />
      {/* Main peak */}
      <polygon
        points="0,520 180,360 320,220 440,60 560,220 700,360 800,520"
        fill="url(#rock)"
      />
      {/* Snow cap */}
      <polygon
        points="360,140 440,60 520,140 500,170 440,120 380,170"
        fill="url(#snow)"
      />
    </svg>
  );
}
