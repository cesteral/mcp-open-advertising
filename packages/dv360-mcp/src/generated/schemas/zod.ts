/**
 * Auto-generated Zod schemas from OpenAPI specification
 * Generated at: 2025-12-18T14:51:40.257Z
 * DO NOT EDIT MANUALLY
 */

import { z } from 'zod';

/**
 * A single partner in Display & Video 360 (DV360).
 */
export const Partner = z.object({
  /** The display name of the partner. Must be UTF-8 encoded with a maximum size of 24 */
  displayName: z.string().optional(),
  /** Output only. The unique ID of the partner. Assigned by the system. */
  partnerId: z.string().optional(),
  /** Output only. The timestamp when the partner was last updated. Assigned by the sy */
  updateTime: z.string().optional(),
  /** General settings of the partner. */
  generalConfig: z.lazy(() => PartnerGeneralConfig).optional(),
  /** Billing related settings of the partner. */
  billingConfig: z.lazy(() => PartnerBillingConfig).optional(),
  /** Ad server related settings of the partner. */
  adServerConfig: z.lazy(() => PartnerAdServerConfig).optional(),
  /** Settings that control which exchanges are enabled for the partner. */
  exchangeConfig: z.lazy(() => ExchangeConfig).optional(),
  /** Output only. The resource name of the partner. */
  name: z.string().optional(),
  /** Settings that control how partner data may be accessed. */
  dataAccessConfig: z.lazy(() => PartnerDataAccessConfig).optional(),
  /** Output only. The status of the partner. */
  entityStatus: z.enum(["ENTITY_STATUS_UNSPECIFIED", "ENTITY_STATUS_ACTIVE", "ENTITY_STATUS_ARCHIVED", "ENTITY_STATUS_DRAFT", "ENTITY_STATUS_PAUSED", "ENTITY_STATUS_SCHEDULED_FOR_DELETION"]).optional(),
});

/**
 * General settings of a partner.
 */
export const PartnerGeneralConfig = z.object({
  /** Immutable. Partner's currency in ISO 4217 format. */
  currencyCode: z.string().optional(),
  /** Immutable. The standard TZ database name of the partner's time zone. For example */
  timeZone: z.string().optional(),
});

/**
 * Billing related settings of a partner.
 */
export const PartnerBillingConfig = z.object({
  /** The ID of a partner default billing profile. */
  billingProfileId: z.string().optional(),
});

/**
 * Ad server related settings of a partner.
 */
export const PartnerAdServerConfig = z.object({
  /** Measurement settings of a partner. */
  measurementConfig: z.lazy(() => MeasurementConfig).optional(),
});

/**
 * Measurement settings of a partner.
 */
export const MeasurementConfig = z.object({
  /** Whether or not to report DV360 cost to CM360. */
  dv360ToCmCostReportingEnabled: z.boolean().optional(),
  /** Whether or not to include DV360 data in CM360 data transfer reports. */
  dv360ToCmDataSharingEnabled: z.boolean().optional(),
});

/**
 * Settings that control which exchanges are enabled for a partner.
 */
export const ExchangeConfig = z.object({
  /** All enabled exchanges in the partner. Duplicate enabled exchanges will be ignore */
  enabledExchanges: z.array(z.lazy(() => ExchangeConfigEnabledExchange)).optional(),
});

/**
 * An enabled exchange in the partner.
 */
export const ExchangeConfigEnabledExchange = z.object({
  /** Output only. Agency ID of Google Ad Manager. The field is only relevant when Goo */
  googleAdManagerAgencyId: z.string().optional(),
  /** Output only. Network ID of Google Ad Manager. The field is only relevant when Go */
  googleAdManagerBuyerNetworkId: z.string().optional(),
  /** The enabled exchange. */
  exchange: z.enum(["EXCHANGE_UNSPECIFIED", "EXCHANGE_GOOGLE_AD_MANAGER", "EXCHANGE_APPNEXUS", "EXCHANGE_BRIGHTROLL", "EXCHANGE_ADFORM", "EXCHANGE_ADMETA", "EXCHANGE_ADMIXER", "EXCHANGE_ADSMOGO", "EXCHANGE_ADSWIZZ", "EXCHANGE_BIDSWITCH", "EXCHANGE_BRIGHTROLL_DISPLAY", "EXCHANGE_CADREON", "EXCHANGE_DAILYMOTION", "EXCHANGE_FIVE", "EXCHANGE_FLUCT", "EXCHANGE_FREEWHEEL", "EXCHANGE_GENIEE", "EXCHANGE_GUMGUM", "EXCHANGE_IMOBILE", "EXCHANGE_IBILLBOARD", "EXCHANGE_IMPROVE_DIGITAL", "EXCHANGE_INDEX", "EXCHANGE_KARGO", "EXCHANGE_MICROAD", "EXCHANGE_MOPUB", "EXCHANGE_NEND", "EXCHANGE_ONE_BY_AOL_DISPLAY", "EXCHANGE_ONE_BY_AOL_MOBILE", "EXCHANGE_ONE_BY_AOL_VIDEO", "EXCHANGE_OOYALA", "EXCHANGE_OPENX", "EXCHANGE_PERMODO", "EXCHANGE_PLATFORMONE", "EXCHANGE_PLATFORMID", "EXCHANGE_PUBMATIC", "EXCHANGE_PULSEPOINT", "EXCHANGE_REVENUEMAX", "EXCHANGE_RUBICON", "EXCHANGE_SMARTCLIP", "EXCHANGE_SMARTRTB", "EXCHANGE_SMARTSTREAMTV", "EXCHANGE_SOVRN", "EXCHANGE_SPOTXCHANGE", "EXCHANGE_STROER", "EXCHANGE_TEADSTV", "EXCHANGE_TELARIA", "EXCHANGE_TVN", "EXCHANGE_UNITED", "EXCHANGE_YIELDLAB", "EXCHANGE_YIELDMO", "EXCHANGE_UNRULYX", "EXCHANGE_OPEN8", "EXCHANGE_TRITON", "EXCHANGE_TRIPLELIFT", "EXCHANGE_TABOOLA", "EXCHANGE_INMOBI", "EXCHANGE_SMAATO", "EXCHANGE_AJA", "EXCHANGE_SUPERSHIP", "EXCHANGE_NEXSTAR_DIGITAL", "EXCHANGE_WAZE", "EXCHANGE_SOUNDCAST", "EXCHANGE_SHARETHROUGH", "EXCHANGE_FYBER", "EXCHANGE_RED_FOR_PUBLISHERS", "EXCHANGE_MEDIANET", "EXCHANGE_TAPJOY", "EXCHANGE_VISTAR", "EXCHANGE_DAX", "EXCHANGE_JCD", "EXCHANGE_PLACE_EXCHANGE", "EXCHANGE_APPLOVIN", "EXCHANGE_CONNATIX", "EXCHANGE_RESET_DIGITAL", "EXCHANGE_HIVESTACK", "EXCHANGE_DRAX", "EXCHANGE_APPLOVIN_GBID", "EXCHANGE_FYBER_GBID", "EXCHANGE_UNITY_GBID", "EXCHANGE_CHARTBOOST_GBID", "EXCHANGE_ADMOST_GBID", "EXCHANGE_TOPON_GBID", "EXCHANGE_NETFLIX", "EXCHANGE_CORE", "EXCHANGE_COMMERCE_GRID", "EXCHANGE_SPOTIFY", "EXCHANGE_TUBI", "EXCHANGE_SNAP", "EXCHANGE_CADENT"]).optional(),
  /** Output only. Seat ID of the enabled exchange. */
  seatId: z.string().optional(),
});

/**
 * Settings that control how partner related data may be accessed.
 */
export const PartnerDataAccessConfig = z.object({
  /** Structured Data Files (SDF) settings for the partner. The SDF configuration for  */
  sdfConfig: z.lazy(() => SdfConfig).optional(),
});

/**
 * Structured Data File (SDF) related settings.
 */
export const SdfConfig = z.object({
  /** Required. The version of SDF being used. */
  version: z.enum(["SDF_VERSION_UNSPECIFIED", "SDF_VERSION_3_1", "SDF_VERSION_4", "SDF_VERSION_4_1", "SDF_VERSION_4_2", "SDF_VERSION_5", "SDF_VERSION_5_1", "SDF_VERSION_5_2", "SDF_VERSION_5_3", "SDF_VERSION_5_4", "SDF_VERSION_5_5", "SDF_VERSION_6", "SDF_VERSION_7", "SDF_VERSION_7_1", "SDF_VERSION_8", "SDF_VERSION_8_1", "SDF_VERSION_9", "SDF_VERSION_9_1", "SDF_VERSION_9_2"]),
  /** An administrator email address to which the SDF processing status reports will b */
  adminEmail: z.string().optional(),
});

/**
 * A single advertiser in Display & Video 360 (DV360).
 */
export const Advertiser = z.object({
  /** Required. Controls whether or not insertion orders and line items of the adverti */
  entityStatus: z.enum(["ENTITY_STATUS_UNSPECIFIED", "ENTITY_STATUS_ACTIVE", "ENTITY_STATUS_ARCHIVED", "ENTITY_STATUS_DRAFT", "ENTITY_STATUS_PAUSED", "ENTITY_STATUS_SCHEDULED_FOR_DELETION"]),
  /** Required. Immutable. Ad server related settings of the advertiser. */
  adServerConfig: z.lazy(() => AdvertiserAdServerConfig),
  /** Targeting settings related to ad serving of the advertiser. */
  servingConfig: z.lazy(() => AdvertiserTargetingConfig).optional(),
  /** Required. Creative related settings of the advertiser. */
  creativeConfig: z.lazy(() => AdvertiserCreativeConfig),
  /** Whether integration with Mediaocean (Prisma) is enabled. By enabling this, you a */
  prismaEnabled: z.boolean().optional(),
  /** Output only. The resource name of the advertiser. */
  name: z.string().optional(),
  /** Required. General settings of the advertiser. */
  generalConfig: z.lazy(() => AdvertiserGeneralConfig),
  /** Integration details of the advertiser. Only integrationCode is currently applica */
  integrationDetails: z.lazy(() => IntegrationDetails).optional(),
  /** Optional. Whether this advertiser contains line items that serve European Union  */
  containsEuPoliticalAds: z.enum(["EU_POLITICAL_ADVERTISING_STATUS_UNKNOWN", "CONTAINS_EU_POLITICAL_ADVERTISING", "DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING"]).optional(),
  /** Required. Billing related settings of the advertiser. */
  billingConfig: z.lazy(() => AdvertiserBillingConfig),
  /** Required. The display name of the advertiser. Must be UTF-8 encoded with a maxim */
  displayName: z.string(),
  /** Output only. The unique ID of the advertiser. Assigned by the system. */
  advertiserId: z.string().optional(),
  /** Required. Immutable. The unique ID of the partner that the advertiser belongs to */
  partnerId: z.string(),
  /** Output only. The timestamp when the advertiser was last updated. Assigned by the */
  updateTime: z.string().optional(),
  /** Settings that control how advertiser data may be accessed. */
  dataAccessConfig: z.lazy(() => AdvertiserDataAccessConfig).optional(),
});

/**
 * Ad server related settings of an advertiser.
 */
export const AdvertiserAdServerConfig = z.object({
  /** The configuration for advertisers that use third-party ad servers only. */
  thirdPartyOnlyConfig: z.lazy(() => ThirdPartyOnlyConfig).optional(),
  /** The configuration for advertisers that use both Campaign Manager 360 (CM360) and */
  cmHybridConfig: z.lazy(() => CmHybridConfig).optional(),
});

/**
 * Settings for advertisers that use third-party ad servers only.
 */
export const ThirdPartyOnlyConfig = z.object({
  /** Whether or not order ID reporting for pixels is enabled. This value cannot be ch */
  pixelOrderIdReportingEnabled: z.boolean().optional(),
});

/**
 * Settings for advertisers that use both Campaign Manager 360 (CM360) and third-party ad servers.
 */
export const CmHybridConfig = z.object({
  /** Whether or not to include DV360 data in CM360 data transfer reports. */
  dv360ToCmDataSharingEnabled: z.boolean().optional(),
  /** Required. Immutable. ID of the CM360 Floodlight configuration linked with the DV */
  cmFloodlightConfigId: z.string(),
  /** Required. Immutable. Account ID of the CM360 Floodlight configuration linked wit */
  cmAccountId: z.string(),
  /** Whether or not to report DV360 cost to CM360. */
  dv360ToCmCostReportingEnabled: z.boolean().optional(),
  /** Required. Immutable. By setting this field to `true`, you, on behalf of your com */
  cmFloodlightLinkingAuthorized: z.boolean(),
  /** A list of CM360 sites whose placements will be synced to DV360 as creatives. If  */
  cmSyncableSiteIds: z.array(z.string()).optional(),
  /** Output only. The set of CM360 Advertiser IDs sharing the CM360 Floodlight config */
  cmAdvertiserIds: z.array(z.string()).optional(),
});

/**
 * Targeting settings related to ad serving of an advertiser.
 */
export const AdvertiserTargetingConfig = z.object({
  /** Whether or not connected TV devices are exempt from viewability targeting for al */
  exemptTvFromViewabilityTargeting: z.boolean().optional(),
});

/**
 * Creatives related settings of an advertiser.
 */
export const AdvertiserCreativeConfig = z.object({
  /** Whether or not the advertiser is enabled for dynamic creatives. */
  dynamicCreativeEnabled: z.boolean().optional(),
  /** An ID for configuring campaign monitoring provided by Integral Ad Service (IAS). */
  iasClientId: z.string().optional(),
  /** By setting this field to `true`, you, on behalf of your company, authorize Googl */
  videoCreativeDataSharingAuthorized: z.boolean().optional(),
  /** Whether or not to disable Google's About this Ad feature that adds badging (to i */
  obaComplianceDisabled: z.boolean().optional(),
});

/**
 * General settings of an advertiser.
 */
export const AdvertiserGeneralConfig = z.object({
  /** Output only. The standard TZ database name of the advertiser's time zone. For ex */
  timeZone: z.string().optional(),
  /** Required. Immutable. Advertiser's currency in ISO 4217 format. Accepted codes an */
  currencyCode: z.string(),
  /** Required. The domain URL of the advertiser's primary website. The system will se */
  domainUrl: z.string(),
});

/**
 * Integration details of an entry.
 */
export const IntegrationDetails = z.object({
  /** Additional details of the entry in string format. Must be UTF-8 encoded with a l */
  details: z.string().optional(),
  /** An external identifier to be associated with the entry. The integration code wil */
  integrationCode: z.string().optional(),
});

/**
 * Billing related settings of an advertiser.
 */
export const AdvertiserBillingConfig = z.object({
  /** Required. The ID of a billing profile assigned to the advertiser. */
  billingProfileId: z.string(),
});

/**
 * Settings that control how advertiser related data may be accessed.
 */
export const AdvertiserDataAccessConfig = z.object({
  /** Structured Data Files (SDF) settings for the advertiser. If not specified, the S */
  sdfConfig: z.lazy(() => AdvertiserSdfConfig).optional(),
});

/**
 * Structured Data Files (SDF) settings of an advertiser.
 */
export const AdvertiserSdfConfig = z.object({
  /** Whether or not this advertiser overrides the SDF configuration of its parent par */
  overridePartnerSdfConfig: z.boolean().optional(),
  /** The SDF configuration for the advertiser. * Required when overridePartnerSdfConf */
  sdfConfig: z.lazy(() => SdfConfig).optional(),
});

/**
 * A single campaign.
 */
export const Campaign = z.object({
  /** Output only. The unique ID of the campaign. Assigned by the system. */
  campaignId: z.string().optional(),
  /** Output only. The resource name of the campaign. */
  name: z.string().optional(),
  /** Required. The frequency cap setting of the campaign. *Warning*: On **February 28 */
  frequencyCap: z.lazy(() => FrequencyCap),
  /** Required. The display name of the campaign. Must be UTF-8 encoded with a maximum */
  displayName: z.string(),
  /** The list of budgets available to this campaign. If this field is not set, the ca */
  campaignBudgets: z.array(z.lazy(() => CampaignBudget)).optional(),
  /** Output only. The unique ID of the advertiser the campaign belongs to. */
  advertiserId: z.string().optional(),
  /** Required. The planned spend and duration of the campaign. */
  campaignFlight: z.lazy(() => CampaignFlight),
  /** Required. Controls whether or not the insertion orders under this campaign can s */
  entityStatus: z.enum(["ENTITY_STATUS_UNSPECIFIED", "ENTITY_STATUS_ACTIVE", "ENTITY_STATUS_ARCHIVED", "ENTITY_STATUS_DRAFT", "ENTITY_STATUS_PAUSED", "ENTITY_STATUS_SCHEDULED_FOR_DELETION"]),
  /** Output only. The timestamp when the campaign was last updated. Assigned by the s */
  updateTime: z.string().optional(),
  /** Required. The goal of the campaign. */
  campaignGoal: z.lazy(() => CampaignGoal),
});

/**
 * Settings that control the number of times a user may be shown with the same ad during a given time period.
 */
export const FrequencyCap = z.object({
  /** The time unit in which the frequency cap will be applied. Required when unlimite */
  timeUnit: z.enum(["TIME_UNIT_UNSPECIFIED", "TIME_UNIT_LIFETIME", "TIME_UNIT_MONTHS", "TIME_UNIT_WEEKS", "TIME_UNIT_DAYS", "TIME_UNIT_HOURS", "TIME_UNIT_MINUTES"]).optional(),
  /** Whether unlimited frequency capping is applied. When this field is set to `true` */
  unlimited: z.boolean().optional(),
  /** Optional. The maximum number of times a user may click-through or fully view an  */
  maxViews: z.number().int().optional(),
  /** The maximum number of times a user may be shown the same ad during this period.  */
  maxImpressions: z.number().int().optional(),
  /** The number of time_unit the frequency cap will last. Required when unlimited is  */
  timeUnitCount: z.number().int().optional(),
});

/**
 * Settings that control how the campaign budget is allocated.
 */
export const CampaignBudget = z.object({
  /** Required. Immutable. Specifies whether the budget is measured in currency or imp */
  budgetUnit: z.enum(["BUDGET_UNIT_UNSPECIFIED", "BUDGET_UNIT_CURRENCY", "BUDGET_UNIT_IMPRESSIONS"]),
  /** Immutable. The ID used to group budgets to be included the same invoice. If this */
  invoiceGroupingId: z.string().optional(),
  /** Additional metadata for use by the Mediaocean Prisma tool. Required for Mediaoce */
  prismaConfig: z.lazy(() => PrismaConfig).optional(),
  /** Required. The external source of the budget. */
  externalBudgetSource: z.enum(["EXTERNAL_BUDGET_SOURCE_UNSPECIFIED", "EXTERNAL_BUDGET_SOURCE_NONE", "EXTERNAL_BUDGET_SOURCE_MEDIA_OCEAN"]),
  /** Required. The date range for the campaign budget. Linked budget segments may hav */
  dateRange: z.lazy(() => DateRange),
  /** Required. The display name of the budget. Must be UTF-8 encoded with a maximum s */
  displayName: z.string(),
  /** Immutable. The ID identifying this budget to the external source. If this field  */
  externalBudgetId: z.string().optional(),
  /** Required. The total amount the linked insertion order segments can budget. The a */
  budgetAmountMicros: z.string(),
  /** The unique ID of the campaign budget. Assigned by the system. Do not set for new */
  budgetId: z.string().optional(),
});

/**
 * Settings specific to the Mediaocean Prisma tool.
 */
export const PrismaConfig = z.object({
  /** Required. The Prisma type. */
  prismaType: z.enum(["PRISMA_TYPE_UNSPECIFIED", "PRISMA_TYPE_DISPLAY", "PRISMA_TYPE_SEARCH", "PRISMA_TYPE_VIDEO", "PRISMA_TYPE_AUDIO", "PRISMA_TYPE_SOCIAL", "PRISMA_TYPE_FEE"]),
  /** Required. Relevant client, product, and estimate codes from the Mediaocean Prism */
  prismaCpeCode: z.lazy(() => PrismaCpeCode),
  /** Required. The entity allocated this budget (DSP, site, etc.). */
  supplier: z.string(),
});

/**
 * Google Payments Center supports searching and filtering on the component fields of this code.
 */
export const PrismaCpeCode = z.object({
  /** The Prisma client code. */
  prismaClientCode: z.string().optional(),
  /** The Prisma product code. */
  prismaProductCode: z.string().optional(),
  /** The Prisma estimate code. */
  prismaEstimateCode: z.string().optional(),
});

/**
 * A date range.
 */
export const DateRange = z.object({
  /** The lower bound of the date range, inclusive. Must specify a positive value for  */
  startDate: z.lazy(() => Date).optional(),
  /** The upper bound of the date range, inclusive. Must specify a positive value for  */
  endDate: z.lazy(() => Date).optional(),
});

/**
 * Represents a whole or partial calendar date, such as a birthday. The time of day and time zone are either specified elsewhere or are insignificant. The date is relative to the Gregorian Calendar. This can represent one of the following: * A full date, with non-zero year, month, and day values. * A month and day, with a zero year (for example, an anniversary). * A year on its own, with a zero month and a zero day. * A year and month, with a zero day (for example, a credit card expiration date). Related types: * google.type.TimeOfDay * google.type.DateTime * google.protobuf.Timestamp
 */
export const Date = z.object({
  /** Year of the date. Must be from 1 to 9999, or 0 to specify a date without a year. */
  year: z.number().int().optional(),
  /** Day of a month. Must be from 1 to 31 and valid for the year and month, or 0 to s */
  day: z.number().int().optional(),
  /** Month of a year. Must be from 1 to 12, or 0 to specify a year without a month an */
  month: z.number().int().optional(),
});

/**
 * Settings that track the planned spend and duration of a campaign.
 */
export const CampaignFlight = z.object({
  /** Required. The dates that the campaign is expected to run. They are resolved rela */
  plannedDates: z.lazy(() => DateRange),
  /** The amount the campaign is expected to spend for its given planned_dates. This w */
  plannedSpendAmountMicros: z.string().optional(),
});

/**
 * Settings that control the goal of a campaign.
 */
export const CampaignGoal = z.object({
  /** Required. The type of the campaign goal. */
  campaignGoalType: z.enum(["CAMPAIGN_GOAL_TYPE_UNSPECIFIED", "CAMPAIGN_GOAL_TYPE_APP_INSTALL", "CAMPAIGN_GOAL_TYPE_BRAND_AWARENESS", "CAMPAIGN_GOAL_TYPE_OFFLINE_ACTION", "CAMPAIGN_GOAL_TYPE_ONLINE_ACTION"]),
  /** Required. The performance goal of the campaign. Acceptable values for performanc */
  performanceGoal: z.lazy(() => PerformanceGoal),
});

/**
 * Settings that control the performance goal of a campaign.
 */
export const PerformanceGoal = z.object({
  /** Required. The type of the performance goal. */
  performanceGoalType: z.enum(["PERFORMANCE_GOAL_TYPE_UNSPECIFIED", "PERFORMANCE_GOAL_TYPE_CPM", "PERFORMANCE_GOAL_TYPE_CPC", "PERFORMANCE_GOAL_TYPE_CPA", "PERFORMANCE_GOAL_TYPE_CTR", "PERFORMANCE_GOAL_TYPE_VIEWABILITY", "PERFORMANCE_GOAL_TYPE_CPIAVC", "PERFORMANCE_GOAL_TYPE_CPE", "PERFORMANCE_GOAL_TYPE_CPV", "PERFORMANCE_GOAL_TYPE_CLICK_CVR", "PERFORMANCE_GOAL_TYPE_IMPRESSION_CVR", "PERFORMANCE_GOAL_TYPE_VCPM", "PERFORMANCE_GOAL_TYPE_VTR", "PERFORMANCE_GOAL_TYPE_AUDIO_COMPLETION_RATE", "PERFORMANCE_GOAL_TYPE_VIDEO_COMPLETION_RATE", "PERFORMANCE_GOAL_TYPE_OTHER"]),
  /** A key performance indicator (KPI) string, which can be empty. Must be UTF-8 enco */
  performanceGoalString: z.string().optional(),
  /** The goal amount, in micros of the advertiser's currency. Applicable when perform */
  performanceGoalAmountMicros: z.string().optional(),
  /** The decimal representation of the goal percentage in micros. Applicable when per */
  performanceGoalPercentageMicros: z.string().optional(),
});

/**
 * A single insertion order.
 */
