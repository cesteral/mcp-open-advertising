import { describe, it, expect, beforeEach, vi } from "vitest";

import { bootstrapMcpServer } from "../../src/utils/server-bootstrap.js";
import { resetGovernanceRuntimeForTests } from "../../src/governance/runtime.js";

/**
 * The boot-vs-session half of issue #166.
 *
 * The jti-store safety guard used to live only inside
 * `registerToolsFromDefinitions`, which the streamable-HTTP transport calls once
 * per SESSION. A misconfigured `enforce` deployment therefore started cleanly,
 * passed its Cloud Run health check, went green, and only then threw — on every
 * session establishment, reads included. That is a 100% outage that reads like a
 * runtime fault, and it is the opposite of the "must not start" posture
 * CLAUDE.md principle 6 describes.
 *
 * These tests pin the corrected timing: the refusal happens during bootstrap,
 * BEFORE any transport is started, so Cloud Run fails the revision and holds
 * traffic on the previous one.
 */

const ENFORCED_WRITE_TOOL = {
  name: "meta_update_entity",
  annotations: { cesteral: { kind: "write", contractId: "meta.update_entity.v1" } },
};

function bootstrapOpts(overrides: Record<string, unknown> = {}) {
  return {
    serviceName: "test-mcp",
    config: {},
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), fatal: vi.fn() },
    transportMode: "http" as const,
    initOtel: vi.fn(),
    setupStdioSession: vi.fn(),
    createMcpServer: vi.fn(),
    runStdio: vi.fn(),
    startHttp: vi.fn(async () => ({
      server: { close: (cb?: () => void) => cb?.() },
      shutdown: async () => {},
    })),
    ...overrides,
  };
}

beforeEach(() => {
  resetGovernanceRuntimeForTests();
  delete process.env.GOVERNANCE_TOKEN_MODE;
  delete process.env.K_SERVICE;
  delete process.env.GOVERNANCE_JTI_STORE;
  delete process.env.GOVERNANCE_ALLOW_INMEMORY_JTI_UNDER_ENFORCE;
});

describe("bootstrapMcpServer governance posture (#166)", () => {
  it("refuses to start — and never starts a transport — under hosted enforce with an in-memory store", async () => {
    process.env.GOVERNANCE_TOKEN_MODE = "enforce";
    process.env.K_SERVICE = "test-mcp";

    const opts = bootstrapOpts({ tools: [ENFORCED_WRITE_TOOL] });

    await expect(bootstrapMcpServer(opts as never)).rejects.toThrow(/jti-store misconfiguration/i);

    // The point of moving the check to boot: traffic is never accepted.
    expect(opts.startHttp).not.toHaveBeenCalled();
  });

  it("starts normally when nothing enforces", async () => {
    process.env.GOVERNANCE_TOKEN_MODE = "off";

    const opts = bootstrapOpts({ tools: [ENFORCED_WRITE_TOOL] });
    await bootstrapMcpServer(opts as never);

    expect(opts.startHttp).toHaveBeenCalled();
  });

  it("starts under hosted enforce once the single-instance opt-out is declared", async () => {
    process.env.GOVERNANCE_TOKEN_MODE = "enforce";
    process.env.K_SERVICE = "test-mcp";
    process.env.GOVERNANCE_ALLOW_INMEMORY_JTI_UNDER_ENFORCE = "true";

    const opts = bootstrapOpts({ tools: [ENFORCED_WRITE_TOOL] });
    await bootstrapMcpServer(opts as never);

    expect(opts.startHttp).toHaveBeenCalled();
    expect(opts.logger.warn).toHaveBeenCalled();
  });

  it("skips the check entirely when a server passes no tools", async () => {
    process.env.GOVERNANCE_TOKEN_MODE = "enforce";
    process.env.K_SERVICE = "test-mcp";

    // No `tools` → previous behavior preserved; the per-session guard still runs.
    const opts = bootstrapOpts();
    await bootstrapMcpServer(opts as never);

    expect(opts.startHttp).toHaveBeenCalled();
  });
});
