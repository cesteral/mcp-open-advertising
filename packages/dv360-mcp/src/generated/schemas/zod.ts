/**
 * Auto-generated Zod schemas from OpenAPI specification
 * Generated at: 2025-11-13T13:15:53.838Z
 * DO NOT EDIT MANUALLY
 */

import { z } from 'zod';

/**
 * A single partner in Display & Video 360 (DV360).
 */
export const Partner = z.object({
  /** Settings that control how partner data may be accessed. */
  dataAccessConfig: z.lazy(() => PartnerDataAccessConfig).optional(),
  /** Output only. The status of the partner. */
  entityStatus: z.enum(["ENTITY_STATUS_UNSPECIFIED", "ENTITY_STATUS_ACTIVE", "ENTITY_STATUS_ARCHIVED", "ENTITY_STATUS_DRAFT", "ENTITY_STATUS_PAUSED", "ENTITY_STATUS_SCHEDULED_FOR_DELETION"]).optional(),
  /** Ad server related settings of the partner. */
  adServerConfig: z.lazy(() => PartnerAdServerConfig).optional(),
  /** Output only. The unique ID of the partner. Assigned by the system. */
  partnerId: z.string().optional(),
  /** Output only. The resource name of the partner. */
  name: z.string().optional(),
  /** Billing related settings of the partner. */
  billingConfig: z.lazy(() => PartnerBillingConfig).optional(),
  /** The display name of the partner. Must be UTF-8 encoded with a maximum size of 24 */
  displayName: z.string().optional(),
  /** Output only. The timestamp when the partner was last updated. Assigned by the sy */
  updateTime: z.string().optional(),
  /** General settings of the partner. */
  generalConfig: z.lazy(() => PartnerGeneralConfig).optional(),
  /** Settings that control which exchanges are enabled for the partner. */
  exchangeConfig: z.lazy(() => ExchangeConfig).optional(),
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
  /** An administrator email address to which the SDF processing status reports will b */
  adminEmail: z.string().optional(),
  /** Required. The version of SDF being used. */
  version: z.enum(["SDF_VERSION_UNSPECIFIED", "SDF_VERSION_3_1", "SDF_VERSION_4", "SDF_VERSION_4_1", "SDF_VERSION_4_2", "SDF_VERSION_5", "SDF_VERSION_5_1", "SDF_VERSION_5_2", "SDF_VERSION_5_3", "SDF_VERSION_5_4", "SDF_VERSION_5_5", "SDF_VERSION_6", "SDF_VERSION_7", "SDF_VERSION_7_1", "SDF_VERSION_8", "SDF_VERSION_8_1", "SDF_VERSION_9", "SDF_VERSION_9_1", "SDF_VERSION_9_2"]).optional(),
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
  /** Whether or not to include DV360 data in CM360 data transfer reports. */
  dv360ToCmDataSharingEnabled: z.boolean().optional(),
  /** Whether or not to report DV360 cost to CM360. */
  dv360ToCmCostReportingEnabled: z.boolean().optional(),
});

/**
 * Billing related settings of a partner.
 */
export const PartnerBillingConfig = z.object({
  /** The ID of a partner default billing profile. */
  billingProfileId: z.string().optional(),
});

/**
 * General settings of a partner.
 */
export const PartnerGeneralConfig = z.object({
  /** Immutable. The standard TZ database name of the partner's time zone. For example */
  timeZone: z.string().optional(),
  /** Immutable. Partner's currency in ISO 4217 format. */
  currencyCode: z.string().optional(),
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
  /** Output only. Seat ID of the enabled exchange. */
  seatId: z.string().optional(),
  /** The enabled exchange. */
  exchange: z.enum(["EXCHANGE_UNSPECIFIED", "EXCHANGE_GOOGLE_AD_MANAGER", "EXCHANGE_APPNEXUS", "EXCHANGE_BRIGHTROLL", "EXCHANGE_ADFORM", "EXCHANGE_ADMETA", "EXCHANGE_ADMIXER", "EXCHANGE_ADSMOGO", "EXCHANGE_ADSWIZZ", "EXCHANGE_BIDSWITCH", "EXCHANGE_BRIGHTROLL_DISPLAY", "EXCHANGE_CADREON", "EXCHANGE_DAILYMOTION", "EXCHANGE_FIVE", "EXCHANGE_FLUCT", "EXCHANGE_FREEWHEEL", "EXCHANGE_GENIEE", "EXCHANGE_GUMGUM", "EXCHANGE_IMOBILE", "EXCHANGE_IBILLBOARD", "EXCHANGE_IMPROVE_DIGITAL", "EXCHANGE_INDEX", "EXCHANGE_KARGO", "EXCHANGE_MICROAD", "EXCHANGE_MOPUB", "EXCHANGE_NEND", "EXCHANGE_ONE_BY_AOL_DISPLAY", "EXCHANGE_ONE_BY_AOL_MOBILE", "EXCHANGE_ONE_BY_AOL_VIDEO", "EXCHANGE_OOYALA", "EXCHANGE_OPENX", "EXCHANGE_PERMODO", "EXCHANGE_PLATFORMONE", "EXCHANGE_PLATFORMID", "EXCHANGE_PUBMATIC", "EXCHANGE_PULSEPOINT", "EXCHANGE_REVENUEMAX", "EXCHANGE_RUBICON", "EXCHANGE_SMARTCLIP", "EXCHANGE_SMARTRTB", "EXCHANGE_SMARTSTREAMTV", "EXCHANGE_SOVRN", "EXCHANGE_SPOTXCHANGE", "EXCHANGE_STROER", "EXCHANGE_TEADSTV", "EXCHANGE_TELARIA", "EXCHANGE_TVN", "EXCHANGE_UNITED", "EXCHANGE_YIELDLAB", "EXCHANGE_YIELDMO", "EXCHANGE_UNRULYX", "EXCHANGE_OPEN8", "EXCHANGE_TRITON", "EXCHANGE_TRIPLELIFT", "EXCHANGE_TABOOLA", "EXCHANGE_INMOBI", "EXCHANGE_SMAATO", "EXCHANGE_AJA", "EXCHANGE_SUPERSHIP", "EXCHANGE_NEXSTAR_DIGITAL", "EXCHANGE_WAZE", "EXCHANGE_SOUNDCAST", "EXCHANGE_SHARETHROUGH", "EXCHANGE_FYBER", "EXCHANGE_RED_FOR_PUBLISHERS", "EXCHANGE_MEDIANET", "EXCHANGE_TAPJOY", "EXCHANGE_VISTAR", "EXCHANGE_DAX", "EXCHANGE_JCD", "EXCHANGE_PLACE_EXCHANGE", "EXCHANGE_APPLOVIN", "EXCHANGE_CONNATIX", "EXCHANGE_RESET_DIGITAL", "EXCHANGE_HIVESTACK", "EXCHANGE_DRAX", "EXCHANGE_APPLOVIN_GBID", "EXCHANGE_FYBER_GBID", "EXCHANGE_UNITY_GBID", "EXCHANGE_CHARTBOOST_GBID", "EXCHANGE_ADMOST_GBID", "EXCHANGE_TOPON_GBID", "EXCHANGE_NETFLIX", "EXCHANGE_CORE", "EXCHANGE_COMMERCE_GRID", "EXCHANGE_SPOTIFY", "EXCHANGE_TUBI", "EXCHANGE_SNAP"]).optional(),
});

