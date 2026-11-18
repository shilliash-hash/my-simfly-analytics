export const AIRPORT_BASES = [80, 160, 240, 320, 840, 1660, 2450] as const;
/** Stepped charter surcharge per paid PAX by aircraft tier (T1–T4); T5+ get none. */
export const CHARTER_BY_TIER: Record<number, number> = { 1: 12, 2: 10, 3: 8, 4: 6 };
export function charterSurcharge(tier: number) { return CHARTER_BY_TIER[tier] ?? 0; }
export const HANDLING_RATE = 0.025;
export function nominalCapacity(tier: number, level: number): number {
  const base = AIRPORT_BASES[tier - 1];
  if (!base || !Number.isInteger(tier)) throw new Error("Unknown airport tier");
  return base * (1 + 0.1 * (Math.max(1, level) - 1));
}
export function initialStock(capacity: number) { return capacity * 0.1; }
/** Natural regeneration rests at 95% of nominal capacity; anything above is the transit pool. */
export const NATURAL_CAP = 0.95;
/** Hours without a departure before the transit pool starts to burn out. */
export const BURNOUT_IDLE_HOURS = 24;
/** Regeneration and burnout both move 1% of nominal capacity per hour. */
export const HOURLY_RATE = 0.01;
/** Share of paid arriving PAX whose journey ends at the arrival airport (random per flight). */
export const DISSOLVE_MIN = 0.4;
export const DISSOLVE_MAX = 0.6;
/** Below 95%: +1%/h up to 95%. At/above 95%: −1%/h during idle burnout hours, never below 95%, never above 150%. */
export function regeneratedStock(stock: number, capacity: number, hours: number, burnoutHours = 0) {
  const floor = capacity * NATURAL_CAP;
  if (stock < floor) return Math.min(floor, stock + capacity * HOURLY_RATE * Math.max(0, hours));
  return Math.min(capacity * 1.5, Math.max(floor, stock - capacity * HOURLY_RATE * Math.max(0, burnoutHours)));
}
/** Hours of the interval [from, to] that fall after 24 h without a departure. */
export function burnoutHours(from: number, to: number, lastDepartureAt: number) {
  return Math.max(0, (to - Math.max(from, lastDepartureAt + BURNOUT_IDLE_HOURS * 3600_000)) / 3600_000);
}
/** Stock at `to`, starting from `stock` at `from`, given the last departure time (or opening time if none). */
export function projectedStock(stock: number, capacity: number, from: number, to: number, lastDepartureAt: number) {
  return regeneratedStock(stock, capacity, (to - from) / 3600_000, burnoutHours(from, to, lastDepartureAt));
}
/** PAX that end their journey on arrival; roll in [0,1] maps to 40–60% of paid PAX. The rest stay for connections. */
export function dissolvedPax(accepted: number, roll: number) {
  const r = Math.min(1, Math.max(0, roll));
  return Math.round(accepted * (DISSOLVE_MIN + (DISSOLVE_MAX - DISSOLVE_MIN) * r));
}
export function operationalCost(tier: number) {
  if (!Number.isInteger(tier) || tier < 1 || tier > 7) throw new Error("Unknown aircraft tier");
  return tier <= 2 ? 0.25 : tier <= 4 ? 0.4 : tier === 5 ? 0.5 : 0.7;
}
export const coinRound = (n: number) => Math.round(n * 1000) / 1000;
export function predictHaul(input: { stock: number; seats: number; destinationStock: number; destinationCapacity: number; tier: number; distanceNm: number }) {
  const boarded = Math.max(0, Math.min(Math.floor(input.stock), Math.floor(input.seats)));
  const accepted = Math.min(boarded, Math.max(0, Math.floor(input.destinationCapacity * 1.5 - input.destinationStock)));
  const rate = Math.max(0, input.distanceNm) / 10 + charterSurcharge(input.tier);
  const gross = coinRound(accepted * rate);
  const costs = coinRound(boarded * rate * operationalCost(input.tier));
  const fee = coinRound(gross * HANDLING_RATE);
  return { boarded, accepted, unpaid: boarded - accepted, rate, gross, costs, net: coinRound(gross - costs - 2 * fee), originFee: fee, destinationFee: fee };
}
/** Missed-flight recovery from official SimFly logs runs at most once per this many minutes. */
export const LOG_SWEEP_MINUTES = 60;
/** A flight not yet visible in the arrival log is retried until SimFly has had this long to publish it. */
export const LOG_PUBLISH_GRACE_MS = 3 * 3600_000;
export type LogOutcome = "recorded" | "exists" | "rejected" | "pending";
export function missingLogOutcome(startedAt: number, now: number): LogOutcome {
  return now - startedAt < LOG_PUBLISH_GRACE_MS ? "pending" : "rejected";
}
/** Advance a pilot's logbook cursor only past flights that are fully handled; a pending flight keeps the cursor just before it. */
export function nextLogCursor(since: number, entries: { startedAt: number; outcome: LogOutcome }[]): number {
  const pending = entries.filter(e => e.outcome === "pending").map(e => e.startedAt);
  if (pending.length) return Math.max(since, Math.min(...pending) - 1);
  return Math.max(since, ...entries.map(e => e.startedAt));
}
/** SimFly-owned (system) airports have no passenger pool: departures board at most 75% of seats. */
export const SYSTEM_LOAD_FACTOR = 0.75;
export function systemBoarding(seats: number) { return Math.floor(Math.max(0, seats) * SYSTEM_LOAD_FACTOR); }
/** Owner label stored for SimFly-owned (system) endpoints; their 2.5% handling is a coin sink, credited to nobody. */
export const SYSTEM_OWNER = "SimFly";
export type RouteKind = "network" | "from-system" | "to-system" | "ineligible";
/** Player↔player is the classic network; one system endpoint is a hybrid; system↔system earns nothing. */
export function routeKind(originSystem: boolean, destinationSystem: boolean): RouteKind {
  if (originSystem && destinationSystem) return "ineligible";
  return originSystem ? "from-system" : destinationSystem ? "to-system" : "network";
}
/** SimFly publishes no flight log for system airports, so a hybrid flight is verified in its player airport's log (which lists departures and arrivals). */
export function verificationAirport(origin: string, destination: string, destinationSystem: boolean) {
  return destinationSystem ? origin : destination;
}
/** Arrival at a system airport: every paid passenger ends the journey there; nothing is stored. */
export function arrivalOutcome(accepted: number, roll: number, destinationSystem: boolean) {
  const dissolved = destinationSystem ? accepted : dissolvedPax(accepted, roll);
  return { dissolved, stays: accepted - dissolved };
}
