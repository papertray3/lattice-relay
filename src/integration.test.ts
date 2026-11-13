import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { App } from 'obsidian';
import LatticeRelayPlugin from './main';
import { ToolRegistry } from './tool-registry';
import { BuiltinTools } from './builtin-tools';
import { MCPWebSocketServer } from './websocket-server';
import type { SimpleWebSocket, WebSocketMessage } from './simple-websocket';
import { createTestFile } from './test/helpers';

/**
 * Exercises the real request/response pipeline end to end: a raw WebSocket
 * message comes in, MCPWebSocketServer authenticates and dispatches it to
 * LatticeRelayPlugin.handleRequest(), which routes to a real ToolRegistry (for
 * user tools, loaded via the actual require()-based handler loader) or a
 * real BuiltinTools instance, and the response is asserted at the wire level.
 *
 * The plugin instance is built without calling the real onload() (which
 * would bind an actual TCP port and touch real settings persistence) -
 * instead its handleRequest()-relevant fields (toolRegistry, builtinTools,
 * server, api) are wired up directly, mirroring what onload() does.
 */

function writeYaml(filePath: string, data: unknown): void {
	fs.mkdirSync(path.dirname(filePath), { recursive: true });
	fs.writeFileSync(filePath, yaml.dump(data));
}

function makeFakeSocket(): SimpleWebSocket & { sent: string[] } {
	const sent: string[] = [];
	return {
		sent,
		onmessage: undefined,
		onclose: undefined,
		onerror: undefined,
		send: vi.fn((data: string) => sent.push(data)),
		close: vi.fn(),
	} as unknown as SimpleWebSocket & { sent: string[] };
}

async function deliver(ws: SimpleWebSocket, message: WebSocketMessage): Promise<void> {
	await (ws.onmessage as (msg: WebSocketMessage) => Promise<void> | void)(message);
}

