# Authorization models

Every tool and resource in this repository operates under exactly one authorization model. This document defines them, and `scripts/check-authorization-model.mjs` enforces that each one says which it is.

The rule this exists to prevent: **absence of a match must never be indistinguishable from authorisation.** Both scope checks in this codebase are opt-in and key-driven, so a tool that names its scope parameter something unexpected — or takes no parameter at all — silently skips the check and executes. That is security review finding **C-2**, and it is a fail-open by omission rather than by decision.

## The two independent scope checks

They are complementary and neither substitutes for the other.

|                 | JWT advertiser scope                                                                                        | Session-bound account scope                                        |
| --------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Question        | May this caller touch this advertiser **at all**?                                                           | Is the caller naming the account the session is actually bound to? |
| Enforced by     | `SCOPED_ID_KEYS` in `packages/shared/src/utils/tool-handler-factory.ts`                                     | `assertAccountScope()` in each tool handler                        |
| Source of truth | `allowed_advertisers` claim on the JWT                                                                      | The account id baked into the session's resolved services          |
| Active when     | `jwt` auth mode only — `bearer-auth-strategy-base.ts` sets `allowedAdvertisers` to `undefined` deliberately | Any mode, wherever a handler resolves session services             |
| Fails open when | the input key is not in `SCOPED_ID_KEYS`                                                                    | the handler forgets to call `assertAccountScope`                   |

## The four models

Declare exactly one per file, as a comment containing:

```
authorization-model: <model>
```

### `jwt-advertiser-scoped`

The tool takes an identifier in the **same id-space as `allowed_advertisers`**, and that key is listed in `SCOPED_ID_KEYS` / `SCOPED_ID_ARRAY_KEYS`.

Currently: `advertiserId`, `customerId`, `partnerId`, `adAccountId`, `adAccountUrn`, `accountId` (and the `…Ids` array forms).

Membership is a claim about **id-space, not naming**. `accountId` qualifies because in Microsoft Advertising the account _is_ the advertiser-equivalent.

### `session-bound`

The tool resolves session services and executes against the account baked into them. It takes a caller-supplied account/profile parameter that is **not** sent upstream, so it MUST call `assertAccountScope(input.x, boundX, "x")` on the real-execution path.

This is where Amazon DSP's `profileId` lives. `profileId` becomes the `Amazon-Advertising-API-Scope` header — a **credential** scope, a different id-space from the JWT advertiser scope. It is deliberately **not** in `SCOPED_ID_KEYS`: checking a profile id against a list of advertiser ids would deny every Amazon call in `jwt` mode, converting a fail-open into a fail-closed outage. Amazon tools carry `advertiserId` separately for the JWT check.

> **Why this model is the easiest to get wrong.** The existing audit's discriminator is the presence of a `bound<Account>Id` **local variable**. A handler that uses the session-bound account _through the resolved service_ without destructuring that local reads as "input-scoped" and is skipped. `amazon_dsp_create_commitment` and `amazon_dsp_update_commitment` were false-green exactly this way: `input.profileId` was required by the schema, never sent to Amazon, and used only to label the snapshot — so naming profile B while bound to profile A wrote to A **and returned a snapshot labelled B**, misattributing the write in the audit trail.

### `unscoped-local`

The tool performs no upstream call and resolves no session services — pure local computation (schema validation, formatting, contract lookups). There is no account to scope against because nothing executes.

Any account-shaped parameter is descriptive input only.

### `exempt`

A deliberate exception that fits none of the above. Requires, on the same line or immediately following:

- the exact tool name,
- the exact field,
- a rationale.

An exemption without all three is a guard failure. `exempt` is for cases that are genuinely correct, not for cases that are merely unfixed — the latter belong in the baseline (below).

## Zero-argument tools and resources

**These must be classified too.** A tool with no scoped input yields no identifiers, so the deny-loop never runs; a resource read is not routed through the tool handler's scope check at all. Both are fail-open by construction rather than by omission, which is precisely the shape C-2 describes. Leaving them out of the guard would preserve the original defect while appearing to close it.

A zero-argument tool that reads session-bound data is `session-bound`, and needs to justify how it is scoped. One that reads nothing tenant-specific is `unscoped-local`.

## The baseline

`scripts/authorization-model-baseline.json` lists files that predate this guard and are not yet classified. The guard **skips** them, so it can land without a 300-file sweep — but the baseline is **shrink-only**: adding an entry fails the guard.

That keeps the regression path fail-loud (a new or newly-touched file must classify itself) while classification of the existing surface proceeds incrementally. C-2 stays open until the baseline is empty.

## Adding a tool

1. Decide the model from the table above.
2. Add `authorization-model: <model>` to the file header comment.
3. If `session-bound`, call `assertAccountScope` on the real-execution path (dry-run may differ — see `update-entity.tool.ts`).
4. If `jwt-advertiser-scoped`, confirm the key is in `SCOPED_ID_KEYS`; if it is a new key, confirm it is genuinely in the `allowed_advertisers` id-space before adding it.
5. Run `pnpm check:authorization-model`.
