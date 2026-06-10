# Follow-up: simplify provenance publishing now that pnpm supports it

**Status:** implemented (2026-06-10) — `scripts/publish-all.sh` now publishes each
package with a single `pnpm publish --access public --no-git-checks [--provenance]`;
the pack-and-inspect preflight gate is retained as an independent validation step.
**Date:** 2026-06-10

## Context

The repo was on `pnpm@8.15.0`, which has **no `--provenance` support**. To get npm
build-provenance attestations onto published packages, `scripts/publish-all.sh`
uses a two-step workaround:

1. `pnpm pack` — packs each package into a tarball, rewriting `workspace:*`
   ranges to resolved versions inside the tarball (a plain `npm publish` of a
   source dir would ship the literal `workspace:*` string and break consumers).
2. `npm publish <tarball> --provenance` — npm uploads the tarball and attaches
   the provenance attestation.

This split is documented in three places, all citing the same root cause:

- `scripts/publish-all.sh` (the `# pnpm 8.15 has no provenance support` comments)
- `docs/guides/publishing.md` (the "Publisher" section)
- `docs/plans/2026-05-20-signed-manifest-upstream-plan.md` (§ on provenance)

## What changed

The pnpm 10 migration (commit `chore(deps): migrate pnpm 8.15.0 -> 10.34.1`)
moves the repo to `pnpm@10.34.1`. **pnpm gained native `pnpm publish --provenance`
in 9.x**, so the entire `pnpm pack` → `npm publish <tarball>` dance is no longer
required: `pnpm publish` already rewrites `workspace:*` on publish AND can sign
the provenance attestation itself.

## Proposed follow-up (separate PR)

Collapse the two-step publish to a single `pnpm publish --provenance --no-git-checks`
(flags TBD) per package:

- Rewrite `scripts/publish-all.sh` to drop the `pnpm pack` + tarball-path
  plumbing and the npm fallback.
- Update `docs/guides/publishing.md` and the §provenance note in
  `docs/plans/2026-05-20-signed-manifest-upstream-plan.md` to describe the
  single-command flow.
- Verify in CI (`release.yml`) that the published tarball still:
  - rewrites `workspace:*` to resolved versions,
  - carries a valid provenance attestation,
  - keeps the signed `cesteral-manifest.json` bit-identical so the downstream
    `cesteral-intelligence` governance repo still promotes tools to `attested`.

**Why a separate PR:** this touches the signed-manifest release path and must be
validated against a real (or dry-run) publish. Keeping it out of the tooling-bump
PR keeps that PR's blast radius reviewable and the release-path change isolated
for careful verification.
