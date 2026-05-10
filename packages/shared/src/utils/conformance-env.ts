// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

export function isConformanceFixturesEnabled(env = process.env): boolean {
  return env.MCP_CONFORMANCE_FIXTURES === "true";
}
