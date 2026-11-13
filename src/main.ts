import { Plugin, Notice } from 'obsidian';
import { randomUUID } from 'crypto';
import { RelaySettings, DEFAULT_SETTINGS, RelaySettingsTab } from './settings';
import { MCPWebSocketServer, MCPRequest } from './websocket-server';
import { ToolRegistry } from './tool-registry';
import * as path from 'path';
import { RenderedContentCacheManager, CacheSettings } from './cache-manager';
import { runDataviewBlock, extractDataviewBlocks } from './handlers/dataview-block';
import { MetadataExtractor } from './metadata-extractor';
import { BuiltinTools } from './builtin-tools';
import { assertValidParams } from './registry/schema-validator';
import { logger } from './logger';
import type { ProgrammaticToolDefinition, UserHandlerModule } from './registry/types';

/**
 * Public surface exposed to other Obsidian plugins as `LatticeRelayPlugin.api`
 * (see onload() below) - the programmatic alternative to dropping a YAML+JS
 * file pair into a configured tool search path. A calling plugin registers
 * from its own onload() and is expected to clean up in onunload(), typically
 * via `this.register(() => bridgeApi.unregisterTool('my_tool'))`.
 */
export interface RelayApi {
	registerTool(
		definition: ProgrammaticToolDefinition,
		handler: UserHandlerModule,
		options?: { overwrite?: boolean }
	): void;
	unregisterTool(name: string): boolean;
}

export default class LatticeRelayPlugin extends Plugin {
	settings: RelaySettings;
	server: MCPWebSocketServer;
	toolRegistry: ToolRegistry;
	cacheManager: RenderedContentCacheManager;
	metadataExtractor: MetadataExtractor;
	builtinTools: BuiltinTools;
	api: RelayApi;

	async onload() {
		await this.loadSettings();
		logger.setLevel(this.settings.logLevel);

		// Initialize cache manager
		const vaultBasePath = (this.app.vault.adapter as any).basePath;
		const cacheSettings: CacheSettings = {
			cacheDir: path.join(vaultBasePath, this.settings.cacheDirPath),
			vaultBasePath: vaultBasePath,
			maxSizeMB: this.settings.cacheMaxSizeMB
		};
		this.cacheManager = new RenderedContentCacheManager(this.app.vault, cacheSettings);

		// Initialize metadata extractor
		this.metadataExtractor = new MetadataExtractor(
			this.app,
			this.app.metadataCache,
			this.app.vault
		);

		this.builtinTools = new BuiltinTools(this.app, this.metadataExtractor);

		// Generate API key if not set
		if (!this.settings.apiKey) {
			this.settings.apiKey = randomUUID();
			await this.saveSettings();

			new Notice(
				'Lattice Relay: API key generated. Copy it from settings to configure MCP server.',
				10000
			);
		}

		// Initialize tool registry
		const pluginDir = path.join(vaultBasePath, '.obsidian', 'plugins', this.manifest.id);
		this.toolRegistry = new ToolRegistry(this.app, pluginDir, this.settings.toolSearchPaths);

		// Expose the programmatic registration API to other plugins as soon as
		// toolRegistry exists - registerTool() works even before initialize()
		// finishes (see ToolRegistry.applyProgrammaticTools()), so another
		// plugin's onload() can call this.app.plugins.plugins['lattice-relay'].api
		// without needing to wait on our own initialization order.
		this.api = {
			registerTool: (definition, handler, options) =>
				this.toolRegistry.registerTool(definition, handler, options),
			unregisterTool: (name) => this.toolRegistry.unregisterTool(name)
		};

		try {
			await this.toolRegistry.initialize();
			const stats = this.toolRegistry.getStats();
			logger.info(`Tool registry initialized (${stats.total} tools: ${stats.builtin} builtin, ${stats.user} user)`);
		} catch (error) {
			logger.error('Failed to initialize tool registry:', error);
			new Notice('Lattice Relay: Failed to initialize tool registry - see console', 5000);
		}

		// Initialize WebSocket server
		this.server = new MCPWebSocketServer(this);

		// Start server
		try {
			this.server.start();
			new Notice(`Lattice Relay: Server started on ${this.settings.host}:${this.settings.port}`);
			logger.info(`Server started on ${this.settings.host}:${this.settings.port}`);
		} catch (error) {
			logger.error('Failed to start server:', error);
			new Notice('Lattice Relay: Failed to start server. Check console for details.', 5000);
		}

		// Add settings tab
		this.addSettingTab(new RelaySettingsTab(this.app, this));

		// Add status bar item
		const statusBarItem = this.addStatusBarItem();
		const stats = this.toolRegistry.getStats();
		statusBarItem.setText(`Lattice Relay: ${stats.total} tools`);
		statusBarItem.addClass('lattice-relay-status');

		// Add command to copy API key
		this.addCommand({
			id: 'copy-api-key',
			name: 'Copy API Key',
			callback: () => {
				navigator.clipboard.writeText(this.settings.apiKey);
				new Notice('Lattice Relay: API key copied to clipboard');
			}
		});

		// Add command to restart server
		this.addCommand({
			id: 'restart-server',
			name: 'Restart WebSocket Server',
			callback: () => {
				this.server.stop();
				this.server.start();
				new Notice('Lattice Relay: Server restarted');
			}
		});

		// Add command to reload tool registry
		this.addCommand({
			id: 'reload-tools',
			name: 'Reload Tool Registry',
			callback: async () => {
				try {
					const stats = await this.toolRegistry.reload();
					statusBarItem.setText(`Lattice Relay: ${stats.total} tools`);
				} catch {
					// ToolRegistry already records the diagnostic and shows the failure notice.
				}
			}
		});

		logger.info('Plugin loaded - extensible tool registry active');
	}

