// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";

/**
 * Canonical write operations. Multi-operation dispatchers (e.g. an
 * `update_entity` tool that switches on `data.status` vs `data.daily_budget`)
 * declare the union and let consumers decide the effective operation per call.
 *
 * Entity-class ops describe canonical entity mutations (snapshot-governable);
 * effect-class ops describe writes with no canonical entity snapshot (uploads,
 * report schedules, conversion uploads, bulk jobs).
 *
 * This `as const` tuple is the SINGLE source of truth. {@link writeOperationSchema}
 * is the Zod enum built from it and {@link CesteralWriteOperation} its inferred
 * type — connector authoring types and the governance parse schema both derive
 * from here, so the set can never diverge across repos. A value the MCP servers
 * emit but this list omits would make every annotation carrying it fail
 * `parseCesteralAnnotation`, silently dropping governance metadata for that tool.
 */
export const CESTERAL_WRITE_OPERATIONS = [
  // entity-class
  "update_budget",
  "pause",
  "resume",
  "update_status",
  "update_schedule",
  "create",
  "update",
  "delete",
  "duplicate",
  "archive",
  "bulk_update_status",
  "adjust_bids",
  // effect-class
  "upload",
  "create_schedule",
  "delete_schedule",
  "submit_report",
  "upload_conversions",
  "bulk_job",
  "manage",
] as const;

export type CesteralWriteOperation = (typeof CESTERAL_WRITE_OPERATIONS)[number];

export const writeOperationSchema = z.enum(CESTERAL_WRITE_OPERATIONS);
