// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getEntityTypeEnum, type {{Pascal}}EntityType } from "../utils/entity-mapping.js";
import { assertAccountScope, buildPaginationOutput, PaginationOutputSchema } from "@cesteral/shared";
import type { RequestContext, McpTextContent, SdkContext } from "@cesteral/shared";

const TOOL_NAME = "{{key}}_list_entities";
const TOOL_TITLE = "List {{displayName}} Entities";
const TOOL_DESCRIPTION = `List {{displayName}} entities of one type in an account.

**Supported entity types:** ${getEntityTypeEnum().join(", ")}

Pass \`pagination.nextCursor\` from a response as \`pageToken\` to read the next page.`;

export const ListEntitiesInputSchema = z
  .object({
    entityType: z.enum(getEntityTypeEnum()).describe("Type of entities to list"),
    accountId: z.string().min(1).describe("{{displayName}} account ID"),
    pageToken: z
      .string()
      .optional()
      .describe("Cursor for the next page (pagination.nextCursor of the previous response)"),
  })
  .describe("Parameters for listing {{displayName}} entities");

export const ListEntitiesOutputSchema = z
  .object({
    entities: z.array(z.record(z.any())).describe("List of entities"),
    pagination: PaginationOutputSchema,
    timestamp: z.string().datetime(),
  })
  .describe("Entity list result");

type ListEntitiesInput = z.infer<typeof ListEntitiesInputSchema>;
type ListEntitiesOutput = z.infer<typeof ListEntitiesOutputSchema>;

export async function listEntitiesLogic(
  input: ListEntitiesInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<ListEntitiesOutput> {
  const { {{key}}Service, boundAccountId } = resolveSessionServices(sdkContext);
  assertAccountScope(input.accountId, boundAccountId, "accountId");

  const result = await {{key}}Service.listEntities(
    input.entityType as {{Pascal}}EntityType,
    input.accountId,
    input.pageToken,
    context
  );

  return {
    entities: result.entities,
    pagination: buildPaginationOutput({
      nextCursor: result.nextPageToken,
      pageSize: result.entities.length,
      nextPageInputKey: "pageToken",
    }),
    timestamp: new Date().toISOString(),
  };
}

export function listEntitiesResponseFormatter(result: ListEntitiesOutput): McpTextContent[] {
  const count = result.pagination.pageSize;
  const body =
    count > 0 ? `\n\nEntities:\n${JSON.stringify(result.entities, null, 2)}` : "\n\nNo entities found";
  return [
    {
      type: "text" as const,
      text: `Found ${count} entities${body}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const listEntitiesTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: ListEntitiesInputSchema,
  outputSchema: ListEntitiesOutputSchema,
  annotations: {
    readOnlyHint: true,
    openWorldHint: false,
    idempotentHint: true,
    destructiveHint: false,
  },
  inputExamples: [
    {
      label: "List campaigns",
      input: { entityType: "campaign", accountId: "1234567890" },
    },
  ],
  logic: listEntitiesLogic,
  responseFormatter: listEntitiesResponseFormatter,
  untrustedContent: {
    structuredPaths: ["$.entities"],
    contentBlocks: [0],
  },
};
