import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronDown, ChevronRight, Gauge, Radio, Telescope } from "lucide-react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  adminBackfillAction,
  listBackfills,
  listOwnershipPeriods,
  verifyAdminToken,
  type AdminAction,
} from "@/lib/admin.functions";
import {
  getHubSupportAdmin,
  setHubSupportSettings,
  adminGrantHubSupport,
  adminRevokeHubSupport,
} from "@/lib/hub-support.functions";
import {
  runSoftRecovery,
  runFlightRecovery,
  type RecoveryReport,
} from "@/lib/recovery.functions";
import {
  listAirportSpyAccess,
  setAirportSpyAccess,
  revokeAirportSpyAccess,
} from "@/lib/airport-spy.functions";
import { setAdminToken, useAdminToken } from "@/lib/admin-token";
import { AppShell, PageHeader } from "@/components/app-shell";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin")({
  component: AdminPage,
  head: () => ({
    meta: [
      { title: "Admin · SimFly Hub" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
});

function AdminPage() {
  const token = useAdminToken();
  return (
    <AppShell>
      <PageHeader
        eyebrow="Operations"
        title="Backfill Admin"
        description="Manage historical logbook import jobs — retry stuck pilots, reset progress, cancel runaway imports, and remove failed records."
      />
      {token ? (
        <div className="space-y-8">
          <QuickLinks />
          <AdminTable token={token} />
          <HubSupportAdmin token={token} />
          <MaintenanceCenter token={token} />
          <AirportSpyAccessAdmin token={token} />
          <OwnershipLedgerAdmin token={token} />
        </div>

      ) : (
        <TokenForm />
      )}
    </AppShell>
  );
}

const QUICK_LINKS = [
  {
    to: "/aircraft-efficiency" as const,
    label: "Efficiency Lab",
    hint: "PAX generation per aircraft",
    icon: Gauge,
  },
  {
    to: "/airport-command" as const,
    label: "Airport Command",
    hint: "Owned airport operations room",
    icon: Radio,
  },
  {
    to: "/airport-spy" as const,
    label: "Airport Spy",
    hint: "On-demand airport investigations",
    icon: Telescope,
  },
];

function QuickLinks() {
  return (
    <section className="panel rounded-xl p-4">
      <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground">
        Intelligence modules
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {QUICK_LINKS.map(({ to, label, hint, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            className="group flex items-center gap-3 rounded-lg bg-secondary/40 px-3 py-3 ring-1 ring-border transition-colors hover:bg-secondary hover:ring-runway/40"
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-background/60 text-runway">
              <Icon className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-foreground">{label}</span>
              <span className="block truncate text-[11px] text-muted-foreground">{hint}</span>
            </span>
            <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-runway" />
          </Link>
        ))}
      </div>
    </section>
  );
}


function TokenForm() {
  const verify = useServerFn(verifyAdminToken);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await verify({ data: { token: value.trim() } });
      setAdminToken(value.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid token");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="panel max-w-md space-y-3 rounded-xl p-5">
      <label className="mono block text-[10px] uppercase tracking-widest text-muted-foreground">
        Admin Token
      </label>
      <input
        type="password"
        autoComplete="current-password"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Paste ADMIN_TOKEN"
        className="w-full rounded-md border border-border bg-secondary/40 px-3 py-2 text-sm outline-none focus:border-runway"
      />
      {error && <div className="text-xs text-destructive">{error}</div>}
      <button
        type="submit"
        disabled={busy || !value.trim()}
        className="rounded-md bg-runway px-4 py-2 text-sm font-medium text-background hover:bg-runway/90 disabled:opacity-50"
      >
        {busy ? "Verifying..." : "Unlock"}
      </button>
    </form>
  );
}

function fmtDate(s: string | null): string {
  if (!s) return "—";
  try {
    const d = new Date(s);
    return d.toISOString().replace("T", " ").slice(0, 19) + "Z";
  } catch {
    return s;
  }
}

function statusPill(status: string) {
  const cls =
    status === "completed"
      ? "bg-runway/15 text-runway ring-runway/30"
      : status === "running"
        ? "bg-instrument/15 text-instrument ring-instrument/30"
        : status === "failed"
          ? "bg-destructive/15 text-destructive ring-destructive/30"
          : "bg-secondary text-muted-foreground ring-border";
  return (
    <span
      className={cn(
        "mono inline-flex rounded px-1.5 py-0.5 text-[10px] uppercase tracking-widest ring-1",
        cls,
      )}
    >
      {status}
    </span>
  );
}

function AdminTable({ token }: { token: string }) {
  const listFn = useServerFn(listBackfills);
  const actionFn = useServerFn(adminBackfillAction);
  const qc = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["admin", "backfills"],
    queryFn: () => listFn({ data: { token } }),
    refetchInterval: 5000,
  });

  const mutation = useMutation({
    mutationFn: (vars: { action: AdminAction; usernames: string[]; deleteFlights?: boolean }) =>
      actionFn({ data: { token, ...vars } }),
    onSuccess: () => {
      setSelected(new Set());
      setError(null);
      qc.invalidateQueries({ queryKey: ["admin", "backfills"] });
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Action failed"),
  });

  const allSelected = useMemo(
    () => rows.length > 0 && rows.every((r) => selected.has(r.username)),
    [rows, selected],
  );

  function toggle(name: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  function toggleAll() {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(rows.map((r) => r.username)));
  }

  async function runAction(action: AdminAction, usernames: string[]) {
    if (usernames.length === 0) return;
    if (action === "delete") {
      const wipe = window.confirm(
        `Delete backfill records for ${usernames.length} pilot(s)?\n\nClick OK to also delete imported historical flights, Cancel to keep flights.`,
      );
      // wipe===true means user wants both; wipe===false means keep flights but
      // we still need confirmation that they actually want to delete the record.
      if (!wipe) {
        const keep = window.confirm(
          `Delete only the progress record (keep ${usernames.length} pilot's flights)?`,
        );
        if (!keep) return;
        mutation.mutate({ action, usernames, deleteFlights: false });
        return;
      }
      mutation.mutate({ action, usernames, deleteFlights: true });
      return;
    }
    mutation.mutate({ action, usernames });
  }

  const selectedList = Array.from(selected);

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      )}

      <div className="panel flex flex-wrap items-center gap-2 rounded-xl p-3">
        <span className="mono text-[10px] uppercase tracking-widest text-muted-foreground">
          {selected.size} selected
        </span>
        <BulkBtn label="Retry" disabled={!selected.size} onClick={() => runAction("retry", selectedList)} />
        <BulkBtn
          label="Retry @ current"
          disabled={!selected.size}
          onClick={() => runAction("retry_current", selectedList)}
        />
        <BulkBtn label="Reset" disabled={!selected.size} onClick={() => runAction("reset", selectedList)} />
        <BulkBtn label="Cancel" disabled={!selected.size} onClick={() => runAction("cancel", selectedList)} />
        <BulkBtn
          label="Delete"
          tone="destructive"
          disabled={!selected.size}
          onClick={() => runAction("delete", selectedList)}
        />
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => qc.invalidateQueries({ queryKey: ["admin", "backfills"] })}
            className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-secondary"
          >
            Refresh
          </button>
          <button
            onClick={() => setAdminToken(null)}
            className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-secondary"
          >
            Sign out
          </button>
        </div>
      </div>

      <div className="panel overflow-x-auto rounded-xl">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[10px] uppercase tracking-widest text-muted-foreground">
              <th className="w-10 px-3 py-2">
                <input type="checkbox" checked={allSelected} onChange={toggleAll} />
              </th>
              <th className="px-3 py-2">Username</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2 text-right">Page</th>
              <th className="px-3 py-2 text-right">Flights</th>
              <th className="px-3 py-2">Started</th>
              <th className="px-3 py-2">Updated</th>
              <th className="px-3 py-2">Error</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">
                  Loading…
                </td>
              </tr>
            )}
            {!isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">
                  No backfill jobs yet.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.username} className="border-b border-border/40 hover:bg-secondary/30">
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={selected.has(r.username)}
                    onChange={() => toggle(r.username)}
                  />
                </td>
                <td className="px-3 py-2 font-medium">@{r.username}</td>
                <td className="px-3 py-2">{statusPill(r.status)}</td>
                <td className="mono px-3 py-2 text-right text-xs">
                  {r.current_page} / {r.total_pages}
                </td>
                <td className="mono px-3 py-2 text-right text-xs">
                  {r.flights_imported}
                  {r.flights_total_est ? ` / ~${r.flights_total_est}` : ""}
                </td>
                <td className="mono px-3 py-2 text-[11px] text-muted-foreground">
                  {fmtDate(r.started_at)}
                </td>
                <td className="mono px-3 py-2 text-[11px] text-muted-foreground">
                  {fmtDate(r.updated_at)}
                </td>
                <td className="max-w-[280px] truncate px-3 py-2 text-xs text-destructive/80" title={r.error_message ?? ""}>
                  {r.error_message ?? ""}
                </td>
                <td className="px-3 py-2">
                  <div className="flex justify-end gap-1">
                    <RowBtn label="Retry" onClick={() => runAction("retry", [r.username])} />
                    {(r.status === "stalled" || r.status === "failed" || r.status === "running") && (
                      <RowBtn
                        label="Retry @ current"
                        onClick={() => runAction("retry_current", [r.username])}
                      />
                    )}
                    <RowBtn label="Reset" onClick={() => runAction("reset", [r.username])} />
                    {(r.status === "running" || r.status === "stalled") && (
                      <RowBtn label="Cancel" onClick={() => runAction("cancel", [r.username])} />
                    )}
                    <RowBtn
                      label="Delete"
                      tone="destructive"
                      onClick={() => runAction("delete", [r.username])}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-muted-foreground">
        <strong>Retry</strong>: marks the job as running so the importer picks it up on the next tick.{" "}
        <strong>Retry @ current</strong>: resumes a stalled job at the exact page that was being attempted, without resetting progress or imported flights.{" "}
        <strong>Reset</strong>: clears progress to page 0 (keeps imported flights).{" "}
        <strong>Cancel</strong>: flips a running job to failed so it stops being ticked.{" "}
        <strong>Delete</strong>: removes the progress record and (with confirmation) the imported historical flights.
      </p>
    </div>
  );
}

