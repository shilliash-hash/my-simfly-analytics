export const AIRPORT_BASES = [80, 160, 240, 320, 840, 1660, 2450] as const;
export const CHARTER_PER_PAX = 25;
export const HANDLING_PER_PAX = 0.001;
export function nominalCapacity(tier: number, level: number): number {
  const base = AIRPORT_BASES[tier - 1];
  if (!base || !Number.isInteger(tier)) throw new Error("Unknown airport tier");
  return base * (1 + 0.1 * (Math.max(1, level) - 1));
}
export function initialStock(capacity: number) { return capacity * 0.1; }
export function regeneratedStock(stock: number, capacity: number, hours: number) {
  return stock >= capacity ? Math.min(stock, capacity * 1.5) : Math.min(capacity, stock + capacity * 0.01 * Math.max(0, hours));
}
export function operationalCost(tier: number) {
  if (!Number.isInteger(tier) || tier < 1 || tier > 7) throw new Error("Unknown aircraft tier");
  return tier <= 2 ? 0.25 : tier <= 4 ? 0.4 : tier === 5 ? 0.5 : 0.7;
}
export const coinRound = (n: number) => Math.round(n * 1000) / 1000;
export function predictHaul(input: { stock: number; seats: number; destinationStock: number; destinationCapacity: number; tier: number; distanceNm: number }) {
  const boarded = Math.max(0, Math.min(Math.floor(input.stock), Math.floor(input.seats)));
  const accepted = Math.min(boarded, Math.max(0, Math.floor(input.destinationCapacity * 1.5 - input.destinationStock)));
  const rate = Math.max(0, input.distanceNm) / 10 + (input.tier < 4 ? CHARTER_PER_PAX : 0);
  const gross = coinRound(accepted * rate);
  const costs = coinRound(boarded * rate * operationalCost(input.tier));
  return { boarded, accepted, unpaid: boarded - accepted, rate, gross, costs, net: coinRound(gross - costs), originFee: coinRound(boarded * HANDLING_PER_PAX), destinationFee: coinRound(accepted * HANDLING_PER_PAX) };
}
