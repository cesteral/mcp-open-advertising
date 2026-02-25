# Contributing to Cesteral MCP Servers

Thank you for your interest in contributing to Cesteral's MCP server connectors. This document explains how to contribute, our expectations, and the legal requirements.

## License

This project is licensed under the [Business Source License 1.1](LICENSE.md). By contributing, you agree that your contributions will be licensed under the same terms. The BSL converts to Apache License 2.0 three years after each version's publication.

## Contributor License Agreement (CLA)

All contributors must sign a Contributor License Agreement before any contribution can be merged. This is required because:

- Cesteral AB must maintain the legal right to relicense the code (BSL 1.1 → Apache 2.0 conversion)
- The CLA ensures Cesteral can offer commercial licenses to enterprises that need them
- It protects both Cesteral and contributors by clarifying IP ownership

### How to Sign

1. **Individual contributors**: Sign the [Individual CLA](#individual-cla) by adding your name to the CLA signature file in your first pull request
2. **Corporate contributors**: If you are contributing on behalf of your employer, your employer must sign the [Corporate CLA](#corporate-cla). Contact licensing@cesteral.com

Your first PR will be checked for CLA status. If you haven't signed, a bot will prompt you.

## How to Contribute

### Reporting Issues

Issues are always welcome, regardless of CLA status. When filing an issue:

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

- New MCP servers or tools
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

Be respectful, constructive, and professional. We're building infrastructure that manages significant advertising spend — accuracy and reliability matter more than velocity.

---

## CLA Text

### Individual CLA

By submitting a pull request to this repository, I certify that:

1. The contribution was created in whole or in part by me, and I have the right to submit it under the Business Source License 1.1 as specified in the LICENSE.md file; or

2. The contribution is based on previous work that, to the best of my knowledge, is covered under an appropriate open source license and I have the right to submit that work with modifications under the Business Source License 1.1 as specified in the LICENSE.md file; and

3. I grant Cesteral AB a perpetual, worldwide, non-exclusive, no-charge, royalty-free, irrevocable license to reproduce, prepare derivative works of, publicly display, publicly perform, sublicense, and distribute my contributions and any derivative works thereof, including the right to relicense under any open source license (including, without limitation, the Apache License 2.0).

4. I understand and agree that this project and my contribution are public and that a record of the contribution (including all personal information I submit with it) is maintained indefinitely and may be redistributed consistent with this project's license.

**To sign:** Include the following in your first commit message or PR description:

```
Signed-CLA: [Your Full Legal Name] <[your-email@example.com]>
```

### Corporate CLA

If you are contributing on behalf of a company or organization, the corporate CLA must be signed by an authorized representative. Contact licensing@cesteral.com to initiate the process.

The corporate CLA covers the same grants as the individual CLA but extends to all employees and contractors of the signing organization.
