## Goal

Make the SimFly historical import (a) actually reach the very last logbook page for every pilot, (b) survive page refreshes / reconnects without restarting, and (c) show real live progress + ETA from a single source of truth.

Today the import runs inline inside `getSimflyPayload` — every refresh re-fetches all pages from scratch, and if the serverless request hits its time budget it returns whatever it has, which is exactly why your graph and activity feed cut off around 23.06.2026.

## What changes

### 1. Enable Lovable Cloud (required)

We need durable storage for two things: the imported flights and the per-pilot backfill progress row. A stateless Cloudflare Worker cannot do "resume from page N" without it. Cloud also gives us the room to run the importer as a background job instead of inside the page request.

### 2. New tables (public schema, RLS + GRANTs)

```text
backfill_progress
  username (pk)         total_pages           current_page
  flights_imported      flights_total_est     status (running|completed|failed|paused)
  last_page_at          started_at            updated_at
  error_message

simfly_flights
  username + flight_id (composite pk, dedupe across re-runs)
  + all RawFlightLite columns we already consume
  mission_start_ts indexed
```

Both tables get `GRANT SELECT, INSERT, UPDATE ON ... TO authenticated` plus `GRANT ALL ... TO service_role`. RLS scopes rows to the viewer's username via a small `viewed_username` claim/header check — reads are public-by-username for the dashboard.

### 3. Background importer (server route)

`POST /api/public/backfill/start` (signature-free, username in body) and `GET /api/public/backfill/status?username=`:

- `start` upserts `backfill_progress` to `running`, discovers `totalPages` from `/user/flights?page=1`, and kicks off processing with `ctx.waitUntil(...)` so the Worker keeps draining pages after the HTTP response returns `202 Accepted`.
- Pages are fetched in small concurrent batches (6 at a time). After each batch:
  - new flights `upsert` into `simfly_flights` with `onConflict: username,flight_id, ignoreDuplicates:true`
  - `current_page`, `flights_imported`, `last_page_at` are written to `backfill_progress`
- On any caught error the row flips to `failed` with `error_message`; the next `start` call resumes from `current_page + 1` instead of page 1.
- `status` returns the row as-is.

This is the exact "long job + waitUntil + DB-backed progress + client polls" pattern from the Lovable knowledge base.

### 4. Reads come from the DB, not the live API

`getSimflyPayload` stops paginating the logbook itself. It still calls the fast SimFly endpoints (profile, stats, assets, available PAX, live flights), but the historical `flights` array is loaded from `simfly_flights` for the viewed username. If the row is missing or older than ~5 minutes, the server fn fires `start` once (fire-and-forget) so a fresh visitor automatically triggers the backfill.

Graphs, activity, payout matrix, aircraft analytics, airport analytics — all of them already consume `data.flights`, so they pick up the full history with no per-page changes.

### 5. Live progress UI

`BackfillProgress` is rewritten around a `useQuery` that polls `getBackfillStatus` every 2s while `status === "running"`. It shows the persisted fields exactly:

```text
Backfill Progress: Page 87 / 203
Flights Imported: 696
Progress: 43%
ETA: ~3m 20s   (derived from pages/sec since started_at)
```

When `status === "completed"`, the indicator disappears on next refresh; the suspense fallback only blocks the very first load (before any rows exist). After that, refreshes return instantly from the DB even mid-import.

### 6. Resume behaviour

- Page refresh: status query immediately reads the persisted row, UI keeps counting from where it was; importer is still running in the worker.
- Worker eviction / 502: next `status` poll sees `last_page_at` is stale (>30s) and `status === "running"` → client calls `start` again, server picks `current_page + 1` and continues.
- "Force re-import" button on `/consistency` for manual full rebuild (sets `current_page = 0`, truncates `simfly_flights` for that username).

## Technical notes

- All new server logic uses TanStack `createServerFn` + one server route under `/api/public/backfill/*`. The route is public-by-design (no PII written, username is the only key).
- Supabase access uses `requireSupabaseAuth` for the dashboard reads when signed in, and the server publishable client for the public-by-username reads used by the "view as pilot" feature.
- `fetchAircraftOwnedVisitorBackfill` (aircraft visitor history) is migrated to the same job row so its progress contributes to the same percent.
- No client-side `localStorage` for progress — the DB row is the only source of truth, matching the "survives browser restarts" requirement.

## Files touched

- new migration: `backfill_progress`, `simfly_flights` (+ GRANTs + RLS)
- new: `src/routes/api/public/backfill/start.ts`, `src/routes/api/public/backfill/status.ts`
- new: `src/lib/backfill.functions.ts` (`getBackfillStatus`, `triggerBackfill`)
- edit: `src/lib/simfly.functions.ts` — drop inline pagination, read from DB, auto-trigger
- edit: `src/components/backfill-progress.tsx` — real polling + persisted fields
- edit: `src/routes/__root.tsx` — fallback only blocks first-ever load

## Open question

Do you want **one shared cache** (anyone viewing `@luigi` reuses the same imported rows — fastest, lowest API load) or **per-viewer isolation** (every dashboard user re-imports for themselves)? Shared is the right default for a public dashboard, but say the word if you'd rather scope rows by viewer.
