// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";

const LooseObjectSchema = z.record(z.any());

export const WorkflowCallbackInputSchema = z.object({
  callbackUrl: z.string().url().describe("Callback URL that TTD should POST job results to"),
  callbackHeaders: z
    .record(z.string())
    .nullable()
    .optional()
    .describe("Optional callback headers to include with the webhook request"),
});

export const RestMethodTypeSchema = z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]);

export const RestRequestInputSchema = z.object({
  methodType: RestMethodTypeSchema.describe(
    "HTTP method to execute through the TTD Workflows REST passthrough"
  ),
  endpoint: z
    .string()
    .min(1)
    .nullable()
    .describe("TTD REST API endpoint path, e.g. campaign/<id> or adgroup"),
  dataBody: z
    .string()
    .nullable()
    .optional()
    .describe("Optional JSON string body to send with the request"),
});

export const FirstPartyDataJobInputSchema = z.object({
  advertiserId: z.string().min(1).describe("Advertiser ID to query for first-party data"),
  nameFilter: z
    .string()
    .nullable()
    .optional()
    .describe("Optional name filter applied to first-party data results"),
  queryShape: z
    .string()
    .nullable()
    .optional()
    .describe("Optional GraphQL-style query shape for the returned result fields"),
  callbackInput: WorkflowCallbackInputSchema.optional().describe(
    "Optional webhook callback for async completion"
  ),
});

export const ThirdPartyDataJobInputSchema = z.object({
  partnerId: z.string().min(1).describe("Partner ID to query for third-party data"),
  queryShape: z
    .string()
    .nullable()
    .optional()
    .describe("Optional GraphQL-style query shape for the returned result fields"),
  callbackInput: WorkflowCallbackInputSchema.optional().describe(
    "Optional webhook callback for async completion"
  ),
});

export const CampaignWorkflowPrimaryInputSchema = z
  .object({
    advertiserId: z.string().min(1).optional().describe("Advertiser ID for the campaign"),
    name: z.string().min(1).optional().describe("Campaign name"),
    seedId: z.string().nullable().optional().describe("Seed ID for the campaign"),
    startDateInUtc: z.string().optional().describe("Campaign start datetime in UTC"),
    endDateInUtc: z.string().nullable().optional().describe("Campaign end datetime in UTC"),
    primaryChannel: z.string().optional().describe("Primary TTD campaign channel enum value"),
    primaryGoal: LooseObjectSchema.optional().describe("Primary goal configuration"),
  })
  .passthrough();

export const CampaignCreateWorkflowInputSchema = z.object({
  primaryInput: CampaignWorkflowPrimaryInputSchema.describe("Primary campaign workflow fields"),
  advancedInput: LooseObjectSchema.optional().describe("Advanced campaign workflow settings"),
  adGroups: z
    .array(LooseObjectSchema)
    .nullable()
    .optional()
    .describe("Optional ad groups to create along with the campaign"),
  validateInputOnly: z
    .boolean()
    .nullable()
    .optional()
    .describe("When true, TTD validates the payload without persisting it"),
});

export const CampaignUpdateWorkflowInputSchema = z.object({
  id: z.string().min(1).nullable().describe("Campaign ID to update"),
  primaryInput: LooseObjectSchema.optional().describe("Primary campaign fields to update"),
  advancedInput: LooseObjectSchema.optional().describe("Advanced campaign fields to update"),
  validateInputOnly: z
    .boolean()
    .nullable()
    .optional()
    .describe("When true, TTD validates the payload without persisting it"),
});

export const AdGroupWorkflowPrimaryInputSchema = z
  .object({
    name: z.string().min(1).optional().describe("Ad group name"),
    isEnabled: z.boolean().optional().describe("Whether the ad group is enabled"),
    description: z.string().optional().describe("Ad group description"),
    campaignId: z.string().min(1).nullable().optional().describe("Campaign ID for the ad group"),
    channel: z.string().optional().describe("Ad group channel enum value"),
    marketType: z.string().optional().describe("Ad group market type enum value"),
    budget: LooseObjectSchema.optional().describe("Ad group budget settings"),
    audienceTargeting: LooseObjectSchema.optional().describe("Audience targeting settings"),
  })
  .passthrough();

export const AdGroupCreateWorkflowInputSchema = z.object({
  primaryInput: AdGroupWorkflowPrimaryInputSchema.describe("Primary ad group workflow fields"),
  campaignId: z.string().min(1).nullable().describe("Campaign ID for the ad group"),
  advancedInput: LooseObjectSchema.optional().describe("Advanced ad group workflow settings"),
  validateInputOnly: z
    .boolean()
    .nullable()
    .optional()
    .describe("When true, TTD validates the payload without persisting it"),
});

export const AdGroupUpdateWorkflowInputSchema = z.object({
  id: z.string().min(1).nullable().describe("Ad group ID to update"),
  primaryInput: LooseObjectSchema.optional().describe("Primary ad group fields to update"),
  advancedInput: LooseObjectSchema.optional().describe("Advanced ad group fields to update"),
  validateInputOnly: z
    .boolean()
    .nullable()
    .optional()
    .describe("When true, TTD validates the payload without persisting it"),
});

export const CampaignsJobInputSchema = z.object({
  input: z
    .array(CampaignCreateWorkflowInputSchema)
    .nullable()
    .describe("Campaign workflow items to create"),
  validateInputOnly: z
    .boolean()
    .nullable()
    .optional()
    .describe("When true, TTD validates the payload without persisting it"),
  callbackInput: WorkflowCallbackInputSchema.optional().describe(
    "Optional webhook callback for async completion"
  ),
});

export const CampaignsUpdateJobInputSchema = z.object({
  input: z
    .array(CampaignUpdateWorkflowInputSchema)
    .nullable()
    .describe("Campaign workflow items to update"),
  validateInputOnly: z
    .boolean()
    .nullable()
    .optional()
    .describe("When true, TTD validates the payload without persisting it"),
  callbackInput: WorkflowCallbackInputSchema.optional().describe(
    "Optional webhook callback for async completion"
  ),
});

export const AdGroupsJobInputSchema = z.object({
  input: z
    .array(AdGroupCreateWorkflowInputSchema)
    .nullable()
    .describe("Ad group workflow items to create"),
  validateInputOnly: z
    .boolean()
    .nullable()
    .optional()
    .describe("When true, TTD validates the payload without persisting it"),
  callbackInput: WorkflowCallbackInputSchema.optional().describe(
    "Optional webhook callback for async completion"
  ),
});

export const AdGroupsUpdateJobInputSchema = z.object({
  input: z
    .array(AdGroupUpdateWorkflowInputSchema)
    .nullable()
    .describe("Ad group workflow items to update"),
  validateInputOnly: z
    .boolean()
    .nullable()
    .optional()
    .describe("When true, TTD validates the payload without persisting it"),
  callbackInput: WorkflowCallbackInputSchema.optional().describe(
    "Optional webhook callback for async completion"
  ),
});

export function toWorkflowCallbackInput(
  callbackInput?: z.infer<typeof WorkflowCallbackInputSchema>
): { callbackUrl: string; callbackHeaders?: Record<string, string> | null } | undefined {
  if (!callbackInput) return undefined;
  return {
    callbackUrl: callbackInput.callbackUrl,
    ...(callbackInput.callbackHeaders !== undefined
      ? { callbackHeaders: callbackInput.callbackHeaders }
      : {}),
  };
}
