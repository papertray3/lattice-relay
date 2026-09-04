import { App, Notice } from 'obsidian';
import * as yaml from 'js-yaml';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from './logger';
import { ToolDefinition, ToolsConfig, HandlerContext, HandlerResult, UserHandlerModule, ProgrammaticToolDefinition, getAllToolDefinitions } from './registry/types';
import { loadYamlFile } from './registry/yaml-loader';
import { discoverUserTools } from './registry/discovery';
import { validateToolsConfig } from './registry/validation';
import { loadUserHandler } from './registry/handler-loader';
import { writeMcpConfig } from './registry/mcp-config-writer';
import { ToolFileWatcher } from './registry/file-watcher';

export type { ToolDefinition, ToolsConfig, HandlerContext, HandlerResult, UserHandlerModule, ProgrammaticToolDefinition };

export interface ToolRegistryStats {
	total: number;
	builtin: number;
	user: number;
	auto: number;
}

interface ToolsDefaultsFile {
	version: string;
	config: ToolsConfig['config'];
	tools: { builtin?: ToolDefinition[] };
}

function isToolsDefaultsFile(value: unknown): value is ToolsDefaultsFile {
	if (typeof value !== 'object' || value === null) return false;
	const v = value as Record<string, unknown>;
	return typeof v.version === 'string' && typeof v.config === 'object' && typeof v.tools === 'object';
}

/**
 * Tool Registry - orchestrates config loading, discovery, handler loading,
 * hot-reload, and execution. The actual logic for each of those lives in
 * src/registry/* as small, independently testable, mostly-pure modules;
 * this class holds the stateful pieces (loaded config, loaded handlers, the
 * file watcher) and wires them together.
 */
export class ToolRegistry {
	private app: App;
	private pluginDir: string;
	private defaultsPath: string;
	private vaultConfigDir: string;
	private userToolsDir: string;
	private generatedPath: string;
	private config: ToolsConfig | null = null;
	private handlers: Map<string, 'builtin' | UserHandlerModule> = new Map();
	private fileWatcher: ToolFileWatcher = new ToolFileWatcher();
	private initialized: boolean = false;
	private cachedAllTools: ToolDefinition[] = [];
	private toolSearchPaths: string[];
	private vaultBasePath: string;

	// Tools registered in-memory via registerTool() (e.g. by another Obsidian
	// plugin from its own onload()) - see registerTool()/applyProgrammaticTools()
	// for why these live in their own maps instead of directly in `config`/`handlers`.
	private programmaticTools: Map<string, ToolDefinition> = new Map();
	private programmaticHandlers: Map<string, UserHandlerModule> = new Map();

	constructor(app: App, pluginDir: string, toolSearchPaths: string[] = []) {
		this.app = app;
		this.pluginDir = pluginDir;
		this.vaultBasePath = (app.vault.adapter as any).basePath;
		this.toolSearchPaths = toolSearchPaths;

		// Plugin defaults (read-only, shipped with plugin)
		this.defaultsPath = path.join(pluginDir, 'mcp-bridge', 'defaults', 'tools.defaults.yaml');

		// Vault-level user config (preserved across updates)
		this.vaultConfigDir = path.join(this.vaultBasePath, '.obsidian', 'mcp-bridge');
		this.userToolsDir = path.join(this.vaultConfigDir, 'tools');

		// Generated output (in plugin directory)
		this.generatedPath = path.join(pluginDir, 'mcp-bridge', 'generated');
	}

	/**
	 * Initialize the registry
	 */
	async initialize(): Promise<void> {
		if (this.initialized) {
			logger.debug('Tool registry already initialized, skipping');
			return;
		}

		logger.info('Initializing tool registry...');

		this.ensureDirectories();
		logger.debug('Directories ensured');

		await this.loadConfig();
		logger.debug('Config loaded');

		this.loadHandlers();
		logger.debug('Handlers loaded');

		// Re-projects any tools registered via registerTool() before initialize()
		// finished (plugin load order isn't guaranteed) and (re)generates the MCP
		// config - see applyProgrammaticTools().
		this.applyProgrammaticTools();
		logger.debug('Programmatic tools applied, MCP config generated');

		if (this.config?.config.auto_reload) {
			this.startFileWatcher();
		}

		this.initialized = true;
		logger.info(`Tool registry initialized with ${this.getAllTools().length} tools`);
	}

