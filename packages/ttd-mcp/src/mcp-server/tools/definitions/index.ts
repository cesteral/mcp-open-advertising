/**
 * Tool definitions barrel export
 *
 * 18 tools total:
 *   6 original: list, get, create, update, delete, report
 *   8 bulk/advanced: bulk create, bulk update, archive, GraphQL, bulk status, adjust bids, validate, download report
 *   4 GraphQL bulk: query bulk, mutation bulk, bulk job status, cancel bulk job
 */

export { listEntitiesTool } from "./list-entities.tool.js";
export { getEntityTool } from "./get-entity.tool.js";
export { createEntityTool } from "./create-entity.tool.js";
export { updateEntityTool } from "./update-entity.tool.js";
export { deleteEntityTool } from "./delete-entity.tool.js";
export { getReportTool } from "./get-report.tool.js";
export { bulkCreateEntitiesTool } from "./bulk-create-entities.tool.js";
export { bulkUpdateEntitiesTool } from "./bulk-update-entities.tool.js";
export { archiveEntitiesTool } from "./archive-entities.tool.js";
export { graphqlQueryTool } from "./graphql-query.tool.js";
export { bulkUpdateStatusTool } from "./bulk-update-status.tool.js";
export { adjustBidsTool } from "./adjust-bids.tool.js";
export { validateEntityTool } from "./validate-entity.tool.js";
export { downloadReportTool } from "./download-report.tool.js";
export { graphqlQueryBulkTool } from "./graphql-query-bulk.tool.js";
export { graphqlMutationBulkTool } from "./graphql-mutation-bulk.tool.js";
export { graphqlBulkJobTool } from "./graphql-bulk-job.tool.js";
export { graphqlCancelBulkJobTool } from "./graphql-cancel-bulk-job.tool.js";

import { listEntitiesTool } from "./list-entities.tool.js";
import { getEntityTool } from "./get-entity.tool.js";
import { createEntityTool } from "./create-entity.tool.js";
import { updateEntityTool } from "./update-entity.tool.js";
import { deleteEntityTool } from "./delete-entity.tool.js";
import { getReportTool } from "./get-report.tool.js";
import { bulkCreateEntitiesTool } from "./bulk-create-entities.tool.js";
import { bulkUpdateEntitiesTool } from "./bulk-update-entities.tool.js";
import { archiveEntitiesTool } from "./archive-entities.tool.js";
import { graphqlQueryTool } from "./graphql-query.tool.js";
import { bulkUpdateStatusTool } from "./bulk-update-status.tool.js";
import { adjustBidsTool } from "./adjust-bids.tool.js";
import { validateEntityTool } from "./validate-entity.tool.js";
import { downloadReportTool } from "./download-report.tool.js";
import { graphqlQueryBulkTool } from "./graphql-query-bulk.tool.js";
import { graphqlMutationBulkTool } from "./graphql-mutation-bulk.tool.js";
import { graphqlBulkJobTool } from "./graphql-bulk-job.tool.js";
import { graphqlCancelBulkJobTool } from "./graphql-cancel-bulk-job.tool.js";
import { conformanceTools, type ToolDefinitionForFactory } from "@cesteral/shared";

export const allTools: ToolDefinitionForFactory[] = [
  // ── Core CRUD ──
  listEntitiesTool,
  getEntityTool,
  createEntityTool,
  updateEntityTool,
  deleteEntityTool,
  // ── Reporting ──
  getReportTool,
  downloadReportTool,
  // ── Bulk Operations ──
  bulkCreateEntitiesTool,
  bulkUpdateEntitiesTool,
  bulkUpdateStatusTool,
  archiveEntitiesTool,
  adjustBidsTool,
  // ── Advanced ──
  graphqlQueryTool,
  validateEntityTool,
  // ── GraphQL Bulk ──
  graphqlQueryBulkTool,
  graphqlMutationBulkTool,
  graphqlBulkJobTool,
  graphqlCancelBulkJobTool,
  // ── Conformance ──
  ...conformanceTools,
];
