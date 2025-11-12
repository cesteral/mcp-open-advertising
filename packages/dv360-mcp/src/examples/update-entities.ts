import { displayvideo_v3 } from "googleapis";
import { GaxiosResponse } from "gaxios";
import { getAuthenticatedService } from "./auth";
import { throttleRequests, type ApiResponse } from "@/utils/throttle-requests";
import { sdfDownloadAndUpload } from "./SDF";
import { LogParams } from "@/types";
import { LineItem, SDFParams } from "@/platforms/dv360/types";
import { OAuth2Client, IdTokenClient } from "google-auth-library";

// Custom error handling
class EntityError extends Error {
  constructor(
    message: string,
    public readonly entityType: string,
    public readonly entityId?: string
  ) {
    super(message);
    this.name = "EntityError";
  }
}

interface LineItemConfig {
  advertiserId: string;
  lineItemId: string;
  updateMask: string;
  resource: Partial<displayvideo_v3.Schema$LineItem>;
}

interface UpdateResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

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

const isValidObject = (obj: unknown): obj is Record<string, unknown> => {
  return !!obj && typeof obj === "object" && Object.keys(obj as object).length > 0;
};

const buildLineItemConfig = (lineItem: LineItem): LineItemConfig => {
  const resource: Partial<displayvideo_v3.Schema$LineItem> = {};
  const updateMask: string[] = [];

  if ("partnerRevenueModel" in lineItem && lineItem.partnerRevenueModel) {
    updateMask.push("partnerRevenueModel");
    resource.partnerRevenueModel = {
      ...lineItem.partnerRevenueModel,
      markupAmount: String(lineItem.partnerRevenueModel.markupAmount),
    };
  }

  if (isValidObject(lineItem.bidStrategy)) {
    updateMask.push("bidStrategy");
    resource.bidStrategy = lineItem.bidStrategy;
  }

  return {
    advertiserId: lineItem.advertiserId,
    lineItemId: lineItem.lineItemId,
    updateMask: updateMask.join(","),
    resource,
  };
};

const updateLineItem = async (
  lineItem: LineItem,
  authClient: displayvideo_v3.Displayvideo
): Promise<ApiResponse<displayvideo_v3.Schema$LineItem>> => {
  if (!lineItem) {
    logMessage({
      type: "ERROR",
      message: "Error: lineItem is undefined or null.",
    });
    throw new EntityError("Invalid lineItem", "lineItem");
  }

  const lineItemConfig = buildLineItemConfig(lineItem);

  if (!isValidObject(lineItemConfig.resource)) {
    logMessage({
      type: "WARNING",
      message: "No valid properties found to update in updateLineItem function.",
    });
    return null;
  }

  try {
    const response = await authClient.advertisers.lineItems.patch(lineItemConfig);
    return response;
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    logMessage({
      type: "ERROR",
      message: `Error updating line item: ${lineItem.lineItemId}. Error: ${errorMessage}`,
    });
    return {
      error: {
        message: `Failed to update line item: ${errorMessage}`,
      },
    };
  }
};

const bulkUpdateLineItems = async (
  params: LineItem[],
  accessToken?: string
): Promise<UpdateResult[]> => {
  const results: UpdateResult[] = [];

  if (!params?.length) {
    logMessage({
      type: "ERROR",
      message: "No line items provided for bulk update.",
    });
    throw new EntityError("No line items provided for bulk update", "bulkUpdateLineItems");
  }

  try {
    logMessage({
      type: "INFO",
      message: `Starting bulk update for ${params.length} line items.`,
    });

    // Use new centralized auth function and get both service and client
    const { service } = await getAuthenticatedService(accessToken);

    const response = await throttleRequests<
      LineItem,
      displayvideo_v3.Displayvideo,
      displayvideo_v3.Schema$LineItem
    >({
      func: updateLineItem,
      params,
      authClient: service,
    });

    response.forEach((result) => {
      if (result.status === "fulfilled" && result.value && !("error" in result.value)) {
        results.push({
          success: true,
          data: result.value.data,
        });
      } else {
        const error =
          result.status === "rejected"
            ? result.reason instanceof Error
              ? result.reason.message
              : "Unknown error"
            : result.value && "error" in result.value
              ? result.value.error.message
              : "Unknown error";

        logMessage({
          type: "ERROR",
          message: `Failed to update line item: ${error}`,
        });

        results.push({
          success: false,
          error,
        });
      }
    });

    logMessage({
      type: "INFO",
      message: `Bulk update completed: ${
        results.filter((r) => r.success).length
      } successes, ${results.filter((r) => !r.success).length} failures.`,
    });

    return results;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logMessage({
      type: "ERROR",
      message: `Bulk update operation failed: ${errorMessage}`,
    });
    throw new EntityError("Failed to process bulk update operation", "bulkUpdateLineItems");
  }
};

