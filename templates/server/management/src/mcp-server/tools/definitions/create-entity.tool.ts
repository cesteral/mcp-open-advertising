// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Governed stub. The schema and the cesteral annotation are the contract a
 * client and the governance layer see; the handler throws until the
 * {{displayName}} call is implemented.
 *
 * TODO(scaffold): implement the create call, a symbolic dry-run (see
 * pinterest-mcp's `runPinterestCreateDryRun`), the `after` snapshot, and a
 * wire-request test that calls `createEntityLogic` with only `fetch` stubbed.
 */

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getEntityTypeEnum } from "../utils/entity-mapping.js";
import { notImplemented } from "../utils/not-implemented.js";
import {
  DryRunResultSchema,
  NormalizedEntitySnapshotSchema,
  DispatchedCapabilitySchema,
  assertAccountScope,
} from "@cesteral/shared";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext, CesteralWriteToolAnnotations } from "@cesteral/shared";

const TOOL_NAME = "{{key}}_create_entity";
const TOOL_TITLE = "Create {{displayName}} Entity";
const TOOL_DESCRIPTION = `Create a {{displayName}} entity.

**Supported entity types:** ${getEntityTypeEnum().join(", ")}

Not implemented yet: every call, including \`dry_run\`, returns an error.`;

export const CreateEntityInputSchema = z
  .object({
    entityType: z.enum(getEntityTypeEnum()).describe("Type of entity to create"),
    accountId: z.string().min(1).describe("{{displayName}} account ID"),
    data: z.record(z.any()).describe("Entity fields as key-value pairs"),
    dry_run: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "When true, validates the proposed entity and returns a DryRunResult under `dryRun` without calling the {{displayName}} API."
      ),
  })
  .describe("Parameters for creating a {{displayName}} entity");

export const CreateEntityOutputSchema = z
  .object({
    entity: z.record(z.any()).describe("Created entity data (includes entity ID)"),
    entityType: z.string(),
    timestamp: z.string().datetime(),
    dryRun: DryRunResultSchema.optional().describe(
      "Present only when the request was made with `dry_run: true`. Nothing was created."
    ),
    after: NormalizedEntitySnapshotSchema.optional().describe(
      "Post-write canonical snapshot of the created entity."
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
  _context: RequestContext,
  sdkContext?: SdkContext
): Promise<CreateEntityOutput> {
  const { boundAccountId } = resolveSessionServices(sdkContext);
  assertAccountScope(input.accountId, boundAccountId, "accountId");
  return notImplemented(TOOL_NAME);
}

export function createEntityResponseFormatter(result: CreateEntityOutput): McpTextContent[] {
  return [
    {
      type: "text" as const,
      text: `${result.entityType} created\n\nTimestamp: ${result.timestamp}`,
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
      platform: "{{key}}",
      contractPlatformSlug: "{{key}}",
      contractToolSlug: "create_entity",
      operation: ["create"],
      entityKinds: ["campaign", "ad_group", "ad"],
      entityIdArgs: ["accountId"],
      readPartner: {
        toolName: "{{key}}_get_entity",
        argMap: { entityType: "entityType", accountId: "accountId" },
      },
      schemaVersion: 1,
      contractId: "{{key}}.create_entity.v1",
      supportsDryRun: true,
      supportsBeforeAfterSnapshot: true,
      requiresValidation: true,
      requiresSimulation: true,
    } satisfies CesteralWriteToolAnnotations,
  },
  inputExamples: [
    {
      label: "Create a campaign",
      input: { entityType: "campaign", accountId: "1234567890", data: { name: "Example" } },
    },
  ],
  logic: createEntityLogic,
  responseFormatter: createEntityResponseFormatter,
  // `entity` is the platform's object. Add `$.after` once the snapshot is built.
  untrustedContent: {
    structuredPaths: ["$.entity"],
    contentBlocks: [],
  },
};
