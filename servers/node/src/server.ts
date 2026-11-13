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

/** Per-server memory of which tools declare an outputSchema, learned from tools/list. */
export interface ToolCatalog {
  listed: boolean;
  withOutputSchema: Set<string>;
}

export function newCatalog(): ToolCatalog {
  return { listed: false, withOutputSchema: new Set() };
}

function remember(catalog: ToolCatalog | undefined, tools: Tool[]): { tools: Tool[] } {
  if (catalog) {
    catalog.listed = true;
    catalog.withOutputSchema = new Set(tools.filter(t => t.outputSchema).map(t => t.name));
  }
  return { tools };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * MCP (2025-06-18 and later): a tool that declares an outputSchema must return
 * structuredContent, which current SDK clients enforce. JSON-object results are
 * therefore returned both as structuredContent and, for older clients, as text.
 */
function toolResult(name: string, result: unknown, catalog: ToolCatalog | undefined): CallToolResult {
  let structured: Record<string, unknown> | undefined;
  if (isPlainObject(result)) structured = result;
  else if (typeof result === 'string') {
    try {
      const parsed: unknown = JSON.parse(result);
      if (isPlainObject(parsed)) structured = parsed;
    } catch {
      // Plain text result.
    }
  }
  const text = typeof result === 'string'
    ? result
    : result !== null && typeof result === 'object' ? JSON.stringify(result, null, 2) : String(result);
  if (!structured && catalog?.withOutputSchema.has(name)) {
    return errorResult(`Tool ${name} declares an output schema but returned ${Array.isArray(result) ? 'an array' : typeof result}, not a JSON object.`);
  }
  return structured
    ? { content: [{ type: 'text', text }], structuredContent: structured }
    : { content: [{ type: 'text', text }] };
}

export async function listTools(options: RelayServerOptions, catalog?: ToolCatalog): Promise<{ tools: Tool[] }> {
  const { connection } = options;
  try {
    await ensureConnected(connection);
    const resp = await connection.call('tools/list', {});
    if (resp && typeof resp === 'object' && Array.isArray((resp as { tools?: unknown }).tools)) {
      return remember(catalog, (resp as { tools: Tool[] }).tools);
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
        return remember(catalog, data.tools);
      }
    } catch (error) {
      logger.warn(`Failed to read generated tool config ${candidate}:`, errorText(error));
    }
  }

  logger.info('Falling back to in-server tool definitions');
  return remember(catalog, options.localDefinitions);
}

export async function callTool(options: RelayServerOptions, name: string, args: Record<string, unknown>, catalog?: ToolCatalog): Promise<CallToolResult> {
  const { connection } = options;
  logger.info(`Tool called: ${name}`);
  try {
    await ensureConnected(connection);
  } catch (error) {
    return errorResult(`Not connected to Obsidian. ${errorText(error)}`);
  }
  // A client may call without listing first; learn the output schemas once.
  if (catalog && !catalog.listed) await listTools(options, catalog);

  const local = options.localHandlers[name];
  try {
    const result = local ? await local(connection, args) : await connection.call(name, args);
    return toolResult(name, result, catalog);
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
  const catalog = newCatalog();
  server.setRequestHandler(ListToolsRequestSchema, () => listTools(options, catalog));
  server.setRequestHandler(CallToolRequestSchema, (request) =>
    callTool(options, request.params.name, (request.params.arguments ?? {}) as Record<string, unknown>, catalog));
  return server;
}