/**
 * A single advertiser in Display & Video 360 (DV360).
 */
export const Advertiser = z.object({
  /** Required. Controls whether or not insertion orders and line items of the adverti */
  entityStatus: z.enum(["ENTITY_STATUS_UNSPECIFIED", "ENTITY_STATUS_ACTIVE", "ENTITY_STATUS_ARCHIVED", "ENTITY_STATUS_DRAFT", "ENTITY_STATUS_PAUSED", "ENTITY_STATUS_SCHEDULED_FOR_DELETION"]).optional(),
  /** Output only. The unique ID of the advertiser. Assigned by the system. */
  advertiserId: z.string().optional(),
  /** Required. Creative related settings of the advertiser. */
  creativeConfig: z.lazy(() => AdvertiserCreativeConfig).optional(),
  /** Output only. The timestamp when the advertiser was last updated. Assigned by the */
  updateTime: z.string().optional(),
  /** Required. Immutable. The unique ID of the partner that the advertiser belongs to */
  partnerId: z.string().optional(),
  /** Required. The display name of the advertiser. Must be UTF-8 encoded with a maxim */
  displayName: z.string().optional(),
  /** Required. General settings of the advertiser. */
  generalConfig: z.lazy(() => AdvertiserGeneralConfig).optional(),
  /** Integration details of the advertiser. Only integrationCode is currently applica */
  integrationDetails: z.lazy(() => IntegrationDetails).optional(),
  /** Required. Billing related settings of the advertiser. */
  billingConfig: z.lazy(() => AdvertiserBillingConfig).optional(),
  /** Output only. The resource name of the advertiser. */
  name: z.string().optional(),
  /** Targeting settings related to ad serving of the advertiser. */
  servingConfig: z.lazy(() => AdvertiserTargetingConfig).optional(),
  /** Optional. Whether this advertiser contains line items that serve European Union  */
  containsEuPoliticalAds: z.enum(["EU_POLITICAL_ADVERTISING_STATUS_UNKNOWN", "CONTAINS_EU_POLITICAL_ADVERTISING", "DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING"]).optional(),
  /** Required. Immutable. Ad server related settings of the advertiser. */
  adServerConfig: z.lazy(() => AdvertiserAdServerConfig).optional(),
  /** Settings that control how advertiser data may be accessed. */
  dataAccessConfig: z.lazy(() => AdvertiserDataAccessConfig).optional(),
  /** Whether integration with Mediaocean (Prisma) is enabled. By enabling this, you a */
  prismaEnabled: z.boolean().optional(),
});

/**
 * Creatives related settings of an advertiser.
 */
export const AdvertiserCreativeConfig = z.object({
  /** An ID for configuring campaign monitoring provided by Integral Ad Service (IAS). */
  iasClientId: z.string().optional(),
  /** Whether or not to disable Google's About this Ad feature that adds badging (to i */
  obaComplianceDisabled: z.boolean().optional(),
  /** Whether or not the advertiser is enabled for dynamic creatives. */
  dynamicCreativeEnabled: z.boolean().optional(),
  /** By setting this field to `true`, you, on behalf of your company, authorize Googl */
  videoCreativeDataSharingAuthorized: z.boolean().optional(),
});

/**
 * General settings of an advertiser.
 */
export const AdvertiserGeneralConfig = z.object({
  /** Output only. The standard TZ database name of the advertiser's time zone. For ex */
  timeZone: z.string().optional(),
  /** Required. The domain URL of the advertiser's primary website. The system will se */
  domainUrl: z.string().optional(),
  /** Required. Immutable. Advertiser's currency in ISO 4217 format. Accepted codes an */
  currencyCode: z.string().optional(),
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
  billingProfileId: z.string().optional(),
});

/**
 * Targeting settings related to ad serving of an advertiser.
 */
export const AdvertiserTargetingConfig = z.object({
  /** Whether or not connected TV devices are exempt from viewability targeting for al */
  exemptTvFromViewabilityTargeting: z.boolean().optional(),
});

/**
 * Ad server related settings of an advertiser.
 */
export const AdvertiserAdServerConfig = z.object({
  /** The configuration for advertisers that use both Campaign Manager 360 (CM360) and */
  cmHybridConfig: z.lazy(() => CmHybridConfig).optional(),
  /** The configuration for advertisers that use third-party ad servers only. */
  thirdPartyOnlyConfig: z.lazy(() => ThirdPartyOnlyConfig).optional(),
});

/**
 * Settings for advertisers that use both Campaign Manager 360 (CM360) and third-party ad servers.
 */
export const CmHybridConfig = z.object({
  /** Required. Immutable. Account ID of the CM360 Floodlight configuration linked wit */
  cmAccountId: z.string().optional(),
  /** Whether or not to include DV360 data in CM360 data transfer reports. */
  dv360ToCmDataSharingEnabled: z.boolean().optional(),
  /** Output only. The set of CM360 Advertiser IDs sharing the CM360 Floodlight config */
  cmAdvertiserIds: z.array(z.string()).optional(),
  /** Whether or not to report DV360 cost to CM360. */
  dv360ToCmCostReportingEnabled: z.boolean().optional(),
  /** A list of CM360 sites whose placements will be synced to DV360 as creatives. If  */
  cmSyncableSiteIds: z.array(z.string()).optional(),
  /** Required. Immutable. ID of the CM360 Floodlight configuration linked with the DV */
  cmFloodlightConfigId: z.string().optional(),
  /** Required. Immutable. By setting this field to `true`, you, on behalf of your com */
  cmFloodlightLinkingAuthorized: z.boolean().optional(),
});

/**
 * Settings for advertisers that use third-party ad servers only.
 */
