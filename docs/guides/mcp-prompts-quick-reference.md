# MCP Prompts Quick Reference

## What Are MCP Prompts?

MCP Prompts are **on-demand workflow guides** that AI agents can invoke when they need step-by-step instructions for complex operations.

## Context Cost Comparison

```
┌─────────────────┬──────────────┬─────────────────────────┐
│ Feature         │ Context Cost │ When Loaded             │
├─────────────────┼──────────────┼─────────────────────────┤
│ Tools           │ ~20KB        │ Always in context       │
│ Resources       │ 0KB          │ Only when fetched       │
│ Prompts         │ 0KB          │ Only when invoked       │
└─────────────────┴──────────────┴─────────────────────────┘
```

## Available Prompts by Server

### dbm-mcp (6 prompts)

| Prompt                                  | Description                                                                                                                                                                                                                                 | Key Arguments                                                          |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `cross_platform_campaign_setup`         | Guide for setting up a coordinated multi-platform campaign across DV360, TTD, Google Ads, Meta, LinkedIn, TikTok, Pinterest, Snapchat, and Amazon DSP. Covers platform selection, budget allocation, naming conventions, and phased launch. | `totalBudget` (optional); `objective` (optional)                       |
| `cross_platform_performance_comparison` | Guide for comparing campaign performance across DV360, TTD, Google Ads, and Meta. Normalizes metrics, identifies top performers, and recommends budget reallocation.                                                                        | `dateRange` (optional)                                                 |
| `custom_query_workflow`                 | Step-by-step guide for building custom Bid Manager queries with the `dbm_run_custom_query` tool.                                                                                                                                            | `advertiserId` (required); `queryGoal` (optional)                      |
| `pacing_performance_analysis_workflow`  | Step-by-step guide for DV360 pacing assessment and performance deep-dive: check delivery pacing, analyze CPM/CTR/CPA/ROAS, identify historical trends, and recommend bid/budget adjustments via dv360-mcp.                                  | `campaignId` (required); `advertiserId` (required); `focus` (optional) |
| `tool_schema_exploration_workflow`      | Step-by-step workflow for exploring available MCP tools, prompts, and resources with minimal context usage.                                                                                                                                 | `serverFocus` (optional); `objective` (optional)                       |
| `troubleshoot_report`                   | Diagnostic workflow for debugging failed Bid Manager queries and common issues.                                                                                                                                                             | `errorMessage` (optional); `queryType` (optional)                      |

### dv360-mcp (13 prompts)

