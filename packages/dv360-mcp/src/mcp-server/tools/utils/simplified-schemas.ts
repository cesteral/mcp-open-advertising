// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { getSupportedEntityTypesDynamic } from "./entity-mapping-dynamic.js";

function getEntityTypeEnum(): [string, ...string[]] {
  const supportedTypes = getSupportedEntityTypesDynamic();
  if (supportedTypes.length === 0) {
    throw new Error("No supported DV360 entity types discovered for simplified schema generation");
  }
  return supportedTypes as [string, ...string[]];
}

export function createSimplifiedCreateEntityInputSchema(): z.ZodTypeAny {
  return z.object({
    entityType: z
      .enum(getEntityTypeEnum())
      .describe("Entity type. Fetch entity-schema://{entityType} for required fields."),
    partnerId: z.string().optional().describe("Partner ID (required for partner-scoped entities)"),
    advertiserId: z
      .string()
      .optional()
      .describe("Advertiser ID (required for advertiser-scoped entities)"),
    campaignId: z.string().optional().describe("Campaign ID (for campaign-scoped entities)"),
    insertionOrderId: z.string().optional().describe("Insertion Order ID (for IO-scoped entities)"),
    lineItemId: z.string().optional().describe("Line Item ID (for line item-scoped entities)"),
    data: z
      .record(z.any())
      .describe(
        "Entity payload. Use entity-schema://{entityType}, entity-fields://{entityType}, and entity-examples://{entityType} before calling."
      ),
  });
}

export function createSimplifiedUpdateEntityInputSchema(): z.ZodTypeAny {
  return z.object({
    entityType: z
      .enum(getEntityTypeEnum())
      .describe("Entity type. Fetch entity-fields://{entityType} for valid updateMask paths."),
    partnerId: z.string().optional().describe("Partner ID (if required)"),
    advertiserId: z.string().optional().describe("Advertiser ID (if required)"),
    campaignId: z.string().optional().describe("Campaign ID (if updating campaign)"),
    insertionOrderId: z.string().optional().describe("Insertion Order ID (if updating IO)"),
    lineItemId: z.string().optional().describe("Line Item ID (if updating line item)"),
    adGroupId: z.string().optional().describe("Ad Group ID (if updating ad group)"),
    adId: z.string().optional().describe("Ad ID (if updating ad)"),
    creativeId: z.string().optional().describe("Creative ID (if updating creative)"),
    data: z
      .record(z.any())
      .describe("Partial payload containing only fields to update."),
    updateMask: z
      .string()
      .describe("Comma-separated field paths to update (e.g. displayName,entityStatus)."),
    reason: z.string().optional().describe("Optional reason for audit trail"),
  });
}

export function estimateSchemaSize(schema: unknown): number {
  return JSON.stringify(schema).length;
}