import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Rocket, Gauge, ArrowRight, Sparkles, Zap, Pickaxe, Wind } from "lucide-react";
import { AppShell, PageHeader, formatNumber } from "@/components/app-shell";
import { useSimflyArgs } from "@/lib/viewed-user";
import { HubSupportGate } from "@/components/hub-support";
import { getHubSupportStatus } from "@/lib/hub-support.functions";
import {
  getMissionCatalog,
  predictMissionFn,
  rankMissionsFn,
  type MissionCatalog,
} from "@/lib/mission.functions";
import { SimbriefLink } from "@/components/simbrief-link";
import { MissionLoadingSequence } from "@/components/mission-loading-sequence";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/mission")({
  component: MissionRoute,
  head: () => ({
    meta: [
      { title: "Mission Intelligence — SimFly Hub" },
      {
        name: "description",
        content:
          "Predict PAX, income, and PAX/hour for a planned SimFly mission using your own historical flight data.",
      },
    ],
  }),
});

function MissionRoute() {
  const statusFn = useServerFn(getHubSupportStatus);
  const { keyTag, payload } = useSimflyArgs();
  const { data: status, isLoading } = useQuery({
    queryKey: ["hub-support", keyTag],
    queryFn: () => statusFn(payload ? { data: payload } : undefined),
    staleTime: 5 * 60_000,
  });
  if (isLoading) {
    return (
      <AppShell>
        <PageHeader eyebrow="Premium" title="Mission Intelligence" description="Loading…" />
        <MissionLoadingSequence />
      </AppShell>
    );
  }
  if (!status?.active) {
    return (
      <AppShell>
        <PageHeader
          eyebrow="Premium"
          title="Mission Intelligence"
          description="Predict PAX, income, and PAX/hour for planned missions."
        />
        <HubSupportGate featureName="Mission Intelligence" />
      </AppShell>
    );
  }
  return <MissionPlanner />;
}

function MissionPlanner() {
  const { keyTag, username } = useSimflyArgs();
  const catalogFn = useServerFn(getMissionCatalog);
  const predictFn = useServerFn(predictMissionFn);

  const { data: catalog } = useQuery({
    queryKey: ["mission-catalog", keyTag],
    queryFn: () => catalogFn(username ? { data: { username } } : undefined),
    staleTime: 5 * 60_000,
  });

  const [departure, setDeparture] = useState("");
  const [arrival, setArrival] = useState("");
  const [aircraftId, setAircraftId] = useState<string>("");
  const [licence, setLicence] = useState<string>("");
  const [useCommunity, setUseCommunity] = useState<boolean>(false);
  const [disableDepIncome, setDisableDepIncome] = useState<boolean>(false);
  const [disableArrIncome, setDisableArrIncome] = useState<boolean>(false);
  const [runToken, setRunToken] = useState<number>(0);
  const [runSnapshot, setRunSnapshot] = useState<{
    departure: string; arrival: string; aircraftId: string;
    licence: string; useCommunity: boolean;
    disableDepIncome: boolean; disableArrIncome: boolean;
  } | null>(null);

  const canRun =
    departure.length >= 3 && arrival.length >= 3 && !!aircraftId && !!licence;

  const prediction = useQuery({
    enabled: runToken > 0 && !!runSnapshot,
    queryKey: ["mission-predict", keyTag, runToken],
    queryFn: () =>
      predictFn({
        data: {
          departure: runSnapshot!.departure,
          arrival: runSnapshot!.arrival,
          aircraftId: runSnapshot!.aircraftId,
          licence: runSnapshot!.licence || undefined,
          useCommunity: runSnapshot!.useCommunity,
          disableDepIncome: runSnapshot!.disableDepIncome,
          disableArrIncome: runSnapshot!.disableArrIncome,
          ...(username ? { username } : {}),
        },
      }),
    staleTime: Infinity,
  });

  const inputsChanged = !!runSnapshot && (
    runSnapshot.departure !== departure ||
    runSnapshot.arrival !== arrival ||
    runSnapshot.aircraftId !== aircraftId ||
    runSnapshot.licence !== licence ||
    runSnapshot.useCommunity !== useCommunity ||
    runSnapshot.disableDepIncome !== disableDepIncome ||
    runSnapshot.disableArrIncome !== disableArrIncome
  );

  const beginDataMining = () => {
    if (!canRun) return;
    setRunSnapshot({ departure, arrival, aircraftId, licence, useCommunity, disableDepIncome, disableArrIncome });
    setRunToken((t) => t + 1);
  };

  return (
    <AppShell>
      <PageHeader
        eyebrow="Decision support"
        title="Mission Intelligence"
        description="Predicts PAX, income and PAX/hour for a planned flight using your own historical ledger — never a second accounting engine."
        actions={null}
      />

      <MissionForm
        catalog={catalog}
        departure={departure}
        arrival={arrival}
        aircraftId={aircraftId}
        licence={licence}
        useCommunity={useCommunity}
        disableDepIncome={disableDepIncome}
        disableArrIncome={disableArrIncome}
        onDeparture={setDeparture}
        onArrival={setArrival}
        onAircraftId={setAircraftId}
        onLicence={setLicence}
        onUseCommunity={setUseCommunity}
        onDisableDepIncome={setDisableDepIncome}
        onDisableArrIncome={setDisableArrIncome}
      />

      <section className="panel mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl p-4">
        <div className="text-xs text-muted-foreground">
          {canRun
            ? inputsChanged && runToken > 0
              ? "Inputs changed — press Spool Prediction Engine to refresh."
              : "Ready. Press Spool Prediction Engine so engine roar wakes up math goblins."
            : "Pick aircraft, licence, departure and arrival to unlock Engine Spooling."}
        </div>
        <button
          type="button"
          onClick={beginDataMining}
          disabled={!canRun || prediction.isFetching}
          className={cn(
            "mono inline-flex items-center gap-2 rounded-md px-4 py-2 text-xs uppercase tracking-widest transition",
            canRun && !prediction.isFetching
              ? "bg-runway text-background hover:bg-runway/90"
              : "bg-secondary text-muted-foreground cursor-not-allowed",
          )}
        >
          <Wind className="h-4 w-4" />
          {prediction.isFetching ? "Spooling..." : "Spool Prediction Engine"}
        </button>
      </section>

      <PlannerResult query={prediction} hasRun={runToken > 0} inputsStale={inputsChanged} />
    </AppShell>
  );
}

