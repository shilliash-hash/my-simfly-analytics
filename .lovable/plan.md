## What TOTAL actually is

For each flight, SimFly stores two PAX numbers on the airport side (`origin` / `destination`):

- `earnedPax` — your **standard Airport Profit Split** payout (BASE column, 0.73 in your screenshot). This is the `pax * percToUser` cut after applying any aircraft-rental adjustments.
- `bonusPax` — a separate **Weekly Cycle First-Movement ×3** transaction (BONUS, +1.46).
- `totalEarnedPax = earnedPax + bonusPax` — what actually hits your wallet when the flight lands (TOTAL, 2.19 — the 0.87 in your screenshot is the display bug from old data; will be fixed when re-rendered).

So TOTAL = real income to the airport owner. Everything else in the app already reports TOTAL; only the Payout Matrix and the Upgrade Advisor were using BASE.

## Changes

### 1. Payout Matrix drawer — make TOTAL the primary column
File: `src/routes/payout-matrix.tsx`
- Visually promote the TOTAL column: bold, runway-cyan, slightly larger; demote BASE/BONUS to muted reference columns.
- Add a tiny header tooltip on TOTAL: "Actual PAX credited to this airport on landing (BASE + BONUS)".
- Keep the cell averages computed from BASE so the per-tier baseline still isn't distorted by the ×3 bonus — explain this in the existing methodology paragraph.

### 2. Upgrade Advisor — switch from BASE to TOTAL airport income
File: `src/lib/simfly.functions.ts` (`getUpgradeAdvisor`)
- Today it queries `simfly_flights` (the viewer's own missions only) and averages `pax * percToUser`. That misses every visiting pilot's flight, which is the bulk of airport income.
- New source: for each owned airport, reuse the same public airport history endpoint the Payout Matrix already paginates, and sum `totalEarnedPax` (fallback `earnedPax + bonusPax`) on the airport side per flight — i.e. the TOTAL column.
- Average = simple mean of TOTAL per arrival over the chosen window (no top-15% trim, because TOTAL already represents real income and the user explicitly wants the bonus included).
- `arrivalsPerDay` = flights touching the airport in the window ÷ windowDays.
- `currentDailyPax = arrivalsPerDay * avgTotalPaxPerFlight`. Drop the separate `bonusDailyPax` synthetic addition — TOTAL already includes it.
- `dailyIncrease = currentDailyPax * PAYOUT_LEVEL_GROWTH` (10% per level, unchanged).
- Payback / annual / star rating logic unchanged.

### 3. Upgrade Advisor UI
File: `src/routes/upgrade-advisor.tsx`
- Rename the "Daily increase" methodology line: "Based on real TOTAL PAX credited to your airport (Airport Profit Split + Weekly Cycle ×3 bonus), averaged across all flights in the window."
- Remove the "incl. ×3 bonus +X/day" footer breakdown (no longer separated — it's inside TOTAL).
- Type change: rename `avgBasePaxPerFlight` → `avgTotalPaxPerFlight` in `UpgradeAdvisorRow`; remove `bonusDailyPax`. Update the only consumer (this file).

### 4. Caching
- Public airport history is paginated; cap to ~3 pages per airport per advisor request (same cap the matrix uses) and reuse the existing 90s server-side payload cache so the page stays snappy.

## Out of scope
- No change to Activity, Stats, Visitors, Income, Consistency — those already use TOTAL.
- No change to the upgrade cost table or `PAYOUT_LEVEL_GROWTH`.
