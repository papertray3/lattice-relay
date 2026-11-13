/**
 * Plugin tools - List plugins and get plugin info
 */

import type { PluginCaller } from '../plugin-connection.js';

export async function handleListPlugins(
  client: PluginCaller,
  _args: Record<string, unknown>
): Promise<string> {
  const result = await client.call('list_plugins', {});
  return JSON.stringify(result, null, 2);
}

export async function handleGetPluginInfo(
  client: PluginCaller,
  args: Record<string, unknown>
): Promise<string> {
  const pluginId = (args.plugin_id || args.pluginId) as string;
  if (!pluginId) {
    throw new Error('get_plugin_info requires plugin_id');
  }
  const result = await client.call('get_plugin_info', { pluginId });
  return JSON.stringify(result, null, 2);
}

export const pluginToolDefinitions = [
  {
    name: 'list_plugins',
    description: 'List installed Obsidian plugins and their status',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'get_plugin_info',
    description: 'Get details about a specific plugin, including manifest and available API methods',
    inputSchema: {
      type: 'object',
      properties: {
        plugin_id: {
          type: 'string',
          description: 'Plugin identifier (e.g., dataview)'
        }
      },
      required: ['plugin_id']
    }
  }
];
