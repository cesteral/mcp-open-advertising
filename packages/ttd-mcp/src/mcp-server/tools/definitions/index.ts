// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Tool definitions barrel export
 *
 * TTD's documented public Platform API surface is REST + GraphQL only
 * (TTD Foundations §1 "Our Users and APIs", §6 "REST and GraphQL").
 * The Speakeasy `/workflows/...` SDK endpoint is a language-specific
 * convenience layer (Python/Go/Java) wrapping the same backend; it has
 * no TypeScript SDK and is gated behind a User-Agent check. We expose
 * Platform API operations directly via REST + GraphQL instead.
 *
 * 44 tools total:
 *   1  context: get context (cold-start partner discovery)
 *   5  core CRUD: list, get, create, update, delete
 *   4  reporting (REST async): get report (blocking), submit, check status, download
 *   5  bulk: bulk create, bulk update, bulk update status, archive, adjust bids
 *   2  bid lists: single + bulk
 *   1  seeds (GraphQL Kokai-only): manage seed
 *   2  advanced: graphql query, validate entity
 *   4  GraphQL bulk: query bulk, mutation bulk, bulk job status, cancel bulk job
 *   1  preview: get ad preview
 *   1  pacing: get pacing status (client-side, no API call)
 *   10 report schedule management: create, update, list, get, delete, list templates,
 *      create template schedule, cancel execution, rerun schedule, get executions
 *   2  GQL entity reports: execute, get types
 *   2  report type discovery: list, get schema
 *   3  report template management: create, update, get
 *   1  discovery: tool-search
 */

export { getContextTool } from "./get-context.tool.js";
export { listEntitiesTool } from "./list-entities.tool.js";
export { getEntityTool } from "./get-entity.tool.js";
export { getPacingStatusTool } from "./get-pacing-status.tool.js";
export { createEntityTool } from "./create-entity.tool.js";
export { updateEntityTool } from "./update-entity.tool.js";
export { deleteEntityTool } from "./delete-entity.tool.js";
export { duplicateEntityTool } from "./duplicate-entity.tool.js";
export { getReportTool } from "./get-report.tool.js";
export { bulkCreateEntitiesTool } from "./bulk-create-entities.tool.js";
export { bulkUpdateEntitiesTool } from "./bulk-update-entities.tool.js";
export { archiveEntitiesTool } from "./archive-entities.tool.js";
export { graphqlQueryTool } from "./graphql-query.tool.js";
export { bulkUpdateStatusTool } from "./bulk-update-status.tool.js";
export { adjustBidsTool } from "./adjust-bids.tool.js";
export { validateEntityTool } from "./validate-entity.tool.js";
export { uploadVideoTool } from "./upload-video.tool.js";
export { downloadReportTool } from "./download-report.tool.js";
export { submitReportTool } from "./submit-report.tool.js";
export { checkReportStatusTool } from "./check-report-status.tool.js";
export { graphqlQueryBulkTool } from "./graphql-query-bulk.tool.js";
export { graphqlMutationBulkTool } from "./graphql-mutation-bulk.tool.js";
export { graphqlBulkJobTool } from "./graphql-bulk-job.tool.js";
export { graphqlCancelBulkJobTool } from "./graphql-cancel-bulk-job.tool.js";
export { getAdPreviewTool } from "./get-ad-preview.tool.js";
export { createReportScheduleTool } from "./create-report-schedule.tool.js";
export { listReportSchedulesTool } from "./list-report-schedules.tool.js";
export { getReportScheduleTool } from "./get-report-schedule.tool.js";
export { deleteReportScheduleTool } from "./delete-report-schedule.tool.js";
export { listReportTemplatesTool } from "./list-report-templates.tool.js";
export { executeEntityReportTool } from "./execute-entity-report.tool.js";
export { getEntityReportTypesTool } from "./get-entity-report-types.tool.js";
export { createReportTemplateTool } from "./create-report-template.tool.js";
export { updateReportTemplateTool } from "./update-report-template.tool.js";
export { getReportTemplateTool } from "./get-report-template.tool.js";
export { listReportTypesTool } from "./list-report-types.tool.js";
export { getReportTypeSchemaTool } from "./get-report-type-schema.tool.js";
export { createTemplateScheduleTool } from "./create-template-schedule.tool.js";
export { updateReportScheduleTool } from "./update-report-schedule.tool.js";
export { cancelReportExecutionTool } from "./cancel-report-execution.tool.js";
export { rerunReportScheduleTool } from "./rerun-report-schedule.tool.js";
export { getReportExecutionsTool } from "./get-report-executions.tool.js";
export { manageBidListTool } from "./manage-bid-list.tool.js";
export { bulkManageBidListsTool } from "./bulk-manage-bid-lists.tool.js";
export { manageSeedTool } from "./manage-seed.tool.js";

