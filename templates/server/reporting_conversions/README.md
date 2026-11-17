# {{package}}

<!-- {{^writes}} -->
MCP server for {{displayName}} reporting and offline conversions. **Experimental and read-only**: scaffolded by `pnpm new:server --type reporting_conversions`. CI builds and tests it, but it is not published or deployed until `pnpm promote:server {{key}}`.
<!-- {{/writes}} -->
<!-- {{#writes}} -->
MCP server for {{displayName}} reporting and offline conversions. **Experimental**: scaffolded by `pnpm new:server --type reporting_conversions`, and its `submit_report` and `insert_conversions` are not implemented yet. It is not published or deployed until `pnpm promote:server {{key}}`.
<!-- {{/writes}} -->

API documentation: {{docsUrl}}

## Tools

| Tool                          | What it does                                            |
| ----------------------------- | ------------------------------------------------------- |
| `{{key}}_list_accounts`       | List the accounts the token can access                  |
| `{{key}}_list_entities`       | List entities of one type in an account                 |
| `{{key}}_get_entity`          | Read one entity                                         |
| `{{key}}_validate_entity`     | Check a payload client-side, without an API call        |
| `{{key}}_get_report`          | Report rows for an account and date range, synchronously |
| `{{key}}_get_pacing_status`   | Compute pacing from budget, flight and spend            |
| `{{key}}_search_tools`        | Find a tool on this server                              |
<!-- {{#writes}} -->
| `{{key}}_submit_report`       | Governed stub: returns an error until implemented       |
| `{{key}}_check_report_status` | Status of an async report job                           |
| `{{key}}_download_report`     | A finished report job's rows, as a bounded view         |
| `{{key}}_insert_conversions`  | Governed stub: returns an error until implemented       |
<!-- {{/writes}} -->

## Running it

```bash
cd packages/{{package}} && pnpm run dev:http
```

HTTP mode (`MCP_AUTH_MODE={{key}}-bearer`, the default) reads the access token from `Authorization: Bearer <token>` and the account from `X-{{Pascal}}-Account-Id`. Stdio mode reads `{{ENV}}_ACCESS_TOKEN` and `{{ENV}}_ACCOUNT_ID`. The server listens on port {{port}} (`{{ENV}}_MCP_PORT`).

## Before this server can merge

<!-- {{^writes}} -->
A fresh read-only scaffold passes CI. Before it merges:
<!-- {{/writes}} -->
<!-- {{#writes}} -->
The scaffold passes CI except for the wire-request coverage of `{{key}}_submit_report` and `{{key}}_insert_conversions`. Before it merges:

- [ ] Implement `{{key}}_submit_report` and `{{key}}_insert_conversions`, each with a symbolic dry-run and a wire-request test in `tests/` that calls its `*Logic` with only `fetch` stubbed and cites the vendor source in a `// basis:` comment.
- [ ] Replace the status path and its mapping in `src/services/{{key}}/{{key}}-reporting-service.ts`, and add the platform's report file host to `downloadHosts` if it is not the API host.
<!-- {{/writes}} -->

- [ ] Replace the placeholder paths in `src/services/{{key}}/{{key}}-service.ts` (accounts and `get_report`), `src/services/{{key}}/{{key}}-entity-service.ts` and `src/mcp-server/tools/utils/entity-mapping.ts` with the vendor's endpoints.
- [ ] Point `validate()` in `src/auth/{{key}}-auth-adapter.ts` at a cheap authenticated endpoint, so a bad token fails at session start, and check there that the token may use the `X-{{Pascal}}-Account-Id` account. Return the platform's user id from `{{key}}QuotaUser`, so rate-limit buckets follow the user rather than a token hash.
- [ ] Verify the two entries for `{{package}}` in `platform-facts.json` (API base and rate limit) against the vendor docs.
- [ ] Update the fleet count in the root `README.md`.

## Before it can be promoted

`pnpm promote:server {{key}}` makes the server stable (published and deployed). It refuses until the server uploads conversions (`{{key}}_insert_conversions`, the type's conversion-upload MUST): `pnpm new:server {{key}} --add-write-stubs` adds it and the async report trio, and sets `"governed": true`. Promotion proves the contract is complete, not that the writes work: CI's wire-request coverage still blocks the merge until each write has a wire test.

- [ ] Replace the scaffold's `contract.exceptions` reasons in `registry.json` with real ones, or ship the tools.

## After promotion, before it deploys

- [ ] Add the platform's credential secrets to the server's `mcp_secret_env_vars` entry in `terraform/variables.tf` (promotion creates it with only `MCP_AUTH_SECRET_KEY`), once they exist in Secret Manager. Do not add the entry before promotion: `promote:server` refuses while a deploy list already names the server.
