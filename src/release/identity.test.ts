import { describe, expect, it } from 'vitest';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as toolingModule from '../../scripts/lib/release-identity.mjs';
// Plain ESM release tooling; its inferred JS types are too narrow for these tests.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { checkRelease, collectVersions, IDENTITY, RETIRED_DISPLAY_NAME, RETIRED_IDENTITY, setVersion } = toolingModule as any;

const root = path.resolve(__dirname, '..', '..');

function trackedFiles(): string[] {
	return execFileSync('git', ['ls-files', '-co', '--exclude-standard'], { cwd: root, encoding: 'utf8' })
		.split(/\r?\n/).filter(f => f && fs.existsSync(path.join(root, f)));
}

/**
 * Files allowed to name the retired Bridge identity: historical records, the
 * migration tooling that must recognize it, the tests that prove it is retired,
 * and Lattice's vendored fixtures (byte-pinned upstream evidence).
 */
const RETIRED_IDENTITY_ALLOWED = [
	/^CHANGELOG\.md$/,
	/^docs\/history\//,
	/^scripts\/lib\/bridge-migration\.mjs$/,
	/^scripts\/migrate-from-bridge\.mjs$/,
	/^scripts\/lib\/release-identity\.mjs$/,
	/^src\/release\//,
	/^src\/lattice\/fixtures\//,
	/^servers\/node\/src\/config(\.test)?\.ts$/,
	/^src\/client-config\.test\.ts$/,
	// Current docs that only redirect Bridge users to the upgrade path.
	/^README\.md$/,
	/^docs\/guides\/(upgrade-from-bridge|install|client-setup)\.md$/,
	/(^|\/)package-lock\.json$/,
];

