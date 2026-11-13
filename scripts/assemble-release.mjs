#!/usr/bin/env node
// Builds and assembles a Lattice Relay release candidate from a clean checkout:
//
//   release/lattice-relay-<version>/
//     lattice-relay/                 the installable plugin directory
//       manifest.json  main.js  test-harness.html  LICENSE
//       defaults/tools.defaults.yaml
//       server/lattice-relay.mjs     bundled stdio MCP server
//     release-manifest.json          version, commit, hashes, contracts, commands
//
// Refuses a dirty worktree or inconsistent versions unless --allow-dirty is given
// (for local iteration only; the manifest then records dirty: true and is not a
// release candidate). Publishes nothing.
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkRelease, IDENTITY } from './lib/release-identity.mjs';
import { smoke } from './smoke-server.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const allowDirty = process.argv.includes('--allow-dirty');
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32', ...opts });
const out = (cmd, args) => execFileSync(cmd, args, { cwd: root, encoding: 'utf8', shell: process.platform === 'win32' }).trim();

function fail(message) {
	console.error(`Release refused: ${message}`);
	process.exit(1);
}

const problems = checkRelease(root);
if (problems.length) fail(`identity/version check failed:\n  - ${problems.join('\n  - ')}`);
const dirty = out('git', ['status', '--porcelain']) !== '';
if (dirty && !allowDirty) fail('the worktree has uncommitted changes (use --allow-dirty for a non-candidate local build)');
const sourceCommit = out('git', ['rev-parse', 'HEAD']);
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;

const BUILD_COMMANDS = ['npm ci', 'npm run server:install', 'npm run build', 'npm run server:bundle'];
run('npm', ['run', 'build']);
run('npm', ['run', 'server:bundle']);

const releaseRoot = path.join(root, 'release', `${IDENTITY.pluginId}-${version}`);
const pluginDir = path.join(releaseRoot, IDENTITY.pluginId);
fs.rmSync(releaseRoot, { recursive: true, force: true });
const layout = [
	['manifest.json', 'manifest.json'],
	['main.js', 'main.js'],
	['test-harness.html', 'test-harness.html'],
	['LICENSE', 'LICENSE'],
	['defaults/tools.defaults.yaml', 'defaults/tools.defaults.yaml'],
	['build/server/lattice-relay.mjs', 'server/lattice-relay.mjs'],
];
for (const [from, to] of layout) {
	const target = path.join(pluginDir, to);
	fs.mkdirSync(path.dirname(target), { recursive: true });
	fs.copyFileSync(path.join(root, from), target);
}

const smokeResult = await smoke(path.join(pluginDir, 'server', 'lattice-relay.mjs'));
if (smokeResult.problems.length) fail(`assembled server failed its smoke test:\n  - ${smokeResult.problems.join('\n  - ')}`);

function contractConstants() {
	const src = fs.readFileSync(path.join(root, 'src/lattice/contract.ts'), 'utf8');
	const pick = name => src.match(new RegExp(`export const ${name} = '([^']+)'`))?.[1];
	const major = src.match(/SUPPORTED_LATTICE_API_MAJOR = (\d+)/)?.[1];
	const api = name => src.match(new RegExp(`${name} = \\{ major: (\\d+), minMinor: (\\d+) \\}`))?.slice(1, 3).join('.');
	return {
		latticeApiMajor: Number(major),
		focusApiMin: api('SUPPORTED_FOCUS_API'),
		foldApiMin: api('SUPPORTED_FOLD_API'),
		facets: ['FACET_PREAMBLE', 'FACET_MANIFEST', 'FACET_TOPOLOGY'].map(pick),
		orientation: src.match(/RELAY_ORIENTATION_SPEC = '([^']+)'/)?.[1],
	};
}

function mcpProtocol() {
	const types = fs.readFileSync(path.join(root, 'servers/node/node_modules/@modelcontextprotocol/sdk/dist/esm/types.js'), 'utf8');
	const sdk = JSON.parse(fs.readFileSync(path.join(root, 'servers/node/node_modules/@modelcontextprotocol/sdk/package.json'), 'utf8'));
	return {
		sdkVersion: sdk.version,
		latest: types.match(/LATEST_PROTOCOL_VERSION = '([^']+)'/)?.[1],
		smokeNegotiated: smokeResult.protocolVersion,
	};
}

const files = [];
(function walk(dir) {
	for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) walk(full);
		else {
			const bytes = fs.readFileSync(full);
			files.push({ path: path.relative(releaseRoot, full).split(path.sep).join('/'), bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') });
		}
	}
})(pluginDir);

const manifest = {
	kind: 'lattice-relay.release-manifest',
	schemaVersion: 1,
	product: IDENTITY.pluginName,
	version,
	sourceCommit,
	dirty,
	releaseCandidate: !dirty,
	identity: IDENTITY,
	artifacts: files,
	mcp: mcpProtocol(),
	latticeContracts: contractConstants(),
	node: { built: process.version, supported: JSON.parse(fs.readFileSync(path.join(root, 'servers/node/package.json'), 'utf8')).engines.node },
	obsidian: { minAppVersion: JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8')).minAppVersion },
	buildCommands: BUILD_COMMANDS,
};
fs.writeFileSync(path.join(releaseRoot, 'release-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Assembled ${path.relative(root, releaseRoot)} (${dirty ? 'DIRTY - not a candidate' : 'candidate'}) from ${sourceCommit.slice(0, 7)}`);
for (const f of files) console.log(`  ${f.sha256}  ${f.path}`);
