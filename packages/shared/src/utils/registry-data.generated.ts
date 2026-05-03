// AUTO-GENERATED from registry.json by scripts/sync-registry-data.mjs.
// Do not edit by hand — re-run `pnpm sync-registry-data` after editing registry.json.

export interface RegistryServerEntry {
  readonly package: string;
  readonly title: string;
  readonly description: string;
  readonly runtime_description: string;
  readonly platform: string;
  readonly platform_display_name: string;
  readonly documentation_url: string;
  readonly auth: { readonly modes: readonly string[] };
}

export interface RegistryData {
  readonly protocol_version: string;
  readonly servers: readonly RegistryServerEntry[];
}

export const REGISTRY_DATA: RegistryData = {
  "protocol_version": "2025-11-25",
  "servers": [
    {
      "package": "dbm-mcp",
      "title": "Bid Manager MCP Server",
      "description": "Bid Manager reporting and query workflows for DV360 campaign performance analysis",
      "runtime_description": "Display & Video 360 Bid Manager reporting (delivery, pacing, custom queries).",
      "platform": "Google Bid Manager (DV360)",
      "platform_display_name": "DBM",
      "documentation_url": "https://developers.google.com/bid-manager",
      "auth": {
        "modes": [
          "google-headers",
          "jwt",
          "none"
        ]
      }
    },
    {
      "package": "dv360-mcp",
      "title": "DV360 MCP Server",
      "description": "Self-hostable DV360 MCP connector for campaign writes, targeting, custom bidding, previews, and media operations",
      "runtime_description": "Display & Video 360 campaign, line item, creative, and targeting management.",
      "platform": "Google Display & Video 360",
      "platform_display_name": "DV360",
      "documentation_url": "https://developers.google.com/display-video",
      "auth": {
        "modes": [
          "google-headers",
          "jwt",
          "none"
        ]
      }
    },
    {
      "package": "ttd-mcp",
      "title": "The Trade Desk MCP Server",
      "description": "The Trade Desk campaign management and reporting — CRUD, GraphQL, bulk ops, and async reports",
      "runtime_description": "The Trade Desk REST + GraphQL + Workflows API: campaigns, ad groups, creatives, bid lists, seeds, reporting.",
      "platform": "The Trade Desk",
      "platform_display_name": "TTD",
      "documentation_url": "https://api.thetradedesk.com/v3/portal/api/doc/Welcome",
      "auth": {
        "modes": [
          "ttd-token",
          "jwt",
          "none"
        ]
      }
    },
    {
      "package": "gads-mcp",
      "title": "Google Ads MCP Server",
      "description": "Self-hostable Google Ads MCP connector for campaign writes, GAQL reporting, bulk mutate, validation, and previews",
      "runtime_description": "Google Ads search, display, and shopping campaign management with GAQL queries.",
      "platform": "Google Ads",
      "platform_display_name": "Google Ads",
      "documentation_url": "https://developers.google.com/google-ads/api",
      "auth": {
        "modes": [
          "gads-headers",
          "jwt",
          "none"
        ]
      }
    },
    {
      "package": "meta-mcp",
      "title": "Meta Ads MCP Server",
      "description": "Self-hostable Meta Ads MCP connector for campaign writes, insights, targeting, delivery estimates, previews, and media operations",
      "runtime_description": "Meta Marketing API: Facebook/Instagram campaigns, ad sets, ads, audiences, insights.",
      "platform": "Meta (Facebook/Instagram)",
      "platform_display_name": "Meta",
      "documentation_url": "https://developers.facebook.com/docs/marketing-apis",
      "auth": {
        "modes": [
          "meta-bearer",
          "jwt",
          "none"
        ]
      }
    },
    {
      "package": "linkedin-mcp",
      "title": "LinkedIn Ads MCP Server",
      "description": "LinkedIn Ads campaign management and analytics — CRUD, targeting, delivery forecasts, and media upload",
      "runtime_description": "LinkedIn Marketing API: campaigns, creatives, audiences, conversions, analytics.",
      "platform": "LinkedIn Ads",
      "platform_display_name": "LinkedIn",
      "documentation_url": "https://learn.microsoft.com/en-us/linkedin/marketing/",
      "auth": {
        "modes": [
          "linkedin-bearer",
          "jwt",
          "none"
        ]
      }
    },
    {
      "package": "tiktok-mcp",
      "title": "TikTok Ads MCP Server",
      "description": "TikTok Ads campaign management and reporting — CRUD, async reports, targeting, and media upload",
      "runtime_description": "TikTok Marketing API: campaigns, ad groups, ads, creatives, reporting.",
      "platform": "TikTok Ads",
      "platform_display_name": "TikTok",
      "documentation_url": "https://business-api.tiktok.com/portal/docs",
      "auth": {
        "modes": [
          "tiktok-bearer",
          "jwt",
          "none"
        ]
      }
    },
    {
      "package": "cm360-mcp",
      "title": "Campaign Manager 360 MCP Server",
      "description": "Campaign Manager 360 management — CRUD, Floodlight tracking, async reporting, and targeting",
      "runtime_description": "Campaign Manager 360 ad serving, placements, creatives, and Floodlight tracking.",
      "platform": "Google Campaign Manager 360",
      "platform_display_name": "CM360",
      "documentation_url": "https://developers.google.com/doubleclick-advertisers",
      "auth": {
        "modes": [
          "google-headers",
          "jwt",
          "none"
        ]
      }
    },
    {
      "package": "snapchat-mcp",
      "title": "Snapchat Ads MCP Server",
      "description": "Snapchat Ads campaign management and reporting — CRUD, async reports, targeting, and audience estimates",
      "runtime_description": "Snapchat Ads API: campaigns, ad squads, ads, creatives, reporting.",
      "platform": "Snapchat Ads",
      "platform_display_name": "Snapchat",
      "documentation_url": "https://marketingapi.snapchat.com/docs/",
      "auth": {
        "modes": [
          "snapchat-bearer",
          "jwt",
          "none"
        ]
      }
    },
    {
      "package": "sa360-mcp",
      "title": "Search Ads 360 MCP Server",
      "description": "Search Ads 360 reporting and conversion management — query language, insights, and offline conversions",
      "runtime_description": "Search Ads 360 reporting and offline conversion uploads.",
      "platform": "Google Search Ads 360",
      "platform_display_name": "Search Ads 360",
      "documentation_url": "https://developers.google.com/search-ads/v0/reference",
      "auth": {
        "modes": [
          "sa360-headers",
          "jwt",
          "none"
        ]
      }
    },
    {
      "package": "pinterest-mcp",
      "title": "Pinterest Ads MCP Server",
      "description": "Pinterest Ads campaign management and reporting — CRUD, async reports, targeting, and audience estimates",
      "runtime_description": "Pinterest Ads API: campaigns, ad groups, ads, creatives, reporting.",
      "platform": "Pinterest Ads",
      "platform_display_name": "Pinterest",
      "documentation_url": "https://developers.pinterest.com/docs/api/v5/",
      "auth": {
        "modes": [
          "pinterest-bearer",
          "jwt",
          "none"
        ]
      }
    },
    {
      "package": "amazon-dsp-mcp",
      "title": "Amazon DSP MCP Server",
      "description": "Amazon DSP campaign management and reporting — CRUD, async reports, targeting, and audience management",
      "runtime_description": "Amazon DSP: orders, line items, creatives, reporting.",
      "platform": "Amazon DSP",
      "platform_display_name": "Amazon DSP",
      "documentation_url": "https://advertising.amazon.com/API/docs/en-us/",
      "auth": {
        "modes": [
          "amazon-dsp-bearer",
          "jwt",
          "none"
        ]
      }
    },
    {
      "package": "msads-mcp",
      "title": "Microsoft Advertising MCP Server",
      "description": "Microsoft Advertising campaign management and reporting — CRUD, Google Ads import, ad extensions, and async reports",
      "runtime_description": "Microsoft Advertising: campaigns, ad groups, ads, keywords, ad extensions, reporting, Google Ads import.",
      "platform": "Microsoft Advertising",
      "platform_display_name": "Microsoft Ads",
      "documentation_url": "https://learn.microsoft.com/en-us/advertising/guides/",
      "auth": {
        "modes": [
          "msads-bearer",
          "jwt",
          "none"
        ]
      }
    }
  ]
} as const;
