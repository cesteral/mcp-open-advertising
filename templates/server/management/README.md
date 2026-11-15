# {{package}}

MCP server for {{displayName}} campaign management. **Experimental**: scaffolded by `pnpm new:server`, and its write tools are not implemented yet.

API documentation: {{docsUrl}}

## Tools

| Tool                         | What it does                                       |
| ---------------------------- | -------------------------------------------------- |
| `{{key}}_list_accounts`      | List the accounts the token can access             |
| `{{key}}_list_entities`      | List entities of one type in an account            |
| `{{key}}_get_entity`         | Read one entity                                    |
| `{{key}}_validate_entity`    | Check a payload client-side, without an API call   |
| `{{key}}_get_pacing_status`  | Compute pacing from budget, flight and spend       |
| `{{key}}_search_tools`       | Find a tool on this server                         |
| `{{key}}_create_entity`      | Governed stub: returns an error until implemented  |
| `{{key}}_update_entity`      | Governed stub: returns an error until implemented  |
| `{{key}}_delete_entity`      | Governed stub: returns an error until implemented  |
| `{{key}}_bulk_update_status` | Governed stub: returns an error until implemented  |

## Running it

```bash
cd packages/{{package}} && pnpm run dev:http
```

HTTP mode (`MCP_AUTH_MODE={{key}}-bearer`, the default) reads the access token from `Authorization: Bearer <token>` and the account from `X-{{Pascal}}-Account-Id`. Stdio mode reads `{{ENV}}_ACCESS_TOKEN` and `{{ENV}}_ACCOUNT_ID`. The server listens on port {{port}} (`{{ENV}}_MCP_PORT`).

## Before this server can merge

The scaffold passes CI except for the wire-request coverage of the four write stubs. Work through this list; CI enforces the first item.

- [ ] Implement `{{key}}_create_entity`, `{{key}}_update_entity`, `{{key}}_delete_entity` and `{{key}}_bulk_update_status`, each with a dry-run and a wire-request test in `tests/` that calls its `*Logic` with only `fetch` stubbed and cites the vendor source in a `// basis:` comment.
- [ ] Replace the placeholder paths in `src/mcp-server/tools/utils/entity-mapping.ts` and `src/services/{{key}}/{{key}}-service.ts` with the vendor's endpoints.
- [ ] Point `validate()` in `src/auth/{{key}}-auth-adapter.ts` at a cheap authenticated endpoint, so a bad token fails at session start, and check there that the token may use the `X-{{Pascal}}-Account-Id` account. Return the platform's user id from `{{key}}QuotaUser`, so rate-limit buckets follow the user rather than a token hash.
- [ ] Verify the two entries for `{{package}}` in `platform-facts.json` (API base and rate limit) against the vendor docs.
- [ ] Declare the untrusted paths of each write tool once it returns platform text (`untrustedContent`).
- [ ] Check `operational.terminalOperations` in `registry.json`: whether a delete can be undone, and any irreversible status.
- [ ] Add the platform's credential secrets to `mcp_secret_env_vars` in `terraform/variables.tf` (only `MCP_AUTH_SECRET_KEY` is there now).
- [ ] Replace the scaffold's `contract.exceptions` reasons in `registry.json` with real ones, or ship the tools.
- [ ] Update the fleet count in the root `README.md` ("Thirteen servers").
