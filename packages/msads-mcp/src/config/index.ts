import { z } from "zod";
import {
  loadDotEnv,
  BaseConfigSchema,
  getBaseEnvConfig,
  parseConfigWithSchema,
  getDefaultHost,
} from "@cesteral/shared";

loadDotEnv();

const ConfigSchema = BaseConfigSchema.extend({
  serviceName: z.string().default("msads-mcp"),
  port: z.number().int().min(1).max(65535).default(3013),
  otelServiceName: z.string().default("msads-mcp"),

  // Auth — Microsoft Ads-specific modes
  mcpAuthMode: z.enum(["msads-bearer", "jwt", "none"]).default("msads-bearer"),

  // Microsoft Ads API Configuration
  msadsCampaignApiBaseUrl: z
    .string()
    .url()
    .default("https://campaign.api.bingads.microsoft.com/CampaignManagement/v13"),
  msadsReportingApiBaseUrl: z
    .string()
    .url()
    .default("https://reporting.api.bingads.microsoft.com/Reporting/v13"),
  msadsCustomerApiBaseUrl: z
    .string()
    .url()
    .default("https://clientcenter.api.bingads.microsoft.com/CustomerManagement/v13"),
  msadsBulkApiBaseUrl: z
    .string()
    .url()
    .default("https://bulk.api.bingads.microsoft.com/Bulk/v13"),
  msadsRateLimitPerMinute: z.number().default(100),

  // Stdio fallback credentials
  msadsAccessToken: z.string().optional(),
  msadsDeveloperToken: z.string().optional(),
  msadsCustomerId: z.string().optional(),
  msadsAccountId: z.string().optional(),

  // Reporting poll configuration
  msadsReportPollIntervalMs: z.number().default(3_000),
  msadsReportMaxPollAttempts: z.number().default(30),
});

export type AppConfig = z.infer<typeof ConfigSchema>;

export function parseConfig(): AppConfig {
  const defaultHost = getDefaultHost();

  const rawConfig: Record<string, unknown> = {
    ...getBaseEnvConfig(defaultHost),

    serviceName: process.env.SERVICE_NAME,
    port: process.env.MSADS_MCP_PORT ? Number(process.env.MSADS_MCP_PORT) : undefined,
    host: process.env.MSADS_MCP_HOST || defaultHost,

    // Microsoft Ads API
    msadsCampaignApiBaseUrl: process.env.MSADS_CAMPAIGN_API_BASE_URL,
    msadsReportingApiBaseUrl: process.env.MSADS_REPORTING_API_BASE_URL,
    msadsCustomerApiBaseUrl: process.env.MSADS_CUSTOMER_API_BASE_URL,
    msadsBulkApiBaseUrl: process.env.MSADS_BULK_API_BASE_URL,
    msadsRateLimitPerMinute: process.env.MSADS_RATE_LIMIT_PER_MINUTE
      ? Number(process.env.MSADS_RATE_LIMIT_PER_MINUTE)
      : undefined,

    // Stdio fallback credentials
    msadsAccessToken: process.env.MSADS_ACCESS_TOKEN,
    msadsDeveloperToken: process.env.MSADS_DEVELOPER_TOKEN,
    msadsCustomerId: process.env.MSADS_CUSTOMER_ID,
    msadsAccountId: process.env.MSADS_ACCOUNT_ID,

    // Reporting poll configuration
    msadsReportPollIntervalMs: process.env.MSADS_REPORT_POLL_INTERVAL_MS
      ? Number(process.env.MSADS_REPORT_POLL_INTERVAL_MS)
      : undefined,
    msadsReportMaxPollAttempts: process.env.MSADS_REPORT_MAX_POLL_ATTEMPTS
      ? Number(process.env.MSADS_REPORT_MAX_POLL_ATTEMPTS)
      : undefined,
  };

  return parseConfigWithSchema(ConfigSchema, rawConfig);
}

export const mcpConfig = parseConfig();
export const appConfig: AppConfig = mcpConfig;
