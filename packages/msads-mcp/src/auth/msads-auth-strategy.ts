import type { AuthStrategy, AuthResult } from "@cesteral/shared";
import {
  MsAdsAccessTokenAdapter,
  parseMsAdsTokenFromHeaders,
  getMsAdsDeveloperTokenFromHeaders,
  getMsAdsCustomerIdFromHeaders,
  getMsAdsAccountIdFromHeaders,
  getMsAdsCredentialFingerprint,
} from "./msads-auth-adapter.js";

/**
 * Microsoft Ads Bearer auth strategy.
 *
 * Extracts OAuth2 access token, developer token, customer ID, and account ID
 * from HTTP headers. Validates by calling GetUser via the adapter.
 *
 * Headers:
 * - Authorization: Bearer <access_token>
 * - X-MSAds-Developer-Token: <developer_token>
 * - X-MSAds-Customer-Id: <customer_id>
 * - X-MSAds-Account-Id: <account_id>
 */
export class MsAdsBearerAuthStrategy implements AuthStrategy {
  constructor(
    private readonly customerApiBaseUrl?: string
  ) {}

  async verify(
    headers: Record<string, string | string[] | undefined>
  ): Promise<AuthResult> {
    const accessToken = parseMsAdsTokenFromHeaders(headers);
    const developerToken = getMsAdsDeveloperTokenFromHeaders(headers);
    const customerId = getMsAdsCustomerIdFromHeaders(headers);
    const accountId = getMsAdsAccountIdFromHeaders(headers);

    const adapter = new MsAdsAccessTokenAdapter(
      accessToken,
      developerToken,
      customerId,
      accountId,
      this.customerApiBaseUrl
    );

    await adapter.validate();

    const fingerprint = getMsAdsCredentialFingerprint(
      accessToken,
      developerToken,
      accountId
    );

    return {
      authInfo: {
        clientId: adapter.userId,
        authType: "msads-bearer",
      },
      platformAuthAdapter: adapter,
      credentialFingerprint: fingerprint,
    };
  }

  async getCredentialFingerprint(
    headers: Record<string, string | string[] | undefined>
  ): Promise<string | undefined> {
    try {
      const accessToken = parseMsAdsTokenFromHeaders(headers);
      const developerToken = getMsAdsDeveloperTokenFromHeaders(headers);
      const accountId = getMsAdsAccountIdFromHeaders(headers);
      return getMsAdsCredentialFingerprint(accessToken, developerToken, accountId);
    } catch {
      return undefined;
    }
  }
}
