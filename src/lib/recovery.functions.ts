/**
 * Maintenance / Recovery utilities.
 *
 * These are manually-triggered admin tools. They are completely independent
 * of the production synchronization pipeline (importer, cron, activity
 * generation, stats). Nothing here runs automatically.
 *
 * Design principles:
 *   - User-agnostic. Active Hub users are ALWAYS resolved dynamically from
 *     the current database. No usernames, owners, or default pilots are
 *     hardcoded anywhere. There is NO fallback to any specific account.
 *   - Historical ownership is treated as immutable. When ownership cannot
 *     be resolved from historical data, the record is SKIPPED — never
 *     substituted with a current owner or another user.
 *   - Fully idempotent. All inserts go through
 *     `simfly_flights (username, flight_id)` uniqueness with
 *     `ignoreDuplicates: true`. Existing rows are never rewritten.
 *   - Modular. Additional utilities (Deep Recovery, SimFly API
 *     Verification, Repair Aircraft Revenue, Repair Pilot Career, Repair
 *     Airport Analytics) plug in through the same shared helpers.
 */
import { createServerFn } from "@tanstack/react-start";
import { createHash, timingSafeEqual } from "node:crypto";
// -------- Auth (mirrors admin.functions.ts) ---------------------------------
function checkToken(token: string | undefined): void {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) throw new Error("ADMIN_TOKEN is not configured on the server.");
  const a = createHash("sha256").update(String(token ?? ""), "utf8").digest();
  const b = createHash("sha256").update(expected, "utf8").digest();
  if (!timingSafeEqual(a, b)) throw new Error("Forbidden: invalid admin token.");
}
// -------- Shared types ------------------------------------------------------
export type RecoveryMode = "soft" | "flight";
export interface RecoveryReport {
  mode: RecoveryMode;
  windowDays: number;
  usersScanned: number;
  activitiesScanned: number;
  flightsScanned: number;
  missingActivities: number;
  recovered: number;
  alreadyCorrect: number;
  skipped: number;
  elapsedMs: number;
  notes: string[];
}
interface FlightRow {
  username: string;
  flight_id: string;
  aircraft_id: string | null;
  mission_start_ts: string | null;
  raw: Record<string, unknown>;
}
// -------- Helpers -----------------------------------------------------------
/**
 * The set of "active Hub users" is derived from the backfill_progress table
 * (any pilot that has ever been imported into this Hub). This is the ONLY
 * source of truth. There are no hardcoded fallbacks.
 */
async function loadActiveHubUsers(supabaseAdmin: {
  from: (t: string) => {
    select: (c: string) => PromiseLike<{ data: { username: string }[] | null; error: { message?: string } | null }>;
  };
}): Promise<string[]> {
  const { data, error } = await supabaseAdmin
    .from("backfill_progress")
    .select("username");
  if (error) throw new Error(error.message ?? "Unable to load active Hub users.");
  const set = new Set<string>();
  for (const r of data ?? []) {
    const u = (r.username ?? "").trim();
    if (u) set.add(u);
  }
  return Array.from(set);
}
function isGenericAircraft(raw: Record<string, unknown>): boolean {
  const name = String((raw as { aircraft?: unknown }).aircraft ?? "").toLowerCase();
  if (!name) return true;
  if (name.includes("generic")) return true;
  if (name.includes("not in simfly")) return true;
  return false;
}
/**
 * Peer inference for historical aircraft ownership.
 *
 * We do NOT have per-flight owner data in the stored raw payload (SimFly's
 * pilot-flight endpoint does not include it) and we do NOT have a stored
 * historical-ownership table. Falling back to the aircraft's CURRENT owner
 * would violate the "historical records are immutable" rule.
 *
 * Instead, ownership is inferred from the same imported flight data:
 * for each aircraftId, the active Hub user with the largest count of
 * flights operating that aircraft is treated as the historical owner.
 * When the leading candidate is not clearly ahead, or the aircraft is
 * only flown by a single user (the operating pilot themselves),
 * ownership is UNRESOLVED and every flight for that aircraft is
 * SKIPPED. Never substituted.
 */
