// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { McpError, JsonRpcErrorCode } from "../../../utils/errors/index.js";

export interface TtdGraphqlError {
  message?: string;
  extensions?: {
    code?: string;
  };
}

export const MYREPORTS_TEMPLATE_ACCESS_ERROR =
  "TTD account does not have access to MyReports template APIs. " +
  "This feature requires the MyReports entitlement in The Trade Desk. " +
  "Contact your TTD account manager or Technical Account Manager (TAM), " +
  "or use ttd_graphql_query to verify account capabilities.";

export function extractGraphqlErrors(raw: Record<string, unknown>): TtdGraphqlError[] {
  const gqlErrors = raw.errors;
  return Array.isArray(gqlErrors) ? (gqlErrors as TtdGraphqlError[]) : [];
}

function isUnauthorizedFieldError(error: TtdGraphqlError): boolean {
  return error.extensions?.code === "UNAUTHORIZED_FIELD_OR_TYPE";
}

function formatGraphqlErrorMessages(errors: TtdGraphqlError[]): string {
  return errors.map((error) => error.message ?? "Unknown GraphQL error").join("; ");
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

  const unauthorizedCodes = new Set(options?.unauthorizedCodes ?? []);
  const unauthorizedError = errors.find(
    (error) =>
      isUnauthorizedFieldError(error)
      || (error.extensions?.code !== undefined && unauthorizedCodes.has(error.extensions.code))
  );

  if (unauthorizedError) {
    throw new McpError(
      JsonRpcErrorCode.Forbidden,
      options?.unauthorizedMessage ?? MYREPORTS_TEMPLATE_ACCESS_ERROR
    );
  }

  throw new McpError(
    JsonRpcErrorCode.InternalError,
    `${defaultMessage}: ${formatGraphqlErrorMessages(errors)}`
  );
}
