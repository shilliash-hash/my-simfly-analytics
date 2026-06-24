# SimFly Hub — content & metrics overhaul

Switch the whole hub from "XP first" to "PAX first", expose available wallet balance, add drill-in pages for Licenses and Aircraft, and rework Stats / Rankings / Compare / Community around per-airport visitor revenue share.

## Data layer (`src/lib/simfly.functions.ts` + `types.ts`)

Extend the loader to pull what the public API actually exposes:

- `GET /api/user/pax` → `availablePax` (currently spendable balance, e.g. 301.75).
- Reuse `/api/user/stats` `rewards.totalPAXReceived` as `lifetimePax`.
- Walk `/api/user/flights?page=N` for ~3 pages to get a working logbook window (~24 flights) — each row has `pax` (my share), `xp`, `mission_start_ts`, `departure_icao`, `destination_icao`, `licence`, `licence_rank`, `licence_rankName`, `aircraftId`, `aircraft`.
- Per-airport detail: `/api/user/assets/details/airport/{ICAO}` (rotation, maxRotation, totalRotations, totalTakeoff, totalLanding, percToUser, level_progress, nextRotationRestoreTime).
- Live visitors: `/api/asset/airport/{ICAO}/flights` → players currently flying through (`username`, `usernonce`, `aircraftName`, `originICAO`, `destinationICAO`, `userAvatar`).

Derived (computed in the server fn, not the UI):
- `paxLast7d`, `paxLast30d` from flight timestamps.
- Per-airport visitor table: from logbook, group flights where `departure_icao` or `destination_icao == airport.icao`, exclude `username == me`, aggregate `{visits, paxForVisitor (their share — derive as `total_reward - pax`), paxForOwner (= my pax on those legs)}`. Note: my logbook only contains my own flights, so this captures "visits where I was the pilot to/from my own airport" — not third-party visits. Honest visitor PAX-share would require iterating live flights endpoint over time; for v1 we show **live visitors now** + **my flights from my airports** and label clearly.
- `paxByAirport`, `paxByAircraft`, `paxByLicense` rollups for charts.
- Airport tier label: `category 4 → T4 Large`, `3 → T3 Medium`, `2 → T2 Regional`, `1 → T1 Small`.

New types: `AirportTier`, `AirportVisitor`, `LicenseSummary`, `AircraftSummary`, and extend `SimflyPayload` with `availablePax`, `lifetimePax`, `paxLast7d`, `paxLast30d`.

## Overview (`/`)

- Headline stat changes:
  - "Available PAX" (was "Total PAX") — `availablePax`, with `lifetimePax` as the subtitle.
  - "PAX last 7d" and "PAX last 30d" as two extra stat cards.
  - Keep Aircraft / Hubs counts.
- Earnings chart: **PAX only** (drop the XP series — it visually flattens PAX).
- "Top hubs" cards switch primary metric from XP to lifetime PAX; show tier badge (T4/T3/T2) and `rotation/maxRotation (remaining)`.

## Airports (`/airports`)

- New "Tier" column rendered as a colored badge (T4 cyan, T3 amber, T2 violet).
- Rotations column shows `used/max (remaining)` with the remaining number tinted green when >25 % capacity, amber <25 %, red at 0.
- Add columns: "PAX 7d" and "PAX 30d" computed from the flight rollup for flights touching that airport.
- Keep search/sort; default sort = lifetime PAX desc.

## Airport drill-in (`/airports/$id`) — already exists

- Add Tier badge, available-vs-max rotation block with restore countdown, percToUser %, and a **Live visitors** table (from `/api/asset/airport/{ICAO}/flights`, filtered to exclude me): username, aircraft, route, sim. Each row links to `/players/$handle`.

## NEW Aircraft page (`/aircraft`)

Table of every owned airplane: thumbnail, tail / type, current ICAO, level + progress bar, **lifetime PAX (primary)**, lifetime XP, status (active / in ground op with countdown). Sortable, default by lifetime PAX desc. Row links to `/aircraft/$id` drill-in (basic v1: detail JSON from `/api/user/assets/details/airplane/{uuid}` rendered as stat grid + my recent flights filtered to that `aircraftId`).

## NEW Licenses page (`/licenses`)

Table per license: badge image, name, rank (with rank name), level + progress, lifetime PAX (primary), lifetime XP. Drill-in `/licenses/$slug` shows my flights flown on that license (filter logbook by `licence` code).

## Stats (`/stats`)

- Chart 1: "PAX earnings — last 30 days" (single PAX series; remove XP).
- Chart 2: "PAX by asset" (bar chart, airports + aircraft, replaces XP by asset).
- Replace "Fleet Traffic" pie with **"Visitors on my airports"**: a stacked card per owned airport showing live visitor count (excluding me) + small table of current visitors (username, aircraft, route).

## Rankings (`/rankings`)

- "Top hubs by XP" → **Top hubs by lifetime PAX**.
- Each hub row shows tier badge + a thin progress bar "% to next airport level" derived from `level_progress`, replacing the raw XP figure.
- "Top players by PAX" stays, but secondary metric becomes their hub count.
- "Daily growth" board → **PAX per rotation cycle** (lifetime PAX ÷ totalRotations) — a cleaner efficiency metric than the current bogus daily number.

## Compare hubs (`/compare`)

Reorder + relabel columns:
1. Tier (T4/T3/T2 badge — primary sort).
2. Level (with % to next).
3. Lifetime PAX.
4. PAX per week (avg = paxLast30d × 7/30) — replaces "Monthly flow" / "Daily PAX".
5. Rotations used / max (remaining).
6. Owner.

Drop XP columns entirely.

## Community (`/community`)

Repurpose: instead of a generic player grid, show **"My visitors"** — aggregated from my logbook, grouped by counterpart pilot (the *other* end of each flight that involves one of my airports). For each visitor: avatar, handle, arrivals count, total `paxForVisitor / paxForMe`. Keep a separate "Browse all players" section below using the existing community list. Clearly label the visitor table's data source ("derived from my recent flights").

## Memory

Add a `mem://features/simfly-metrics.md` note: PAX > XP everywhere; tier mapping (cat 4=T4 Large, 3=T3 Medium, 2=T2 Regional, 1=T1 Small); rotation render `used/max (remaining)` with green/amber/red; available PAX endpoint `/api/user/pax`.

## Out of scope (deferred, per user)

- "View another player" search/switcher.
- Real third-party visitor revenue (would need a background poller against `/api/asset/airport/{ICAO}/flights`).

## Technical notes

- All new fetches stay in `simfly.functions.ts` server functions — no client-side SimFly calls, no leaked CORS.
- Flights fetched across 3 pages in parallel via `Promise.all([page1, page2, page3])` (≈24 flights) — bounded so SSR latency stays under ~1s.
- All new colors via existing semantic tokens (cyan / amber / violet / emerald / rose) — no hardcoded hex.
- License & Aircraft drill-in pages register through file-based routing only (`aircraft.tsx`, `aircraft.$id.tsx`, `licenses.tsx`, `licenses.$slug.tsx`); never hand-edit `routeTree.gen.ts`.