| Prompt                                  | Description                                                                                                                                                                                                            | Key Arguments                                                                                                 |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `budget_reallocation_workflow`          | Guide for reallocating budget across insertion orders and line items based on performance data. Includes performance analysis, reallocation formulas, and execution steps with DV360-specific constraints.             | `advertiserId` (required); `campaignId` (optional)                                                            |
| `bulk_operations_workflow`              | Step-by-step guide for DV360 bulk operations: batch create entities, batch update with updateMask, batch status changes, and batch bid adjustments. Covers safety checks, partial failure handling, and verification.  | `advertiserId` (required); `operation` (optional)                                                             |
| `creative_setup_workflow`               | Step-by-step guide for creating DV360 display and video creatives.                                                                                                                                                     | `advertiserId` (required)                                                                                     |
| `cross_platform_campaign_setup`         | Multi-platform campaign setup guide with budget allocation, naming conventions, and phased launch.                                                                                                                     | `totalBudget` (optional); `objective` (optional)                                                              |
| `cross_platform_performance_comparison` | Cross-platform performance comparison and budget reallocation guide.                                                                                                                                                   | `dateRange` (optional)                                                                                        |
| `custom_bidding_workflow`               | Step-by-step guide for DV360 custom bidding: create algorithms, upload scripts, manage rules, check model readiness, and assign to line items.                                                                         | `advertiserId` (required); `algorithmType` (optional)                                                         |
| `dv360_tool_schema_exploration`         | Step-by-step workflow for exploring available DV360 MCP tools, prompts, and resources with minimal context usage.                                                                                                      | `objective` (optional)                                                                                        |
| `entity_activation_workflow`            | Safe step-by-step guide for activating DV360 entities in the correct order: validate budgets, activate Insertion Orders first, then Line Items, then Campaign. Includes pre-flight checks and rollback guidance.       | `advertiserId` (required); `campaignId` (required)                                                            |
| `entity_duplication_workflow`           | Step-by-step guide for duplicating DV360 entities (campaigns, insertion orders, line items) using the get-then-create pattern. DV360 has no native copy API.                                                           | `advertiserId` (required); `entityType` (required); `sourceEntityId` (optional); `includeChildren` (optional) |
| `entity_update_execution_workflow`      | Step-by-step execution workflow for safe DV360 entity updates using schema-first validation and updateMask discipline.                                                                                                 | `advertiserId` (required); `entityType` (required); `changeGoal` (optional)                                   |
| `full_campaign_setup_workflow`          | Step-by-step guide for creating a complete DV360 campaign structure including campaign, insertion order, line items, and optional targeting. Includes validation rules, common pitfalls, and troubleshooting guidance. | `advertiserId` (required); `includeTargeting` (optional)                                                      |
| `targeting_management_workflow`         | Step-by-step guide for managing DV360 targeting options: discover available types, create assignments, audit configurations, and delete options. Covers geo, audience, device, content, and all 49 targeting types.    | `advertiserId` (required); `parentType` (optional); `goal` (optional)                                         |
| `troubleshoot_underdelivery`            | Step-by-step guide for diagnosing and fixing underdelivering campaigns or line items in DV360. Covers pacing analysis, configuration checks, targeting review, and corrective actions.                                 | `advertiserId` (required); `entityType` (optional); `entityId` (optional)                                     |

### ttd-mcp (11 prompts)

| Prompt                                  | Description                                                                                                                                                                | Key Arguments                                                                |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `cross_platform_campaign_setup`         | Multi-platform campaign setup guide with budget allocation, naming conventions, and phased launch.                                                                         | `totalBudget` (optional); `objective` (optional)                             |
| `cross_platform_performance_comparison` | Cross-platform performance comparison and budget reallocation guide.                                                                                                       | `dateRange` (optional)                                                       |
| `ttd_bulk_operations_workflow`          | Step-by-step guide for TTD bulk operations: batch create entities, batch update, and batch status changes. Covers partial failure handling and verification.               | `partnerId` (required); `operation` (optional)                               |
| `ttd_campaign_setup_workflow`           | Step-by-step guide for creating a complete TTD campaign structure (Campaign → Ad Group → Ad).                                                                              | `partnerId` (required)                                                       |
| `ttd_creative_setup_workflow`           | Step-by-step guide for creating TTD creatives (display, video, native) and uploading assets.                                                                               | `partnerId` (required); `creativeType` (optional)                            |
| `ttd_entity_duplication_workflow`       | Step-by-step guide for duplicating TTD campaigns, ad groups, and ads using `ttd_duplicate_entity` — covers A/B testing, scaling, and common patterns.                      | `partnerId` (required); `entityType` (required); `sourceEntityId` (required) |
| `ttd_entity_update_workflow`            | Step-by-step guide for safely updating TTD entities — covers field updates vs status changes (separate endpoints), budget values in advertiser currency, and verification. | `partnerId` (required); `entityType` (required); `entityId` (required)       |
| `ttd_report_generation_workflow`        | Guide for submitting and retrieving TTD async reports with dimensions, metrics, and breakdowns.                                                                            | `partnerId` (required); `reportLevel` (optional)                             |
| `ttd_targeting_discovery_workflow`      | Step-by-step guide for researching TTD audiences: search segments, browse categories, build targeting configs, and estimate audience size before ad group creation.        | `partnerId` (required); `goal` (optional)                                    |
| `ttd_tool_schema_exploration`           | Guide for discovering and understanding TTD MCP tools, resources, and schemas.                                                                                             | `objective` (optional)                                                       |
| `ttd_troubleshoot_entity`               | Diagnostic workflow for troubleshooting common TTD entity creation, update, and delivery errors.                                                                           | `entityType` (required)                                                      |

