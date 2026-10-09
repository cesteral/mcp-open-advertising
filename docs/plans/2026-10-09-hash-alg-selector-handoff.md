# `hashAlg` selector: slice 1 and the handoff to `cesteral-intelligence`

**Date:** 2026-10-09
**Status:** Slice 1 implemented in this repo (verifier side, additive). Slice 2 (switching
the manifests) is gated on the governance-side work below.
**Origin:** [governance-protocol-adoptability-2026-10-09.md](../reviews/governance-protocol-adoptability-2026-10-09.md),
prerequisite 2.

## Why

`@cesteral/contract-hash`'s `stableStringify` sorts keys and then lets `JSON.stringify`
emit them. The JS engine puts integer-like keys first, so for `{"b":1,"10":2,"9":3}` it
emits `{"9":3,"10":2,"b":1}`; RFC 8785 (JCS) requires `{"10":2,"9":3,"b":1}`. Any
implementation that follows the RFC hashes such objects differently.

Measured on the fleet, 0 of 315 tool definitions contain such an object, so no current
`definitionHash` differs. `actionHash` hashes runtime arguments and can differ for a call
carrying a map keyed by numeric ids (for example bids by entity id). That cannot be
measured statically, which is why the verifier now reports `orderSensitiveArgs` on every
verdict.

## The rule

> **A token's `hashAlg` is inherited from the manifest entry it was minted against.**

- `hashAlg` is one of `cesteral-c14n-v1` (the original; **absent means this**) or
  `rfc8785`.
- A manifest entry may carry `hashAlg`: how its precomputed `definitionHash` was computed.
- A token may carry a signed `hashAlg` claim: how both of its hashes were computed.
- The verifier requires the two to be **equal** (absent = `cesteral-c14n-v1` on each side)
  before it compares `definitionHash`, and hashes the executable args under that one
  algorithm. It never tries both. It reads only the signed payload, never the JWT header.
- With no manifest entry, the token's claim alone selects the algorithm and the verdict
  stays `definitionHashVerified: false`, as today.

