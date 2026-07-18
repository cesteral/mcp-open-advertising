// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Google Auth Adapter
 *
 * Provides a unified interface for Google API authentication using either
 * service account credentials or OAuth2 refresh tokens. Credentials are
 * supplied by the end-user via HTTP headers at SSE connection time.
 */

import { fetchWithTimeout } from "../utils/fetch-with-timeout.js";
import { fingerprintCredentials } from "./fingerprint.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ServiceAccountCredentials {
  type: "service_account";
  project_id: string;
  private_key_id: string;
  private_key: string;
  client_email: string;
  client_id: string;
  auth_uri: string;
  token_uri: string;
  auth_provider_x509_cert_url: string;
  client_x509_cert_url: string;
}

export interface OAuth2RefreshCredentials {
  type: "oauth2";
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

export type GoogleCredentials = ServiceAccountCredentials | OAuth2RefreshCredentials;

// ---------------------------------------------------------------------------
// Adapter interface
// ---------------------------------------------------------------------------

export interface GoogleAuthAdapter {
  getAccessToken(): Promise<string>;
  validate(): Promise<void>;
  readonly credentialType: "service_account" | "oauth2";
  readonly scopes: string[];
}

// ---------------------------------------------------------------------------
// Token expiry buffer (refresh 60s before actual expiry)
// ---------------------------------------------------------------------------

const TOKEN_EXPIRY_BUFFER_MS = 60_000;

// ---------------------------------------------------------------------------
// Service Account Adapter
// ---------------------------------------------------------------------------

export class ServiceAccountAuthAdapter implements GoogleAuthAdapter {
  readonly credentialType = "service_account" as const;
  private accessToken?: string;
  private tokenExpiry?: Date;
  private pendingAuth?: Promise<void>;

  constructor(
    private readonly credentials: ServiceAccountCredentials,
    readonly scopes: string[]
  ) {}

  async validate(): Promise<void> {
    await this.getAccessToken();
  }

  async getAccessToken(): Promise<string> {
    if (
      this.accessToken &&
      this.tokenExpiry &&
      this.tokenExpiry.getTime() - Date.now() > TOKEN_EXPIRY_BUFFER_MS
    ) {
      return this.accessToken;
    }

    if (this.pendingAuth) {
      await this.pendingAuth;
      return this.accessToken!;
    }

    this.pendingAuth = this.exchangeToken().finally(() => {
      this.pendingAuth = undefined;
    });

    await this.pendingAuth;
    return this.accessToken!;
  }

  private async exchangeToken(): Promise<void> {
    const now = Math.floor(Date.now() / 1000);

    const jwtHeader = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString(
      "base64url"
    );

    const jwtPayload = Buffer.from(
      JSON.stringify({
        iss: this.credentials.client_email,
        scope: this.scopes.join(" "),
        aud: "https://oauth2.googleapis.com/token",
        exp: now + 3600,
        iat: now,
      })
    ).toString("base64url");

    const crypto = await import("crypto");
    const signature = crypto
      .createSign("RSA-SHA256")
      .update(`${jwtHeader}.${jwtPayload}`)
      .sign(this.credentials.private_key, "base64url");

    const assertion = `${jwtHeader}.${jwtPayload}.${signature}`;

    const response = await fetchWithTimeout(
      "https://oauth2.googleapis.com/token",
      10_000,
      undefined,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
          assertion,
        }),
      }
    );

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(
        `OAuth2 token exchange failed: ${response.status} ${response.statusText} — ${body.substring(0, 200)}`
      );
    }

    const data = (await response.json()) as {
      access_token: string;
      expires_in: number;
    };

    if (!data.access_token || typeof data.expires_in !== "number") {
      throw new Error("Invalid OAuth2 token response: missing access_token or expires_in");
    }

    this.accessToken = data.access_token;
    this.tokenExpiry = new Date(Date.now() + data.expires_in * 1000);
  }
}

// ---------------------------------------------------------------------------
// OAuth2 Refresh Token Adapter
// ---------------------------------------------------------------------------

export class OAuth2RefreshTokenAuthAdapter implements GoogleAuthAdapter {
  readonly credentialType = "oauth2" as const;
  private accessToken?: string;
  private tokenExpiry?: Date;
  private pendingAuth?: Promise<void>;

  constructor(
    private readonly credentials: OAuth2RefreshCredentials,
    readonly scopes: string[]
  ) {}

  async validate(): Promise<void> {
    await this.getAccessToken();
  }

  async getAccessToken(): Promise<string> {
    if (
      this.accessToken &&
      this.tokenExpiry &&
      this.tokenExpiry.getTime() - Date.now() > TOKEN_EXPIRY_BUFFER_MS
    ) {
      return this.accessToken;
    }

    if (this.pendingAuth) {
      await this.pendingAuth;
      return this.accessToken!;
    }

    this.pendingAuth = this.refreshAccessToken().finally(() => {
      this.pendingAuth = undefined;
    });

    await this.pendingAuth;
    return this.accessToken!;
  }

