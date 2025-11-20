/**
 * Resource Registry
 * Manages registration and lookup of MCP resources
 */

import type { ResourceDefinition } from "./types.js";
import { allResources } from "../definitions/index.js";

export class ResourceRegistry {
  private resources: Map<string, ResourceDefinition> = new Map();

  /**
   * Register all resources
   */
  registerAll(): void {
    for (const resource of allResources) {
      this.register(resource);
    }
  }

  /**
   * Register a single resource
   */
  register(resource: ResourceDefinition): void {
    this.resources.set(resource.uriTemplate, resource);
  }

  /**
   * Get all registered resources
   */
  getAllResources(): ResourceDefinition[] {
    return Array.from(this.resources.values());
  }

  /**
   * Find a resource by URI template pattern
   * Supports URI templates with parameters (e.g., "entity-schema://{entityType}")
   */
  findResourceByUri(uri: string): { resource: ResourceDefinition; params: Record<string, string> } | null {
    for (const resource of this.resources.values()) {
      const params = this.matchUriTemplate(resource.uriTemplate, uri);
      if (params !== null) {
        return { resource, params };
      }
    }
    return null;
  }

  /**
   * Match a URI against a URI template and extract parameters
   * Example: "entity-schema://{entityType}" matches "entity-schema://lineItem"
   * Returns { entityType: "lineItem" } or null if no match
   */
  private matchUriTemplate(template: string, uri: string): Record<string, string> | null {
    // Convert template to regex pattern
    // Replace {param} with named capture groups
    const paramNames: string[] = [];
    const pattern = template.replace(/\{(\w+)\}/g, (_, name) => {
      paramNames.push(name);
      return "([^/]+)";
    });

    const regex = new RegExp(`^${pattern}$`);
    const match = uri.match(regex);

    if (!match) {
      return null;
    }

    // Extract parameters from capture groups
    const params: Record<string, string> = {};
    for (let i = 0; i < paramNames.length; i++) {
      params[paramNames[i]] = match[i + 1];
    }

    return params;
  }

  /**
   * Check if a URI matches any registered resource
   */
  hasResourceForUri(uri: string): boolean {
    return this.findResourceByUri(uri) !== null;
  }

  /**
   * Get count of registered resources
   */
  getResourceCount(): number {
    return this.resources.size;
  }
}

/**
 * Global resource registry instance
 */
export const resourceRegistry = new ResourceRegistry();
