// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { RestRequestInputSchema } from "../utils/workflow-schemas.js";
import type { McpTextContent, RequestContext, SdkContext } from "@cesteral/shared";

const TOOL_NAME = "ttd_rest_request";
const TOOL_TITLE = "TTD REST Request";
const TOOL_DESCRIPTION = `Submit a valid REST request through The Trade Desk Workflows API.

This is a generic REST passthrough for valid TTD platform endpoints. Use it as an escape hatch
when a dedicated MCP tool does not yet exist.

Prefer first-class tools when available; use this for uncovered endpoints or rapid verification.`;

export const RestRequestToolInputSchema = RestRequestInputSchema.describe(
  "Parameters for executing a TTD Workflows REST passthrough request"
);

export const RestRequestToolOutputSchema = z.object({
  result: z.record(z.unknown()).describe("Raw JSON response from the TTD Workflows REST request"),
  timestamp: z.string().datetime(),
});

type RestRequestToolInput = z.infer<typeof RestRequestToolInputSchema>;
type RestRequestToolOutput = z.infer<typeof RestRequestToolOutputSchema>;

export async function restRequestLogic(
  input: RestRequestToolInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<RestRequestToolOutput> {
  const { ttdService } = resolveSessionServices(sdkContext);
  const result = (await ttdService.restRequest(input, context)) as Record<string, unknown>;
  return { result, timestamp: new Date().toISOString() };
}

export function restRequestResponseFormatter(result: RestRequestToolOutput): McpTextContent[] {
  return [
    {
      type: "text" as const,
      text: `REST request response:\n\n${JSON.stringify(result.result, null, 2)}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const restRequestTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: RestRequestToolInputSchema,
  outputSchema: RestRequestToolOutputSchema,
  annotations: {
    readOnlyHint: false,
    openWorldHint: true,
    destructiveHint: false,
    idempotentHint: false,
  },
  inputExamples: [
    {
      label: "Get a campaign directly",
      input: {
        methodType: "GET",
        endpoint: "campaign/<id>",
      },
    },
  ],
  logic: restRequestLogic,
  responseFormatter: restRequestResponseFormatter,
};
