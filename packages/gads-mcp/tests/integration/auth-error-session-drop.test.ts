// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * An Unauthorized tool failure (Google Ads 401, or a refresh token rejected
 * with invalid_grant) must drop the session so the next request re-auths at
 * the transport and gets a clean HTTP 401. That needs both halves: the HTTP
 * client mapping 401 → Unauthorized (gads-http-client.test.ts) and the server
 * passing `onAuthError` to the tool factory (this file).
 */

import { describe, expect, it, vi } from "vitest";

const captured = vi.hoisted(() => ({ options: undefined as any }));

vi.mock("@cesteral/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@cesteral/shared")>();
  return {
    ...actual,
    registerToolsFromDefinitions: vi.fn((options: unknown) => {
      captured.options = options;
    }),
  };
});

import { createMcpServer } from "../../src/mcp-server/server.js";
import { sessionServiceStore } from "../../src/services/session-services.js";
import { McpError, JsonRpcErrorCode } from "@cesteral/shared";

const logger: any = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  child: vi.fn(),
};
logger.child.mockReturnValue(logger);

describe("gads-mcp onAuthError wiring", () => {
  it("passes an onAuthError hook that deletes the stale session", async () => {
    await createMcpServer(logger, "sess-dead");

    expect(typeof captured.options?.onAuthError).toBe("function");

    const del = vi.spyOn(sessionServiceStore, "delete");
    captured.options.onAuthError(
      "sess-dead",
      new McpError(JsonRpcErrorCode.Unauthorized, "Google Ads API request failed: 401")
    );
    expect(del).toHaveBeenCalledWith("sess-dead");
    del.mockRestore();
  });
});
