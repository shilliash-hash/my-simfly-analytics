import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useSuspenseQuery, useQueryClient, queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import {
  getSimflyPayload,
  getUpgradeAdvisor,
  getAdvisorSettings,
  setAdvisorSettings,
  type UpgradeAdvisorRow,
  type UpgradeAdvisorRowMeta,
} from "@/lib/simfly.functions";
import { useSimflyArgs } from "@/lib/viewed-user";
import { AppShell, PageHeader, formatNumber } from "@/components/app-shell";
import { cn } from "@/lib/utils";
import { RefreshCw, Star } from "lucide-react";

export const Route = createFileRoute("/upgrade-advisor")({
  component: UpgradeAdvisorPage,
  head: () => ({
    meta: [
      { title: "Upgrade Advisor — SimFly Hub" },
      {
        name: "description",
        content:
          "ROI-based recommendation of which airport to upgrade next, derived from your real flight history and the Airport Payout Matrix.",
      },
    ],
  }),
});

type SortKey = "payback" | "daily" | "annual" | "cost" | "name";
type AdvisorRow = UpgradeAdvisorRow & { meta: UpgradeAdvisorRowMeta };

const ADMIN_TOKEN_LS_KEY = "simflyhub:adminToken";

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

function fmtDay(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toISOString().slice(0, 10);
}

