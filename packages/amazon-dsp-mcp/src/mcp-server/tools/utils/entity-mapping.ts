// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { McpError, JsonRpcErrorCode } from "@cesteral/shared";
import {
  AMAZON_DSP_CANONICAL_ENTITY_TYPES,
  AMAZON_DSP_ENTITY_CONTRACT,
  getAmazonDspEntityContract,
  normalizeAmazonDspEntityType,
  type AmazonDspCanonicalEntityType,
} from "../../../services/amazon-dsp/amazon-dsp-api-contract.js";

/**
 * Amazon DSP Entity Mapping
 *
 * Entity types use Amazon's native object names — `order`, `lineItem`,
 * `creative`, `target`, `creativeAssociation`.
 */

export type AmazonDspEntityType = AmazonDspCanonicalEntityType;

export interface AmazonDspEntityConfig {
  /** API path for list (GET with query params) */
  listPath: string;
  /** API path for get single entity */
  getPath: string;
  /** API path for create (POST) */
  createPath: string;
  /** API path for update (PUT) */
  updatePath: string;
  /** Vendor Content-Type for POST {createPath}. See contract notes. */
  createMediaType?: string;
  /** Vendor Content-Type for PUT {updatePath}. See contract notes. */
  updateMediaType?: string;
  /** Primary ID field name in the response */
  idField: string;
  /** Response array key (e.g., "orders") */
  responseKey: string;
  /** Query param name for parent filter on list (e.g., "advertiserId", "orderId") */
  listFilterParam: string;
  /** Display name */
  displayName: string;
  /** Default fields to return */
  defaultFields: string[];
}

const ENTITY_CONFIGS: Record<AmazonDspCanonicalEntityType, AmazonDspEntityConfig> =
  Object.fromEntries(
    AMAZON_DSP_CANONICAL_ENTITY_TYPES.map((entityType) => {
      const contract = AMAZON_DSP_ENTITY_CONTRACT[entityType];
      return [
        entityType,
        {
          listPath: contract.listPath,
          getPath: contract.getPath,
          createPath: contract.createPath,
          updatePath: contract.updatePath,
          createMediaType: contract.createMediaType,
          updateMediaType: contract.updateMediaType,
          idField: contract.idField,
          responseKey: contract.responseKey,
          listFilterParam: contract.listFilterParam,
          displayName: contract.displayName,
          defaultFields: [contract.idField, contract.listFilterParam, "name", "state"],
        } satisfies AmazonDspEntityConfig,
      ];
    })
  ) as Record<AmazonDspCanonicalEntityType, AmazonDspEntityConfig>;

export function getEntityConfig(entityType: AmazonDspEntityType): AmazonDspEntityConfig {
  return ENTITY_CONFIGS[normalizeAmazonDspEntityType(entityType)];
}

export function getSupportedEntityTypes(): AmazonDspEntityType[] {
  return [...AMAZON_DSP_CANONICAL_ENTITY_TYPES];
}

export function getEntityTypeEnum(): [string, ...string[]] {
  return getSupportedEntityTypes() as [string, ...string[]];
}

/** Entity types this server can create (excludes types with `createUnsupportedReason`). */
export function getCreatableEntityTypeEnum(): [string, ...string[]] {
  return getSupportedEntityTypes().filter(
    (t) => !AMAZON_DSP_ENTITY_CONTRACT[t].createUnsupportedReason
  ) as [string, ...string[]];
}

export function getCanonicalEntityType(
  entityType: AmazonDspEntityType
): AmazonDspCanonicalEntityType {
  return normalizeAmazonDspEntityType(entityType);
}

export function getEntityContract(entityType: AmazonDspEntityType) {
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