	/**
	 * Ensure required directories exist
	 */
	private ensureDirectories(): void {
		const dirs = [
			this.generatedPath,           // Plugin generated files
			this.vaultConfigDir,          // Vault-level config directory
			this.userToolsDir             // User tools directory
		];

		for (const dir of dirs) {
			if (!fs.existsSync(dir)) {
				fs.mkdirSync(dir, { recursive: true });
				logger.debug(`Created directory: ${dir}`);
			}
		}
	}

	/**
	 * Load and parse configurations
	 */
	private async loadConfig(): Promise<void> {
		try {
			logger.info('Loading tool configurations...');

			// 1. Load plugin defaults (always present)
			const defaults = loadYamlFile(this.defaultsPath);
			if (!defaults || !isToolsDefaultsFile(defaults)) {
				throw new Error('Plugin defaults not found - corrupted installation');
			}
			logger.debug(`Loaded ${defaults.tools.builtin?.length || 0} builtin tools from defaults`);

			// 2. Discover user-defined tools
			const userTools = await discoverUserTools(this.toolSearchPaths, this.vaultBasePath);
			logger.debug(`Discovered ${userTools.length} user tools`);

			// 3. Merge configurations
			const config: ToolsConfig = {
				version: defaults.version,
				config: defaults.config,
				tools: {
					builtin: defaults.tools.builtin || [],
					user: userTools,
					auto: []   // Repopulated from `programmaticTools` by applyProgrammaticTools(),
					           // called right after this in both initialize() and reload().
				}
			};

			// 4. Validate final configuration
			validateToolsConfig(config);
			this.config = config;

			logger.info(`Tool registry loaded - ${this.getStats().total} total tools`);
		} catch (error) {
			logger.error('Failed to load configuration:', error);
			new Notice('MCP Bridge: Failed to load tool configuration - see console for details', 5000);
			throw error;
		}
	}

	/**
	 * Load all handler scripts (builtin tools just get tagged; user tool
	 * handlers are require()'d - see registry/handler-loader.ts; programmatic
	 * tools are skipped here and wired up by applyProgrammaticTools() instead).
	 */
	private loadHandlers(): void {
		if (!this.config) return;

		for (const tool of getAllToolDefinitions(this.config)) {
			if (tool.handler === 'builtin') {
				this.handlers.set(tool.name, 'builtin');
				continue;
			}
			if (tool.handler === 'programmatic') {
				// The live function reference lives in `programmaticHandlers`, not on
				// disk - there's nothing to require() here. applyProgrammaticTools()
				// (called right after loadHandlers() in both initialize() and reload())
				// sets the real handler on `this.handlers`.
				continue;
			}

			const handler = loadUserHandler(tool);
			if (handler) {
				this.handlers.set(tool.name, handler);
			}
		}
	}

	/**
	 * Update tool search paths and reload
	 */
	async updateSearchPaths(searchPaths: string[]): Promise<void> {
		this.toolSearchPaths = searchPaths;
		await this.reload();
		if (this.config?.config.auto_reload) this.startFileWatcher();
	}

	/**
	 * Reload configuration and handlers
	 */
	async reload(options: { notify?: boolean } = {}): Promise<ToolRegistryStats> {
		const notify = options.notify ?? true;
		const previousConfig = this.config;
		const previousHandlers = this.handlers;
		const previousCache = this.cachedAllTools;
		try {
			// Invalidate before loading or generating. Clearing this after generation
			// caused the first reload to publish the previous registry snapshot.
			this.cachedAllTools = [];
			this.handlers = new Map();
			await this.loadConfig();
			this.loadHandlers();
			// loadConfig()/loadHandlers() only know about disk defaults and
			// file-discovered tools - without this, registerTool() registrations
			// would be silently wiped out by every reload. See applyProgrammaticTools().
			this.applyProgrammaticTools();
			const stats = this.getStats();
			if (notify) new Notice('MCP Bridge: Tool registry reloaded');
			logger.info('Tool registry reloaded successfully');
			return stats;
		} catch (error) {
			// A failed refresh must not take the currently working registry offline.
			this.config = previousConfig;
			this.handlers = previousHandlers;
			this.cachedAllTools = previousCache;
			logger.error('Failed to reload:', error);
			if (notify) new Notice('MCP Bridge: Failed to reload - see console for details', 5000);
			throw error;
		}
	}

	private startFileWatcher(): void {
		const watchPaths = [
			this.defaultsPath,
			this.vaultConfigDir,
			...this.toolSearchPaths.map(searchPath => path.isAbsolute(searchPath)
				? searchPath
				: path.join(this.vaultBasePath, searchPath))
		];
		this.fileWatcher.start([...new Set(watchPaths)], async () => {
			try {
				await this.reload({ notify: false });
			} catch (error) {
				logger.error('Automatic tool registry reload failed:', error);
			}
		});
	}

