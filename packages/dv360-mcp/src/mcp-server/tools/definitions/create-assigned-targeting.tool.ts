// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import {
  ALL_TARGETING_TYPES,
  type TargetingParentType,
  type TargetingType,
  TARGETING_TYPE_DESCRIPTIONS,
  getTargetingDetailSchemaName,
  getSupportedTargetingParentTypes,
  validateTargetingInput,
  getTargetingValidationError,
  buildTargetingIds,
} from "../utils/targeting-metadata.js";
import { getTargetingRequiredIdInputShape } from "../utils/targeting-input-shape.js";
import {
  assertGovernedEffectDryRun,
  EffectResultSchema,
  EffectDryRunResultSchema,
  DispatchedCapabilitySchema,
} from "@cesteral/shared";
import type {
  RequestContext,
  McpTextContent,
  SdkContext,
  EffectResult,
  EffectDryRunResult,
  DispatchedCapability,
  CesteralWriteToolAnnotations,
} from "@cesteral/shared";

const TOOL_NAME = "dv360_create_assigned_targeting";
const TOOL_TITLE = "Create DV360 Assigned Targeting Option";

const TOOL_DESCRIPTION = `Create a new assigned targeting option on a DV360 entity (Advertiser, Line Item, or Ad Group).

**Important:** Fetch the targeting schema first using the MCP resource \`targeting-schema://{targetingType}\` to understand required fields.

**Example data payloads:**

For TARGETING_TYPE_CHANNEL:
\`\`\`json
{
  "channelDetails": {
    "channelId": "123456",
    "negative": true
  }
}
\`\`\`

For TARGETING_TYPE_GEO_REGION:
\`\`\`json
{
  "geoRegionDetails": {
    "targetingOptionId": "2840",
    "negative": false
  }
}
\`\`\`

See MCP resource \`targeting-types://\` for all available targeting types.`;

/**
 * Input schema for create assigned targeting tool
 */
const TargetingRequiredIdInputShape = getTargetingRequiredIdInputShape();

export const CreateAssignedTargetingInputSchema = z
  .object({
    parentType: z
      .enum(getSupportedTargetingParentTypes() as [string, ...string[]])
      .describe("Type of parent entity"),
    advertiserId: z.string().describe("DV360 Advertiser ID"),
    ...TargetingRequiredIdInputShape,
    targetingType: z
      .enum(ALL_TARGETING_TYPES as unknown as [string, ...string[]])
      .describe("Targeting type to create"),
    data: z
      .record(z.any())
      .describe(
        "Targeting option data payload. Structure depends on targetingType. Fetch targeting-schema://{type} for schema details."
      ),
    dry_run: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "When true, validates the request and returns an EffectDryRunResult under `dryRun` (expected effect = the targeting option would be created) without calling the DV360 API. Nothing is created."
      ),
  })
  .refine(validateTargetingInput, getTargetingValidationError)
  .describe("Parameters for creating an assigned targeting option");

/**
 * Output schema for create assigned targeting tool
 */
export const CreateAssignedTargetingOutputSchema = z
  .object({
    createdTargetingOption: z.record(z.any()).describe("The created assigned targeting option"),
    assignedTargetingOptionId: z.string().describe("ID of the newly created targeting option"),
    parentType: z.string().describe("Parent entity type"),
    targetingType: z.string().describe("Targeting type"),
    timestamp: z.string().datetime(),
    dryRun: EffectDryRunResultSchema.optional().describe(
      "Present only when the request was made with `dry_run: true`. Nothing was created."
    ),
    effect: EffectResultSchema.optional().describe(
      "Effect-class result identity (effectKind `assigned_targeting_created` + scalar audit summary). Present on a real create."
    ),
    dispatchedCapability: DispatchedCapabilitySchema.describe(
      "The concrete (operation, entityKind) this call resolved to — `manage` with `canonicalEntityKind: null` (effect class; an assigned targeting option is not a canonical entity). Present on every response."
    ),
  })
  .describe("Created assigned targeting option result");

type CreateAssignedTargetingInput = z.infer<typeof CreateAssignedTargetingInputSchema>;
type CreateAssignedTargetingOutput = z.infer<typeof CreateAssignedTargetingOutputSchema>;

/**
 * Create assigned targeting tool logic
 */
