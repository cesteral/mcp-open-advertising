// Example: dsp-mcp/src/services/dv360ProxyClient.ts
import axios, { AxiosInstance, AxiosError } from "axios";
import { loadMcpConfig } from "../config.js";

const config = loadMcpConfig();

const apiClient: AxiosInstance = axios.create({
  baseURL: config.dv360ProxyBaseUrl,
  timeout: 10000, // 10 seconds timeout
});

// Add a request interceptor to include the auth token if available
apiClient.interceptors.request.use(
  (axiosConfig) => {
    if (config.dv360ProxyAuthToken) {
      axiosConfig.headers.Authorization = `Bearer ${config.dv360ProxyAuthToken}`;
    }
    return axiosConfig;
  },
  (error) => {
    return Promise.reject(error);
  }
);

/**
 * Extract detailed error message from Google API error response
 * @param error The axios error object
 * @returns A detailed error message string
 */
function extractDetailedErrorMessage(error: AxiosError): string {
  let errorDetails = "";

  if (error.response?.data) {
    // Try to extract detailed error message from response
    const errorData = error.response.data;

    // Log the entire error data for debugging
    console.error(
      "Full error response data:",
      JSON.stringify(errorData, null, 2)
    );

    if (typeof errorData === "object" && errorData !== null) {
      // Use type assertion and optional chaining to safely access potentially undefined properties
      const typedErrorData = errorData as Record<string, any>;

      if (typedErrorData.error) {
        // Format for Google API errors
        const errorObj = typedErrorData.error as Record<string, any>;

        if (errorObj.message) {
          errorDetails = `: ${errorObj.message}`;
        } else if (
          Array.isArray(errorObj.errors) &&
          errorObj.errors.length > 0
        ) {
          errorDetails = `: ${errorObj.errors
            .map((e: any) => e.message || String(e))
            .join("; ")}`;
        }
      } else if (typedErrorData.message) {
        // Some APIs return message directly
        errorDetails = `: ${typedErrorData.message}`;
      }
    } else if (typeof errorData === "string") {
      // Handle string error responses
      errorDetails = `: ${errorData}`;
    }
  }

  return errorDetails || `: ${error.message}`;
}

/**
 * Get advertisers from the proxy with support for shared schema parameters
 * @param params Parameters for the request including partnerId, filter, pageSize, pageToken, and orderBy
 * @returns A promise that resolves to the list of advertisers
 */