export const InsertionOrder = z.object({
  /** Optional. Additional integration details of the insertion order. */
  integrationDetails: z.lazy(() => IntegrationDetails).optional(),
  /** Output only. The unique ID of the insertion order. Assigned by the system. */
  insertionOrderId: z.string().optional(),
  /** Optional. The type of insertion order. If this field is unspecified in creation, */
  insertionOrderType: z.enum(["INSERTION_ORDER_TYPE_UNSPECIFIED", "RTB", "OVER_THE_TOP"]).optional(),
  /** Required. The budget spending speed setting of the insertion order. pacing_type  */
  pacing: z.lazy(() => Pacing),
  /** Output only. The timestamp when the insertion order was last updated. Assigned b */
  updateTime: z.string().optional(),
  /** Output only. The unique ID of the advertiser the insertion order belongs to. */
  advertiserId: z.string().optional(),
  /** Required. Controls whether or not the insertion order can spend its budget and b */
  entityStatus: z.enum(["ENTITY_STATUS_UNSPECIFIED", "ENTITY_STATUS_ACTIVE", "ENTITY_STATUS_ARCHIVED", "ENTITY_STATUS_DRAFT", "ENTITY_STATUS_PAUSED", "ENTITY_STATUS_SCHEDULED_FOR_DELETION"]),
  /** Required. The frequency capping setting of the insertion order. */
  frequencyCap: z.lazy(() => FrequencyCap),
  /** Required. Immutable. The unique ID of the campaign that the insertion order belo */
  campaignId: z.string(),
  /** Optional. The bidding strategy of the insertion order. By default, fixed_bid is  */
  bidStrategy: z.lazy(() => BiddingStrategy).optional(),
  /** Output only. The resource name of the insertion order. */
  name: z.string().optional(),
  /** Required. The budget allocation settings of the insertion order. */
  budget: z.lazy(() => InsertionOrderBudget),
  /** Optional. The partner costs associated with the insertion order. If absent or em */
  partnerCosts: z.array(z.lazy(() => PartnerCost)).optional(),
  /** Required. The display name of the insertion order. Must be UTF-8 encoded with a  */
  displayName: z.string(),
  /** Required. The key performance indicator (KPI) of the insertion order. This is re */
  kpi: z.lazy(() => Kpi),
  /** Optional. Required. The optimization objective of the insertion order. */
  optimizationObjective: z.enum(["OPTIMIZATION_OBJECTIVE_UNSPECIFIED", "CONVERSION", "CLICK", "BRAND_AWARENESS", "CUSTOM", "NO_OBJECTIVE"]).optional(),
  /** Output only. The reservation type of the insertion order. */
  reservationType: z.enum(["RESERVATION_TYPE_UNSPECIFIED", "RESERVATION_TYPE_NOT_GUARANTEED", "RESERVATION_TYPE_PROGRAMMATIC_GUARANTEED", "RESERVATION_TYPE_TAG_GUARANTEED", "RESERVATION_TYPE_PETRA_VIRAL", "RESERVATION_TYPE_INSTANT_RESERVE"]).optional(),
});

/**
 * Settings that control the rate at which a budget is spent.
 */
export const Pacing = z.object({
  /** Maximum currency amount to spend every day in micros of advertiser's currency. A */
  dailyMaxMicros: z.string().optional(),
  /** Required. The time period in which the pacing budget will be spent. When automat */
  pacingPeriod: z.enum(["PACING_PERIOD_UNSPECIFIED", "PACING_PERIOD_DAILY", "PACING_PERIOD_FLIGHT"]).optional(),
  /** Required. The type of pacing that defines how the budget amount will be spent ac */
  pacingType: z.enum(["PACING_TYPE_UNSPECIFIED", "PACING_TYPE_AHEAD", "PACING_TYPE_ASAP", "PACING_TYPE_EVEN"]),
  /** Maximum number of impressions to serve every day. Applicable when the budget is  */
  dailyMaxImpressions: z.string().optional(),
});

/**
 * Settings that control the bid strategy. Bid strategy determines the bid price.
 */
export const BiddingStrategy = z.object({
  /** A strategy that uses a fixed bid price. */
  fixedBid: z.lazy(() => FixedBidStrategy).optional(),
  /** A strategy that automatically adjusts the bid to meet or beat a specified perfor */
  performanceGoalAutoBid: z.lazy(() => PerformanceGoalBidStrategy).optional(),
  /** A bid strategy used by YouTube and Partners resources. It can only be used for a */
  youtubeAndPartnersBid: z.lazy(() => YoutubeAndPartnersBiddingStrategy).optional(),
  /** * `BIDDING_STRATEGY_PERFORMANCE_GOAL_TYPE_CPA`, `BIDDING_STRATEGY_PERFORMANCE_GO */
  maximizeSpendAutoBid: z.lazy(() => MaximizeSpendBidStrategy).optional(),
});

/**
 * A strategy that uses a fixed bidding price.
 */
export const FixedBidStrategy = z.object({
  /** The fixed bid amount, in micros of the advertiser's currency. For insertion orde */
  bidAmountMicros: z.string().optional(),
});

/**
 * A strategy that automatically adjusts the bid to meet or beat a specified performance goal.
 */
export const PerformanceGoalBidStrategy = z.object({
  /** The ID of the Custom Bidding Algorithm used by this strategy. Only applicable wh */
  customBiddingAlgorithmId: z.string().optional(),
  /** Required. The type of the performance goal that the bidding strategy will try to */
  performanceGoalType: z.enum(["BIDDING_STRATEGY_PERFORMANCE_GOAL_TYPE_UNSPECIFIED", "BIDDING_STRATEGY_PERFORMANCE_GOAL_TYPE_CPA", "BIDDING_STRATEGY_PERFORMANCE_GOAL_TYPE_CPC", "BIDDING_STRATEGY_PERFORMANCE_GOAL_TYPE_VIEWABLE_CPM", "BIDDING_STRATEGY_PERFORMANCE_GOAL_TYPE_CUSTOM_ALGO", "BIDDING_STRATEGY_PERFORMANCE_GOAL_TYPE_CIVA", "BIDDING_STRATEGY_PERFORMANCE_GOAL_TYPE_IVO_TEN", "BIDDING_STRATEGY_PERFORMANCE_GOAL_TYPE_AV_VIEWED", "BIDDING_STRATEGY_PERFORMANCE_GOAL_TYPE_REACH"]),
  /** The maximum average CPM that may be bid, in micros of the advertiser's currency. */
  maxAverageCpmBidAmountMicros: z.string().optional(),
  /** Required. The performance goal the bidding strategy will attempt to meet or beat */
  performanceGoalAmountMicros: z.string(),
});

/**
 * Settings that control the bid strategy for YouTube and Partners resources.
 */
export const YoutubeAndPartnersBiddingStrategy = z.object({
  /** Output only. Source of the effective target CPA value for ad group. */
  adGroupEffectiveTargetCpaSource: z.enum(["BIDDING_SOURCE_UNSPECIFIED", "BIDDING_SOURCE_LINE_ITEM", "BIDDING_SOURCE_AD_GROUP"]).optional(),
  /** The type of the bidding strategy. */
  type: z.enum(["YOUTUBE_AND_PARTNERS_BIDDING_STRATEGY_TYPE_UNSPECIFIED", "YOUTUBE_AND_PARTNERS_BIDDING_STRATEGY_TYPE_MANUAL_CPV", "YOUTUBE_AND_PARTNERS_BIDDING_STRATEGY_TYPE_MANUAL_CPM", "YOUTUBE_AND_PARTNERS_BIDDING_STRATEGY_TYPE_TARGET_CPA", "YOUTUBE_AND_PARTNERS_BIDDING_STRATEGY_TYPE_TARGET_CPM", "YOUTUBE_AND_PARTNERS_BIDDING_STRATEGY_TYPE_RESERVE_CPM", "YOUTUBE_AND_PARTNERS_BIDDING_STRATEGY_TYPE_MAXIMIZE_LIFT", "YOUTUBE_AND_PARTNERS_BIDDING_STRATEGY_TYPE_MAXIMIZE_CONVERSIONS", "YOUTUBE_AND_PARTNERS_BIDDING_STRATEGY_TYPE_TARGET_CPV", "YOUTUBE_AND_PARTNERS_BIDDING_STRATEGY_TYPE_TARGET_ROAS", "YOUTUBE_AND_PARTNERS_BIDDING_STRATEGY_TYPE_MAXIMIZE_CONVERSION_VALUE"]).optional(),
  /** The value used by the bidding strategy. When the bidding strategy is assigned at */
  value: z.string().optional(),
  /** Output only. The effective target CPA for ad group, in micros of advertiser's cu */
  adGroupEffectiveTargetCpaValue: z.string().optional(),
});

/**
 * A strategy that automatically adjusts the bid to optimize a specified performance goal while spending the full budget.
 */
export const MaximizeSpendBidStrategy = z.object({
  /** The maximum average CPM that may be bid, in micros of the advertiser's currency. */
  maxAverageCpmBidAmountMicros: z.string().optional(),
  /** Required. The type of the performance goal that the bidding strategy tries to mi */
  performanceGoalType: z.enum(["BIDDING_STRATEGY_PERFORMANCE_GOAL_TYPE_UNSPECIFIED", "BIDDING_STRATEGY_PERFORMANCE_GOAL_TYPE_CPA", "BIDDING_STRATEGY_PERFORMANCE_GOAL_TYPE_CPC", "BIDDING_STRATEGY_PERFORMANCE_GOAL_TYPE_VIEWABLE_CPM", "BIDDING_STRATEGY_PERFORMANCE_GOAL_TYPE_CUSTOM_ALGO", "BIDDING_STRATEGY_PERFORMANCE_GOAL_TYPE_CIVA", "BIDDING_STRATEGY_PERFORMANCE_GOAL_TYPE_IVO_TEN", "BIDDING_STRATEGY_PERFORMANCE_GOAL_TYPE_AV_VIEWED", "BIDDING_STRATEGY_PERFORMANCE_GOAL_TYPE_REACH"]),
  /** Whether the strategy takes deal floor prices into account. */
  raiseBidForDeals: z.boolean().optional(),
  /** The ID of the Custom Bidding Algorithm used by this strategy. Only applicable wh */
  customBiddingAlgorithmId: z.string().optional(),
});

/**
 * Settings that control how insertion order budget is allocated.
 */
export const InsertionOrderBudget = z.object({
  /** Required. The list of budget segments. Use a budget segment to specify a specifi */
  budgetSegments: z.array(z.lazy(() => InsertionOrderBudgetSegment)),
  /** Required. Immutable. The budget unit specifies whether the budget is currency ba */
  budgetUnit: z.enum(["BUDGET_UNIT_UNSPECIFIED", "BUDGET_UNIT_CURRENCY", "BUDGET_UNIT_IMPRESSIONS"]),
  /** Optional. The type of automation used to manage bid and budget for the insertion */
  automationType: z.enum(["INSERTION_ORDER_AUTOMATION_TYPE_UNSPECIFIED", "INSERTION_ORDER_AUTOMATION_TYPE_BUDGET", "INSERTION_ORDER_AUTOMATION_TYPE_NONE", "INSERTION_ORDER_AUTOMATION_TYPE_BID_BUDGET"]).optional(),
});

/**
 * Settings that control the budget of a single budget segment.
 */
export const InsertionOrderBudgetSegment = z.object({
  /** Required. The start and end date settings of the budget segment. They are resolv */
  dateRange: z.lazy(() => DateRange),
  /** Optional. The budget_id of the campaign budget that this insertion order budget  */
  campaignBudgetId: z.string().optional(),
  /** Optional. The budget segment description. It can be used to enter Purchase Order */
  description: z.string().optional(),
  /** Required. The budget amount the insertion order will spend for the given date_ra */
  budgetAmountMicros: z.string(),
});

/**
 * Settings that control a partner cost. A partner cost is any type of expense involved in running a campaign, other than the costs of purchasing impressions (which is called the media cost) and using third-party audience segment data (data fee). Some examples of partner costs include the fees for using DV360, a third-party ad server, or a third-party ad serving verification service.
 */
export const PartnerCost = z.object({
  /** Required. The type of the partner cost. */
  costType: z.enum(["PARTNER_COST_TYPE_UNSPECIFIED", "PARTNER_COST_TYPE_ADLOOX", "PARTNER_COST_TYPE_ADLOOX_PREBID", "PARTNER_COST_TYPE_ADSAFE", "PARTNER_COST_TYPE_ADXPOSE", "PARTNER_COST_TYPE_AGGREGATE_KNOWLEDGE", "PARTNER_COST_TYPE_AGENCY_TRADING_DESK", "PARTNER_COST_TYPE_DV360_FEE", "PARTNER_COST_TYPE_COMSCORE_VCE", "PARTNER_COST_TYPE_DATA_MANAGEMENT_PLATFORM", "PARTNER_COST_TYPE_DEFAULT", "PARTNER_COST_TYPE_DOUBLE_VERIFY", "PARTNER_COST_TYPE_DOUBLE_VERIFY_PREBID", "PARTNER_COST_TYPE_EVIDON", "PARTNER_COST_TYPE_INTEGRAL_AD_SCIENCE_VIDEO", "PARTNER_COST_TYPE_INTEGRAL_AD_SCIENCE_PREBID", "PARTNER_COST_TYPE_MEDIA_COST_DATA", "PARTNER_COST_TYPE_MOAT_VIDEO", "PARTNER_COST_TYPE_NIELSEN_DAR", "PARTNER_COST_TYPE_SHOP_LOCAL", "PARTNER_COST_TYPE_TERACENT", "PARTNER_COST_TYPE_THIRD_PARTY_AD_SERVER", "PARTNER_COST_TYPE_TRUST_METRICS", "PARTNER_COST_TYPE_VIZU", "PARTNER_COST_TYPE_CUSTOM_FEE_1", "PARTNER_COST_TYPE_CUSTOM_FEE_2", "PARTNER_COST_TYPE_CUSTOM_FEE_3", "PARTNER_COST_TYPE_CUSTOM_FEE_4", "PARTNER_COST_TYPE_CUSTOM_FEE_5", "PARTNER_COST_TYPE_SCIBIDS_FEE"]),
  /** The media fee percentage in millis (1/1000 of a percent). Applicable when the fe */
  feePercentageMillis: z.string().optional(),
  /** Required. The fee type for this partner cost. */
  feeType: z.enum(["PARTNER_COST_FEE_TYPE_UNSPECIFIED", "PARTNER_COST_FEE_TYPE_CPM_FEE", "PARTNER_COST_FEE_TYPE_MEDIA_FEE"]),
  /** The CPM fee amount in micros of advertiser's currency. Applicable when the fee_t */
  feeAmount: z.string().optional(),
  /** The invoice type for this partner cost. * Required when cost_type is one of: - ` */
  invoiceType: z.enum(["PARTNER_COST_INVOICE_TYPE_UNSPECIFIED", "PARTNER_COST_INVOICE_TYPE_DV360", "PARTNER_COST_INVOICE_TYPE_PARTNER"]).optional(),
});

/**
 * Settings that control the key performance indicator, or KPI, of an insertion order.
 */
export const Kpi = z.object({
  /** A KPI string, which can be empty. Must be UTF-8 encoded with a length of no more */
  kpiString: z.string().optional(),
  /** Optional. Custom Bidding Algorithm ID associated with KPI_CUSTOM_IMPRESSION_VALU */
  kpiAlgorithmId: z.string().optional(),
  /** The decimal representation of the goal percentage in micros. Applicable when kpi */
  kpiPercentageMicros: z.string().optional(),
  /** The goal amount, in micros of the advertiser's currency. Applicable when kpi_typ */
  kpiAmountMicros: z.string().optional(),
  /** Required. The type of KPI. */
  kpiType: z.enum(["KPI_TYPE_UNSPECIFIED", "KPI_TYPE_CPM", "KPI_TYPE_CPC", "KPI_TYPE_CPA", "KPI_TYPE_CTR", "KPI_TYPE_VIEWABILITY", "KPI_TYPE_CPIAVC", "KPI_TYPE_CPE", "KPI_TYPE_CPV", "KPI_TYPE_CLICK_CVR", "KPI_TYPE_IMPRESSION_CVR", "KPI_TYPE_VCPM", "KPI_TYPE_VTR", "KPI_TYPE_AUDIO_COMPLETION_RATE", "KPI_TYPE_VIDEO_COMPLETION_RATE", "KPI_TYPE_CPCL", "KPI_TYPE_CPCV", "KPI_TYPE_TOS10", "KPI_TYPE_MAXIMIZE_PACING", "KPI_TYPE_CUSTOM_IMPRESSION_VALUE_OVER_COST", "KPI_TYPE_OTHER"]),
});

/**
 * A single line item.
 */
export const LineItem = z.object({
  /** Required. The bidding strategy of the line item. */
  bidStrategy: z.lazy(() => BiddingStrategy),
  /** Integration details of the line item. */
  integrationDetails: z.lazy(() => IntegrationDetails).optional(),
  /** Whether this line item will serve European Union political ads. If contains_eu_p */
  containsEuPoliticalAds: z.enum(["EU_POLITICAL_ADVERTISING_STATUS_UNKNOWN", "CONTAINS_EU_POLITICAL_ADVERTISING", "DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING"]).optional(),
  /** Required. Immutable. The unique ID of the insertion order that the line item bel */
  insertionOrderId: z.string(),
  /** The conversion tracking setting of the line item. */
  conversionCounting: z.lazy(() => ConversionCountingConfig).optional(),
  /** Required. The partner revenue model setting of the line item. */
  partnerRevenueModel: z.lazy(() => PartnerRevenueModel),
  /** Required. The display name of the line item. Must be UTF-8 encoded with a maximu */
  displayName: z.string(),
  /** Required. Controls whether or not the line item can spend its budget and bid on  */
  entityStatus: z.enum(["ENTITY_STATUS_UNSPECIFIED", "ENTITY_STATUS_ACTIVE", "ENTITY_STATUS_ARCHIVED", "ENTITY_STATUS_DRAFT", "ENTITY_STATUS_PAUSED", "ENTITY_STATUS_SCHEDULED_FOR_DELETION"]),
  /** Output only. The unique ID of the campaign that the line item belongs to. */
  campaignId: z.string().optional(),
  /** Output only. The warning messages generated by the line item. These warnings do  */
  warningMessages: z.array(z.enum(["LINE_ITEM_WARNING_MESSAGE_UNSPECIFIED", "INVALID_FLIGHT_DATES", "EXPIRED", "PENDING_FLIGHT", "ALL_PARTNER_ENABLED_EXCHANGES_NEGATIVELY_TARGETED", "INVALID_INVENTORY_SOURCE", "APP_INVENTORY_INVALID_SITE_TARGETING", "APP_INVENTORY_INVALID_AUDIENCE_LISTS", "NO_VALID_CREATIVE", "PARENT_INSERTION_ORDER_PAUSED", "PARENT_INSERTION_ORDER_EXPIRED"])).optional(),
  /** Output only. The timestamp when the line item was last updated. Assigned by the  */
  updateTime: z.string().optional(),
  /** The mobile app promoted by the line item. This is applicable only when line_item */
  mobileApp: z.lazy(() => MobileApp).optional(),
  /** Whether to exclude new exchanges from automatically being targeted by the line i */
  excludeNewExchanges: z.boolean().optional(),
  /** Output only. The reservation type of the line item. */
  reservationType: z.enum(["RESERVATION_TYPE_UNSPECIFIED", "RESERVATION_TYPE_NOT_GUARANTEED", "RESERVATION_TYPE_PROGRAMMATIC_GUARANTEED", "RESERVATION_TYPE_TAG_GUARANTEED", "RESERVATION_TYPE_PETRA_VIRAL", "RESERVATION_TYPE_INSTANT_RESERVE"]).optional(),
  /** Output only. The unique ID of the line item. Assigned by the system. */
  lineItemId: z.string().optional(),
  /** Output only. Settings specific to YouTube and Partners line items. */
  youtubeAndPartnersSettings: z.lazy(() => YoutubeAndPartnersSettings).optional(),
  /** Required. Immutable. The type of the line item. */
  lineItemType: z.enum(["LINE_ITEM_TYPE_UNSPECIFIED", "LINE_ITEM_TYPE_DISPLAY_DEFAULT", "LINE_ITEM_TYPE_DISPLAY_MOBILE_APP_INSTALL", "LINE_ITEM_TYPE_VIDEO_DEFAULT", "LINE_ITEM_TYPE_VIDEO_MOBILE_APP_INSTALL", "LINE_ITEM_TYPE_DISPLAY_MOBILE_APP_INVENTORY", "LINE_ITEM_TYPE_VIDEO_MOBILE_APP_INVENTORY", "LINE_ITEM_TYPE_AUDIO_DEFAULT", "LINE_ITEM_TYPE_VIDEO_OVER_THE_TOP", "LINE_ITEM_TYPE_YOUTUBE_AND_PARTNERS_ACTION", "LINE_ITEM_TYPE_YOUTUBE_AND_PARTNERS_NON_SKIPPABLE", "LINE_ITEM_TYPE_YOUTUBE_AND_PARTNERS_VIDEO_SEQUENCE", "LINE_ITEM_TYPE_YOUTUBE_AND_PARTNERS_AUDIO", "LINE_ITEM_TYPE_YOUTUBE_AND_PARTNERS_REACH", "LINE_ITEM_TYPE_YOUTUBE_AND_PARTNERS_SIMPLE", "LINE_ITEM_TYPE_YOUTUBE_AND_PARTNERS_NON_SKIPPABLE_OVER_THE_TOP", "LINE_ITEM_TYPE_YOUTUBE_AND_PARTNERS_REACH_OVER_THE_TOP", "LINE_ITEM_TYPE_YOUTUBE_AND_PARTNERS_SIMPLE_OVER_THE_TOP", "LINE_ITEM_TYPE_YOUTUBE_AND_PARTNERS_TARGET_FREQUENCY", "LINE_ITEM_TYPE_YOUTUBE_AND_PARTNERS_VIEW", "LINE_ITEM_TYPE_DISPLAY_OUT_OF_HOME", "LINE_ITEM_TYPE_VIDEO_OUT_OF_HOME"]),
  /** The [optimized targeting](//support.google.com/displayvideo/answer/12060859) set */
  targetingExpansion: z.lazy(() => TargetingExpansionConfig).optional(),
  /** Output only. The resource name of the line item. */
  name: z.string().optional(),
  /** Required. The impression frequency cap settings of the line item. The max_impres */
  frequencyCap: z.lazy(() => FrequencyCap),
  /** Required. The budget allocation setting of the line item. */
  budget: z.lazy(() => LineItemBudget),
  /** The partner costs associated with the line item. If absent or empty in CreateLin */
  partnerCosts: z.array(z.lazy(() => PartnerCost)).optional(),
  /** Output only. The unique ID of the advertiser the line item belongs to. */
  advertiserId: z.string().optional(),
  /** The IDs of the creatives associated with the line item. */
  creativeIds: z.array(z.string()).optional(),
  /** Required. The start and end time of the line item's flight. */
  flight: z.lazy(() => LineItemFlight),
  /** Required. The budget spending speed setting of the line item. */
  pacing: z.lazy(() => Pacing),
});

/**
 * Settings that control how conversions are counted. All post-click conversions will be counted. A percentage value can be set for post-view conversions counting.
 */
export const ConversionCountingConfig = z.object({
  /** The percentage of post-view conversions to count, in millis (1/1000 of a percent */
  postViewCountPercentageMillis: z.string().optional(),
  /** The Floodlight activity configs used to track conversions. The number of convers */
  floodlightActivityConfigs: z.array(z.lazy(() => TrackingFloodlightActivityConfig)).optional(),
});

/**
 * Settings that control the behavior of a single Floodlight activity config.
 */
export const TrackingFloodlightActivityConfig = z.object({
  /** Required. The number of days after an ad has been viewed in which a conversion m */
  postViewLookbackWindowDays: z.number().int(),
  /** Required. The number of days after an ad has been clicked in which a conversion  */
  postClickLookbackWindowDays: z.number().int(),
  /** Required. The ID of the Floodlight activity. */
  floodlightActivityId: z.string(),
});

/**
 * Settings that control how partner revenue is calculated.
 */
export const PartnerRevenueModel = z.object({
  /** Required. The markup type of the partner revenue model. */
  markupType: z.enum(["PARTNER_REVENUE_MODEL_MARKUP_TYPE_UNSPECIFIED", "PARTNER_REVENUE_MODEL_MARKUP_TYPE_CPM", "PARTNER_REVENUE_MODEL_MARKUP_TYPE_MEDIA_COST_MARKUP", "PARTNER_REVENUE_MODEL_MARKUP_TYPE_TOTAL_MEDIA_COST_MARKUP"]),
  /** Required. The markup amount of the partner revenue model. Must be greater than o */
  markupAmount: z.string().optional(),
});

/**
 * A mobile app promoted by a mobile app install line item.
 */
export const MobileApp = z.object({
  /** Output only. The app publisher. */
  publisher: z.string().optional(),
  /** Output only. The app name. */
  displayName: z.string().optional(),
  /** Output only. The app platform. */
  platform: z.enum(["PLATFORM_UNSPECIFIED", "IOS", "ANDROID"]).optional(),
  /** Required. The ID of the app provided by the platform store. Android apps are ide */
  appId: z.string(),
});

/**
 * Settings for YouTube and Partners line items.
 */
