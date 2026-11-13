import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as toolingModule from '../../scripts/lib/bridge-migration.mjs';
// Plain ESM release tooling; its inferred JS types are too narrow for these tests.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { applyMigration, describeSettings, inspectMigration, planSettingsMigration, rollbackMigration, NEW_CACHE_DEFAULT, OLD_CACHE_DEFAULT } = toolingModule as any;

const SECRET = '11111111-2222-4333-8444-555555555555';

const bridgeSettings = {
	host: '127.0.0.1', port: 27127, enableRemote: false, apiKey: SECRET, requireAuth: true,
	enableSSL: false, certPath: '', keyPath: '', digitalGardenRepoPath: '',
	cacheDirPath: OLD_CACHE_DEFAULT, cacheMaxSizeMB: 100, toolSearchPaths: ['.obsidian/mcp-bridge/tools', 'Tools'], logLevel: 'info',
};

describe('planSettingsMigration (D4)', () => {
	it('preserves valid settings, translates only the exact old cache default, and reports no secret', () => {
		const { settings, report } = planSettingsMigration(bridgeSettings);
		expect(settings).toEqual({ ...bridgeSettings, cacheDirPath: NEW_CACHE_DEFAULT });
		expect(settings.toolSearchPaths).toEqual(['.obsidian/mcp-bridge/tools', 'Tools']);
		expect(report.translated).toEqual([{ key: 'cacheDirPath', from: OLD_CACHE_DEFAULT, to: NEW_CACHE_DEFAULT }]);
		expect(report.apiKey).toBe('set');
		expect(JSON.stringify(report)).not.toContain(SECRET);
		expect(JSON.stringify(describeSettings(settings))).not.toContain(SECRET);
	});

	it('keeps a custom cache directory but rejects one that escapes the vault', () => {
		expect(planSettingsMigration({ cacheDirPath: 'Cache/render' }).settings.cacheDirPath).toBe('Cache/render');
		const escaped = planSettingsMigration({ cacheDirPath: '../outside' });
		expect(escaped.settings.cacheDirPath).toBeUndefined();
		expect(escaped.report.defaulted).toEqual(['cacheDirPath']);
	});

	it('keeps unknown keys out of active settings and lists them for the rollback backup', () => {
		const { settings, report } = planSettingsMigration({ ...bridgeSettings, futureFlag: true, legacyThing: 'x' });
		expect(settings).not.toHaveProperty('futureFlag');
		expect(report.rollbackOnly).toEqual(['futureFlag', 'legacyThing']);
	});

	it('drops mistyped values to Relay defaults with a warning', () => {
		const { settings, report } = planSettingsMigration({ port: '27127', toolSearchPaths: 'Tools', logLevel: 'loud' });
		expect(settings).toEqual({});
		expect(report.defaulted.sort()).toEqual(['logLevel', 'port', 'toolSearchPaths']);
	});

	it('previews remote, auth and SSL exposure without reading key material', () => {
		const { report } = planSettingsMigration(
			{ ...bridgeSettings, enableRemote: true, requireAuth: false, enableSSL: true, certPath: 'certs/relay.pem', keyPath: '' },
			{ fileExists: () => false });
		expect(report.security).toEqual(expect.arrayContaining(['enableRemote', 'enableSSL', 'certPath', 'keyPath']));
		expect(report.warnings).toEqual(expect.arrayContaining([
			expect.stringMatching(/enableRemote is ON/),
			expect.stringMatching(/requireAuth is OFF/),
			expect.stringMatching(/certPath does not exist/),
			expect.stringMatching(/keyPath is empty/),
		]));
	});
});

