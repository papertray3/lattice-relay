import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { App } from 'obsidian';
import { ToolRegistry, ToolDefinition } from './tool-registry';

const DEFAULTS_YAML = {
	version: '2.0',
	config: {
		auto_reload: false, // keep tests fast and avoid dangling fs.watch handles
		sandbox_user_scripts: true,
		enable_auto_generation: false,
	},
	tools: {
		builtin: [
			{
				name: 'ping',
				description: 'Test connectivity',
				handler: 'builtin',
				inputSchema: { type: 'object', properties: {} },
			},
			{
				name: 'search_files',
				description: 'Search for files',
				handler: 'builtin',
				inputSchema: { type: 'object', properties: { pattern: { type: 'string' } }, required: ['pattern'] },
			},
		],
		user: [],
		auto: [],
	},
};

function makeFakeApp(vaultBasePath: string): App {
	return {
		vault: { adapter: { basePath: vaultBasePath } },
		workspace: {},
		metadataCache: {},
		fileManager: {},
		plugins: { plugins: {} },
	} as unknown as App;
}

function writeYaml(filePath: string, data: unknown): void {
	fs.mkdirSync(path.dirname(filePath), { recursive: true });
	fs.writeFileSync(filePath, yaml.dump(data));
}

function waitFor(predicate: () => boolean, timeoutMs = 2500, intervalMs = 25): Promise<void> {
	return new Promise((resolve, reject) => {
		const started = Date.now();
		const check = () => {
			if (predicate()) return resolve();
			if (Date.now() - started > timeoutMs) return reject(new Error('waitFor timed out'));
			setTimeout(check, intervalMs);
		};
		check();
	});
}

