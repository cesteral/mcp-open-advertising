// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * amazon_dsp_validate_entity — Client-side schema validation for Amazon DSP entities.
 *
 * The Unified API (`/adsApi/v1/*`) declares no validate-only mode, so this
 * tool validates payloads against the spec's required create fields
 * (unified-api-dsp.json `DSP<Entity>Create.required`, minus the `adProduct` /
 * `state` this server supplies) and runs the same request-body translation
 * the create / update tools run (legacy-field mapping, state enums). Purely
 * local.
 */

import { z } from "zod";
import {
  getEntityContract,
  getEntityTypeEnum,
  getCanonicalEntityType,
  type AmazonDspEntityType,
} from "../utils/entity-mapping.js";
import { type FieldRule, createValidateEntityTool } from "@cesteral/shared";
import {
  translateCreatePayload,
  translateUpdatePayload,
} from "../../../services/amazon-dsp/unified-payload.js";

export const validateEntityTool = createValidateEntityTool<AmazonDspEntityType>({
  toolName: "amazon_dsp_validate_entity",
  toolTitle: "AmazonDsp Ads Entity Validation (Client-Side)",
  toolDescription: `Validate an entity payload against the Amazon Ads Unified API (\`/adsApi/v1/*\`) requirements without calling the API.

Checks the spec's required create fields, data types, read-only fields, and the
same payload rules \`amazon_dsp_create_entity\` / \`amazon_dsp_update_entity\` apply
(state values, legacy \`/dsp\` field names and how they map).

**Supported entity types:** ${getEntityTypeEnum().join(", ")}

This is a pure client-side check — the Amazon DSP API may still reject payloads
for business-rule reasons (e.g. an invalid inventory type / bid strategy combination).`,
  entityTypeEnum: getEntityTypeEnum() as readonly [AmazonDspEntityType, ...AmazonDspEntityType[]],
  getRules: (entityType) => getEntityContract(entityType).requiredOnCreate as FieldRule[],
  getReadOnlyFields: (entityType) => getEntityContract(entityType).readOnlyFields,
  extraInputSchema: {
    profileId: z.string().optional().describe("Amazon Ads profile ID (optional)"),
    accountId: z
      .string()
      .optional()
      .describe(
        "DSP advertiser ID the payload will be sent under (optional; enables the advertiserId match check)"
      ),
  },
  extraValidate: ({ entityType, mode, data, extra, issues }) => {
    const canonical = getCanonicalEntityType(entityType);
    const contract = getEntityContract(entityType);
    const accountId =
      typeof extra.accountId === "string" && extra.accountId.length > 0
        ? extra.accountId
        : typeof data.advertiserId === "string"
          ? data.advertiserId
          : "";

    if (mode === "create") {
      // A legacy alias (e.g. `orderId` for `campaignId`) satisfies the
      // required-field rule, exactly as the create translation maps it.
      for (const [legacy, unified] of Object.entries(contract.legacyFieldRenames)) {
        if (legacy in data) {
          for (let i = issues.length - 1; i >= 0; i--) {
            if (issues[i].field === unified && issues[i].code === "missing") issues.splice(i, 1);
          }
        }
      }
      if (contract.createStateMustBe) {
        for (let i = issues.length - 1; i >= 0; i--) {
          if (issues[i].field === "state" && issues[i].code === "missing") issues.splice(i, 1);
        }
      }
    }

    const translated =
      mode === "create"
        ? translateCreatePayload(canonical, data, accountId)
        : translateUpdatePayload(canonical, "validate", data, accountId);
    for (const issue of translated.issues) {
      if (issue.code === "CONFLICTING_FIELDS" && issue.field === `data.${contract.idField}`) {
        continue; // update-mode id check needs a real entityId; not meaningful here
      }
      issues.push({
        field: issue.field.replace(/^data\./, ""),
        code: "custom",
        message: `[${issue.code}] ${issue.message}`,
        severity: "error",
      });
    }
  },
  inputExamples: [
    {
      label: "Valid order (campaign) create",
      input: {
        entityType: "order",
        mode: "create",
        accountId: "5550001112223",
        data: {
          name: "Summer Sale 2026",
          flights: [
            {
              startDateTime: "2026-07-01T00:00:00Z",
              endDateTime: "2026-07-31T23:59:59Z",
              budget: {
                budgetType: "MONETARY",
                budgetValue: { monetaryBudgetValue: { monetaryBudget: { value: 50000 } } },
              },
            },
          ],
          optimizations: { bidSettings: { bidStrategy: "SPEND_BUDGET_IN_FULL" } },
        },
      },
    },
    {
      label: "Missing required fields (line item)",
      input: {
        entityType: "lineItem",
        mode: "create",
        data: { name: "Test Ad Group" },
      },
    },
  ],
});
