/**
 * BigQueryService - Database service for BigQuery interactions
 *
 * Provides a thin wrapper around BigQuery operations with:
 * - Connection management
 * - Query execution
 * - Error handling
 *
 * Note: Uses stub implementation until @google-cloud/bigquery is integrated.
 * To enable real BigQuery, add the dependency and update the client creation.
 */

import { injectable, inject } from "tsyringe";
import type { Logger } from "pino";
import * as Tokens from "../../container/tokens.js";
import type { BigQueryConfig, QueryResult } from "./types.js";

/**
 * BigQuery client interface for abstraction
 */
export interface BigQueryClient {
  query<T>(sql: string, params?: Record<string, unknown>): Promise<QueryResult<T>>;
  insert(table: string, rows: Record<string, unknown>[]): Promise<void>;
  update(table: string, updates: Record<string, unknown>, where: string, params?: Record<string, unknown>): Promise<number>;
}

/**
 * Stub BigQuery client for development/testing
 * Replace with real @google-cloud/bigquery client for production
 */
class StubBigQueryClient implements BigQueryClient {
  private storage: Map<string, Record<string, unknown>[]> = new Map();

  async query<T>(sql: string, params?: Record<string, unknown>): Promise<QueryResult<T>> {
    // Stub implementation - returns empty results
    // In production, this would execute the actual BigQuery query
    console.log("[BigQuery Stub] Query:", sql, params);
    return { rows: [], totalRows: 0 };
  }

  async insert(table: string, rows: Record<string, unknown>[]): Promise<void> {
    // Stub implementation - stores in memory
    const existing = this.storage.get(table) || [];
    this.storage.set(table, [...existing, ...rows]);
    console.log(`[BigQuery Stub] Inserted ${rows.length} rows into ${table}`);
  }

  async update(
    table: string,
    updates: Record<string, unknown>,
    where: string,
    params?: Record<string, unknown>
  ): Promise<number> {
    // Stub implementation - returns 0 updated rows
    console.log(`[BigQuery Stub] Update ${table}:`, updates, where, params);
    return 0;
  }
}

@injectable()
export class BigQueryService {
  private client: BigQueryClient | null = null;
  private isInitialized = false;

  constructor(
    @inject(Tokens.Logger) private logger: Logger,
    @inject(Tokens.BigQueryConfig) private config: BigQueryConfig
  ) {}

  /**
   * Initialize the BigQuery client (lazy initialization)
   */
  private async initialize(): Promise<BigQueryClient> {
    if (this.client && this.isInitialized) {
      return this.client;
    }

    this.logger.info({ projectId: this.config.projectId, dataset: this.config.dataset }, "Initializing BigQuery client");

    try {
      // TODO: Replace with real BigQuery client when ready:
      // const { BigQuery } = await import("@google-cloud/bigquery");
      // this.client = new BigQuery({ projectId: this.config.projectId });

      // For now, use stub client
      this.client = new StubBigQueryClient();
      this.isInitialized = true;

      this.logger.info("BigQuery client initialized (stub mode)");
      return this.client;
    } catch (error) {
      this.logger.error({ error }, "Failed to initialize BigQuery client");
      throw error;
    }
  }

  /**
   * Execute a query and return results
   */
  async query<T>(sql: string, params?: Record<string, unknown>): Promise<QueryResult<T>> {
    const client = await this.initialize();

    this.logger.debug({ sql: sql.substring(0, 100) }, "Executing BigQuery query");

    try {
      const result = await client.query<T>(sql, params);
      this.logger.debug({ totalRows: result.totalRows }, "Query completed");
      return result;
    } catch (error) {
      this.logger.error({ error, sql: sql.substring(0, 100) }, "BigQuery query failed");
      throw error;
    }
  }

  /**
   * Insert rows into a table
   */
  async insert(table: string, rows: Record<string, unknown>[]): Promise<void> {
    const client = await this.initialize();
    const fullTableName = `${this.config.dataset}.${table}`;

    this.logger.debug({ table: fullTableName, rowCount: rows.length }, "Inserting rows into BigQuery");

    try {
      await client.insert(fullTableName, rows);
      this.logger.debug({ table: fullTableName, rowCount: rows.length }, "Insert completed");
    } catch (error) {
      this.logger.error({ error, table: fullTableName }, "BigQuery insert failed");
      throw error;
    }
  }

  /**
   * Update rows in a table
   */
  async update(
    table: string,
    updates: Record<string, unknown>,
    where: string,
    params?: Record<string, unknown>
  ): Promise<number> {
    const client = await this.initialize();
    const fullTableName = `${this.config.dataset}.${table}`;

    this.logger.debug({ table: fullTableName, updates, where }, "Updating rows in BigQuery");

    try {
      const updatedCount = await client.update(fullTableName, updates, where, params);
      this.logger.debug({ table: fullTableName, updatedCount }, "Update completed");
      return updatedCount;
    } catch (error) {
      this.logger.error({ error, table: fullTableName }, "BigQuery update failed");
      throw error;
    }
  }

  /**
   * Get the full table name with dataset prefix
   */
  getFullTableName(table: string): string {
    return `${this.config.projectId}.${this.config.dataset}.${table}`;
  }

  /**
   * Check if the service is using stub mode
   */
  isStubMode(): boolean {
    return this.client instanceof StubBigQueryClient;
  }
}
