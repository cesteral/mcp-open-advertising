// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getEntityTypeEnum, type TtdEntityType } from "../utils/entity-mapping.js";
import { addParentValidationIssue, mergeParentIdsIntoData } from "../utils/parent-id-validation.js";
import {
  runTtdCreateDryRun,
  resolveTtdCreateCapability,
  symbolicValidate,
} from "../utils/dry-run.js";
import { McpError, JsonRpcErrorCode } from "@cesteral/shared";
import { snapshotFromTtdEntity } from "../utils/capture-snapshot.js";
import {
  DryRunResultSchema,
  NormalizedEntitySnapshotSchema,
  DispatchedCapabilitySchema,
} from "@cesteral/shared";
import type {
  McpTextContent,
  RequestContext,
  SdkContext,
  NormalizedEntitySnapshot,
  CesteralWriteToolAnnotations,
} from "@cesteral/shared";

const TOOL_NAME = "ttd_create_entity";
const TOOL_TITLE = "Create TTD Entity";
const TOOL_DESCRIPTION = `Create a new The Trade Desk entity.

**Supported entity types:** ${getEntityTypeEnum().join(", ")}

Provide the entity data as a JSON object. Required fields vary by entity type — refer to TTD API v3 documentation.`;

export const CreateEntityInputSchema = z
  .object({
    entityType: z.enum(getEntityTypeEnum()).describe("Type of entity to create"),
    partnerId: z
      .string()
      .optional()
      .describe("Partner ID (required when creating advertiser entities)"),
    advertiserId: z
      .string()
      .optional()
      .describe("Advertiser ID (required for most non-advertiser entities)"),
    campaignId: z.string().optional().describe("Campaign ID (required for adGroup)"),
    adGroupId: z.string().optional().describe("Ad Group ID (required for ad)"),
    data: z.record(z.any()).describe("Entity data to create (fields vary by entity type)"),
    strictMode: z
      .boolean()
      .optional()
      .describe(
        "Set TTD-Strict-Mode header — TTD returns 400 on unrecognized properties or read-only field assignments. Recommended for development/CI; avoid in production where harmless extra fields would otherwise succeed (per TTD Foundations §10)."
      ),
    dry_run: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "When true, validates the creation and returns a DryRunResult under `dryRun` (expected post-state = the would-be-created entity) without calling the TTD API. No entity is created."
      ),
  })
  .superRefine((input, ctx) => {
    const topLevelPartnerId =
      typeof input.partnerId === "string" ? input.partnerId.trim() : undefined;
    const payloadPartnerId =
      typeof input.data?.PartnerId === "string" ? input.data.PartnerId.trim() : undefined;

    if (input.entityType === "advertiser" && !topLevelPartnerId && !payloadPartnerId) {
      ctx.addIssue({
        code: "custom",
        message: "partnerId is required when creating advertiser entities",
        path: ["partnerId"],
      });
    }
    addParentValidationIssue(
      ctx,
      input.entityType as TtdEntityType,
      input as Record<string, unknown>,
      input.data
    );
  })
  .describe("Parameters for creating a TTD entity");

export const CreateEntityOutputSchema = z
  .object({
    entity: z.record(z.any()).describe("Created entity data"),
    entityType: z.string(),
    timestamp: z.string().datetime(),
    dryRun: DryRunResultSchema.optional().describe(
      "Present only when the request was made with `dry_run: true`. No entity was created."
    ),
    after: NormalizedEntitySnapshotSchema.optional().describe(
      "Post-create canonical snapshot, normalized from the created entity (in-scope kinds: campaign, ad_group). Create has no `before`."
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
  const { ttdService } = resolveSessionServices(sdkContext);
  const dispatchedCapability = resolveTtdCreateCapability(input.entityType);

  const data = mergeParentIdsIntoData(input.data, input as Record<string, unknown>);

  if (input.dry_run === true) {
    const dryRun = await runTtdCreateDryRun(
      { entityType: input.entityType, data },
      ttdService,
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

  // Fail fast on an empty or invalid create payload before hitting the API,
  // applying the same symbolic validation the dry-run path uses on the merged
  // data (finding 6.20).
  if (Object.keys(input.data).length === 0) {
    throw new McpError(
      JsonRpcErrorCode.InvalidParams,
      "`data` must contain at least one field to create a Trade Desk entity."
    );
  }
  const createValidationErrors = symbolicValidate(data);
  if (createValidationErrors.length > 0) {
    throw new McpError(
      JsonRpcErrorCode.InvalidParams,
      `Invalid create payload: ${createValidationErrors.map((e) => e.message).join("; ")}`
    );
  }

  const entity = (await ttdService.createEntity(input.entityType as TtdEntityType, data, context, {
    strictMode: input.strictMode,
  })) as unknown as Record<string, any>;

  // Normalize the created entity for the canonical `after` snapshot. Create has
  // no `before`. Best-effort: undefined for out-of-scope kinds.
  const createdId = String(entity?.CampaignId ?? entity?.AdGroupId ?? entity?.Id ?? "");
  const after: NormalizedEntitySnapshot | undefined = snapshotFromTtdEntity(
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
      text: `Entity created successfully\n${JSON.stringify(result.entity, null, 2)}\n\nTimestamp: ${result.timestamp}`,
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
    destructiveHint: true,
    idempotentHint: false,
    cesteral: {
      kind: "write",
      writeClass: "entity",
      executableArgsExclude: ["dry_run"],
      platform: "ttd",
      contractPlatformSlug: "ttd",
      contractToolSlug: "create_entity",
      operation: ["create"],
      // Governed scope mirrors `ttd_update_entity` — campaign + ad_group carry
      // a canonical Availability status. advertiser / creative /
      // conversionTracker are out of scope (resolve canonicalEntityKind: null,
      // no snapshot).
      entityKinds: ["campaign", "ad_group"],
      entityIdArgs: [],
      readPartner: {
        toolName: "ttd_get_entity",
        argMap: { entityType: "entityType" },
      },
      schemaVersion: 1,
      contractId: "ttd.create_entity.v1",
      // Symbolic create dry-run — TTD has no native validate mode. Validation
      // runs symbolic business rules; expected post-state is the
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
      label: "Create an advertiser",
      input: {
        entityType: "advertiser",
        partnerId: "partner123",
        data: {
          AdvertiserName: "Acme Corp",
          CurrencyCode: "USD",
        },
      },
    },
    {
      label: "Create a campaign",
      input: {
        entityType: "campaign",
        advertiserId: "adv123abc",
        data: {
          CampaignName: "Q1 2025 Brand Awareness",
          Budget: { Amount: 50000, CurrencyCode: "USD" },
          StartDate: "2025-01-15T00:00:00Z",
          EndDate: "2025-03-31T23:59:59Z",
          PacingMode: "PaceAhead",
        },
      },
    },
    {
      label: "Create an ad group under a campaign",
      input: {
        entityType: "adGroup",
        advertiserId: "adv123abc",
        campaignId: "camp456def",
        data: {
          AdGroupName: "Prospecting - Display",
          RTBAttributes: {
            BudgetSettings: { DailyBudget: { Amount: 500, CurrencyCode: "USD" } },
            BaseBidCPM: { Amount: 3.5, CurrencyCode: "USD" },
          },
        },
      },
    },
  ],
  logic: createEntityLogic,
  responseFormatter: createEntityResponseFormatter,
};
