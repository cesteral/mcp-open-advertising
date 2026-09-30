# 2026-09 fleet review

In September 2026, every MCP server was reviewed for consistency and for accuracy against the vendor's current API. There is one report per server, with ttd-mcp split into REST and GraphQL, plus a cross-fleet report and three quota sweeps. The findings drove #225. Whatever that PR did not fix is tracked in **#237**.

- **Reviewed commit:** `main` at `c969112`. Every `file:line` pointer refers to that commit, not to current `main`.
- **Status:** the reports predate the fixes. They are kept as written, as the evidence behind each change. To see whether a finding still applies, check #225's commit table and the issues below.

## Evidence basis

Every vendor documentation site was blocked by this environment's egress proxy. Reviewers used the vendor sources they could reach, and each finding says which kind of evidence it rests on:

| Label                         | Meaning                                                                                                                                                                                           |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| live-doc / live vendor source | A machine-readable vendor source read directly: Google `$discovery`, Pinterest OpenAPI, the `MicrosoftDocs/Advertising` repo, `amzn/ads-advanced-tools-docs`, or TTD's and TikTok's official SDKs |
| executed / live (local)       | Reproduced by running the built server or the code in question                                                                                                                                    |
| code-only                     | Follows from the repo's own code or text                                                                                                                                                          |
| search snippet                | Search-engine summaries of vendor pages. Corroboration only.                                                                                                                                      |
| model-knowledge               | Unverified. Needs a primary source before anyone acts on it.                                                                                                                                      |

Some reports mention `scratchpad/...` paths. Those were temporary clones of vendor repos made for the review and were not kept. The repo and commit named next to each one identify the source.

Nothing in these reports was exercised against a live ad account.

## Files

| File                                                                                                                                     | Scope                                                                                                                                                                        |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`_SUMMARY.md`](_SUMMARY.md)                                                                                                             | Consolidated P0/P1 list and fleet-wide patterns                                                                                                                              |
| [`_cross-fleet.md`](_cross-fleet.md)                                                                                                     | Consistency across all 13 servers, from the wire `tools/list`, prompts and resources                                                                                         |
| [`_quotas-google.md`](_quotas-google.md), [`_quotas-programmatic.md`](_quotas-programmatic.md), [`_quotas-social.md`](_quotas-social.md) | Rate-limit quota sweep. No primary quota figure was found, which is why every `<platform>.rate_limit_default` fact is `unverified`                                           |
| `<server>-mcp.md`                                                                                                                        | Per-server review: `amazon-dsp`, `cm360`, `dbm`, `dv360`, `gads`, `linkedin`, `meta`, `msads`, `pinterest`, `sa360`, `snapchat`, `tiktok`, `ttd-mcp-rest`, `ttd-mcp-graphql` |

## Follow-up issues

| Issue | Topic                                                                                        |
| ----- | -------------------------------------------------------------------------------------------- |
| #228  | `msads_get_entity` / `msads_update_entity` publish empty input schemas                       |
| #229  | Meta v25 → v26; the v26 changes reportedly apply to all versions from 2026-10-27             |
| #230  | Version currency: gads v23 → v25, LinkedIn 202609, dbm unlisted v3                           |
| #231  | TTD GraphQL bulk mutations: unverified variable shape, never live-tested                     |
| #232  | TikTok async report download                                                                 |
| #233  | Snapchat `report_dimension`, account-timezone day bounds, stale objective/placement guidance |
| #234  | Amazon DSP entity management → Unified Ads API                                               |
| #235  | gads contract namespace, prompts naming nonexistent tools, cross-server consistency          |
| #236  | Tests asserting against self-authored mocks                                                  |
| #210  | LinkedIn `/v2/` → `/rest/` (existing issue)                                                  |
| #237  | Triage of everything else in these reports                                                   |
