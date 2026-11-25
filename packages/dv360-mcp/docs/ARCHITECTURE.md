# dv360-mcp Architecture

How `dv360-mcp` is put together and why. For the repo-wide server pattern (tool definition files, session services, auth modes) see [CLAUDE.md](../../../CLAUDE.md); this page covers only what is specific to DV360. For the current tool list, read `src/mcp-server/tools/definitions/` or the fleet table in the root [README](../../../README.md).

## Layout

```text
src/
├── index.ts                      # entry point; stdio credentials from env, or HTTP transport
├── config/                       # env parsing (MCP_AUTH_MODE: google-headers | jwt | none)
├── generated/schemas/            # types.ts + zod.ts generated from Google's Discovery document (committed)
├── mcp-server/
│   ├── server.ts
│   ├── transports/               # streamable-http-transport.ts
│   ├── tools/definitions/        # one *.tool.ts per tool; index.ts exports allTools
│   ├── tools/utils/              # entity mapping, schema introspection, simplified schemas, dry-run
│   ├── resources/definitions/    # entity-schema/-fields/-examples, targeting-schema/-types
│   └── prompts/definitions/      # workflow prompts
├── services/
│   ├── session-services.ts       # per-session DV360 service + HTTP client
│   ├── dv360/                    # DV360Service, DV360HttpClient, response parsing, rate-limit keys
│   ├── domain/                   # facade over the entity-mapping metadata
│   └── targeting/                # assigned-targeting service
├── testkit/                      # fixtures
└── utils/platform.ts             # shared rate limiter
scripts/                          # schema generation (generate-schemas.ts + lib/)
config/schema-extraction.config.ts
```

## Request flow

1. The client connects over streamable HTTP (or stdio). In HTTP mode the `google-headers` auth strategy builds a Google auth adapter from the request's credentials; `jwt` and `none` are the other modes.
2. On a new session, `createSessionServices()` builds a `DV360HttpClient` around that adapter and a `DV360Service` on top of it. Tools reach them through `resolveSessionServices()`.
3. Tools call `DV360Service` (entity CRUD, duplication, custom bidding, targeting), which goes through `DV360HttpClient` to `displayvideo.googleapis.com`. Reporting is not here; it lives in `dbm-mcp`.

## Generic entity tools and the dynamic schema

DV360 has dozens of entity types. Rather than one tool per type, the entity tools (`dv360_create_entity`, `dv360_get_entity`, `dv360_update_entity`, …) take an `entityType`.

The full discriminated union of every entity schema is over 1 MB, which breaks stdio transport (EPIPE). So the tools register a **simplified** input schema, and the detail is served on demand as MCP resources:

| Resource URI                         | Contents                                          |
| ------------------------------------ | ------------------------------------------------- |
| `entity-schema://{entityType}`       | Full JSON schema for the entity                   |
| `entity-fields://{entityType}`       | Required and optional fields                      |
| `entity-examples://{entityType}`     | Curated payloads with correct `updateMask` values |
| `targeting-schema://{targetingType}` | Schema for an assigned-targeting type             |
| `targeting-types://`                 | The supported targeting types                     |

Entity types are declared in `STATIC_ENTITY_API_METADATA` in `src/mcp-server/tools/utils/entity-mapping-dynamic.ts`: API path, the parent IDs the path needs, which IDs are query parameters, and parent-child relationships. Adding an entity type is one entry there; the schema, field and example resources follow from it.

## Generated schemas

`src/generated/schemas/{types,zod}.ts` come from Google's DV360 v4 Discovery document. Only the schemas the entity types need are extracted, which cuts the document from roughly 930 KB to roughly 190 KB. Both generated files are committed.

- Regenerate: `pnpm run generate:schemas` in this package. Configuration is `config/schema-extraction.config.ts`; the design is in [openapi-schema-extraction-spec.md](./openapi-schema-extraction-spec.md).
- Generation fetches the live Discovery document, so it is not part of `build`. The scheduled **Codegen drift** workflow (`.github/workflows/codegen-drift.yml`, `pnpm run check:dv360-codegen-drift`) compares the committed schemas with the live document weekly, so an upstream change shows up as a dated signal and does not break PR CI. A second weekly job, `pnpm run check:dv360-api-version-watch`, reports when to start moving off the API version we target (a newer version going GA, a deprecation date on ours, or ours leaving Discovery); `preferred` in Discovery is deliberately ignored because v5 is `preferred` while still in public beta.
- **Revision pin.** Google edits the Discovery document in place, so `src/generated/schemas/discovery-revision.json` records the document `revision` the committed schemas were generated from; every regeneration rewrites it. The drift check uses it to tell the cases apart: the revision moved and the schemas changed (the API moved), the revision moved but the schemas are identical (not drift), and the schemas differ at the _same_ revision (the committed files were never generated from it, for example a hand edit). It is a record, not a fetch target: Discovery serves only its current document.

## Things that behave differently on DV360

- **Delete is a hard delete** for most entities. Line items must be archived first; archiving cannot be undone. See the dv360 note in CLAUDE.md.
- **`dv360_duplicate_entity`** always leaves the copy non-running (line items use the native `lineItems:duplicate`; insertion orders are copied GET → POST as `DRAFT`).
- **Writes are governed**: create, update, delete and duplicate carry the `cesteral.*` annotation and a native dry run, so `dryRun` returns the planned change without sending it.

## Related docs

- [CLAUDE_DESKTOP_SETUP.md](./CLAUDE_DESKTOP_SETUP.md): connect Claude Desktop to a local server
- [SERVICE_ACCOUNT_SETUP.md](./SERVICE_ACCOUNT_SETUP.md): create the Google service account
- [dbm-mcp](../../dbm-mcp/docs/ARCHITECTURE.md): the reporting counterpart
