// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";

/**
 * The fields a governed `*_get_entity` read partner adds, at the top level of
 * its `structuredContent`, beside `entity` / `timestamp`: the canonical
 * `NormalizedEntitySnapshot` of the entity it read. The governance preview
 * parses a read partner's `structuredContent` with
 * `normalizedEntitySnapshotSchema`, so these keys are what make the read a
 * `preState` there (a plain `z.object` ignores `entity` and `timestamp`).
 *
 * Every key is optional because an entity outside the governed kinds, or one
 * whose snapshot cannot be built, carries none. This is a hand-written mirror
 * of the contract schema (which is a `z.ZodType`, not a spreadable object);
 * `tests/schemas/read-partner-snapshot.test.ts` pins the two together.
 */
const money = z.object({ amountMinor: z.number(), currency: z.string() });

export const readPartnerSnapshotShape = {
  schemaVersion: z.literal(1).optional(),
  platform: z.string().optional(),
  entityKind: z.string().optional(),
  platformEntityId: z.string().optional(),
  displayName: z.string().nullable().optional(),
  accountId: z.string().nullable().optional(),
  status: z.object({ canonical: z.string(), platformRaw: z.string() }).optional(),
  budget: z
    .object({
      daily: money.nullable().optional(),
      lifetime: money.nullable().optional(),
      segments: z
        .array(
          z.object({
            amountMinor: z.number(),
            currency: z.string(),
            startAt: z.string().nullable(),
            endAt: z.string().nullable(),
          })
        )
        .nullable()
        .optional(),
    })
    .optional(),
  schedule: z.object({ startAt: z.string().nullable(), endAt: z.string().nullable() }).optional(),
  parents: z
    .array(
      z.object({
        kind: z.enum(["campaign", "insertion_order"]),
        id: z.string(),
        name: z.string().optional(),
      })
    )
    .max(4)
    .optional()
    .describe("Ancestors the read-back names; absent means unknown, not none"),
};
