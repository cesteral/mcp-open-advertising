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
  serviceName: z.string().default("media-mcp"),
  port: z.number().int().min(1).max(65535).default(3008),
  otelServiceName: z.string().default("media-mcp"),

  mcpAuthMode: z.enum(["supabase-bearer", "jwt", "none"]).default("supabase-bearer"),

  supabaseUrl: z.string().url().optional(),
  supabaseServiceRoleKey: z.string().optional(),
  supabaseBucketName: z.string().default("cesteral-media"),
  mediaRateLimitPerMinute: z.number().default(100),
});

export type AppConfig = z.infer<typeof ConfigSchema>;

export function parseConfig(): AppConfig {
  const defaultHost = getDefaultHost();

  const rawConfig: Record<string, unknown> = {
    ...getBaseEnvConfig(defaultHost),

    serviceName: process.env.SERVICE_NAME,
    port: process.env.MEDIA_MCP_PORT ? Number(process.env.MEDIA_MCP_PORT) : undefined,
    host: process.env.MEDIA_MCP_HOST || defaultHost,

    supabaseUrl: process.env.SUPABASE_URL,
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    supabaseBucketName: process.env.SUPABASE_BUCKET_NAME,
    mediaRateLimitPerMinute: process.env.MEDIA_RATE_LIMIT_PER_MINUTE
      ? Number(process.env.MEDIA_RATE_LIMIT_PER_MINUTE)
      : undefined,
  };

  return parseConfigWithSchema(ConfigSchema, rawConfig);
}

export const mcpConfig = parseConfig();
export const appConfig: AppConfig = mcpConfig;
