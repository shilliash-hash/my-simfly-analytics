import { createServerFn } from "@tanstack/react-start";

export type CatchUpStatus = {
  username: string;
  running: boolean;
  lastSyncedAt: string | null;
  lastImported: number;
  lastError: string | null;
};

/**
 * Session catch-up trigger. Non-blocking by design: it resolves the caller's
 * identity, kicks the catch-up, and returns a status summary. The catch-up
 * itself is idempotent and rate-limited server-side, so calling this on every
 * Hub load is cheap.
 */
export const triggerSessionCatchUp = createServerFn({ method: "POST" })
  .inputValidator((input: { username?: string; force?: boolean } | undefined) => input ?? {})
  .handler(async ({ data }): Promise<CatchUpStatus> => {
    const { getSessionIdentity } = await import("./identity.server");
    const { runSessionCatchUp } = await import("./simfly-sync.server");

    const { username, nonce } = await getSessionIdentity(
      data.username ? { username: data.username } : undefined,
    );

    const result = await runSessionCatchUp(username, nonce, {
      ...(data.force ? { force: true } : {}),
    });

    return {
      username,
      running: false,
      lastSyncedAt: new Date().toISOString(),
      lastImported: result.imported,
      lastError: result.ran ? (result.reason ?? null) : null,
    };
  });

/** Cheap read of the pilot's last catch-up state (no SimFly calls). */
export const getCatchUpStatus = createServerFn({ method: "GET" })
  .inputValidator((input: { username?: string } | undefined) => input ?? {})
  .handler(async ({ data }): Promise<CatchUpStatus> => {
    const { getSessionIdentity } = await import("./identity.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { username } = await getSessionIdentity(
      data.username ? { username: data.username } : undefined,
    );

    const { data: row } = await supabaseAdmin
      .from("pilot_sync_state")
      .select("last_synced_at, last_imported_count, last_error")
      .eq("username", username)
      .maybeSingle();

    const r = row as
      | { last_synced_at: string | null; last_imported_count: number | null; last_error: string | null }
      | null;

    return {
      username,
      running: false,
      lastSyncedAt: r?.last_synced_at ?? null,
      lastImported: r?.last_imported_count ?? 0,
      lastError: r?.last_error ?? null,
    };
  });
