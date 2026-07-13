// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import type { RequestContext, McpTextContent, SdkContext } from "@cesteral/shared";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { assertAccountScope } from "@cesteral/shared";
import {
  DSPCommitmentSchema,
  type DSPCommitmentT,
} from "../../../services/amazon-dsp/v1-schemas.js";

const TOOL_NAME = "amazon_dsp_list_commitments";
const TOOL_TITLE = "List Amazon DSP commitments";
const TOOL_DESCRIPTION = `List committed-spend agreements (upfront / advance commitments) for the
authenticated DSP account. Token-cursor paginated via \`nextToken\`.

A commitment defines a guaranteed spend over a date range; line items
attached to the commitment draw down against it. See \`amazon_dsp_get_commitment\`
for the single-entity read used by governed updates.`;

export const ListCommitmentsInputSchema = z
  .object({
    profileId: z.string().min(1).describe("Amazon DSP Profile ID"),
    nextToken: z
      .string()
      .min(1)
      .optional()
      .describe("Cursor returned from a previous call; omit on the first page"),
    maxResults: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe("Page size, 1..50. Amazon's default is 25 if omitted."),
  })
  .describe("Parameters for listing Amazon DSP commitments");

export const ListCommitmentsOutputSchema = z
  .object({
    commitments: z.array(DSPCommitmentSchema).describe("Page of commitments"),
    nextToken: z.string().optional().describe("Cursor for the next page; absent on the last page"),
    timestamp: z.string().datetime(),
  })
  .describe("Commitment list result");

type ListCommitmentsInput = z.infer<typeof ListCommitmentsInputSchema>;
type ListCommitmentsOutput = z.infer<typeof ListCommitmentsOutputSchema>;

export async function listCommitmentsLogic(
  input: ListCommitmentsInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<ListCommitmentsOutput> {
  const { amazonDspV1Service, boundProfileId } = resolveSessionServices(sdkContext);
  assertAccountScope(input.profileId, boundProfileId, "profileId");
  const result = await amazonDspV1Service.listCommitments(
    { nextToken: input.nextToken, maxResults: input.maxResults },
    context
  );
  return {
    commitments: (result.commitments ?? []) as DSPCommitmentT[],
    ...(result.nextToken ? { nextToken: result.nextToken } : {}),
    timestamp: new Date().toISOString(),
  };
}

export function listCommitmentsResponseFormatter(result: ListCommitmentsOutput): McpTextContent[] {
  const count = result.commitments.length;
  const summary = `Found ${count} commitment${count === 1 ? "" : "s"}${
    result.nextToken ? ` (more available — pass nextToken to continue)` : ""
  }`;
  const body =
    count > 0
      ? `\n\nCommitments:\n${JSON.stringify(result.commitments, null, 2)}`
      : "\n\nNo commitments found";
  return [
    {
      type: "text" as const,
      text: `${summary}${body}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const listCommitmentsTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: ListCommitmentsInputSchema,
  outputSchema: ListCommitmentsOutputSchema,
  // No `cesteral` block: list endpoints are not attested in the governance
  // manifest. Repo precedent reserves cesteral.kind="read" for singular
  // read partners of governed writes (see get-entity.tool.ts → update_entity).
  annotations: {
    readOnlyHint: true,
    openWorldHint: false,
    idempotentHint: true,
    destructiveHint: false,
  },
  inputExamples: [
    {
      label: "First page, 25 results",
      input: { profileId: "1234567890", maxResults: 25 },
    },
    {
      label: "Continue from a prior page",
      input: { profileId: "1234567890", nextToken: "abc123" },
    },
  ],
  logic: listCommitmentsLogic,
  responseFormatter: listCommitmentsResponseFormatter,
};
