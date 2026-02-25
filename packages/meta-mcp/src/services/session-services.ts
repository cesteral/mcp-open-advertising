import type { Logger } from "pino";
import type { MetaAuthAdapter } from "../auth/meta-auth-adapter.js";
import type { RateLimiter } from "../utils/security/rate-limiter.js";
import { SessionServiceStore, createFindingBuffer, createWorkflowTracker, type FindingBuffer, type WorkflowTracker } from "@cesteral/shared";
export { SessionServiceStore } from "@cesteral/shared";
import { MetaGraphApiClient } from "./meta/meta-graph-api-client.js";
import { MetaService } from "./meta/meta-service.js";
import { MetaInsightsService } from "./meta/meta-insights-service.js";
import { MetaTargetingService } from "./meta/meta-targeting-service.js";

export interface SessionServices {
  httpClient: MetaGraphApiClient;
  metaService: MetaService;
  metaInsightsService: MetaInsightsService;
  metaTargetingService: MetaTargetingService;
  findingBuffer: FindingBuffer;
  workflowTracker: WorkflowTracker;
}

export function createSessionServices(
  authAdapter: MetaAuthAdapter,
  baseUrl: string,
  logger: Logger,
  rateLimiter: RateLimiter
): SessionServices {
  const httpClient = new MetaGraphApiClient(authAdapter, baseUrl, logger);
  const metaService = new MetaService(rateLimiter, httpClient);
  const metaInsightsService = new MetaInsightsService(rateLimiter, httpClient);
  const metaTargetingService = new MetaTargetingService(rateLimiter, httpClient);
  return {
    httpClient,
    metaService,
    metaInsightsService,
    metaTargetingService,
    findingBuffer: createFindingBuffer(),
    workflowTracker: createWorkflowTracker(),
  };
}

export const sessionServiceStore = new SessionServiceStore<SessionServices>();
