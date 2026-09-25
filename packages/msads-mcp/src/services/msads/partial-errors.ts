// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { McpError, JsonRpcErrorCode } from "@cesteral/shared";

/**
 * Microsoft Advertising Campaign Management partial-success handling.
 *
 * Add / Update / Delete operations return HTTP 200 even when some — or all —
 * request items were rejected. Per the v13 docs
 * (`guides/handle-service-errors-exceptions.md#partial-success-campaign-management`,
 * `campaign-management-service/batcherror.md`, `batcherrorcollection.md`):
 *
 * - `PartialErrors` is an array of `BatchError { Code, Details, ErrorCode,
 *   FieldPath, Index, Message, Type }`. `Index` is the zero-based index of the
 *   failed item in the request batch. The array does NOT line up with the
 *   request items; only failures are listed.
 * - Some operations (ad extensions) return `NestedPartialErrors` instead: an
 *   array of `BatchErrorCollection { BatchErrors[], Code, ErrorCode, Index,
 *   Message, … }` whose top-level `Index` is the failed request item.
 * - Add operations additionally return an id list (`CampaignIds`, `AdGroupIds`,
 *   …) that corresponds directly to the request items; the element is `null`
 *   for each item that was not added.
 *
 * An HTTP 200 therefore says nothing about whether any write happened. Every
 * write path must run its response through these helpers.
 */

export interface MsAdsBatchError {
  Index?: number | null;
  Code?: number | null;
  ErrorCode?: string | null;
  Message?: string | null;
  Details?: string | null;
  FieldPath?: string | null;
  Type?: string | null;
}

