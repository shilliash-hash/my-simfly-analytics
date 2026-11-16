import { describe, it, expect } from "vitest";
import { aircraftTierMultiplier, awardedPoints } from "./dispatch-rules";
describe("aircraft tier multiplier", () => {
  it("tier 1-2 gives x2.5", () => { expect(aircraftTierMultiplier(1)).toBe(2.5); expect(aircraftTierMultiplier(2)).toBe(2.5); });
  it("tier 3-4 gives x1.5", () => { expect(aircraftTierMultiplier(3)).toBe(1.5); expect(aircraftTierMultiplier(4)).toBe(1.5); });
  it("tier 5+ gives x1.0", () => { expect(aircraftTierMultiplier(5)).toBe(1); expect(aircraftTierMultiplier(7)).toBe(1); });
  it("unknown aircraft gives x1.0", () => { expect(aircraftTierMultiplier(0)).toBe(1); });
  it("awards route points times multiplier", () => { expect(awardedPoints(20, 1)).toBe(50); });
});
