// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Tool definitions barrel export
 *
 * 52 tools total:
 *   1 context: get context (cold-start partner discovery)
 *   6 original: list, get, create, update, delete, report
 *   5 workflows utility: REST passthrough, standard job status, first-party data job, third-party data job, campaign version
 *   8 workflow entities/jobs: create/update campaign workflow, create/update ad group workflow, bulk create/update campaign jobs, bulk create/update ad group jobs
 *   10 bulk/advanced: bulk create, bulk update, archive, GraphQL, bulk status, adjust bids, validate, download report, submit report, check report status
 *   4 GraphQL bulk: query bulk, mutation bulk, bulk job status, cancel bulk job
 *   1 preview: get ad preview
 *   9 report schedule management: create, update, list, get, delete schedule + list templates + cancel execution + rerun schedule + get executions
 *   2 GQL entity reports: execute entity report, get entity report types
 *   3 report template management: create, update, get template
 *   2 report type discovery: list report types, get report type schema
 *   1 template schedule: create template schedule
 */

export { getContextTool } from "./get-context.tool.js";
export { restRequestTool } from "./rest-request.tool.js";
export { getJobStatusTool } from "./get-job-status.tool.js";
export { getFirstPartyDataJobTool } from "./get-first-party-data-job.tool.js";
export { getThirdPartyDataJobTool } from "./get-third-party-data-job.tool.js";
export { getCampaignVersionTool } from "./get-campaign-version.tool.js";
export { listEntitiesTool } from "./list-entities.tool.js";
export { getEntityTool } from "./get-entity.tool.js";
export { createEntityTool } from "./create-entity.tool.js";
export { updateEntityTool } from "./update-entity.tool.js";
export { deleteEntityTool } from "./delete-entity.tool.js";
export { createCampaignWorkflowTool } from "./create-campaign-workflow.tool.js";
export { updateCampaignWorkflowTool } from "./update-campaign-workflow.tool.js";
export { createCampaignsJobTool } from "./create-campaigns-job.tool.js";
export { updateCampaignsJobTool } from "./update-campaigns-job.tool.js";
export { createAdGroupWorkflowTool } from "./create-ad-group-workflow.tool.js";
export { updateAdGroupWorkflowTool } from "./update-ad-group-workflow.tool.js";
export { createAdGroupsJobTool } from "./create-ad-groups-job.tool.js";
export { updateAdGroupsJobTool } from "./update-ad-groups-job.tool.js";
export { getReportTool } from "./get-report.tool.js";
export { bulkCreateEntitiesTool } from "./bulk-create-entities.tool.js";
export { bulkUpdateEntitiesTool } from "./bulk-update-entities.tool.js";
export { archiveEntitiesTool } from "./archive-entities.tool.js";
export { graphqlQueryTool } from "./graphql-query.tool.js";
export { bulkUpdateStatusTool } from "./bulk-update-status.tool.js";
export { adjustBidsTool } from "./adjust-bids.tool.js";
export { validateEntityTool } from "./validate-entity.tool.js";
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

import { getContextTool } from "./get-context.tool.js";
import { restRequestTool } from "./rest-request.tool.js";
import { getJobStatusTool } from "./get-job-status.tool.js";
import { getFirstPartyDataJobTool } from "./get-first-party-data-job.tool.js";
import { getThirdPartyDataJobTool } from "./get-third-party-data-job.tool.js";
import { getCampaignVersionTool } from "./get-campaign-version.tool.js";
import { listEntitiesTool } from "./list-entities.tool.js";
import { getEntityTool } from "./get-entity.tool.js";
import { createEntityTool } from "./create-entity.tool.js";
import { updateEntityTool } from "./update-entity.tool.js";
import { deleteEntityTool } from "./delete-entity.tool.js";
import { createCampaignWorkflowTool } from "./create-campaign-workflow.tool.js";
import { updateCampaignWorkflowTool } from "./update-campaign-workflow.tool.js";
import { createCampaignsJobTool } from "./create-campaigns-job.tool.js";
import { updateCampaignsJobTool } from "./update-campaigns-job.tool.js";
import { createAdGroupWorkflowTool } from "./create-ad-group-workflow.tool.js";
import { updateAdGroupWorkflowTool } from "./update-ad-group-workflow.tool.js";
import { createAdGroupsJobTool } from "./create-ad-groups-job.tool.js";
import { updateAdGroupsJobTool } from "./update-ad-groups-job.tool.js";
import { getReportTool } from "./get-report.tool.js";
import { bulkCreateEntitiesTool } from "./bulk-create-entities.tool.js";
import { bulkUpdateEntitiesTool } from "./bulk-update-entities.tool.js";
import { archiveEntitiesTool } from "./archive-entities.tool.js";
import { graphqlQueryTool } from "./graphql-query.tool.js";
import { bulkUpdateStatusTool } from "./bulk-update-status.tool.js";
import { adjustBidsTool } from "./adjust-bids.tool.js";
import { validateEntityTool } from "./validate-entity.tool.js";
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
import { conformanceTools, type ToolDefinitionForFactory } from "@cesteral/shared";

const productionTools: ToolDefinitionForFactory[] = [
  // ── Context ──
  getContextTool,
  restRequestTool,
  getJobStatusTool,
  getFirstPartyDataJobTool,
  getThirdPartyDataJobTool,
  getCampaignVersionTool,
  // ── Core CRUD ──
  listEntitiesTool,
  getEntityTool,
  createEntityTool,
  updateEntityTool,
  deleteEntityTool,
  // ── Workflow Entity Operations ──
  createCampaignWorkflowTool,
  updateCampaignWorkflowTool,
  createCampaignsJobTool,
  updateCampaignsJobTool,
  createAdGroupWorkflowTool,
  updateAdGroupWorkflowTool,
  createAdGroupsJobTool,
  updateAdGroupsJobTool,
  // ── Reporting ──
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
  // ── Advanced ──
  graphqlQueryTool,
  validateEntityTool,
  // ── GraphQL Bulk ──
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
];

/**
 * All tool definitions for the TTD MCP server.
 * Conformance tools are only included when MCP_INCLUDE_CONFORMANCE_TOOLS=true.
 */
export const allTools: ToolDefinitionForFactory[] = [
  ...productionTools,
  ...(process.env.MCP_INCLUDE_CONFORMANCE_TOOLS === "true" ? conformanceTools : []),
];
