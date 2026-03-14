import { listEntitiesTool } from "./list-entities.tool.js";
import { getEntityTool } from "./get-entity.tool.js";
import { createEntityTool } from "./create-entity.tool.js";
import { updateEntityTool } from "./update-entity.tool.js";
import { deleteEntityTool } from "./delete-entity.tool.js";
import { listAccountsTool } from "./list-accounts.tool.js";
import { getReportTool } from "./get-report.tool.js";
import { submitReportTool } from "./submit-report.tool.js";
import { checkReportStatusTool } from "./check-report-status.tool.js";
import { downloadReportTool } from "./download-report.tool.js";
import { bulkCreateEntitiesTool } from "./bulk-create-entities.tool.js";
import { bulkUpdateEntitiesTool } from "./bulk-update-entities.tool.js";
import { bulkUpdateStatusTool } from "./bulk-update-status.tool.js";
import { adjustBidsTool } from "./adjust-bids.tool.js";
import { manageAdExtensionsTool } from "./manage-ad-extensions.tool.js";
import { manageCriterionsTool } from "./manage-criterions.tool.js";
import { getAdPreviewTool } from "./get-ad-preview.tool.js";
import { validateEntityTool } from "./validate-entity.tool.js";
import { importFromGoogleTool } from "./import-from-google.tool.js";

export const productionTools = [
  listEntitiesTool,
  getEntityTool,
  createEntityTool,
  updateEntityTool,
  deleteEntityTool,
  listAccountsTool,
  getReportTool,
  submitReportTool,
  checkReportStatusTool,
  downloadReportTool,
  bulkCreateEntitiesTool,
  bulkUpdateEntitiesTool,
  bulkUpdateStatusTool,
  adjustBidsTool,
  manageAdExtensionsTool,
  manageCriterionsTool,
  getAdPreviewTool,
  validateEntityTool,
  importFromGoogleTool,
];
