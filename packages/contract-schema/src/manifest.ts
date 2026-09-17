// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";

/**
 * Schema for `dist/cesteral-manifest.json`, the per-release attestation
 * manifest that ships inside each `@cesteral/<platform>-mcp` package tarball.
 * Verifying npm provenance on the package transitively verifies this file (it
 * lives inside the signed tarball — no separate signature).
 *
 * Two sides parse this exact shape and MUST agree: the release manifest
 * generator (`scripts/generate-manifests.mjs`) writes it, and the governance
 * cache-refresh reconciler treats a successfully verified manifest as a set of
 * "blessed" tool-definition hashes — any observed `definitionHash` matching an
 * entry here is promoted to `definitionTrust = 'attested'`.
 *
 * `definitionHash` is bare lowercase hex (no `sha256:` prefix), matching
 * `@cesteral/contract-hash`'s `computeDefinitionHash()` output — keeping the
 * surfaces bit-identical avoids any normalization layer between the repos.
 */
export interface CesteralManifestTool {
  toolName: string;
  contractPlatformSlug: string;
  contractToolSlug: string;
  schemaVersion: string;
  definitionHash: string;
  /**
   * Optional so a consumer pinned to an older @cesteral/contract-schema still
   * parses manifests that carry it (zod strips unknown keys). `manifestVersion`
   * deliberately stays `1` for the same reason: bumping it to 2 would make every
   * older consumer reject the whole manifest and drop every tool out of
   * `attested` until the governance repo upgraded — a much worse outcome than
   * an ignored field. Absent means `declared`.
   */
  verification?: CesteralToolVerification;
}

export interface CesteralManifest {
  manifestVersion: 1;
  packageName: string;
  packageVersion: string;
  generatedAt: string;
  tools: CesteralManifestTool[];
}

/**
 * How far a tool has been verified — and against WHICH definition (#203).
 *
 * Orthogonal to `attested`, and both are needed:
 *   - `attested`             — is this the definition we published, unmodified?
 *   - `verification.status`  — has THIS EXACT definition done its job?
 *
 * A consumer can then require `attested` AND `live-verified` before permitting
 * `enforce` on a money-moving write, which is inexpressible without this.
 */
export type CesteralVerificationStatus =
  /** Annotation present; nothing verified against this hash. The default. */
  | "declared"
  /** Passes fixtures/mocks in CI at this hash. */
  | "fixture-verified"
  /** Exercised against a real authorized account at this hash; findings triaged. */
  | "live-verified"
  /** Deliberately off. Requires `reason`. */
  | "disabled";

/**
 * A verification claim, BOUND to the definition it was made against.
 *
 * `verifiedDefinitionHash` is the load-bearing field. Without it a tool could be
 * verified, later change behaviour, get a new `definitionHash`, and ship the
 * stale `live-verified` beside the new hash — a status that actively lies about
 * a definition nobody tested. Generation demotes to `declared` whenever
 * `verifiedDefinitionHash !== definitionHash`, automatically, with no way to
 * override from the annotation or the ledger. That demotion is what makes the
 * field worth trusting, which is why #203 says it ships with demotion or not at
 * all.
 */
export interface CesteralToolVerification {
  status: CesteralVerificationStatus;
  /**
   * The `definitionHash` this claim was verified against. Absent only for
   * `declared` (nothing was verified) and `disabled` (nothing is running).
   */
  verifiedDefinitionHash?: string;
  /** ISO date (YYYY-MM-DD) the verification was performed. */
  verifiedAt?: string;
  /**
   * Link to the specific tool result, not merely to a report that exists.
   * Checking that an evidence path EXISTS proves nothing — the release gate
   * asserts hash equality, which is mechanical and meaningful.
   */
  evidence?: string;
  /** Tests that exercise this tool, for `fixture-verified`. */
  testPaths?: string[];
  /** Why the tool is deliberately off. Required for `disabled`. */
  reason?: string;
  /**
   * Set by generation when a claim was discarded because its bound hash no
   * longer matches. Preserves what was demoted so the demotion is visible in
   * the shipped artifact rather than silently absent.
   */
  demotedFrom?: CesteralVerificationStatus;
}

const verificationStatusSchema = z.enum([
  "declared",
  "fixture-verified",
  "live-verified",
  "disabled",
]);

/**
 * Two refinements carry the rules that make a status meaningful:
 *   1. a verified status MUST carry the hash it was verified against —
 *      otherwise the claim is unbindable and demotion cannot be computed;
 *   2. `disabled` MUST carry a reason.
 */
const verificationSchema: z.ZodType<CesteralToolVerification> = z
  .object({
    status: verificationStatusSchema,
    verifiedDefinitionHash: z
      .string()
      .regex(/^[0-9a-f]{64}$/)
      .optional(),
    verifiedAt: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    evidence: z.string().min(1).optional(),
    testPaths: z.array(z.string().min(1)).optional(),
    reason: z.string().min(1).optional(),
    demotedFrom: verificationStatusSchema.optional(),
  })
  .superRefine((value, ctx) => {
    const needsHash = value.status === "fixture-verified" || value.status === "live-verified";
    if (needsHash && !value.verifiedDefinitionHash) {
      ctx.addIssue({
        code: "custom",
        path: ["verifiedDefinitionHash"],
        message:
          `status "${value.status}" must carry the verifiedDefinitionHash it was verified ` +
          `against; an unbound status cannot be demoted when the definition changes.`,
      });
    }
    if (value.status === "disabled" && !value.reason) {
      ctx.addIssue({
        code: "custom",
        path: ["reason"],
        message: 'status "disabled" requires a reason.',
      });
    }
  });

// Plain interfaces above are the authoring contract; the schema is annotated
// `z.ZodType<CesteralManifest>` (the assignment self-checks the mirror) so the
// emitted `.d.ts` carries no zod-version-specific structure.
export const cesteralManifestSchema: z.ZodType<CesteralManifest> = z.object({
  manifestVersion: z.literal(1),
  packageName: z.string().regex(/^@cesteral\/[a-z0-9-]+-mcp$/),
  packageVersion: z.string(),
  generatedAt: z.string().datetime(),
  tools: z
    .array(
      z.object({
        toolName: z.string(),
        contractPlatformSlug: z.string(),
        contractToolSlug: z.string(),
        schemaVersion: z.string(),
        definitionHash: z.string().regex(/^[0-9a-f]{64}$/),
        verification: verificationSchema.optional(),
      })
    )
    .min(1),
});