describe('release identity contract', () => {
	it('is consistent across every version-bearing file', () => {
		expect(checkRelease(root)).toEqual([]);
		const versions = Object.values(collectVersions(root));
		expect(new Set(versions).size).toBe(1);
	});

	it('pins the accepted D1 identity', () => {
		expect(IDENTITY).toEqual({
			pluginId: 'lattice-relay', pluginName: 'Lattice Relay', rootPackage: 'lattice-relay',
			serverPackage: 'lattice-relay-server', serverBin: 'lattice-relay', serverName: 'lattice-relay',
		});
		const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
		expect(manifest.id).toBe('lattice-relay');
		expect(manifest.version).toBe(JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version);
	});

	it('uses no retired Bridge identity outside historical and migration material', () => {
		const offenders = trackedFiles()
			.filter(f => !RETIRED_IDENTITY_ALLOWED.some(re => re.test(f)))
			.filter(f => !/\.(png|jpg|gif|ico|woff2?)$/i.test(f))
			.filter(f => RETIRED_IDENTITY.test(fs.readFileSync(path.join(root, f), 'utf8')));
		expect(offenders).toEqual([]);
	});

	it('shows no retired display name anywhere the runtime presents or ships', () => {
		const runtime = trackedFiles().filter(f =>
			/^(src|servers\/node\/src|defaults)\//.test(f) || ['manifest.json', 'test-harness.html', 'package.json', 'servers/node/package.json'].includes(f));
		const offenders = runtime
			.filter(f => !/^src\/(release|lattice\/fixtures)\//.test(f) && !/\.test\.ts$/.test(f))
			.filter(f => RETIRED_DISPLAY_NAME.test(fs.readFileSync(path.join(root, f), 'utf8')));
		expect(offenders).toEqual([]);
	});

	it('ships no Python or superseded server variants', () => {
		const files = trackedFiles();
		expect(files.filter(f => f.startsWith('servers/') && !f.startsWith('servers/node/'))).toEqual([]);
		expect(files.filter(f => f.endsWith('.py') || f.endsWith('requirements.txt'))).toEqual([]);
	});

	it('tracks no secrets or machine-local configuration', () => {
		const files = trackedFiles();
		expect(files.filter(f => /(^|\/)(data\.json|\.env(\..*)?|.*\.pem|.*\.key|\.mcp\.json)$/.test(f) && !f.endsWith('.env.example'))).toEqual([]);
		const uuidAssignment = /(apiKey|LATTICE_RELAY_KEY|OBSIDIAN_MCP_KEY)["']?\s*[:=]\s*["'][0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}["']/i;
		// A real account path, not a documented placeholder (username, YourName, <user>, an ellipsis).
		const placeholder = /^(username|yourname|you|user|name|\.\.\.|<[^>]*>)$/i;
		const userPath = /(?:[A-Z]:\\\\?Users\\\\?|\/Users\/|\/home\/)([^\\/\s"'`]+)/g;
		const leaks = files
			.filter(f => !/\.(png|jpg|gif|ico)$/i.test(f) && !/package-lock\.json$/.test(f))
			.filter(f => {
				const text = fs.readFileSync(path.join(root, f), 'utf8');
				const accounts = [...text.matchAll(userPath)].map(m => m[1]).filter(name => !placeholder.test(name));
				return uuidAssignment.test(text) || accounts.length > 0;
			});
		expect(leaks).toEqual([]);
	});
});

describe('version tooling', () => {
	function fixture(version = '0.1.0', overrides: Record<string, unknown> = {}) {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-relay-version-'));
		const write = (f: string, data: unknown) => {
			fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
			fs.writeFileSync(path.join(dir, f), typeof data === 'string' ? data : JSON.stringify(data, null, 2) + '\n');
		};
		write('package.json', { name: 'lattice-relay', version, private: true });
		write('package-lock.json', { name: 'lattice-relay', version, packages: { '': { name: 'lattice-relay', version } } });
		write('manifest.json', { id: 'lattice-relay', name: 'Lattice Relay', version, minAppVersion: '1.4.0' });
		write('versions.json', { [version]: '1.4.0' });
		write('servers/node/package.json', { name: 'lattice-relay-server', version, private: true, bin: { 'lattice-relay': 'dist/main.js' } });
		write('servers/node/package-lock.json', { name: 'lattice-relay-server', version, packages: { '': { name: 'lattice-relay-server', version } } });
		write('servers/node/src/version.ts', `export const RELAY_VERSION = '${version}';\n`);
		write('CHANGELOG.md', `# Changelog\n\n## [${version}] - 2026-11-13\n`);
		write('src/untouched.ts', 'export const x = 1;\n');
		for (const [f, d] of Object.entries(overrides)) write(f, d);
		return dir;
	}

	it('accepts a consistent tree', () => {
		expect(checkRelease(fixture())).toEqual([]);
	});

	it('updates exactly the release files and nothing else', () => {
		const dir = fixture();
		fs.appendFileSync(path.join(dir, 'CHANGELOG.md'), '\n## [0.2.0] - 2026-12-01\n');
		const before = fs.readFileSync(path.join(dir, 'src/untouched.ts'), 'utf8');
		const changed = setVersion(dir, '0.2.0');
		expect(changed.sort()).toEqual([
			'manifest.json', 'package-lock.json', 'package.json', 'servers/node/package-lock.json',
			'servers/node/package.json', 'servers/node/src/version.ts', 'versions.json',
		]);
		expect(checkRelease(dir)).toEqual([]);
		expect(new Set(Object.values(collectVersions(dir)))).toEqual(new Set(['0.2.0']));
		expect(JSON.parse(fs.readFileSync(path.join(dir, 'versions.json'), 'utf8'))).toEqual({ '0.1.0': '1.4.0', '0.2.0': '1.4.0' });
		expect(fs.readFileSync(path.join(dir, 'src/untouched.ts'), 'utf8')).toBe(before);
	});

	it('dry run reports changes without writing', () => {
		const dir = fixture();
		fs.appendFileSync(path.join(dir, 'CHANGELOG.md'), '\n## [0.2.0]\n');
		expect(setVersion(dir, '0.2.0', { dryRun: true }).length).toBe(7);
		expect(collectVersions(dir)['package.json']).toBe('0.1.0');
	});

	it('refuses an invalid version, a missing changelog section, or an inconsistent tree', () => {
		expect(() => setVersion(fixture(), 'v0.2')).toThrow(/semver/);
		expect(() => setVersion(fixture(), '0.2.0')).toThrow(/CHANGELOG/);
		const mismatched = fixture('0.1.0', { 'manifest.json': { id: 'lattice-relay', name: 'Lattice Relay', version: '2.0.0', minAppVersion: '1.4.0' } });
		fs.appendFileSync(path.join(mismatched, 'CHANGELOG.md'), '\n## [0.2.0]\n');
		expect(() => setVersion(mismatched, '0.2.0')).toThrow(/inconsistent.*manifest\.json=2\.0\.0/);
		expect(checkRelease(mismatched).join('\n')).toMatch(/manifest\.json has version "2\.0\.0"/);
	});

	it('flags the retired identity and public packages', () => {
		const dir = fixture('0.1.0', {
			'manifest.json': { id: 'obsidian-mcp-bridge', name: 'MCP Bridge', version: '0.1.0', minAppVersion: '1.4.0' },
			'servers/node/package.json': { name: 'obsidian-mcp-server-node', version: '0.1.0', bin: { 'obsidian-mcp': 'x' } },
		});
		const problems = checkRelease(dir).join('\n');
		expect(problems).toMatch(/id is obsidian-mcp-bridge/);
		expect(problems).toMatch(/name is obsidian-mcp-server-node/);
		expect(problems).toMatch(/bin must be exactly lattice-relay/);
		expect(problems).toMatch(/must stay private/);
	});
});