### gads-mcp (11 prompts)

| Prompt                                  | Description                                                                                                                                                                                                                     | Key Arguments                                                                 |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `creative_setup_workflow`               | Step-by-step guide for creating Google Ads responsive display ads and video creatives.                                                                                                                                          | `customerId` (required)                                                       |
| `cross_platform_campaign_setup`         | Multi-platform campaign setup guide with budget allocation, naming conventions, and phased launch.                                                                                                                              | `totalBudget` (optional); `objective` (optional)                              |
| `cross_platform_performance_comparison` | Cross-platform performance comparison and budget reallocation guide.                                                                                                                                                            | `dateRange` (optional)                                                        |
| `gads_bulk_operations_workflow`         | Step-by-step guide for Google Ads bulk operations: batch mutate (create+update+remove), batch status changes, batch bid adjustments, and entity removal. Covers atomic vs partial failure, micros conversion, and verification. | `customerId` (required); `operation` (optional)                               |
| `gads_campaign_setup_workflow`          | Step-by-step workflow for creating a complete Google Ads Search campaign (Budget → Campaign → Ad Group → Ads → Keywords).                                                                                                       | `customerId` (required)                                                       |
| `gads_entity_duplication_workflow`      | Step-by-step guide for duplicating Google Ads entities (campaigns, adGroups, ads, keywords) using the get-then-create pattern. Covers field stripping, naming conventions, and budget handling.                                 | `customerId` (required); `entityType` (required); `sourceEntityId` (required) |
| `gads_entity_update_workflow`           | Step-by-step guide for safely updating Google Ads entities. Covers the read-then-update pattern with explicit `updateMask` for campaigns, adGroups, ads, keywords, campaignBudgets, and assets.                                 | `customerId` (required); `entityType` (required); `entityId` (required)       |
| `gads_targeting_discovery_workflow`     | Step-by-step guide for discovering and analyzing Google Ads targeting segments via GAQL. Covers audience, keyword, geographic, and device targeting, plus performance insights by segment.                                      | `customerId` (required); `campaignId` (optional)                              |
| `gads_tool_schema_exploration`          | Step-by-step workflow for exploring available Google Ads MCP tools, prompts, and resources with minimal context usage.                                                                                                          | `objective` (optional)                                                        |
| `gads_troubleshoot_entity`              | Step-by-step diagnostic workflow for troubleshooting Google Ads entity errors and common issues.                                                                                                                                | `entityType` (optional); `errorMessage` (optional)                            |
| `gaql_reporting_workflow`               | Step-by-step workflow for querying Google Ads performance data via GAQL, including common query patterns, field selection, and filtering.                                                                                       | `customerId` (required)                                                       |

### meta-mcp (11 prompts)

