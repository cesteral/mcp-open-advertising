// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadDotEnv } from "../../src/utils/transport/config-base.js";

/**
 * In stdio mode a server's stdout IS the MCP protocol channel, so anything
 * `loadDotEnv` prints there is a stray non-JSON line ahead of the first
 * message. dotenv 17 printed "◇ injected env (n) from <path>" to stdout even
 * with `debug: false`; dotenv 18 prints it to stderr. This pins the property
 * so a dotenv change cannot quietly bring it back.
 */
describe("loadDotEnv keeps stdout clean", () => {
  let dir: string;
  let cwd: string;
  let stdoutWrites: string[];

  beforeEach(() => {
    cwd = process.cwd();
    dir = mkdtempSync(join(tmpdir(), "load-dotenv-"));
    stdoutWrites = [];
    vi.spyOn(process.stdout, "write").mockImplementation(((chunk: unknown) => {
      stdoutWrites.push(String(chunk));
      return true;
    }) as typeof process.stdout.write);
    for (const method of ["log", "info", "debug"] as const) {
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
        stdoutWrites.push(args.map(String).join(" "));
      });
    }
    vi.spyOn(process.stderr, "write").mockImplementation(
      (() => true) as typeof process.stderr.write
    );
    process.chdir(dir);
  });

  afterEach(() => {
    process.chdir(cwd);
    rmSync(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
    delete process.env.LOAD_DOTENV_TEST_VALUE;
  });

  it("writes nothing to stdout when a .env is loaded, and still loads it", () => {
    writeFileSync(join(dir, ".env"), "LOAD_DOTENV_TEST_VALUE=loaded\n");

    loadDotEnv();

    expect(process.env.LOAD_DOTENV_TEST_VALUE).toBe("loaded");
    expect(stdoutWrites).toEqual([]);
  });

  it("writes nothing to stdout when there is no .env", () => {
    loadDotEnv();

    expect(stdoutWrites).toEqual([]);
  });
});