  private async refreshAccessToken(): Promise<void> {
    const response = await fetchWithTimeout(
      "https://oauth2.googleapis.com/token",
      10_000,
      undefined,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          client_id: this.credentials.clientId,
          client_secret: this.credentials.clientSecret,
          refresh_token: this.credentials.refreshToken,
        }),
      }
    );

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(
        `OAuth2 refresh token exchange failed: ${response.status} ${response.statusText} — ${body.substring(0, 200)}`
      );
    }

    const data = (await response.json()) as {
      access_token: string;
      expires_in: number;
    };

    if (!data.access_token || typeof data.expires_in !== "number") {
      throw new Error("Invalid OAuth2 token response: missing access_token or expires_in");
    }

    this.accessToken = data.access_token;
    this.tokenExpiry = new Date(Date.now() + data.expires_in * 1000);
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createGoogleAuthAdapter(
  credentials: GoogleCredentials,
  scopes: string[]
): GoogleAuthAdapter {
  if (credentials.type === "service_account") {
    return new ServiceAccountAuthAdapter(credentials, scopes);
  }
  return new OAuth2RefreshTokenAuthAdapter(credentials, scopes);
}

// ---------------------------------------------------------------------------
// Header Parsing
// ---------------------------------------------------------------------------

/**
 * Parse Google credentials from HTTP headers.
 *
 * Expected headers:
 *   X-Google-Auth-Type: service_account | oauth2
 *
 * For service_account:
 *   X-Google-Credentials: <base64-encoded-service-account-json>
 *
 * For oauth2:
 *   X-Google-Client-Id: <client_id>
 *   X-Google-Client-Secret: <client_secret>
 *   X-Google-Refresh-Token: <refresh_token>
 */
export function parseCredentialsFromHeaders(
  headers: Record<string, string | string[] | undefined>
): GoogleCredentials {
  const getHeader = (name: string): string | undefined => {
    const value = headers[name.toLowerCase()];
    if (Array.isArray(value)) return value[0];
    return value;
  };

  const authType = getHeader("x-google-auth-type");

  if (!authType) {
    throw new Error(
      "Missing X-Google-Auth-Type header. " +
        'Set to "service_account" or "oauth2" to authenticate.'
    );
  }

  if (authType === "service_account") {
    const encoded = getHeader("x-google-credentials");
    if (!encoded) {
      throw new Error(
        "Missing X-Google-Credentials header. " + "Provide base64-encoded service account JSON."
      );
    }

    let parsed: Record<string, unknown>;
    try {
      const decoded = Buffer.from(encoded, "base64").toString("utf-8");
      parsed = JSON.parse(decoded);
    } catch {
      throw new Error("Invalid X-Google-Credentials: must be valid base64-encoded JSON.");
    }

    if (!parsed.client_email || !parsed.private_key) {
      throw new Error("Invalid service account JSON: missing client_email or private_key.");
    }

    if (parsed.token_uri !== undefined && typeof parsed.token_uri !== "string") {
      throw new Error("Invalid service account JSON: token_uri must be a string.");
    }

    return parsed as unknown as ServiceAccountCredentials;
  }

  if (authType === "oauth2") {
    const clientId = getHeader("x-google-client-id");
    const clientSecret = getHeader("x-google-client-secret");
    const refreshToken = getHeader("x-google-refresh-token");

    if (!clientId || !clientSecret || !refreshToken) {
      const missing: string[] = [];
      if (!clientId) missing.push("X-Google-Client-Id");
      if (!clientSecret) missing.push("X-Google-Client-Secret");
      if (!refreshToken) missing.push("X-Google-Refresh-Token");
      throw new Error(`Missing required OAuth2 headers: ${missing.join(", ")}`);
    }

    return {
      type: "oauth2",
      clientId,
      clientSecret,
      refreshToken,
    };
  }

  throw new Error(
    `Invalid X-Google-Auth-Type: "${authType}". Must be "service_account" or "oauth2".`
  );
}

// ---------------------------------------------------------------------------
// Credential Fingerprinting
// ---------------------------------------------------------------------------

/**
 * Generate a fingerprint of Google credentials for session binding.
 *
 * The fingerprint MUST require proof-of-possession of the credential secret,
 * not merely knowledge of the public identifier. `client_email` and `clientId`
 * are public (or semi-public) by design, so a fingerprint derived from them
 * alone can be reproduced by anyone who knows the identifier — which, on the
 * session-reuse path (where the secret is never re-validated), would let an
 * attacker who also knows a victim's session ID ride the victim's authenticated
 * session. Binding the hash to the secret (`private_key` for service accounts;
 * `clientSecret` + `refreshToken` for OAuth2) closes that gap: a caller without
 * the secret produces a different fingerprint and is rejected as a mismatch.
 *
 * The identity component (`client_email` / `clientId`) is retained so the
 * fingerprint still differs if the same secret is presented under a different
 * identity. Only fields guaranteed present by `parseCredentialsFromHeaders`
 * are used, so this never dereferences an absent optional field.
 */
export function getCredentialFingerprint(credentials: GoogleCredentials): string {
  if (credentials.type === "service_account") {
    return fingerprintCredentials(credentials.client_email, credentials.private_key);
  }
  return fingerprintCredentials(
    credentials.clientId,
    credentials.clientSecret,
    credentials.refreshToken
  );
}
