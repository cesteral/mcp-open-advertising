# Decision-Token Rollout & Secret Rotation Runbook

How the governance **decision token** is configured, rolled out (warn → enforce),
and rotated across the two repos. This is an operational runbook — the
verification mechanism itself is already wired and tested; nothing here requires
code changes.

## What the decision token is

A short-lived signed JWT (HS256) the **governance layer** (`cesteral-intelligence`,
the paid product) mints after a write clears admission + guardrails, and attaches
to the connector call as the `X-Cesteral-Decision-Token` header. The **MCP server**
(`mcp-open-advertising`, open source) verifies it before executing the write,
binding the call to the exact governance decision.

| Claim | Meaning |
| --- | --- |
| `sub` | Tenant (orgId or userId) |
| `contractId` | `<slug>.<tool>.v<n>` of the admitted write |
| `definitionHash` | SHA-256 of the tool definition (`@cesteral/contract-hash`) |
| `actionHash` | SHA-256 of the executable write args (`@cesteral/contract-hash`) |
| `approvalId` | Optional — set when the write passed an approval gate |
| `iat` / `exp` | Issued-at / expiry (default TTL 120s) |
| `jti` | Unique id; consumed exactly once (replay protection) |

Issuer `cesteral-intelligence`, audience `mcp-open-advertising`.

## Where each half is configured (the product boundary)

The two halves live in different repos **on purpose**:

| Concern | Lives in | Why |
| --- | --- | --- |
| **Mint** + hold/rotate the signing secret + per-org `AttestedWritePolicy` | `cesteral-intelligence` (paid) | Minting is a governance decision; the secret and per-tenant policy are product state. |
| **Verify** (`GOVERNANCE_TOKEN_MODE`) | `mcp-open-advertising` servers | Verification physically runs in the server process, so the mode is necessarily a server-side env. |

Key rule: **the server *code* default is `off`** (`resolveTokenMode` Tier-3
fallback, pinned by `config.test.ts`). An open-source / self-hosted server that
isn't part of a Cesteral deployment stays neutral — no token checks, no
`MISSING_TOKEN` noise. "Warn by default" is a property of the **Cesteral-operated
deployment**, expressed in this repo's terraform (`governance_token_mode = "warn"`),
not baked into the code.

Decision-token mode is **fleet-global** (one setting per deployment). Per-tenant
governance strictness is a separate axis handled by the governance layer's
per-org `AttestedWritePolicy` (the attestation admission gate) — do not conflate
the two.

## Enforcement modes

`GOVERNANCE_TOKEN_MODE` (and the per-server / per-contract overrides below) take
`off | warn | enforce`, resolved per-contract by `resolveTokenMode()`
(`packages/shared/src/governance/config.ts`):

- **`off`** — verification skipped. Server behaves exactly as if governance did
  not exist. The code default.
- **`warn`** — verify every binding and log the verdict
  (`logDecisionTokenVerdict`), but **never block**. Missing/invalid tokens surface
  as `warn` audit lines; the write still runs.
- **`enforce`** — reject any write whose token does not verify (HTTP 401,
  `JsonRpcErrorCode.Unauthorized`).

Effect-class writes are never token-governed (the control plane mints no token
for them); they are forced to `off` regardless of mode, with an audit line when a
non-`off` mode was configured.

Three-tier precedence lets a large rollout be staged without an all-or-nothing
flip:

```
per-contract list  >  per-server (GOVERNANCE_TOKEN_MODE_<SLUG>)  >  global (GOVERNANCE_TOKEN_MODE)  >  off
```

- `GOVERNANCE_TOKEN_MODE_<SLUG>` — e.g. `GOVERNANCE_TOKEN_MODE_META=enforce`.
- `GOVERNANCE_TOKEN_MODE_ENFORCE_CONTRACTS` / `_WARN_CONTRACTS` / `_OFF_CONTRACTS`
  — comma-separated `contractId` lists, highest precedence.

## Rollout sequence

1. **Land warn (this repo).** `governance_token_mode = "warn"` is the terraform
   default (`terraform/variables.tf`, threaded to every `mcp-service` module).
   The hosted fleet now verifies + logs without blocking. ✅ (code + IaC complete)
2. **Provision the shared secret** in both environments (see below). Until then,
   warn-mode verdicts read `SECRET_UNCONFIGURED` / `MISSING_TOKEN` — expected and
   non-blocking.
