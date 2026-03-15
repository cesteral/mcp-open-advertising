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
      expect(mcpError.message).toContain("Action required: Token expired. Regenerate at example.com.");
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
