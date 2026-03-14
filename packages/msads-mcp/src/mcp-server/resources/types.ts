/**
 * MCP Resource Types
 */

export interface Resource {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
  getContent: () => string;
}
