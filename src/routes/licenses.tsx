import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getSimflyPayload } from "@/lib/simfly.functions";
import { useSimflyArgs } from "@/lib/viewed-user";
import { AppShell, PageHeader, formatNumber } from "@/components/app-shell";
import type { LicenseTimer } from "@/lib/types";
import { ShieldCheck } from "lucide-react";
import { RouteChecker } from "@/components/route-checker";

function LevelBadge({ level }: { level: number }) {
  return (
    <div className="relative grid h-12 w-12 shrink-0 place-items-center rounded-md border border-runway/30 bg-gradient-to-br from-runway/15 to-instrument/10 text-runway shadow-[0_0_0_1px_rgba(34,211,238,0.08)_inset]">
      <ShieldCheck className="h-6 w-6" strokeWidth={1.5} />
      <span className="mono absolute -bottom-1 -right-1 grid h-5 min-w-5 place-items-center rounded-full border border-border bg-background px-1 text-[10px] font-bold text-instrument">
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
        eyebrow={`@${data.me.handle}`}
        title="My licenses"
        description={`${rows.length} pilot licenses — lifetime PAX as primary metric, rank as secondary.`}
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

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {rows.map((l) => (
          <Link
            key={l.sku + l.code}
            to="/licenses/$slug"
            params={{ slug: l.code || l.slug }}
            className="panel group block rounded-xl p-5 transition-colors hover:bg-secondary/40"
          >
            <div className="flex items-start gap-3">
              <LevelBadge level={l.level} />
              <div className="min-w-0 flex-1">
                <div className="font-display truncate text-base font-semibold">{l.name}</div>
                <div className="mono text-[11px] uppercase tracking-widest text-muted-foreground">
                  {l.code || l.sku}
                </div>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-3 border-t border-border pt-4 text-xs">
              <KV label="Lifetime PAX" value={formatNumber(Math.round(l.totalEarnedPax))} tone="runway" />
              <KV label="Rank" value={`#${l.rank}`} sub={l.rankName} />
              <KV label="Level" value={`L${l.level}`} sub={`${Math.round(l.levelProgress)}%`} />
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3 border-t border-border pt-3 text-xs">
              <TimerKV label="24h timer" timer={l.timers.find((t) => t.kind === "TIMER24")} />
              <TimerKV label="84h timer" timer={l.timers.find((t) => t.kind === "TIMER84")} />
            </div>
          </Link>
        ))}
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

function KV({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "runway" }) {
  const t = tone === "runway" ? "text-runway" : "text-foreground";
  return (
    <div>
      <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className={`font-display mono mt-0.5 text-base font-semibold ${t}`}>{value}</div>
      {sub && <div className="mono text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

function formatHM(mins: number) {
  if (!Number.isFinite(mins) || mins <= 0) return "0m";
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function TimerKV({ label, timer }: { label: string; timer?: LicenseTimer }) {
  if (!timer) {
    return (
      <div>
        <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
        <div className="font-display mono mt-0.5 text-base font-semibold text-muted-foreground">—</div>
      </div>
    );
  }
  const ready = timer.minutesAvailable >= timer.minutesCap && timer.minutesCap > 0;
  const empty = timer.minutesAvailable <= 0;
  const tone = ready ? "text-runway" : empty ? "text-instrument" : "text-foreground";
  const sub = empty
    ? `refills in ${formatHM(timer.minsUntilNextRestore)}`
    : `cap ${formatHM(timer.minutesCap)}`;
  return (
    <div onClick={(e) => e.preventDefault()}>
      <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className={`font-display mono mt-0.5 text-base font-semibold ${tone}`}>
        {formatHM(timer.minutesAvailable)}
      </div>
      <div className="mono text-[10px] text-muted-foreground">{sub}</div>
    </div>
  );
}
