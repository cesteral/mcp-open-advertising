# @cesteral/contract-schema

The canonical **governance-contract surface** for the Cesteral MCP ecosystem —
the single source of truth shared by the MCP servers (`mcp-open-advertising`)
and the governance layer (`cesteral-intelligence`).

Where `@cesteral/contract-hash` owns _how a tool definition is hashed_, this
package owns _the shape of what gets governed_:

- **Tool annotations** — the `cesteral.*` namespace, in two deliberately
  different-strictness faces:
  - **Authoring types** (`CesteralToolAnnotations`, `CesteralEntityWriteToolAnnotations`,
    …) — the strict contract MCP-server authors write against with `satisfies`.
  - **Validation schema** (`cesteralAnnotationSchema`, `parseCesteralAnnotation`)
    — the loose shape governance parses untrusted tool lists with, so it can
    apply contract-promise checks (`requiresValidation`, …) as specific
    admission reason codes rather than a generic parse failure.
- **Canonical enums** — `CESTERAL_WRITE_OPERATIONS` / `writeOperationSchema`
  and `canonicalEntityKindSchema` / `CanonicalEntityKind`.
- **`contractId` derivation** — `deriveContractId`, `safeDeriveContractId`,
  `slugSchema`.
- **Governed response shapes** — `dryRunResultSchema`,
  `normalizedEntitySnapshotSchema`, `dispatchedCapabilitySchema`,
  `effectDryRunResultSchema`, and their TS mirrors.
- **Release attestation manifest** — `cesteralManifestSchema`.

```ts
import {
  parseCesteralAnnotation,
  deriveContractId,
  cesteralManifestSchema,
} from "@cesteral/contract-schema";

const parsed = parseCesteralAnnotation(tool.annotations?.cesteral);
if (parsed.success) {
  // parsed.data.contractId === deriveContractId(slug, slug, version)
}
```

Each TS authoring type and its Zod validation mirror are pinned together by
the package's type-tests — the two faces cannot silently drift, and any value
satisfying an authoring type is guaranteed to parse under the schema.
