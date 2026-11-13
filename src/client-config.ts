import * as path from 'path';

/**
 * Generated MCP client configuration for the Lattice Relay stdio server.
 *
 * The server reads only these variable names (see servers/node/src/config.ts);
 * the variable names used before Relay 0.1.0 are retired.
 */
export const ENV_KEY = 'LATTICE_RELAY_KEY';
export const ENV_PORT = 'LATTICE_RELAY_PORT';

/** Plugin-relative path of the bundled stdio server in the release layout. */
export const SERVER_SCRIPT = path.join('server', 'lattice-relay.mjs');

/** MCP client server key for a vault, e.g. `lattice_relay_papertrail`. */
export function serverNameForVault(vaultName: string): string {
	return `lattice_relay_${vaultSlug(vaultName)}`;
}

/** Absolute path of the stdio server inside an installed plugin directory. */
export function serverScriptPath(vaultBasePath: string, pluginId: string): string {
	return path.join(vaultBasePath, '.obsidian', 'plugins', pluginId, SERVER_SCRIPT);
}

export const API_KEY_PLACEHOLDER = '<copy your key here>';

/** Slugifies a vault name into the underscore-separated form used in generated server names. */
export function vaultSlug(name: string): string {
	return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

export interface ClientConfigParams {
	serverName: string;
	/** OS-native path (backslashes on Windows) - for formats that don't need JSON escaping, e.g. TOML literal strings. */
	mainJsPath: string;
	/** Forward-slash path - safe to drop into a JSON string without escaping. */
	mainJsPathForward: string;
	apiKey: string;
	port: number;
}

export interface ClientAgentDef {
	id: string;
	label: string;
	/** A caveat shown above the config when the format/location isn't fully verified against current vendor docs. */
	note?: string;
	getConfigPath: (homeDir: string, vaultBasePath: string) => string;
	renderConfig: (params: ClientConfigParams) => string;
}

export function jsonMcpServers(params: ClientConfigParams): string {
	return JSON.stringify({
		mcpServers: {
			[params.serverName]: {
				command: 'node',
				args: [params.mainJsPathForward],
				env: {
					[ENV_KEY]: params.apiKey,
					[ENV_PORT]: String(params.port)
				}
			}
		}
	}, null, 2);
}

export const CLIENT_AGENTS: ClientAgentDef[] = [
	{
		id: 'claude-code',
		label: 'Claude Code',
		getConfigPath: (_home, vaultBasePath) => path.join(vaultBasePath, '.mcp.json'),
		renderConfig: jsonMcpServers
	},
	{
		id: 'codex',
		label: 'Codex',
		getConfigPath: (home) => path.join(home, '.codex', 'config.toml'),
		renderConfig: ({ serverName, mainJsPath, apiKey, port }) =>
			`[mcp_servers.${serverName}]\n` +
			`command = "node"\n` +
			`args = [\n` +
			`  '${mainJsPath}',\n` +
			`]\n` +
			`env = { ${ENV_KEY} = "${apiKey}", ${ENV_PORT} = "${port}" }`
	},
	{
		id: 'gemini-cli',
		label: 'Gemini CLI',
		getConfigPath: (home) => path.join(home, '.gemini', 'settings.json'),
		renderConfig: jsonMcpServers
	},
	{
		id: 'mistral-vibe',
		label: 'Mistral Vibe',
		note: '⚠️ Config location/format for Mistral Vibe could not be verified - this follows the common MCP JSON convention as a starting point. Check its docs to confirm.',
		getConfigPath: (home) => path.join(home, '.vibe', 'config.json'),
		renderConfig: jsonMcpServers
	},
	{
		id: 'opencode',
		label: 'OpenCode',
		note: '⚠️ OpenCode also supports a project-level opencode.json in your vault root - check its docs to confirm which your version uses.',
		getConfigPath: (home) => path.join(home, '.config', 'opencode', 'opencode.json'),
		renderConfig: ({ serverName, mainJsPathForward, apiKey, port }) =>
			JSON.stringify({
				mcp: {
					[serverName]: {
						type: 'local',
						command: ['node', mainJsPathForward],
						environment: {
							[ENV_KEY]: apiKey,
							[ENV_PORT]: String(port)
						}
					}
				}
			}, null, 2)
	},
	{
		id: 'kiro',
		label: 'Kiro',
		note: 'Kiro also supports a global config at ~/.kiro/settings/mcp.json - use that instead if you want this available across all workspaces.',
		getConfigPath: (_home, vaultBasePath) => path.join(vaultBasePath, '.kiro', 'settings', 'mcp.json'),
		renderConfig: ({ serverName, mainJsPathForward, apiKey, port }) =>
			JSON.stringify({
				mcpServers: {
					[serverName]: {
						command: 'node',
						args: [mainJsPathForward],
						env: {
							[ENV_KEY]: apiKey,
							[ENV_PORT]: String(port)
						},
						disabled: false,
						autoApprove: []
					}
				}
			}, null, 2)
	},
	{
		id: 'hermes-agent',
		label: 'Hermes Agent',
		note: '⚠️ Hermes Agent\'s config format/location could not be verified - this is a best-effort guess based on common MCP client conventions. Check its docs to confirm.',
		getConfigPath: (home) => path.join(home, '.hermes', 'config.json'),
		renderConfig: jsonMcpServers
	}
];
