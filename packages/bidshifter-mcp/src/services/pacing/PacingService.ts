/**
 * PacingService - Advanced pacing optimization with feedback loops
 *
 * Provides intelligent bid and markup adjustments based on:
 * - Historical pacing performance
 * - CPM performance at different pacing levels
 * - Budget protection mechanisms
 * - Feedback-driven learning from previous adjustments
 */

import { injectable, inject } from "tsyringe";
import type { Logger } from "pino";
import * as Tokens from "../../container/tokens.js";
import { round, isValidNumber } from "../../utils/math.js";
import { createSuccess, createError, type Result } from "../../utils/result.js";
import {
  PACING_CONSTANTS,
  type PacingAdjustmentParams,
  type PacingStatusType,
  type AdjustmentFeedback,
  type CPMAdjustmentResult,
  type MarkupAdjustmentResult,
  type CPMPacingRange,
  type BudgetData,
} from "./types.js";

@injectable()
export class PacingService {
  constructor(@inject(Tokens.Logger) private logger: Logger) {}

  /**
   * Determines basic pacing status from pacing ratio
   *
   * @param pacingRatio - Ratio of actual to expected delivery
   * @returns Pacing status category
   */
  determinePacingStatus(pacingRatio: number): PacingStatusType {
    if (pacingRatio >= 0.95 && pacingRatio <= 1.05) {
      return "ON_PACE";
    } else if (pacingRatio > 1.05) {
      return "AHEAD";
    } else if (pacingRatio >= 0.8) {
      return "BEHIND";
    } else {
      return "SEVERELY_BEHIND";
    }
  }

  /**
   * Analyzes CPM performance at different pacing levels to determine the optimal pacing target.
   * If we observe that CPM performance is better at certain pacing levels, we can adjust our
   * target pacing to favor those levels.
   *
   * @param cpmByPacingRange - Object containing CPM values at different pacing ranges
   * @param defaultTarget - The default optimal pacing target (usually 0.95)
   * @returns The adjusted optimal pacing target
   */
  determineOptimalPacingTarget(
    cpmByPacingRange?: CPMPacingRange,
    defaultTarget: number = PACING_CONSTANTS.OPTIMAL_PACING_THRESHOLD
  ): number {
    if (!cpmByPacingRange) {
      return defaultTarget;
    }

    const { underpacingCPM, optimalPacingCPM, overpacingCPM } = cpmByPacingRange;

    // If we don't have at least two valid CPM values, return default
    const validCount = [underpacingCPM, optimalPacingCPM, overpacingCPM].filter(
      (cpm) => cpm !== undefined && isValidNumber(cpm) && cpm > 0
    ).length;

    if (validCount < 2) {
      return defaultTarget;
    }

    // Case: If optimal pacing gives the best CPM
    if (
      optimalPacingCPM !== undefined &&
      optimalPacingCPM > 0 &&
      (underpacingCPM === undefined || !isValidNumber(underpacingCPM) || optimalPacingCPM <= underpacingCPM) &&
      (overpacingCPM === undefined || !isValidNumber(overpacingCPM) || optimalPacingCPM <= overpacingCPM)
    ) {
      return defaultTarget;
    }

    // Case: If underpacing gives the best CPM
    if (
      underpacingCPM !== undefined &&
      isValidNumber(underpacingCPM) &&
      underpacingCPM > 0 &&
      (optimalPacingCPM === undefined || !isValidNumber(optimalPacingCPM) || underpacingCPM < optimalPacingCPM) &&
      (overpacingCPM === undefined || !isValidNumber(overpacingCPM) || underpacingCPM < overpacingCPM)
    ) {
      return defaultTarget * 0.9; // Target slightly lower pacing
    }

    // Case: If overpacing gives the best CPM
    if (
      overpacingCPM !== undefined &&
      isValidNumber(overpacingCPM) &&
      overpacingCPM > 0 &&
      (underpacingCPM === undefined || !isValidNumber(underpacingCPM) || overpacingCPM < underpacingCPM) &&
      (optimalPacingCPM === undefined || !isValidNumber(optimalPacingCPM) || overpacingCPM < optimalPacingCPM)
    ) {
      return defaultTarget * 1.1; // Target slightly higher pacing
    }

    return defaultTarget;
  }

