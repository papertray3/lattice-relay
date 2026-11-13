/**
 * Tool registry and dispatcher
 */

import type { PluginCaller } from '../plugin-connection.js';

import { handlePing, pingToolDefinition } from './ping.js';
import { handleListVaultFiles, handleGetNoteRaw, handleSearchVault, vaultToolDefinitions } from './vault.js';
import { handleListPlugins, handleGetPluginInfo, pluginToolDefinitions } from './plugins.js';
import { handleDataviewQuery, handleRunDataviewBlock, handleExtractDataviewBlocks, dataviewToolDefinitions } from './dataview.js';
import { handleRenderNoteDGCompiled, renderToolDefinitions } from './render.js';

export type ToolHandler = (client: PluginCaller, args: Record<string, unknown>) => Promise<string>;

export const toolHandlers: Record<string, ToolHandler> = {
  'ping': handlePing,
  'list_vault_files': handleListVaultFiles,
  'get_note_raw': handleGetNoteRaw,
  'search_vault': handleSearchVault,
  'list_plugins': handleListPlugins,
  'get_plugin_info': handleGetPluginInfo,
  'dataview_query': handleDataviewQuery,
  'run_dataview_block': handleRunDataviewBlock,
  'extract_dataview_blocks': handleExtractDataviewBlocks,
  'render_note_dg_compiled': handleRenderNoteDGCompiled
};

export const allToolDefinitions = [
  pingToolDefinition,
  ...vaultToolDefinitions,
  ...pluginToolDefinitions,
  ...dataviewToolDefinitions,
  ...renderToolDefinitions
];
