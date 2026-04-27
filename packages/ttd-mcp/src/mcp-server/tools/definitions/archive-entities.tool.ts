// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getArchiveSupportedEntityTypes, type TtdEntityType } from "../utils/entity-mapping.js";
import type { McpTextContent, RequestContext } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";

const TOOL_NAME = "ttd_archive_entities";
const TOOL_TITLE = "Archive TTD Entities";
const ARCHIVE_TYPES = getArchiveSupportedEntityTypes();
const ARCHIVE_TYPE_ENUM = ARCHIVE_TYPES as [string, ...string[]];

const TOOL_DESCRIPTION = `Archive (soft-delete) multiple The Trade Desk entities by setting their Availability to "Archived".

**Supported entity types:** ${ARCHIVE_TYPES.join(", ")}

⚠️ **Warning:** Archiving is irreversible — archived entities cannot be un-archived. Use "Paused" status for temporary deactivation instead.`;

export const ArchiveEntitiesInputSchema = z
  .object({
    entityType: z
      .enum(ARCHIVE_TYPE_ENUM)
      .describe("Type of entities to archive (only campaign and adGroup support archiving)"),
    entityIds: z
      .array(z.string().min(1))
      .min(1)
      .max(100)
      .describe("Array of entity IDs to archive (max 100)"),
  })
  .describe("Parameters for archiving TTD entities");

export const ArchiveEntitiesOutputSchema = z
  .object({
    entityType: z.string(),
    totalRequested: z.number(),
    successCount: z.number(),
    failureCount: z.number(),
    results: z.array(
      z.object({
        entityId: z.string(),
        success: z.boolean(),
        error: z.string().optional(),
      })
    ),
    timestamp: z.string().datetime(),
  })
  .describe("Archive entities result");

type ArchiveInput = z.infer<typeof ArchiveEntitiesInputSchema>;
type ArchiveOutput = z.infer<typeof ArchiveEntitiesOutputSchema>;

export async function archiveEntitiesLogic(
  input: ArchiveInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<ArchiveOutput> {
  const { ttdService } = resolveSessionServices(sdkContext);

  const { results } = await ttdService.archiveEntities(
    input.entityType as TtdEntityType,
    input.entityIds,
    context
  );

  const succeeded = results.filter((r) => r.success).length;

  return {
    entityType: input.entityType,
    totalRequested: input.entityIds.length,
    successCount: succeeded,
    failureCount: input.entityIds.length - succeeded,
    results,
    timestamp: new Date().toISOString(),
  };
}

export function archiveEntitiesResponseFormatter(result: ArchiveOutput): McpTextContent[] {
  return [
    {
      type: "text" as const,
      text: `Archive ${result.entityType}: ${result.successCount}/${result.totalRequested} succeeded, ${result.failureCount} failed\n\n${JSON.stringify(result.results, null, 2)}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const archiveEntitiesTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: ArchiveEntitiesInputSchema,
  outputSchema: ArchiveEntitiesOutputSchema,
  annotations: {
    readOnlyHint: false,
    openWorldHint: false,
    destructiveHint: true,
    idempotentHint: true,
  },
  inputExamples: [
    {
      label: "Archive multiple ad groups",
      input: {
        entityType: "adGroup",
        entityIds: ["adg111aaa", "adg222bbb", "adg333ccc"],
      },
    },
    {
      label: "Archive a finished campaign",
      input: {
        entityType: "campaign",
        entityIds: ["camp456def"],
      },
    },
  ],
  logic: archiveEntitiesLogic,
  responseFormatter: archiveEntitiesResponseFormatter,
};
