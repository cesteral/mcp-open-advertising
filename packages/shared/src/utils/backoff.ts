// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Compute exponential backoff delay capped at a maximum.
 */
export function computeExponentialBackoff(attempt: number, baseMs: number, maxMs: number): number {
  return Math.min(baseMs * Math.pow(2, attempt), maxMs);
}

/**
 * Compute linear backoff delay capped at a maximum.
 */
export function computeLinearBackoff(attempt: number, baseMs: number, maxMs: number): number {
  return Math.min(baseMs * (attempt + 1), maxMs);
}