export const YoutubeAndPartnersSettings = z.object({
  /** Settings that control what YouTube and Partners inventories the line item will t */
  inventorySourceSettings: z.lazy(() => YoutubeAndPartnersInventorySourceConfig).optional(),
  /** Optional. The IDs of the videos appear below the primary video ad when the ad is */
  relatedVideoIds: z.array(z.string()).optional(),
  /** Optional. The ID of the form to generate leads. */
  leadFormId: z.string().optional(),
  /** Optional. The ID of the merchant which is linked to the line item for product fe */
  linkedMerchantId: z.string().optional(),
  /** Output only. The content category which takes effect when serving the line item. */
  effectiveContentCategory: z.enum(["YOUTUBE_AND_PARTNERS_CONTENT_CATEGORY_UNSPECIFIED", "YOUTUBE_AND_PARTNERS_CONTENT_CATEGORY_STANDARD", "YOUTUBE_AND_PARTNERS_CONTENT_CATEGORY_EXPANDED", "YOUTUBE_AND_PARTNERS_CONTENT_CATEGORY_LIMITED"]).optional(),
  /** Optional. The settings to control which inventory is allowed for this line item. */
  videoAdInventoryControl: z.lazy(() => VideoAdInventoryControl).optional(),
  /** Optional. The settings related to VideoAdSequence. */
  videoAdSequenceSettings: z.lazy(() => VideoAdSequenceSettings).optional(),
  /** Output only. The kind of content on which the YouTube and Partners ads will be s */
  contentCategory: z.enum(["YOUTUBE_AND_PARTNERS_CONTENT_CATEGORY_UNSPECIFIED", "YOUTUBE_AND_PARTNERS_CONTENT_CATEGORY_STANDARD", "YOUTUBE_AND_PARTNERS_CONTENT_CATEGORY_EXPANDED", "YOUTUBE_AND_PARTNERS_CONTENT_CATEGORY_LIMITED"]).optional(),
  /** The view frequency cap settings of the line item. The max_views field in this se */
  viewFrequencyCap: z.lazy(() => FrequencyCap).optional(),
  /** Optional. The average number of times you want ads from this line item to show t */
  targetFrequency: z.lazy(() => TargetFrequency).optional(),
  /** Optional. The third-party measurement configs of the line item. */
  thirdPartyMeasurementConfigs: z.lazy(() => ThirdPartyMeasurementConfigs).optional(),
});

/**
 * Settings that control what YouTube related inventories the YouTube and Partners line item will target.
 */
export const YoutubeAndPartnersInventorySourceConfig = z.object({
  /** Optional. Whether to target inventory on YouTube. This includes both search, cha */
  includeYoutube: z.boolean().optional(),
  /** Whether to target inventory on a collection of partner sites and apps that follo */
  includeYoutubeVideoPartners: z.boolean().optional(),
  /** Optional. Whether to target inventory in video apps available with Google TV. */
  includeGoogleTv: z.boolean().optional(),
});

/**
 * The video ad inventory control used in certain YouTube line item types.
 */
export const VideoAdInventoryControl = z.object({
  /** Optional. Whether ads can serve as shorts format. */
  allowShorts: z.boolean().optional(),
  /** Optional. Whether ads can serve as in-stream format. */
  allowInStream: z.boolean().optional(),
  /** Optional. Whether ads can serve as in-feed format. */
  allowInFeed: z.boolean().optional(),
});

/**
 * Settings related to VideoAdSequence.
 */
export const VideoAdSequenceSettings = z.object({
  /** The steps of which the sequence consists. */
  steps: z.array(z.lazy(() => VideoAdSequenceStep)).optional(),
  /** The minimum time interval before the same user sees this sequence again. */
  minimumDuration: z.enum(["VIDEO_AD_SEQUENCE_MINIMUM_DURATION_UNSPECIFIED", "VIDEO_AD_SEQUENCE_MINIMUM_DURATION_WEEK", "VIDEO_AD_SEQUENCE_MINIMUM_DURATION_MONTH"]).optional(),
});

/**
 * The detail of a single step in a VideoAdSequence.
 */
export const VideoAdSequenceStep = z.object({
  /** The ID of the step. */
  stepId: z.string().optional(),
  /** The ID of the corresponding ad group of the step. */
  adGroupId: z.string().optional(),
  /** The ID of the previous step. The first step does not have previous step. */
  previousStepId: z.string().optional(),
  /** The interaction on the previous step that will lead the viewer to this step. The */
  interactionType: z.enum(["INTERACTION_TYPE_UNSPECIFIED", "INTERACTION_TYPE_PAID_VIEW", "INTERACTION_TYPE_SKIP", "INTERACTION_TYPE_IMPRESSION", "INTERACTION_TYPE_ENGAGED_IMPRESSION"]).optional(),
});

/**
 * Setting that controls the average number of times the ads will show to the same person over a certain period of time.
 */
export const TargetFrequency = z.object({
  /** The target number of times, on average, the ads will be shown to the same person */
  targetCount: z.string().optional(),
  /** The number of time_unit the target frequency will last. The following restrictio */
  timeUnitCount: z.number().int().optional(),
  /** The unit of time in which the target frequency will be applied. The following ti */
  timeUnit: z.enum(["TIME_UNIT_UNSPECIFIED", "TIME_UNIT_LIFETIME", "TIME_UNIT_MONTHS", "TIME_UNIT_WEEKS", "TIME_UNIT_DAYS", "TIME_UNIT_HOURS", "TIME_UNIT_MINUTES"]).optional(),
});

/**
 * Settings that control what third-party vendors are measuring specific line item metrics.
 */
export const ThirdPartyMeasurementConfigs = z.object({
  /** Optional. The third-party vendors measuring reach. The following third-party ven */
  reachVendorConfigs: z.array(z.lazy(() => ThirdPartyVendorConfig)).optional(),
  /** Optional. The third-party vendors measuring brand safety. The following third-pa */
  brandSafetyVendorConfigs: z.array(z.lazy(() => ThirdPartyVendorConfig)).optional(),
  /** Optional. The third-party vendors measuring brand lift. The following third-part */
  brandLiftVendorConfigs: z.array(z.lazy(() => ThirdPartyVendorConfig)).optional(),
  /** Optional. The third-party vendors measuring viewability. The following third-par */
  viewabilityVendorConfigs: z.array(z.lazy(() => ThirdPartyVendorConfig)).optional(),
});

/**
 * Settings that control how third-party measurement vendors are configured.
 */
export const ThirdPartyVendorConfig = z.object({
  /** The third-party measurement vendor. */
  vendor: z.enum(["THIRD_PARTY_VENDOR_UNSPECIFIED", "THIRD_PARTY_VENDOR_MOAT", "THIRD_PARTY_VENDOR_DOUBLE_VERIFY", "THIRD_PARTY_VENDOR_INTEGRAL_AD_SCIENCE", "THIRD_PARTY_VENDOR_COMSCORE", "THIRD_PARTY_VENDOR_TELEMETRY", "THIRD_PARTY_VENDOR_MEETRICS", "THIRD_PARTY_VENDOR_ZEFR", "THIRD_PARTY_VENDOR_NIELSEN", "THIRD_PARTY_VENDOR_KANTAR", "THIRD_PARTY_VENDOR_DYNATA", "THIRD_PARTY_VENDOR_TRANSUNION"]).optional(),
  /** The ID used by the platform of the third-party vendor to identify the line item. */
  placementId: z.string().optional(),
});

/**
 * Settings that control the [optimized targeting](//support.google.com/displayvideo/answer/12060859) settings of the line item.
 */
export const TargetingExpansionConfig = z.object({
  /** Output only. Whether to exclude seed list for audience expansion. This field onl */
  audienceExpansionSeedListExcluded: z.boolean().optional(),
  /** Output only. Magnitude of expansion for eligible first-party user lists under th */
  audienceExpansionLevel: z.enum(["UNKNOWN", "NO_REACH", "LEAST_REACH", "MID_REACH", "MOST_REACH"]).optional(),
  /** Required. Whether to enable Optimized Targeting for the line item. Optimized tar */
  enableOptimizedTargeting: z.boolean().optional(),
});

/**
 * Settings that control how budget is allocated.
 */
export const LineItemBudget = z.object({
  /** The maximum budget amount the line item will spend. Must be greater than 0. When */
  maxAmount: z.string().optional(),
  /** Required. The type of the budget allocation. `LINE_ITEM_BUDGET_ALLOCATION_TYPE_A */
  budgetAllocationType: z.enum(["LINE_ITEM_BUDGET_ALLOCATION_TYPE_UNSPECIFIED", "LINE_ITEM_BUDGET_ALLOCATION_TYPE_AUTOMATIC", "LINE_ITEM_BUDGET_ALLOCATION_TYPE_FIXED", "LINE_ITEM_BUDGET_ALLOCATION_TYPE_UNLIMITED"]).optional(),
  /** Output only. The budget unit specifies whether the budget is currency based or i */
  budgetUnit: z.enum(["BUDGET_UNIT_UNSPECIFIED", "BUDGET_UNIT_CURRENCY", "BUDGET_UNIT_IMPRESSIONS"]).optional(),
});

/**
 * Settings that control the active duration of a line item.
 */
export const LineItemFlight = z.object({
  /** Required. The type of the line item's flight dates. */
  flightDateType: z.enum(["LINE_ITEM_FLIGHT_DATE_TYPE_UNSPECIFIED", "LINE_ITEM_FLIGHT_DATE_TYPE_INHERITED", "LINE_ITEM_FLIGHT_DATE_TYPE_CUSTOM"]),
  /** The flight start and end dates of the line item. They are resolved relative to t */
  dateRange: z.lazy(() => DateRange).optional(),
});

/**
 * A single ad group associated with a line item.
 */
export const AdGroup = z.object({
  /** The unique ID of the line item that the ad group belongs to. */
  lineItemId: z.string().optional(),
  /** The [optimized targeting](//support.google.com/displayvideo/answer/12060859) set */
  targetingExpansion: z.lazy(() => TargetingExpansionConfig).optional(),
  /** The display name of the ad group. Must be UTF-8 encoded with a maximum size of 2 */
  displayName: z.string().optional(),
  /** Controls whether or not the ad group can spend its budget and bid on inventory.  */
  entityStatus: z.enum(["ENTITY_STATUS_UNSPECIFIED", "ENTITY_STATUS_ACTIVE", "ENTITY_STATUS_ARCHIVED", "ENTITY_STATUS_DRAFT", "ENTITY_STATUS_PAUSED", "ENTITY_STATUS_SCHEDULED_FOR_DELETION"]).optional(),
  /** The unique ID of the ad group. Assigned by the system. */
  adGroupId: z.string().optional(),
  /** The resource name of the ad group. */
  name: z.string().optional(),
  /** The format of the ads in the ad group. */
  adGroupFormat: z.enum(["AD_GROUP_FORMAT_UNSPECIFIED", "AD_GROUP_FORMAT_IN_STREAM", "AD_GROUP_FORMAT_VIDEO_DISCOVERY", "AD_GROUP_FORMAT_BUMPER", "AD_GROUP_FORMAT_NON_SKIPPABLE_IN_STREAM", "AD_GROUP_FORMAT_AUDIO", "AD_GROUP_FORMAT_RESPONSIVE", "AD_GROUP_FORMAT_REACH", "AD_GROUP_FORMAT_MASTHEAD"]).optional(),
  /** The bidding strategy used by the ad group. Only the youtubeAndPartnersBid field  */
  bidStrategy: z.lazy(() => BiddingStrategy).optional(),
  /** The unique ID of the advertiser the ad group belongs to. */
  advertiserId: z.string().optional(),
  /** The settings of the product feed in this ad group. */
  productFeedData: z.lazy(() => ProductFeedData).optional(),
});

/**
 * The details of product feed.
 */
export const ProductFeedData = z.object({
  /** How products are selected by the product feed. */
  productMatchType: z.enum(["PRODUCT_MATCH_TYPE_UNSPECIFIED", "PRODUCT_MATCH_TYPE_ALL_PRODUCTS", "PRODUCT_MATCH_TYPE_SPECIFIC_PRODUCTS", "PRODUCT_MATCH_TYPE_CUSTOM_LABEL"]).optional(),
  /** Whether the product feed has opted-out of showing products. */
  isFeedDisabled: z.boolean().optional(),
  /** A list of dimensions used to match products. */
  productMatchDimensions: z.array(z.lazy(() => ProductMatchDimension)).optional(),
});

/**
 * A dimension used to match products.
 */
export const ProductMatchDimension = z.object({
  /** The ID of the product offer to match with a product with the same offer ID. */
  productOfferId: z.string().optional(),
  /** The custom label to match all the products with the label. */
  customLabel: z.lazy(() => CustomLabel).optional(),
});

/**
 * The key and value of a custom label.
 */
export const CustomLabel = z.object({
  /** The value of the label. */
  value: z.string().optional(),
  /** The key of the label. */
  key: z.enum(["CUSTOM_LABEL_KEY_UNSPECIFIED", "CUSTOM_LABEL_KEY_0", "CUSTOM_LABEL_KEY_1", "CUSTOM_LABEL_KEY_2", "CUSTOM_LABEL_KEY_3", "CUSTOM_LABEL_KEY_4"]).optional(),
});

/**
 * A single ad associated with an ad group.
 */
export const AdGroupAd = z.object({
  /** Details of a [non-skippable short in-stream video ad](//support.google.com/displ */
  nonSkippableAd: z.lazy(() => NonSkippableAd).optional(),
  /** The entity status of the ad. */
  entityStatus: z.enum(["ENTITY_STATUS_UNSPECIFIED", "ENTITY_STATUS_ACTIVE", "ENTITY_STATUS_ARCHIVED", "ENTITY_STATUS_DRAFT", "ENTITY_STATUS_PAUSED", "ENTITY_STATUS_SCHEDULED_FOR_DELETION"]).optional(),
  /** Details of an [audio ad](//support.google.com/displayvideo/answer/6274216) used  */
  audioAd: z.lazy(() => AudioAd).optional(),
  /** The unique ID of the ad. Assigned by the system. */
  adGroupAdId: z.string().optional(),
  /** Details of a [non-skippable short video ad](//support.google.com/displayvideo/an */
  bumperAd: z.lazy(() => BumperAd).optional(),
  /** List of URLs used by the ad. */
  adUrls: z.array(z.lazy(() => AdUrl)).optional(),
  /** Details of an [ad served on the YouTube Home feed](//support.google.com/google-a */
  mastheadAd: z.lazy(() => MastheadAd).optional(),
  /** Details of an [ad promoting a video](//support.google.com/displayvideo/answer/62 */
  videoDiscoverAd: z.lazy(() => VideoDiscoveryAd).optional(),
  /** The unique ID of the ad group that the ad belongs to. *Caution*: Parent ad group */
  adGroupId: z.string().optional(),
  /** Details of an [in-stream ad skippable after 5 seconds](//support.google.com/disp */
  inStreamAd: z.lazy(() => InStreamAd).optional(),
  /** The display name of the ad. Must be UTF-8 encoded with a maximum size of 255 byt */
  displayName: z.string().optional(),
  /** Details of an [ad used in a video action campaign](//support.google.com/google-a */
  videoPerformanceAd: z.lazy(() => VideoPerformanceAd).optional(),
  /** The unique ID of the advertiser the ad belongs to. */
  advertiserId: z.string().optional(),
  /** The resource name of the ad. */
  name: z.string().optional(),
  /** The policy approval status of the ad. */
  adPolicy: z.lazy(() => AdPolicy).optional(),
  /** Details of an ad sourced from a Display & Video 360 creative. */
  displayVideoSourceAd: z.lazy(() => DisplayVideoSourceAd).optional(),
});

/**
 * Details for a non-skippable ad.
 */
export const NonSkippableAd = z.object({
  /** Common ad attributes. */
  commonInStreamAttribute: z.lazy(() => CommonInStreamAttribute).optional(),
  /** The custom parameters to pass custom values to tracking URL template. */
  customParameters: z.record(z.string()).optional(),
});

/**
 * Common attributes for in-stream, non-skippable and bumper ads.
 */
export const CommonInStreamAttribute = z.object({
  /** The YouTube video of the ad. */
  video: z.lazy(() => YoutubeVideoDetails).optional(),
  /** The webpage address that appears with the ad. */
  displayUrl: z.string().optional(),
  /** The text on the call-to-action button. */
  actionButtonLabel: z.string().optional(),
  /** The URL address of the webpage that people reach after they click the ad. */
  finalUrl: z.string().optional(),
  /** The image which shows next to the video ad. */
  companionBanner: z.lazy(() => ImageAsset).optional(),
  /** The URL address loaded in the background for tracking purposes. */
  trackingUrl: z.string().optional(),
  /** The headline of the call-to-action banner. */
  actionHeadline: z.string().optional(),
});

/**
 * Details of a YouTube video.
 */
export const YoutubeVideoDetails = z.object({
  /** The reason why the video data is not available. */
  unavailableReason: z.enum(["VIDEO_UNAVAILABLE_REASON_UNSPECIFIED", "VIDEO_UNAVAILABLE_REASON_PRIVATE", "VIDEO_UNAVAILABLE_REASON_DELETED"]).optional(),
  /** The YouTube video ID which can be searched on YouTube webpage. */
  id: z.string().optional(),
});

/**
 * Meta data of an image asset.
 */
export const ImageAsset = z.object({
  /** Metadata for this image at its original size. */
  fullSize: z.lazy(() => Dimensions).optional(),
  /** MIME type of the image asset. */
  mimeType: z.string().optional(),
  /** File size of the image asset in bytes. */
  fileSize: z.string().optional(),
});

/**
 * Dimensions.
 */
export const Dimensions = z.object({
  /** The height in pixels. */
  heightPixels: z.number().int().optional(),
  /** The width in pixels. */
  widthPixels: z.number().int().optional(),
});

/**
 * Details for an audio ad.
 */
export const AudioAd = z.object({
  /** The URL address loaded in the background for tracking purposes. */
  trackingUrl: z.string().optional(),
  /** The URL address of the webpage that people reach after they click the ad. */
  finalUrl: z.string().optional(),
  /** The YouTube video of the ad. */
  video: z.lazy(() => YoutubeVideoDetails).optional(),
  /** The webpage address that appears with the ad. */
  displayUrl: z.string().optional(),
});

/**
 * Details for a bumper ad.
 */
export const BumperAd = z.object({
  /** Common ad attributes. */
  commonInStreamAttribute: z.lazy(() => CommonInStreamAttribute).optional(),
});

/**
 * Additional URLs related to the ad, including beacons.
 */
export const AdUrl = z.object({
  /** The type of the Ad URL. */
  type: z.enum(["AD_URL_TYPE_UNSPECIFIED", "AD_URL_TYPE_BEACON_IMPRESSION", "AD_URL_TYPE_BEACON_EXPANDABLE_DCM_IMPRESSION", "AD_URL_TYPE_BEACON_CLICK", "AD_URL_TYPE_BEACON_SKIP"]).optional(),
  /** The URL string value. */
  url: z.string().optional(),
});

/**
 * Details for a Masthead Ad.
 */
export const MastheadAd = z.object({
  /** The duration of time the video will autoplay. */
  autoplayVideoDuration: z.string().optional(),
  /** The text on the call-to-action button. */
  callToActionButtonLabel: z.string().optional(),
  /** The headline of the ad. */
  headline: z.string().optional(),
  /** The tracking URL for the call-to-action button. */
  callToActionTrackingUrl: z.string().optional(),
  /** Whether to show a background or banner that appears at the top of a YouTube page */
  showChannelArt: z.boolean().optional(),
  /** The videos that appear next to the Masthead Ad on desktop. Can be no more than t */
  companionYoutubeVideos: z.array(z.lazy(() => YoutubeVideoDetails)).optional(),
  /** The aspect ratio of the autoplaying YouTube video on the Masthead. */
  videoAspectRatio: z.enum(["VIDEO_ASPECT_RATIO_UNSPECIFIED", "VIDEO_ASPECT_RATIO_WIDESCREEN", "VIDEO_ASPECT_RATIO_FIXED_16_9"]).optional(),
  /** The amount of time in milliseconds after which the video will start to play. */
  autoplayVideoStartMillisecond: z.string().optional(),
  /** The YouTube video used by the ad. */
  video: z.lazy(() => YoutubeVideoDetails).optional(),
  /** The description of the ad. */
  description: z.string().optional(),
  /** The destination URL for the call-to-action button. */
  callToActionFinalUrl: z.string().optional(),
});

/**
 * Details for a video discovery ad.
 */
export const VideoDiscoveryAd = z.object({
  /** The headline of ad. */
  headline: z.string().optional(),
  /** First text line for the ad. */
  description1: z.string().optional(),
  /** Second text line for the ad. */
  description2: z.string().optional(),
  /** The YouTube video the ad promotes. */
  video: z.lazy(() => YoutubeVideoDetails).optional(),
  /** Thumbnail image used in the ad. */
  thumbnail: z.enum(["THUMBNAIL_UNSPECIFIED", "THUMBNAIL_DEFAULT", "THUMBNAIL_1", "THUMBNAIL_2", "THUMBNAIL_3"]).optional(),
});

/**
 * Details for an in-stream ad.
 */
export const InStreamAd = z.object({
  /** The custom parameters to pass custom values to tracking URL template. */
  customParameters: z.record(z.string()).optional(),
  /** Common ad attributes. */
  commonInStreamAttribute: z.lazy(() => CommonInStreamAttribute).optional(),
});

/**
 * Details for a video performance ad.
 */
export const VideoPerformanceAd = z.object({
  /** The second piece after the domain in the display URL. */
  displayUrlBreadcrumb2: z.string().optional(),
  /** The list of descriptions shown on the call-to-action banner. */
  descriptions: z.array(z.string()).optional(),
  /** The domain of the display URL. */
  domain: z.string().optional(),
  /** The URL address of the webpage that people reach after they click the ad. */
  finalUrl: z.string().optional(),
  /** The custom parameters to pass custom values to tracking URL template. */
  customParameters: z.record(z.string()).optional(),
  /** The list of YouTube video assets used by this ad. */
  videos: z.array(z.lazy(() => YoutubeVideoDetails)).optional(),
  /** The URL address loaded in the background for tracking purposes. */
  trackingUrl: z.string().optional(),
  /** The list of text assets shown on the call-to-action button. */
  actionButtonLabels: z.array(z.string()).optional(),
  /** The list of headlines shown on the call-to-action banner. */
  headlines: z.array(z.string()).optional(),
  /** The list of companion banners used by this ad. */
  companionBanners: z.array(z.lazy(() => ImageAsset)).optional(),
  /** The first piece after the domain in the display URL. */
  displayUrlBreadcrumb1: z.string().optional(),
  /** The list of lone headlines shown on the call-to-action banner. */
  longHeadlines: z.array(z.string()).optional(),
});

/**
 * A single ad policy associated with an ad group ad.
 */
export const AdPolicy = z.object({
  /** The entries for each policy topic identified as relating to the ad. Each entry i */
  adPolicyTopicEntry: z.array(z.lazy(() => AdPolicyTopicEntry)).optional(),
  /** The policy approval status of an ad, indicating the approval decision. */
  adPolicyApprovalStatus: z.enum(["AD_POLICY_APPROVAL_STATUS_UNKNOWN", "DISAPPROVED", "APPROVED_LIMITED", "APPROVED", "AREA_OF_INTEREST_ONLY"]).optional(),
  /** The policy review status of an ad, indicating where in the review process the ad */
  adPolicyReviewStatus: z.enum(["AD_POLICY_REVIEW_STATUS_UNKNOWN", "REVIEW_IN_PROGRESS", "REVIEWED", "UNDER_APPEAL", "ELIGIBLE_MAY_SERVE"]).optional(),
});

/**
 * An entry describing how an ad has been identified as relating to an ad policy.
 */
export const AdPolicyTopicEntry = z.object({
  /** Ad policy help center link for the policy topic. */
  helpCenterLink: z.string().optional(),
  /** Localized label text for policy. Examples include "Trademarks in text", "Contain */
  policyLabel: z.string().optional(),
  /** The policy enforcement means used in the policy review. */
  policyEnforcementMeans: z.enum(["AD_POLICY_ENFORCEMENT_MEANS_UNKNOWN", "AUTOMATED", "HUMAN_REVIEW"]).optional(),
  /** The source of the policy decision. */
  policyDecisionType: z.enum(["AD_POLICY_DECISION_TYPE_UNKNOWN", "PURSUANT_TO_NOTICE", "GOOGLE_INVESTIGATION"]).optional(),
  /** The serving constraints relevant to the policy decision. */
  policyTopicConstraints: z.array(z.lazy(() => AdPolicyTopicConstraint)).optional(),
  /** How ad serving will be affected due to the relation to the ad policy topic. */
  policyTopicType: z.enum(["AD_POLICY_TOPIC_ENTRY_TYPE_UNKNOWN", "PROHIBITED", "FULLY_LIMITED", "LIMITED", "DESCRIPTIVE", "BROADENING", "AREA_OF_INTEREST_ONLY"]).optional(),
  /** Information on how to appeal the policy decision. */
  appealInfo: z.lazy(() => AdPolicyTopicAppealInfo).optional(),
  /** The policy topic. Examples include "TRADEMARKS", "ALCOHOL", etc. */
  policyTopic: z.string().optional(),
  /** A short summary description of the policy topic. */
  policyTopicDescription: z.string().optional(),
  /** The evidence used in the policy decision. */
  policyTopicEvidences: z.array(z.lazy(() => AdPolicyTopicEvidence)).optional(),
});

