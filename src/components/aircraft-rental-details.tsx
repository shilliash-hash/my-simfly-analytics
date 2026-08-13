// Aircraft rental ACTIVITY badge + details popout.
// Pure activity/status surface — never shows income, payout or earnings.
import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="mono mt-0.5 text-sm text-foreground">{value}</div>
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
  const now = useMinuteTick(open);
  const active = state.kind === "active";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          active
            ? "mono inline-flex items-center gap-1 rounded border border-rental/60 bg-rental/20 px-1.5 py-0.5 text-[10px] uppercase tracking-widest text-rental transition-colors hover:bg-rental/30"
            : "mono inline-flex items-center gap-1 rounded border border-rental/35 bg-rental/10 px-1.5 py-0.5 text-[10px] uppercase tracking-widest text-rental/80 transition-colors hover:bg-rental/20"
        }
      >
        {active && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rental" />}
        {active ? "On rent" : "Recently rented"}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="panel max-w-sm rounded-xl">
          <DialogHeader>
            <DialogTitle className="mono text-xs uppercase tracking-widest text-rental">
              Rental details
            </DialogTitle>
          </DialogHeader>
          <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {aircraftLabel}
          </div>

          {state.kind === "active" ? (
            <div className="mt-2 grid gap-3">
              <Field label="Pilot" value={state.live.pilotUsername || "—"} />
              <Field label="Status" value={<span className="text-rental">FLYING</span>} />
              <Field
                label="Departure"
                value={
                  <>
                    {state.live.origin || "—"}
                    {state.live.departureMs ? ` · ${fmtStamp(new Date(state.live.departureMs).toISOString())}` : ""}
                  </>
                }
              />
              <Field label="Destination" value={state.live.destination || "—"} />
              {currentIcao && <Field label="Current location" value={currentIcao} />}
              <Field
                label="Flight duration"
                value={state.live.departureMs ? fmtDuration(now - state.live.departureMs) : "—"}
              />
            </div>
          ) : (
            <div className="mt-2 grid gap-3">
              <Field label="Pilot" value={state.flight.pilot || "—"} />
              <Field
                label="Departure"
                value={`${state.flight.originIcao || "—"} · ${fmtStamp(state.flight.departureIso)}`}
              />
              <Field
                label="Arrival"
                value={`${state.flight.destinationIcao || "—"} · ${fmtStamp(state.flight.arrivalIso)}`}
              />
              <Field
                label="Flight duration"
                value={
                  state.flight.durationMinutes != null
                    ? fmtDuration(state.flight.durationMinutes * 60_000)
                    : "—"
                }
              />
              <Field label="Aircraft location" value={currentIcao || state.flight.destinationIcao || "—"} />
              {state.flight.arrivalIso &&
                (!currentIcao ||
                  currentIcao.toUpperCase() === (state.flight.destinationIcao || "").toUpperCase()) && (
                  <Field
                    label="Idle at destination"
                    value={fmtHHMM(now - Date.parse(state.flight.arrivalIso))}
                  />
                )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

