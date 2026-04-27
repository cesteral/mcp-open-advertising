// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Auth Strategy Pattern
 *
 * Provides a pluggable authentication interface for MCP servers.
 * Supports multiple auth modes:
 * - google-headers: Google credentials via HTTP headers (SA or OAuth2 refresh)
 * - jwt: Bearer JWT validated with a shared secret (HS256)
 * - none: No authentication (dev/testing only)
 */

import type { Logger } from "pino";

/**
 * Authentication information extracted from a validated credential.
 */
export interface AuthInfo {
  clientId: string;
  subject?: string;
  scopes?: string[];
  tenantId?: string;
  authType: string;
  [key: string]: unknown;
}

/**
 * Result of an auth strategy's verify() call.
 */
export interface AuthResult {
  authInfo: AuthInfo;
  /**
   * For google-headers mode, the adapter is returned so sessions can use it
   * to make authenticated API calls.
   */
  googleAuthAdapter?: unknown;
  /**
   * Generic platform auth adapter for non-Google platforms (TTD, Meta, etc.).
   * Each server casts to its own adapter type.
   */
  platformAuthAdapter?: unknown;
  /**
   * Credential fingerprint for session binding.
   */
  credentialFingerprint?: string;
  /**
   * Allowed advertiser/customer IDs from JWT claims.
   * Undefined means unrestricted.
   */
  allowedAdvertisers?: string[];
}

/**
 * Authentication context persisted for the session lifetime.
 * Used for fingerprint validation, authorization, and audit logging.
 */
export interface SessionAuthContext {
  authInfo: AuthInfo;
  credentialFingerprint?: string;
  allowedAdvertisers?: string[];
}

export type AuthMode = "google-headers" | "jwt" | "none";

/**
 * Contract for all authentication strategies.
 */
export interface AuthStrategy {
  /**
   * Verify the credentials in the request headers.
   * Returns an AuthResult on success, throws on failure.
   */
  verify(headers: Record<string, string | string[] | undefined>): Promise<AuthResult>;
  /**
   * Optional fingerprint extraction for session reuse checks.
   * Implementations should avoid network calls where possible, but may still
   * perform full local verification when token validity must be re-checked.
   */
  getCredentialFingerprint?(
    headers: Record<string, string | string[] | undefined>
  ): Promise<string | undefined>;
}

/**
 * No-op strategy for development/testing.
 */
export class NoAuthStrategy implements AuthStrategy {
  async verify(_headers: Record<string, string | string[] | undefined>): Promise<AuthResult> {
    return {
      authInfo: {
        clientId: "anonymous",
        authType: "none",
      },
    };
  }

  async getCredentialFingerprint(
    _headers: Record<string, string | string[] | undefined>
  ): Promise<string | undefined> {
    return undefined;
  }
}

/**
 * Strategy that validates Google credentials from HTTP headers.
 * Wraps the existing parseCredentialsFromHeaders + createGoogleAuthAdapter flow.
 */
export class GoogleHeadersAuthStrategy implements AuthStrategy {
  constructor(
    private readonly scopes: string[],
    private readonly logger?: Logger
  ) {}

  async verify(headers: Record<string, string | string[] | undefined>): Promise<AuthResult> {
    const { parseCredentialsFromHeaders, createGoogleAuthAdapter, getCredentialFingerprint } =
      await import("./google-auth.js");

    const credentials = parseCredentialsFromHeaders(headers);
    const adapter = createGoogleAuthAdapter(credentials, this.scopes);

    // Validate by attempting to get an access token
    await adapter.getAccessToken();

    this.logger?.debug({ credentialType: adapter.credentialType }, "Google credentials validated");

    const fingerprint = getCredentialFingerprint(credentials);
    const clientId =
      credentials.type === "service_account" ? credentials.client_email : credentials.clientId;

    return {
      authInfo: {
        clientId,
        authType: `google-${credentials.type}`,
        scopes: adapter.scopes,
      },
      googleAuthAdapter: adapter,
      credentialFingerprint: fingerprint,
    };
  }

  async getCredentialFingerprint(
    headers: Record<string, string | string[] | undefined>
  ): Promise<string | undefined> {
    const { parseCredentialsFromHeaders, getCredentialFingerprint } = await import(
      "./google-auth.js"
    );
    const credentials = parseCredentialsFromHeaders(headers);
    return getCredentialFingerprint(credentials);
  }
}

/**
 * Strategy that validates Bearer JWT tokens with a shared secret (HS256).
 */
export class JwtBearerAuthStrategy implements AuthStrategy {
  constructor(
    private readonly secret: string,
    private readonly logger?: Logger
  ) {}

  async verify(headers: Record<string, string | string[] | undefined>): Promise<AuthResult> {
    const { extractBearerToken, verifyJwt, getJwtCredentialFingerprint } = await import("./jwt.js");

    const authHeader =
      typeof headers["authorization"] === "string"
        ? headers["authorization"]
        : Array.isArray(headers["authorization"])
          ? headers["authorization"][0]
          : undefined;

    const token = extractBearerToken(authHeader);
    const payload = await verifyJwt(token, this.secret);
    const credentialFingerprint = getJwtCredentialFingerprint(payload);

    this.logger?.debug({ sub: payload.sub }, "JWT validated");

    return {
      authInfo: {
        clientId: payload.sub,
        subject: payload.sub,
        authType: "jwt",
        scopes: payload.scope ? payload.scope.split(" ") : [],
      },
      credentialFingerprint,
      allowedAdvertisers: payload.allowed_advertisers,
    };
  }

  async getCredentialFingerprint(
    headers: Record<string, string | string[] | undefined>
  ): Promise<string | undefined> {
    const { extractBearerToken, verifyJwt, getJwtCredentialFingerprint } = await import("./jwt.js");

    const authHeader =
      typeof headers["authorization"] === "string"
        ? headers["authorization"]
        : Array.isArray(headers["authorization"])
          ? headers["authorization"][0]
          : undefined;

    const token = extractBearerToken(authHeader);
    const payload = await verifyJwt(token, this.secret);

    return getJwtCredentialFingerprint(payload);
  }
}

/**
 * Create an AuthStrategy based on the configured auth mode.
 */
export function createAuthStrategy(
  mode: AuthMode,
  options: {
    scopes?: string[];
    jwtSecret?: string;
    logger?: Logger;
  } = {}
): AuthStrategy {
  switch (mode) {
    case "google-headers":
      return new GoogleHeadersAuthStrategy(options.scopes || [], options.logger);

    case "jwt":
      if (!options.jwtSecret) {
        throw new Error("MCP_AUTH_SECRET_KEY is required for jwt auth mode");
      }
      return new JwtBearerAuthStrategy(options.jwtSecret, options.logger);

    case "none":
      return new NoAuthStrategy();

    default:
      throw new Error(`Unknown auth mode: ${mode}`);
  }
}
