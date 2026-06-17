# Review: Governance Contract pipeline — producer side (2026-06-17)

Scope: the producer half of the cross-repo governance contract — how a governed
tool's `cesteral.*` annotation flows from a `.tool.ts` definition through
`@cesteral/contract-schema` / `@cesteral/contract-hash` into the release
attestation manifest, and whether the producer's release-time gates match the
contract the downstream governance layer (`cesteral-intelligence`) actually
enforces.

Companion to the consumer-side review in the governance repo
(`docs/reviews/governance-contract-pipeline-2026-06-16.md`), which covered the
`definitionHash` seam and trust promotion.

## Verdict

The pipeline is complete and correctly wired — one hashing implementation, one
guardrail-evaluation core, provenance-gated trust, fail-open-safe defaults. The
review found **one substantive producer gap (F3)** and three low-severity notes
(F4–F6). F3 is fixed here, and fixing it surfaced a **systemic, previously
silent production bug**: 5 entity-class `create_*` tools were un-attestable.

## Findings

### F3 — producer never ran the annotation schema at manifest time (FIXED)

`scripts/generate-manifests.mjs` / `toManifestEntry` validated the `cesteral`
block only by a hand-rolled `contractId` regex plus `cesteralManifestSchema`
(which covers just the 6 manifest fields). The canonical `cesteralAnnotationSchema`
— which validates the write/read + entity/effect discriminator, `operation`
membership, entity identity, and `readPartner` — was **never invoked on the
producer side**. The only producer-time guarantee was a compile-time `satisfies`.
Consequence: a malformed-but-type-shaped annotation shipped a valid-looking
manifest entry and only failed at the consumer's admission layer — wrong repo,
after release.

**Fix:** `toManifestEntry` now runs `parseCesteralAnnotation` as a final
semantic gate (`scripts/lib/manifest.mjs`). The structural contractId/version/
slug checks still fire first with precise messages; the schema gate catches
everything else. A release now fails fast on a malformed annotation.

### F3-followup — 5 entity-class create tools were un-attestable (FIXED)

Landing the F3 gate immediately failed the release on `ttd_create_entity`. A
full-fleet scan found the issue was systemic: **5 entity-class `create_*` tools
across 4 platforms** declared an empty `entityIdArgs`:

- `ttd_create_entity`, `linkedin_create_entity`, `msads_create_entity`,
  `amazon_dsp_create_entity`, `amazon_dsp_create_commitment`.

The governance layer runs `cesteralAnnotationSchema.safeParse` at
`write-preview/admit.ts:260`, and the entity-write arm required
`entityIdArgs.min(1)`. So all 5 were rejected with `annotationInvalid` and
**could never be admitted as governed writes, let alone promoted to `attested`**
— a silent capability gap in production. Only `dv360` (which exposes typed
parent-id args) was compliant.

Root cause: the contract schema required entity identity for **every**
entity-write, but a `create` has no pre-existing entity to reference — and 3 of
the 5 tools (ttd, linkedin, msads) have no top-level parent-id arg at all (those
ids live in the generic `data` payload, deliberately out of contract scope).

**Fix (two parts):**

1. **Schema relaxation** (`@cesteral/contract-schema` → `1.2.0`): a new
   `applyEntityWriteIdArgsRule`, composed at the union level (entity-write is a
   `discriminatedUnion` member and can't carry its own `.superRefine`), enforces
   `entityIdArgs ≥ 1` for entity-writes **except** when `operation` includes
   `create`. Non-create entity-writes (update/pause/delete/…) still require
   identity. This is a backward-compatible loosening (minor bump).
2. **Tool accuracy** where a real arg exists: `amazon_dsp_create_entity` and
   `amazon_dsp_create_commitment` now declare `entityIdArgs: ["profileId"]` (the
   required top-level scope arg, already mapped in their `readPartner`). The
   ttd/linkedin/msads create tools correctly stay empty.

> **Cross-repo follow-up (required for downstream effect):** the governance repo
> pins `@cesteral/contract-schema@1.1.0` and runs the strict schema at admission.
> Until `1.2.0` is published to npm and the governance repo bumps its pin, the 5
> create tools remain un-attestable downstream — **no regression vs. today**, but
> the fix only lands end-to-end after that coordinated bump. Sequence: publish
> `@cesteral/contract-schema@1.2.0` → bump the governance-layer dependency. This
> mirrors the `contract-hash` 1.1.0→1.1.1 sequencing already tracked in the
> consumer-side review.

### F4 — `schemaVersion` number→string coercion (low, documented inline)

`schemaVersion` is a `number` in annotations/`deriveContractId` but stored as a
string in the manifest (`String(...)` in `toManifestEntry`). Fine today; a
latent foot-gun for any future consumer that compares it numerically. Now called
out with an inline comment at the single coercion point.

### F5 — `executableArgsExclude` strict/loose asymmetry (low)

Required by the authoring type, `.optional()` in the validation schema (for
tolerance of annotations minted before the field existed). Since it gates the
`actionHash` binding, an omitted value silently means "exclude nothing but
`__`-prefixed args." Tolerated by design; already documented in `annotations.ts`.

### F6 — evaluation-engine fail-open for warning/advisory rules that throw (low)

In the governance repo: a non-error-severity rule that errors during evaluation
passes silently (documented inline). Correct as designed, but a
severity-misconfigured rule that should hard-block but is mistyped as `warning`
would silently pass. Worth an authoring-time lint. (Consumer-repo finding,
recorded here for completeness.)

## What changed in this repo

- `scripts/lib/manifest.mjs` — F3 semantic gate + F4 inline note.
- `scripts/lib/manifest.test.mjs` — realistic fixtures + gate tests.
- `packages/contract-schema/src/annotations.ts` — `create` exemption rule; `1.2.0`.
- `packages/contract-schema/tests/annotations.test.ts` — exemption coverage.
- `packages/amazon-dsp-mcp/.../create-entity.tool.ts`,
  `create-commitment.tool.ts` — declare `entityIdArgs: ["profileId"]`.
- `CLAUDE.md` — manifest-generation now documents the full-schema gate.

## Verification

- `pnpm --filter @cesteral/contract-schema test` — 27 passed.
- `pnpm exec vitest run --config vitest.config.scripts.ts scripts/lib/manifest.test.mjs` — 18 passed.
- `pnpm run generate:manifests` — full fleet green; all 13 governed packages
  emit manifests, including the 5 formerly-broken create tools.
- `pnpm exec turbo run typecheck --filter=@cesteral/contract-schema --filter=@cesteral/amazon-dsp-mcp` — clean.
</content>
