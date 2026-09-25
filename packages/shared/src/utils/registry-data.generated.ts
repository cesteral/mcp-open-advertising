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
  readonly operational: {
    readonly terminalOperations: readonly {
      readonly tool: string;
      readonly operations: readonly string[];
      readonly note: string;
    }[];
  };
  readonly untrustedPathReporting: "unsupported" | "per-response";
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
      },
      "operational": {
        "terminalOperations": []
      },
      "untrustedPathReporting": "per-response"
    },
    {
      "package": "dv360-mcp",
      "title": "DV360 MCP Server",
      "description": "DV360 campaign management — writes, targeting, custom bidding, previews, and media uploads",
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
      },
      "operational": {
        "terminalOperations": [
          {
            "tool": "dv360_delete_entity",
            "operations": [
              "delete"
            ],
            "note": "HARD delete on most entity types — verified live for campaign, where a subsequent get_entity returns 404. No tool on this server restores it."
          },
          {
            "tool": "dv360_delete_assigned_targeting",
            "operations": [
              "manage"
            ],
            "note": "Removes assigned targeting options. No tool on this server restores it."
          },
          {
            "tool": "dv360_update_entity",
            "operations": [
              "update_status"
            ],
            "note": "Setting entityStatus=ENTITY_STATUS_ARCHIVED is irreversible — DV360 has no unarchive. Terminal only for that status value; other updates are not."
          },
          {
            "tool": "dv360_bulk_update_status",
            "operations": [
              "bulk_update_status"
            ],
            "note": "Setting ENTITY_STATUS_ARCHIVED is irreversible. This is also the required precondition for deleting a line item, so it is on the delete path too."
          }
        ]
      },
      "untrustedPathReporting": "unsupported"
    },
    {
      "package": "ttd-mcp",
      "title": "The Trade Desk MCP Server",
      "description": "The Trade Desk management — CRUD, GraphQL, bulk ops, and async reports",
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
      },
      "operational": {
        "terminalOperations": [
          {
            "tool": "ttd_delete_entity",
            "operations": [
              "delete"
            ],
            "note": "Entity removal. No tool on this server restores it."
          },
          {
            "tool": "ttd_archive_entities",
            "operations": [
              "archive"
            ],
            "note": "Archival is terminal through this server — there is no unarchive tool."
          },
          {
            "tool": "ttd_delete_report_schedule",
            "operations": [
              "delete_schedule"
            ],
            "note": "Deletes the schedule and its future runs. No tool on this server restores it."
          },
          {
            "tool": "ttd_update_entity",
            "operations": [
              "update_status"
            ],
            "note": "Setting Availability=Archived is terminal through this server — the tool's own contract says archived entities cannot be un-archived and no tool restores them. Terminal only for that value."
          },
          {
            "tool": "ttd_bulk_update_status",
            "operations": [
              "bulk_job"
            ],
            "note": "Accepts Archived, which the tool documents as permanent (cannot be un-archived). Terminal only when the batch sets Archived."
          },
          {
            "tool": "ttd_graphql_mutation_bulk",
            "operations": [
              "bulk_job"
            ],
            "note": "Runs up to 1000 arbitrary GraphQL mutations as one non-cancellable job, including delete/archive mutations. No tool on this server reverses them, so treat every run as potentially terminal."
          },
          {
            "tool": "ttd_manage_bid_list",
            "operations": [
              "manage"
            ],
            "note": "The delete action removes a bid list. No tool on this server restores it. Terminal only for action=delete."
          }
        ]
      },
      "untrustedPathReporting": "per-response"
    },
    {
      "package": "gads-mcp",
      "title": "Google Ads MCP Server",
      "description": "Google Ads management — campaign writes, GAQL reporting, bulk mutate, validation, and previews",
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
      },
      "operational": {
        "terminalOperations": [
          {
            "tool": "gads_remove_entity",
            "operations": [
              "delete"
            ],
            "note": "Google Ads REMOVED status is terminal — a removed entity cannot be re-enabled. No tool on this server restores it."
          },
          {
            "tool": "gads_update_entity",
            "operations": [
              "update_status"
            ],
            "note": "Setting status=REMOVED is irreversible — Google Ads cannot re-enable a removed entity (the same fact gads_remove_entity is declared for). Terminal only for that status value; other updates are not."
          },
          {
            "tool": "gads_bulk_update_status",
            "operations": [
              "bulk_job"
            ],
            "note": "Accepts REMOVED, which Google Ads cannot reverse. Terminal only when the batch sets REMOVED; ENABLED/PAUSED batches are reversible."
          }
        ]
      },
      "untrustedPathReporting": "unsupported"
    },
    {
      "package": "meta-mcp",
      "title": "Meta Ads MCP Server",
      "description": "Meta Ads management — writes, insights, targeting, delivery estimates, previews, and media uploads",
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
      },
      "operational": {
        "terminalOperations": [
          {
            "tool": "meta_delete_entity",
            "operations": [
              "delete"
            ],
            "note": "Entity removal. No tool on this server restores it."
          },
          {
            "tool": "meta_update_entity",
            "operations": [
              "update_status"
            ],
            "note": "Setting status=ARCHIVED or DELETED cannot be reversed — the bulk tool documents ARCHIVED as permanent, and DELETED is Meta's deletion. Terminal only for those values."
          },
          {
            "tool": "meta_bulk_update_status",
            "operations": [
              "bulk_job"
            ],
            "note": "Accepts ARCHIVED, which the tool documents as permanent and not reversible. Terminal only when the batch sets ARCHIVED."
          }
        ]
      },
      "untrustedPathReporting": "unsupported"
    },
    {
      "package": "linkedin-mcp",
      "title": "LinkedIn Ads MCP Server",
      "description": "LinkedIn Ads management and analytics — CRUD, targeting, delivery forecasts, and media uploads",
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
      },
      "operational": {
        "terminalOperations": [
          {
            "tool": "linkedin_delete_entity",
            "operations": [
              "delete"
            ],
            "note": "Entity removal. No tool on this server restores it."
          },
          {
            "tool": "linkedin_update_entity",
            "operations": [
              "update_status"
            ],
            "note": "Setting status=ARCHIVED or CANCELED is terminal through this server — the bulk tool documents that ARCHIVED entities cannot be reactivated, and CANCELED is LinkedIn's end state. Terminal only for those values."
          },
          {
            "tool": "linkedin_bulk_update_status",
            "operations": [
              "bulk_job"
            ],
            "note": "Accepts ARCHIVED (documented by the tool as not reactivatable) and CANCELED. Terminal only when the batch sets one of those; ACTIVE/PAUSED/DRAFT are reversible."
          }
        ]
      },
      "untrustedPathReporting": "unsupported"
    },
    {
      "package": "tiktok-mcp",
      "title": "TikTok Ads MCP Server",
      "description": "TikTok Ads management — CRUD, async reports, targeting, and media uploads",
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
      },
      "operational": {
        "terminalOperations": [
          {
            "tool": "tiktok_delete_entity",
            "operations": [
              "bulk_job"
            ],
            "note": "Bulk entity removal. No tool on this server restores it."
          },
          {
            "tool": "tiktok_update_entity",
            "operations": [
              "update_status"
            ],
            "note": "Setting operation_status=DELETE is irreversible on TikTok — the same effect as tiktok_delete_entity. Terminal only for that status value."
          },
          {
            "tool": "tiktok_bulk_update_status",
            "operations": [
              "bulk_job"
            ],
            "note": "Accepts DELETE, which the tool documents as irreversible. Terminal only when the batch sets DELETE; ENABLE/DISABLE are reversible."
          }
        ]
      },
      "untrustedPathReporting": "unsupported"
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
      },
      "operational": {
        "terminalOperations": [
          {
            "tool": "cm360_delete_entity",
            "operations": [
              "manage"
            ],
            "note": "Entity removal. No tool on this server restores it."
          },
          {
            "tool": "cm360_delete_report_schedule",
            "operations": [
              "delete_schedule"
            ],
            "note": "Deletes the schedule and its future runs. No tool on this server restores it."
          },
          {
            "tool": "cm360_update_entity",
            "operations": [
              "update_status"
            ],
            "note": "Setting a placement to PLACEMENT_STATUS_PERMANENTLY_ARCHIVED is irreversible by definition. Terminal only for that value; ordinary archive (archived=true) is reversible via ACTIVE."
          },
          {
            "tool": "cm360_bulk_update_status",
            "operations": [
              "bulk_job"
            ],
            "note": "Accepts PERMANENTLY_ARCHIVED for placements, which cannot be undone. Terminal only for that value; ARCHIVED/ACTIVE/INACTIVE are reversible."
          }
        ]
      },
      "untrustedPathReporting": "unsupported"
    },
    {
      "package": "snapchat-mcp",
      "title": "Snapchat Ads MCP Server",
      "description": "Snapchat Ads management — CRUD, async reports, targeting, and audience estimates",
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
      },
      "operational": {
        "terminalOperations": [
          {
            "tool": "snapchat_delete_entity",
            "operations": [
              "bulk_job"
            ],
            "note": "Bulk entity removal. No tool on this server restores it."
          }
        ]
      },
      "untrustedPathReporting": "unsupported"
    },
    {
      "package": "sa360-mcp",
      "title": "Search Ads 360 MCP Server",
      "description": "Search Ads 360 — reporting via query language, insights, and offline conversion upload",
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
      },
      "operational": {
        "terminalOperations": []
      },
      "untrustedPathReporting": "unsupported"
    },
    {
      "package": "pinterest-mcp",
      "title": "Pinterest Ads MCP Server",
      "description": "Pinterest Ads management — CRUD, async reports, targeting, and audience estimates",
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
      },
      "operational": {
        "terminalOperations": [
          {
            "tool": "pinterest_delete_entity",
            "operations": [
              "bulk_job"
            ],
            "note": "Deletes Pins (creative) and ARCHIVES campaigns, ad groups and ads — Pinterest v5 has no DELETE for those. No tool on this server restores either."
          },
          {
            "tool": "pinterest_update_entity",
            "operations": [
              "update_status"
            ],
            "note": "Setting status=ARCHIVED is Pinterest's soft delete; no tool on this server unarchives, so treat it as terminal. Terminal only for that value."
          },
          {
            "tool": "pinterest_bulk_update_status",
            "operations": [
              "bulk_job"
            ],
            "note": "Accepts ARCHIVED (documented by the tool as a soft delete); no tool on this server reverses it. Terminal only when the batch sets ARCHIVED."
          }
        ]
      },
      "untrustedPathReporting": "unsupported"
    },
    {
      "package": "amazon-dsp-mcp",
      "title": "Amazon DSP MCP Server",
      "description": "Amazon DSP management — CRUD, async reports, targeting, and audience management",
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
      },
      "operational": {
        "terminalOperations": [
          {
            "tool": "amazon_dsp_delete_entity",
            "operations": [
              "bulk_job"
            ],
            "note": "Bulk removal of orders / line items. No tool on this server restores it."
          },
          {
            "tool": "amazon_dsp_update_entity",
            "operations": [
              "update_status"
            ],
            "note": "Setting state=ARCHIVED is Amazon DSP's only removal path (no hard delete) and no tool on this server restores an archived order or line item. Terminal only for that value."
          },
          {
            "tool": "amazon_dsp_bulk_update_status",
            "operations": [
              "bulk_job"
            ],
            "note": "Accepts ARCHIVED (documented by the tool as a soft delete); no tool on this server reverses it. Terminal only when the batch sets ARCHIVED."
          }
        ]
      },
      "untrustedPathReporting": "unsupported"
    },
    {
      "package": "msads-mcp",
      "title": "Microsoft Advertising MCP Server",
      "description": "Microsoft Ads management — CRUD, Google Ads import, ad extensions, and async reports",
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
      },
      "operational": {
        "terminalOperations": [
          {
            "tool": "msads_delete_entity",
            "operations": [
              "bulk_job"
            ],
            "note": "Bulk entity removal. No tool on this server restores it."
          },
          {
            "tool": "msads_delete_report_schedule",
            "operations": [
              "delete_schedule"
            ],
            "note": "Deletes nothing: Microsoft Advertising Reporting v13 has no report schedules, so this tool refuses every call without contacting the API. Declared only because its name marks it destructive."
          },
          {
            "tool": "msads_update_entity",
            "operations": [
              "update_status"
            ],
            "note": "Setting Status=Deleted removes the entity; Microsoft Advertising has no undelete and no tool on this server restores it. Terminal only for that status value."
          },
          {
            "tool": "msads_bulk_update_status",
            "operations": [
              "bulk_job"
            ],
            "note": "Accepts Deleted (free-form status), which cannot be reversed. Terminal only when the batch sets Deleted; Active/Paused are reversible."
          }
        ]
      },
      "untrustedPathReporting": "unsupported"
    }
  ]
} as const;
