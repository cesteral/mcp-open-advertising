// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getEntityTypeEnum, type {{Pascal}}EntityType } from "../utils/entity-mapping.js";
import { assertAccountScope } from "@cesteral/shared";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";
// {{#entityWrites}}
import type { CesteralReadToolAnnotations } from "@cesteral/shared";
// {{/entityWrites}}

const TOOL_NAME = "{{key}}_get_entity";
const TOOL_TITLE = "Get {{displayName}} Entity";
const TOOL_DESCRIPTION = `Get a single {{displayName}} entity by ID.

**Supported entity types:** ${getEntityTypeEnum().join(", ")}`;

export const GetEntityInputSchema = z
  .object({
    entityType: z.enum(getEntityTypeEnum()).describe("Type of entity to retrieve"),
    accountId: z.string().min(1).describe("{{displayName}} account ID"),
    entityId: z.string().min(1).describe("The entity ID to retrieve"),
  })
  .describe("Parameters for getting a {{displayName}} entity");

export const GetEntityOutputSchema = z
  .object({
    entity: z.record(z.string(), z.any()).describe("Retrieved entity data"),
    timestamp: z.string().datetime(),
  })
  .describe("Entity retrieval result");

type GetEntityInput = z.infer<typeof GetEntityInputSchema>;
type GetEntityOutput = z.infer<typeof GetEntityOutputSchema>;

export async function getEntityLogic(
  input: GetEntityInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<GetEntityOutput> {
  const { {{key}}EntityService, boundAccountId } = resolveSessionServices(sdkContext);
  assertAccountScope(input.accountId, boundAccountId, "accountId");

  const entity = await {{key}}EntityService.getEntity(
    input.entityType as {{Pascal}}EntityType,
    input.accountId,
    input.entityId,
    context
  );
  return { entity, timestamp: new Date().toISOString() };
}

export function getEntityResponseFormatter(result: GetEntityOutput): McpTextContent[] {
  return [
    {
      type: "text" as const,
      text: `Entity retrieved\n${JSON.stringify(result.entity, null, 2)}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const getEntityTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: GetEntityInputSchema,
  outputSchema: GetEntityOutputSchema,
  annotations: {
    readOnlyHint: true,
    openWorldHint: true,
    idempotentHint: true,
    destructiveHint: false,
    // {{#entityWrites}}
    cesteral: {
      kind: "read",
      platform: "{{key}}",
      contractPlatformSlug: "{{key}}",
      contractToolSlug: "get_entity",
      // The read partner of the governed entity writes, so it covers the
      // same canonical kinds they do.
      entityKinds: ["campaign", "ad_group", "ad"],
      entityIdArgs: ["entityId"],
      schemaVersion: 1,
      contractId: "{{key}}.get_entity.v1",
    } satisfies CesteralReadToolAnnotations,
    // {{/entityWrites}}
  },
  inputExamples: [
    {
      label: "Get a campaign by ID",
      input: { entityType: "campaign", accountId: "1234567890", entityId: "1800123456789" },
    },
  ],
  logic: getEntityLogic,
  responseFormatter: getEntityResponseFormatter,
  untrustedContent: {
    structuredPaths: ["$.entity"],
    contentBlocks: [0],
  },
};
