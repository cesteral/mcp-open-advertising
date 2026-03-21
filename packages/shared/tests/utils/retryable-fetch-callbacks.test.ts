import { describe, it, expect, vi } from "vitest";
import { executeWithRetry } from "../../src/utils/retryable-fetch.js";
import type { RetryConfig, FetchWithTimeoutFn } from "../../src/utils/retryable-fetch.js";
import { McpError } from "../../src/utils/mcp-errors.js";
import pino from "pino";

const logger = pino({ level: "silent" });

const baseConfig: RetryConfig = {
  maxRetries: 1,
  initialBackoffMs: 1,
  maxBackoffMs: 1,
  platformName: "TestPlatform",
};

function createMockFetch(status: number, body: string | object = ""): FetchWithTimeoutFn {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return async () =>
    new Response(text, {
      status,
      statusText: status === 200 ? "OK" : "Error",
      headers: { "Content-Type": "application/json" },
    });
}

describe("executeWithRetry — isRetryable callback", () => {
  it("retries when isRetryable returns true for normally non-retryable status", async () => {
    let callCount = 0;
    const fetchFn: FetchWithTimeoutFn = async () => {
      callCount++;
      if (callCount === 1) {
        return new Response(JSON.stringify({ error: { code: 4 } }), {
          status: 400,
          statusText: "Bad Request",
        });
      }
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    };

    const result = await executeWithRetry(
      { ...baseConfig, maxRetries: 1 },
      {
        url: "https://api.example.com/test",
        logger,
        getHeaders: async () => ({}),
        fetchFn,
        isRetryable: (_status, body) => {
          try {
            const parsed = JSON.parse(body);
            return parsed.error?.code === 4;
          } catch {
            return false;
          }
        },
      }
    );

    expect(result).toEqual({ success: true });
    expect(callCount).toBe(2);
  });

  it("does not retry when isRetryable returns false for normally retryable status", async () => {
    const fetchFn = createMockFetch(429, "rate limited");

    await expect(
      executeWithRetry(
        { ...baseConfig, maxRetries: 1 },
        {
          url: "https://api.example.com/test",
          logger,
          getHeaders: async () => ({}),
          fetchFn,
          isRetryable: () => false,
        }
      )
    ).rejects.toThrow();
  });
});

describe("executeWithRetry — onResponse callback", () => {
  it("calls onResponse for successful responses", async () => {
    const onResponse = vi.fn();
    const fetchFn = async () =>
      new Response(JSON.stringify({ ok: true }), { status: 200 });

    await executeWithRetry(baseConfig, {
      url: "https://api.example.com/test",
      logger,
      getHeaders: async () => ({}),
      fetchFn,
      onResponse,
    });

    expect(onResponse).toHaveBeenCalledOnce();
    const [response] = onResponse.mock.calls[0];
    expect(response.status).toBe(200);
  });

  it("calls onResponse for error responses", async () => {
    const onResponse = vi.fn();
    const fetchFn = createMockFetch(401, "Unauthorized");

    await expect(
      executeWithRetry(
        { ...baseConfig, maxRetries: 0 },
        {
          url: "https://api.example.com/test",
          logger,
          getHeaders: async () => ({}),
          fetchFn,
          onResponse,
        }
      )
    ).rejects.toThrow();

    expect(onResponse).toHaveBeenCalledOnce();
  });

  it("calls onResponse on each retry attempt", async () => {
    const onResponse = vi.fn();
    let callCount = 0;
    const fetchFn: FetchWithTimeoutFn = async () => {
      callCount++;
      if (callCount <= 2) {
        return new Response("error", { status: 500, statusText: "Server Error" });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    };

    await executeWithRetry(
      { ...baseConfig, maxRetries: 2 },
      {
        url: "https://api.example.com/test",
        logger,
        getHeaders: async () => ({}),
        fetchFn,
        onResponse,
      }
    );

    expect(onResponse).toHaveBeenCalledTimes(3);
  });
});

describe("executeWithRetry — buildErrorData callback", () => {
  it("merges extra data into McpError.data", async () => {
    const errorBody = JSON.stringify({
      error: { code: 190, type: "OAuthException", fbtrace_id: "trace-123" },
    });
    const fetchFn = createMockFetch(401, errorBody);

    await expect(
      executeWithRetry(
        { ...baseConfig, maxRetries: 0 },
        {
          url: "https://api.example.com/test",
          logger,
          getHeaders: async () => ({}),
          fetchFn,
          buildErrorData: (_status, body) => {
            try {
              const parsed = JSON.parse(body);
              return {
                metaCode: parsed.error?.code,
                metaType: parsed.error?.type,
                fbtraceId: parsed.error?.fbtrace_id,
              };
            } catch {
              return {};
            }
          },
        }
      )
    ).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(McpError);
      const mcpError = error as McpError;
      expect(mcpError.data?.metaCode).toBe(190);
      expect(mcpError.data?.metaType).toBe("OAuthException");
      expect(mcpError.data?.fbtraceId).toBe("trace-123");
      // Standard fields should still be present
      expect(mcpError.data?.httpStatus).toBe(401);
      return true;
    });
  });

  it("does not add extra data when buildErrorData is not provided", async () => {
    const fetchFn = createMockFetch(400, "Bad Request");

    await expect(
      executeWithRetry(
        { ...baseConfig, maxRetries: 0 },
        {
          url: "https://api.example.com/test",
          logger,
          getHeaders: async () => ({}),
          fetchFn,
        }
      )
    ).rejects.toSatisfy((error: unknown) => {
      const mcpError = error as McpError;
      expect(mcpError.data?.metaCode).toBeUndefined();
      return true;
    });
  });
});
