// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * {{key}}_validate_entity: client-side payload validation, no API call.
 *
 * TODO(scaffold): replace REQUIRED_CREATE_FIELDS and READ_ONLY_FIELDS with the
 * vendor's required and read-only fields.
 */

import { z } from "zod";
import { createValidateEntityTool, type FieldRule } from "@cesteral/shared";
import { getEntityTypeEnum, type {{Pascal}}EntityType } from "../utils/entity-mapping.js";

const REQUIRED_CREATE_FIELDS: Record<{{Pascal}}EntityType, FieldRule[]> = {
  campaign: [{ field: "name", expectedType: "string" }],
  ad_group: [
    { field: "name", expectedType: "string" },
    { field: "campaign_id", expectedType: "string" },
  ],
  ad: [
    { field: "name", expectedType: "string" },
    { field: "ad_group_id", expectedType: "string" },
  ],
};

const READ_ONLY_FIELDS: readonly string[] = ["id", "created_time", "updated_time"];

export const validateEntityTool = createValidateEntityTool<{{Pascal}}EntityType>({
  toolName: "{{key}}_validate_entity",
  toolTitle: "{{displayName}} Entity Validation (Client-Side)",
  toolDescription: `Validate a {{displayName}} entity payload without calling the API.

**Supported entity types:** ${getEntityTypeEnum().join(", ")}

**create** checks required fields; **update** also warns on read-only fields. The platform may still reject a payload this check accepts.`,
  entityTypeEnum: getEntityTypeEnum(),
  rulesByEntity: REQUIRED_CREATE_FIELDS,
  readOnlyFields: READ_ONLY_FIELDS,
  extraInputSchema: {
    accountId: z
      .string()
      .optional()
      .describe("{{displayName}} account ID. Optional; the check does not use it."),
  },
  inputExamples: [
    {
      label: "Valid campaign create",
      input: { entityType: "campaign", mode: "create", data: { name: "Example" } },
    },
  ],
});
