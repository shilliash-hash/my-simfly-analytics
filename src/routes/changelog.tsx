import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getLatestChangelog } from "@/lib/simfly.functions";
import { AppShell, PageHeader } from "@/components/app-shell";
import { History, ArrowLeft } from "lucide-react";

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
  const changelogFn = useServerFn(getLatestChangelog);
  const { data: allUpdates = [] } = useQuery({
    queryKey: ["app-changelog-full"],
    queryFn: () => changelogFn(),
    staleTime: 5 * 60_000,
  });

  return (
    <AppShell>
      <PageHeader
        eyebrow="System History"
        title="App Changelog"
        description="Every feature, improvement, and fix deployed to the platform."
        actions={
          <Link to="/" className="mono inline-flex items-center gap-2 rounded-md border border-border bg-secondary/40 px-3 py-1.5 text-[11px] uppercase tracking-widest text-foreground transition hover:bg-secondary">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Dashboard
          </Link>
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
            {allUpdates.map((update: any, index: number) => (
              <div key={index} className="flex flex-col gap-2 border-b border-border/20 pb-5 last:border-0 last:pb-0">
                <div className="flex items-center justify-between">
                  <span className="mono text-xs font-bold text-runway bg-runway/10 px-2 py-0.5 rounded border border-runway/25 uppercase tracking-wider">
                    {update.version}
                  </span>
                  <span className="text-[10px] text-muted-foreground/60 mono uppercase tracking-widest">
                    {update.created_at ? new Date(update.created_at).toLocaleDateString() : "Stable Release"}
                  </span>
                </div>
                <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap pl-1 mt-1">
                  {update.text}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