function UpgradeAdvisorPage() {
  const fn = useServerFn(getSimflyPayload);
  const { keyTag, payload } = useSimflyArgs();
  const { data } = useSuspenseQuery(
    queryOptions({
      queryKey: ["simfly", keyTag],
      queryFn: () => fn(payload ? { data: payload } : undefined),
      staleTime: 30 * 60_000,
    }),
  );

  const airportsInput = useMemo(
    () =>
      data.airports.map((a) => ({
        icao: a.icao,
        name: a.name,
        tier: a.category,
        level: a.level,
        percToUser: a.percToUser ?? 0,
      })),
    [data.airports],
  );

  const advisorFn = useServerFn(getUpgradeAdvisor);
  const settingsFn = useServerFn(getAdvisorSettings);
  const setSettingsFn = useServerFn(setAdvisorSettings);
  const qc = useQueryClient();

  const windowDays = 60; // fixed to keep upstream load predictable
  const [adminToken, setAdminToken] = useState<string>("");
  useEffect(() => {
    try {
      setAdminToken(localStorage.getItem(ADMIN_TOKEN_LS_KEY) ?? "");
    } catch { /* noop */ }
  }, []);

  const advisorQueryKey = ["upgrade-advisor", keyTag, windowDays, airportsInput.length] as const;
  const { data: advisor, isFetching, isError, refetch } = useQuery({
    queryKey: advisorQueryKey,
    queryFn: () =>
      advisorFn({
        data: { username: payload?.username, airports: airportsInput, windowDays },
      }),
    staleTime: 30 * 60_000,
    enabled: airportsInput.length > 0,
  });

  const { data: settings } = useQuery({
    queryKey: ["advisor-settings"],
    queryFn: () => settingsFn(),
    staleTime: 60_000,
  });

  const [sortKey, setSortKey] = useState<SortKey>("payback");

  const rows = useMemo<AdvisorRow[]>(() => {
    const list = [...((advisor?.rows ?? []) as AdvisorRow[])];
    list.sort((a, b) => {
      switch (sortKey) {
        case "daily":
          return b.dailyIncrease - a.dailyIncrease;
        case "annual":
          return b.annualIncrease - a.annualIncrease;
        case "cost":
          return a.upgradeCost - b.upgradeCost;
        case "name":
          return a.icao.localeCompare(b.icao);
        case "payback":
        default: {
          const av = a.paybackDays > 0 ? a.paybackDays : Number.POSITIVE_INFINITY;
          const bv = b.paybackDays > 0 ? b.paybackDays : Number.POSITIVE_INFINITY;
          return av - bv;
        }
      }
    });
    return list;
  }, [advisor, sortKey]);

  const isAdmin = adminToken.trim().length > 0;
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function forceRefresh(icaos: string[]) {
    if (!isAdmin || icaos.length === 0) return;
    setBusy(icaos.join(","));
    setMsg(null);
    try {
      const res = await advisorFn({
        data: {
          username: payload?.username,
          airports: airportsInput,
          windowDays,
          forceIcaos: icaos,
          adminToken,
        },
      });
      qc.setQueryData(advisorQueryKey, res);
      setMsg("Refreshed.");
    } catch (e) {
      setMsg((e as Error).message || "Refresh failed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <AppShell>
      <PageHeader
        eyebrow="Analytics"
        title="Airport Upgrade Advisor"
        description="Purely data-driven. Uses the real TOTAL PAX your airports have received on landing (Airport Profit Split + Weekly Cycle ×3 bonus). Long-lived analysis — cached and refreshed on a slow cadence to keep upstream load low."
      />

      {advisor && (
        <div className="mb-4 rounded-lg border border-border bg-card/60 p-4 text-xs grid gap-2 sm:grid-cols-3">
          <div>
            <div className="mono uppercase tracking-widest text-foreground/50">Generated</div>
            <div className="mono text-foreground">{fmtDate(advisor.generatedAt)}</div>
          </div>
          <div>
            <div className="mono uppercase tracking-widest text-foreground/50">Based on</div>
            <div className="mono text-foreground">Last {advisor.windowDays} days</div>
          </div>
          <div>
            <div className="mono uppercase tracking-widest text-foreground/50">Next refresh</div>
            <div className="mono text-foreground">
              {fmtDay(advisor.refreshAfter)}{" "}
              <span className="text-foreground/50">(TTL {advisor.ttlDays}d)</span>
            </div>
          </div>
          <p className="sm:col-span-3 text-foreground/60">
            This analysis is intentionally refreshed only once every {advisor.ttlDays} day
            {advisor.ttlDays === 1 ? "" : "s"} per airport — upgrade recommendations change
            slowly, and recalculating on every visit would waste database and upstream SimFly
            capacity.
          </p>
        </div>
      )}

      <div className="mb-5 flex flex-wrap items-end gap-3">
        <label className="text-xs uppercase tracking-wider text-foreground/60">
          History window
          <select
            value={windowDays}
            onChange={(e) => setWindowDays(Number(e.target.value))}
            className="mt-1 block bg-card border border-border rounded-md px-3 py-2 text-sm text-foreground"
          >
            <option value={30}>Last 30 days</option>
            <option value={60}>Last 60 days</option>
            <option value={90}>Last 90 days</option>
            <option value={180}>Last 180 days</option>
          </select>
        </label>
        <label className="text-xs uppercase tracking-wider text-foreground/60">
          Sort by
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="mt-1 block bg-card border border-border rounded-md px-3 py-2 text-sm text-foreground"
          >
            <option value="payback">Fastest payback</option>
            <option value="daily">Highest daily increase</option>
            <option value="annual">Highest annual increase</option>
            <option value="cost">Lowest upgrade cost</option>
            <option value="name">Airport name</option>
          </select>
        </label>
        <div className="ml-auto text-[11px] text-foreground/50">
          {isFetching ? "Loading…" : advisor ? `${rows.length} airports analysed` : ""}
        </div>
      </div>

      {/* Admin panel */}
      <details className="mb-4 rounded-lg border border-border bg-card/40 p-3 text-sm">
        <summary className="cursor-pointer text-xs uppercase tracking-widest text-foreground/60">
          Admin controls
        </summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto_auto]">
          <input
            type="password"
            placeholder="Admin token"
            value={adminToken}
            onChange={(e) => {
              setAdminToken(e.target.value);
              try {
                localStorage.setItem(ADMIN_TOKEN_LS_KEY, e.target.value);
              } catch { /* noop */ }
            }}
            className="bg-card border border-border rounded-md px-3 py-2 text-sm text-foreground"
          />
          <TtlEditor
            currentTtl={settings?.ttlDays ?? 30}
            disabled={!isAdmin}
            onSave={async (n) => {
              try {
                await setSettingsFn({ data: { adminToken, ttlDays: n } });
                qc.invalidateQueries({ queryKey: ["advisor-settings"] });
                setMsg(`TTL set to ${n} days.`);
              } catch (e) {
                setMsg((e as Error).message || "Failed to save TTL.");
              }
            }}
          />
          <button
            type="button"
            disabled={!isAdmin || busy !== null || !advisor}
            onClick={() => forceRefresh(rows.map((r) => r.icao))}
            className="inline-flex items-center gap-2 rounded-md border border-runway/50 bg-runway/10 px-3 py-2 text-xs text-runway hover:bg-runway/20 disabled:opacity-40"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh all (24 h cap)
          </button>
        </div>
        {msg && <div className="mt-2 text-xs text-foreground/70">{msg}</div>}
        {!isAdmin && (
          <div className="mt-2 text-[11px] text-foreground/50">
            Enter your admin token to unlock manual refresh and TTL configuration.
          </div>
        )}
      </details>

      {isError && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">
          Failed to compute advisor.{" "}
          <button onClick={() => refetch()} className="underline">Retry</button>
        </div>
      )}

      {!advisor && !isError && (
        <div className="rounded-lg border border-border bg-card p-6 text-sm text-foreground/60">
          Loading cached analysis…
        </div>
      )}

      {advisor && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((r) => (
            <AdvisorCard
              key={r.icao}
              row={r}
              canRefresh={isAdmin}
              busy={busy === r.icao}
              onRefresh={() => forceRefresh([r.icao])}
            />
          ))}
          {rows.length === 0 && (
            <div className="rounded-lg border border-border bg-card p-6 text-sm text-foreground/60">
              No owned airports.
            </div>
          )}
        </div>
      )}

      <p className="mt-6 text-[11px] text-foreground/50 max-w-3xl">
        Methodology: purely data-driven. Average per-arrival income is the mean TOTAL PAX
        credited to each airport across every flight touching the airport in the selected
        window, sampled from the same public airport history as the Payout Matrix. Payback =
        upgrade cost ÷ current daily income. Results are cached per airport / level / window;
        cache invalidates automatically when a level change is detected during sync, or when an
        administrator forces a refresh (once per 24 h per airport).
      </p>
    </AppShell>
  );
}

