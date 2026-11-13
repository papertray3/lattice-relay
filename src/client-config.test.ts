import { describe, expect, it } from 'vitest';
import * as path from 'path';
import { API_KEY_PLACEHOLDER, CLIENT_AGENTS, ClientConfigParams, serverNameForVault, serverScriptPath } from './client-config';

const params: ClientConfigParams = {
	serverName: serverNameForVault('Papertrail Vault'),
	mainJsPath: 'C:\\vault\\.obsidian\\plugins\\lattice-relay\\server\\lattice-relay.mjs',
	mainJsPathForward: 'C:/vault/.obsidian/plugins/lattice-relay/server/lattice-relay.mjs',
	apiKey: API_KEY_PLACEHOLDER,
	port: 27127,
};

describe('generated MCP client configuration', () => {
	it('names the server lattice_relay_<vault>', () => {
		expect(serverNameForVault('Papertrail Vault')).toBe('lattice_relay_papertrail_vault');
		expect(serverNameForVault('  lattice-debug ')).toBe('lattice_relay_lattice_debug');
	});

	it('points at the bundled server in the installed plugin directory', () => {
		expect(serverScriptPath('/vault', 'lattice-relay')).toBe(path.join('/vault', '.obsidian', 'plugins', 'lattice-relay', 'server', 'lattice-relay.mjs'));
	});

	it.each(CLIENT_AGENTS.map(a => [a.id, a] as const))('%s uses only LATTICE_RELAY_* variables and the Relay server path', (_id, agent) => {
		const rendered = agent.renderConfig(params);
		expect(rendered).toContain('LATTICE_RELAY_KEY');
		expect(rendered).toContain('LATTICE_RELAY_PORT');
		expect(rendered).toContain('27127');
		expect(rendered).toContain('lattice_relay_papertrail_vault');
		expect(rendered).toMatch(/plugins[\\/]+lattice-relay[\\/]+server[\\/]+lattice-relay\.mjs/);
		expect(rendered).not.toMatch(/OBSIDIAN_|obsidian_mcp|mcp-bridge|servers[\\/]+node/);
	});

	it('keeps JSON formats parseable', () => {
		for (const agent of CLIENT_AGENTS.filter(a => a.id !== 'codex')) {
			expect(() => JSON.parse(agent.renderConfig(params))).not.toThrow();
		}
	});
});
