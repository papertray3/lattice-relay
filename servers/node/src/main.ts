#!/usr/bin/env node
/**
 * Lattice Relay stdio MCP server.
 *
 * Launched by an MCP client with LATTICE_RELAY_KEY / LATTICE_RELAY_PORT (and
 * optionally LATTICE_RELAY_HOST, LATTICE_RELAY_USE_SSL, LATTICE_RELAY_LOG_LEVEL).
 * stdout carries the MCP protocol only; all diagnostics go to stderr and the log file.
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import path from 'path';
import { fileURLToPath } from 'url';

import { ENV, getWebSocketURL, loadConfig, retiredVariables } from './config.js';
import { logger } from './logger.js';
import { createRelayServer } from './server.js';
import { allToolDefinitions, toolHandlers } from './tools/index.js';
import { RELAY_VERSION } from './version.js';
import { ObsidianWebSocketClient } from './websocket-client.js';

/**
 * Where the plugin writes its generated tool list, relative to this script.
 * Release layout: <plugin>/server/lattice-relay.mjs -> <plugin>/generated.
 * Source checkout: servers/node/dist/main.js -> <repo>/generated.
 */
function generatedConfigPaths(): string[] {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return [
    path.resolve(here, '..', 'generated', 'mcp-config.json'),
    path.resolve(here, '..', '..', '..', 'generated', 'mcp-config.json'),
  ];
}

async function main() {
  const config = loadConfig();
  logger.setLevel(config.logLevel);

  for (const { retired, replacement } of retiredVariables()) {
    logger.error(`${retired} is no longer read by Lattice Relay; set ${replacement} instead. Regenerate the client configuration from the Lattice Relay settings tab.`);
  }
  if (!config.apiKey) {
    logger.warn(`${ENV.key} is not set; the plugin will reject requests while authentication is required.`);
  }

  const wsUrl = getWebSocketURL(config);
  logger.info(`Lattice Relay server ${RELAY_VERSION} starting; plugin at ${wsUrl}`);

  const connection = new ObsidianWebSocketClient(config, wsUrl);
  const server = createRelayServer({
    connection,
    localHandlers: toolHandlers,
    localDefinitions: allToolDefinitions as Tool[],
    generatedConfigPaths: generatedConfigPaths(),
  });

  let closing = false;
  const shutdown = async () => {
    if (closing) return;
    closing = true;
    logger.info('Shutting down');
    await connection.close().catch(error => logger.error('Error closing WebSocket:', error));
    await server.close().catch(error => logger.error('Error closing MCP server:', error));
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  process.stdin.on('end', shutdown);

  await server.connect(new StdioServerTransport());
  logger.info('MCP server ready on stdio');

  // Connect to the plugin in the background so the MCP handshake is never blocked on Obsidian.
  connection.connect().catch(error => {
    logger.warn('Plugin not reachable at startup; tools will connect on first use:', error instanceof Error ? error.message : String(error));
  });
}

main().catch((error) => {
  logger.error('Fatal error:', error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
