/**
 * Per-Session Service Factory & Store for DBM-MCP
 *
 * Each HTTP session gets its own BidManagerService instance backed by the
 * user-provided GoogleAuthAdapter. Services are created when the session
 * starts and cleaned up when it closes or times out.
 */

import { google } from "googleapis";
import type { Logger } from "pino";
import type { GoogleAuthAdapter, RateLimiter } from "@cesteral/shared";
import { SessionServiceStore } from "@cesteral/shared";
export { SessionServiceStore } from "@cesteral/shared";
import { BidManagerService } from "./bid-manager/BidManagerService.js";
import { createGoogleAuthFromAdapter } from "./bid-manager/auth-bridge.js";
import type { AppConfig } from "../config/index.js";

/**
 * All services scoped to a single session.
 */
export interface SessionServices {
  bidManagerService: BidManagerService;
}

/**
 * Create session-scoped services for a single authenticated session.
 */
export function createSessionServices(
  authAdapter: GoogleAuthAdapter,
  config: AppConfig,
  logger: Logger,
  rateLimiter: RateLimiter
): SessionServices {
  // Bridge GoogleAuthAdapter → googleapis OAuth2Client
  const googleAuth = createGoogleAuthFromAdapter(authAdapter);

  // Create Bid Manager API client (v2) using the bridged auth
  const bidManagerClient = google.doubleclickbidmanager({
    version: "v2",
    auth: googleAuth,
  });

  // Create BidManagerService with the pre-initialized client
  const bidManagerService = new BidManagerService(config, logger, bidManagerClient, rateLimiter);

  return {
    bidManagerService,
  };
}

export const sessionServiceStore = new SessionServiceStore<SessionServices>();
