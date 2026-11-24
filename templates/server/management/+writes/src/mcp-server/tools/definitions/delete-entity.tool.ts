// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Governed stub. The schema and the cesteral annotation are the contract a
 * client and the governance layer see; the handler throws until the
 * {{displayName}} call is implemented.
 *
 * TODO(scaffold): implement the delete call (with an elicitation confirmation,
 * as the fleet's other delete tools have), a symbolic dry-run, the
 * `before`/`after` snapshots, and a wire-request test that calls
 * `deleteEntityLogic` with only `fetch` stubbed. Check whether the platform can
 * restore a deleted entity, and update registry.json's terminalOperations note.
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

const TOOL_NAME = "{{key}}_delete_entity";
const TOOL_TITLE = "Delete {{displayName}} Entity";
const TOOL_DESCRIPTION = `Delete a {{displayName}} entity. Deletion is treated as irreversible.

**Supported entity types:** ${getEntityTypeEnum().join(", ")}

Not implemented yet: every call, including \`dry_run\`, returns an error.`;

export const DeleteEntityInputSchema = z
  .object({
    entityType: z.enum(getEntityTypeEnum()).describe("Type of entity to delete"),
    accountId: z.string().min(1).describe("{{displayName}} account ID"),
    entityId: z.string().min(1).describe("The entity ID to delete"),
    dry_run: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "When true, validates the proposed change and returns a DryRunResult under `dryRun` without calling the {{displayName}} API."
      ),
  })
  .describe("Parameters for deleting a {{displayName}} entity");

export const DeleteEntityOutputSchema = z
  .object({
    entityId: z.string(),
    entityType: z.string(),
    deleted: z.boolean(),
    timestamp: z.string().datetime(),
    dryRun: DryRunResultSchema.optional().describe(
      "Present only when the request was made with `dry_run: true`. Nothing was changed."
    ),
    before: NormalizedEntitySnapshotSchema.optional().describe(
      "Pre-delete canonical snapshot of the entity."
    ),
    after: NormalizedEntitySnapshotSchema.optional().describe(
      "Post-delete canonical snapshot of the entity."
    ),
    dispatchedCapability: DispatchedCapabilitySchema.describe(
      "The concrete (operation, entityKind) this call resolved to. Present on every response."
    ),
  })
  .describe("Entity deletion result");

type DeleteEntityInput = z.infer<typeof DeleteEntityInputSchema>;
type DeleteEntityOutput = z.infer<typeof DeleteEntityOutputSchema>;

export async function deleteEntityLogic(
  input: DeleteEntityInput,
  _context: RequestContext,
  sdkContext?: SdkContext
): Promise<DeleteEntityOutput> {
  const { boundAccountId } = resolveSessionServices(sdkContext);
  assertAccountScope(input.accountId, boundAccountId, "accountId");
  return notImplemented(TOOL_NAME);
}

export function deleteEntityResponseFormatter(result: DeleteEntityOutput): McpTextContent[] {
  return [
    {
      type: "text" as const,
      text: `${result.entityType} ${result.entityId} deleted\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const deleteEntityTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: DeleteEntityInputSchema,
  outputSchema: DeleteEntityOutputSchema,
  annotations: {
    readOnlyHint: false,
    openWorldHint: true,
    idempotentHint: true,
    destructiveHint: true,
    cesteral: {
      kind: "write",
      writeClass: "entity",
      executableArgsExclude: ["dry_run"],
      platform: "{{key}}",
      contractPlatformSlug: "{{key}}",
      contractToolSlug: "delete_entity",
      operation: ["delete"],
      entityKinds: ["campaign", "ad_group", "ad"],
      entityIdArgs: ["entityId"],
      readPartner: {
        toolName: "{{key}}_get_entity",
        argMap: { entityType: "entityType", accountId: "accountId", entityId: "entityId" },
      },
      schemaVersion: 1,
      contractId: "{{key}}.delete_entity.v1",
      supportsDryRun: true,
      supportsBeforeAfterSnapshot: true,
      requiresValidation: true,
      requiresSimulation: true,
    } satisfies CesteralWriteToolAnnotations,
  },
  inputExamples: [
    {
      label: "Delete an ad",
      input: { entityType: "ad", accountId: "1234567890", entityId: "1600123456789" },
    },
  ],
  logic: deleteEntityLogic,
  responseFormatter: deleteEntityResponseFormatter,
  // Replace with the paths that carry platform text once the call is implemented.
  untrustedContent: NO_UNTRUSTED_CONTENT,
};
