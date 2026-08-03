// Server-only ASSET ACTIVITY WATCH.
//
// Purpose: answer the cheap question "did anything happen to a Hub user's
// airports or aircraft?" before the expensive question "is this pilot's
// logbook current?".
//
// Why it exists: per-pilot logbook sync can only see pilots that are already
// in the rotation. A pilot who never uses the Hub can still fly INTO or OUT OF
// a Hub user's airport, or fly a Hub user's tail. Those movements are only
// visible through the asset-scoped SimFly feeds, so we watch those feeds.
//
// It never writes flight rows. It only:
//   1. detects new activity on Hub-owned assets (page-1 fetch + watermark),
//   2. registers newly discovered pilots for background sync,
//   3. reports which owners/pilots should be synced immediately.
//
// Filename ends in `.server.ts` so it can never reach the client bundle.

const SIMFLY_BASE = "https://simfly.io/api";
const FETCH_TIMEOUT_MS = 10_000;

/** Max Hub owners inspected per tick (keeps the probe bounded). */
const MAX_OWNERS_PER_TICK = 12;
/** Max assets probed per owner per tick. */
const MAX_ASSETS_PER_OWNER = 24;
/** Concurrent asset probes within one owner. */
const PROBE_CONCURRENCY = 4;
/** Owners probed in parallel. */
const OWNER_CONCURRENCY = 3;

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
  ownersChecked: number;
  assetsProbed: number;
  assetsChanged: number;
  touchedOwners: string[];
  discoveredPilots: string[];
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

function feedUrl(owner: string, nonce: string, asset: AssetRef): string {
  if (asset.kind === "airport") {
    return `${SIMFLY_BASE}/user/assets/airport/${encodeURIComponent(asset.key)}/flights?username=${encodeURIComponent(owner)}&nonce=${encodeURIComponent(nonce)}&page=1`;
  }
  return `${SIMFLY_BASE}/user/assets/airplane/${encodeURIComponent(asset.key)}/flights?page=1`;
}

/**
 * Probe every Hub-owned airport and aircraft (page 1 only) and diff the newest
 * flight against the stored watermark.
 *
 * First sight of an asset only seeds the watermark — it never reports a change,
 * so enabling the watch does not stampede the whole rotation.
 */
