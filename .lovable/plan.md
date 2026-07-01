## Diagnosis

I traced the active-flight pipeline end-to-end.

**1. Polling service — running.**
`src/routes/index.tsx` still schedules two live queries every 15s:
- `getMyLiveFlights` (own aircraft airborne) — `["simfly","myLiveFlights",...]`, `refetchInterval: 15_000`.
- `getMyHubsIncomingTraffic` (visitor arrivals) — `refetchInterval: 15_000`.
Activity page also polls `getMyLiveFlights` every 60s. Nothing has been disabled client-side.

**2. SimFly upstream — no longer returning data. (root cause)**
Both live endpoints the app depends on now return HTTP 404 anonymously:

```
GET https://simfly.io/api/asset/airport/EPWA/flights   → 404
GET https://simfly.io/api/live/flights                 → 404
```

These are called from `src/lib/simfly.functions.ts`:
- line 1522 (`getAirportLiveVisitors`)
- line 1556 (`getMyLiveFlights`)
- line 1614 (`getMyHubsIncomingTraffic`)
- line 109 (initial `live/flights` bootstrap inside `getSimflyPayload`)

Each call site wraps `fetchJSON` in `try/catch` and returns `[]` on failure — so the app silently degrades to "no live flights" instead of surfacing an error. That is why the hero card sticks on last flight, the map has no in-flight layer, and Incoming Traffic is empty for everyone (not just other pilots).

**3. Database writes — not involved.**
Live flights are read-through only. They are never persisted; only completed flights land in `simfly_flights` via the logbook backfill. So no DB regression is possible here.

**4. Frontend wiring — correct.**
`src/routes/index.tsx` L61–67 and L93–108 read `myFlights` / `hubTraffic` from the right query keys and forward them to `CurrentFlightHero` and `FlightMap`. The pilot switcher's `keyTag`/`username` are threaded through. Nothing to change on the consumer side.

**5. Recent changes — not the trigger.**
Historical backfill code (`getSimflyPayload`, `backfill.functions.ts`, admin/reset flow) touches paginated logbook endpoints under `/api/user/flights` and `/api/user/assets/...`, which still respond. It does not share code paths with the live endpoints and did not disable them. The change is upstream at SimFly.

## Plan

1. **Confirm the new live endpoint.**
   Open a signed-in SimFly session in the browser DevTools, hit an airport page, and capture the exact request the SimFly UI now uses (likely renamed, moved under `/api/user/...`, or now requires an `Authorization` / session cookie). This is a 30-second manual step — I cannot discover it from the sandbox because the endpoint is auth-gated after the change.

2. **Update the three live call sites** in `src/lib/simfly.functions.ts` (lines 1522, 1556, 1614) plus the bootstrap at line 109 to use the new URL + any required headers. Keep the existing shape (`RawLiveFlight[]`) so downstream code and the map remain untouched; only the fetch layer changes.

3. **Fail loudly, not silently.** Replace the bare `catch` on the live-fetch paths with a structured `console.warn` including status code so the next upstream change is visible in server logs immediately instead of degrading to empty arrays.

4. **Sanity check.** After the fix, watch `stack_modern--server-function-logs` for `getMyLiveFlights` calls returning non-empty arrays, and verify the hero card flips to EN ROUTE when a mission is active.

**No frontend/UI edits required.** No database migration. No changes to backfill.

Please grab the new live-flights URL (path + any headers/cookies SimFly requires) from a logged-in browser session and paste it here — then I'll wire it in.