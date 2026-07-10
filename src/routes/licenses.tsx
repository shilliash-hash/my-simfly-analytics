import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getSimflyPayload } from "@/lib/simfly.functions";
import { useSimflyArgs } from "@/lib/viewed-user";
import { AppShell, PageHeader, formatNumber } from "@/components/app-shell";
import type { LicenseTimer } from "@/lib/types";
import { ShieldCheck, Timer, Plane } from "lucide-react";
import { RouteChecker } from "@/components/route-checker";

function LevelBadge({ level }: { level: number }) {
  return (
    <div className="relative grid h-12 w-12 shrink-0 place-items-center rounded-md border border-runway/30 bg-gradient-to-br from-runway/15 to-instrument/10 text-runway shadow-[0_0_0_1px_rgba(34,211,238,0.08)_inset]">
      <ShieldCheck className="h-6 w-6" strokeWidth={1.5} />
      <span className="mono absolute -bottom-1 -right-1 grid h-5 min-w-5 
place-items-center rounded-full border border-border bg-background px-1 
text-[10px] font-bold text-instrument">
        {level}
      </span>
    </div>
  );
}

export const Route = createFileRoute("/licenses")({
  component: LicensesPage,
  head: () => ({
    meta: [
      { title: "Licenses — SimFly Hub" },
      { name: "description", content: "Your pilot licenses with rank, level and lifetime PAX earned." },
    ],
  }),
});

