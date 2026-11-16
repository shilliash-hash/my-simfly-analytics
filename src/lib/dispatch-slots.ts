/** Dispatch-only presentation data; never used in scoring or income. */
export type DispatchSlots = {
  capacity: number; used: number; free: number;
  weekStart: string; current: boolean;
  active?: boolean; fetchedAt?: string;
};

export const SLOT_CACHE_MS = 5 * 60_000;

export function slotWeekStart(now = new Date()): string {
  const day = (now.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - day)).toISOString();
}

export function slotsAreFresh(fetchedAt: string | null | undefined, now = new Date()): boolean {
  if (!fetchedAt) return false;
  const age = now.getTime() - Date.parse(fetchedAt);
  return age >= 0 && age < SLOT_CACHE_MS && Date.parse(fetchedAt) >= Date.parse(slotWeekStart(now));
}

export function parseDispatchSlots(json: unknown, now = new Date()): DispatchSlots | null {
  if (!json || typeof json !== "object") return null;
  const outer = json as Record<string, unknown>;
  const node = outer.data && typeof outer.data === "object" ? outer.data as Record<string, unknown> : outer;
  if (node.active === false) {
    return { capacity: 0, used: 0, free: 0, active: false, current: true, weekStart: slotWeekStart(now), fetchedAt: now.toISOString() };
  }
  const capacity = node.maxRotation;
  const used = node.rotation;
  if (typeof capacity !== "number" || !Number.isFinite(capacity) || capacity < 0 ||
      typeof used !== "number" || !Number.isFinite(used) || used < 0) return null;
  return { capacity, used, free: Math.max(0, capacity - used), active: node.active === true ? true : undefined,
    current: true, weekStart: slotWeekStart(now), fetchedAt: now.toISOString() };
}
