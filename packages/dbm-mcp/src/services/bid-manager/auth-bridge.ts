/**
 * Auth Bridge — adapts a shared GoogleAuthAdapter to the googleapis OAuth2Client shape.
 *
 * The `googleapis` library expects an auth parameter that has a `getAccessToken()` method
 * returning `{ token: string }`. We wrap our GoogleAuthAdapter to satisfy this contract.
 */

import { google } from "googleapis";
import type { GoogleAuthAdapter } from "@bidshifter/shared";

type OAuth2Client = InstanceType<typeof google.auth.OAuth2>;

/**
 * Create a googleapis-compatible auth client backed by a GoogleAuthAdapter.
 *
 * The returned OAuth2Client can be passed as `auth` to any googleapis client constructor.
 */
export function createGoogleAuthFromAdapter(adapter: GoogleAuthAdapter): OAuth2Client {
  const oauth2 = new google.auth.OAuth2();

  /**
   * Use refreshHandler so google-auth-library can obtain fresh credentials through
   * the normal OAuth2 request/header path (getRequestHeaders/getRequestMetadata).
   * This is required for reliable auth propagation in googleapis clients.
   */
  oauth2.refreshHandler = async () => {
    const token = await adapter.getAccessToken();
    return {
      access_token: token,
      // Keep expiry comfortably ahead of the adapter's internal early-refresh buffer.
      expiry_date: Date.now() + 55 * 60 * 1000,
    };
  };

  return oauth2;
}
