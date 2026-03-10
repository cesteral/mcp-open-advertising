/**
 * Tool definitions barrel export
 *
 * 6 tools total:
 *   1 upload: upload asset from URL
 *   1 list: list assets with filters
 *   1 get: get asset info
 *   1 delete: delete asset
 *   1 tag: add/update tags
 *   1 upload-url: generate signed upload URL for direct upload
 */

export { uploadAssetTool } from "./upload-asset.tool.js";
export { listAssetsTool } from "./list-assets.tool.js";
export { getAssetTool } from "./get-asset.tool.js";
export { deleteAssetTool } from "./delete-asset.tool.js";
export { tagAssetTool } from "./tag-asset.tool.js";
export { getUploadUrlTool } from "./get-upload-url.tool.js";

import { uploadAssetTool } from "./upload-asset.tool.js";
import { listAssetsTool } from "./list-assets.tool.js";
import { getAssetTool } from "./get-asset.tool.js";
import { deleteAssetTool } from "./delete-asset.tool.js";
import { tagAssetTool } from "./tag-asset.tool.js";
import { getUploadUrlTool } from "./get-upload-url.tool.js";
import { conformanceTools, type ToolDefinitionForFactory } from "@cesteral/shared";

const productionTools: ToolDefinitionForFactory[] = [
  uploadAssetTool,
  listAssetsTool,
  getAssetTool,
  deleteAssetTool,
  tagAssetTool,
  getUploadUrlTool,
];

export const allTools: ToolDefinitionForFactory[] = [
  ...productionTools,
  ...(process.env.MCP_INCLUDE_CONFORMANCE_TOOLS === "true" ? conformanceTools : []),
];