| Prompt                                  | Description                                                                                                                                                                                                          | Key Arguments                                       |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `creative_upload_workflow`              | Step-by-step guide for uploading creative assets and creating Meta Ads creatives (images and videos).                                                                                                                | `adAccountId` (required); `creativeType` (optional) |
| `cross_platform_campaign_setup`         | Multi-platform campaign setup guide with budget allocation, naming conventions, and phased launch.                                                                                                                   | `totalBudget` (optional); `objective` (optional)    |
| `cross_platform_performance_comparison` | Cross-platform performance comparison and budget reallocation guide.                                                                                                                                                 | `dateRange` (optional)                              |
| `meta_bulk_operations_workflow`         | Step-by-step guide for Meta Ads bulk operations: batch create entities, batch update entities, batch status changes, and batch bid adjustments. Covers partial failure handling and verification.                    | `adAccountId` (required); `operation` (optional)    |
| `meta_campaign_setup_workflow`          | Step-by-step guide for creating a complete Meta Ads campaign structure (Campaign → Ad Set → Ad Creative → Ad).                                                                                                       | `adAccountId` (required)                            |
| `meta_entity_duplication_workflow`      | Step-by-step guide for duplicating Meta Ads campaigns, ad sets, and ads using `meta_duplicate_entity` — covers A/B testing, scaling, and common patterns.                                                            | `entityType` (required); `entityId` (required)      |
| `meta_entity_update_workflow`           | Step-by-step guide for safely updating Meta Ads entities: fetch current state, build partial update payload, execute update, and verify changes. Covers campaigns, ad sets, ads, ad creatives, and custom audiences. | `entityType` (required); `entityId` (required)      |
| `meta_insights_reporting_workflow`      | Guide for querying Meta Ads performance insights with breakdowns and attribution.                                                                                                                                    | `adAccountId` (required); `entityLevel` (optional)  |
| `meta_targeting_discovery_workflow`     | Step-by-step guide for researching Meta Ads audiences: search interests, browse categories, build targeting specs, and estimate reach before ad set creation.                                                        | `adAccountId` (required); `goal` (optional)         |
| `meta_tool_schema_exploration`          | Guide for discovering and understanding Meta MCP tools, resources, and schemas.                                                                                                                                      | `objective` (optional)                              |
| `meta_troubleshoot_entity`              | Diagnostic workflow for troubleshooting Meta Ads entity issues.                                                                                                                                                      | `entityType` (required); `entityId` (required)      |

### linkedin-mcp (11 prompts)

| Prompt                                  | Description                                                                                                                                                                     | Key Arguments                                            |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `creative_upload_workflow`              | Step-by-step guide for uploading images and creating LinkedIn Sponsored Content creatives.                                                                                      | `adAccountUrn` (required)                                |
| `cross_platform_campaign_setup`         | Multi-platform campaign setup guide with budget allocation, naming conventions, and phased launch.                                                                              | `totalBudget` (optional); `objective` (optional)         |
| `cross_platform_performance_comparison` | Cross-platform performance comparison and budget reallocation guide.                                                                                                            | `dateRange` (optional)                                   |
| `linkedin_analytics_reporting_workflow` | Guide for querying LinkedIn Ads analytics with pivots, time granularities, and breakdowns.                                                                                      | `adAccountUrn` (required); `pivot` (optional)            |
| `linkedin_bulk_operations_workflow`     | Guide for performing bulk create, update, and status operations on LinkedIn Ads entities.                                                                                       | `adAccountUrn` (required); `operation` (optional)        |
| `linkedin_campaign_setup_workflow`      | Step-by-step guide for creating a complete LinkedIn Ads campaign structure (Campaign Group → Campaign → Creative).                                                              | `adAccountUrn` (required); `includeTargeting` (optional) |
| `linkedin_entity_duplication_workflow`  | Step-by-step guide for duplicating LinkedIn Ads campaign groups, campaigns, and creatives using `linkedin_duplicate_entity` — covers A/B testing, scaling, and common patterns. | `entityType` (required); `entityUrn` (required)          |
| `linkedin_entity_update_workflow`       | Step-by-step guide for safely updating LinkedIn Ads entities using PATCH semantics with URN-based IDs. Covers campaign groups, campaigns, creatives, and conversion rules.      | `entityType` (required); `entityUrn` (required)          |
| `linkedin_targeting_discovery_workflow` | Step-by-step guide for researching LinkedIn audiences: search facets, browse categories, build targeting criteria, and estimate delivery before campaign creation.              | `adAccountUrn` (required); `goal` (optional)             |
| `linkedin_tool_schema_exploration`      | Guide for discovering and understanding LinkedIn MCP tools, resources, and schemas.                                                                                             | `objective` (optional)                                   |
| `linkedin_troubleshoot_entity`          | Diagnostic workflow for troubleshooting LinkedIn Ads entity issues.                                                                                                             | `entityType` (required); `entityUrn` (required)          |

### tiktok-mcp (11 prompts)