One claim covers all three hashes (the token's `definitionHash`, its `actionHash`, the
manifest's `definitionHash`). Two separate claims were rejected: they allow mixed
combinations, double the test matrix, and `actionHash` has no independent reason to use a
different algorithm from the release it targets.

## What shipped in this repo (slice 1)

| Package                           | Change                                                                                                                                                                                                                                                                                                                                                                        |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@cesteral/contract-hash` 2.1.0   | `HASH_ALGS`, `DEFAULT_HASH_ALG`, `isHashAlg`, `canonicalStringify(value, alg)`, `hasOrderSensitiveKeys`; `hashActionInput(value, alg?)` and `computeDefinitionHash(tool, alg?)` take an optional algorithm defaulting to `cesteral-c14n-v1`; `CROSS_REPO_HASH_ALG_VECTORS`. Legacy bytes and every existing golden unchanged.                                                 |
| `@cesteral/contract-schema` 2.2.0 | `HASH_ALGS`, `hashAlgSchema`; optional `hashAlg` on a manifest entry. `manifestVersion` stays `1`. **Also carries the unpublished 2.1.0 change** (the manifest `verification` block, #203): see the release note below.                                                                                                                                                       |
| `@cesteral/shared`                | `verifyDecisionToken` now takes `expected.executableArgs` (not a precomputed `actionHash`) and `expected.definitionHashAlg`; new verdicts `UNSUPPORTED_HASH_ALG`, `HASH_ALG_MISMATCH`; verdict and audit record carry `hashAlg` and `orderSensitiveArgs`. The resolver returns `{ definitionHash, hashAlg? }` (`createManifestEntryResolver`, option `resolveManifestEntry`). |

**Not done, deliberately:** the manifest generator still emits legacy entries with no
`hashAlg`, and nothing mints a `hashAlg` claim. Slice 1 changes no runtime behaviour on
the hosted fleet until governance stamps the claim.

The verifier's signature change is why `actionHash` cannot be precomputed by the caller:
the algorithm is named by the signed token, which is only trustworthy after the signature
check, so the caller cannot know it in advance.

## Release: tag `contract-v2.2.0`

The `contract-v*` lane publishes exactly two packages, in this order, each at the version
in its own `package.json` (the tag only selects the lane; it is not checked against either
version):

| Package                     | Publishes | On npm today                      |
| --------------------------- | --------- | --------------------------------- |
| `@cesteral/contract-hash`   | **2.1.0** | 1.0.0, 1.1.0, 1.1.1, 1.2.0, 2.0.0 |
| `@cesteral/contract-schema` | **2.2.0** | 1.0.0, 1.1.0, 1.2.0, 1.3.0, 2.0.0 |

The tag is named for the schema version because the two packages version independently.
In this lane an already-published version is a hard failure, so a release that would
silently republish nothing cannot look successful.

> **`@cesteral/contract-schema` 2.1.0 was never published.** `main` has carried 2.1.0 in
> `package.json` since #203 (the optional manifest `verification` block: `declared` /
> `fixture-verified` / `live-verified` / `disabled`, bound to the `definitionHash` it was
> verified against), but no release was cut, and npm still has 2.0.0 as the latest. So the
> 2.2.0 release delivers **two** changes to every consumer of `@cesteral/contract-schema`
> at once: `verification` (from the skipped 2.1.0) and `hashAlg`. Both are optional manifest
> fields that a consumer on an older schema strips without error, but a consumer upgrading
> from 2.0.0 sees both arrive together.

## Handoff: `cesteral-intelligence`

I could not see that repo; each item is stated as a requirement to confirm there.

1. **Pin the new libraries.** `@cesteral/contract-hash` 2.1.0 and `@cesteral/contract-schema`
   2.2.0, exact. The existing version-pin test will trip on the bump, which is the intended
   lockstep. **`contract-schema` 2.1.0 was never published** (npm has 1.0.0 to 1.3.0 and
   2.0.0), so 2.2.0 also delivers the optional manifest `verification` block from #203
   (`declared` / `fixture-verified` / `live-verified` / `disabled`, bound to the
   `definitionHash` it was verified against). It is additive and ignored by consumers that
   predate it, but it is a second change arriving in the same bump.
2. **Assert the new vectors.** `CROSS_REPO_HASH_ALG_VECTORS` from `contract-hash`: five
   inputs with the exact canonical bytes and sha256 under each algorithm, one where they
   agree and four where they differ. Expected values are literals, independent of the code.
3. **When matching an observed tool against a blessed manifest entry,** compute the
   observed `definitionHash` under **that entry's** `hashAlg` (absent = `cesteral-c14n-v1`).
4. **When minting,** set the token's `hashAlg` to the attested entry's `hashAlg` and compute
   `actionHash` under that same algorithm. Omit the claim when the entry has none: absent
   and an explicit `cesteral-c14n-v1` mean the same thing, and omitting keeps tokens
   readable by verifiers that predate the claim.
5. **Handle the two new reasons** wherever verdict reasons are enumerated.

### Ordering constraint

Item 3 and 4 must ship **before any server publishes an `rfc8785` manifest** (slice 2).
A governance build on an older `contract-schema` strips `hashAlg` from the manifest
(zod drops unknown keys), treats the entry as legacy, mints a legacy token, and the server
rejects it as `HASH_ALG_MISMATCH` under `enforce`. That fails closed, so it is safe, but
it is a total write outage for that server until governance upgrades.

The reverse direction is safe: a server on this slice verifying a legacy token against a
legacy manifest behaves exactly as before.

## Verdicts

| Reason                                                               | Meaning                                                                                                   | Action                                                                          |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `UNSUPPORTED_HASH_ALG`                                               | The signed `hashAlg` names an algorithm this server build does not know                                   | Upgrade the server, or stop the minter stamping it                              |
| `MALFORMED_TOKEN` (`detail: hashAlg`)                                | `hashAlg` is present but not a string (including `null`)                                                  | Minter bug                                                                      |
| `HASH_ALG_MISMATCH`                                                  | Token and manifest entry name different algorithms (each absent = `cesteral-c14n-v1`)                     | Minter must follow the manifest entry; check governance's `contract-schema` pin |
| `ACTION_HASH_MISMATCH` (`detail: arguments cannot be canonicalized`) | The args cannot be canonicalized under the named algorithm (for example a lone surrogate under `rfc8785`) | Expected for such args; the minter could not have hashed them either            |

An entry whose `hashAlg` this build does not recognise is left out of the resolver, so it
reads as unresolved: `definitionHashVerified: false` under `warn`, fail closed under
`enforce`.

## Slice 2 (this repo, after the above)

1. Look at `orderSensitiveArgs` in warn-mode audit logs on the hosted fleet. This is the
   measurement the static check could not make.
2. Switch `scripts/generate-manifests.mjs` to compute `definitionHash` under `rfc8785` and
   emit `hashAlg: "rfc8785"` on each entry. For all current definitions the hash value is
   unchanged; only the field is new.
3. Release. Servers on the new manifest then require `rfc8785` tokens, and governance
   (item 3/4 above) follows the manifest entry, so there is no flag day: each server moves
   when it ships.
4. Retiring `cesteral-c14n-v1` is a separate decision. Legacy manifests persist in
   already-published tarballs for as long as those versions are installed.

## Tests

- `packages/contract-hash/tests/hash-alg.test.ts`, `hash-alg-vectors.test.ts`: RFC 8785
  number samples and key-sort example, integer-key divergence, a seeded property test that
  the algorithms differ exactly where `hasOrderSensitiveKeys` says, fail-loud parity,
  lone surrogates.
- `packages/contract-schema/tests/manifest-and-dry-run.test.ts`: the manifest field.
- `packages/shared/tests/governance/decision-token.test.ts`: absent/explicit/unknown/
  malformed claim, exactly-one-algorithm, the manifest-entry relation, header ignored,
  unhashable args. `tool-handler-factory-governance.test.ts`: the same end to end under
  `enforce`. `hash-alg-names.test.ts`: the two packages' name lists stay equal.
