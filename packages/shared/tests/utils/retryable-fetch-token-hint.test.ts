import { describe, it, expect } from "vitest";
import { executeWithRetry } from "../../src/utils/retryable-fetch.js";
import type { RetryConfig, FetchWithTimeoutFn } from "../../src/utils/retryable-fetch.js";
import { McpError } from "../../src/utils/mcp-errors.js";
import pino from "pino";

const logger = pino({ level: "silent" });

function createMock401Fetch(): FetchWithTimeoutFn {
  return async () =>
    new Response("Unauthorized", {
      status: 401,
      statusText: "Unauthorized",
    });
}

describe("executeWithRetry — tokenExpiryHint", () => {
  it("appends tokenExpiryHint to 401 error message when configured", async () => {
    const config: RetryConfig = {
      maxRetries: 0,
      platformName: "TestPlatform",
      tokenExpiryHint: "Token expired. Regenerate at example.com.",
    };

    await expect(
      executeWithRetry(config, {
        url: "https://api.example.com/test",
        logger,
        getHeaders: async () => ({ Authorization: "Bearer expired" }),
        fetchFn: createMock401Fetch(),
      })
    ).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(McpError);
      const mcpError = error as McpError;
      expect(mcpError.message).toContain(
        "Action required: Token expired. Regenerate at example.com."
      );
      expect(mcpError.data?.tokenExpiryHint).toBe("Token expired. Regenerate at example.com.");
      return true;
    });
  });

  it("does not append hint when tokenExpiryHint is not configured", async () => {
    const config: RetryConfig = {
      maxRetries: 0,
      platformName: "TestPlatform",
    };

    await expect(
      executeWithRetry(config, {
        url: "https://api.example.com/test",
        logger,
        getHeaders: async () => ({ Authorization: "Bearer expired" }),
        fetchFn: createMock401Fetch(),
      })
    ).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(McpError);
      const mcpError = error as McpError;
      expect(mcpError.message).not.toContain("Action required");
      expect(mcpError.data?.tokenExpiryHint).toBeUndefined();
      return true;
    });
  });

  it("does not append hint for non-401 errors even when configured", async () => {
    const config: RetryConfig = {
      maxRetries: 0,
      platformName: "TestPlatform",
      tokenExpiryHint: "Token expired. Regenerate at example.com.",
    };

    const mock403Fetch: FetchWithTimeoutFn = async () =>
      new Response("Forbidden", { status: 403, statusText: "Forbidden" });

    await expect(
      executeWithRetry(config, {
        url: "https://api.example.com/test",
        logger,
        getHeaders: async () => ({ Authorization: "Bearer valid" }),
        fetchFn: mock403Fetch,
      })
    ).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(McpError);
      const mcpError = error as McpError;
      expect(mcpError.message).not.toContain("Action required");
      expect(mcpError.data?.tokenExpiryHint).toBeUndefined();
      return true;
    });
  });
});

describe("executeWithRetry — McpError.data.nextAction wiring", () => {
  it("populates nextAction with the token-renewal action on 401, including the configured hint", async () => {
    const config: RetryConfig = {
      maxRetries: 0,
      platformName: "TestPlatform",
      tokenExpiryHint: "Visit https://example.com/oauth.",
    };

    await expect(
      executeWithRetry(config, {
        url: "https://api.example.com/test",
        logger,
        getHeaders: async () => ({ Authorization: "Bearer expired" }),
        fetchFn: createMock401Fetch(),
      })
    ).rejects.toSatisfy((error: unknown) => {
      const mcpError = error as McpError;
      expect(mcpError.data?.nextAction).toContain("Renew the API token");
      expect(mcpError.data?.nextAction).toContain("https://example.com/oauth");
      return true;
    });
  });

  it("populates nextAction with the Retry-After-aware action on 429", async () => {
    const config: RetryConfig = { maxRetries: 0, platformName: "TestPlatform" };

    const mock429Fetch: FetchWithTimeoutFn = async () =>
      new Response("Too Many Requests", {
        status: 429,
        statusText: "Too Many Requests",
        headers: { "Retry-After": "45" },
      });

    await expect(
      executeWithRetry(config, {
        url: "https://api.example.com/test",
        logger,
        getHeaders: async () => ({}),
        fetchFn: mock429Fetch,
      })
    ).rejects.toSatisfy((error: unknown) => {
      const mcpError = error as McpError;
      expect(mcpError.data?.nextAction).toContain("Wait 45 seconds");
      return true;
    });
  });

  it("populates nextAction with the verify-and-retry action on 404", async () => {
    const config: RetryConfig = { maxRetries: 0, platformName: "TestPlatform" };

    const mock404Fetch: FetchWithTimeoutFn = async () =>
      new Response("Not Found", { status: 404, statusText: "Not Found" });

    await expect(
      executeWithRetry(config, {
        url: "https://api.example.com/test",
        logger,
        getHeaders: async () => ({}),
        fetchFn: mock404Fetch,
      })
    ).rejects.toSatisfy((error: unknown) => {
      const mcpError = error as McpError;
      expect(mcpError.data?.nextAction).toMatch(/list_\* tool/);
      return true;
    });
  });

  it("preserves platform-specific extras from buildErrorData alongside nextAction", async () => {
    const config: RetryConfig = { maxRetries: 0, platformName: "TestPlatform" };

    const mock403Fetch: FetchWithTimeoutFn = async () =>
      new Response('{"meta_code": 200}', { status: 403, statusText: "Forbidden" });

    await expect(
      executeWithRetry(config, {
        url: "https://api.example.com/test",
        logger,
        getHeaders: async () => ({}),
        fetchFn: mock403Fetch,
        buildErrorData: () => ({ platformErrorCode: "DSP-403-MISSING-SCOPE" }),
      })
    ).rejects.toSatisfy((error: unknown) => {
      const mcpError = error as McpError;
      expect(mcpError.data?.platformErrorCode).toBe("DSP-403-MISSING-SCOPE");
      expect(mcpError.data?.nextAction).toMatch(/permission/);
      return true;
    });
  });
});