3. **Confirm end-to-end parity** — watch `decision_token_verification` audit
   logs: a governance-minted token should produce `ok: true` with
   `definitionHashVerified: true` for tools whose release manifest is installed.
   Investigate any `*_MISMATCH` (see Parity below).
4. **Stage enforce per-contract.** Add proven contracts to
   `GOVERNANCE_TOKEN_MODE_ENFORCE_CONTRACTS`, widen over time, then flip the
   per-server or global mode to `enforce`.

## Secret provisioning

The signing secret is shared: the governance layer signs with it, the servers
verify with it. It is **not** a platform credential — keep it in its own Secret
Manager entry.

- Server env vars (read by the verifier):
  - `GOVERNANCE_DECISION_TOKEN_SECRET` — current secret (required for warn/enforce
    to do anything; empty ⇒ `SECRET_UNCONFIGURED`, fail-closed under enforce).
  - `GOVERNANCE_DECISION_TOKEN_SECRET_PREVIOUS` — optional, accepted during
    rotation.
- Wire them via the existing per-service `secret_env_vars` map (no module change
  needed), sourcing from Secret Manager. Example (`*.tfvars`):

  ```hcl
  meta_secret_env_vars = {
    GOVERNANCE_DECISION_TOKEN_SECRET = { secret_name = "governance-decision-token-secret", version = "latest" }
    # ... existing Meta platform secrets ...
  }
  ```

- The governance layer reads the **same** value as `GOVERNANCE_DECISION_TOKEN_SECRET`
  (its mint side). Both must point at the same Secret Manager value.

## Secret rotation

Rotation is zero-downtime via the `current` / `previous` pair and an optional
`kid` token header. The verifier: with a `kid`, it tries **only** the matching
secret (`current` or `previous`, no fallback); without a `kid`, it tries
`current` then `previous`.

1. **Stage the new secret as current, old as previous.**
   - Servers: set `GOVERNANCE_DECISION_TOKEN_SECRET = <new>` and
     `GOVERNANCE_DECISION_TOKEN_SECRET_PREVIOUS = <old>`. Deploy.
   - Both old and new tokens now verify.
2. **Cut governance over to minting with the new secret.** If the mint side
   stamps `kid: "current"`, tokens are pinned to the new secret explicitly;
   un-`kid`'d tokens still work via the `current`-then-`previous` walk.
3. **Drain.** Wait past the token TTL (default 120s; use a comfortable margin,
   e.g. 15 min) so no in-flight token was signed with the old secret.
4. **Retire the old secret.** Remove `GOVERNANCE_DECISION_TOKEN_SECRET_PREVIOUS`
   from the servers and delete the old Secret Manager version.

Coordinate steps 1→2 so the mint side never signs with a secret the servers do
not yet hold. Always add the new secret to the servers (step 1) **before** the
governance layer starts signing with it (step 2).

## Cross-repo parity

For a minted token to verify, four things must match bit-for-bit across the
repos. Three are already guaranteed by shared code; the fourth is the token
contract:

- **`actionHash`** — both sides hash the canonical executable args with
  `@cesteral/contract-hash` (`hashActionInput` over `canonicalizeExecutableArgs`).
  Same package, same `__`-prefix + `executableArgsExclude` stripping ⇒ identical.
- **`definitionHash`** — both sides use `@cesteral/contract-hash`
  `computeDefinitionHash`; the server resolves the *expected* hash from the
  installed release manifest, whose shape is `@cesteral/contract-schema`'s
  `cesteralManifestSchema`. Bare lowercase hex, no prefix, on both sides.
- **`contractId`** — `@cesteral/contract-schema` `deriveContractId` is the single
  composer; the annotation's declared id is refined against it.
- **Token format** — claims, HS256, issuer `cesteral-intelligence`, audience
  `mcp-open-advertising`, default 120s TTL. Pinned by
  `packages/shared/tests/governance/decision-token.test.ts` against a reference
  mint.

A genuine end-to-end test (governance mint → connector verify in one process) is
inherently cross-repo and cannot live in either repo alone; the shared-hash +
token-format pins above are the contract that keeps the two sides identical.
Treat any steady-state `CONTRACT_MISMATCH` / `DEFINITION_HASH_MISMATCH` /
`ACTION_HASH_MISMATCH` verdict as a parity regression to investigate before
moving a contract to `enforce`.
