// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { describe, expect, it, vi } from "vitest";
import type { Logger } from "pino";
import type { AuthResult } from "../../src/auth/auth-strategy.js";
import {
  createSessionForAuthWithEnvFallback,
  createStdioSessionSetup,
  type SessionForAuthOptions,
} from "../../src/utils/transport/env-credential-session.js";
import type { TransportFactoryAppConfig } from "../../src/utils/transport/mcp-http-transport-factory.js";

interface Adapter {
  id: string;
  validate: ReturnType<typeof vi.fn>;
}
interface Services {
  adapterId: string;
}

const adapter = (id: string, validate = vi.fn(async () => undefined)): Adapter => ({
  id,
  validate,
});

const makeLogger = () => ({ warn: vi.fn(), info: vi.fn() }) as unknown as Logger;

describe("createStdioSessionSetup", () => {
  it("validates the adapter, stores the services under the session id and returns true", async () => {
    const calls: string[] = [];
    const a = adapter(
      "env",
      vi.fn(async () => void calls.push("validate"))
    );
    const store = { set: vi.fn(() => void calls.push("set")) };
    const logger = makeLogger();

    const setup = createStdioSessionSetup<Adapter, Services>({
      sessionServiceStore: store,
      logger,
      buildEnvAdapter: async () => a,
      buildServices: (built) => {
        calls.push("build");
        return { adapterId: built.id };
      },
      missingCredentialsWarning: "set the env",
    });

    await expect(setup("stdio")).resolves.toBe(true);
    expect(calls).toEqual(["validate", "build", "set"]);
    expect(store.set).toHaveBeenCalledWith("stdio", { adapterId: "env" });
    expect(logger.info).toHaveBeenCalledWith("Stdio session services created successfully");
  });

  it("warns and returns false, without validating or storing, when the env has no credentials", async () => {
    const store = { set: vi.fn() };
    const logger = makeLogger();
    const buildServices = vi.fn();

    const setup = createStdioSessionSetup<Adapter, Services>({
      sessionServiceStore: store,
      logger,
      buildEnvAdapter: () => undefined,
      buildServices,
      missingCredentialsWarning: "set the env",
    });

    await expect(setup("stdio")).resolves.toBe(false);
    expect(logger.warn).toHaveBeenCalledWith("set the env");
    expect(buildServices).not.toHaveBeenCalled();
    expect(store.set).not.toHaveBeenCalled();
  });

  it("rejects, storing nothing, when the adapter fails validation", async () => {
    const store = { set: vi.fn() };
    const setup = createStdioSessionSetup<Adapter, Services>({
      sessionServiceStore: store,
      logger: makeLogger(),
      buildEnvAdapter: () =>
        adapter(
          "bad",
          vi.fn(async () => {
            throw new Error("invalid token");
          })
        ),
      buildServices: () => ({ adapterId: "bad" }),
      missingCredentialsWarning: "x",
    });

    await expect(setup("stdio")).rejects.toThrow("invalid token");
    expect(store.set).not.toHaveBeenCalled();
  });
});

