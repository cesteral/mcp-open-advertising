# Contributing to Cesteral MCP Servers

Thank you for your interest in contributing to Cesteral's MCP server connectors.

## License

This project is licensed under the [Apache License 2.0](LICENSE.md). Unless you explicitly state otherwise, any contribution intentionally submitted for inclusion in this repository is licensed under Apache 2.0.

## How to Contribute

### Reporting Issues

Issues are always welcome. When filing an issue:

- **Bug reports**: Include the server name, steps to reproduce, expected vs actual behavior, and relevant logs
- **Feature requests**: Describe the use case, not just the desired solution. Explain what you're trying to accomplish
- **Security vulnerabilities**: Do **not** file a public issue. Email security@cesteral.com instead

### Pull Requests

Before starting significant work, open an issue first to discuss the approach. This prevents wasted effort on changes that may not align with the project direction.

**Process:**

1. Fork the repository
2. Create a feature branch from `main`: `git checkout -b feature/your-change`
3. Make your changes
4. Ensure all checks pass:
   ```bash
   pnpm run build
   pnpm run typecheck
   pnpm run test
   ```
5. Commit with a clear message (see [Commit Messages](#commit-messages))
6. Push your branch and open a PR against `main`

**PR requirements:**

- All existing tests pass
- New functionality includes tests
- TypeScript compiles without errors
- Description explains **what** changed and **why**

### What We're Looking For

Contributions that are most likely to be accepted:

- Bug fixes with regression tests
- Documentation improvements and corrections
- New platform API coverage within existing server patterns
- Performance improvements with benchmarks
- Test coverage improvements

Contributions that need discussion first:

- New MCP servers or tools — see [Adding a New Server](docs/guides/adding-a-new-server.md) for the step-by-step guide. Open an issue to discuss the platform before starting implementation.
- Architectural changes to shared patterns
- Changes to authentication flows
- Dependency additions

## Code Standards

### TypeScript

- Target: ES2022, Module: NodeNext
- Use Zod for runtime validation at system boundaries
- Use explicit return types on exported functions
- No `any` types except in factory/generic interfaces where necessary (document why)

### Structure

Follow the existing package structure. Each MCP tool lives in its own file under `src/mcp-server/tools/definitions/`:

```
{tool-name}.tool.ts
├── Zod schema for parameters
├── Tool metadata (name, description, inputSchema)
└── Handler function
```

Register new tools in `src/mcp-server/tools/index.ts` by adding to the `allTools` array.

### Testing

- Unit tests live alongside source in `tests/` directories
- Integration tests test tool registration and session lifecycle
- Use Vitest as the test runner
- Mock external API calls — never hit real platform APIs in tests

### Commit Messages

Use clear, imperative commit messages:

```
feat: add audience targeting support to dv360-mcp
fix: handle rate limit 429 responses in TTD client
docs: update gads-mcp README with GAQL examples
test: add integration tests for meta-mcp session lifecycle
refactor: consolidate auth adapter interfaces in shared
```

Prefix with: `feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `chore:`

## Development Setup

```bash
# Install dependencies
pnpm install

# Build all packages (Turborepo handles dependency order)
pnpm run build

# Run all tests
pnpm run test

# Type check
pnpm run typecheck

# Run a specific server locally
./scripts/dev-server.sh dbm-mcp    # port 3001
./scripts/dev-server.sh dv360-mcp  # port 3002
./scripts/dev-server.sh ttd-mcp    # port 3003
./scripts/dev-server.sh gads-mcp   # port 3004
./scripts/dev-server.sh meta-mcp   # port 3005
```

When modifying `@cesteral/shared`, rebuild everything from the root:

```bash
pnpm run build
```

## Code of Conduct

Be respectful, constructive, and professional. We're building infrastructure that manages significant advertising spend, so accuracy and reliability matter more than velocity.
