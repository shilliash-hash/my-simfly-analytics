## Weekly Hub Support System (revised)

A lightweight access-control layer that gates only the two heaviest analytical pages (Upgrade Advisor + Payout Matrix) behind either (a) one qualifying arrival at any of my airports this SimFly week, or (b) a donation. Everything else stays free.

### 1. Database

New table `public.hub_support` (service-role only, matching `backfill_progress` / `airport_upgrade_cache`):

- `username text` (lowercase)
- `week_start_utc timestamptz` — Monday 00:00 UTC of the SimFly week; trivial equality comparisons, no ISO-week parsing, no year-edge bugs
- `support_source text` — `'airport' | 'donation' | 'admin'`
- `qualifying_icao text` (nullable)
- `qualifying_flight_id text` (nullable)
- `qualifying_arrival_at timestamptz` (nullable)
- `activated_at timestamptz default now()`
- `updated_at timestamptz default now()`
- PK: `(username, week_start_utc)` — one row per pilot per week; idempotent upserts
- Index on `(week_start_utc)` for the community counter

Feature flag lives in the existing `public.app_settings` table under key `hub_support` with value `{ "enabled": true, "admin_bypass": true }` — no new settings table. When `enabled=false`, `hasWeeklyHubSupport()` always returns true.

UI displays "Week 29" derived from `week_start_utc`; storage stays numeric-friendly.

### 2. Server helpers (`src/lib/hub-support.server.ts` + `hub-support.functions.ts`)

- `currentSimflyWeekStart(now = new Date())` → `Date` at Monday 00:00 UTC.
- `recordAirportArrivalSupportForBatch(username, ownedIcaosLower, pageFlights)` — server-only. Called once per imported page/batch (not per row). Scans the page in memory for the first flight whose arrival ICAO ∈ owned set AND arrival ts ≥ current week start; if found, single `INSERT … ON CONFLICT (username, week_start_utc) DO NOTHING`. Zero writes when the row already exists or no qualifying flight in the batch.
- `recordDonationSupport(username)` — upsert with source=`donation`.
- `adminGrantSupport(username, weekStart?)` — admin action.
- `getWeeklyHubSupport(username)` server fn → `{ active, weekStart, source, qualifyingIcao, qualifyingArrivalAt, featureEnabled, adminBypass }`. Single PK lookup.
- `getActiveSupportersThisWeek()` — cached (5 min server memo) `SELECT count(*) WHERE week_start_utc = $1`; powers the community counter.
- `hasWeeklyHubSupport(username, ctx)` — returns true when: feature disabled OR admin bypass active for caller (admin token present or `admin_bypass=true` + username is owner) OR a `hub_support` row exists for current week.

### 3. Admin bypass

Two paths, both handled inside `hasWeeklyHubSupport`:
- `admin_bypass=true` in `app_settings.hub_support` → any request carrying a valid admin token passes (useful on staging).
- Owner username hardcoded via existing admin-owner recognition → optional; controlled from the admin settings card.

### 4. Wiring into existing sync

Call `recordAirportArrivalSupportForBatch` **once per page/batch**, not per row, in the three existing write paths:

- `backfill.functions.ts` — after each page's upsert loop
- `simfly.functions.ts` incremental sync path — after the batch upsert
- Any completed-flight upsert in `upsertFlightRows` — after the batch commit

The owned-ICAO set is already computed for visitor tracking — reuse it. No new polling, no historical scans, no page-load recalculation.

### 5. Protected pages

Gate only:

- `/upgrade-advisor`
- `/payout-matrix`

Their server fns call `hasWeeklyHubSupport(username)` at the top; on false, throw `{ code: 'HUB_SUPPORT_REQUIRED' }`. Route components catch that and render `<HubSupportGate />` (friendly card with airport-visit + coffee CTAs) instead of the analytics.

Future premium features just call the same helper — no new permission logic.

### 6. UI

- `<HubSupportCard />` on the homepage — compact card with:
  - Status (🟢 Active / ⚪ Not Active)
  - Current week label ("Week 29") derived from `week_start_utc`
  - Activated by (✈️ Airport Visit / ☕ Donation / 🛠 Admin) + qualifying arrival (ICAO + time) when airport
  - **Active supporters this week: N pilots** (community counter)
- `<HubSupportGate />` — full-card fallback on protected pages when inactive.
- Sidebar copy under "Buy me a coffee" replaced with:
  > Enjoying SimFly Hub? ☕ Buy me a coffee to help cover hosting and development.
  > Prefer to support me in-game? ✈️ Fly to one of my airports just one time a week instead — every landing is just as appreciated and helps keep SimFly Hub online. ❤️
- Admin page (`/admin`) — new "Hub Support" section visible only when admin token is set: toggle `enabled`, toggle `admin_bypass`, manual grant for a username, list of this week's active supporters.

### 7. Performance

- Page render cost = 1 indexed PK lookup on `hub_support`, cached client-side (staleTime 5 min).
- Community counter = 1 aggregate query behind a 5 min server memo.
- Support only mutates as a side effect of existing page/batch writes — at most one extra INSERT per pilot per week, `ON CONFLICT DO NOTHING`.
- Zero historical scans, zero polling, zero background jobs.

### Technical notes

- `week_start_utc` computed as: take `now` in UTC, subtract `((getUTCDay()+6)%7)` days, zero the time. Pure arithmetic, deterministic, safe across year boundaries.
- All new tables follow existing sensitive-table pattern: `GRANT ALL … TO service_role`, RLS enabled, no anon/authenticated policies. Access only through server functions using `supabaseAdmin`.

### Out of scope

- Real donation webhook (deferred until Paddle/Stripe is enabled); `recordDonationSupport` is wired but only reachable via admin grant for now.
- Retroactive backfill of `hub_support` for past weeks — only the current week matters.
