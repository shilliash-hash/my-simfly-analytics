import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, useQuery, queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  getSimflyPayload,
  getAirportSummary,
  searchAirports,
} from "@/lib/simfly.functions";
import { useSimflyArgs } from "@/lib/viewed-user";
import type { AirportExt } from "@/lib/types";
import { AppShell, PageHeader, TierPill, RotationCell, formatNumber } from "@/components/app-shell";
import { X, Plus, Search, AlertCircle, Loader2 } from "lucide-react";

export const Route = createFileRoute("/compare")({
  component: Compare,
  head: () => ({
    meta: [
      { title: "Compare — SimFly Hub" },
      { name: "description", content: "Side-by-side comparison of up to 4 SimFly airports — owned or any ICAO." },
    ],
  }),
});

function Compare() {
  const fn = useServerFn(getSimflyPayload);
  const lookupFn = useServerFn(getAirportSummary);
  const searchFn = useServerFn(searchAirports);
  const { keyTag, payload } = useSimflyArgs();
  const { data } = useSuspenseQuery(queryOptions({
    queryKey: ["simfly", keyTag],
    queryFn: () => fn(payload ? { data: payload } : undefined),
  }));

  // Selected ICAOs (owned or external). Default to top-3 owned.
  const [selected, setSelected] = useState<string[]>(
    [...data.airports]
      .sort((a, b) => b.totalEarnedPax - a.totalEarnedPax)
      .slice(0, 3)
      .map((a) => a.icao),
  );

  // Cache of looked-up external airports keyed by ICAO.
  const [external, setExternal] = useState<Record<string, AirportExt>>({});

  // ----- ICAO search box -----
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [lookupBusy, setLookupBusy] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, []);

  const normalized = query.toUpperCase();
  const suggestQ = useQuery({
    queryKey: ["airport-search", normalized],
    queryFn: () => searchFn({ data: { query: normalized, limit: 8 } }),
    enabled: open && normalized.length >= 1,
    staleTime: 60_000,
  });

  async function pickAirport(icao: string) {
    const code = icao.toUpperCase();
    setLookupError(null);
    if (!/^[A-Z0-9]{4}$/.test(code)) {
      setLookupError("Airport not found. Please enter a valid ICAO code.");
      return;
    }
    if (selected.includes(code)) {
      setOpen(false);
      setQuery("");
      return;
    }
    if (selected.length >= 4) {
      setLookupError("Already comparing 4 airports — remove one first.");
      return;
    }
    // Owned? no need to fetch.
    if (data.airports.some((a) => a.icao === code) || external[code]) {
      setSelected((s) => [...s, code]);
      setOpen(false);
      setQuery("");
      return;
    }
    setLookupBusy(true);
    try {
      const result = await lookupFn({ data: { icao: code } });
      if (!result) {
        setLookupError("Airport not found. Please enter a valid ICAO code.");
        return;
      }
      setExternal((m) => ({ ...m, [code]: result }));
      setSelected((s) => [...s, code]);
      setOpen(false);
      setQuery("");
    } catch (err) {
      setLookupError(err instanceof Error ? err.message : "Lookup failed.");
    } finally {
      setLookupBusy(false);
    }
  }

  const ownedByIcao = useMemo(
    () => new Map(data.airports.map((a) => [a.icao, a])),
    [data.airports],
  );

  const airports = selected
    .map((id) => ownedByIcao.get(id) ?? external[id])
    .filter((a): a is AirportExt => !!a);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (normalized.length === 4) pickAirport(normalized);
  }

  return (
    <AppShell>
      <PageHeader
        eyebrow="Side-by-side"
        title="Compare hubs"
        description="Pick up to 4 airports — your own or any ICAO in SimFly — and benchmark them across tier, level and PAX flow."
      />

      {/* Search */}
      <div ref={boxRef} className="panel relative mb-4 rounded-xl p-3">
        <form onSubmit={onSubmit} className="flex items-center gap-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value.toUpperCase().slice(0, 4));
              setLookupError(null);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            placeholder="Type ICAO (e.g. EGLL, KJFK, ENVA)…"
            maxLength={4}
            className="mono w-full bg-transparent text-sm uppercase tracking-widest outline-none placeholder:text-muted-foreground/60"
            autoComplete="off"
            spellCheck={false}
          />
          {lookupBusy && <Loader2 className="h-4 w-4 animate-spin text-runway" />}
          <button
            type="submit"
            disabled={normalized.length !== 4 || lookupBusy}
            className="mono rounded bg-primary px-3 py-1 text-[11px] uppercase tracking-widest text-primary-foreground disabled:opacity-30"
          >
            Add
          </button>
        </form>
        {open && normalized.length >= 1 && (suggestQ.data?.length ?? 0) > 0 && (
          <ul className="absolute left-0 right-0 top-full z-10 mt-1 max-h-64 overflow-auto rounded-md border border-border bg-background shadow-lg">
            {suggestQ.data!.map((s) => (
              <li key={s.icao}>
                <button
                  type="button"
                  onClick={() => pickAirport(s.icao)}
                  className="mono flex w-full items-center gap-3 px-3 py-2 text-left text-xs hover:bg-secondary"
                >
                  <span className="text-runway">{s.icao}</span>
                  <span className="truncate text-muted-foreground normal-case tracking-normal">{s.name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {lookupError && (
          <div className="mt-2 flex items-center gap-2 text-xs text-destructive">
            <AlertCircle className="h-3.5 w-3.5" />
            {lookupError}
          </div>
        )}
      </div>

      {/* Owned shortcuts */}
      <div className="panel mb-6 flex flex-wrap items-center gap-2 rounded-xl p-3">
        <span className="mono mr-2 text-[11px] uppercase tracking-widest text-muted-foreground">Yours:</span>
        {data.airports.map((h) => {
          const on = selected.includes(h.icao);
          const disabled = !on && selected.length >= 4;
          return (
            <button
              key={h.icao}
              disabled={disabled}
              onClick={() =>
                setSelected((s) => (on ? s.filter((x) => x !== h.icao) : [...s, h.icao]))
              }
              className={`mono rounded px-2 py-1 text-[11px] uppercase tracking-widest transition-colors ${
                on
                  ? "bg-primary text-primary-foreground"
                  : disabled
                    ? "cursor-not-allowed bg-secondary/40 text-muted-foreground/40"
                    : "bg-secondary text-muted-foreground hover:text-foreground"
              }`}
            >
              {on ? <X className="mr-1 inline h-3 w-3" /> : <Plus className="mr-1 inline h-3 w-3" />}
              {h.icao}
            </button>
          );
        })}
      </div>

      {airports.length === 0 ? (
        <p className="text-sm text-muted-foreground">Pick at least one airport to compare.</p>
      ) : (
        <div className="panel overflow-x-auto rounded-xl">
          <table className="w-full text-sm">
            <thead className="mono bg-secondary/40 text-[10px] uppercase tracking-widest text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left">Metric</th>
                {airports.map((a) => {
                  const owned = ownedByIcao.has(a.icao);
                  return (
                    <th key={a.icao} className="px-4 py-3 text-left">
                      <div className="flex items-center gap-2">
                        <span className="text-runway">{a.icao}</span>
                        {!owned && (
                          <span className="mono rounded bg-secondary px-1 py-0.5 text-[9px] uppercase tracking-widest text-muted-foreground">
                            external
                          </span>
                        )}
                        <button
                          onClick={() => setSelected((s) => s.filter((x) => x !== a.icao))}
                          className="ml-auto text-muted-foreground hover:text-destructive"
                          title="Remove"
                          aria-label={`Remove ${a.icao}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                      <div className="font-display mt-0.5 text-sm font-semibold normal-case tracking-normal text-foreground">{a.name}</div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              <Row label="Tier" hubs={airports} render={(a) => <TierPill tier={a.tier} label={a.tierLabel} />} />
              <Row label="Level" hubs={airports} mono best={(a) => a.level}
                render={(a) => (
                  <span>
                    L{a.level}{" "}
                    <span className="text-[10px] text-muted-foreground">
                      {Math.round(a.levelProgress)}% to next
                    </span>
                  </span>
                )} />
              <Row label="Lifetime PAX" hubs={airports} mono best={(a) => a.totalEarnedPax}
                render={(a) => formatNumber(Math.round(a.totalEarnedPax))} />
              <Row label="PAX / week (avg 30d)" hubs={airports} mono best={(a) => a.pax30d}
                render={(a) =>
                  ownedByIcao.has(a.icao)
                    ? formatNumber(Math.round((a.pax30d * 7) / 30))
                    : "—"
                } />
              <Row label="PAX last 7d" hubs={airports} mono best={(a) => a.pax7d}
                render={(a) => (ownedByIcao.has(a.icao) ? formatNumber(Math.round(a.pax7d)) : "—")} />
              <Row label="Rotation" hubs={airports}
                render={(a) => <RotationCell rotation={a.rotation} max={a.maxRotation} />} />
              <Row label="Owner cut" hubs={airports} mono best={(a) => a.percToUser}
                render={(a) => `${a.percToUser}%`} />
              <Row label="Owner" hubs={airports} render={(a) => (ownedByIcao.has(a.icao) ? `@${data.me.handle}` : "—")} />
            </tbody>
          </table>
          <p className="mono px-4 py-2 text-[10px] uppercase tracking-widest text-muted-foreground">
            7d / 30d roll-ups only available for airports you own.
          </p>
        </div>
      )}
    </AppShell>
  );
}

function Row({
  label, hubs, render, mono, best,
}: {
  label: string;
  hubs: AirportExt[];
  render: (a: AirportExt) => React.ReactNode;
  mono?: boolean;
  best?: (a: AirportExt) => number;
}) {
  const max = best ? Math.max(...hubs.map(best)) : null;
  return (
    <tr className="border-t border-border">
      <td className="mono px-4 py-3 text-[11px] uppercase tracking-widest text-muted-foreground">{label}</td>
      {hubs.map((a) => {
        const isBest = best && best(a) === max && max !== 0;
        return (
          <td key={a.icao} className={`px-4 py-3 ${mono ? "mono" : ""} ${isBest ? "text-runway" : ""}`}>
            {render(a)}
          </td>
        );
      })}
    </tr>
  );
}
