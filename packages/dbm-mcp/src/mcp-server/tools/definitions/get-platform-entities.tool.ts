import { z } from "zod";
import type { RequestContext } from "../../../utils/internal/request-context.js";
import type { SdkContext, ToolDefinition } from "../../../types-global/mcp.js";

const TOOL_NAME = "get_platform_entities";
const TOOL_TITLE = "Get Platform Entities";
const TOOL_DESCRIPTION =
  "Fetch campaign hierarchy (advertisers → campaigns → insertion orders → line items) for an advertiser";

/**
 * Input schema
 */
export const GetPlatformEntitiesInputSchema = z
  .object({
    advertiserId: z.string().min(1).describe("The advertiser ID to fetch entities for"),
    includeLineItems: z
      .boolean()
      .default(true)
      .describe("Whether to include line items in the response (default: true)"),
  })
  .describe("Parameters for fetching platform entities");

/**
 * Output schema
 */
export const GetPlatformEntitiesOutputSchema = z
  .object({
    advertiser: z.object({
      id: z.string(),
      name: z.string(),
      status: z.enum(["ACTIVE", "PAUSED", "DRAFT", "ARCHIVED"]),
    }),
    campaigns: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        status: z.enum(["ACTIVE", "PAUSED", "DRAFT", "ARCHIVED"]),
        insertionOrders: z.array(
          z.object({
            id: z.string(),
            name: z.string(),
            status: z.enum(["ACTIVE", "PAUSED", "DRAFT", "ARCHIVED"]),
            lineItems: z
              .array(
                z.object({
                  id: z.string(),
                  name: z.string(),
                  status: z.enum(["ACTIVE", "PAUSED", "DRAFT", "ARCHIVED"]),
                })
              )
              .optional(),
          })
        ),
      })
    ),
    summary: z.object({
      totalCampaigns: z.number(),
      totalInsertionOrders: z.number(),
      totalLineItems: z.number(),
      activeCampaigns: z.number(),
      activeLineItems: z.number(),
    }),
    timestamp: z.string().datetime(),
  })
  .describe("Platform entities hierarchy result");

export type GetPlatformEntitiesInput = z.infer<typeof GetPlatformEntitiesInputSchema>;
export type GetPlatformEntitiesOutput = z.infer<typeof GetPlatformEntitiesOutputSchema>;

/**
 * Tool logic
 */
export async function getPlatformEntitiesLogic(
  input: GetPlatformEntitiesInput,
  _context: RequestContext,
  _sdkContext?: SdkContext
): Promise<GetPlatformEntitiesOutput> {
  // TODO: Implement actual entity fetching via DV360 API
  // This is a stub that returns mock data
  const lineItems = input.includeLineItems
    ? [
        { id: "li-1", name: "Line Item 1 - Display", status: "ACTIVE" as const },
        { id: "li-2", name: "Line Item 2 - Video", status: "PAUSED" as const },
      ]
    : undefined;

  return {
    advertiser: {
      id: input.advertiserId,
      name: "Example Advertiser",
      status: "ACTIVE",
    },
    campaigns: [
      {
        id: "campaign-1",
        name: "Q1 Brand Campaign",
        status: "ACTIVE",
        insertionOrders: [
          {
            id: "io-1",
            name: "January IO",
            status: "ACTIVE",
            lineItems,
          },
          {
            id: "io-2",
            name: "February IO",
            status: "PAUSED",
            lineItems: input.includeLineItems
              ? [{ id: "li-3", name: "Line Item 3 - Audio", status: "PAUSED" as const }]
              : undefined,
          },
        ],
      },
      {
        id: "campaign-2",
        name: "Q1 Performance Campaign",
        status: "PAUSED",
        insertionOrders: [],
      },
    ],
    summary: {
      totalCampaigns: 2,
      totalInsertionOrders: 2,
      totalLineItems: input.includeLineItems ? 3 : 0,
      activeCampaigns: 1,
      activeLineItems: input.includeLineItems ? 1 : 0,
    },
    timestamp: new Date().toISOString(),
  };
}

/**
 * Response formatter
 */
export function getPlatformEntitiesResponseFormatter(
  result: GetPlatformEntitiesOutput,
  _input: GetPlatformEntitiesInput
): any[] {
  let hierarchyText = `Advertiser: ${result.advertiser.name} (${result.advertiser.status})\n`;

  for (const campaign of result.campaigns) {
    hierarchyText += `├── Campaign: ${campaign.name} (${campaign.status})\n`;
    for (const io of campaign.insertionOrders) {
      hierarchyText += `│   ├── IO: ${io.name} (${io.status})\n`;
      if (io.lineItems) {
        for (const li of io.lineItems) {
          hierarchyText += `│   │   └── LI: ${li.name} (${li.status})\n`;
        }
      }
    }
  }

  return [
    {
      type: "text" as const,
      text: `Platform Entities for Advertiser ${result.advertiser.id}:

📊 Summary:
• Campaigns: ${result.summary.totalCampaigns} (${result.summary.activeCampaigns} active)
• Insertion Orders: ${result.summary.totalInsertionOrders}
• Line Items: ${result.summary.totalLineItems} (${result.summary.activeLineItems} active)

🗂️ Hierarchy:
${hierarchyText}

Full Data:
${JSON.stringify(result, null, 2)}`,
    },
  ];
}

/**
 * Tool definition (rich pattern)
 */
export const getPlatformEntitiesTool: ToolDefinition<
  typeof GetPlatformEntitiesInputSchema,
  typeof GetPlatformEntitiesOutputSchema
> = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: GetPlatformEntitiesInputSchema,
  outputSchema: GetPlatformEntitiesOutputSchema,
  annotations: {
    readOnlyHint: true,
    openWorldHint: false,
    idempotentHint: true,
  },
  logic: getPlatformEntitiesLogic,
  responseFormatter: getPlatformEntitiesResponseFormatter,
};
