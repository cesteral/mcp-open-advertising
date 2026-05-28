import { makeApi, Zodios, type ZodiosOptions } from "@zodios/core";
import { z } from "zod";

const DSPCurrencyCode = z.enum([
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
const DSPFulfillmentLevel = z.enum(["LEVEL_0", "LEVEL_5"]);
const DSPSpendCalculationMode = z.enum(["ADVERTISER_ACCOUNT", "CAMPAIGN", "MANAGER_ACCOUNT"]);
const DSPCommitment = z
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
const DSPCommitmentSuccessResponse = z
  .object({ commitments: z.array(DSPCommitment).max(1000), nextToken: z.string() })
  .partial()
  .passthrough();
const ErrorCode = z.enum([
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
const BadRequestResponseContent = z.object({ code: ErrorCode, message: z.string() }).passthrough();
const UnauthorizedResponseContent = z
  .object({ code: ErrorCode, message: z.string() })
  .passthrough();
const ForbiddenResponseContent = z.object({ code: ErrorCode, message: z.string() }).passthrough();
const NotFoundResponseContent = z.object({ code: ErrorCode, message: z.string() }).passthrough();
const ContentTooLargeResponseContent = z
  .object({ code: ErrorCode, message: z.string() })
  .passthrough();
const TooManyRequestsResponseContent = z
  .object({ code: ErrorCode, message: z.string() })
  .passthrough();
const InternalServerErrorResponseContent = z
  .object({ code: z.string(), message: z.string() })
  .passthrough();
const BadGatewayResponseContent = z.object({ code: z.string(), message: z.string() }).passthrough();
const ServiceUnavailableErrorResponseContent = z
  .object({ code: z.string(), message: z.string() })
  .passthrough();
const GatewayTimeoutResponseContent = z
  .object({ code: z.string(), message: z.string() })
  .passthrough();
const DSPCommitmentCreate = z
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
const DSPCreateCommitmentRequest = z
  .object({ commitments: z.array(DSPCommitmentCreate).min(1).max(1000) })
  .partial()
  .passthrough();
const Error = z
  .object({ code: ErrorCode, fieldLocation: z.string().optional(), message: z.string() })
  .passthrough();
const ErrorsIndex = z
  .object({ errors: z.array(Error).min(1).max(20), index: z.number().int().gte(0).lte(0) })
  .passthrough();
const DSPCommitmentMultiStatusSuccess = z
  .object({ commitment: DSPCommitment, index: z.number().int().gte(0).lte(999) })
  .passthrough();
const DSPCommitmentMultiStatusResponse = z
  .object({
    error: z.array(ErrorsIndex).max(1000),
    success: z.array(DSPCommitmentMultiStatusSuccess).max(1000),
  })
  .partial()
  .passthrough();
const DSPSelectedForecastMetric = z.enum([
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
const DSPForecastMetricsDescription = z
  .object({
    allMetrics: z.boolean(),
    selectedMetrics: z.array(DSPSelectedForecastMetric).max(20).optional(),
  })
  .passthrough();
const DSPEnabledFeaturesInCampaignForecast = z
  .object({
    campaignSettingsCache: z.boolean(),
    curve: z.boolean(),
    insights: z.boolean(),
    metrics: DSPForecastMetricsDescription,
    replanning: z.boolean(),
  })
  .partial()
  .passthrough();
const DSPAdProduct = z.literal("AMAZON_DSP");
const DSPAdGroupBid = z
  .object({
    baseBid: z.number().optional(),
    currencyCode: DSPCurrencyCode,
    maxAverageBid: z.number().optional(),
  })
  .passthrough();
const DSPBudgetType = z.literal("MONETARY");
const DSPMonetaryBudget = z
  .object({ currencyCode: DSPCurrencyCode, value: z.number() })
  .passthrough();
const DSPMonetaryBudgetValue = z
  .object({ monetaryBudget: DSPMonetaryBudget })
  .partial()
  .passthrough();
const DSPBudgetValue = z.object({ monetaryBudgetValue: DSPMonetaryBudgetValue }).passthrough();
const DSPRecurrence = z.enum(["DAILY", "LIFETIME", "MONTHLY"]);
const DSPBudget = z
  .object({
    budgetType: DSPBudgetType,
    budgetValue: DSPBudgetValue,
    recurrenceTimePeriod: DSPRecurrence,
  })
  .passthrough();
const DSPCreativeRotationType = z.enum(["RANDOM", "WEIGHTED"]);
const DSPFeeType = z.enum([
  "AMAZON_AUDIENCE",
  "AMAZON_DSP",
  "MANAGED_SERVICE_FEE",
  "OMNICHANNEL_METRICS",
  "THIRD_PARTY_APPLIED",
  "THIRD_PARTY_AUDIENCE",
  "THIRD_PARTY_TARGETING",
]);
const DSPFeeValueType = z.enum(["FIXED_CPM", "PERCENTAGE_OF_BUDGET", "PERCENTAGE_OF_SUPPLY_COST"]);
const DSPFeesThirdPartyProvider = z.enum([
  "COM_SCORE",
  "CPM_1",
  "CPM_2",
  "CPM_3",
  "DOUBLE_CLICK_CAMPAIGN_MANAGER",
  "DOUBLE_VERIFY",
  "INTEGRAL_AD_SCIENCE",
]);
const DSPFee = z
  .object({
    addToBudgetSpentAmount: z.boolean().optional(),
    currencyCode: DSPCurrencyCode,
    feeType: DSPFeeType,
    feeValue: z.number(),
    feeValueType: DSPFeeValueType,
    thirdPartyProvider: DSPFeesThirdPartyProvider.optional(),
  })
  .passthrough();
const DSPFrequencyTargetingSetting = z.enum(["HOUSEHOLD", "USER"]);
const DSPTimeUnit = z.enum(["DAYS", "HOURS", "MINUTES"]);
const DSPFrequency = z
  .object({
    eventMaxCount: z.number().int().gte(1).lte(99000),
    frequencyTargetingSetting: DSPFrequencyTargetingSetting,
    timeCount: z.number().int().gte(1).lte(60).optional(),
    timeUnit: DSPTimeUnit.optional(),
  })
  .passthrough();
const DSPInventoryType = z.enum([
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
const DSPMarketplaceAdGroupConfigurations = z.object({}).partial().passthrough();
const DSPMarketplaceScope = z.literal("SINGLE_MARKETPLACE");
const DSPMarketplace = z.enum([
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
const DSPBidStrategy = z.enum([
  "PRIORITIZE_KPI_TARGET",
  "SPEND_BUDGET_IN_FULL",
  "USE_CAMPAIGN_STRATEGY",
]);
const DSPBudgetAllocation = z.enum(["AUTO", "MANUAL"]);
const DSPAdGroupBudgetSettings = z
  .object({ budgetAllocation: DSPBudgetAllocation, dailyMinSpendValue: z.number() })
  .partial()
  .passthrough();
const DSPOptimization = z
  .object({ bidStrategy: DSPBidStrategy, budgetSettings: DSPAdGroupBudgetSettings })
  .partial()
  .passthrough();
const DSPDeliveryProfile = z.enum(["ASAP", "EVEN", "PACE_AHEAD"]);
const DSPPacing = z.object({ deliveryProfile: DSPDeliveryProfile }).partial().passthrough();
const DSPState = z.enum(["ARCHIVED", "ENABLED", "PAUSED"]);
const DSPDeliveryReason = z.enum([
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
const DSPDeliveryStatus = z.enum(["DELIVERING", "LIMITED", "NOT_DELIVERING", "UNAVAILABLE"]);
const DSPStatus = z
  .object({
    deliveryReasons: z.array(DSPDeliveryReason).max(50).optional(),
    deliveryStatus: DSPDeliveryStatus,
  })
  .passthrough();
const DSPTag = z.object({ key: z.string(), value: z.string() }).passthrough();
const DSPViewabilityTier = z.enum([
  "ALL_TIERS",
  "GREATER_THAN_40_PERCENT",
  "GREATER_THAN_50_PERCENT",
  "GREATER_THAN_60_PERCENT",
  "GREATER_THAN_70_PERCENT",
  "LESS_THAN_40_PERCENT",
]);
const DSPAmazonViewability = z
  .object({ includeUnmeasurableImpressions: z.boolean(), viewabilityTier: DSPViewabilityTier })
  .passthrough();
const DSPAutomatedTargetingTactic = z.enum([
  "AWARENESS",
  "CUSTOMER_ACQUISITION",
  "MAXIMIZE_PERFORMANCE",
  "PROSPECTING",
  "REMARKETING",
  "RETENTION",
  "SEARCH",
]);
const DSPDefaultAudienceTargetingMatchType = z.enum(["EXACT", "SIMILAR"]);
const DSPSiteLanguage = z.enum([
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
const DSPTacticsConvertersExclusionType = z.enum(["NO_EXCLUSION", "RECENT_CONVERTERS"]);
const DSPTimeZoneType = z.enum(["ADVERTISER_REGION", "VIEWER"]);
const DSPUserLocationSignal = z.enum(["CURRENT", "MULTIPLE_SIGNALS"]);
const DSPVideoCompletionTier = z.enum([
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
const DSPTargetingSettings = z
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
const DSPForecastAdGroup = z
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
const DSPAutoCreationSettings = z.object({}).partial().passthrough();
const DSPCountryCode = z.enum([
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
const DSPTacticKey = z.object({}).partial().passthrough();
const DSPCampaignFeeType = z.literal("AGENCY");
const DSPCampaignFeeValueType = z.literal("PERCENTAGE_OF_BUDGET");
const DSPCampaignFee = z
  .object({
    feeType: DSPCampaignFeeType,
    feeValue: z.number(),
    feeValueType: DSPCampaignFeeValueType,
  })
  .passthrough();
const DSPFlightBudget = z
  .object({ budgetType: DSPBudgetType, budgetValue: DSPBudgetValue })
  .passthrough();
const DSPCampaignFlight = z
  .object({
    budget: DSPFlightBudget,
    endDateTime: z.string().datetime({ offset: true }),
    flightId: z.string().optional(),
    name: z.string().optional(),
    startDateTime: z.string().datetime({ offset: true }),
  })
  .passthrough();
const DSPIneligibleAutomatedTargetingTactic = z.object({}).partial().passthrough();
const DSPMarketplaceCampaignConfigurations = z.object({}).partial().passthrough();
const DSPBidSettings = z.object({ bidStrategy: DSPBidStrategy }).partial().passthrough();
const DSPRolloverStrategy = z.enum([
  "CUMULATIVE_BUDGET_ROLLOVER",
  "NO_ROLLOVER",
  "PRIOR_BUDGET_ROLLOVER",
]);
const DSPBudgetSettings = z
  .object({
    budgetAllocation: DSPBudgetAllocation,
    flightBudgetRolloverStrategy: DSPRolloverStrategy,
  })
  .partial()
  .passthrough();
const DSPGoal = z.enum(["AWARENESS", "CONSIDERATION", "CONVERSIONS"]);
const DSPKPI = z.enum([
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
const DSPGoalSettings = z
  .object({
    currencyCode: DSPCurrencyCode.optional(),
    goal: DSPGoal,
    kpi: DSPKPI.optional(),
    kpiValue: z.number().optional(),
  })
  .passthrough();
const DSPPrimaryInventoryType = z.enum(["AUDIO", "DISPLAY", "VIDEO_OLV", "VIDEO_STV"]);
const DSPCampaignOptimizations = z
  .object({
    bidSettings: DSPBidSettings,
    budgetSettings: DSPBudgetSettings,
    goalSettings: DSPGoalSettings,
    primaryInventoryTypes: z.array(DSPPrimaryInventoryType).max(10),
  })
  .partial()
  .passthrough();
const DSPForecastCampaign = z
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
const DSPForecastFlight = z
  .object({
    budget: DSPBudget,
    endDateTime: z.string().datetime({ offset: true }),
    flightId: z.string().optional(),
    startDateTime: z.string().datetime({ offset: true }),
  })
  .passthrough();
const DSPTargetBid = z.object({}).partial().passthrough();
const DSPMarketplaceTargetConfigurations = z.object({}).partial().passthrough();
const DSPKeywordMatchType = z.literal("BROAD");
const DSPKeywordTarget = z
  .object({ keyword: z.string(), matchType: DSPKeywordMatchType })
  .passthrough();
const DSPProductMatchType = z.literal("PRODUCT_EXACT");
const DSPProductMarketplaceSetting = z
  .object({ marketplace: DSPMarketplace, productId: z.string() })
  .passthrough();
const DSPProductValue = z
  .object({
    marketplaceSettings: z.array(DSPProductMarketplaceSetting).max(30),
    productId: z.string(),
  })
  .partial()
  .passthrough();
const DSPProductIdType = z.literal("ASIN");
const DSPProductTarget = z
  .object({
    matchType: DSPProductMatchType,
    product: DSPProductValue,
    productIdType: DSPProductIdType,
  })
  .passthrough();
const DSPProductCategoryRefinement = z
  .object({ productCategoryId: z.string() })
  .partial()
  .passthrough();
const DSPProductCategoryRefinementValue = z
  .object({ productCategoryRefinement: DSPProductCategoryRefinement })
  .partial()
  .passthrough();
const DSPProductCategoryTarget = z
  .object({ productCategoryRefinement: DSPProductCategoryRefinementValue })
  .passthrough();
const DSPAcrossGroupOperator = z.enum(["ALL", "ANY"]);
const DSPMarketplaceStringValue = z.object({ defaultValue: z.string() }).partial().passthrough();
const DSPInGroupOperator = z.enum(["ALL", "ANY"]);
const DSPAudienceTarget = z
  .object({
    acrossGroupOperator: DSPAcrossGroupOperator.optional(),
    audienceId: DSPMarketplaceStringValue,
    groupId: z.string().optional(),
    inGroupOperator: DSPInGroupOperator.optional(),
  })
  .passthrough();
const DSPLocationTarget = z.object({ locationId: z.string() }).passthrough();
const DSPDomainListTarget = z.object({ domainListId: z.string() }).passthrough();
const DSPDomainNameTarget = z.object({ domainName: z.string() }).passthrough();
const DSPDomainFileTarget = z
  .object({
    domainFileId: z.string(),
    domainFileKey: z.string(),
    domainFileName: z.string(),
    domainFileUrl: z.string(),
  })
  .partial()
  .passthrough();
const DSPAdvertiserDomainList = z.object({ inheritFromAdvertiser: z.boolean() }).passthrough();
const DSPDomainTargetDetails = z.union([
  z.object({ domainListTarget: DSPDomainListTarget }).passthrough(),
  z.object({ domainNameTarget: DSPDomainNameTarget }).passthrough(),
  z.object({ domainFileTarget: DSPDomainFileTarget }).passthrough(),
  z.object({ advertiserDomainList: DSPAdvertiserDomainList }).passthrough(),
]);
const DSPDomainTargetTypes = z.enum([
  "ADVERTISER_DOMAIN_LIST",
  "DOMAIN_FILE",
  "DOMAIN_LIST",
  "DOMAIN_NAME",
]);
const DSPDomainTarget = z
  .object({ domainTargetDetails: DSPDomainTargetDetails, domainTargetType: DSPDomainTargetTypes })
  .passthrough();
const DSPAppType = z.enum(["MOBILE", "STREAMING_TV"]);
const DSPAppTarget = z.object({ appId: z.string(), appType: DSPAppType }).passthrough();
const DSPDeviceOrientation = z.enum(["LANDSCAPE", "PORTRAIT"]);
const DSPDeviceType = z.enum(["CONNECTED_DEVICE", "CONNECTED_TV", "DESKTOP", "MOBILE"]);
const DSPMobileDevice = z.enum(["ANDROID", "IPAD", "IPHONE", "KINDLE_FIRE", "KINDLE_FIRE_HD"]);
const DSPMobileEnvironment = z.enum(["APP", "WEB"]);
const DSPMobileOs = z.enum(["ANDROID", "IOS"]);
const DSPDeviceTarget = z
  .object({
    deviceOrientation: DSPDeviceOrientation.optional(),
    deviceType: DSPDeviceType,
    mobileDevice: DSPMobileDevice.optional(),
    mobileEnvironment: DSPMobileEnvironment.optional(),
    mobileOs: DSPMobileOs.optional(),
  })
  .passthrough();
const DSPDayOfWeek = z.enum([
  "FRIDAY",
  "MONDAY",
  "SATURDAY",
  "SUNDAY",
  "THURSDAY",
  "TUESDAY",
  "WEDNESDAY",
]);
const DSPTimeOfDay = z
  .object({
    endTime: z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]Z$/),
    startTime: z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]Z$/),
  })
  .passthrough();
const DSPDayPartTarget = z
  .object({ dayOfWeek: DSPDayOfWeek, timeOfDay: DSPTimeOfDay })
  .passthrough();
const DSPContentCategoryTarget = z.object({ contentCategoryId: z.string() }).passthrough();
const DSPContentGenre = z.enum([
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
const DSPContentGenreTarget = z.object({ contentGenre: DSPContentGenre }).passthrough();
const DSPContentRatingTypes = z.enum(["DSP_CONTENT_RATING", "TWITCH_CONTENT_RATING"]);
const DSPDspContentRatingEnum = z.enum([
  "RATING_NOT_AVAILABLE",
  "SUITABLE_FOR_ADULTS",
  "SUITABLE_FOR_ALL_AUDIENCES",
  "SUITABLE_FOR_MATURE_AUDIENCES",
  "SUITABLE_FOR_MOST_AUDIENCES_WITH_PARENTAL_GUIDANCE",
  "SUITABLE_FOR_TEEN_AND_OLDER_AUDIENCES",
]);
const DSPDspContentRating = z.object({ dspContentRating: DSPDspContentRatingEnum }).passthrough();
const DSPTwitchContentRatingEnum = z.enum(["TWITCH_MODERATE", "TWITCH_RESTRICTIVE"]);
const DSPTwitchContentRating = z
  .object({ twitchContentRating: DSPTwitchContentRatingEnum })
  .passthrough();
const DSPContentRating = z.union([
  z.object({ dspContentRating: DSPDspContentRating }).passthrough(),
  z.object({ twitchContentRating: DSPTwitchContentRating }).passthrough(),
]);
const DSPContentRatingTarget = z
  .object({ contentRatingType: DSPContentRatingTypes, contentRatingTypeDetails: DSPContentRating })
  .passthrough();
const DSPBrandSafetyTier = z.enum(["EXPANDED", "RESTRICTIVE", "STANDARD"]);
const DSPBrandSafetyTierTarget = z.object({ brandSafetyTier: DSPBrandSafetyTier }).passthrough();
const DSPBrandSafetyCategory = z.enum([
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
const DSPBrandSafetyCategoryTarget = z
  .object({ brandSafetyCategory: DSPBrandSafetyCategory })
  .passthrough();
const DSPInventorySourceType = z.enum([
  "AMAZON",
  "APD",
  "DEAL",
  "INVENTORY_GROUP",
  "THIRD_PARTY_EXCHANGE",
]);
const DSPInventorySourceTarget = z
  .object({
    inventorySourceId: DSPMarketplaceStringValue,
    inventorySourceType: DSPInventorySourceType,
  })
  .passthrough();
const DSPVideoInitiationType = z.enum(["AUTOPLAY", "UNKNOWN", "USER_INITIATED"]);
const DSPAdInitiationTarget = z
  .object({ videoInitiationType: DSPVideoInitiationType })
  .passthrough();
const DSPAdPlayerSize = z.enum(["LARGE", "MEDIUM", "SMALL", "UNKNOWN"]);
const DSPAdPlayerSizeTarget = z.object({ adPlayerSize: DSPAdPlayerSize }).passthrough();
const DSPVideoAdFormat = z.enum(["FULL_EPISODE_PLAYER", "INSTREAM", "OUTSTREAM"]);
const DSPVideoAdFormatTarget = z.object({ videoAdFormat: DSPVideoAdFormat }).passthrough();
const DSPExcludeAppsAndSitesType = z.enum([
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
const DSPDoubleVerifyFraudInvalidTraffic = z
  .object({
    blockAppAndSites: z.boolean(),
    excludeAppsAndSites: DSPExcludeAppsAndSitesType,
    excludeImpressions: z.boolean(),
  })
  .partial()
  .passthrough();
const DSPDVBrandSafetyContentCategoryType = z.enum([
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
const DSPBrandSuitabilityRiskLevelType = z.enum([
  "ALLOW_ALL",
  "HIGH",
  "HIGH_MEDIUM",
  "HIGH_MEDIUM_LOW",
]);
const DSPDVBrandSafetyContentCategoriesWithRiskMap = z
  .object({ key: z.string(), value: DSPBrandSuitabilityRiskLevelType })
  .passthrough();
const DSPDoubleVerifyStandardDisplayBrandSafety = z
  .object({
    contentCategories: z.array(DSPDVBrandSafetyContentCategoryType).max(50),
    contentCategoriesWithRisk: z.array(DSPDVBrandSafetyContentCategoriesWithRiskMap).max(50),
    unknownContent: z.boolean(),
  })
  .partial()
  .passthrough();
const DSPDVBrandSafetyAppAgeRatingType = z.enum([
  "ADULTS_ONLY_18_PLUS",
  "EVERYONE_4_PLUS",
  "MATURE_17_PLUS",
  "TEENS_12_PLUS",
  "TWEENS_9_PLUS",
  "UNKNOWN",
]);
const DSPDVBrandSafetyAppStarRatingType = z.enum([
  "ALLOW_ALL",
  "APP_STAR_RATING_LT_1_POINT_5_STARS",
  "APP_STAR_RATING_LT_2_POINT_5_STARS",
  "APP_STAR_RATING_LT_2_STARS",
  "APP_STAR_RATING_LT_3_POINT_5_STARS",
  "APP_STAR_RATING_LT_3_STARS",
  "APP_STAR_RATING_LT_4_POINT_5_STARS",
  "APP_STAR_RATING_LT_4_STARS",
]);
const DSPDoubleVerifyBrandSafety = z
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
const DSPAverageCompletionAndFullyViewableRateTargetingType = z.enum([
  "ALLOW_ALL",
  "AVG_COMPLETION_FULLY_VIEWABLE_GTE_10",
  "AVG_COMPLETION_FULLY_VIEWABLE_GTE_20",
  "AVG_COMPLETION_FULLY_VIEWABLE_GTE_25",
  "AVG_COMPLETION_FULLY_VIEWABLE_GTE_30",
  "AVG_COMPLETION_FULLY_VIEWABLE_GTE_35",
  "AVG_COMPLETION_FULLY_VIEWABLE_GTE_40",
]);
const DSPBrandExposureViewabilityTargetingType = z.enum([
  "ALLOW_ALL",
  "BRAND_EXPOSURE_VIEWABILITY_GTE_10_SEC_AVG_DURATION",
  "BRAND_EXPOSURE_VIEWABILITY_GTE_15_SEC_AVG_DURATION",
  "BRAND_EXPOSURE_VIEWABILITY_GTE_5_SEC_AVG_DURATION",
]);
const DSPMrcViewabilityTargetingType = z.enum([
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
const DSPDoubleVerifyViewability = z
  .object({
    averageCompletionAndFullyViewableRateTargeting:
      DSPAverageCompletionAndFullyViewableRateTargetingType,
    brandExposureViewabilityTargeting: DSPBrandExposureViewabilityTargetingType,
    includeUnmeasurableImpressions: z.boolean(),
    mrcViewabilityTargeting: DSPMrcViewabilityTargetingType,
  })
  .partial()
  .passthrough();
const DSPDoubleVerifyAuthenticBrandSafety = z
  .object({ doubleVerifySegmentId: z.string().regex(/^51[0-9]{6}$/) })
  .partial()
  .passthrough();
const DSPDoubleVerifyCustomContextualSegmentId = z
  .object({ doubleVerifySegmentId: z.string().regex(/^52[0-9]{6}$/) })
  .partial()
  .passthrough();
const DSPDoubleVerifyAuthenticAttention = z
  .object({ universalAttention: z.boolean() })
  .passthrough();
const DSPIASFraudInvalidTrafficType = z.enum([
  "ALLOW_ALL",
  "FRAUD_INVALID_TRAFFIC_EXCLUDE_HIGH_MODERATE_RISK",
  "FRAUD_INVALID_TRAFFIC_EXCLUDE_HIGH_RISK",
]);
const DSPIntegralAdScienceFraudInvalidTraffic = z
  .object({ targetSetting: DSPIASFraudInvalidTrafficType })
  .partial()
  .passthrough();
const DSPIASBrandSafetyLevelType = z.enum([
  "ALLOW_ALL",
  "BRAND_SAFETY_EXCLUDE_HIGH_AND_MODERATE_RISK",
  "BRAND_SAFETY_EXCLUDE_HIGH_RISK",
]);
const DSPIntegralAdScienceBrandSafety = z
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
const DSPIASViewabilityStandardType = z.enum(["GROUPM", "MRC", "NONE", "PUBLICIS"]);
const DSPViewabilityTierType = z.enum([
  "ALLOW_ALL",
  "VIEWABILITY_TIER_GT_40",
  "VIEWABILITY_TIER_GT_50",
  "VIEWABILITY_TIER_GT_60",
  "VIEWABILITY_TIER_GT_70",
  "VIEWABILITY_TIER_LT_40",
]);
const DSPIntegralAdScienceViewability = z
  .object({
    standard: DSPIASViewabilityStandardType,
    viewabilityTargeting: DSPViewabilityTierType.optional(),
  })
  .passthrough();
const DSPIntegralAdScienceContextualTargeting = z
  .object({
    topicalSegments: z.array(z.string()).max(200),
    verticalSegments: z.array(z.string()).max(200),
  })
  .partial()
  .passthrough();
const DSPIntegralAdScienceContextualAvoidance = z
  .object({ avoidanceSegments: z.array(z.string()).max(200) })
  .partial()
  .passthrough();
const DSPPixalateFraudInvalidTraffic = z
  .object({
    excludeAppsAndDomains: z.boolean(),
    excludeIpAddressAndUserAgents: z.boolean(),
    excludeOttAndMobileDevices: z.boolean(),
    excludeRemovedAppsFromAppStores: z.boolean(),
  })
  .partial()
  .passthrough();
const DSPIntegralAdScienceQualitySync = z
  .object({ segmentId: z.string().regex(/^4[0-9]{6}$/) })
  .partial()
  .passthrough();
const DSPNewsGuardBrandGuardTrustedNewsTargetingType = z.enum([
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
const DSPNewsGuardBrandGuardTrustedNewsTargeting = z
  .object({ targetingList: z.array(DSPNewsGuardBrandGuardTrustedNewsTargetingType).max(15) })
  .partial()
  .passthrough();
const DSPNewsGuardBrandGuardMisinformationSafetyType = z.enum([
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
const DSPNewsGuardBrandGuardMisinformationSafety = z
  .object({ avoidanceList: z.array(DSPNewsGuardBrandGuardMisinformationSafetyType).max(20) })
  .partial()
  .passthrough();
const DSPThirdPartyTargetDetails = z.union([
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
const DSPThirdPartyTargetType = z.enum([
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
const DSPThirdPartyTarget = z
  .object({
    thirdPartyTargetDetails: DSPThirdPartyTargetDetails,
    thirdPartyTargetType: DSPThirdPartyTargetType,
  })
  .passthrough();
const DSPThemeMatchType = z.literal("PRODUCTS_SIMILAR_TO_ADVERTISED_PRODUCTS");
const DSPThemeTarget = z.object({ matchType: DSPThemeMatchType }).passthrough();
const DSPContentInstreamPosition = z.enum(["MID_ROLL", "POST_ROLL", "PRE_ROLL", "UNKNOWN"]);
const DSPContentInstreamPositionTarget = z
  .object({ instreamPosition: DSPContentInstreamPosition })
  .passthrough();
const DSPContentOutstreamPosition = z.enum([
  "ACCOMPANYING_CONTENT",
  "INTERSTITIAL",
  "STANDALONE",
  "UNKNOWN",
]);
const DSPContentOutstreamPositionTarget = z
  .object({ outstreamPosition: DSPContentOutstreamPosition })
  .passthrough();
const DSPVideoContentDuration = z.enum(["EXTENDED", "LONG", "MEDIUM", "SHORT", "UNKNOWN"]);
const DSPVideoContentDurationTarget = z.object({ duration: DSPVideoContentDuration }).passthrough();
const DSPFoldPosition = z.enum(["ABOVE_THE_FOLD", "BELOW_THE_FOLD", "UNKNOWN"]);
const DSPFoldPositionTarget = z.object({ foldPosition: DSPFoldPosition }).passthrough();
const DSPNativeContentPosition = z.enum([
  "IN_ARTICLE",
  "IN_FEED",
  "PERIPHERAL",
  "RECOMMENDATION",
  "UNKNOWN",
]);
const DSPNativeContentPositionTarget = z
  .object({ nativePosition: DSPNativeContentPosition })
  .passthrough();
const DSPPlacementType = z.literal("REWARDED");
const DSPPlacementTypeTarget = z.object({ placementType: DSPPlacementType }).passthrough();
const DSPTargetDetails = z.union([
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
const DSPTargetLevel = z.literal("AD_GROUP");
const DSPTargetType = z.enum([
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
const DSPForecastTarget = z
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
const DSPReplanningSettings = z
  .object({
    adGroups: z.array(DSPForecastAdGroup).max(10),
    campaign: DSPForecastCampaign,
    flights: z.array(DSPForecastFlight).max(5),
    targets: z.array(DSPForecastTarget).max(50),
  })
  .partial()
  .passthrough();
const DSPCampaignForecastDescription = z
  .object({
    campaignId: z.string(),
    enabledFeatures: DSPEnabledFeaturesInCampaignForecast.optional(),
    flightIds: z.array(z.string()).max(5).optional(),
    replanningSettings: DSPReplanningSettings.optional(),
  })
  .passthrough();
const DSPRetrieveCampaignForecastRequest = z
  .object({ campaignForecastDescriptions: z.array(DSPCampaignForecastDescription).min(1).max(1) })
  .partial()
  .passthrough();
const DSPPointLabel = z.enum([
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
const DSPXPoint = z.object({ label: DSPPointLabel, value: z.number() }).passthrough();
const DSPForecastValue = z
  .object({ high: z.number(), low: z.number(), mean: z.number() })
  .passthrough();
const DSPYPoint = z.object({ label: DSPPointLabel, value: DSPForecastValue }).passthrough();
const DSPPoint = z
  .object({
    pointType: z.string().optional(),
    x: DSPXPoint,
    y: z.array(DSPYPoint).max(1000).optional(),
  })
  .passthrough();
const DSPForecastPeriodicity = z.enum(["DAILY", "LIFETIME", "MONTHLY", "WEEKLY"]);
const DSPCurve = z
  .object({
    focusPoint: z.array(DSPPoint).max(10),
    periodicity: DSPForecastPeriodicity,
    points: z.array(DSPPoint).max(1000),
  })
  .partial()
  .passthrough();
const DSPDeliverInFullConfidenceLevel = z.enum(["HIGH", "LOW", "MEDIUM", "UNAVAILABLE"]);
const DSPDeliverInFullConfidence = z
  .object({ value: DSPDeliverInFullConfidenceLevel })
  .passthrough();
const DSPRecommendedObjectType = z.enum(["ADGROUP", "CAMPAIGN"]);
const DSPInsightFeature = z.enum([
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
const DSPForecastInsightsGroup = z
  .object({
    coldStartDealNames: z.array(z.string()).max(99).optional(),
    coldStartSegmentNames: z.array(z.string()).max(99).optional(),
    displayName: z.string(),
    groupType: DSPRecommendedObjectType,
    insightsFeatures: z.array(DSPInsightFeature).min(1).max(9),
    tag: z.string(),
  })
  .passthrough();
const DSPFlightForecastInsights = z
  .object({
    forecastExplainabilityInsights: z.array(DSPForecastInsightsGroup).max(49),
    topExplainabilityFactors: z.array(DSPInsightFeature).max(4),
  })
  .partial()
  .passthrough();
const DSPForecastMetric = z
  .object({
    metric: DSPSelectedForecastMetric,
    periodicity: DSPForecastPeriodicity.optional(),
    value: DSPForecastValue,
  })
  .passthrough();
const DSPReplanning = z
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
const DSPWarning = z
  .object({
    adGroupIds: z.array(z.string()).max(50).optional(),
    code: z.string(),
    message: z.string(),
    messageParameters: z.array(z.string()).max(50).optional(),
    warningLevel: z.number().int().optional(),
  })
  .passthrough();
const DSPFlightForecast = z
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
const DSPCampaignForecast = z
  .object({
    availableForecastFlights: z.array(DSPForecastFlight).max(100).optional(),
    campaignDisplayName: z.string(),
    campaignForecastDescription: DSPCampaignForecastDescription,
    creationDateTime: z.string().datetime({ offset: true }),
    flightForecasts: z.array(DSPFlightForecast).max(5).optional(),
    hasExistingGuidance: z.boolean().optional(),
  })
  .passthrough();
const DSPCampaignForecastMultiStatusSuccess = z
  .object({ campaignForecast: DSPCampaignForecast, index: z.number().int().gte(0).lte(0) })
  .passthrough();
const DSPCampaignForecastMultiStatusResponse = z
  .object({
    error: z.array(ErrorsIndex).max(1),
    success: z.array(DSPCampaignForecastMultiStatusSuccess).max(1),
  })
  .partial()
  .passthrough();
const DSPSpendDimension = z.union([
  z.object({ advertiserAccountId: z.string() }).passthrough(),
  z.object({ campaignId: z.string() }).passthrough(),
  z.object({ dealId: z.string() }).passthrough(),
]);
const DSPCommitmentSpendIdentifier = z
  .object({ commitmentId: z.string(), spendDimension: DSPSpendDimension.optional() })
  .passthrough();
const DSPRetrieveCommitmentSpendRequest = z
  .object({ commitmentIds: z.array(DSPCommitmentSpendIdentifier).min(1).max(1) })
  .partial()
  .passthrough();
const DSPSpendDimensionType = z.enum(["ADVERTISER", "CAMPAIGN", "COMMITMENT", "DEAL"]);
const DSPCommitmentSpend = z
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
const DSPCommitmentSpendMultiStatusSuccess = z
  .object({ commitmentSpend: DSPCommitmentSpend, index: z.number().int().gte(0).lte(0) })
  .passthrough();
const DSPCommitmentSpendMultiStatusResponse = z
  .object({
    error: z.array(ErrorsIndex).max(1),
    success: z.array(DSPCommitmentSpendMultiStatusSuccess).max(1),
  })
  .partial()
  .passthrough();
const DSPRetrieveCommitmentRequest = z
  .object({ commitmentIds: z.array(z.string()).min(1).max(1000) })
  .partial()
  .passthrough();
const DSPCommitmentUpdate = z
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
const DSPUpdateCommitmentRequest = z
  .object({ commitments: z.array(DSPCommitmentUpdate).min(1).max(1000) })
  .partial()
  .passthrough();

export const schemas = {
  DSPCurrencyCode,
  DSPFulfillmentLevel,
  DSPSpendCalculationMode,
  DSPCommitment,
  DSPCommitmentSuccessResponse,
  ErrorCode,
  BadRequestResponseContent,
  UnauthorizedResponseContent,
  ForbiddenResponseContent,
  NotFoundResponseContent,
  ContentTooLargeResponseContent,
  TooManyRequestsResponseContent,
  InternalServerErrorResponseContent,
  BadGatewayResponseContent,
  ServiceUnavailableErrorResponseContent,
  GatewayTimeoutResponseContent,
  DSPCommitmentCreate,
  DSPCreateCommitmentRequest,
  Error,
  ErrorsIndex,
  DSPCommitmentMultiStatusSuccess,
  DSPCommitmentMultiStatusResponse,
  DSPSelectedForecastMetric,
  DSPForecastMetricsDescription,
  DSPEnabledFeaturesInCampaignForecast,
  DSPAdProduct,
  DSPAdGroupBid,
  DSPBudgetType,
  DSPMonetaryBudget,
  DSPMonetaryBudgetValue,
  DSPBudgetValue,
  DSPRecurrence,
  DSPBudget,
  DSPCreativeRotationType,
  DSPFeeType,
  DSPFeeValueType,
  DSPFeesThirdPartyProvider,
  DSPFee,
  DSPFrequencyTargetingSetting,
  DSPTimeUnit,
  DSPFrequency,
  DSPInventoryType,
  DSPMarketplaceAdGroupConfigurations,
  DSPMarketplaceScope,
  DSPMarketplace,
  DSPBidStrategy,
  DSPBudgetAllocation,
  DSPAdGroupBudgetSettings,
  DSPOptimization,
  DSPDeliveryProfile,
  DSPPacing,
  DSPState,
  DSPDeliveryReason,
  DSPDeliveryStatus,
  DSPStatus,
  DSPTag,
  DSPViewabilityTier,
  DSPAmazonViewability,
  DSPAutomatedTargetingTactic,
  DSPDefaultAudienceTargetingMatchType,
  DSPSiteLanguage,
  DSPTacticsConvertersExclusionType,
  DSPTimeZoneType,
  DSPUserLocationSignal,
  DSPVideoCompletionTier,
  DSPTargetingSettings,
  DSPForecastAdGroup,
  DSPAutoCreationSettings,
  DSPCountryCode,
  DSPTacticKey,
  DSPCampaignFeeType,
  DSPCampaignFeeValueType,
  DSPCampaignFee,
  DSPFlightBudget,
  DSPCampaignFlight,
  DSPIneligibleAutomatedTargetingTactic,
  DSPMarketplaceCampaignConfigurations,
  DSPBidSettings,
  DSPRolloverStrategy,
  DSPBudgetSettings,
  DSPGoal,
  DSPKPI,
  DSPGoalSettings,
  DSPPrimaryInventoryType,
  DSPCampaignOptimizations,
  DSPForecastCampaign,
  DSPForecastFlight,
  DSPTargetBid,
  DSPMarketplaceTargetConfigurations,
  DSPKeywordMatchType,
  DSPKeywordTarget,
  DSPProductMatchType,
  DSPProductMarketplaceSetting,
  DSPProductValue,
  DSPProductIdType,
  DSPProductTarget,
  DSPProductCategoryRefinement,
  DSPProductCategoryRefinementValue,
  DSPProductCategoryTarget,
  DSPAcrossGroupOperator,
  DSPMarketplaceStringValue,
  DSPInGroupOperator,
  DSPAudienceTarget,
  DSPLocationTarget,
  DSPDomainListTarget,
  DSPDomainNameTarget,
  DSPDomainFileTarget,
  DSPAdvertiserDomainList,
  DSPDomainTargetDetails,
  DSPDomainTargetTypes,
  DSPDomainTarget,
  DSPAppType,
  DSPAppTarget,
  DSPDeviceOrientation,
  DSPDeviceType,
  DSPMobileDevice,
  DSPMobileEnvironment,
  DSPMobileOs,
  DSPDeviceTarget,
  DSPDayOfWeek,
  DSPTimeOfDay,
  DSPDayPartTarget,
  DSPContentCategoryTarget,
  DSPContentGenre,
  DSPContentGenreTarget,
  DSPContentRatingTypes,
  DSPDspContentRatingEnum,
  DSPDspContentRating,
  DSPTwitchContentRatingEnum,
  DSPTwitchContentRating,
  DSPContentRating,
  DSPContentRatingTarget,
  DSPBrandSafetyTier,
  DSPBrandSafetyTierTarget,
  DSPBrandSafetyCategory,
  DSPBrandSafetyCategoryTarget,
  DSPInventorySourceType,
  DSPInventorySourceTarget,
  DSPVideoInitiationType,
  DSPAdInitiationTarget,
  DSPAdPlayerSize,
  DSPAdPlayerSizeTarget,
  DSPVideoAdFormat,
  DSPVideoAdFormatTarget,
  DSPExcludeAppsAndSitesType,
  DSPDoubleVerifyFraudInvalidTraffic,
  DSPDVBrandSafetyContentCategoryType,
  DSPBrandSuitabilityRiskLevelType,
  DSPDVBrandSafetyContentCategoriesWithRiskMap,
  DSPDoubleVerifyStandardDisplayBrandSafety,
  DSPDVBrandSafetyAppAgeRatingType,
  DSPDVBrandSafetyAppStarRatingType,
  DSPDoubleVerifyBrandSafety,
  DSPAverageCompletionAndFullyViewableRateTargetingType,
  DSPBrandExposureViewabilityTargetingType,
  DSPMrcViewabilityTargetingType,
  DSPDoubleVerifyViewability,
  DSPDoubleVerifyAuthenticBrandSafety,
  DSPDoubleVerifyCustomContextualSegmentId,
  DSPDoubleVerifyAuthenticAttention,
  DSPIASFraudInvalidTrafficType,
  DSPIntegralAdScienceFraudInvalidTraffic,
  DSPIASBrandSafetyLevelType,
  DSPIntegralAdScienceBrandSafety,
  DSPIASViewabilityStandardType,
  DSPViewabilityTierType,
  DSPIntegralAdScienceViewability,
  DSPIntegralAdScienceContextualTargeting,
  DSPIntegralAdScienceContextualAvoidance,
  DSPPixalateFraudInvalidTraffic,
  DSPIntegralAdScienceQualitySync,
  DSPNewsGuardBrandGuardTrustedNewsTargetingType,
  DSPNewsGuardBrandGuardTrustedNewsTargeting,
  DSPNewsGuardBrandGuardMisinformationSafetyType,
  DSPNewsGuardBrandGuardMisinformationSafety,
  DSPThirdPartyTargetDetails,
  DSPThirdPartyTargetType,
  DSPThirdPartyTarget,
  DSPThemeMatchType,
  DSPThemeTarget,
  DSPContentInstreamPosition,
  DSPContentInstreamPositionTarget,
  DSPContentOutstreamPosition,
  DSPContentOutstreamPositionTarget,
  DSPVideoContentDuration,
  DSPVideoContentDurationTarget,
  DSPFoldPosition,
  DSPFoldPositionTarget,
  DSPNativeContentPosition,
  DSPNativeContentPositionTarget,
  DSPPlacementType,
  DSPPlacementTypeTarget,
  DSPTargetDetails,
  DSPTargetLevel,
  DSPTargetType,
  DSPForecastTarget,
  DSPReplanningSettings,
  DSPCampaignForecastDescription,
  DSPRetrieveCampaignForecastRequest,
  DSPPointLabel,
  DSPXPoint,
  DSPForecastValue,
  DSPYPoint,
  DSPPoint,
  DSPForecastPeriodicity,
  DSPCurve,
  DSPDeliverInFullConfidenceLevel,
  DSPDeliverInFullConfidence,
  DSPRecommendedObjectType,
  DSPInsightFeature,
  DSPForecastInsightsGroup,
  DSPFlightForecastInsights,
  DSPForecastMetric,
  DSPReplanning,
  DSPWarning,
  DSPFlightForecast,
  DSPCampaignForecast,
  DSPCampaignForecastMultiStatusSuccess,
  DSPCampaignForecastMultiStatusResponse,
  DSPSpendDimension,
  DSPCommitmentSpendIdentifier,
  DSPRetrieveCommitmentSpendRequest,
  DSPSpendDimensionType,
  DSPCommitmentSpend,
  DSPCommitmentSpendMultiStatusSuccess,
  DSPCommitmentSpendMultiStatusResponse,
  DSPRetrieveCommitmentRequest,
  DSPCommitmentUpdate,
  DSPUpdateCommitmentRequest,
};

const endpoints = makeApi([
  {
    method: "get",
    path: "/adsApi/v1/commitments/dsp",
    alias: "DSPListCommitment",
    description: `List commitments

**Requires one of these permissions**:
[]`,
    requestFormat: "json",
    parameters: [
      {
        name: "nextToken",
        type: "Query",
        schema: z.string().optional(),
      },
      {
        name: "maxResults",
        type: "Query",
        schema: z.number().int().gte(11).lte(50).optional().default(50),
      },
      {
        name: "Amazon-Ads-ClientId",
        type: "Header",
        schema: z.string(),
      },
    ],
    response: DSPCommitmentSuccessResponse,
    errors: [
      {
        status: 400,
        description: `BadRequest 400 response`,
        schema: BadRequestResponseContent,
      },
      {
        status: 401,
        description: `Unauthorized 401 response`,
        schema: UnauthorizedResponseContent,
      },
      {
        status: 403,
        description: `Forbidden 403 response`,
        schema: ForbiddenResponseContent,
      },
      {
        status: 404,
        description: `NotFound 404 response`,
        schema: NotFoundResponseContent,
      },
      {
        status: 413,
        description: `ContentTooLarge 413 response`,
        schema: ContentTooLargeResponseContent,
      },
      {
        status: 429,
        description: `TooManyRequests 429 response`,
        schema: TooManyRequestsResponseContent,
      },
      {
        status: 500,
        description: `InternalServerError 500 response`,
        schema: InternalServerErrorResponseContent,
      },
      {
        status: 502,
        description: `BadGateway 502 response`,
        schema: BadGatewayResponseContent,
      },
      {
        status: 503,
        description: `ServiceUnavailableError 503 response`,
        schema: ServiceUnavailableErrorResponseContent,
      },
      {
        status: 504,
        description: `GatewayTimeout 504 response`,
        schema: GatewayTimeoutResponseContent,
      },
    ],
  },
  {
    method: "post",
    path: "/adsApi/v1/create/commitments/dsp",
    alias: "DSPCreateCommitment",
    description: `Create commitments

**Requires one of these permissions**:
[]`,
    requestFormat: "json",
    parameters: [
      {
        name: "body",
        type: "Body",
        schema: DSPCreateCommitmentRequest,
      },
      {
        name: "Amazon-Ads-ClientId",
        type: "Header",
        schema: z.string(),
      },
    ],
    response: DSPCommitmentMultiStatusResponse,
    errors: [
      {
        status: 400,
        description: `BadRequest 400 response`,
        schema: BadRequestResponseContent,
      },
      {
        status: 401,
        description: `Unauthorized 401 response`,
        schema: UnauthorizedResponseContent,
      },
      {
        status: 403,
        description: `Forbidden 403 response`,
        schema: ForbiddenResponseContent,
      },
      {
        status: 404,
        description: `NotFound 404 response`,
        schema: NotFoundResponseContent,
      },
      {
        status: 413,
        description: `ContentTooLarge 413 response`,
        schema: ContentTooLargeResponseContent,
      },
      {
        status: 429,
        description: `TooManyRequests 429 response`,
        schema: TooManyRequestsResponseContent,
      },
      {
        status: 500,
        description: `InternalServerError 500 response`,
        schema: InternalServerErrorResponseContent,
      },
      {
        status: 502,
        description: `BadGateway 502 response`,
        schema: BadGatewayResponseContent,
      },
      {
        status: 503,
        description: `ServiceUnavailableError 503 response`,
        schema: ServiceUnavailableErrorResponseContent,
      },
      {
        status: 504,
        description: `GatewayTimeout 504 response`,
        schema: GatewayTimeoutResponseContent,
      },
    ],
  },
  {
    method: "post",
    path: "/adsApi/v1/retrieve/campaignForecasts/dsp",
    alias: "DSPRetrieveCampaignForecast",
    description: `Retrieve campaign forecast

**Requires one of these permissions**:
[&quot;campaign_view&quot;, &quot;advertiser_campaign_view&quot;]`,
    requestFormat: "json",
    parameters: [
      {
        name: "body",
        type: "Body",
        schema: DSPRetrieveCampaignForecastRequest,
      },
      {
        name: "Amazon-Ads-AccountId",
        type: "Header",
        schema: z.string(),
      },
      {
        name: "Amazon-Ads-ClientId",
        type: "Header",
        schema: z.string(),
      },
    ],
    response: DSPCampaignForecastMultiStatusResponse,
    errors: [
      {
        status: 400,
        description: `BadRequest 400 response`,
        schema: BadRequestResponseContent,
      },
      {
        status: 401,
        description: `Unauthorized 401 response`,
        schema: UnauthorizedResponseContent,
      },
      {
        status: 403,
        description: `Forbidden 403 response`,
        schema: ForbiddenResponseContent,
      },
      {
        status: 404,
        description: `NotFound 404 response`,
        schema: NotFoundResponseContent,
      },
      {
        status: 413,
        description: `ContentTooLarge 413 response`,
        schema: ContentTooLargeResponseContent,
      },
      {
        status: 429,
        description: `TooManyRequests 429 response`,
        schema: TooManyRequestsResponseContent,
      },
      {
        status: 500,
        description: `InternalServerError 500 response`,
        schema: InternalServerErrorResponseContent,
      },
      {
        status: 502,
        description: `BadGateway 502 response`,
        schema: BadGatewayResponseContent,
      },
      {
        status: 503,
        description: `ServiceUnavailableError 503 response`,
        schema: ServiceUnavailableErrorResponseContent,
      },
      {
        status: 504,
        description: `GatewayTimeout 504 response`,
        schema: GatewayTimeoutResponseContent,
      },
    ],
  },
  {
    method: "post",
    path: "/adsApi/v1/retrieve/commitments/dsp",
    alias: "DSPRetrieveCommitment",
    description: `Get Commitments

**Requires one of these permissions**:
[]`,
    requestFormat: "json",
    parameters: [
      {
        name: "body",
        type: "Body",
        schema: DSPRetrieveCommitmentRequest,
      },
      {
        name: "Amazon-Ads-ClientId",
        type: "Header",
        schema: z.string(),
      },
    ],
    response: DSPCommitmentMultiStatusResponse,
    errors: [
      {
        status: 400,
        description: `BadRequest 400 response`,
        schema: BadRequestResponseContent,
      },
      {
        status: 401,
        description: `Unauthorized 401 response`,
        schema: UnauthorizedResponseContent,
      },
      {
        status: 403,
        description: `Forbidden 403 response`,
        schema: ForbiddenResponseContent,
      },
      {
        status: 404,
        description: `NotFound 404 response`,
        schema: NotFoundResponseContent,
      },
      {
        status: 413,
        description: `ContentTooLarge 413 response`,
        schema: ContentTooLargeResponseContent,
      },
      {
        status: 429,
        description: `TooManyRequests 429 response`,
        schema: TooManyRequestsResponseContent,
      },
      {
        status: 500,
        description: `InternalServerError 500 response`,
        schema: InternalServerErrorResponseContent,
      },
      {
        status: 502,
        description: `BadGateway 502 response`,
        schema: BadGatewayResponseContent,
      },
      {
        status: 503,
        description: `ServiceUnavailableError 503 response`,
        schema: ServiceUnavailableErrorResponseContent,
      },
      {
        status: 504,
        description: `GatewayTimeout 504 response`,
        schema: GatewayTimeoutResponseContent,
      },
    ],
  },
  {
    method: "post",
    path: "/adsApi/v1/retrieve/commitmentSpends/dsp",
    alias: "DSPRetrieveCommitmentSpend",
    description: `Retrieve commitment spend

**Requires one of these permissions**:
[]`,
    requestFormat: "json",
    parameters: [
      {
        name: "body",
        type: "Body",
        schema: DSPRetrieveCommitmentSpendRequest,
      },
      {
        name: "Amazon-Ads-ClientId",
        type: "Header",
        schema: z.string(),
      },
    ],
    response: DSPCommitmentSpendMultiStatusResponse,
    errors: [
      {
        status: 400,
        description: `BadRequest 400 response`,
        schema: BadRequestResponseContent,
      },
      {
        status: 401,
        description: `Unauthorized 401 response`,
        schema: UnauthorizedResponseContent,
      },
      {
        status: 403,
        description: `Forbidden 403 response`,
        schema: ForbiddenResponseContent,
      },
      {
        status: 404,
        description: `NotFound 404 response`,
        schema: NotFoundResponseContent,
      },
      {
        status: 413,
        description: `ContentTooLarge 413 response`,
        schema: ContentTooLargeResponseContent,
      },
      {
        status: 429,
        description: `TooManyRequests 429 response`,
        schema: TooManyRequestsResponseContent,
      },
      {
        status: 500,
        description: `InternalServerError 500 response`,
        schema: InternalServerErrorResponseContent,
      },
      {
        status: 502,
        description: `BadGateway 502 response`,
        schema: BadGatewayResponseContent,
      },
      {
        status: 503,
        description: `ServiceUnavailableError 503 response`,
        schema: ServiceUnavailableErrorResponseContent,
      },
      {
        status: 504,
        description: `GatewayTimeout 504 response`,
        schema: GatewayTimeoutResponseContent,
      },
    ],
  },
  {
    method: "post",
    path: "/adsApi/v1/update/commitments/dsp",
    alias: "DSPUpdateCommitment",
    description: `Update commitments

**Requires one of these permissions**:
[]`,
    requestFormat: "json",
    parameters: [
      {
        name: "body",
        type: "Body",
        schema: DSPUpdateCommitmentRequest,
      },
      {
        name: "Amazon-Ads-ClientId",
        type: "Header",
        schema: z.string(),
      },
    ],
    response: DSPCommitmentMultiStatusResponse,
    errors: [
      {
        status: 400,
        description: `BadRequest 400 response`,
        schema: BadRequestResponseContent,
      },
      {
        status: 401,
        description: `Unauthorized 401 response`,
        schema: UnauthorizedResponseContent,
      },
      {
        status: 403,
        description: `Forbidden 403 response`,
        schema: ForbiddenResponseContent,
      },
      {
        status: 404,
        description: `NotFound 404 response`,
        schema: NotFoundResponseContent,
      },
      {
        status: 413,
        description: `ContentTooLarge 413 response`,
        schema: ContentTooLargeResponseContent,
      },
      {
        status: 429,
        description: `TooManyRequests 429 response`,
        schema: TooManyRequestsResponseContent,
      },
      {
        status: 500,
        description: `InternalServerError 500 response`,
        schema: InternalServerErrorResponseContent,
      },
      {
        status: 502,
        description: `BadGateway 502 response`,
        schema: BadGatewayResponseContent,
      },
      {
        status: 503,
        description: `ServiceUnavailableError 503 response`,
        schema: ServiceUnavailableErrorResponseContent,
      },
      {
        status: 504,
        description: `GatewayTimeout 504 response`,
        schema: GatewayTimeoutResponseContent,
      },
    ],
  },
]);

export const api = new Zodios(endpoints);

export function createApiClient(baseUrl: string, options?: ZodiosOptions) {
  return new Zodios(baseUrl, endpoints, options);
}
