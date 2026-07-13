// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { assertAccountScope } from "@cesteral/shared";
import { getEntityTypeEnum, type AmazonDspEntityType } from "../utils/entity-mapping.js";
import {
  runAmazonDspCreateDryRun,
  resolveAmazonDspCreateCapability,
  symbolicValidate,
} from "../utils/dry-run.js";
import { McpError, JsonRpcErrorCode } from "@cesteral/shared";
import { snapshotFromAmazonDspEntity } from "../utils/capture-snapshot.js";
import {
  DryRunResultSchema,
  NormalizedEntitySnapshotSchema,
  DispatchedCapabilitySchema,
} from "@cesteral/shared";
import type {
  RequestContext,
  McpTextContent,
  SdkContext,
  NormalizedEntitySnapshot,
  CesteralWriteToolAnnotations,
} from "@cesteral/shared";

const TOOL_NAME = "amazon_dsp_create_entity";
const TOOL_TITLE = "Create AmazonDsp Ads Entity";
const TOOL_DESCRIPTION = `Create a new AmazonDsp Ads entity.

**Supported entity types:** ${getEntityTypeEnum().join(", ")}

**Key requirements by entity type:**
- **campaign** / **order**: requires \`name\`, \`advertiserId\`, \`startDateTime\`, \`endDateTime\`
- **adGroup** / **lineItem**: requires \`name\`, \`orderId\`, \`advertiserId\`, \`budget\`
- **creative**: requires \`name\`, \`advertiserId\`, \`creativeType\` (STANDARD_DISPLAY, VIDEO, RICH_MEDIA)
- **target**: typically requires \`lineItemId\` plus tactic-specific targeting fields
- **creativeAssociation**: requires \`creativeId\` and \`lineItemId\`

**Gotchas:**
- State values: ENABLED, PAUSED, ARCHIVED
- Line item budget must be a nested object: \`{ budgetType: "DAILY" | "LIFETIME", budget: number }\`
- Amazon-Advertising-API-Scope header is automatically injected from the session profile ID`;

export const CreateEntityInputSchema = z
  .object({
    entityType: z.enum(getEntityTypeEnum()).describe("Type of entity to create"),
    profileId: z.string().min(1).describe("AmazonDsp Advertiser ID"),
    data: z.record(z.any()).describe("Entity fields as key-value pairs"),
    dry_run: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "When true, validates the creation and returns a DryRunResult under `dryRun` (expected post-state = the would-be-created entity) without calling the Amazon DSP API. No entity is created."
      ),
  })
  .describe("Parameters for creating a AmazonDsp Ads entity");

export const CreateEntityOutputSchema = z
  .object({
    entity: z.record(z.any()).describe("Created entity data (includes entity ID)"),
    entityType: z.string(),
    timestamp: z.string().datetime(),
    dryRun: DryRunResultSchema.optional().describe(
      "Present only when the request was made with `dry_run: true`. No entity was created."
    ),
    after: NormalizedEntitySnapshotSchema.optional().describe(
      "Post-create canonical snapshot, normalized from the created entity (in-scope kinds: order, line_item). Create has no `before`."
    ),
    dispatchedCapability: DispatchedCapabilitySchema.describe(
      "The concrete (operation, entityKind) this call resolved to. Present on every response."
    ),
  })
  .describe("Entity creation result");

type CreateEntityInput = z.infer<typeof CreateEntityInputSchema>;
type CreateEntityOutput = z.infer<typeof CreateEntityOutputSchema>;

