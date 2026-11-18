import { initialStock, projectedStock } from "./hauler-rules";

/** Display-only: rebuilds an airport's Hub Hauler passenger history from the public ledger. Never writes, never feeds settlement or SimFly PAX/income. */
export const HISTORY_BUCKET_MS = 12 * 3600_000;
export const HISTORY_BUCKETS = 60; // 30 days in 12-hour windows

export type HistoryFlight = {
  origin_icao: string; destination_icao: string; status: string;
  boarded: number; accepted: number; dissolved?: number | null; observed_at: string; settled_at: string | null;
};
export type HistoryBucket = { start: number; departed: number; arrived: number; flights: number; stock: number | null };

export function airportPaxHistory(
  airport: { icao: string; capacity: number; created_at: string },
  flights: HistoryFlight[],
  now: number,
  buckets = HISTORY_BUCKETS,
): HistoryBucket[] {
  const lastStart = Math.floor(now / HISTORY_BUCKET_MS) * HISTORY_BUCKET_MS;
  const firstStart = lastStart - (buckets - 1) * HISTORY_BUCKET_MS;
  const rows: HistoryBucket[] = Array.from({ length: buckets }, (_, i) => ({ start: firstStart + i * HISTORY_BUCKET_MS, departed: 0, arrived: 0, flights: 0, stock: null }));
  const opened = new Date(airport.created_at).getTime();
  const events: { at: number; delta: number; paid: number }[] = [];
  for (const f of flights) {
    if (f.status === "cancelled") continue;
    if (f.origin_icao === airport.icao && f.boarded > 0) events.push({ at: new Date(f.observed_at).getTime(), delta: -f.boarded, paid: 0 });
    if (f.destination_icao === airport.icao && f.status === "completed" && f.settled_at && f.accepted > 0) events.push({ at: new Date(f.settled_at).getTime(), delta: f.accepted - (f.dissolved ?? 0), paid: f.accepted });
    const touches = f.origin_icao === airport.icao || f.destination_icao === airport.icao;
    const at = new Date(f.observed_at).getTime();
    const i = Math.floor((at - firstStart) / HISTORY_BUCKET_MS);
    if (touches && i >= 0 && i < buckets) rows[i].flights++;
  }
  events.sort((a, b) => a.at - b.at);
  for (const e of events) {
    const i = Math.floor((e.at - firstStart) / HISTORY_BUCKET_MS);
    if (i < 0 || i >= buckets) continue;
    if (e.paid === 0) rows[i].departed -= e.delta; else rows[i].arrived += e.paid;
  }
  // Estimated stock at the end of each window: start at 10 %, apply regeneration/burnout and ledger movements in order.
  // Arrivals add only connecting PAX (paid minus those whose journey ended there).
  let stock = initialStock(airport.capacity), clock = opened, lastDeparture = opened, k = 0;
  const step = (until: number) => {
    while (k < events.length && events[k].at <= until) {
      const e = events[k++];
      if (e.at < opened) continue;
      stock = Math.max(0, projectedStock(stock, airport.capacity, clock, e.at, lastDeparture) + e.delta);
      clock = e.at;
      if (e.paid === 0) lastDeparture = e.at;
    }
    if (until > clock) { stock = projectedStock(stock, airport.capacity, clock, until, lastDeparture); clock = until; }
  };
  for (const r of rows) {
    const end = Math.min(now, r.start + HISTORY_BUCKET_MS);
    if (end <= opened) continue;
    step(end);
    r.stock = Math.round(stock);
  }
  return rows;
}
