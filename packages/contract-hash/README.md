# @cesteral/contract-hash

The canonical tool-definition hash for the Cesteral MCP ecosystem.

`computeDefinitionHash(tool)` returns a SHA-256 (lowercase hex, no prefix)
over the sorted-key JSON projection of an MCP tool's governance-relevant
fields: `name`, `description`, `inputSchema`, `outputSchema`, `annotations`.

Both `cesteral-mcp-servers` (per-release attestation manifest generation)
and `cesteral-intelligence` governance import this function. The two MUST
produce bit-identical output — the golden-vector tests are the contract.

```ts
import { computeDefinitionHash } from "@cesteral/contract-hash";

const hash = computeDefinitionHash({ name: "meta_update_entity", inputSchema, annotations });
```

## Version coordination (cross-repo parity)

Parity is now single-sourced: both repos consume `computeDefinitionHash` and the
`CROSS_REPO_DEFINITION_HASH_GOLDEN` vector from this one published package, so
there is no hand-copied fixture to drift. The residual failure mode is a
**version skew** — the two repos resolving *different* releases of this package.
Each repo's golden test only proves its installed package is internally
consistent, so a one-sided bump to a release that changed the canonicalization
would pass on both sides while the repos silently computed different hashes,
halting every tool's promotion to `attested`.

To prevent that:

- Both repos pin `@cesteral/contract-hash` to an **exact** version (no `^`/`~`).
  `cesteral-intelligence` enforces this with a version-pin test
  (`contract-hash-version-pin.test.ts`) that fails if the declared or installed
  version drifts from its parity-validated constant.
- **Any change to the canonical byte output is a breaking change.** Bump this
  package's version, update `src/cross-repo-golden.ts` (`expectedDefinitionHash`)
  in the same release — the producer self-test
  (`tests/cross-repo-definition-hash.test.ts`) enforces that pairing — then
  upgrade both repos in lockstep and update the consumer's pinned constant.

A canonicalization change therefore cannot silently reach `attested` admission:
the consumer's pin test trips on the version bump, and its golden test then
forces a re-validation against the package's re-pinned golden.