/**
 * Details on ad serving constraints.
 */
export const AdPolicyTopicConstraint = z.object({
  /** Link to the form to request a certificate for the constraint. */
  requestCertificateFormLink: z.string().optional(),
  /** Countries where the resource's domain is not covered by the certificates associa */
  certificateDomainMismatchCountryList: z.lazy(() => AdPolicyTopicConstraintAdPolicyCountryConstraintList).optional(),
  /** Reseller constraint. */
  resellerConstraint: z.lazy(() => AdPolicyTopicConstraintAdPolicyResellerConstraint).optional(),
  /** Countries where the ad cannot serve. */
  countryConstraint: z.lazy(() => AdPolicyTopicConstraintAdPolicyCountryConstraintList).optional(),
  /** Certificate is required to serve in any country. */
  globalCertificateMissing: z.lazy(() => AdPolicyTopicConstraintAdPolicyGlobalCertificateMissingConstraint).optional(),
  /** Countries where a certificate is required for serving. */
  certificateMissingCountryList: z.lazy(() => AdPolicyTopicConstraintAdPolicyCountryConstraintList).optional(),
  /** Certificate is required to serve in any country and the existing certificate doe */
  globalCertificateDomainMismatch: z.lazy(() => AdPolicyTopicConstraintAdPolicyGlobalCertificateDomainMismatchConstraint).optional(),
});

/**
 * A list of countries where the ad cannot serve due to policy constraints.
 */
export const AdPolicyTopicConstraintAdPolicyCountryConstraintList = z.object({
  /** Countries where the ad cannot serve. */
  countries: z.array(z.lazy(() => AdPolicyCriterionRestriction)).optional(),
});

/**
 * Represents a country restriction.
 */
export const AdPolicyCriterionRestriction = z.object({
  /** Localized name for the country. May be empty. */
  countryLabel: z.string().optional(),
  /** The country criterion id. */
  countryCriterionId: z.string().optional(),
});

/**
 * Policy topic was constrained due to disapproval of the website for reseller purposes.
 */
export const AdPolicyTopicConstraintAdPolicyResellerConstraint = z.object({});

/**
 * Certificate is required to serve in any country.
 */
export const AdPolicyTopicConstraintAdPolicyGlobalCertificateMissingConstraint = z.object({});

/**
 * Certificate is required to serve in any country and the existing certificate does not cover the ad's domain.
 */
export const AdPolicyTopicConstraintAdPolicyGlobalCertificateDomainMismatchConstraint = z.object({});

/**
 * Information on how to appeal a policy decision.
 */
export const AdPolicyTopicAppealInfo = z.object({
  /** Whether the decision can be appealed through a self-service appeal or an appeal  */
  appealType: z.enum(["AD_POLICY_APPEAL_TYPE_UNKNOWN", "SELF_SERVICE_APPEAL", "APPEAL_FORM"]).optional(),
  /** Only available when appeal_type is `APPEAL_FORM`. */
  appealFormLink: z.string().optional(),
});

/**
 * Evidence information used in the policy decision.
 */
export const AdPolicyTopicEvidence = z.object({
  /** A mismatch between the ad destination URLs. */
  destinationMismatch: z.lazy(() => AdPolicyTopicEvidenceDestinationMismatch).optional(),
  /** The language the ad was detected to be written in. This field uses IETF language */
  languageCode: z.string().optional(),
  /** HTTP code returned when the final URL was crawled. */
  httpCode: z.number().int().optional(),
  /** List of evidence found in the text of the ad. */
  textList: z.lazy(() => AdPolicyTopicEvidenceTextList).optional(),
  /** Trademark terms that caused a policy violation. */
  trademark: z.lazy(() => AdPolicyTopicEvidenceTrademark).optional(),
  /** Information on HTTP or DNS errors related to the ad destination. */
  destinationNotWorking: z.lazy(() => AdPolicyTopicEvidenceDestinationNotWorking).optional(),
  /** List of websites linked with the ad. */
  websiteList: z.lazy(() => AdPolicyTopicEvidenceWebsiteList).optional(),
  /** Legal related regulation enforcement that caused a policy violation. */
  legalRemoval: z.lazy(() => AdPolicyTopicEvidenceLegalRemoval).optional(),
  /** The text in the destination of the ad that is causing a policy violation. */
  destinationTextList: z.lazy(() => AdPolicyTopicEvidenceDestinationTextList).optional(),
  /** T&S proactive enforcement that caused a policy violation. */
  regionalRequirements: z.lazy(() => AdPolicyTopicEvidenceRegionalRequirements).optional(),
  /** Counterfeit enforcement that caused a policy violation. */
  counterfeit: z.lazy(() => AdPolicyTopicEvidenceCounterfeit).optional(),
});

/**
 * Details on a mismatch between destination URL types.
 */
export const AdPolicyTopicEvidenceDestinationMismatch = z.object({
  /** The set of URLs that do not match. The list can include single or multiple uri t */
  uriTypes: z.array(z.enum(["AD_POLICY_TOPIC_EVIDENCE_DESTINATION_MISMATCH_URL_TYPE_UNKNOWN", "DISPLAY_URL", "FINAL_URL", "FINAL_MOBILE_URL", "TRACKING_URL", "MOBILE_TRACKING_URL"])).optional(),
});

/**
 * A list of fragments of text that violated the policy.
 */
export const AdPolicyTopicEvidenceTextList = z.object({
  /** The fragments of text from the resource that caused the policy finding. */
  texts: z.array(z.string()).optional(),
});

/**
 * Trademark terms that caused a policy violation.
 */
export const AdPolicyTopicEvidenceTrademark = z.object({
  /** The trademark content owner. */
  owner: z.string().optional(),
  /** Countries where the policy violation is relevant. */
  countryRestrictions: z.array(z.lazy(() => AdPolicyCriterionRestriction)).optional(),
  /** The trademark term. */
  term: z.string().optional(),
});

/**
 * Details for on HTTP or DNS errors related to the ad destination.
 */
export const AdPolicyTopicEvidenceDestinationNotWorking = z.object({
  /** The HTTP error code. */
  httpErrorCode: z.string().optional(),
  /** The device where visiting the URL resulted in the error. */
  device: z.enum(["AD_POLICY_TOPIC_EVIDENCE_DESTINATION_NOT_WORKING_DEVICE_TYPE_UNKNOWN", "DESKTOP", "ANDROID", "IOS"]).optional(),
  /** The type of DNS error. */
  dnsErrorType: z.enum(["AD_POLICY_TOPIC_EVIDENCE_DESTINATION_NOT_WORKING_DNS_ERROR_TYPE_UNKNOWN", "HOSTNAME_NOT_FOUND", "GOOGLE_CRAWLER_DNS_ISSUE"]).optional(),
  /** The full URL that didn't work. */
  expandedUri: z.string().optional(),
  /** The last time the error was seen when navigating to URL. */
  lastCheckedTime: z.string().optional(),
});

/**
 * A list of websites that violated the policy.
 */
export const AdPolicyTopicEvidenceWebsiteList = z.object({
  /** Websites that caused the policy finding. */
  websites: z.array(z.string()).optional(),
});

/**
 * Legal related regulation enforcement, either from DMCA or local legal regulation.
 */
export const AdPolicyTopicEvidenceLegalRemoval = z.object({
  /** Details on the DMCA regulation legal removal. */
  dmca: z.lazy(() => AdPolicyTopicEvidenceLegalRemovalDmca).optional(),
  /** Details on the local legal regulation legal removal. */
  localLegal: z.lazy(() => AdPolicyTopicEvidenceLegalRemovalLocalLegal).optional(),
  /** The type of complaint causing the legal removal. */
  complaintType: z.enum(["AD_POLICY_TOPIC_EVIDENCE_LEGAL_REMOVAL_COMPLAINT_TYPE_UNKNOWN", "COPYRIGHT", "COURT_ORDER", "LOCAL_LEGAL"]).optional(),
  /** The urls restricted due to the legal removal. */
  restrictedUris: z.array(z.string()).optional(),
  /** The countries restricted due to the legal removal. */
  countryRestrictions: z.array(z.lazy(() => AdPolicyCriterionRestriction)).optional(),
});

/**
 * DMCA complaint details.
 */
export const AdPolicyTopicEvidenceLegalRemovalDmca = z.object({
  /** The entity who made the legal complaint. */
  complainant: z.string().optional(),
});

/**
 * Local legal regulation details.
 */
export const AdPolicyTopicEvidenceLegalRemovalLocalLegal = z.object({
  /** Type of law for the legal notice. */
  lawType: z.string().optional(),
});

/**
 * A list of destination text that violated the policy.
 */
export const AdPolicyTopicEvidenceDestinationTextList = z.object({
  /** Destination text that caused the policy finding. */
  destinationTexts: z.array(z.string()).optional(),
});

/**
 * Trust & Safety (T&S) proactive enforcement for policies meant to address regional requirements. This is considered a Google-owned investigation instead of a regulation notice since it's proactive T&S enforcement.
 */
export const AdPolicyTopicEvidenceRegionalRequirements = z.object({
  /** List of regional requirements. */
  regionalRequirementsEntries: z.array(z.lazy(() => AdPolicyTopicEvidenceRegionalRequirementsRegionalRequirementsEntry)).optional(),
});

/**
 * Policy level regional legal violation details.
 */
export const AdPolicyTopicEvidenceRegionalRequirementsRegionalRequirementsEntry = z.object({
  /** The legal policy that is being violated. */
  legalPolicy: z.string().optional(),
  /** The countries restricted due to the legal policy. */
  countryRestrictions: z.array(z.lazy(() => AdPolicyCriterionRestriction)).optional(),
});

/**
 * Details on the counterfeit enforcement that caused a policy violation.
 */
export const AdPolicyTopicEvidenceCounterfeit = z.object({
  /** The content or product owners that made a complaint. */
  owners: z.array(z.string()).optional(),
});

/**
 * The ad sourced from a DV360 creative.
 */
export const DisplayVideoSourceAd = z.object({
  /** The ID of the source creative. */
  creativeId: z.string().optional(),
});

/**
 * A single Creative.
 */
export const Creative = z.object({
  /** Optional. Indicates whether Integral Ad Science (IAS) campaign monitoring is ena */
  iasCampaignMonitoring: z.boolean().optional(),
  /** Optional. Counter events for a rich media creative. Counters track the number of */
  counterEvents: z.array(z.lazy(() => CounterEvent)).optional(),
  /** Output only. Indicates the third-party VAST tag creative requires HTML5 Video su */
  html5Video: z.boolean().optional(),
  /** Optional. Indicates that the creative will wait for a return ping for attributio */
  requirePingForAttribution: z.boolean().optional(),
  /** Output only. Indicates whether the creative is dynamic. */
  dynamic: z.boolean().optional(),
  /** Optional. Additional dimensions. Applicable when creative_type is one of: * `CRE */
  additionalDimensions: z.array(z.lazy(() => Dimensions)).optional(),
  /** Optional. The IDs of companion creatives for a video creative. You can assign ex */
  companionCreativeIds: z.array(z.string()).optional(),
  /** Output only. Indicates the third-party audio creative supports MP3. Output only  */
  mp3Audio: z.boolean().optional(),
  /** Output only. The unique ID of the creative. Assigned by the system. */
  creativeId: z.string().optional(),
  /** Optional. Indicates the creative will automatically expand on hover. Optional an */
  expandOnHover: z.boolean().optional(),
  /** Optional. Indicates that the creative relies on HTML5 to render properly. Option */
  requireHtml5: z.boolean().optional(),
  /** Optional. Specifies the expanding direction of the creative. Required and only v */
  expandingDirection: z.enum(["EXPANDING_DIRECTION_UNSPECIFIED", "EXPANDING_DIRECTION_NONE", "EXPANDING_DIRECTION_UP", "EXPANDING_DIRECTION_DOWN", "EXPANDING_DIRECTION_LEFT", "EXPANDING_DIRECTION_RIGHT", "EXPANDING_DIRECTION_UP_AND_LEFT", "EXPANDING_DIRECTION_UP_AND_RIGHT", "EXPANDING_DIRECTION_DOWN_AND_LEFT", "EXPANDING_DIRECTION_DOWN_AND_RIGHT", "EXPANDING_DIRECTION_UP_OR_DOWN", "EXPANDING_DIRECTION_LEFT_OR_RIGHT", "EXPANDING_DIRECTION_ANY_DIAGONAL"]).optional(),
  /** Required. The display name of the creative. Must be UTF-8 encoded with a maximum */
  displayName: z.string(),
  /** Required. Immutable. The type of the creative. */
  creativeType: z.enum(["CREATIVE_TYPE_UNSPECIFIED", "CREATIVE_TYPE_STANDARD", "CREATIVE_TYPE_EXPANDABLE", "CREATIVE_TYPE_VIDEO", "CREATIVE_TYPE_NATIVE", "CREATIVE_TYPE_TEMPLATED_APP_INSTALL", "CREATIVE_TYPE_NATIVE_SITE_SQUARE", "CREATIVE_TYPE_TEMPLATED_APP_INSTALL_INTERSTITIAL", "CREATIVE_TYPE_LIGHTBOX", "CREATIVE_TYPE_NATIVE_APP_INSTALL", "CREATIVE_TYPE_NATIVE_APP_INSTALL_SQUARE", "CREATIVE_TYPE_AUDIO", "CREATIVE_TYPE_PUBLISHER_HOSTED", "CREATIVE_TYPE_NATIVE_VIDEO", "CREATIVE_TYPE_TEMPLATED_APP_INSTALL_VIDEO", "CREATIVE_TYPE_ASSET_BASED_CREATIVE"]),
  /** Required. Controls whether or not the creative can serve. Accepted values are: * */
  entityStatus: z.enum(["ENTITY_STATUS_UNSPECIFIED", "ENTITY_STATUS_ACTIVE", "ENTITY_STATUS_ARCHIVED", "ENTITY_STATUS_DRAFT", "ENTITY_STATUS_PAUSED", "ENTITY_STATUS_SCHEDULED_FOR_DELETION"]),
  /** Output only. The timestamp when the creative was last updated, either by the use */
  updateTime: z.string().optional(),
  /** Output only. A list of attributes of the creative that is generated by the syste */
  creativeAttributes: z.array(z.enum(["CREATIVE_ATTRIBUTE_UNSPECIFIED", "CREATIVE_ATTRIBUTE_VAST", "CREATIVE_ATTRIBUTE_VPAID_LINEAR", "CREATIVE_ATTRIBUTE_VPAID_NON_LINEAR"])).optional(),
  /** Optional. The Campaign Manager 360 tracking ad associated with the creative. Opt */
  cmTrackingAd: z.lazy(() => CmTrackingAd).optional(),
  /** Output only. The IDs of the line items this creative is associated with. To asso */
  lineItemIds: z.array(z.string()).optional(),
  /** Required. Indicates where the creative is hosted. */
  hostingSource: z.enum(["HOSTING_SOURCE_UNSPECIFIED", "HOSTING_SOURCE_CM", "HOSTING_SOURCE_THIRD_PARTY", "HOSTING_SOURCE_HOSTED", "HOSTING_SOURCE_RICH_MEDIA"]),
  /** Optional. JavaScript measurement URL from supported third-party verification pro */
  jsTrackerUrl: z.string().optional(),
  /** Output only. The unique ID of the Campaign Manager 360 placement associated with */
  cmPlacementId: z.string().optional(),
  /** Optional. Indicates that the creative requires MRAID (Mobile Rich Media Ad Inter */
  requireMraid: z.boolean().optional(),
  /** Required. Primary dimensions of the creative. Applicable to all creative types.  */
  dimensions: z.lazy(() => Dimensions),
  /** Output only. The resource name of the creative. */
  name: z.string().optional(),
  /** Optional. User notes for this creative. Must be UTF-8 encoded with a length of n */
  notes: z.string().optional(),
  /** Optional. Tracking URLs for analytics providers or third-party ad technology ven */
  trackerUrls: z.array(z.string()).optional(),
  /** Optional. ID information used to link this creative to an external system. Must  */
  integrationCode: z.string().optional(),
  /** Output only. Media duration of the creative. Applicable when creative_type is on */
  mediaDuration: z.string().optional(),
  /** Optional. Amount of time to play the video before the skip button appears. This  */
  skipOffset: z.lazy(() => AudioVideoOffset).optional(),
  /** Output only. The unique ID of the advertiser the creative belongs to. */
  advertiserId: z.string().optional(),
  /** Optional. Amount of time to play the video before counting a view. This field is */
  progressOffset: z.lazy(() => AudioVideoOffset).optional(),
  /** Optional. Whether the user can choose to skip a video creative. This field is on */
  skippable: z.boolean().optional(),
  /** Output only. Audio/Video transcodes. Display & Video 360 transcodes the main ass */
  transcodes: z.array(z.lazy(() => Transcode)).optional(),
  /** Output only. The timestamp when the creative was created. Assigned by the system */
  createTime: z.string().optional(),
  /** Optional. Specifies the OBA icon for a video creative. This field is only suppor */
  obaIcon: z.lazy(() => ObaIcon).optional(),
  /** Optional. Tracking URLs from third parties to track interactions with a video cr */
  thirdPartyUrls: z.array(z.lazy(() => ThirdPartyUrl)).optional(),
  /** Output only. The current status of the creative review process. */
  reviewStatus: z.lazy(() => ReviewStatusInfo).optional(),
  /** Output only. Indicates the third-party VAST tag creative requires VPAID (Digital */
  vpaid: z.boolean().optional(),
  /** Optional. The URL of the VAST tag for a third-party VAST tag creative. Required  */
  vastTagUrl: z.string().optional(),
  /** Optional. Timer custom events for a rich media creative. Timers track the time d */
  timerEvents: z.array(z.lazy(() => TimerEvent)).optional(),
  /** Required. Assets associated to this creative. */
  assets: z.array(z.lazy(() => AssetAssociation)),
  /** Required. Exit events for this creative. An exit (also known as a click tag) is  */
  exitEvents: z.array(z.lazy(() => ExitEvent)),
  /** Optional. The original third-party tag used for the creative. Required and only  */
  thirdPartyTag: z.string().optional(),
  /** Optional. Third-party HTML tracking tag to be appended to the creative tag. */
  appendedTag: z.string().optional(),
  /** Optional. An optional creative identifier provided by a registry that is unique  */
  universalAdId: z.lazy(() => UniversalAdId).optional(),
  /** Output only. Indicates the third-party audio creative supports OGG. Output only  */
  oggAudio: z.boolean().optional(),
});

/**
 * Counter event of the creative.
 */
export const CounterEvent = z.object({
  /** Required. The name of the counter event. */
  name: z.string(),
  /** Required. The name used to identify this counter event in reports. */
  reportingName: z.string(),
});

/**
 * A Campaign Manager 360 tracking ad.
 */
export const CmTrackingAd = z.object({
  /** Optional. The ad ID of the campaign manager 360 tracking Ad. */
  cmAdId: z.string().optional(),
  /** Optional. The placement ID of the campaign manager 360 tracking Ad. */
  cmPlacementId: z.string().optional(),
  /** Optional. The creative ID of the campaign manager 360 tracking Ad. */
  cmCreativeId: z.string().optional(),
});

/**
 * The length an audio or a video has been played.
 */
export const AudioVideoOffset = z.object({
  /** Optional. The offset in percentage of the audio or video duration. */
  percentage: z.string().optional(),
  /** Optional. The offset in seconds from the start of the audio or video. */
  seconds: z.string().optional(),
});

/**
 * Represents information about the transcoded audio or video file.
 */
export const Transcode = z.object({
  /** Optional. The transcoding bit rate of the transcoded video, in kilobits per seco */
  bitRateKbps: z.string().optional(),
  /** Optional. The MIME type of the transcoded file. */
  mimeType: z.string().optional(),
  /** Optional. The size of the transcoded file, in bytes. */
  fileSizeBytes: z.string().optional(),
  /** Optional. The sample rate for the audio stream of the transcoded video, or the s */
  audioSampleRateHz: z.string().optional(),
  /** Optional. The frame rate of the transcoded video, in frames per second. */
  frameRate: z.number().optional(),
  /** Optional. Indicates if the transcoding was successful. */
  transcoded: z.boolean().optional(),
  /** Optional. The name of the transcoded file. */
  name: z.string().optional(),
  /** Optional. The bit rate for the audio stream of the transcoded video, or the bit  */
  audioBitRateKbps: z.string().optional(),
  /** Optional. The dimensions of the transcoded video. */
  dimensions: z.lazy(() => Dimensions).optional(),
});

/**
 * OBA Icon for a Creative
 */
export const ObaIcon = z.object({
  /** Optional. The dimensions of the OBA icon. */
  dimensions: z.lazy(() => Dimensions).optional(),
  /** Required. The click tracking URL of the OBA icon. Only URLs of the following dom */
  clickTrackingUrl: z.string(),
  /** Optional. The MIME type of the OBA icon resource. */
  resourceMimeType: z.string().optional(),
  /** Optional. The URL of the OBA icon resource. */
  resourceUrl: z.string().optional(),
  /** Optional. The program of the OBA icon. For example: “AdChoices”. */
  program: z.string().optional(),
  /** Optional. The position of the OBA icon on the creative. */
  position: z.enum(["OBA_ICON_POSITION_UNSPECIFIED", "OBA_ICON_POSITION_UPPER_RIGHT", "OBA_ICON_POSITION_UPPER_LEFT", "OBA_ICON_POSITION_LOWER_RIGHT", "OBA_ICON_POSITION_LOWER_LEFT"]).optional(),
  /** Required. The view tracking URL of the OBA icon. Only URLs of the following doma */
  viewTrackingUrl: z.string(),
  /** Required. The landing page URL of the OBA icon. Only URLs of the following domai */
  landingPageUrl: z.string(),
});

/**
 * Tracking URLs from third parties to track interactions with an audio or a video creative.
 */
export const ThirdPartyUrl = z.object({
  /** Optional. The type of interaction needs to be tracked by the tracking URL */
  type: z.enum(["THIRD_PARTY_URL_TYPE_UNSPECIFIED", "THIRD_PARTY_URL_TYPE_IMPRESSION", "THIRD_PARTY_URL_TYPE_CLICK_TRACKING", "THIRD_PARTY_URL_TYPE_AUDIO_VIDEO_START", "THIRD_PARTY_URL_TYPE_AUDIO_VIDEO_FIRST_QUARTILE", "THIRD_PARTY_URL_TYPE_AUDIO_VIDEO_MIDPOINT", "THIRD_PARTY_URL_TYPE_AUDIO_VIDEO_THIRD_QUARTILE", "THIRD_PARTY_URL_TYPE_AUDIO_VIDEO_COMPLETE", "THIRD_PARTY_URL_TYPE_AUDIO_VIDEO_MUTE", "THIRD_PARTY_URL_TYPE_AUDIO_VIDEO_PAUSE", "THIRD_PARTY_URL_TYPE_AUDIO_VIDEO_REWIND", "THIRD_PARTY_URL_TYPE_AUDIO_VIDEO_FULLSCREEN", "THIRD_PARTY_URL_TYPE_AUDIO_VIDEO_STOP", "THIRD_PARTY_URL_TYPE_AUDIO_VIDEO_CUSTOM", "THIRD_PARTY_URL_TYPE_AUDIO_VIDEO_SKIP", "THIRD_PARTY_URL_TYPE_AUDIO_VIDEO_PROGRESS"]).optional(),
  /** Optional. Tracking URL used to track the interaction. Provide a URL with optiona */
  url: z.string().optional(),
});

/**
 * Review statuses for the creative.
 */
export const ReviewStatusInfo = z.object({
  /** Exchange review statuses for the creative. */
  exchangeReviewStatuses: z.array(z.lazy(() => ExchangeReviewStatus)).optional(),
  /** Content and policy review status for the creative. */
  contentAndPolicyReviewStatus: z.enum(["REVIEW_STATUS_UNSPECIFIED", "REVIEW_STATUS_APPROVED", "REVIEW_STATUS_REJECTED", "REVIEW_STATUS_PENDING"]).optional(),
  /** Represents the basic approval needed for a creative to begin serving. Summary of */
  approvalStatus: z.enum(["APPROVAL_STATUS_UNSPECIFIED", "APPROVAL_STATUS_PENDING_NOT_SERVABLE", "APPROVAL_STATUS_PENDING_SERVABLE", "APPROVAL_STATUS_APPROVED_SERVABLE", "APPROVAL_STATUS_REJECTED_NOT_SERVABLE"]).optional(),
  /** Creative and landing page review status for the creative. */
  creativeAndLandingPageReviewStatus: z.enum(["REVIEW_STATUS_UNSPECIFIED", "REVIEW_STATUS_APPROVED", "REVIEW_STATUS_REJECTED", "REVIEW_STATUS_PENDING"]).optional(),
});

