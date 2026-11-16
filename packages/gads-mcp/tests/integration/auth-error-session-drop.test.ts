// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * An Unauthorized tool failure (Google Ads 401, or a refresh token rejected
 * with invalid_grant) must drop the session so the next request re-auths at
 * the transport and gets a clean HTTP 401. That needs both halves: the HTTP
 * client mapping 401 → Unauthorized (gads-http-client.test.ts) and the server
 * asking the shared factory to drop the session (this file). The factory's own
 * drop behaviour is covered in shared's platform-server-factory test.
 */

import { describe, expect, it, vi } from "vitest";

const captured = vi.hoisted(() => ({ options: undefined as any }));

vi.mock("@cesteral/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@cesteral/shared")>();
  return {
    ...actual,
    createPlatformMcpServer: vi.fn(async (options: unknown) => {
      captured.options = options;
      return {};
    }),
  };
});

import { createMcpServer } from "../../src/mcp-server/server.js";
import { sessionServiceStore } from "../../src/services/session-services.js";

const logger: any = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  child: vi.fn(),
};
logger.child.mockReturnValue(logger);

describe("gads-mcp session drop on auth failure", () => {
  it("asks the shared factory to drop a session whose credentials died", async () => {
    await createMcpServer(logger, "sess-dead");

    expect(captured.options.dropSessionOnAuthError).toBe(true);
    expect(captured.options.sessionServiceStore).toBe(sessionServiceStore);
  });
});
