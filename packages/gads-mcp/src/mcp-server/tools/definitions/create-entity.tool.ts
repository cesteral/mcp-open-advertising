import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getEntityTypeEnum, type GAdsEntityType } from "../utils/entity-mapping.js";
import { addParentValidationIssue } from "../utils/parent-id-validation.js";
import type { RequestContext } from "../../../utils/internal/request-context.js";
import type { SdkContext } from "../../../types-global/mcp.js";

const TOOL_NAME = "gads_create_entity";
const TOOL_TITLE = "Create Google Ads Entity";
const TOOL_DESCRIPTION = `Create a new Google Ads entity using the :mutate API.

**Supported entity types:** ${getEntityTypeEnum().join(", ")}

Provide entity data matching the Google Ads API v23 field format.
Refer to \`entity-schema://{entityType}\` resources for field reference.

**Important**: For campaigns, create a campaignBudget first and reference it via the \`campaignBudget\` field.`;

export const CreateEntityInputSchema = z
  .object({
    entityType: z
      .enum(getEntityTypeEnum())
      .describe("Type of entity to create"),
    customerId: z
      .string()
      .min(1)
      .describe("Google Ads customer ID (no dashes)"),
    data: z
      .record(z.any())
      .describe("Entity data to create (fields vary by entity type — see entity-schema resources)"),
  })
  .superRefine((input, ctx) => {
    addParentValidationIssue(
      ctx,
      input.entityType as GAdsEntityType,
      input as Record<string, unknown>
    );
  })
  .describe("Parameters for creating a Google Ads entity");

export const CreateEntityOutputSchema = z
  .object({
    mutateResult: z.record(z.any()).describe("Mutate operation result"),
    timestamp: z.string().datetime(),
  })
  .describe("Entity creation result");

type CreateEntityInput = z.infer<typeof CreateEntityInputSchema>;
type CreateEntityOutput = z.infer<typeof CreateEntityOutputSchema>;

export async function createEntityLogic(
  input: CreateEntityInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<CreateEntityOutput> {
  const { gadsService } = resolveSessionServices(sdkContext);

  const result = await gadsService.createEntity(
    input.entityType as GAdsEntityType,
    input.customerId,
    input.data,
    context
  );

  return {
    mutateResult: result as Record<string, any>,
    timestamp: new Date().toISOString(),
  };
}

export function createEntityResponseFormatter(result: CreateEntityOutput): any {
  return [
    {
      type: "text" as const,
      text: `Entity created successfully\n${JSON.stringify(result.mutateResult, null, 2)}\n\nTimestamp: ${result.timestamp}`,
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
  },
  inputExamples: [
    {
      label: "Create a campaign budget",
      input: {
        entityType: "campaignBudget",
        customerId: "1234567890",
        data: {
          name: "Q1 2025 Search Budget",
          amountMicros: "50000000000",
          deliveryMethod: "STANDARD",
        },
      },
    },
    {
      label: "Create a search campaign",
      input: {
        entityType: "campaign",
        customerId: "1234567890",
        data: {
          name: "Q1 2025 Brand Search",
          advertisingChannelType: "SEARCH",
          status: "PAUSED",
          campaignBudget: "customers/1234567890/campaignBudgets/9876543",
          startDate: "2025-01-15",
          endDate: "2025-03-31",
          networkSettings: {
            targetGoogleSearch: true,
            targetSearchNetwork: false,
            targetContentNetwork: false,
          },
        },
      },
    },
  ],
  logic: createEntityLogic,
  responseFormatter: createEntityResponseFormatter,
};