/**
 * Exchange review status for the creative.
 */
export const ExchangeReviewStatus = z.object({
  /** Status of the exchange review. */
  status: z.enum(["REVIEW_STATUS_UNSPECIFIED", "REVIEW_STATUS_APPROVED", "REVIEW_STATUS_REJECTED", "REVIEW_STATUS_PENDING"]).optional(),
  /** The exchange reviewing the creative. */
  exchange: z.enum(["EXCHANGE_UNSPECIFIED", "EXCHANGE_GOOGLE_AD_MANAGER", "EXCHANGE_APPNEXUS", "EXCHANGE_BRIGHTROLL", "EXCHANGE_ADFORM", "EXCHANGE_ADMETA", "EXCHANGE_ADMIXER", "EXCHANGE_ADSMOGO", "EXCHANGE_ADSWIZZ", "EXCHANGE_BIDSWITCH", "EXCHANGE_BRIGHTROLL_DISPLAY", "EXCHANGE_CADREON", "EXCHANGE_DAILYMOTION", "EXCHANGE_FIVE", "EXCHANGE_FLUCT", "EXCHANGE_FREEWHEEL", "EXCHANGE_GENIEE", "EXCHANGE_GUMGUM", "EXCHANGE_IMOBILE", "EXCHANGE_IBILLBOARD", "EXCHANGE_IMPROVE_DIGITAL", "EXCHANGE_INDEX", "EXCHANGE_KARGO", "EXCHANGE_MICROAD", "EXCHANGE_MOPUB", "EXCHANGE_NEND", "EXCHANGE_ONE_BY_AOL_DISPLAY", "EXCHANGE_ONE_BY_AOL_MOBILE", "EXCHANGE_ONE_BY_AOL_VIDEO", "EXCHANGE_OOYALA", "EXCHANGE_OPENX", "EXCHANGE_PERMODO", "EXCHANGE_PLATFORMONE", "EXCHANGE_PLATFORMID", "EXCHANGE_PUBMATIC", "EXCHANGE_PULSEPOINT", "EXCHANGE_REVENUEMAX", "EXCHANGE_RUBICON", "EXCHANGE_SMARTCLIP", "EXCHANGE_SMARTRTB", "EXCHANGE_SMARTSTREAMTV", "EXCHANGE_SOVRN", "EXCHANGE_SPOTXCHANGE", "EXCHANGE_STROER", "EXCHANGE_TEADSTV", "EXCHANGE_TELARIA", "EXCHANGE_TVN", "EXCHANGE_UNITED", "EXCHANGE_YIELDLAB", "EXCHANGE_YIELDMO", "EXCHANGE_UNRULYX", "EXCHANGE_OPEN8", "EXCHANGE_TRITON", "EXCHANGE_TRIPLELIFT", "EXCHANGE_TABOOLA", "EXCHANGE_INMOBI", "EXCHANGE_SMAATO", "EXCHANGE_AJA", "EXCHANGE_SUPERSHIP", "EXCHANGE_NEXSTAR_DIGITAL", "EXCHANGE_WAZE", "EXCHANGE_SOUNDCAST", "EXCHANGE_SHARETHROUGH", "EXCHANGE_FYBER", "EXCHANGE_RED_FOR_PUBLISHERS", "EXCHANGE_MEDIANET", "EXCHANGE_TAPJOY", "EXCHANGE_VISTAR", "EXCHANGE_DAX", "EXCHANGE_JCD", "EXCHANGE_PLACE_EXCHANGE", "EXCHANGE_APPLOVIN", "EXCHANGE_CONNATIX", "EXCHANGE_RESET_DIGITAL", "EXCHANGE_HIVESTACK", "EXCHANGE_DRAX", "EXCHANGE_APPLOVIN_GBID", "EXCHANGE_FYBER_GBID", "EXCHANGE_UNITY_GBID", "EXCHANGE_CHARTBOOST_GBID", "EXCHANGE_ADMOST_GBID", "EXCHANGE_TOPON_GBID", "EXCHANGE_NETFLIX", "EXCHANGE_CORE", "EXCHANGE_COMMERCE_GRID", "EXCHANGE_SPOTIFY", "EXCHANGE_TUBI", "EXCHANGE_SNAP", "EXCHANGE_CADENT"]).optional(),
});

/**
 * Timer event of the creative.
 */
export const TimerEvent = z.object({
  /** Required. The name of the timer event. */
  name: z.string(),
  /** Required. The name used to identify this timer event in reports. */
  reportingName: z.string(),
});

/**
 * Asset association for the creative.
 */
export const AssetAssociation = z.object({
  /** Optional. The associated asset. */
  asset: z.lazy(() => Asset).optional(),
  /** Optional. The role of this asset for the creative. */
  role: z.enum(["ASSET_ROLE_UNSPECIFIED", "ASSET_ROLE_MAIN", "ASSET_ROLE_BACKUP", "ASSET_ROLE_POLITE_LOAD", "ASSET_ROLE_HEADLINE", "ASSET_ROLE_LONG_HEADLINE", "ASSET_ROLE_BODY", "ASSET_ROLE_LONG_BODY", "ASSET_ROLE_CAPTION_URL", "ASSET_ROLE_CALL_TO_ACTION", "ASSET_ROLE_ADVERTISER_NAME", "ASSET_ROLE_PRICE", "ASSET_ROLE_ANDROID_APP_ID", "ASSET_ROLE_IOS_APP_ID", "ASSET_ROLE_RATING", "ASSET_ROLE_ICON", "ASSET_ROLE_COVER_IMAGE", "ASSET_ROLE_BACKGROUND_COLOR", "ASSET_ROLE_ACCENT_COLOR", "ASSET_ROLE_REQUIRE_LOGO", "ASSET_ROLE_REQUIRE_IMAGE", "ASSET_ROLE_ENABLE_ASSET_ENHANCEMENTS"]).optional(),
});

/**
 * A single asset.
 */
export const Asset = z.object({
  /** Media ID of the uploaded asset. This is a unique identifier for the asset. This  */
  mediaId: z.string().optional(),
  /** The asset content. For uploaded assets, the content is the serving path. */
  content: z.string().optional(),
});

/**
 * Exit event of the creative.
 */
export const ExitEvent = z.object({
  /** Required. The type of the exit event. */
  type: z.enum(["EXIT_EVENT_TYPE_UNSPECIFIED", "EXIT_EVENT_TYPE_DEFAULT", "EXIT_EVENT_TYPE_BACKUP"]),
  /** Optional. The name used to identify this event in reports. Leave it empty or uns */
  reportingName: z.string().optional(),
  /** Optional. The name of the click tag of the exit event. The name must be unique w */
  name: z.string().optional(),
  /** Required. The click through URL of the exit event. This is required when type is */
  url: z.string(),
});

/**
 * A creative identifier provided by a registry that is unique across all platforms. This is part of the VAST 4.0 standard.
 */
export const UniversalAdId = z.object({
  /** Optional. The unique creative identifier. */
  id: z.string().optional(),
  /** Optional. The registry provides unique creative identifiers. */
  registry: z.enum(["UNIVERSAL_AD_REGISTRY_UNSPECIFIED", "UNIVERSAL_AD_REGISTRY_OTHER", "UNIVERSAL_AD_REGISTRY_AD_ID", "UNIVERSAL_AD_REGISTRY_CLEARCAST", "UNIVERSAL_AD_REGISTRY_DV360", "UNIVERSAL_AD_REGISTRY_CM"]).optional(),
});

/**
 * A single custom bidding algorithm.
 */
export const CustomBiddingAlgorithm = z.object({
  /** Output only. The resource name of the custom bidding algorithm. */
  name: z.string().optional(),
  /** Immutable. The unique ID of the partner that owns the custom bidding algorithm. */
  partnerId: z.string().optional(),
  /** Required. The display name of the custom bidding algorithm. Must be UTF-8 encode */
  displayName: z.string(),
  /** Output only. The unique ID of the custom bidding algorithm. Assigned by the syst */
  customBiddingAlgorithmId: z.string().optional(),
  /** The IDs of the advertisers who have access to this algorithm. If advertiser_id i */
  sharedAdvertiserIds: z.array(z.string()).optional(),
  /** Immutable. The unique ID of the advertiser that owns the custom bidding algorith */
  advertiserId: z.string().optional(),
  /** Required. Immutable. The type of custom bidding algorithm. */
  customBiddingAlgorithmType: z.enum(["CUSTOM_BIDDING_ALGORITHM_TYPE_UNSPECIFIED", "SCRIPT_BASED", "RULE_BASED"]),
  /** Optional. Immutable. Designates the third party optimization partner that manage */
  thirdPartyOptimizationPartner: z.enum(["UNKNOWN", "SCIBIDS", "ADELAIDE"]).optional(),
  /** Output only. The details of custom bidding models for each advertiser who has ac */
  modelDetails: z.array(z.lazy(() => CustomBiddingModelDetails)).optional(),
  /** Controls whether or not the custom bidding algorithm can be used as a bidding st */
  entityStatus: z.enum(["ENTITY_STATUS_UNSPECIFIED", "ENTITY_STATUS_ACTIVE", "ENTITY_STATUS_ARCHIVED", "ENTITY_STATUS_DRAFT", "ENTITY_STATUS_PAUSED", "ENTITY_STATUS_SCHEDULED_FOR_DELETION"]).optional(),
});

/**
 * The details of a custom bidding algorithm model for a single shared advertiser.
 */
export const CustomBiddingModelDetails = z.object({
  /** The readiness state of custom bidding model. */
  readinessState: z.enum(["READINESS_STATE_UNSPECIFIED", "READINESS_STATE_ACTIVE", "READINESS_STATE_INSUFFICIENT_DATA", "READINESS_STATE_TRAINING", "READINESS_STATE_NO_VALID_SCRIPT", "READINESS_STATE_EVALUATION_FAILURE"]).optional(),
  /** Output only. The suspension state of custom bidding model. */
  suspensionState: z.enum(["SUSPENSION_STATE_UNSPECIFIED", "SUSPENSION_STATE_ENABLED", "SUSPENSION_STATE_DORMANT", "SUSPENSION_STATE_SUSPENDED"]).optional(),
  /** The unique ID of the relevant advertiser. */
  advertiserId: z.string().optional(),
});

export const ListPartnersResponse = z.object({
  /** The list of partners. This list will be absent if empty. */
  partners: z.array(z.lazy(() => Partner)).optional(),
  /** A token to retrieve the next page of results. Pass this value in the page_token  */
  nextPageToken: z.string().optional(),
});

export const ListAdvertisersResponse = z.object({
  /** A token to retrieve the next page of results. Pass this value in the page_token  */
  nextPageToken: z.string().optional(),
  /** The list of advertisers. This list will be absent if empty. */
  advertisers: z.array(z.lazy(() => Advertiser)).optional(),
});

export const ListCampaignsResponse = z.object({
  /** The list of campaigns. This list will be absent if empty. */
  campaigns: z.array(z.lazy(() => Campaign)).optional(),
  /** A token to retrieve the next page of results. Pass this value in the page_token  */
  nextPageToken: z.string().optional(),
});

export const ListInsertionOrdersResponse = z.object({
  /** The list of insertion orders. This list will be absent if empty. */
  insertionOrders: z.array(z.lazy(() => InsertionOrder)).optional(),
  /** A token to retrieve the next page of results. Pass this value in the page_token  */
  nextPageToken: z.string().optional(),
});

export const ListLineItemsResponse = z.object({
  /** The list of line items. This list will be absent if empty. */
  lineItems: z.array(z.lazy(() => LineItem)).optional(),
  /** A token to retrieve the next page of results. Pass this value in the page_token  */
  nextPageToken: z.string().optional(),
});

export const ListAdGroupsResponse = z.object({
  /** A token to retrieve the next page of results. Pass this value in the page_token  */
  nextPageToken: z.string().optional(),
  /** The list of ad groups. This list will be absent if empty. */
  adGroups: z.array(z.lazy(() => AdGroup)).optional(),
});

export const ListAdGroupAdsResponse = z.object({
  /** The list of ad group ads. This list will be absent if empty. */
  adGroupAds: z.array(z.lazy(() => AdGroupAd)).optional(),
  /** A token to retrieve the next page of results. Pass this value in the page_token  */
  nextPageToken: z.string().optional(),
});

export const ListCreativesResponse = z.object({
  /** A token to retrieve the next page of results. Pass this value in the page_token  */
  nextPageToken: z.string().optional(),
  /** The list of creatives. This list will be absent if empty. */
  creatives: z.array(z.lazy(() => Creative)).optional(),
});

export const ListCustomBiddingAlgorithmsResponse = z.object({
  /** The list of custom bidding algorithms. This list will be absent if empty. */
  customBiddingAlgorithms: z.array(z.lazy(() => CustomBiddingAlgorithm)).optional(),
  /** A token to retrieve the next page of results. Pass this value in the page_token  */
  nextPageToken: z.string().optional(),
});

/**
 * A single assigned targeting option, which defines the state of a targeting option for an entity with targeting settings.
 */
export const AssignedTargetingOption = z.object({
  /** Content duration details. This field will be populated when the targeting_type i */
  contentDurationDetails: z.lazy(() => ContentDurationAssignedTargetingOptionDetails).optional(),
  /** Device Type details. This field will be populated when the targeting_type is `TA */
  deviceTypeDetails: z.lazy(() => DeviceTypeAssignedTargetingOptionDetails).optional(),
  /** YouTube video details. This field will be populated when the targeting_type is ` */
  youtubeVideoDetails: z.lazy(() => YoutubeVideoAssignedTargetingOptionDetails).optional(),
  /** Open Measurement enabled inventory details. This field will be populated when th */
  omidDetails: z.lazy(() => OmidAssignedTargetingOptionDetails).optional(),
  /** Category details. This field will be populated when the targeting_type is `TARGE */
  categoryDetails: z.lazy(() => CategoryAssignedTargetingOptionDetails).optional(),
  /** Gender details. This field will be populated when the targeting_type is `TARGETI */
  genderDetails: z.lazy(() => GenderAssignedTargetingOptionDetails).optional(),
  /** Digital content label details. This field will be populated when the targeting_t */
  digitalContentLabelExclusionDetails: z.lazy(() => DigitalContentLabelAssignedTargetingOptionDetails).optional(),
  /** Audience targeting details. This field will be populated when the targeting_type */
  audienceGroupDetails: z.lazy(() => AudienceGroupAssignedTargetingOptionDetails).optional(),
  /** Authorized seller status details. This field will be populated when the targetin */
  authorizedSellerStatusDetails: z.lazy(() => AuthorizedSellerStatusAssignedTargetingOptionDetails).optional(),
  /** Content instream position details. This field will be populated when the targeti */
  contentInstreamPositionDetails: z.lazy(() => ContentInstreamPositionAssignedTargetingOptionDetails).optional(),
  /** Carrier and ISP details. This field will be populated when the targeting_type is */
  carrierAndIspDetails: z.lazy(() => CarrierAndIspAssignedTargetingOptionDetails).optional(),
  /** Output only. An alias for the assigned_targeting_option_id. This value can be us */
  assignedTargetingOptionIdAlias: z.string().optional(),
  /** YouTube channel details. This field will be populated when the targeting_type is */
  youtubeChannelDetails: z.lazy(() => YoutubeChannelAssignedTargetingOptionDetails).optional(),
  /** Proximity location list details. This field will be populated when the targeting */
  proximityLocationListDetails: z.lazy(() => ProximityLocationListAssignedTargetingOptionDetails).optional(),
  /** Inventory source group details. This field will be populated when the targeting_ */
  inventorySourceGroupDetails: z.lazy(() => InventorySourceGroupAssignedTargetingOptionDetails).optional(),
  /** Content outstream position details. This field will be populated when the target */
  contentOutstreamPositionDetails: z.lazy(() => ContentOutstreamPositionAssignedTargetingOptionDetails).optional(),
  /** Viewability details. This field will be populated when the targeting_type is `TA */
  viewabilityDetails: z.lazy(() => ViewabilityAssignedTargetingOptionDetails).optional(),
  /** Language details. This field will be populated when the targeting_type is `TARGE */
  languageDetails: z.lazy(() => LanguageAssignedTargetingOptionDetails).optional(),
  /** Keyword details. This field will be populated when the targeting_type is `TARGET */
  keywordDetails: z.lazy(() => KeywordAssignedTargetingOptionDetails).optional(),
  /** Parental status details. This field will be populated when the targeting_type is */
  parentalStatusDetails: z.lazy(() => ParentalStatusAssignedTargetingOptionDetails).optional(),
  /** Content theme details. This field will be populated when the targeting_type is ` */
  contentThemeExclusionDetails: z.lazy(() => ContentThemeAssignedTargetingOptionDetails).optional(),
  /** Native content position details. This field will be populated when the targeting */
  nativeContentPositionDetails: z.lazy(() => NativeContentPositionAssignedTargetingOptionDetails).optional(),
  /** Output only. The inheritance status of the assigned targeting option. */
  inheritance: z.enum(["INHERITANCE_UNSPECIFIED", "NOT_INHERITED", "INHERITED_FROM_PARTNER", "INHERITED_FROM_ADVERTISER"]).optional(),
  /** Browser details. This field will be populated when the targeting_type is `TARGET */
  browserDetails: z.lazy(() => BrowserAssignedTargetingOptionDetails).optional(),
  /** Keyword details. This field will be populated when the targeting_type is `TARGET */
  negativeKeywordListDetails: z.lazy(() => NegativeKeywordListAssignedTargetingOptionDetails).optional(),
  /** Business chain details. This field will be populated when the targeting_type is  */
  businessChainDetails: z.lazy(() => BusinessChainAssignedTargetingOptionDetails).optional(),
  /** Audio content type details. This field will be populated when the targeting_type */
  audioContentTypeDetails: z.lazy(() => AudioContentTypeAssignedTargetingOptionDetails).optional(),
  /** Output only. The resource name for this assigned targeting option. */
  name: z.string().optional(),
  /** POI details. This field will be populated when the targeting_type is `TARGETING_ */
  poiDetails: z.lazy(() => PoiAssignedTargetingOptionDetails).optional(),
  /** Video player size details. This field will be populated when the targeting_type  */
  videoPlayerSizeDetails: z.lazy(() => VideoPlayerSizeAssignedTargetingOptionDetails).optional(),
  /** Age range details. This field will be populated when the targeting_type is `TARG */
  ageRangeDetails: z.lazy(() => AgeRangeAssignedTargetingOptionDetails).optional(),
  /** App category details. This field will be populated when the targeting_type is `T */
  appCategoryDetails: z.lazy(() => AppCategoryAssignedTargetingOptionDetails).optional(),
  /** Geographic region details. This field will be populated when the targeting_type  */
  geoRegionDetails: z.lazy(() => GeoRegionAssignedTargetingOptionDetails).optional(),
  /** Content duration details. This field will be populated when the TargetingType is */
  contentStreamTypeDetails: z.lazy(() => ContentStreamTypeAssignedTargetingOptionDetails).optional(),
  /** On screen position details. This field will be populated when the targeting_type */
  onScreenPositionDetails: z.lazy(() => OnScreenPositionAssignedTargetingOptionDetails).optional(),
  /** Sensitive category details. This field will be populated when the targeting_type */
  sensitiveCategoryExclusionDetails: z.lazy(() => SensitiveCategoryAssignedTargetingOptionDetails).optional(),
  /** Inventory source details. This field will be populated when the targeting_type i */
  inventorySourceDetails: z.lazy(() => InventorySourceAssignedTargetingOptionDetails).optional(),
  /** User rewarded content details. This field will be populated when the targeting_t */
  userRewardedContentDetails: z.lazy(() => UserRewardedContentAssignedTargetingOptionDetails).optional(),
  /** Device make and model details. This field will be populated when the targeting_t */
  deviceMakeModelDetails: z.lazy(() => DeviceMakeModelAssignedTargetingOptionDetails).optional(),
  /** Environment details. This field will be populated when the targeting_type is `TA */
  environmentDetails: z.lazy(() => EnvironmentAssignedTargetingOptionDetails).optional(),
  /** Operating system details. This field will be populated when the targeting_type i */
  operatingSystemDetails: z.lazy(() => OperatingSystemAssignedTargetingOptionDetails).optional(),
  /** Regional location list details. This field will be populated when the targeting_ */
  regionalLocationListDetails: z.lazy(() => RegionalLocationListAssignedTargetingOptionDetails).optional(),
  /** App details. This field will be populated when the targeting_type is `TARGETING_ */
  appDetails: z.lazy(() => AppAssignedTargetingOptionDetails).optional(),
  /** Exchange details. This field will be populated when the targeting_type is `TARGE */
  exchangeDetails: z.lazy(() => ExchangeAssignedTargetingOptionDetails).optional(),
  /** URL details. This field will be populated when the targeting_type is `TARGETING_ */
  urlDetails: z.lazy(() => UrlAssignedTargetingOptionDetails).optional(),
  /** Household income details. This field will be populated when the targeting_type i */
  householdIncomeDetails: z.lazy(() => HouseholdIncomeAssignedTargetingOptionDetails).optional(),
  /** Channel details. This field will be populated when the targeting_type is `TARGET */
  channelDetails: z.lazy(() => ChannelAssignedTargetingOptionDetails).optional(),
  /** Sub-exchange details. This field will be populated when the targeting_type is `T */
  subExchangeDetails: z.lazy(() => SubExchangeAssignedTargetingOptionDetails).optional(),
  /** Day and time details. This field will be populated when the targeting_type is `T */
  dayAndTimeDetails: z.lazy(() => DayAndTimeAssignedTargetingOptionDetails).optional(),
  /** Output only. Identifies the type of this assigned targeting option. */
  targetingType: z.enum(["TARGETING_TYPE_UNSPECIFIED", "TARGETING_TYPE_CHANNEL", "TARGETING_TYPE_APP_CATEGORY", "TARGETING_TYPE_APP", "TARGETING_TYPE_URL", "TARGETING_TYPE_DAY_AND_TIME", "TARGETING_TYPE_AGE_RANGE", "TARGETING_TYPE_REGIONAL_LOCATION_LIST", "TARGETING_TYPE_PROXIMITY_LOCATION_LIST", "TARGETING_TYPE_GENDER", "TARGETING_TYPE_VIDEO_PLAYER_SIZE", "TARGETING_TYPE_USER_REWARDED_CONTENT", "TARGETING_TYPE_PARENTAL_STATUS", "TARGETING_TYPE_CONTENT_INSTREAM_POSITION", "TARGETING_TYPE_CONTENT_OUTSTREAM_POSITION", "TARGETING_TYPE_DEVICE_TYPE", "TARGETING_TYPE_AUDIENCE_GROUP", "TARGETING_TYPE_BROWSER", "TARGETING_TYPE_HOUSEHOLD_INCOME", "TARGETING_TYPE_ON_SCREEN_POSITION", "TARGETING_TYPE_THIRD_PARTY_VERIFIER", "TARGETING_TYPE_DIGITAL_CONTENT_LABEL_EXCLUSION", "TARGETING_TYPE_SENSITIVE_CATEGORY_EXCLUSION", "TARGETING_TYPE_ENVIRONMENT", "TARGETING_TYPE_CARRIER_AND_ISP", "TARGETING_TYPE_OPERATING_SYSTEM", "TARGETING_TYPE_DEVICE_MAKE_MODEL", "TARGETING_TYPE_KEYWORD", "TARGETING_TYPE_NEGATIVE_KEYWORD_LIST", "TARGETING_TYPE_VIEWABILITY", "TARGETING_TYPE_CATEGORY", "TARGETING_TYPE_INVENTORY_SOURCE", "TARGETING_TYPE_LANGUAGE", "TARGETING_TYPE_AUTHORIZED_SELLER_STATUS", "TARGETING_TYPE_GEO_REGION", "TARGETING_TYPE_INVENTORY_SOURCE_GROUP", "TARGETING_TYPE_EXCHANGE", "TARGETING_TYPE_SUB_EXCHANGE", "TARGETING_TYPE_POI", "TARGETING_TYPE_BUSINESS_CHAIN", "TARGETING_TYPE_CONTENT_DURATION", "TARGETING_TYPE_CONTENT_STREAM_TYPE", "TARGETING_TYPE_NATIVE_CONTENT_POSITION", "TARGETING_TYPE_OMID", "TARGETING_TYPE_AUDIO_CONTENT_TYPE", "TARGETING_TYPE_CONTENT_GENRE", "TARGETING_TYPE_YOUTUBE_VIDEO", "TARGETING_TYPE_YOUTUBE_CHANNEL", "TARGETING_TYPE_SESSION_POSITION", "TARGETING_TYPE_CONTENT_THEME_EXCLUSION"]).optional(),
  /** Output only. The unique ID of the assigned targeting option. The ID is only uniq */
  assignedTargetingOptionId: z.string().optional(),
  /** Content genre details. This field will be populated when the targeting_type is ` */
  contentGenreDetails: z.lazy(() => ContentGenreAssignedTargetingOptionDetails).optional(),
  /** Third party verification details. This field will be populated when the targetin */
  thirdPartyVerifierDetails: z.lazy(() => ThirdPartyVerifierAssignedTargetingOptionDetails).optional(),
  /** Session position details. This field will be populated when the targeting_type i */
  sessionPositionDetails: z.lazy(() => SessionPositionAssignedTargetingOptionDetails).optional(),
});

