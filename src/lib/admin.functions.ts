import { createServerFn } from "@tanstack/react-start";
import { createHash, timingSafeEqual } from "node:crypto";
import type { BackfillStatusRow } from "./backfill.functions";

/**
 * Admin tooling for managing historical backfill jobs.
 *
 * Access control: every server fn requires an `adminToken` that is compared
 * (timing-safe) against the server-only ADMIN_TOKEN env var. The token is
 * entered once in the UI and persisted in localStorage on the admin's
 * browser — no auth provider, no user accounts.
 */

function checkToken(token: string | undefined): void {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) throw new Error("ADMIN_TOKEN is not configured on the server.");
  const a = createHash("sha256").update(String(token ?? ""), "utf8").digest();
  const b = createHash("sha256").update(expected, "utf8").digest();
  if (!timingSafeEqual(a, b)) throw new Error("Forbidden: invalid admin token.");
}

function sanitiseUsername(raw?: string | null): string {
  const v = (raw ?? "").trim();
  return /^[A-Za-z0-9_.-]{1,40}$/.test(v) ? v : "";
}

export const verifyAdminToken = createServerFn({ method: "POST" })
  .inputValidator((d: { token: string }) => d)
  .handler(async ({ data }) => {
    checkToken(data.token);
    return { ok: true as const };
  });

export const listBackfills = createServerFn({ method: "POST" })
  .inputValidator((d: { token: string }) => d)
  .handler(async ({ data }): Promise<BackfillStatusRow[]> => {
    checkToken(data.token);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("backfill_progress")
      .select("*")
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (rows ?? []) as unknown as BackfillStatusRow[];
  });

export type AdminAction = "retry" | "retry_current" | "reset" | "cancel" | "delete";

export const adminBackfillAction = createServerFn({ method: "POST" })
  .inputValidator(
    (d: {
      token: string;
      action: AdminAction;
      usernames: string[];
      deleteFlights?: boolean;
    }) => d,
  )
  .handler(async ({ data }) => {
    checkToken(data.token);
    const targets = Array.from(
      new Set(data.usernames.map(sanitiseUsername).filter(Boolean)),
    );
    if (targets.length === 0) return { ok: true as const, affected: 0 };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const nowIso = new Date().toISOString();

    if (data.action === "delete") {
      if (data.deleteFlights) {
        const { error: fErr } = await supabaseAdmin
          .from("simfly_flights")
          .delete()
          .in("username", targets);
        if (fErr) throw new Error(fErr.message);
      }
      const { error } = await supabaseAdmin
        .from("backfill_progress")
        .delete()
        .in("username", targets);
      if (error) throw new Error(error.message);
      return { ok: true as const, affected: targets.length };
    }

    // Build a per-username patch via upsert. We read existing rows first so we
    // can preserve fields like total_pages / flights_imported when retrying.
    const { data: existing, error: readErr } = await supabaseAdmin
      .from("backfill_progress")
      .select("*")
      .in("username", targets);
    if (readErr) throw new Error(readErr.message);

    const rows = (existing ?? []) as unknown as BackfillStatusRow[];
    const byName = new Map(rows.map((r) => [r.username, r]));

    const patches: BackfillStatusRow[] = targets.map((username) => {
      const cur =
        byName.get(username) ??
        ({
          username,
          status: "idle",
          total_pages: 0,
          current_page: 0,
          flights_imported: 0,
          flights_total_est: 0,
          error_message: null,
          started_at: null,
          last_page_at: null,
          updated_at: nowIso,
        } as BackfillStatusRow);

      if (data.action === "retry") {
        return {
          ...cur,
          status: "running",
          error_message: null,
          started_at: cur.started_at ?? nowIso,
          updated_at: nowIso,
        };
      }
      if (data.action === "reset") {
        return {
          ...cur,
          status: "idle",
          total_pages: 0,
          current_page: 0,
          flights_imported: 0,
          flights_total_est: 0,
          error_message: null,
          started_at: null,
          last_page_at: null,
          updated_at: nowIso,
        };
      }
      // cancel
      return {
        ...cur,
        status: "failed",
        error_message: "Cancelled by admin",
        updated_at: nowIso,
      };
    });

    const sanitised = patches.map((p) => {
      const { seconds_since_progress: _s, next_page: _n, ...rest } = p;
      void _s;
      void _n;
      return rest;
    });
    const { error: upErr } = await supabaseAdmin
      .from("backfill_progress")
      .upsert(sanitised, { onConflict: "username" });
    if (upErr) throw new Error(upErr.message);

    return { ok: true as const, affected: targets.length };
  });