export async function createAssignedTargetingLogic(
  input: CreateAssignedTargetingInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<CreateAssignedTargetingOutput> {
  // Effect-class write: an assigned targeting option is not a canonical entity,
  // so there is no before/after snapshot — the create is governed as an effect.
  const dispatchedCapability: DispatchedCapability = {
    operation: "manage",
    canonicalEntityKind: null,
  };

  if (input.dry_run === true) {
    return {
      createdTargetingOption: {},
      assignedTargetingOptionId: "",
      parentType: input.parentType,
      targetingType: input.targetingType,
      timestamp: new Date().toISOString(),
      dryRun: buildAssignedTargetingEffectDryRun(input),
      dispatchedCapability,
    };
  }

  const { targetingService } = resolveSessionServices(sdkContext);

  // Build IDs object using config-driven helper
  const ids = buildTargetingIds(input.parentType as TargetingParentType, input.advertiserId, input);

  const result = await targetingService.createAssignedTargetingOption(
    input.parentType as TargetingParentType,
    ids,
    input.targetingType as TargetingType,
    input.data,
    context
  );

  const resultObj = result as Record<string, any>;
  const assignedTargetingOptionId =
    resultObj.assignedTargetingOptionId || resultObj.name?.split("/").pop() || "unknown";

  // Effect summary carries audit identity only (ids + type) — never the raw
  // targeting `data` payload.
  const effect: EffectResult = {
    effectKind: "assigned_targeting_created",
    summary: {
      parent_type: input.parentType,
      targeting_type: input.targetingType,
      assigned_targeting_option_id: assignedTargetingOptionId,
    },
  };

  return {
    createdTargetingOption: resultObj,
    assignedTargetingOptionId,
    parentType: input.parentType,
    targetingType: input.targetingType,
    timestamp: new Date().toISOString(),
    effect,
    dispatchedCapability,
  };
}

/**
 * Symbolic effect dry-run for `dv360_create_assigned_targeting`. The targeting
 * type and the parent-id shape are enforced by the input schema's enum + refine,
 * so a well-formed call always passes; the projected effect is the creation of
 * the targeting option. Pure (no I/O); never includes the raw `data` payload.
 */
function buildAssignedTargetingEffectDryRun(
  input: CreateAssignedTargetingInput
): EffectDryRunResult {
  const expectedEffect: EffectResult = {
    effectKind: "assigned_targeting_created",
    summary: { parent_type: input.parentType, targeting_type: input.targetingType },
  };

  return assertGovernedEffectDryRun(
    {
      wouldSucceed: true,
      validationErrors: [],
      validationSource: "symbolic",
      expectedEffectSource: "symbolic",
      expectedEffect,
    },
    TOOL_NAME,
    { requiresValidation: true, requiresSimulation: true }
  );
}

/**
 * Format response for MCP client
 */
export function createAssignedTargetingResponseFormatter(
  result: CreateAssignedTargetingOutput
): McpTextContent[] {
  if (result.dryRun) {
    const { wouldSucceed, validationSource, expectedEffectSource } = result.dryRun;
    return [
      {
        type: "text" as const,
        text: `Dry run: creating ${result.targetingType} targeting on ${result.parentType} ${wouldSucceed ? "would succeed" : "would FAIL"} (validation: ${validationSource}, expected-effect: ${expectedEffectSource}). Nothing was created.\n\nTimestamp: ${result.timestamp}`,
      },
    ];
  }
  const typeDesc =
    TARGETING_TYPE_DESCRIPTIONS[result.targetingType as TargetingType] || result.targetingType;
  const schemaName = getTargetingDetailSchemaName(result.targetingType as TargetingType);

  return [
    {
      type: "text" as const,
      text: `Successfully created ${result.targetingType} targeting option

ID: ${result.assignedTargetingOptionId}
Parent: ${result.parentType}
Type: ${typeDesc}
Schema: ${schemaName}

Created Targeting Option:
${JSON.stringify(result.createdTargetingOption, null, 2)}

Timestamp: ${result.timestamp}`,
    },
  ];
}

/**
 * Create Assigned Targeting Tool Definition
 */
export const createAssignedTargetingTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: CreateAssignedTargetingInputSchema,
  outputSchema: CreateAssignedTargetingOutputSchema,
  inputExamples: [
    {
      label: "Assign geo targeting to a line item",
      input: {
        parentType: "lineItem",
        advertiserId: "1234567",
        lineItemId: "7654321",
        targetingType: "TARGETING_TYPE_GEO_REGION",
        data: {
          geoRegionDetails: {
            displayName: "United States",
            geoRegionType: "GEO_REGION_TYPE_COUNTRY",
            negative: false,
          },
        },
      },
    },
    {
      label: "Assign channel targeting at the advertiser level",
      input: {
        parentType: "advertiser",
        advertiserId: "1234567",
        targetingType: "TARGETING_TYPE_CHANNEL",
        data: {
          channelDetails: { channelId: "888999", negative: false },
        },
      },
    },
  ],
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    openWorldHint: false,
    idempotentHint: false,
    cesteral: {
      kind: "write",
      writeClass: "effect",
      executableArgsExclude: ["dry_run"],
      platform: "dv360",
      contractPlatformSlug: "dv360",
      contractToolSlug: "create_assigned_targeting",
      operation: ["manage"],
      entityKinds: [],
      entityIdArgs: ["advertiserId"],
      schemaVersion: 1,
      contractId: "dv360.create_assigned_targeting.v1",
      supportsDryRun: true,
      supportsBeforeAfterSnapshot: false,
      requiresValidation: true,
      requiresSimulation: true,
    } satisfies CesteralWriteToolAnnotations,
  },
  logic: createAssignedTargetingLogic,
  responseFormatter: createAssignedTargetingResponseFormatter,
};