describe('ToolRegistry', () => {
	let pluginDir: string;
	let vaultBasePath: string;

	beforeEach(() => {
		pluginDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-relay-plugin-'));
		vaultBasePath = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-relay-vault-'));
		writeYaml(path.join(pluginDir, 'defaults', 'tools.defaults.yaml'), DEFAULTS_YAML);
	});

	afterEach(() => {
		fs.rmSync(pluginDir, { recursive: true, force: true });
		fs.rmSync(vaultBasePath, { recursive: true, force: true });
	});

	describe('initialize', () => {
		it('loads builtin tools from defaults and reports stats', async () => {
			const registry = new ToolRegistry(makeFakeApp(vaultBasePath), pluginDir, []);
			await registry.initialize();

			const stats = registry.getStats();
			expect(stats.total).toBe(2);
			expect(stats.builtin).toBe(2);
			expect(stats.user).toBe(0);
			expect(registry.getTool('ping')?.description).toBe('Test connectivity');
			expect(registry.getTool('does-not-exist')).toBeUndefined();
		});

		it('creates the vault config and user tools directories', async () => {
			const registry = new ToolRegistry(makeFakeApp(vaultBasePath), pluginDir, []);
			await registry.initialize();

			expect(fs.existsSync(path.join(vaultBasePath, '.obsidian', 'lattice-relay'))).toBe(true);
			expect(fs.existsSync(path.join(vaultBasePath, '.obsidian', 'lattice-relay', 'tools'))).toBe(true);
		});

		it('is idempotent - a second call is a no-op', async () => {
			const registry = new ToolRegistry(makeFakeApp(vaultBasePath), pluginDir, []);
			await registry.initialize();
			await registry.initialize();

			expect(registry.getStats().total).toBe(2);
		});

		it('throws if plugin defaults are missing', async () => {
			fs.rmSync(path.join(pluginDir, 'defaults', 'tools.defaults.yaml'));
			const registry = new ToolRegistry(makeFakeApp(vaultBasePath), pluginDir, []);

			await expect(registry.initialize()).rejects.toThrow('Plugin defaults not found');
		});

		it('rejects a user tool whose name collides with a builtin tool', async () => {
			const searchDir = path.join(vaultBasePath, 'custom-tools');
			writeYaml(path.join(searchDir, 'ping.yaml'), {
				name: 'ping', // collides with the builtin "ping"
				description: 'A rogue duplicate',
				handler: 'user/rogue.js',
				inputSchema: { type: 'object', properties: {} },
			});

			const registry = new ToolRegistry(makeFakeApp(vaultBasePath), pluginDir, ['custom-tools']);

			await expect(registry.initialize()).rejects.toThrow('Duplicate tool name: ping');
		});
	});

	describe('discoverUserTools', () => {
		it('discovers valid user tools from a configured search path', async () => {
			const searchDir = path.join(vaultBasePath, 'custom-tools');
			writeYaml(path.join(searchDir, 'count_notes.yaml'), {
				name: 'count_notes',
				description: 'Count total notes in vault',
				handler: 'user/count_notes.js',
				inputSchema: { type: 'object', properties: {} },
			});

			const registry = new ToolRegistry(makeFakeApp(vaultBasePath), pluginDir, ['custom-tools']);
			await registry.initialize();

			expect(registry.getStats().user).toBe(1);
			expect(registry.getTool('count_notes')?.handler).toBe('user/count_notes.js');
		});

		it('skips a user tool definition missing required fields', async () => {
			const searchDir = path.join(vaultBasePath, 'custom-tools');
			writeYaml(path.join(searchDir, 'broken.yaml'), {
				name: 'broken_tool',
				// missing description/handler/inputSchema
			});

			const registry = new ToolRegistry(makeFakeApp(vaultBasePath), pluginDir, ['custom-tools']);
			await registry.initialize();

			expect(registry.getTool('broken_tool')).toBeUndefined();
			expect(registry.getStats().user).toBe(0);
		});

		it('skips a duplicate user tool name found in a later file', async () => {
			const searchDir = path.join(vaultBasePath, 'custom-tools');
			const toolDef = {
				name: 'dupe_tool',
				description: 'First one wins',
				handler: 'user/dupe.js',
				inputSchema: { type: 'object', properties: {} },
			};
			writeYaml(path.join(searchDir, 'a_dupe.yaml'), toolDef);
			writeYaml(path.join(searchDir, 'b_dupe.yaml'), { ...toolDef, description: 'Second one loses' });

			const registry = new ToolRegistry(makeFakeApp(vaultBasePath), pluginDir, ['custom-tools']);
			await registry.initialize();

			expect(registry.getStats().user).toBe(1);
			expect(registry.getTool('dupe_tool')?.description).toBe('First one wins');
		});

		it('ignores a search path that does not exist', async () => {
			const registry = new ToolRegistry(makeFakeApp(vaultBasePath), pluginDir, ['nonexistent-path']);
			await registry.initialize();

			expect(registry.getStats().user).toBe(0);
		});

		it('tolerates malformed YAML without throwing', async () => {
			const searchDir = path.join(vaultBasePath, 'custom-tools');
			fs.mkdirSync(searchDir, { recursive: true });
			fs.writeFileSync(path.join(searchDir, 'malformed.yaml'), '{ not: valid: yaml: [');

			const registry = new ToolRegistry(makeFakeApp(vaultBasePath), pluginDir, ['custom-tools']);
			await expect(registry.initialize()).resolves.not.toThrow();
			expect(registry.getStats().user).toBe(0);
		});
	});

	describe('addTool', () => {
		// addTool() always writes into `.obsidian/lattice-relay/tools` (userToolsDir), but
		// discovery only rediscovers tools from `toolSearchPaths` - they're only the same
		// tools by convention (DEFAULT_SETTINGS.toolSearchPaths includes this path), so the
		// registry must be configured with that search path for a written tool to reappear.
		const userToolsSearchPath = ['.obsidian/lattice-relay/tools'];

		it('writes a new tool definition and makes it available after reload', async () => {
			const registry = new ToolRegistry(makeFakeApp(vaultBasePath), pluginDir, userToolsSearchPath);
			await registry.initialize();

			const newTool: ToolDefinition = {
				name: 'new_tool',
				description: 'Added at runtime',
				handler: 'user/new_tool.js',
				inputSchema: { type: 'object', properties: {} },
			};
			await registry.addTool(newTool);

			expect(registry.getTool('new_tool')).toBeDefined();
			const written = fs.readFileSync(
				path.join(vaultBasePath, '.obsidian', 'lattice-relay', 'tools', 'new_tool.yaml'),
				'utf8'
			);
			expect(written).toContain('name: new_tool');
		});

		it('refuses to overwrite an existing tool without the overwrite option', async () => {
			const registry = new ToolRegistry(makeFakeApp(vaultBasePath), pluginDir, userToolsSearchPath);
			await registry.initialize();

			const tool: ToolDefinition = {
				name: 'dup',
				description: 'first',
				handler: 'user/dup.js',
				inputSchema: { type: 'object', properties: {} },
			};
			await registry.addTool(tool);

			await expect(registry.addTool({ ...tool, description: 'second' })).rejects.toThrow('already exists');
		});
	});

	describe('registerTool / unregisterTool', () => {
		// Programmatic registration - the in-memory counterpart to addTool()/file
		// discovery, used by other Obsidian plugins from their own onload() (see
		// LatticeRelayPlugin.api in main.ts). No YAML file, no JS file on disk.
		function makeHandler(result: Record<string, unknown>) {
			return { execute: async () => result };
		}

		it('registers a tool in-memory and executes it without any file on disk', async () => {
			const registry = new ToolRegistry(makeFakeApp(vaultBasePath), pluginDir, []);
			await registry.initialize();

			registry.registerTool(
				{
					name: 'greet_programmatic',
					description: 'Registered without a YAML/JS file pair',
					inputSchema: { type: 'object', properties: { name: { type: 'string' } } },
				},
				{
					execute: async (params: any) => ({ message: `hello ${params.name}` }),
				}
			);

			expect(registry.getTool('greet_programmatic')?.handler).toBe('programmatic');
			expect(await registry.executeTool('greet_programmatic', { name: 'world' })).toEqual({ message: 'hello world' });
		});

		it('unregisterTool removes the tool and further execution fails cleanly', async () => {
			const registry = new ToolRegistry(makeFakeApp(vaultBasePath), pluginDir, []);
			await registry.initialize();

			registry.registerTool(
				{ name: 'temp_tool', description: 'Will be removed', inputSchema: { type: 'object', properties: {} } },
				makeHandler({ ok: true })
			);
			expect(registry.getTool('temp_tool')).toBeDefined();

			expect(registry.unregisterTool('temp_tool')).toBe(true);

			expect(registry.getTool('temp_tool')).toBeUndefined();
			await expect(registry.executeTool('temp_tool', {})).rejects.toThrow('Tool not found: temp_tool');
			// Mirrors this.register(() => api.unregisterTool(name)) firing twice - must stay a no-op.
			expect(registry.unregisterTool('temp_tool')).toBe(false);
		});

		it('survives reload() - the exact regression this API is designed to avoid', async () => {
			const searchDir = path.join(vaultBasePath, 'custom-tools');
			const registry = new ToolRegistry(makeFakeApp(vaultBasePath), pluginDir, ['custom-tools']);
			await registry.initialize();

			registry.registerTool(
				{ name: 'survives_reload', description: 'Registered by another plugin', inputSchema: { type: 'object', properties: {} } },
				makeHandler({ survived: true })
			);

			// reload() fully rebuilds `config` from loadConfig() (disk defaults +
			// discovered tools only) and replaces `handlers` with a fresh Map - the
			// programmatic registration must not be a casualty of that rebuild.
			writeYaml(path.join(searchDir, 'unrelated.yaml'), {
				name: 'unrelated_tool',
				description: 'Some other file-based tool appearing at the same time',
				handler: 'unrelated.js',
				inputSchema: { type: 'object', properties: {} },
			});
			fs.writeFileSync(path.join(searchDir, 'unrelated.js'), 'module.exports = { async execute() { return {}; } };');

			await registry.reload({ notify: false });

			expect(registry.getTool('survives_reload')).toBeDefined();
			expect(await registry.executeTool('survives_reload', {})).toEqual({ survived: true });
		});

		it('counts programmatic tools in getAllTools()/getStats() alongside builtin and file-based tools', async () => {
			const searchDir = path.join(vaultBasePath, 'custom-tools');
			writeYaml(path.join(searchDir, 'file_tool.yaml'), {
				name: 'file_tool',
				description: 'A file-based tool',
				handler: 'file_tool.js',
				inputSchema: { type: 'object', properties: {} },
			});
			fs.writeFileSync(path.join(searchDir, 'file_tool.js'), 'module.exports = { async execute() { return {}; } };');

			const registry = new ToolRegistry(makeFakeApp(vaultBasePath), pluginDir, ['custom-tools']);
			await registry.initialize();

			registry.registerTool(
				{ name: 'programmatic_tool', description: 'A programmatic tool', inputSchema: { type: 'object', properties: {} } },
				makeHandler({})
			);

			expect(registry.getStats()).toEqual({ total: 4, builtin: 2, user: 1, auto: 1 });
			expect(registry.getAllTools().map(t => t.name).sort()).toEqual(['file_tool', 'ping', 'programmatic_tool', 'search_files']);
		});

		it('rejects registering a name that collides with an existing tool by default', async () => {
			const registry = new ToolRegistry(makeFakeApp(vaultBasePath), pluginDir, []);
			await registry.initialize();

			expect(() =>
				registry.registerTool(
					{ name: 'ping', description: 'Rogue duplicate of the builtin ping', inputSchema: { type: 'object', properties: {} } },
					makeHandler({})
				)
			).toThrow('Tool "ping" already exists');
		});

		it('allows an explicit overwrite of a colliding name (including a prior programmatic registration)', async () => {
			const registry = new ToolRegistry(makeFakeApp(vaultBasePath), pluginDir, []);
			await registry.initialize();

			registry.registerTool(
				{ name: 'custom_once', description: 'First registration', inputSchema: { type: 'object', properties: {} } },
				makeHandler({ version: 1 })
			);
			expect(await registry.executeTool('custom_once', {})).toEqual({ version: 1 });

			registry.registerTool(
				{ name: 'custom_once', description: 'Second registration', inputSchema: { type: 'object', properties: {} } },
				makeHandler({ version: 2 }),
				{ overwrite: true }
			);

			expect(registry.getStats().auto).toBe(1); // replaced, not duplicated
			expect(await registry.executeTool('custom_once', {})).toEqual({ version: 2 });
		});

		it('rejects a registration missing required fields or a handler without execute()', async () => {
			const registry = new ToolRegistry(makeFakeApp(vaultBasePath), pluginDir, []);
			await registry.initialize();

			expect(() => registry.registerTool({ name: '' } as any, makeHandler({}))).toThrow('missing required field: name');
			expect(() =>
				registry.registerTool(
					{ name: 'no_handler_fn', description: 'x', inputSchema: { type: 'object', properties: {} } },
					{} as any
				)
			).toThrow('must implement execute');
		});
	});

	describe('reload', () => {
		it('invalidates the tool cache before regenerating the MCP manifest', async () => {
			const searchDir = path.join(vaultBasePath, 'custom-tools');
			const registry = new ToolRegistry(makeFakeApp(vaultBasePath), pluginDir, ['custom-tools']);
			await registry.initialize();

			// Populate the old cache, then add a tool behind the registry's back to
			// reproduce the stale-first-reload failure seen in the live vault.
			expect(registry.getAllTools()).toHaveLength(2);
			writeYaml(path.join(searchDir, 'late_tool.yaml'), {
				name: 'late_tool',
				description: 'Appears on reload',
				handler: 'late_tool.js',
				inputSchema: { type: 'object', properties: {} },
			});
			fs.writeFileSync(path.join(searchDir, 'late_tool.js'), 'module.exports = { async execute() { return { ok: true }; } };');

			const stats = await registry.reload({ notify: false });
			const generated = JSON.parse(fs.readFileSync(path.join(pluginDir, 'generated', 'mcp-config.json'), 'utf8'));

			expect(stats).toEqual({ total: 3, builtin: 2, user: 1, auto: 0 });
			expect(generated.tools.map((tool: ToolDefinition) => tool.name)).toContain('late_tool');
			expect(registry.getTool('late_tool')).toBeDefined();
		});

		it('preserves the working registry when a reload fails', async () => {
			const registry = new ToolRegistry(makeFakeApp(vaultBasePath), pluginDir, []);
			await registry.initialize();
			expect(registry.getTool('ping')).toBeDefined();

			fs.rmSync(path.join(pluginDir, 'defaults', 'tools.defaults.yaml'));

			await expect(registry.reload({ notify: false })).rejects.toThrow('Plugin defaults not found');
			expect(registry.getTool('ping')).toBeDefined();
			expect(registry.getStats()).toEqual({ total: 2, builtin: 2, user: 0, auto: 0 });
		});

		it('automatically reloads changes from a configured external search path', async () => {
			writeYaml(path.join(pluginDir, 'defaults', 'tools.defaults.yaml'), {
				...DEFAULTS_YAML,
				config: { ...DEFAULTS_YAML.config, auto_reload: true },
			});
			const searchDir = path.join(vaultBasePath, 'external-tools');
			fs.mkdirSync(searchDir, { recursive: true });
			const registry = new ToolRegistry(makeFakeApp(vaultBasePath), pluginDir, ['external-tools']);

			try {
				await registry.initialize();
				await (registry as any).fileWatcher.ready();
				fs.writeFileSync(path.join(searchDir, 'watched.js'), 'module.exports = { async execute() { return { ok: true }; } };');
				writeYaml(path.join(searchDir, 'watched.yaml'), {
					name: 'watched_tool',
					description: 'Loaded by the external path watcher',
					handler: 'watched.js',
					inputSchema: { type: 'object', properties: {} },
				});

				await waitFor(() => registry.getTool('watched_tool') !== undefined);
				expect(registry.getTool('watched_tool')).toBeDefined();
			} finally {
				registry.destroy();
			}
		});

		it('executes a replaced handler body after reload', async () => {
			const searchDir = path.join(vaultBasePath, 'custom-tools');
			fs.mkdirSync(searchDir, { recursive: true });
			writeYaml(path.join(searchDir, 'mutable.yaml'), {
				name: 'mutable_tool',
				description: 'Changes implementation in place',
				handler: 'mutable.js',
				inputSchema: { type: 'object', properties: {} },
			});
			const handlerPath = path.join(searchDir, 'mutable.js');
			fs.writeFileSync(handlerPath, 'module.exports = { async execute() { return { version: 1 }; } };');
			const registry = new ToolRegistry(makeFakeApp(vaultBasePath), pluginDir, ['custom-tools']);
			await registry.initialize();
			expect(await registry.executeTool('mutable_tool', {})).toEqual({ version: 1 });

			fs.writeFileSync(handlerPath, 'module.exports = { async execute() { return { version: 2 }; } };');
			await registry.reload({ notify: false });

			expect(await registry.executeTool('mutable_tool', {})).toEqual({ version: 2 });
		});
	});

	describe('executeTool', () => {
		it('runs a loaded user handler and returns its result', async () => {
			const registry = new ToolRegistry(makeFakeApp(vaultBasePath), pluginDir, []);
			await registry.initialize();

			const toolDef: ToolDefinition = {
				name: 'echo',
				description: 'Echoes params back',
				handler: 'user/echo.js',
				inputSchema: { type: 'object', properties: {} },
			};
			// Inject directly rather than round-tripping through the filesystem/require cache.
			(registry as any).config.tools.user.push(toolDef);
			(registry as any).cachedAllTools = [];
			(registry as any).handlers.set('echo', {
				execute: async (params: any, context: any) => ({
					echoed: params,
					hasApp: context.app !== undefined,
				}),
			});

			const result = await registry.executeTool('echo', { hello: 'world' });
			expect(result).toEqual({ echoed: { hello: 'world' }, hasApp: true });
		});

		it('throws for an unknown tool name', async () => {
			const registry = new ToolRegistry(makeFakeApp(vaultBasePath), pluginDir, []);
			await registry.initialize();

			await expect(registry.executeTool('nope', {})).rejects.toThrow('Tool not found: nope');
		});
	});

	// Handler resolution follows one rule: a relative `handler` path resolves against the
	// directory containing the tool's own YAML file. These tests exercise the real
	// require()-based loading path end to end, rather than injecting a handler directly.
	describe('handler path resolution', () => {
		it('loads a handler co-located with its YAML definition (bare filename)', async () => {
			const searchDir = path.join(vaultBasePath, 'custom-tools');
			writeYaml(path.join(searchDir, 'greet.yaml'), {
				name: 'greet',
				description: 'Says hello',
				handler: 'greet.js', // relative to the same directory as this YAML file
				inputSchema: { type: 'object', properties: { name: { type: 'string' } } },
			});
			fs.writeFileSync(
				path.join(searchDir, 'greet.js'),
				`module.exports = { async execute(params) { return { message: 'hello ' + params.name }; } };`
			);

			const registry = new ToolRegistry(makeFakeApp(vaultBasePath), pluginDir, ['custom-tools']);
			await registry.initialize();

			const result = await registry.executeTool('greet', { name: 'world' });
			expect(result).toEqual({ message: 'hello world' });
		});

		it('loads a handler referenced by a subpath relative to its YAML definition', async () => {
			const searchDir = path.join(vaultBasePath, 'custom-tools');
			writeYaml(path.join(searchDir, 'nested.yaml'), {
				name: 'nested_tool',
				description: 'Handler lives in a subfolder next to the YAML',
				handler: 'scripts/nested.js',
				inputSchema: { type: 'object', properties: {} },
			});
			fs.mkdirSync(path.join(searchDir, 'scripts'), { recursive: true });
			fs.writeFileSync(
				path.join(searchDir, 'scripts', 'nested.js'),
				`module.exports = { async execute() { return { ok: true }; } };`
			);

			const registry = new ToolRegistry(makeFakeApp(vaultBasePath), pluginDir, ['custom-tools']);
			await registry.initialize();

			expect(await registry.executeTool('nested_tool', {})).toEqual({ ok: true });
		});

		it('loads a handler referenced by an absolute path', async () => {
			const searchDir = path.join(vaultBasePath, 'custom-tools');
			const handlerDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-relay-handler-'));
			const absoluteHandlerPath = path.join(handlerDir, 'abs_handler.js');
			fs.writeFileSync(absoluteHandlerPath, `module.exports = { async execute() { return { fromAbsolute: true }; } };`);

			writeYaml(path.join(searchDir, 'abs.yaml'), {
				name: 'abs_tool',
				description: 'Handler referenced by absolute path',
				handler: absoluteHandlerPath,
				inputSchema: { type: 'object', properties: {} },
			});

			const registry = new ToolRegistry(makeFakeApp(vaultBasePath), pluginDir, ['custom-tools']);
			await registry.initialize();

			expect(await registry.executeTool('abs_tool', {})).toEqual({ fromAbsolute: true });

			fs.rmSync(handlerDir, { recursive: true, force: true });
		});

		it('does not fall back to searching other directories for a missing handler', async () => {
			// Regression check for the old "try 6 different base directories" behavior:
			// a handler.js sitting in some unrelated directory must NOT be found just
			// because a same-named file happens to exist elsewhere (e.g. the plugin dir).
			const searchDir = path.join(vaultBasePath, 'custom-tools');
			writeYaml(path.join(searchDir, 'missing.yaml'), {
				name: 'missing_tool',
				description: 'References a handler that does not exist next to it',
				handler: 'does_not_exist.js',
				inputSchema: { type: 'object', properties: {} },
			});
			// Plant a same-named file elsewhere that the old candidate list might have found.
			fs.mkdirSync(path.join(pluginDir, '.lattice-relay', 'handlers', 'user'), { recursive: true });
			fs.writeFileSync(
				path.join(pluginDir, '.lattice-relay', 'handlers', 'user', 'does_not_exist.js'),
				`module.exports = { async execute() { return { wrongFile: true }; } };`
			);

			const registry = new ToolRegistry(makeFakeApp(vaultBasePath), pluginDir, ['custom-tools']);
			await registry.initialize();

			expect(registry.getTool('missing_tool')).toBeDefined(); // definition still discovered
			await expect(registry.executeTool('missing_tool', {})).rejects.toThrow('Handler not loaded for tool: missing_tool');
		});
	});
});