| Prompt                                  | Description                                                                                                                                                                                               | Key Arguments                                                             |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `creative_upload_workflow`              | Step-by-step guide for uploading creative assets and creating TikTok Ads creatives.                                                                                                                       | `advertiserId` (required); `creativeType` (optional)                      |
| `cross_platform_campaign_setup`         | Multi-platform campaign setup guide with budget allocation, naming conventions, and phased launch.                                                                                                        | `totalBudget` (optional); `objective` (optional)                          |
| `cross_platform_performance_comparison` | Cross-platform performance comparison and budget reallocation guide.                                                                                                                                      | `dateRange` (optional)                                                    |
| `tiktok_bulk_operations_workflow`       | Guide for performing bulk create, update, and status operations on TikTok Ads entities.                                                                                                                   | `advertiserId` (required); `entityType` (optional)                        |
| `tiktok_campaign_setup_workflow`        | Step-by-step guide for creating a complete TikTok Ads campaign structure (Campaign → Ad Group → Ad).                                                                                                      | `advertiserId` (required); `objective` (optional)                         |
| `tiktok_entity_duplication_workflow`    | Step-by-step guide for duplicating TikTok Ads campaigns, ad groups, and ads using `tiktok_duplicate_entity` — covers A/B testing, scaling, and common patterns.                                           | `entityType` (required); `entityId` (required); `advertiserId` (required) |
| `tiktok_entity_update_workflow`         | Step-by-step guide for safely updating TikTok Ads entities — covers field updates vs status changes (separate endpoints), budget values in account currency, and verification.                            | `entityType` (required); `entityId` (required); `advertiserId` (required) |
| `tiktok_reporting_workflow`             | Guide for submitting and retrieving TikTok Ads async reports with dimensions, metrics, and breakdowns.                                                                                                    | `advertiserId` (required); `reportLevel` (optional)                       |
| `tiktok_targeting_discovery_workflow`   | Step-by-step guide for researching TikTok audiences: search geo and ISP targeting tags, browse official targeting metadata, build targeting configs, and estimate audience size before ad group creation. | `advertiserId` (required); `goal` (optional)                              |
| `tiktok_tool_schema_exploration`        | Guide for discovering and understanding TikTok MCP tools, resources, and schemas.                                                                                                                         | `objective` (optional)                                                    |
| `tiktok_troubleshoot_entity`            | Diagnostic workflow for troubleshooting TikTok Ads entity issues.                                                                                                                                         | `entityType` (required); `entityId` (required); `advertiserId` (required) |

### cm360-mcp (10 prompts)

| Prompt                                  | Description                                                                                        | Key Arguments                                     |
| --------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `cm360_bulk_operations_workflow`        | Guide for batch operations on CM360 entities.                                                      | `profileId` (required); `operation` (optional)    |
| `cm360_campaign_setup_workflow`         | Step-by-step guide for creating a complete CM360 campaign structure.                               | `profileId` (required); `advertiserId` (required) |
| `cm360_entity_update_workflow`          | Safe entity update workflow for CM360 (PUT semantics — full object required).                      | `entityType` (required); `entityId` (required)    |
| `cm360_floodlight_workflow`             | Guide for setting up CM360 Floodlight conversion tracking.                                         | `profileId` (required); `advertiserId` (required) |
| `cm360_reporting_workflow`              | Guide for generating async CM360 reports.                                                          | `profileId` (required)                            |
| `cm360_targeting_discovery_workflow`    | Guide for browsing CM360 targeting options.                                                        | `profileId` (required)                            |
| `cm360_tool_schema_exploration`         | Guide for discovering and understanding CM360 MCP tools, resources, and schemas.                   | `objective` (optional)                            |
| `cm360_troubleshoot_entity`             | Diagnostic workflow for troubleshooting CM360 entity issues.                                       | `entityType` (required); `entityId` (required)    |
| `cross_platform_campaign_setup`         | Multi-platform campaign setup guide with budget allocation, naming conventions, and phased launch. | `totalBudget` (optional); `objective` (optional)  |
| `cross_platform_performance_comparison` | Cross-platform performance comparison and budget reallocation guide.                               | `dateRange` (optional)                            |

