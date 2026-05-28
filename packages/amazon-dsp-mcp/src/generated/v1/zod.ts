import { z } from "zod";

export const DSPCurrencyCode: z.ZodTypeAny = z.enum([
  "AED",
  "ARS",
  "AUD",
  "BGN",
  "BHD",
  "BOB",
  "BRL",
  "CAD",
  "CHF",
  "CLP",
  "CNY",
  "COP",
  "CRC",
  "CZK",
  "DKK",
  "DOP",
  "DZD",
  "EUR",
  "GBP",
  "GTQ",
  "HKD",
  "HNL",
  "HRK",
  "HUF",
  "IDR",
  "ILS",
  "INR",
  "JMD",
  "JPY",
  "KRW",
  "KWD",
  "MAD",
  "MXN",
  "MYR",
  "NOK",
  "NZD",
  "PAB",
  "PEN",
  "PHP",
  "PKR",
  "PYG",
  "QAR",
  "RON",
  "RSD",
  "RUB",
  "SAR",
  "SEK",
  "SGD",
  "THB",
  "TND",
  "TRY",
  "TWD",
  "UAH",
  "USD",
  "UYU",
  "VND",
]);
export const DSPFulfillmentLevel: z.ZodTypeAny = z.enum(["LEVEL_0", "LEVEL_5"]);
export const DSPSpendCalculationMode: z.ZodTypeAny = z.enum([
  "ADVERTISER_ACCOUNT",
  "CAMPAIGN",
  "MANAGER_ACCOUNT",
]);
export const DSPCommitment: z.ZodTypeAny = z
  .object({
    advertiserIds: z.array(z.string()).max(1000).optional(),
    campaignIds: z.array(z.string()).max(1000).optional(),
    commitmentId: z.string(),
    commitmentName: z.string(),
    committedSpend: z.number(),
    currencyCode: DSPCurrencyCode,
    dealIds: z.array(z.string()).max(1000).optional(),
    endDateTime: z.string().datetime({ offset: true }),
    fulfillmentLevel: DSPFulfillmentLevel,
    spendCalculationMode: DSPSpendCalculationMode,
    startDateTime: z.string().datetime({ offset: true }),
  })
  .passthrough();
export const DSPCommitmentSuccessResponse: z.ZodTypeAny = z
  .object({ commitments: z.array(DSPCommitment).max(1000), nextToken: z.string() })
  .partial()
  .passthrough();
export const ErrorCode: z.ZodTypeAny = z.enum([
  "ACTION_NOT_SUPPORTED",
  "ACTIVE_RESOURCE_LIMIT_EXCEEDED",
  "ARCHIVED_PARENT_CANNOT_CREATE",
  "ARCHIVED_PARENT_CANNOT_EDIT",
  "ARCHIVED_RESOURCE_CANNOT_EDIT",
  "ASSET_NOT_READY",
  "AUTOCREATED_ENTITY_CANNOT_EDIT",
  "BAD_REQUEST",
  "CONFLICT",
  "CONTENT_TOO_LARGE",
  "DATE_CANNOT_BE_IN_PAST",
  "DATE_CANNOT_BE_NULL",
  "DATE_TOO_SOON",
  "DUPLICATE_FIELD_VALUE_FOUND",
  "DUPLICATE_RESOURCE_ID_FOUND",
  "DURATION_TOO_SHORT",
  "FEATURE_DISCONTINUED",
  "FEATURE_NOT_AVAILABLE",
  "FIELD_SIZE_IS_ABOVE_MAXIMUM_LIMIT",
  "FIELD_SIZE_IS_BELOW_MINIMUM_LIMIT",
  "FIELD_SIZE_IS_OUT_OF_RANGE",
  "FIELD_VALUE_CANNOT_EDIT",
  "FIELD_VALUE_CONTAINS_BLOCKLISTED_WORDS",
  "FIELD_VALUE_CONTAINS_INVALID_CHARACTERS",
  "FIELD_VALUE_IS_ABOVE_MAXIMUM_LIMIT",
  "FIELD_VALUE_IS_BELOW_MINIMUM_LIMIT",
  "FIELD_VALUE_IS_EMPTY",
  "FIELD_VALUE_IS_INVALID",
  "FIELD_VALUE_IS_NULL",
  "FIELD_VALUE_IS_OUT_OF_RANGE",
  "FIELD_VALUE_MISMATCH",
  "FIELD_VALUE_MUST_BE_EMPTY_OR_NULL",
  "FIELD_VALUE_NOT_FOUND",
  "FIELD_VALUE_NOT_UNIQUE",
  "FORBIDDEN",
  "GLOBAL_ATTRIBUTE_UPDATE_RESTRICTED_PORTFOLIO",
  "GLOBAL_ATTRIBUTE_UPDATE_RESTRICTED_STATE",
  "GLOBAL_CAMPAIGN_SINGLE_ADGROUP_LIMIT",
  "INTERNAL_ERROR",
  "NOT_FOUND",
  "PAYMENT_ISSUE",
  "PRODUCT_INELIGIBLE",
  "RESOURCE_DOES_NOT_BELONG_TO_PARENT",
  "RESOURCE_ID_NOT_FOUND",
  "RESOURCE_IS_EMPTY",
  "RESOURCE_IS_IN_TERMINAL_STATE",
  "RESOURCE_IS_NULL",
  "TOO_MANY_REQUESTS",
  "TOTAL_RESOURCE_LIMIT_EXCEEDED",
  "UNAUTHORIZED",
  "UNSUPPORTED_MARKETPLACE",
]);
export const BadRequestResponseContent: z.ZodTypeAny = z
  .object({ code: ErrorCode, message: z.string() })
  .passthrough();
export const UnauthorizedResponseContent: z.ZodTypeAny = z
  .object({ code: ErrorCode, message: z.string() })
  .passthrough();
export const ForbiddenResponseContent: z.ZodTypeAny = z
  .object({ code: ErrorCode, message: z.string() })
  .passthrough();
export const NotFoundResponseContent: z.ZodTypeAny = z
  .object({ code: ErrorCode, message: z.string() })
  .passthrough();
export const ContentTooLargeResponseContent: z.ZodTypeAny = z
  .object({ code: ErrorCode, message: z.string() })
  .passthrough();
export const TooManyRequestsResponseContent: z.ZodTypeAny = z
  .object({ code: ErrorCode, message: z.string() })
  .passthrough();
export const InternalServerErrorResponseContent: z.ZodTypeAny = z
  .object({ code: z.string(), message: z.string() })
  .passthrough();
export const BadGatewayResponseContent: z.ZodTypeAny = z
  .object({ code: z.string(), message: z.string() })
  .passthrough();
export const ServiceUnavailableErrorResponseContent: z.ZodTypeAny = z
  .object({ code: z.string(), message: z.string() })
  .passthrough();
export const GatewayTimeoutResponseContent: z.ZodTypeAny = z
  .object({ code: z.string(), message: z.string() })
  .passthrough();
export const DSPCommitmentCreate: z.ZodTypeAny = z
  .object({
    advertiserIds: z.array(z.string()).max(1000).optional(),
    campaignIds: z.array(z.string()).max(1000).optional(),
    commitmentName: z.string(),
    committedSpend: z.number(),
    currencyCode: DSPCurrencyCode,
    dealIds: z.array(z.string()).max(1000).optional(),
    endDateTime: z.string().datetime({ offset: true }),
    fulfillmentLevel: DSPFulfillmentLevel,
    spendCalculationMode: DSPSpendCalculationMode,
    startDateTime: z.string().datetime({ offset: true }),
  })
  .passthrough();
export const DSPCreateCommitmentRequest: z.ZodTypeAny = z
  .object({ commitments: z.array(DSPCommitmentCreate).min(1).max(1000) })
  .partial()
  .passthrough();
export const Error: z.ZodTypeAny = z
  .object({ code: ErrorCode, fieldLocation: z.string().optional(), message: z.string() })
  .passthrough();
export const ErrorsIndex: z.ZodTypeAny = z
  .object({ errors: z.array(Error).min(1).max(20), index: z.number().int().gte(0).lte(0) })
  .passthrough();
export const DSPCommitmentMultiStatusSuccess: z.ZodTypeAny = z
  .object({ commitment: DSPCommitment, index: z.number().int().gte(0).lte(999) })
  .passthrough();
export const DSPCommitmentMultiStatusResponse: z.ZodTypeAny = z
  .object({
    error: z.array(ErrorsIndex).max(1000),
    success: z.array(DSPCommitmentMultiStatusSuccess).max(1000),
  })
  .partial()
  .passthrough();
export const DSPSelectedForecastMetric: z.ZodTypeAny = z.enum([
  "AIMP",
  "AREA",
  "CAS",
  "CPA",
  "CPC",
  "CPM",
  "DC",
  "EIMP",
  "EREA",
  "IREA",
  "ROAS",
  "TAS",
]);
export const DSPForecastMetricsDescription: z.ZodTypeAny = z
  .object({
    allMetrics: z.boolean(),
    selectedMetrics: z.array(DSPSelectedForecastMetric).max(20).optional(),
  })
  .passthrough();
export const DSPEnabledFeaturesInCampaignForecast: z.ZodTypeAny = z
  .object({
    campaignSettingsCache: z.boolean(),
    curve: z.boolean(),
    insights: z.boolean(),
    metrics: DSPForecastMetricsDescription,
    replanning: z.boolean(),
  })
  .partial()
  .passthrough();
