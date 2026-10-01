// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { McpError, JsonRpcErrorCode } from "@cesteral/shared";
import {
  AMAZON_DSP_CANONICAL_ENTITY_TYPES,
  AMAZON_DSP_ENTITY_CONTRACT,
  getAmazonDspEntityContract,
  normalizeAmazonDspEntityType,
  type AmazonDspCanonicalEntityType,
  type AmazonDspEntityContract,
} from "../../../services/amazon-dsp/amazon-dsp-api-contract.js";

/**
 * Amazon DSP Entity Mapping
 *
 * Entity types keep the pre-#234 names — `order`, `lineItem`, `creative`,
 * `target`, `creativeAssociation` — and map onto the Unified API resources
 * `campaigns`, `adGroups`, `ads`, `targets`, `adAssociations` (see
 * amazon-dsp-api-contract.ts).
 */

export type AmazonDspEntityType = AmazonDspCanonicalEntityType;

export function getSupportedEntityTypes(): AmazonDspEntityType[] {
  return [...AMAZON_DSP_CANONICAL_ENTITY_TYPES];
}

export function getEntityTypeEnum(): [string, ...string[]] {
  return getSupportedEntityTypes() as [string, ...string[]];
}

function supportedWhere(
  unsupported: (c: AmazonDspEntityContract) => string | undefined
): [string, ...string[]] {
  return getSupportedEntityTypes().filter((t) => !unsupported(AMAZON_DSP_ENTITY_CONTRACT[t])) as [
    string,
    ...string[],
  ];
}

/** Entity types this server can create (excludes types with `createUnsupportedReason`). */
export function getCreatableEntityTypeEnum(): [string, ...string[]] {
  return supportedWhere((c) => c.createUnsupportedReason);
}

/** Entity types this server can read by ID (excludes `target`: no targetId query filter). */
export function getGettableEntityTypeEnum(): [string, ...string[]] {
  return supportedWhere((c) => c.getUnsupportedReason);
}

/** Entity types this server can update (excludes `target`: no Unified update/targets). */
export function getUpdatableEntityTypeEnum(): [string, ...string[]] {
  return supportedWhere((c) => c.updateUnsupportedReason);
}

/** Entity types this server can remove (excludes `creative`: no Unified delete/ads, no ARCHIVED update). */
export function getDeletableEntityTypeEnum(): [string, ...string[]] {
  return supportedWhere((c) => c.deleteUnsupportedReason);
}

/** Entity types this server can duplicate: must be readable by ID and creatable. */
export function getDuplicableEntityTypeEnum(): [string, ...string[]] {
  return supportedWhere((c) => c.getUnsupportedReason ?? c.createUnsupportedReason);
}

export function getCanonicalEntityType(
  entityType: AmazonDspEntityType
): AmazonDspCanonicalEntityType {
  return normalizeAmazonDspEntityType(entityType);
}

export function getEntityContract(entityType: AmazonDspEntityType): AmazonDspEntityContract {
  return getAmazonDspEntityContract(entityType);
}

/**
 * Interpolate path template placeholders. Values are URI-encoded as single
 * path segments, so an ID can never add, remove or climb path segments.
 */
export function interpolatePath(path: string, params: Record<string, string>): string {
  return Object.entries(params).reduce(
    (acc, [key, val]) => acc.replace(`{${key}}`, encodePathSegment(val, key)),
    path
  );
}

/**
 * Encode one path segment. `encodeURIComponent` leaves `.` alone, so a bare
 * `.` / `..` would still be normalized away by URL resolution — reject those
 * (and empty values) outright.
 */
export function encodePathSegment(value: string, name = "id"): string {
  const str = String(value);
  if (str === "" || str === "." || str === "..") {
    throw new McpError(JsonRpcErrorCode.InvalidParams, `Invalid ${name}: ${JSON.stringify(str)}`);
  }
  return encodeURIComponent(str);
}
