// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { createHash } from "node:crypto";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { spillJson, formatBoundedText, type SpillResult } from "@cesteral/shared";
import type { McpTextContent, RequestContext } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";

const TOOL_NAME = "ttd_graphql_query";
const TOOL_TITLE = "TTD GraphQL Query";
const TOOL_DESCRIPTION = `Execute a GraphQL query or mutation against The Trade Desk's GraphQL API.

This is a passthrough tool that accepts any valid TTD GraphQL query/mutation, enabling:
- **Deep nested queries** — fetch advertiser → campaigns → ad groups → audiences in one call
- **Rich entity model** — access fields not available in REST (audience uniques, decision scores, etc.)
- **Mutations** — create/update entities with the full TTD GraphQL schema

### Example Query
\`\`\`graphql
query Advertiser($id: ID!) {
  advertiser(id: $id) {
    name
    totalCampaignChannelCount
    vettingStatus
  }
}
\`\`\`

Refer to the TTD Partner Portal GraphQL documentation for the full schema.`;

export const GraphqlQueryInputSchema = z
  .object({
    query: z.string().min(1).describe("GraphQL query or mutation string"),
    variables: z.record(z.any()).optional().describe("GraphQL variables (key-value object)"),
    betaFeatures: z
      .string()
      .optional()
      .describe("Optional TTD-GQL-Beta header value to enable beta GraphQL features"),
  })
  .describe("Parameters for executing a TTD GraphQL query");

const SpillSchema = z
  .object({
    bucket: z.string(),
    objectName: z.string(),
    bytes: z.number(),
    signedUrl: z.string(),
    expiresAt: z.string(),
    mimeType: z.string(),
  })
  .partial()
  .extend({ error: z.string().optional() });

export const GraphqlQueryOutputSchema = z
  .object({
    data: z.any().describe("GraphQL response data"),
    errors: z.array(z.record(z.any())).optional().describe("GraphQL errors, if any"),
    spill: SpillSchema.optional().describe(
      "Spill metadata when the response was too large to inline. Set when REPORT_SPILL_BUCKET is configured and the body exceeds the byte threshold."
    ),
    timestamp: z.string().datetime(),
  })
  .describe("GraphQL query result");

type GraphqlInput = z.infer<typeof GraphqlQueryInputSchema>;
type GraphqlOutput = z.infer<typeof GraphqlQueryOutputSchema>;

function fingerprintQuery(input: GraphqlInput): string {
  const hash = createHash("sha256")
    .update(input.query)
    .update("\0")
    .update(JSON.stringify(input.variables ?? {}))
    .digest("hex")
    .slice(0, 12);
  return `gql-${hash}`;
}

export async function graphqlQueryLogic(
  input: GraphqlInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<GraphqlOutput & { _spillResult?: SpillResult; _fullText?: string }> {
  const { ttdService } = resolveSessionServices(sdkContext);

  const result = (await ttdService.graphqlQuery(input.query, input.variables, context, {
    betaFeatures: input.betaFeatures,
  })) as Record<string, unknown>;

  const data = result.data ?? result;
  const errors = result.errors as Record<string, any>[] | undefined;

  // Try spill if bucket is configured and body exceeds threshold.
  const spillResult = await spillJson({
    value: { data, errors },
    server: "ttd",
    objectId: fingerprintQuery(input),
    sessionId: sdkContext?.sessionId,
  });

  const out: GraphqlOutput & { _spillResult?: SpillResult; _fullText?: string } = {
    data,
    errors,
    timestamp: new Date().toISOString(),
  };
  if ("spilled" in spillResult && spillResult.spilled) {
    out.spill = {
      bucket: spillResult.bucket,
      objectName: spillResult.objectName,
      bytes: spillResult.bytes,
      signedUrl: spillResult.signedUrl,
      expiresAt: spillResult.expiresAt,
      mimeType: spillResult.mimeType,
    };
  } else if ("error" in spillResult) {
    out.spill = { error: spillResult.error };
  }

  // Stash the spill outcome on the result object so the formatter can use it
  // without re-running spillJson. These fields are stripped from the output
  // schema so they never reach the client; they're a logic→formatter channel.
  Object.defineProperty(out, "_spillResult", { value: spillResult, enumerable: false });
  return out;
}

export function graphqlQueryResponseFormatter(
  result: GraphqlOutput & { _spillResult?: SpillResult }
): McpTextContent[] {
  const errorInfo = result.errors?.length
    ? `\n\nGraphQL Errors:\n${JSON.stringify(result.errors, null, 2)}`
    : "";
  const fullText = `GraphQL response:\n${JSON.stringify(result.data, null, 2)}${errorInfo}`;

  const spill: SpillResult = result._spillResult ?? { disabled: true, reason: "bucket-not-set" };
  const text =
    formatBoundedText({
      fullText,
      spill,
      bodyLabel: "GraphQL response",
    }) + `\n\nTimestamp: ${result.timestamp}`;

  return [{ type: "text" as const, text }];
}

export const graphqlQueryTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: GraphqlQueryInputSchema,
  outputSchema: GraphqlQueryOutputSchema,
  annotations: {
    readOnlyHint: false,
    openWorldHint: true,
    destructiveHint: false,
    idempotentHint: false,
  },
  inputExamples: [
    {
      label: "Query advertiser details",
      input: {
        query: "query GetAdvertiser($id: ID!) { advertiser(id: $id) { id name status } }",
        variables: { id: "adv123abc" },
        betaFeatures: "my-beta-flag",
      },
    },
    {
      label: "List campaigns for an advertiser",
      input: {
        query:
          "query ListCampaigns($advertiserId: String!) { campaigns(advertiserId: $advertiserId) { edges { node { id name status budget { amount currencyCode } } } } }",
        variables: { advertiserId: "adv123abc" },
      },
    },
  ],
  logic: graphqlQueryLogic,
  responseFormatter: graphqlQueryResponseFormatter,
};
