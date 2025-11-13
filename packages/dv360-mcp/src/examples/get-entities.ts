import { google, displayvideo_v3 } from "googleapis";
import { GaxiosResponse } from "gaxios";

// ===== GENERATED TYPES & SCHEMAS =====
// Using types and Zod schemas generated from OpenAPI schema extraction
import type { components } from "@/generated/schemas/types";
import {
  Partner as PartnerSchema,
  Advertiser as AdvertiserSchema,
  InsertionOrder as InsertionOrderSchema,
  LineItem as LineItemSchema,
  AdGroup as AdGroupSchema,
  schemas,
} from "@/generated/schemas/zod";

// Type aliases for cleaner usage
type Partner = components["schemas"]["Partner"];
type Advertiser = components["schemas"]["Advertiser"];
type InsertionOrder = components["schemas"]["InsertionOrder"];
type LineItem = components["schemas"]["LineItem"];
type AdGroup = components["schemas"]["AdGroup"];
type BiddingStrategy = components["schemas"]["BiddingStrategy"];
type DateRange = components["schemas"]["DateRange"];
type InsertionOrderBudget = components["schemas"]["InsertionOrderBudget"];

// ===== TODO: Missing Infrastructure =====
// The following imports are broken and need to be implemented:
// import { getClient } from "./auth";
// import { CONSTANTS } from "@/constants";
// import { formatDate, convertSchemaDateToDateObject, getCurrentDate, isDateInRange } from "@/utils/date";
// import { throttleRequests, type ApiResponse, isErrorResponse } from "@/utils/throttle-requests";
// import { DISPLAYVIDEO_SECRET_NAME } from "@/constants";
// import { type LogParams } from "@/types";

// Temporary definitions for demonstration purposes
type LogParams = { type: "ERROR" | "WARNING" | "INFO"; message: string };
type EntityError = { type: string; message: string; entityId?: string };

// Constants (TODO: Move to @/constants)
const DEFAULT_AUTH_SCOPES = ["https://www.googleapis.com/auth/display-video"];
const MICROS_PER_DOLLAR = 1000000;

// Error creation helper
const createEntityError = (message: string, type: string, entityId?: string): EntityError => ({
  type,
  message,
  entityId,
});

// Logging utility
const logMessage = ({ type, message }: LogParams): void => {
  switch (type) {
    case "ERROR":
      console.error(message);
      break;
    case "WARNING":
      console.warn(message);
      break;
    default:
      console.info(message);
  }
};

// Authentication helper
const getAuthenticatedClient = async (accessToken?: string) => {
  try {
    const client = await getClient({
      secretName: DISPLAYVIDEO_SECRET_NAME,
      requiredScopes: [...DEFAULT_AUTH_SCOPES],
    });

    if (accessToken) {
      client.setCredentials({ access_token: accessToken });
    }

    return client;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    throw new Error(`Failed to authenticate client: ${errorMessage}`);
  }
};

// Date formatting helper
const safeFormatDate = (date: displayvideo_v3.Schema$Date | undefined): string => {
  try {
    const dateObject = convertSchemaDateToDateObject(date);
    return dateObject ? formatDate(dateObject) : "";
  } catch {
    return "";
  }
};

// ================================================================================
// API FUNCTIONS - Demonstrating Generated Schema Integration
// ================================================================================
// The functions below show how to use generated TypeScript types and Zod schemas:
// 1. Type annotations use: components["schemas"]["EntityName"]
// 2. Runtime validation uses: EntityNameSchema.parse(data)
// 3. Full entity data is returned (no custom transformations)
//
// For production use, you would:
// - Implement missing infrastructure (auth, utils, constants)
// - Add proper error handling and retry logic
// - Consider whether to use full schemas or create simplified response types
// ================================================================================

// Partner functions
const getPartners = async (accessToken?: string): Promise<Partner[]> => {
  const authClient = await getAuthenticatedClient(accessToken);
  const service = google.displayvideo({ version: "v3", auth: authClient });

  try {
    const response = await service.partners.list({
      filter: 'entityStatus = "ENTITY_STATUS_ACTIVE"',
      pageSize: 200,
    });

    // ===== EXAMPLE: Zod Validation of API Response =====
    // Validate each partner against the generated schema
    const validatedPartners: Partner[] = [];

    for (const partner of response.data?.partners ?? []) {
      try {
        // Using generated Zod schema for runtime validation
        const validated = PartnerSchema.parse(partner);
        validatedPartners.push(validated);
      } catch (zodError) {
        logMessage({
          type: "WARNING",
          message: `Partner validation failed for ${partner.partnerId}: ${zodError}`,
        });
        // Optionally continue with unvalidated data or skip
        // For demonstration, we'll push the raw data with a type assertion
        validatedPartners.push(partner as Partner);
      }
    }

    return validatedPartners;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logMessage({
      type: "ERROR",
      message: `Error retrieving active partners: ${errorMessage}`,
    });
    throw createEntityError(`Failed to retrieve active partners: ${errorMessage}`, "partner");
  }
};

