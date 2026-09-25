// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Property names of the DoubleClick Search v2 `Conversion` resource, copied
 * from https://doubleclicksearch.googleapis.com/$discovery/rest?version=v2
 * (revision 20260922, `schemas.Conversion.properties`). Used to prove that
 * every key the conversion tools send is a real v2 field. Notably absent:
 * `gclid` and `floodlightActivityId`.
 */
export const V2_CONVERSION_PROPERTIES: ReadonlySet<string> = new Set([
  "adGroupId",
  "adId",
  "adUserDataConsent",
  "advertiserId",
  "agencyId",
  "attributionModel",
  "campaignId",
  "channel",
  "clickId",
  "conversionId",
  "conversionModifiedTimestamp",
  "conversionTimestamp",
  "countMillis",
  "criterionId",
  "currencyCode",
  "customDimension",
  "customMetric",
  "customerId",
  "deviceType",
  "dsConversionId",
  "engineAccountId",
  "floodlightOrderId",
  "inventoryAccountId",
  "productCountry",
  "productGroupId",
  "productId",
  "productLanguage",
  "quantityMillis",
  "revenueMicros",
  "segmentationId",
  "segmentationName",
  "segmentationType",
  "state",
  "storeId",
  "type",
]);
