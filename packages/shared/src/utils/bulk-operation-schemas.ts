import { z } from "zod";

/** Single item result in a bulk operation */
export const BulkOperationResultSchema = z.object({
  success: z.boolean(),
  entity: z.record(z.any()).optional(),
  error: z.string().optional(),
});

/** Base output schema for bulk create/update operations */
export const BulkOperationOutputSchema = z.object({
  results: z.array(BulkOperationResultSchema),
  successCount: z.number(),
  failureCount: z.number(),
  timestamp: z.string().datetime(),
});

export type BulkOperationResult = z.infer<typeof BulkOperationResultSchema>;
export type BulkOperationOutput = z.infer<typeof BulkOperationOutputSchema>;
