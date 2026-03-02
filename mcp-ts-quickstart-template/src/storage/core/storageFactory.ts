/**
 * @fileoverview Storage factory stub for stateless MCP server.
 * This server does not require persistent storage - it's a stateless
 * service that reads from platform APIs and returns results.
 * Storage layer is kept for future use but returns a no-op provider.
 * @module src/storage/core/storageFactory
 */
import type { AppConfig } from '@/config/index.js';
import type { IStorageProvider } from '@/storage/core/IStorageProvider.js';
import { NoOpStorageProvider } from '@/storage/core/NoOpStorageProvider.js';
import { logger, requestContextService } from '@/utils/index.js';

/**
 * Optional dependencies for storage provider creation.
 * Kept for future extensibility but not used in v1.
 */
export interface StorageFactoryDeps {
  // Empty for now, can be extended when storage is needed
}

/**
 * Creates and returns a no-op storage provider for this stateless server.
 *
 * This server is stateless and does not persist data. This factory returns
 * a no-op provider that satisfies the IStorageProvider interface but performs no
 * actual storage operations.
 *
 * Future versions may add persistent storage for caching validation results,
 * storing historical metrics, or maintaining user preferences.
 *
 * @param config - The application configuration object (unused in v1)
 * @param deps - Optional dependencies (unused in v1)
 * @returns A no-op storage provider instance
 *
 * @example
 * ```typescript
 * const config = container.resolve<AppConfig>(AppConfig);
 * const provider = createStorageProvider(config);
 * // All storage operations will be no-ops
 * ```
 */
export function createStorageProvider(
  config: AppConfig,
  deps: StorageFactoryDeps = {},
): IStorageProvider {
  const context = requestContextService.createRequestContext({
    operation: 'createStorageProvider',
  });

  logger.info('Creating no-op storage provider (stateless — no persistent storage)', context);

  return new NoOpStorageProvider();
}