const bulkUpdateSdf = async (
  sdfUpdates: SDFParams[],
  accessToken?: string
): Promise<UpdateResult[]> => {
  const results: UpdateResult[] = [];

  // Enhanced validation: check if the input is a valid array
  if (!Array.isArray(sdfUpdates) || sdfUpdates.length === 0) {
    const message = "No valid SDF updates provided for bulk operation.";
    logMessage({
      type: "ERROR",
      message,
    });
    throw new EntityError(message, "bulkUpdateSdf");
  }

  try {
    // Filter out invalid updates that are missing required fields
    const validUpdates = sdfUpdates.filter((update) => {
      // Check for lineItemId (singular) or lineItemIds (plural)
      const hasLineItems =
        (Array.isArray(update.lineItemIds) && update.lineItemIds.length > 0) ||
        Boolean((update as any).lineItemId);

      const hasRequiredFields =
        Boolean(update.advertiserId) && Boolean(update.insertionOrderId) && hasLineItems;

      if (!hasRequiredFields) {
        logMessage({
          type: "WARNING",
          message: `Skipping invalid SDF update: missing required fields`,
        });
      }

      console.log("update", update);

      return hasRequiredFields;
    });

    // Format each update to ensure lineItemIds is always an array
    const formattedUpdates = validUpdates.map((update) => {
      // Create a new object to avoid mutating the original
      const formatted = { ...update };

      // Convert lineItemId to lineItemIds if needed
      if (!Array.isArray(formatted.lineItemIds) || formatted.lineItemIds.length === 0) {
        formatted.lineItemIds = (formatted as any).lineItemId
          ? [(formatted as any).lineItemId]
          : [];
      }

      // Convert adGroupId to adGroupIds if needed
      if (!Array.isArray(formatted.adGroupIds) || formatted.adGroupIds.length === 0) {
        formatted.adGroupIds = (formatted as any).adGroupId ? [(formatted as any).adGroupId] : [];
      }

      // Ensure sdfUpdatesArr is always an array
      if (!Array.isArray(formatted.sdfUpdatesArr)) {
        formatted.sdfUpdatesArr = [];
      }

      return formatted;
    });

    // If no valid updates remain after filtering, return early
    if (formattedUpdates.length === 0) {
      const message = "No valid SDF updates remain after filtering.";
      logMessage({
        type: "ERROR",
        message,
      });
      throw new EntityError(message, "bulkUpdateSdf");
    }

    logMessage({
      type: "INFO",
      message: `Processing ${formattedUpdates.length} valid SDF updates out of ${sdfUpdates.length} total updates.`,
    });

    // Check if access token is provided, but wasn't added to the SDFParams
    const updatesWithToken = formattedUpdates.map((update) => ({
      ...update,
      accessToken: update.accessToken || accessToken,
    }));

    // Group updates by advertiser + insertion order + line item using a more elegant approach
    interface GroupedUpdate {
      key: string;
      params: SDFParams;
    }

    // Generate a unique key for grouping
    const getUpdateKey = (update: SDFParams): string => {
      // Safely access lineItemIds with nullish coalescing for better readability
      const advertiserId = update.advertiserId ?? "";
      const insertionOrderId = update.insertionOrderId ?? "";
      const lineItemId =
        Array.isArray(update.lineItemIds) && update.lineItemIds.length > 0
          ? update.lineItemIds[0]
          : "";

      return `${advertiserId}:${insertionOrderId}:${lineItemId}`;
    };

    // Initial reduction to group updates
    const groupedUpdates = updatesWithToken.reduce<Record<string, GroupedUpdate>>((acc, update) => {
      const key = getUpdateKey(update);

      if (!acc[key]) {
        // First update for this key
        // Make sure we have a seatId (using partnerId if available since they are the same entity)
        // if (!update.seatId && update.partnerId) {
        //   update.seatId = update.partnerId;
        //   logMessage({
        //     type: "INFO",
        //     message: `Using partnerId ${update.partnerId} as seatId since they refer to the same entity (advertiser: ${update.advertiserId})`,
        //   });
        // }

        acc[key] = {
          key,
          params: { ...update },
        };
      } else {
        // Merge with existing update
        const existing = acc[key].params;

        // Use Sets for deduplication
        const adGroupIds = new Set([...(existing.adGroupIds || []), ...(update.adGroupIds || [])]);

        // Combine the updates arrays
        existing.sdfUpdatesArr = [
          ...(existing.sdfUpdatesArr || []),
          ...(update.sdfUpdatesArr || []),
        ];

        // Update adGroupIds with deduplicated values
        existing.adGroupIds = Array.from(adGroupIds);

        // Ensure seatId is preserved during merge:
        // If the existing group doesn't have a seatId, but the current update does,
        // use the seatId from the current update.
        if (!existing.seatId && update.seatId) {
          existing.seatId = update.seatId;
        }
        // Removed partnerId fallback logic here
      }

      return acc;
    }, {});

    // Enhanced logging for grouped updates
    const groupKeys = Object.keys(groupedUpdates);
    logMessage({
      type: "INFO",
      message: `Created ${groupKeys.length} unique update groups by advertiser:IO:lineItem combinations`,
    });

    // Log more detailed information if there were any optimized (grouped) updates
    if (groupKeys.length < formattedUpdates.length) {
      for (const key of groupKeys) {
        const group = groupedUpdates[key];
        if (group) {
          const adGroupCount = (group.params.adGroupIds || []).length;
          if (adGroupCount > 1) {
            logMessage({
              type: "INFO",
              message: `Group ${key} contains ${adGroupCount} consolidated ad groups`,
            });
          }
        }
      }
    }

    console.log("groupedUpdates", groupedUpdates);

    // Convert back to array, taking just the params field from each entry
    const optimizedUpdates = Object.values(groupedUpdates).map((group) => group.params);

    const originalCount = formattedUpdates.length;
    const optimizedCount = optimizedUpdates.length;

    logMessage({
      type: "INFO",
      message: `Optimized SDF updates: ${originalCount} requests consolidated into ${optimizedCount} operations${
        originalCount > optimizedCount
          ? ` (${Math.round((1 - optimizedCount / originalCount) * 100)}% reduction)`
          : ""
      }`,
    });

    // Get a default auth client instance from the auth service
    const { authClient: defaultAuthClient } = await getAuthenticatedService(accessToken);

    const wrappedSdfDownloadAndUpload = async (
      param: SDFParams,
      // The _client param from throttleRequests is less relevant now
      _client: OAuth2Client | IdTokenClient
    ): Promise<ApiResponse<boolean>> => {
      try {
        // Log the parameters we're about to use (excluding sensitive data)
        logMessage({
          type: "INFO",
          message: `Starting SDF download and upload for advertiser: ${
            param.advertiserId
          }, IO: ${param.insertionOrderId}, with ${param.adGroupIds?.length || 0} ad groups`,
        });

        const result = await sdfDownloadAndUpload(param);
        return { data: result || false } as GaxiosResponse<boolean>;
      } catch (error) {
        // More detailed error logging
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        logMessage({
          type: "ERROR",
          message: `SDF operation failed: ${errorMessage} for advertiser: ${param.advertiserId}, IO: ${param.insertionOrderId}`,
        });

        return {
          error: {
            message: errorMessage,
          },
        };
      }
    };

    const response = await throttleRequests<SDFParams, OAuth2Client | IdTokenClient, boolean>({
      func: wrappedSdfDownloadAndUpload,
      params: optimizedUpdates,
      authClient: defaultAuthClient,
    });

    response.forEach((result) => {
      if (result.status === "fulfilled" && result.value && !("error" in result.value)) {
        results.push({
          success: true,
          data: result.value.data,
        });
      } else {
        const errorMessage =
          result.status === "rejected"
            ? result.reason instanceof Error
              ? result.reason.message
              : "Unknown error"
            : result.value && "error" in result.value
              ? result.value.error.message
              : "Unknown error";

        logMessage({
          type: "ERROR",
          message: `Failed to update entity: ${errorMessage}`,
        });

        results.push({
          success: false,
          error: errorMessage,
        });
      }
    });

    logMessage({
      type: "INFO",
      message: `Bulk SDF update completed: ${
        results.filter((r) => r.success).length
      } successes, ${results.filter((r) => !r.success).length} failures.`,
    });

    return results;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logMessage({
      type: "ERROR",
      message: `Bulk SDF update operation failed: ${errorMessage}`,
    });
    throw new EntityError("Failed to process bulk SDF update operation", "bulkUpdateSdf");
  }
};

export { bulkUpdateLineItems, bulkUpdateSdf };
