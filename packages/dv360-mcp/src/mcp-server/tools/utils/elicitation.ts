// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { McpError, JsonRpcErrorCode } from "../../../utils/errors/index.js";
import type { SdkContext } from "@cesteral/shared";

interface EnsureFieldValueOptions {
  fieldName: string;
  fieldLabel?: string;
  description?: string;
  operation: string;
  entityType?: string;
  sdkContext?: SdkContext;
  currentValue?: string;
}

/**
 * Ensure a required identifier exists, using MCP elicitation when available.
 */
export async function ensureRequiredFieldValue({
  fieldName,
  fieldLabel,
  description,
  operation,
  entityType,
  sdkContext,
  currentValue,
}: EnsureFieldValueOptions): Promise<string> {
  const trimmed = currentValue?.trim();
  if (trimmed) {
    return trimmed;
  }

  if (!sdkContext?.elicitInput) {
    throw new McpError(
      JsonRpcErrorCode.InvalidParams,
      `Missing required ${fieldLabel ?? fieldName} for ${operation}`,
      {
        fieldName,
        entityType,
        operation,
      }
    );
  }

  const title = fieldLabel ?? fieldName;
  const result = await sdkContext.elicitInput({
    message: `Provide the ${title} to continue ${operation}.`,
    requestedSchema: {
      type: "object",
      properties: {
        [fieldName]: {
          type: "string",
          title,
          description: description ??
            `Enter the DV360 ${title}${entityType ? ` for the ${entityType}` : ""}.`,
        },
      },
      required: [fieldName],
    },
  });

  if (result.action !== "accept" || !result.content?.[fieldName]) {
    throw new McpError(
      JsonRpcErrorCode.InvalidParams,
      `Unable to continue ${operation} without ${title}. Response was ${result.action}.`,
      {
        fieldName,
        entityType,
        operation,
        responseAction: result.action,
      }
    );
  }

  const value = String(result.content[fieldName]).trim();
  if (!value) {
    throw new McpError(
      JsonRpcErrorCode.InvalidParams,
      `${title} provided via elicitation is empty for ${operation}.`,
      {
        fieldName,
        entityType,
        operation,
      }
    );
  }

  return value;
}