/**
 * @fileoverview Regenerates the server manifest (`server.json`) from package metadata.
 * This keeps the MCP registry descriptor in sync with package.json defaults
 * and the current runtime configuration exposed by the template.
 */
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import packageJson from '../package.json' assert { type: 'json' };

type PackageJson = {
  name?: string;
  version?: string;
  description?: string;
  mcpName?: string;
  repository?:
    | string
    | {
        url?: string;
        type?: string;
      };
};

type EnvironmentVariable = {
  name: string;
  description: string;
  format: 'string';
  isRequired: boolean;
  default?: string;
};

const schemaUrl =
  'https://static.modelcontextprotocol.io/schemas/2025-10-17/server.schema.json';

const pkg = packageJson as PackageJson;
const npmIdentifier = pkg.name ?? 'mcp-ts-template';
const version = pkg.version ?? '0.0.0';
const serverName = pkg.mcpName ?? npmIdentifier;
const description =
  pkg.description ??
  'A production-ready TypeScript template for building Model Context Protocol (MCP) servers.';

function resolveRepositoryUrl(json: PackageJson): string | undefined {
  if (!json.repository) {
    return undefined;
  }

  if (typeof json.repository === 'string') {
    return json.repository.length > 0 ? json.repository : undefined;
  }

  if (json.repository.url && json.repository.url.length > 0) {
    return json.repository.url;
  }

  if (serverName.includes('/')) {
    return `https://github.com/${serverName}`;
  }

  return undefined;
}

function envVar(
  name: string,
  descriptionText: string,
  defaultValue?: string,
): EnvironmentVariable {
  return {
    name,
    description: descriptionText,
    format: 'string',
    isRequired: false,
    ...(defaultValue !== undefined ? { default: defaultValue } : {}),
  };
}

const repositoryUrl = resolveRepositoryUrl(pkg);
const repository =
  repositoryUrl !== undefined
    ? {
        url: repositoryUrl,
        source: repositoryUrl.includes('github.com') ? 'github' : 'custom',
      }
    : undefined;

const httpHostDefault = '127.0.0.1';
const httpPortDefault = 3010;
const httpPathDefault = '/mcp';

const manifest = {
  $schema: schemaUrl,
  name: serverName,
  description,
  ...(repository ? { repository } : {}),
  version,
  packages: [
    {
      registryType: 'npm',
      registryBaseUrl: 'https://registry.npmjs.org',
      identifier: npmIdentifier,
      runtimeHint: 'node',
      version,
      packageArguments: [
        { type: 'positional', value: 'run' },
        { type: 'positional', value: 'start:stdio' },
      ],
      environmentVariables: [
        envVar(
          'MCP_LOG_LEVEL',
          "Sets the minimum log level for output (e.g., 'debug', 'info', 'warn').",
          'debug',
        ),
      ],
      transport: {
        type: 'stdio',
      },
    },
    {
      registryType: 'npm',
      registryBaseUrl: 'https://registry.npmjs.org',
      identifier: npmIdentifier,
      runtimeHint: 'node',
      version,
      packageArguments: [
        { type: 'positional', value: 'run' },
        { type: 'positional', value: 'start:http' },
      ],
      environmentVariables: [
        envVar(
          'MCP_HTTP_HOST',
          'Hostname that the HTTP transport should bind to.',
          httpHostDefault,
        ),
        envVar(
          'MCP_HTTP_PORT',
          'Port number for the HTTP transport.',
          String(httpPortDefault),
        ),
        envVar(
          'MCP_HTTP_ENDPOINT_PATH',
          'Endpoint path exposed by the HTTP transport.',
          httpPathDefault,
        ),
        envVar(
          'MCP_AUTH_MODE',
          "Authentication mode to use: 'none', 'jwt', or 'oauth'.",
          'none',
        ),
        envVar(
          'MCP_LOG_LEVEL',
          "Sets the minimum log level for output (e.g., 'debug', 'info', 'warn').",
          'debug',
        ),
      ],
      transport: {
        type: 'streamable-http',
        url: `http://${httpHostDefault}:${httpPortDefault}${httpPathDefault}`,
      },
    },
  ],
};

const outputPath = resolve('server.json');

await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

console.log(`server.json updated (${outputPath})`);
