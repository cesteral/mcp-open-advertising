import type { Logger } from "pino";
import type { SupabaseAuthAdapterInterface } from "../auth/supabase-auth-adapter.js";
import type { RateLimiter } from "../utils/security/rate-limiter.js";
import { SessionServiceStore } from "@cesteral/shared";
export { SessionServiceStore } from "@cesteral/shared";
import { SupabaseStorageClient } from "./supabase/supabase-storage-client.js";
import { MediaService } from "./supabase/media-service.js";
import { appConfig } from "../config/index.js";

export interface SessionServices {
  mediaService: MediaService;
}

export function createSessionServices(
  authAdapter: SupabaseAuthAdapterInterface,
  logger: Logger,
  _rateLimiter: RateLimiter
): SessionServices {
  const storageClient = new SupabaseStorageClient(
    authAdapter.getClient(),
    appConfig.supabaseBucketName,
    logger
  );
  const mediaService = new MediaService(storageClient, logger);

  return { mediaService };
}

export const sessionServiceStore = new SessionServiceStore<SessionServices>();
