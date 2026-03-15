// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * SA360 MCP Resources - Barrel Export
 */

export type { Resource } from "./types.js";

import { definitionResources } from "./definitions/index.js";
import { allTools } from "../tools/definitions/index.js";
import {
  createToolExamplesResource,
  createServerCapabilitiesResource,
} from "@cesteral/shared";
import type { Resource } from "./types.js";

const toolExamplesResource = createToolExamplesResource(allTools, "sa360-mcp");
const serverCapabilitiesResource = createServerCapabilitiesResource({
  serverName: "sa360-mcp",
  toolGroups: {
    read: [
      "sa360_search",
      "sa360_list_accounts",
      "sa360_get_entity",
      "sa360_list_entities",
      "sa360_get_insights",
      "sa360_get_insights_breakdowns",
      "sa360_list_custom_columns",
      "sa360_search_fields",
    ],
    write: ["sa360_insert_conversions", "sa360_update_conversions"],
    validation: ["sa360_validate_conversion"],
  },
  commonWorkflows: ["cross_engine_performance_analysis", "offline_conversion_upload"],
  startHere: "sa360_list_accounts",
});

/**
 * All resources for registration
 */
export const allResources: Resource[] = [
  ...definitionResources,
  ...(toolExamplesResource ? [toolExamplesResource as unknown as Resource] : []),
  serverCapabilitiesResource as unknown as Resource,
];