// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * #201. These tests pin the properties that make the operational block worth
 * publishing: that every mechanical value is DERIVED from the thing it
 * describes, and that the two absent protections stay stated as absent.
 *
 * They drive the real objects — a real `RateLimiter`, the real retry predicate
 * and method guard, the real card endpoint — rather than asserting a
 * reconstructed shape. A test that rebuilt the envelope's expected contents by
 * hand would stay green through exactly the drift this block exists to prevent.
 */

import { describe, it, expect } from "vitest";
import pino from "pino";
import {
  buildOperationalEnvelope,
  FLEET_IDEMPOTENCY,
} from "../../src/utils/operational-envelope.js";
import { RateLimiter } from "../../src/utils/rate-limiter.js";
import {
  describeRetryPolicy,
  IDEMPOTENT_RETRY_METHODS,
  DEFAULT_MAX_RETRIES,
} from "../../src/utils/retryable-fetch.js";
import {
  createMcpHttpTransport,
  type TransportFactoryConfig,
  type TransportFactoryAppConfig,
} from "../../src/utils/mcp-http-transport-factory.js";
import { SessionServiceStore } from "../../src/utils/session-store.js";

/** The shared default: 429 plus any 5xx. Not restated — this IS the default path. */
const defaultEnvelope = () =>
  buildOperationalEnvelope({ interactionLogMode: "file", terminalOperations: [] });

describe("rate limit is read off the live limiter", () => {
  it("publishes the configured per-minute cap", () => {
    const limiter = new RateLimiter();
    limiter.configure("test:*", 42, 60_000);

    const envelope = buildOperationalEnvelope({
      rateLimiter: limiter,
      interactionLogMode: "file",
      terminalOperations: [],
    });

    expect(envelope.rateLimit?.requestsPerMinute).toBe(42);
    expect(envelope.rateLimit?.scope).toBe("per-process");
  });

  it("tracks the limiter rather than a copy of it", () => {
    // The property that matters: re-configuring the limiter changes what the
    // card publishes. A declared value in registry.json would not move here.
    const limiter = new RateLimiter();
    limiter.configure("test:*", 10, 60_000);
    const before = buildOperationalEnvelope({
      rateLimiter: limiter,
      interactionLogMode: "file",
      terminalOperations: [],
    });

    limiter.configure("test:*", 99, 60_000);
    const after = buildOperationalEnvelope({
      rateLimiter: limiter,
      interactionLogMode: "file",
      terminalOperations: [],
    });

    expect(before.rateLimit?.requestsPerMinute).toBe(10);
    expect(after.rateLimit?.requestsPerMinute).toBe(99);
  });

  it("normalises a non-minute window to requests-per-minute", () => {
    const limiter = new RateLimiter();
    limiter.configure("test:*", 5, 30_000); // 5 per 30s == 10 per minute
    const envelope = buildOperationalEnvelope({
      rateLimiter: limiter,
      interactionLogMode: "file",
      terminalOperations: [],
    });
    expect(envelope.rateLimit?.requestsPerMinute).toBe(10);
  });

  it("publishes the most restrictive limit when several are configured", () => {
    // A client pacing itself hits the tightest one first, so that is the honest
    // number to publish.
    const limiter = new RateLimiter();
    limiter.configure("a:*", 100, 60_000);
    limiter.configure("b:*", 7, 60_000);
    const envelope = buildOperationalEnvelope({
      rateLimiter: limiter,
      interactionLogMode: "file",
      terminalOperations: [],
    });
    expect(envelope.rateLimit?.requestsPerMinute).toBe(7);
  });

  it("is null rather than invented when no limiter is configured", () => {
    expect(defaultEnvelope().rateLimit).toBeNull();
  });
});

describe("retry policy is probed, not declared", () => {
  it("reports the shared default: 429 and 5xx", () => {
    const { retry } = defaultEnvelope();
    expect(retry?.retryOnStatus).toContain(429);
    expect(retry?.retryOnStatus).toContain(503);
    expect(retry?.retryOnStatus).not.toContain(404);
  });

  it("counts total attempts, not retries — the off-by-one the card must not repeat", () => {
    // DEFAULT_MAX_RETRIES is a RETRY budget; the loop runs `attempt <= maxRetries`.
    // Publishing the budget itself would understate the load on a client's quota.
    expect(defaultEnvelope().retry?.maxTotalAttempts).toBe(DEFAULT_MAX_RETRIES + 1);
    expect(describeRetryPolicy(undefined, 2).maxTotalAttempts).toBe(3);
  });

  it("derives the re-send-safe method set from the live guard", () => {
    const { retry } = defaultEnvelope();
    expect([...retry!.resendSafeMethodsOn5xx].sort()).toEqual([...IDEMPOTENT_RETRY_METHODS].sort());
    // The load-bearing exclusion: a create must not be re-sent after an
    // ambiguous 5xx.
    expect(retry?.resendSafeMethodsOn5xx).not.toContain("POST");
  });

  it("reports 429 as safe for ANY method, because the platform rejected it unprocessed", () => {
    // This is the fact the issue's proposed wording ("POST is never retried")
    // got wrong. POST IS re-sent on 429.
    expect(defaultEnvelope().retry?.resendSafeForAllMethods).toContain(429);
  });

  it("reports NO all-method-safe status when the platform predicate omits 429", () => {
    // Amazon DSP's real posture: retry 5xx only, deliberately surfacing 429 to
    // the caller. With 429 not retryable at all, there is no status a POST may
    // be re-sent on — so a card publishing a fleet-wide `[429, "5xx"]` would be
    // wrong in both directions at once.
    const amazonLike = (status: number) => status >= 500;
    const policy = describeRetryPolicy(amazonLike, 2);

    expect(policy.retryOnStatus).not.toContain(429);
    expect(policy.resendSafeForAllMethods).toEqual([]);
    expect(policy.maxTotalAttempts).toBe(3);
  });

  it("is null, not defaulted, for a server that does not use the shared retry layer", () => {
    // dbm-mcp drives its own polling loop. Reporting the shared defaults would
    // describe code it does not run.
    const envelope = buildOperationalEnvelope({
      usesSharedRetryLayer: false,
      interactionLogMode: "file",
      terminalOperations: [],
    });
    expect(envelope.retry).toBeNull();
  });
});