function TtlEditor({
  currentTtl,
  disabled,
  onSave,
}: {
  currentTtl: number;
  disabled: boolean;
  onSave: (n: number) => void | Promise<void>;
}) {
  const [v, setV] = useState<number>(currentTtl);
  useEffect(() => setV(currentTtl), [currentTtl]);
  return (
    <div className="flex items-end gap-2">
      <label className="text-[10px] uppercase tracking-widest text-foreground/60">
        Cache TTL (days)
        <input
          type="number"
          min={1}
          max={365}
          value={v}
          disabled={disabled}
          onChange={(e) => setV(Number(e.target.value))}
          className="mt-1 block w-24 bg-card border border-border rounded-md px-3 py-2 text-sm text-foreground disabled:opacity-40"
        />
      </label>
      <button
        type="button"
        disabled={disabled || !Number.isFinite(v) || v <= 0 || v === currentTtl}
        onClick={() => onSave(Math.round(v))}
        className="rounded-md border border-border bg-card px-3 py-2 text-xs hover:bg-card/70 disabled:opacity-40"
      >
        Save
      </button>
    </div>
  );
}

function AdvisorCard({
  row,
  canRefresh,
  busy,
  onRefresh,
}: {
  row: AdvisorRow;
  canRefresh: boolean;
  busy: boolean;
  onRefresh: () => void;
}) {
  const hasData = row.flightsSampled > 0 && row.dailyIncrease > 0;
  const lastManualMs = row.meta.lastManualRefreshAt
    ? new Date(row.meta.lastManualRefreshAt).getTime()
    : 0;
  const cooldownLeftMs = Math.max(0, lastManualMs + 24 * 60 * 60 * 1000 - Date.now());
  const cooldown = cooldownLeftMs > 0;
  return (
    <article className="panel rounded-xl p-4 flex flex-col gap-3">
      <header className="flex items-baseline justify-between gap-3">
        <div>
          <div className="font-display text-xl font-semibold tracking-tight text-runway">
            {row.icao}
          </div>
          <div className="text-xs text-foreground/70 truncate max-w-[14rem]">{row.name}</div>
        </div>
        <div className="text-right">
          <div className="mono text-[10px] uppercase tracking-widest text-foreground/50">
            Tier {row.tier}
          </div>
          <div className="text-sm">
            L{row.level} <span className="text-foreground/50">→</span>{" "}
            <span className="text-instrument font-semibold">L{row.nextLevel}</span>
          </div>
        </div>
      </header>

      <dl className="grid grid-cols-2 gap-2 text-sm">
        <Field label="Upgrade cost" value={`${formatNumber(row.upgradeCost)} PAX`} />
        <Field
          label="Est. payback"
          value={
            hasData && row.paybackDays > 0
              ? `${Math.round(row.paybackDays)} d`
              : "—"
          }
          accent="instrument"
        />
        <Field
          label="Current daily PAX"
          value={hasData ? `${row.dailyIncrease.toFixed(2)} PAX` : "—"}
          accent="runway"
        />
        <Field
          label="Annual @ current rate"
          value={hasData ? `${formatNumber(Math.round(row.annualIncrease))} PAX` : "—"}
          accent="runway"
        />
      </dl>

      <footer className="flex items-center justify-between pt-2 border-t border-border/60">
        <Stars stars={row.stars} />
        <div className="text-right text-[11px]">
          <div className="text-foreground/70">{row.ratingLabel}</div>
          <div className="text-foreground/40">
            {row.flightsSampled} flights · {row.arrivalsPerDay.toFixed(1)}/day
          </div>
          {row.avgTotalPaxPerFlight > 0 && (
            <div className="text-instrument/80">
              avg {row.avgTotalPaxPerFlight.toFixed(2)} PAX/flight (incl. bonus)
            </div>
          )}
        </div>
      </footer>

      <div className="flex items-center justify-between border-t border-border/40 pt-2 text-[10px] text-foreground/50">
        <div>
          <div>Generated {fmtDate(row.meta.generatedAt)}</div>
          <div>Next refresh {fmtDay(row.meta.refreshAfter)}</div>
        </div>
        {canRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={busy || cooldown}
            title={
              cooldown
                ? `Manual refresh available in ${Math.ceil(cooldownLeftMs / 3_600_000)} h`
                : "Force recalculation now"
            }
            className="inline-flex items-center gap-1 rounded-md border border-runway/40 bg-runway/10 px-2 py-1 text-runway hover:bg-runway/20 disabled:opacity-40"
          >
            <RefreshCw className={cn("h-3 w-3", busy && "animate-spin")} />
            Refresh
          </button>
        )}
      </div>
    </article>
  );
}

function Field({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "runway" | "instrument";
}) {
  const tone =
    accent === "runway"
      ? "text-runway"
      : accent === "instrument"
        ? "text-instrument"
        : "text-foreground";
  return (
    <div>
      <dt className="mono text-[10px] uppercase tracking-widest text-foreground/50">
        {label}
      </dt>
      <dd className={cn("mono mt-0.5 font-semibold", tone)}>{value}</dd>
    </div>
  );
}

function Stars({ stars }: { stars: 1 | 2 | 3 | 4 | 5 }) {
  return (
    <div className="flex gap-0.5" aria-label={`${stars} of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={cn(
            "h-4 w-4",
            i <= stars ? "fill-instrument text-instrument" : "text-foreground/20",
          )}
        />
      ))}
    </div>
  );
}
