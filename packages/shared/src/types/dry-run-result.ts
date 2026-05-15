// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { NormalizedEntitySnapshot } from "./normalized-entity-snapshot.js";

export interface DryRunValidationError {
  code: string;
  message: string;
  /** Dotted path into the input args, when the error attaches to a field. */
  field?: string;
}

/**
 * Result of a `dry_run: true` invocation on a governed write tool.
 *
 * Validation and expected-state production are tagged independently because
 * platforms expose them asymmetrically — Google Ads `validate_only` returns
 * success/errors but no post-state; DV360 `get_delivery_estimate` returns
 * a post-state derivative without strict validation. Consumers use both
 * axes to weight confidence.
 */
export interface DryRunResult {
  wouldSucceed: boolean;
  validationErrors: DryRunValidationError[];

  /** Where validation came from. `"none"` only when no validation ran. */
  validationSource: "native_validator" | "symbolic" | "none";

  /** Where the expected post-state came from. `"none"` when no post-state was produced. */
  expectedStateSource: "native_simulator" | "server_symbolic_apply" | "none";

  /** Optional — present only when `expectedStateSource !== "none"`. */
  expectedPostState?: NormalizedEntitySnapshot;
}