  /**
   * Applies budget protection to prevent excessive bid increases
   * when budget is limited or campaign is near completion.
   *
   * @param adjustmentFactor - The calculated adjustment factor before budget protection
   * @param budgetData - Information about remaining budget and campaign timeline
   * @returns The adjustment factor after budget protection is applied
   */
  applyBudgetProtection(adjustmentFactor: number, budgetData?: BudgetData): number {
    // If no budget data or adjustment is not an increase, return unchanged
    if (!budgetData || adjustmentFactor <= 1) {
      return adjustmentFactor;
    }

    const { daysRemaining, percentBudgetSpent } = budgetData;

    // If more than 85% of budget is spent, constrain increases
    if (percentBudgetSpent > 0.85) {
      const remainingFactor = 1 - percentBudgetSpent;
      const scaledAdjustment = 1 + (adjustmentFactor - 1) * remainingFactor * 3;

      // Cap the increase to 2% when less than 5% of budget remains
      if (percentBudgetSpent > 0.95) {
        return Math.min(scaledAdjustment, 1.02);
      }

      return scaledAdjustment;
    }

    // If days remaining is very low but significant budget remains,
    // allow more aggressive increases
    if (daysRemaining <= 3 && percentBudgetSpent < 0.7) {
      return adjustmentFactor * 1.5;
    }

    return adjustmentFactor;
  }

  /**
   * Evaluates the effectiveness of a previous adjustment based on the
   * intended effect and the actual observed change in pacing.
   *
   * @param previousAdjustment - Information about the previous adjustment
   * @param optimalPacingTarget - The target pacing level (default: 0.95)
   * @returns A value between -1 and 1 indicating effectiveness
   */
  evaluateAdjustmentEffectiveness(
    previousAdjustment?: AdjustmentFeedback,
    optimalPacingTarget: number = PACING_CONSTANTS.OPTIMAL_PACING_THRESHOLD
  ): number {
    if (!previousAdjustment || previousAdjustment.pacingAfter === undefined) {
      return 0;
    }

    const { adjustmentFactor, adjustmentType, pacingBefore, pacingAfter } = previousAdjustment;

    if (!isValidNumber(pacingBefore) || !isValidNumber(pacingAfter) || pacingBefore <= 0 || pacingAfter <= 0) {
      return 0;
    }

    // Invert logic for markup adjustments (increase markup means decrease pacing)
    const isMarkupAdjustment = adjustmentType === "markup";
    const effectiveAdjustmentFactor = isMarkupAdjustment ? 1 / adjustmentFactor : adjustmentFactor;

    // Calculate distance to optimal pacing before and after
    const distanceBefore = Math.abs(pacingBefore - optimalPacingTarget);
    const distanceAfter = Math.abs(pacingAfter - optimalPacingTarget);

    // If we're moving closer to the target, that's positive effectiveness
    const distanceImprovement = distanceBefore - distanceAfter;

    // Calculate the expected change direction based on adjustment factor
    const expectedChangeDirection = effectiveAdjustmentFactor > 1 ? 1 : -1;
    const actualChangeDirection = pacingAfter > pacingBefore ? 1 : -1;

    // If expected and actual direction match, that's another indicator of effectiveness
    const directionAlignment = expectedChangeDirection === actualChangeDirection ? 1 : -1;

    // Calculate pacing change magnitude
    const changeMagnitude = Math.abs(pacingAfter - pacingBefore) / pacingBefore;
    const expectedChangeMagnitude = Math.abs(effectiveAdjustmentFactor - 1);

    // Calculate how close the actual change was to expected change
    const changeMagnitudeRatio = expectedChangeMagnitude > 0 ? Math.min(changeMagnitude / expectedChangeMagnitude, 2) : 0;

    // Combine factors: distance improvement (50%), direction alignment (30%), magnitude ratio (20%)
    const effectiveness =
      (distanceImprovement > 0 ? 1 : -1) * 0.5 + directionAlignment * 0.3 + changeMagnitudeRatio * directionAlignment * 0.2;

    return Math.max(-1, Math.min(1, effectiveness));
  }

  /**
   * Calculates an adjustment rate modifier based on the effectiveness of previous adjustments.
   *
   * @param previousAdjustment - Information about the previous adjustment
   * @returns A modifier to apply to the adjustment rate (0.5 to 1.5)
   */
  calculateAdjustmentRateModifier(previousAdjustment?: AdjustmentFeedback): number {
    if (!previousAdjustment) {
      return 1.0;
    }

    const effectiveness =
      previousAdjustment.effectiveness !== undefined
        ? previousAdjustment.effectiveness
        : this.evaluateAdjustmentEffectiveness(previousAdjustment);

    // Scale adjustment rate based on effectiveness
    return 1.0 + effectiveness * 0.5;
  }

