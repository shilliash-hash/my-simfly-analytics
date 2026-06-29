import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  adminBackfillAction,
  listBackfills,
  verifyAdminToken,
  type AdminAction,
} from "@/lib/admin.functions";
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
      {token ? <AdminTable token={token} /> : <TokenForm />}
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