	onunload() {
		// Stop WebSocket server
		this.server.stop();

		// Cleanup tool registry
		this.toolRegistry.destroy();

		// Flush any debounced cache metadata write so it isn't lost
		this.cacheManager?.flush();

		logger.info('Plugin unloaded');
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	isServerRunning(): boolean {
		return this.server?.isRunning() ?? false;
	}

	/**
	 * Handle incoming MCP requests
	 */
	async handleRequest(request: MCPRequest): Promise<unknown> {
		const { method, params = {} } = request;

		logger.debug(`Handling request: ${method}`, params);

		try {
			// Check if this is a tool in the registry
			const tool = this.toolRegistry.getTool(method);

			if (tool) {
				logger.debug(`Found tool: ${method} (handler: ${tool.handler})`);

				// The tool's own inputSchema (from its YAML definition) is the single
				// source of truth for what params it accepts - enforce it here, once,
				// for every tool (builtin and user-defined alike), rather than each
				// tool separately re-declaring and hoping it matches.
				assertValidParams(method, tool.inputSchema, params);

				// Route to appropriate handler
				if (tool.handler === 'builtin') {
					return this.handleBuiltinTool(method, params);
				} else {
					// Execute user script or programmatically-registered handler -
					// both run through the registry the same way (see
					// ToolRegistry.executeTool()); only 'builtin' is special-cased.
					return await this.toolRegistry.executeTool(method, params);
				}
			}

			// Fallback for special methods
			logger.debug(`Method '${method}' not in registry, checking special methods`);
			switch (method) {
				case 'ping':
					return {
						status: 'ok',
						timestamp: Date.now(),
						version: '2.0.0-extensible'
					};

				case 'broadcast':
					this.server.broadcast({
						type: params.type || 'event',
						timestamp: Date.now(),
						...params
					});
					return {
						status: 'broadcast_sent',
						clients: this.server['clients'].size
					};

				case 'tools/list':
					// Return all available tools
					try {
						const allTools = this.toolRegistry?.getAllTools() || [];
						logger.debug(`Listing ${allTools.length} tools`);

						// Build response incrementally to avoid blocking
						const toolsArray: Record<string, unknown>[] = [];
						for (const t of allTools) {
							toolsArray.push({
								name: t.name,
								description: t.description,
								inputSchema: t.inputSchema,
								...(t.outputSchema && { outputSchema: t.outputSchema }),
								...(t.category && { category: t.category }),
								...(t.tags && { tags: t.tags })
							});
						}

						logger.debug(`Returning ${toolsArray.length} tools with schemas`);
						return {
							tools: toolsArray
						};
					} catch (error) {
						logger.error('Error listing tools:', error);
						return {
							tools: [],
							error: `Failed to list tools: ${error instanceof Error ? error.message : 'Unknown error'}`,
						};
					}

				default:
					logger.warn(`Unknown method: '${method}'`);
					throw new Error(`Unknown method: ${method}`);
			}
		} catch (error) {
			logger.error(`Error handling request '${method}':`, error);
			throw error;
		}
	}

	/**
	 * Handle built-in tools. `ping` and the Dataview tools stay here since
	 * they need the full plugin instance; everything else delegates to
	 * BuiltinTools (src/builtin-tools.ts).
	 */
	private async handleBuiltinTool(method: string, params: Record<string, unknown>): Promise<unknown> {
		switch (method) {
			case 'ping':
				return {
					status: 'ok',
					timestamp: Date.now(),
					version: '2.0.0-extensible'
				};

			case 'run_dataview_block':
				return await runDataviewBlock(this, params as any);

			case 'extract_dataview_blocks':
				return await extractDataviewBlocks(this, params.filepath as string);

			case 'reload_tool_registry': {
				const stats = await this.toolRegistry.reload({ notify: false });
				return {
					success: true,
					reloadedAt: new Date().toISOString(),
					...stats
				};
			}

			default:
				return this.builtinTools.execute(method, params);
		}
	}
}