export const DSPAdProduct: z.ZodTypeAny = z.literal("AMAZON_DSP");
export const DSPAdGroupBid: z.ZodTypeAny = z
  .object({
    baseBid: z.number().optional(),
    currencyCode: DSPCurrencyCode,
    maxAverageBid: z.number().optional(),
  })
  .passthrough();
export const DSPBudgetType: z.ZodTypeAny = z.literal("MONETARY");
export const DSPMonetaryBudget: z.ZodTypeAny = z
  .object({ currencyCode: DSPCurrencyCode, value: z.number() })
  .passthrough();
export const DSPMonetaryBudgetValue: z.ZodTypeAny = z
  .object({ monetaryBudget: DSPMonetaryBudget })
  .partial()
  .passthrough();
export const DSPBudgetValue: z.ZodTypeAny = z
  .object({ monetaryBudgetValue: DSPMonetaryBudgetValue })
  .passthrough();
export const DSPRecurrence: z.ZodTypeAny = z.enum(["DAILY", "LIFETIME", "MONTHLY"]);
export const DSPBudget: z.ZodTypeAny = z
  .object({
    budgetType: DSPBudgetType,
    budgetValue: DSPBudgetValue,
    recurrenceTimePeriod: DSPRecurrence,
  })
  .passthrough();
export const DSPCreativeRotationType: z.ZodTypeAny = z.enum(["RANDOM", "WEIGHTED"]);
export const DSPFeeType: z.ZodTypeAny = z.enum([
  "AMAZON_AUDIENCE",
  "AMAZON_DSP",
  "MANAGED_SERVICE_FEE",
  "OMNICHANNEL_METRICS",
  "THIRD_PARTY_APPLIED",
  "THIRD_PARTY_AUDIENCE",
  "THIRD_PARTY_TARGETING",
]);
export const DSPFeeValueType: z.ZodTypeAny = z.enum([
  "FIXED_CPM",
  "PERCENTAGE_OF_BUDGET",
  "PERCENTAGE_OF_SUPPLY_COST",
]);
export const DSPFeesThirdPartyProvider: z.ZodTypeAny = z.enum([
  "COM_SCORE",
  "CPM_1",
  "CPM_2",
  "CPM_3",
  "DOUBLE_CLICK_CAMPAIGN_MANAGER",
  "DOUBLE_VERIFY",
  "INTEGRAL_AD_SCIENCE",
]);
export const DSPFee: z.ZodTypeAny = z
  .object({
    addToBudgetSpentAmount: z.boolean().optional(),
    currencyCode: DSPCurrencyCode,
    feeType: DSPFeeType,
    feeValue: z.number(),
    feeValueType: DSPFeeValueType,
    thirdPartyProvider: DSPFeesThirdPartyProvider.optional(),
  })
  .passthrough();
export const DSPFrequencyTargetingSetting: z.ZodTypeAny = z.enum(["HOUSEHOLD", "USER"]);
export const DSPTimeUnit: z.ZodTypeAny = z.enum(["DAYS", "HOURS", "MINUTES"]);
export const DSPFrequency: z.ZodTypeAny = z
  .object({
    eventMaxCount: z.number().int().gte(1).lte(99000),
    frequencyTargetingSetting: DSPFrequencyTargetingSetting,
    timeCount: z.number().int().gte(1).lte(60).optional(),
    timeUnit: DSPTimeUnit.optional(),
  })
  .passthrough();
export const DSPInventoryType: z.ZodTypeAny = z.enum([
  "AAP_MOBILE_APP",
  "AMAZON_MOBILE_DISPLAY",
  "AUDIO",
  "AUDIO_AMAZON_DEAL",
  "DISPLAY",
  "LIVE_EVENTS",
  "ONLINE_VIDEO",
  "PODCAST",
  "STANDARD_DISPLAY",
  "STREAMING_TV",
  "STREAMING_TV_AMAZON_DEAL",
  "VIDEO",
]);
export const DSPMarketplaceAdGroupConfigurations: z.ZodTypeAny = z
  .object({})
  .partial()
  .passthrough();
export const DSPMarketplaceScope: z.ZodTypeAny = z.literal("SINGLE_MARKETPLACE");
export const DSPMarketplace: z.ZodTypeAny = z.enum([
  "AE",
  "AU",
  "BR",
  "CA",
  "DE",
  "ES",
  "FR",
  "GB",
  "IN",
  "IT",
  "JP",
  "MX",
  "NL",
  "SA",
  "SE",
  "TR",
  "US",
]);
export const DSPBidStrategy: z.ZodTypeAny = z.enum([
  "PRIORITIZE_KPI_TARGET",
  "SPEND_BUDGET_IN_FULL",
  "USE_CAMPAIGN_STRATEGY",
]);
export const DSPBudgetAllocation: z.ZodTypeAny = z.enum(["AUTO", "MANUAL"]);
export const DSPAdGroupBudgetSettings: z.ZodTypeAny = z
  .object({ budgetAllocation: DSPBudgetAllocation, dailyMinSpendValue: z.number() })
  .partial()
  .passthrough();
export const DSPOptimization: z.ZodTypeAny = z
  .object({ bidStrategy: DSPBidStrategy, budgetSettings: DSPAdGroupBudgetSettings })
  .partial()
  .passthrough();
export const DSPDeliveryProfile: z.ZodTypeAny = z.enum(["ASAP", "EVEN", "PACE_AHEAD"]);
export const DSPPacing: z.ZodTypeAny = z
  .object({ deliveryProfile: DSPDeliveryProfile })
  .partial()
  .passthrough();
export const DSPState: z.ZodTypeAny = z.enum(["ARCHIVED", "ENABLED", "PAUSED"]);
export const DSPDeliveryReason: z.ZodTypeAny = z.enum([
  "AD_CREATIVES_NOT_RUNNING",
  "AD_GROUPS_NOT_RUNNING",
  "AD_GROUP_ARCHIVED",
  "AD_GROUP_ENDED",
  "AD_GROUP_INELIGIBLE_GOAL_KPI",
  "AD_GROUP_MISSING_CONVERSION_TRACKING_SELECTIONS",
  "AD_GROUP_PAUSED",
  "AD_GROUP_PENDING_START_DATE",
  "AD_GROUP_POLICING_SUSPENDED",
  "AD_GROUP_TOO_FEW_CONVERSION_TRACKING_SELECTIONS",
  "AD_GROUP_TOO_MANY_CONVERSION_TRACKING_SELECTIONS",
  "AD_NOT_APPROVED_FOR_ALL_AD_GROUPS",
  "AD_NOT_ASSOCIATED_WITH_AD_GROUP",
  "AD_POLICING_PENDING_REVIEW",
  "AD_POLICING_SUSPENDED",
  "CAMPAIGN_ARCHIVED",
  "CAMPAIGN_END_DATE_REACHED",
  "CAMPAIGN_PAUSED",
  "CAMPAIGN_PENDING_START_DATE",
  "CAMPAIGN_POLICING_SUSPENDED",
  "OTHER",
]);
export const DSPDeliveryStatus: z.ZodTypeAny = z.enum([
  "DELIVERING",
  "LIMITED",
  "NOT_DELIVERING",
  "UNAVAILABLE",
]);
export const DSPStatus: z.ZodTypeAny = z
  .object({
    deliveryReasons: z.array(DSPDeliveryReason).max(50).optional(),
    deliveryStatus: DSPDeliveryStatus,
  })
  .passthrough();
export const DSPTag: z.ZodTypeAny = z.object({ key: z.string(), value: z.string() }).passthrough();
export const DSPViewabilityTier: z.ZodTypeAny = z.enum([
  "ALL_TIERS",
  "GREATER_THAN_40_PERCENT",
  "GREATER_THAN_50_PERCENT",
  "GREATER_THAN_60_PERCENT",
  "GREATER_THAN_70_PERCENT",
  "LESS_THAN_40_PERCENT",
]);
export const DSPAmazonViewability: z.ZodTypeAny = z
  .object({ includeUnmeasurableImpressions: z.boolean(), viewabilityTier: DSPViewabilityTier })
  .passthrough();
