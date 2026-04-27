import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — declared before the module under test is imported
// ---------------------------------------------------------------------------

vi.mock("../../src/services/sa360/sa360-http-client.js", () => ({
  SA360HttpClient: vi.fn().mockImplementation(() => ({
    fetch: vi.fn(),
  })),
}));

vi.mock("../../src/services/sa360-v2/sa360-v2-http-client.js", () => ({
  SA360V2HttpClient: vi.fn().mockImplementation(() => ({
    fetch: vi.fn(),
  })),
}));

vi.mock("../../src/services/sa360/sa360-service.js", () => ({
  SA360Service: vi.fn().mockImplementation(() => ({
    search: vi.fn(),
  })),
}));

vi.mock("../../src/services/sa360-v2/conversion-service.js", () => ({
  ConversionService: vi.fn().mockImplementation(() => ({
    insertConversions: vi.fn(),
  })),
}));

vi.mock("../../src/services/sa360-v2/reporting-service.js", () => ({
  SA360ReportingService: vi.fn().mockImplementation(() => ({
    submitReport: vi.fn(),
  })),
}));

import { sessionServiceStore, createSessionServices } from "../../src/services/session-services.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn().mockReturnThis(),
    level: "debug",
  } as any;
}

function createMockAuthAdapter() {
  return {
    getAccessToken: vi.fn().mockResolvedValue("token"),
    validate: vi.fn().mockResolvedValue(undefined),
    loginCustomerId: undefined,
  } as any;
}

function createMockRateLimiter() {
  return {
    consume: vi.fn().mockResolvedValue(undefined),
  } as any;
}

const DEFAULT_CONFIG = {
  baseUrl: "https://searchads360.googleapis.com/v0",
  v2BaseUrl: "https://www.googleapis.com/doubleclicksearch/v2",
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("sessionServiceStore", () => {
  it("is defined and has expected methods", () => {
    expect(sessionServiceStore).toBeDefined();
    expect(typeof sessionServiceStore.set).toBe("function");
    expect(typeof sessionServiceStore.get).toBe("function");
    expect(typeof sessionServiceStore.delete).toBe("function");
  });
});

describe("createSessionServices", () => {
  let logger: ReturnType<typeof createMockLogger>;
  let authAdapter: ReturnType<typeof createMockAuthAdapter>;
  let rateLimiter: ReturnType<typeof createMockRateLimiter>;

  beforeEach(() => {
    vi.clearAllMocks();
    logger = createMockLogger();
    authAdapter = createMockAuthAdapter();
    rateLimiter = createMockRateLimiter();
  });

  it("returns object with all expected service keys", () => {
    const services = createSessionServices(authAdapter, DEFAULT_CONFIG, logger, rateLimiter);

    expect(services).toHaveProperty("httpClient");
    expect(services).toHaveProperty("v2HttpClient");
    expect(services).toHaveProperty("sa360Service");
    expect(services).toHaveProperty("conversionService");
    expect(services).toHaveProperty("reportingService");
  });

  it("returns non-null service instances", () => {
    const services = createSessionServices(authAdapter, DEFAULT_CONFIG, logger, rateLimiter);

    expect(services.httpClient).toBeDefined();
    expect(services.v2HttpClient).toBeDefined();
    expect(services.sa360Service).toBeDefined();
    expect(services.conversionService).toBeDefined();
    expect(services.reportingService).toBeDefined();
  });
});
