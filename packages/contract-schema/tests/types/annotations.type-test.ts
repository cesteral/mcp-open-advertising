// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

// TYPE-LEVEL guards for the authoring annotation types. These assertions are
// enforced by `tsc` (via tsconfig.test.json, run by `pnpm typecheck`), NOT by
// vitest — esbuild strips types, so a `@ts-expect-error` in a runtime `.test.ts`
// is never evaluated and gives false confidence (issue #95). This file lives in
// `tests/types/` and is the only test path the typecheck project compiles, so it
// stays isolated from the runtime test suite's loose-typed helpers.
//
// There is no runtime behaviour here; the consts are `void`-referenced so
// `noUnusedLocals` is satisfied.

import {
  type CesteralEntityWriteToolAnnotations,
  type CesteralEffectWriteToolAnnotations,
} from "../../src/index.js";

// A canonical entity-write annotation as an MCP server author would write it.
const entityWrite: CesteralEntityWriteToolAnnotations = {
  kind: "write",
  writeClass: "entity",
  platform: "dv360",
  contractPlatformSlug: "dv360",
  contractToolSlug: "update_entity",
  operation: ["update_budget", "pause", "resume", "update_status", "update"],
  entityKinds: ["campaign", "insertion_order", "line_item"],
  entityIdArgs: ["advertiserId", "campaignId"],
  executableArgsExclude: ["dry_run"],
  schemaVersion: 1,
  contractId: "dv360.update_entity.v1",
  readPartner: {
    toolName: "dv360_get_entity",
    argMap: { entityType: "entityType", advertiserId: "advertiserId" },
  },
  supportsDryRun: true,
  supportsBeforeAfterSnapshot: true,
  requiresValidation: true,
  requiresSimulation: true,
};
void entityWrite;

// Issue #95 authoring-type guard: an entity write cannot declare
// `supportsDryRun: false` — it contradicts `requiresSimulation: true`. The
// `@ts-expect-error` proves the authoring type rejects it; if the `true` literal
// on the entity arm ever regresses to the base's optional boolean, this line's
// suppression becomes unused and `tsc` fails the typecheck.
const _entityWriteCannotDisableDryRun: CesteralEntityWriteToolAnnotations = {
  ...entityWrite,
  // @ts-expect-error supportsDryRun must be the `true` literal on an entity write (#95)
  supportsDryRun: false,
};
void _entityWriteCannotDisableDryRun;

// Companion guard: entity writes also pin `requiresSimulation: true` and
// `requiresValidation: true`. If either regresses to the base optional boolean,
// these suppressions go unused and `tsc` fails — keeping the simulation/dry-run
// covariance the issue is about enforced from both directions.
const _entityWriteCannotDisableSimulation: CesteralEntityWriteToolAnnotations = {
  ...entityWrite,
  // @ts-expect-error requiresSimulation must be the `true` literal on an entity write (#95)
  requiresSimulation: false,
};
void _entityWriteCannotDisableSimulation;

// Negative control: an EFFECT write has no such constraint — supportsDryRun is a
// free boolean there. This must NOT error (it documents that the covariance is
// specific to the entity arm).
const _effectWriteAllowsNoDryRun: CesteralEffectWriteToolAnnotations = {
  kind: "write",
  writeClass: "effect",
  platform: "tiktok",
  contractPlatformSlug: "tiktok",
  contractToolSlug: "upload_video",
  operation: ["upload"],
  entityKinds: [],
  entityIdArgs: [],
  executableArgsExclude: [],
  schemaVersion: 2,
  contractId: "tiktok.upload_video.v2",
  supportsBeforeAfterSnapshot: false,
  requiresValidation: false,
  requiresSimulation: false,
};
void _effectWriteAllowsNoDryRun;
