/**
 * Render tools - Digital Garden compiled rendering
 */

import type { PluginCaller } from '../plugin-connection.js';

export async function handleRenderNoteDGCompiled(
  client: PluginCaller,
  args: Record<string, unknown>
): Promise<string> {
  const filepath = args.filepath as string;
  if (!filepath) {
    throw new Error('render_note_dg_compiled requires filepath');
  }
  const result = await client.call('render_note_dg_compiled', { filepath });
  return JSON.stringify(result, null, 2);
}

export const renderToolDefinitions = [
  {
    name: 'render_note_dg_compiled',
    description: 'Render a note using Digital Garden\'s compiler with caching. Returns metadata about cached file (path, hash, size) instead of full HTML content. Use this for large notes that exceed MCP size limits. Requires Digital Garden plugin to be installed and enabled.',
    inputSchema: {
      type: 'object',
      properties: {
        filepath: {
          type: 'string',
          description: 'Path to the note file (relative to vault root)'
        }
      },
      required: ['filepath']
    }
  }
];