export const DSPAutomatedTargetingTactic: z.ZodTypeAny = z.enum([
  "AWARENESS",
  "CUSTOMER_ACQUISITION",
  "MAXIMIZE_PERFORMANCE",
  "PROSPECTING",
  "REMARKETING",
  "RETENTION",
  "SEARCH",
]);
export const DSPDefaultAudienceTargetingMatchType: z.ZodTypeAny = z.enum(["EXACT", "SIMILAR"]);
export const DSPSiteLanguage: z.ZodTypeAny = z.enum([
  "AR",
  "BN",
  "CS",
  "DA",
  "DE",
  "EN",
  "ES",
  "FI",
  "FR",
  "GU",
  "HI",
  "IT",
  "JA",
  "KN",
  "ML",
  "MR",
  "NL",
  "NO",
  "OTHER",
  "PA",
  "PL",
  "PT",
  "SV",
  "TA",
  "TE",
  "TR",
  "ZH",
]);
export const DSPTacticsConvertersExclusionType: z.ZodTypeAny = z.enum([
  "NO_EXCLUSION",
  "RECENT_CONVERTERS",
]);
export const DSPTimeZoneType: z.ZodTypeAny = z.enum(["ADVERTISER_REGION", "VIEWER"]);
export const DSPUserLocationSignal: z.ZodTypeAny = z.enum(["CURRENT", "MULTIPLE_SIGNALS"]);
export const DSPVideoCompletionTier: z.ZodTypeAny = z.enum([
  "ALL_TIERS",
  "GREATER_THAN_10_PERCENT",
  "GREATER_THAN_20_PERCENT",
  "GREATER_THAN_30_PERCENT",
  "GREATER_THAN_40_PERCENT",
  "GREATER_THAN_50_PERCENT",
  "GREATER_THAN_60_PERCENT",
  "GREATER_THAN_70_PERCENT",
  "GREATER_THAN_80_PERCENT",
  "GREATER_THAN_90_PERCENT",
]);
export const DSPTargetingSettings: z.ZodTypeAny = z
  .object({
    amazonViewability: DSPAmazonViewability,
    automatedTargetingTactic: DSPAutomatedTargetingTactic,
    defaultAudienceTargetingMatchType: DSPDefaultAudienceTargetingMatchType,
    enableLanguageTargeting: z.boolean(),
    siteLanguage: DSPSiteLanguage,
    tacticsConvertersExclusionType: DSPTacticsConvertersExclusionType,
    targetedPGDealId: z.string(),
    timeZoneType: DSPTimeZoneType,
    userLocationSignal: DSPUserLocationSignal,
    videoCompletionTier: DSPVideoCompletionTier,
  })
  .partial()
  .passthrough();
export const DSPForecastAdGroup: z.ZodTypeAny = z
  .object({
    adGroupId: z.string(),
    adProduct: DSPAdProduct,
    advertisedProductCategoryIds: z.array(z.string()).max(500),
    bid: DSPAdGroupBid,
    budgets: z.array(DSPBudget).max(3),
    campaignId: z.string(),
    creationDateTime: z.string().datetime({ offset: true }),
    creativeRotationType: DSPCreativeRotationType,
    endDateTime: z.string().datetime({ offset: true }),
    fees: z.array(DSPFee).max(100),
    frequencies: z.array(DSPFrequency).max(10),
    globalAdGroupId: z.string(),
    inventoryType: DSPInventoryType,
    lastUpdatedDateTime: z.string().datetime({ offset: true }),
    marketplaceConfigurations: z.array(DSPMarketplaceAdGroupConfigurations).max(30),
    marketplaceScope: DSPMarketplaceScope,
    marketplaces: z.array(DSPMarketplace).max(30),
    name: z.string(),
    optimization: DSPOptimization,
    pacing: DSPPacing,
    purchaseOrderNumber: z.string(),
    retailerId: z.string(),
    startDateTime: z.string().datetime({ offset: true }),
    state: DSPState,
    status: DSPStatus,
    tags: z.array(DSPTag).max(50),
    targetingSettings: DSPTargetingSettings,
  })
  .partial()
  .passthrough();
export const DSPAutoCreationSettings: z.ZodTypeAny = z.object({}).partial().passthrough();
export const DSPCountryCode: z.ZodTypeAny = z.enum([
  "AE",
  "AT",
  "AU",
  "BE",
  "BH",
  "BR",
  "CA",
  "CH",
  "DE",
  "DK",
  "EG",
  "ES",
  "FI",
  "FR",
  "GB",
  "IE",
  "IL",
  "IN",
  "IT",
  "JO",
  "JP",
  "KW",
  "LU",
  "MA",
  "MX",
  "NL",
  "NO",
  "NZ",
  "OM",
  "QA",
  "SA",
  "SE",
  "SG",
  "TR",
  "US",
]);
export const DSPTacticKey: z.ZodTypeAny = z.object({}).partial().passthrough();
export const DSPCampaignFeeType: z.ZodTypeAny = z.literal("AGENCY");
export const DSPCampaignFeeValueType: z.ZodTypeAny = z.literal("PERCENTAGE_OF_BUDGET");
export const DSPCampaignFee: z.ZodTypeAny = z
  .object({
    feeType: DSPCampaignFeeType,
    feeValue: z.number(),
    feeValueType: DSPCampaignFeeValueType,
  })
  .passthrough();
export const DSPFlightBudget: z.ZodTypeAny = z
  .object({ budgetType: DSPBudgetType, budgetValue: DSPBudgetValue })
  .passthrough();
export const DSPCampaignFlight: z.ZodTypeAny = z
  .object({
    budget: DSPFlightBudget,
    endDateTime: z.string().datetime({ offset: true }),
    flightId: z.string().optional(),
    name: z.string().optional(),
    startDateTime: z.string().datetime({ offset: true }),
  })
  .passthrough();
export const DSPIneligibleAutomatedTargetingTactic: z.ZodTypeAny = z
  .object({})
  .partial()
  .passthrough();
export const DSPMarketplaceCampaignConfigurations: z.ZodTypeAny = z
  .object({})
  .partial()
  .passthrough();
export const DSPBidSettings: z.ZodTypeAny = z
  .object({ bidStrategy: DSPBidStrategy })
  .partial()
  .passthrough();
export const DSPRolloverStrategy: z.ZodTypeAny = z.enum([
  "CUMULATIVE_BUDGET_ROLLOVER",
  "NO_ROLLOVER",
  "PRIOR_BUDGET_ROLLOVER",
]);
export const DSPBudgetSettings: z.ZodTypeAny = z
  .object({
    budgetAllocation: DSPBudgetAllocation,
    flightBudgetRolloverStrategy: DSPRolloverStrategy,
  })
  .partial()
  .passthrough();
export const DSPGoal: z.ZodTypeAny = z.enum(["AWARENESS", "CONSIDERATION", "CONVERSIONS"]);
export const DSPKPI: z.ZodTypeAny = z.enum([
  "CLICK_THROUGH_RATE",
  "COMBINED_RETURN_ON_AD_SPEND",
  "COST_PER_ACTION",
  "COST_PER_CLICK",
  "COST_PER_CONVERSION_OFF_AMAZON",
  "COST_PER_DETAIL_PAGE_VIEW",
  "COST_PER_FIRST_APP_OPEN",
  "COST_PER_INSTALL",
  "COST_PER_SIGN_UP",
  "COST_PER_VIDEO_COMPLETION",
  "DETAIL_PAGE_VIEW_RATE",
  "FREQUENCY_AVERAGE",
  "REACH",
  "RETURN_ON_AD_SPEND",
  "ROAS",
  "ROAS_COMBINED",
  "ROAS_PROMOTED",
  "TOTAL_RETURN_ON_AD_SPEND",
  "VIDEO_COMPLETION_RATE",
]);
export const DSPGoalSettings: z.ZodTypeAny = z
  .object({
    currencyCode: DSPCurrencyCode.optional(),
    goal: DSPGoal,
    kpi: DSPKPI.optional(),
    kpiValue: z.number().optional(),
  })
  .passthrough();
export const DSPPrimaryInventoryType: z.ZodTypeAny = z.enum([
  "AUDIO",
  "DISPLAY",
  "VIDEO_OLV",
  "VIDEO_STV",
]);
export const DSPCampaignOptimizations: z.ZodTypeAny = z
  .object({
    bidSettings: DSPBidSettings,
    budgetSettings: DSPBudgetSettings,
    goalSettings: DSPGoalSettings,
    primaryInventoryTypes: z.array(DSPPrimaryInventoryType).max(10),
  })
  .partial()
  .passthrough();
export const DSPForecastCampaign: z.ZodTypeAny = z
  .object({
    adProduct: DSPAdProduct,
    adomains: z.array(z.string()).max(2),
    autoCreationSettings: DSPAutoCreationSettings,
    brandId: z.string(),
    budgets: z.array(DSPBudget).max(3),
    campaignId: z.string(),
    campaignPresetId: z.string(),
    countries: z.array(DSPCountryCode).max(249),
    creationDateTime: z.string().datetime({ offset: true }),
    eligibleAutomatedTargetingTactics: z.array(DSPTacticKey).max(20),
    endDate: z.string(),
    endDateTime: z.string().datetime({ offset: true }),
    fees: z.array(DSPCampaignFee).max(2),
    flights: z.array(DSPCampaignFlight).max(10),
    frequencies: z.array(DSPFrequency).max(10),
    globalCampaignId: z.string(),
    ineligibleAutomatedTargetingTactics: z.array(DSPIneligibleAutomatedTargetingTactic).max(20),
    lastUpdatedDateTime: z.string().datetime({ offset: true }),
    marketplaceConfigurations: z.array(DSPMarketplaceCampaignConfigurations).max(30),
    marketplaceScope: DSPMarketplaceScope,
    marketplaces: z.array(DSPMarketplace).max(30),
    name: z.string(),
    optimizations: DSPCampaignOptimizations,
    portfolioId: z.string(),
    productCategoryId: z.string(),
    purchaseOrderNumber: z.string(),
    skanAppId: z.string(),
    startDate: z.string(),
    startDateTime: z.string().datetime({ offset: true }),
    state: DSPState,
    status: DSPStatus,
    tags: z.array(DSPTag).max(50),
    targetedPGDealId: z.string(),
    targetsAmazonDeal: z.boolean(),
  })
  .partial()
  .passthrough();
