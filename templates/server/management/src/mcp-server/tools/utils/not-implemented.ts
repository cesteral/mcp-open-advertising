// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { McpError, JsonRpcErrorCode } from "@cesteral/shared";

/**
 * Thrown by every governed write stub, on `dry_run` as well as on a real
 * call. A governed dry-run that cannot validate and simulate must fail rather
 * than return a payload claiming it did (`assertGovernedDryRunResult`), so
 * the stub fails both paths until the write is implemented.
 */
export function notImplemented(toolName: string): never {
  throw new McpError(
    JsonRpcErrorCode.InternalError,
    `${toolName} is a scaffold stub: its {{displayName}} API call is not implemented yet. ` +
      "Implement it, with a wire-request test, before enabling this tool."
  );
}
