// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Re-export shim. The `cesteral.*` tool-annotation surface is owned by
 * `@cesteral/contract-schema` — the single source of truth shared with the
 * governance layer. This file preserves the historical `@cesteral/shared`
 * import path so connector tool definitions keep importing the same names.
 */

export { isEntityWrite, isEffectWrite, CESTERAL_WRITE_OPERATIONS } from "@cesteral/contract-schema";

export type {
  CesteralToolAnnotations,
  CesteralWriteToolAnnotations,
  CesteralEntityWriteToolAnnotations,
  CesteralEffectWriteToolAnnotations,
  CesteralReadToolAnnotations,
  CesteralWriteOperation,
} from "@cesteral/contract-schema";