export const DSPForecastFlight: z.ZodTypeAny = z
  .object({
    budget: DSPBudget,
    endDateTime: z.string().datetime({ offset: true }),
    flightId: z.string().optional(),
    startDateTime: z.string().datetime({ offset: true }),
  })
  .passthrough();
export const DSPTargetBid: z.ZodTypeAny = z.object({}).partial().passthrough();
export const DSPMarketplaceTargetConfigurations: z.ZodTypeAny = z
  .object({})
  .partial()
  .passthrough();
export const DSPKeywordMatchType: z.ZodTypeAny = z.literal("BROAD");
export const DSPKeywordTarget: z.ZodTypeAny = z
  .object({ keyword: z.string(), matchType: DSPKeywordMatchType })
  .passthrough();
export const DSPProductMatchType: z.ZodTypeAny = z.literal("PRODUCT_EXACT");
export const DSPProductMarketplaceSetting: z.ZodTypeAny = z
  .object({ marketplace: DSPMarketplace, productId: z.string() })
  .passthrough();
export const DSPProductValue: z.ZodTypeAny = z
  .object({
    marketplaceSettings: z.array(DSPProductMarketplaceSetting).max(30),
    productId: z.string(),
  })
  .partial()
  .passthrough();
export const DSPProductIdType: z.ZodTypeAny = z.literal("ASIN");
export const DSPProductTarget: z.ZodTypeAny = z
  .object({
    matchType: DSPProductMatchType,
    product: DSPProductValue,
    productIdType: DSPProductIdType,
  })
  .passthrough();
export const DSPProductCategoryRefinement: z.ZodTypeAny = z
  .object({ productCategoryId: z.string() })
  .partial()
  .passthrough();
export const DSPProductCategoryRefinementValue: z.ZodTypeAny = z
  .object({ productCategoryRefinement: DSPProductCategoryRefinement })
  .partial()
  .passthrough();
export const DSPProductCategoryTarget: z.ZodTypeAny = z
  .object({ productCategoryRefinement: DSPProductCategoryRefinementValue })
  .passthrough();
export const DSPAcrossGroupOperator: z.ZodTypeAny = z.enum(["ALL", "ANY"]);
export const DSPMarketplaceStringValue: z.ZodTypeAny = z
  .object({ defaultValue: z.string() })
  .partial()
  .passthrough();
export const DSPInGroupOperator: z.ZodTypeAny = z.enum(["ALL", "ANY"]);
export const DSPAudienceTarget: z.ZodTypeAny = z
  .object({
    acrossGroupOperator: DSPAcrossGroupOperator.optional(),
    audienceId: DSPMarketplaceStringValue,
    groupId: z.string().optional(),
    inGroupOperator: DSPInGroupOperator.optional(),
  })
  .passthrough();
export const DSPLocationTarget: z.ZodTypeAny = z.object({ locationId: z.string() }).passthrough();
export const DSPDomainListTarget: z.ZodTypeAny = z
  .object({ domainListId: z.string() })
  .passthrough();
export const DSPDomainNameTarget: z.ZodTypeAny = z.object({ domainName: z.string() }).passthrough();
export const DSPDomainFileTarget: z.ZodTypeAny = z
  .object({
    domainFileId: z.string(),
    domainFileKey: z.string(),
    domainFileName: z.string(),
    domainFileUrl: z.string(),
  })
  .partial()
  .passthrough();
export const DSPAdvertiserDomainList: z.ZodTypeAny = z
  .object({ inheritFromAdvertiser: z.boolean() })
  .passthrough();
export const DSPDomainTargetDetails: z.ZodTypeAny = z.union([
  z.object({ domainListTarget: DSPDomainListTarget }).passthrough(),
  z.object({ domainNameTarget: DSPDomainNameTarget }).passthrough(),
  z.object({ domainFileTarget: DSPDomainFileTarget }).passthrough(),
  z.object({ advertiserDomainList: DSPAdvertiserDomainList }).passthrough(),
]);
export const DSPDomainTargetTypes: z.ZodTypeAny = z.enum([
  "ADVERTISER_DOMAIN_LIST",
  "DOMAIN_FILE",
  "DOMAIN_LIST",
  "DOMAIN_NAME",
]);
export const DSPDomainTarget: z.ZodTypeAny = z
  .object({ domainTargetDetails: DSPDomainTargetDetails, domainTargetType: DSPDomainTargetTypes })
  .passthrough();
export const DSPAppType: z.ZodTypeAny = z.enum(["MOBILE", "STREAMING_TV"]);
export const DSPAppTarget: z.ZodTypeAny = z
  .object({ appId: z.string(), appType: DSPAppType })
  .passthrough();
export const DSPDeviceOrientation: z.ZodTypeAny = z.enum(["LANDSCAPE", "PORTRAIT"]);
export const DSPDeviceType: z.ZodTypeAny = z.enum([
  "CONNECTED_DEVICE",
  "CONNECTED_TV",
  "DESKTOP",
  "MOBILE",
]);
export const DSPMobileDevice: z.ZodTypeAny = z.enum([
  "ANDROID",
  "IPAD",
  "IPHONE",
  "KINDLE_FIRE",
  "KINDLE_FIRE_HD",
]);
export const DSPMobileEnvironment: z.ZodTypeAny = z.enum(["APP", "WEB"]);
export const DSPMobileOs: z.ZodTypeAny = z.enum(["ANDROID", "IOS"]);
export const DSPDeviceTarget: z.ZodTypeAny = z
  .object({
    deviceOrientation: DSPDeviceOrientation.optional(),
    deviceType: DSPDeviceType,
    mobileDevice: DSPMobileDevice.optional(),
    mobileEnvironment: DSPMobileEnvironment.optional(),
    mobileOs: DSPMobileOs.optional(),
  })
  .passthrough();
export const DSPDayOfWeek: z.ZodTypeAny = z.enum([
  "FRIDAY",
  "MONDAY",
  "SATURDAY",
  "SUNDAY",
  "THURSDAY",
  "TUESDAY",
  "WEDNESDAY",
]);
export const DSPTimeOfDay: z.ZodTypeAny = z
  .object({
    endTime: z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]Z$/),
    startTime: z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]Z$/),
  })
  .passthrough();
export const DSPDayPartTarget: z.ZodTypeAny = z
  .object({ dayOfWeek: DSPDayOfWeek, timeOfDay: DSPTimeOfDay })
  .passthrough();
export const DSPContentCategoryTarget: z.ZodTypeAny = z
  .object({ contentCategoryId: z.string() })
  .passthrough();
export const DSPContentGenre: z.ZodTypeAny = z.enum([
  "ACTION",
  "ADVENTURE",
  "ALTERNATIVE_ROCK",
  "ANIMATION",
  "ARTS",
  "BIOGRAPHY",
  "BLUES",
  "BUSINESS",
  "CHILDRENS_MUSIC",
  "CHRISTIAN_GOSPEL",
  "CHRISTMAS_HOLIDAY",
  "CLASSICAL",
  "CLASSIC_ROCK",
  "COLLEGE_RADIO",
  "COMEDY",
  "COUNTRY",
  "CRIME",
  "DANCE_DJ",
  "DOCUMENTARY",
  "DRAMA",
  "EASY_LISTENING",
  "EDUCATION",
  "EUROPEAN_POP_FOLK",
  "FAMILY",
  "FANTASY",
  "FICTION",
  "FILM_NOIR",
  "FOLK",
  "FRENCH_VARIETY",
  "GAME_SHOW",
  "GENRE_NOT_AVAILABLE",
  "GERMAN_ROCK_POP",
  "GOVERNMENT",
  "HARD_ROCK_METAL",
  "HEALTH_AND_FITNESS",
  "HISTORY",
  "HORROR",
  "INTERNATIONAL",
  "JAPANESE",
  "JAZZ",
  "KIDS_AND_FAMILY",
  "LATIN_MUSIC",
  "LEISURE",
  "MISCELLANEOUS",
  "MUSIC",
  "MUSICAL",
  "MUSICALS_CABARET",
  "MYSTERY",
  "NEWS",
  "NEW_AGE",
  "OLDIES_ADULT_STANDARDS",
  "POP",
  "RAP_HIP_HOP",
  "RB",
  "REALITY_TV",
  "REGGAE_ISLAND",
  "RELIGION_AND_SPIRITUALITY",
  "ROCK",
  "ROMANCE",
  "SCIENCE",
  "SCIENCE_FICTION",
  "SHORT",
  "SOCIETY_AND_CULTURE",
  "SOUNDTRACKS",
  "SPORT",
  "SUPER_HERO",
  "TALK_SHOW",
  "TECHNOLOGY",
  "THRILLER",
  "TRUE_CRIME",
  "TV_AND_FILM",
  "WAR",
  "WESTERN",
]);
export const DSPContentGenreTarget: z.ZodTypeAny = z
  .object({ contentGenre: DSPContentGenre })
  .passthrough();
export const DSPContentRatingTypes: z.ZodTypeAny = z.enum([
  "DSP_CONTENT_RATING",
  "TWITCH_CONTENT_RATING",
]);
export const DSPDspContentRatingEnum: z.ZodTypeAny = z.enum([
  "RATING_NOT_AVAILABLE",
  "SUITABLE_FOR_ADULTS",
  "SUITABLE_FOR_ALL_AUDIENCES",
  "SUITABLE_FOR_MATURE_AUDIENCES",
  "SUITABLE_FOR_MOST_AUDIENCES_WITH_PARENTAL_GUIDANCE",
  "SUITABLE_FOR_TEEN_AND_OLDER_AUDIENCES",
]);
export const DSPDspContentRating: z.ZodTypeAny = z
  .object({ dspContentRating: DSPDspContentRatingEnum })
  .passthrough();