function LicensesPage() {
  const fn = useServerFn(getSimflyPayload);
  const { keyTag, payload } = useSimflyArgs();
  const { data } = useSuspenseQuery(queryOptions({
    queryKey: ["simfly", keyTag],
    queryFn: () => fn(payload ? { data: payload } : undefined),
  }));

  const rows = [...data.licenses].sort((a, b) => b.totalEarnedPax - a.totalEarnedPax);
  const totalPax = rows.reduce((s, l) => s + l.totalEarnedPax, 0);

  return (
    <AppShell>
      <PageHeader
        eyebrow={`@${data.me?.handle || ""}`}
        title="My licenses"
        description={`${rows.length} pilot licenses — countdown-first cockpit view.`}
      />
      
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Stat label="Licenses" value={String(rows.length)} />
        <Stat label="Lifetime PAX" value={formatNumber(Math.round(totalPax))} accent="runway" />
        <Stat
          label="Top rank"
          value={rows[0]?.rankName || "—"}
          accent="instrument"
        />
      </div>

      {/* ZACHOWUJEMY TWÓJ W 100% SPRAWNY ROUTE CHECKER */}
      <RouteChecker licenses={rows} />

      {/* NOWA SIATKA PREMIUM: Z zachowaniem starej struktury danych wejściowych */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
         {rows.map((l) => {
          const t24 = l.timers?.find((t) => t.kind === "TIMER24");
          const t84 = l.timers?.find((t) => t.kind === "TIMER84");
          // PRZYWRACAMY MAPOWANIE OSTATNIEGO LOTU:
          const lastFlight = data.flights?.find((f) => f.licenceCode === l.code);
          return (
            <Link
              key={l.sku + l.code}
              to="/licenses/$slug"
              params={{ slug: l.code || l.slug }}
              className="panel group relative block overflow-hidden rounded-2xl border border-border/40 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] transition-all hover:border-runway/30 hover:shadow-[0_8px_32px_-16px_rgba(34,211,238,0.35)]"
            >
              {/* Znak wodny w tle */}
              <ShieldCheck className="pointer-events-none absolute -right-6 -bottom-6 h-44 w-44 text-runway/[0.04]" strokeWidth={1} />

              {/* Nagłówek licencji */}
              <div className="relative flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">License №</div>
                  <div className="font-display mono mt-0.5 text-lg font-semibold tracking-wide text-foreground">{l.code || l.sku}</div>
                </div>
                <div className="text-right">
                  <div className="mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Rank</div>
                  <div className="mono mt-0.5 text-sm font-semibold text-instrument">#{l.rank}</div>
                </div>
              </div>

              {/* Dominująca strefa timerów w nowym, dwukolumnowym układzie */}
              <div className="relative mt-5 grid grid-cols-2 gap-3 rounded-xl border border-border/40 bg-background/40 p-3">
                <TimerBlock label="24H" timer={t24} />
                <TimerBlock label="84H" timer={t84} />
              </div>

              {/* Pasek postępu poziomu L10 */}
              <div className="relative mt-5">
                <div className="mb-1.5 flex items-baseline justify-between">
                  <span className="mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Progress · L{l.level}</span>
                  <span className="mono text-[10px] text-runway">{Math.round(l.levelProgress)}%</span>
                </div>
                <div className="h-1 w-full overflow-hidden rounded-full bg-secondary/60">
                  <div 
                    className="h-full rounded-full bg-gradient-to-r from-runway/70 to-runway shadow-[0_0_8px_rgba(34,211,238,0.6)] transition-all" 
                    style={{ width: `${Math.min(100, Math.max(0, l.levelProgress))}%` }} 
                  />
                </div>
              </div>

              {/* Detale licencji na dole */}
              <div className="relative mt-5 border-t border-border/40 pt-4">
                <div className="font-display truncate text-sm font-semibold text-foreground">{l.name}</div>
                <div className="mono mt-0.5 text-[11px] uppercase tracking-widest text-muted-foreground">{l.rankName}</div>
              </div>

              <div className="relative mt-3 grid grid-cols-3 gap-3 text-xs">
                <MiniKV label="Lifetime PAX" value={formatNumber(Math.round(l.totalEarnedPax))} tone="runway" />
                <MiniKV label="7d PAX" value={formatNumber(Math.round(l.pax7d || 0))} />
                <MiniKV label="30d PAX" value={formatNumber(Math.round(l.pax30d || 0))} />
              </div>
                       {/* PRZYWRACAMY SEKCJĘ LAST FLIGHT OPERACYJNĄ POD PLANE RENTAL */}
              {lastFlight ? (
                <div className="relative mt-4 flex items-center gap-3 rounded-lg border border-border/40 bg-background/30 px-3 py-2.5">
                  <Plane className="h-4 w-4 shrink-0 text-instrument" strokeWidth={1.5} />
                  <div className="min-w-0 flex-1">
                    <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground">
                      Last flight
                    </div>
                    <div className="mono mt-0.5 flex items-center gap-1.5 truncate text-xs text-foreground">
                      <span className="text-runway">{lastFlight.departure}</span>
                      <span className="text-muted-foreground">→</span>
                      <span className="text-runway">{lastFlight.destination}</span>
                      <span className="text-muted-foreground">·</span>
                      <span className="truncate">{lastFlight.aircraftName || lastFlight.aircraft}</span>
                      <span className="text-muted-foreground">·</span>
                      <span>{Math.round(lastFlight.distance)} nm</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="relative mt-4 rounded-lg border border-dashed border-border/40 px-3 py-2.5">
                  <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    No recent flights on this license
                  </div>
                </div>
              )}
            )
            </Link>
          );
        })}
        {rows.length === 0 && (
          <div className="panel rounded-xl p-5 text-sm text-muted-foreground">No licenses yet.</div>
        )}
      </div>
    </AppShell>
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

function MiniKV({ label, value, tone }: { label: string; value: string; tone?: "runway" }) {
  const t = tone === "runway" ? "text-runway" : "text-foreground";
  return (
    <div>
      <div className="mono text-[9px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className={`font-display mono mt-0.5 text-sm font-semibold ${t}`}>{value}</div>
    </div>
  );
}

function formatHM(mins: number) {
  if (!Number.isFinite(mins) || mins <= 0) return "00h 00m";
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return `${String(h).padStart(2, "0")}h ${String(m).padStart(2, "0")}m`;
}

function TimerBlock({ label, timer }: { label: string; timer?: LicenseTimer }) {
  if (!timer) {
    return (
      <div className="rounded-lg px-2 py-2">
        <div className="mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">{label} · N/A</div>
        <div className="font-display mono mt-1 text-2xl font-black text-muted-foreground/50">--h --m</div>
      </div>
    );
  }
  const ready = timer.minutesAvailable >= timer.minutesCap && timer.minutesCap > 0;
  const empty = timer.minutesAvailable <= 0;
  const pct = timer.minutesCap > 0 ? (timer.minutesAvailable / timer.minutesCap) * 100 : 0;
  
  return (
    <div className="relative rounded-lg px-2 py-2">
      <div className="flex items-baseline justify-between">
        <span className="mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">{label} Available</span>
        {ready && <span className="mono rounded-sm border border-runway/40 bg-runway/10 px-1 py-px text-[8px] uppercase tracking-widest text-runway">Ready</span>}
      </div>
      <div className={`font-display mono mt-1 text-2xl font-black leading-none tracking-tight ${empty ? "text-muted-foreground" : "text-cyan-400"}`} style={ready ? { textShadow: "0 0 12px rgba(34,211,238,0.5)" } : undefined}>
        {formatHM(timer.minutesAvailable)}
      </div>
      <div className="mt-1.5 flex items-center gap-1 text-[10px] text-muted-foreground">
        <Timer className="h-3 w-3" strokeWidth={1.5} />
        {empty ? (
          <span className="mono">next in {formatHM(timer.minsUntilNextRestore)}</span>
        ) : ready ? (
          <span className="mono">cap {formatHM(timer.minutesCap)}</span>
        ) : (
          <span className="mono">+{formatHM(timer.minsUntilNextRestore)} to reinstate</span>
        )}
      </div>
      <div className="mt-1.5 h-0.5 w-full overflow-hidden rounded-full bg-secondary/60">
        <div className="h-full rounded-full bg-cyan-400/80" style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
      </div>
    </div>
  );
}

