// Aircraft Rental Activity — read-only ACTIVITY layer.
//
// Answers one question per owned aircraft: "was the most recent flight on this
// aircraft flown by SOMEONE ELSE?". No income, payout or earnings values are
// read or returned here — financial accounting stays in Income/Activities.
//
// Data source: the same public per-aircraft flight feed the aircraft backfill
// already uses (`/user/assets/airplane/{id}/flights?page=1`). Ownership at
// flight time comes from the existing ownership ledger.

import { createServerFn } from "@tanstack/react-start";

const SIMFLY_BASE = "https://simfly.io/api";
const FETCH_TIMEOUT_MS = 12_000;
const CACHE_TTL_MS = 120_000;

const cache = new Map<string, { at: number; value: unknown }>();

async function memo<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value as T;
  const value = await fn();
  cache.set(key, { at: Date.now(), value });
  return value;
}

async function fetchJSON<T>(url: string): Promise<T | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" }, signal: controller.signal });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

type RawHistFlight = {
  flightID?: string;
  departureTime?: string;
  takeoffTime?: string;
  landingTime?: string;
  flightTime?: string;
  pilot?: { username?: string };
  origin?: { icao?: string };
  destination?: { icao?: string };
};

type RawHistPage = { flights?: RawHistFlight[] };

/** Most recent COMPLETED rental flight on one of my aircraft. */
export type RentalCompletedFlight = {
  aircraftId: string;
  flightId: string;
  pilot: string;
  originIcao: string;
  destinationIcao: string;
  departureIso: string | null;
  arrivalIso: string | null;
  durationMinutes: number | null;
};

export type AircraftRentalActivity = {
  /** Keyed by aircraftId — only aircraft whose LATEST flight was another pilot's. */
  recent: RentalCompletedFlight[];
  fetchedAt: string;
};

function startMs(f: RawHistFlight): number | null {
  const ts = f.departureTime ?? f.takeoffTime ?? f.landingTime ?? "";
  const ms = ts ? Date.parse(ts) : NaN;
  return Number.isFinite(ms) ? ms : null;
}

export const getAircraftRentalActivity = createServerFn({ method: "GET" })
  .inputValidator((d?: { username?: string; aircraftIds?: string[] }) => d ?? {})
  .handler(async ({ data }): Promise<AircraftRentalActivity> => {
    const { getSessionIdentity } = await import("./identity.server");
    const identity = await getSessionIdentity({ username: data.username });
    const me = (identity.username || "").toLowerCase();

    let ids = Array.from(new Set((data.aircraftIds ?? []).filter(Boolean)));
    if (ids.length === 0) return { recent: [], fetchedAt: new Date().toISOString() };
    if (ids.length > 40) ids = ids.slice(0, 40);

    const { getOwnedAircraftWindows, ownedAt } = await import("./aircraft-ownership.server");
    const view = await getOwnedAircraftWindows(identity.username, ids).catch(() => null);

    const results = await Promise.all(
      ids.map((aircraftId) =>
        memo(`rental:${me}:${aircraftId}`, async (): Promise<RentalCompletedFlight | null> => {
          const page = await fetchJSON<RawHistPage>(
            `${SIMFLY_BASE}/user/assets/airplane/${encodeURIComponent(aircraftId)}/flights?page=1`,
          );
          const flights = (page?.flights ?? []).filter((f) => !!f.flightID);
          if (flights.length === 0) return null;

          // Newest first — the feed is usually ordered, but sort defensively.
          const sorted = [...flights].sort((a, b) => (startMs(b) ?? 0) - (startMs(a) ?? 0));
          const latest = sorted[0];
          const pilot = latest.pilot?.username ?? "";
          if (!pilot || pilot.toLowerCase() === me) return null;

          const depMs = startMs(latest);
          if (view && depMs !== null && !ownedAt(view.windows, aircraftId, depMs)) return null;

          const arrMs = latest.landingTime ? Date.parse(latest.landingTime) : NaN;
          const durationMinutes =
            depMs !== null && Number.isFinite(arrMs) && arrMs > depMs
              ? Math.round((arrMs - depMs) / 60_000)
              : null;

          return {
            aircraftId,
            flightId: latest.flightID as string,
            pilot,
            originIcao: latest.origin?.icao ?? "",
            destinationIcao: latest.destination?.icao ?? "",
            departureIso: depMs !== null ? new Date(depMs).toISOString() : null,
            arrivalIso: Number.isFinite(arrMs) ? new Date(arrMs).toISOString() : null,
            durationMinutes,
          };
        }).catch(() => null),
      ),
    );

    return {
      recent: results.filter((r): r is RentalCompletedFlight => !!r),
      fetchedAt: new Date().toISOString(),
    };
  });