export const DSPTwitchContentRatingEnum: z.ZodTypeAny = z.enum([
  "TWITCH_MODERATE",
  "TWITCH_RESTRICTIVE",
]);
export const DSPTwitchContentRating: z.ZodTypeAny = z
  .object({ twitchContentRating: DSPTwitchContentRatingEnum })
  .passthrough();
export const DSPContentRating: z.ZodTypeAny = z.union([
  z.object({ dspContentRating: DSPDspContentRating }).passthrough(),
  z.object({ twitchContentRating: DSPTwitchContentRating }).passthrough(),
]);
export const DSPContentRatingTarget: z.ZodTypeAny = z
  .object({ contentRatingType: DSPContentRatingTypes, contentRatingTypeDetails: DSPContentRating })
  .passthrough();
export const DSPBrandSafetyTier: z.ZodTypeAny = z.enum(["EXPANDED", "RESTRICTIVE", "STANDARD"]);
export const DSPBrandSafetyTierTarget: z.ZodTypeAny = z
  .object({ brandSafetyTier: DSPBrandSafetyTier })
  .passthrough();
export const DSPBrandSafetyCategory: z.ZodTypeAny = z.enum([
  "ACCIDENTS_DISASTERS_AND_TRAGEDIES",
  "ALCOHOL_AND_RELATED_PRODUCTS",
  "BLOOD_GORE_VIOLENCE",
  "CRIME",
  "DRUG_REFERENCES_OR_USE",
  "GAMBLING",
  "HIGHLY_DEBATED_SOCIAL_ISSUES",
  "POLITICS",
  "PROFANITY",
  "RELIGIOUS_CONTENT",
  "SEXUAL_REFERENCES_AND_SUGGESTIVE",
  "SHOCK_AND_HORROR",
  "TOBACCO_AND_RELATED_PRODUCTS",
  "UNRATED_MEDIA_CONTENT",
  "WEAPONS",
]);
export const DSPBrandSafetyCategoryTarget: z.ZodTypeAny = z
  .object({ brandSafetyCategory: DSPBrandSafetyCategory })
  .passthrough();
export const DSPInventorySourceType: z.ZodTypeAny = z.enum([
  "AMAZON",
  "APD",
  "DEAL",
  "INVENTORY_GROUP",
  "THIRD_PARTY_EXCHANGE",
]);
export const DSPInventorySourceTarget: z.ZodTypeAny = z
  .object({
    inventorySourceId: DSPMarketplaceStringValue,
    inventorySourceType: DSPInventorySourceType,
  })
  .passthrough();
export const DSPVideoInitiationType: z.ZodTypeAny = z.enum([
  "AUTOPLAY",
  "UNKNOWN",
  "USER_INITIATED",
]);
export const DSPAdInitiationTarget: z.ZodTypeAny = z
  .object({ videoInitiationType: DSPVideoInitiationType })
  .passthrough();
export const DSPAdPlayerSize: z.ZodTypeAny = z.enum(["LARGE", "MEDIUM", "SMALL", "UNKNOWN"]);
export const DSPAdPlayerSizeTarget: z.ZodTypeAny = z
  .object({ adPlayerSize: DSPAdPlayerSize })
  .passthrough();
export const DSPVideoAdFormat: z.ZodTypeAny = z.enum([
  "FULL_EPISODE_PLAYER",
  "INSTREAM",
  "OUTSTREAM",
]);
export const DSPVideoAdFormatTarget: z.ZodTypeAny = z
  .object({ videoAdFormat: DSPVideoAdFormat })
  .passthrough();
export const DSPExcludeAppsAndSitesType: z.ZodTypeAny = z.enum([
  "ALLOW_ALL",
  "FRAUD_TRAFFIC_LEVEL_GTE_02",
  "FRAUD_TRAFFIC_LEVEL_GTE_04",
  "FRAUD_TRAFFIC_LEVEL_GTE_06",
  "FRAUD_TRAFFIC_LEVEL_GTE_08",
  "FRAUD_TRAFFIC_LEVEL_GTE_10",
  "FRAUD_TRAFFIC_LEVEL_GTE_100",
  "FRAUD_TRAFFIC_LEVEL_GTE_25",
  "FRAUD_TRAFFIC_LEVEL_GTE_50",
]);
export const DSPDoubleVerifyFraudInvalidTraffic: z.ZodTypeAny = z
  .object({
    blockAppAndSites: z.boolean(),
    excludeAppsAndSites: DSPExcludeAppsAndSitesType,
    excludeImpressions: z.boolean(),
  })
  .partial()
  .passthrough();
export const DSPDVBrandSafetyContentCategoryType: z.ZodTypeAny = z.enum([
  "AD_SERVER",
  "CELEBRITY_GOSSIP",
  "CULTS_SURVIVALISM",
  "EXTREME_GRAPHIC",
  "GAMBLING",
  "INCENTIVIZED_MALWARE_CLUTTER",
  "INFLAMMATORY_POLITICS_NEWS",
  "NEGATIVE_NEWS_FINANCIAL",
  "NEGATIVE_NEWS_PHARMACEUTICAL",
  "NON_STANDARD_CONTENT_NON_ENGLISH",
  "NON_STANDARD_CONTENT_PARKING_PAGE",
  "OCCULT",
  "PIRACY_COPYRIGHT_INFRINGEMENT",
  "UNMODERATED_UGC_FORUMS_IMAGES_VIDEO",
]);
export const DSPBrandSuitabilityRiskLevelType: z.ZodTypeAny = z.enum([
  "ALLOW_ALL",
  "HIGH",
  "HIGH_MEDIUM",
  "HIGH_MEDIUM_LOW",
]);
export const DSPDVBrandSafetyContentCategoriesWithRiskMap: z.ZodTypeAny = z
  .object({ key: z.string(), value: DSPBrandSuitabilityRiskLevelType })
  .passthrough();
export const DSPDoubleVerifyStandardDisplayBrandSafety: z.ZodTypeAny = z
  .object({
    contentCategories: z.array(DSPDVBrandSafetyContentCategoryType).max(50),
    contentCategoriesWithRisk: z.array(DSPDVBrandSafetyContentCategoriesWithRiskMap).max(50),
    unknownContent: z.boolean(),
  })
  .partial()
  .passthrough();
export const DSPDVBrandSafetyAppAgeRatingType: z.ZodTypeAny = z.enum([
  "ADULTS_ONLY_18_PLUS",
  "EVERYONE_4_PLUS",
  "MATURE_17_PLUS",
  "TEENS_12_PLUS",
  "TWEENS_9_PLUS",
  "UNKNOWN",
]);
export const DSPDVBrandSafetyAppStarRatingType: z.ZodTypeAny = z.enum([
  "ALLOW_ALL",
  "APP_STAR_RATING_LT_1_POINT_5_STARS",
  "APP_STAR_RATING_LT_2_POINT_5_STARS",
  "APP_STAR_RATING_LT_2_STARS",
  "APP_STAR_RATING_LT_3_POINT_5_STARS",
  "APP_STAR_RATING_LT_3_STARS",
  "APP_STAR_RATING_LT_4_POINT_5_STARS",
  "APP_STAR_RATING_LT_4_STARS",
]);
export const DSPDoubleVerifyBrandSafety: z.ZodTypeAny = z
  .object({
    appAgeRating: z.array(DSPDVBrandSafetyAppAgeRatingType).max(50),
    appStarRating: DSPDVBrandSafetyAppStarRatingType,
    contentCategories: z.array(DSPDVBrandSafetyContentCategoryType).max(50),
    contentCategoriesWithRisk: z.array(DSPDVBrandSafetyContentCategoriesWithRiskMap).max(50),
    excludeAppsWithInsufficientRating: z.boolean(),
    unknownContent: z.boolean(),
  })
  .partial()
  .passthrough();
export const DSPAverageCompletionAndFullyViewableRateTargetingType: z.ZodTypeAny = z.enum([
  "ALLOW_ALL",
  "AVG_COMPLETION_FULLY_VIEWABLE_GTE_10",
  "AVG_COMPLETION_FULLY_VIEWABLE_GTE_20",
  "AVG_COMPLETION_FULLY_VIEWABLE_GTE_25",
  "AVG_COMPLETION_FULLY_VIEWABLE_GTE_30",
  "AVG_COMPLETION_FULLY_VIEWABLE_GTE_35",
  "AVG_COMPLETION_FULLY_VIEWABLE_GTE_40",
]);
export const DSPBrandExposureViewabilityTargetingType: z.ZodTypeAny = z.enum([
  "ALLOW_ALL",
  "BRAND_EXPOSURE_VIEWABILITY_GTE_10_SEC_AVG_DURATION",
  "BRAND_EXPOSURE_VIEWABILITY_GTE_15_SEC_AVG_DURATION",
  "BRAND_EXPOSURE_VIEWABILITY_GTE_5_SEC_AVG_DURATION",
]);
export const DSPMrcViewabilityTargetingType: z.ZodTypeAny = z.enum([
  "ALLOW_ALL",
  "MRC_VIEWABILITY_GTE_30",
  "MRC_VIEWABILITY_GTE_40",
  "MRC_VIEWABILITY_GTE_50",
  "MRC_VIEWABILITY_GTE_55",
  "MRC_VIEWABILITY_GTE_60",
  "MRC_VIEWABILITY_GTE_65",
  "MRC_VIEWABILITY_GTE_70",
  "MRC_VIEWABILITY_GTE_75",
  "MRC_VIEWABILITY_GTE_80",
]);
export const DSPDoubleVerifyViewability: z.ZodTypeAny = z
  .object({
    averageCompletionAndFullyViewableRateTargeting:
      DSPAverageCompletionAndFullyViewableRateTargetingType,
    brandExposureViewabilityTargeting: DSPBrandExposureViewabilityTargetingType,
    includeUnmeasurableImpressions: z.boolean(),
    mrcViewabilityTargeting: DSPMrcViewabilityTargetingType,
  })
  .partial()
  .passthrough();
