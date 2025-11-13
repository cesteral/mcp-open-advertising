/**
 * Discovery Document Fetcher
 *
 * Fetches Google Discovery Documents with caching and retry logic.
 * Phase 1 implementation - basic fetch with minimal caching.
 */

import fs from 'fs/promises';
import path from 'path';
import type { SchemaExtractionConfig } from '../../config/schema-extraction.config.js';
import type { DiscoveryDocument, CacheEntry } from './types.js';
import { ExtractionError, ErrorCodes } from './types.js';

/**
 * Fetch Discovery Document from Google API
 *
 * Implements:
 * - URL construction from config
 * - Timeout support
 * - Cache checking (if enabled)
 * - Retry logic with exponential backoff
 *
 * @param config - Schema extraction configuration
 * @returns Discovery document
 * @throws ExtractionError if fetch fails after retries
 */
export async function fetchDiscoveryDoc(
  config: SchemaExtractionConfig
): Promise<DiscoveryDocument> {
  console.log('📥 Fetching Discovery Document...');

  // Check cache first (if enabled)
  if (config.discovery.enableCache) {
    const cached = await loadFromCache(config);
    if (cached) {
      console.log('   ✓ Loaded from cache');
      return cached;
    }
  }

  // Fetch from network with retry
  const doc = await fetchWithRetry(config);

  // Save to cache (if enabled)
  if (config.discovery.enableCache) {
    await saveToCache(config, doc);
  }

  console.log(`   ✓ Fetched ${(JSON.stringify(doc).length / 1024).toFixed(1)} KB`);
  return doc;
}

/**
 * Fetch Discovery Document with retry logic
 *
 * @param config - Schema extraction configuration
 * @param maxRetries - Maximum number of retry attempts (default: 3)
 * @returns Discovery document
 * @throws ExtractionError if all retries fail
 */
async function fetchWithRetry(
  config: SchemaExtractionConfig,
  maxRetries: number = 3
): Promise<DiscoveryDocument> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fetchFromNetwork(config);
    } catch (error) {
      lastError = error as Error;
      console.warn(`   ⚠️  Attempt ${attempt}/${maxRetries} failed: ${lastError.message}`);

      if (attempt < maxRetries) {
        const delayMs = Math.pow(2, attempt) * 1000; // Exponential backoff: 2s, 4s, 8s
        console.log(`   Retrying in ${delayMs / 1000}s...`);
        await sleep(delayMs);
      }
    }
  }

  throw new ExtractionError(
    `Failed to fetch Discovery Document after ${maxRetries} attempts`,
    ErrorCodes.DISCOVERY_FETCH_FAILED,
    { lastError: lastError?.message }
  );
}

/**
 * Fetch Discovery Document from Google API
 *
 * @param config - Schema extraction configuration
 * @returns Discovery document
 * @throws Error if fetch fails
 */
async function fetchFromNetwork(
  config: SchemaExtractionConfig
): Promise<DiscoveryDocument> {
  // Construct URL: https://displayvideo.googleapis.com/$discovery/rest?version=v4
  const url = `${config.discovery.baseUrl}?version=${config.apiVersion}`;

  console.log(`   Fetching from: ${url}`);

  // Implement fetch with AbortController for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.discovery.timeout);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'Accept': 'application/json' }
    });

    if (!response.ok) {
      throw new ExtractionError(
        `HTTP ${response.status}: ${response.statusText}`,
        ErrorCodes.DISCOVERY_FETCH_FAILED,
        { url, statusCode: response.status }
      );
    }

    const data = await response.json();

    // Validate that we got a valid Discovery document
    if (!data.schemas || typeof data.schemas !== 'object') {
      throw new ExtractionError(
        'Invalid Discovery document: missing or invalid schemas field',
        ErrorCodes.DISCOVERY_INVALID_FORMAT,
        { url }
      );
    }

    return data as DiscoveryDocument;
  } catch (error: any) {
    if (error.name === 'AbortError') {
      throw new ExtractionError(
        `Request timeout after ${config.discovery.timeout}ms`,
        ErrorCodes.OPERATION_TIMEOUT,
        { url, timeout: config.discovery.timeout }
      );
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Load Discovery Document from cache
 *
 * Cache structure:
 * - Path: .tmp-specs/cache/discovery-dv360-v4-20250116.json
 * - Key: discovery-{name}-{version}-{YYYYMMDD}
 *
 * @param config - Schema extraction configuration
 * @returns Cached discovery document, or null if cache miss
 */
async function loadFromCache(
  config: SchemaExtractionConfig
): Promise<DiscoveryDocument | null> {
  const cacheKey = getCacheKey(config);
  const cachePath = getCachePath(cacheKey);

  try {
    const cacheData = await fs.readFile(cachePath, 'utf-8');
    const cacheEntry: CacheEntry = JSON.parse(cacheData);

    // Check if cache is still valid
    const now = Date.now();
    const age = now - cacheEntry.timestamp;

    if (age > config.discovery.cacheTTL) {
      console.log(`   Cache expired (age: ${(age / 1000 / 60).toFixed(0)} minutes)`);
      return null;
    }

    console.log(`   Cache hit (age: ${(age / 1000 / 60).toFixed(0)} minutes)`);
    return cacheEntry.discoveryDoc;
  } catch (error) {
    // Cache miss or read error
    return null;
  }
}

/**
 * Save Discovery Document to cache
 *
 * @param config - Schema extraction configuration
 * @param doc - Discovery document to cache
 */
async function saveToCache(
  config: SchemaExtractionConfig,
  doc: DiscoveryDocument
): Promise<void> {
  const cacheKey = getCacheKey(config);
  const cachePath = getCachePath(cacheKey);

  const cacheEntry: CacheEntry = {
    timestamp: Date.now(),
    ttl: config.discovery.cacheTTL,
    discoveryDoc: doc,
  };

  // Ensure cache directory exists
  await fs.mkdir(path.dirname(cachePath), { recursive: true });

  // Write cache file
  await fs.writeFile(cachePath, JSON.stringify(cacheEntry, null, 2), 'utf-8');

  console.log(`   Saved to cache: ${cachePath}`);
}

/**
 * Generate cache key for Discovery Document
 *
 * Format: discovery-{name}-{version}-{YYYYMMDD}
 * Example: discovery-dv360-v4-20250116
 *
 * @param config - Schema extraction configuration
 * @returns Cache key
 */
function getCacheKey(config: SchemaExtractionConfig): string {
  const today = new Date().toISOString().split('T')[0].replace(/-/g, ''); // YYYYMMDD
  return `discovery-dv360-${config.apiVersion}-${today}`;
}

/**
 * Get cache file path
 *
 * @param cacheKey - Cache key
 * @returns Absolute path to cache file
 */
function getCachePath(cacheKey: string): string {
  return path.resolve(process.cwd(), '.tmp-specs', 'cache', `${cacheKey}.json`);
}

/**
 * Sleep utility for retry backoff
 *
 * @param ms - Milliseconds to sleep
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
