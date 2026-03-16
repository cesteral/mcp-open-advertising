import { describe, it, expect } from "vitest";
import { ListAccountsInputSchema } from "../../src/mcp-server/tools/definitions/list-accounts.tool.js";

describe("ListAccountsInputSchema", () => {
  it("accepts empty object (no required params)", () => {
    const result = ListAccountsInputSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("strips unknown properties", () => {
    const result = ListAccountsInputSchema.safeParse({ unexpected: "value" });
    expect(result.success).toBe(true);
  });
});
