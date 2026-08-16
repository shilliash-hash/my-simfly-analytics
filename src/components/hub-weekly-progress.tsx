import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { TicketsPlane } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AirportExt } from "@/lib/types";

/**
 * Presentational only — renders remaining weekly rotation capacity per owned
 * airport as an aviation fuel-gauge strip. No analytics, no fetching.
 */

function tone(ratio: number) {
  if (ratio >= 0.6)
    return { bar: "bg-runway", text: "text-runway", glow: "shadow-[0_0_10px_-2px_var(--runway)]" };

  if (ratio >= 0.3) return { bar: "bg-instrument", text: "text-instrument", glow: "" };
  if (ratio > 0) return { bar: "bg-destructive", text: "text-destructive", glow: "" };
  return { bar: "bg-destructive/40", text: "text-destructive/70", glow: "" };
}

export function HubWeeklyProgress({ airports }: { airports: AirportExt[] }) {
  const rows = useMemo(() => {
    return airports
      .map((a) => {
        const max = Math.max(0, a.maxRotation ?? 0);
        const remaining = Math.max(0, max - (a.rotation ?? 0));
        const ratio = max > 0 ? remaining / max : 0;
        return { a, max, remaining, ratio };
      })
      .sort((x, y) => {
        if (x.max === 0 && y.max !== 0) return 1;
        if (y.max === 0 && x.max !== 0) return -1;
        return x.ratio - y.ratio;
      });
  }, [airports]);

  const totalMax = rows.reduce((s, r) => s + r.max, 0);
  const totalRemaining = rows.reduce((s, r) => s + r.remaining, 0);
  const empty = rows.filter((r) => r.max > 0 && r.remaining === 0).length;
  const overall = totalMax > 0 ? totalRemaining / totalMax : 0;

  return (
    <section className="panel mt-8 flex h-[22rem] flex-col overflow-hidden rounded-xl p-5">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div className="flex items-center gap-2">
          <TicketsPlane className={cn("h-4 w-4", tone(overall).text)} />
          <h2 className="font-display text-xl font-semibold">My HUB Weekly Operation Progress</h2>
        </div>
        <span className="mono shrink-0 text-[10px] uppercase tracking-widest text-muted-foreground">
          {totalMax > 0
            ? `${totalRemaining} / ${totalMax} ops left · ${Math.round(overall * 100)}%${empty ? ` · ${empty} empty` : ""}`
            : "No rotation capacity"}
        </span>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No airports owned yet.</p>
      ) : (
        <ul className="-mr-1 flex-1 space-y-3 overflow-y-auto pr-1">
          {rows.map(({ a, max, remaining, ratio }) => {
            const t = tone(ratio);
            const width = max > 0 ? Math.max(ratio > 0 ? 2 : 0, Math.round(ratio * 100)) : 0;
            return (
              <li key={a.icao}>
                <Link
                  to="/airports/$id"
                  params={{ id: a.icao }}
                  className="block rounded-lg px-1.5 py-1 transition-colors hover:bg-secondary/40"
                >
                  <div className="flex items-baseline justify-between gap-3 text-[11px]">
                    <span className="min-w-0 truncate">
                      <span className="mono font-semibold tracking-widest text-runway">{a.icao}</span>
                      <span className="ml-2 text-muted-foreground">{a.name}</span>
                    </span>
                    <span className="mono shrink-0 tabular-nums text-muted-foreground">
                      {max > 0 ? (
                        <>
                          {remaining} / {max} ops
                          <span className={cn("ml-2 font-semibold", t.text)}>
                            {remaining === 0 ? "EMPTY" : `${Math.round(ratio * 100)}%`}
                          </span>
                        </>
                      ) : (
                        "—"
                      )}
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <span className="mono text-[9px] uppercase text-muted-foreground/60">E</span>
                    <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-foreground/10 ring-1 ring-inset ring-border/50">
                      <div
                        className={cn("h-full rounded-full transition-all duration-500", t.bar, t.glow)}
                        style={{ width: `${width}%` }}
                      />
                      <div className="pointer-events-none absolute inset-0 flex justify-between px-[25%]">
                        <span className="h-full w-px bg-background/40" />
                        <span className="h-full w-px bg-background/40" />
                        <span className="h-full w-px bg-background/40" />
                      </div>
                    </div>
                    <span className="mono text-[9px] uppercase text-muted-foreground/60">F</span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
