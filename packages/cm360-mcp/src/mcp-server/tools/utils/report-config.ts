// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveDatePreset, DATE_PRESET_VALUES } from "@cesteral/shared";

export const CM360_REPORT_TYPE_VALUES = [
  "STANDARD",
  "REACH",
  "PATH_TO_CONVERSION",
  "FLOODLIGHT",
  "CROSS_MEDIA_REACH",
] as const;

export const CM360ReportTypeSchema = z.enum(CM360_REPORT_TYPE_VALUES);
export const CM360DatePresetSchema = z.enum(DATE_PRESET_VALUES);

export type CM360ReportType = z.infer<typeof CM360ReportTypeSchema>;

export const REPORT_CRITERIA_FIELD_BY_TYPE: Record<CM360ReportType, CriteriaField> = {
  STANDARD: "criteria",
  REACH: "reachCriteria",
  PATH_TO_CONVERSION: "pathToConversionCriteria",
  FLOODLIGHT: "floodlightCriteria",
  CROSS_MEDIA_REACH: "crossMediaReachCriteria",
};

export const REPORT_CRITERIA_FIELDS = Object.values(REPORT_CRITERIA_FIELD_BY_TYPE);

type CriteriaField = 
  | "criteria"
  | "reachCriteria"
  | "pathToConversionCriteria"
  | "floodlightCriteria"
  | "crossMediaReachCriteria";

type ReportCriteriaValue = Record<string, unknown> | undefined;

type ReportRequestInput = {
  name: string;
  type: CM360ReportType;
  datePreset?: z.infer<typeof CM360DatePresetSchema>;
  additionalConfig?: Record<string, unknown>;
} & Partial<Record<CriteriaField, ReportCriteriaValue>>;

export const genericCriteriaSchema = z.record(z.any());

export function validateTypedCriteriaUsage(
  input: {
    type: CM360ReportType;
    datePreset?: z.infer<typeof CM360DatePresetSchema>;
  } & Partial<Record<CriteriaField, ReportCriteriaValue>>,
  ctx: z.RefinementCtx
): void {
  const expectedField = getCriteriaFieldForType(input.type);
  const providedFields = REPORT_CRITERIA_FIELDS.filter((field) => input[field] !== undefined);

  for (const field of providedFields) {
    if (field !== expectedField) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [field],
        message: `${field} is not valid for report type ${input.type}; use ${expectedField} instead`,
      });
    }
  }

  if (input.datePreset) {
    const criteria = input[expectedField];
    const dateRange = criteria?.dateRange as Record<string, unknown> | undefined;
    if (dateRange?.relativeDateRange === "TODAY") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [expectedField, "dateRange", "relativeDateRange"],
        message: "datePreset cannot be combined with a criteria dateRange of TODAY",
      });
    }
  }
}

export function buildTypedReportConfig(input: ReportRequestInput): Record<string, unknown> {
  const expectedField = getCriteriaFieldForType(input.type);
  const mergedCriteria = injectDatePreset(input.datePreset, input[expectedField]);
  const {
    name: _ignoredName,
    type: _ignoredType,
    criteria: _ignoredCriteria,
    reachCriteria: _ignoredReachCriteria,
    pathToConversionCriteria: _ignoredPathCriteria,
    floodlightCriteria: _ignoredFloodlightCriteria,
    crossMediaReachCriteria: _ignoredCrossMediaCriteria,
    ...safeAdditionalConfig
  } = input.additionalConfig ?? {};

  return {
    ...safeAdditionalConfig,
    name: input.name,
    type: input.type,
    ...(mergedCriteria ? { [expectedField]: mergedCriteria } : {}),
  };
}

export function getCriteriaFieldForType(type: CM360ReportType): CriteriaField {
  return REPORT_CRITERIA_FIELD_BY_TYPE[type];
}