export const DSPDoubleVerifyAuthenticBrandSafety: z.ZodTypeAny = z
  .object({ doubleVerifySegmentId: z.string().regex(/^51[0-9]{6}$/) })
  .partial()
  .passthrough();
export const DSPDoubleVerifyCustomContextualSegmentId: z.ZodTypeAny = z
  .object({ doubleVerifySegmentId: z.string().regex(/^52[0-9]{6}$/) })
  .partial()
  .passthrough();
export const DSPDoubleVerifyAuthenticAttention: z.ZodTypeAny = z
  .object({ universalAttention: z.boolean() })
  .passthrough();
export const DSPIASFraudInvalidTrafficType: z.ZodTypeAny = z.enum([
  "ALLOW_ALL",
  "FRAUD_INVALID_TRAFFIC_EXCLUDE_HIGH_MODERATE_RISK",
  "FRAUD_INVALID_TRAFFIC_EXCLUDE_HIGH_RISK",
]);
export const DSPIntegralAdScienceFraudInvalidTraffic: z.ZodTypeAny = z
  .object({ targetSetting: DSPIASFraudInvalidTrafficType })
  .partial()
  .passthrough();
export const DSPIASBrandSafetyLevelType: z.ZodTypeAny = z.enum([
  "ALLOW_ALL",
  "BRAND_SAFETY_EXCLUDE_HIGH_AND_MODERATE_RISK",
  "BRAND_SAFETY_EXCLUDE_HIGH_RISK",
]);
export const DSPIntegralAdScienceBrandSafety: z.ZodTypeAny = z
  .object({
    excludeContent: z.boolean(),
    iasBrandSafetyAdult: DSPIASBrandSafetyLevelType,
    iasBrandSafetyAlcohol: DSPIASBrandSafetyLevelType,
    iasBrandSafetyGambling: DSPIASBrandSafetyLevelType,
    iasBrandSafetyHateSpeech: DSPIASBrandSafetyLevelType,
    iasBrandSafetyIllegalDownloads: DSPIASBrandSafetyLevelType,
    iasBrandSafetyIllegalDrugs: DSPIASBrandSafetyLevelType,
    iasBrandSafetyOffensiveLanguage: DSPIASBrandSafetyLevelType,
    iasBrandSafetyViolence: DSPIASBrandSafetyLevelType,
  })
  .partial()
  .passthrough();
export const DSPIASViewabilityStandardType: z.ZodTypeAny = z.enum([
  "GROUPM",
  "MRC",
  "NONE",
  "PUBLICIS",
]);
export const DSPViewabilityTierType: z.ZodTypeAny = z.enum([
  "ALLOW_ALL",
  "VIEWABILITY_TIER_GT_40",
  "VIEWABILITY_TIER_GT_50",
  "VIEWABILITY_TIER_GT_60",
  "VIEWABILITY_TIER_GT_70",
  "VIEWABILITY_TIER_LT_40",
]);
export const DSPIntegralAdScienceViewability: z.ZodTypeAny = z
  .object({
    standard: DSPIASViewabilityStandardType,
    viewabilityTargeting: DSPViewabilityTierType.optional(),
  })
  .passthrough();
export const DSPIntegralAdScienceContextualTargeting: z.ZodTypeAny = z
  .object({
    topicalSegments: z.array(z.string()).max(200),
    verticalSegments: z.array(z.string()).max(200),
  })
  .partial()
  .passthrough();
export const DSPIntegralAdScienceContextualAvoidance: z.ZodTypeAny = z
  .object({ avoidanceSegments: z.array(z.string()).max(200) })
  .partial()
  .passthrough();
export const DSPPixalateFraudInvalidTraffic: z.ZodTypeAny = z
  .object({
    excludeAppsAndDomains: z.boolean(),
    excludeIpAddressAndUserAgents: z.boolean(),
    excludeOttAndMobileDevices: z.boolean(),
    excludeRemovedAppsFromAppStores: z.boolean(),
  })
  .partial()
  .passthrough();
export const DSPIntegralAdScienceQualitySync: z.ZodTypeAny = z
  .object({ segmentId: z.string().regex(/^4[0-9]{6}$/) })
  .partial()
  .passthrough();
export const DSPNewsGuardBrandGuardTrustedNewsTargetingType: z.ZodTypeAny = z.enum([
  "BASIC_INCLUDE",
  "BUSINESS_INCLUDE",
  "COMMUNITY_INCLUDE",
  "HEALTH_INCLUDE",
  "HIGH_INCLUDE",
  "LIFESTYLE_INCLUDE",
  "LOCAL_INCLUDE",
  "MAX_INCLUDE",
  "POLITICS_INCLUDE",
  "TECH_INCLUDE",
]);
export const DSPNewsGuardBrandGuardTrustedNewsTargeting: z.ZodTypeAny = z
  .object({ targetingList: z.array(DSPNewsGuardBrandGuardTrustedNewsTargetingType).max(15) })
  .partial()
  .passthrough();
export const DSPNewsGuardBrandGuardMisinformationSafetyType: z.ZodTypeAny = z.enum([
  "AI_GENERATED_MFA",
  "BASIC_EXCLUDE",
  "CLIMATE_MISINFORMATION",
  "COVID_MISINFORMATION",
  "ELECTION_MISINFORMATION",
  "HEALTH_MISINFORMATION",
  "HIGH_EXCLUDE",
  "ISRAEL_HAMAS_MISINFORMATION",
  "MAX_EXCLUDE",
  "MISINFORMATION_SITES",
  "OPINIONATED_NEWS",
  "QANON_MISINFORMATION",
  "UKRAINE_MISINFORMATION",
  "VACCINE_MISINFORMATION",
]);
export const DSPNewsGuardBrandGuardMisinformationSafety: z.ZodTypeAny = z
  .object({ avoidanceList: z.array(DSPNewsGuardBrandGuardMisinformationSafetyType).max(20) })
  .partial()
  .passthrough();
export const DSPThirdPartyTargetDetails: z.ZodTypeAny = z.union([
  z.object({ doubleVerifyFraudInvalidTraffic: DSPDoubleVerifyFraudInvalidTraffic }).passthrough(),
  z
    .object({ doubleVerifyStandardDisplayBrandSafety: DSPDoubleVerifyStandardDisplayBrandSafety })
    .passthrough(),
  z.object({ doubleVerifyBrandSafety: DSPDoubleVerifyBrandSafety }).passthrough(),
  z.object({ doubleVerifyViewability: DSPDoubleVerifyViewability }).passthrough(),
  z.object({ doubleVerifyAuthenticBrandSafety: DSPDoubleVerifyAuthenticBrandSafety }).passthrough(),
  z
    .object({ doubleVerifyCustomContextualSegmentId: DSPDoubleVerifyCustomContextualSegmentId })
    .passthrough(),
  z.object({ doubleVerifyAuthenticAttention: DSPDoubleVerifyAuthenticAttention }).passthrough(),
  z
    .object({ integralAdScienceFraudInvalidTraffic: DSPIntegralAdScienceFraudInvalidTraffic })
    .passthrough(),
  z.object({ integralAdScienceBrandSafety: DSPIntegralAdScienceBrandSafety }).passthrough(),
  z.object({ integralAdScienceViewability: DSPIntegralAdScienceViewability }).passthrough(),
  z
    .object({ integralAdScienceContextualTargeting: DSPIntegralAdScienceContextualTargeting })
    .passthrough(),
  z
    .object({ integralAdScienceContextualAvoidance: DSPIntegralAdScienceContextualAvoidance })
    .passthrough(),
  z.object({ pixalateFraudInvalidTraffic: DSPPixalateFraudInvalidTraffic }).passthrough(),
  z.object({ integralAdScienceQualitySync: DSPIntegralAdScienceQualitySync }).passthrough(),
  z
    .object({ newsGuardBrandGuardTrustedNewsTargeting: DSPNewsGuardBrandGuardTrustedNewsTargeting })
    .passthrough(),
  z
    .object({ newsGuardBrandGuardMisinformationSafety: DSPNewsGuardBrandGuardMisinformationSafety })
    .passthrough(),
]);
export const DSPThirdPartyTargetType: z.ZodTypeAny = z.enum([
  "DOUBLE_VERIFY_AUTHENTIC_ATTENTION",
  "DOUBLE_VERIFY_AUTHENTIC_BRAND_SAFETY",
  "DOUBLE_VERIFY_BRAND_SAFETY",
  "DOUBLE_VERIFY_CUSTOM_CONTEXTUAL_SEGMENT_ID",
  "DOUBLE_VERIFY_FRAUD_INVALID_TRAFFIC",
  "DOUBLE_VERIFY_STANDARD_DISPLAY_BRAND_SAFETY",
  "DOUBLE_VERIFY_VIEWABILITY",
  "INTEGRAL_AD_SCIENCE_BRAND_SAFETY",
  "INTEGRAL_AD_SCIENCE_CONTEXTUAL_AVOIDANCE",
  "INTEGRAL_AD_SCIENCE_CONTEXTUAL_TARGETING",
  "INTEGRAL_AD_SCIENCE_FRAUD_INVALID_TRAFFIC",
  "INTEGRAL_AD_SCIENCE_QUALITY_SYNC",
  "INTEGRAL_AD_SCIENCE_VIEWABILITY",
  "NEWS_GUARD_BRAND_GUARD_MISINFORMATION_SAFETY",
  "NEWS_GUARD_BRAND_GUARD_TRUSTED_NEWS_TARGETING",
  "PIXALATE_FRAUD_INVALID_TRAFFIC",
]);
export const DSPThirdPartyTarget: z.ZodTypeAny = z
  .object({
    thirdPartyTargetDetails: DSPThirdPartyTargetDetails,
    thirdPartyTargetType: DSPThirdPartyTargetType,
  })
  .passthrough();
