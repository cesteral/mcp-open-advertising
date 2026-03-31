// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Pacing calculation utility.
 *
 * Computes actual vs expected spend rate for a campaign flight, determines
 * pacing status, and projects end-of-flight spend.
 *
 * Ported from dbm-mcp BidManagerService so that all MCP servers can offer
 * consistent pacing analysis without duplicating the math.
 */

export type PacingStatusValue = "ON_PACE" | "AHEAD" | "BEHIND" | "SEVERELY_BEHIND";

export interface PacingInput {
  /** Amount spent so far in the flight (currency units) */
  spendToDate: number;
  /** Total campaign budget for the flight (currency units) */
  budgetTotal: number;
  /** Flight start date (YYYY-MM-DD) */
  flightStartDate: string;
  /** Flight end date (YYYY-MM-DD) */
  flightEndDate: string;
}

export interface PacingResult {
  /** Expected spend percentage at this point in the flight */
  expectedSpendPercent: number;
  /** Actual spend percentage of total budget */
  actualSpendPercent: number;
  /** Ratio of actual / expected (1.0 = perfectly on pace) */
  pacingRatio: number;
  /** Pacing status classification */
  status: PacingStatusValue;
  /** Projected total spend at end of flight based on current burn rate */
  projectedEndSpend: number;
  /** Calendar days elapsed since flight start (inclusive) */
  daysElapsed: number;
  /** Calendar days remaining until flight end */
  daysRemaining: number;
  /** Total calendar days in the flight */
  totalDays: number;
}

/**
 * Calculate pacing status for a campaign flight.
 *
 * @param input - Spend and flight date parameters
 * @returns Comprehensive pacing result with status and projections
 */
export function calculatePacingStatus(input: PacingInput): PacingResult {
  const { spendToDate, budgetTotal, flightStartDate, flightEndDate } = input;

  const today = new Date().toISOString().split("T")[0]!;

  const totalDays = daysBetween(flightStartDate, flightEndDate) + 1;

  // Pre-flight: flight hasn't started yet
  if (today < flightStartDate) {
    return {
      expectedSpendPercent: 0,
      actualSpendPercent: roundN(safeDivide(spendToDate, budgetTotal, 0) * 100, 2),
      pacingRatio: 0,
      status: "BEHIND",
      projectedEndSpend: 0,
      daysElapsed: 0,
      daysRemaining: totalDays,
      totalDays,
    };
  }

  // Use today or flight end, whichever is earlier
  const effectiveEndDate = today < flightEndDate ? today : flightEndDate;
  const daysPassed = daysBetween(flightStartDate, effectiveEndDate) + 1;
  const daysRemaining = Math.max(0, totalDays - daysPassed);

  const expectedSpendPercent = roundN(safeDivide(daysPassed, totalDays, 0) * 100, 2);
  const actualSpendPercent = roundN(safeDivide(spendToDate, budgetTotal, 0) * 100, 2);
  const pacingRatio = roundN(safeDivide(actualSpendPercent, expectedSpendPercent, 0), 4);

  let status: PacingStatusValue;
  if (pacingRatio >= 0.95 && pacingRatio <= 1.05) {
    status = "ON_PACE";
  } else if (pacingRatio > 1.05) {
    status = "AHEAD";
  } else if (pacingRatio >= 0.8) {
    status = "BEHIND";
  } else {
    status = "SEVERELY_BEHIND";
  }

  const dailySpendRate = safeDivide(spendToDate, daysPassed, 0);
  const projectedEndSpend = roundN(spendToDate + dailySpendRate * daysRemaining, 2);

  return {
    expectedSpendPercent,
    actualSpendPercent,
    pacingRatio,
    status,
    projectedEndSpend,
    daysElapsed: daysPassed,
    daysRemaining,
    totalDays,
  };
}

function daysBetween(startDate: string, endDate: string): number {
  const start = new Date(startDate + "T00:00:00Z");
  const end = new Date(endDate + "T00:00:00Z");
  return Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

function safeDivide(numerator: number, denominator: number, fallback: number): number {
  if (denominator === 0 || !isFinite(denominator) || isNaN(denominator)) {
    return fallback;
  }
  return numerator / denominator;
}

function roundN(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}
