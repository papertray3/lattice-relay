/**
 * Dataview tools - Query execution, block running, block extraction
 */

import type { PluginCaller } from '../plugin-connection.js';

export async function handleDataviewQuery(
  client: PluginCaller,
  args: Record<string, unknown>
): Promise<string> {
  const query = args.query as string;
  if (!query) {
    throw new Error('dataview_query requires query');
  }
  const contextPath = (args.context_path || args.contextPath || '') as string;
  const result = await client.call('dataview_query', {
    query,
    context: contextPath
  });
  return result as string;
}

export async function handleRunDataviewBlock(
  client: PluginCaller,
  args: Record<string, unknown>
): Promise<string> {
  const flavor = args.flavor as string;
  const source = args.source as string;

  if (!flavor) {
    throw new Error('run_dataview_block requires flavor (dataview or dataviewjs)');
  }
  if (!source) {
    throw new Error('run_dataview_block requires source (the query/script)');
  }

  const result = await client.call('run_dataview_block', {
    filepath: args.filepath || '',
    flavor,
    source,
    input: args.input
  });

  return JSON.stringify(result, null, 2);
}

export async function handleExtractDataviewBlocks(
  client: PluginCaller,
  args: Record<string, unknown>
): Promise<string> {
  const filepath = args.filepath as string;
  if (!filepath) {
    throw new Error('extract_dataview_blocks requires filepath');
  }
  const result = await client.call('extract_dataview_blocks', { filepath });
  return JSON.stringify(result, null, 2);
}

export const dataviewToolDefinitions = [
  {
    name: 'dataview_query',
    description: 'Execute a Dataview query and return rendered markdown output',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Dataview query text'
        },
        context_path: {
          type: 'string',
          description: 'Optional path to use as query context'
        }
      },
      required: ['query']
    }
  },
  {
    name: 'run_dataview_block',
    description: 'Execute a Dataview or DataviewJS query block and return the rendered result. Useful for extracting specific tables or data from notes without rendering entire dashboards. Requires Dataview plugin to be installed and enabled.',
    inputSchema: {
      type: 'object',
      properties: {
        filepath: {
          type: 'string',
          description: 'Optional: Path to the note file to use as execution context (for this.file, dv.current(), etc.)'
        },
        flavor: {
          type: 'string',
          enum: ['dataview', 'dataviewjs'],
          description: "Type of query: 'dataview' for DQL queries, 'dataviewjs' for JavaScript code"
        },
        source: {
          type: 'string',
          description: 'The query or script source code (without the ```dataview wrapper)'
        },
        input: {
          description: "Optional: Input data to pass to DataviewJS scripts (available as 'input' variable)"
        }
      },
      required: ['flavor', 'source']
    }
  },
  {
    name: 'extract_dataview_blocks',
    description: 'Extract all Dataview and DataviewJS blocks from a note. Returns list of blocks with their source code, type, and line numbers. Useful for discovering what queries are in a note before executing them.',
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
