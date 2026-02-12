import { describe, it, expect } from "vitest";
import {
  round,
  isValidNumber,
  safeNumber,
  safeDivide,
  safePercentage,
  safePerMille,
  clamp,
  DEFAULT_PRECISION,
} from "../../src/utils/math.js";

// =============================================================================
// round
// =============================================================================

describe("round", () => {
  it("rounds to DEFAULT_PRECISION (4) decimal places by default", () => {
    expect(round(3.14159265)).toBe(3.1416);
    expect(round(1.00005)).toBe(1.0001);
  });

  it("rounds to specified decimal places", () => {
    expect(round(3.14159, 2)).toBe(3.14);
    expect(round(3.14159, 0)).toBe(3);
    expect(round(3.14159, 6)).toBe(3.14159);
  });

  it("handles negative numbers", () => {
    expect(round(-3.14159, 2)).toBe(-3.14);
    expect(round(-1.5, 0)).toBe(-1);
    expect(round(-2.7, 0)).toBe(-3);
  });

  it("handles zero", () => {
    expect(round(0)).toBe(0);
    expect(round(0, 2)).toBe(0);
  });

  it("handles whole numbers", () => {
    expect(round(42, 2)).toBe(42);
    expect(round(100, 0)).toBe(100);
  });

  it("handles very small numbers", () => {
    expect(round(0.00001, 4)).toBe(0);
    expect(round(0.00005, 4)).toBe(0.0001);
  });

  it("exports DEFAULT_PRECISION as 4", () => {
    expect(DEFAULT_PRECISION).toBe(4);
  });
});

// =============================================================================
// isValidNumber
// =============================================================================

describe("isValidNumber", () => {
  it("returns true for valid finite numbers", () => {
    expect(isValidNumber(0)).toBe(true);
    expect(isValidNumber(42)).toBe(true);
    expect(isValidNumber(-100)).toBe(true);
    expect(isValidNumber(3.14)).toBe(true);
    expect(isValidNumber(Number.MAX_SAFE_INTEGER)).toBe(true);
  });

  it("returns false for NaN", () => {
    expect(isValidNumber(NaN)).toBe(false);
  });

  it("returns false for Infinity", () => {
    expect(isValidNumber(Infinity)).toBe(false);
    expect(isValidNumber(-Infinity)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isValidNumber(undefined)).toBe(false);
  });

  it("returns false for null", () => {
    expect(isValidNumber(null)).toBe(false);
  });
});

// =============================================================================
// safeNumber
// =============================================================================

describe("safeNumber", () => {
  it("returns the number when it is valid", () => {
    expect(safeNumber(42)).toBe(42);
    expect(safeNumber(0)).toBe(0);
    expect(safeNumber(-5)).toBe(-5);
    expect(safeNumber(3.14)).toBe(3.14);
  });

  it("returns default value (0) for undefined", () => {
    expect(safeNumber(undefined)).toBe(0);
  });

  it("returns default value (0) for null", () => {
    expect(safeNumber(null)).toBe(0);
  });

  it("returns default value (0) for NaN", () => {
    expect(safeNumber(NaN)).toBe(0);
  });

  it("returns default value (0) for Infinity", () => {
    expect(safeNumber(Infinity)).toBe(0);
  });

  it("returns custom default value when provided", () => {
    expect(safeNumber(undefined, -1)).toBe(-1);
    expect(safeNumber(NaN, 99)).toBe(99);
    expect(safeNumber(null, 42)).toBe(42);
  });
});

// =============================================================================
// safeDivide
// =============================================================================

