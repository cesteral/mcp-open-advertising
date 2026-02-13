import { describe, it, expect } from "vitest";
import {
  createRequestContext,
  runWithRequestContext,
  getRequestContext,
  getRequestId,
  extractRequestId,
} from "../src/utils/request-context.js";

describe("createRequestContext", () => {
  it("creates context with requestId and service", () => {
    const ctx = createRequestContext("test-service");
    expect(ctx.requestId).toBeDefined();
    expect(ctx.requestId.length).toBeGreaterThan(0);
    expect(ctx.service).toBe("test-service");
    expect(ctx.timestamp).toBeDefined();
    expect(ctx.userId).toBeUndefined();
  });

  it("includes userId when provided", () => {
    const ctx = createRequestContext("test-service", "user-123");
    expect(ctx.userId).toBe("user-123");
  });
});

describe("runWithRequestContext / getRequestContext", () => {
  it("makes context available within the callback", () => {
    const ctx = createRequestContext("test-service");
    let capturedCtx: ReturnType<typeof getRequestContext>;

    runWithRequestContext(ctx, () => {
      capturedCtx = getRequestContext();
    });

    expect(capturedCtx!).toBe(ctx);
  });

  it("returns undefined outside of context scope", () => {
    expect(getRequestContext()).toBeUndefined();
  });

  it("propagates context through async boundaries", async () => {
    const ctx = createRequestContext("test-service");
    ctx.requestId = "test-req-123";

    const result = await runWithRequestContext(ctx, async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return getRequestId();
    });

    expect(result).toBe("test-req-123");
  });

  it("isolates contexts between concurrent calls", async () => {
    const ctx1 = createRequestContext("svc1");
    ctx1.requestId = "req-1";
    const ctx2 = createRequestContext("svc2");
    ctx2.requestId = "req-2";

    const [r1, r2] = await Promise.all([
      runWithRequestContext(ctx1, async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return getRequestId();
      }),
      runWithRequestContext(ctx2, async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return getRequestId();
      }),
    ]);

    expect(r1).toBe("req-1");
    expect(r2).toBe("req-2");
  });
});

describe("getRequestId", () => {
  it("returns 'unknown' outside of context", () => {
    expect(getRequestId()).toBe("unknown");
  });

  it("returns requestId within context", () => {
    const ctx = createRequestContext("test");
    ctx.requestId = "my-id";
    runWithRequestContext(ctx, () => {
      expect(getRequestId()).toBe("my-id");
    });
  });
});

describe("extractRequestId", () => {
  it("extracts x-request-id header", () => {
    const id = extractRequestId({ "x-request-id": "header-123" });
    expect(id).toBe("header-123");
  });

  it("generates UUID when header missing", () => {
    const id = extractRequestId({});
    expect(id).toBeDefined();
    expect(id.length).toBe(36); // UUID format
  });

  it("generates UUID when header is array", () => {
    const id = extractRequestId({ "x-request-id": ["a", "b"] });
    expect(id.length).toBe(36); // Falls back to UUID
  });
});