### snapchat-mcp (10 prompts)

| Prompt                                  | Description                                                                                                                                                                        | Key Arguments                                                            |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `creative_upload_workflow`              | Step-by-step guide for uploading creative assets and creating Snapchat Ads creatives.                                                                                              | `adAccountId` (required); `creativeType` (optional)                      |
| `cross_platform_campaign_setup`         | Multi-platform campaign setup guide with budget allocation, naming conventions, and phased launch.                                                                                 | `totalBudget` (optional); `objective` (optional)                         |
| `cross_platform_performance_comparison` | Cross-platform performance comparison and budget reallocation guide.                                                                                                               | `dateRange` (optional)                                                   |
| `snapchat_bulk_operations_workflow`     | Guide for performing bulk create, update, and status operations on Snapchat Ads entities.                                                                                          | `adAccountId` (required); `entityType` (optional)                        |
| `snapchat_campaign_setup_workflow`      | Step-by-step guide for creating a complete Snapchat Ads campaign structure (Campaign → Ad Squad → Ad).                                                                             | `adAccountId` (required); `objective` (optional)                         |
| `snapchat_entity_update_workflow`       | Step-by-step guide for safely updating Snapchat Ads entities — covers field updates vs status changes (separate endpoints), budget values in account currency, and verification.   | `entityType` (required); `entityId` (required); `adAccountId` (required) |
| `snapchat_reporting_workflow`           | Guide for submitting and retrieving Snapchat Ads async reports with dimensions, metrics, and breakdowns.                                                                           | `adAccountId` (required); `reportLevel` (optional)                       |
| `snapchat_targeting_discovery_workflow` | Step-by-step guide for researching Snapchat audiences: search interest categories, browse behaviors, build targeting configs, and estimate audience size before ad group creation. | `adAccountId` (required); `goal` (optional)                              |
| `snapchat_tool_schema_exploration`      | Guide for discovering and understanding Snapchat MCP tools, resources, and schemas.                                                                                                | `objective` (optional)                                                   |
| `snapchat_troubleshoot_entity`          | Diagnostic workflow for troubleshooting Snapchat Ads entity issues.                                                                                                                | `entityType` (required); `entityId` (required); `adAccountId` (required) |

### sa360-mcp (7 prompts)

| Prompt                                  | Description                                                                                        | Key Arguments                                    |
| --------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `cross_platform_campaign_setup`         | Multi-platform campaign setup guide with budget allocation, naming conventions, and phased launch. | `totalBudget` (optional); `objective` (optional) |
| `cross_platform_performance_comparison` | Cross-platform performance comparison and budget reallocation guide.                               | `dateRange` (optional)                           |
| `sa360_conversion_upload_workflow`      | Guide for uploading offline conversions to SA360 via the legacy v2 API.                            | `agencyId` (required); `advertiserId` (required) |
| `sa360_cross_engine_reporting_workflow` | Guide for unified cross-engine reporting across Google Ads, Microsoft Ads, Yahoo Japan, and Baidu. | `customerId` (required)                          |
| `sa360_query_language_workflow`         | Guide for writing SA360 query language queries.                                                    | `customerId` (required)                          |
| `sa360_tool_schema_exploration`         | Guide for discovering and understanding SA360 MCP tools, resources, and schemas.                   | `objective` (optional)                           |
| `sa360_troubleshoot_entity`             | Diagnostic workflow for troubleshooting SA360 reporting and conversion issues.                     | `issue` (optional)                               |

### pinterest-mcp (11 prompts)

