import { config } from "dotenv";
import type { BigQueryConfig } from "../services/bigquery/types.js";

config();

export const mcpConfig = {
  serviceName: "bidshifter-mcp",
  port: parseInt(process.env.BIDSHIFTER_MCP_PORT || "3003", 10),
  host: process.env.BIDSHIFTER_MCP_HOST || "0.0.0.0",
  nodeEnv: process.env.NODE_ENV || "development",
  jwtSecret: process.env.JWT_SECRET || "dev-secret-change-in-production",
  logLevel: process.env.LOG_LEVEL || "info",
};

export const bigQueryConfig: BigQueryConfig = {
  projectId: process.env.GCP_PROJECT_ID || "bidshifter-dev",
  dataset: process.env.BIGQUERY_DATASET || "optimization",
  feedbackTable: process.env.BIGQUERY_FEEDBACK_TABLE || "adjustment_feedback",
  location: process.env.BIGQUERY_LOCATION || "EU",
};
