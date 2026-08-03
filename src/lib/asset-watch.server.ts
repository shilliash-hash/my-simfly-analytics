// Server-only ASSET ACTIVITY WATCH — session scoped.
//
// Purpose: answer the cheap question "did anything happen to THIS Hub user's
// airports or aircraft since their last visit?".
//
// Why it exists: a pilot's own logbook only shows flights they flew. A pilot
// who never uses the Hub can still fly INTO or OUT OF a Hub user's airport, or
// fly a Hub user's tail. Those movements are only visible through the
// asset-scoped SimFly feeds, so we watch those feeds when the owner opens the
// Hub.
//
// It never writes flight rows. It only:
//   1. detects new activity on the owner's assets (paged fetch + watermark),
//   2. reports which pilots were involved so their logbooks can be ingested.
//
// Filename ends in `.server.ts` so it can never reach the client bundle.

const SIMFLY_BASE = "https://simfly.io/api";
const FETCH_TIMEOUT_MS = 10_000;

/** Max assets probed in one catch-up. */
const MAX_ASSETS = 40;
/** Concurrent asset probes. */
const PROBE_CONCURRENCY = 5;
/** Max feed pages walked per asset before giving up on reaching the watermark. */
const MAX_PAGES_PER_ASSET = 5;

async function fetchJSON<T>(url: string): Promise<T | null> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" }, signal: controller.signal });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

type AssetItem = {
  type?: string;
  icao?: string;
  aircraftId?: string | number;
};
type AssetsAll = { items?: AssetItem[] };

type FeedFlight = {
  flightID?: string;
  id?: string;
  landingTime?: string;
  takeoffTime?: string;
  departureTime?: string;
  pilot?: { username?: string };
  airplane?: { owner?: { username?: string } };
  origin?: { icao?: string };
  destination?: { icao?: string };
};
type FeedPage = { flights?: FeedFlight[] };

type WatchRow = {
  owner_username: string;
  asset_kind: string;
  asset_key: string;
  last_flight_id: string | null;
};

type AssetRef = { kind: "airport" | "aircraft"; key: string };

export type ProbeResult = {
  owner: string;
  assetsProbed: number;
  assetsChanged: number;
  /** Every pilot seen on a changed asset, above the previous watermark. */
  activePilots: string[];
  durationMs: number;
};

function flightId(f: FeedFlight): string | null {
  return f.flightID ?? f.id ?? null;
}

function flightTime(f: FeedFlight): string | null {
  return f.landingTime ?? f.takeoffTime ?? f.departureTime ?? null;
}

function pilotOf(f: FeedFlight): string | null {
  return f.pilot?.username ?? f.airplane?.owner?.username ?? null;
}

function feedUrl(owner: string, nonce: string, asset: AssetRef, page: number): string {
  if (asset.kind === "airport") {
    return `${SIMFLY_BASE}/user/assets/airport/${encodeURIComponent(asset.key)}/flights?username=${encodeURIComponent(owner)}&nonce=${encodeURIComponent(nonce)}&page=${page}`;
  }
  return `${SIMFLY_BASE}/user/assets/airplane/${encodeURIComponent(asset.key)}/flights?page=${page}`;
}

/**
 * Probe one owner's airports and aircraft and diff against the stored
 * watermark. Airport feeds cover BOTH arrivals and departures, so a movement
 * to or from an owned airport is caught regardless of direction.
 *
 * Pages are walked back until the previous watermark is reached (capped), so a
 * user returning after a long absence still gets every pilot who touched their
 * assets — not just the newest page.
 *
 * First sight of an asset only seeds the watermark; it never reports a change,
 * so enabling the watch does not stampede.
 */
