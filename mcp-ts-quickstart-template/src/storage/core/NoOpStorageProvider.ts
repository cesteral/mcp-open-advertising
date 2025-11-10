/**
 * @fileoverview No-op storage provider for Campaign Guardian v1.
 * Campaign Guardian is stateless and does not persist data. This provider
 * satisfies the IStorageProvider interface but performs no actual operations.
 * @module src/storage/core/NoOpStorageProvider
 */
import type {
  IStorageProvider,
  ListOptions,
  ListResult,
  StorageOptions,
} from '@/storage/core/IStorageProvider.js';
import type { RequestContext } from '@/utils/index.js';
import { logger } from '@/utils/index.js';

/**
 * No-op storage provider that implements IStorageProvider but performs no operations.
 * All methods return empty results or resolve immediately without side effects.
 *
 * This is used in Campaign Guardian v1 where no persistent storage is needed.
 * The MCP server is stateless and only reads from DV360/Bid Manager APIs.
 */
export class NoOpStorageProvider implements IStorageProvider {
  async get<T>(
    tenantId: string,
    key: string,
    context: RequestContext,
  ): Promise<T | null> {
    logger.debug(
      `NoOpStorageProvider.get called for key: ${key} (no-op)`,
      context,
    );
    return null;
  }

  async set(
    tenantId: string,
    key: string,
    value: unknown,
    context: RequestContext,
    options?: StorageOptions,
  ): Promise<void> {
    logger.debug(
      `NoOpStorageProvider.set called for key: ${key} (no-op)`,
      context,
    );
    // No-op
  }

  async delete(
    tenantId: string,
    key: string,
    context: RequestContext,
  ): Promise<boolean> {
    logger.debug(
      `NoOpStorageProvider.delete called for key: ${key} (no-op)`,
      context,
    );
    return false;
  }

  async list(
    tenantId: string,
    prefix: string,
    context: RequestContext,
    options?: ListOptions,
  ): Promise<ListResult> {
    logger.debug(
      `NoOpStorageProvider.list called for prefix: ${prefix} (no-op)`,
      context,
    );
    return { keys: [] };
  }

  async getMany<T>(
    tenantId: string,
    keys: string[],
    context: RequestContext,
  ): Promise<Map<string, T>> {
    logger.debug(
      `NoOpStorageProvider.getMany called for ${keys.length} keys (no-op)`,
      context,
    );
    return new Map();
  }

  async setMany(
    tenantId: string,
    entries: Map<string, unknown>,
    context: RequestContext,
    options?: StorageOptions,
  ): Promise<void> {
    logger.debug(
      `NoOpStorageProvider.setMany called for ${entries.size} entries (no-op)`,
      context,
    );
    // No-op
  }

  async deleteMany(
    tenantId: string,
    keys: string[],
    context: RequestContext,
  ): Promise<number> {
    logger.debug(
      `NoOpStorageProvider.deleteMany called for ${keys.length} keys (no-op)`,
      context,
    );
    return 0;
  }

  async clear(tenantId: string, context: RequestContext): Promise<number> {
    logger.debug(
      `NoOpStorageProvider.clear called for tenant: ${tenantId} (no-op)`,
      context,
    );
    return 0;
  }
}