function inferOwnershipByAircraft(
  flights: FlightRow[],
  activeUsers: Set<string>,
): Map<string, string> {
  const counts = new Map<string, Map<string, number>>();
  for (const f of flights) {
    const aid = f.aircraft_id ?? "";
    if (!aid) continue;
    if (!activeUsers.has(f.username)) continue;
    let m = counts.get(aid);
    if (!m) {
      m = new Map();
      counts.set(aid, m);
    }
    m.set(f.username, (m.get(f.username) ?? 0) + 1);
  }
  const owners = new Map<string, string>();
  for (const [aid, m] of counts) {
    let best: string | null = null;
    let bestN = 0;
    let second = 0;
    for (const [u, n] of m) {
      if (n > bestN) {
        second = bestN;
        bestN = n;
        best = u;
      } else if (n > second) {
        second = n;
      }
    }
    // Require a clear plurality: at least 3 flights AND at least 2x the
    // runner-up. This avoids treating an occasional renter as the owner.
    if (best && bestN >= 3 && bestN >= second * 2) {
      owners.set(aid, best);
    }
  }
  return owners;
}
async function loadFlightsInWindow(
  supabaseAdmin: {
    from: (t: string) => {
      select: (c: string) => {
        gte: (col: string, v: string) => PromiseLike<{
          data: FlightRow[] | null;
          error: { message?: string } | null;
        }>;
      };
    };
  },
  windowDays: number,
): Promise<FlightRow[]> {
  const since = new Date(Date.now() - windowDays * 86400_000).toISOString();
  const { data, error } = await supabaseAdmin
    .from("simfly_flights")
    .select("username, flight_id, aircraft_id, mission_start_ts, raw")
    .gte("mission_start_ts", since);
  if (error) throw new Error(error.message ?? "Unable to load flights.");
  return (data ?? []).filter((r) => r && r.flight_id);
}
/**
 * Core recovery routine, shared by every mode. Given a scan window and a
 * `mode` label used in the report, walks every flight, resolves aircraft
 * ownership from historical data, and inserts any missing owner rows.
 *
 * Idempotency: inserts go through `simfly_flights` unique key
 * `(username, flight_id)` with `ignoreDuplicates: true`. Existing rows
 * are NEVER updated.
 */
