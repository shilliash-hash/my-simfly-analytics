import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { evaluateRouteForAllLicences, searchAirports } from "@/lib/simfly.functions";
import { useSimflyArgs } from "@/lib/viewed-user";
import type { LicenseExt } from "@/lib/types";
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
  const fn = useServerFn(evaluateRouteForAllLicences);
  const { username, keyTag } = useSimflyArgs();
  const codes = useMemo(
    () => Array.from(new Set(licenses.map((l) => l.code).filter(Boolean))) as string[],
    [licenses],
  );
  const nameByCode = useMemo(() => {
    const m = new Map<string, string>();
    for (const l of licenses) if (l.code) m.set(l.code, l.name);
    return m;
  }, [licenses]);

  const [departure, setDeparture] = useState("");
  const [arrival, setArrival] = useState("");
  const ready = /^[A-Z0-9]{4}$/.test(departure) && /^[A-Z0-9]{4}$/.test(arrival) && codes.length > 0;

  const q = useQuery({
    queryKey: ["route-licence-eval", keyTag, departure, arrival, codes.join(",")],
    queryFn: () =>
      fn({ data: { departure, arrival, licences: codes, ...(username ? { username } : {}) } }),
    enabled: ready,
    staleTime: 30_000,
  });

  const result = q.data;
  const eligibleCount = result ? result.licences.filter((l) => !l.used).length : 0;
  const usedCount = result ? result.licences.filter((l) => l.used).length : 0;

  return (
    <section className="panel mb-6 rounded-xl p-5">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="font-display text-lg font-semibold">Route Checker</h2>
        <span className="mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Current SimFly week (Mon 00:00 → Sun 23:59 UTC)
        </span>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <AirportField label="Departure" value={departure} onChange={setDeparture} />
        <AirportField label="Arrival" value={arrival} onChange={setArrival} />
      </div>

      {!ready && (
        <div className="mono mt-4 text-[11px] uppercase tracking-widest text-muted-foreground">
          Enter both ICAO codes — all {codes.length} licenses will be evaluated automatically.
        </div>
      )}

      {ready && q.isLoading && (
        <div className="mono mt-4 flex items-center gap-2 text-[11px] uppercase tracking-widest text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking {codes.length} licenses…
        </div>
      )}

      {ready && q.error && (
        <div className="mt-4 text-xs text-destructive">
          {q.error instanceof Error ? q.error.message : "Check failed."}
        </div>
      )}

      {ready && result && (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-3 text-xs">
            <span className="mono uppercase tracking-widest text-muted-foreground">
              {result.departure} → {result.arrival}
            </span>
            <span className="inline-flex items-center gap-1 rounded-md border border-runway/30 bg-runway/10 px-2 py-0.5 text-runway">
              <CheckCircle2 className="h-3.5 w-3.5" /> {eligibleCount} eligible
            </span>
            <span className="inline-flex items-center gap-1 rounded-md border border-destructive/40 bg-destructive/10 px-2 py-0.5 text-destructive">
              <XCircle className="h-3.5 w-3.5" /> {usedCount} used
            </span>
          </div>

          <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {result.licences.map((l) => {
              const name = nameByCode.get(l.licence) ?? "";
              if (l.used) {
                return (
                  <li
                    key={l.licence}
                    className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2.5"
                    title={l.match?.completedAt ? `Last used ${formatUtc(l.match.completedAt)}` : ""}
                  >
                    <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                    <div className="min-w-0 flex-1">
                      <div className="mono text-xs font-semibold text-destructive">{l.licence}</div>
                      <div className="truncate text-[11px] text-muted-foreground">{name}</div>
                      {l.match?.completedAt && (
                        <div className="mono mt-0.5 text-[10px] text-muted-foreground">
                          Used {formatUtc(l.match.completedAt)}
                        </div>
                      )}
                    </div>
                  </li>
                );
              }
              return (
                <li
                  key={l.licence}
                  className="flex items-start gap-2 rounded-md border border-runway/30 bg-runway/10 p-2.5"
                >
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-runway" />
                  <div className="min-w-0 flex-1">
                    <div className="mono text-xs font-semibold text-runway">{l.licence}</div>
                    <div className="truncate text-[11px] text-muted-foreground">{name}</div>
                    <div className="mono mt-0.5 text-[10px] text-muted-foreground">×3 bonus available</div>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}

function formatUtc(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}
