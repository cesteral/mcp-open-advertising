// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * TTD Auth Adapter
 *
 * Handles direct The Trade Desk API token authentication via the `TTD-Auth`
 * header or `TTD_API_TOKEN` environment variable.
 */

import { createHash } from "crypto";
import {
  extractHeader,
  fetchWithTimeout,
  McpError,
  JsonRpcErrorCode,
} from "@cesteral/shared";

const DEFAULT_TTD_GRAPHQL_URL = "https://desk.thetradedesk.com/graphql";

export interface TtdDirectTokenCredentials {
  token: string;
}

export interface TtdAuthAdapter {
  getAccessToken(): Promise<string>;
  validate(): Promise<void>;
  readonly partnerId: string;
}

/**
 * Direct token adapter — accepts a pre-existing TTD API token and returns it
 * as-is without performing any token exchange.
 *
 * Validates the token on first use by issuing a minimal GraphQL query
 * (`{ __typename }`) so invalid tokens fail fast at session creation rather
 * than on first tool call. Result is memoized.
 */
export class TtdDirectTokenAuthAdapter implements TtdAuthAdapter {
  private validated = false;

  constructor(
    private readonly token: string,
    private readonly _partnerId: string = "direct-token",
    private readonly graphqlUrl: string = DEFAULT_TTD_GRAPHQL_URL
  ) {}

  get partnerId(): string {
    return this._partnerId;
  }

  async getAccessToken(): Promise<string> {
    return this.token;
  }

  async validate(): Promise<void> {
    if (this.validated) {
      return;
    }

    // Fast-path structural checks before the network call.
    if (!this.token || this.token.length === 0) {
      throw new McpError(
        JsonRpcErrorCode.Unauthorized,
        "TTD token validation failed: token is empty"
      );
    }
    if (/\s/.test(this.token)) {
      throw new McpError(
        JsonRpcErrorCode.Unauthorized,
        "TTD token validation failed: token contains whitespace"
      );
    }

    const response = await fetchWithTimeout(this.graphqlUrl, 10_000, undefined, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "TTD-Auth": this.token,
      },
      body: JSON.stringify({ query: "{ __typename }" }),
    });

    if (response.status === 401 || response.status === 403) {
      const errorBody = await response.text().catch(() => "");
      throw new McpError(
        JsonRpcErrorCode.Unauthorized,
        `TTD token validation failed: ${response.status} ${response.statusText}. ${errorBody.substring(0, 200)}`
      );
    }

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      throw new McpError(
        JsonRpcErrorCode.InternalError,
        `TTD token validation failed: ${response.status} ${response.statusText}. ${errorBody.substring(0, 200)}`
      );
    }

    // GraphQL endpoints return 200 even for auth errors — inspect the body.
    const data = (await response.json().catch(() => null)) as
      | { data?: unknown; errors?: Array<{ message?: string; extensions?: { code?: string } }> }
      | null;

    if (data?.errors && data.errors.length > 0) {
      const first = data.errors[0];
      const code = first?.extensions?.code;
      const message = first?.message ?? "unknown GraphQL error";
      if (code === "UNAUTHENTICATED" || code === "FORBIDDEN" || /auth|token|unauthor/i.test(message)) {
        throw new McpError(
          JsonRpcErrorCode.Unauthorized,
          `TTD token validation failed: ${message}`
        );
      }
      throw new McpError(
        JsonRpcErrorCode.InternalError,
        `TTD token validation failed: ${message}`
      );
    }

    this.validated = true;
  }
}

/**
 * Parse a direct API token from HTTP headers.
 * Expects the token in the TTD-Auth header.
 */
export function parseTtdDirectTokenFromHeaders(
  headers: Record<string, string | string[] | undefined>
): TtdDirectTokenCredentials {
  const token = extractHeader(headers, "ttd-auth");

  if (!token) {
    throw new Error("Missing required header: TTD-Auth");
  }

  return { token };
}

/**
 * Generate a fingerprint for direct TTD API tokens (for session binding).
 */
export function getTtdDirectTokenFingerprint(credentials: TtdDirectTokenCredentials): string {
  return createHash("sha256").update(credentials.token).digest("hex").substring(0, 32);
}
