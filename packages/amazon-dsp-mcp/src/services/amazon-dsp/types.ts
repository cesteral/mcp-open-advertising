// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

// ─── Unified API entities (#234) ────────────────────────────────────────────

/**
 * A Unified API DSP entity as Amazon returns it (`DSPCampaign`, `DSPAdGroup`,
 * `DSPAd`, `DSPTarget`, `DSPAdAssociation` in unified-api-dsp.json). Kept as
 * an open record: the tools pass platform objects through, and the shapes are
 * large oneOf trees that this server does not interpret beyond the fields
 * named in capture-snapshot.ts.
 */
export type AmazonDspUnifiedEntity = Record<string, unknown>;

/** One entry of a multi-status `error[]` (spec `ErrorsIndex` / `Error`). */
export interface AmazonDspUnifiedErrorIndex {
  index: number;
  errors: Array<{ code?: string; message?: string; fieldLocation?: string }>;
}

/** One page of a Unified `query/*` response. */
export interface AmazonDspUnifiedPage {
  entities: AmazonDspUnifiedEntity[];
  /** Amazon's `nextToken`; undefined on the last page. */
  nextToken: string | undefined;
}

// ─── Advertiser accounts (`POST /adsApi/v1/query/advertiserAccounts`) ────────

/**
 * One entry of `alternateIds` (spec `AlternateIdentifier`): the marketplace
 * identifiers of an advertiser account. A DSP entry carries `dspAdvertiserId`
 * + `region`; a Sponsored Ads entry carries `entityId`, `profileId` and
 * `countryCode`.
 */
export interface AmazonDspAlternateId {
  /** The regional DSP advertiser ID — the value for `Amazon-Ads-AccountId` on DSP calls. */
  dspAdvertiserId?: string;
  region?: "NA" | "EU" | "FE";
  countryCode?: string;
  entityId?: string;
  profileId?: string;
}

/** Spec `AdvertiserAccount`, trimmed to the fields this server reads. */
export interface AmazonDspAdvertiserAccount {
  /**
   * `amzn1.ads-account.g.*` for a global account, `amzn1.ads1.aa1.{country}.{entityId}`
   * for a non-global one. NOT the DSP advertiser ID.
   */
  advertiserAccountId: string;
  alternateIds?: AmazonDspAlternateId[];
  displayName?: string;
  isGlobalAccount?: boolean;
  [key: string]: unknown;
}

/** One page of `query/advertiserAccounts`. */
export interface AmazonDspAdvertiserAccountPage {
  accounts: AmazonDspAdvertiserAccount[];
  /** Amazon's `nextToken`; undefined on the last page. A page may be empty and still carry one. */
  nextToken: string | undefined;
}

// ─── Error Type ──────────────────────────────────────────────────────────────

export interface AmazonDspApiError {
  code?: string;
  message: string;
  details?: string;
  status?: number;
}

export function isAmazonDspApiError(value: unknown): value is AmazonDspApiError {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as AmazonDspApiError).message === "string"
  );
}
