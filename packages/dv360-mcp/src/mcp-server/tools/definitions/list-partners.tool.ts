import { z } from "zod";
import type { RequestContext } from "../../../utils/internal/requestContext.js";

/**
 * Input schema for list_partners tool
 * Partners don't require any specific parameters for listing
 */
export const ListPartnersInputSchema = z.object({
  pageToken: z.string().optional().describe("Page token for pagination"),
  pageSize: z.number().min(1).max(100).optional().describe("Number of partners to return"),
});

/**
 * Output schema for list_partners tool
 */
export const ListPartnersOutputSchema = z.object({
  partners: z.array(
    z.object({
      name: z.string(),
      partnerId: z.string(),
      displayName: z.string(),
      entityStatus: z.string(),
    })
  ),
  nextPageToken: z.string().optional(),
});

type ListPartnersInput = z.infer<typeof ListPartnersInputSchema>;
type ListPartnersOutput = z.infer<typeof ListPartnersOutputSchema>;

/**
 * List partners tool logic
 * Currently returns mock data - will be connected to DV360Service in Phase 2
 */
export async function listPartnersLogic(
  _input: ListPartnersInput,
  _context: RequestContext
): Promise<ListPartnersOutput> {
  // TODO: Replace with actual DV360Service call
  // const dv360Service = container.resolve(DV360Service);
  // return await dv360Service.listEntities("partner", {}, input.pageToken, context);

  // Mock response for now
  return {
    partners: [
      {
        name: "partners/1234567",
        partnerId: "1234567",
        displayName: "Example Partner",
        entityStatus: "ENTITY_STATUS_ACTIVE",
      },
    ],
    nextPageToken: undefined,
  };
}

/**
 * Format response for MCP client
 */
export function listPartnersResponseFormatter(result: ListPartnersOutput): any {
  return [
    {
      type: "text" as const,
      text: `Found ${result.partners.length} partner(s):\n${JSON.stringify(result.partners, null, 2)}`,
    },
  ];
}

/**
 * List Partners Tool Definition
 */
export const listPartnersTool = {
  name: "dv360_list_partners",
  title: "List DV360 Partners",
  description: "List all partners accessible with current credentials",
  inputSchema: ListPartnersInputSchema,
  outputSchema: ListPartnersOutputSchema,
  annotations: {
    readOnlyHint: true,
    openWorldHint: false,
    idempotentHint: true,
  },
  logic: listPartnersLogic,
  responseFormatter: listPartnersResponseFormatter,
};
