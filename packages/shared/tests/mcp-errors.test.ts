import { describe, it, expect } from "vitest";
import {
  McpError,
  JsonRpcErrorCode,
  ErrorHandler,
  mapErrorCodeToHttpStatus,
  buildNextAction,
} from "../src/utils/mcp-errors.js";

describe("JsonRpcErrorCode", () => {
  it("defines standard JSON-RPC error codes", () => {
    expect(JsonRpcErrorCode.ParseError).toBe(-32700);
    expect(JsonRpcErrorCode.InvalidRequest).toBe(-32600);
    expect(JsonRpcErrorCode.MethodNotFound).toBe(-32601);
    expect(JsonRpcErrorCode.InvalidParams).toBe(-32602);
    expect(JsonRpcErrorCode.InternalError).toBe(-32603);
  });

  it("defines implementation-specific error codes", () => {
    expect(JsonRpcErrorCode.Unauthorized).toBe(-32006);
    expect(JsonRpcErrorCode.Forbidden).toBe(-32005);
    expect(JsonRpcErrorCode.NotFound).toBe(-32001);
    expect(JsonRpcErrorCode.RateLimited).toBe(-32003);
    expect(JsonRpcErrorCode.Timeout).toBe(-32004);
  });
});

describe("mapErrorCodeToHttpStatus", () => {
  it("maps parse/validation errors to 400", () => {
    expect(mapErrorCodeToHttpStatus(JsonRpcErrorCode.ParseError)).toBe(400);
    expect(mapErrorCodeToHttpStatus(JsonRpcErrorCode.InvalidRequest)).toBe(400);
    expect(mapErrorCodeToHttpStatus(JsonRpcErrorCode.InvalidParams)).toBe(400);
    expect(mapErrorCodeToHttpStatus(JsonRpcErrorCode.ValidationError)).toBe(400);
  });

  it("maps auth errors to 401/403", () => {
    expect(mapErrorCodeToHttpStatus(JsonRpcErrorCode.Unauthorized)).toBe(401);
    expect(mapErrorCodeToHttpStatus(JsonRpcErrorCode.Forbidden)).toBe(403);
  });

  it("maps not found errors to 404", () => {
    expect(mapErrorCodeToHttpStatus(JsonRpcErrorCode.NotFound)).toBe(404);
    expect(mapErrorCodeToHttpStatus(JsonRpcErrorCode.MethodNotFound)).toBe(404);
  });

  it("maps rate limit to 429", () => {
    expect(mapErrorCodeToHttpStatus(JsonRpcErrorCode.RateLimited)).toBe(429);
  });

  it("maps internal error to 500", () => {
    expect(mapErrorCodeToHttpStatus(JsonRpcErrorCode.InternalError)).toBe(500);
  });

  it("maps timeout to 504", () => {
    expect(mapErrorCodeToHttpStatus(JsonRpcErrorCode.Timeout)).toBe(504);
  });
});

describe("McpError", () => {
  it("creates an error with code and message", () => {
    const err = new McpError(JsonRpcErrorCode.NotFound, "Resource not found");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(McpError);
    expect(err.code).toBe(JsonRpcErrorCode.NotFound);
    expect(err.message).toBe("Resource not found");
    expect(err.name).toBe("McpError");
  });

  it("supports optional data", () => {
    const err = new McpError(JsonRpcErrorCode.InternalError, "Oops", {
      queryId: "123",
    });
    expect(err.data).toEqual({ queryId: "123" });
  });

  it("supports cause", () => {
    const cause = new Error("original");
    const err = new McpError(JsonRpcErrorCode.InternalError, "wrapped", undefined, {
      cause,
    });
    expect(err.cause).toBe(cause);
  });

  it("defaults message to 'An error occurred'", () => {
    const err = new McpError(JsonRpcErrorCode.InternalError);
    expect(err.message).toBe("An error occurred");
  });

  describe("toJsonRpc", () => {
    it("returns JSON-RPC error object", () => {
      const err = new McpError(JsonRpcErrorCode.NotFound, "Not here", { id: 1 });
      const rpc = err.toJsonRpc();
      expect(rpc).toEqual({
        code: JsonRpcErrorCode.NotFound,
        message: "Not here",
        data: { id: 1 },
      });
    });
  });

  describe("fromError", () => {
    it("returns McpError unchanged", () => {
      const original = new McpError(JsonRpcErrorCode.NotFound, "nope");
      const result = McpError.fromError(original);
      expect(result).toBe(original);
    });

    it("wraps standard Error", () => {
      const result = McpError.fromError(new Error("bad"));
      expect(result).toBeInstanceOf(McpError);
      expect(result.code).toBe(JsonRpcErrorCode.InternalError);
      expect(result.message).toBe("bad");
    });

    it("wraps non-Error values", () => {
      const result = McpError.fromError("string error");
      expect(result).toBeInstanceOf(McpError);
      expect(result.message).toBe("string error");
    });

    it("accepts custom default code", () => {
      const result = McpError.fromError(new Error("oops"), JsonRpcErrorCode.Timeout);
      expect(result.code).toBe(JsonRpcErrorCode.Timeout);
    });
  });
});

