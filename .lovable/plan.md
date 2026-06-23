## Step 0 — Revert first (you do this, not me)

I should not write code to undo recent changes. Use Lovable's built-in revert to roll the project back to the working/live version, then I'll layer the three fixes below on top.

```xml
<presentation-actions>
  <presentation-open-history>View History</presentation-open-history>
</presentation-actions>
```

Pick the message that matches your live published state (likely the version before the "subtle donation pill / Buy me a coffee" sidebar changes), revert, then ping me and I'll implement steps 1–3 below.

---

## Step 1 — Aircraft-owner revenue & activity (the big one)

**Problem.** Today, income + activity for visitor flights only surfaces when the flight touches one of *my airports*. The visitor-history scan in `getSimflyPayload` only pages `/user/assets/airport/{ICAO}/flights` for ICAOs I own (`simfly.functions.ts` ~L711–743). A flight using my aircraft between two airports I don't own (your example mission) is therefore invisible to the dashboard even though SimFly paid me 100% of the aircraft slot.

**Fix.** Add a parallel scan keyed on aircraft I own, then merge into the same visitor pipeline that already powers `earningsTimeseries.paxVisitors` and the visitor activity feed.

Concretely in `src/lib/simfly.functions.ts`:

1. Add `fetchAircraftHistory(aircraftId, username, nonce, pages)` that pages `https://simfly.io/api/user/assets/airplane/{aircraftId}/flights?username=&nonce=&page=N` (same shape as the airport history endpoint — `flights[]` with `pilot/airplane/origin/destination/licence` slots). If the endpoint shape differs at runtime, fall back to `/api/user/missions/log/{flightID}` (already wired via `fetchMissionSplit`) to recover the per-slot split.
2. Extend `normaliseHistFlight` (or add `normaliseAircraftHistFlight`) so a flight returns `paxAircraft = airplane.totalEarnedPax ?? earnedPax ?? 0` whenever `airplane.owner.username === me`, regardless of whether origin/destination ICAO is mine. For aircraft-scan rows, `airportIcao` is `null` and `paxAirport = 0` unless the airport is also mine.
3. In `getSimflyPayload`, after the existing `visitorPerAirport` scan, also run `aircraftPer = await Promise.all(airplanes.map(p => fetchAircraftHistory(p.aircraftId, ...)))`. Flatten into the same `visitorFlights` array *before* the existing `byVisitorFlight` de-dup `Map` (which already merges duplicates by `flight.id` and `Math.max`'s `paxAircraft`, so airport-scan + aircraft-scan rows for the same flight collapse cleanly).
4. The downstream code paths already do the right thing once those rows exist:
   - `visitorByDay` folds `paxAirport + paxAircraft` into `earningsTimeseries[*].paxVisitors` (Income chart).
   - `visitorActivity` emits one entry per unique flight, with the "· my aircraft" marker, into the Activity feed.
5. Bound the cost: cap pages per aircraft (e.g. `AIRCRAFT_PAGES = 6`, same order as `VISITOR_PAGES = 10`) and run all aircraft scans inside the existing top-level `Promise.all` so total wall time stays within the current budget.

**Acceptance check after build:** the example flight `019ef0be-…` shows up in `/activity` as a Visitor row with "· my aircraft", and its `paxAircraft` is added to that day's bar on `/stats` Income chart and `/`'s 30-day PAX area.

## Step 2 — Headline copy

`src/routes/index.tsx` L70 — replace
`"Real-time intelligence on your SimFly.io operations — PAX-first."`
with
`"Real-time intelligence on your SimFly operations"`.

## Step 3 — Live Visitors widget shows ALL my airports

`src/routes/stats.tsx` L31–33 currently does `topAirports = [...data.airports].sort(...).slice(0, 6)`, then `useQueries` only over those 6.

Change to: keep the sort but drop the `.slice(0, 6)`. Build the queries for every owned airport (typical accounts are well under the 24-cap the server already uses elsewhere). Group rendering as:

- Active first (any live visitor) — full size cards in the existing 3-col grid.
- A collapsed "Show all hubs (N)" toggle that reveals the empty-state cards below the active ones, so the section stays scannable but every owned airport is reachable.

No backend changes needed (`getAirportVisitors` is per-icao).

---

## Technical notes

- Aircraft history endpoint URL shape is the same pattern SimFly uses for airports, so reuse `fetchJSON<RawAirportHistPage>` first; if a runtime check shows a different envelope, add a parallel raw type. Either way, the normalised row goes through the existing `byVisitorFlight` Map so income isn't double-counted.
- Don't touch `flights` (my-logbook) totals or `paxLast7d`/`paxLast30d`/`lifetimePax` — those come from `/api/user/stats` + `/api/user/flights` which already attribute correctly. Income visibility for visitor-on-my-aircraft flows entirely through `paxVisitors`, matching how the existing visitor-on-my-airport flow works today.
- No UI changes required for Step 1 — `/activity` and `/stats` already render `paxVisitors` and visitor activity entries.
