# Performance & Polling Audit — SimFly Hub

Read-only baseline. No code changes in this pass. Numbers come from `pg_stat_statements`, `pg_indexes`, and the polling/cache constants in the current code.

---

## 1. Polling inventory (client-side, per active tab)


| Feature                     | File                                  | Interval           | Verdict                                                          | Suggested                                                 |
| --------------------------- | ------------------------------------- | ------------------ | ---------------------------------------------------------------- | --------------------------------------------------------- |
| Live flights (hero)         | `routes/index.tsx:58`                 | 15 s               | Fine for "current flight", but every tab hits `getMyLiveFlights` | **30 s** (hero doesn't need 15 s; ETA is client-computed) |
| Incoming visitor traffic    | `routes/index.tsx:65`                 | 15 s               | Same global feed as above                                        | **30 s** and share one query with hero                    |
| Live flights (Activity map) | `routes/activity.tsx:68`              | 60 s               | OK                                                               | keep 60 s                                                 |
| Aircraft page live          | `routes/aircraft.tsx:40`              | 60 s               | OK                                                               | keep                                                      |
| Backfill progress poll      | `components/backfill-progress.tsx:44` | dynamic (2–5 s)    | Fine while running, but keep only while `status='running'`       | verify it stops when idle                                 |
| Admin dashboard             | `routes/admin.tsx:125`                | 5 s                | Fine (admin only, low N)                                         | keep                                                      |
| Homepage `getSimflyPayload` | `routes/index.tsx:21`                 | staleTime 30 s     | Heavy fn; see §3                                                 | staleTime **2–5 min**                                     |
| Hero re-render tick         | `routes/index.tsx:652`                | 30 s `setInterval` | Cosmetic countdown only                                          | keep                                                      |


**Biggest single win:** the two 15 s polls on the homepage now hit a single upstream (`/api/flights`) — collapse them into one shared React-Query key (`["simfly","liveGlobal"]`) so multiple tabs / components dedupe, and lift the interval to 30 s. Estimated upstream + serverless invocations cut by ~66%.

---

## 2. Slow queries (from `pg_stat_statements`)


| Rank | Query                                                                                | Calls | Mean   | Total      | Notes                                                                                                                                                        |
| ---- | ------------------------------------------------------------------------------------ | ----- | ------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| #1   | `SELECT … WHERE username=$1 ORDER BY mission_start_ts DESC LIMIT/OFFSET`             | 2 455 | 22 ms  | **54.9 s** | Uses `simfly_flights_user_ts_idx` — index is correct. Volume is the problem: called from every homepage/activity/stats render. Cache the result server-side. |
| #2   | `INSERT … simfly_flights ON CONFLICT DO NOTHING`                                     | 3 960 | 1 ms   | 4.1 s      | Healthy; already idempotent. Batching size is fine.                                                                                                          |
| #3   | `SELECT … WHERE departure_icao=ANY OR destination_icao=ANY AND mission_start_ts>=$3` | 675   | 4.6 ms | 3.1 s      | **No supporting index** — the OR forces a seq/bitmap scan on the two ICAO columns. Add partial indexes.                                                      |


**Recommended indexes** (schema-only migration when we start implementing):

```sql
CREATE INDEX simfly_flights_dep_ts_idx  ON public.simfly_flights (departure_icao, mission_start_ts DESC);
CREATE INDEX simfly_flights_dest_ts_idx ON public.simfly_flights (destination_icao, mission_start_ts DESC);
CREATE INDEX simfly_flights_aircraft_id_ts_idx ON public.simfly_flights (aircraft_id, mission_start_ts DESC);
```

The OR-of-ANY query will be rewritten by the planner into a BitmapOr across the two ICAO indexes — mean should drop from 4.6 ms → <1 ms and it eliminates the current implicit full scan when a hub set is large. Aircraft index helps the visitor-by-aircraft scans in `simfly.functions.ts` §aircraft-backfill.

---

## 3. Expensive server functions

Current in-memory memo (`HEAVY_CACHE_TTL_MS = 90 s`, `src/lib/simfly.functions.ts:54`) covers `getSimflyPayload` per-isolate but **is lost on cold start** and **not shared across regions**. Findings:


| Function                                          | Cost driver                                                                 | Today                   | Recommendation                                                                                                                                                     |
| ------------------------------------------------- | --------------------------------------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `getSimflyPayload`                                | 25× hub scan + aircraft sweep + DB read of user flights                     | 90 s isolate memo       | Keep memo, but raise TTL to **5 min**; store the derived payload in a `payload_cache` table keyed by (username, computed_at) so cold isolates rehydrate instantly. |
| `getAirportPayoutMatrix` / `getUpgradeAdvisor`    | Shared `collectAirportHistoryFlights` (up to 50 pages upstream per airport) | client staleTime 15 min | Add a server-side memo of `collectAirportHistoryFlights(icao, windowDays)` with 30 min TTL — both features already share the collector, so one memo serves both.   |
| `getAirportVisitors` / `getMyHubsIncomingTraffic` | Global `/api/flights` fetch                                                 | called ad-hoc           | Wrap `fetchAllLiveFlights()` in a **10 s memo** — any concurrent caller inside 10 s reuses one upstream fetch.                                                     |
| Rankings / community lists                        | Recomputed per request                                                      | client staleTime 5 min  | Move to a nightly materialization or 30 min server memo.                                                                                                           |
| Consistency / stats aggregates                    | Full-history scan of `simfly_flights` per view                              | none                    | Aggregate once at request time and cache 5 min per (username, window).                                                                                             |


Estimated impact: query #1 total time drops proportionally to TTL increase — a 30 s → 5 min effective cache is **~10× fewer DB reads** on the hot path.

---

## 4. Historical backfill

Current behavior (`backfill.functions.ts`) is already correct on the important axes:

- Idempotent `INSERT … ON CONFLICT (username, flight_id) DO NOTHING` — no overwrites.
- Resumable via `backfill_progress.current_page`.
- Nonce cached in `pilot_nonces`.

Improvement opportunities (not bugs):

- **Short-circuit re-runs:** when `status='complete'` and `last_page_at < 24h`, refuse restart from UI unless admin forces. Prevents user-triggered full rescans.
- **Incremental top-up:** add a lightweight "sync latest 2 pages" job for completed users instead of full resume from page 1 on any refresh. Cuts writes to only genuinely new flights.
- **Batch size:** current per-page upsert already batches — verified as query #2, 1 ms mean. No change needed.

---

## 5. Live vs analytical cache policy (target state)


| Feature                     | Cache                                        | Rationale                |
| --------------------------- | -------------------------------------------- | ------------------------ |
| Active flights (hero + map) | 30 s poll, no server memo beyond 10 s dedupe | freshness first          |
| Visitors                    | 30 s poll, shares dedupe with above          | same source              |
| Activity list               | staleTime 60 s (up from 30)                  | tolerable                |
| Airport Payout Matrix       | server memo 30 min + client 15 min           | rarely changes intra-day |
| Upgrade Advisor             | reuses matrix memo                           | free                     |
| Rankings / community        | server memo 30 min                           | slow-moving              |
| Historical stats            | server memo 5 min per (user, window)         | append-only data         |
| Aircraft specs / static     | in-memory forever                            | pure data                |


---

## 6. Write reduction

- `backfill_progress` is currently updated once per page fetched (~1/s during a run). Fine, but skip the write when `current_page` and `flights_imported` are unchanged (no-op writes seen in slow-query samples).
- `pilot_nonces` upsert is fine; already best-effort.
- No other write hot paths — the app is read-heavy.

---

## Ranked action list (when we switch to build mode)

1. **Add three indexes** on `simfly_flights` (dep, dest, aircraft_id + ts). Migration only. — biggest DB win, near-zero risk.
2. **Collapse the two homepage 15 s polls into one 30 s shared query**. — biggest upstream/API win.
3. **Raise `HEAVY_CACHE_TTL_MS` to 5 min** and extend `memo` to `collectAirportHistoryFlights`, `fetchAllLiveFlights`, rankings, stats aggregates. — cuts slow-query #1 by ~10×.
4. **Persist a `payload_cache` row** so cold isolates skip the 25×hub sweep.
5. **Skip no-op `backfill_progress` writes** and gate "restart" for recently-completed users.
6. **Bump analytical client staleTimes** (rankings, community, matrix) to 15–30 min to match server memo.

Each step is independently deployable and measurable via `pg_stat_statements` deltas + Cloud request logs. Once you approve, I'll implement them one at a time and re-check the slow-query table after each.  
  