// Advertiser functions
const getAdvertisers = async ({
  partnerId,
  accessToken,
}: {
  partnerId: string;
  accessToken?: string;
}): Promise<Advertiser[]> => {
  if (!partnerId) {
    throw createEntityError("Partner ID is required", "advertiser");
  }

  const authClient = await getAuthenticatedClient(accessToken);
  const service = google.displayvideo({ version: "v3", auth: authClient });

  try {
    const results: Advertiser[] = [];
    let pageToken: string | undefined;

    do {
      const response: GaxiosResponse<displayvideo_v3.Schema$ListAdvertisersResponse> =
        await service.advertisers.list({
          partnerId,
          filter: 'entityStatus = "ENTITY_STATUS_ACTIVE"',
          pageSize: 200,
          pageToken,
        });

      const advertisers = response.data.advertisers || [];

      // ===== EXAMPLE: Zod Validation with Pagination =====
      // Validate each advertiser from the API response
      for (const advertiser of advertisers) {
        try {
          const validated = AdvertiserSchema.parse(advertiser);
          results.push(validated);
        } catch (zodError) {
          logMessage({
            type: "WARNING",
            message: `Advertiser validation failed for ${advertiser.advertiserId}: ${zodError}`,
          });
          // Continue with unvalidated data for demonstration
          results.push(advertiser as Advertiser);
        }
      }

      pageToken = response.data.nextPageToken || undefined;
    } while (pageToken);

    return results;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logMessage({
      type: "ERROR",
      message: `Error getting advertisers for partner ${partnerId}: ${errorMessage}`,
    });
    throw createEntityError(
      `Failed to get advertisers for partner ${partnerId}: ${errorMessage}`,
      "advertiser",
      partnerId
    );
  }
};

// Insertion Order functions
const getInsertionOrders = async (
  { id }: { id: string },
  accessToken?: string
): Promise<displayvideo_v3.Schema$InsertionOrder[]> => {
  if (!id) {
    throw createEntityError("Advertiser ID is required", "insertionOrder");
  }

  const authClient = await getAuthenticatedClient(accessToken);
  const service = google.displayvideo({ version: "v3", auth: authClient });
  const results: displayvideo_v3.Schema$InsertionOrder[] = [];
  let pageToken: string | undefined;

  try {
    do {
      const response: GaxiosResponse<displayvideo_v3.Schema$ListInsertionOrdersResponse> =
        await service.advertisers.insertionOrders.list({
          advertiserId: id,
          filter: 'entityStatus = "ENTITY_STATUS_ACTIVE"',
          pageSize: 200,
          pageToken,
        });

      results.push(...(response.data.insertionOrders || []));
      pageToken = response.data.nextPageToken || undefined;
    } while (pageToken);

    return results;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logMessage({
      type: "ERROR",
      message: `Error getting insertion orders for advertiser ${id}: ${errorMessage}`,
    });
    throw createEntityError(
      `Failed to get insertion orders for advertiser ${id}: ${errorMessage}`,
      "insertionOrder",
      id
    );
  }
};

