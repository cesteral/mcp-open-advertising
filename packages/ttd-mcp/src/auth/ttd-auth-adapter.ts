// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * TTD Auth Adapter
 *
 * Handles direct The Trade Desk API token authentication via the `TTD-Auth`
 * header or `TTD_API_TOKEN` environment variable.
 */

import { createHash } from "crypto";
import { extractHeader } from "@cesteral/shared";

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
 */
export class TtdDirectTokenAuthAdapter implements TtdAuthAdapter {
  constructor(
    private readonly token: string,
    private readonly _partnerId: string = "direct-token"
  ) {}

  get partnerId(): string {
    return this._partnerId;
  }

  async getAccessToken(): Promise<string> {
    return this.token;
  }

  async validate(): Promise<void> {
    // Token is provided directly — no exchange needed.
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
export function getTtdDirectTokenFingerprint(
  credentials: TtdDirectTokenCredentials
): string {
  return createHash("sha256")
    .update(credentials.token)
    .digest("hex")
    .substring(0, 32);
}
