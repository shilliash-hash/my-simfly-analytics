import { useMemo, useState } from "react";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getLicenseUtilization, type LicenseUtilRow } from "@/lib/license-utilization.functions";
import { useSimflyArgs } from "@/lib/viewed-user";
import { Gauge } from "lucide-react";

function hours(mins: number) {
  return `${(mins / 60).toFixed(1)} h`;
}

function toneFor(pct: number) {
  if (pct >= 0.9) return { bar: "bg-runway", text: "text-runway" };
  if (pct >= 0.5) return { bar: "bg-instrument", text: "text-instrument" };
  return { bar: "bg-destructive", text: "text-destructive" };
}

export function LicenseUtilization() {
  const fn = useServerFn(getLicenseUtilization);
  const { keyTag, payload } = useSimflyArgs();
  const { data } = useSuspenseQuery(
    queryOptions({
      queryKey: ["license-utilization", keyTag],
      queryFn: () => fn(payload ? { data: payload } : undefined),
    }),
  );

  const active = data.licenses.filter((l) => l.active);
  const [selected, setSelected] = useState<string>("__all__");

  const chart = useMemo(() => {
    const scope = selected === "__all__" ? active : active.filter((l) => l.code === selected);
    return data.weeks.map((w) => {
      const capacity = scope.reduce((s, l) => s + l.weeklyCapacityMinutes, 0);
      const used = scope.reduce((s, l) => s + (l.used[w.weekStartIso] ?? 0), 0);
      return {
        ...w,
        capacity,
        used,
        pct: capacity > 0 ? used / capacity : 0,
      };
    });
  }, [data.weeks, active, selected]);

  return (
    <section className="mb-8">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="mono flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            <Gauge className="h-3.5 w-3.5" /> License utilization
          </div>
          <h2 className="font-display mt-1 text-xl font-semibold">
            Accountable flight time used vs available
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            One week = two 84h cycles. Capacity = 2 × the 84h timer.
          </p>
        </div>
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="mono rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground"
        >
          <option value="__all__">All active licenses</option>
          {active.map((l) => (
            <option key={l.code} value={l.code}>
              {l.code || l.name}
            </option>
          ))}
        </select>
      </div>

      {/* 7-week chart */}
      <div className="panel rounded-2xl p-5">
        {active.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted-foreground">
            No activated licenses to analyze yet.
          </div>
        ) : (
          <div className="flex items-end gap-3 overflow-x-auto">
            {chart.map((w) => {
              const tone = toneFor(w.pct);
              return (
                <div key={w.weekStartIso} className="flex min-w-[52px] flex-1 flex-col items-center gap-2">
                  <div className={`mono text-[11px] font-semibold ${tone.text}`}>
                    {Math.round(w.pct * 100)}%
                  </div>
                  <div className="relative h-40 w-full overflow-hidden rounded-md border border-border/40 bg-secondary/40">
                    <div
                      className={`absolute inset-x-0 bottom-0 ${tone.bar} transition-all`}
                      style={{ height: `${Math.min(100, Math.max(0, w.pct * 100))}%` }}
                    />
                  </div>
                  <div className="mono text-center text-[9px] uppercase tracking-widest text-muted-foreground">
                    W{w.weekNumber}
                    {w.isCurrent ? " ·now" : ""}
                  </div>
                  <div className="mono text-center text-[9px] text-muted-foreground">
                    {hours(w.used)} / {hours(w.capacity)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Table */}
      <div className="panel mt-4 overflow-hidden rounded-2xl">
        <table className="w-full text-sm">
          <thead className="mono bg-secondary/40 text-[10px] uppercase tracking-widest text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-left">License</th>
              <th className="px-4 py-3 text-left">Tier</th>
              <th className="px-4 py-3 text-left">Level</th>
              <th className="px-4 py-3 text-left">Weekly capacity</th>
              <th className="px-4 py-3 text-left">Hours used</th>
              <th className="px-4 py-3 text-left">Utilization</th>
              <th className="px-4 py-3 text-left">Status</th>
            </tr>
          </thead>
          <tbody>
            {active.map((l) => (
              <Row key={l.code || l.name} l={l} />
            ))}
            {active.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-xs text-muted-foreground">
                  No activated licenses to analyze yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Row({ l }: { l: LicenseUtilRow }) {
  const pct = l.lastWeekUtilization;
  const tone = pct === null ? { text: "text-muted-foreground" } : toneFor(pct);
  return (
    <tr className="border-t border-border align-top">
      <td className="px-4 py-3">
        <div className="mono font-semibold text-foreground">{l.code || l.name}</div>
        <div className="text-[11px] text-muted-foreground">{l.name}</div>
      </td>
      <td className="mono px-4 py-3 text-muted-foreground">{l.rankName || `#${l.rank}`}</td>
      <td className="mono px-4 py-3">L{l.level}</td>
      <td className="mono px-4 py-3">{l.active ? hours(l.weeklyCapacityMinutes) : "—"}</td>
      <td className="mono px-4 py-3">{l.active ? hours(l.lastWeekUsedMinutes) : "—"}</td>
      <td className={`mono px-4 py-3 font-semibold ${tone.text}`}>
        {pct === null ? "Inactive" : `${Math.round(pct * 100)}%`}
      </td>
      <td className="px-4 py-3 text-xs text-muted-foreground">{l.recommendation}</td>
    </tr>
  );
}
