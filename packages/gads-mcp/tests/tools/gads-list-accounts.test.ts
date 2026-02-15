import { describe, it, expect } from "vitest";
import { ListAccountsInputSchema } from "../../src/mcp-server/tools/definitions/list-accounts.tool.js";

describe("ListAccountsInputSchema", () => {
  it("accepts empty input (no parameters required)", () => {
    const result = ListAccountsInputSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("strips unknown properties", () => {
    const result = ListAccountsInputSchema.safeParse({ foo: "bar" });
    expect(result.success).toBe(true);
  });
});
