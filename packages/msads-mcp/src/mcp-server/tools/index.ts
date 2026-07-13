// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { conformanceTools, type ToolDefinitionForFactory } from "@cesteral/shared";
import { productionTools } from "./definitions/index.js";

export { productionTools };

/**
 * All tool definitions for the Microsoft Ads MCP server.
 * Conformance tools are only included when MCP_INCLUDE_CONFORMANCE_TOOLS=true,
 * matching every other server in the fleet so msads can also run the MCP
 * conformance harness (previously msads exported `productionTools` directly as
 * `allTools`, so the env-gated conformance tools were never registered).
 */
export const allTools: ToolDefinitionForFactory[] = [
  ...productionTools,
  ...(process.env.MCP_INCLUDE_CONFORMANCE_TOOLS === "true" ? conformanceTools : []),
];
