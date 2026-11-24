// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Governed stub (effect class: an offline conversion upload has no canonical
 * entity snapshot). The handler throws until the call is implemented.
 *
 * TODO(scaffold): implement the upload, a symbolic effect dry-run checked by
 * `assertGovernedEffectDryRun` (see sa360-mcp's insert-conversions.tool.ts),
 * and a wire-request test that calls `insertConversionsLogic` with only
 * `fetch` stubbed.
 */

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { notImplemented } from "../utils/not-implemented.js";
import {
  EffectDryRunResultSchema,
  EffectResultSchema,
  DispatchedCapabilitySchema,
  NO_UNTRUSTED_CONTENT,
  assertAccountScope,
} from "@cesteral/shared";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext, CesteralWriteToolAnnotations } from "@cesteral/shared";

const TOOL_NAME = "{{key}}_insert_conversions";
const TOOL_TITLE = "Upload {{displayName}} Conversions";
const TOOL_DESCRIPTION = `Upload offline conversions to {{displayName}}.

Not implemented yet: every call, including \`dry_run\`, returns an error.`;

export const InsertConversionsInputSchema = z
  .object({
    accountId: z.string().min(1).describe("{{displayName}} account ID"),
    conversions: z
      .array(
        z.object({
          conversionAction: z.string().min(1).describe("Conversion action ID or name"),
          clickId: z.string().min(1).optional().describe("Click identifier, when the platform keys on one"),
          conversionTime: z.string().datetime().describe("When the conversion happened, ISO-8601"),
          value: z.number().nonnegative().optional().describe("Conversion value"),
          currencyCode: z.string().length(3).optional().describe("ISO 4217 currency of `value`"),
        })
      )
      .min(1)
      .max(200)
      .describe("Conversions to upload (max 200 per call)"),
    dry_run: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "When true, validates the batch and returns an EffectDryRunResult under `dryRun` without uploading it."
      ),
  })
  .describe("Parameters for an offline conversion upload");

export const InsertConversionsOutputSchema = z
  .object({
    uploaded: z.number().describe("Conversions the platform accepted"),
    failed: z.number().describe("Conversions the platform rejected"),
    timestamp: z.string().datetime(),
    dryRun: EffectDryRunResultSchema.optional().describe(
      "Present only when the request was made with `dry_run: true`. Nothing was uploaded."
    ),
    effect: EffectResultSchema.optional().describe("Effect-class result identity, on an upload."),
    dispatchedCapability: DispatchedCapabilitySchema.describe(
      "`upload_conversions` with `canonicalEntityKind: null` (effect class). Present on every response."
    ),
  })
  .describe("Conversion upload result");

type Input = z.infer<typeof InsertConversionsInputSchema>;
type Output = z.infer<typeof InsertConversionsOutputSchema>;

export async function insertConversionsLogic(
  input: Input,
  _context: RequestContext,
  sdkContext?: SdkContext
): Promise<Output> {
  const { boundAccountId } = resolveSessionServices(sdkContext);
  assertAccountScope(input.accountId, boundAccountId, "accountId");
  return notImplemented(TOOL_NAME);
}

export function insertConversionsResponseFormatter(result: Output): McpTextContent[] {
  return [
    {
      type: "text" as const,
      text: `Conversions: ${result.uploaded} uploaded, ${result.failed} failed\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const insertConversionsTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: InsertConversionsInputSchema,
  outputSchema: InsertConversionsOutputSchema,
  annotations: {
    readOnlyHint: false,
    openWorldHint: true,
    idempotentHint: false,
    destructiveHint: false,
    cesteral: {
      kind: "write",
      writeClass: "effect",
      executableArgsExclude: ["dry_run"],
      platform: "{{key}}",
      contractPlatformSlug: "{{key}}",
      contractToolSlug: "insert_conversions",
      operation: ["upload_conversions"],
      entityKinds: [],
      entityIdArgs: [],
      schemaVersion: 1,
      contractId: "{{key}}.insert_conversions.v1",
      supportsDryRun: true,
      supportsBeforeAfterSnapshot: false,
      requiresValidation: true,
      requiresSimulation: true,
    } satisfies CesteralWriteToolAnnotations,
  },
  inputExamples: [
    {
      label: "Upload one conversion",
      input: {
        accountId: "1234567890",
        conversions: [
          { conversionAction: "purchase", conversionTime: "2026-11-15T10:00:00Z", value: 25, currencyCode: "EUR" },
        ],
      },
    },
  ],
  logic: insertConversionsLogic,
  responseFormatter: insertConversionsResponseFormatter,
  untrustedContent: NO_UNTRUSTED_CONTENT,
};
