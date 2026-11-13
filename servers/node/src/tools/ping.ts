/**
 * Ping tool - Connection health check
 */

import type { PluginCaller } from '../plugin-connection.js';

export async function handlePing(
  client: PluginCaller,
  _args: Record<string, unknown>
): Promise<string> {
  const result = await client.call('ping', {});
  return JSON.stringify(result);
}

export const pingToolDefinition = {
  name: 'ping',
  description: 'Check if connection to Obsidian plugin is working',
  inputSchema: {
    type: 'object',
    properties: {},
    required: []
  }
};