/**
 * Details for content duration assigned targeting option. This will be populated in the content_duration_details field when targeting_type is `TARGETING_TYPE_CONTENT_DURATION`. Explicitly targeting all options is not supported. Remove all content duration targeting options to achieve this effect.
 */
export const ContentDurationAssignedTargetingOptionDetails = z.object({
  /** Required. The targeting_option_id field when targeting_type is `TARGETING_TYPE_C */
  targetingOptionId: z.string(),
  /** Output only. The content duration. */
  contentDuration: z.enum(["CONTENT_DURATION_UNSPECIFIED", "CONTENT_DURATION_UNKNOWN", "CONTENT_DURATION_0_TO_1_MIN", "CONTENT_DURATION_1_TO_5_MIN", "CONTENT_DURATION_5_TO_15_MIN", "CONTENT_DURATION_15_TO_30_MIN", "CONTENT_DURATION_30_TO_60_MIN", "CONTENT_DURATION_OVER_60_MIN"]).optional(),
});

/**
 * Targeting details for device type. This will be populated in the details field of an AssignedTargetingOption when targeting_type is `TARGETING_TYPE_DEVICE_TYPE`.
 */
export const DeviceTypeAssignedTargetingOptionDetails = z.object({
  /** Output only. Bid multiplier allows you to show your ads more or less frequently  */
  youtubeAndPartnersBidMultiplier: z.number().optional(),
  /** Required. The display name of the device type. */
  deviceType: z.enum(["DEVICE_TYPE_UNSPECIFIED", "DEVICE_TYPE_COMPUTER", "DEVICE_TYPE_CONNECTED_TV", "DEVICE_TYPE_SMART_PHONE", "DEVICE_TYPE_TABLET", "DEVICE_TYPE_CONNECTED_DEVICE"]),
});

/**
 * Details for YouTube video assigned targeting option. This will be populated in the youtube_video_details field when targeting_type is `TARGETING_TYPE_YOUTUBE_VIDEO`.
 */
export const YoutubeVideoAssignedTargetingOptionDetails = z.object({
  /** Indicates if this option is being negatively targeted. */
  negative: z.boolean().optional(),
  /** YouTube video id as it appears on the YouTube watch page. */
  videoId: z.string().optional(),
});

/**
 * Represents a targetable Open Measurement enabled inventory type. This will be populated in the details field of an AssignedTargetingOption when targeting_type is `TARGETING_TYPE_OMID`.
 */
export const OmidAssignedTargetingOptionDetails = z.object({
  /** Required. The type of Open Measurement enabled inventory. */
  omid: z.enum(["OMID_UNSPECIFIED", "OMID_FOR_MOBILE_DISPLAY_ADS"]),
});

/**
 * Assigned category targeting option details. This will be populated in the category_details field when targeting_type is `TARGETING_TYPE_CATEGORY`.
 */
export const CategoryAssignedTargetingOptionDetails = z.object({
  /** Indicates if this option is being negatively targeted. */
  negative: z.boolean().optional(),
  /** Output only. The display name of the category. */
  displayName: z.string().optional(),
  /** Required. The targeting_option_id field when targeting_type is `TARGETING_TYPE_C */
  targetingOptionId: z.string(),
});

/**
 * Details for assigned gender targeting option. This will be populated in the details field of an AssignedTargetingOption when targeting_type is `TARGETING_TYPE_GENDER`.
 */
export const GenderAssignedTargetingOptionDetails = z.object({
  /** Required. The gender of the audience. */
  gender: z.enum(["GENDER_UNSPECIFIED", "GENDER_MALE", "GENDER_FEMALE", "GENDER_UNKNOWN"]),
});

/**
 * Targeting details for digital content label. This will be populated in the details field of an AssignedTargetingOption when targeting_type is `TARGETING_TYPE_DIGITAL_CONTENT_LABEL_EXCLUSION`.
 */
export const DigitalContentLabelAssignedTargetingOptionDetails = z.object({
  /** Required. The display name of the digital content label rating tier to be EXCLUD */
  excludedContentRatingTier: z.enum(["CONTENT_RATING_TIER_UNSPECIFIED", "CONTENT_RATING_TIER_UNRATED", "CONTENT_RATING_TIER_GENERAL", "CONTENT_RATING_TIER_PARENTAL_GUIDANCE", "CONTENT_RATING_TIER_TEENS", "CONTENT_RATING_TIER_MATURE", "CONTENT_RATING_TIER_FAMILIES"]),
});

/**
 * Assigned audience group targeting option details. This will be populated in the details field of an AssignedTargetingOption when targeting_type is `TARGETING_TYPE_AUDIENCE_GROUP`. The relation between each group is UNION, except for excluded_first_and_third_party_audience_group and excluded_google_audience_group, of which COMPLEMENT is used as an INTERSECTION with other groups.
 */
export const AudienceGroupAssignedTargetingOptionDetails = z.object({
  /** Optional. The custom list ids of the included custom list group. Contains custom */
  includedCustomListGroup: z.lazy(() => CustomListGroup).optional(),
  /** Optional. The Google audience ids of the excluded Google audience group. Used fo */
  excludedGoogleAudienceGroup: z.lazy(() => GoogleAudienceGroup).optional(),
  /** Optional. The first party and partner audience ids and recencies of the excluded */
  excludedFirstPartyAndPartnerAudienceGroup: z.lazy(() => FirstPartyAndPartnerAudienceGroup).optional(),
  /** Optional. The Google audience ids of the included Google audience group. Contain */
  includedGoogleAudienceGroup: z.lazy(() => GoogleAudienceGroup).optional(),
  /** Optional. The first party and partner audience ids and recencies of included fir */
  includedFirstPartyAndPartnerAudienceGroups: z.array(z.lazy(() => FirstPartyAndPartnerAudienceGroup)).optional(),
  /** Optional. The combined audience ids of the included combined audience group. Con */
  includedCombinedAudienceGroup: z.lazy(() => CombinedAudienceGroup).optional(),
});

/**
 * Details of custom list group. All custom list targeting settings are logically ‘OR’ of each other.
 */
export const CustomListGroup = z.object({
  /** Required. All custom list targeting settings in custom list group. Repeated sett */
  settings: z.array(z.lazy(() => CustomListTargetingSetting)),
});

/**
 * Details of custom list targeting setting.
 */
export const CustomListTargetingSetting = z.object({
  /** Required. Custom id of custom list targeting setting. This id is custom_list_id. */
  customListId: z.string(),
});

/**
 * Details of Google audience group. All Google audience targeting settings are logically ‘OR’ of each other.
 */
export const GoogleAudienceGroup = z.object({
  /** Required. All Google audience targeting settings in Google audience group. Repea */
  settings: z.array(z.lazy(() => GoogleAudienceTargetingSetting)),
});

/**
 * Details of Google audience targeting setting.
 */
export const GoogleAudienceTargetingSetting = z.object({
  /** Required. Google audience id of the Google audience targeting setting. This id i */
  googleAudienceId: z.string(),
});

/**
 * Details of first party and partner audience group. All first party and partner audience targeting settings are logically ‘OR’ of each other.
 */
export const FirstPartyAndPartnerAudienceGroup = z.object({
  /** Required. All first party and partner audience targeting settings in first party */
  settings: z.array(z.lazy(() => FirstPartyAndPartnerAudienceTargetingSetting)),
});

/**
 * Details of first party and partner audience targeting setting.
 */
export const FirstPartyAndPartnerAudienceTargetingSetting = z.object({
  /** Required. First party and partner audience id of the first party and partner aud */
  firstPartyAndPartnerAudienceId: z.string(),
  /** Required. The recency of the first party and partner audience targeting setting. */
  recency: z.enum(["RECENCY_NO_LIMIT", "RECENCY_1_MINUTE", "RECENCY_5_MINUTES", "RECENCY_10_MINUTES", "RECENCY_15_MINUTES", "RECENCY_30_MINUTES", "RECENCY_1_HOUR", "RECENCY_2_HOURS", "RECENCY_3_HOURS", "RECENCY_6_HOURS", "RECENCY_12_HOURS", "RECENCY_1_DAY", "RECENCY_2_DAYS", "RECENCY_3_DAYS", "RECENCY_5_DAYS", "RECENCY_7_DAYS", "RECENCY_10_DAYS", "RECENCY_14_DAYS", "RECENCY_15_DAYS", "RECENCY_21_DAYS", "RECENCY_28_DAYS", "RECENCY_30_DAYS", "RECENCY_40_DAYS", "RECENCY_45_DAYS", "RECENCY_60_DAYS", "RECENCY_90_DAYS", "RECENCY_120_DAYS", "RECENCY_180_DAYS", "RECENCY_270_DAYS", "RECENCY_365_DAYS"]),
});

/**
 * Details of combined audience group. All combined audience targeting settings are logically ‘OR’ of each other.
 */
export const CombinedAudienceGroup = z.object({
  /** Required. All combined audience targeting settings in combined audience group. R */
  settings: z.array(z.lazy(() => CombinedAudienceTargetingSetting)),
});

/**
 * Details of combined audience targeting setting.
 */
export const CombinedAudienceTargetingSetting = z.object({
  /** Required. Combined audience id of combined audience targeting setting. This id i */
  combinedAudienceId: z.string(),
});

/**
 * Represents an assigned authorized seller status. This will be populated in the details field of an AssignedTargetingOption when targeting_type is `TARGETING_TYPE_AUTHORIZED_SELLER_STATUS`. If a resource does not have an `TARGETING_TYPE_AUTHORIZED_SELLER_STATUS` assigned targeting option, it is using the "Authorized Direct Sellers and Resellers" option.
 */
export const AuthorizedSellerStatusAssignedTargetingOptionDetails = z.object({
  /** Required. The targeting_option_id of a TargetingOption of type `TARGETING_TYPE_A */
  targetingOptionId: z.string(),
  /** Output only. The authorized seller status to target. */
  authorizedSellerStatus: z.enum(["AUTHORIZED_SELLER_STATUS_UNSPECIFIED", "AUTHORIZED_SELLER_STATUS_AUTHORIZED_DIRECT_SELLERS_ONLY", "AUTHORIZED_SELLER_STATUS_AUTHORIZED_AND_NON_PARTICIPATING_PUBLISHERS"]).optional(),
});

/**
 * Assigned content instream position targeting option details. This will be populated in the content_instream_position_details field when targeting_type is `TARGETING_TYPE_CONTENT_INSTREAM_POSITION`.
 */
export const ContentInstreamPositionAssignedTargetingOptionDetails = z.object({
  /** Output only. The ad type to target. Only applicable to insertion order targeting */
  adType: z.enum(["AD_TYPE_UNSPECIFIED", "AD_TYPE_DISPLAY", "AD_TYPE_VIDEO", "AD_TYPE_AUDIO"]).optional(),
  /** Required. The content instream position for video or audio ads. */
  contentInstreamPosition: z.enum(["CONTENT_INSTREAM_POSITION_UNSPECIFIED", "CONTENT_INSTREAM_POSITION_PRE_ROLL", "CONTENT_INSTREAM_POSITION_MID_ROLL", "CONTENT_INSTREAM_POSITION_POST_ROLL", "CONTENT_INSTREAM_POSITION_UNKNOWN"]),
});

/**
 * Details for assigned carrier and ISP targeting option. This will be populated in the details field of an AssignedTargetingOption when targeting_type is `TARGETING_TYPE_CARRIER_AND_ISP`.
 */
export const CarrierAndIspAssignedTargetingOptionDetails = z.object({
  /** Indicates if this option is being negatively targeted. All assigned carrier and  */
  negative: z.boolean().optional(),
  /** Required. The targeting_option_id of a TargetingOption of type `TARGETING_TYPE_C */
  targetingOptionId: z.string(),
  /** Output only. The display name of the carrier or ISP. */
  displayName: z.string().optional(),
});

/**
 * Details for YouTube channel assigned targeting option. This will be populated in the youtube_channel_details field when targeting_type is `TARGETING_TYPE_YOUTUBE_CHANNEL`.
 */
export const YoutubeChannelAssignedTargetingOptionDetails = z.object({
  /** The YouTube uploader channel id or the channel code of a YouTube channel. */
  channelId: z.string().optional(),
  /** Indicates if this option is being negatively targeted. */
  negative: z.boolean().optional(),
});

/**
 * Targeting details for proximity location list. This will be populated in the details field of an AssignedTargetingOption when targeting_type is `TARGETING_TYPE_PROXIMITY_LOCATION_LIST`.
 */
export const ProximityLocationListAssignedTargetingOptionDetails = z.object({
  /** Required. ID of the proximity location list. Should refer to the location_list_i */
  proximityLocationListId: z.string(),
  /** Required. Radius distance units. */
  proximityRadiusUnit: z.enum(["PROXIMITY_RADIUS_UNIT_UNSPECIFIED", "PROXIMITY_RADIUS_UNIT_MILES", "PROXIMITY_RADIUS_UNIT_KILOMETERS"]),
  /** Required. Radius expressed in the distance units set in proximity_radius_unit. T */
  proximityRadius: z.number(),
});

/**
 * Targeting details for inventory source group. This will be populated in the details field of an AssignedTargetingOption when targeting_type is `TARGETING_TYPE_INVENTORY_SOURCE_GROUP`.
 */
export const InventorySourceGroupAssignedTargetingOptionDetails = z.object({
  /** Required. ID of the inventory source group. Should refer to the inventory_source */
  inventorySourceGroupId: z.string(),
});

/**
 * Assigned content outstream position targeting option details. This will be populated in the content_outstream_position_details field when targeting_type is `TARGETING_TYPE_CONTENT_OUTSTREAM_POSITION`.
 */
export const ContentOutstreamPositionAssignedTargetingOptionDetails = z.object({
  /** Required. The content outstream position. */
  contentOutstreamPosition: z.enum(["CONTENT_OUTSTREAM_POSITION_UNSPECIFIED", "CONTENT_OUTSTREAM_POSITION_UNKNOWN", "CONTENT_OUTSTREAM_POSITION_IN_ARTICLE", "CONTENT_OUTSTREAM_POSITION_IN_BANNER", "CONTENT_OUTSTREAM_POSITION_IN_FEED", "CONTENT_OUTSTREAM_POSITION_INTERSTITIAL"]),
  /** Output only. The ad type to target. Only applicable to insertion order targeting */
  adType: z.enum(["AD_TYPE_UNSPECIFIED", "AD_TYPE_DISPLAY", "AD_TYPE_VIDEO", "AD_TYPE_AUDIO"]).optional(),
});

/**
 * Assigned viewability targeting option details. This will be populated in the viewability_details field of an AssignedTargetingOption when targeting_type is `TARGETING_TYPE_VIEWABILITY`.
 */
export const ViewabilityAssignedTargetingOptionDetails = z.object({
  /** Required. The predicted viewability percentage. */
  viewability: z.enum(["VIEWABILITY_UNSPECIFIED", "VIEWABILITY_10_PERCENT_OR_MORE", "VIEWABILITY_20_PERCENT_OR_MORE", "VIEWABILITY_30_PERCENT_OR_MORE", "VIEWABILITY_40_PERCENT_OR_MORE", "VIEWABILITY_50_PERCENT_OR_MORE", "VIEWABILITY_60_PERCENT_OR_MORE", "VIEWABILITY_70_PERCENT_OR_MORE", "VIEWABILITY_80_PERCENT_OR_MORE", "VIEWABILITY_90_PERCENT_OR_MORE"]),
});

/**
 * Details for assigned language targeting option. This will be populated in the details field of an AssignedTargetingOption when targeting_type is `TARGETING_TYPE_LANGUAGE`.
 */
export const LanguageAssignedTargetingOptionDetails = z.object({
  /** Indicates if this option is being negatively targeted. All assigned language tar */
  negative: z.boolean().optional(),
  /** Output only. The display name of the language (e.g., "French"). */
  displayName: z.string().optional(),
  /** Required. The targeting_option_id of a TargetingOption of type `TARGETING_TYPE_L */
  targetingOptionId: z.string(),
});

/**
 * Details for assigned keyword targeting option. This will be populated in the details field of an AssignedTargetingOption when targeting_type is `TARGETING_TYPE_KEYWORD`.
 */
export const KeywordAssignedTargetingOptionDetails = z.object({
  /** Required. The keyword, for example `car insurance`. Positive keyword cannot be o */
  keyword: z.string(),
  /** Indicates if this option is being negatively targeted. */
  negative: z.boolean().optional(),
});

/**
 * Details for assigned parental status targeting option. This will be populated in the details field of an AssignedTargetingOption when targeting_type is `TARGETING_TYPE_PARENTAL_STATUS`.
 */
export const ParentalStatusAssignedTargetingOptionDetails = z.object({
  /** Required. The parental status of the audience. */
  parentalStatus: z.enum(["PARENTAL_STATUS_UNSPECIFIED", "PARENTAL_STATUS_PARENT", "PARENTAL_STATUS_NOT_A_PARENT", "PARENTAL_STATUS_UNKNOWN"]),
});

/**
 * Targeting details for content theme. This will be populated in the details field of an AssignedTargetingOption when targeting_type is `TARGETING_TYPE_CONTENT_THEME_EXCLUSION`.
 */
export const ContentThemeAssignedTargetingOptionDetails = z.object({
  /** Required. An enum for the DV360 content theme classified to be EXCLUDED. */
  excludedContentTheme: z.enum(["CONTENT_THEME_UNSPECIFIED", "CONTENT_THEME_FIGHTING_VIDEO_GAMES", "CONTENT_THEME_MATURE_GAMES", "CONTENT_THEME_NOT_YET_DETERMINED_HEALTH_SOURCES", "CONTENT_THEME_NOT_YET_DETERMINED_NEWS_SOURCES", "CONTENT_THEME_POLITICS", "CONTENT_THEME_RECENT_NEWS", "CONTENT_THEME_RELIGION", "CONTENT_THEME_UNPLEASANT_HEALTH_CONTENT", "CONTENT_THEME_UNPLEASANT_NEWS"]),
  /** Output only. An enum for the DV360 content theme classifier. */
  contentTheme: z.enum(["CONTENT_THEME_UNSPECIFIED", "CONTENT_THEME_FIGHTING_VIDEO_GAMES", "CONTENT_THEME_MATURE_GAMES", "CONTENT_THEME_NOT_YET_DETERMINED_HEALTH_SOURCES", "CONTENT_THEME_NOT_YET_DETERMINED_NEWS_SOURCES", "CONTENT_THEME_POLITICS", "CONTENT_THEME_RECENT_NEWS", "CONTENT_THEME_RELIGION", "CONTENT_THEME_UNPLEASANT_HEALTH_CONTENT", "CONTENT_THEME_UNPLEASANT_NEWS"]).optional(),
  /** Required. ID of the content theme to be EXCLUDED. */
  excludedTargetingOptionId: z.string(),
});

/**
 * Details for native content position assigned targeting option. This will be populated in the native_content_position_details field when targeting_type is `TARGETING_TYPE_NATIVE_CONTENT_POSITION`. Explicitly targeting all options is not supported. Remove all native content position targeting options to achieve this effect.
 */
export const NativeContentPositionAssignedTargetingOptionDetails = z.object({
  /** Required. The content position. */
  contentPosition: z.enum(["NATIVE_CONTENT_POSITION_UNSPECIFIED", "NATIVE_CONTENT_POSITION_UNKNOWN", "NATIVE_CONTENT_POSITION_IN_ARTICLE", "NATIVE_CONTENT_POSITION_IN_FEED", "NATIVE_CONTENT_POSITION_PERIPHERAL", "NATIVE_CONTENT_POSITION_RECOMMENDATION"]),
});

/**
 * Details for assigned browser targeting option. This will be populated in the details field of an AssignedTargetingOption when targeting_type is `TARGETING_TYPE_BROWSER`.
 */
export const BrowserAssignedTargetingOptionDetails = z.object({
  /** Indicates if this option is being negatively targeted. All assigned browser targ */
  negative: z.boolean().optional(),
  /** Required. The targeting_option_id of a TargetingOption of type `TARGETING_TYPE_B */
  targetingOptionId: z.string(),
  /** Output only. The display name of the browser. */
  displayName: z.string().optional(),
});

/**
 * Targeting details for negative keyword list. This will be populated in the details field of an AssignedTargetingOption when targeting_type is `TARGETING_TYPE_NEGATIVE_KEYWORD_LIST`.
 */
export const NegativeKeywordListAssignedTargetingOptionDetails = z.object({
  /** Required. ID of the negative keyword list. Should refer to the negative_keyword_ */
  negativeKeywordListId: z.string(),
});

/**
 * Details for assigned Business chain targeting option. This will be populated in the details field of an AssignedTargetingOption when targeting_type is `TARGETING_TYPE_BUSINESS_CHAIN`.
 */
export const BusinessChainAssignedTargetingOptionDetails = z.object({
  /** Required. The targeting_option_id of a TargetingOption of type `TARGETING_TYPE_B */
  targetingOptionId: z.string(),
  /** Required. The radius of the area around the business chain that will be targeted */
  proximityRadiusAmount: z.number(),
  /** Required. The unit of distance by which the targeting radius is measured. */
  proximityRadiusUnit: z.enum(["DISTANCE_UNIT_UNSPECIFIED", "DISTANCE_UNIT_MILES", "DISTANCE_UNIT_KILOMETERS"]),
  /** Output only. The display name of a business chain, e.g. "KFC", "Chase Bank". */
  displayName: z.string().optional(),
});

/**
 * Details for audio content type assigned targeting option. This will be populated in the audio_content_type_details field when targeting_type is `TARGETING_TYPE_AUDIO_CONTENT_TYPE`. Explicitly targeting all options is not supported. Remove all audio content type targeting options to achieve this effect.
 */
export const AudioContentTypeAssignedTargetingOptionDetails = z.object({
  /** Required. The audio content type. */
  audioContentType: z.enum(["AUDIO_CONTENT_TYPE_UNSPECIFIED", "AUDIO_CONTENT_TYPE_UNKNOWN", "AUDIO_CONTENT_TYPE_MUSIC", "AUDIO_CONTENT_TYPE_BROADCAST", "AUDIO_CONTENT_TYPE_PODCAST"]),
});

/**
 * Details for assigned POI targeting option. This will be populated in the details field of an AssignedTargetingOption when targeting_type is `TARGETING_TYPE_POI`.
 */
export const PoiAssignedTargetingOptionDetails = z.object({
  /** Required. The targeting_option_id of a TargetingOption of type `TARGETING_TYPE_P */
  targetingOptionId: z.string(),
  /** Required. The unit of distance by which the targeting radius is measured. */
  proximityRadiusUnit: z.enum(["DISTANCE_UNIT_UNSPECIFIED", "DISTANCE_UNIT_MILES", "DISTANCE_UNIT_KILOMETERS"]),
  /** Output only. The display name of a POI, e.g. "Times Square", "Space Needle", fol */
  displayName: z.string().optional(),
  /** Required. The radius of the area around the POI that will be targeted. The units */
  proximityRadiusAmount: z.number(),
  /** Output only. Latitude of the POI rounding to 6th decimal place. */
  latitude: z.number().optional(),
  /** Output only. Longitude of the POI rounding to 6th decimal place. */
  longitude: z.number().optional(),
});

/**
 * Video player size targeting option details. This will be populated in the video_player_size_details field when targeting_type is `TARGETING_TYPE_VIDEO_PLAYER_SIZE`. Explicitly targeting all options is not supported. Remove all video player size targeting options to achieve this effect.
 */
export const VideoPlayerSizeAssignedTargetingOptionDetails = z.object({
  /** Required. The video player size. */
  videoPlayerSize: z.enum(["VIDEO_PLAYER_SIZE_UNSPECIFIED", "VIDEO_PLAYER_SIZE_SMALL", "VIDEO_PLAYER_SIZE_LARGE", "VIDEO_PLAYER_SIZE_HD", "VIDEO_PLAYER_SIZE_UNKNOWN"]),
});

/**
 * Represents a targetable age range. This will be populated in the details field of an AssignedTargetingOption when targeting_type is `TARGETING_TYPE_AGE_RANGE`.
 */
