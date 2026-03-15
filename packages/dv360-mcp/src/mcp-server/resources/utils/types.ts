// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Resource type definitions for MCP resources
 */

export interface ResourceDefinition {
  /**
   * URI template for the resource (e.g., "entity-schema://{entityType}")
   */
  uriTemplate: string;

  /**
   * Human-readable name for the resource
   */
  name: string;

  /**
   * Description of what this resource provides
   */
  description: string;

  /**
   * MIME type of the resource content (defaults to "application/json")
   */
  mimeType?: string;

  /**
   * Handler function to read the resource
   */
  read: (params: Record<string, string>) => Promise<ResourceContent>;

  /**
   * Optional list function to list available resources
   */
  list?: () => Promise<ResourceListItem[]>;
}

export interface ResourceContent {
  uri: string;
  mimeType: string;
  text: string;
}

export interface ResourceListItem {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}