/** Per-request-item outcome derived from a Microsoft Ads batch response. */
export interface MsAdsItemOutcome {
  /** Zero-based index of the item in the submitted batch. */
  index: number;
  success: boolean;
  /** Human-readable reason, present when `success` is false. */
  error?: string;
  /** Upstream symbolic `ErrorCode` of the first error for this item, when known. */
  errorCode?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Collect every BatchError-shaped entry from a response. Handles `PartialErrors`
 * (flat, or the two-dimensional form some operations use) and
 * `NestedPartialErrors` (BatchErrorCollection — the collection's own top-level
 * fields describe the failed request item; its `BatchErrors` are detail).
 */
export function collectMsAdsBatchErrors(result: unknown): MsAdsBatchError[] {
  if (!isRecord(result)) return [];
  const errors: MsAdsBatchError[] = [];

  const partial = result.PartialErrors;
  if (Array.isArray(partial)) {
    for (const entry of partial) {
      if (Array.isArray(entry)) {
        for (const inner of entry) if (isRecord(inner)) errors.push(inner as MsAdsBatchError);
      } else if (isRecord(entry)) {
        errors.push(entry as MsAdsBatchError);
      }
    }
  }

  const nested = result.NestedPartialErrors;
  if (Array.isArray(nested)) {
    for (const collection of nested) {
      if (!isRecord(collection)) continue;
      const inner = Array.isArray(collection.BatchErrors)
        ? collection.BatchErrors.filter(isRecord)
        : [];
      const top = collection as MsAdsBatchError;
      const firstInner = inner[0] as MsAdsBatchError | undefined;
      // Attribute the collection to its top-level Index; fall back to the first
      // nested error's text when the top level carries none.
      errors.push({
        ...top,
        ErrorCode: top.ErrorCode ?? firstInner?.ErrorCode ?? null,
        Code: top.Code ?? firstInner?.Code ?? null,
        Message: top.Message ?? firstInner?.Message ?? null,
        Details: top.Details ?? firstInner?.Details ?? null,
      });
    }
  }

  return errors;
}

/** Render one BatchError as `ErrorCode (Code): Message — Details [field X]`. */
export function describeMsAdsBatchError(error: MsAdsBatchError): string {
  const code = error.ErrorCode ?? (error.Code != null ? String(error.Code) : undefined);
  const codePart =
    error.ErrorCode && error.Code != null
      ? `${error.ErrorCode} (${String(error.Code)})`
      : (code ?? "UnknownError");
  const message = error.Message && error.Message.length > 0 ? error.Message : "no message";
  const details = error.Details && error.Details.length > 0 ? ` — ${error.Details}` : "";
  const field = error.FieldPath ? ` [field ${error.FieldPath}]` : "";
  return `${codePart}: ${message}${details}${field}`;
}

function validIndex(index: unknown, requested: number): index is number {
  return typeof index === "number" && Number.isInteger(index) && index >= 0 && index < requested;
}

/**
 * Derive a per-item outcome for a batch of `requested` items.
 *
 * - An item with at least one BatchError at its `Index` failed.
 * - For Add responses, pass `idsField` (e.g. `CampaignIds`): an item whose id
 *   is `null` failed even if no BatchError names it.
 * - A BatchError with a missing/out-of-range `Index` cannot be attributed. With
 *   a single-item batch it belongs to that item; otherwise every item not
 *   already known to have failed is marked failed with an "outcome unknown"
 *   reason, because claiming success for a batch that returned an error we
 *   cannot place would be the exact false positive this module exists to stop.
 */
export function mapMsAdsItemOutcomes(
  result: unknown,
  requested: number,
  options?: { idsField?: string }
): MsAdsItemOutcome[] {
  const errors = collectMsAdsBatchErrors(result);
  const byIndex = new Map<number, MsAdsBatchError[]>();
  const unattributed: MsAdsBatchError[] = [];

  for (const error of errors) {
    const index = requested === 1 && !validIndex(error.Index, requested) ? 0 : error.Index;
    if (validIndex(index, requested)) {
      const list = byIndex.get(index) ?? [];
      list.push(error);
      byIndex.set(index, list);
    } else {
      unattributed.push(error);
    }
  }

  const ids =
    options?.idsField && isRecord(result) && Array.isArray(result[options.idsField])
      ? (result[options.idsField] as unknown[])
      : undefined;

  const outcomes: MsAdsItemOutcome[] = [];
  for (let i = 0; i < requested; i++) {
    const itemErrors = byIndex.get(i);
    if (itemErrors && itemErrors.length > 0) {
      outcomes.push({
        index: i,
        success: false,
        error: itemErrors.map(describeMsAdsBatchError).join("; "),
        ...(itemErrors[0]?.ErrorCode ? { errorCode: itemErrors[0].ErrorCode } : {}),
      });
      continue;
    }
    if (ids && (ids[i] === null || ids[i] === undefined)) {
      outcomes.push({
        index: i,
        success: false,
        error: `Microsoft Ads returned no ${options?.idsField ?? "id"} entry for this item (not added)`,
      });
      continue;
    }
    if (unattributed.length > 0) {
      outcomes.push({
        index: i,
        success: false,
        error: `Outcome unknown — Microsoft Ads returned batch error(s) without an item index: ${unattributed.map(describeMsAdsBatchError).join("; ")}`,
      });
      continue;
    }
    outcomes.push({ index: i, success: true });
  }
  return outcomes;
}

/**
 * Throw a McpError when a single-entity write (Add / Update of one logical
 * entity) was rejected in any part. The upstream BatchError text is carried in
 * the message and the structured errors in `data.partialErrors`.
 */
export function assertMsAdsWriteSucceeded(
  result: unknown,
  params: { operation: string; entityLabel: string; requested: number; idsField?: string }
): void {
  const outcomes = mapMsAdsItemOutcomes(result, params.requested, { idsField: params.idsField });
  const failed = outcomes.filter((o) => !o.success);
  if (failed.length === 0) return;

  const detail =
    params.requested === 1
      ? (failed[0]?.error ?? "unknown error")
      : failed.map((o) => `item ${o.index}: ${o.error ?? "unknown error"}`).join("; ");
  const succeededCount = params.requested - failed.length;
  const partialNote =
    succeededCount > 0
      ? ` ${succeededCount} of ${params.requested} item(s) WERE applied — see data.result.`
      : "";

  throw new McpError(
    JsonRpcErrorCode.InvalidRequest,
    `Microsoft Ads rejected ${params.operation} of ${params.entityLabel}: ${detail}.${partialNote}`,
    {
      platform: "msads",
      operation: params.operation,
      failedIndices: failed.map((o) => o.index),
      partialErrors: collectMsAdsBatchErrors(result),
      result,
    }
  );
}
