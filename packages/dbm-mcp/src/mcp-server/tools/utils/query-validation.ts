// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import {
  isValidDataRange,
  isValidFilterType,
  isValidMetricType,
  isValidReportType,
} from "../../../generated/index.js";

export interface QueryValidationIssue {
  code: "unknown_report_type" | "unknown_group_by" | "unknown_metric" | "unknown_filter" | "unknown_date_range";
  message: string;
  value: string;
  resourceUri: string;
  path: Array<string | number>;
}

export interface QueryValidationResult {
  warnings: string[];
  errors: QueryValidationIssue[];
}

function issue(
  code: QueryValidationIssue["code"],
  value: string,
  path: Array<string | number>
): QueryValidationIssue {
  switch (code) {
    case "unknown_report_type":
      return {
        code,
        value,
        path,
        resourceUri: "report-types://all",
        message: `Unknown report type: ${value}. Fetch report-types://all for valid options.`,
      };
    case "unknown_group_by":
      return {
        code,
        value,
        path,
        resourceUri: "filter-types://all",
        message: `Unknown filter type in groupBys: ${value}. Fetch filter-types://all for valid options.`,
      };
    case "unknown_metric":
      return {
        code,
        value,
        path,
        resourceUri: "metric-types://all",
        message: `Unknown metric type: ${value}. Fetch metric-types://all for valid options.`,
      };
    case "unknown_filter":
      return {
        code,
        value,
        path,
        resourceUri: "filter-types://all",
        message: `Unknown filter type in filters: ${value}. Fetch filter-types://all for valid options.`,
      };
    case "unknown_date_range":
      return {
        code,
        value,
        path,
        resourceUri: "report-types://all",
        message: `Unknown date range preset: ${value}. Fetch report-types://all for valid options.`,
      };
  }
}

export function validateQueryParams(
  input: {
    reportType: string;
    groupBys: string[];
    metrics: string[];
    filters?: Array<{ type: string; value: string }>;
    dateRange: { preset: string } | { startDate: string; endDate: string };
  },
  strictValidation: boolean
): QueryValidationResult {
  const warnings: string[] = [];
  const errors: QueryValidationIssue[] = [];

  if (!isValidReportType(input.reportType)) {
    const err = issue("unknown_report_type", input.reportType, ["reportType"]);
    if (strictValidation) errors.push(err);
    else warnings.push(`${err.message} Passing through to API because strictValidation=false.`);
  }

  input.groupBys.forEach((groupBy, index) => {
    if (!isValidFilterType(groupBy)) {
      const err = issue("unknown_group_by", groupBy, ["groupBys", index]);
      if (strictValidation) errors.push(err);
      else warnings.push(`${err.message} Passing through to API because strictValidation=false.`);
    }
  });

  input.metrics.forEach((metric, index) => {
    if (!isValidMetricType(metric)) {
      const err = issue("unknown_metric", metric, ["metrics", index]);
      if (strictValidation) errors.push(err);
      else warnings.push(`${err.message} Passing through to API because strictValidation=false.`);
    }
  });

  input.filters?.forEach((filter, index) => {
    if (!isValidFilterType(filter.type)) {
      const err = issue("unknown_filter", filter.type, ["filters", index, "type"]);
      if (strictValidation) errors.push(err);
      else warnings.push(`${err.message} Passing through to API because strictValidation=false.`);
    }
  });

  if ("preset" in input.dateRange && !isValidDataRange(input.dateRange.preset)) {
    const err = issue("unknown_date_range", input.dateRange.preset, ["dateRange", "preset"]);
    if (strictValidation) errors.push(err);
    else warnings.push(`${err.message} Passing through to API because strictValidation=false.`);
  }

  return { warnings, errors };
}

export function addQueryValidationIssues(
  ctx: z.RefinementCtx,
  input: {
    reportType: string;
    groupBys: string[];
    metrics: string[];
    filters?: Array<{ type: string; value: string }>;
    dateRange: { preset: string } | { startDate: string; endDate: string };
    strictValidation?: boolean;
  }
): void {
  const strictValidation = input.strictValidation !== false;
  if (!strictValidation) {
    return;
  }

  const { errors } = validateQueryParams(input, true);
  for (const err of errors) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: err.path,
      message: err.message,
    });
  }
}