export async function createEntityLogic(
  input: CreateEntityInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<CreateEntityOutput> {
  const { amazonDspService, boundProfileId } = resolveSessionServices(sdkContext);
  const dispatchedCapability = resolveAmazonDspCreateCapability(input.entityType);

  if (input.dry_run === true) {
    const dryRun = await runAmazonDspCreateDryRun(
      { entityType: input.entityType, data: input.data },
      amazonDspService,
      context
    );
    return {
      entity: {},
      entityType: input.entityType,
      timestamp: new Date().toISOString(),
      dryRun,
      dispatchedCapability,
    };
  }

  // Fail fast on a mismatched account — but only on the real-execution path, so a
  // dry-run preview with a different id is allowed (matches the other write tools).
  assertAccountScope(input.profileId, boundProfileId, "profileId");

  // Fail fast on an empty or invalid create payload before hitting the API,
  // applying the same symbolic validation the dry-run path uses (finding 6.20).
  if (Object.keys(input.data).length === 0) {
    throw new McpError(
      JsonRpcErrorCode.InvalidParams,
      "`data` must contain at least one field to create an Amazon DSP entity."
    );
  }
  const createValidationErrors = symbolicValidate(input.data);
  if (createValidationErrors.length > 0) {
    throw new McpError(
      JsonRpcErrorCode.InvalidParams,
      `Invalid create payload: ${createValidationErrors.map((e) => e.message).join("; ")}`
    );
  }

  const entity = (await amazonDspService.createEntity(
    input.entityType as AmazonDspEntityType,
    input.data,
    context
  )) as unknown as Record<string, unknown>;

  // Normalize the created entity for the canonical `after` snapshot. Create has
  // no `before`. Best-effort: undefined for out-of-scope kinds.
  const createdId = String(entity?.orderId ?? entity?.lineItemId ?? entity?.id ?? "");
  const after: NormalizedEntitySnapshot | undefined = snapshotFromAmazonDspEntity(
    input.entityType,
    createdId,
    entity
  );

  return {
    entity,
    entityType: input.entityType,
    timestamp: new Date().toISOString(),
    ...(after ? { after } : {}),
    dispatchedCapability,
  };
}

export function createEntityResponseFormatter(result: CreateEntityOutput): McpTextContent[] {
  if (result.dryRun) {
    const { wouldSucceed, validationErrors, validationSource, expectedStateSource } = result.dryRun;
    const verdict = wouldSucceed ? "would succeed" : "would FAIL";
    const errorLines = validationErrors.length
      ? "\n" + validationErrors.map((e) => `  - [${e.code}] ${e.message}`).join("\n")
      : "";
    return [
      {
        type: "text" as const,
        text: `Dry run: creating ${result.entityType} ${verdict} (validation: ${validationSource}, expected-state: ${expectedStateSource}). No entity was created.${errorLines}\n\nTimestamp: ${result.timestamp}`,
      },
    ];
  }
  return [
    {
      type: "text" as const,
      text: `${result.entityType} created successfully\n${JSON.stringify(result.entity, null, 2)}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const createEntityTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: CreateEntityInputSchema,
  outputSchema: CreateEntityOutputSchema,
  annotations: {
    readOnlyHint: false,
    openWorldHint: false,
    idempotentHint: false,
    destructiveHint: true,
    cesteral: {
      kind: "write",
      writeClass: "entity",
      executableArgsExclude: ["dry_run"],
      platform: "amazon_dsp",
      contractPlatformSlug: "amazon_dsp",
      contractToolSlug: "create_entity",
      operation: ["create"],
      // Governed scope mirrors `amazon_dsp_update_entity` — order
      // (campaign-equivalent) and lineItem (ad-group-equivalent) carry a
      // canonical kind. creative / target / creativeAssociation are out of
      // scope (resolve canonicalEntityKind: null, no snapshot).
      entityKinds: ["order", "line_item"],
      // `profileId` is the required top-level scope arg that locates where the
      // entity is created (hierarchy parent ids live in `data`). create has no
      // pre-existing entity id; the contract allows an empty entityIdArgs for
      // creates, but we declare the real scope arg we do have.
      entityIdArgs: ["profileId"],
      readPartner: {
        toolName: "amazon_dsp_get_entity",
        argMap: { entityType: "entityType", profileId: "profileId" },
      },
      schemaVersion: 1,
      contractId: "amazon_dsp.create_entity.v1",
      // Symbolic create dry-run — Amazon DSP has no native validate mode.
      // Validation runs symbolic business rules; expected post-state is the
      // would-be-created entity. `after` is normalized from the created entity
      // (create has no `before`).
      supportsDryRun: true,
      supportsBeforeAfterSnapshot: true,
      requiresValidation: true,
      requiresSimulation: true,
    } satisfies CesteralWriteToolAnnotations,
  },
  inputExamples: [
    {
      label: "Create an order (campaign)",
      input: {
        entityType: "order",
        profileId: "1234567890",
        data: {
          name: "Summer Sale 2026",
          advertiserId: "adv_123",
          startDateTime: "2026-07-01T00:00:00Z",
          endDateTime: "2026-07-31T23:59:59Z",
        },
      },
    },
    {
      label: "Create a line item (ad group)",
      input: {
        entityType: "lineItem",
        profileId: "1234567890",
        data: {
          name: "US Display — Retargeting",
          orderId: "ord_123456789",
          advertiserId: "adv_123",
          budget: { budgetType: "DAILY", budget: 2000 },
          bidding: { bidOptimization: "MANUAL", bidAmount: 2.5 },
        },
      },
    },
  ],
  logic: createEntityLogic,
  responseFormatter: createEntityResponseFormatter,
};
