// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Static resources. Add entity schemas and examples here as the platform's
 * entity surface is implemented (see pinterest-mcp's resources/definitions).
 */

import { allTools } from "../../tools/definitions/index.js";
import { createToolExamplesResource, createServerCapabilitiesResource } from "@cesteral/shared";
import type { Resource } from "../types.js";

const toolExamplesResource = createToolExamplesResource(allTools, "{{package}}");
const serverCapabilitiesResource = createServerCapabilitiesResource({
  serverName: "{{package}}",
  toolGroups: {
    crud: [
      "{{key}}_list_entities",
      "{{key}}_get_entity",
      "{{key}}_create_entity",
      "{{key}}_update_entity",
      "{{key}}_delete_entity",
    ],
    account: ["{{key}}_list_accounts"],
    bulk: ["{{key}}_bulk_update_status"],
    specialized: ["{{key}}_get_pacing_status"],
    validation: ["{{key}}_validate_entity"],
    discovery: ["{{key}}_search_tools"],
  },
  commonWorkflows: ["campaign_setup"],
  startHere: "{{key}}_list_accounts",
});

export const allResources: Resource[] = [
  ...(toolExamplesResource ? [toolExamplesResource as unknown as Resource] : []),
  serverCapabilitiesResource as unknown as Resource,
];
