# {{package}}

<!-- {{^writes}} -->
MCP server for {{displayName}} reporting. **Experimental and read-only**: scaffolded by `pnpm new:server --type reporting`. CI builds and tests it, but it is not published or deployed until `pnpm promote:server {{key}}`.
<!-- {{/writes}} -->
<!-- {{#writes}} -->
MCP server for {{displayName}} reporting. **Experimental**: scaffolded by `pnpm new:server --type reporting`, and its `submit_report` is not implemented yet. It is not published or deployed until `pnpm promote:server {{key}}`.
<!-- {{/writes}} -->

API documentation: {{docsUrl}}

## Tools

| Tool                          | What it does                                            |
| ----------------------------- | ------------------------------------------------------- |
| `{{key}}_list_accounts`       | List the accounts the token can access                  |
| `{{key}}_get_report`          | Report rows for an account and date range, synchronously |
| `{{key}}_get_pacing_status`   | Compute pacing from budget, flight and spend            |
| `{{key}}_search_tools`        | Find a tool on this server                              |
<!-- {{#writes}} -->
| `{{key}}_submit_report`       | Governed stub: returns an error until implemented       |
| `{{key}}_check_report_status` | Status of an async report job                           |
| `{{key}}_download_report`     | A finished report job's rows, as a bounded view         |
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
The scaffold passes CI except for the wire-request coverage of `{{key}}_submit_report`. Before it merges:

- [ ] Implement `{{key}}_submit_report`, with a symbolic dry-run and a wire-request test in `tests/` that calls `submitReportLogic` with only `fetch` stubbed and cites the vendor source in a `// basis:` comment.
- [ ] Replace the status path and its mapping in `src/services/{{key}}/{{key}}-reporting-service.ts`, and add the platform's report file host to `downloadHosts` if it is not the API host.
<!-- {{/writes}} -->

- [ ] Replace the placeholder paths in `src/services/{{key}}/{{key}}-service.ts` (accounts and `get_report`) with the vendor's endpoints.
- [ ] Point `validate()` in `src/auth/{{key}}-auth-adapter.ts` at a cheap authenticated endpoint, so a bad token fails at session start, and check there that the token may use the `X-{{Pascal}}-Account-Id` account. Return the platform's user id from `{{key}}QuotaUser`, so rate-limit buckets follow the user rather than a token hash.
- [ ] Verify the two entries for `{{package}}` in `platform-facts.json` (API base and rate limit) against the vendor docs.
- [ ] Update the fleet count in the root `README.md`.

## Before it can be promoted

`pnpm promote:server {{key}}` makes the server stable (published and deployed). A reporting server has no write requirement, so it can be promoted read-only. For async reports, `pnpm new:server {{key}} --add-write-stubs` adds the governed `submit_report` stub and the status and download tools, and sets `"governed": true`.

## After promotion, before it deploys

- [ ] Drop the "experimental" wording that promotion leaves behind: the `description` in `src/mcp-server/server.ts` (clients see it in serverInfo), the opening of this README, `CLAUDE.md`, the `package.json` description and the server's `description` in `registry.json`. `promote:server` prints each line; it does not edit them.
- [ ] Add the platform's credential secrets to the server's `mcp_secret_env_vars` entry in `terraform/variables.tf` (promotion creates it with only `MCP_AUTH_SECRET_KEY`), once they exist in Secret Manager. Do not add the entry before promotion: `promote:server` refuses while a deploy list already names the server.