describe('vault migration and rollback', () => {
	let tmp: string;
	let vault: string;
	let release: string;

	function snapshot(dir: string): Record<string, string> {
		const out: Record<string, string> = {};
		(function walk(d: string) {
			for (const e of fs.readdirSync(d, { withFileTypes: true })) {
				const full = path.join(d, e.name);
				if (e.isDirectory()) walk(full);
				else out[path.relative(dir, full).split(path.sep).join('/')] = crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex');
			}
		})(dir);
		return out;
	}

	function write(file: string, content: unknown) {
		fs.mkdirSync(path.dirname(file), { recursive: true });
		fs.writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content, null, 2));
	}

	beforeEach(() => {
		tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-relay-migrate-'));
		vault = path.join(tmp, 'vault');
		release = path.join(tmp, 'release', 'lattice-relay');
		write(path.join(vault, 'Notes', 'note.md'), '# Note\n');
		write(path.join(vault, '.obsidian', 'community-plugins.json'), ['lattice', 'obsidian-mcp-bridge', 'hot-reload']);
		write(path.join(vault, '.obsidian', 'plugins', 'obsidian-mcp-bridge', 'manifest.json'), { id: 'obsidian-mcp-bridge', version: '2.0.0' });
		write(path.join(vault, '.obsidian', 'plugins', 'obsidian-mcp-bridge', 'main.js'), '// bridge');
		write(path.join(vault, '.obsidian', 'plugins', 'obsidian-mcp-bridge', 'data.json'), { ...bridgeSettings, futureFlag: 1 });
		write(path.join(vault, '.obsidian', 'plugins', 'lattice', 'data.json'), { modules: { fold: {} } });
		write(path.join(vault, '.obsidian', 'mcp-bridge', 'tools', 'mine.yaml'), 'name: mine\n');
		write(path.join(vault, '.obsidian', 'cache', 'mcp-bridge-render', 'x.html'), '<p/>');
		write(path.join(release, 'manifest.json'), { id: 'lattice-relay', version: '0.1.0' });
		write(path.join(release, 'main.js'), '// relay');
		write(path.join(release, 'defaults', 'tools.defaults.yaml'), 'tools: []\n');
		write(path.join(release, 'server', 'lattice-relay.mjs'), '// server');
	});

	afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

	it('previews without writing anything', () => {
		const before = snapshot(vault);
		const plan = inspectMigration({ vault, release });
		expect(plan.oldEnabled).toBe(true);
		expect(plan.report.rollbackOnly).toEqual(['futureFlag']);
		expect(snapshot(vault)).toEqual(before);
	});

	it('swaps Bridge for Relay in one step and changes nothing else in the vault', () => {
		const before = snapshot(vault);
		const backupDir = path.join(tmp, 'backup');
		const record = applyMigration({ vault, release, backupDir, now: new Date('2026-11-13T00:00:00Z') });
		const after = snapshot(vault);

		const changed = Object.keys({ ...before, ...after }).filter(f => before[f] !== after[f]).sort();
		expect(changed).toEqual([
			'.obsidian/community-plugins.json',
			'.obsidian/plugins/lattice-relay/data.json',
			'.obsidian/plugins/lattice-relay/defaults/tools.defaults.yaml',
			'.obsidian/plugins/lattice-relay/main.js',
			'.obsidian/plugins/lattice-relay/manifest.json',
			'.obsidian/plugins/lattice-relay/server/lattice-relay.mjs',
		]);
		// One identity enabled, in Bridge's former position; Bridge left installed for rollback.
		expect(JSON.parse(fs.readFileSync(path.join(vault, '.obsidian', 'community-plugins.json'), 'utf8'))).toEqual(['lattice', 'lattice-relay', 'hot-reload']);
		const migrated = JSON.parse(fs.readFileSync(path.join(vault, '.obsidian', 'plugins', 'lattice-relay', 'data.json'), 'utf8'));
		expect(migrated.apiKey).toBe(SECRET);
		expect(migrated.port).toBe(27127);
		expect(migrated.cacheDirPath).toBe(NEW_CACHE_DEFAULT);
		expect(migrated).not.toHaveProperty('futureFlag');
		// The backup keeps the full original state; the record never holds the key.
		expect(JSON.parse(fs.readFileSync(path.join(backupDir, 'plugins', 'obsidian-mcp-bridge', 'data.json'), 'utf8')).futureFlag).toBe(1);
		const recordText = fs.readFileSync(path.join(backupDir, 'migration-record.json'), 'utf8');
		expect(recordText).not.toContain(SECRET);
		expect(record.installedFiles).toEqual(['defaults/tools.defaults.yaml', 'main.js', 'manifest.json', 'server/lattice-relay.mjs']);
	});

	it('refuses to run twice, to overwrite an existing Relay install, or to reuse a backup directory', () => {
		const backupDir = path.join(tmp, 'backup');
		applyMigration({ vault, release, backupDir });
		expect(() => applyMigration({ vault, release, backupDir: path.join(tmp, 'b2') })).toThrow(/already installed/);
		expect(() => inspectMigration({ vault: path.join(tmp, 'nope'), release })).toThrow(/Not an Obsidian vault/);
	});

	it('refuses a release with the wrong identity or bundled settings', () => {
		write(path.join(release, 'data.json'), { apiKey: 'x' });
		expect(() => inspectMigration({ vault, release })).toThrow(/must not contain data.json/);
		fs.rmSync(path.join(release, 'data.json'));
		write(path.join(release, 'manifest.json'), { id: 'obsidian-mcp-bridge' });
		expect(() => inspectMigration({ vault, release })).toThrow(/expected lattice-relay/);
	});

	it('rolls back to the exact prior state while keeping later toggles and notes', () => {
		const before = snapshot(vault);
		const backupDir = path.join(tmp, 'backup');
		applyMigration({ vault, release, backupDir });
		// Activity after migration: a note edit and another plugin toggle.
		write(path.join(vault, 'Notes', 'later.md'), '# Later\n');
		write(path.join(vault, '.obsidian', 'community-plugins.json'), ['lattice', 'lattice-relay']);
		write(path.join(vault, '.obsidian', 'plugins', 'lattice-relay', 'data.json'), { apiKey: SECRET, port: 28000 });

		const result = rollbackMigration({ vault, backupDir });
		expect(result.parked).toBe(true);
		const after = snapshot(vault);
		expect(after['Notes/later.md']).toBeDefined();
		expect(Object.keys(after).some(f => f.startsWith('.obsidian/plugins/lattice-relay/'))).toBe(false);
		for (const f of Object.keys(before).filter(f => f !== '.obsidian/community-plugins.json')) expect(after[f]).toBe(before[f]);
		expect(JSON.parse(fs.readFileSync(path.join(vault, '.obsidian', 'community-plugins.json'), 'utf8'))).toEqual(['lattice', 'obsidian-mcp-bridge']);
		// Relay's post-migration state is parked, not lost.
		expect(JSON.parse(fs.readFileSync(path.join(backupDir, 'rolled-back', 'lattice-relay', 'data.json'), 'utf8')).port).toBe(28000);
		// Rolling back again is a no-op.
		const settled = snapshot(vault);
		rollbackMigration({ vault, backupDir });
		expect(snapshot(vault)).toEqual(settled);
	});
});
