import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getEntityTypeEnum, type LinkedInEntityType } from "../utils/entity-mapping.js";
import type { RequestContext } from "@cesteral/shared";
import type { SdkContext } from "../../../types-global/mcp.js";

const TOOL_NAME = "linkedin_duplicate_entity";
const TOOL_TITLE = "Duplicate LinkedIn Ads Entity";
const TOOL_DESCRIPTION = `Copy a LinkedIn Ads entity by reading it and creating a new entity with the same settings.

**Supported entity types:** ${getEntityTypeEnum().join(", ")}

LinkedIn does not have a native copy API endpoint, so this tool:
1. Reads the source entity
2. Strips read-only fields (id, changeAuditStamps, etc.)
3. Sets name to "Copy of {name}" (or custom name if provided)
4. Sets status to DRAFT
5. Creates the new entity

**Gotchas:**
- The new entity will be in DRAFT status regardless of source status.
- Some entity-specific fields may need manual adjustment after duplication.
- Campaign URNs in references (e.g., creative.campaign) are preserved from source.`;

export const DuplicateEntityInputSchema = z
  .object({
    entityType: z
      .enum(getEntityTypeEnum())
      .describe("Type of entity to duplicate"),
    entityUrn: z
      .string()
      .min(1)
      .describe("The source entity URN to copy"),
    newName: z
      .string()
      .optional()
      .describe("Name for the new entity (defaults to 'Copy of {original name}')"),
  })
  .describe("Parameters for duplicating a LinkedIn Ads entity");

export const DuplicateEntityOutputSchema = z
  .object({
    sourceUrn: z.string(),
    newEntity: z.record(z.any()).describe("The newly created entity"),
    entityType: z.string(),
    timestamp: z.string().datetime(),
  })
  .describe("Duplication result");

type DuplicateEntityInput = z.infer<typeof DuplicateEntityInputSchema>;
type DuplicateEntityOutput = z.infer<typeof DuplicateEntityOutputSchema>;

export async function duplicateEntityLogic(
  input: DuplicateEntityInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<DuplicateEntityOutput> {
  const { linkedInService } = resolveSessionServices(sdkContext);

  const newEntity = await linkedInService.duplicateEntity(
    input.entityType as LinkedInEntityType,
    input.entityUrn,
    { newName: input.newName },
    context
  );

  return {
    sourceUrn: input.entityUrn,
    newEntity: newEntity as Record<string, unknown>,
    entityType: input.entityType,
    timestamp: new Date().toISOString(),
  };
}

export function duplicateEntityResponseFormatter(result: DuplicateEntityOutput): unknown[] {
  return [
    {
      type: "text" as const,
      text: `${result.entityType} duplicated from ${result.sourceUrn}\n\nNew entity:\n${JSON.stringify(result.newEntity, null, 2)}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const duplicateEntityTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: DuplicateEntityInputSchema,
  outputSchema: DuplicateEntityOutputSchema,
  annotations: {
    readOnlyHint: false,
    openWorldHint: false,
    idempotentHint: false,
    destructiveHint: false,
  },
  inputExamples: [
    {
      label: "Duplicate a campaign with default name",
      input: {
        entityType: "campaign",
        entityUrn: "urn:li:sponsoredCampaign:123456789",
      },
    },
    {
      label: "Duplicate a campaign group with custom name",
      input: {
        entityType: "campaignGroup",
        entityUrn: "urn:li:sponsoredCampaignGroup:987654321",
        newName: "Q2 2026 Brand Awareness (Copy)",
      },
    },
  ],
  logic: duplicateEntityLogic,
  responseFormatter: duplicateEntityResponseFormatter,
};
