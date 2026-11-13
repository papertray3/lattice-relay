import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from 'obsidian';
import LatticeRelayPlugin from '../main';
import { ToolRegistry } from '../tool-registry';
import { BuiltinTools } from '../builtin-tools';
import { MCPWebSocketServer } from '../websocket-server';
import type { SimpleWebSocket, WebSocketMessage } from '../simple-websocket';
import { fakeLattice } from './test-support';

/**
 * End to end through the real WebSocket server, request router, schema
 * validator and the *shipped* tools.defaults.yaml: proves the Lattice tools
 * register through the canonical builtin path, and that transport/parameter
 * failures (MCP errors) stay distinct from Lattice domain and availability
 * results (successful responses carrying an outcome).
 */

const SHIPPED_DEFAULTS = path.resolve(__dirname, '..', '..', 'defaults', 'tools.defaults.yaml');

function makeFakeSocket(): SimpleWebSocket & { sent: string[] } {
	const sent: string[] = [];
	return { sent, onmessage: undefined, onclose: undefined, onerror: undefined, send: vi.fn((d: string) => sent.push(d)), close: vi.fn() } as unknown as SimpleWebSocket & { sent: string[] };
}

describe('Lattice tools through the Relay request pipeline', () => {
	let pluginDir: string;
	let vaultBasePath: string;
	let plugin: LatticeRelayPlugin;
	let server: MCPWebSocketServer;
	let plugins: Record<string, unknown>;

	beforeEach(async () => {
		pluginDir = fs.mkdtempSync(path.join(os.tmpdir(), 'relay-plugin-'));
		vaultBasePath = fs.mkdtempSync(path.join(os.tmpdir(), 'relay-vault-'));
		fs.mkdirSync(path.join(pluginDir, 'defaults'), { recursive: true });
		fs.copyFileSync(SHIPPED_DEFAULTS, path.join(pluginDir, 'defaults', 'tools.defaults.yaml'));

		plugins = {};
		const app = {
			vault: { adapter: { basePath: vaultBasePath }, getMarkdownFiles: () => [], getAbstractFileByPath: () => null, read: vi.fn() },
			workspace: {},
			metadataCache: {},
			fileManager: {},
			plugins: { plugins, manifests: { lattice: { version: '2.0.0-beta.70' } }, enabledPlugins: new Set(['lattice']) },
		} as unknown as App;

		const registry = new ToolRegistry(app, pluginDir, []);
		await registry.initialize();
		plugin = new LatticeRelayPlugin(app, {} as any);
		plugin.toolRegistry = registry;
		plugin.builtinTools = new BuiltinTools(app, {} as any);
		(plugin as any).settings = { requireAuth: true, apiKey: 'k' };
		server = new MCPWebSocketServer(plugin);
		plugin.server = server;
	});

	afterEach(() => {
		plugin.toolRegistry.destroy();
		fs.rmSync(pluginDir, { recursive: true, force: true });
		fs.rmSync(vaultBasePath, { recursive: true, force: true });
	});

	async function call(method: string, params: Record<string, unknown>) {
		const ws = makeFakeSocket();
		(server as any).handleConnection(ws);
		await (ws.onmessage as (m: WebSocketMessage) => Promise<void>)({ data: JSON.stringify({ method, params, auth: 'k', id: 'r1' }) });
		return JSON.parse(ws.sent[0]);
	}

	it('lists both Lattice tools with their schemas', async () => {
		const response = await call('tools/list', {});
		const byName = Object.fromEntries(response.result.tools.map((t: any) => [t.name, t]));
		expect(byName.lattice_orient.inputSchema.additionalProperties).toBe(false);
		expect(byName.lattice_fold_describe.inputSchema.required).toEqual(['foldId']);
		expect(byName.lattice_orient.category).toBe('lattice');
	});

	it('answers lattice_orient and lattice_fold_describe against a compatible Lattice', async () => {
		plugins.lattice = { api: (fakeLattice().host.plugins!.plugins as any).lattice.api };
		const orient = await call('lattice_orient', {});
		expect(orient.result).toMatchObject({ outcome: 'inspected', grantsAuthority: false });
		const describe = await call('lattice_fold_describe', { foldId: 'fold-alpha' });
		expect(describe.result).toMatchObject({ outcome: 'described', fold: { foldId: 'fold-alpha' } });
	});

	it('returns Lattice absence as a successful availability result, not a transport error', async () => {
		const response = await call('lattice_orient', {});
		expect(response.error).toBeUndefined();
		expect(response.result).toMatchObject({ outcome: 'lattice-unavailable', errorClass: 'availability' });
	});

	it('rejects bad parameters as an MCP error before Lattice is touched', async () => {
		const fake = fakeLattice();
		plugins.lattice = { api: (fake.host.plugins!.plugins as any).lattice.api };
		for (const [method, params] of [
			['lattice_orient', { select: 'fold-alpha' }],
			['lattice_orient', { expectedContextRevision: -1 }],
			['lattice_fold_describe', {}],
			['lattice_fold_describe', { foldId: '' }],
		] as const) {
			const response = await call(method, params as Record<string, unknown>);
			expect(response.result, `${method} ${JSON.stringify(params)}`).toBeUndefined();
			expect(response.error).toBeDefined();
		}
		expect(fake.focusTarget.inspectContext).not.toHaveBeenCalled();
		expect(fake.foldTarget.inspectFold).not.toHaveBeenCalled();
	});
});
