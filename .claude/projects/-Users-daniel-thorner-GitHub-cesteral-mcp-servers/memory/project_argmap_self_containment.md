---
name: project-argmap-self-containment
description: Tracked follow-up — make governed readPartner.argMap self-contained (include discriminators like DV360 entityType) as its own contract-hardening PR
metadata:
  type: project
---

Open follow-up (deferred out of the duplicate-family PR #53, by reviewer agreement on 2026-06-02): tighten the governed-write `readPartner.argMap` so it is **fully self-contained** — i.e. it must map every arg the read partner requires, including the **discriminator** field, not just the scoping IDs.

**Why:** Today the convention across the merged DV360 governed tools (`update_entity`, `delete_entity`, `duplicate_entity`) maps only `advertiserId` + the typed IDs (`insertionOrderId`/`lineItemId`/`campaignId`) and omits `entityType`. But `dv360_get_entity` *requires* `entityType`. A consumer can still derive it (the write call carries `entityType` as the discriminator), so it works by convention — but the `argMap` is not self-describing. The gate does not assert argMap-against-read-input completeness, so nothing catches a genuinely missing required read arg.

**How to apply:**
- Add `entityType: "entityType"` (and any other required-but-omitted read args) to `readPartner.argMap` for DV360 `update_entity` / `delete_entity` / `duplicate_entity` **together** (keep the convention consistent — do not do a one-off on a single tool; that was explicitly rejected for #53).
- Add a release-gate assertion (in `scripts/lib/governance-contracts.test.mjs`, or alongside it) that every governed write tool's `readPartner.argMap` covers all **required** args of its `readPartner.toolName` input schema. This is the enforcement that makes the rule stick.
- Then sweep fleet-wide for any other governed tools whose read partner has required args not present in `argMap`.
- Keep it a **small, standalone contract-hardening PR** — it changes shared conventions, so it should be reviewed on its own.

Context: the create/delete/duplicate governance families are all merged to main (PRs #48, #51, #52, #53). See [[project-governed-write-contract]]. argMap semantics: "Mapping from this write tool's arg name to the read tool's arg name" (`packages/shared/src/types/cesteral-annotations.ts`).
