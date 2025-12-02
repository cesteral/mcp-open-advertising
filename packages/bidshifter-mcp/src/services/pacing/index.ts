/**
 * Pacing Service Module
 *
 * Exports advanced pacing optimization functionality including:
 * - Feedback-driven learning from previous adjustments
 * - Budget protection mechanisms
 * - CPM and markup adjustment calculations
 */

export { PacingService } from "./PacingService.js";
export {
  PACING_CONSTANTS,
  type PacingAdjustmentParams,
  type PacingStatusType,
  type AdjustmentFeedback,
  type CPMAdjustmentResult,
  type MarkupAdjustmentResult,
  type CPMPacingRange,
  type BudgetData,
  type AdjustmentType,
} from "./types.js";
