// Aircraft rental ACTIVITY badge + details popout.
// Pure activity/status surface — never shows income, payout or earnings.
import { useEffect, useRef, useState } from "react";
import { Plane, Clock, MapPin, User, Route } from "lucide-react";
import type { MyLiveFlight } from "@/lib/types";
import type { RentalCompletedFlight } from "@/lib/aircraft-rental.functions";

function fmtDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "—";
  const mins = Math.floor(ms / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function fmtHHMM(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "—";
  const mins = Math.floor(ms / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function fmtStamp(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Re-render once a minute so live durations stay fresh while open. */
function useMinuteTick(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

function Field({
  icon: Icon,
  label,
  value,
  accent = false,
}: {
  icon?: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  label: string;
  value: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <div className="flex items-start gap-2.5">
      {Icon && (
        <Icon
          className="mt-0.5 h-3.5 w-3.5 shrink-0"
          style={{ color: accent ? "var(--rental)" : "var(--muted-foreground)" }}
        />
      )}
      <div className="min-w-0 flex-1">
        <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
        <div
          className="mt-0.5 text-sm font-medium text-foreground"
          style={accent ? { color: "var(--rental)" } : undefined}
        >
          {value}
        </div>
      </div>
    </div>
  );
}

export type RentalState =
  | { kind: "active"; live: MyLiveFlight }
  | { kind: "recent"; flight: RentalCompletedFlight };

export function AircraftRentalBadge({
  state,
  aircraftLabel,
  currentIcao,
}: {
  state: RentalState;
  aircraftLabel: string;
  currentIcao?: string;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const now = useMinuteTick(open);
  const active = state.kind === "active";

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

   return (
    <span ref={wrapRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={
          active
            ? "mono inline-flex items-center gap-1 rounded border border-rental/60 bg-rental/20 px-1.5 py-0.5 text-[10px] uppercase tracking-widest text-rental transition-colors hover:bg-rental/30"
            : "mono inline-flex items-center gap-1 rounded border border-rental/35 bg-rental/10 px-1.5 py-0.5 text-[10px] uppercase tracking-widest text-rental/80 transition-colors hover:bg-rental/20"
        }
      >
        {active && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rental" />}
        {active ? "On rent" : "Recently rented"}
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-1.5 w-[280px] rounded-xl border border-white/10 bg-[#0f141c]/90 p-4 text-foreground shadow-2xl backdrop-blur-md">
          <div className="mb-3 flex items-center justify-between gap-4">
            <div className="mono text-[10px] uppercase tracking-widest shrink-0" style={{ color: "var(--rental)" }}>
              Rental details
            </div>
            <div className="mono truncate text-[10px] uppercase tracking-widest text-muted-foreground text-right flex-1 min-w-0">
              {aircraftLabel}
            </div>
          </div>

          {state.kind === "active" ? (
            <div className="space-y-3">
              <Field icon={User} label="Pilot" value={state.live.pilotUsername || "—"} />
              <Field icon={Plane} label="Status" value="FLYING" accent />
              <Field
                icon={Route}
                label="Departure"
                value={
                  <>
                    {state.live.origin || "—"}
                    {state.live.departureMs
                      ? ` · ${fmtStamp(new Date(state.live.departureMs).toISOString())}`
                      : ""}
                  </>
                }
              />
              <Field icon={MapPin} label="Destination" value={state.live.destination || "—"} />
              {currentIcao && <Field icon={MapPin} label="Current location" value={currentIcao} />}
              <Field
                icon={Clock}
                label="Flight duration"
                value={state.live.departureMs ? fmtDuration(now - state.live.departureMs) : "—"}
                accent
              />
            </div>
          ) : (
            <div className="space-y-3">
              <Field icon={User} label="Pilot" value={state.flight.pilot || "—"} />
              <Field
                icon={Route}
                label="Departure"
                value={`${state.flight.originIcao || "—"} · ${fmtStamp(state.flight.departureIso)}`}
              />
              <Field
                icon={MapPin}
                label="Arrival"
                value={`${state.flight.destinationIcao || "—"} · ${fmtStamp(state.flight.arrivalIso)}`}
              />
              <Field
                icon={Clock}
                label="Flight duration"
                value={state.flight.durationMinutes != null ? fmtDuration(state.flight.durationMinutes * 60_000) : "—"}
              />
              <Field
                icon={MapPin}
                label="Aircraft location"
                value={currentIcao || state.flight.destinationIcao || "—"}
              />
              {state.flight.arrivalIso &&
                (!currentIcao ||
                  currentIcao.toUpperCase() === (state.flight.destinationIcao || "").toUpperCase()) && (
                  <Field
                    icon={Clock}
                    label="Idle at destination"
                    value={fmtHHMM(now - Date.parse(state.flight.arrivalIso))}
                    accent
                  />
                )}
            </div>
          )}
        </div>
      )}
    </span>
  );
}