import { getContextTool } from "./get-context.tool.js";
import { listEntitiesTool } from "./list-entities.tool.js";
import { getEntityTool } from "./get-entity.tool.js";
import { getPacingStatusTool } from "./get-pacing-status.tool.js";
import { createEntityTool } from "./create-entity.tool.js";
import { updateEntityTool } from "./update-entity.tool.js";
import { deleteEntityTool } from "./delete-entity.tool.js";
import { duplicateEntityTool } from "./duplicate-entity.tool.js";
import { getReportTool } from "./get-report.tool.js";
import { bulkCreateEntitiesTool } from "./bulk-create-entities.tool.js";
import { bulkUpdateEntitiesTool } from "./bulk-update-entities.tool.js";
import { archiveEntitiesTool } from "./archive-entities.tool.js";
import { graphqlQueryTool } from "./graphql-query.tool.js";
import { bulkUpdateStatusTool } from "./bulk-update-status.tool.js";
import { adjustBidsTool } from "./adjust-bids.tool.js";
import { validateEntityTool } from "./validate-entity.tool.js";
import { uploadVideoTool } from "./upload-video.tool.js";
import { downloadReportTool } from "./download-report.tool.js";
import { submitReportTool } from "./submit-report.tool.js";
import { checkReportStatusTool } from "./check-report-status.tool.js";
import { graphqlQueryBulkTool } from "./graphql-query-bulk.tool.js";
import { graphqlMutationBulkTool } from "./graphql-mutation-bulk.tool.js";
import { graphqlBulkJobTool } from "./graphql-bulk-job.tool.js";
import { graphqlCancelBulkJobTool } from "./graphql-cancel-bulk-job.tool.js";
import { getAdPreviewTool } from "./get-ad-preview.tool.js";
import { createReportScheduleTool } from "./create-report-schedule.tool.js";
import { listReportSchedulesTool } from "./list-report-schedules.tool.js";
import { getReportScheduleTool } from "./get-report-schedule.tool.js";
import { deleteReportScheduleTool } from "./delete-report-schedule.tool.js";
import { listReportTemplatesTool } from "./list-report-templates.tool.js";
import { executeEntityReportTool } from "./execute-entity-report.tool.js";
import { getEntityReportTypesTool } from "./get-entity-report-types.tool.js";
import { createReportTemplateTool } from "./create-report-template.tool.js";
import { updateReportTemplateTool } from "./update-report-template.tool.js";
import { getReportTemplateTool } from "./get-report-template.tool.js";
import { listReportTypesTool } from "./list-report-types.tool.js";
import { getReportTypeSchemaTool } from "./get-report-type-schema.tool.js";
import { createTemplateScheduleTool } from "./create-template-schedule.tool.js";
import { updateReportScheduleTool } from "./update-report-schedule.tool.js";
import { cancelReportExecutionTool } from "./cancel-report-execution.tool.js";
import { rerunReportScheduleTool } from "./rerun-report-schedule.tool.js";
import { getReportExecutionsTool } from "./get-report-executions.tool.js";
import { manageBidListTool } from "./manage-bid-list.tool.js";
import { bulkManageBidListsTool } from "./bulk-manage-bid-lists.tool.js";
import { manageSeedTool } from "./manage-seed.tool.js";
import {
  conformanceTools,
  createToolSearchTool,
  type ToolDefinitionForFactory,
} from "@cesteral/shared";

const productionTools: ToolDefinitionForFactory[] = [
  // ── Context ──
  getContextTool,
  // ── Core CRUD (REST) ──
  listEntitiesTool,
  getEntityTool,
  getPacingStatusTool,
  createEntityTool,
  updateEntityTool,
  deleteEntityTool,
  duplicateEntityTool,
  // ── Reporting (REST async) ──
  getReportTool,
  downloadReportTool,
  submitReportTool,
  checkReportStatusTool,
  // ── Bulk Operations ──
  bulkCreateEntitiesTool,
  bulkUpdateEntitiesTool,
  bulkUpdateStatusTool,
  archiveEntitiesTool,
  adjustBidsTool,
  // ── Bid Lists ──
  manageBidListTool,
  bulkManageBidListsTool,
  // ── Audience / Seeds (GraphQL Kokai-only) ──
  manageSeedTool,
  // ── Advanced ──
  graphqlQueryTool,
  validateEntityTool,
  uploadVideoTool,
  // ── GraphQL Bulk (TTD's documented path for >100-record operations) ──
  graphqlQueryBulkTool,
  graphqlMutationBulkTool,
  graphqlBulkJobTool,
  graphqlCancelBulkJobTool,
  // ── Preview ──
  getAdPreviewTool,
  // ── Report Schedule Management ──
  createReportScheduleTool,
  updateReportScheduleTool,
  listReportSchedulesTool,
  getReportScheduleTool,
  deleteReportScheduleTool,
  listReportTemplatesTool,
  createTemplateScheduleTool,
  cancelReportExecutionTool,
  rerunReportScheduleTool,
  getReportExecutionsTool,
  // ── GQL Entity Reports ──
  executeEntityReportTool,
  getEntityReportTypesTool,
  // ── Report Type Discovery ──
  listReportTypesTool,
  getReportTypeSchemaTool,
  // ── Report Template Management ──
  createReportTemplateTool,
  updateReportTemplateTool,
  getReportTemplateTool,
  // ── Discovery ──
  createToolSearchTool({ platform: "ttd", getTools: () => allTools }),
];

/**
 * All tool definitions for the TTD MCP server.
 * Conformance tools are only included when MCP_INCLUDE_CONFORMANCE_TOOLS=true.
 */
export const allTools: ToolDefinitionForFactory[] = [
  ...productionTools,
  ...(process.env.MCP_INCLUDE_CONFORMANCE_TOOLS === "true" ? conformanceTools : []),
];
