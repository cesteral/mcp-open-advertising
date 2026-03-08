import { describe, it, expect } from "vitest";
import {
  checkType,
  validateRequiredFields,
  checkReadOnlyFields,
  validateEntityResponseFormatter,
  type ValidateEntityResult,
} from "../../src/utils/client-validation-helpers.js";

// ---------------------------------------------------------------------------
// checkType
// ---------------------------------------------------------------------------

describe("checkType", () => {
  it("returns true for matching string", () => {
    expect(checkType("hello", "string")).toBe(true);
  });

  it("returns true for matching number", () => {
    expect(checkType(42, "number")).toBe(true);
  });

  it("returns true for matching boolean", () => {
    expect(checkType(true, "boolean")).toBe(true);
  });

  it("returns true for matching object (plain object)", () => {
    expect(checkType({ a: 1 }, "object")).toBe(true);
  });

  it("returns true for matching array", () => {
    expect(checkType([1, 2], "array")).toBe(true);
  });

  it("distinguishes array from object", () => {
    expect(checkType([1, 2], "object")).toBe(false);
    expect(checkType({ a: 1 }, "array")).toBe(false);
  });

  it("treats null as not-object", () => {
    expect(checkType(null, "object")).toBe(false);
  });

  it("returns false for type mismatches", () => {
    expect(checkType("hello", "number")).toBe(false);
    expect(checkType(42, "string")).toBe(false);
    expect(checkType(true, "string")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// validateRequiredFields
// ---------------------------------------------------------------------------

describe("validateRequiredFields", () => {
  it("returns empty array when all required fields present with correct types", () => {
    const data = { name: "test", count: 5 };
    const rules = [
      { field: "name", expectedType: "string" as const },
      { field: "count", expectedType: "number" as const },
    ];
    expect(validateRequiredFields(data, rules)).toEqual([]);
  });

  it("returns error for missing field", () => {
    const errors = validateRequiredFields({}, [{ field: "name" }]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('Missing required field "name"');
  });

  it("returns error for null field", () => {
    const errors = validateRequiredFields({ name: null }, [{ field: "name" }]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('Missing required field "name"');
  });

  it("returns error for wrong type with actual type in message", () => {
    const errors = validateRequiredFields({ count: "not-a-number" }, [
      { field: "count", expectedType: "number" },
    ]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("should be number but got string");
  });

  it("includes hint in missing-field error message when provided", () => {
    const errors = validateRequiredFields({}, [
      { field: "name", hint: "e.g. My Campaign" },
    ]);
    expect(errors[0]).toContain("(e.g. My Campaign)");
  });

  it("includes hint in wrong-type error message when provided", () => {
    const errors = validateRequiredFields({ count: "bad" }, [
      { field: "count", expectedType: "number", hint: "must be numeric" },
    ]);
    expect(errors[0]).toContain("(must be numeric)");
  });

  it("distinguishes array from object in type error", () => {
    const errors = validateRequiredFields({ config: [1, 2] }, [
      { field: "config", expectedType: "object" },
    ]);
    expect(errors[0]).toContain("but got array");
  });

  it("passes when no expectedType is specified and field is present", () => {
    const errors = validateRequiredFields({ name: 123 }, [{ field: "name" }]);
    expect(errors).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// checkReadOnlyFields
// ---------------------------------------------------------------------------

describe("checkReadOnlyFields", () => {
  it("returns empty array when no read-only fields present in data", () => {
    const warnings = checkReadOnlyFields({ name: "test" }, ["id", "createdAt"]);
    expect(warnings).toEqual([]);
  });

  it("returns warnings for present read-only fields", () => {
    const warnings = checkReadOnlyFields(
      { id: "123", name: "test", createdAt: "2025-01-01" },
      ["id", "createdAt"]
    );
    expect(warnings).toHaveLength(2);
  });

  it("uses default message template", () => {
    const warnings = checkReadOnlyFields({ id: "123" }, ["id"]);
    expect(warnings[0]).toBe(
      'Field "id" is read-only and will be ignored by the API'
    );
  });

  it("uses custom messageTemplate when provided", () => {
    const template = (field: string) => `"${field}" may be ignored by TikTok`;
    const warnings = checkReadOnlyFields({ id: "123" }, ["id"], template);
    expect(warnings[0]).toBe('"id" may be ignored by TikTok');
  });
});

// ---------------------------------------------------------------------------
// validateEntityResponseFormatter
// ---------------------------------------------------------------------------

describe("validateEntityResponseFormatter", () => {
  const baseResult: ValidateEntityResult = {
    valid: true,
    entityType: "campaign",
    mode: "create",
    errors: [],
    warnings: [],
    timestamp: "2025-01-15T12:00:00.000Z",
  };

  it("formats passing validation result", () => {
    const content = validateEntityResponseFormatter(baseResult);
    expect(content).toHaveLength(1);
    const text = (content[0] as { type: string; text: string }).text;
    expect(text).toContain("Validation passed for campaign (create)");
  });

  it("formats failing result with errors", () => {
    const result: ValidateEntityResult = {
      ...baseResult,
      valid: false,
      errors: ['Missing required field "name"', 'Field "count" should be number but got string'],
    };
    const text = (validateEntityResponseFormatter(result)[0] as { type: string; text: string }).text;
    expect(text).toContain("Validation failed for campaign (create):");
    expect(text).toContain('Missing required field "name"');
    expect(text).toContain("should be number but got string");
  });

  it("includes warnings section when warnings present", () => {
    const result: ValidateEntityResult = {
      ...baseResult,
      warnings: ['Field "id" is read-only and will be ignored by the API'],
    };
    const text = (validateEntityResponseFormatter(result)[0] as { type: string; text: string }).text;
    expect(text).toContain("Warnings:");
    expect(text).toContain('Field "id" is read-only');
  });

  it("omits warnings section when no warnings", () => {
    const text = (validateEntityResponseFormatter(baseResult)[0] as { type: string; text: string }).text;
    expect(text).not.toContain("Warnings:");
  });

  it("includes timestamp", () => {
    const text = (validateEntityResponseFormatter(baseResult)[0] as { type: string; text: string }).text;
    expect(text).toContain("Timestamp: 2025-01-15T12:00:00.000Z");
  });

  it("returns content block with type 'text'", () => {
    const content = validateEntityResponseFormatter(baseResult);
    expect((content[0] as { type: string }).type).toBe("text");
  });
});
