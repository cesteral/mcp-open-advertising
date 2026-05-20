// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
//
// Pure logic for attestation-manifest generation: derive a manifest entry
// from a raw MCP tool, and validate a manifest against governance's
// CesteralManifestSchema. Kept import-side-effect-free so it is unit-testable
// (the orchestration script generate-manifests.mjs auto-runs on import).

import { z } from "zod";
import { computeDefinitionHash } from "@cesteral/contract-hash";

// contractId is `<platformSlug>.<toolSlug>.v<schemaVersion>` — see
// @cesteral/shared CesteralToolAnnotations. The tool slug may itself contain
// dots, so anchor on the leading platform segment and trailing version.
const CONTRACT_ID_RE = /^([a-z0-9-]+)\.(.+)\.v(\d+)$/;

// Byte-for-byte mirror of governance's CesteralManifestSchema —
// cesteral-intelligence/lib/features/governance/attestation/manifest-schema.ts.
// Keep these in lockstep: a divergence silently accepts manifests governance
// will reject (or vice versa).
const CesteralManifestSchema = z.object({
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
      })
    )
    .min(1),
});

/**
 * Builds a manifest tool entry from a raw wire tool, or returns null if the
 * tool is not governed (no `annotations.cesteral`). Throws on a malformed or
 * inconsistent cesteral block — a hard failure so a release never ships a
 * silently-wrong manifest.
 */
export function toManifestEntry(tool) {
  const cesteral = tool?.annotations?.cesteral;
  if (!cesteral) return null;

  const match = CONTRACT_ID_RE.exec(cesteral.contractId ?? "");
  if (!match) {
    throw new Error(
      `${tool.name}: cesteral.contractId ${JSON.stringify(cesteral.contractId)} ` +
        `does not match <platform>.<tool>.v<version>`
    );
  }
  const [, platformSlug, toolSlug, versionInId] = match;

  if (typeof cesteral.schemaVersion !== "number") {
    throw new Error(
      `${tool.name}: cesteral.schemaVersion must be a number, got ` +
        `${JSON.stringify(cesteral.schemaVersion)}`
    );
  }

  if (Number(versionInId) !== cesteral.schemaVersion) {
    throw new Error(
      `${tool.name}: contractId version v${versionInId} disagrees with ` +
        `cesteral.schemaVersion ${cesteral.schemaVersion}`
    );
  }

  return {
    toolName: tool.name,
    contractPlatformSlug: platformSlug,
    contractToolSlug: toolSlug,
    schemaVersion: String(cesteral.schemaVersion),
    definitionHash: computeDefinitionHash(tool),
  };
}

/**
 * Validates a manifest object against the CesteralManifestSchema mirror
 * above. Throws an Error listing every violation (path + message); returns
 * nothing on success.
 */
export function validateManifest(manifest) {
  const result = CesteralManifestSchema.safeParse(manifest);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    throw new Error(
      `Invalid manifest for ${manifest?.packageName ?? "(unknown package)"}:\n${issues}`
    );
  }
}
