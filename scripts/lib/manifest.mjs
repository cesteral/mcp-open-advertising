// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
//
// Pure logic for attestation-manifest generation: derive a manifest entry
// from a raw MCP tool, and validate a manifest against the canonical
// `cesteralManifestSchema` from @cesteral/contract-schema (the same schema the
// governance layer verifies released manifests with). Kept import-side-effect-
// free so it is unit-testable (generate-manifests.mjs auto-runs on import).

import { computeDefinitionHash } from "@cesteral/contract-hash";
import { cesteralManifestSchema, parseCesteralAnnotation } from "@cesteral/contract-schema";

// contractId is `<platformSlug>.<toolSlug>.v<schemaVersion>` — see
// @cesteral/contract-schema CesteralToolAnnotations. Both slugs match the
// canonical slug shape `/^[a-z0-9_]{1,40}$/` (lowercase, digits, underscores —
// no hyphens). The tool slug may itself contain dots, so anchor on the leading
// platform segment and trailing version.
const CONTRACT_ID_RE = /^([a-z0-9_]+)\.(.+)\.v(\d+)$/;

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

  // Cross-check the annotation's own slug fields against the contractId
  // segments. Downstream governance reads these fields and requires
  // contractId === `<contractPlatformSlug>.<contractToolSlug>.v<schemaVersion>`;
  // a mismatch (e.g. slug "linkedin" with contractId "linkedin_ads.…") is
  // admissible-looking here but rejected at admission. Fail the release instead.
  if (
    cesteral.contractPlatformSlug !== undefined &&
    cesteral.contractPlatformSlug !== platformSlug
  ) {
    throw new Error(
      `${tool.name}: cesteral.contractPlatformSlug ${JSON.stringify(cesteral.contractPlatformSlug)} ` +
        `disagrees with the platform segment of contractId (${JSON.stringify(platformSlug)}). ` +
        `contractId must equal \`<contractPlatformSlug>.<contractToolSlug>.v<schemaVersion>\`.`
    );
  }
  if (cesteral.contractToolSlug !== undefined && cesteral.contractToolSlug !== toolSlug) {
    throw new Error(
      `${tool.name}: cesteral.contractToolSlug ${JSON.stringify(cesteral.contractToolSlug)} ` +
        `disagrees with the tool segment of contractId (${JSON.stringify(toolSlug)}).`
    );
  }

  // Full semantic gate. The structural checks above give precise, legible
  // errors for the common contractId/schemaVersion/slug mistakes and fire
  // first; this runs the canonical loose annotation schema
  // (`cesteralAnnotationSchema`) — the SAME schema the governance layer parses
  // released tool lists with — so a release fails here rather than shipping an
  // annotation that only the downstream consumer's admission layer rejects.
  // It covers the fields the structural checks do not: the write/read + entity/
  // effect discriminator, `operation` membership in CESTERAL_WRITE_OPERATIONS,
  // non-empty `entityKinds`/`entityIdArgs`, and the entity-write `readPartner`.
  const parsed = parseCesteralAnnotation(cesteral);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    throw new Error(
      `${tool.name}: cesteral annotation does not satisfy the contract schema:\n${issues}`
    );
  }

  // NOTE on the schemaVersion number→string boundary: the annotation carries
  // `schemaVersion` as a NUMBER (and the canonical definitionHash hashes that
  // number, since the hash is taken over the raw tool), but the manifest record
  // serializes it to a STRING to match `cesteralManifestSchema`. Attestation
  // matching downstream is keyed on `definitionHash` alone — never on this
  // record's schemaVersion — so the 1 vs "1" duality is cosmetic and safe.
  // Do NOT start joining/matching on `schemaVersion` across the manifest and a
  // live annotation without coercing both sides: `1 === "1"` is false.
  return {
    toolName: tool.name,
    contractPlatformSlug: platformSlug,
    contractToolSlug: toolSlug,
    schemaVersion: String(cesteral.schemaVersion),
    definitionHash: computeDefinitionHash(tool),
  };
}

/**
 * Validates a manifest object against the canonical `cesteralManifestSchema`
 * from `@cesteral/contract-schema` — the same schema the governance layer
 * verifies released manifests with. Throws an Error listing every violation
 * (path + message); returns nothing on success.
 */
export function validateManifest(manifest) {
  const result = cesteralManifestSchema.safeParse(manifest);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    throw new Error(
      `Invalid manifest for ${manifest?.packageName ?? "(unknown package)"}:\n${issues}`
    );
  }
}
