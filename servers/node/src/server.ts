/**
 * The Lattice Relay MCP server: lists the plugin's tools and forwards tool
 * calls to the Relay Obsidian plugin over its authenticated WebSocket.
 *
 * Kept separate from the stdio bootstrap in main.ts so tests can drive it over
 * an in-memory transport.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolResult,
  type Tool
} from '@modelcontextprotocol/sdk/types.js';
import fs from 'fs';

import { logger } from './logger.js';
import { RELAY_VERSION } from './version.js';
import type { PluginConnection } from './plugin-connection.js';
import type { ToolHandler } from './tools/index.js';

export type { PluginConnection } from './plugin-connection.js';

export const SERVER_NAME = 'lattice-relay';

export interface RelayServerOptions {
  connection: PluginConnection;
  /** In-server handlers that take precedence over forwarding. */
  localHandlers: Record<string, ToolHandler>;
  /** Tool definitions to list when neither the plugin nor a generated config is reachable. */
  localDefinitions: Tool[];
  /** Candidate paths of the plugin's generated `mcp-config.json`, tried in order. */
  generatedConfigPaths: string[];
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function errorResult(message: string): CallToolResult {
  return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
}

async function ensureConnected(connection: PluginConnection): Promise<void> {
  if (!connection.isConnected()) await connection.connect();
}

export async function listTools(options: RelayServerOptions): Promise<{ tools: Tool[] }> {
  const { connection } = options;
  try {
    await ensureConnected(connection);
    const resp = await connection.call('tools/list', {});
    if (resp && typeof resp === 'object' && Array.isArray((resp as { tools?: unknown }).tools)) {
      return { tools: (resp as { tools: Tool[] }).tools };
    }
    logger.warn('tools/list returned an unexpected shape; falling back');
  } catch (error) {
    logger.debug('Could not list tools from the plugin; falling back:', errorText(error));
  }

  for (const candidate of options.generatedConfigPaths) {
    try {
      if (!fs.existsSync(candidate)) continue;
      const data = JSON.parse(fs.readFileSync(candidate, 'utf8'));
      if (data && Array.isArray(data.tools)) {
        logger.debug(`Using generated tool config at ${candidate}`);
        return { tools: data.tools };
      }
    } catch (error) {
      logger.warn(`Failed to read generated tool config ${candidate}:`, errorText(error));
    }
  }

  logger.info('Falling back to in-server tool definitions');
  return { tools: options.localDefinitions };
}

export async function callTool(options: RelayServerOptions, name: string, args: Record<string, unknown>): Promise<CallToolResult> {
  const { connection } = options;
  logger.info(`Tool called: ${name}`);
  try {
    await ensureConnected(connection);
  } catch (error) {
    return errorResult(`Not connected to Obsidian. ${errorText(error)}`);
  }

  const local = options.localHandlers[name];
  try {
    if (local) {
      return { content: [{ type: 'text', text: await local(connection, args) }] };
    }
    const result = await connection.call(name, args);
    const text = typeof result === 'string'
      ? result
      : result && typeof result === 'object' ? JSON.stringify(result, null, 2) : String(result);
    return { content: [{ type: 'text', text }] };
  } catch (error) {
    logger.error(`Tool ${name} failed:`, errorText(error));
    return errorResult(errorText(error));
  }
}

export function createRelayServer(options: RelayServerOptions): Server {
  const server = new Server(
    { name: SERVER_NAME, version: RELAY_VERSION },
    { capabilities: { tools: {} } }
  );
  server.setRequestHandler(ListToolsRequestSchema, () => listTools(options));
  server.setRequestHandler(CallToolRequestSchema, (request) =>
    callTool(options, request.params.name, (request.params.arguments ?? {}) as Record<string, unknown>));
  return server;
}