const transformInsertionOrders = (
  insertionOrders: displayvideo_v3.Schema$InsertionOrder[],
  currentDate: string
): InsertionOrderResponse[] => {
  const isActiveBudgetSegment = (dateRange?: displayvideo_v3.Schema$DateRange) => {
    const startDate = safeFormatDate(dateRange?.startDate);
    const endDate = safeFormatDate(dateRange?.endDate);
    return startDate && endDate && isDateInRange(currentDate, startDate, endDate);
  };

  const getActiveFlightBudget = (
    budgetSegments: displayvideo_v3.Schema$InsertionOrderBudgetSegment[]
  ) => {
    return budgetSegments.find(({ dateRange }) => isActiveBudgetSegment(dateRange));
  };

  const determineOptimization = (bidStrategy?: displayvideo_v3.Schema$BiddingStrategy) => {
    if (bidStrategy?.maximizeSpendAutoBid || bidStrategy?.performanceGoalAutoBid) {
      return "insertionOrder";
    }
    return "lineItem";
  };

  const getBudgetSegments = (order: displayvideo_v3.Schema$InsertionOrder) => {
    return order.budget?.budgetSegments || [];
  };

  return insertionOrders
    .filter((order) =>
      getBudgetSegments(order).some(({ dateRange }) => isActiveBudgetSegment(dateRange))
    )
    .map((order): InsertionOrderResponse | null => {
      const budgetSegments = getBudgetSegments(order);
      const lastFlight = getActiveFlightBudget(budgetSegments);
      if (!lastFlight) return null;

      const startDate = safeFormatDate(lastFlight.dateRange?.startDate);
      const endDate = safeFormatDate(lastFlight.dateRange?.endDate);
      if (!startDate || !endDate) return null;

      const budget = Number(lastFlight.budgetAmountMicros || 0) / MICROS_PER_DOLLAR;
      const dailyBudget = order.pacing?.dailyMaxMicros
        ? Number(order.pacing.dailyMaxMicros) / MICROS_PER_DOLLAR
        : null;

      return {
        advertiserId: order.advertiserId || "",
        insertionOrderId: order.insertionOrderId || "",
        name: order.displayName || "",
        startDate,
        endDate,
        budget,
        pacing: order.pacing?.pacingType || "",
        dailyBudget,
        performanceGoal: order.kpi || null,
        optimization: determineOptimization(order.bidStrategy),
      };
    })
    .filter((order): order is InsertionOrderResponse => order !== null);
};

// Line Item functions
const getLineItems = async (
  { id }: { id: string },
  accessToken?: string
): Promise<displayvideo_v3.Schema$LineItem[]> => {
  if (!id) {
    throw createEntityError("Advertiser ID is required", "lineItem");
  }

  const authClient = await getAuthenticatedClient(accessToken);
  const service = google.displayvideo({ version: "v3", auth: authClient });
  const results: displayvideo_v3.Schema$LineItem[] = [];
  let pageToken: string | undefined;

  try {
    do {
      const response: GaxiosResponse<displayvideo_v3.Schema$ListLineItemsResponse> =
        await service.advertisers.lineItems.list({
          advertiserId: id,
          filter: 'entityStatus = "ENTITY_STATUS_ACTIVE"',
          pageSize: 200,
          pageToken,
        });

      results.push(...(response.data.lineItems || []));
      pageToken = response.data.nextPageToken || undefined;
    } while (pageToken);

    return results;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logMessage({
      type: "ERROR",
      message: `Error getting line items for advertiser ${id}: ${errorMessage}`,
    });
    throw createEntityError(
      `Failed to get line items for advertiser ${id}: ${errorMessage}`,
      "lineItem",
      id
    );
  }
};

const transformLineItems = (
  lineItems: displayvideo_v3.Schema$LineItem[],
  currentDate: string
): LineItemResponse[] => {
  const isActiveLineItem = (lineItem: displayvideo_v3.Schema$LineItem) => {
    const { startDate, endDate } = lineItem.flight?.dateRange || {};
    const formattedStart = safeFormatDate(startDate);
    const formattedEnd = safeFormatDate(endDate);
    return (
      formattedStart && formattedEnd && isDateInRange(currentDate, formattedStart, formattedEnd)
    );
  };

  const determineRevenueType = (
    markupType: string | null | undefined
  ): LineItemResponse["revenueType"] => {
    if (!markupType) return null;
    switch (markupType) {
      case "PARTNER_REVENUE_MODEL_MARKUP_TYPE_TOTAL_MEDIA_COST_MARKUP":
        return "cost_plus_margin";
      case "PARTNER_REVENUE_MODEL_MARKUP_TYPE_CPM":
        return "cpm";
      default:
        return null;
    }
  };

  return lineItems.filter(isActiveLineItem).map((lineItem) => ({
    advertiserId: lineItem.advertiserId || "",
    insertionOrderId: lineItem.insertionOrderId || "",
    lineItemId: lineItem.lineItemId || "",
    name: lineItem.displayName || "",
    bidStrategy: lineItem.bidStrategy || null,
    youtube: !!lineItem.youtubeAndPartnersSettings,
    lifetimeBudget: lineItem.budget?.maxAmount
      ? Number(lineItem.budget.maxAmount) / MICROS_PER_DOLLAR
      : null,
    dailyBudget: lineItem.pacing?.dailyMaxMicros
      ? Number(lineItem.pacing.dailyMaxMicros) / MICROS_PER_DOLLAR
      : null,
    startDate: safeFormatDate(lineItem.flight?.dateRange?.startDate),
    endDate: safeFormatDate(lineItem.flight?.dateRange?.endDate),
    partnerRevenueModel: lineItem.partnerRevenueModel || {},
    reservationType: lineItem.reservationType || "",
    revenueType: determineRevenueType(lineItem.partnerRevenueModel?.markupType),
  }));
};