export async function getAdvertisersFromProxy(
  params?: Record<string, any>
): Promise<any> {
  try {
    // Debug: log what parameters we're sending
    console.log(
      "getAdvertisersFromProxy called with params:",
      JSON.stringify(params)
    );

    // Create a new params object with properly formatted values
    const queryParams: Record<string, string> = {};

    // Handle partnerId with special care
    if (params?.partnerId) {
      // Convert to string and remove any quotes or backticks
      const cleanPartnerId = String(params.partnerId).replace(/[`'"]/g, "");
      queryParams.partnerId = cleanPartnerId;
      console.log(`Using partnerId: ${cleanPartnerId}`);
    }

    // Add filter parameter
    if (params?.filter) {
      queryParams.filter = String(params.filter);
    }

    // Add pagination parameters
    if (params?.pageSize) {
      queryParams.pageSize = String(params.pageSize);
    }

    if (params?.pageToken) {
      queryParams.pageToken = String(params.pageToken);
    }

    // Add ordering parameter
    if (params?.orderBy) {
      queryParams.orderBy = String(params.orderBy);
    }

    // Log the final request URL and params
    console.log(
      `Making GET request to ${config.dv360ProxyBaseUrl}/v4/advertisers with queryParams:`,
      queryParams
    );

    // Make the request with our sanitized query parameters
    const response = await apiClient.get("/v4/advertisers", {
      params: queryParams,
    });
    console.log("Received successful response from DV360 API");
    return response.data;
  } catch (error) {
    console.error("Full error object:", error);
    const axiosError = error as AxiosError;
    const errorDetails = extractDetailedErrorMessage(axiosError);

    handleApiError(axiosError, `getAdvertisersFromProxy${errorDetails}`);

    // Check for specific error types
    if (axiosError.response) {
      // The request was made and the server responded with a status code outside 2xx
      // Use JSON.stringify to properly log the response data
      console.error(
        "Response data:",
        JSON.stringify(axiosError.response.data, null, 2)
      );
      console.error("Response headers:", axiosError.response.headers);
    }

    throw new Error(
      `Failed to fetch advertisers: ${axiosError.message}${errorDetails}`
    );
  }
}

// Example function to create a campaign via the proxy
export async function createCampaignViaProxy(
  advertiserId: string,
  campaignData: any
): Promise<any> {
  try {
    const response = await apiClient.post(
      `/v4/advertisers/${advertiserId}/campaigns`,
      campaignData
    );
    return response.data;
  } catch (error) {
    const axiosError = error as AxiosError;
    const errorDetails = extractDetailedErrorMessage(axiosError);

    handleApiError(
      axiosError,
      `createCampaignViaProxy for advertiser ${advertiserId}${errorDetails}`
    );

    throw new Error(
      `Failed to create campaign: ${axiosError.message}${errorDetails}`
    );
  }
}

/**
 * Get campaigns for a specific advertiser from the proxy.
 * @param advertiserId The ID of the advertiser.
 * @param params Optional query parameters.
 * @returns A promise that resolves to the list of campaigns.
 */
export async function getCampaignsFromProxy(
  advertiserId: string,
  params?: Record<string, any>
): Promise<any> {
  try {
    // Ensure advertiserId is properly formatted and clean
    const cleanAdvertiserId = String(advertiserId).replace(/[`'"]/g, "");

    // Build the URL with the correct path structure
    const url = `/v4/advertisers/${cleanAdvertiserId}/campaigns`;

    // Log detailed information about the request
    console.log(
      `getCampaignsFromProxy: Making GET request to ${config.dv360ProxyBaseUrl}${url}`
    );
    console.log(
      `getCampaignsFromProxy: Using advertiserId: ${cleanAdvertiserId}`
    );
    console.log(`getCampaignsFromProxy: Query params:`, params);

    // Make the request with explicit URL
    const response = await apiClient.get(url, { params });

    console.log(`getCampaignsFromProxy: Received successful response`);
    return response.data;
  } catch (error) {
    const axiosError = error as AxiosError;
    const errorDetails = extractDetailedErrorMessage(axiosError);

    handleApiError(
      axiosError,
      `getCampaignsFromProxy for advertiser ${advertiserId}${errorDetails}`
    );

    // Add more detailed error logging
    if (axiosError.response) {
      console.error("Response status:", axiosError.response.status);
      console.error(
        "Response data:",
        JSON.stringify(axiosError.response.data, null, 2)
      );
      console.error("Response headers:", axiosError.response.headers);
    }

    throw new Error(
      `Failed to get campaigns: ${axiosError.message}${errorDetails}`
    );
  }
}

/**
 * Create an insertion order for a specific advertiser and campaign via the proxy.
 * @param advertiserId The ID of the advertiser.
 * @param campaignId The ID of the campaign.
 * @param insertionOrderData The data for the new insertion order.
 * @returns A promise that resolves to the created insertion order.
 */
export async function createInsertionOrderViaProxy(
  advertiserId: string,
  campaignId: string,
  insertionOrderData: any
): Promise<any> {
  try {
    // Include the campaignId in the insertion order data
    const data = {
      ...insertionOrderData,
      campaignId,
    };

    const response = await apiClient.post(
      `/v4/advertisers/${advertiserId}/insertionOrders`,
      data
    );
    return response.data;
  } catch (error) {
    const axiosError = error as AxiosError;
    const errorDetails = extractDetailedErrorMessage(axiosError);

    handleApiError(
      axiosError,
      `createInsertionOrderViaProxy for advertiser ${advertiserId}, campaign ${campaignId}${errorDetails}`
    );

    throw new Error(
      `Failed to create insertion order: ${axiosError.message}${errorDetails}`
    );
  }
}

/**
 * Get insertion orders for a specific advertiser and campaign from the proxy.
 * @param advertiserId The ID of the advertiser.
 * @param campaignId The ID of the campaign.
 * @param params Optional query parameters.
 * @returns A promise that resolves to the list of insertion orders.
 */
export async function getInsertionOrdersFromProxy(
  advertiserId: string,
  campaignId: string,
  params?: Record<string, any>
): Promise<any> {
  try {
    // Clean the IDs to ensure proper URL formatting
    const cleanAdvertiserId = String(advertiserId).replace(/[`'"]/g, "");
    const cleanCampaignId = String(campaignId).replace(/[`'"]/g, "");

    // Use the correct URL structure with filter parameter instead of nested path
    const url = `/v4/advertisers/${cleanAdvertiserId}/insertionOrders`;

    // Add campaignId to the query parameters with filter syntax
    const queryParams = {
      ...params,
      filter: `campaignId=${cleanCampaignId}`,
    };

    // Log detailed information about the request
    console.log(
      `getInsertionOrdersFromProxy: Making GET request to ${config.dv360ProxyBaseUrl}${url}`
    );
    console.log(
      `getInsertionOrdersFromProxy: Using advertiserId: ${cleanAdvertiserId}, campaignId: ${cleanCampaignId}`
    );
    console.log(`getInsertionOrdersFromProxy: Query params:`, queryParams);

    // Make the request with filter parameter
    const response = await apiClient.get(url, { params: queryParams });

    console.log(`getInsertionOrdersFromProxy: Received successful response`);
    return response.data;
  } catch (error) {
    const axiosError = error as AxiosError;
    const errorDetails = extractDetailedErrorMessage(axiosError);

    handleApiError(
      axiosError,
      `getInsertionOrdersFromProxy for advertiser ${advertiserId}, campaign ${campaignId}${errorDetails}`
    );

    // Add more detailed error logging
    if (axiosError.response) {
      console.error("Response status:", axiosError.response.status);
      console.error(
        "Response data:",
        JSON.stringify(axiosError.response.data, null, 2)
      );
      console.error("Response headers:", axiosError.response.headers);
      console.error("Request URL:", axiosError.config?.url);
    }

    throw new Error(
      `Failed to get insertion orders: ${axiosError.message}${errorDetails}`
    );
  }
}

/**
 * Create a line item for a specific advertiser and insertion order via the proxy.
 * @param advertiserId The ID of the advertiser.
 * @param insertionOrderId The ID of the insertion order.
 * @param lineItemData The data for the new line item.
 * @returns A promise that resolves to the created line item.
 */
export async function createLineItemViaProxy(
  advertiserId: string,
  insertionOrderId: string,
  lineItemData: any
): Promise<any> {
  try {
    // Clean the IDs to ensure they're properly formatted as strings
    const cleanAdvertiserId = String(advertiserId).replace(/[`'"]/g, "");
    const cleanInsertionOrderId = String(insertionOrderId).replace(
      /[`'"]/g,
      ""
    );

    // Create data object with cleaned insertionOrderId
    // This ensures insertionOrderId is always a string and properly formatted
    const data = {
      ...lineItemData,
      insertionOrderId: cleanInsertionOrderId,
    };

    console.log(
      `Creating line item for advertiserId=${cleanAdvertiserId} with insertionOrderId=${cleanInsertionOrderId}`
    );
    console.log("Line item data:", JSON.stringify(data, null, 2));

    const response = await apiClient.post(
      `/v4/advertisers/${cleanAdvertiserId}/lineItems`,
      data
    );
    return response.data;
  } catch (error) {
    const axiosError = error as AxiosError;
    const errorDetails = extractDetailedErrorMessage(axiosError);

    handleApiError(
      axiosError,
      `createLineItemViaProxy for advertiser ${advertiserId}, insertionOrder ${insertionOrderId}${errorDetails}`
    );

    // Add more detailed error logging
    if (axiosError.response) {
      console.error("Response status:", axiosError.response.status);
      console.error(
        "Response data:",
        JSON.stringify(axiosError.response.data, null, 2)
      );
      console.error("Response headers:", axiosError.response.headers);
      console.error("Request URL:", axiosError.config?.url);
    }

    throw new Error(
      `Failed to create line item: ${axiosError.message}${errorDetails}`
    );
  }
}

/**
 * Get line items for a specific advertiser and insertion order from the proxy.
 * @param advertiserId The ID of the advertiser.
 * @param insertionOrderId The ID of the insertion order.
 * @param params Optional query parameters.
 * @returns A promise that resolves to the list of line items.
 */
export async function getLineItemsFromProxy(
  advertiserId: string,
  insertionOrderId: string,
  params?: Record<string, any>
): Promise<any> {
  try {
    // Clean the IDs to ensure proper URL formatting
    const cleanAdvertiserId = String(advertiserId).replace(/[`'"]/g, "");
    const cleanInsertionOrderId = String(insertionOrderId).replace(
      /[`'"]/g,
      ""
    );

    // Use the correct URL structure with filter parameter instead of nested path
    const url = `/v4/advertisers/${cleanAdvertiserId}/lineItems`;

    // Add insertionOrderId to the query parameters with filter syntax
    const queryParams = {
      ...params,
      filter: `insertionOrderId=${cleanInsertionOrderId}`,
    };

    // Log detailed information about the request
    console.log(
      `getLineItemsFromProxy: Making GET request to ${config.dv360ProxyBaseUrl}${url}`
    );
    console.log(
      `getLineItemsFromProxy: Using advertiserId: ${cleanAdvertiserId}, insertionOrderId: ${cleanInsertionOrderId}`
    );
    console.log(`getLineItemsFromProxy: Query params:`, queryParams);

    // Make the request with filter parameter
    const response = await apiClient.get(url, { params: queryParams });

    console.log(`getLineItemsFromProxy: Received successful response`);
    return response.data;
  } catch (error) {
    const axiosError = error as AxiosError;
    const errorDetails = extractDetailedErrorMessage(axiosError);

    handleApiError(
      axiosError,
      `getLineItemsFromProxy for advertiser ${advertiserId}, insertionOrder ${insertionOrderId}${errorDetails}`
    );

    // Add more detailed error logging
    if (axiosError.response) {
      console.error("Response status:", axiosError.response.status);
      console.error(
        "Response data:",
        JSON.stringify(axiosError.response.data, null, 2)
      );
      console.error("Response headers:", axiosError.response.headers);
      console.error("Request URL:", axiosError.config?.url);
    }

    throw new Error(
      `Failed to get line items: ${axiosError.message}${errorDetails}`
    );
  }
}

/**
 * Create an assigned targeting option for a line item.
 * @param advertiserId The ID of the advertiser.
 * @param lineItemId The ID of the line item to apply targeting to.
 * @param targetingType The type of targeting to apply.
 * @param details The details specific to this targeting type.
 * @returns A promise that resolves to the created targeting option.
 */
export async function createAssignedTargetingOptionViaProxy(
  advertiserId: string,
  lineItemId: string,
  targetingType: string,
  details: Record<string, any>
): Promise<any> {
  try {
    const url = `/v4/advertisers/${advertiserId}/lineItems/${lineItemId}/targetingTypes/${targetingType}/assignedTargetingOptions`;
    console.log(
      `Creating assigned targeting option via ${url} with details:`,
      JSON.stringify(details, null, 2)
    );

    const response = await apiClient.post(url, details);
    return response.data;
  } catch (error) {
    const axiosError = error as AxiosError;
    const errorDetails = extractDetailedErrorMessage(axiosError);

    handleApiError(
      axiosError,
      `createAssignedTargetingOptionViaProxy for advertiser ${advertiserId}, lineItem ${lineItemId}, targetingType ${targetingType}${errorDetails}`
    );

    throw new Error(
      `Failed to create targeting option: ${axiosError.message}${errorDetails}`
    );
  }
}

/**
 * Get available targeting options for a specific targeting type.
 * @param advertiserId The ID of the advertiser.
 * @param targetingType The type of targeting options to retrieve.
 * @param params Optional query parameters.
 * @returns A promise that resolves to the list of available targeting options.
 */
export async function getTargetingOptionsFromProxy(
  advertiserId: string,
  targetingType: string,
  params?: Record<string, any>
): Promise<any> {
  try {
    // Clean the advertiserId to ensure proper URL formatting
    const cleanAdvertiserId = String(advertiserId).replace(/[`'"]/g, "");

    // Create the URL for the targeting options endpoint
    const url = `/v4/targetingTypes/${targetingType}/targetingOptions`;

    // Add advertiserId to the query parameters
    const queryParams = {
      ...params,
      advertiserId: cleanAdvertiserId,
    };

    // Log detailed information about the request
    console.log(
      `getTargetingOptionsFromProxy: Making GET request to ${config.dv360ProxyBaseUrl}${url}`
    );
    console.log(
      `getTargetingOptionsFromProxy: Using advertiserId: ${cleanAdvertiserId}, targetingType: ${targetingType}`
    );
    console.log(`getTargetingOptionsFromProxy: Query params:`, queryParams);

    // Make the request
    const response = await apiClient.get(url, { params: queryParams });

    console.log(`getTargetingOptionsFromProxy: Received successful response`);
    return response.data;
  } catch (error) {
    const axiosError = error as AxiosError;
    const errorDetails = extractDetailedErrorMessage(axiosError);

    handleApiError(
      axiosError,
      `getTargetingOptionsFromProxy for advertiser ${advertiserId}, targetingType ${targetingType}${errorDetails}`
    );

    // Add more detailed error logging
    if (axiosError.response) {
      console.error("Response status:", axiosError.response.status);
      console.error(
        "Response data:",
        JSON.stringify(axiosError.response.data, null, 2)
      );
      console.error("Response headers:", axiosError.response.headers);
      console.error("Request URL:", axiosError.config?.url);
    }

    throw new Error(
      `Failed to get targeting options: ${axiosError.message}${errorDetails}`
    );
  }
}

/**
 * Assign targeting to a line item.
 * @param advertiserId The ID of the advertiser.
 * @param lineItemId The ID of the line item.
 * @param targetingType The type of targeting to assign.
 * @param details The targeting details.
 * @returns A promise that resolves to the created assigned targeting option.
 */
export async function assignTargetingToLineItemViaProxy(
  advertiserId: string,
  lineItemId: string,
  targetingType: string,
  details: Record<string, any>
): Promise<any> {
  try {
    // Clean the IDs to ensure proper URL formatting
    const cleanAdvertiserId = String(advertiserId).replace(/[`'"]/g, "");
    const cleanLineItemId = String(lineItemId).replace(/[`'"]/g, "");

    // Create the URL for the assigned targeting options endpoint
    const url = `/v4/advertisers/${cleanAdvertiserId}/lineItems/${cleanLineItemId}/targetingTypes/${targetingType}/assignedTargetingOptions`;

    // Construct the correct request body based on targeting type
    let requestBody: Record<string, any> = {};

    // For GEO_REGION, the API expects a direct object with specific properties
    if (targetingType === "TARGETING_TYPE_GEO_REGION") {
      // If details already contains the correct structure with geoRegionDetails
      if (details.geoRegionDetails) {
        requestBody = details;
      }
      // If details has targetingOptionId directly at the root
      else if (details.targetingOptionId) {
        requestBody = {
          geoRegionDetails: {
            targetingOptionId: details.targetingOptionId,
            negative: details.negative || false,
          },
        };
      }
      // Something else - log a warning but try with the provided details
      else {
        console.warn(
          "Warning: Unexpected details format for GEO_REGION targeting. " +
            "Expected either {geoRegionDetails: {...}} or {targetingOptionId: '...'}. " +
            "Attempting to use provided details."
        );
        requestBody = details;
      }
    }
    // For other targeting types, handle similarly based on their expected structure
    else if (targetingType === "TARGETING_TYPE_BROWSER") {
      // Similar structure for browser targeting
      if (details.browserDetails) {
        requestBody = details;
      } else if (details.targetingOptionId) {
        requestBody = {
          browserDetails: {
            targetingOptionId: details.targetingOptionId,
            negative: details.negative || false,
          },
        };
      } else {
        requestBody = details;
      }
    }
    // Add more targeting types as needed

    // Default for any other targeting type - use details as is
    else {
      requestBody = details;
    }

    // Log detailed information about the request
    console.log(
      `assignTargetingToLineItemViaProxy: Making POST request to ${config.dv360ProxyBaseUrl}${url}`
    );
    console.log(
      `assignTargetingToLineItemViaProxy: Using advertiserId: ${cleanAdvertiserId}, lineItemId: ${cleanLineItemId}, targetingType: ${targetingType}`
    );
    console.log(
      "assignTargetingToLineItemViaProxy: Request body:",
      JSON.stringify(requestBody, null, 2)
    );

    // Make the request with the properly structured request body
    const response = await apiClient.post(url, requestBody);

    console.log(
      `assignTargetingToLineItemViaProxy: Received successful response`
    );
    return response.data;
  } catch (error) {
    const axiosError = error as AxiosError;
    const errorDetails = extractDetailedErrorMessage(axiosError);

    handleApiError(
      axiosError,
      `assignTargetingToLineItemViaProxy for advertiser ${advertiserId}, lineItem ${lineItemId}, targetingType ${targetingType}${errorDetails}`
    );

    // Add more detailed error logging
    if (axiosError.response) {
      console.error("Response status:", axiosError.response.status);
      console.error(
        "Response data:",
        JSON.stringify(axiosError.response.data, null, 2)
      );
      console.error("Response headers:", axiosError.response.headers);
      console.error("Request URL:", axiosError.config?.url);
    }

    throw new Error(
      `Failed to assign targeting: ${axiosError.message}${errorDetails}`
    );
  }
}

// Add more functions here for other proxy endpoints (getCampaign, createInsertionOrder, etc.)
// e.g., getCampaignByIdFromProxy(advertiserId: string, campaignId: string)
// e.g., listLineItemsFromProxy(advertiserId: string, lineItemId: string, params?: Record<string, any>)

function handleApiError(error: AxiosError, context: string): void {
  if (error.response) {
    // The request was made and the server responded with a status code
    // that falls out of the range of 2xx
    console.error(
      `Error calling DV360 Proxy (${context}): ${error.response.status} ${error.response.statusText}`,
      JSON.stringify(error.response.data, null, 2)
    );
  } else if (error.request) {
    // The request was made but no response was received
    console.error(`No response from DV360 Proxy (${context}):`, error.message);
  } else {
    // Something happened in setting up the request that triggered an Error
    console.error(
      `Error setting up request to DV360 Proxy (${context}):`,
      error.message
    );
  }
}
