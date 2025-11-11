import { config } from "dotenv";

// Load environment variables
config();

export const mcpConfig = {
  serviceName: "dbm-mcp",
  port: parseInt(process.env.DBM_MCP_PORT || "3001", 10),
  host: process.env.DBM_MCP_HOST || "0.0.0.0",
  nodeEnv: process.env.NODE_ENV || "development",
  jwtSecret: process.env.JWT_SECRET || "dev-secret-change-in-production",
  logLevel: process.env.LOG_LEVEL || "info",
};

export const gcpConfig = {
  projectId: process.env.GCP_PROJECT_ID || "",
  region: process.env.GCP_REGION || "us-central1",
  bigQueryDataset: process.env.BIGQUERY_DATASET_ID || "bidshifter",
  bigQueryLocation: process.env.BIGQUERY_LOCATION || "US",
  gcsBucket: process.env.GCS_BUCKET_NAME || "",
};