export async function probeAssets(opts?: {
  owners?: string[];
  maxOwners?: number;
  budgetMs?: number;
}): Promise<ProbeResult> {
  const started = Date.now();
  const budgetMs = opts?.budgetMs ?? 12_000;
  const maxOwners = Math.max(1, Math.min(50, opts?.maxOwners ?? MAX_OWNERS_PER_TICK));

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { getSessionIdentity } = await import("./identity.server");

  let owners = opts?.owners ?? [];
  if (!owners.length) {
    const { data } = await supabaseAdmin
      .from("pilot_sync_state")
      .select("username")
      .eq("enabled", true)
      .limit(500);
    const all = (data ?? []).map((r) => (r as { username: string }).username);

    // Rotate: least-recently-probed owners first, never-probed owners first of
    // all. Without this the same few owners consume the whole budget each tick.
    const { data: probes } = await supabaseAdmin
      .from("asset_watch_state")
      .select("owner_username, last_probed_at")
      .limit(5000);
    const lastProbe = new Map<string, number>();
    for (const r of (probes ?? []) as { owner_username: string; last_probed_at: string | null }[]) {
      const ts = r.last_probed_at ? Date.parse(r.last_probed_at) : 0;
      const prev = lastProbe.get(r.owner_username);
      if (prev === undefined || ts > prev) lastProbe.set(r.owner_username, ts);
    }
    owners = all.sort((a, b) => (lastProbe.get(a) ?? 0) - (lastProbe.get(b) ?? 0));
  }
  owners = owners.slice(0, maxOwners);

  const touchedOwners = new Set<string>();
  const activePilots = new Set<string>();
  let assetsProbed = 0;
  let assetsChanged = 0;

  const ownerQueue = [...owners];
  const runOwner = async (owner: string) => {
    if (Date.now() - started > budgetMs) return;


    let nonce = "";
    try {
      ({ nonce } = await getSessionIdentity({ username: owner }));
    } catch {
      return;
    }

    const assets = await fetchJSON<AssetsAll>(
      `${SIMFLY_BASE}/user/assets/all?username=${encodeURIComponent(owner)}&nonce=${encodeURIComponent(nonce)}`,
    );
    if (!assets?.items?.length) return;

    const refs: AssetRef[] = [];
    for (const it of assets.items) {
      if (it.type === "Airport" && it.icao) refs.push({ kind: "airport", key: String(it.icao).toUpperCase() });
      else if (it.type === "Airplane" && it.aircraftId) refs.push({ kind: "aircraft", key: String(it.aircraftId) });
      if (refs.length >= MAX_ASSETS_PER_OWNER) break;
    }
    if (!refs.length) return;

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

        const page = await fetchJSON<FeedPage>(feedUrl(owner, nonce, ref));
        const nowIso = new Date().toISOString();

        if (!page) {
          updates.push({
            owner_username: owner,
            asset_kind: ref.kind,
            asset_key: ref.key,
            last_probed_at: nowIso,
            last_error: "feed unavailable",
          });
          continue;
        }

        const flights = (page.flights ?? []).filter((f) => flightId(f));
        const newest = flights[0];
        const newestId = newest ? flightId(newest) : null;
        const key = `${ref.kind}:${ref.key}`;
        const seenBefore = watermark.has(key);
        const previousId = watermark.get(key) ?? null;
        const changed = seenBefore && newestId != null && newestId !== previousId;

        if (changed) {
          assetsChanged += 1;
          touchedOwners.add(owner);
          // Collect every pilot on the page up to the previous watermark.
          for (const f of flights) {
            const id = flightId(f);
            if (id && id === previousId) break;
            const p = pilotOf(f);
            if (p) activePilots.add(p);
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

    await Promise.allSettled(
      Array.from({ length: PROBE_CONCURRENCY }, () => worker()),
    );

    if (updates.length) {
      const { error } = await supabaseAdmin
        .from("asset_watch_state")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .upsert(updates as any, { onConflict: "owner_username,asset_kind,asset_key" });
      if (error) console.warn("[asset-watch] watermark upsert failed", owner, error.message);
    }
  };

  const ownerWorker = async () => {
    for (;;) {
      const owner = ownerQueue.shift();
      if (!owner) return;
      if (Date.now() - started > budgetMs) return;
      try {
        await runOwner(owner);
      } catch (err) {
        console.warn(
          "[asset-watch] owner probe failed",
          owner,
          err instanceof Error ? err.message : String(err),
        );
      }
    }
  };

  await Promise.allSettled(Array.from({ length: OWNER_CONCURRENCY }, () => ownerWorker()));


  // Pilots we have never seen before become new sync candidates.
  const discovered: string[] = [];
  if (activePilots.size) {
    const list = [...activePilots];
    const { data: known } = await supabaseAdmin
      .from("pilot_sync_state")
      .select("username")
      .in("username", list);
    const knownSet = new Set((known ?? []).map((r) => (r as { username: string }).username));
    for (const p of list) if (!knownSet.has(p)) discovered.push(p);
  }

  const result: ProbeResult = {
    ownersChecked: owners.length,
    assetsProbed,
    assetsChanged,
    touchedOwners: [...touchedOwners],
    discoveredPilots: discovered,
    activePilots: [...activePilots],
    durationMs: Date.now() - started,
  };
  console.log("[asset-watch] probe", JSON.stringify(result));
  return result;
}

/**
 * Register discovered pilots and mark pilots with fresh asset activity as due
 * right now, so the very next scheduler slice picks them up.
 */
export async function applyProbeEvidence(probe: ProbeResult): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const nowIso = new Date().toISOString();

  if (probe.discoveredPilots.length) {
    const rows = probe.discoveredPilots.map((username) => ({ username }));
    const { error } = await supabaseAdmin
      .from("pilot_sync_state")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .upsert(rows as any, { onConflict: "username", ignoreDuplicates: true });
    if (error) console.warn("[asset-watch] discovery upsert failed", error.message);
  }

  const due = [...new Set([...probe.touchedOwners, ...probe.activePilots])];
  if (due.length) {
    const { error } = await supabaseAdmin
      .from("pilot_sync_state")
      .update({ next_sync_after: nowIso })
      .in("username", due)
      .eq("enabled", true);
    if (error) console.warn("[asset-watch] due update failed", error.message);
  }
}
