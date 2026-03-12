import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "../../../types-global/mcp.js";

const TOOL_NAME = "amazon_dsp_get_targeting_options";
const TOOL_TITLE = "Get AmazonDsp Targeting Options";
const TOOL_DESCRIPTION = `Browse available AmazonDsp ad targeting options and categories.

Returns a structured list of targeting options available for a given objective type.
Use this to discover valid targeting values before creating or updating ad groups.

**Common objective types:** TRAFFIC, APP_INSTALLS, CONVERSIONS, AWARENESS, VIDEO_VIEWS`;

export const GetTargetingOptionsInputSchema = z
  .object({
    profileId: z
      .string()
      .min(1)
      .describe("AmazonDsp Advertiser ID"),
    targetingType: z
      .string()
      .optional()
      .describe("Optional objective type to filter targeting options (e.g., TRAFFIC, APP_INSTALLS)"),
  })
  .describe("Parameters for browsing AmazonDsp targeting options");

export const GetTargetingOptionsOutputSchema = z
  .object({
    options: z.record(z.any()).describe("Available targeting options"),
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
  const { amazonDspService } = resolveSessionServices(sdkContext);

  const options = (await amazonDspService.getTargetingOptions(
    input.targetingType,
    context
  )) as Record<string, unknown>;

  return {
    options,
    timestamp: new Date().toISOString(),
  };
}

export function getTargetingOptionsResponseFormatter(result: GetTargetingOptionsOutput): McpTextContent[] {
  return [
    {
      type: "text" as const,
      text: `AmazonDsp targeting options:\n${JSON.stringify(result.options, null, 2)}\n\nTimestamp: ${result.timestamp}`,
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
      label: "Get all targeting options",
      input: {
        profileId: "1234567890",
      },
    },
    {
      label: "Get targeting options for traffic objective",
      input: {
        profileId: "1234567890",
        targetingType: "TRAFFIC",
      },
    },
  ],
  logic: getTargetingOptionsLogic,
  responseFormatter: getTargetingOptionsResponseFormatter,
};
