// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Static resources. Add a reporting reference (dimensions, metrics, limits)
 * here as the platform's report surface is implemented (see snapchat-mcp).
 */

import { allTools } from "../../tools/definitions/index.js";
import { createToolExamplesResource, createServerCapabilitiesResource } from "@cesteral/shared";
import type { Resource } from "../types.js";

const toolExamplesResource = createToolExamplesResource(allTools, "{{package}}");
const serverCapabilitiesResource = createServerCapabilitiesResource({
  serverName: "{{package}}",
  toolGroups: {
    account: ["{{key}}_list_accounts"],
    entities: ["{{key}}_list_entities", "{{key}}_get_entity", "{{key}}_validate_entity"],
    // {{#writes}}
    conversions: ["{{key}}_insert_conversions"],
    // {{/writes}}
    reporting: [
      "{{key}}_get_report",
      // {{#writes}}
      "{{key}}_submit_report",
      "{{key}}_check_report_status",
      "{{key}}_download_report",
      // {{/writes}}
    ],
    specialized: ["{{key}}_get_pacing_status"],
    discovery: ["{{key}}_search_tools"],
  },
  commonWorkflows: ["performance_reporting", "conversion_upload"],
  startHere: "{{key}}_list_accounts",
});

export const allResources: Resource[] = [
  ...(toolExamplesResource ? [toolExamplesResource as unknown as Resource] : []),
  serverCapabilitiesResource as unknown as Resource,
];
