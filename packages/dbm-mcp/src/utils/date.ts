// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";

/**
 * Calculate the number of days between two ISO date strings (YYYY-MM-DD).
 */
export function daysBetween(startDate: string, endDate: string): number {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffTime = Math.abs(end.getTime() - start.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Zod refinement: `startKey` must not be after `endKey` (both YYYY-MM-DD, so a
 * string comparison orders them). A reversed range is rejected before any Bid
 * Manager query is created, instead of surfacing as an API 400.
 */
export function refineDateOrder<K extends string>(startKey: K, endKey: K) {
  return (value: Partial<Record<K, unknown>>, ctx: z.RefinementCtx): void => {
    const start = value[startKey];
    const end = value[endKey];
    if (typeof start === "string" && typeof end === "string" && start > end) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [endKey],
        message: `${endKey} (${end}) is before ${startKey} (${start})`,
      });
    }
  };
}
