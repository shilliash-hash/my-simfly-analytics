import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, queryOptions, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getLatestChangelog, deleteChangelogEntry } from "@/lib/simfly.functions";
import { AppShell, PageHeader } from "@/components/app-shell";
import { History, ArrowLeft, Trash2, ShieldAlert, LogOut, KeyRound, X } from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/changelog")({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(
      queryOptions({ queryKey: ["app-changelog-full"], queryFn: () => getLatestChangelog(), staleTime: 30_000 }),
    ),
  component: ChangelogPage,
  head: () => ({
    meta: [
      { title: "Changelog & Updates — SimFly Hub" },
      { name: "description", content: "Complete history of system features, improvements, and bug fixes." },
    ],
  }),
});

function ChangelogPage() {
  const queryClient = useQueryClient();
  const changelogFn = useServerFn(getLatestChangelog);
  const deleteFn = useServerFn(deleteChangelogEntry);

  const [adminToken, setAdminToken] = useState("");
  const [isAuth, setIsAuth] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [modalInput, setModalInput] = useState("");
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    const savedToken = localStorage.getItem("simfly:adminToken") || "";
    if (savedToken) {
      setAdminToken(savedToken);
      setIsAuth(true);
    }
  }, []);

  const { data: allUpdates = [] } = useQuery({
    queryKey: ["app-changelog-full"],
    queryFn: () => changelogFn(),
    staleTime: 5 * 60_000,
  });

  function submitAdminLogin(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = modalInput.trim();
    if (trimmed) {
      localStorage.setItem("simfly:adminToken", trimmed);
      setAdminToken(trimmed);
      setIsAuth(true);
      setShowModal(false);
      setModalInput("");
      toast.success("Admin Mode Activated");
    }
  }

  function handleAdminLogout() {
    localStorage.removeItem("simfly:adminToken");
    setAdminToken("");
    setIsAuth(false);
    toast.info("Logged out from Admin Mode");
  }

    async function handleDelete(id: number) {
    try {
      await deleteFn({ data: { id, token: adminToken } });
      toast.success("Log entry deleted");
      queryClient.invalidateQueries({ queryKey: ["app-changelog-full"] });
      queryClient.invalidateQueries({ queryKey: ["app-changelog"] });
    } catch (err) {
      toast.error("Failed to delete");
    }
  }


  if (!isMounted) {
    return (
      <AppShell>
        <PageHeader eyebrow="History" title="App Changelog" description="Loading..." />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageHeader
        eyebrow="System History"
        title="App Changelog"
        description="Every feature, improvement, and fix deployed to the platform."
        actions={
          <div className="flex flex-wrap items-center gap-3">
            {isAuth && (
              <button
                type="button"
                onClick={handleAdminLogout}
                className="mono inline-flex items-center gap-2 rounded-md border border-rose-500/20 bg-rose-500/10 px-2.5 py-1.5 text-[10px] uppercase tracking-wider text-rose-400 transition hover:bg-rose-500/20 cursor-pointer"
              >
                <LogOut className="h-3 w-3" /> Admin Active (Sign Out)
              </button>
            )}
            <Link to="/" className="mono inline-flex items-center gap-2 rounded-md border border-border bg-secondary/40 px-3 py-1.5 text-[11px] uppercase tracking-widest text-foreground transition hover:bg-secondary">
              <ArrowLeft className="h-3.5 w-3.5" /> Back to Dashboard
            </Link>
          </div>
        }
      />
      <div className="panel max-w-3xl mx-auto rounded-xl p-6 border border-border/40 bg-background/20 mt-6">
        <div className="mb-6 flex items-center gap-2 border-b border-border/40 pb-4">
          <History className="h-5 w-5 text-runway" />
          <h2 className="font-display text-lg font-semibold">All Release Notes ({allUpdates.length})</h2>
        </div>

        {allUpdates.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">No update logs found in the database.</p>
        ) : (
          <div className="space-y-6">
            {allUpdates.map((update: any) => {
              const rawText = update.text || "";
              const hasFeature = /\[FEATURE\]/i.test(rawText);
              const hasFix = /\[FIX\]/i.test(rawText) && !hasFeature;
              const hasPerf = /\[PERF\]/i.test(rawText) && !hasFeature && !hasFix;

              const displayText = rawText
                .replace(/\[FIX\]/gi, "")
                .replace(/\[FEATURE\]/gi, "")
                .replace(/\[PERF\]/gi, "")
                .trim();

              return (
                <div key={update.id} className="flex flex-col gap-2 border-b border-border/20 pb-5 last:border-0 last:pb-0">
                  <div className="flex items-start justify-between">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="mono text-xs font-bold text-runway bg-runway/10 px-2 py-0.5 rounded border border-runway/25 uppercase tracking-wider">
                        {update.version}
                      </span>
                      <span className="text-[10px] text-muted-foreground/60 mono uppercase tracking-widest">
                        {update.created_at ? new Date(update.created_at).toLocaleDateString() : "Stable Release"}
                      </span>
                      {hasFix && <span className="mono rounded bg-rose-500/10 border border-rose-500/25 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-rose-400 shrink-0">Fix</span>}
                      {hasFeature && <span className="mono rounded bg-emerald-500/10 border border-emerald-500/25 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-400 shrink-0">Feature</span>}
                      {hasPerf && <span className="mono rounded bg-purple-500/10 border border-purple-500/25 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-purple-400 shrink-0">Perf</span>}
                    </div>

                    {isAuth && (
                      <button
                        type="button"
                        onClick={() => handleDelete(update.id)}
                        className="text-muted-foreground hover:text-destructive transition p-1 rounded hover:bg-destructive/10 cursor-pointer"
                        title="Delete Entry"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap pl-1 mt-1">
                    {displayText}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {!isAuth && (
        <div className="mt-8 flex justify-center">
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); setShowModal(true); }}
            className="mono inline-flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-muted-foreground/40 hover:text-runway transition cursor-pointer py-2 px-4"
          >
            <ShieldAlert className="h-3 w-3" /> System Operator Login
          </button>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <form 
            onSubmit={submitAdminLogin} 
            className="panel w-full max-w-sm rounded-xl p-5 border border-border bg-popover shadow-2xl animate-in fade-in zoom-in-95 duration-150"
          >
            <div className="flex items-center justify-between border-b border-border/40 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-runway" />
                <span className="mono text-xs uppercase tracking-widest text-runway font-semibold">Operator Authentication</span>
              </div>
              <button 
                type="button" 
                onClick={() => { setShowModal(false); setModalInput(""); }} 
                className="text-muted-foreground hover:text-foreground transition p-0.5 rounded cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            
            <p className="text-[11px] text-muted-foreground mb-3 leading-relaxed">
              Provide your environment security token to unlock entry eviction and infrastructure commands.
            </p>
            
            <input
              autoFocus
              type="password"
              placeholder="Paste secret ADMIN_TOKEN..."
              className="mono w-full rounded-md border border-border bg-background px-3 py-2 text-xs outline-none focus:border-runway text-foreground placeholder:text-muted-foreground/40 mb-4"
              value={modalInput}
              onChange={(e) => setModalInput(e.target.value)}
            />
            
            <div className="flex items-center justify-end gap-2 text-xs">
              <button 
                type="button" 
                onClick={() => { setShowModal(false); setModalInput(""); }} 
                className="mono rounded px-3 py-1.5 text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground transition cursor-pointer"
              >
                Cancel
              </button>
              <button 
                type="submit" 
                className="mono rounded bg-runway/20 border border-runway/30 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-runway transition hover:bg-runway/35 cursor-pointer"
              >
                Confirm Unlock
              </button>
            </div>
          </form>
        </div>
      )}
    </AppShell>
  );
}
// Zabezpieczenie przed brakującą referencją z głównego pliku dashboardu
if (typeof window !== "undefined") {
  (window as any).setViewedUser = (window as any).setViewedUser || (() => {});
}
