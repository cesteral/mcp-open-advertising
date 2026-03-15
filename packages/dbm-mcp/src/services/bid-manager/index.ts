// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Bid Manager Service - Barrel Export
 *
 * Exports all public types, schemas, and services for Bid Manager API integration.
 */

// Main service
export { BidManagerService } from "./BidManagerService.js";

// Client types
export {
  type BidManagerClient,
  type GoogleAuthClient,
} from "./client.js";

// Type schemas (Zod)
export {
  // Enum schemas
  ReportTypeSchema,
  DataRangeSchema,
  ReportFormatSchema,
  FilterTypeSchema,
  MetricTypeSchema,
  ReportStatusSchema,
  // Object schemas
  DateObjectSchema,
  QueryFilterSchema,
  DataRangeConfigSchema,
  QueryMetadataSchema,
  QueryParamsSchema,
  QuerySpecSchema,
  ReportKeySchema,
  ReportStatusDetailsSchema,
  ReportMetadataSchema,
  // Result schemas
  DeliveryMetricsSchema,
  PerformanceMetricsSchema,
  HistoricalDataPointSchema,
  PacingStatusSchema,
  // Service input schemas
  GetDeliveryMetricsInputSchema,
  GetHistoricalMetricsInputSchema,
  GetPacingStatusInputSchema,
  // Column mappings
  CSV_COLUMN_MAPPINGS,
  METRIC_TO_CSV_COLUMN,
} from "./types.js";

// Type exports (TypeScript types)
export type {
  ReportType,
  DataRange,
  ReportFormat,
  FilterType,
  MetricType,
  ReportStatus,
  DateObject,
  QueryFilter,
  DataRangeConfig,
  QueryMetadata,
  QueryParams,
  QuerySpec,
  ReportKey,
  ReportStatusDetails,
  ReportMetadata,
  DeliveryMetrics,
  PerformanceMetrics,
  HistoricalDataPoint,
  PacingStatus,
  GetDeliveryMetricsInput,
  GetHistoricalMetricsInput,
  GetPacingStatusInput,
} from "./types.js";

// Report parser utilities
export {
  // Generic CSV parser
  csvToJson,
  // Value parsers
  parseNumericValue,
  parseIntValue,
  parseDateValue,
  // Bid Manager specific
  mapToBidManagerRow,
  parseCSVContent,
  // Aggregation
  aggregateToDeliveryMetrics,
  aggregateToHistoricalData,
  calculatePerformanceMetrics,
  // Convenience functions
  parseCSVToDeliveryMetrics,
  parseCSVToHistoricalData,
  type ParsedRow,
} from "./report-parser.js";