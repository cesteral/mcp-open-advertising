// Fleet review 2026-09 (#237), msads-mcp findings fixed in the triage pass.
// Every expectation cites the MicrosoftDocs/Advertising v13 page it rests on.
import { describe, it, expect, vi } from "vitest";
import pino from "pino";
import type { RateLimiter } from "@cesteral/shared";
import { createSessionServices } from "../../src/services/session-services.js";
import { MsAdsService } from "../../src/services/msads/msads-service.js";
import type { MsAdsHttpClient } from "../../src/services/msads/msads-http-client.js";
import type { MsAdsAuthAdapter } from "../../src/auth/msads-auth-adapter.js";
import { GetAdDetailsInputSchema } from "../../src/mcp-server/tools/definitions/get-ad-details.tool.js";
import { manageCriterionsTool } from "../../src/mcp-server/tools/definitions/manage-criterions.tool.js";
import { createEntityTool } from "../../src/mcp-server/tools/definitions/create-entity.tool.js";
import { entityExampleAllResource } from "../../src/mcp-server/resources/definitions/entity-examples.resource.js";

const logger = pino({ level: "silent" });
const rateLimiter = { consume: vi.fn().mockResolvedValue(undefined) } as unknown as RateLimiter;

function mockClient(response: unknown = {}): MsAdsHttpClient {
  return {
    get: vi.fn().mockResolvedValue(response),
    post: vi.fn().mockResolvedValue(response),
    put: vi.fn().mockResolvedValue(response),
    delete: vi.fn().mockResolvedValue(response),
  } as unknown as MsAdsHttpClient;
}

describe("#22 MSADS_REPORT_POLL_INTERVAL_MS reaches the reporting service", () => {
  it("passes reportPollIntervalMs to MsAdsReportingService", () => {
    const authAdapter = {
      accountId: "1",
      customerId: "2",
      userId: "3",
    } as unknown as MsAdsAuthAdapter;
    const { msadsReportingService } = createSessionServices(
      authAdapter,
      {
        campaignApiBaseUrl: "https://campaign.example",
        reportingApiBaseUrl: "https://reporting.example",
        customerApiBaseUrl: "https://customer.example",
        reportPollIntervalMs: 12_345,
        reportMaxPollAttempts: 7,
      },
      logger,
      rateLimiter
    );
    const svc = msadsReportingService as unknown as {
      pollIntervalMs: number;
      maxPollAttempts: number;
    };
    expect(svc.pollIntervalMs).toBe(12_345);
    expect(svc.maxPollAttempts).toBe(7);
  });
});

describe("#24 GetAdsByIds takes at most 20 AdIds (getadsbyids.md)", () => {
  it("msads_get_ad_details rejects more than 20 ids at the schema", () => {
    const ids = Array.from({ length: 21 }, (_, i) => String(i + 1));
    expect(GetAdDetailsInputSchema.safeParse({ adIds: ids, adGroupId: "9" }).success).toBe(false);
    expect(
      GetAdDetailsInputSchema.safeParse({ adIds: ids.slice(0, 20), adGroupId: "9" }).success
    ).toBe(true);
  });

  it("MsAdsService.getEntity refuses >20 ad ids before sending anything", async () => {
    const client = mockClient();
    const service = new MsAdsService(rateLimiter, client, logger, { userId: "u", customerId: "c" });
    const ids = Array.from({ length: 21 }, (_, i) => String(i + 1));
    await expect(service.getEntity("ad", ids, { AdGroupId: 9 })).rejects.toThrow(/at most 20/);
    expect(client.post).not.toHaveBeenCalled();
  });
});

describe("#17 manage_criterions example uses a CriterionType Get* accepts", () => {
  it("no example sends CriterionType 'Targets' (getcampaigncriterionsbyids.md: not allowed)", () => {
    for (const ex of manageCriterionsTool.inputExamples ?? []) {
      const data = (ex.input as { data?: { CriterionType?: string } }).data;
      expect(data?.CriterionType).not.toBe("Targets");
    }
  });
});

describe("#18 examples are full v13 Add request bodies", () => {
  it("the create_entity campaign example carries AccountId (addcampaigns.md) and passes the service guard", async () => {
    const example = (createEntityTool.inputExamples ?? []).find(
      (e) => (e.input as { entityType?: string }).entityType === "campaign"
    );
    expect(example).toBeDefined();
    const data = (example!.input as { data: Record<string, unknown> }).data;
    expect(data.AccountId).toBeDefined();

    const client = mockClient({ CampaignIds: [1], PartialErrors: [] });
    const service = new MsAdsService(rateLimiter, client, logger, { userId: "u", customerId: "c" });
    await expect(service.createEntity("campaign", data)).resolves.toBeDefined();
  });

  function jsonBlocks(markdown: string): Array<Record<string, unknown>> {
    return [...markdown.matchAll(/```json\n([\s\S]*?)```/g)].map((m) => JSON.parse(m[1]!));
  }

  it("parent ids sit next to the entity array, never inside the entity", () => {
    const blocks = jsonBlocks(entityExampleAllResource.getContent() as string);
    const byKey = (k: string) => blocks.find((b) => k in b)!;

    // addcampaigns.md: AccountId + Campaigns
    expect(byKey("Campaigns").AccountId).toBeDefined();
    // addadgroups.md: AdGroups + CampaignId; adgroup.md has no CampaignId element
    expect(byKey("AdGroups").CampaignId).toBeDefined();
    // addkeywords.md / addads.md: AdGroupId + the array
    expect(byKey("Keywords").AdGroupId).toBeDefined();
    expect(byKey("Ads").AdGroupId).toBeDefined();

    for (const [plural, parent] of [
      ["AdGroups", "CampaignId"],
      ["Keywords", "AdGroupId"],
      ["Ads", "AdGroupId"],
    ] as const) {
      for (const item of byKey(plural)[plural] as Array<Record<string, unknown>>) {
        expect(item[parent]).toBeUndefined();
      }
    }
  });

  it("the RSA example uses the REST discriminator 'ResponsiveSearch' (responsivesearchad.md)", () => {
    const blocks = jsonBlocks(entityExampleAllResource.getContent() as string);
    const ads = blocks.find((b) => "Ads" in b)!.Ads as Array<Record<string, unknown>>;
    expect(ads[0]!.Type).toBe("ResponsiveSearch");
  });
});