// Ad Group functions
const getAdGroups = async (
  { id }: { id: string },
  accessToken?: string
): Promise<displayvideo_v3.Schema$AdGroup[]> => {
  if (!id) {
    throw createEntityError("Advertiser ID is required", "adGroup");
  }

  const authClient = await getAuthenticatedClient(accessToken);
  const service = google.displayvideo({ version: "v3", auth: authClient });
  const results: displayvideo_v3.Schema$AdGroup[] = [];
  let pageToken: string | undefined;

  try {
    do {
      const response: GaxiosResponse<displayvideo_v3.Schema$ListAdGroupsResponse> =
        await service.advertisers.adGroups.list({
          advertiserId: id,
          filter: 'entityStatus = "ENTITY_STATUS_ACTIVE"',
          pageSize: 200,
          pageToken,
        });

      results.push(...(response.data.adGroups || []));
      pageToken = response.data.nextPageToken || undefined;
    } while (pageToken);

    return results;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logMessage({
      type: "ERROR",
      message: `Error getting ad groups for advertiser ${id}: ${errorMessage}`,
    });
    throw createEntityError(
      `Failed to get ad groups for advertiser ${id}: ${errorMessage}`,
      "adGroup",
      id
    );
  }
};

const transformAdGroups = (adGroups: displayvideo_v3.Schema$AdGroup[]): AdGroupResponse[] => {
  return adGroups.map((adGroup) => ({
    advertiserId: adGroup.advertiserId || "",
    adGroupId: adGroup.adGroupId || "",
    lineItemId: adGroup.lineItemId || "",
    bidStrategy: adGroup.bidStrategy || null,
  }));
};