export const DSPThemeMatchType: z.ZodTypeAny = z.literal("PRODUCTS_SIMILAR_TO_ADVERTISED_PRODUCTS");
export const DSPThemeTarget: z.ZodTypeAny = z
  .object({ matchType: DSPThemeMatchType })
  .passthrough();
export const DSPContentInstreamPosition: z.ZodTypeAny = z.enum([
  "MID_ROLL",
  "POST_ROLL",
  "PRE_ROLL",
  "UNKNOWN",
]);
export const DSPContentInstreamPositionTarget: z.ZodTypeAny = z
  .object({ instreamPosition: DSPContentInstreamPosition })
  .passthrough();
export const DSPContentOutstreamPosition: z.ZodTypeAny = z.enum([
  "ACCOMPANYING_CONTENT",
  "INTERSTITIAL",
  "STANDALONE",
  "UNKNOWN",
]);
export const DSPContentOutstreamPositionTarget: z.ZodTypeAny = z
  .object({ outstreamPosition: DSPContentOutstreamPosition })
  .passthrough();
export const DSPVideoContentDuration: z.ZodTypeAny = z.enum([
  "EXTENDED",
  "LONG",
  "MEDIUM",
  "SHORT",
  "UNKNOWN",
]);
export const DSPVideoContentDurationTarget: z.ZodTypeAny = z
  .object({ duration: DSPVideoContentDuration })
  .passthrough();
export const DSPFoldPosition: z.ZodTypeAny = z.enum([
  "ABOVE_THE_FOLD",
  "BELOW_THE_FOLD",
  "UNKNOWN",
]);
export const DSPFoldPositionTarget: z.ZodTypeAny = z
  .object({ foldPosition: DSPFoldPosition })
  .passthrough();
export const DSPNativeContentPosition: z.ZodTypeAny = z.enum([
  "IN_ARTICLE",
  "IN_FEED",
  "PERIPHERAL",
  "RECOMMENDATION",
  "UNKNOWN",
]);
export const DSPNativeContentPositionTarget: z.ZodTypeAny = z
  .object({ nativePosition: DSPNativeContentPosition })
  .passthrough();
export const DSPPlacementType: z.ZodTypeAny = z.literal("REWARDED");
export const DSPPlacementTypeTarget: z.ZodTypeAny = z
  .object({ placementType: DSPPlacementType })
  .passthrough();
export const DSPTargetDetails: z.ZodTypeAny = z.union([
  z.object({ keywordTarget: DSPKeywordTarget }).passthrough(),
  z.object({ productTarget: DSPProductTarget }).passthrough(),
  z.object({ productCategoryTarget: DSPProductCategoryTarget }).passthrough(),
  z.object({ audienceTarget: DSPAudienceTarget }).passthrough(),
  z.object({ locationTarget: DSPLocationTarget }).passthrough(),
  z.object({ domainTarget: DSPDomainTarget }).passthrough(),
  z.object({ appTarget: DSPAppTarget }).passthrough(),
  z.object({ deviceTarget: DSPDeviceTarget }).passthrough(),
  z.object({ dayPartTarget: DSPDayPartTarget }).passthrough(),
  z.object({ contentCategoryTarget: DSPContentCategoryTarget }).passthrough(),
  z.object({ contentGenreTarget: DSPContentGenreTarget }).passthrough(),
  z.object({ contentRatingTarget: DSPContentRatingTarget }).passthrough(),
  z.object({ brandSafetyTierTarget: DSPBrandSafetyTierTarget }).passthrough(),
  z.object({ brandSafetyCategoryTarget: DSPBrandSafetyCategoryTarget }).passthrough(),
  z.object({ inventorySourceTarget: DSPInventorySourceTarget }).passthrough(),
  z.object({ adInitiationTarget: DSPAdInitiationTarget }).passthrough(),
  z.object({ adPlayerSizeTarget: DSPAdPlayerSizeTarget }).passthrough(),
  z.object({ videoAdFormatTarget: DSPVideoAdFormatTarget }).passthrough(),
  z.object({ thirdPartyTarget: DSPThirdPartyTarget }).passthrough(),
  z.object({ themeTarget: DSPThemeTarget }).passthrough(),
  z.object({ contentInstreamPositionTarget: DSPContentInstreamPositionTarget }).passthrough(),
  z.object({ contentOutstreamPositionTarget: DSPContentOutstreamPositionTarget }).passthrough(),
  z.object({ videoContentDurationTarget: DSPVideoContentDurationTarget }).passthrough(),
  z.object({ foldPositionTarget: DSPFoldPositionTarget }).passthrough(),
  z.object({ nativeContentPositionTarget: DSPNativeContentPositionTarget }).passthrough(),
  z.object({ placementTypeTarget: DSPPlacementTypeTarget }).passthrough(),
]);
export const DSPTargetLevel: z.ZodTypeAny = z.literal("AD_GROUP");
export const DSPTargetType: z.ZodTypeAny = z.enum([
  "AD_INITIATION",
  "AD_PLAYER_SIZE",
  "APP",
  "AUDIENCE",
  "BRAND_SAFETY_CATEGORY",
  "BRAND_SAFETY_TIER",
  "CONTENT_CATEGORY",
  "CONTENT_GENRE",
  "CONTENT_INSTREAM_POSITION",
  "CONTENT_OUTSTREAM_POSITION",
  "CONTENT_RATING",
  "DAYPART",
  "DEVICE",
  "DOMAIN",
  "FOLD_POSITION",
  "INVENTORY_SOURCE",
  "KEYWORD",
  "LOCATION",
  "NATIVE_CONTENT_POSITION",
  "PLACEMENT_TYPE",
  "PRODUCT",
  "PRODUCT_CATEGORY",
  "THEME",
  "THIRD_PARTY",
  "VIDEO_AD_FORMAT",
  "VIDEO_CONTENT_DURATION",
]);
export const DSPForecastTarget: z.ZodTypeAny = z
  .object({
    adGroupId: z.string(),
    adProduct: DSPAdProduct,
    bid: DSPTargetBid,
    campaignId: z.string(),
    creationDateTime: z.string().datetime({ offset: true }),
    globalTargetId: z.string(),
    lastUpdatedDateTime: z.string().datetime({ offset: true }),
    marketplaceConfigurations: z.array(DSPMarketplaceTargetConfigurations).max(30),
    marketplaceScope: DSPMarketplaceScope,
    marketplaces: z.array(DSPMarketplace).max(30),
    negative: z.boolean(),
    state: DSPState,
    status: DSPStatus,
    tags: z.array(DSPTag).max(50),
    targetDetails: DSPTargetDetails,
    targetId: z.string(),
    targetLevel: DSPTargetLevel,
    targetType: DSPTargetType,
  })
  .partial()
  .passthrough();
export const DSPReplanningSettings: z.ZodTypeAny = z
  .object({
    adGroups: z.array(DSPForecastAdGroup).max(10),
    campaign: DSPForecastCampaign,
    flights: z.array(DSPForecastFlight).max(5),
    targets: z.array(DSPForecastTarget).max(50),
  })
  .partial()
  .passthrough();
export const DSPCampaignForecastDescription: z.ZodTypeAny = z
  .object({
    campaignId: z.string(),
    enabledFeatures: DSPEnabledFeaturesInCampaignForecast.optional(),
    flightIds: z.array(z.string()).max(5).optional(),
    replanningSettings: DSPReplanningSettings.optional(),
  })
  .passthrough();
export const DSPRetrieveCampaignForecastRequest: z.ZodTypeAny = z
  .object({ campaignForecastDescriptions: z.array(DSPCampaignForecastDescription).min(1).max(1) })
  .partial()
  .passthrough();
export const DSPPointLabel: z.ZodTypeAny = z.enum([
  "AIMP",
  "AREA",
  "BID",
  "CAS",
  "CPA",
  "CPC",
  "CPM",
  "DC",
  "EIMP",
  "EREA",
  "ROAS",
  "SPEND",
  "TAS",
]);
export const DSPXPoint: z.ZodTypeAny = z
  .object({ label: DSPPointLabel, value: z.number() })
  .passthrough();
