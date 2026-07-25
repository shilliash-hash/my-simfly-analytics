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
          className="fixed inset-0 z-20 bg-background/40 backdrop-blur-md transition-opacity"
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
          /* WYRÓWNANY WIZUALNIE PANEL - Dokładnie taki sam styl jak ReadyStatusBadge (Strona 2) */
          <div
            className="panel absolute right-0 z-30 mt-2 w-[min(92vw,32rem)] max-h-[min(80vh,42rem)] overflow-hidden rounded-xl p-4 shadow-xl bg-background/80 backdrop-blur-lg border border-border"
            role="dialog"
          >
            <div className="mb-3 flex items-center justify-between">
              <div className="mono text-[10px] uppercase tracking-widest text-runway">
                Your hubs ({count})
              </div>
              <Link
                to="/airports"
                className="mono text-[10px] uppercase tracking-widest text-runway hover:underline"
                onClick={() => setOpen(false)}
              >
                All airports →
              </Link>
            </div>
            
            {count === 0 ? (
              <p className="text-[11px] text-muted-foreground">
                No airports owned yet.
              </p>
            ) : (
              <ul className="max-h-[calc(min(80vh,42rem)-4rem)] space-y-2 overflow-auto pr-1">
                {sorted.map((a) => (
                  <li key={a.icao}>
                    <Link
                      to="/airports/$id"
                      params={{ id: a.icao }}
                      onClick={() => setOpen(false)}
                      className="panel group block rounded-lg p-3 transition-colors hover:bg-secondary/40 border border-border/40 bg-secondary/10"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="mono text-[10px] uppercase tracking-widest text-runway">
                            {a.icao}
                          </div>
                          <div className="font-display mt-0.5 truncate text-sm font-semibold">
                            {a.name}
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            {a.country} · L{a.level}
                          </div>
                        </div>
                        <TierPill tier={a.tier} label={a.tierLabel} />
                      </div>
                      <div className="mt-3 grid grid-cols-3 gap-3 border-t border-border/60 pt-3 text-[11px]">
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
                            <RotationCell rotation={a.rotation} max={a.maxRotation} />
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
      <div className="mono text-[9px] uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
      <div className="font-display mt-0.5 text-sm font-semibold">
        {custom ?? value}
      </div>
    </div>
  );
}
