# Review: Governance protocol adoptability by other ad platforms (2026-10-09)

Scope: whether a platform outside Cesteral can adopt the governance protocol (the
`cesteral.*` annotation contract, the canonical hashes, the release attestation
manifest and the decision token) on its own, and what stands between the repo as
it is and that outcome. Reviewed at `7058ee57` (`main`). The admission side lives
in `cesteral-intelligence`, which was not available to this review.

## Verdict

**Ready for controlled integrations; not yet ready as an independently
implementable governance protocol.**

A controlled integration works today: a TypeScript connector contributed to this
monorepo, with Cesteral minting decision tokens under a shared secret. The
manifest schema pins `packageName` to `@cesteral/*-mcp`, and
[adding-a-new-server.md](../guides/adding-a-new-server.md) ends in a PR here.

What an outside team cannot do from the public materials is implement the
protocol independently and prove it is compatible. The contract exists only as
TypeScript source, the hash is specified only by one implementation, the
conformance checks run only against this monorepo, and the docs disagree with
the code.

## What already helps

- Apache-2.0. `@cesteral/contract-hash` has zero dependencies; `@cesteral/contract-schema`
  ships dual ESM/CJS and accepts zod 3 or 4.
- The contract libraries release on their own lane (`contract-v*` tags).
- Dry-run results tag where validation and expected state came from
  (`native_validator` / `native_simulator` vs `symbolic`), so a platform with a
  real validate-only endpoint has an upgrade path from symbolic checks.
- Every write tool on all 13 servers is governed and `ungoverned-writes-allowlist.json`
  is empty, so the protocol has been exercised at fleet scale.

## Prerequisites for independent adoption

These must exist before an outside team can build a compatible implementation and
prove it works.

### 1. A written wire contract with portable vectors

- No spec document and no JSON Schema. The golden vectors
  (`CROSS_REPO_DEFINITION_HASH_GOLDEN`, `CROSS_REPO_ANNOTATION_PARITY_GOLDEN`) are
  TypeScript constants.
- The governed response shape (`dryRun`, `before`, `after`, `dispatchedCapability`,
  `effect`) is defined only inside each tool's `outputSchema`
  (for example [create-entity.tool.ts](../../packages/pinterest-mcp/src/mcp-server/tools/definitions/create-entity.tool.ts)).
  `contract-schema` exports the pieces but not the envelope, and the `dry_run`
  input convention is not specified anywhere.
- Nothing on the wire carries a spec version. The contract-hash README coordinates
  `cesteral-mcp-servers` and `cesteral-intelligence` by exact-pinning one package
  version in both repos. That works for two repos under one owner and cannot work
  for N external implementations.

### 2. A normative canonicalization with an algorithm id

- [`stableStringify`](../../packages/contract-hash/src/index.ts) matched 10 of 10
  RFC 8785 (JCS) number samples that were checked against the RFC text. It diverges
  on **integer-like object keys**: it sorts the keys, but `JSON.stringify` then
  emits integer-like keys first in ascending numeric order. For
  `{"b":1,"10":2,"9":3,"a":4,"-1":5}` it emits `{"9":3,"10":2,"-1":5,"a":4,"b":1}`;
  RFC 8785 requires `{"-1":5,"10":2,"9":3,"a":4,"b":1}`.
- Any implementation that follows the RFC computes different `definitionHash` and
  `actionHash` values for such objects. Both Cesteral sides are JavaScript on one
  package today, so nothing mismatches now.
- **Measured on the fleet.** All 13 servers were booted and the shipped serializer
  was compared byte-for-byte against a plain RFC 8785 implementation over each
  tool's hashed fields (`name`, `description`, `inputSchema`, `outputSchema`,
  `annotations`) from the real `tools/list`. Of 315 tools (156 governed), none
  differ, and none contain a multi-key object with an integer-like key. No current
  definition hash changes in this measurement. Separately, neither verification
  ledger (`amazon-dsp-mcp`, `ttd-mcp`) contains fixture- or live-verified tools.
- **Not measured: `actionHash`.** It hashes runtime arguments, and a call with
  numeric-ID-keyed maps would hash differently under RFC 8785. That cannot be
  determined statically and is the real compatibility risk.