describe("idempotency states the ABSENT protection as absent", () => {
  it("declares the client-retry gap, which is the one that still duplicates writes", () => {
    // A caller that loses the response, re-authorizes and retries carries a new
    // jti, so consume-once does not fire. This must stay false.
    expect(FLEET_IDEMPOTENCY.clientRetryDeduplicated).toBe(false);
    expect(FLEET_IDEMPOTENCY.clientSuppliedKeySupported).toBe(false);
    expect(FLEET_IDEMPOTENCY.bulkPartialCompletionResumable).toBe(false);
  });

  it("does not claim POST is never retried", () => {
    // Asserted by meaning, not wording: the note must not make the flatly false
    // claim, and must acknowledge the 429 case that makes it false.
    expect(FLEET_IDEMPOTENCY.note).not.toMatch(/POST is never retried/i);
    expect(FLEET_IDEMPOTENCY.note).toMatch(/429/);
    expect(FLEET_IDEMPOTENCY.note).toMatch(/5xx/);
  });

  it("names the fresh-authorization recovery path the protections do not cover", () => {
    expect(FLEET_IDEMPOTENCY.note).toMatch(/fresh/i);
    expect(FLEET_IDEMPOTENCY.note).toMatch(/partial/i);
  });
});

describe("rollback", () => {
  it("never claims support, and carries the terminal list through verbatim", () => {
    const terminal = [
      { tool: "x_delete_entity", operations: ["delete"], note: "hard delete, no restore tool" },
    ];
    const envelope = buildOperationalEnvelope({
      interactionLogMode: "file",
      terminalOperations: terminal,
    });
    expect(envelope.rollback.supported).toBe(false);
    expect(envelope.rollback.terminalOperations).toEqual(terminal);
  });

  it("says absence from the list is not a promise of reversibility", () => {
    expect(defaultEnvelope().rollback.note).toMatch(/not a promise/i);
  });
});

describe("audit", () => {
  it("publishes the resolved destination and an explicit null retention", () => {
    const envelope = buildOperationalEnvelope({
      interactionLogMode: "gcs",
      terminalOperations: [],
    });
    expect(envelope.audit.destination).toBe("gcs");
    // Explicitly null, not omitted — "nothing is guaranteed" is the answer.
    expect(envelope.audit).toHaveProperty("retentionDays");
    expect(envelope.audit.retentionDays).toBeNull();
  });
});

describe("the block reaches the real server card", () => {
  it("is served at /.well-known/mcp/server-card.json with the server's own values", async () => {
    const limiter = new RateLimiter();
    limiter.configure("probe:*", 17, 60_000);

    const platformConfig: TransportFactoryConfig = {
      authStrategy: {
        async authenticate() {
          return { ok: false as const, status: 401 as const, message: "no" };
        },
        async getCredentialFingerprint() {
          return "fp";
        },
      } as unknown as TransportFactoryConfig["authStrategy"],
      corsAllowHeaders: ["Content-Type"],
      authErrorHint: "hint",
      sessionServiceStore: new SessionServiceStore<{ svc: string }>(
        10
      ) as unknown as TransportFactoryConfig["sessionServiceStore"],
      createSessionForAuth: (async () => ({
        services: { svc: "s" },
      })) as unknown as TransportFactoryConfig["createSessionForAuth"],
      createMcpServer: async () => ({ connect: async () => {}, close: async () => {} }),
      packageJsonPath: "nonexistent-package.json",
      rateLimiter: limiter,
      retryDescriptor: { maxRetries: 2, isRetryable: (status: number) => status >= 500 },
      serverCard: {
        description: "probe server",
        platform: "Probe",
        supportedAuthModes: ["none"],
        terminalOperations: [
          { tool: "probe_delete_entity", operations: ["delete"], note: "no restore path here" },
        ],
      },
    };

    const config: TransportFactoryAppConfig = {
      serviceName: "probe-mcp",
      nodeEnv: "test",
      port: 0,
      host: "127.0.0.1",
      mcpAuthMode: "none",
      mcpStatefulSessionTimeoutMs: 60_000,
    };

    const { app, shutdown } = createMcpHttpTransport(
      config,
      pino({ level: "silent" }),
      platformConfig
    );
    try {
      const res = await app.request("/.well-known/mcp/server-card.json");
      const body = (await res.json()) as { operational: Record<string, never> };
      const op = body.operational as unknown as ReturnType<typeof buildOperationalEnvelope>;

      // Every one of these came from THIS server's own inputs, not a default.
      expect(op.rateLimit?.requestsPerMinute).toBe(17);
      expect(op.retry?.maxTotalAttempts).toBe(3);
      expect(op.retry?.retryOnStatus).not.toContain(429);
      expect(op.rollback.terminalOperations[0]?.tool).toBe("probe_delete_entity");
      expect(op.idempotency.clientRetryDeduplicated).toBe(false);
    } finally {
      await shutdown();
    }
  });
});