describe("ErrorHandler", () => {
  describe("handleError", () => {
    it("returns McpError unchanged", () => {
      const original = new McpError(JsonRpcErrorCode.NotFound, "nope");
      const result = ErrorHandler.handleError(original, {
        operation: "test",
      });
      expect(result).toBe(original);
    });

    it("converts keyword-based errors", () => {
      const notFound = ErrorHandler.handleError(new Error("Item not found"), {
        operation: "test",
      });
      expect(notFound.code).toBe(JsonRpcErrorCode.NotFound);

      const timeout = ErrorHandler.handleError(new Error("Request timed out"), {
        operation: "test",
      });
      expect(timeout.code).toBe(JsonRpcErrorCode.Timeout);

      const rateLimit = ErrorHandler.handleError(new Error("Rate limit exceeded"), {
        operation: "test",
      });
      expect(rateLimit.code).toBe(JsonRpcErrorCode.RateLimited);

      const unauthorized = ErrorHandler.handleError(new Error("Unauthorized access"), {
        operation: "test",
      });
      expect(unauthorized.code).toBe(JsonRpcErrorCode.Unauthorized);

      const forbidden = ErrorHandler.handleError(new Error("Permission denied"), {
        operation: "test",
      });
      expect(forbidden.code).toBe(JsonRpcErrorCode.Forbidden);
    });

    it("defaults to InternalError for unknown errors", () => {
      const result = ErrorHandler.handleError(new Error("something broke"), {
        operation: "test",
      });
      expect(result.code).toBe(JsonRpcErrorCode.InternalError);
    });
  });

  describe("sanitizeErrorData", () => {
    it("returns undefined for undefined input", () => {
      expect(ErrorHandler.sanitizeErrorData(undefined)).toBeUndefined();
    });

    it("redacts sensitive keys", () => {
      const data = {
        queryId: "123",
        password: "secret123",
        api_key: "key-abc",
        accessToken: "tok-xyz",
      };
      const result = ErrorHandler.sanitizeErrorData(data);
      expect(result).toEqual({
        queryId: "123",
        password: "[REDACTED]",
        api_key: "[REDACTED]",
        accessToken: "[REDACTED]",
      });
    });

    it("recursively sanitizes nested objects", () => {
      const data = {
        auth: {
          token: "secret",
          type: "bearer",
        },
      };
      const result = ErrorHandler.sanitizeErrorData(data);
      expect(result).toEqual({
        auth: {
          token: "[REDACTED]",
          type: "bearer",
        },
      });
    });

    it("preserves arrays", () => {
      const data = { items: [1, 2, 3] };
      const result = ErrorHandler.sanitizeErrorData(data);
      expect(result).toEqual({ items: [1, 2, 3] });
    });

    it("redacts bearer tokens and access_token fields inside string values", () => {
      // Simulates errorBody copied verbatim from an upstream response.
      const data = {
        errorBody:
          'Authorization: Bearer abc.def.ghi failed; echo: "access_token":"leak-me","ok":true',
      };
      const result = ErrorHandler.sanitizeErrorData(data) as { errorBody: string };
      expect(result.errorBody).toContain("[REDACTED]");
      expect(result.errorBody).not.toContain("abc.def.ghi");
      expect(result.errorBody).not.toContain("leak-me");
    });
  });
});

