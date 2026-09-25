// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * pinterest_validate_entity — Client-side schema validation for Pinterest Ads entities.
 *
 * Pinterest Marketing API does not have a dry-run mode, so this tool
 * validates payloads against the Pinterest v5 OpenAPI facts in
 * `../utils/pinterest-fields.ts` before hitting the API.
 * It is purely local — no API calls, no session services needed.
 */

import { z } from "zod";
import { getEntityTypeEnum, type PinterestEntityType } from "../utils/entity-mapping.js";
import {
  createValidateEntityTool,
  buildNextAction,
  validateEnumFieldsStructured,
} from "@cesteral/shared";
import {
  OPTIONAL_ENUM_FIELDS,
  READ_ONLY_FIELDS,
  REQUIRED_CREATE_FIELDS,
  pinterestFieldIssues,
} from "../utils/pinterest-fields.js";

export const validateEntityTool = createValidateEntityTool<PinterestEntityType>({
  toolName: "pinterest_validate_entity",
  toolTitle: "Pinterest Ads Entity Validation (Client-Side)",
  toolDescription: `Validate a Pinterest Ads entity payload against the Pinterest v5 OpenAPI without calling the API.

**Supported entity types:** ${getEntityTypeEnum().join(", ")}

**create** requires, per type:
- **campaign**: \`name\`, \`objective_type\`
- **adGroup**: \`name\`, \`campaign_id\`, \`billable_event\`
- **ad**: \`ad_group_id\`, \`creative_type\`, \`pin_id\`
- **creative** (Pin): nothing is required by the spec; a missing \`board_id\` or \`media_source\` is a warning

**Both modes** check enum values when present (\`status\`, \`objective_type\`, \`billable_event\`, \`budget_type\`, \`bid_strategy_type\`, \`pacing_delivery_type\`, \`placement_group\`, \`creative_type\`, \`customizable_cta_type\`), integer micro-currency money, integer Unix-second times, UPPERCASE \`targeting_spec\` keys and the Pin \`media_source\` shape.

**update** also warns on read-only fields and on fields only a draft can change (a campaign's \`objective_type\`, an ad group's \`billable_event\`, an ad's \`pin_id\`).

This is a pure client-side check. Pinterest may still reject a payload for business rules, such as a bid that the objective and billable event require.`,
  entityTypeEnum: getEntityTypeEnum() as readonly [PinterestEntityType, ...PinterestEntityType[]],
  getRules: (entityType) => REQUIRED_CREATE_FIELDS[entityType],
  getReadOnlyFields: (entityType) => READ_ONLY_FIELDS[entityType],
  extraInputSchema: {
    adAccountId: z
      .string()
      .optional()
      .describe("Pinterest ad account ID. Optional; the check does not use it."),
  },
  extraValidate: ({ entityType, mode, data, issues }) => {
    issues.push(...validateEnumFieldsStructured(data, OPTIONAL_ENUM_FIELDS[entityType]));
    issues.push(...pinterestFieldIssues(entityType, mode, data));

    if (mode === "update" && Object.keys(data).length === 0) {
      issues.push({
        field: "data",
        code: "custom",
        message: "Update payload must contain at least one field to update",
        severity: "error",
      });
    }

    const errorIssues = issues.filter((i) => i.severity !== "warning");
    if (errorIssues.length === 0) return;

    const parentField = errorIssues.find((i) => ["campaign_id", "ad_group_id"].includes(i.field));
    return {
      nextAction: parentField
        ? buildNextAction({
            kind: "list-entity",
            tool: "pinterest_list_entities",
            field: parentField.field,
          })
        : buildNextAction({
            kind: "list-entity",
            tool: "pinterest_list_entities",
            entityType,
          }),
    };
  },
  inputExamples: [
    {
      label: "Valid campaign create",
      input: {
        entityType: "campaign",
        mode: "create",
        adAccountId: "1234567890",
        data: {
          name: "Summer Sale 2026",
          objective_type: "AWARENESS",
          status: "PAUSED",
          daily_spend_cap: 100000000,
        },
      },
    },
    {
      label: "Missing required fields (ad group)",
      input: {
        entityType: "adGroup",
        mode: "create",
        adAccountId: "1234567890",
        data: { name: "Test Ad Group" },
      },
    },
  ],
});

export const ValidateEntityInputSchema = validateEntityTool.inputSchema;
export const ValidateEntityOutputSchema = validateEntityTool.outputSchema;
export const validateEntityLogic = validateEntityTool.logic;
