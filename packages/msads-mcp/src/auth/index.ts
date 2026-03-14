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