- **Migration, with an explicit selector (not trying both hashes):**
  1. Add an optional `hashAlg` to the signed token and to the manifest. Absent
     means the legacy algorithm (today's behaviour). The other value is an
     RFC 8785 identifier.
  2. A verifier uses exactly the algorithm the token names. It never tries both,
     and an unrecognised value fails closed. The claim sits inside the signed
     JWT, so it cannot be altered in transit; for manifests it rides inside the
     provenance-signed tarball.
  3. Ship `contract-hash` implementing both algorithms. Upgrade the servers so
     they understand both values, then switch the minter to stamp the RFC 8785
     identifier.
  4. Add integer-key golden vectors for both algorithms.
  5. Legacy tokens drain within the 120-second TTL. Legacy manifests in
     already-published tarballs persist as long as those versions are installed;
     that is harmless for `definitionHash` because no current definition's bytes
     differ. Retiring the legacy algorithm is a separate decision.
- Every `actionHash` and `definitionHash` then states how it was computed, which
  makes the transition auditable.

### 3. An independent conformance check

- [conformance/](../../conformance/expected-failures.yaml) and
  `scripts/conformance-test.sh` test MCP protocol conformance only.
- The governance ratchets (`contract-id-invariant`, `readpartner-argmap`,
  `effect-manifest-coverage`, `write-coverage`, `terminal-operations`,
  `untrusted-declarations`, `wire-request-coverage`, and others in
  `scripts/lib/`) boot `packages/<dir>/dist` through
  [boot-server.mjs](../../scripts/lib/boot-server.mjs), so they only run against
  this monorepo. The per-server `testkit/` exports serve the closed repo's
  preview tests.
- The admission rules and reason codes (`admitWriteTool`,
  `validateStructuredResponse`) live in `cesteral-intelligence`. An adopter
  learns it is non-conformant only by being rejected.
- Needed: a CLI that takes `--url` or `--stdio`, runs the annotation parse,
  `contractId` invariants, read-partner resolution, dry-run honesty, the response
  envelope, `tools/list` determinism and token test vectors, with its rules
  published.

### 4. Documentation an adopter can trust

The docs are currently the only prose spec, and they disagree with the code:

- [decision-token-rollout-and-rotation.md:63](../governance/decision-token-rollout-and-rotation.md)
  and [adding-a-new-server.md:935](../guides/adding-a-new-server.md) say effect-class
  writes are forced to token mode `off`. The factory has no effect-specific branch
  ("verify is writeClass-agnostic", `tool-handler-factory.ts`), and
  `tool-handler-factory-governance.test.ts` exercises effect-write token parity.
  Effect-class writes include the bulk deletes.
- The runbook, Step 9.5 and Appendix C say the code default is `off`.
  [config.ts:94](../../packages/shared/src/governance/config.ts) returns `warn`
  when `K_SERVICE` is set; `off` holds only off-hosted.
- [GOVERNANCE-OVERVIEW.md](../governance/GOVERNANCE-OVERVIEW.md) scopes itself to 7
  of the 13 servers.

## Design choices (settle against a named adopter model)

| Choice                                            | Today                                                                                                                                                                                                                                                                             | Required when                                                                                                                        |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Asymmetric tokens, JWKS, configurable `iss`/`aud` | HS256 with one shared secret; `iss`/`aud` fixed to `cesteral-intelligence` / `mcp-open-advertising` ([decision-token.ts:7](../../packages/shared/src/governance/decision-token.ts))                                                                                               | The platform verifies tokens from a control plane it does not operate, because holding the shared key means it could mint tokens too |
| Attestation for hosted servers                    | npm provenance; `packageName` regex `^@cesteral/[a-z0-9-]+-mcp$` ([manifest.ts:160](../../packages/contract-schema/src/manifest.ts)); `generate-manifests.mjs` reads only this repo's `packages/` and `registry.json`                                                             | Adopters ship remote servers or publish outside `@cesteral`                                                                          |
| Extensible enums                                  | 9 entity kinds and 19 operations, closed; an unknown value fails the annotation parse and drops the tool's governance metadata ([write-operation.ts](../../packages/contract-schema/src/write-operation.ts), [entity-kind.ts](../../packages/contract-schema/src/entity-kind.ts)) | An adopter's entities or operations do not fit the set                                                                               |
| Standalone verifier                               | Inside `@cesteral/shared` (OTel, Hono, pino, Google exporters); verification is inline in the 1,361-line tool-handler factory; the `X-Cesteral-Decision-Token` header is plumbed in per-server transports                                                                         | Non-TS adopters, or TS adopters avoiding that dependency tree                                                                        |
| Replay-store backends                             | `JtiStore` interface is clean, but the only distributed implementation is Firestore                                                                                                                                                                                               | Hosted deploys outside GCP                                                                                                           |
| Neutral naming                                    | `cesteral` annotation key, `X-Cesteral-Decision-Token`, `cesteral-manifest.json`, fixed `iss`/`aud`                                                                                                                                                                               | The protocol is positioned as vendor-neutral                                                                                         |
| Onboarding outside the monorepo                   | 1,869-line in-repo guide; governance is Step 9.5                                                                                                                                                                                                                                  | Adopters keep their code in their own repos                                                                                          |

Per-platform glue is real work whichever model is chosen: pinterest's dry-run plus
snapshot capture is about 500 lines (`dry-run.ts` 295, `capture-snapshot.ts` 200).

## Decisions that belong to the owner

- **Adopter model.** For example: a platform verifying Cesteral-minted tokens, an
  alternative control plane consuming the contract, or a third party adding a
  connector here. The choice decides which design-choice rows become required.
- **Open versus commercial boundary.** The docs place minting in the paid product.
  Can a third party run a compatible minter?

## Suggested order

1. Correct the documentation (prerequisite 4).
2. Pick the adopter model.
3. Prerequisites 1, 2 and 3, in that order.
4. Then whichever design-choice rows the chosen model requires.

## Method and limits

- **Read:** `contract-schema`, `contract-hash`, `shared/src/governance/*`, the
  tool-handler factory's governance path, `generate-manifests.mjs` and
  `scripts/lib/manifest.mjs`, `registry.json`, the governance docs and runbook,
  `adding-a-new-server.md` Step 9.5 and Appendix C, the signed-manifest design,
  the conformance and ratchet scripts.
- **Run:** `contract-hash` built locally, `stableStringify` checked against RFC 8785
  Appendix B number samples (10 of 10) and the Section 3.2.3 key-sort example
  (diverges on the integer-like key, as described above); the full fleet built
  and all 315 tool definitions compared as described in prerequisite 2. Expected
  values were taken from the RFC text, not from memory: an earlier draft of the
  check used mistyped vectors and reported false failures.
- **Not done:** `actionHash` exposure to integer-like keys is unmeasured; the
  `cesteral-intelligence` repo was not reviewed, so admission rules and mint-side
  behaviour are as documented, not as verified; the test suites were not run;
  nothing here was exercised against a live platform account.
