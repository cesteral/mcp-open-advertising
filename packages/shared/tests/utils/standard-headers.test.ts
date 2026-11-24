// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { describe, it, expect } from "vitest";
import {
  findStandardHeaderMismatch,
  readStandardHeaders,
} from "../../src/utils/transport/standard-headers.js";

const h = (o: Record<string, string>) => new Headers(o);

describe("findStandardHeaderMismatch (#248)", () => {
  const call = { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "a_tool" } };

  it("accepts matching headers", () => {
    expect(
      findStandardHeaderMismatch(h({ "mcp-method": "tools/call", "mcp-name": "a_tool" }), call)
    ).toBeUndefined();
  });

  it("flags a different Mcp-Method", () => {
    const m = findStandardHeaderMismatch(h({ "mcp-method": "tools/list" }), call);
    expect(m?.header).toBe("Mcp-Method");
    expect(m?.data.bodyValue).toBe("tools/call");
  });

  it("flags a different Mcp-Name for tools/call, prompts/get and resources/read", () => {
    expect(findStandardHeaderMismatch(h({ "mcp-name": "other" }), call)?.header).toBe("Mcp-Name");
    expect(
      findStandardHeaderMismatch(h({ "mcp-name": "x" }), {
        method: "prompts/get",
        params: { name: "p" },
      })?.header
    ).toBe("Mcp-Name");
    expect(
      findStandardHeaderMismatch(h({ "mcp-name": "a://x" }), {
        method: "resources/read",
        params: { uri: "a://y" },
      })?.header
    ).toBe("Mcp-Name");
  });

  it("leaves missing headers, sentinels, batches and off-table methods to the SDK", () => {
    expect(findStandardHeaderMismatch(h({}), call)).toBeUndefined();
    expect(findStandardHeaderMismatch(h({ "mcp-name": "=?base64?YQ==?=" }), call)).toBeUndefined();
    expect(findStandardHeaderMismatch(h({ "mcp-method": "x" }), [call])).toBeUndefined();
    expect(
      findStandardHeaderMismatch(h({ "mcp-name": "zzz" }), { method: "tools/list" })
    ).toBeUndefined();
    expect(findStandardHeaderMismatch(h({ "mcp-method": "x" }), undefined)).toBeUndefined();
  });

  it("clips caller-controlled values", () => {
    const long = "x".repeat(500);
    const m = findStandardHeaderMismatch(h({ "mcp-method": long }), call);
    expect(m?.data.headerValue.length).toBeLessThan(250);
    expect(readStandardHeaders(h({ "mcp-name": long })).name!.length).toBeLessThan(250);
  });
});