function MissionForm(props: {
  catalog: MissionCatalog | undefined;
  departure: string;
  arrival: string;
  aircraftId: string;
  licence: string;
  useCommunity: boolean;
  disableDepIncome: boolean;
  disableArrIncome: boolean;
  onDeparture: (v: string) => void;
  onArrival: (v: string) => void;
  onAircraftId: (v: string) => void;
  onLicence: (v: string) => void;
  onUseCommunity: (v: boolean) => void;
  onDisableDepIncome: (v: boolean) => void;
  onDisableArrIncome: (v: boolean) => void;
}) {
  const { catalog } = props;
  const aircraftOptions =
    catalog?.aircraft.filter((a) => a.mode !== "rental").map((a) => {
      const modeTag = a.mode === "owned" ? "Owned" : "Generic";
      const tail = a.tailNumber ? ` — ${a.tailNumber}` : "";
      const icao = a.icao ? ` (${a.icao})` : "";
      return { value: a.aircraftId, label: `[${modeTag}] ${a.label}${tail}${icao}` };
    }) ?? [];
  const ownedSet = new Set((catalog?.owned ?? []).map((o) => o.icao.toUpperCase()));
  const depUp = props.departure.toUpperCase();
  const arrUp = props.arrival.toUpperCase();
  const depOwned = depUp.length >= 3 && ownedSet.has(depUp);
  const arrOwned = arrUp.length >= 3 && ownedSet.has(arrUp);
  return (
    <section className="panel mb-4 grid gap-4 rounded-xl p-5 sm:grid-cols-2 lg:grid-cols-4">
      <FieldSelect
        label="Aircraft"
        value={props.aircraftId}
        onChange={props.onAircraftId}
        options={aircraftOptions}
      />
      <FieldSelect
        label="Licence"
        value={props.licence}
        onChange={props.onLicence}
        options={catalog?.licences.map((l) => ({ value: l.code, label: `${l.code} — ${l.name}` })) ?? []}
      />
      <FieldIcao
        label="Departure"
        value={props.departure}
        onChange={props.onDeparture}
        options={catalog?.owned.map((o) => o.icao) ?? []}
      />
      <FieldIcao
        label="Arrival"
        value={props.arrival}
        onChange={props.onArrival}
        options={catalog?.owned.map((o) => o.icao) ?? []}
      />
      <label className="sm:col-span-2 lg:col-span-4 flex items-center gap-2 text-xs text-muted-foreground">
        <input
          type="checkbox"
          checked={props.useCommunity}
          onChange={(e) => props.onUseCommunity(e.target.checked)}
          className="h-4 w-4 rounded border-border/40 bg-secondary/40"
        />
        <span>Use Community Intelligence (supplementary global medians; influence decreases as personal history grows)</span>
      </label>
      <div className="sm:col-span-2 lg:col-span-4 grid gap-3 rounded-md border border-border/30 bg-secondary/20 p-3 sm:grid-cols-2">
        <EndpointDisableToggle
          role="Departure"
          icao={depUp}
          owned={depOwned}
          checked={props.disableDepIncome}
          onChange={props.onDisableDepIncome}
        />
        <EndpointDisableToggle
          role="Arrival"
          icao={arrUp}
          owned={arrOwned}
          checked={props.disableArrIncome}
          onChange={props.onDisableArrIncome}
        />
      </div>
    </section>
  );
}