export function ensureReportSupportsBreakdowns(type: CM360ReportType): CriteriaField {
  if (type === "PATH_TO_CONVERSION") {
    throw new Error(
      "cm360_get_report_breakdowns does not support PATH_TO_CONVERSION; use the type-specific report criteria fields directly"
    );
  }
  return getCriteriaFieldForType(type);
}

export function getReportCriteriaFromConfig(
  input: Partial<Record<CriteriaField, ReportCriteriaValue>>,
  type: CM360ReportType
): ReportCriteriaValue {
  return input[getCriteriaFieldForType(type)];
}

export function validateScheduleCompatibility(
  type: CM360ReportType,
  criteria: ReportCriteriaValue,
  ctx: z.RefinementCtx,
  path: (string | number)[] = ["schedule"]
): void {
  const dateRange = criteria?.dateRange as Record<string, unknown> | undefined;
  const relativeDateRange = dateRange?.relativeDateRange;

  if (!relativeDateRange || typeof relativeDateRange !== "string") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path,
      message: `Scheduled ${type} reports require a relative date range on ${getCriteriaFieldForType(type)}.dateRange.relativeDateRange`,
    });
    return;
  }

  if (relativeDateRange === "TODAY") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path,
      message: "CM360 does not allow report schedules when relativeDateRange is TODAY",
    });
  }
}

export const CM360ScheduleSchema = z
  .object({
    active: z.boolean().default(true).describe("Whether the schedule is active"),
    every: z.number().int().min(1).optional().describe("Frequency multiplier"),
    repeats: z
      .enum(["DAILY", "WEEKLY", "MONTHLY", "QUARTERLY", "YEARLY"])
      .describe("Repeat frequency"),
    startDate: z.string().describe("Schedule start date (YYYY-MM-DD)"),
    expirationDate: z.string().optional().describe("Schedule end date (YYYY-MM-DD)"),
    repeatsOnWeekDays: z
      .array(z.enum(["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"]))
      .min(1)
      .optional()
      .describe("Days of week for WEEKLY schedules"),
    runsOnDayOfMonth: z
      .enum(["DAY_OF_MONTH", "WEEK_OF_MONTH"])
      .optional()
      .describe("Monthly scheduling mode"),
    timezone: z.string().optional().describe("Timezone when the report should run"),
  })
  .superRefine((value, ctx) => {
    if (value.repeats === "DAILY" || value.repeats === "WEEKLY" || value.repeats === "MONTHLY") {
      if (value.every === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["every"],
          message: `every is required when repeats is ${value.repeats}`,
        });
      }
    }

    if (value.repeats === "WEEKLY") {
      if (!value.repeatsOnWeekDays || value.repeatsOnWeekDays.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["repeatsOnWeekDays"],
          message: "repeatsOnWeekDays is required when repeats is WEEKLY",
        });
      }
    } else if (value.repeatsOnWeekDays !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["repeatsOnWeekDays"],
        message: "repeatsOnWeekDays is only valid when repeats is WEEKLY",
      });
    }

    if (value.repeats === "MONTHLY") {
      if (!value.runsOnDayOfMonth) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["runsOnDayOfMonth"],
          message: "runsOnDayOfMonth is required when repeats is MONTHLY",
        });
      }
    } else if (value.runsOnDayOfMonth !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["runsOnDayOfMonth"],
        message: "runsOnDayOfMonth is only valid when repeats is MONTHLY",
      });
    }
  });

function injectDatePreset(
  datePreset: z.infer<typeof CM360DatePresetSchema> | undefined,
  criteria: ReportCriteriaValue
): ReportCriteriaValue {
  if (!datePreset) {
    return criteria;
  }

  const dateRange = criteria?.dateRange as Record<string, unknown> | undefined;
  if (dateRange) {
    return criteria;
  }

  const { startDate, endDate } = resolveDatePreset(datePreset);
  return { ...(criteria ?? {}), dateRange: { startDate, endDate } };
}
