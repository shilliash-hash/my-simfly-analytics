import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Building2 } from "lucide-react";
import { TierPill, RotationCell, formatNumber } from "@/components/app-shell";
import { cn } from "@/lib/utils";
import type { AirportExt } from "@/lib/types";

export function TopHubsBadge({ airports }: { airports: AirportExt[] }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const sorted = useMemo(
    () => [...airports].sort((a, b) => b.totalEarnedPax - a.totalEarnedPax),
    [airports],
  );

  const count = sorted.length;

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-20 bg-background/20 backdrop-blur-sm transition-opacity"
          aria-hidden
        />
      )}
      <div ref={wrapRef} className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="mono inline-flex items-center gap-2 rounded-md border border-border bg-secondary/40 px-2.5 py-1.5 text-[11px] uppercase tracking-widest text-foreground transition hover:bg-secondary"
          aria-haspopup="dialog"
          aria-expanded={open}
          title="Your hubs"
        >
          <span className={cn(
            "inline-flex items-center gap-1",
            count > 0 ? "text-runway" : "text-muted-foreground/60"
          )}>
            <Building2 className="h-3.5 w-3.5" />
            {count}
          </span>
        </button>

        {open && (
          <div
          className="panel absolute right-0 z-30 mt-2 w-[min(92vw,28rem)] max-h-[min(80vh,42rem)] overflow-hidden rounded-2xl p-4 shadow-2xl bg-slate-950/70 backdrop-blur-xl border border-border/40 shadow-black/50"
          role="dialog"
        >
            {/* NAGŁÓWEK SEKCYJNY - Wzór z Twojego screenu */}
            <div className="mb-3 flex items-center justify-between px-1">
              <div className="mono text-[10px] font-bold uppercase tracking-widest text-runway">
                Your hubs ({count})
              </div>
              <Link
                to="/airports"
                className="mono text-[10px] uppercase tracking-widest text-runway/80 hover:text-runway transition hover:underline"
                onClick={() => setOpen(false)}
              >
                All →
              </Link>
            </div>
            
            {count === 0 ? (
              <p className="text-[11px] text-muted-foreground/70 px-1 py-2">
                No airports owned yet.
              </p>
            ) : (
              <ul className="max-h-[calc(min(80vh,42rem)-4rem)] space-y-1 overflow-auto pr-1 custom-scrollbar">
                {sorted.map((a) => (
                  <li key={a.icao}>
                    {/* 
                      CZYSTE, BEZRAMKOWE WIERSZE NA SZKLE:
                      Usunąłem klasy 'panel', 'bg-secondary/10' oraz twarde obramowania.
                      Wiersz jest czysty, ma tylko delikatny hover rozjaśniający tło.
                    */}
                    <Link
                      to="/airports/$id"
                      params={{ id: a.icao }}
                      onClick={() => setOpen(false)}
                      className="group block rounded-lg px-2.5 py-2.5 transition-all duration-200 hover:bg-white/[0.04]"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="mono text-xs font-bold uppercase tracking-wider text-runway bg-runway/10 px-1.5 py-0.5 rounded-sm border border-runway/20">
                              {a.icao}
                            </span>
                            <span className="font-display truncate text-sm font-medium text-slate-200 group-hover:text-white transition-colors">
                              {a.name}
                            </span>
                          </div>
                          <div className="text-[10px] mono uppercase tracking-widest text-muted-foreground/60 mt-1.5 pl-1">
                            {a.country} · Level {a.level}
                          </div>
                        </div>
                        <div className="scale-90 origin-top-right">
                          <TierPill tier={a.tier} label={a.tierLabel} />
                        </div>
                      </div>

                      {/* SIATKA STATYSTYK - Dopasowana jasnością do nowego, ciemnego tła */}
                      <div className="mt-3 grid grid-cols-3 gap-3 border-t border-border/30 pt-2.5 text-[11px] px-1">
                        <MiniStat
                          label="Lifetime PAX"
                          value={formatNumber(Math.round(a.totalEarnedPax))}
                        />
                        <MiniStat
                          label="PAX 7d"
                          value={formatNumber(Math.round(a.pax7d))}
                        />
                        <MiniStat
                          label="Rotation"
                          custom={
                            <div className="scale-95 origin-left mt-0.5">
                              <RotationCell rotation={a.rotation} max={a.maxRotation} />
                            </div>
                          }
                        />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </>
  );
}

function MiniStat({
  label,
  value,
  custom,
}: {
  label: string;
  value?: string;
  custom?: React.ReactNode;
}) {
  return (
    <div>
      <div className="mono text-[8px] font-medium uppercase tracking-widest text-muted-foreground/50">
        {label}
      </div>
      <div className="font-display mt-0.5 text-xs font-semibold text-slate-300">
        {custom ?? value}
      </div>
    </div>
  );
}