const DEFAULTS_YAML = {
	version: '2.0',
	config: { auto_reload: false, sandbox_user_scripts: true, enable_auto_generation: false },
	tools: {
		builtin: [
			{ name: 'ping', description: 'Test connectivity', handler: 'builtin', inputSchema: { type: 'object', properties: {} } },
			{ name: 'reload_tool_registry', description: 'Reload tools', handler: 'builtin', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
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

describe('End-to-end request/response flow', () => {
	let pluginDir: string;
	let vaultBasePath: string;
	let plugin: LatticeRelayPlugin;
	let server: MCPWebSocketServer;

	beforeEach(async () => {
		pluginDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-relay-plugin-'));
		vaultBasePath = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-relay-vault-'));
		writeYaml(path.join(pluginDir, 'defaults', 'tools.defaults.yaml'), DEFAULTS_YAML);

		// A real user tool: YAML + handler script, co-located (see registry/handler-loader.ts).
		const searchDir = path.join(vaultBasePath, 'tools');
		writeYaml(path.join(searchDir, 'echo.yaml'), {
			name: 'echo',
			description: 'Echoes params back',
			handler: 'echo.js',
			inputSchema: { type: 'object', properties: { message: { type: 'string' } } },
		});
		fs.writeFileSync(
			path.join(searchDir, 'echo.js'),
			`module.exports = { async execute(params) { return { echoed: params.message }; } };`
		);

		const files = [createTestFile('Notes/a.md'), createTestFile('Notes/b.md')];
		const fakeApp = {
			vault: {
				adapter: { basePath: vaultBasePath },
				getMarkdownFiles: () => files,
				getAbstractFileByPath: () => null,
				read: vi.fn(),
			},
			workspace: {},
			metadataCache: {},
			fileManager: {},
			plugins: { plugins: {} },
		} as unknown as App;

		const toolRegistry = new ToolRegistry(fakeApp, pluginDir, ['tools']);
		await toolRegistry.initialize();

		const fakeMetadataExtractor = {
			extractNoteMetadata: vi.fn(),
			getPaginatedLinks: vi.fn(),
			resolveWikiLinks: vi.fn(),
		} as any;

		plugin = new LatticeRelayPlugin(fakeApp, {} as any);
		plugin.toolRegistry = toolRegistry;
		plugin.builtinTools = new BuiltinTools(fakeApp, fakeMetadataExtractor);
		(plugin as any).settings = { requireAuth: true, apiKey: 'secret-key' };
		// Mirrors the wiring onload() does - see main.ts. Built here (rather than
		// calling the real onload()) for the same reason toolRegistry/builtinTools
		// are wired directly above: onload() also binds a real TCP port.
		plugin.api = {
			registerTool: (definition, handler, options) => plugin.toolRegistry.registerTool(definition, handler, options),
			unregisterTool: (name) => plugin.toolRegistry.unregisterTool(name),
		};

		server = new MCPWebSocketServer(plugin);
		plugin.server = server;
	});

	afterEach(() => {
		plugin.toolRegistry.destroy();
		fs.rmSync(pluginDir, { recursive: true, force: true });
		fs.rmSync(vaultBasePath, { recursive: true, force: true });
	});

	it('routes a builtin tool call through the WebSocket layer end to end', async () => {
		const ws = makeFakeSocket();
		(server as any).handleConnection(ws);

		await deliver(ws, { data: JSON.stringify({ method: 'search_files', params: { pattern: 'Notes/*.md' }, auth: 'secret-key', id: '1' }) });

		const response = JSON.parse(ws.sent[0]);
		expect(response.id).toBe('1');
		expect(response.result).toEqual({ pattern: 'Notes/*.md', matches: 2, files: ['Notes/a.md', 'Notes/b.md'] });
	});

	it('routes a real user tool call through the registry, executing its actual handler script', async () => {
		const ws = makeFakeSocket();
		(server as any).handleConnection(ws);

		await deliver(ws, { data: JSON.stringify({ method: 'echo', params: { message: 'hello' }, auth: 'secret-key', id: '2' }) });

		const response = JSON.parse(ws.sent[0]);
		expect(response).toEqual({ result: { echoed: 'hello' }, id: '2' });
	});

	it('lists both builtin and user tools via tools/list', async () => {
		const ws = makeFakeSocket();
		(server as any).handleConnection(ws);

		await deliver(ws, { data: JSON.stringify({ method: 'tools/list', params: {}, auth: 'secret-key', id: '3' }) });

		const response = JSON.parse(ws.sent[0]);
		const names = response.result.tools.map((t: any) => t.name).sort();
		expect(names).toEqual(['echo', 'ping', 'reload_tool_registry', 'search_files']);
	});

	it('reloads the tool registry through the authenticated built-in tool', async () => {
		const ws = makeFakeSocket();
		(server as any).handleConnection(ws);

		await deliver(ws, { data: JSON.stringify({ method: 'reload_tool_registry', params: {}, auth: 'secret-key', id: '9' }) });

		const response = JSON.parse(ws.sent[0]);
		expect(response.id).toBe('9');
		expect(response.result).toMatchObject({ success: true, total: 4, builtin: 3, user: 1, auto: 0 });
		expect(response.result.reloadedAt).toEqual(expect.any(String));
	});

	it('rejects an unauthenticated registry reload', async () => {
		const ws = makeFakeSocket();
		(server as any).handleConnection(ws);

		await deliver(ws, { data: JSON.stringify({ method: 'reload_tool_registry', params: {}, auth: 'wrong-key', id: '10' }) });

		const response = JSON.parse(ws.sent[0]);
		expect(response).toEqual({ error: 'Unauthorized: Invalid API key', id: '10' });
	});

	it('rejects a request with the wrong API key before it ever reaches the tool registry', async () => {
		const ws = makeFakeSocket();
		(server as any).handleConnection(ws);

		await deliver(ws, { data: JSON.stringify({ method: 'echo', params: { message: 'hi' }, auth: 'wrong-key', id: '4' }) });

		const response = JSON.parse(ws.sent[0]);
		expect(response).toEqual({ error: 'Unauthorized: Invalid API key', id: '4' });
	});

	it('returns a ping response for the special-cased method with no tool registered', async () => {
		const ws = makeFakeSocket();
		(server as any).handleConnection(ws);

		await deliver(ws, { data: JSON.stringify({ method: 'ping', params: {}, auth: 'secret-key', id: '5' }) });

		const response = JSON.parse(ws.sent[0]);
		expect(response.result).toMatchObject({ status: 'ok' });
	});

	it('rejects a builtin tool call missing a required param, per its YAML inputSchema', async () => {
		// search_files declares `pattern` as required in tools.defaults.yaml - that
		// schema is now the single enforced contract, not just documentation shown
		// to AI clients, so this must be rejected before ever reaching BuiltinTools.
		const ws = makeFakeSocket();
		(server as any).handleConnection(ws);

		await deliver(ws, { data: JSON.stringify({ method: 'search_files', params: {}, auth: 'secret-key', id: '8' }) });

		const response = JSON.parse(ws.sent[0]);
		expect(response.id).toBe('8');
		expect(response.error).toContain('search_files');
		expect(response.error).toContain('pattern');
	});

	it('surfaces an error response for an unknown method', async () => {
		const ws = makeFakeSocket();
		(server as any).handleConnection(ws);

		await deliver(ws, { data: JSON.stringify({ method: 'does_not_exist', params: {}, auth: 'secret-key', id: '6' }) });

		const response = JSON.parse(ws.sent[0]);
		expect(response.id).toBe('6');
		expect(response.error).toContain('Unknown method');
	});

	it('broadcasts to all connected clients via the broadcast method', async () => {
		const ws1 = makeFakeSocket();
		const ws2 = makeFakeSocket();
		// handleConnection() only wires message handling - in the real flow, start()'s
		// onconnection callback is what registers a socket in `clients` (see
		// websocket-server.ts); replicate that here since we bypass start() entirely.
		(server as any).handleConnection(ws1);
		(server as any).handleConnection(ws2);
		(server as any).clients.add(ws1);
		(server as any).clients.add(ws2);

		await deliver(ws1, { data: JSON.stringify({ method: 'broadcast', params: { type: 'note_updated' }, auth: 'secret-key', id: '7' }) });

		// broadcast() fires synchronously inside handleRequest, before the per-request
		// response is sent - so the requester sees the broadcast first, then its reply.
		const broadcast1 = JSON.parse(ws1.sent[0]);
		const broadcast2 = JSON.parse(ws2.sent[0]);
		expect(broadcast1).toMatchObject({ type: 'note_updated' });
		expect(broadcast2).toMatchObject({ type: 'note_updated' });

		const response = JSON.parse(ws1.sent[1]);
		expect(response.result.status).toBe('broadcast_sent');
		expect(response.result.clients).toBe(2);
	});

	describe('plugin.api (programmatic tool registration)', () => {
		// This is the surface another Obsidian plugin (e.g. lattice-foundry) calls
		// from its own onload()/onunload() - see RelayApi in main.ts. No YAML
		// file, no JS file on disk; the handler is an in-memory function that's
		// dispatched through the exact same WebSocket -> handleRequest ->
		// ToolRegistry.executeTool() path as a file-based user tool.
		it('routes a tool registered via plugin.api through the WebSocket layer end to end', async () => {
			plugin.api.registerTool(
				{
					name: 'other_plugin_tool',
					description: 'Registered by a sibling plugin, not the tool search path',
					inputSchema: { type: 'object', properties: { value: { type: 'number' } } },
				},
				{
					execute: async (params: any) => ({ doubled: (params.value as number) * 2 }),
				}
			);

			const ws = makeFakeSocket();
			(server as any).handleConnection(ws);
			await deliver(ws, { data: JSON.stringify({ method: 'other_plugin_tool', params: { value: 21 }, auth: 'secret-key', id: '11' }) });

			const response = JSON.parse(ws.sent[0]);
			expect(response).toEqual({ result: { doubled: 42 }, id: '11' });
		});

		it('includes a programmatically-registered tool in tools/list, and drops it after unregisterTool()', async () => {
			plugin.api.registerTool(
				{ name: 'listed_tool', description: 'Should appear in tools/list', inputSchema: { type: 'object', properties: {} } },
				{ execute: async () => ({}) }
			);

			const ws = makeFakeSocket();
			(server as any).handleConnection(ws);
			await deliver(ws, { data: JSON.stringify({ method: 'tools/list', params: {}, auth: 'secret-key', id: '12' }) });
			let names = JSON.parse(ws.sent[0]).result.tools.map((t: any) => t.name).sort();
			expect(names).toContain('listed_tool');

			expect(plugin.api.unregisterTool('listed_tool')).toBe(true);

			await deliver(ws, { data: JSON.stringify({ method: 'tools/list', params: {}, auth: 'secret-key', id: '13' }) });
			names = JSON.parse(ws.sent[1]).result.tools.map((t: any) => t.name).sort();
			expect(names).not.toContain('listed_tool');
		});

		it('calling an unregistered programmatic tool surfaces a clean "Unknown method" error', async () => {
			plugin.api.registerTool(
				{ name: 'transient_tool', description: 'Registered then unregistered', inputSchema: { type: 'object', properties: {} } },
				{ execute: async () => ({}) }
			);
			plugin.api.unregisterTool('transient_tool');

			const ws = makeFakeSocket();
			(server as any).handleConnection(ws);
			await deliver(ws, { data: JSON.stringify({ method: 'transient_tool', params: {}, auth: 'secret-key', id: '14' }) });

			const response = JSON.parse(ws.sent[0]);
			expect(response.id).toBe('14');
			expect(response.error).toContain('Unknown method');
		});

		it('a programmatically-registered tool survives reload_tool_registry', async () => {
			plugin.api.registerTool(
				{ name: 'resilient_tool', description: 'Must survive a registry reload', inputSchema: { type: 'object', properties: {} } },
				{ execute: async () => ({ still: 'here' }) }
			);

			const ws = makeFakeSocket();
			(server as any).handleConnection(ws);
			await deliver(ws, { data: JSON.stringify({ method: 'reload_tool_registry', params: {}, auth: 'secret-key', id: '15' }) });
			expect(JSON.parse(ws.sent[0]).result).toMatchObject({ success: true, auto: 1 });

			await deliver(ws, { data: JSON.stringify({ method: 'resilient_tool', params: {}, auth: 'secret-key', id: '16' }) });
			const response = JSON.parse(ws.sent[1]);
			expect(response).toEqual({ result: { still: 'here' }, id: '16' });
		});
	});
});
