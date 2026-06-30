/**
 * Airport upgrade cost lookup + ROI rating helpers.
 *
 * SimFly does not expose an official upgrade-cost endpoint, so this table
 * encodes the community-documented cost progression per Tier × next-Level
 * (PAX tokens). The numbers approximate the in-game cost to upgrade an
 * airport from `L (level-1)` to `L (nextLevel)`. Keep them in one place so
 * they can be tuned without touching UI or server logic.
 *
 * Formula: cost(tier, nextLevel) ≈ BASE[tier] * GROWTH^(nextLevel - 2)
 *
 * Per the user's observation, the per-passenger payout grows roughly 10%
 * per airport level. We expose that as a single tunable so future game
 * changes are a one-line edit.
 */

const TIER_BASE_COST: Record<number, number> = {
  1: 250,
  2: 600,
  3: 1_500,
  4: 4_000,
  5: 10_000,
  6: 22_000,
};
const COST_GROWTH = 1.45;

/** Per-level multiplicative bump in base PAX payout per passenger. */
export const PAYOUT_LEVEL_GROWTH = 0.10;

export function airportUpgradeCost(tier: number, nextLevel: number): number {
  const safeTier = Math.max(1, Math.min(6, Math.round(tier || 1)));
  const safeLevel = Math.max(2, Math.round(nextLevel || 2));
  const base = TIER_BASE_COST[safeTier] ?? TIER_BASE_COST[1];
  return Math.round(base * Math.pow(COST_GROWTH, safeLevel - 2));
}

export type AdvisorRating = 1 | 2 | 3 | 4 | 5;

export function ratingForPaybackDays(days: number): {
  stars: AdvisorRating;
  label: string;
} {
  if (!Number.isFinite(days) || days <= 0) {
    return { stars: 1, label: "No data" };
  }
  if (days <= 30) return { stars: 5, label: "Outstanding investment" };
  if (days <= 60) return { stars: 4, label: "Excellent" };
  if (days <= 120) return { stars: 3, label: "Good" };
  if (days <= 240) return { stars: 2, label: "Long payback" };
  return { stars: 1, label: "Poor investment" };
}
