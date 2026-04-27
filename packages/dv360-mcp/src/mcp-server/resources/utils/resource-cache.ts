// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Simple in-memory cache for MCP Resource responses.
 * Resources are computed from static generated schemas and never change at runtime,
 * so we cache indefinitely (until server restart).
 */
export class ResourceCache {
  private cache = new Map<string, string>();

  get(key: string): string | undefined {
    return this.cache.get(key);
  }

  set(key: string, value: string): void {
    this.cache.set(key, value);
  }

  has(key: string): boolean {
    return this.cache.has(key);
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}

export const resourceCache = new ResourceCache();
