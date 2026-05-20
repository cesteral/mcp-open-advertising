# @cesteral/contract-hash

The canonical tool-definition hash for the Cesteral MCP ecosystem.

`computeDefinitionHash(tool)` returns a SHA-256 (lowercase hex, no prefix)
over the sorted-key JSON projection of an MCP tool's governance-relevant
fields: `name`, `description`, `inputSchema`, `outputSchema`, `annotations`.

Both `cesteral-mcp-servers` (per-release attestation manifest generation)
and `cesteral-intelligence` governance import this function. The two MUST
produce bit-identical output — the golden-vector tests are the contract.

```ts
import { computeDefinitionHash } from "@cesteral/contract-hash";

const hash = computeDefinitionHash({ name: "meta_update_entity", inputSchema, annotations });
```
