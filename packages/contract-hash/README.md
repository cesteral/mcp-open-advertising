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

## Hash algorithms

There are two canonicalizations, selected by name. A decision token carries a signed
`hashAlg` claim and a manifest entry may carry one; an absent value means
`cesteral-c14n-v1`.

| Name               | What it is                                                                                                                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `cesteral-c14n-v1` | The original (`stableStringify`). Sorts keys, then lets `JSON.stringify` emit them, so the JS engine puts integer-like keys first. **Frozen**: every hash minted before the field existed. |
| `rfc8785`          | RFC 8785 (JCS): properties in UTF-16 code-unit order. Reproducible in any language from the RFC.                                                                                           |

```ts
import {
  hashActionInput,
  computeDefinitionHash,
  canonicalStringify,
} from "@cesteral/contract-hash";

hashActionInput(args); // cesteral-c14n-v1, as before
hashActionInput(args, "rfc8785"); // RFC 8785
computeDefinitionHash(tool, "rfc8785");
canonicalStringify(value, "rfc8785"); // the canonical text itself
```

The two agree on every value that has no _order-sensitive_ object; `hasOrderSensitiveKeys(value)`
says whether a value has one. `CROSS_REPO_HASH_ALG_VECTORS` gives, for five inputs, the exact
canonical bytes and sha256 under each algorithm as literals, so another implementation can check
itself without trusting this one. An unknown algorithm name throws.

`rfc8785` rejects what RFC 8785 forbids and the original tolerates: lone surrogates (invalid I-JSON).

## Version coordination (cross-repo parity)

Parity is now single-sourced: both repos consume `computeDefinitionHash` and the
`CROSS_REPO_DEFINITION_HASH_GOLDEN` vector from this one published package, so
there is no hand-copied fixture to drift. The residual failure mode is a
**version skew** — the two repos resolving _different_ releases of this package.
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