export async function probeOwnerAssets(
  owner: string,
  nonce: string,
  opts?: { assets?: unknown; budgetMs?: number; maxAssets?: number },
): Promise<ProbeResult> {
  const started = Date.now();
  const budgetMs = opts?.budgetMs ?? 20_000;
  const maxAssets = Math.max(1, Math.min(120, opts?.maxAssets ?? MAX_ASSETS));

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const assets =
    opts?.assets !== undefined
      ? (opts.assets as AssetsAll | null)
      : await fetchJSON<AssetsAll>(
          `${SIMFLY_BASE}/user/assets/all?username=${encodeURIComponent(owner)}&nonce=${encodeURIComponent(nonce)}`,
        );

  const activePilots = new Set<string>();
  let assetsProbed = 0;
  let assetsChanged = 0;

  const refs: AssetRef[] = [];
  for (const it of assets?.items ?? []) {
    if (it.type === "Airport" && it.icao) refs.push({ kind: "airport", key: String(it.icao).toUpperCase() });
    else if (it.type === "Airplane" && it.aircraftId) refs.push({ kind: "aircraft", key: String(it.aircraftId) });
    if (refs.length >= maxAssets) break;
  }

  if (!refs.length) {
    return { owner, assetsProbed: 0, assetsChanged: 0, activePilots: [], durationMs: Date.now() - started };
  }

  const { data: existing } = await supabaseAdmin
    .from("asset_watch_state")
    .select("owner_username, asset_kind, asset_key, last_flight_id")
    .eq("owner_username", owner);
  const watermark = new Map<string, string | null>();
  for (const r of (existing ?? []) as WatchRow[]) {
    watermark.set(`${r.asset_kind}:${r.asset_key}`, r.last_flight_id);
  }

  const updates: Record<string, unknown>[] = [];
  const queue = [...refs];

  const worker = async () => {
    for (;;) {
      const ref = queue.shift();
      if (!ref) return;
      if (Date.now() - started > budgetMs) return;
      assetsProbed += 1;

      const key = `${ref.kind}:${ref.key}`;
      const seenBefore = watermark.has(key);
      const previousId = watermark.get(key) ?? null;
      const nowIso = new Date().toISOString();

      const first = await fetchJSON<FeedPage>(feedUrl(owner, nonce, ref, 1));
      if (!first) {
        updates.push({
          owner_username: owner,
          asset_kind: ref.kind,
          asset_key: ref.key,
          last_probed_at: nowIso,
          last_error: "feed unavailable",
        });
        continue;
      }

      const page1 = (first.flights ?? []).filter((f) => flightId(f));
      const newest = page1[0];
      const newestId = newest ? flightId(newest) : null;
      const changed = seenBefore && newestId != null && newestId !== previousId;

      if (changed) {
        assetsChanged += 1;

        // Walk pages until the previous watermark is reached, so a long gap
        // since the last visit still yields every pilot involved.
        let reachedWatermark = false;
        const collect = (flights: FeedFlight[]) => {
          for (const f of flights) {
            const id = flightId(f);
            if (id && previousId && id === previousId) {
              reachedWatermark = true;
              return;
            }
            const p = pilotOf(f);
            if (p) activePilots.add(p);
          }
        };
        collect(page1);

        for (let page = 2; page <= MAX_PAGES_PER_ASSET && !reachedWatermark; page += 1) {
          if (Date.now() - started > budgetMs) break;
          const next = await fetchJSON<FeedPage>(feedUrl(owner, nonce, ref, page));
          const list = (next?.flights ?? []).filter((f) => flightId(f));
          if (!list.length) break;
          collect(list);
        }
      }

      updates.push({
        owner_username: owner,
        asset_kind: ref.kind,
        asset_key: ref.key,
        last_flight_id: newestId,
        last_flight_at: newest ? flightTime(newest) : null,
        last_probed_at: nowIso,
        consecutive_failures: 0,
        last_error: null,
      });
    }
  };

  await Promise.allSettled(Array.from({ length: PROBE_CONCURRENCY }, () => worker()));

  if (updates.length) {
    const { error } = await supabaseAdmin
      .from("asset_watch_state")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .upsert(updates as any, { onConflict: "owner_username,asset_kind,asset_key" });
    if (error) console.warn("[asset-watch] watermark upsert failed", owner, error.message);
  }

  const result: ProbeResult = {
    owner,
    assetsProbed,
    assetsChanged,
    activePilots: [...activePilots],
    durationMs: Date.now() - started,
  };
  console.log("[asset-watch] probe", JSON.stringify(result));
  return result;
}
