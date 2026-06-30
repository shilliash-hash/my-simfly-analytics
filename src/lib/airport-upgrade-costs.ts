/**
 * Airport upgrade cost lookup + ROI rating helpers.
 *
 * Costs are in PAX tokens, indexed by Tier (1–6) and the *next* level the
 * airport will reach (e.g. L1→2 means upgrading from level 1 to level 2).
 * Values are a mix of community-confirmed numbers and mathematical
 * estimates and will be refined over time — keep them in one place.
 */

/** cost[tier][nextLevel] = PAX tokens required for that upgrade. */
const UPGRADE_COST_TABLE: Record<number, Record<number, number>> = {
  1: { 2: 1.80,   3: 7.40,   4: 13.10, 5: 43.50,  6: 86,    7: 155,   8: 255,   9: 390,    10: 570 },
  2: { 2: 5.38,   3: 22.38,  4: 39.19, 5: 129.53, 6: 255,   7: 460,   8: 760,   9: 1_160,  10: 1_700 },
  3: { 2: 15.41,  3: 43.10,  4: 92.47, 5: 245,    6: 480,   7: 860,   8: 1_420, 9: 2_150,  10: 3_150 },
  4: { 2: 65.81,  3: 179.21, 4: 385,   5: 760,    6: 1_450, 7: 2_550, 8: 4_100, 9: 6_200,  10: 9_000 },
  5: { 2: 175,    3: 470,    4: 980,   5: 1_900,  6: 3_450, 7: 5_900, 8: 9_300, 9: 13_900, 10: 20_000 },
  // Tier 6: no published numbers yet — extrapolate ~2.2× tier 5 until confirmed.
  6: { 2: 385,    3: 1_034,  4: 2_156, 5: 4_180,  6: 7_590, 7: 12_980, 8: 20_460, 9: 30_580, 10: 44_000 },
};

/** Per-level multiplicative bump in base PAX payout per passenger. */
export const PAYOUT_LEVEL_GROWTH = 0.10;

export function airportUpgradeCost(tier: number, nextLevel: number): number {
  const safeTier = Math.max(1, Math.min(6, Math.round(tier || 1)));
  const safeLevel = Math.max(2, Math.min(10, Math.round(nextLevel || 2)));
  const row = UPGRADE_COST_TABLE[safeTier] ?? UPGRADE_COST_TABLE[1];
  return row[safeLevel] ?? row[10];
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