| Prompt                                   | Description                                                                                                                                                                         | Key Arguments                                                            |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `creative_upload_workflow`               | Step-by-step guide for uploading video creatives and creating Pinterest Ads. Image creatives reference a hosted image URL directly rather than uploading a file.                    | `adAccountId` (required)                                                 |
| `cross_platform_campaign_setup`          | Multi-platform campaign setup guide with budget allocation, naming conventions, and phased launch.                                                                                  | `totalBudget` (optional); `objective` (optional)                         |
| `cross_platform_performance_comparison`  | Cross-platform performance comparison and budget reallocation guide.                                                                                                                | `dateRange` (optional)                                                   |
| `pinterest_bulk_operations_workflow`     | Guide for performing bulk create, update, and status operations on Pinterest Ads entities.                                                                                          | `adAccountId` (required); `entityType` (optional)                        |
| `pinterest_campaign_setup_workflow`      | Step-by-step guide for creating a complete Pinterest Ads campaign structure (Campaign → Ad Group → Ad).                                                                             | `adAccountId` (required); `objective` (optional)                         |
| `pinterest_entity_duplication_workflow`  | Step-by-step guide for duplicating Pinterest Ads campaigns, ad groups, and ads using `pinterest_duplicate_entity` — covers A/B testing, scaling, and common patterns.               | `entityType` (required); `entityId` (required); `adAccountId` (required) |
| `pinterest_entity_update_workflow`       | Step-by-step guide for safely updating Pinterest Ads entities — covers field updates vs status changes (separate endpoints), budget values in account currency, and verification.   | `entityType` (required); `entityId` (required); `adAccountId` (required) |
| `pinterest_reporting_workflow`           | Guide for submitting and retrieving Pinterest Ads async reports with dimensions, metrics, and breakdowns.                                                                           | `adAccountId` (required); `reportLevel` (optional)                       |
| `pinterest_targeting_discovery_workflow` | Step-by-step guide for researching Pinterest audiences: search interest categories, browse behaviors, build targeting configs, and estimate audience size before ad group creation. | `adAccountId` (required); `goal` (optional)                              |
| `pinterest_tool_schema_exploration`      | Guide for discovering and understanding Pinterest MCP tools, resources, and schemas.                                                                                                | `objective` (optional)                                                   |
| `pinterest_troubleshoot_entity`          | Diagnostic workflow for troubleshooting Pinterest Ads entity issues.                                                                                                                | `entityType` (required); `entityId` (required); `adAccountId` (required) |

### amazon-dsp-mcp (11 prompts)

| Prompt                                    | Description                                                                                                                                                                           | Key Arguments                                                          |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `amazon_dsp_bulk_operations_workflow`     | Guide for performing bulk create, update, and status operations on Amazon DSP entities.                                                                                               | `profileId` (required); `entityType` (optional)                        |
| `amazon_dsp_campaign_setup_workflow`      | Step-by-step guide for creating a complete Amazon DSP campaign structure (Order → Line Item → Creative).                                                                              | `profileId` (required); `objective` (optional)                         |
| `amazon_dsp_creative_upload_workflow`     | Step-by-step guide for uploading creative assets and creating Amazon DSP creatives.                                                                                                   | `profileId` (required); `creativeType` (optional)                      |
| `amazon_dsp_entity_duplication_workflow`  | Step-by-step guide for duplicating Amazon DSP orders, line items, and creatives using `amazon_dsp_duplicate_entity` — covers A/B testing, scaling, and common patterns.               | `entityType` (required); `entityId` (required); `profileId` (required) |
| `amazon_dsp_entity_update_workflow`       | Step-by-step guide for safely updating Amazon DSP entities — covers field updates vs status changes (separate endpoints), budget values in account currency, and verification.        | `entityType` (required); `entityId` (required); `profileId` (required) |
| `amazon_dsp_reporting_workflow`           | Guide for submitting and retrieving Amazon DSP async reports with dimensions, metrics, and breakdowns.                                                                                | `profileId` (required); `reportLevel` (optional)                       |
| `amazon_dsp_targeting_discovery_workflow` | Step-by-step guide for researching Amazon DSP audiences: search interest categories, browse behaviors, build targeting configs, and estimate audience size before line item creation. | `profileId` (required); `goal` (optional)                              |
| `amazon_dsp_tool_schema_exploration`      | Guide for discovering and understanding Amazon DSP MCP tools, resources, and schemas.                                                                                                 | `objective` (optional)                                                 |
| `amazon_dsp_troubleshoot_entity`          | Diagnostic workflow for troubleshooting Amazon DSP entity issues.                                                                                                                     | `entityType` (required); `entityId` (required); `profileId` (required) |
| `cross_platform_campaign_setup`           | Multi-platform campaign setup guide with budget allocation, naming conventions, and phased launch.                                                                                    | `totalBudget` (optional); `objective` (optional)                       |
| `cross_platform_performance_comparison`   | Cross-platform performance comparison and budget reallocation guide.                                                                                                                  | `dateRange` (optional)                                                 |

