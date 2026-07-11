import { useMemo, useState, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { addChangelogEntry, getChangelogEntries, deleteChangelogEntry } from "@/lib/simfly.functions";
import {
  adminBackfillAction,
  listBackfills,
  verifyAdminToken,
  type AdminAction,
} from "@/lib/admin.functions";
import {
  getHubSupportAdmin,
  setHubSupportSettings,
  adminGrantHubSupport,
  adminRevokeHubSupport,
} from "@/lib/hub-support.functions";
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
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

       // LOGIKA OBECNOŚCI: Pobieramy klienta bezpośrednio z globalnego okna przeglądarki
  useEffect(() => {
    // Bezpiecznie sprawdzamy, czy okno oraz globalna instancja Supabase są załadowane w przeglądarce
    const globalSupabase = typeof window !== "undefined" ? (window as any).supabase : null;
    if (!globalSupabase) return;

    // Pobieramy tożsamość zalogowanego użytkownika
    const savedUser = localStorage.getItem("simfly_user_handle") || localStorage.getItem("user");
    const finalUserId = savedUser 
      ? savedUser.replace(/"/g, "").trim() 
      : `Pilot_${Math.floor(1000 + Math.random() * 9000)}`;

    // Otwieramy kanał WebSocket korzystając z odnalezionej globalnie instancji
    const channel = globalSupabase.channel("hub-online-pilots", {
      config: { presence: { key: finalUserId } },
    });

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        const allPresentUsers: string[] = [];
        
        Object.entries(state).forEach(([key, presences]: [string, any]) => {
          presences.forEach(() => { 
            if (!allPresentUsers.includes(key)) {
              allPresentUsers.push(key); 
            }
          });
        });
        
        (window as any)._hubOnlinePilots = allPresentUsers;
      })
      .subscribe(async (status: string) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ onlineAt: new Date().toISOString() });
        }
      });

    return () => {
      channel.unsubscribe();
    };
  }, []);
  
  return (
    <AppShell>
      <PageHeader
        eyebrow="Operations"
        title="Backfill Admin"
        description="Manage historical logbook import jobs — retry stuck pilots, reset progress, cancel runaway imports, and remove failed records."
      />
      {mounted && token ? (
      <div className="space-y-8">
        {/* WIDŻET ONLINE NA SAMEJ GÓRZE PANELU ADMINA */}
        <AdminOnlineUsersWidget />

        <AdminTable token={token} />
        <HubSupportAdmin token={token} />
        <AdminChangelog adminToken={token} />
      </div>
    ) : (

        <TokenForm />
      )}
    </AppShell>
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
import { Trash2, RefreshCw, AlertCircle } from "lucide-react";

// Nowy, całkowicie bezpieczny komponent podglądu changelogu z pliku static
import { staticChangelogFeed } from "@/lib/changelog-data";
import { Terminal, FileCode, PlusCircle } from "lucide-react";

export function AdminChangelog() {
  return (
    <div className="rounded-xl border border-border/50 bg-card p-6 shadow-sm">
      <div className="flex items-center justify-between border-b border-border/20 pb-4">
        <div className="flex items-center gap-2">
          <Terminal className="h-5 w-5 text-runway" />
          <h2 className="text-lg font-semibold tracking-tight">System Changelog Manager</h2>
        </div>
        <span className="mono text-[10px] font-bold bg-runway/15 text-runway border border-runway/30 px-2 py-0.5 rounded-full uppercase">
          Static Mode Active
        </span>
      </div>

      <div className="grid grid-cols-1 gap-6 pt-6 lg:grid-cols-5">
        {/* LEWA STRONA: PANCERNA INSTRUKCJA SZYBKIEJ EDYCJI */}
        <div className="space-y-4 lg:col-span-2 border-r border-border/20 pr-4">
          <div className="rounded-lg border border-border/40 bg-secondary/5 p-4 space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold text-foreground">
              <FileCode className="h-4 w-4 text-muted-foreground" />
              <span>How to add a new update?</span>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Database connection for updates has been disabled to ensure 100% platform stability. To add, edit, or remove entries from the landing page, modify the central data file directly on GitHub.
            </p>
            <div className="mono text-[10px] bg-secondary/30 border border-border/50 rounded p-2 text-muted-foreground select-all truncate">
              src/lib/changelog-data.ts
            </div>
             <button 
              type="button"
              onClick={() => {
                navigator.clipboard.writeText("src/lib/changelog-data.ts");
                alert("File path copied to clipboard! Open this file in your editor to update changelog.");
              }}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-runway px-3 py-1.5 text-xs font-medium text-white shadow hover:bg-runway/90 transition cursor-pointer"
            >
              <PlusCircle className="h-3.5 w-3.5" />
              Copy File Path
            </button>
          </div>
        </div>

        {/* PRAWA STRONA: AKTUALNY PODGLĄD LIVE Z PLIKU DATA */}
        <div className="space-y-3 lg:col-span-3">
          <span className="text-xs font-bold text-muted-foreground block mb-1">Current Active Feed (Live Preview):</span>
          <div className="space-y-2 max-h-[340px] overflow-y-auto pr-2">
            {staticChangelogFeed && staticChangelogFeed.length > 0 ? (
              staticChangelogFeed.map((entry) => {
                const tagColor = 
                  entry.type === "FIX" ? "text-destructive bg-destructive/15 border-destructive/30" : 
                  entry.type === "UPGRADE" ? "text-instrument bg-instrument/15 border-instrument/30" : 
                  "text-runway bg-runway/15 border-runway/30";

                return (
                  <div
                    key={entry.id}
                    className="flex items-center justify-between p-3 rounded-md border border-border/30 bg-secondary/10 hover:border-border/50 transition"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="mono text-[10px] font-bold bg-runway/10 text-runway px-1.5 py-0.5 rounded border border-runway/20 shrink-0">
                        {entry.version}
                      </span>
                      <span className={`mono text-[9px] font-bold px-1.5 py-0.5 rounded border shrink-0 ${tagColor}`}>
                        {entry.type}
                      </span>
                      <p className="text-xs text-foreground truncate">{entry.text}</p>
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="text-xs text-muted-foreground italic text-center p-4">No active changelog items found in static config.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function AdminOnlineUsersWidget() {
  const [onlinePilots, setOnlinePilots] = useState<string[]>([]);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    if (typeof window === "undefined") return;

    // Pobieramy sygnały z RAMu przeglądarki od razu po wejściu na stronę
    const initialList = (window as any)._hubOnlinePilots || [];
    setOnlinePilots(initialList);

    // Następnie co 2 sekundy automatycznie odświeżamy listę na żywo
    const interval = setInterval(() => {
      const liveList = (window as any)._hubOnlinePilots || [];
      // Aktualizujemy stan Reacta tylko wtedy, gdy zmieniła się liczba osób, aby nie zapętlić przeglądarki
      setOnlinePilots((prev) => {
        if (JSON.stringify(prev) !== JSON.stringify(liveList)) {
          return liveList;
        }
        return prev;
      });
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  // Dopóki serwer Cloudflare buduje stronę (SSR), rysujemy lekki szkielet bezpieczeństwa
  if (!isMounted) {
    return (
      <div className="panel rounded-xl p-4 border border-border/40 bg-background/30 shadow-[0_4px_20px_rgba(0,0,0,0.2)]">
        <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-muted animate-pulse"></span>
          Syncing Presence radar...
        </div>
      </div>
    );
  }

  // Gdy jesteśmy bezpiecznie w przeglądarce, rysujemy pełny, żywy widżet
  return (
    <div className="panel rounded-xl p-4 border border-border/40 bg-background/30 shadow-[0_4px_20px_rgba(0,0,0,0.2)]">
      <div className="flex items-center justify-between border-b border-border/20 pb-2.5">
        <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground flex items-center gap-2">
          {/* Aktywna, pulsująca dioda sieciowa */}
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-runway opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-runway"></span>
          </span>
          Live Presence · Hub Network
        </div>
        <span className="mono text-[11px] font-bold text-runway px-2 py-0.5 rounded bg-runway/10 border border-runway/20">
          {onlinePilots.length} Online
        </span>
      </div>

      <div className="mt-3">
        <div className="text-xs font-medium text-muted-foreground mb-2">Pilots currently browsing:</div>
        {onlinePilots.length === 0 ? (
          <p className="text-[11px] text-muted-foreground italic text-muted-foreground/60">Gathering network signals...</p>
        ) : (
          <ul className="flex flex-wrap gap-1.5 max-h-[150px] overflow-y-auto pr-1 vertical-scroll">
            {onlinePilots.map((username) => (
              <li 
                key={username} 
                className="mono text-[10px] font-semibold bg-secondary/60 text-foreground border border-border/40 px-2 py-0.5 rounded-md flex items-center gap-1 hover:border-runway/30 transition-colors"
              >
                <span className="text-runway">@</span>{username}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// router-force-reload: v3 //