function EndpointDisableToggle({
  role,
  icao,
  owned,
  checked,
  onChange,
}: {
  role: "Departure" | "Arrival";
  icao: string;
  owned: boolean;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  const status = !icao || icao.length < 3
    ? "—"
    : owned
      ? "owned"
      : "not-owned / system?";
  return (
    <label className="flex items-start gap-2 text-xs text-muted-foreground">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-border/40 bg-secondary/40"
      />
      <span className="leading-tight">
        <span className="mono text-[10px] uppercase tracking-widest text-muted-foreground">{role}</span>{" "}
        <span className="mono text-foreground">{icao || "—"}</span>{" "}
        <span className={owned ? "text-runway" : "text-instrument"}>({status})</span>
        <span className="block text-[11px]">Check if its a system/bank airport - those airports generate no income (it will disable prediction).</span>
      </span>
    </label>
  );
}



function FieldIcao({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  const listId = `icao-${label.toLowerCase()}`;
  return (
    <label className="flex flex-col gap-1.5">
      <span className="mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value.toUpperCase().slice(0, 4))}
        placeholder="ICAO"
        list={listId}
        className="rounded-md border border-border/40 bg-secondary/40 px-3 py-2 text-sm font-mono uppercase outline-none focus:ring-1 focus:ring-runway/40"
      />
          <datalist id={listId}>
        {options.map((o) => (
          /* 
            BEZPIECZNY, NATYWNY DOPISEK:
            Nie zmieniamy typów, nie ruszamy propsów. Zmieniamy tylko to, co widzi przeglądarka.
            Wpisujemy kod ICAO, a w atrybucie label dajemy krótki, techniczny dopisek.
          */
          <option key={o} value={o} label="· Hub Base" />
        ))}
      </datalist>

    </label>
  );
}

function FieldSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-border/40 bg-secondary/40 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-runway/40"
      >
        <option value="">—</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function fmtDuration(ms: number | null): string {
  if (!ms) return "—";
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return `${h}h ${m}m`;
}

function ConfidenceBadge({ score }: { score: number }) {
  const tone =
    score >= 80
      ? "bg-runway/15 text-runway ring-runway/30"
      : score >= 55
        ? "bg-instrument/15 text-instrument ring-instrument/30"
        : "bg-destructive/10 text-destructive ring-destructive/30";
  return (
    <span
      className={cn(
        "mono inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] uppercase tracking-widest ring-1",
        tone,
      )}
    >
      {score}%
    </span>
  );
}

function PlannerResult({
  query,
  hasRun,
  inputsStale,
}: {
  query: ReturnType<typeof useQuery<Awaited<ReturnType<typeof predictMissionFn>>>>;
  hasRun: boolean;
  inputsStale: boolean;
}) {
  if (!hasRun) {
    return (
      <div className="panel rounded-xl p-6 text-sm text-muted-foreground">
        Select Aircraft, Licence, Departure and Arrival, then press <span className="mono text-runway">Spool Prediction Engine</span> to get flight individual income components estimations.
      </div>
    );
  }
  if (query.isFetching && !query.data) {
    return <MissionLoadingSequence />;
  }
  if (!query.data) return null;
  void inputsStale;
  if (!query.data) return null;
  const p = query.data;
  const componentSum = p.components.reduce((s, c) => s + c.value, 0);
  const bonusExtra = p.weeklyBonus.available ? p.weeklyBonus.extraPax : 0;

  return (
    <div className="relative space-y-6">
      {query.isFetching && <MissionLoadingSequence variant="overlay" />}

      {/* Prediction header + KPIs */}
      <section className="panel rounded-xl p-5">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-lg bg-secondary text-runway">
              <Rocket className="h-5 w-5" />
            </div>
            <div>
              <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Prediction
              </div>
              <div className="font-display text-xl font-semibold tracking-tight">
                <SimbriefLink icao={p.inputs.departure.icao} />{" "}
                <ArrowRight className="inline h-4 w-4 text-runway" />{" "}
                <SimbriefLink icao={p.inputs.arrival.icao} />
              </div>
            </div>
          </div>
          <ConfidenceBadge score={p.overallConfidence} />
        </div>

        <div className="grid gap-4 sm:grid-cols-4">
          <Tile label="Historical base" value={`${p.totalPax.toFixed(2)} PAX`} />
          <Tile
            label="Projected today"
            value={`${p.projectedPax.toFixed(2)} PAX`}
            icon={<Sparkles className="h-4 w-4 text-instrument" />}
          />
          <Tile label="PAX / hour" value={p.paxPerHour ? p.paxPerHour.toFixed(2) : "—"} icon={<Gauge className="h-4 w-4" />} />
          <Tile label="Flight time" value={fmtDuration(p.flightTimeMs)} />
        </div>
      </section>

      {/* Component breakdown */}
      <section className="panel rounded-xl p-5">
        <div className="mono mb-3 text-[10px] uppercase tracking-widest text-muted-foreground">
          Base prediction · component breakdown
        </div>
        <div className="space-y-2">
          {p.components.map((c) => (
            <div
              key={c.key}
              className="rounded-md border border-border/30 bg-secondary/30 px-3 py-2.5 text-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{c.label}</span>
                  <ConfidenceBadge score={c.confidence} />
                  <span className="mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    {c.tier}
                  </span>
                  {c.timer?.exhausted && (
                    <span className="mono rounded bg-destructive/15 px-1.5 py-0.5 text-[10px] uppercase tracking-widest text-destructive ring-1 ring-destructive/30">
                      Timer exhausted
                    </span>
                  )}
                  {c.timer && !c.timer.exhausted && c.timer.scale < 1 && (
                    <span className="mono rounded bg-instrument/15 px-1.5 py-0.5 text-[10px] uppercase tracking-widest text-instrument ring-1 ring-instrument/30">
                      Timer limited {Math.round(c.timer.scale * 100)}%
                    </span>
                  )}
                  {c.timer && !c.timer.exhausted && c.timer.scale >= 1 && (
                    <span className="mono rounded bg-runway/15 px-1.5 py-0.5 text-[10px] uppercase tracking-widest text-runway ring-1 ring-runway/30">
                      Fits timer
                    </span>
                  )}
                </div>
                <span className="mono text-runway">{c.value.toFixed(2)} PAX</span>
              </div>
              {(c.ownerShare > 0 || c.pilotShare > 0) && (
                <div className="mono mt-1 flex gap-3 text-[10px] uppercase tracking-widest text-muted-foreground">
                  {c.ownerShare > 0 && <span>Owner: {c.ownerShare.toFixed(2)}</span>}
                  {c.pilotShare > 0 && <span>Pilot: {c.pilotShare.toFixed(2)}</span>}
                </div>
              )}
              <div className="mt-1 text-xs text-muted-foreground">{c.note}</div>
              {c.timer && (
                <div className="mono mt-1 text-[11px] text-muted-foreground">
                  Historical: {c.timer.historicalValue.toFixed(2)} PAX
                  {c.timer.limiting && c.timer.minutesCap !== undefined && (
                    <> · {c.timer.limiting}: {c.timer.minutesAvailable} / {c.timer.minutesCap} min</>
                  )}
                  {" · "}Effective today: <span className={c.timer.exhausted ? "text-destructive" : "text-runway"}>{c.value.toFixed(2)} PAX</span>
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="mono mt-3 flex items-center justify-between border-t border-border/30 pt-2 text-[11px] uppercase tracking-widest">
          <span className="text-muted-foreground">Historical base (sum of components)</span>
          <span className="text-runway">= {componentSum.toFixed(2)} PAX</span>
        </div>
      </section>

      {/* Weekly bonus modifier */}
      <section
        className={cn(
          "panel rounded-xl p-5",
          p.weeklyBonus.available && "runway-glow ring-1 ring-instrument/30",
        )}
      >
        <div className="mono mb-3 flex items-center gap-2 text-[10px] uppercase tracking-widest text-muted-foreground">
          <Zap className="h-3 w-3 text-instrument" /> Temporary modifiers
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border/30 bg-secondary/30 px-3 py-2.5 text-sm">
          <div className="flex items-center gap-2">
            <span className="font-medium">Weekly First Arrival Bonus</span>
            <span
              className={cn(
                "mono rounded px-1.5 py-0.5 text-[10px] uppercase tracking-widest ring-1",
                p.weeklyBonus.available
                  ? "bg-instrument/15 text-instrument ring-instrument/30"
                  : "bg-secondary text-muted-foreground ring-border",
              )}
            >
              {p.weeklyBonus.available ? `×${p.weeklyBonus.multiplier} available` : "not available"}
            </span>
          </div>
          <span className="mono text-instrument">
            {p.weeklyBonus.available ? `+ ${bonusExtra.toFixed(2)} PAX` : "—"}
          </span>
        </div>
        <div className="mt-2 text-xs text-muted-foreground">{p.weeklyBonus.reason}</div>
        <div className="mono mt-3 flex items-center justify-between border-t border-border/30 pt-2 text-[11px] uppercase tracking-widest">
          <span className="text-muted-foreground">Projected today (base + modifiers)</span>
          <span className="text-instrument">= {p.projectedPax.toFixed(2)} PAX</span>
        </div>
      </section>

      {p.signals.length > 0 && (
        <section className="panel rounded-xl p-5">
          <div className="mono mb-3 flex items-center gap-2 text-[10px] uppercase tracking-widest text-muted-foreground">
            <Sparkles className="h-3 w-3" /> Signals
          </div>
          <div className="flex flex-wrap gap-2">
            {p.signals.map((s) => (
              <span
                key={s.key}
                title={s.hint}
                className={cn(
                  "mono inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] ring-1",
                  s.tone === "positive" && "bg-runway/10 text-runway ring-runway/30",
                  s.tone === "warn" && "bg-destructive/10 text-destructive ring-destructive/30",
                  s.tone === "neutral" && "bg-secondary text-muted-foreground ring-border",
                )}
              >
                <span className="uppercase tracking-widest">{s.label}:</span>
                <span>{s.value}</span>
              </span>
            ))}
          </div>
        </section>
      )}

      <p className="text-xs text-muted-foreground">
        Prediction sourced from your Stats/Income accounting ledger — {formatNumber(p.coverage.myFlights)} own flights
        and {formatNumber(p.coverage.visitorFlights)} visitor flights. Each component is independently derived; the
        weekly ×3 bonus is surfaced separately and never folded into the historical base.
      </p>
    </div>
  );
}

function RankerResult({
  query,
  canRank,
}: {
  query: ReturnType<typeof useQuery<Awaited<ReturnType<typeof rankMissionsFn>>>>;
  canRank: boolean;
}) {
  if (!canRank) {
    return (
      <div className="panel rounded-xl p-6 text-sm text-muted-foreground">
        Pick departure and aircraft to rank owned destinations.
      </div>
    );
  }
  if (query.isFetching && !query.data) {
    return <MissionLoadingSequence />;
  }
  if (!query.data) return null;
  const rows = query.data.results;
  return (
    <div className="panel overflow-x-auto rounded-xl">
      <table className="w-full text-sm">
        <thead className="border-b border-border/40 text-left">
          <tr className="mono text-[10px] uppercase tracking-widest text-muted-foreground">
            <th className="px-4 py-3">Airport</th>
            <th className="px-4 py-3">Distance</th>
            <th className="px-4 py-3">Flight time</th>
            <th className="px-4 py-3">Total PAX</th>
            <th className="px-4 py-3">PAX / hr</th>
            <th className="px-4 py-3">Confidence</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.arrival} className="border-b border-border/20 last:border-0">
              <td className="px-4 py-2">
                <SimbriefLink icao={r.arrival} />
                <span className="ml-2 text-xs text-muted-foreground">{r.arrivalName}</span>
              </td>
              <td className="px-4 py-2 mono">{r.distanceNm ? `${r.distanceNm.toFixed(0)} NM` : "—"}</td>
              <td className="px-4 py-2 mono">{fmtDuration(r.flightTimeMs)}</td>
              <td className="px-4 py-2 mono">{r.totalPax.toFixed(2)}</td>
              <td className="px-4 py-2 mono">{r.paxPerHour ? r.paxPerHour.toFixed(2) : "—"}</td>
              <td className="px-4 py-2">
                <ConfidenceBadge score={r.confidence} />
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={6} className="px-4 py-6 text-center text-sm text-muted-foreground">
                No candidate arrivals — you need at least one other owned airport.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function Tile({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border/40 bg-secondary/40 p-3">
      <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="mt-1 flex items-center gap-2 font-display text-2xl font-semibold tracking-tight">
        {icon}
        {value}
      </div>
    </div>
  );
}
