// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Safe arithmetic utilities for metric calculations
 *
 * Provides functions for safe division, rounding, and number validation
 * to prevent NaN, Infinity, and other edge case errors.
 */

/**
 * Default precision for rounding operations
 */
export const DEFAULT_PRECISION = 4;

/**
 * Rounds a number to the specified decimal places
 *
 * @param value - The number to round
 * @param decimals - Number of decimal places (default: 4)
 * @returns Rounded number
 */
export const round = (value: number, decimals: number = DEFAULT_PRECISION): number => {
  const multiplier = 10 ** decimals;
  return Math.round(value * multiplier) / multiplier;
};

/**
 * Validates if a value is a usable number (not NaN, not Infinity, and is a number)
 *
 * @param value - The value to validate
 * @returns True if the value is a valid, finite number
 */
export const isValidNumber = (value: number | undefined | null): value is number => {
  return typeof value === "number" && Number.isFinite(value) && !Number.isNaN(value);
};

/**
 * Safely converts a value to a number with a default fallback
 *
 * @param value - The value to convert
 * @param defaultValue - Default value if conversion fails (default: 0)
 * @returns The number value or default
 */
export const safeNumber = (value: number | undefined | null, defaultValue: number = 0): number => {
  return isValidNumber(value) ? value : defaultValue;
};

/**
 * Safely performs division, returning a default value for invalid operations
 *
 * Handles:
 * - Division by zero (returns defaultValue)
 * - Invalid numerator/denominator (returns defaultValue)
 * - NaN/Infinity results (returns defaultValue)
 *
 * @param numerator - The numerator
 * @param denominator - The denominator
 * @param defaultValue - Value to return for invalid operations (default: 0)
 * @returns The division result or default value
 */
export const safeDivide = (
  numerator: number,
  denominator: number,
  defaultValue: number = 0
): number => {
  if (!isValidNumber(numerator) || !isValidNumber(denominator)) {
    return defaultValue;
  }

  if (denominator === 0) {
    return defaultValue;
  }

  const result = numerator / denominator;

  if (!isValidNumber(result)) {
    return defaultValue;
  }

  return result;
};

/**
 * Safely calculates a percentage (numerator / denominator * 100)
 *
 * @param numerator - The numerator
 * @param denominator - The denominator
 * @param defaultValue - Value to return for invalid operations (default: 0)
 * @returns The percentage value or default
 */
export const safePercentage = (
  numerator: number,
  denominator: number,
  defaultValue: number = 0
): number => {
  const result = safeDivide(numerator, denominator, defaultValue);
  return result === defaultValue ? defaultValue : result * 100;
};

/**
 * Safely calculates a rate per thousand (numerator / denominator * 1000)
 * Commonly used for CPM calculations
 *
 * @param numerator - The numerator (e.g., spend)
 * @param denominator - The denominator (e.g., impressions)
 * @param defaultValue - Value to return for invalid operations (default: 0)
 * @returns The per-thousand rate or default
 */
export const safePerMille = (
  numerator: number,
  denominator: number,
  defaultValue: number = 0
): number => {
  const result = safeDivide(numerator, denominator, defaultValue);
  return result === defaultValue ? defaultValue : result * 1000;
};

/**
 * Clamps a number between a minimum and maximum value
 *
 * @param value - The value to clamp
 * @param min - Minimum allowed value
 * @param max - Maximum allowed value
 * @returns The clamped value
 */
export const clamp = (value: number, min: number, max: number): number => {
  if (!isValidNumber(value)) return min;
  return Math.max(min, Math.min(max, value));
};
