// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";

/** Single item result in a bulk operation */
export const BulkOperationResultSchema = z.object({
  success: z.boolean(),
  entity: z.record(z.any()).optional(),
  error: z.string().optional(),
});

export type BulkOperationResult = z.infer<typeof BulkOperationResultSchema>;
