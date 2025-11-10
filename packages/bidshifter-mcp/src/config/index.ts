import { config } from "dotenv";

config();

export const mcpConfig = {
  serviceName: "bidshifter-mcp",
  port: parseInt(process.env.BIDSHIFTER_MCP_PORT || "3003", 10),
  host: process.env.BIDSHIFTER_MCP_HOST || "0.0.0.0",
  nodeEnv: process.env.NODE_ENV || "development",
  jwtSecret: process.env.JWT_SECRET || "dev-secret-change-in-production",
  logLevel: process.env.LOG_LEVEL || "info",
};
