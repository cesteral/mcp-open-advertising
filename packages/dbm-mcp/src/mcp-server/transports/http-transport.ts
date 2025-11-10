import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import express from "express";
import { createLogger, formatErrorForMcp } from "@bidshifter/shared";
import {
  getCampaignDeliveryTool,
  handleGetCampaignDelivery,
  getCampaignDeliveryParamsSchema,
  getPerformanceMetricsTool,
  handleGetPerformanceMetrics,
  getPerformanceMetricsParamsSchema,
  getHistoricalMetricsTool,
  handleGetHistoricalMetrics,
  getHistoricalMetricsParamsSchema,
  getPlatformEntitiesTool,
  handleGetPlatformEntities,
  getPlatformEntitiesParamsSchema,
  getPacingStatusTool,
  handleGetPacingStatus,
  getPacingStatusParamsSchema,
} from "../tools/index.js";

const logger = createLogger("dbm-mcp:http-transport");

/**
 * Create and configure the MCP server with HTTP/SSE transport
 */
export function createMcpHttpServer(): express.Application {
  const app = express();
  app.use(express.json());

  // Health check endpoint
  app.get("/health", (_req, res) => {
    res.json({ status: "healthy", service: "dbm-mcp" });
  });

  // MCP SSE endpoint
  app.get("/sse", async (_req, res) => {
    logger.info("New SSE connection");

    const transport = new SSEServerTransport("/message", res);
    const server = new Server(
      {
        name: "dbm-mcp",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // Register all tools
    server.setRequestHandler("tools/list" as any, async () => ({
      tools: [
        getCampaignDeliveryTool,
        getPerformanceMetricsTool,
        getHistoricalMetricsTool,
        getPlatformEntitiesTool,
        getPacingStatusTool,
      ],
    }));

    // Handle tool calls
    server.setRequestHandler("tools/call" as any, async (request: any) => {
      try {
        const { name, arguments: args } = request.params;

          logger.info({ tool: name, args }, "Tool called");

          switch (name) {
            case "get_campaign_delivery": {
              const params = getCampaignDeliveryParamsSchema.parse(args);
              return await handleGetCampaignDelivery(params);
            }
            case "get_performance_metrics": {
              const params = getPerformanceMetricsParamsSchema.parse(args);
              return await handleGetPerformanceMetrics(params);
            }
            case "get_historical_metrics": {
              const params = getHistoricalMetricsParamsSchema.parse(args);
              return await handleGetHistoricalMetrics(params);
            }
            case "get_platform_entities": {
              const params = getPlatformEntitiesParamsSchema.parse(args);
              return await handleGetPlatformEntities(params);
            }
            case "get_pacing_status": {
              const params = getPacingStatusParamsSchema.parse(args);
              return await handleGetPacingStatus(params);
            }
            default:
              throw new Error(`Unknown tool: ${name}`);
          }
        } catch (error) {
          logger.error({ error }, "Tool execution failed");
          return formatErrorForMcp(error);
        }
      }
    );

    await server.connect(transport);
    logger.info("MCP server connected via SSE");
  });

  // POST endpoint for direct MCP protocol messages
  app.post("/message", async (_req, res) => {
    // This would handle direct JSON-RPC messages if needed
    res.status(501).json({ error: "Use SSE endpoint at /sse" });
  });

  return app;
}
