# Monorepo Strategy

## Decision: Single Monorepo

Cesteral MCP servers are maintained as a single pnpm workspace monorepo, not split into per-platform repos.

## Why

The `@cesteral/shared` package is the deciding factor. All 13 connector servers depend on it for:

- Auth strategies (`createAuthStrategy`, platform-specific adapters)
- `SessionServiceStore` + `resolveSessionServices`
- `registerToolsFromDefinitions` factory
- OpenTelemetry, Pino logging, error formatting

In a polyrepo, `@cesteral/shared` would need to become a published npm package (versioning overhead), be duplicated (diverges over time), or use git submodules (complex). None improve on `workspace:*`.

## Deployments Are Already Independent

The monorepo does not couple deployments. Each connector server already has:

- Its own Docker image
- Its own Cloud Run service
- Independent rollout/rollback

The monorepo provides shared tooling without shared deployment risk.

## When to Reconsider

Split into separate repos only if:

| Trigger                                                | Action                                                                                      |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| Dedicated team per platform                            | Separate repo per platform for access control                                               |
| Splitting OSS connectors from proprietary product code | Keep connectors here; place hosted Intelligence in a separate private repo/service boundary |
| Shared package grows too large                         | Publish `@cesteral/shared` to a private npm registry                                        |

Until one of these applies, the monorepo is the right structure.
