// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import {
  getEntityConfig,
  getEntityTypeEnum,
  type MsAdsEntityType,
} from "../utils/entity-mapping.js";
import { runMsAdsCreateDryRun, resolveMsAdsCreateCapability } from "../utils/dry-run.js";
import { snapshotFromMsAdsEntity } from "../utils/capture-snapshot.js";
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

const TOOL_NAME = "msads_create_entity";
const TOOL_TITLE = "Create Microsoft Ads Entity";
const TOOL_DESCRIPTION = `Create a new Microsoft Advertising entity.

**Supported entity types:** ${getEntityTypeEnum().join(", ")}

The data object should follow Microsoft Ads API v13 format. Wrap entities in their plural key (e.g., { "Campaigns": [{ "Name": "..." }] }).

Use the entity-schema and entity-examples MCP resources to discover required fields.`;

/**
 * Pull the single entity item out of its plural collection key
 * (e.g. `{ Campaigns: [{ … }] }` → `{ … }`). Microsoft Ads Add operations take
 * a batched payload; the governed snapshot/validation operate on one item.
 */
function unwrapEntityItem(
  entityType: MsAdsEntityType,
  data: Record<string, unknown>
): Record<string, unknown> {
  const config = getEntityConfig(entityType);
  const collection = data[config.pluralName];
  if (Array.isArray(collection) && collection.length > 0 && typeof collection[0] === "object") {
    return (collection[0] ?? {}) as Record<string, unknown>;
  }
  return {};
}

/** Best-effort: pull the first created ID out of an Add response (`*Ids: [...]`). */
function extractCreatedId(result: Record<string, unknown>): string {
  for (const [key, value] of Object.entries(result)) {
    if (key.endsWith("Ids") && Array.isArray(value)) {
      const first = value.find((v) => v != null);
      if (first != null) return String(first);
    }
  }
  return "";
}

export const CreateEntityInputSchema = z
  .object({
    entityType: z.enum(getEntityTypeEnum()).describe("Type of entity to create"),
    data: z.record(z.unknown()).describe("Entity data payload following Microsoft Ads API format"),
    dry_run: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "When true, validates the creation and returns a DryRunResult under `dryRun` (expected post-state = the would-be-created entity) without calling the Microsoft Ads API. No entity is created."
      ),
  })
  .describe("Parameters for creating a Microsoft Ads entity");

export const CreateEntityOutputSchema = z
  .object({
    result: z.record(z.any()).describe("API response with created entity IDs"),
    entityType: z.string(),
    timestamp: z.string().datetime(),
    dryRun: DryRunResultSchema.optional().describe(
      "Present only when the request was made with `dry_run: true`. No entity was created."
    ),
    after: NormalizedEntitySnapshotSchema.optional().describe(
      "Post-create canonical snapshot, normalized from the submitted entity payload (in-scope kinds: campaign, ad_group, ad, campaign_budget). Create has no `before`."
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
  const { msadsService } = resolveSessionServices(sdkContext);
  const dispatchedCapability = resolveMsAdsCreateCapability(input.entityType);
  const entityItem = unwrapEntityItem(input.entityType as MsAdsEntityType, input.data);

  if (input.dry_run === true) {
    const dryRun = await runMsAdsCreateDryRun(
      { entityType: input.entityType, data: entityItem },
      msadsService,
      context
    );
    return {
      result: {},
      entityType: input.entityType,
      timestamp: new Date().toISOString(),
      dryRun,
      dispatchedCapability,
    };
  }

  const result = (await msadsService.createEntity(
    input.entityType as MsAdsEntityType,
    input.data,
    context
  )) as Record<string, unknown>;

  // Normalize the submitted payload for the canonical `after` snapshot. The Add
  // response returns only IDs, so the entity fields come from the request item;
  // the created ID is best-effort from the response. Create has no `before`.
  const createdId = extractCreatedId(result);
  const after: NormalizedEntitySnapshot | undefined = snapshotFromMsAdsEntity(
    input.entityType,
    createdId,
    entityItem
  );

  return {
    result,
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
      text: `Created ${result.entityType} entity\n\nResult:\n${JSON.stringify(result.result, null, 2)}\n\nTimestamp: ${result.timestamp}`,
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
    destructiveHint: false,
    cesteral: {
      kind: "write",
      writeClass: "entity",
      executableArgsExclude: ["dry_run"],
      platform: "msads",
      contractPlatformSlug: "msads",
      contractToolSlug: "create_entity",
      operation: ["create"],
      // Governed scope mirrors `msads_update_entity` — campaign / adGroup / ad /
      // budget carry a canonical kind. keyword / adExtension / audience / label
      // are out of scope (resolve canonicalEntityKind: null, no snapshot).
      entityKinds: ["campaign", "ad_group", "ad", "campaign_budget"],
      entityIdArgs: [],
      readPartner: {
        toolName: "msads_get_entity",
        argMap: {},
      },
      schemaVersion: 1,
      contractId: "msads.create_entity.v1",
      // Symbolic create dry-run — Microsoft Ads has no native validate mode for
      // Add operations. Validation runs symbolic business rules; expected
      // post-state is the would-be-created entity. `after` is normalized from
      // the submitted payload (create has no `before`).
      supportsDryRun: true,
      supportsBeforeAfterSnapshot: true,
      requiresValidation: true,
      requiresSimulation: true,
    } satisfies CesteralWriteToolAnnotations,
  },
  inputExamples: [
    {
      label: "Create a campaign",
      input: {
        entityType: "campaign",
        data: {
          Campaigns: [
            {
              Name: "My Campaign",
              BudgetType: "DailyBudgetStandard",
              DailyBudget: 50.0,
              TimeZone: "EasternTimeUSCanada",
            },
          ],
        },
      },
    },
  ],
  logic: createEntityLogic,
  responseFormatter: createEntityResponseFormatter,
};
