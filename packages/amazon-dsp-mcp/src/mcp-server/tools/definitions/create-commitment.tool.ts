// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import type { RequestContext, McpTextContent, SdkContext } from "@cesteral/shared";
import { resolveSessionServices } from "../utils/resolve-session.js";
import {
  DSPCommitmentSchema,
  DSPCommitmentCreateSchema,
  type DSPCommitmentCreateT,
  type DSPCommitmentT,
} from "../../../services/amazon-dsp/v1-schemas.js";

const TOOL_NAME = "amazon_dsp_create_commitment";
const TOOL_TITLE = "Create an Amazon DSP commitment";
const TOOL_DESCRIPTION = `Create a new committed-spend agreement on the authenticated DSP account.

Single-commitment write. Internally wraps the input into a 1-element
\`commitments\` batch and unwraps \`success[0].commitment\` from Amazon's
multi-status response. Per-item rejections surface as
McpError(InvalidParams) with the original Amazon ErrorCode + fieldLocation.

This tool is intentionally NOT governed (no \`cesteral\` block) — the
existing repo precedent treats single creates as ungoverned, since the
"before" state for a fresh entity is null.`;

export const CreateCommitmentInputSchema = z
  .object({
    profileId: z.string().min(1).describe("Amazon DSP Profile ID"),
    data: DSPCommitmentCreateSchema.describe("Commitment definition (required fields per the DSP spec)"),
  })
  .describe("Parameters for creating an Amazon DSP commitment");

export const CreateCommitmentOutputSchema = z
  .object({
    commitment: DSPCommitmentSchema.describe("The created commitment as returned by Amazon"),
    timestamp: z.string().datetime(),
  })
  .describe("Create commitment result");

type CreateCommitmentInput = z.infer<typeof CreateCommitmentInputSchema>;
type CreateCommitmentOutput = z.infer<typeof CreateCommitmentOutputSchema>;

export async function createCommitmentLogic(
  input: CreateCommitmentInput,
  context: RequestContext,
  sdkContext?: SdkContext,
): Promise<CreateCommitmentOutput> {
  const { amazonDspV1Service } = resolveSessionServices(sdkContext);
  const commitment = (await amazonDspV1Service.createCommitment(
    input.data as DSPCommitmentCreateT,
    context,
  )) as DSPCommitmentT;
  return { commitment, timestamp: new Date().toISOString() };
}

export function createCommitmentResponseFormatter(
  result: CreateCommitmentOutput,
): McpTextContent[] {
  return [
    {
      type: "text" as const,
      text: `Commitment created\n${JSON.stringify(result.commitment, null, 2)}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const createCommitmentTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: CreateCommitmentInputSchema,
  outputSchema: CreateCommitmentOutputSchema,
  // No `cesteral` block: ungoverned write, matching create-entity.tool.ts.
  annotations: {
    readOnlyHint: false,
    openWorldHint: false,
    idempotentHint: false,
    destructiveHint: true,
  },
  inputExamples: [
    {
      label: "Create a Q3 upfront commitment",
      input: {
        profileId: "1234567890",
        data: {
          commitmentName: "Q3 Upfront 2026",
          committedSpend: 100000,
          currencyCode: "USD",
          startDateTime: "2026-07-01T00:00:00+00:00",
          endDateTime: "2026-09-30T23:59:59+00:00",
          fulfillmentLevel: "LEVEL_5",
          spendCalculationMode: "CAMPAIGN",
        },
      },
    },
  ],
  logic: createCommitmentLogic,
  responseFormatter: createCommitmentResponseFormatter,
};
