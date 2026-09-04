import { App, Vault } from 'obsidian';

/**
 * Tool definition from YAML
 */
export interface ToolDefinition {
	name: string;
	description: string;
	handler: string;  // "builtin" or path to script (e.g., "my_tool.js")
	category?: string;
	tags?: string[];
	inputSchema: {
		type: string;
		properties: Record<string, unknown>;
		required?: string[];
	};
	outputSchema?: {
		type: string;
		properties: Record<string, unknown>;
	};
	// Internal metadata (not part of YAML definition)
	_sourcePath?: string;  // Which search path this tool was discovered from (display label)
	_sourceDir?: string;   // Absolute directory containing this tool's YAML file (used to resolve a relative `handler` path)
}

/**
 * Tools YAML structure
 */
export interface ToolsConfig {
	version: string;
	config: {
		auto_reload: boolean;
		sandbox_user_scripts: boolean;
		enable_auto_generation: boolean;
	};
	tools: {
		builtin: ToolDefinition[];
		user: ToolDefinition[];
		auto: ToolDefinition[];
	};
}

/**
 * Shape accepted by ToolRegistry.registerTool() (see tool-registry.ts) - the
 * programmatic-registration counterpart to a user tool's YAML definition.
 * Callers supply the handler function separately, so they don't set `handler`
 * (a disk-path/`'builtin'` marker) or the file-discovery metadata fields
 * themselves; the registry fills `handler: 'programmatic'` in on registration.
 */
export type ProgrammaticToolDefinition = Omit<ToolDefinition, 'handler' | '_sourcePath' | '_sourceDir'>;

/**
 * Handler context provided to user scripts
 */
export interface HandlerContext {
	app: App;
	vault: Vault;
	workspace: unknown;
	metadataCache: unknown;
	fileManager: unknown;
	plugins: Record<string, unknown>;
}

/**
 * Handler execution result
 */
export interface HandlerResult {
	[key: string]: unknown;
}

/**
 * The shape every handler script's module.exports must satisfy. Also the shape
 * expected of the in-memory `handler` passed to ToolRegistry.registerTool() -
 * a programmatically-registered tool is executed exactly like a file-based one.
 */
export interface UserHandlerModule {
	execute(params: Record<string, unknown>, context: HandlerContext): Promise<HandlerResult>;
}

export function isUserHandlerModule(value: unknown): value is UserHandlerModule {
	return (
		typeof value === 'object' &&
		value !== null &&
		typeof (value as { execute?: unknown }).execute === 'function'
	);
}

export function getAllToolDefinitions(config: ToolsConfig): ToolDefinition[] {
	return [
		...(config.tools.builtin || []),
		...(config.tools.user || []),
		...(config.tools.auto || [])
	];
}