describe("safeDivide", () => {
  it("performs normal division", () => {
    expect(safeDivide(10, 2)).toBe(5);
    expect(safeDivide(7, 2)).toBe(3.5);
    expect(safeDivide(1, 3)).toBeCloseTo(0.3333, 4);
  });

  it("returns default value (0) for division by zero", () => {
    expect(safeDivide(10, 0)).toBe(0);
    expect(safeDivide(0, 0)).toBe(0);
  });

  it("returns custom default for division by zero", () => {
    expect(safeDivide(10, 0, -1)).toBe(-1);
  });

  it("returns default value for NaN numerator", () => {
    expect(safeDivide(NaN, 5)).toBe(0);
  });

  it("returns default value for NaN denominator", () => {
    expect(safeDivide(5, NaN)).toBe(0);
  });

  it("returns default value for Infinity numerator", () => {
    expect(safeDivide(Infinity, 5)).toBe(0);
  });

  it("returns default value for Infinity denominator", () => {
    expect(safeDivide(5, Infinity)).toBe(0);
  });

  it("handles negative numbers correctly", () => {
    expect(safeDivide(-10, 2)).toBe(-5);
    expect(safeDivide(10, -2)).toBe(-5);
    expect(safeDivide(-10, -2)).toBe(5);
  });

  it("handles zero numerator", () => {
    expect(safeDivide(0, 5)).toBe(0);
  });
});

// =============================================================================
// safePercentage
// =============================================================================

describe("safePercentage", () => {
  it("calculates percentage correctly", () => {
    expect(safePercentage(1, 2)).toBe(50);
    expect(safePercentage(1, 4)).toBe(25);
    expect(safePercentage(3, 4)).toBe(75);
  });

  it("returns 100 for equal numerator and denominator", () => {
    expect(safePercentage(5, 5)).toBe(100);
  });

  it("returns default value (0) for zero denominator", () => {
    expect(safePercentage(10, 0)).toBe(0);
  });

  it("returns custom default for zero denominator", () => {
    expect(safePercentage(10, 0, -1)).toBe(-1);
  });

  it("returns default for NaN inputs", () => {
    expect(safePercentage(NaN, 100)).toBe(0);
    expect(safePercentage(100, NaN)).toBe(0);
  });

  it("handles zero numerator", () => {
    expect(safePercentage(0, 100)).toBe(0);
  });

  it("can exceed 100%", () => {
    expect(safePercentage(3, 2)).toBe(150);
  });
});

// =============================================================================
// safePerMille
// =============================================================================

describe("safePerMille", () => {
  it("calculates per-mille (per thousand) correctly", () => {
    expect(safePerMille(1, 2)).toBe(500);
    expect(safePerMille(5, 1000)).toBe(5);
    expect(safePerMille(10, 10000)).toBe(1);
  });

  it("returns default value (0) for zero denominator", () => {
    expect(safePerMille(10, 0)).toBe(0);
  });

  it("returns custom default for zero denominator", () => {
    expect(safePerMille(10, 0, -1)).toBe(-1);
  });

  it("returns default for NaN inputs", () => {
    expect(safePerMille(NaN, 100)).toBe(0);
    expect(safePerMille(100, NaN)).toBe(0);
  });

  it("handles zero numerator", () => {
    expect(safePerMille(0, 100)).toBe(0);
  });

  it("handles typical CPM calculation", () => {
    // CPM: $50 spend / 10,000 impressions * 1000 = $5
    expect(safePerMille(50, 10000)).toBe(5);
  });
});

// =============================================================================
// clamp
// =============================================================================

describe("clamp", () => {
  it("returns value when within range", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(0, 0, 10)).toBe(0);
    expect(clamp(10, 0, 10)).toBe(10);
  });

  it("clamps to minimum when value is below range", () => {
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(-100, -50, 50)).toBe(-50);
  });

  it("clamps to maximum when value is above range", () => {
    expect(clamp(15, 0, 10)).toBe(10);
    expect(clamp(1000, -50, 50)).toBe(50);
  });

  it("returns min for NaN value", () => {
    expect(clamp(NaN, 0, 10)).toBe(0);
    expect(clamp(NaN, -5, 5)).toBe(-5);
  });

  it("returns min for Infinity value", () => {
    // isValidNumber(Infinity) returns false, so returns min
    expect(clamp(Infinity, 0, 10)).toBe(0);
  });

  it("handles equal min and max", () => {
    expect(clamp(5, 3, 3)).toBe(3);
    expect(clamp(1, 3, 3)).toBe(3);
  });

  it("handles negative ranges", () => {
    expect(clamp(-7, -10, -5)).toBe(-7);
    expect(clamp(-3, -10, -5)).toBe(-5);
    expect(clamp(-15, -10, -5)).toBe(-10);
  });
});
