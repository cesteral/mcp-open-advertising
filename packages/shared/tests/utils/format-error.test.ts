import { describe, it, expect } from "vitest";
import {
  formatErrorForMcp,
  BidShifterError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ExternalApiError,
  RateLimitError,
  InternalServerError,
} from "../../src/utils/errors.js";

describe("formatErrorForMcp", () => {
  it("formats BidShifterError with code and details", () => {
    const error = new ValidationError("Invalid input", { field: "name" });
    const result = formatErrorForMcp(error);

    expect(result.isError).toBe(true);
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe("text");

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toBe("Invalid input");
    expect(parsed.code).toBe("VALIDATION_ERROR");
    expect(parsed.details).toEqual({ field: "name" });
  });

  it("formats standard Error with UNKNOWN_ERROR code", () => {
    const error = new Error("Something went wrong");
    const result = formatErrorForMcp(error);

    expect(result.isError).toBe(true);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toBe("Something went wrong");
    expect(parsed.code).toBe("UNKNOWN_ERROR");
  });

  it("formats non-Error values with generic message", () => {
    const result = formatErrorForMcp("string error");

    expect(result.isError).toBe(true);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toBe("An unknown error occurred");
    expect(parsed.code).toBe("UNKNOWN_ERROR");
  });

  it("formats null as unknown error", () => {
    const result = formatErrorForMcp(null);

    expect(result.isError).toBe(true);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toBe("An unknown error occurred");
  });

  it("formats undefined as unknown error", () => {
    const result = formatErrorForMcp(undefined);

    expect(result.isError).toBe(true);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toBe("An unknown error occurred");
  });
});

describe("BidShifterError subclasses", () => {
  it("ValidationError has code VALIDATION_ERROR and status 400", () => {
    const error = new ValidationError("bad input");
    expect(error).toBeInstanceOf(BidShifterError);
    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.statusCode).toBe(400);
    expect(error.name).toBe("ValidationError");
  });

  it("AuthenticationError defaults message and has status 401", () => {
    const error = new AuthenticationError();
    expect(error.message).toBe("Authentication required");
    expect(error.code).toBe("AUTHENTICATION_ERROR");
    expect(error.statusCode).toBe(401);
  });

  it("AuthorizationError defaults message and has status 403", () => {
    const error = new AuthorizationError();
    expect(error.message).toBe("Insufficient permissions");
    expect(error.code).toBe("AUTHORIZATION_ERROR");
    expect(error.statusCode).toBe(403);
  });

  it("NotFoundError has status 404", () => {
    const error = new NotFoundError("Entity not found");
    expect(error.code).toBe("NOT_FOUND");
    expect(error.statusCode).toBe(404);
  });

  it("ExternalApiError has status 502 and platform", () => {
    const error = new ExternalApiError("API failed", "dv360");
    expect(error.code).toBe("EXTERNAL_API_ERROR");
    expect(error.statusCode).toBe(502);
    expect(error.platform).toBe("dv360");
  });

  it("RateLimitError defaults message and has status 429", () => {
    const error = new RateLimitError();
    expect(error.message).toBe("Rate limit exceeded");
    expect(error.code).toBe("RATE_LIMIT_ERROR");
    expect(error.statusCode).toBe(429);
  });

  it("InternalServerError defaults message and has status 500", () => {
    const error = new InternalServerError();
    expect(error.message).toBe("Internal server error");
    expect(error.code).toBe("INTERNAL_SERVER_ERROR");
    expect(error.statusCode).toBe(500);
  });

  it("BidShifterError supports optional details", () => {
    const error = new ValidationError("bad", { field: "email", constraint: "required" });
    expect(error.details).toEqual({ field: "email", constraint: "required" });
  });

  it("BidShifterError has a stack trace", () => {
    const error = new ValidationError("test");
    expect(error.stack).toBeDefined();
    expect(error.stack).toContain("ValidationError");
  });
});