  /**
   * Creates feedback data for storing the current adjustment's effect.
   *
   * @param adjustmentFactor - The calculated adjustment factor
   * @param adjustmentType - Whether this is a CPM or markup adjustment
   * @param yesterdayPacing - The current pacing (which will become "before" pacing next time)
   * @returns Feedback data for storage
   */
  createAdjustmentFeedback(
    adjustmentFactor: number,
    adjustmentType: "cpm" | "markup",
    yesterdayPacing: number
  ): AdjustmentFeedback {
    return {
      date: new Date().toISOString().substring(0, 10),
      adjustmentFactor,
      adjustmentType,
      pacingBefore: yesterdayPacing,
    };
  }

  /**
   * Calculates the pacing adjustment factor based on current and historical pacing data.
   *
   * @param params - Parameters for the adjustment calculation
   * @returns Result containing the adjustment factor (1.0 = no change)
   */
  calculatePacingAdjustmentFactor(params: PacingAdjustmentParams): Result<number> {
    const {
      lineItemId,
      yesterdayPacing,
      insertionOrderPacing,
      cpmByPacingRange,
      budgetData,
      previousAdjustment,
      currentValue,
      minValue = 0,
      maxValue = Number.MAX_SAFE_INTEGER,
      adjustmentRate = PACING_CONSTANTS.DAILY_ADJUSTMENT_RATE,
      optimalPacingTarget = PACING_CONSTANTS.OPTIMAL_PACING_THRESHOLD,
    } = params;

    try {
      // If no valid pacing data, return neutral factor
      if (!isValidNumber(yesterdayPacing) || yesterdayPacing <= 0) {
        this.logger.info({ lineItemId }, "No valid pacing data, using neutral factor");
        return createSuccess(1);
      }

      const effectivePacing = yesterdayPacing;

      // Determine the optimal pacing target based on CPM performance
      const adjustedOptimalTarget = this.determineOptimalPacingTarget(cpmByPacingRange, optimalPacingTarget);

      // If current value is at min or max, limit further adjustments in that direction
      if (currentValue <= minValue && effectivePacing > adjustedOptimalTarget) {
        this.logger.info({ lineItemId }, "Already at minimum value, cannot decrease further");
        return createSuccess(1);
      }

      if (currentValue >= maxValue && effectivePacing < adjustedOptimalTarget) {
        this.logger.info({ lineItemId }, "Already at maximum value, cannot increase further");
        return createSuccess(1);
      }

      const lowerBound = PACING_CONSTANTS.PACING_LOWER_BOUND;
      const upperBound = PACING_CONSTANTS.PACING_UPPER_BOUND;

      let adjustmentFactor = 1;

      // Check IO pacing for constraints
      const ioHasPacing = insertionOrderPacing !== undefined && isValidNumber(insertionOrderPacing) && insertionOrderPacing > 0;
      const ioPacingGood = ioHasPacing && insertionOrderPacing! >= lowerBound && insertionOrderPacing! <= upperBound;
      const ioUnderpacing = ioHasPacing && insertionOrderPacing! < lowerBound;
      const ioOverpacing = ioHasPacing && insertionOrderPacing! > upperBound;

      // Calculate volatility penalty
      const pacingVolatility =
        ioHasPacing && insertionOrderPacing! > 0
          ? Math.abs(yesterdayPacing - insertionOrderPacing!) / insertionOrderPacing!
          : 0;

      // Apply feedback loop modifier
      const feedbackModifier = this.calculateAdjustmentRateModifier(previousAdjustment);

      // Add volatility penalty - more volatile = more conservative
      const volatilityAdjustedRate = adjustmentRate * (1 - Math.min(pacingVolatility, 0.5));
      const finalAdjustmentRate = volatilityAdjustedRate * feedbackModifier;

      // Log feedback information
      if (previousAdjustment) {
        const effectiveness =
          previousAdjustment.effectiveness !== undefined
            ? previousAdjustment.effectiveness
            : this.evaluateAdjustmentEffectiveness(previousAdjustment);

        this.logger.info(
          {
            lineItemId,
            effectiveness: round(effectiveness * 100, PACING_CONSTANTS.CALCULATION_PRECISION),
            rateModifier: round(feedbackModifier, PACING_CONSTANTS.CALCULATION_PRECISION),
            finalAdjustmentRate: round(finalAdjustmentRate * 100, PACING_CONSTANTS.CALCULATION_PRECISION),
          },
          "Previous adjustment feedback applied"
        );
      }

      // Apply adjustment based on effective pacing
      if (effectivePacing < lowerBound) {
        // Underpacing: Increase value to drive more delivery
        if (ioOverpacing) {
          this.logger.info(
            { lineItemId, effectivePacing: round(effectivePacing * 100), ioPacing: round(insertionOrderPacing! * 100) },
            "Underpacing but IO is overpacing, not increasing bids"
          );
          return createSuccess(1);
        } else if (ioPacingGood) {
          // Apply reduced adjustment
          const pacingRatio = effectivePacing / adjustedOptimalTarget;
          const adjustmentStrength = Math.min(1 - pacingRatio, 0.5) / 2;
          adjustmentFactor = 1 + finalAdjustmentRate * adjustmentStrength * 3;

          this.logger.info(
            { lineItemId, effectivePacing: round(effectivePacing * 100), ioPacing: round(insertionOrderPacing! * 100) },
            "Underpacing but IO pacing is good, applying minimal increase"
          );
        } else {
          // Normal underpacing case - apply full adjustment
          const pacingRatio = effectivePacing / adjustedOptimalTarget;
          const adjustmentStrength = Math.min(1 - pacingRatio, 0.5);
          adjustmentFactor = 1 + finalAdjustmentRate * adjustmentStrength * 3;

          // Apply budget protection
          if (budgetData) {
            const protectedAdjustment = this.applyBudgetProtection(adjustmentFactor, budgetData);
            if (protectedAdjustment !== adjustmentFactor) {
              this.logger.info(
                {
                  lineItemId,
                  originalAdjustment: round((adjustmentFactor - 1) * 100, PACING_CONSTANTS.CALCULATION_PRECISION),
                  protectedAdjustment: round((protectedAdjustment - 1) * 100, PACING_CONSTANTS.CALCULATION_PRECISION),
                },
                "Budget protection applied"
              );
              adjustmentFactor = protectedAdjustment;
            }
          }

          this.logger.info(
            {
              lineItemId,
              effectivePacing: round(effectivePacing * 100),
              adjustmentPercent: round((adjustmentFactor - 1) * 100, PACING_CONSTANTS.CALCULATION_PRECISION),
            },
            "Underpacing, increasing bid"
          );
        }
      } else if (effectivePacing > upperBound) {
        // Overpacing: Decrease value to slow down delivery
        const adjustmentStrength = Math.min(effectivePacing - adjustedOptimalTarget, 0.5);

        if (ioUnderpacing) {
          // IO is underpacing, be conservative with the decrease
          adjustmentFactor = 1 - finalAdjustmentRate * adjustmentStrength;
          this.logger.info(
            { lineItemId, effectivePacing: round(effectivePacing * 100), ioPacing: round(insertionOrderPacing! * 100) },
            "Overpacing but IO is underpacing, applying minimal decrease"
          );
        } else {
          // Normal or stronger decrease
          const multiplier = ioOverpacing ? 2.5 : 2;
          adjustmentFactor = 1 - finalAdjustmentRate * adjustmentStrength * multiplier;

          this.logger.info(
            {
              lineItemId,
              effectivePacing: round(effectivePacing * 100),
              ioOverpacing,
              decreasePercent: round((1 - adjustmentFactor) * 100, PACING_CONSTANTS.CALCULATION_PRECISION),
            },
            "Overpacing, decreasing bid"
          );
        }
      } else {
        // Within tolerance: No adjustment needed
        this.logger.info({ lineItemId, effectivePacing: round(effectivePacing * 100) }, "Good pacing, no adjustment needed");
      }

      return createSuccess(round(adjustmentFactor, 4));
    } catch (error) {
      return createError("calculation", "Failed to calculate pacing adjustment factor", {
        lineItemId,
        yesterdayPacing,
        insertionOrderPacing,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Calculates pacing-adjusted CPM with feedback data for future learning
   *
   * @param params - CPM adjustment parameters
   * @returns Result containing adjusted CPM and feedback data
   */
  async calculatePacingAdjustedCPM(params: {
    lineItemId: string;
    baseValue: number;
    existingValue: number;
    yesterdayPacing: number;
    insertionOrderPacing?: number;
    cpmByPacingRange?: CPMPacingRange;
    budgetData?: BudgetData;
    previousAdjustment?: AdjustmentFeedback;
  }): Promise<Result<CPMAdjustmentResult>> {
    const {
      lineItemId,
      baseValue,
      existingValue,
      yesterdayPacing,
      insertionOrderPacing,
      cpmByPacingRange,
      budgetData,
      previousAdjustment,
    } = params;

    try {
      // If no base value, use existing value
      if (!isValidNumber(baseValue) || baseValue <= 0) {
        this.logger.info({ lineItemId }, "Invalid base CPM, using existing CPM");
        return createSuccess({
          cpm: existingValue,
          feedback: this.createAdjustmentFeedback(1, "cpm", yesterdayPacing),
        });
      }

      // Calculate adjustment factor
      const adjustmentFactorResult = this.calculatePacingAdjustmentFactor({
        lineItemId,
        yesterdayPacing,
        insertionOrderPacing,
        cpmByPacingRange,
        budgetData,
        previousAdjustment,
        currentValue: existingValue,
        minValue: PACING_CONSTANTS.MIN_CPM_MICROS,
        adjustmentRate: PACING_CONSTANTS.DAILY_ADJUSTMENT_RATE,
      });

      if (!adjustmentFactorResult.success) {
        return adjustmentFactorResult;
      }

      const adjustmentFactor = adjustmentFactorResult.data;
      const adjustedCPM = Math.round(existingValue * adjustmentFactor);

      const feedback = this.createAdjustmentFeedback(adjustmentFactor, "cpm", yesterdayPacing);

      this.logger.info({ lineItemId, adjustmentFactor, adjustedCPM }, "CPM adjustment calculated");

      return createSuccess({
        cpm: adjustedCPM,
        feedback,
      });
    } catch (error) {
      return createError("calculation", "Failed to calculate pacing-adjusted CPM", {
        lineItemId,
        baseValue,
        yesterdayPacing,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Calculates pacing-adjusted markup with feedback data for future learning
   *
   * @param params - Markup adjustment parameters
   * @returns Result containing adjusted markup and feedback data
   */
  async calculatePacingAdjustedMarkup(params: {
    lineItemId: string;
    baseMarkup: number;
    existingMarkup: number;
    yesterdayPacing: number;
    insertionOrderPacing?: number;
    cpmByPacingRange?: CPMPacingRange;
    budgetData?: BudgetData;
    previousAdjustment?: AdjustmentFeedback;
  }): Promise<Result<MarkupAdjustmentResult>> {
    const {
      lineItemId,
      baseMarkup,
      existingMarkup,
      yesterdayPacing,
      insertionOrderPacing,
      cpmByPacingRange,
      budgetData,
      previousAdjustment,
    } = params;

    try {
      if (!isValidNumber(baseMarkup)) {
        this.logger.info({ lineItemId }, "Invalid base markup, using existing markup");
        return createSuccess({
          markup: existingMarkup,
          feedback: this.createAdjustmentFeedback(1, "markup", yesterdayPacing),
        });
      }

      // For markup, we need to invert the adjustment logic:
      // - If underpacing, DECREASE markup to encourage more spend
      // - If overpacing, INCREASE markup to reduce spend
      const adjustmentFactorResult = this.calculatePacingAdjustmentFactor({
        lineItemId,
        yesterdayPacing,
        insertionOrderPacing,
        cpmByPacingRange,
        budgetData,
        previousAdjustment,
        currentValue: existingMarkup,
        minValue: 0,
        maxValue: PACING_CONSTANTS.MAX_MARKUP_PERCENTAGE / 100,
        adjustmentRate: PACING_CONSTANTS.DAILY_ADJUSTMENT_RATE,
      });

      if (!adjustmentFactorResult.success) {
        return adjustmentFactorResult;
      }

      // Invert the adjustment factor for markup
      const cpmAdjustmentFactor = adjustmentFactorResult.data;
      const markupAdjustmentFactor = 1 / cpmAdjustmentFactor;

      // Apply adjustment with safety caps
      const adjustedMarkup = round(existingMarkup * markupAdjustmentFactor, PACING_CONSTANTS.CALCULATION_PRECISION);
      const cappedMarkup = Math.max(Math.min(adjustedMarkup, existingMarkup * 1.5), existingMarkup * 0.5);

      const changePercent = ((cappedMarkup - existingMarkup) / Math.max(existingMarkup, 0.01)) * 100;

      this.logger.info(
        {
          lineItemId,
          existingMarkup,
          cappedMarkup,
          changePercent: round(changePercent, PACING_CONSTANTS.CALCULATION_PRECISION),
        },
        "Markup adjustment calculated"
      );

      const feedback = this.createAdjustmentFeedback(markupAdjustmentFactor, "markup", yesterdayPacing);

      return createSuccess({
        markup: cappedMarkup,
        feedback,
      });
    } catch (error) {
      return createError("calculation", "Failed to calculate pacing-adjusted markup", {
        lineItemId,
        baseMarkup,
        yesterdayPacing,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
