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
  const [isSingleMode, setIsSingleMode] = useState(false); // [EDIT 1] Dodany stan dla checkboxa

  // [EDIT 2] Dynamiczna walidacja formularza dla jednego lub dwóch lotnisk
  const isDepartureValid = /^[A-Z0-9]{4}$/.test(departure);
  const isArrivalValid = /^[A-Z0-9]{4}$/.test(arrival);
  const ready = codes.length > 0 && (isSingleMode ? isDepartureValid : (isDepartureValid && isArrivalValid));

  // [EDIT 3] Kopiowanie wartości lotniska, jeśli zaznaczono tryb Single Mode
  const reqDeparture = departure;
  const reqArrival = isSingleMode ? departure : arrival;

  const q = useQuery({
    queryKey: ["route-licence-eval", keyTag, reqDeparture, reqArrival, codes.join(","), isSingleMode],
    queryFn: () =>
      fn({ data: { departure: reqDeparture, arrival: reqArrival, licences: codes, ...(username ? { username } : {}) } }),
    enabled: ready,
    staleTime: 30_000,
  });

  const result = q.data;
  const eligibleCount = result ? result.licences.filter((l) => !l.used).length : 0;
  const usedCount = result ? result.licences.filter((l) => l.used).length : 0;

  return (
    <section className="panel mb-6 rounded-xl p-5">
      <div className="mb-4 flex items-baseline justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-4">
          <h2 className="font-display text-lg font-semibold">Route Checker</h2>
          
          {/* [EDIT 4] Wizualny checkbox w nagłówku */}
          <label className="flex items-center gap-2 cursor-pointer select-none rounded-md bg-secondary/50 px-2 py-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
            <input
              type="checkbox"
              checked={isSingleMode}
              onChange={(e) => {
                setIsSingleMode(e.target.checked);
                if (e.target.checked) setArrival(""); // czyszczenie drugiego pola
              }}
              className="accent-runway h-3.5 w-3.5 rounded border-border"
            />
            <span>Single Airport Mode</span>
          </label>
        </div>
        <span className="mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Current SimFly week (Mon 00:00 → Sun 23:59 UTC)
        </span>
      </div>

      {/* [EDIT 5] Dynamiczne ukrywanie i rozciąganie pól tekstowych */}
      <div className={`grid gap-3 ${isSingleMode ? "grid-cols-1" : "md:grid-cols-2"}`}>
        <AirportField label={isSingleMode ? "Airport ICAO" : "Departure"} value={departure} onChange={setDeparture} />
        {!isSingleMode && (
          <AirportField label="Arrival" value={arrival} onChange={setArrival} />
        )}
      </div>

      {!ready && (
        <div className="mono mt-4 text-[11px] uppercase tracking-widest text-muted-foreground">
          {/* [EDIT 6] Dynamiczny komunikat pomocniczy */}
          {isSingleMode 
            ? `Enter single ICAO code — all ${codes.length} licenses will be evaluated automatically.`
            : `Enter both ICAO codes — all ${codes.length} licenses will be evaluated automatically.`
          }
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
              {/* [EDIT 7] Wyświetlanie wyniku dla jednego lub dwóch lotnisk */}
              {isSingleMode ? `${result.departure}` : `${result.departure} → ${result.arrival}`}
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
                          {l.match.departure ?? "?"} → {l.match.arrival ?? "?"} · {formatUtc(l.match.completedAt)}
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

// Org function
function formatUtc(iso: string) {
  try {
    return new Date(iso).toISOString().replace("T", " ").slice(0, 16) + " UTC";
  } catch {
    return iso;
  }
}
