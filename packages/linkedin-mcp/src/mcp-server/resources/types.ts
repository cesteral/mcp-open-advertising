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
