/**
 * Domain facade for DV360 targeting metadata helpers.
 *
 * Tool-layer utilities currently host the implementation; services consume this
 * facade to avoid importing directly from MCP tool modules.
 */
export * from "../../mcp-server/tools/utils/targeting-metadata.js";
