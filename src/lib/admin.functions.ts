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
      if (data.action === "retry_current") {
        // Resume at the exact page being attempted when the job stalled.
        // current_page = last completed page, so the importer naturally
        // picks up at current_page + 1 on the next tick. We bump
        // last_page_at to give the stall detector a fresh window so the
        // row doesn't immediately flip back to "stalled".
        return {
          ...cur,
          status: "running",
          error_message: null,
          started_at: cur.started_at ?? nowIso,
          last_page_at: nowIso,
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


// ---------------------------------------------------------------------------
// Aircraft ownership ledger (audit trail) — read-only admin view.
// ---------------------------------------------------------------------------

export type OwnershipPeriodRow = {
  id: string;
  aircraftId: string;
  owner: string;
  registration: string | null;
  aircraftName: string | null;
  startedAt: string;
  endedAt: string | null;
  startInferred: boolean;
  flights: number;
};

export const listOwnershipPeriods = createServerFn({ method: "POST" })
  .inputValidator((d: { token: string; aircraftId?: string; username?: string }) => d)
  .handler(async ({ data }): Promise<OwnershipPeriodRow[]> => {
    checkToken(data.token);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let q = supabaseAdmin
      .from("aircraft_ownership_period")
      .select("id, aircraft_id, owner_username, started_at, ended_at, start_inferred")
      .order("aircraft_id", { ascending: true })
      .order("started_at", { ascending: true })
      .limit(500);
    const aid = (data.aircraftId ?? "").trim();
    const user = sanitiseUsername(data.username);
    if (aid) q = q.eq("aircraft_id", aid);
    if (user) q = q.eq("owner_username", user.toLowerCase());

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const periods = rows ?? [];
    if (periods.length === 0) return [];

    const aircraftIds = Array.from(new Set(periods.map((p) => p.aircraft_id as string)));
    const { data: flights } = await supabaseAdmin
      .from("simfly_flights")
      .select("flight_id, aircraft_id, aircraft, aircraft_tail_number, mission_start_ts")
      .in("aircraft_id", aircraftIds)
      .order("mission_start_ts", { ascending: true });

    const byAircraft = new Map<string, { ts: number; tail: string | null; name: string | null; id: string }[]>();
    for (const f of flights ?? []) {
      const key = f.aircraft_id as string;
      const ts = f.mission_start_ts ? Date.parse(f.mission_start_ts) : NaN;
      if (!key || !Number.isFinite(ts)) continue;
      const list = byAircraft.get(key) ?? [];
      list.push({
        ts,
        tail: (f.aircraft_tail_number as string | null) ?? null,
        name: (f.aircraft as string | null) ?? null,
        id: f.flight_id as string,
      });
      byAircraft.set(key, list);
    }

    return periods.map((p) => {
      const list = byAircraft.get(p.aircraft_id as string) ?? [];
      const fromMs = Date.parse(p.started_at as string);
      const toMs = p.ended_at ? Date.parse(p.ended_at as string) : null;
      const seen = new Set<string>();
      let last: { tail: string | null; name: string | null } | null = null;
      for (const f of list) {
        if (f.ts < fromMs) continue;
        if (toMs !== null && f.ts >= toMs) continue;
        seen.add(f.id);
        last = { tail: f.tail, name: f.name };
      }
      return {
        id: p.id as string,
        aircraftId: p.aircraft_id as string,
        owner: p.owner_username as string,
        registration: last?.tail ?? null,
        aircraftName: last?.name ?? null,
        startedAt: p.started_at as string,
        endedAt: (p.ended_at as string | null) ?? null,
        startInferred: !!p.start_inferred,
        flights: seen.size,
      };
    });
  });
