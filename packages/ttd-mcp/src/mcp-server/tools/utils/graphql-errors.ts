// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { McpError, JsonRpcErrorCode } from "../../../utils/errors/index.js";

export interface TtdGraphqlError {
  message?: string;
  extensions?: {
    code?: string;
  };
}

/**
 * TTD GraphQL error codes from the API docs.
 * All errors return HTTP 200 — the code lives in `errors[].extensions.code`.
 */
const AUTH_ERROR_CODES = new Set([
  "AUTHENTICATION_FAILURE",
  "UNAUTHORIZED_FIELD_OR_TYPE",
]);

const RATE_LIMIT_ERROR_CODES = new Set([
  "RESOURCE_LIMIT_EXCEEDED",
]);

const VALIDATION_ERROR_CODES = new Set([
  "VALIDATION_FAILURE",
  "GRAPHQL_VALIDATION_FAILED",
]);

export const MYREPORTS_TEMPLATE_ACCESS_ERROR =
  "TTD account does not have access to MyReports template APIs. " +
  "This feature requires the MyReports entitlement in The Trade Desk. " +
  "Contact your TTD account manager or Technical Account Manager (TAM), " +
  "or use ttd_graphql_query to verify account capabilities.";

export function extractGraphqlErrors(raw: Record<string, unknown>): TtdGraphqlError[] {
  const gqlErrors = raw.errors;
  return Array.isArray(gqlErrors) ? (gqlErrors as TtdGraphqlError[]) : [];
}

function formatGraphqlErrorMessages(errors: TtdGraphqlError[]): string {
  return errors.map((error) => error.message ?? "Unknown GraphQL error").join("; ");
}

function classifyErrorCode(code: string | undefined): "auth" | "rate_limit" | "validation" | "unknown" {
  if (!code) return "unknown";
  if (AUTH_ERROR_CODES.has(code)) return "auth";
  if (RATE_LIMIT_ERROR_CODES.has(code)) return "rate_limit";
  if (VALIDATION_ERROR_CODES.has(code)) return "validation";
  return "unknown";
}

export function throwIfGraphqlErrors(
  raw: Record<string, unknown>,
  defaultMessage: string,
  options?: {
    unauthorizedMessage?: string;
    unauthorizedCodes?: string[];
  }
): void {
  const errors = extractGraphqlErrors(raw);
  if (errors.length === 0) return;

  const extraAuthCodes = new Set(options?.unauthorizedCodes ?? []);
  const messages = formatGraphqlErrorMessages(errors);

  for (const error of errors) {
    const code = error.extensions?.code;
    const category = classifyErrorCode(code);

    if (category === "auth" || (code !== undefined && extraAuthCodes.has(code))) {
      throw new McpError(
        JsonRpcErrorCode.Forbidden,
        options?.unauthorizedMessage ?? `${defaultMessage}: ${messages}`
      );
    }

    if (category === "rate_limit") {
      throw new McpError(
        JsonRpcErrorCode.InternalError,
        `TTD rate/complexity limit exceeded: ${messages}. Reduce query complexity or retry later.`
      );
    }

    if (category === "validation") {
      throw new McpError(
        JsonRpcErrorCode.InvalidParams,
        `${defaultMessage}: ${messages}`
      );
    }
  }

  throw new McpError(
    JsonRpcErrorCode.InternalError,
    `${defaultMessage}: ${messages}`
  );
}