export const ThirdPartyOnlyConfig = z.object({
  /** Whether or not order ID reporting for pixels is enabled. This value cannot be ch */
  pixelOrderIdReportingEnabled: z.boolean().optional(),
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
 * A single insertion order.
 */
export const InsertionOrder = z.object({
  /** Required. The key performance indicator (KPI) of the insertion order. This is re */
  kpi: z.lazy(() => Kpi).optional(),
  /** Output only. The reservation type of the insertion order. */
  reservationType: z.enum(["RESERVATION_TYPE_UNSPECIFIED", "RESERVATION_TYPE_NOT_GUARANTEED", "RESERVATION_TYPE_PROGRAMMATIC_GUARANTEED", "RESERVATION_TYPE_TAG_GUARANTEED", "RESERVATION_TYPE_PETRA_VIRAL", "RESERVATION_TYPE_INSTANT_RESERVE"]).optional(),
  /** Optional. The bidding strategy of the insertion order. By default, fixed_bid is  */
  bidStrategy: z.lazy(() => BiddingStrategy).optional(),
  /** Required. The budget allocation settings of the insertion order. */
  budget: z.lazy(() => InsertionOrderBudget).optional(),
  /** Required. The budget spending speed setting of the insertion order. pacing_type  */
  pacing: z.lazy(() => Pacing).optional(),
  /** Optional. The type of insertion order. If this field is unspecified in creation, */
  insertionOrderType: z.enum(["INSERTION_ORDER_TYPE_UNSPECIFIED", "RTB", "OVER_THE_TOP"]).optional(),
  /** Output only. The resource name of the insertion order. */
  name: z.string().optional(),
  /** Optional. Additional integration details of the insertion order. */
  integrationDetails: z.lazy(() => IntegrationDetails).optional(),
  /** Output only. The unique ID of the advertiser the insertion order belongs to. */
  advertiserId: z.string().optional(),
  /** Optional. The partner costs associated with the insertion order. If absent or em */
  partnerCosts: z.array(z.lazy(() => PartnerCost)).optional(),
  /** Output only. The timestamp when the insertion order was last updated. Assigned b */
  updateTime: z.string().optional(),
  /** Required. Immutable. The unique ID of the campaign that the insertion order belo */
  campaignId: z.string().optional(),
  /** Required. The frequency capping setting of the insertion order. */
  frequencyCap: z.lazy(() => FrequencyCap).optional(),
  /** Required. The display name of the insertion order. Must be UTF-8 encoded with a  */
  displayName: z.string().optional(),
  /** Optional. Required. The optimization objective of the insertion order. */
  optimizationObjective: z.enum(["OPTIMIZATION_OBJECTIVE_UNSPECIFIED", "CONVERSION", "CLICK", "BRAND_AWARENESS", "CUSTOM", "NO_OBJECTIVE"]).optional(),
  /** Required. Controls whether or not the insertion order can spend its budget and b */
  entityStatus: z.enum(["ENTITY_STATUS_UNSPECIFIED", "ENTITY_STATUS_ACTIVE", "ENTITY_STATUS_ARCHIVED", "ENTITY_STATUS_DRAFT", "ENTITY_STATUS_PAUSED", "ENTITY_STATUS_SCHEDULED_FOR_DELETION"]).optional(),
  /** Output only. The unique ID of the insertion order. Assigned by the system. */
  insertionOrderId: z.string().optional(),
});

/**
 * Settings that control the key performance indicator, or KPI, of an insertion order.
 */
export const Kpi = z.object({
  /** Required. The type of KPI. */
  kpiType: z.enum(["KPI_TYPE_UNSPECIFIED", "KPI_TYPE_CPM", "KPI_TYPE_CPC", "KPI_TYPE_CPA", "KPI_TYPE_CTR", "KPI_TYPE_VIEWABILITY", "KPI_TYPE_CPIAVC", "KPI_TYPE_CPE", "KPI_TYPE_CPV", "KPI_TYPE_CLICK_CVR", "KPI_TYPE_IMPRESSION_CVR", "KPI_TYPE_VCPM", "KPI_TYPE_VTR", "KPI_TYPE_AUDIO_COMPLETION_RATE", "KPI_TYPE_VIDEO_COMPLETION_RATE", "KPI_TYPE_CPCL", "KPI_TYPE_CPCV", "KPI_TYPE_TOS10", "KPI_TYPE_MAXIMIZE_PACING", "KPI_TYPE_CUSTOM_IMPRESSION_VALUE_OVER_COST", "KPI_TYPE_OTHER"]).optional(),
  /** The goal amount, in micros of the advertiser's currency. Applicable when kpi_typ */
  kpiAmountMicros: z.string().optional(),
  /** Optional. Custom Bidding Algorithm ID associated with KPI_CUSTOM_IMPRESSION_VALU */
  kpiAlgorithmId: z.string().optional(),
  /** A KPI string, which can be empty. Must be UTF-8 encoded with a length of no more */
  kpiString: z.string().optional(),
  /** The decimal representation of the goal percentage in micros. Applicable when kpi */
  kpiPercentageMicros: z.string().optional(),
});

/**
 * Settings that control the bid strategy. Bid strategy determines the bid price.
 */
export const BiddingStrategy = z.object({
  /** A strategy that automatically adjusts the bid to optimize to your performance go */
  maximizeSpendAutoBid: z.lazy(() => MaximizeSpendBidStrategy).optional(),
  /** A bid strategy used by YouTube and Partners resources. It can only be used for a */
  youtubeAndPartnersBid: z.lazy(() => YoutubeAndPartnersBiddingStrategy).optional(),
  /** A strategy that uses a fixed bid price. */
  fixedBid: z.lazy(() => FixedBidStrategy).optional(),
  /** A strategy that automatically adjusts the bid to meet or beat a specified perfor */
  performanceGoalAutoBid: z.lazy(() => PerformanceGoalBidStrategy).optional(),
});

/**
 * A strategy that automatically adjusts the bid to optimize a specified performance goal while spending the full budget.
 */
export const MaximizeSpendBidStrategy = z.object({
  /** The ID of the Custom Bidding Algorithm used by this strategy. Only applicable wh */
  customBiddingAlgorithmId: z.string().optional(),
  /** Required. The type of the performance goal that the bidding strategy tries to mi */
  performanceGoalType: z.enum(["BIDDING_STRATEGY_PERFORMANCE_GOAL_TYPE_UNSPECIFIED", "BIDDING_STRATEGY_PERFORMANCE_GOAL_TYPE_CPA", "BIDDING_STRATEGY_PERFORMANCE_GOAL_TYPE_CPC", "BIDDING_STRATEGY_PERFORMANCE_GOAL_TYPE_VIEWABLE_CPM", "BIDDING_STRATEGY_PERFORMANCE_GOAL_TYPE_CUSTOM_ALGO", "BIDDING_STRATEGY_PERFORMANCE_GOAL_TYPE_CIVA", "BIDDING_STRATEGY_PERFORMANCE_GOAL_TYPE_IVO_TEN", "BIDDING_STRATEGY_PERFORMANCE_GOAL_TYPE_AV_VIEWED"]).optional(),
  /** The maximum average CPM that may be bid, in micros of the advertiser's currency. */
  maxAverageCpmBidAmountMicros: z.string().optional(),
  /** Whether the strategy takes deal floor prices into account. */
  raiseBidForDeals: z.boolean().optional(),
});

/**
 * Settings that control the bid strategy for YouTube and Partners resources.
 */
export const YoutubeAndPartnersBiddingStrategy = z.object({
  /** The type of the bidding strategy. */
  type: z.enum(["YOUTUBE_AND_PARTNERS_BIDDING_STRATEGY_TYPE_UNSPECIFIED", "YOUTUBE_AND_PARTNERS_BIDDING_STRATEGY_TYPE_MANUAL_CPV", "YOUTUBE_AND_PARTNERS_BIDDING_STRATEGY_TYPE_MANUAL_CPM", "YOUTUBE_AND_PARTNERS_BIDDING_STRATEGY_TYPE_TARGET_CPA", "YOUTUBE_AND_PARTNERS_BIDDING_STRATEGY_TYPE_TARGET_CPM", "YOUTUBE_AND_PARTNERS_BIDDING_STRATEGY_TYPE_RESERVE_CPM", "YOUTUBE_AND_PARTNERS_BIDDING_STRATEGY_TYPE_MAXIMIZE_LIFT", "YOUTUBE_AND_PARTNERS_BIDDING_STRATEGY_TYPE_MAXIMIZE_CONVERSIONS", "YOUTUBE_AND_PARTNERS_BIDDING_STRATEGY_TYPE_TARGET_CPV", "YOUTUBE_AND_PARTNERS_BIDDING_STRATEGY_TYPE_TARGET_ROAS", "YOUTUBE_AND_PARTNERS_BIDDING_STRATEGY_TYPE_MAXIMIZE_CONVERSION_VALUE"]).optional(),
  /** The value used by the bidding strategy. When the bidding strategy is assigned at */
  value: z.string().optional(),
  /** Output only. The effective target CPA for ad group, in micros of advertiser's cu */
  adGroupEffectiveTargetCpaValue: z.string().optional(),
  /** Output only. Source of the effective target CPA value for ad group. */
  adGroupEffectiveTargetCpaSource: z.enum(["BIDDING_SOURCE_UNSPECIFIED", "BIDDING_SOURCE_LINE_ITEM", "BIDDING_SOURCE_AD_GROUP"]).optional(),
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
  /** Required. The performance goal the bidding strategy will attempt to meet or beat */
  performanceGoalAmountMicros: z.string().optional(),
  /** The maximum average CPM that may be bid, in micros of the advertiser's currency. */
  maxAverageCpmBidAmountMicros: z.string().optional(),
  /** Required. The type of the performance goal that the bidding strategy will try to */
  performanceGoalType: z.enum(["BIDDING_STRATEGY_PERFORMANCE_GOAL_TYPE_UNSPECIFIED", "BIDDING_STRATEGY_PERFORMANCE_GOAL_TYPE_CPA", "BIDDING_STRATEGY_PERFORMANCE_GOAL_TYPE_CPC", "BIDDING_STRATEGY_PERFORMANCE_GOAL_TYPE_VIEWABLE_CPM", "BIDDING_STRATEGY_PERFORMANCE_GOAL_TYPE_CUSTOM_ALGO", "BIDDING_STRATEGY_PERFORMANCE_GOAL_TYPE_CIVA", "BIDDING_STRATEGY_PERFORMANCE_GOAL_TYPE_IVO_TEN", "BIDDING_STRATEGY_PERFORMANCE_GOAL_TYPE_AV_VIEWED"]).optional(),
  /** The ID of the Custom Bidding Algorithm used by this strategy. Only applicable wh */
  customBiddingAlgorithmId: z.string().optional(),
});

/**
 * Settings that control how insertion order budget is allocated.
 */
export const InsertionOrderBudget = z.object({
  /** Optional. The type of automation used to manage bid and budget for the insertion */
  automationType: z.enum(["INSERTION_ORDER_AUTOMATION_TYPE_UNSPECIFIED", "INSERTION_ORDER_AUTOMATION_TYPE_BUDGET", "INSERTION_ORDER_AUTOMATION_TYPE_NONE", "INSERTION_ORDER_AUTOMATION_TYPE_BID_BUDGET"]).optional(),
  /** Required. The list of budget segments. Use a budget segment to specify a specifi */
  budgetSegments: z.array(z.lazy(() => InsertionOrderBudgetSegment)).optional(),
  /** Required. Immutable. The budget unit specifies whether the budget is currency ba */
  budgetUnit: z.enum(["BUDGET_UNIT_UNSPECIFIED", "BUDGET_UNIT_CURRENCY", "BUDGET_UNIT_IMPRESSIONS"]).optional(),
});

/**
 * Settings that control the budget of a single budget segment.
 */
export const InsertionOrderBudgetSegment = z.object({
  /** Optional. The budget segment description. It can be used to enter Purchase Order */
  description: z.string().optional(),
  /** Required. The budget amount the insertion order will spend for the given date_ra */
  budgetAmountMicros: z.string().optional(),
  /** Optional. The budget_id of the campaign budget that this insertion order budget  */
  campaignBudgetId: z.string().optional(),
  /** Required. The start and end date settings of the budget segment. They are resolv */
  dateRange: z.lazy(() => DateRange).optional(),
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
 * Settings that control the rate at which a budget is spent.
 */
export const Pacing = z.object({
  /** Required. The type of pacing that defines how the budget amount will be spent ac */
  pacingType: z.enum(["PACING_TYPE_UNSPECIFIED", "PACING_TYPE_AHEAD", "PACING_TYPE_ASAP", "PACING_TYPE_EVEN"]).optional(),
  /** Maximum currency amount to spend every day in micros of advertiser's currency. A */
  dailyMaxMicros: z.string().optional(),
  /** Maximum number of impressions to serve every day. Applicable when the budget is  */
  dailyMaxImpressions: z.string().optional(),
  /** Required. The time period in which the pacing budget will be spent. When automat */
  pacingPeriod: z.enum(["PACING_PERIOD_UNSPECIFIED", "PACING_PERIOD_DAILY", "PACING_PERIOD_FLIGHT"]).optional(),
});

/**
 * Settings that control a partner cost. A partner cost is any type of expense involved in running a campaign, other than the costs of purchasing impressions (which is called the media cost) and using third-party audience segment data (data fee). Some examples of partner costs include the fees for using DV360, a third-party ad server, or a third-party ad serving verification service.
 */
export const PartnerCost = z.object({
  /** The media fee percentage in millis (1/1000 of a percent). Applicable when the fe */
  feePercentageMillis: z.string().optional(),
  /** The invoice type for this partner cost. * Required when cost_type is one of: - ` */
  invoiceType: z.enum(["PARTNER_COST_INVOICE_TYPE_UNSPECIFIED", "PARTNER_COST_INVOICE_TYPE_DV360", "PARTNER_COST_INVOICE_TYPE_PARTNER"]).optional(),
  /** Required. The fee type for this partner cost. */
  feeType: z.enum(["PARTNER_COST_FEE_TYPE_UNSPECIFIED", "PARTNER_COST_FEE_TYPE_CPM_FEE", "PARTNER_COST_FEE_TYPE_MEDIA_FEE"]).optional(),
  /** Required. The type of the partner cost. */
  costType: z.enum(["PARTNER_COST_TYPE_UNSPECIFIED", "PARTNER_COST_TYPE_ADLOOX", "PARTNER_COST_TYPE_ADLOOX_PREBID", "PARTNER_COST_TYPE_ADSAFE", "PARTNER_COST_TYPE_ADXPOSE", "PARTNER_COST_TYPE_AGGREGATE_KNOWLEDGE", "PARTNER_COST_TYPE_AGENCY_TRADING_DESK", "PARTNER_COST_TYPE_DV360_FEE", "PARTNER_COST_TYPE_COMSCORE_VCE", "PARTNER_COST_TYPE_DATA_MANAGEMENT_PLATFORM", "PARTNER_COST_TYPE_DEFAULT", "PARTNER_COST_TYPE_DOUBLE_VERIFY", "PARTNER_COST_TYPE_DOUBLE_VERIFY_PREBID", "PARTNER_COST_TYPE_EVIDON", "PARTNER_COST_TYPE_INTEGRAL_AD_SCIENCE_VIDEO", "PARTNER_COST_TYPE_INTEGRAL_AD_SCIENCE_PREBID", "PARTNER_COST_TYPE_MEDIA_COST_DATA", "PARTNER_COST_TYPE_MOAT_VIDEO", "PARTNER_COST_TYPE_NIELSEN_DAR", "PARTNER_COST_TYPE_SHOP_LOCAL", "PARTNER_COST_TYPE_TERACENT", "PARTNER_COST_TYPE_THIRD_PARTY_AD_SERVER", "PARTNER_COST_TYPE_TRUST_METRICS", "PARTNER_COST_TYPE_VIZU", "PARTNER_COST_TYPE_CUSTOM_FEE_1", "PARTNER_COST_TYPE_CUSTOM_FEE_2", "PARTNER_COST_TYPE_CUSTOM_FEE_3", "PARTNER_COST_TYPE_CUSTOM_FEE_4", "PARTNER_COST_TYPE_CUSTOM_FEE_5", "PARTNER_COST_TYPE_SCIBIDS_FEE"]).optional(),
  /** The CPM fee amount in micros of advertiser's currency. Applicable when the fee_t */
  feeAmount: z.string().optional(),
});

/**
 * Settings that control the number of times a user may be shown with the same ad during a given time period.
 */
export const FrequencyCap = z.object({
  /** The time unit in which the frequency cap will be applied. Required when unlimite */
  timeUnit: z.enum(["TIME_UNIT_UNSPECIFIED", "TIME_UNIT_LIFETIME", "TIME_UNIT_MONTHS", "TIME_UNIT_WEEKS", "TIME_UNIT_DAYS", "TIME_UNIT_HOURS", "TIME_UNIT_MINUTES"]).optional(),
  /** The maximum number of times a user may be shown the same ad during this period.  */
  maxImpressions: z.number().int().optional(),
  /** Whether unlimited frequency capping is applied. When this field is set to `true` */
  unlimited: z.boolean().optional(),
  /** Optional. The maximum number of times a user may click-through or fully view an  */
  maxViews: z.number().int().optional(),
  /** The number of time_unit the frequency cap will last. Required when unlimited is  */
  timeUnitCount: z.number().int().optional(),
});

/**
 * A single line item.
 */
export const LineItem = z.object({
  /** Required. The bidding strategy of the line item. */
  bidStrategy: z.lazy(() => BiddingStrategy).optional(),
  /** Output only. The warning messages generated by the line item. These warnings do  */
  warningMessages: z.array(z.enum(["LINE_ITEM_WARNING_MESSAGE_UNSPECIFIED", "INVALID_FLIGHT_DATES", "EXPIRED", "PENDING_FLIGHT", "ALL_PARTNER_ENABLED_EXCHANGES_NEGATIVELY_TARGETED", "INVALID_INVENTORY_SOURCE", "APP_INVENTORY_INVALID_SITE_TARGETING", "APP_INVENTORY_INVALID_AUDIENCE_LISTS", "NO_VALID_CREATIVE", "PARENT_INSERTION_ORDER_PAUSED", "PARENT_INSERTION_ORDER_EXPIRED"])).optional(),
  /** Output only. The timestamp when the line item was last updated. Assigned by the  */
  updateTime: z.string().optional(),
  /** Required. Immutable. The unique ID of the insertion order that the line item bel */
  insertionOrderId: z.string().optional(),
  /** Output only. Settings specific to YouTube and Partners line items. */
  youtubeAndPartnersSettings: z.lazy(() => YoutubeAndPartnersSettings).optional(),
  /** Output only. The unique ID of the campaign that the line item belongs to. */
  campaignId: z.string().optional(),
  /** Output only. The resource name of the line item. */
  name: z.string().optional(),
  /** Required. The start and end time of the line item's flight. */
  flight: z.lazy(() => LineItemFlight).optional(),
  /** Output only. The reservation type of the line item. */
  reservationType: z.enum(["RESERVATION_TYPE_UNSPECIFIED", "RESERVATION_TYPE_NOT_GUARANTEED", "RESERVATION_TYPE_PROGRAMMATIC_GUARANTEED", "RESERVATION_TYPE_TAG_GUARANTEED", "RESERVATION_TYPE_PETRA_VIRAL", "RESERVATION_TYPE_INSTANT_RESERVE"]).optional(),
  /** The conversion tracking setting of the line item. */
  conversionCounting: z.lazy(() => ConversionCountingConfig).optional(),
  /** Output only. The unique ID of the advertiser the line item belongs to. */
  advertiserId: z.string().optional(),
  /** The mobile app promoted by the line item. This is applicable only when line_item */
  mobileApp: z.lazy(() => MobileApp).optional(),
  /** Required. The partner revenue model setting of the line item. */
  partnerRevenueModel: z.lazy(() => PartnerRevenueModel).optional(),
  /** Required. Immutable. The type of the line item. */
  lineItemType: z.enum(["LINE_ITEM_TYPE_UNSPECIFIED", "LINE_ITEM_TYPE_DISPLAY_DEFAULT", "LINE_ITEM_TYPE_DISPLAY_MOBILE_APP_INSTALL", "LINE_ITEM_TYPE_VIDEO_DEFAULT", "LINE_ITEM_TYPE_VIDEO_MOBILE_APP_INSTALL", "LINE_ITEM_TYPE_DISPLAY_MOBILE_APP_INVENTORY", "LINE_ITEM_TYPE_VIDEO_MOBILE_APP_INVENTORY", "LINE_ITEM_TYPE_AUDIO_DEFAULT", "LINE_ITEM_TYPE_VIDEO_OVER_THE_TOP", "LINE_ITEM_TYPE_YOUTUBE_AND_PARTNERS_ACTION", "LINE_ITEM_TYPE_YOUTUBE_AND_PARTNERS_NON_SKIPPABLE", "LINE_ITEM_TYPE_YOUTUBE_AND_PARTNERS_VIDEO_SEQUENCE", "LINE_ITEM_TYPE_YOUTUBE_AND_PARTNERS_AUDIO", "LINE_ITEM_TYPE_YOUTUBE_AND_PARTNERS_REACH", "LINE_ITEM_TYPE_YOUTUBE_AND_PARTNERS_SIMPLE", "LINE_ITEM_TYPE_YOUTUBE_AND_PARTNERS_NON_SKIPPABLE_OVER_THE_TOP", "LINE_ITEM_TYPE_YOUTUBE_AND_PARTNERS_REACH_OVER_THE_TOP", "LINE_ITEM_TYPE_YOUTUBE_AND_PARTNERS_SIMPLE_OVER_THE_TOP", "LINE_ITEM_TYPE_YOUTUBE_AND_PARTNERS_TARGET_FREQUENCY", "LINE_ITEM_TYPE_YOUTUBE_AND_PARTNERS_VIEW", "LINE_ITEM_TYPE_DISPLAY_OUT_OF_HOME", "LINE_ITEM_TYPE_VIDEO_OUT_OF_HOME"]).optional(),
  /** Required. The impression frequency cap settings of the line item. The max_impres */
  frequencyCap: z.lazy(() => FrequencyCap).optional(),
  /** Required. The budget allocation setting of the line item. */
  budget: z.lazy(() => LineItemBudget).optional(),
  /** The IDs of the creatives associated with the line item. */
  creativeIds: z.array(z.string()).optional(),
  /** Required. The display name of the line item. Must be UTF-8 encoded with a maximu */
  displayName: z.string().optional(),
  /** The partner costs associated with the line item. If absent or empty in CreateLin */
  partnerCosts: z.array(z.lazy(() => PartnerCost)).optional(),
  /** Required. The budget spending speed setting of the line item. */
  pacing: z.lazy(() => Pacing).optional(),
  /** The [optimized targeting](//support.google.com/displayvideo/answer/12060859) set */
  targetingExpansion: z.lazy(() => TargetingExpansionConfig).optional(),
  /** Output only. The unique ID of the line item. Assigned by the system. */
  lineItemId: z.string().optional(),
  /** Integration details of the line item. */
  integrationDetails: z.lazy(() => IntegrationDetails).optional(),
  /** Whether to exclude new exchanges from automatically being targeted by the line i */
  excludeNewExchanges: z.boolean().optional(),
  /** Required. Controls whether or not the line item can spend its budget and bid on  */
  entityStatus: z.enum(["ENTITY_STATUS_UNSPECIFIED", "ENTITY_STATUS_ACTIVE", "ENTITY_STATUS_ARCHIVED", "ENTITY_STATUS_DRAFT", "ENTITY_STATUS_PAUSED", "ENTITY_STATUS_SCHEDULED_FOR_DELETION"]).optional(),
  /** Whether this line item will serve European Union political ads. If contains_eu_p */
  containsEuPoliticalAds: z.enum(["EU_POLITICAL_ADVERTISING_STATUS_UNKNOWN", "CONTAINS_EU_POLITICAL_ADVERTISING", "DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING"]).optional(),
});

/**
 * Settings for YouTube and Partners line items.
 */
export const YoutubeAndPartnersSettings = z.object({
  /** Optional. The settings to control which inventory is allowed for this line item. */
  videoAdInventoryControl: z.lazy(() => VideoAdInventoryControl).optional(),
  /** Optional. The ID of the form to generate leads. */
  leadFormId: z.string().optional(),
  /** Output only. The kind of content on which the YouTube and Partners ads will be s */
  contentCategory: z.enum(["YOUTUBE_AND_PARTNERS_CONTENT_CATEGORY_UNSPECIFIED", "YOUTUBE_AND_PARTNERS_CONTENT_CATEGORY_STANDARD", "YOUTUBE_AND_PARTNERS_CONTENT_CATEGORY_EXPANDED", "YOUTUBE_AND_PARTNERS_CONTENT_CATEGORY_LIMITED"]).optional(),
  /** Optional. The average number of times you want ads from this line item to show t */
  targetFrequency: z.lazy(() => TargetFrequency).optional(),
  /** Settings that control what YouTube and Partners inventories the line item will t */
  inventorySourceSettings: z.lazy(() => YoutubeAndPartnersInventorySourceConfig).optional(),
  /** Optional. The third-party measurement configs of the line item. */
  thirdPartyMeasurementConfigs: z.lazy(() => ThirdPartyMeasurementConfigs).optional(),
  /** Optional. The IDs of the videos appear below the primary video ad when the ad is */
  relatedVideoIds: z.array(z.string()).optional(),
  /** Optional. The settings related to VideoAdSequence. */
  videoAdSequenceSettings: z.lazy(() => VideoAdSequenceSettings).optional(),
  /** Output only. The content category which takes effect when serving the line item. */
  effectiveContentCategory: z.enum(["YOUTUBE_AND_PARTNERS_CONTENT_CATEGORY_UNSPECIFIED", "YOUTUBE_AND_PARTNERS_CONTENT_CATEGORY_STANDARD", "YOUTUBE_AND_PARTNERS_CONTENT_CATEGORY_EXPANDED", "YOUTUBE_AND_PARTNERS_CONTENT_CATEGORY_LIMITED"]).optional(),
  /** The view frequency cap settings of the line item. The max_views field in this se */
  viewFrequencyCap: z.lazy(() => FrequencyCap).optional(),
  /** Optional. The ID of the merchant which is linked to the line item for product fe */
  linkedMerchantId: z.string().optional(),
});

/**
 * The video ad inventory control used in certain YouTube line item types.
 */
export const VideoAdInventoryControl = z.object({
  /** Optional. Whether ads can serve as shorts format. */
  allowShorts: z.boolean().optional(),
  /** Optional. Whether ads can serve as in-feed format. */
  allowInFeed: z.boolean().optional(),
  /** Optional. Whether ads can serve as in-stream format. */
  allowInStream: z.boolean().optional(),
});

/**
 * Setting that controls the average number of times the ads will show to the same person over a certain period of time.
 */
export const TargetFrequency = z.object({
  /** The unit of time in which the target frequency will be applied. The following ti */
  timeUnit: z.enum(["TIME_UNIT_UNSPECIFIED", "TIME_UNIT_LIFETIME", "TIME_UNIT_MONTHS", "TIME_UNIT_WEEKS", "TIME_UNIT_DAYS", "TIME_UNIT_HOURS", "TIME_UNIT_MINUTES"]).optional(),
  /** The target number of times, on average, the ads will be shown to the same person */
  targetCount: z.string().optional(),
  /** The number of time_unit the target frequency will last. The following restrictio */
  timeUnitCount: z.number().int().optional(),
});

/**
 * Settings that control what YouTube related inventories the YouTube and Partners line item will target.
 */
export const YoutubeAndPartnersInventorySourceConfig = z.object({
  /** Optional. Whether to target inventory on YouTube. This includes both search, cha */
  includeYoutube: z.boolean().optional(),
  /** Optional. Whether to target inventory in video apps available with Google TV. */
  includeGoogleTv: z.boolean().optional(),
  /** Whether to target inventory on a collection of partner sites and apps that follo */
  includeYoutubeVideoPartners: z.boolean().optional(),
});

/**
 * Settings that control what third-party vendors are measuring specific line item metrics.
 */
export const ThirdPartyMeasurementConfigs = z.object({
  /** Optional. The third-party vendors measuring viewability. The following third-par */
  viewabilityVendorConfigs: z.array(z.lazy(() => ThirdPartyVendorConfig)).optional(),
  /** Optional. The third-party vendors measuring reach. The following third-party ven */
  reachVendorConfigs: z.array(z.lazy(() => ThirdPartyVendorConfig)).optional(),
  /** Optional. The third-party vendors measuring brand safety. The following third-pa */
  brandSafetyVendorConfigs: z.array(z.lazy(() => ThirdPartyVendorConfig)).optional(),
  /** Optional. The third-party vendors measuring brand lift. The following third-part */
  brandLiftVendorConfigs: z.array(z.lazy(() => ThirdPartyVendorConfig)).optional(),
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
 * Settings related to VideoAdSequence.
 */
export const VideoAdSequenceSettings = z.object({
  /** The minimum time interval before the same user sees this sequence again. */
  minimumDuration: z.enum(["VIDEO_AD_SEQUENCE_MINIMUM_DURATION_UNSPECIFIED", "VIDEO_AD_SEQUENCE_MINIMUM_DURATION_WEEK", "VIDEO_AD_SEQUENCE_MINIMUM_DURATION_MONTH"]).optional(),
  /** The steps of which the sequence consists. */
  steps: z.array(z.lazy(() => VideoAdSequenceStep)).optional(),
});

/**
 * The detail of a single step in a VideoAdSequence.
 */
export const VideoAdSequenceStep = z.object({
  /** The interaction on the previous step that will lead the viewer to this step. The */
  interactionType: z.enum(["INTERACTION_TYPE_UNSPECIFIED", "INTERACTION_TYPE_PAID_VIEW", "INTERACTION_TYPE_SKIP", "INTERACTION_TYPE_IMPRESSION", "INTERACTION_TYPE_ENGAGED_IMPRESSION"]).optional(),
  /** The ID of the previous step. The first step does not have previous step. */
  previousStepId: z.string().optional(),
  /** The ID of the step. */
  stepId: z.string().optional(),
  /** The ID of the corresponding ad group of the step. */
  adGroupId: z.string().optional(),
});

/**
 * Settings that control the active duration of a line item.
 */
export const LineItemFlight = z.object({
  /** Required. The type of the line item's flight dates. */
  flightDateType: z.enum(["LINE_ITEM_FLIGHT_DATE_TYPE_UNSPECIFIED", "LINE_ITEM_FLIGHT_DATE_TYPE_INHERITED", "LINE_ITEM_FLIGHT_DATE_TYPE_CUSTOM"]).optional(),
  /** The flight start and end dates of the line item. They are resolved relative to t */
  dateRange: z.lazy(() => DateRange).optional(),
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
  /** Required. The ID of the Floodlight activity. */
  floodlightActivityId: z.string().optional(),
  /** Required. The number of days after an ad has been viewed in which a conversion m */
  postViewLookbackWindowDays: z.number().int().optional(),
  /** Required. The number of days after an ad has been clicked in which a conversion  */
  postClickLookbackWindowDays: z.number().int().optional(),
});

/**
 * A mobile app promoted by a mobile app install line item.
 */
export const MobileApp = z.object({
  /** Output only. The app name. */
  displayName: z.string().optional(),
  /** Output only. The app platform. */
  platform: z.enum(["PLATFORM_UNSPECIFIED", "IOS", "ANDROID"]).optional(),
  /** Output only. The app publisher. */
  publisher: z.string().optional(),
  /** Required. The ID of the app provided by the platform store. Android apps are ide */
  appId: z.string().optional(),
});

/**
 * Settings that control how partner revenue is calculated.
 */
export const PartnerRevenueModel = z.object({
  /** Required. The markup type of the partner revenue model. */
  markupType: z.enum(["PARTNER_REVENUE_MODEL_MARKUP_TYPE_UNSPECIFIED", "PARTNER_REVENUE_MODEL_MARKUP_TYPE_CPM", "PARTNER_REVENUE_MODEL_MARKUP_TYPE_MEDIA_COST_MARKUP", "PARTNER_REVENUE_MODEL_MARKUP_TYPE_TOTAL_MEDIA_COST_MARKUP"]).optional(),
  /** Required. The markup amount of the partner revenue model. Must be greater than o */
  markupAmount: z.string().optional(),
});

/**
 * Settings that control how budget is allocated.
 */
export const LineItemBudget = z.object({
  /** Output only. The budget unit specifies whether the budget is currency based or i */
  budgetUnit: z.enum(["BUDGET_UNIT_UNSPECIFIED", "BUDGET_UNIT_CURRENCY", "BUDGET_UNIT_IMPRESSIONS"]).optional(),
  /** Required. The type of the budget allocation. `LINE_ITEM_BUDGET_ALLOCATION_TYPE_A */
  budgetAllocationType: z.enum(["LINE_ITEM_BUDGET_ALLOCATION_TYPE_UNSPECIFIED", "LINE_ITEM_BUDGET_ALLOCATION_TYPE_AUTOMATIC", "LINE_ITEM_BUDGET_ALLOCATION_TYPE_FIXED", "LINE_ITEM_BUDGET_ALLOCATION_TYPE_UNLIMITED"]).optional(),
  /** The maximum budget amount the line item will spend. Must be greater than 0. When */
  maxAmount: z.string().optional(),
});

/**
 * Settings that control the [optimized targeting](//support.google.com/displayvideo/answer/12060859) settings of the line item.
 */
export const TargetingExpansionConfig = z.object({
  /** Output only. Magnitude of expansion for eligible first-party user lists under th */
  audienceExpansionLevel: z.enum(["UNKNOWN", "NO_REACH", "LEAST_REACH", "MID_REACH", "MOST_REACH"]).optional(),
  /** Required. Whether to enable Optimized Targeting for the line item. Optimized tar */
  enableOptimizedTargeting: z.boolean().optional(),
  /** Output only. Whether to exclude seed list for audience expansion. This field onl */
  audienceExpansionSeedListExcluded: z.boolean().optional(),
});

/**
 * A single ad group associated with a line item.
 */
export const AdGroup = z.object({
  /** Controls whether or not the ad group can spend its budget and bid on inventory.  */
  entityStatus: z.enum(["ENTITY_STATUS_UNSPECIFIED", "ENTITY_STATUS_ACTIVE", "ENTITY_STATUS_ARCHIVED", "ENTITY_STATUS_DRAFT", "ENTITY_STATUS_PAUSED", "ENTITY_STATUS_SCHEDULED_FOR_DELETION"]).optional(),
  /** The display name of the ad group. Must be UTF-8 encoded with a maximum size of 2 */
  displayName: z.string().optional(),
  /** The [optimized targeting](//support.google.com/displayvideo/answer/12060859) set */
  targetingExpansion: z.lazy(() => TargetingExpansionConfig).optional(),
  /** The settings of the product feed in this ad group. */
  productFeedData: z.lazy(() => ProductFeedData).optional(),
  /** The unique ID of the ad group. Assigned by the system. */
  adGroupId: z.string().optional(),
  /** The resource name of the ad group. */
  name: z.string().optional(),
  /** The format of the ads in the ad group. */
  adGroupFormat: z.enum(["AD_GROUP_FORMAT_UNSPECIFIED", "AD_GROUP_FORMAT_IN_STREAM", "AD_GROUP_FORMAT_VIDEO_DISCOVERY", "AD_GROUP_FORMAT_BUMPER", "AD_GROUP_FORMAT_NON_SKIPPABLE_IN_STREAM", "AD_GROUP_FORMAT_AUDIO", "AD_GROUP_FORMAT_RESPONSIVE", "AD_GROUP_FORMAT_REACH", "AD_GROUP_FORMAT_MASTHEAD"]).optional(),
  /** The unique ID of the advertiser the ad group belongs to. */
  advertiserId: z.string().optional(),
  /** The bidding strategy used by the ad group. Only the youtubeAndPartnersBid field  */
  bidStrategy: z.lazy(() => BiddingStrategy).optional(),
  /** The unique ID of the line item that the ad group belongs to. */
  lineItemId: z.string().optional(),
});

/**
 * The details of product feed.
 */
export const ProductFeedData = z.object({
  /** Whether the product feed has opted-out of showing products. */
  isFeedDisabled: z.boolean().optional(),
  /** How products are selected by the product feed. */
  productMatchType: z.enum(["PRODUCT_MATCH_TYPE_UNSPECIFIED", "PRODUCT_MATCH_TYPE_ALL_PRODUCTS", "PRODUCT_MATCH_TYPE_SPECIFIC_PRODUCTS", "PRODUCT_MATCH_TYPE_CUSTOM_LABEL"]).optional(),
  /** A list of dimensions used to match products. */
  productMatchDimensions: z.array(z.lazy(() => ProductMatchDimension)).optional(),
});

/**
 * A dimension used to match products.
 */
export const ProductMatchDimension = z.object({
  /** The custom label to match all the products with the label. */
  customLabel: z.lazy(() => CustomLabel).optional(),
  /** The ID of the product offer to match with a product with the same offer ID. */
  productOfferId: z.string().optional(),
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

export const ListPartnersResponse = z.object({
  /** The list of partners. This list will be absent if empty. */
  partners: z.array(z.lazy(() => Partner)).optional(),
  /** A token to retrieve the next page of results. Pass this value in the page_token  */
  nextPageToken: z.string().optional(),
});

export const ListAdvertisersResponse = z.object({
  /** The list of advertisers. This list will be absent if empty. */
  advertisers: z.array(z.lazy(() => Advertiser)).optional(),
  /** A token to retrieve the next page of results. Pass this value in the page_token  */
  nextPageToken: z.string().optional(),
});

export const ListInsertionOrdersResponse = z.object({
  /** A token to retrieve the next page of results. Pass this value in the page_token  */
  nextPageToken: z.string().optional(),
  /** The list of insertion orders. This list will be absent if empty. */
  insertionOrders: z.array(z.lazy(() => InsertionOrder)).optional(),
});

export const ListLineItemsResponse = z.object({
  /** A token to retrieve the next page of results. Pass this value in the page_token  */
  nextPageToken: z.string().optional(),
  /** The list of line items. This list will be absent if empty. */
  lineItems: z.array(z.lazy(() => LineItem)).optional(),
});

export const ListAdGroupsResponse = z.object({
  /** A token to retrieve the next page of results. Pass this value in the page_token  */
  nextPageToken: z.string().optional(),
  /** The list of ad groups. This list will be absent if empty. */
  adGroups: z.array(z.lazy(() => AdGroup)).optional(),
});

/**
 * Represents an amount of money with its currency type.
 */
export const Money = z.object({
  /** The whole units of the amount. For example if `currencyCode` is `"USD"`, then 1  */
  units: z.string().optional(),
  /** The three-letter currency code defined in ISO 4217. */
  currencyCode: z.string().optional(),
  /** Number of nano (10^-9) units of the amount. The value must be between -999,999,9 */
  nanos: z.number().int().optional(),
});

/**
 * The `Status` type defines a logical error model that is suitable for different programming environments, including REST APIs and RPC APIs. It is used by [gRPC](https://github.com/grpc). Each `Status` message contains three pieces of data: error code, error message, and error details. You can find out more about this error model and how to work with it in the [API Design Guide](https://cloud.google.com/apis/design/errors).
 */
export const Status = z.object({
  /** The status code, which should be an enum value of google.rpc.Code. */
  code: z.number().int().optional(),
  /** A list of messages that carry the error details. There is a common set of messag */
  details: z.array(z.record(z.unknown())).optional(),
  /** A developer-facing error message, which should be in English. Any user-facing er */
  message: z.string().optional(),
});

/**
 * Dimensions.
 */
export const Dimensions = z.object({
  /** The width in pixels. */
  widthPixels: z.number().int().optional(),
  /** The height in pixels. */
  heightPixels: z.number().int().optional(),
});

/**
 * All schemas exported as a single object
 */
export const schemas = {
  Partner,
  PartnerDataAccessConfig,
  SdfConfig,
  PartnerAdServerConfig,
  MeasurementConfig,
  PartnerBillingConfig,
  PartnerGeneralConfig,
  ExchangeConfig,
  ExchangeConfigEnabledExchange,
  Advertiser,
  AdvertiserCreativeConfig,
  AdvertiserGeneralConfig,
  IntegrationDetails,
  AdvertiserBillingConfig,
  AdvertiserTargetingConfig,
  AdvertiserAdServerConfig,
  CmHybridConfig,
  ThirdPartyOnlyConfig,
  AdvertiserDataAccessConfig,
  AdvertiserSdfConfig,
  InsertionOrder,
  Kpi,
  BiddingStrategy,
  MaximizeSpendBidStrategy,
  YoutubeAndPartnersBiddingStrategy,
  FixedBidStrategy,
  PerformanceGoalBidStrategy,
  InsertionOrderBudget,
  InsertionOrderBudgetSegment,
  DateRange,
  Date,
  Pacing,
  PartnerCost,
  FrequencyCap,
  LineItem,
  YoutubeAndPartnersSettings,
  VideoAdInventoryControl,
  TargetFrequency,
  YoutubeAndPartnersInventorySourceConfig,
  ThirdPartyMeasurementConfigs,
  ThirdPartyVendorConfig,
  VideoAdSequenceSettings,
  VideoAdSequenceStep,
  LineItemFlight,
  ConversionCountingConfig,
  TrackingFloodlightActivityConfig,
  MobileApp,
  PartnerRevenueModel,
  LineItemBudget,
  TargetingExpansionConfig,
  AdGroup,
  ProductFeedData,
  ProductMatchDimension,
  CustomLabel,
  ListPartnersResponse,
  ListAdvertisersResponse,
  ListInsertionOrdersResponse,
  ListLineItemsResponse,
  ListAdGroupsResponse,
  Money,
  Status,
  Dimensions,
};