// Targeting functions
const getAdGroupTargeting = async (
  service: displayvideo_v3.Displayvideo,
  { advertiserId, adGroupIds }: { advertiserId: string; adGroupIds: string[] }
): Promise<{
  positiveChannels: string[];
  negativeChannels: string[];
  positiveVideos: string[];
  negativeVideos: string[];
}> => {
  if (!advertiserId || adGroupIds.length === 0) {
    throw createEntityError("Advertiser ID and Ad Group IDs are required", "adGroupTargeting");
  }

  try {
    const targeting = {
      positiveChannels: new Set<string>(),
      negativeChannels: new Set<string>(),
      positiveVideos: new Set<string>(),
      negativeVideos: new Set<string>(),
    };
    let pageToken: string | undefined;

    do {
      const response: GaxiosResponse<displayvideo_v3.Schema$BulkListAdGroupAssignedTargetingOptionsResponse> =
        await service.advertisers.adGroups.bulkListAdGroupAssignedTargetingOptions({
          advertiserId,
          adGroupIds,
          filter:
            'targetingType = "TARGETING_TYPE_YOUTUBE_CHANNEL" OR targetingType="TARGETING_TYPE_YOUTUBE_VIDEO"',
          pageToken,
        });

      response.data.adGroupAssignedTargetingOptions?.forEach((adGroup) => {
        const { assignedTargetingOption } = adGroup;

        if (assignedTargetingOption?.youtubeChannelDetails) {
          const { channelId, negative } = assignedTargetingOption.youtubeChannelDetails;
          if (channelId) {
            (negative ? targeting.negativeChannels : targeting.positiveChannels).add(channelId);
          }
        }

        if (assignedTargetingOption?.youtubeVideoDetails) {
          const { videoId, negative } = assignedTargetingOption.youtubeVideoDetails;
          if (videoId) {
            (negative ? targeting.negativeVideos : targeting.positiveVideos).add(videoId);
          }
        }
      });

      pageToken = response.data.nextPageToken || undefined;
    } while (pageToken);

    return {
      positiveChannels: Array.from(targeting.positiveChannels),
      negativeChannels: Array.from(targeting.negativeChannels),
      positiveVideos: Array.from(targeting.positiveVideos),
      negativeVideos: Array.from(targeting.negativeVideos),
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logMessage({
      type: "ERROR",
      message: `Error getting ad group targeting for advertiser ${advertiserId}: ${errorMessage}`,
    });
    throw createEntityError(
      `Failed to get ad group targeting for advertiser ${advertiserId}: ${errorMessage}`,
      "adGroupTargeting",
      advertiserId
    );
  }
};

// Composite functions
const getAdvertiserEntities = async ({
  advertiserEntities,
  accessToken,
}: {
  advertiserEntities: { id: string }[];
  accessToken?: string;
}): Promise<{
  insertionOrderFlights: InsertionOrderResponse[];
  lineItemFlights: LineItemResponse[];
  adGroupFlights: AdGroupResponse[];
}> => {
  if (!advertiserEntities?.length) {
    logMessage({
      type: "ERROR",
      message: "At least one advertiser entity is required",
    });
    throw createEntityError("At least one advertiser entity is required", "advertiserEntity");
  }

  const authClient = await getAuthenticatedClient(accessToken);
  const service = google.displayvideo({ version: "v3", auth: authClient });
  const currentDate = getCurrentDate();

  try {
    const fetchInsertionOrders = async (
      entity: { id: string },
      authClient: displayvideo_v3.Displayvideo
    ): Promise<ApiResponse<displayvideo_v3.Schema$InsertionOrder[]>> => {
      const response = await getInsertionOrders(entity, accessToken);
      return { data: response } as GaxiosResponse<displayvideo_v3.Schema$InsertionOrder[]>;
    };

    const fetchLineItems = async (
      entity: { id: string },
      authClient: displayvideo_v3.Displayvideo
    ): Promise<ApiResponse<displayvideo_v3.Schema$LineItem[]>> => {
      const response = await getLineItems(entity, accessToken);
      return { data: response } as GaxiosResponse<displayvideo_v3.Schema$LineItem[]>;
    };

    const fetchAdGroups = async (
      entity: { id: string },
      authClient: displayvideo_v3.Displayvideo
    ): Promise<ApiResponse<displayvideo_v3.Schema$AdGroup[]>> => {
      const response = await getAdGroups(entity, accessToken);
      return { data: response } as GaxiosResponse<displayvideo_v3.Schema$AdGroup[]>;
    };

    const [insertionOrderResults, lineItemResults, adGroupResults] = await Promise.all([
      throttleRequests<
        { id: string },
        displayvideo_v3.Displayvideo,
        displayvideo_v3.Schema$InsertionOrder[]
      >({
        func: fetchInsertionOrders,
        params: advertiserEntities,
        authClient: service,
      }),
      throttleRequests<
        { id: string },
        displayvideo_v3.Displayvideo,
        displayvideo_v3.Schema$LineItem[]
      >({
        func: fetchLineItems,
        params: advertiserEntities,
        authClient: service,
      }),
      throttleRequests<
        { id: string },
        displayvideo_v3.Displayvideo,
        displayvideo_v3.Schema$AdGroup[]
      >({
        func: fetchAdGroups,
        params: advertiserEntities,
        authClient: service,
      }),
    ]);

    const isSuccessfulResponse = <T>(
      result: PromiseSettledResult<ApiResponse<T>>
    ): result is PromiseFulfilledResult<GaxiosResponse<T>> => {
      return (
        result.status === "fulfilled" &&
        result.value !== null &&
        !isErrorResponse(result.value) &&
        "data" in result.value
      );
    };

    return {
      insertionOrderFlights: insertionOrderResults
        .filter(isSuccessfulResponse)
        .flatMap((result) => transformInsertionOrders(result.value.data, currentDate)),
      lineItemFlights: lineItemResults
        .filter(isSuccessfulResponse)
        .flatMap((result) => transformLineItems(result.value.data, currentDate)),
      adGroupFlights: adGroupResults
        .filter(isSuccessfulResponse)
        .flatMap((result) => transformAdGroups(result.value.data)),
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logMessage({
      type: "ERROR",
      message: `Error getting advertiser entities: ${errorMessage}`,
    });
    throw createEntityError(`Failed to get advertiser entities: ${errorMessage}`, "advertiser");
  }
};

export {
  getPartners,
  getAdvertisers,
  getInsertionOrders,
  getLineItems,
  getAdGroups,
  getAdGroupTargeting,
  getAdvertiserEntities,
};
