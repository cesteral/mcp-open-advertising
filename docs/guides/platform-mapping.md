# Platform to MCP Package Mapping

This table tracks current and planned ad-platform packages.

## Current Platforms

| Platform         | Package                 | Primary Purpose                               | Status |
| ---------------- | ----------------------- | --------------------------------------------- | ------ |
| DV360 Reporting  | `packages/dbm-mcp`      | Bid Manager reporting and diagnostics         | Active |
| DV360 Management | `packages/dv360-mcp`    | DV360 entity creation/updates                 | Active |
| The Trade Desk   | `packages/ttd-mcp`      | TTD entity management and reporting           | Active |
| Google Ads       | `packages/gads-mcp`     | Google Ads campaign management and reporting  | Active |
| Meta Ads         | `packages/meta-mcp`     | Meta Marketing API v25.0 campaign management  | Active |
| LinkedIn Ads     | `packages/linkedin-mcp` | LinkedIn Marketing API v2 campaign management | Active |
| TikTok Ads       | `packages/tiktok-mcp`   | TikTok Marketing API v1.3 campaign management | Active |

## Planned/Target Platforms

| Platform      | Proposed Package          | Notes                                                     |
| ------------- | ------------------------- | --------------------------------------------------------- |
| Pinterest Ads | `packages/pinterest-mcp`  | Follow TikTok-style full management/reporting surface     |
| Snapchat Ads  | `packages/snapchat-mcp`   | Preserve Snap terminology such as Ad Squad                |
| Amazon DSP    | `packages/amazon-dsp-mcp` | Include MCP prompts and resources at package introduction |

## Rules

- New platform packages must be listed here before release.
- Each platform must include MCP prompts for core workflows (campaign setup, entity updates, troubleshooting).
- Each platform must include MCP resources for entity schemas and examples.
