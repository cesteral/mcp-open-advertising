import { config } from "dotenv";

config();

export const mcpConfig = {
  serviceName: "dv360-mcp",
  port: parseInt(process.env.DV360_MCP_PORT || "3002", 10),
  host: process.env.DV360_MCP_HOST || "0.0.0.0",
  nodeEnv: process.env.NODE_ENV || "development",
  jwtSecret: process.env.JWT_SECRET || "dev-secret-change-in-production",
  logLevel: process.env.LOG_LEVEL || "info",
};
