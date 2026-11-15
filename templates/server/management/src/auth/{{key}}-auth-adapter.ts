// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * {{displayName}} auth adapter: holds a pre-generated access token.
 *
 * TODO(scaffold): point `validate()` at the cheapest authenticated
 * {{displayName}} endpoint (the fleet's pattern: Meta `/me`, Pinterest
 * `/v5/user_account`). Until then it only checks that a token is present.
 * If the platform issues refresh tokens, extend `OAuth2RefreshAdapterBase`
 * from @cesteral/shared, as pinterest-mcp does.
 */

import { extractHeader, fingerprintCredentials, JsonRpcErrorCode, McpError } from "@cesteral/shared";

export interface {{Pascal}}AuthAdapter {
  getAccessToken(): Promise<string>;
  validate(): Promise<void>;
  readonly userId: string;
  readonly accountId: string;
}

export class {{Pascal}}AccessTokenAdapter implements {{Pascal}}AuthAdapter {
  private validated = false;

  constructor(
    private readonly accessToken: string,
    private readonly _accountId: string,
    private readonly baseUrl: string
  ) {}

  /** Replace with the user id `validate()` reads from the platform. */
  get userId(): string {
    return this._accountId;
  }

  get accountId(): string {
    return this._accountId;
  }

  async getAccessToken(): Promise<string> {
    return this.accessToken;
  }

  async validate(): Promise<void> {
    if (this.validated) return;
    if (!this.accessToken) {
      throw new McpError(JsonRpcErrorCode.Unauthorized, "{{displayName}} access token is empty");
    }
    if (!this.baseUrl) {
      throw new McpError(JsonRpcErrorCode.InternalError, "{{displayName}} API base URL is not set");
    }
    this.validated = true;
  }
}

/** The access token from `Authorization: Bearer <token>`. */
export function parse{{Pascal}}TokenFromHeaders(
  headers: Record<string, string | string[] | undefined>
): string {
  const authHeader = extractHeader(headers, "authorization");
  if (!authHeader) {
    throw new McpError(JsonRpcErrorCode.Unauthorized, "Missing required Authorization header");
  }
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match || !match[1]) {
    throw new McpError(
      JsonRpcErrorCode.Unauthorized,
      "Authorization header must use Bearer scheme"
    );
  }
  return match[1];
}

/** The account id from `X-{{Pascal}}-Account-Id`. */
export function get{{Pascal}}AccountIdFromHeaders(
  headers: Record<string, string | string[] | undefined>
): string {
  const accountId = extractHeader(headers, "x-{{key}}-account-id");
  if (!accountId) {
    throw new McpError(
      JsonRpcErrorCode.InvalidRequest,
      "Missing required X-{{Pascal}}-Account-Id header"
    );
  }
  return accountId;
}

/** Session-binding fingerprint of a token + account pair. */
export function get{{Pascal}}CredentialFingerprint(accessToken: string, accountId: string): string {
  return fingerprintCredentials(accessToken, accountId);
}