export const AgeRangeAssignedTargetingOptionDetails = z.object({
  /** Required. The age range of an audience. We only support targeting a continuous a */
  ageRange: z.enum(["AGE_RANGE_UNSPECIFIED", "AGE_RANGE_18_24", "AGE_RANGE_25_34", "AGE_RANGE_35_44", "AGE_RANGE_45_54", "AGE_RANGE_55_64", "AGE_RANGE_65_PLUS", "AGE_RANGE_UNKNOWN", "AGE_RANGE_18_20", "AGE_RANGE_21_24", "AGE_RANGE_25_29", "AGE_RANGE_30_34", "AGE_RANGE_35_39", "AGE_RANGE_40_44", "AGE_RANGE_45_49", "AGE_RANGE_50_54", "AGE_RANGE_55_59", "AGE_RANGE_60_64"]),
});

/**
 * Details for assigned app category targeting option. This will be populated in the app_category_details field of an AssignedTargetingOption when targeting_type is `TARGETING_TYPE_APP_CATEGORY`.
 */
export const AppCategoryAssignedTargetingOptionDetails = z.object({
  /** Required. The targeting_option_id field when targeting_type is `TARGETING_TYPE_A */
  targetingOptionId: z.string(),
  /** Output only. The display name of the app category. */
  displayName: z.string().optional(),
  /** Indicates if this option is being negatively targeted. */
  negative: z.boolean().optional(),
});

/**
 * Details for assigned geographic region targeting option. This will be populated in the details field of an AssignedTargetingOption when targeting_type is `TARGETING_TYPE_GEO_REGION`.
 */
export const GeoRegionAssignedTargetingOptionDetails = z.object({
  /** Indicates if this option is being negatively targeted. */
  negative: z.boolean().optional(),
  /** Output only. The type of geographic region targeting. */
  geoRegionType: z.enum(["GEO_REGION_TYPE_UNKNOWN", "GEO_REGION_TYPE_OTHER", "GEO_REGION_TYPE_COUNTRY", "GEO_REGION_TYPE_REGION", "GEO_REGION_TYPE_TERRITORY", "GEO_REGION_TYPE_PROVINCE", "GEO_REGION_TYPE_STATE", "GEO_REGION_TYPE_PREFECTURE", "GEO_REGION_TYPE_GOVERNORATE", "GEO_REGION_TYPE_CANTON", "GEO_REGION_TYPE_UNION_TERRITORY", "GEO_REGION_TYPE_AUTONOMOUS_COMMUNITY", "GEO_REGION_TYPE_DMA_REGION", "GEO_REGION_TYPE_METRO", "GEO_REGION_TYPE_CONGRESSIONAL_DISTRICT", "GEO_REGION_TYPE_COUNTY", "GEO_REGION_TYPE_MUNICIPALITY", "GEO_REGION_TYPE_CITY", "GEO_REGION_TYPE_POSTAL_CODE", "GEO_REGION_TYPE_DEPARTMENT", "GEO_REGION_TYPE_AIRPORT", "GEO_REGION_TYPE_TV_REGION", "GEO_REGION_TYPE_OKRUG", "GEO_REGION_TYPE_BOROUGH", "GEO_REGION_TYPE_CITY_REGION", "GEO_REGION_TYPE_ARRONDISSEMENT", "GEO_REGION_TYPE_NEIGHBORHOOD", "GEO_REGION_TYPE_UNIVERSITY", "GEO_REGION_TYPE_DISTRICT", "GEO_REGION_TYPE_NATIONAL_PARK", "GEO_REGION_TYPE_BARRIO", "GEO_REGION_TYPE_SUB_WARD", "GEO_REGION_TYPE_MUNICIPALITY_DISTRICT", "GEO_REGION_TYPE_SUB_DISTRICT", "GEO_REGION_TYPE_QUARTER", "GEO_REGION_TYPE_DIVISION", "GEO_REGION_TYPE_COMMUNE", "GEO_REGION_TYPE_COLLOQUIAL_AREA"]).optional(),
  /** Output only. The display name of the geographic region (e.g., "Ontario, Canada") */
  displayName: z.string().optional(),
  /** Required. The targeting_option_id of a TargetingOption of type `TARGETING_TYPE_G */
  targetingOptionId: z.string(),
});

/**
 * Details for content stream type assigned targeting option. This will be populated in the content_stream_type_details field when targeting_type is `TARGETING_TYPE_CONTENT_STREAM_TYPE`. Explicitly targeting all options is not supported. Remove all content stream type targeting options to achieve this effect.
 */
export const ContentStreamTypeAssignedTargetingOptionDetails = z.object({
  /** Required. The targeting_option_id field when targeting_type is `TARGETING_TYPE_C */
  targetingOptionId: z.string(),
  /** Output only. The content stream type. */
  contentStreamType: z.enum(["CONTENT_STREAM_TYPE_UNSPECIFIED", "CONTENT_LIVE_STREAM", "CONTENT_ON_DEMAND"]).optional(),
});

/**
 * On screen position targeting option details. This will be populated in the on_screen_position_details field when targeting_type is `TARGETING_TYPE_ON_SCREEN_POSITION`.
 */
export const OnScreenPositionAssignedTargetingOptionDetails = z.object({
  /** Output only. The ad type to target. Only applicable to insertion order targeting */
  adType: z.enum(["AD_TYPE_UNSPECIFIED", "AD_TYPE_DISPLAY", "AD_TYPE_VIDEO", "AD_TYPE_AUDIO"]).optional(),
  /** Required. The targeting_option_id field when targeting_type is `TARGETING_TYPE_O */
  targetingOptionId: z.string(),
  /** Output only. The on screen position. */
  onScreenPosition: z.enum(["ON_SCREEN_POSITION_UNSPECIFIED", "ON_SCREEN_POSITION_UNKNOWN", "ON_SCREEN_POSITION_ABOVE_THE_FOLD", "ON_SCREEN_POSITION_BELOW_THE_FOLD"]).optional(),
});

/**
 * Targeting details for sensitive category. This will be populated in the details field of an AssignedTargetingOption when targeting_type is `TARGETING_TYPE_SENSITIVE_CATEGORY_EXCLUSION`.
 */
export const SensitiveCategoryAssignedTargetingOptionDetails = z.object({
  /** Required. An enum for the DV360 Sensitive category content classified to be EXCL */
  excludedSensitiveCategory: z.enum(["SENSITIVE_CATEGORY_UNSPECIFIED", "SENSITIVE_CATEGORY_ADULT", "SENSITIVE_CATEGORY_DEROGATORY", "SENSITIVE_CATEGORY_DOWNLOADS_SHARING", "SENSITIVE_CATEGORY_WEAPONS", "SENSITIVE_CATEGORY_GAMBLING", "SENSITIVE_CATEGORY_VIOLENCE", "SENSITIVE_CATEGORY_SUGGESTIVE", "SENSITIVE_CATEGORY_PROFANITY", "SENSITIVE_CATEGORY_ALCOHOL", "SENSITIVE_CATEGORY_DRUGS", "SENSITIVE_CATEGORY_TOBACCO", "SENSITIVE_CATEGORY_POLITICS", "SENSITIVE_CATEGORY_RELIGION", "SENSITIVE_CATEGORY_TRAGEDY", "SENSITIVE_CATEGORY_TRANSPORTATION_ACCIDENTS", "SENSITIVE_CATEGORY_SENSITIVE_SOCIAL_ISSUES", "SENSITIVE_CATEGORY_SHOCKING", "SENSITIVE_CATEGORY_EMBEDDED_VIDEO", "SENSITIVE_CATEGORY_LIVE_STREAMING_VIDEO"]),
});

/**
 * Targeting details for inventory source. This will be populated in the details field of an AssignedTargetingOption when targeting_type is `TARGETING_TYPE_INVENTORY_SOURCE`.
 */
export const InventorySourceAssignedTargetingOptionDetails = z.object({
  /** Required. ID of the inventory source. Should refer to the inventory_source_id fi */
  inventorySourceId: z.string(),
});

/**
 * User rewarded content targeting option details. This will be populated in the user_rewarded_content_details field when targeting_type is `TARGETING_TYPE_USER_REWARDED_CONTENT`.
 */
export const UserRewardedContentAssignedTargetingOptionDetails = z.object({
  /** Required. The targeting_option_id field when targeting_type is `TARGETING_TYPE_U */
  targetingOptionId: z.string(),
  /** Output only. User rewarded content status for video ads. */
  userRewardedContent: z.enum(["USER_REWARDED_CONTENT_UNSPECIFIED", "USER_REWARDED_CONTENT_USER_REWARDED", "USER_REWARDED_CONTENT_NOT_USER_REWARDED"]).optional(),
});

/**
 * Assigned device make and model targeting option details. This will be populated in the device_make_model_details field when targeting_type is `TARGETING_TYPE_DEVICE_MAKE_MODEL`.
 */
export const DeviceMakeModelAssignedTargetingOptionDetails = z.object({
  /** Required. The targeting_option_id field when targeting_type is `TARGETING_TYPE_D */
  targetingOptionId: z.string(),
  /** Output only. The display name of the device make and model. */
  displayName: z.string().optional(),
  /** Indicates if this option is being negatively targeted. */
  negative: z.boolean().optional(),
});

/**
 * Assigned environment targeting option details. This will be populated in the details field of an AssignedTargetingOption when targeting_type is `TARGETING_TYPE_ENVIRONMENT`.
 */
export const EnvironmentAssignedTargetingOptionDetails = z.object({
  /** Required. The serving environment. */
  environment: z.enum(["ENVIRONMENT_UNSPECIFIED", "ENVIRONMENT_WEB_OPTIMIZED", "ENVIRONMENT_WEB_NOT_OPTIMIZED", "ENVIRONMENT_APP"]),
});

/**
 * Assigned operating system targeting option details. This will be populated in the operating_system_details field when targeting_type is `TARGETING_TYPE_OPERATING_SYSTEM`.
 */
export const OperatingSystemAssignedTargetingOptionDetails = z.object({
  /** Indicates if this option is being negatively targeted. */
  negative: z.boolean().optional(),
  /** Output only. The display name of the operating system. */
  displayName: z.string().optional(),
  /** Required. The targeting option ID populated in targeting_option_id field when ta */
  targetingOptionId: z.string(),
});

/**
 * Targeting details for regional location list. This will be populated in the details field of an AssignedTargetingOption when targeting_type is `TARGETING_TYPE_REGIONAL_LOCATION_LIST`.
 */
export const RegionalLocationListAssignedTargetingOptionDetails = z.object({
  /** Required. ID of the regional location list. Should refer to the location_list_id */
  regionalLocationListId: z.string(),
  /** Indicates if this option is being negatively targeted. */
  negative: z.boolean().optional(),
});

/**
 * Details for assigned app targeting option. This will be populated in the details field of an AssignedTargetingOption when targeting_type is `TARGETING_TYPE_APP`.
 */
export const AppAssignedTargetingOptionDetails = z.object({
  /** Indicates if this option is being negatively targeted. */
  negative: z.boolean().optional(),
  /** Output only. The display name of the app. */
  displayName: z.string().optional(),
  /** Indicates the platform of the targeted app. If this field is not specified, the  */
  appPlatform: z.enum(["APP_PLATFORM_UNSPECIFIED", "APP_PLATFORM_IOS", "APP_PLATFORM_ANDROID", "APP_PLATFORM_ROKU", "APP_PLATFORM_AMAZON_FIRETV", "APP_PLATFORM_PLAYSTATION", "APP_PLATFORM_APPLE_TV", "APP_PLATFORM_XBOX", "APP_PLATFORM_SAMSUNG_TV", "APP_PLATFORM_ANDROID_TV", "APP_PLATFORM_GENERIC_CTV", "APP_PLATFORM_LG_TV", "APP_PLATFORM_VIZIO_TV", "APP_PLATFORM_VIDAA"]).optional(),
  /** Required. The ID of the app. Android's Play store app uses bundle ID, for exampl */
  appId: z.string(),
});

/**
 * Details for assigned exchange targeting option. This will be populated in the details field of an AssignedTargetingOption when targeting_type is `TARGETING_TYPE_EXCHANGE`.
 */
export const ExchangeAssignedTargetingOptionDetails = z.object({
  /** Required. The enum value for the exchange. */
  exchange: z.enum(["EXCHANGE_UNSPECIFIED", "EXCHANGE_GOOGLE_AD_MANAGER", "EXCHANGE_APPNEXUS", "EXCHANGE_BRIGHTROLL", "EXCHANGE_ADFORM", "EXCHANGE_ADMETA", "EXCHANGE_ADMIXER", "EXCHANGE_ADSMOGO", "EXCHANGE_ADSWIZZ", "EXCHANGE_BIDSWITCH", "EXCHANGE_BRIGHTROLL_DISPLAY", "EXCHANGE_CADREON", "EXCHANGE_DAILYMOTION", "EXCHANGE_FIVE", "EXCHANGE_FLUCT", "EXCHANGE_FREEWHEEL", "EXCHANGE_GENIEE", "EXCHANGE_GUMGUM", "EXCHANGE_IMOBILE", "EXCHANGE_IBILLBOARD", "EXCHANGE_IMPROVE_DIGITAL", "EXCHANGE_INDEX", "EXCHANGE_KARGO", "EXCHANGE_MICROAD", "EXCHANGE_MOPUB", "EXCHANGE_NEND", "EXCHANGE_ONE_BY_AOL_DISPLAY", "EXCHANGE_ONE_BY_AOL_MOBILE", "EXCHANGE_ONE_BY_AOL_VIDEO", "EXCHANGE_OOYALA", "EXCHANGE_OPENX", "EXCHANGE_PERMODO", "EXCHANGE_PLATFORMONE", "EXCHANGE_PLATFORMID", "EXCHANGE_PUBMATIC", "EXCHANGE_PULSEPOINT", "EXCHANGE_REVENUEMAX", "EXCHANGE_RUBICON", "EXCHANGE_SMARTCLIP", "EXCHANGE_SMARTRTB", "EXCHANGE_SMARTSTREAMTV", "EXCHANGE_SOVRN", "EXCHANGE_SPOTXCHANGE", "EXCHANGE_STROER", "EXCHANGE_TEADSTV", "EXCHANGE_TELARIA", "EXCHANGE_TVN", "EXCHANGE_UNITED", "EXCHANGE_YIELDLAB", "EXCHANGE_YIELDMO", "EXCHANGE_UNRULYX", "EXCHANGE_OPEN8", "EXCHANGE_TRITON", "EXCHANGE_TRIPLELIFT", "EXCHANGE_TABOOLA", "EXCHANGE_INMOBI", "EXCHANGE_SMAATO", "EXCHANGE_AJA", "EXCHANGE_SUPERSHIP", "EXCHANGE_NEXSTAR_DIGITAL", "EXCHANGE_WAZE", "EXCHANGE_SOUNDCAST", "EXCHANGE_SHARETHROUGH", "EXCHANGE_FYBER", "EXCHANGE_RED_FOR_PUBLISHERS", "EXCHANGE_MEDIANET", "EXCHANGE_TAPJOY", "EXCHANGE_VISTAR", "EXCHANGE_DAX", "EXCHANGE_JCD", "EXCHANGE_PLACE_EXCHANGE", "EXCHANGE_APPLOVIN", "EXCHANGE_CONNATIX", "EXCHANGE_RESET_DIGITAL", "EXCHANGE_HIVESTACK", "EXCHANGE_DRAX", "EXCHANGE_APPLOVIN_GBID", "EXCHANGE_FYBER_GBID", "EXCHANGE_UNITY_GBID", "EXCHANGE_CHARTBOOST_GBID", "EXCHANGE_ADMOST_GBID", "EXCHANGE_TOPON_GBID", "EXCHANGE_NETFLIX", "EXCHANGE_CORE", "EXCHANGE_COMMERCE_GRID", "EXCHANGE_SPOTIFY", "EXCHANGE_TUBI", "EXCHANGE_SNAP", "EXCHANGE_CADENT"]),
});

/**
 * Details for assigned URL targeting option. This will be populated in the details field of an AssignedTargetingOption when targeting_type is `TARGETING_TYPE_URL`.
 */
export const UrlAssignedTargetingOptionDetails = z.object({
  /** Indicates if this option is being negatively targeted. */
  negative: z.boolean().optional(),
  /** Required. The URL, for example `example.com`. DV360 supports two levels of subdi */
  url: z.string(),
});

/**
 * Details for assigned household income targeting option. This will be populated in the details field of an AssignedTargetingOption when targeting_type is `TARGETING_TYPE_HOUSEHOLD_INCOME`.
 */
export const HouseholdIncomeAssignedTargetingOptionDetails = z.object({
  /** Required. The household income of the audience. */
  householdIncome: z.enum(["HOUSEHOLD_INCOME_UNSPECIFIED", "HOUSEHOLD_INCOME_UNKNOWN", "HOUSEHOLD_INCOME_LOWER_50_PERCENT", "HOUSEHOLD_INCOME_TOP_41_TO_50_PERCENT", "HOUSEHOLD_INCOME_TOP_31_TO_40_PERCENT", "HOUSEHOLD_INCOME_TOP_21_TO_30_PERCENT", "HOUSEHOLD_INCOME_TOP_11_TO_20_PERCENT", "HOUSEHOLD_INCOME_TOP_10_PERCENT"]),
});

/**
 * Details for assigned channel targeting option. This will be populated in the details field of an AssignedTargetingOption when targeting_type is `TARGETING_TYPE_CHANNEL`.
 */
export const ChannelAssignedTargetingOptionDetails = z.object({
  /** Required. ID of the channel. Should refer to the channel ID field on a [Partner- */
  channelId: z.string(),
  /** Indicates if this option is being negatively targeted. For advertiser level assi */
  negative: z.boolean().optional(),
});

/**
 * Details for assigned sub-exchange targeting option. This will be populated in the details field of an AssignedTargetingOption when targeting_type is `TARGETING_TYPE_SUB_EXCHANGE`.
 */
export const SubExchangeAssignedTargetingOptionDetails = z.object({
  /** Required. The targeting_option_id of a TargetingOption of type `TARGETING_TYPE_S */
  targetingOptionId: z.string(),
});

/**
 * Representation of a segment of time defined on a specific day of the week and with a start and end time. The time represented by `start_hour` must be before the time represented by `end_hour`.
 */
