// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Targeting Schema Resource
 * Provides JSON Schema for specific targeting option detail types
 */

import { zodToJsonSchema } from "zod-to-json-schema";
import type { ResourceDefinition, ResourceContent, ResourceListItem } from "../utils/types.js";
import {
  ALL_TARGETING_TYPES,
  TARGETING_TYPE_DESCRIPTIONS,
  getTargetingDetailSchemaName,
  isValidTargetingType,
  type TargetingType,
} from "../../tools/utils/targeting-metadata.js";
import { McpError, JsonRpcErrorCode } from "@cesteral/shared";
import * as generatedSchemas from "../../../generated/schemas/zod.js";
import { resourceCache } from "../utils/resource-cache.js";

const RESOURCE_NAME = "DV360 Targeting Schema";
const RESOURCE_DESCRIPTION = "JSON Schema for specific targeting option detail types";
const URI_TEMPLATE = "targeting-schema://{targetingType}";

/**
 * Get example payload for a targeting type
 */
function getTargetingExample(targetingType: TargetingType): Record<string, any> | null {
  const examples: Partial<Record<TargetingType, Record<string, any>>> = {
    TARGETING_TYPE_CHANNEL: {
      channelDetails: {
        channelId: "123456",
        negative: true,
      },
    },
    TARGETING_TYPE_GEO_REGION: {
      geoRegionDetails: {
        targetingOptionId: "2840", // US country code
        negative: false,
      },
    },
    TARGETING_TYPE_KEYWORD: {
      keywordDetails: {
        keyword: "example keyword",
        negative: false,
      },
    },
    TARGETING_TYPE_URL: {
      urlDetails: {
        url: "example.com",
        negative: true,
      },
    },
    TARGETING_TYPE_AGE_RANGE: {
      ageRangeDetails: {
        ageRange: "AGE_RANGE_25_34",
      },
    },
    TARGETING_TYPE_GENDER: {
      genderDetails: {
        gender: "GENDER_FEMALE",
      },
    },
    TARGETING_TYPE_DEVICE_TYPE: {
      deviceTypeDetails: {
        deviceType: "DEVICE_TYPE_MOBILE",
      },
    },
    TARGETING_TYPE_DAY_AND_TIME: {
      dayAndTimeDetails: {
        dayOfWeek: "MONDAY",
        startHour: 9,
        endHour: 17,
        timeZoneResolution: "TIME_ZONE_RESOLUTION_END_USER",
      },
    },
    TARGETING_TYPE_LANGUAGE: {
      languageDetails: {
        targetingOptionId: "en", // English
        negative: false,
      },
    },
  };

  return examples[targetingType] || null;
}

/**
 * Read targeting schema resource
 */
async function readTargetingSchema(params: Record<string, string>): Promise<ResourceContent> {
  const { targetingType } = params;

  if (!targetingType) {
    throw new McpError(
      JsonRpcErrorCode.InvalidParams,
      "Missing required parameter: targetingType",
      {
        availableTypes: ALL_TARGETING_TYPES,
      }
    );
  }

  if (!isValidTargetingType(targetingType)) {
    throw new McpError(JsonRpcErrorCode.NotFound, `Unknown targeting type: ${targetingType}`, {
      targetingType,
      availableTypes: ALL_TARGETING_TYPES,
    });
  }

  const cacheKey = `targeting-schema://${targetingType}`;
  const cached = resourceCache.get(cacheKey);
  if (cached) {
    return { uri: cacheKey, mimeType: "application/json", text: cached };
  }

  const schemaName = getTargetingDetailSchemaName(targetingType as TargetingType);
  const zodSchema = (generatedSchemas as Record<string, any>)[schemaName];

  let jsonSchema: any = null;
  let schemaError: string | null = null;

  if (zodSchema) {
    try {
      jsonSchema = zodToJsonSchema(zodSchema, {
        target: "jsonSchema7",
        markdownDescription: true,
        errorMessages: true,
      });
    } catch (e) {
      schemaError = e instanceof Error ? e.message : "Failed to convert schema";
    }
  } else {
    schemaError = `Schema ${schemaName} not found in generated schemas`;
  }

  const document = {
    targetingType,
    schemaName,
    description: TARGETING_TYPE_DESCRIPTIONS[targetingType as TargetingType],
    schema: jsonSchema,
    schemaError,
    example: getTargetingExample(targetingType as TargetingType),
    usage: {
      createTool: "dv360_create_assigned_targeting",
      note: 'Pass the data payload to the "data" parameter of the create tool',
    },
    documentation: `https://developers.google.com/display-video/api/reference/rest/v4/advertisers.lineItems.targetingTypes.assignedTargetingOptions#${schemaName}`,
  };

  const text = JSON.stringify(document, null, 2);
  resourceCache.set(cacheKey, text);

  return {
    uri: cacheKey,
    mimeType: "application/json",
    text,
  };
}

/**
 * List all available targeting schemas
 */
async function listTargetingSchemas(): Promise<ResourceListItem[]> {
  return ALL_TARGETING_TYPES.map((targetingType) => ({
    uri: `targeting-schema://${targetingType}`,
    name: `${targetingType} Schema`,
    description: TARGETING_TYPE_DESCRIPTIONS[targetingType],
    mimeType: "application/json",
  }));
}

/**
 * Targeting Schema Resource Definition
 */
export const targetingSchemaResource: ResourceDefinition = {
  uriTemplate: URI_TEMPLATE,
  name: RESOURCE_NAME,
  description: RESOURCE_DESCRIPTION,
  mimeType: "application/json",
  read: readTargetingSchema,
  list: listTargetingSchemas,
};
