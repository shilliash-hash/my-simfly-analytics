## Why it's slow now

`getSimflyPayload` (the function backing the Overview page and most charts) runs a lot of work on every call:

- For each owned airport: 25 sequential pages of `/airport/{icao}/flights`.
- For each owned plane: up to ~180 pages of `/airplane/{id}/flights`, planes scanned 2 at a time.
- A 50,000-row read from `simfly_flights`.
- A page-1 upsert back into Postgres.

On top of that, `BackfillIndicator` polls every 2s and, on every tick, invalidates `["simfly", keyTag]` whenever the imported-flight count changes — which during an active backfill means the whole heavy payload is re-fetched constantly. That's the main reason the site feels much slower than before the backfill work landed.

## Fix

Trade a little freshness on the visitor/aircraft scans for big speedups, and stop the refetch storm.

1. **Server-side cache for the heavy scans** (`src/lib/simfly.functions.ts`)
   - Add an in-process cache keyed by `username` for:
     - the per-airport visitor pages result
     - the `fetchAircraftOwnedVisitorBackfill` result
     - the `simfly_flights` DB read
   - TTL ~90s. On cache hit, skip the SimFly HTTP pages and the 50k-row DB read entirely.
   - Live page-1 of the logbook (`/user/flights?fpage=1`) keeps being fetched every call so brand-new flights still appear immediately and are merged on top of cached history.
   - Cache is per Worker isolate (no DB writes), so it self-evicts and doesn't need invalidation plumbing.

2. **Stop the tick-driven invalidation storm** (`src/components/backfill-progress.tsx`)
   - Remove the `qc.invalidateQueries({ queryKey: ["simfly", keyTag] })` that fires on every tick when `flights_imported` changes.
   - Instead, invalidate at most once every 60s while a backfill is running, and once when the backfill transitions to `completed`. That still surfaces new historical flights, just not 20–30× per minute.

3. **Lower the per-call work even on cache miss**
   - Drop the `simfly_flights` select from `limit(50000)` to `limit(20000)` and only select the columns `rowToRawFlight` actually reads. (The cap is only hit by very heavy pilots and the extra rows aren't used for the 30-day chart.)
   - Make the page-1 upsert fire-and-forget (don't `await`) so it never adds to user-visible latency.

4. **Client-side: longer `staleTime` on the main payload query**
   - In the Overview/Activity/Stats query options for `["simfly", keyTag]`, set `staleTime: 60_000` so route remounts and tab focus don't trigger a full refetch within a minute.

## Out of scope

- No schema changes, no new tables, no new cron.
- No change to what data is shown — only how often it's re-fetched.
- The persistent historical backfill keeps running exactly as today; only its UI-side side-effects on the dashboard change.

## Expected outcome

- First dashboard load: similar to today on cold cache, noticeably faster on warm cache (no 25×hubs + aircraft sweep).
- Subsequent loads within ~90s: near-instant — just page-1 of the live logbook.
- During an active backfill: dashboard stays responsive instead of re-running the heavy payload every couple of seconds.