export const DSPForecastValue: z.ZodTypeAny = z
  .object({ high: z.number(), low: z.number(), mean: z.number() })
  .passthrough();
export const DSPYPoint: z.ZodTypeAny = z
  .object({ label: DSPPointLabel, value: DSPForecastValue })
  .passthrough();
export const DSPPoint: z.ZodTypeAny = z
  .object({
    pointType: z.string().optional(),
    x: DSPXPoint,
    y: z.array(DSPYPoint).max(1000).optional(),
  })
  .passthrough();
export const DSPForecastPeriodicity: z.ZodTypeAny = z.enum([
  "DAILY",
  "LIFETIME",
  "MONTHLY",
  "WEEKLY",
]);
export const DSPCurve: z.ZodTypeAny = z
  .object({
    focusPoint: z.array(DSPPoint).max(10),
    periodicity: DSPForecastPeriodicity,
    points: z.array(DSPPoint).max(1000),
  })
  .partial()
  .passthrough();
export const DSPDeliverInFullConfidenceLevel: z.ZodTypeAny = z.enum([
  "HIGH",
  "LOW",
  "MEDIUM",
  "UNAVAILABLE",
]);
export const DSPDeliverInFullConfidence: z.ZodTypeAny = z
  .object({ value: DSPDeliverInFullConfidenceLevel })
  .passthrough();
export const DSPRecommendedObjectType: z.ZodTypeAny = z.enum(["ADGROUP", "CAMPAIGN"]);
export const DSPInsightFeature: z.ZodTypeAny = z.enum([
  "CAMPAIGN_FREQUENCY_CAP",
  "LINE_ITEM_APPBLOCKING_TARGETING",
  "LINE_ITEM_COLD_START_DEALS",
  "LINE_ITEM_COLD_START_SEGMENTS",
  "LINE_ITEM_CONTEXTUAL_TARGETING",
  "LINE_ITEM_DOMAINLIST_TARGETING",
  "LINE_ITEM_FREQUENCY_CAP",
  "LINE_ITEM_GEO_TARGETING",
  "LINE_ITEM_LARGE_TARGETING",
  "LINE_ITEM_MAX_BID",
  "LINE_ITEM_MOBILE_DEVICES_TARGETING",
  "LINE_ITEM_NARROW_SEGMENTS",
  "LINE_ITEM_SIMILAR_AUDIENCES",
  "LINE_ITEM_TOO_FAR_IN_FUTURE",
  "LINE_ITEM_UNSUPPORTED_CONTEXTUAL_TARGETING",
  "LINE_ITEM_UNSUPPORTED_KEYWORD_TARGETING",
]);
export const DSPForecastInsightsGroup: z.ZodTypeAny = z
  .object({
    coldStartDealNames: z.array(z.string()).max(99).optional(),
    coldStartSegmentNames: z.array(z.string()).max(99).optional(),
    displayName: z.string(),
    groupType: DSPRecommendedObjectType,
    insightsFeatures: z.array(DSPInsightFeature).min(1).max(9),
    tag: z.string(),
  })
  .passthrough();
export const DSPFlightForecastInsights: z.ZodTypeAny = z
  .object({
    forecastExplainabilityInsights: z.array(DSPForecastInsightsGroup).max(49),
    topExplainabilityFactors: z.array(DSPInsightFeature).max(4),
  })
  .partial()
  .passthrough();
export const DSPForecastMetric: z.ZodTypeAny = z
  .object({
    metric: DSPSelectedForecastMetric,
    periodicity: DSPForecastPeriodicity.optional(),
    value: DSPForecastValue,
  })
  .passthrough();
export const DSPReplanning: z.ZodTypeAny = z
  .object({
    content: z.string(),
    curves: z.array(DSPCurve).max(4).optional(),
    deliverInFullConfidence: DSPDeliverInFullConfidence.optional(),
    metrics: z.array(DSPForecastMetric).max(20).optional(),
    scenarioFlight: DSPForecastFlight.optional(),
    scenarioType: z.string().optional(),
    selectedMetrics: z.array(DSPSelectedForecastMetric).max(20).optional(),
    title: z.string(),
  })
  .passthrough();
export const DSPWarning: z.ZodTypeAny = z
  .object({
    adGroupIds: z.array(z.string()).max(50).optional(),
    code: z.string(),
    message: z.string(),
    messageParameters: z.array(z.string()).max(50).optional(),
    warningLevel: z.number().int().optional(),
  })
  .passthrough();
export const DSPFlightForecast: z.ZodTypeAny = z
  .object({
    curves: z.array(DSPCurve).max(4).optional(),
    deliverInFullConfidence: DSPDeliverInFullConfidence.optional(),
    flightId: z.string(),
    forecastEndDateTime: z.string().datetime({ offset: true }),
    forecastStartDateTime: z.string().datetime({ offset: true }),
    insights: DSPFlightForecastInsights.optional(),
    metrics: z.array(DSPForecastMetric).max(20).optional(),
    replanning: z.array(DSPReplanning).max(100).optional(),
    spend: z.number().optional(),
    totalBudget: DSPMonetaryBudget.optional(),
    warnings: z.array(DSPWarning).max(10).optional(),
  })
  .passthrough();
export const DSPCampaignForecast: z.ZodTypeAny = z
  .object({
    availableForecastFlights: z.array(DSPForecastFlight).max(100).optional(),
    campaignDisplayName: z.string(),
    campaignForecastDescription: DSPCampaignForecastDescription,
    creationDateTime: z.string().datetime({ offset: true }),
    flightForecasts: z.array(DSPFlightForecast).max(5).optional(),
    hasExistingGuidance: z.boolean().optional(),
  })
  .passthrough();
export const DSPCampaignForecastMultiStatusSuccess: z.ZodTypeAny = z
  .object({ campaignForecast: DSPCampaignForecast, index: z.number().int().gte(0).lte(0) })
  .passthrough();
export const DSPCampaignForecastMultiStatusResponse: z.ZodTypeAny = z
  .object({
    error: z.array(ErrorsIndex).max(1),
    success: z.array(DSPCampaignForecastMultiStatusSuccess).max(1),
  })
  .partial()
  .passthrough();
export const DSPSpendDimension: z.ZodTypeAny = z.union([
  z.object({ advertiserAccountId: z.string() }).passthrough(),
  z.object({ campaignId: z.string() }).passthrough(),
  z.object({ dealId: z.string() }).passthrough(),
]);
export const DSPCommitmentSpendIdentifier: z.ZodTypeAny = z
  .object({ commitmentId: z.string(), spendDimension: DSPSpendDimension.optional() })
  .passthrough();
export const DSPRetrieveCommitmentSpendRequest: z.ZodTypeAny = z
  .object({ commitmentIds: z.array(DSPCommitmentSpendIdentifier).min(1).max(1) })
  .partial()
  .passthrough();
export const DSPSpendDimensionType: z.ZodTypeAny = z.enum([
  "ADVERTISER",
  "CAMPAIGN",
  "COMMITMENT",
  "DEAL",
]);
export const DSPCommitmentSpend: z.ZodTypeAny = z
  .object({
    accruedSpendValue: z.number().optional(),
    accruedToDateTime: z.string().datetime({ offset: true }),
    commitmentId: DSPCommitmentSpendIdentifier,
    currencyCode: DSPCurrencyCode,
    projectedSpendValue: z.number().optional(),
    spendAtRiskValue: z.number().optional(),
    spendDimensionType: DSPSpendDimensionType,
  })
  .passthrough();
export const DSPCommitmentSpendMultiStatusSuccess: z.ZodTypeAny = z
  .object({ commitmentSpend: DSPCommitmentSpend, index: z.number().int().gte(0).lte(0) })
  .passthrough();
export const DSPCommitmentSpendMultiStatusResponse: z.ZodTypeAny = z
  .object({
    error: z.array(ErrorsIndex).max(1),
    success: z.array(DSPCommitmentSpendMultiStatusSuccess).max(1),
  })
  .partial()
  .passthrough();
export const DSPRetrieveCommitmentRequest: z.ZodTypeAny = z
  .object({ commitmentIds: z.array(z.string()).min(1).max(1000) })
  .partial()
  .passthrough();
export const DSPCommitmentUpdate: z.ZodTypeAny = z
  .object({
    advertiserIds: z.array(z.string()).max(1000).optional(),
    campaignIds: z.array(z.string()).max(1000).optional(),
    commitmentId: z.string(),
    commitmentName: z.string().optional(),
    committedSpend: z.number().optional(),
    currencyCode: DSPCurrencyCode.optional(),
    dealIds: z.array(z.string()).max(1000).optional(),
    endDateTime: z.string().datetime({ offset: true }).optional(),
    fulfillmentLevel: DSPFulfillmentLevel.optional(),
    spendCalculationMode: DSPSpendCalculationMode.optional(),
    startDateTime: z.string().datetime({ offset: true }).optional(),
  })
  .passthrough();
export const DSPUpdateCommitmentRequest: z.ZodTypeAny = z
  .object({ commitments: z.array(DSPCommitmentUpdate).min(1).max(1000) })
  .partial()
  .passthrough();
