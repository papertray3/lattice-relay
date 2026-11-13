// Relay's release identity and coordinated version. The root package.json is
// the single version source; every other version-bearing file is synchronized
// from it by `npm run version:set` and verified by `npm run version:check`.

import fs from 'node:fs';
import path from 'node:path';

export const IDENTITY = Object.freeze({
	pluginId: 'lattice-relay',
	pluginName: 'Lattice Relay',
	rootPackage: 'lattice-relay',
	serverPackage: 'lattice-relay-server',
	serverBin: 'lattice-relay',
	serverName: 'lattice-relay',
});

/** The retired display name; banned from everything the runtime shows or ships. */
export const RETIRED_DISPLAY_NAME = /MCP Bridge/i;

/** Machine identifiers Relay retired in 0.1.0. Current supported files must not use them. */
export const RETIRED_IDENTITY = /obsidian-mcp-bridge|mcp-bridge|MCPBridge|OBSIDIAN_MCP_KEY|OBSIDIAN_(HOST|PORT|USE_SSL)\b|obsidian_mcp_|obsidian-mcp-server|obsidian-direct/i;

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-[0-9A-Za-z.-]+)?$/;
const SERVER_VERSION_TS = 'servers/node/src/version.ts';
const SERVER_VERSION_LINE = /export const RELAY_VERSION = '([^']*)';/;

function readJson(root, file) {
	return JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
}

/** Every place the release version appears, keyed by file. */
export function collectVersions(root) {
	const rootLock = readJson(root, 'package-lock.json');
	const serverLock = readJson(root, 'servers/node/package-lock.json');
	const serverTs = fs.readFileSync(path.join(root, SERVER_VERSION_TS), 'utf8').match(SERVER_VERSION_LINE);
	return {
		'package.json': readJson(root, 'package.json').version,
		'package-lock.json': rootLock.version,
		'package-lock.json#root': rootLock.packages?.['']?.version,
		'manifest.json': readJson(root, 'manifest.json').version,
		'servers/node/package.json': readJson(root, 'servers/node/package.json').version,
		'servers/node/package-lock.json': serverLock.version,
		'servers/node/package-lock.json#root': serverLock.packages?.['']?.version,
		[SERVER_VERSION_TS]: serverTs?.[1],
	};
}

export function changelogHasRelease(root, version) {
	const changelog = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');
	return new RegExp(`^## \\[${version.replace(/\./g, '\\.')}\\]`, 'm').test(changelog);
}

/** Problems with the coordinated identity/version state; empty when consistent. */
export function checkRelease(root) {
	const problems = [];
	const versions = collectVersions(root);
	const version = versions['package.json'];
	if (!SEMVER.test(version ?? '')) problems.push(`package.json version ${JSON.stringify(version)} is not semver`);
	for (const [file, v] of Object.entries(versions)) {
		if (v !== version) problems.push(`${file} has version ${JSON.stringify(v)}; expected ${version}`);
	}
	const manifest = readJson(root, 'manifest.json');
	const pkg = readJson(root, 'package.json');
	const server = readJson(root, 'servers/node/package.json');
	if (manifest.id !== IDENTITY.pluginId) problems.push(`manifest.json id is ${manifest.id}; expected ${IDENTITY.pluginId}`);
	if (manifest.name !== IDENTITY.pluginName) problems.push(`manifest.json name is ${manifest.name}; expected ${IDENTITY.pluginName}`);
	if (pkg.name !== IDENTITY.rootPackage) problems.push(`package.json name is ${pkg.name}; expected ${IDENTITY.rootPackage}`);
	if (server.name !== IDENTITY.serverPackage) problems.push(`servers/node/package.json name is ${server.name}; expected ${IDENTITY.serverPackage}`);
	if (Object.keys(server.bin ?? {}).join(',') !== IDENTITY.serverBin) problems.push(`servers/node/package.json bin must be exactly ${IDENTITY.serverBin}`);
	if (pkg.private !== true || server.private !== true) problems.push('root and server packages must stay private (no registry publication is authorized)');
	const versionsJson = readJson(root, 'versions.json');
	if (versionsJson[version] !== manifest.minAppVersion) problems.push(`versions.json must map ${version} to minAppVersion ${manifest.minAppVersion}`);
	if (version && !changelogHasRelease(root, version)) problems.push(`CHANGELOG.md has no "## [${version}]" section`);
	return problems;
}

/**
 * Set the coordinated version. Refuses an invalid version, an already
 * inconsistent tree, or a version without a CHANGELOG section. Returns the
 * files it changed (or would change, with dryRun).
 */
export function setVersion(root, version, { dryRun = false } = {}) {
	if (!SEMVER.test(version)) throw new Error(`Not a semver version: ${version}`);
	const before = collectVersions(root);
	const current = before['package.json'];
	const mismatched = Object.entries(before).filter(([, v]) => v !== current);
	if (mismatched.length) throw new Error(`Versions are already inconsistent; fix first: ${mismatched.map(([f, v]) => `${f}=${v}`).join(', ')}`);
	if (!changelogHasRelease(root, version)) throw new Error(`CHANGELOG.md has no "## [${version}]" section`);

	const changed = [];
	const writeJson = (file, mutate) => {
		const full = path.join(root, file);
		const text = fs.readFileSync(full, 'utf8');
		const indent = text.match(/^[ \t]+/m)?.[0] ?? '  ';
		const data = JSON.parse(text);
		mutate(data);
		const next = JSON.stringify(data, null, indent) + '\n';
		if (next !== text.replace(/\r\n/g, '\n')) {
			changed.push(file);
			if (!dryRun) fs.writeFileSync(full, next);
		}
	};
	const setPkg = d => { d.version = version; };
	const setLock = d => { d.version = version; if (d.packages?.['']) d.packages[''].version = version; };
	writeJson('package.json', setPkg);
	writeJson('package-lock.json', setLock);
	writeJson('manifest.json', setPkg);
	writeJson('servers/node/package.json', setPkg);
	writeJson('servers/node/package-lock.json', setLock);
	const minApp = readJson(root, 'manifest.json').minAppVersion;
	writeJson('versions.json', d => { d[version] = minApp; });

	const tsFile = path.join(root, SERVER_VERSION_TS);
	const ts = fs.readFileSync(tsFile, 'utf8');
	const nextTs = ts.replace(SERVER_VERSION_LINE, `export const RELAY_VERSION = '${version}';`);
	if (nextTs !== ts) {
		changed.push(SERVER_VERSION_TS);
		if (!dryRun) fs.writeFileSync(tsFile, nextTs);
	}
	return changed;
}
