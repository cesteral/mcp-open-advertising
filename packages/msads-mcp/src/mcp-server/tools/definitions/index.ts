// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { listEntitiesTool } from "./list-entities.tool.js";
import { getEntityTool } from "./get-entity.tool.js";
import { createEntityTool } from "./create-entity.tool.js";
import { updateEntityTool } from "./update-entity.tool.js";
import { deleteEntityTool } from "./delete-entity.tool.js";
import { listAccountsTool } from "./list-accounts.tool.js";
import { getReportTool } from "./get-report.tool.js";
import { getReportBreakdownsTool } from "./get-report-breakdowns.tool.js";
import { submitReportTool } from "./submit-report.tool.js";
import { checkReportStatusTool } from "./check-report-status.tool.js";
import { downloadReportTool } from "./download-report.tool.js";
import { bulkCreateEntitiesTool } from "./bulk-create-entities.tool.js";
import { bulkUpdateEntitiesTool } from "./bulk-update-entities.tool.js";
import { bulkUpdateStatusTool } from "./bulk-update-status.tool.js";
import { adjustBidsTool } from "./adjust-bids.tool.js";
import { manageAdExtensionsTool } from "./manage-ad-extensions.tool.js";
import { manageCriterionsTool } from "./manage-criterions.tool.js";
import { getAdDetailsTool } from "./get-ad-details.tool.js";
import { validateEntityTool } from "./validate-entity.tool.js";
import { importFromGoogleTool } from "./import-from-google.tool.js";
import { searchTargetingTool } from "./search-targeting.tool.js";
import { createReportScheduleTool } from "./create-report-schedule.tool.js";
import { listReportSchedulesTool } from "./list-report-schedules.tool.js";
import { deleteReportScheduleTool } from "./delete-report-schedule.tool.js";

export const productionTools = [
  listEntitiesTool,
  getEntityTool,
  createEntityTool,
  updateEntityTool,
  deleteEntityTool,
  listAccountsTool,
  getReportTool,
  getReportBreakdownsTool,
  submitReportTool,
  checkReportStatusTool,
  downloadReportTool,
  bulkCreateEntitiesTool,
  bulkUpdateEntitiesTool,
  bulkUpdateStatusTool,
  adjustBidsTool,
  manageAdExtensionsTool,
  manageCriterionsTool,
  getAdDetailsTool,
  validateEntityTool,
  importFromGoogleTool,
  searchTargetingTool,
  createReportScheduleTool,
  listReportSchedulesTool,
  deleteReportScheduleTool,
];
