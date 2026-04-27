// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

export {
  type MsAdsAuthAdapter,
  MsAdsAccessTokenAdapter,
  parseMsAdsTokenFromHeaders,
  getMsAdsDeveloperTokenFromHeaders,
  getMsAdsCustomerIdFromHeaders,
  getMsAdsAccountIdFromHeaders,
  getMsAdsCredentialFingerprint,
} from "./msads-auth-adapter.js";
export { MsAdsBearerAuthStrategy } from "./msads-auth-strategy.js";
