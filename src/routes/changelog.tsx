import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, queryOptions, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getLatestChangelog, deleteChangelogEntry } from "@/lib/simfly.functions";
import { AppShell, PageHeader } from "@/components/app-shell";
import { History, ArrowLeft, Trash2 } from "lucide-react";
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

  // Inteligentne sprawdzanie sesji administratora z panelu Backfill Admin przy ładowaniu strony
  useEffect(() => {
    if (typeof window !== "undefined") {
      // Pobieramy token, który Twoja aplikacja zapisuje po kliknięciu "Unlock" w panelu admina
      const savedToken = localStorage.getItem("simfly_admin_token") || sessionStorage.getItem("simfly_admin_token") || "";
      if (savedToken) {
        setAdminToken(savedToken);
        setIsAuth(true);
      }
    }
  }, []);

  const { data: allUpdates = [] } = useQuery({
    queryKey: ["app-changelog-full"],
    queryFn: () => changelogFn(),
    staleTime: 5 * 60_000,
  });

  async function handleDelete(id: number) {
    if (!window.confirm("Are you sure you want to delete this update log permanently?")) return;

    try {
      await deleteFn({ data: { id, token: adminToken } });
      toast.success("Log entry deleted successfully");
      queryClient.invalidateQueries({ queryKey: ["app-changelog-full"] });
      queryClient.invalidateQueries({ queryKey: ["app-changelog"] });
    } catch (err) {
      toast.error("Failed to delete. Invalid token or server error.");
    }
  }

  if (typeof window === "undefined") {
    return (
      <AppShell>
        <PageHeader eyebrow="System History" title="App Changelog" description="Loading updates..." />
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
              <span className="mono text-[10px] text-runway bg-runway/10 border border-runway/20 px-2 py-1.5 rounded uppercase tracking-wider animate-pulse">
                Admin Mode Active
              </span>
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
                <div key={update.id || update.version} className="flex flex-col gap-2 border-b border-border/20 pb-5 last:border-0 last:pb-0">
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
                        onClick={() => handleDelete(Number(update.id))}
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
    </AppShell>
  );
}
