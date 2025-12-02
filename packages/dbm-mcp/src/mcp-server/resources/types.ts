/**
 * MCP Resource Types
 */

/**
 * Resource definition interface
 */
export interface Resource {
  /** Unique URI for the resource */
  uri: string;
  /** Human-readable name */
  name: string;
  /** Description of the resource */
  description: string;
  /** MIME type of the content */
  mimeType: string;
  /** Function to generate the content */
  getContent: () => string;
}

/**
 * Resource template for dynamic resources
 */
export interface ResourceTemplate {
  /** URI template with placeholders (e.g., "entity-schema://{entityType}") */
  uriTemplate: string;
  /** Human-readable name */
  name: string;
  /** Description of the resource template */
  description: string;
  /** MIME type of the content */
  mimeType: string;
  /** Function to generate content for a specific URI */
  getContent: (params: Record<string, string>) => string;
  /** Extract params from URI */
  parseUri: (uri: string) => Record<string, string> | null;
}
