import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { checkLicenceRoute, searchAirports } from "@/lib/simfly.functions";
import { useSimflyArgs } from "@/lib/viewed-user";
import type { LicenseExt } from "@/lib/types";
import type { LicenceRouteCheckResult } from "@/lib/simfly.functions";
import { CheckCircle2, XCircle, Loader2, Search } from "lucide-react";

type AirportFieldProps = {
  label: string;
  value: string;
  onChange: (v: string) => void;
};

function AirportField({ label, value, onChange }: AirportFieldProps) {
  const searchFn = useServerFn(searchAirports);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, []);
  const q = value.toUpperCase();
  const sug = useQuery({
    queryKey: ["airport-search", q],
    queryFn: () => searchFn({ data: { query: q, limit: 8 } }),
    enabled: open && q.length >= 1,
    staleTime: 60_000,
  });
  return (
    <div ref={boxRef} className="relative">
      <label className="mono mb-1 block text-[10px] uppercase tracking-widest text-muted-foreground">
        {label}
      </label>
      <div className="flex items-center gap-2 rounded-md border border-border bg-background/60 px-2 py-1.5">
        <Search className="h-3.5 w-3.5 text-muted-foreground" />
        <input
          value={value}
          onChange={(e) => {
            onChange(e.target.value.toUpperCase().slice(0, 4));
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="ICAO"
          maxLength={4}
          className="mono w-full bg-transparent text-sm uppercase tracking-widest outline-none placeholder:text-muted-foreground/60"
          autoComplete="off"
          spellCheck={false}
        />
      </div>
      {open && q.length >= 1 && (sug.data?.length ?? 0) > 0 && (
        <ul className="absolute left-0 right-0 top-full z-20 mt-1 max-h-56 overflow-auto rounded-md border border-border bg-background shadow-lg">
          {sug.data!.map((s) => (
            <li key={s.icao}>
              <button
                type="button"
                onClick={() => {
                  onChange(s.icao);
                  setOpen(false);
                }}
                className="mono flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-secondary"
              >
                <span className="text-runway">{s.icao}</span>
                <span className="truncate text-muted-foreground normal-case tracking-normal">{s.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function RouteChecker({ licenses }: { licenses: LicenseExt[] }) {
  const fn = useServerFn(checkLicenceRoute);
  const { username } = useSimflyArgs();
  const options = useMemo(
    () => licenses.filter((l) => l.code).sort((a, b) => a.name.localeCompare(b.name)),
    [licenses],
  );
  const [licence, setLicence] = useState(options[0]?.code ?? "");
  const [departure, setDeparture] = useState("");
  const [arrival, setArrival] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<LicenceRouteCheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canSubmit =
    licence.length > 0 && /^[A-Z0-9]{4}$/.test(departure) && /^[A-Z0-9]{4}$/.test(arrival) && !busy;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fn({
        data: { licence, departure, arrival, ...(username ? { username } : {}) },
      });
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Check failed.");
    } finally {
      setBusy(false);
    }
  }

  const selectedLicence = options.find((l) => l.code === licence);
  const matched = result && result.matches.length > 0 ? result.matches[0] : null;

  return (
    <section className="panel mb-6 rounded-xl p-5">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="font-display text-lg font-semibold">Route Checker</h2>
        <span className="mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Current SimFly week (Mon 00:00 → Sun 23:59 UTC)
        </span>
      </div>

      <form onSubmit={onSubmit} className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto]">
        <div>
          <label className="mono mb-1 block text-[10px] uppercase tracking-widest text-muted-foreground">
            License
          </label>
          <select
            value={licence}
            onChange={(e) => setLicence(e.target.value)}
            className="mono h-[34px] w-full rounded-md border border-border bg-background/60 px-2 text-sm outline-none"
          >
            {options.length === 0 && <option value="">No licenses</option>}
            {options.map((l) => (
              <option key={l.sku + l.code} value={l.code}>
                {l.code} — {l.name}
              </option>
            ))}
          </select>
        </div>
        <AirportField label="Departure" value={departure} onChange={setDeparture} />
        <AirportField label="Arrival" value={arrival} onChange={setArrival} />
        <div className="flex items-end">
          <button
            type="submit"
            disabled={!canSubmit}
            className="mono inline-flex h-[34px] items-center gap-2 rounded-md bg-primary px-4 text-[11px] uppercase tracking-widest text-primary-foreground disabled:opacity-30"
          >
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Check Route
          </button>
        </div>
      </form>

      {error && (
        <div className="mt-3 text-xs text-destructive">{error}</div>
      )}

      {result && !matched && (
        <div className="mt-4 flex items-start gap-3 rounded-lg border border-runway/30 bg-runway/10 p-3">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-runway" />
          <div className="text-sm">
            <div className="font-display font-semibold text-runway">Route available</div>
            <div className="mt-1 text-muted-foreground">
              No completed flight using <span className="mono text-foreground">{result.licence}</span>{" "}
              was found for <span className="mono text-foreground">{result.departure} → {result.arrival}</span> during the current SimFly week.
              You are still eligible for the first-arrival weekly ×3 bonus on this route.
            </div>
          </div>
        </div>
      )}

      {result && matched && (
        <div className="mt-4 flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-3">
          <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
          <div className="min-w-0 flex-1 text-sm">
            <div className="font-display font-semibold text-destructive">Already used this week</div>
            <dl className="mt-2 grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
              <KV label="License" value={`${result.licence}${selectedLicence ? ` — ${selectedLicence.name}` : ""}`} />
              <KV label="Route" value={`${result.departure} → ${result.arrival}`} />
              <KV label="Completed" value={formatUtc(matched.completedAt)} />
              <KV label="Mission" value={`#${matched.flightId.slice(0, 8)}…`} mono />
              <KV label="Aircraft" value={matched.aircraft ? `${matched.aircraft}${matched.aircraftTail ? ` (${matched.aircraftTail})` : ""}` : "—"} />
              <KV label="Pilot" value={`@${matched.pilot}`} />
            </dl>
            {result.matches.length > 1 && (
              <div className="mono mt-2 text-[10px] uppercase tracking-widest text-muted-foreground">
                +{result.matches.length - 1} more match{result.matches.length - 1 === 1 ? "" : "es"} this week
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function KV({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex gap-2">
      <dt className="mono w-24 shrink-0 text-[10px] uppercase tracking-widest text-muted-foreground">
        {label}
      </dt>
      <dd className={`min-w-0 truncate ${mono ? "mono" : ""}`}>{value}</dd>
    </div>
  );
}

function formatUtc(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}
