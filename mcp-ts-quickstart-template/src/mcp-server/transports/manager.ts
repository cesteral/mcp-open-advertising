/**
 * @fileoverview Manages the lifecycle of the HTTP MCP transport.
 * @module src/mcp-server/transports/manager
 */
import type { ServerType } from '@hono/node-server';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { inject, injectable } from 'tsyringe';

import type { AppConfig as AppConfigType } from '../../config/index.js';
import {
  AppConfig,
  CreateMcpServerInstance,
  Logger,
} from '../../container/tokens.js';
import { requestContextService } from '../../utils/index.js';
import type { logger as LoggerType } from '../../utils/index.js';
import { startHttpTransport, stopHttpTransport } from './http/httpTransport.js';

@injectable()
export class TransportManager {
  private serverInstance: ServerType | null = null;

  constructor(
    @inject(AppConfig) private config: AppConfigType,
    @inject(Logger) private logger: typeof LoggerType,
    @inject(CreateMcpServerInstance)
    private createMcpServer: () => Promise<McpServer>,
  ) {}

  async start(): Promise<void> {
    const context = requestContextService.createRequestContext({
      operation: 'TransportManager.start',
      transport: 'http',
    });

    this.logger.info('Starting HTTP transport', context);

    const mcpServer = await this.createMcpServer();
    this.serverInstance = await startHttpTransport(mcpServer, context);
  }

  async stop(signal: string): Promise<void> {
    const context = requestContextService.createRequestContext({
      operation: 'TransportManager.stop',
      signal,
    });

    if (!this.serverInstance) {
      this.logger.warning(
        'Stop called but no active server instance found.',
        context,
      );
      return;
    }

    await stopHttpTransport(this.serverInstance, context);
  }

  getServer(): ServerType | null {
    return this.serverInstance;
  }
}
