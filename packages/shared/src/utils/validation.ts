import { z } from "zod";
import { ValidationError } from "./errors.js";

/**
 * Validate data against a Zod schema and throw ValidationError if invalid
 */
export function validateSchema<T>(schema: z.ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data);

  if (!result.success) {
    const errors = result.error.errors.map((err) => ({
      path: err.path.join("."),
      message: err.message,
    }));

    throw new ValidationError("Validation failed", { errors });
  }

  return result.data;
}

/**
 * Validate date range
 */
export function validateDateRange(startDate: string, endDate: string): void {
  const start = new Date(startDate);
  const end = new Date(endDate);

  if (isNaN(start.getTime())) {
    throw new ValidationError("Invalid start date format");
  }

  if (isNaN(end.getTime())) {
    throw new ValidationError("Invalid end date format");
  }

  if (start > end) {
    throw new ValidationError("Start date must be before or equal to end date");
  }
}

/**
 * Validate date is in YYYY-MM-DD format
 */
export function validateDateFormat(date: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date);
}

/**
 * Format date to YYYY-MM-DD
 */
export function formatDate(date: Date): string {
  return date.toISOString().split("T")[0];
}