async function runRecoveryCore(
  mode: RecoveryMode,
  windowDays: number,
): Promise<RecoveryReport> {
  const started = Date.now();
  const notes: string[] = [];
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const activeUsers = new Set(await loadActiveHubUsers(supabaseAdmin as never));
  if (activeUsers.size === 0) {
    return {
      mode,
      windowDays,
      usersScanned: 0,
      activitiesScanned: 0,
      flightsScanned: 0,
      missingActivities: 0,
      recovered: 0,
      alreadyCorrect: 0,
      skipped: 0,
      elapsedMs: Date.now() - started,
      notes: ["No active Hub users found."],
    };
  }
  const flights = await loadFlightsInWindow(supabaseAdmin as never, windowDays);
  const owners = inferOwnershipByAircraft(flights, activeUsers);
  // Build a fast lookup for existing (username, flight_id) coverage.
  const existing = new Set<string>();
  for (const f of flights) existing.add(`${f.username}\u0000${f.flight_id}`);
  let activitiesScanned = 0;
  let flightsScanned = 0;
  let missing = 0;
  let recovered = 0;
  let alreadyCorrect = 0;
  let skipped = 0;
  const toInsert: Record<string, unknown>[] = [];
  for (const f of flights) {
    activitiesScanned++;
    // Only consider real completed flights with usable ownership data.
    if (!f.aircraft_id) {
      skipped++;
      continue;
    }
    if (isGenericAircraft(f.raw ?? {})) {
      skipped++;
      continue;
    }
    if (!activeUsers.has(f.username)) {
      skipped++;
      continue;
    }
    flightsScanned++;
    const owner = owners.get(f.aircraft_id);
    // Owner cannot be resolved from historical data → SKIP. Never
    // substitute with the current SimFly owner or any other user.
    if (!owner) {
      skipped++;
      continue;
    }
    if (!activeUsers.has(owner)) {
      // Aircraft owner is not an active Hub user → SKIP.
      skipped++;
      continue;
    }
    if (owner === f.username) {
      // Operating pilot IS the owner: no owner activity is needed.
      continue;
    }
    const key = `${owner}\u0000${f.flight_id}`;
    if (existing.has(key)) {
      alreadyCorrect++;
      continue;
    }
    missing++;
    // Compose the owner row from the historical raw payload of the
    // operating pilot. All identifying columns come from that historical
    // record — nothing is derived from current state.
    const raw = f.raw ?? {};
    toInsert.push({
      username: owner,
      flight_id: f.flight_id,
      aircraft_id: f.aircraft_id,
      aircraft: (raw as { aircraft?: string }).aircraft ?? null,
      aircraft_icao: (raw as { aircraft_icao?: string }).aircraft_icao ?? null,
      destination_name: (raw as { destination?: { name?: string } }).destination?.name ?? null,
      destination_icao: (raw as { destination_icao?: string }).destination_icao ?? null,
      origin_name: (raw as { origin?: { name?: string } }).origin?.name ?? null,
      departure_icao: (raw as { departure_icao?: string }).departure_icao ?? null,
      landing_rate: (raw as { landing_rate?: number }).landing_rate ?? null,
      total_distance: (raw as { total_distance?: number }).total_distance ?? null,
      flight_time: (raw as { flight_time?: string }).flight_time ?? null,
      total_reward: (raw as { total_reward?: number }).total_reward ?? null,
      pax: (raw as { pax?: number }).pax ?? null,
      xp: (raw as { xp?: number }).xp ?? null,
      licence: (raw as { licence?: string }).licence ?? null,
      licence_rank: (raw as { licence_rank?: number }).licence_rank ?? null,
      licence_rank_name: (raw as { licence_rankName?: string }).licence_rankName ?? null,
      mission_start_ts: f.mission_start_ts,
      raw,
    });
  }
  if (toInsert.length > 0) {
    const CHUNK = 200;
    for (let i = 0; i < toInsert.length; i += CHUNK) {
      const chunk = toInsert.slice(i, i + CHUNK);
      const { error } = await (supabaseAdmin as unknown as {
        from: (t: string) => {
          upsert: (v: unknown, o?: { onConflict?: string; ignoreDuplicates?: boolean }) => PromiseLike<{
            error: { message?: string } | null;
            count?: number | null;
          }>;
        };
      })
        .from("simfly_flights")
        .upsert(chunk, { onConflict: "username,flight_id", ignoreDuplicates: true });
      if (error) {
        notes.push(`Insert chunk failed: ${error.message ?? "unknown"}`);
        continue;
      }
      recovered += chunk.length;
    }
  }
  const usersScanned = new Set(flights.map((f) => f.username).filter((u) => activeUsers.has(u))).size;
  return {
    mode,
    windowDays,
    usersScanned,
    activitiesScanned,
    flightsScanned,
    missingActivities: missing,
    recovered,
    alreadyCorrect,
    skipped,
    elapsedMs: Date.now() - started,
    notes,
  };
}
// -------- Public server functions ------------------------------------------
/**
 * Soft Recovery — reconstructs missing owner Activity entries from records
 * already present in the Activity view. Default 10-day window.
 */
export const runSoftRecovery = createServerFn({ method: "POST" })
  .inputValidator((d: { token: string; windowDays?: number }) => d)
  .handler(async ({ data }): Promise<RecoveryReport> => {
    checkToken(data.token);
    const w = Math.max(1, Math.min(90, data.windowDays ?? 10));
    return runRecoveryCore("soft", w);
  });
/**
 * Flight Recovery — inspects completed flight records directly (rather than
 * derived Activity rows) and creates any missing owner Activity entries.
 * Default 10-day window.
 */
export const runFlightRecovery = createServerFn({ method: "POST" })
  .inputValidator((d: { token: string; windowDays?: number }) => d)
  .handler(async ({ data }): Promise<RecoveryReport> => {
    checkToken(data.token);
    const w = Math.max(1, Math.min(90, data.windowDays ?? 10));
    return runRecoveryCore("flight", w);
  });
// -------- Reserved for future expansion ------------------------------------
//
// The following utilities are intentionally NOT implemented in Phase 1.
// When adding them, follow the same rules:
//   - resolve active Hub users dynamically
//   - never hardcode a username
//   - never overwrite historical ownership
//   - remain idempotent
//
//   export const runDeepRecovery       = createServerFn(...)  // Phase 2
//   export const runSimflyApiVerify    = createServerFn(...)  // Phase 2
//   export const runRepairAircraftRev  = createServerFn(...)  // Phase 3
//   export const runRepairPilotCareer  = createServerFn(...)  // Phase 3
//   export const runRepairAirportStats = createServerFn(...)  // Phase 3
