// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Domain facade for DV360 entity mapping metadata and schema helpers.
 *
 * Tool-layer utilities currently host the implementation; services consume this
 * facade to avoid importing directly from MCP tool modules.
 */
export * from "../../mcp-server/tools/utils/entity-mapping-dynamic.js";
