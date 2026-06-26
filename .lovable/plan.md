
## 1. Aircraft-owner revenue & activity

### Problem
Today, flights by other pilots only enter Income/Activities via the **airport** flight-history endpoint (`/api/user/assets/airport/{ICAO}/flights`). If someone rents my aircraft and flies between two airports I do not own (your example flights), nothing surfaces — even though SimFly pays me the aircraft cut and the ground timer ticks.

### Fix
Add a parallel pull for every aircraft I own, then fold those flights into the same visitor pipeline:

1. New server-side helper `fetchAircraftHistory(aircraftId, username, nonce, pages)` in `src/lib/simfly.functions.ts` that pages through `/api/user/assets/airplane/{aircraftId}/flights?username&nonce&page=N` (same shape SimFly uses for airports — pilot/airplane/origin/destination/licence slots). If the endpoint shape differs, fall back to the mission-log detail (`/api/user/missions/log/{id}`) once per flight id discovered through the airplane detail endpoint.
2. New normaliser `normaliseAircraftHistFlight` that mirrors `normaliseHistFlight` but keys revenue off `airplane.totalEarnedPax` (my cut as aircraft owner) instead of the airport leg. `paxAirport` stays 0 unless the airport is also mine.
3. In `getSimflyPayload`, after `visitorPerAirport`, run `aircraftPerPlane` in parallel for every entry in `airplanes`. Flatten, then **merge into the existing `byVisitorFlight` map by `flightID`** so a flight that touches both my airport and my aircraft is counted once, with `paxAirport` from the airport feed and `paxAircraft` from the aircraft feed (current `Math.max` becomes `paxAircraft from aircraft feed ?? airport-feed value`).
4. The merged set already drives `visitorByDay` (earnings chart, "Visitor PAX" line) and `visitorActivity` (Activities feed), so both surfaces light up automatically. Update the activity message to read `(Visitor) @pilot · ORIG → DEST · aircraft · my aircraft` when the aircraft cut is present and neither endpoint is mine.
5. Bump default page depth so we cover ~3 months of history. SimFly returns 4 flights/page; raise `VISITOR_PAGES` and the new aircraft page count to **25** (≈100 flights per asset). Keep them as constants at the top of the file so they're easy to tune.

### Revenue attribution
We keep using the per-slot `totalEarnedPax`/`earnedPax` values SimFly already publishes — that is the actual payout (your 100%-to-owner example will surface as `airplane.totalEarnedPax = full pax`, `pilot.pax = 0`). No re-calculation, no guessing splits.

### Acceptance checks
- The two example flights (`019ef0be-…` and `019ef8d0-…`) appear in `/activity` and contribute to `/stats` "Visitor PAX".
- Aircraft owned-cut shows up regardless of pilot, license, origin, or destination ownership.
- Aircraft utilization timer (already correct) is untouched.

## 2. PAX earnings chart — historical navigation

### Fix in `src/routes/stats.tsx`
1. Compute the timeseries from the **full** flight + visitor history already returned by `getSimflyPayload`, not just the trailing 30 days. To do this, change `flightsToTimeseries` so it returns every day present in the data (and visitor folding already iterates all visitor days). Earnings payload becomes the full history; UI windows it.
2. Add an `offset` state (`useState<number>(0)`) in the Stats component, where `0` = most recent 30 days, `1` = previous 30 days, etc. Compute `windowed = earningsTimeseries.slice(end - 30, end)` where `end = length - offset*30`.
3. Render two header controls next to the "PAX earnings · 30 days" title:
   - `← Previous 30 days` button (disabled when no older data)
   - `Next 30 days →` button (disabled when `offset === 0`)
   - Small label showing the active window, e.g. `Jun 12 – Jul 11`.
4. Keep the existing chart markup. `paxTotal = pax + paxVisitors` stays the derived field, so Total PAX (gray bars) continues to equal Your PAX (blue) + Visitor PAX (yellow) for whatever window is active.
5. Visual style (dark panel, curved areas + bar background, MM-DD x-axis tick formatter) stays exactly as today — only the data slice and the two header buttons change.

### Why client-side windowing
The server already loads enough history for the chart once aircraft pages and 25-page airport pages land in step 1. No new server round-trip per click, no flicker, instant prev/next.

## Technical details (for reference)

Files touched:
- `src/lib/simfly.functions.ts` — add aircraft-history fetch/normalise, merge into visitor pipeline, return full-history earnings series, bump page constants.
- `src/lib/types.ts` — only if a new `AircraftFlightHistoryItem` alias is helpful (likely reuse `AirportFlightHistoryItem`).
- `src/routes/stats.tsx` — add `offset` state, prev/next buttons, window slicing, date-range label.

No schema, no auth, no migrations.
