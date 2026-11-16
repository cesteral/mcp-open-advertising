// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Session wiring shared by every platform server: the stdio credential setup
 * and the transport's `createSessionForAuth`, including the none/jwt
 * environment-credential fallback.
 *
 * Which adapter a server builds (a static token, a refresh-token exchange, a
 * Google service account, msads' four headers) stays in the server's own
 * callbacks. This module owns the control flow around them: validate the
 * adapter, build the session services, store them, and map "no credentials"
 * to the right outcome for the auth mode. It does not touch the credential
 * fingerprint, the 401 mapping or rebuild-on-cache-miss; those live in the
 * transport factory, which calls what this module returns.
 */

import type { Logger } from "pino";
import type { AuthResult } from "../../auth/auth-strategy.js";
import type {
  SessionCreationResult,
  TransportFactoryAppConfig,
} from "./mcp-http-transport-factory.js";

/** An auth adapter whose credentials can be checked against the platform. */
export interface ValidatableAuthAdapter {
  validate(): Promise<unknown>;
}

export interface StdioSessionSetupOptions<TAdapter extends ValidatableAuthAdapter, TServices> {
  sessionServiceStore: { set(sessionId: string, services: TServices): void };
  logger: Logger;
  /** Adapter built from env vars, or undefined when the env carries no usable credentials. */
  buildEnvAdapter: () => TAdapter | undefined | Promise<TAdapter | undefined>;
  buildServices: (adapter: TAdapter) => TServices;
  /** Logged when `buildEnvAdapter` returns undefined; names the env vars to set. */
  missingCredentialsWarning: string;
}

/**
 * Build the `setupStdioSession` callback for `bootstrapMcpServer`. Returns
 * false (the bootstrap then aborts) when the env has no credentials; an invalid
 * credential fails here, at startup, because the adapter is validated first.
 */
export function createStdioSessionSetup<TAdapter extends ValidatableAuthAdapter, TServices>(
  opts: StdioSessionSetupOptions<TAdapter, TServices>
): (sessionId: string) => Promise<boolean> {
  return async (sessionId) => {
    const adapter = await opts.buildEnvAdapter();
    if (!adapter) {
      opts.logger.warn(opts.missingCredentialsWarning);
      return false;
    }

    await adapter.validate();

    opts.sessionServiceStore.set(sessionId, opts.buildServices(adapter));
    opts.logger.info("Stdio session services created successfully");
    return true;
  };
}

export interface SessionForAuthOptions<
  TConfig extends TransportFactoryAppConfig,
  TAdapter extends ValidatableAuthAdapter,
  TServices,
> {
  sessionServiceStore: {
    set(sessionId: string, services: TServices, credentialFingerprint?: string): void;
  };
  /** The adapter the auth strategy put on the AuthResult (`googleAuthAdapter` or `platformAuthAdapter`). */
  adapterFromAuth: (authResult: AuthResult) => TAdapter | undefined;
  /**
   * Validate that adapter here. Set it where the auth strategy does not already
   * validate at verify time (the Google and header-based servers).
   */
  validateAuthAdapter: boolean;
  buildServices: (
    config: TConfig,
    adapter: TAdapter,
    logger: Logger,
    credentialFingerprint: string | undefined
  ) => TServices;
  /**
   * Adapter built from env vars for `none` / `jwt` mode, where no strategy
   * supplies one. Omit for servers that take credentials from request headers
   * only. Undefined means the env carries no usable credentials.
   */
  buildEnvAdapter?: (config: TConfig) => TAdapter | undefined | Promise<TAdapter | undefined>;
  /** 400 message when no adapter is available and the mode is not `none`. */
  credentialsRequiredMessage: string;
  /**
   * 400 message for a mode other than `none` / `jwt` that supplied no adapter.
   * Defaults to `credentialsRequiredMessage`.
   */
  unsupportedModeMessage?: string;
}

/**
 * Build a platform's `createSessionForAuth`:
 *
 * 1. The strategy supplied an adapter: validate it if asked, build, store.
 * 2. `none` / `jwt` mode with env credentials: build, validate, store.
 * 3. `none` mode with nothing to authenticate: a protocol-only session
 *    (`services: null`); tools fail at runtime.
 * 4. Anything else: a 400 naming what is missing.
 *
 * Every successful path stores the session under the request's credential
 * fingerprint, so the transport's per-call fingerprint check still applies.
 */
export function createSessionForAuthWithEnvFallback<
  TConfig extends TransportFactoryAppConfig,
  TAdapter extends ValidatableAuthAdapter,
  TServices,
>(
  opts: SessionForAuthOptions<TConfig, TAdapter, TServices>
): (
  authResult: AuthResult,
  sessionId: string,
  config: TransportFactoryAppConfig,
  logger: Logger
) => Promise<SessionCreationResult> {
  return async (authResult, sessionId, appConfig, logger) => {
    const config = appConfig as TConfig;

    const store = (adapter: TAdapter): SessionCreationResult => {
      const services = opts.buildServices(
        config,
        adapter,
        logger,
        authResult.credentialFingerprint
      );
      opts.sessionServiceStore.set(sessionId, services, authResult.credentialFingerprint);
      return { services };
    };

    const authAdapter = opts.adapterFromAuth(authResult);
    if (authAdapter) {
      if (opts.validateAuthAdapter) await authAdapter.validate();
      return store(authAdapter);
    }

    const mode = config.mcpAuthMode;
    if (opts.buildEnvAdapter && (mode === "none" || mode === "jwt")) {
      const envAdapter = await opts.buildEnvAdapter(config);
      if (envAdapter) {
        await envAdapter.validate();
        return store(envAdapter);
      }
    }

    if (mode === "none") return { services: null };

    return {
      services: null,
      error: {
        message:
          mode === "jwt"
            ? opts.credentialsRequiredMessage
            : (opts.unsupportedModeMessage ?? opts.credentialsRequiredMessage),
        status: 400,
      },
    };
  };
}