export const DayAndTimeAssignedTargetingOptionDetails = z.object({
  /** Required. The start hour for day and time targeting. Must be between 0 (start of */
  startHour: z.number().int(),
  /** Required. The end hour for day and time targeting. Must be between 1 (1 hour aft */
  endHour: z.number().int(),
  /** Required. The day of the week for this day and time targeting setting. */
  dayOfWeek: z.enum(["DAY_OF_WEEK_UNSPECIFIED", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"]),
  /** Required. The mechanism used to determine which timezone to use for this day and */
  timeZoneResolution: z.enum(["TIME_ZONE_RESOLUTION_UNSPECIFIED", "TIME_ZONE_RESOLUTION_END_USER", "TIME_ZONE_RESOLUTION_ADVERTISER"]),
});

/**
 * Details for content genre assigned targeting option. This will be populated in the content_genre_details field when targeting_type is `TARGETING_TYPE_CONTENT_GENRE`. Explicitly targeting all options is not supported. Remove all content genre targeting options to achieve this effect.
 */
export const ContentGenreAssignedTargetingOptionDetails = z.object({
  /** Indicates if this option is being negatively targeted. */
  negative: z.boolean().optional(),
  /** Required. The targeting_option_id field when targeting_type is `TARGETING_TYPE_C */
  targetingOptionId: z.string(),
  /** Output only. The display name of the content genre. */
  displayName: z.string().optional(),
});

/**
 * Assigned third party verifier targeting option details. This will be populated in the details field of an AssignedTargetingOption when targeting_type is `TARGETING_TYPE_THIRD_PARTY_VERIFIER`.
 */
export const ThirdPartyVerifierAssignedTargetingOptionDetails = z.object({
  /** Third party brand verifier -- DoubleVerify. */
  doubleVerify: z.lazy(() => DoubleVerify).optional(),
  /** Third party brand verifier -- Integral Ad Science. */
  integralAdScience: z.lazy(() => IntegralAdScience).optional(),
  /** Third party brand verifier -- Scope3 (previously known as Adloox). */
  adloox: z.lazy(() => Adloox).optional(),
});

/**
 * Details of DoubleVerify settings.
 */
export const DoubleVerify = z.object({
  /** Display viewability settings (applicable to display line items only). */
  displayViewability: z.lazy(() => DoubleVerifyDisplayViewability).optional(),
  /** The custom segment ID provided by DoubleVerify. The ID must start with "51" and  */
  customSegmentId: z.string().optional(),
  /** Video viewability settings (applicable to video line items only). */
  videoViewability: z.lazy(() => DoubleVerifyVideoViewability).optional(),
  /** Avoid bidding on apps with the age rating. */
  avoidedAgeRatings: z.array(z.enum(["AGE_RATING_UNSPECIFIED", "APP_AGE_RATE_UNKNOWN", "APP_AGE_RATE_4_PLUS", "APP_AGE_RATE_9_PLUS", "APP_AGE_RATE_12_PLUS", "APP_AGE_RATE_17_PLUS", "APP_AGE_RATE_18_PLUS"])).optional(),
  /** Avoid Sites and Apps with historical Fraud & IVT Rates. */
  fraudInvalidTraffic: z.lazy(() => DoubleVerifyFraudInvalidTraffic).optional(),
  /** DV Brand Safety Controls. */
  brandSafetyCategories: z.lazy(() => DoubleVerifyBrandSafetyCategories).optional(),
  /** Avoid bidding on apps with the star ratings. */
  appStarRating: z.lazy(() => DoubleVerifyAppStarRating).optional(),
});

/**
 * Details of DoubleVerify display viewability settings.
 */
export const DoubleVerifyDisplayViewability = z.object({
  /** Target web and app inventory to maximize 100% viewable duration. */
  viewableDuring: z.enum(["AVERAGE_VIEW_DURATION_UNSPECIFIED", "AVERAGE_VIEW_DURATION_5_SEC", "AVERAGE_VIEW_DURATION_10_SEC", "AVERAGE_VIEW_DURATION_15_SEC"]).optional(),
  /** Target web and app inventory to maximize IAB viewable rate. */
  iab: z.enum(["IAB_VIEWED_RATE_UNSPECIFIED", "IAB_VIEWED_RATE_80_PERCENT_HIGHER", "IAB_VIEWED_RATE_75_PERCENT_HIGHER", "IAB_VIEWED_RATE_70_PERCENT_HIGHER", "IAB_VIEWED_RATE_65_PERCENT_HIGHER", "IAB_VIEWED_RATE_60_PERCENT_HIGHER", "IAB_VIEWED_RATE_55_PERCENT_HIGHER", "IAB_VIEWED_RATE_50_PERCENT_HIGHER", "IAB_VIEWED_RATE_40_PERCENT_HIGHER", "IAB_VIEWED_RATE_30_PERCENT_HIGHER"]).optional(),
});

/**
 * Details of DoubleVerify video viewability settings.
 */
export const DoubleVerifyVideoViewability = z.object({
  /** Target web inventory to maximize fully viewable rate. */
  videoViewableRate: z.enum(["VIDEO_VIEWABLE_RATE_UNSPECIFIED", "VIEWED_PERFORMANCE_40_PERCENT_HIGHER", "VIEWED_PERFORMANCE_35_PERCENT_HIGHER", "VIEWED_PERFORMANCE_30_PERCENT_HIGHER", "VIEWED_PERFORMANCE_25_PERCENT_HIGHER", "VIEWED_PERFORMANCE_20_PERCENT_HIGHER", "VIEWED_PERFORMANCE_10_PERCENT_HIGHER"]).optional(),
  /** Target web inventory to maximize IAB viewable rate. */
  videoIab: z.enum(["VIDEO_IAB_UNSPECIFIED", "IAB_VIEWABILITY_80_PERCENT_HIGHER", "IAB_VIEWABILITY_75_PERCENT_HIGHER", "IAB_VIEWABILITY_70_PERCENT_HIGHER", "IAB_VIEWABILITY_65_PERCENT_HIHGER", "IAB_VIEWABILITY_60_PERCENT_HIGHER", "IAB_VIEWABILITY_55_PERCENT_HIHGER", "IAB_VIEWABILITY_50_PERCENT_HIGHER", "IAB_VIEWABILITY_40_PERCENT_HIHGER", "IAB_VIEWABILITY_30_PERCENT_HIHGER"]).optional(),
  /** Target inventory to maximize impressions with 400x300 or greater player size. */
  playerImpressionRate: z.enum(["PLAYER_SIZE_400X300_UNSPECIFIED", "PLAYER_SIZE_400X300_95", "PLAYER_SIZE_400X300_70", "PLAYER_SIZE_400X300_25", "PLAYER_SIZE_400X300_5"]).optional(),
});

/**
 * DoubleVerify Fraud & Invalid Traffic settings.
 */
export const DoubleVerifyFraudInvalidTraffic = z.object({
  /** Insufficient Historical Fraud & IVT Stats. */
  avoidInsufficientOption: z.boolean().optional(),
  /** Avoid Sites and Apps with historical Fraud & IVT. */
  avoidedFraudOption: z.enum(["FRAUD_UNSPECIFIED", "AD_IMPRESSION_FRAUD_100", "AD_IMPRESSION_FRAUD_50", "AD_IMPRESSION_FRAUD_25", "AD_IMPRESSION_FRAUD_10", "AD_IMPRESSION_FRAUD_8", "AD_IMPRESSION_FRAUD_6", "AD_IMPRESSION_FRAUD_4", "AD_IMPRESSION_FRAUD_2"]).optional(),
});

/**
 * Settings for brand safety controls.
 */
export const DoubleVerifyBrandSafetyCategories = z.object({
  /** Unknown or unrateable. */
  avoidUnknownBrandSafetyCategory: z.boolean().optional(),
  /** Brand safety medium severity avoidance categories. */
  avoidedMediumSeverityCategories: z.array(z.enum(["MEDIUM_SEVERITY_UNSPECIFIED", "AD_SERVERS", "ADULT_CONTENT_SWIMSUIT", "ALTERNATIVE_LIFESTYLES", "CELEBRITY_GOSSIP", "GAMBLING", "OCCULT", "SEX_EDUCATION", "DISASTER_AVIATION", "DISASTER_MAN_MADE", "DISASTER_NATURAL", "DISASTER_TERRORIST_EVENTS", "DISASTER_VEHICLE", "ALCOHOL", "SMOKING", "NEGATIVE_NEWS_FINANCIAL", "NON_ENGLISH", "PARKING_PAGE", "UNMODERATED_UGC", "INFLAMMATORY_POLITICS_AND_NEWS", "NEGATIVE_NEWS_PHARMACEUTICAL"])).optional(),
  /** Brand safety high severity avoidance categories. */
  avoidedHighSeverityCategories: z.array(z.enum(["HIGHER_SEVERITY_UNSPECIFIED", "ADULT_CONTENT_PORNOGRAPHY", "COPYRIGHT_INFRINGEMENT", "SUBSTANCE_ABUSE", "GRAPHIC_VIOLENCE_WEAPONS", "HATE_PROFANITY", "CRIMINAL_SKILLS", "NUISANCE_INCENTIVIZED_MALWARE_CLUTTER"])).optional(),
});

/**
 * Details of DoubleVerify star ratings settings.
 */
export const DoubleVerifyAppStarRating = z.object({
  /** Avoid bidding on apps with the star ratings. */
  avoidedStarRating: z.enum(["APP_STAR_RATE_UNSPECIFIED", "APP_STAR_RATE_1_POINT_5_LESS", "APP_STAR_RATE_2_LESS", "APP_STAR_RATE_2_POINT_5_LESS", "APP_STAR_RATE_3_LESS", "APP_STAR_RATE_3_POINT_5_LESS", "APP_STAR_RATE_4_LESS", "APP_STAR_RATE_4_POINT_5_LESS"]).optional(),
  /** Avoid bidding on apps with insufficient star ratings. */
  avoidInsufficientStarRating: z.boolean().optional(),
});

/**
 * Details of Integral Ad Science settings.
 */
export const IntegralAdScience = z.object({
  /** Ad Fraud settings. */
  excludedAdFraudRisk: z.enum(["SUSPICIOUS_ACTIVITY_UNSPECIFIED", "SUSPICIOUS_ACTIVITY_HR", "SUSPICIOUS_ACTIVITY_HMR", "SUSPICIOUS_ACTIVITY_FD"]).optional(),
  /** The custom segment ID provided by Integral Ad Science. The ID must be between `1 */
  customSegmentId: z.array(z.string()).optional(),
  /** Brand Safety - **Violence**. */
  excludedViolenceRisk: z.enum(["VIOLENCE_UNSPECIFIED", "VIOLENCE_HR", "VIOLENCE_HMR"]).optional(),
  /** Brand Safety - **Offensive language**. */
  excludedOffensiveLanguageRisk: z.enum(["OFFENSIVE_LANGUAGE_UNSPECIFIED", "OFFENSIVE_LANGUAGE_HR", "OFFENSIVE_LANGUAGE_HMR"]).optional(),
  /** Brand Safety - **Adult content**. */
  excludedAdultRisk: z.enum(["ADULT_UNSPECIFIED", "ADULT_HR", "ADULT_HMR"]).optional(),
  /** Display Viewability section (applicable to display line items only). */
  displayViewability: z.enum(["PERFORMANCE_VIEWABILITY_UNSPECIFIED", "PERFORMANCE_VIEWABILITY_40", "PERFORMANCE_VIEWABILITY_50", "PERFORMANCE_VIEWABILITY_60", "PERFORMANCE_VIEWABILITY_70"]).optional(),
  /** Brand Safety - **Drugs**. */
  excludedDrugsRisk: z.enum(["DRUGS_UNSPECIFIED", "DRUGS_HR", "DRUGS_HMR"]).optional(),
  /** Optional. The quality sync custom segment ID provided by Integral Ad Science. Th */
  qualitySyncCustomSegmentId: z.array(z.string()).optional(),
  /** Brand Safety - **Hate speech**. */
  excludedHateSpeechRisk: z.enum(["HATE_SPEECH_UNSPECIFIED", "HATE_SPEECH_HR", "HATE_SPEECH_HMR"]).optional(),
  /** Brand Safety - **Unrateable**. */
  excludeUnrateable: z.boolean().optional(),
  /** Brand Safety - **Illegal downloads**. */
  excludedIllegalDownloadsRisk: z.enum(["ILLEGAL_DOWNLOADS_UNSPECIFIED", "ILLEGAL_DOWNLOADS_HR", "ILLEGAL_DOWNLOADS_HMR"]).optional(),
  /** True advertising quality (applicable to Display line items only). */
  traqScoreOption: z.enum(["TRAQ_UNSPECIFIED", "TRAQ_250", "TRAQ_500", "TRAQ_600", "TRAQ_700", "TRAQ_750", "TRAQ_875", "TRAQ_1000"]).optional(),
  /** Brand Safety - **Gambling**. */
  excludedGamblingRisk: z.enum(["GAMBLING_UNSPECIFIED", "GAMBLING_HR", "GAMBLING_HMR"]).optional(),
  /** Brand Safety - **Alcohol**. */
  excludedAlcoholRisk: z.enum(["ALCOHOL_UNSPECIFIED", "ALCOHOL_HR", "ALCOHOL_HMR"]).optional(),
  /** Video Viewability Section (applicable to video line items only). */
  videoViewability: z.enum(["VIDEO_VIEWABILITY_UNSPECIFIED", "VIDEO_VIEWABILITY_40", "VIDEO_VIEWABILITY_50", "VIDEO_VIEWABILITY_60", "VIDEO_VIEWABILITY_70"]).optional(),
});

/**
 * Details of Scope3 (previously known as Adloox) brand safety settings.
 */
export const Adloox = z.object({
  /** Scope3 categories to exclude. */
  excludedAdlooxCategories: z.array(z.enum(["ADLOOX_UNSPECIFIED", "ADULT_CONTENT_HARD", "ADULT_CONTENT_SOFT", "ILLEGAL_CONTENT", "BORDERLINE_CONTENT", "DISCRIMINATORY_CONTENT", "VIOLENT_CONTENT_WEAPONS", "LOW_VIEWABILITY_DOMAINS", "FRAUD"])).optional(),
  /** Optional. Death, Injury, or Military Conflict Content [GARM](https://wfanet.org/ */
  deathInjuryMilitaryConflictContent: z.enum(["GARM_RISK_EXCLUSION_UNSPECIFIED", "GARM_RISK_EXCLUSION_FLOOR", "GARM_RISK_EXCLUSION_HIGH", "GARM_RISK_EXCLUSION_MEDIUM", "GARM_RISK_EXCLUSION_LOW"]).optional(),
  /** Optional. Arms and Ammunition Content [GARM](https://wfanet.org/leadership/garm/ */
  armsAmmunitionContent: z.enum(["GARM_RISK_EXCLUSION_UNSPECIFIED", "GARM_RISK_EXCLUSION_FLOOR", "GARM_RISK_EXCLUSION_HIGH", "GARM_RISK_EXCLUSION_MEDIUM", "GARM_RISK_EXCLUSION_LOW"]).optional(),
  /** Optional. Adult and Explicit Sexual Content [GARM](https://wfanet.org/leadership */
  adultExplicitSexualContent: z.enum(["GARM_RISK_EXCLUSION_UNSPECIFIED", "GARM_RISK_EXCLUSION_FLOOR", "GARM_RISK_EXCLUSION_HIGH", "GARM_RISK_EXCLUSION_MEDIUM", "GARM_RISK_EXCLUSION_LOW"]).optional(),
  /** Optional. Debated Sensitive Social Issue Content [GARM](https://wfanet.org/leade */
  debatedSensitiveSocialIssueContent: z.enum(["GARM_RISK_EXCLUSION_UNSPECIFIED", "GARM_RISK_EXCLUSION_FLOOR", "GARM_RISK_EXCLUSION_HIGH", "GARM_RISK_EXCLUSION_MEDIUM", "GARM_RISK_EXCLUSION_LOW"]).optional(),
  /** Optional. Spam or Harmful Content [GARM](https://wfanet.org/leadership/garm/abou */
  spamHarmfulContent: z.enum(["GARM_RISK_EXCLUSION_UNSPECIFIED", "GARM_RISK_EXCLUSION_FLOOR", "GARM_RISK_EXCLUSION_HIGH", "GARM_RISK_EXCLUSION_MEDIUM", "GARM_RISK_EXCLUSION_LOW"]).optional(),
  /** Optional. Terrorism Content [GARM](https://wfanet.org/leadership/garm/about-garm */
  terrorismContent: z.enum(["GARM_RISK_EXCLUSION_UNSPECIFIED", "GARM_RISK_EXCLUSION_FLOOR", "GARM_RISK_EXCLUSION_HIGH", "GARM_RISK_EXCLUSION_MEDIUM", "GARM_RISK_EXCLUSION_LOW"]).optional(),
  /** Optional. IAB viewability threshold for display ads. */
  displayIabViewability: z.enum(["DISPLAY_IAB_VIEWABILITY_UNSPECIFIED", "DISPLAY_IAB_VIEWABILITY_10", "DISPLAY_IAB_VIEWABILITY_20", "DISPLAY_IAB_VIEWABILITY_35", "DISPLAY_IAB_VIEWABILITY_50", "DISPLAY_IAB_VIEWABILITY_75"]).optional(),
  /** Optional. Scope3's fraud IVT MFA categories to exclude. */
  excludedFraudIvtMfaCategories: z.array(z.enum(["FRAUD_IVT_MFA_CATEGORY_UNSPECIFIED", "FRAUD_IVT_MFA"])).optional(),
  /** Optional. IAB viewability threshold for video ads. */
  videoIabViewability: z.enum(["VIDEO_IAB_VIEWABILITY_UNSPECIFIED", "VIDEO_IAB_VIEWABILITY_10", "VIDEO_IAB_VIEWABILITY_20", "VIDEO_IAB_VIEWABILITY_35", "VIDEO_IAB_VIEWABILITY_50", "VIDEO_IAB_VIEWABILITY_75"]).optional(),
  /** Optional. Illegal Drugs/Alcohol Content [GARM](https://wfanet.org/leadership/gar */
  illegalDrugsTobaccoEcigarettesVapingAlcoholContent: z.enum(["GARM_RISK_EXCLUSION_UNSPECIFIED", "GARM_RISK_EXCLUSION_FLOOR", "GARM_RISK_EXCLUSION_HIGH", "GARM_RISK_EXCLUSION_MEDIUM", "GARM_RISK_EXCLUSION_LOW"]).optional(),
  /** Optional. Online Piracy Content [GARM](https://wfanet.org/leadership/garm/about- */
  onlinePiracyContent: z.enum(["GARM_RISK_EXCLUSION_UNSPECIFIED", "GARM_RISK_EXCLUSION_FLOOR", "GARM_RISK_EXCLUSION_HIGH", "GARM_RISK_EXCLUSION_MEDIUM", "GARM_RISK_EXCLUSION_LOW"]).optional(),
  /** Optional. Misinformation Content [GARM](https://wfanet.org/leadership/garm/about */
  misinformationContent: z.enum(["GARM_RISK_EXCLUSION_UNSPECIFIED", "GARM_RISK_EXCLUSION_FLOOR", "GARM_RISK_EXCLUSION_HIGH", "GARM_RISK_EXCLUSION_MEDIUM", "GARM_RISK_EXCLUSION_LOW"]).optional(),
  /** Optional. Crime and Harmful Acts Content [GARM](https://wfanet.org/leadership/ga */
  crimeHarmfulActsIndividualsSocietyHumanRightsViolationsContent: z.enum(["GARM_RISK_EXCLUSION_UNSPECIFIED", "GARM_RISK_EXCLUSION_FLOOR", "GARM_RISK_EXCLUSION_HIGH", "GARM_RISK_EXCLUSION_MEDIUM", "GARM_RISK_EXCLUSION_LOW"]).optional(),
  /** Optional. Hate Speech and Acts of Aggression Content [GARM](https://wfanet.org/l */
  hateSpeechActsAggressionContent: z.enum(["GARM_RISK_EXCLUSION_UNSPECIFIED", "GARM_RISK_EXCLUSION_FLOOR", "GARM_RISK_EXCLUSION_HIGH", "GARM_RISK_EXCLUSION_MEDIUM", "GARM_RISK_EXCLUSION_LOW"]).optional(),
  /** Optional. Obscenity and Profanity Content [GARM](https://wfanet.org/leadership/g */
  obscenityProfanityContent: z.enum(["GARM_RISK_EXCLUSION_UNSPECIFIED", "GARM_RISK_EXCLUSION_FLOOR", "GARM_RISK_EXCLUSION_HIGH", "GARM_RISK_EXCLUSION_MEDIUM", "GARM_RISK_EXCLUSION_LOW"]).optional(),
});

/**
 * Details for session position assigned targeting option. This will be populated in the session_position_details field when targeting_type is `TARGETING_TYPE_SESSION_POSITION`.
 */
export const SessionPositionAssignedTargetingOptionDetails = z.object({
  /** The position where the ad will show in a session. */
  sessionPosition: z.enum(["SESSION_POSITION_UNSPECIFIED", "SESSION_POSITION_FIRST_IMPRESSION"]).optional(),
});

export const ListInsertionOrderAssignedTargetingOptionsResponse = z.object({
  /** A token identifying the next page of results. This value should be specified as  */
  nextPageToken: z.string().optional(),
  /** The list of assigned targeting options. This list will be absent if empty. */
  assignedTargetingOptions: z.array(z.lazy(() => AssignedTargetingOption)).optional(),
});

/**
 * Response message for ListLineItemAssignedTargetingOptions.
 */
export const ListLineItemAssignedTargetingOptionsResponse = z.object({
  /** A token identifying the next page of results. This value should be specified as  */
  nextPageToken: z.string().optional(),
  /** The list of assigned targeting options. This list will be absent if empty. */
  assignedTargetingOptions: z.array(z.lazy(() => AssignedTargetingOption)).optional(),
});

/**
 * Response message for ListAdGroupAssignedTargetingOptions.
 */
export const ListAdGroupAssignedTargetingOptionsResponse = z.object({
  /** The list of assigned targeting options. This list will be absent if empty. */
  assignedTargetingOptions: z.array(z.lazy(() => AssignedTargetingOption)).optional(),
  /** A token identifying the next page of results. This value should be specified as  */
  nextPageToken: z.string().optional(),
});

/**
 * Represents an amount of money with its currency type.
 */
export const Money = z.object({
  /** Number of nano (10^-9) units of the amount. The value must be between -999,999,9 */
  nanos: z.number().int().optional(),
  /** The whole units of the amount. For example if `currencyCode` is `"USD"`, then 1  */
  units: z.string().optional(),
  /** The three-letter currency code defined in ISO 4217. */
  currencyCode: z.string().optional(),
});

/**
 * The `Status` type defines a logical error model that is suitable for different programming environments, including REST APIs and RPC APIs. It is used by [gRPC](https://github.com/grpc). Each `Status` message contains three pieces of data: error code, error message, and error details. You can find out more about this error model and how to work with it in the [API Design Guide](https://cloud.google.com/apis/design/errors).
 */
export const Status = z.object({
  /** A list of messages that carry the error details. There is a common set of messag */
  details: z.array(z.record(z.unknown())).optional(),
  /** A developer-facing error message, which should be in English. Any user-facing er */
  message: z.string().optional(),
  /** The status code, which should be an enum value of google.rpc.Code. */
  code: z.number().int().optional(),
});

/**
 * All schemas exported as a single object
 */
export const schemas: Record<string, z.ZodTypeAny> = {
  Partner,
  PartnerGeneralConfig,
  PartnerBillingConfig,
  PartnerAdServerConfig,
  MeasurementConfig,
  ExchangeConfig,
  ExchangeConfigEnabledExchange,
  PartnerDataAccessConfig,
  SdfConfig,
  Advertiser,
  AdvertiserAdServerConfig,
  ThirdPartyOnlyConfig,
  CmHybridConfig,
  AdvertiserTargetingConfig,
  AdvertiserCreativeConfig,
  AdvertiserGeneralConfig,
  IntegrationDetails,
  AdvertiserBillingConfig,
  AdvertiserDataAccessConfig,
  AdvertiserSdfConfig,
  Campaign,
  FrequencyCap,
  CampaignBudget,
  PrismaConfig,
  PrismaCpeCode,
  DateRange,
  Date,
  CampaignFlight,
  CampaignGoal,
  PerformanceGoal,
  InsertionOrder,
  Pacing,
  BiddingStrategy,
  FixedBidStrategy,
  PerformanceGoalBidStrategy,
  YoutubeAndPartnersBiddingStrategy,
  MaximizeSpendBidStrategy,
  InsertionOrderBudget,
  InsertionOrderBudgetSegment,
  PartnerCost,
  Kpi,
  LineItem,
  ConversionCountingConfig,
  TrackingFloodlightActivityConfig,
  PartnerRevenueModel,
  MobileApp,
  YoutubeAndPartnersSettings,
  YoutubeAndPartnersInventorySourceConfig,
  VideoAdInventoryControl,
  VideoAdSequenceSettings,
  VideoAdSequenceStep,
  TargetFrequency,
  ThirdPartyMeasurementConfigs,
  ThirdPartyVendorConfig,
  TargetingExpansionConfig,
  LineItemBudget,
  LineItemFlight,
  AdGroup,
  ProductFeedData,
  ProductMatchDimension,
  CustomLabel,
  AdGroupAd,
  NonSkippableAd,
  CommonInStreamAttribute,
  YoutubeVideoDetails,
  ImageAsset,
  Dimensions,
  AudioAd,
  BumperAd,
  AdUrl,
  MastheadAd,
  VideoDiscoveryAd,
  InStreamAd,
  VideoPerformanceAd,
  AdPolicy,
  AdPolicyTopicEntry,
  AdPolicyTopicConstraint,
  AdPolicyTopicConstraintAdPolicyCountryConstraintList,
  AdPolicyCriterionRestriction,
  AdPolicyTopicConstraintAdPolicyResellerConstraint,
  AdPolicyTopicConstraintAdPolicyGlobalCertificateMissingConstraint,
  AdPolicyTopicConstraintAdPolicyGlobalCertificateDomainMismatchConstraint,
  AdPolicyTopicAppealInfo,
  AdPolicyTopicEvidence,
  AdPolicyTopicEvidenceDestinationMismatch,
  AdPolicyTopicEvidenceTextList,
  AdPolicyTopicEvidenceTrademark,
  AdPolicyTopicEvidenceDestinationNotWorking,
  AdPolicyTopicEvidenceWebsiteList,
  AdPolicyTopicEvidenceLegalRemoval,
  AdPolicyTopicEvidenceLegalRemovalDmca,
  AdPolicyTopicEvidenceLegalRemovalLocalLegal,
  AdPolicyTopicEvidenceDestinationTextList,
  AdPolicyTopicEvidenceRegionalRequirements,
  AdPolicyTopicEvidenceRegionalRequirementsRegionalRequirementsEntry,
  AdPolicyTopicEvidenceCounterfeit,
  DisplayVideoSourceAd,
  Creative,
  CounterEvent,
  CmTrackingAd,
  AudioVideoOffset,
  Transcode,
  ObaIcon,
  ThirdPartyUrl,
  ReviewStatusInfo,
  ExchangeReviewStatus,
  TimerEvent,
  AssetAssociation,
  Asset,
  ExitEvent,
  UniversalAdId,
  CustomBiddingAlgorithm,
  CustomBiddingModelDetails,
  ListPartnersResponse,
  ListAdvertisersResponse,
  ListCampaignsResponse,
  ListInsertionOrdersResponse,
  ListLineItemsResponse,
  ListAdGroupsResponse,
  ListAdGroupAdsResponse,
  ListCreativesResponse,
  ListCustomBiddingAlgorithmsResponse,
  AssignedTargetingOption,
  ContentDurationAssignedTargetingOptionDetails,
  DeviceTypeAssignedTargetingOptionDetails,
  YoutubeVideoAssignedTargetingOptionDetails,
  OmidAssignedTargetingOptionDetails,
  CategoryAssignedTargetingOptionDetails,
  GenderAssignedTargetingOptionDetails,
  DigitalContentLabelAssignedTargetingOptionDetails,
  AudienceGroupAssignedTargetingOptionDetails,
  CustomListGroup,
  CustomListTargetingSetting,
  GoogleAudienceGroup,
  GoogleAudienceTargetingSetting,
  FirstPartyAndPartnerAudienceGroup,
  FirstPartyAndPartnerAudienceTargetingSetting,
  CombinedAudienceGroup,
  CombinedAudienceTargetingSetting,
  AuthorizedSellerStatusAssignedTargetingOptionDetails,
  ContentInstreamPositionAssignedTargetingOptionDetails,
  CarrierAndIspAssignedTargetingOptionDetails,
  YoutubeChannelAssignedTargetingOptionDetails,
  ProximityLocationListAssignedTargetingOptionDetails,
  InventorySourceGroupAssignedTargetingOptionDetails,
  ContentOutstreamPositionAssignedTargetingOptionDetails,
  ViewabilityAssignedTargetingOptionDetails,
  LanguageAssignedTargetingOptionDetails,
  KeywordAssignedTargetingOptionDetails,
  ParentalStatusAssignedTargetingOptionDetails,
  ContentThemeAssignedTargetingOptionDetails,
  NativeContentPositionAssignedTargetingOptionDetails,
  BrowserAssignedTargetingOptionDetails,
  NegativeKeywordListAssignedTargetingOptionDetails,
  BusinessChainAssignedTargetingOptionDetails,
  AudioContentTypeAssignedTargetingOptionDetails,
  PoiAssignedTargetingOptionDetails,
  VideoPlayerSizeAssignedTargetingOptionDetails,
  AgeRangeAssignedTargetingOptionDetails,
  AppCategoryAssignedTargetingOptionDetails,
  GeoRegionAssignedTargetingOptionDetails,
  ContentStreamTypeAssignedTargetingOptionDetails,
  OnScreenPositionAssignedTargetingOptionDetails,
  SensitiveCategoryAssignedTargetingOptionDetails,
  InventorySourceAssignedTargetingOptionDetails,
  UserRewardedContentAssignedTargetingOptionDetails,
  DeviceMakeModelAssignedTargetingOptionDetails,
  EnvironmentAssignedTargetingOptionDetails,
  OperatingSystemAssignedTargetingOptionDetails,
  RegionalLocationListAssignedTargetingOptionDetails,
  AppAssignedTargetingOptionDetails,
  ExchangeAssignedTargetingOptionDetails,
  UrlAssignedTargetingOptionDetails,
  HouseholdIncomeAssignedTargetingOptionDetails,
  ChannelAssignedTargetingOptionDetails,
  SubExchangeAssignedTargetingOptionDetails,
  DayAndTimeAssignedTargetingOptionDetails,
  ContentGenreAssignedTargetingOptionDetails,
  ThirdPartyVerifierAssignedTargetingOptionDetails,
  DoubleVerify,
  DoubleVerifyDisplayViewability,
  DoubleVerifyVideoViewability,
  DoubleVerifyFraudInvalidTraffic,
  DoubleVerifyBrandSafetyCategories,
  DoubleVerifyAppStarRating,
  IntegralAdScience,
  Adloox,
  SessionPositionAssignedTargetingOptionDetails,
  ListInsertionOrderAssignedTargetingOptionsResponse,
  ListLineItemAssignedTargetingOptionsResponse,
  ListAdGroupAssignedTargetingOptionsResponse,
  Money,
  Status,
};