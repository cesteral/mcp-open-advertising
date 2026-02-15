import { describe, it, expect, vi } from "vitest";
import type { GoogleAuthAdapter } from "@cesteral/shared";
import { BidManagerService } from "../../src/services/bid-manager/BidManagerService.js";
import {
  createSessionServices,
  SessionServiceStore,
} from "../../src/services/session-services.js";
import { resolveSessionServices } from "../../src/mcp-server/tools/utils/resolve-session.js";

function createMockLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  } as any;
}

function createMockAdapter(token = "test-token"): GoogleAuthAdapter {
  return {
    getAccessToken: vi.fn().mockResolvedValue(token),
    credentialType: "service_account",
    scopes: ["https://www.googleapis.com/auth/doubleclickbidmanager"],
  };
}

describe("session services", () => {
  it("creates BidManagerService for a session", () => {
    const services = createSessionServices(
      createMockAdapter(),
      {
        reportPollInitialDelayMs: 100,
        reportPollMaxDelayMs: 1000,
        reportPollMaxRetries: 2,
        reportQueryRetries: 1,
        reportRetryCooldownMs: 100,
      } as any,
      createMockLogger(),
    );

    expect(services.bidManagerService).toBeInstanceOf(BidManagerService);
  });

  it("supports set/get/delete in SessionServiceStore", () => {
    const store = new SessionServiceStore();
    const services = createSessionServices(
      createMockAdapter(),
      {
        reportPollInitialDelayMs: 100,
        reportPollMaxDelayMs: 1000,
        reportPollMaxRetries: 2,
        reportQueryRetries: 1,
        reportRetryCooldownMs: 100,
      } as any,
      createMockLogger(),
    );

    store.set("s1", services);
    expect(store.get("s1")).toBe(services);

    store.delete("s1");
    expect(store.get("s1")).toBeUndefined();
  });
});

describe("resolveSessionServices", () => {
  it("throws when sessionId is missing", () => {
    expect(() => resolveSessionServices(undefined)).toThrow(
      "No session ID available",
    );
  });

  it("throws when services are not found for sessionId", () => {
    expect(() => resolveSessionServices({ sessionId: "missing" })).toThrow(
      'No services registered for session "missing"',
    );
  });
});