	/**
	 * Generate MCP server configuration
	 */
	private generateMCPConfig(): void {
		if (!this.config) return;
		const outputPath = path.join(this.generatedPath, 'mcp-config.json');
		writeMcpConfig(this.config, this.getAllTools(), outputPath);
	}

	/**
	 * Get all tool definitions (cached for fast access)
	 */
	getAllTools(): ToolDefinition[] {
		if (!this.config) {
			logger.warn('getAllTools() called but config is null - registry may not be initialized');
			return [];
		}

		if (this.cachedAllTools.length === 0) {
			this.cachedAllTools = getAllToolDefinitions(this.config);
		}

		return this.cachedAllTools;
	}

	/**
	 * Get tool by name
	 */
	getTool(name: string): ToolDefinition | undefined {
		return this.getAllTools().find(t => t.name === name);
	}

	/**
	 * Execute a tool
	 */
	async executeTool(name: string, params: Record<string, unknown>): Promise<HandlerResult> {
		const tool = this.getTool(name);
		if (!tool) {
			throw new Error(`Tool not found: ${name}`);
		}

		const handler = this.handlers.get(name);
		if (!handler) {
			throw new Error(`Handler not loaded for tool: ${name}`);
		}

		// If builtin, it will be handled by the plugin's handleRequest method
		if (handler === 'builtin') {
			throw new Error(`Builtin tool ${name} should be handled by plugin`);
		}

		try {
			return await handler.execute(params, this.createContext());
		} catch (error) {
			logger.error(`Error executing ${name}:`, error);
			throw error;
		}
	}

	/**
	 * Create handler context
	 */
	private createContext(): HandlerContext {
		return {
			app: this.app,
			vault: this.app.vault,
			workspace: this.app.workspace,
			metadataCache: this.app.metadataCache,
			fileManager: this.app.fileManager,
			plugins: this.getPluginAPIs()
		};
	}

	/**
	 * Get available plugin APIs
	 */
	private getPluginAPIs(): Record<string, unknown> {
		const plugins: Record<string, unknown> = {};

		// @ts-ignore - accessing internal plugin registry
		const pluginRegistry = this.app.plugins?.plugins || {};

		// Expose common plugins
		const exposedPlugins = [
			'dataview',
			'metadata-menu',
			'smart-connections',
			'digital-garden',
			'templater'
		];

		for (const pluginId of exposedPlugins) {
			if (pluginRegistry[pluginId]) {
				plugins[pluginId] = pluginRegistry[pluginId];
			}
		}

		return plugins;
	}

	/**
	 * Get tool statistics
	 */
	getStats(): ToolRegistryStats {
		if (!this.config) {
			return { total: 0, builtin: 0, user: 0, auto: 0 };
		}

		return {
			total: this.getAllTools().length,
			builtin: (this.config.tools.builtin || []).length,
			user: (this.config.tools.user || []).length,
			auto: (this.config.tools.auto || []).length
		};
	}

	/**
	 * Programmatically add a custom tool (for installation scripts, etc.)
	 */
	async addTool(toolDefinition: ToolDefinition, options?: { overwrite?: boolean }): Promise<void> {
		if (!toolDefinition.name) {
			throw new Error('Tool definition missing required field: name');
		}
		if (!toolDefinition.description) {
			throw new Error('Tool definition missing required field: description');
		}
		if (!toolDefinition.handler) {
			throw new Error('Tool definition missing required field: handler');
		}
		if (!toolDefinition.inputSchema) {
			throw new Error('Tool definition missing required field: inputSchema');
		}

		if (!fs.existsSync(this.userToolsDir)) {
			fs.mkdirSync(this.userToolsDir, { recursive: true });
			logger.debug(`Created user tools directory: ${this.userToolsDir}`);
		}

		const filename = `${toolDefinition.name}.yaml`;
		const filePath = path.join(this.userToolsDir, filename);

		if (fs.existsSync(filePath) && !options?.overwrite) {
			throw new Error(`Tool "${toolDefinition.name}" already exists. Use overwrite option to replace.`);
		}

		const toolYaml: Record<string, unknown> = {
			name: toolDefinition.name,
			description: toolDefinition.description,
			handler: toolDefinition.handler,
			inputSchema: toolDefinition.inputSchema
		};

		if (toolDefinition.category) {
			toolYaml.category = toolDefinition.category;
		}
		if (toolDefinition.tags && toolDefinition.tags.length > 0) {
			toolYaml.tags = toolDefinition.tags;
		}
		if (toolDefinition.outputSchema) {
			toolYaml.outputSchema = toolDefinition.outputSchema;
		}

		try {
			fs.writeFileSync(filePath, yaml.dump(toolYaml, { indent: 2 }));
			logger.info(`Tool "${toolDefinition.name}" added successfully at ${filePath}`);

			await this.reload();
		} catch (error) {
			logger.error(`Failed to add tool "${toolDefinition.name}":`, error);
			throw error;
		}
	}