describe("createSessionForAuthWithEnvFallback", () => {
  const logger = makeLogger();
  const config = (mcpAuthMode: string): TransportFactoryAppConfig => ({
    serviceName: "test-mcp",
    nodeEnv: "test",
    port: 0,
    host: "127.0.0.1",
    mcpAuthMode,
    mcpStatefulSessionTimeoutMs: 1000,
  });
  const auth = (platformAuthAdapter?: Adapter): AuthResult => ({
    authInfo: { token: "t", clientId: "c", scopes: [] },
    platformAuthAdapter,
    credentialFingerprint: "fp-1",
  });

  function build(
    overrides: Partial<SessionForAuthOptions<TransportFactoryAppConfig, Adapter, Services>> = {}
  ) {
    const store = { set: vi.fn() };
    const buildServices = vi.fn(
      (_c: TransportFactoryAppConfig, a: Adapter, _l: Logger, _fp: string | undefined) => ({
        adapterId: a.id,
      })
    );
    const create = createSessionForAuthWithEnvFallback<
      TransportFactoryAppConfig,
      Adapter,
      Services
    >({
      sessionServiceStore: store,
      adapterFromAuth: (r) => r.platformAuthAdapter as Adapter | undefined,
      validateAuthAdapter: false,
      buildServices,
      credentialsRequiredMessage: "credentials required",
      ...overrides,
    });
    return { create, store, buildServices };
  }

  it("stores services for the strategy's adapter under the request fingerprint", async () => {
    const { create, store, buildServices } = build();
    const a = adapter("auth");
    const cfg = config("meta-bearer");

    const result = await create(auth(a), "s1", cfg, logger);

    expect(result).toEqual({ services: { adapterId: "auth" } });
    expect(buildServices).toHaveBeenCalledWith(cfg, a, logger, "fp-1");
    expect(store.set).toHaveBeenCalledWith("s1", { adapterId: "auth" }, "fp-1");
    expect(a.validate).not.toHaveBeenCalled();
  });

  it("validates the strategy's adapter only when validateAuthAdapter is set", async () => {
    const { create } = build({ validateAuthAdapter: true });
    const a = adapter("auth");

    await create(auth(a), "s1", config("gads-headers"), logger);

    expect(a.validate).toHaveBeenCalledTimes(1);
  });

  it("does not store a session whose strategy adapter fails validation", async () => {
    const { create, store } = build({ validateAuthAdapter: true });
    const bad = adapter(
      "bad",
      vi.fn(async () => {
        throw new Error("nope");
      })
    );

    await expect(create(auth(bad), "s1", config("gads-headers"), logger)).rejects.toThrow("nope");
    expect(store.set).not.toHaveBeenCalled();
  });

  it.each(["none", "jwt"])("builds and validates an env adapter in %s mode", async (mode) => {
    const env = adapter("env");
    const buildEnvAdapter = vi.fn(async () => env);
    const { create, store } = build({ buildEnvAdapter });
    const cfg = config(mode);

    const result = await create(auth(), "s1", cfg, logger);

    expect(buildEnvAdapter).toHaveBeenCalledWith(cfg);
    expect(env.validate).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ services: { adapterId: "env" } });
    expect(store.set).toHaveBeenCalledWith("s1", { adapterId: "env" }, "fp-1");
  });

  it("prefers the strategy's adapter over env credentials", async () => {
    const buildEnvAdapter = vi.fn(() => adapter("env"));
    const { create } = build({ buildEnvAdapter });

    const result = await create(auth(adapter("auth")), "s1", config("none"), logger);

    expect(result).toEqual({ services: { adapterId: "auth" } });
    expect(buildEnvAdapter).not.toHaveBeenCalled();
  });

  it("never consults env credentials outside none/jwt mode", async () => {
    const buildEnvAdapter = vi.fn(() => adapter("env"));
    const { create } = build({ buildEnvAdapter, unsupportedModeMessage: "wrong mode" });

    const result = await create(auth(), "s1", config("meta-bearer"), logger);

    expect(buildEnvAdapter).not.toHaveBeenCalled();
    expect(result).toEqual({ services: null, error: { message: "wrong mode", status: 400 } });
  });

  it("returns a protocol-only session in none mode with nothing to authenticate", async () => {
    const { create, store } = build({ buildEnvAdapter: () => undefined });

    await expect(create(auth(), "s1", config("none"), logger)).resolves.toEqual({
      services: null,
    });
    expect(store.set).not.toHaveBeenCalled();
  });

  it("returns a protocol-only session in none mode when the server has no env fallback", async () => {
    const { create } = build();

    await expect(create(auth(), "s1", config("none"), logger)).resolves.toEqual({
      services: null,
    });
  });

  it("returns 400 with the credentials-required message in jwt mode without env credentials", async () => {
    const { create } = build({
      buildEnvAdapter: () => undefined,
      unsupportedModeMessage: "wrong mode",
    });

    await expect(create(auth(), "s1", config("jwt"), logger)).resolves.toEqual({
      services: null,
      error: { message: "credentials required", status: 400 },
    });
  });

  it("falls back to the credentials-required message when no unsupported-mode message is given", async () => {
    const { create } = build();

    await expect(create(auth(), "s1", config("google-headers"), logger)).resolves.toEqual({
      services: null,
      error: { message: "credentials required", status: 400 },
    });
  });
});
