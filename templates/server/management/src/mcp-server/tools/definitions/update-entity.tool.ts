// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Governed stub. The schema and the cesteral annotation are the contract a
 * client and the governance layer see; the handler throws until the
 * {{displayName}} call is implemented.
 *
 * TODO(scaffold): implement the update call, a symbolic dry-run (see
 * pinterest-mcp's `runPinterestUpdateDryRun`), the `before`/`after` snapshots,
 * and a wire-request test that calls `updateEntityLogic` with only `fetch` stubbed.
 */

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getEntityTypeEnum } from "../utils/entity-mapping.js";
import { notImplemented } from "../utils/not-implemented.js";
import {
  DryRunResultSchema,
  NormalizedEntitySnapshotSchema,
  DispatchedCapabilitySchema,
  NO_UNTRUSTED_CONTENT,
  assertAccountScope,
} from "@cesteral/shared";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext, CesteralWriteToolAnnotations } from "@cesteral/shared";

const TOOL_NAME = "{{key}}_update_entity";
const TOOL_TITLE = "Update {{displayName}} Entity";
const TOOL_DESCRIPTION = `Update a {{displayName}} entity.

**Supported entity types:** ${getEntityTypeEnum().join(", ")}

Not implemented yet: every call, including \`dry_run\`, returns an error.`;

export const UpdateEntityInputSchema = z
  .object({
    entityType: z.enum(getEntityTypeEnum()).describe("Type of entity to update"),
    accountId: z.string().min(1).describe("{{displayName}} account ID"),
    entityId: z.string().min(1).describe("The entity ID to update"),
    data: z.record(z.any()).describe("Fields to update as key-value pairs"),
    dry_run: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "When true, validates the proposed change and returns a DryRunResult under `dryRun` without calling the {{displayName}} API."
      ),
  })
  .describe("Parameters for updating a {{displayName}} entity");

export const UpdateEntityOutputSchema = z
  .object({
    entityId: z.string(),
    entityType: z.string(),
    updated: z.boolean(),
    timestamp: z.string().datetime(),
    dryRun: DryRunResultSchema.optional().describe(
      "Present only when the request was made with `dry_run: true`. Nothing was changed."
    ),
    before: NormalizedEntitySnapshotSchema.optional().describe(
      "Pre-write canonical snapshot of the entity."
    ),
    after: NormalizedEntitySnapshotSchema.optional().describe(
      "Post-write canonical snapshot of the entity."
    ),
    dispatchedCapability: DispatchedCapabilitySchema.describe(
      "The concrete (operation, entityKind) this call resolved to. Present on every response."
    ),
  })
  .describe("Entity update result");

type UpdateEntityInput = z.infer<typeof UpdateEntityInputSchema>;
type UpdateEntityOutput = z.infer<typeof UpdateEntityOutputSchema>;

export async function updateEntityLogic(
  input: UpdateEntityInput,
  _context: RequestContext,
  sdkContext?: SdkContext
): Promise<UpdateEntityOutput> {
  const { boundAccountId } = resolveSessionServices(sdkContext);
  assertAccountScope(input.accountId, boundAccountId, "accountId");
  return notImplemented(TOOL_NAME);
}

export function updateEntityResponseFormatter(result: UpdateEntityOutput): McpTextContent[] {
  return [
    {
      type: "text" as const,
      text: `${result.entityType} ${result.entityId} updated\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const updateEntityTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: UpdateEntityInputSchema,
  outputSchema: UpdateEntityOutputSchema,
  annotations: {
    readOnlyHint: false,
    openWorldHint: false,
    idempotentHint: true,
    destructiveHint: false,
    cesteral: {
      kind: "write",
      writeClass: "entity",
      executableArgsExclude: ["dry_run"],
      platform: "{{key}}",
      contractPlatformSlug: "{{key}}",
      contractToolSlug: "update_entity",
      operation: ["update_budget", "pause", "resume", "update_status", "update"],
      entityKinds: ["campaign", "ad_group", "ad"],
      entityIdArgs: ["entityId"],
      readPartner: {
        toolName: "{{key}}_get_entity",
        argMap: { entityType: "entityType", accountId: "accountId", entityId: "entityId" },
      },
      schemaVersion: 1,
      contractId: "{{key}}.update_entity.v1",
      supportsDryRun: true,
      supportsBeforeAfterSnapshot: true,
      requiresValidation: true,
      requiresSimulation: true,
    } satisfies CesteralWriteToolAnnotations,
  },
  inputExamples: [
    {
      label: "Rename a campaign",
      input: {
        entityType: "campaign",
        accountId: "1234567890",
        entityId: "1800123456789",
        data: { name: "Renamed" },
      },
    },
  ],
  logic: updateEntityLogic,
  responseFormatter: updateEntityResponseFormatter,
  // Replace with the paths that carry platform text once the call is implemented.
  untrustedContent: NO_UNTRUSTED_CONTENT,
};