### msads-mcp (5 prompts)

| Prompt                           | Description                                                                  | Key Arguments                                     |
| -------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------- |
| `msads_bulk_operations_workflow` | Guide for performing bulk operations in Microsoft Advertising.               | _(none)_                                          |
| `msads_campaign_setup_workflow`  | Step-by-step guide for creating a complete Microsoft Advertising campaign.   | `accountId` (required); `campaignType` (optional) |
| `msads_google_import_workflow`   | Guide for importing campaigns from Google Ads into Microsoft Advertising.    | `googleAccountId` (required)                      |
| `msads_reporting_workflow`       | Guide for running Microsoft Advertising reports (blocking and non-blocking). | `accountId` (required)                            |
| `msads_troubleshoot_entity`      | Troubleshoot issues with Microsoft Advertising entities.                     | `entityType` (required); `entityId` (required)    |

## When to Use Prompts

### Use Prompts For:

- **Multi-step workflows** requiring specific ordering
  - Example: Campaign → IO → Line Items (must be sequential)

- **Platform-specific quirks** that AI agents might not know
  - Example: DV360 campaigns can't be DRAFT, but IOs must be DRAFT

- **Validation gates** between workflow steps
  - Example: "Save campaignId from Step 2 for use in Step 3"

- **Complex troubleshooting** sequences
  - Example: "If error X, check Y, then try Z"

- **Cross-platform coordination**
  - Example: Compare performance across all platforms and reallocate budget

### Don't Use Prompts For:

- **Simple operations** - Tool description is sufficient
  - Example: "Get a single entity" - just use `get_entity` tool

- **Reference documentation** - Use MCP Resources instead
  - Example: "What fields does Campaign have?" → `entity-schema://campaign`

- **Operations AI can figure out** from tool descriptions alone
  - Example: "List all campaigns" - obvious from `list_entities` tool

## Key Metrics

**Current Prompts:** 128
**Average Size:** ~8KB when invoked
**Context Cost:** 0KB when not invoked

---

**Quick Links:**

- DBM Prompts: `packages/dbm-mcp/src/mcp-server/prompts/`
- DV360 Prompts: `packages/dv360-mcp/src/mcp-server/prompts/`
- TTD Prompts: `packages/ttd-mcp/src/mcp-server/prompts/`
- Google Ads Prompts: `packages/gads-mcp/src/mcp-server/prompts/`
- Meta Prompts: `packages/meta-mcp/src/mcp-server/prompts/`
- LinkedIn Prompts: `packages/linkedin-mcp/src/mcp-server/prompts/`
- TikTok Prompts: `packages/tiktok-mcp/src/mcp-server/prompts/`
- CM360 Prompts: `packages/cm360-mcp/src/mcp-server/prompts/`
- Snapchat Prompts: `packages/snapchat-mcp/src/mcp-server/prompts/`
- SA360 Prompts: `packages/sa360-mcp/src/mcp-server/prompts/`
- Pinterest Prompts: `packages/pinterest-mcp/src/mcp-server/prompts/`
- Amazon DSP Prompts: `packages/amazon-dsp-mcp/src/mcp-server/prompts/`
- Microsoft Ads Prompts: `packages/msads-mcp/src/mcp-server/prompts/`
