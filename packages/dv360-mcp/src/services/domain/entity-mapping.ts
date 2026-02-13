/**
 * Domain facade for DV360 entity mapping metadata and schema helpers.
 *
 * Tool-layer utilities currently host the implementation; services consume this
 * facade to avoid importing directly from MCP tool modules.
 */
export * from "../../mcp-server/tools/utils/entity-mapping-dynamic.js";
