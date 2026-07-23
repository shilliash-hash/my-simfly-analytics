import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Plane, IdCard } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AircraftExt, LicenseExt, MyLiveFlight } from "@/lib/types";

export function ReadyStatusBadge({
  airplanes,
  licenses,
  liveFlights,
}: {
  airplanes: AircraftExt[];
  licenses: LicenseExt[];
  liveFlights: MyLiveFlight[];
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const readyAirplanes = useMemo(() => {
    const airborneTails = new Set(
      liveFlights.map((f) => (f.tailNumber ?? "").toUpperCase()).filter(Boolean),
    );
    const airborneTypes = new Set(
      liveFlights.map((f) => f.aircraftICAO?.toUpperCase() ?? "").filter(Boolean),
    );
    return airplanes.filter((p) => {
      if (p.inGroundOperation) return false;
      const tail = (p.tailNumber ?? "").toUpperCase();
      if (tail && airborneTails.has(tail)) return false;
      // Fallback when live feed lacks tail: skip only if aircraft type matches
      // AND owner has just one of that type.
      if (!tail && airborneTypes.has(p.icao.toUpperCase())) {
        const sameType = airplanes.filter((a) => a.icao === p.icao).length;
        if (sameType === 1) return false;
      }
      return true;
    });
  }, [airplanes, liveFlights]);

  const activeLicenses = useMemo(() => {
    return licenses.filter((l) => {
      const t24 = l.timers.find((t) => t.kind === "TIMER24");
      const t84 = l.timers.find((t) => t.kind === "TIMER84");
      return !!t24 && !!t84 && t24.minutesAvailable > 0 && t84.minutesAvailable > 0;
    });
  }, [licenses]);

  const planesCount = readyAirplanes.length;
  const licCount = activeLicenses.length;

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mono inline-flex items-center gap-2 rounded-md border border-border bg-secondary/40 px-2.5 py-1.5 text-[11px] uppercase tracking-widest text-foreground transition hover:bg-secondary"
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Ready fleet & active licences"
      >
        <span
          className={cn(
            "inline-flex items-center gap-1",
            planesCount > 0 ? "text-runway" : "text-muted-foreground/60",
          )}
        >
          <Plane className="h-3.5 w-3.5 -rotate-45" />
          {planesCount}
        </span>
        <span className="h-3 w-px bg-border" />
        <span
          className={cn(
            "inline-flex items-center gap-1",
            licCount > 0 ? "text-instrument" : "text-muted-foreground/60",
          )}
          style={licCount > 0 ? { color: "var(--instrument)" } : undefined}
        >
          <IdCard className="h-3.5 w-3.5" />
          {licCount}
        </span>
      </button>

      {open && (
          <div className="panel absolute right-0 z-30 mt-2 w-80 rounded-xl p-4 shadow-xl bg-background/80 backdrop-blur-lg"><div className="panel absolute right-0 z-30 mt-2 w-80 rounded-xl p-4 shadow-xl">
          <section>
            <div className="mb-2 flex items-center justify-between">
              <div className="mono text-[10px] uppercase tracking-widest text-runway">
                Ready aircraft ({planesCount})
              </div>
              <Link
                to="/aircraft"
                className="mono text-[10px] uppercase tracking-widest text-runway hover:underline"
                onClick={() => setOpen(false)}
              >
                All →
              </Link>
            </div>
            {readyAirplanes.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">
                No aircraft available — all grounded or airborne.
              </p>
            ) : (
              <ul className="max-h-56 space-y-1.5 overflow-auto pr-1">
                {readyAirplanes.map((p) => (
                  <li
                    key={p.aircraftId}
                    className="flex items-center gap-2 rounded border border-border/50 bg-secondary/30 px-2 py-1.5 text-xs"
                  >
                    <Plane className="h-3 w-3 shrink-0 -rotate-45 text-runway" />
                    <span className="font-display font-semibold">{p.tailNumber || p.icao}</span>
                    <span className="mono text-[10px] uppercase tracking-widest text-muted-foreground">
                      {p.icao}
                    </span>
                    <span className="ml-auto mono text-[10px] uppercase tracking-widest text-muted-foreground">
                      {p.currentIcao || "—"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <div className="my-3 h-px bg-border/60" />

          <section>
            <div className="mb-2 flex items-center justify-between">
              <div
                className="mono text-[10px] uppercase tracking-widest"
                style={{ color: "var(--instrument)" }}
              >
                Active licences ({licCount})
              </div>
              <Link
                to="/licenses"
                className="mono text-[10px] uppercase tracking-widest text-runway hover:underline"
                onClick={() => setOpen(false)}
              >
                All →
              </Link>
            </div>
            {activeLicenses.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">
                No licences with both timers active right now.
              </p>
            ) : (
              <ul className="max-h-56 space-y-1.5 overflow-auto pr-1">
                {activeLicenses.map((l) => {
                  const t24 = l.timers.find((t) => t.kind === "TIMER24")!;
                  const t84 = l.timers.find((t) => t.kind === "TIMER84")!;
                  return (
                    <li
                      key={l.sku}
                      className="flex items-center gap-2 rounded border border-border/50 bg-secondary/30 px-2 py-1.5 text-xs"
                    >
                      <IdCard
                        className="h-3 w-3 shrink-0"
                        style={{ color: "var(--instrument)" }}
                      />
                      <span className="font-display font-semibold">{l.code || l.name}</span>
                      <span className="mono ml-auto text-[10px] uppercase tracking-widest text-muted-foreground">
                        24h {t24.minutesAvailable}m · 84h {t84.minutesAvailable}m
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