function BulkBtn({
  label,
  onClick,
  disabled,
  tone,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: "destructive";
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "rounded-md border px-3 py-1.5 text-xs transition-colors disabled:opacity-40",
        tone === "destructive"
          ? "border-destructive/40 text-destructive hover:bg-destructive/10"
          : "border-border hover:bg-secondary",
      )}
    >
      {label}
    </button>
  );
}

function RowBtn({
  label,
  onClick,
  tone,
}: {
  label: string;
  onClick: () => void;
  tone?: "destructive";
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "mono rounded border px-2 py-0.5 text-[10px] uppercase tracking-widest transition-colors",
        tone === "destructive"
          ? "border-destructive/40 text-destructive hover:bg-destructive/10"
          : "border-border text-muted-foreground hover:bg-secondary hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}

function HubSupportAdmin({ token }: { token: string }) {
  const loadFn = useServerFn(getHubSupportAdmin);
  const saveFn = useServerFn(setHubSupportSettings);
  const grantFn = useServerFn(adminGrantHubSupport);
  const revokeFn = useServerFn(adminRevokeHubSupport);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "hub-support"],
    queryFn: () => loadFn({ data: { token } }),
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
  });

  const [granting, setGranting] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function toggle(field: "enabled" | "admin_bypass", next: boolean) {
    setBusy(true);
    setErr(null);
    try {
      await saveFn({ data: { token, [field]: next } });
      qc.invalidateQueries({ queryKey: ["admin", "hub-support"] });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function grant() {
    const u = granting.trim();
    if (!u) return;
    setBusy(true);
    setErr(null);
    try {
      await grantFn({ data: { token, username: u } });
      setGranting("");
      qc.invalidateQueries({ queryKey: ["admin", "hub-support"] });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Grant failed");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(username: string, weekStartUtc: string) {
    if (!confirm(`Revoke Hub Support for @${username} this week?`)) return;
    setBusy(true);
    setErr(null);
    try {
      await revokeFn({ data: { token, username, weekStartUtc } });
      qc.invalidateQueries({ queryKey: ["admin", "hub-support"] });
      qc.invalidateQueries({ queryKey: ["hub-support"] });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Revoke failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-xl font-semibold">Hub Support</h2>
        <p className="text-xs text-muted-foreground">
          Weekly access gate for the Payout Matrix and Upgrade Advisor.{" "}
          {data ? <>Current week: <span className="mono">{data.weekLabel}</span></> : null}
        </p>
      </div>

      {err && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {err}
        </div>
      )}

      <div className="panel grid gap-3 rounded-xl p-4 sm:grid-cols-2">
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            disabled={busy || !data}
            checked={data?.settings.enabled ?? true}
            onChange={(e) => toggle("enabled", e.target.checked)}
          />
          <div>
            <div className="font-medium">Feature enabled</div>
            <div className="text-xs text-muted-foreground">
              When off, everyone bypasses the gate and can use gated features freely.
            </div>
          </div>
        </label>
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            disabled={busy || !data}
            checked={data?.settings.admin_bypass ?? true}
            onChange={(e) => toggle("admin_bypass", e.target.checked)}
          />
          <div>
            <div className="font-medium">Admin token bypass</div>
            <div className="text-xs text-muted-foreground">
              Any request carrying a valid admin token skips the gate (useful for testing).
            </div>
          </div>
        </label>
      </div>

      <div className="panel rounded-xl p-4">
        <div className="mb-2 text-sm font-medium">Manually grant support for this week</div>
        <div className="flex gap-2">
          <input
            value={granting}
            onChange={(e) => setGranting(e.target.value)}
            placeholder="SimFly username"
            className="flex-1 rounded-md border border-border bg-secondary/40 px-3 py-2 text-sm outline-none focus:border-runway"
          />
          <button
            onClick={grant}
            disabled={busy || !granting.trim()}
            className="rounded-md bg-runway px-4 py-2 text-sm font-medium text-background hover:bg-runway/90 disabled:opacity-50"
          >
            Grant
          </button>
        </div>
      </div>

      <div className="panel overflow-x-auto rounded-xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-2">
          <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Supporters this week
          </div>
          <div className="mono text-xs text-runway">{data?.supporters.length ?? 0}</div>
        </div>
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-widest text-muted-foreground">
              <th className="px-3 py-2">Username</th>
              <th className="px-3 py-2">Source</th>
              <th className="px-3 py-2">Qualifying ICAO</th>
              <th className="px-3 py-2">Activated</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-center text-muted-foreground">
                  Loading…
                </td>
              </tr>
            )}
            {!isLoading && (data?.supporters ?? []).length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-center text-muted-foreground">
                  No supporters this week yet.
                </td>
              </tr>
            )}
            {(data?.supporters ?? []).map((s) => (
              <tr key={s.username} className="border-t border-border/40">
                <td className="px-3 py-2 font-medium">@{s.username}</td>
                <td className="px-3 py-2">
                  <span className="mono rounded bg-secondary px-1.5 py-0.5 text-[10px] uppercase tracking-widest">
                    {s.support_source}
                  </span>
                </td>
                <td className="mono px-3 py-2 text-xs text-runway">{s.qualifying_icao ?? "—"}</td>
                <td className="mono px-3 py-2 text-[11px] text-muted-foreground">
                  {fmtDate(s.activated_at)}
                </td>
                <td className="px-3 py-2 text-right">
                  <button
                    onClick={() => revoke(s.username, data!.weekStartUtc)}
                    disabled={busy}
                    className="rounded-md border border-destructive/40 px-2 py-1 text-[11px] text-destructive hover:bg-destructive/10 disabled:opacity-50"
                  >
                    Revoke
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Maintenance Center — manually-triggered recovery utilities.
// Backed entirely by src/lib/recovery.functions.ts. Adds no automatic
// behaviour to the Admin page: every action requires an explicit click.
// ---------------------------------------------------------------------------

function MaintenanceCenter({ token }: { token: string }) {
  const softFn = useServerFn(runSoftRecovery);
  const flightFn = useServerFn(runFlightRecovery);
  const [windowDays, setWindowDays] = useState(10);
  const [busy, setBusy] = useState<null | "soft" | "flight">(null);
  const [err, setErr] = useState<string | null>(null);
  const [report, setReport] = useState<RecoveryReport | null>(null);

  async function run(kind: "soft" | "flight") {
    setBusy(kind);
    setErr(null);
    setReport(null);
    try {
      const fn = kind === "soft" ? softFn : flightFn;
      const r = await fn({ data: { token, windowDays } });
      setReport(r);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Recovery failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-xl font-semibold">Maintenance Center</h2>
        <p className="text-xs text-muted-foreground">
          Manual recovery utilities. Nothing runs automatically. Every action
          is idempotent — existing records are never overwritten and
          historical ownership is preserved.
        </p>
      </div>

      {err && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {err}
        </div>
      )}

      <div className="panel rounded-xl p-4">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <label className="mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Scan window (days)
          </label>
          <input
            type="number"
            min={1}
            max={90}
            value={windowDays}
            onChange={(e) => setWindowDays(Math.max(1, Math.min(90, Number(e.target.value) || 10)))}
            disabled={busy !== null}
            className="w-24 rounded-md border border-border bg-secondary/40 px-2 py-1 text-sm outline-none focus:border-runway"
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <RecoveryCard
            title="Soft Recovery"
            description="Reconstruct missing Aircraft Owner Activity entries from existing Activity records. Skips generic aircraft, unresolved ownership, and non–Hub users."
            running={busy === "soft"}
            disabled={busy !== null}
            onRun={() => run("soft")}
          />
          <RecoveryCard
            title="Flight Recovery"
            description="Inspect completed flights directly and create any missing owner Activity entry. Common when the route lies between airports the owner does not operate."
            running={busy === "flight"}
            disabled={busy !== null}
            onRun={() => run("flight")}
          />
        </div>
      </div>

      {busy && (
        <div className="panel rounded-xl p-4 text-sm">
          <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Running
          </div>
          <div className="mt-1 flex items-center gap-2">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-runway" />
            Scanning users, activities and flights…
          </div>
        </div>
      )}

      {report && <RecoveryReportView report={report} />}
    </div>
  );
}

function RecoveryCard({
  title,
  description,
  running,
  disabled,
  onRun,
}: {
  title: string;
  description: string;
  running: boolean;
  disabled: boolean;
  onRun: () => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-secondary/20 p-3">
      <div className="mb-1 font-medium">{title}</div>
      <div className="mb-3 text-xs text-muted-foreground">{description}</div>
      <button
        onClick={onRun}
        disabled={disabled}
        className={cn(
          "rounded-md bg-runway px-3 py-1.5 text-xs font-medium text-background hover:bg-runway/90 disabled:opacity-50",
        )}
      >
        {running ? "Running…" : `Run ${title}`}
      </button>
    </div>
  );
}

function RecoveryReportView({ report }: { report: RecoveryReport }) {
  const Row = ({ label, value }: { label: string; value: string | number }) => (
    <div className="flex items-baseline justify-between border-b border-border/40 py-1.5 last:border-none">
      <span className="mono text-[10px] uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      <span className="mono text-sm">{value}</span>
    </div>
  );
  return (
    <div className="panel rounded-xl p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="font-medium capitalize">{report.mode} Recovery — report</div>
        <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground">
          window: {report.windowDays}d
        </div>
      </div>
      <Row label="Users scanned" value={report.usersScanned} />
      <Row label="Activities scanned" value={report.activitiesScanned.toLocaleString()} />
      <Row label="Flights scanned" value={report.flightsScanned.toLocaleString()} />
      <Row label="Missing activities" value={report.missingActivities} />
      <Row label="Recovered" value={report.recovered} />
      <Row label="Already correct" value={report.alreadyCorrect.toLocaleString()} />
      <Row label="Skipped" value={report.skipped.toLocaleString()} />
      <Row label="Elapsed" value={`${(report.elapsedMs / 1000).toFixed(2)}s`} />
      {report.notes.length > 0 && (
        <div className="mt-3 space-y-1 text-xs text-muted-foreground">
          {report.notes.map((n, i) => (
            <div key={i}>• {n}</div>
          ))}
        </div>
      )}
      {report.recovered > 0 && report.recoveredItems.length > 0 && (
        <div className="mt-5">
          <div className="mb-2 flex items-baseline justify-between">
            <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Recovered items
            </div>
            <div className="mono text-[10px] uppercase tracking-widest text-purple-400">
              {report.recoveredItems.length} restored
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {report.recoveredItems.map((it) => (
              <div
                key={it.id}
                className="rounded-lg border border-border/40 bg-background/30 p-3"
              >
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <span className="mono rounded bg-purple-500/10 px-1.5 py-0.5 text-[10px] uppercase tracking-widest text-purple-400 ring-1 ring-purple-500/30">
                    Recovered
                  </span>
                  <span className="mono text-[10px] text-muted-foreground">
                    @{it.username}
                  </span>
                </div>
                <div className="text-sm font-medium">
                  {it.aircraft}
                  {it.tailNumber && (
                    <span className="mono ml-2 text-[11px] text-muted-foreground">
                      {it.tailNumber}
                    </span>
                  )}
                </div>
                <div className="mono mt-1 text-xs text-runway">{it.route}</div>
                <div className="mt-1.5 flex items-baseline justify-between text-[11px]">
                  <span className="text-muted-foreground">flown by @{it.pilot}</span>
                  <span className="mono font-medium text-instrument">
                    +{it.delta.toLocaleString()} PAX
                  </span>
                </div>
                {it.at && (
                  <div className="mono mt-1 text-[10px] text-muted-foreground">
                    {fmtDate(it.at)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}


function AirportSpyAccessAdmin({ token }: { token: string }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listAirportSpyAccess);
  const setFn = useServerFn(setAirportSpyAccess);
  const revokeFn = useServerFn(revokeAirportSpyAccess);
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");

  const { data: rows } = useQuery({
    queryKey: ["airport-spy-access-admin"],
    queryFn: () => listFn({ data: { token } }),
    staleTime: 30_000,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["airport-spy-access-admin"] });

  const grant = useMutation({
    mutationFn: (input: { username: string; enabled: boolean; notes?: string }) =>
      setFn({ data: { token, ...input } }),
    onSuccess: () => {
      setName("");
      setNotes("");
      invalidate();
    },
  });
  const revoke = useMutation({
    mutationFn: (username: string) => revokeFn({ data: { token, username } }),
    onSuccess: invalidate,
  });

  return (
    <section className="panel rounded-xl p-4">
      <h2 className="font-display text-sm font-semibold tracking-tight">Airport Spy access</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Manually managed participant list for the Airport Spy research programme. Supporter status
        does not grant access.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="SimFly username"
          className="mono rounded-lg bg-secondary/60 px-3 py-2 text-sm outline-none ring-1 ring-border focus:ring-runway/50"
        />
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes (optional)"
          className="flex-1 rounded-lg bg-secondary/60 px-3 py-2 text-sm outline-none ring-1 ring-border focus:ring-runway/50"
        />
        <button
          disabled={!name.trim() || grant.isPending}
          onClick={() => grant.mutate({ username: name, enabled: true, notes })}
          className="mono rounded-lg bg-runway/15 px-4 py-2 text-xs uppercase tracking-widest text-runway ring-1 ring-runway/40 disabled:opacity-50"
        >
          Grant access
        </button>
      </div>
      <div className="mt-3 space-y-1">
        {(rows ?? []).length === 0 ? (
          <div className="text-xs text-muted-foreground">No participants yet.</div>
        ) : (
          (rows ?? []).map((r) => (
            <div
              key={r.username}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-secondary/30 px-3 py-2"
            >
              <div className="min-w-0">
                <span className="mono text-xs">{r.username}</span>
                {r.notes ? (
                  <span className="ml-2 truncate text-[11px] text-muted-foreground">{r.notes}</span>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "mono rounded px-2 py-0.5 text-[10px] uppercase tracking-widest ring-1",
                    r.enabled
                      ? "bg-runway/10 text-runway ring-runway/30"
                      : "bg-secondary text-muted-foreground ring-border",
                  )}
                >
                  {r.enabled ? "Enabled" : "Disabled"}
                </span>
                <button
                  onClick={() =>
                    grant.mutate({ username: r.username, enabled: !r.enabled, notes: r.notes ?? "" })
                  }
                  className="mono rounded bg-secondary px-2 py-1 text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground"
                >
                  {r.enabled ? "Disable" : "Enable"}
                </button>
                <button
                  onClick={() => revoke.mutate(r.username)}
                  className="mono rounded bg-secondary px-2 py-1 text-[10px] uppercase tracking-widest text-destructive"
                >
                  Remove
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

/**
 * Aircraft ownership ledger — read-only audit trail.
 * Ownership periods are immutable append-only records; this panel exists to
 * verify transfers, not to edit them.
 */
function OwnershipLedgerAdmin({ token }: { token: string }) {
  const listFn = useServerFn(listOwnershipPeriods);
  const [aircraftId, setAircraftId] = useState("");
  const [username, setUsername] = useState("");
  const [filter, setFilter] = useState<{ aircraftId: string; username: string }>({
    aircraftId: "",
    username: "",
  });

  const { data: rows, isFetching } = useQuery({
    queryKey: ["ownership-ledger-admin", filter.aircraftId, filter.username],
    queryFn: () =>
      listFn({
        data: {
          token,
          ...(filter.aircraftId ? { aircraftId: filter.aircraftId } : {}),
          ...(filter.username ? { username: filter.username } : {}),
        },
      }),
    staleTime: 30_000,
  });

  const groups = useMemo(() => {
    const map = new Map<string, typeof rows extends undefined ? never : NonNullable<typeof rows>>();
    for (const r of rows ?? []) {
      const list = map.get(r.aircraftId) ?? [];
      list.push(r);
      map.set(r.aircraftId, list);
    }
    return Array.from(map.entries());
  }, [rows]);

  const [open, setOpen] = useState(false);

  return (
    <section className="panel rounded-xl p-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 text-left"
        aria-expanded={open}
      >
        {open ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-runway" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <h2 className="font-display text-sm font-semibold tracking-tight">
          Aircraft ownership ledger
        </h2>
        <span className="mono ml-auto text-[10px] uppercase tracking-widest text-muted-foreground">
          {groups.length} aircraft · {(rows ?? []).length} periods
        </span>
      </button>
      {!open ? null : (
      <>
      <p className="mt-3 text-xs text-muted-foreground">
        Immutable audit trail of every ownership transition. Each period attributes flights to the
        pilot who owned the tail at the time — history is preserved across sales, re-purchases and
        registration changes.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <input
          value={aircraftId}
          onChange={(e) => setAircraftId(e.target.value)}
          placeholder="Aircraft ID (optional)"
          className="mono rounded-lg bg-secondary/60 px-3 py-2 text-sm outline-none ring-1 ring-border focus:ring-runway/50"
        />
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Owner username (optional)"
          className="mono rounded-lg bg-secondary/60 px-3 py-2 text-sm outline-none ring-1 ring-border focus:ring-runway/50"
        />
        <button
          onClick={() => setFilter({ aircraftId: aircraftId.trim(), username: username.trim() })}
          className="mono rounded-lg bg-runway/15 px-4 py-2 text-xs uppercase tracking-widest text-runway ring-1 ring-runway/40"
        >
          {isFetching ? "Loading…" : "Query ledger"}
        </button>
      </div>

      <div className="mt-3 space-y-3">
        {groups.length === 0 ? (
          <div className="text-xs text-muted-foreground">
            No ownership periods recorded yet. Periods are written automatically as pilots sync.
          </div>
        ) : (
          groups.map(([aid, list]) => (
            <div key={aid} className="rounded-lg bg-secondary/30 p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="mono text-xs text-foreground">
                  {list[0]?.aircraftName || "Aircraft"}{" "}
                  <span className="text-muted-foreground">#{aid}</span>
                </span>
                <span className="mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  {list.length} period{list.length === 1 ? "" : "s"}
                </span>
              </div>
              <div className="mt-2 space-y-1">
                {list.map((p) => (
                  <div
                    key={p.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded bg-background/40 px-2 py-1.5"
                  >
                    <div className="mono min-w-0 text-[11px]">
                      <span className="text-runway">@{p.owner}</span>
                      {p.registration ? (
                        <span className="ml-2 text-muted-foreground">{p.registration}</span>
                      ) : null}
                    </div>
                    <div className="mono flex items-center gap-2 text-[10px] text-muted-foreground">
                      <span>
                        {fmtDate(p.startedAt)} → {p.endedAt ? fmtDate(p.endedAt) : "present"}
                      </span>
                      {p.startInferred ? (
                        <span className="rounded bg-instrument/10 px-1.5 py-0.5 text-instrument ring-1 ring-instrument/30">
                          inferred start
                        </span>
                      ) : null}
                      <span
                        className={cn(
                          "rounded px-1.5 py-0.5 ring-1",
                          p.endedAt
                            ? "bg-secondary text-muted-foreground ring-border"
                            : "bg-runway/10 text-runway ring-runway/30",
                        )}
                      >
                        {p.flights} flights
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
      </>
      )}
    </section>

  );
}
