import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { RequestContext } from "@cesteral/shared";
import type { SdkContext } from "../../../types-global/mcp.js";

const TOOL_NAME = "meta_get_targeting_options";
const TOOL_TITLE = "Browse Meta Targeting Options";
const TOOL_DESCRIPTION = `Browse available targeting categories for an ad account.

Returns targeting options organized by category (interests, behaviors, demographics, etc.).
Use this to discover available targeting dimensions before building a targeting spec.`;

export const GetTargetingOptionsInputSchema = z
  .object({
    adAccountId: z
      .string()
      .describe("Ad Account ID (with or without act_ prefix)"),
    type: z
      .string()
      .optional()
      .describe("Filter by targeting type (e.g., 'interests', 'behaviors')"),
  })
  .describe("Parameters for browsing targeting options");

export const GetTargetingOptionsOutputSchema = z
  .object({
    options: z.array(z.record(z.any())).describe("Available targeting options"),
    totalCount: z.number(),
    timestamp: z.string().datetime(),
  })
  .describe("Targeting options result");

type GetTargetingOptionsInput = z.infer<typeof GetTargetingOptionsInputSchema>;
type GetTargetingOptionsOutput = z.infer<typeof GetTargetingOptionsOutputSchema>;

export async function getTargetingOptionsLogic(
  input: GetTargetingOptionsInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<GetTargetingOptionsOutput> {
  const { metaTargetingService } = resolveSessionServices(sdkContext);

  const result = await metaTargetingService.getTargetingOptions(
    input.adAccountId,
    input.type,
    context
  );

  const data = (result as Record<string, unknown>)?.data as unknown[] || [];

  return {
    options: data as Record<string, unknown>[],
    totalCount: data.length,
    timestamp: new Date().toISOString(),
  };
}

export function getTargetingOptionsResponseFormatter(result: GetTargetingOptionsOutput): unknown[] {
  return [
    {
      type: "text" as const,
      text: `Found ${result.totalCount} targeting option(s)\n\n${JSON.stringify(result.options, null, 2)}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const getTargetingOptionsTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: GetTargetingOptionsInputSchema,
  outputSchema: GetTargetingOptionsOutputSchema,
  annotations: {
    readOnlyHint: true,
    openWorldHint: false,
    idempotentHint: true,
    destructiveHint: false,
  },
  inputExamples: [
    {
      label: "Browse all targeting categories",
      input: {
        adAccountId: "act_123456789",
      },
    },
    {
      label: "Browse interest targeting options",
      input: {
        adAccountId: "act_123456789",
        type: "interests",
      },
    },
  ],
  logic: getTargetingOptionsLogic,
  responseFormatter: getTargetingOptionsResponseFormatter,
};