	/**
	 * Register a tool programmatically, entirely in-memory - no YAML file, no
	 * handler script on disk. This is what MCPBridgePlugin.api.registerTool()
	 * (see main.ts) exposes to other Obsidian plugins, so they can add MCP
	 * tools from their own onload() instead of dropping files into a configured
	 * tool search path.
	 *
	 * The registration lives in `programmaticTools`/`programmaticHandlers`,
	 * which reload() never clears (see applyProgrammaticTools()) - it survives
	 * both manual and file-watcher-triggered reloads.
	 *
	 * A name collision with any existing tool (builtin, file-based, or another
	 * programmatic registration) is an error unless `{ overwrite: true }` is
	 * passed - matching addTool()'s existing precedent, and safer as a default
	 * for callers who don't control what other plugins/files might already be
	 * using a given tool name.
	 */
	registerTool(
		definition: ProgrammaticToolDefinition,
		handler: UserHandlerModule,
		options: { overwrite?: boolean } = {}
	): void {
		if (!definition.name) {
			throw new Error('Tool definition missing required field: name');
		}
		if (!definition.description) {
			throw new Error('Tool definition missing required field: description');
		}
		if (!definition.inputSchema) {
			throw new Error('Tool definition missing required field: inputSchema');
		}
		if (!handler || typeof handler.execute !== 'function') {
			throw new Error(`Handler for tool "${definition.name}" must implement execute(params, context)`);
		}

		const existing = this.getTool(definition.name);
		if (existing && !options.overwrite) {
			const source = this.programmaticTools.has(definition.name)
				? 'an earlier registerTool() call'
				: (existing._sourcePath ?? existing.handler);
			throw new Error(`Tool "${definition.name}" already exists (source: ${source}). Pass { overwrite: true } to replace it.`);
		}

		const toolDef: ToolDefinition = { ...definition, handler: 'programmatic', _sourcePath: 'programmatic' };
		this.programmaticTools.set(definition.name, toolDef);
		this.programmaticHandlers.set(definition.name, handler);
		this.applyProgrammaticTools();

		logger.info(`Tool "${definition.name}" registered programmatically`);
	}

	/**
	 * Unregister a programmatically-registered tool. Intended for
	 * `this.register(() => bridgeApi.unregisterTool(name))` in a calling
	 * plugin's onload() (Obsidian's standard cleanup idiom) - safe to call even
	 * if the tool was never registered (returns false rather than throwing),
	 * and only ever removes registerTool() registrations, never builtin or
	 * file-based tools.
	 */
	unregisterTool(name: string): boolean {
		const existed = this.programmaticTools.delete(name);
		this.programmaticHandlers.delete(name);
		if (!existed) return false;

		// applyProgrammaticTools() only adds/refreshes entries still present in
		// programmaticHandlers - it doesn't know to remove one that's gone, so
		// drop the live handler entry directly.
		this.handlers.delete(name);
		this.applyProgrammaticTools();

		logger.info(`Tool "${name}" unregistered`);
		return true;
	}

	/**
	 * Re-project the persistent programmatic-tool maps into the live
	 * `config.tools.auto` / `handlers` / `cachedAllTools` state. Called both
	 * directly from registerTool()/unregisterTool(), and after every
	 * loadConfig()+loadHandlers() cycle (initialize(), reload()) - loadConfig()
	 * always rebuilds `config` from disk defaults plus file-discovered tools
	 * only (hardcoding `tools.auto: []`), and reload() replaces `handlers` with
	 * a fresh Map, so without this, programmatic registrations would be
	 * silently wiped out by the very next reload.
	 */
	private applyProgrammaticTools(): void {
		if (!this.config) return;
		this.config.tools.auto = Array.from(this.programmaticTools.values());
		for (const [name, handler] of this.programmaticHandlers) {
			this.handlers.set(name, handler);
		}
		this.cachedAllTools = [];
		this.generateMCPConfig();
	}

	/**
	 * Cleanup
	 */
	destroy(): void {
		void this.fileWatcher.stop();
	}
}
