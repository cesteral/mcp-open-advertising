// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getEntityTypeEnum, type CM360EntityType } from "../utils/entity-mapping.js";
import { runCm360CreateDryRun, resolveCm360CreateCapability } from "../utils/dry-run.js";
import { snapshotFromCm360Entity } from "../utils/capture-snapshot.js";
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

const TOOL_NAME = "cm360_create_entity";
const TOOL_TITLE = "Create CM360 Entity";
const TOOL_DESCRIPTION = `Create a new Campaign Manager 360 entity.

**Supported entity types:** ${getEntityTypeEnum().join(", ")}

Provide the entity data as a JSON object. Required fields vary by entity type — refer to CM360 API v5 documentation.`;

export const CreateEntityInputSchema = z
  .object({
    profileId: z.string().min(1).describe("CM360 User Profile ID"),
    entityType: z.enum(getEntityTypeEnum()).describe("Type of entity to create"),
    data: z.record(z.any()).describe("Entity data to create (fields vary by entity type)"),
    dry_run: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "When true, validates the creation and returns a DryRunResult under `dryRun` (expected post-state = the would-be-created entity) without calling the CM360 API. No entity is created."
      ),
  })
  .describe("Parameters for creating a CM360 entity");

export const CreateEntityOutputSchema = z
  .object({
    entity: z.record(z.any()).describe("Created entity data"),
    entityType: z.string(),
    timestamp: z.string().datetime(),
    dryRun: DryRunResultSchema.optional().describe(
      "Present only when the request was made with `dry_run: true`. No entity was created."
    ),
    after: NormalizedEntitySnapshotSchema.optional().describe(
      "Post-create canonical snapshot, normalized from the created entity (in-scope kinds: campaign, ad). Create has no `before`."
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
  const { cm360Service } = resolveSessionServices(sdkContext);
  const dispatchedCapability = resolveCm360CreateCapability(input.entityType);

  if (input.dry_run === true) {
    const dryRun = await runCm360CreateDryRun(
      { entityType: input.entityType, data: input.data },
      cm360Service,
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

  const entity = (await cm360Service.createEntity(
    input.entityType as CM360EntityType,
    input.profileId,
    input.data,
    context
  )) as unknown as Record<string, any>;

  // Normalize the created entity for the canonical `after` snapshot. Create has
  // no `before`. Best-effort: undefined for out-of-scope kinds.
  const createdId = String(entity?.id ?? "");
  const after: NormalizedEntitySnapshot | undefined = snapshotFromCm360Entity(
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
    openWorldHint: true,
    destructiveHint: true,
    idempotentHint: false,
    cesteral: {
      kind: "write",
      writeClass: "entity",
      executableArgsExclude: ["dry_run"],
      platform: "cm360",
      contractPlatformSlug: "cm360",
      contractToolSlug: "create_entity",
      operation: ["create"],
      // Governed scope mirrors `cm360_update_entity` — campaign + ad carry a
      // canonical snapshot. floodlightActivity / creative / placement and the
      // other CM360 types are out of scope (resolve canonicalEntityKind: null,
      // no snapshot).
      entityKinds: ["campaign", "ad"],
      entityIdArgs: ["profileId"],
      readPartner: {
        toolName: "cm360_get_entity",
        argMap: { entityType: "entityType", profileId: "profileId" },
      },
      schemaVersion: 1,
      contractId: "cm360.create_entity.v1",
      // Symbolic create dry-run — CM360 has no native validate mode. Validation
      // runs symbolic status-boolean rules; expected post-state is the
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
      label: "Create a campaign",
      input: {
        profileId: "123456",
        entityType: "campaign",
        data: {
          name: "Q1 2026 Brand Campaign",
          advertiserId: "789012",
          startDate: "2026-01-15",
          endDate: "2026-03-31",
        },
      },
    },
    {
      label: "Create a floodlight activity",
      input: {
        profileId: "123456",
        entityType: "floodlightActivity",
        data: {
          name: "Purchase Confirmation",
          floodlightConfigurationId: "456789",
          floodlightActivityGroupId: "111222",
          expectedUrl: "https://example.com/purchase",
          countingMethod: "STANDARD_COUNTING",
        },
      },
    },
  ],
  logic: createEntityLogic,
  responseFormatter: createEntityResponseFormatter,
};