describe("ErrorHandler.defaultNextActionForStatus", () => {
  it("returns a token-renewal action for 401", () => {
    const text = ErrorHandler.defaultNextActionForStatus(401);
    expect(text).toMatch(/Renew the API token/);
  });

  it("includes the supplied tokenExpiryHint in the 401 action", () => {
    const text = ErrorHandler.defaultNextActionForStatus(401, {
      tokenExpiryHint: "Visit https://example.com/token",
    });
    expect(text).toContain("https://example.com/token");
  });

  it("uses Retry-After seconds in the 429 action when provided", () => {
    const text = ErrorHandler.defaultNextActionForStatus(429, { retryAfterSeconds: 30 });
    expect(text).toContain("Wait 30 seconds");
  });

  it("falls back to a generic 429 action when Retry-After is unknown", () => {
    const text = ErrorHandler.defaultNextActionForStatus(429);
    expect(text).toMatch(/exponential delay/);
  });

  it("returns a verify-and-retry action for 404", () => {
    const text = ErrorHandler.defaultNextActionForStatus(404);
    expect(text).toMatch(/list_\* tool/);
  });

  it("returns an upstream-outage hint for 5xx", () => {
    const text = ErrorHandler.defaultNextActionForStatus(503);
    expect(text).toMatch(/Upstream service error/);
  });

  it("returns undefined for status codes without a generic hint", () => {
    expect(ErrorHandler.defaultNextActionForStatus(418)).toBeUndefined();
    expect(ErrorHandler.defaultNextActionForStatus(200)).toBeUndefined();
  });
});

describe("McpError.data nextAction wiring", () => {
  it("McpError carries nextAction in data when set", () => {
    const err = new McpError(JsonRpcErrorCode.RateLimited, "Too many requests", {
      httpStatus: 429,
      nextAction: "Wait 30 seconds before retrying.",
    });
    expect(err.data?.nextAction).toBe("Wait 30 seconds before retrying.");
    expect(err.toJsonRpc().data?.nextAction).toBe("Wait 30 seconds before retrying.");
  });

  it("McpError carries suggestedValues in data when set", () => {
    const err = new McpError(JsonRpcErrorCode.InvalidRequest, "Invalid status", {
      suggestedValues: ["ACTIVE", "PAUSED"],
    });
    expect(err.data?.suggestedValues).toEqual(["ACTIVE", "PAUSED"]);
  });
});

describe("buildNextAction", () => {
  it("renders discover-account hints", () => {
    expect(buildNextAction({ kind: "discover-account", tool: "meta_list_ad_accounts" })).toBe(
      "Call meta_list_ad_accounts to discover available accounts."
    );
    expect(
      buildNextAction({
        kind: "discover-account",
        tool: "linkedin_list_ad_accounts",
        field: "adAccountUrn",
      })
    ).toBe("Call linkedin_list_ad_accounts to discover valid adAccountUrn values.");
  });

  it("renders list-entity hints with optional entityType + field", () => {
    expect(
      buildNextAction({
        kind: "list-entity",
        tool: "meta_list_entities",
        entityType: "campaign",
        field: "campaign_id",
      })
    ).toBe("Call meta_list_entities with entityType='campaign' to find a campaign_id.");

    expect(buildNextAction({ kind: "list-entity", tool: "ttd_list_entities" })).toBe(
      "Call ttd_list_entities to list available entities."
    );
  });

  it("renders check-status, read-resource, renew-token, retry-after, conflict-refetch, check-permission", () => {
    expect(
      buildNextAction({
        kind: "check-status",
        tool: "ttd_check_report_status",
        idField: "reportId",
        expectedStatus: "Completed",
      })
    ).toBe(
      "Poll ttd_check_report_status using the reportId until status reaches 'Completed'."
    );
    expect(
      buildNextAction({ kind: "read-resource", uri: "entity-schema://campaign" })
    ).toBe("Read MCP resource entity-schema://campaign.");
    expect(buildNextAction({ kind: "renew-token" })).toMatch(/Renew the API token/);
    expect(buildNextAction({ kind: "retry-after", seconds: 30 })).toBe(
      "Wait 30 seconds (Retry-After header) before retrying."
    );
    expect(buildNextAction({ kind: "conflict-refetch", tool: "ttd_get_entity" })).toMatch(
      /Re-fetch the entity via ttd_get_entity/
    );
    expect(buildNextAction({ kind: "check-permission" })).toMatch(/permission/);
  });
});
