import { z } from "zod";
import { platformSchema } from "./delivery.js";

/**
 * Entity status enum
 */
export const entityStatusSchema = z.enum([
  "active",
  "paused",
  "draft",
  "archived",
  "pending_review",
]);

export type EntityStatus = z.infer<typeof entityStatusSchema>;

/**
 * Revenue type enum
 */
export const revenueTypeSchema = z.enum(["cost_plus", "margin", "fixed_cpm"]);

export type RevenueType = z.infer<typeof revenueTypeSchema>;

/**
 * Bid strategy enum
 */
export const bidStrategySchema = z.enum([
  "fixed_cpm",
  "fixed_cpc",
  "maximize_conversions",
  "target_cpa",
  "target_roas",
]);

export type BidStrategy = z.infer<typeof bidStrategySchema>;

/**
 * Advertiser schema
 */
export const advertiserSchema = z.object({
  advertiserId: z.string(),
  advertiserName: z.string(),
  platform: platformSchema,
});

export type Advertiser = z.infer<typeof advertiserSchema>;

/**
 * Campaign schema
 */
export const campaignSchema = z.object({
  campaignId: z.string(),
  campaignName: z.string(),
  advertiserId: z.string(),
  advertiserName: z.string(),
  platform: platformSchema,
  status: entityStatusSchema,
  budget: z.number().nonnegative(),
  flightStartDate: z.string(),
  flightEndDate: z.string(),
});

export type Campaign = z.infer<typeof campaignSchema>;

/**
 * Line item schema
 */
export const lineItemSchema = z.object({
  lineItemId: z.string(),
  lineItemName: z.string(),
  campaignId: z.string(),
  campaignName: z.string(),
  status: entityStatusSchema,
  budget: z.number().nonnegative(),
  flightStartDate: z.string(),
  flightEndDate: z.string(),
  revenueType: revenueTypeSchema,
  bidStrategy: bidStrategySchema,
  bidAmountMicros: z.number().int().nonnegative(),
  revenueMarginPercent: z.number().nonnegative().optional(),
});

export type LineItem = z.infer<typeof lineItemSchema>;

/**
 * Campaign hierarchy schema (advertiser → campaigns → line items)
 */
export const campaignHierarchySchema = z.object({
  advertiser: advertiserSchema,
  campaigns: z.array(
    campaignSchema.extend({
      lineItems: z.array(lineItemSchema),
    })
  ),
});

export type CampaignHierarchy = z.infer<typeof campaignHierarchySchema>;
