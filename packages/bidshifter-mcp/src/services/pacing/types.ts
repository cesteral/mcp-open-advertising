/**
 * Types for advanced pacing optimization with feedback loops
 */

/**
 * Pacing adjustment type
 */
export type AdjustmentType = "cpm" | "markup";

/**
 * Pacing status categories
 */
export type PacingStatusType = "ON_PACE" | "AHEAD" | "BEHIND" | "SEVERELY_BEHIND";

/**
 * Parameters for calculating pacing adjustment factor
 */
export interface PacingAdjustmentParams {
  /** Line item ID for logging */
  lineItemId: string;
  /** Yesterday's pacing ratio (actual/target) - above 1 means overpacing */
  yesterdayPacing: number;
  /** Insertion Order's pacing ratio - can act as a constraint on adjustments */
  insertionOrderPacing?: number;
  /** CPM metrics for different pacing ranges to inform adjustments */
  cpmByPacingRange?: CPMPacingRange;
  /** Budget data for protection mechanisms */
  budgetData?: BudgetData;
  /** Previous adjustment tracking for feedback loop */
  previousAdjustment?: AdjustmentFeedback;
  /** Current value (CPM in micros or markup percentage) */
  currentValue: number;
  /** Minimum allowed value */
  minValue?: number;
  /** Maximum allowed value */
  maxValue?: number;
  /** Adjustment percentage (0.02 = 2% default) */
  adjustmentRate?: number;
  /** Optimal pacing target (default 0.95 = 95% of target) */
  optimalPacingTarget?: number;
  /** Tolerance band around optimal pacing (default 0.1 = +/-10%) */
  pacingTolerance?: number;
}

/**
 * CPM metrics at different pacing levels
 */
export interface CPMPacingRange {
  underpacingCPM?: number;
  optimalPacingCPM?: number;
  overpacingCPM?: number;
}

/**
 * Budget information for protection mechanisms
 */
export interface BudgetData {
  remainingBudget: number;
  totalBudget: number;
  daysRemaining: number;
  percentBudgetSpent: number;
}

/**
 * Feedback data from previous adjustment for learning loop
 */
export interface AdjustmentFeedback {
  /** Date of the previous adjustment (YYYY-MM-DD) */
  date: string;
  /** The factor that was applied (e.g., 1.05 = 5% increase) */
  adjustmentFactor: number;
  /** Type of adjustment */
  adjustmentType: AdjustmentType;
  /** Pacing ratio before adjustment */
  pacingBefore: number;
  /** Pacing ratio after adjustment (observed next day) */
  pacingAfter?: number;
  /** Calculated effectiveness score (-1 to 1) */
  effectiveness?: number;
}

/**
 * Result of CPM adjustment calculation
 */
export interface CPMAdjustmentResult {
  cpm: number;
  feedback: AdjustmentFeedback;
}

/**
 * Result of markup adjustment calculation
 */
export interface MarkupAdjustmentResult {
  markup: number;
  feedback: AdjustmentFeedback;
}

/**
 * Pacing constants for thresholds and rates
 */
export const PACING_CONSTANTS = {
  /** Default calculation precision */
  CALCULATION_PRECISION: 4,
  /** Default daily adjustment rate (2%) */
  DAILY_ADJUSTMENT_RATE: 0.02,
  /** Optimal pacing threshold (95% of target) */
  OPTIMAL_PACING_THRESHOLD: 0.95,
  /** Lower bound for acceptable pacing (85%) */
  PACING_LOWER_BOUND: 0.85,
  /** Upper bound for acceptable pacing (105%) */
  PACING_UPPER_BOUND: 1.05,
  /** Minimum CPM in micros (1 micro) */
  MIN_CPM_MICROS: 1,
  /** Maximum markup percentage */
  MAX_MARKUP_PERCENTAGE: 100,
  /** Micros conversion factor */
  MICROS: 1_000_000,
  /** Thousand constant for CPM calculations */
  THOUSAND: 1000,
} as const;
