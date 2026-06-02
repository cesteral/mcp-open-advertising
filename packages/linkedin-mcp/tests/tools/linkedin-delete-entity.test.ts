// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/mcp-server/tools/utils/resolve-session.js", () => ({
  resolveSessionServices: vi.fn(),
}));

import { resolveSessionServices } from "../../src/mcp-server/tools/utils/resolve-session.js";
const mockResolveSessionServices = vi.mocked(resolveSessionServices);

import { deleteEntityLogic } from "../../src/mcp-server/tools/definitions/delete-entity.tool.js";

const campaign = {
  id: 123,
  name: "Q3 Campaign",
  status: "PAUSED",
  account: "urn:li:sponsoredAccount:9",
};

const svc = {
  getEntity: vi.fn(),
  deleteEntity: vi.fn(),
};

const mockSessionServices = {
  httpClient: {} as any,
  linkedInService: svc as any,
  linkedInReportingService: {} as any,
};

const ctx = { requestId: "r", operationId: "o" } as any;
const sdk = { sessionId: "s" } as any;

describe("linkedin_delete_entity governance contract", () => {
  beforeEach(() => {
    svc.getEntity.mockReset().mockResolvedValue(campaign);
    svc.deleteEntity.mockReset().mockResolvedValue(undefined);
    mockResolveSessionServices.mockReturnValue(mockSessionServices as any);
  });

  it("dry_run returns a deleted expected post-state and does not delete", async () => {
    const result = await deleteEntityLogic(
      { entityType: "campaign", entityUrn: "urn:li:sponsoredCampaign:123", dry_run: true } as any,
      ctx,
      sdk
    );
    expect(svc.deleteEntity).not.toHaveBeenCalled();
    expect(result.dryRun?.wouldSucceed).toBe(true);
    expect(result.dryRun?.expectedPostState?.status.canonical).toBe("deleted");
    expect(result.dispatchedCapability).toEqual({
      operation: "delete",
      canonicalEntityKind: "campaign",
    });
  });

  it("dry_run on an ACTIVE campaign reports wouldSucceed:false", async () => {
    svc.getEntity.mockResolvedValue({ ...campaign, status: "ACTIVE" });
    const result = await deleteEntityLogic(
      { entityType: "campaign", entityUrn: "urn:li:sponsoredCampaign:123", dry_run: true } as any,
      ctx,
      sdk
    );
    expect(result.dryRun?.wouldSucceed).toBe(false);
    expect(result.dryRun?.validationErrors.map((e) => e.code)).toContain("ACTIVE_NOT_DELETABLE");
  });

  it("execute captures before (live) and after (deleted) + dispatchedCapability", async () => {
    const result = await deleteEntityLogic(
      { entityType: "campaign", entityUrn: "urn:li:sponsoredCampaign:123" } as any,
      ctx,
      sdk
    );
    expect(svc.deleteEntity).toHaveBeenCalledOnce();
    expect(result.before?.status.canonical).toBe("paused");
    expect(result.after?.status.canonical).toBe("deleted");
    expect(result.dispatchedCapability.canonicalEntityKind).toBe("campaign");
  });

  it("out-of-scope kind resolves canonicalEntityKind:null", async () => {
    const result = await deleteEntityLogic(
      { entityType: "creative", entityUrn: "urn:li:sponsoredCreative:5" } as any,
      ctx,
      sdk
    );
    expect(result.dispatchedCapability).toEqual({ operation: "delete", canonicalEntityKind: null });
    expect(result.before).toBeUndefined();
    expect(result.after).toBeUndefined();
    expect(svc.deleteEntity).toHaveBeenCalledOnce();
  });
});
