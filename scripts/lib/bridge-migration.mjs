// One-time migration of a vault from the MCP Bridge plugin (`obsidian-mcp-bridge`)
// to Lattice Relay (`lattice-relay`), implementing PLAN-002 decision D4.
//
// Temporary tooling: remove it once no supported vault still runs the Bridge identity.
//
// Guarantees:
// - Touches only <vault>/.obsidian/community-plugins.json, <vault>/.obsidian/plugins/lattice-relay/
//   and the backup directory. Notes, Lattice state and other plugins are never written.
// - Never runs both identities: Bridge is disabled in the same write that enables Relay.
// - The Bridge plugin directory is left in place, disabled, for rollback.
// - Secret values never appear in previews, records or console output.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const OLD_ID = 'obsidian-mcp-bridge';
export const NEW_ID = 'lattice-relay';
export const OLD_CACHE_DEFAULT = '.obsidian/cache/mcp-bridge-render';
export const NEW_CACHE_DEFAULT = '.obsidian/cache/lattice-relay-render';

const is = {
	string: v => typeof v === 'string',
	boolean: v => typeof v === 'boolean',
	port: v => Number.isInteger(v) && v > 0 && v < 65536,
	positiveNumber: v => typeof v === 'number' && Number.isFinite(v) && v > 0,
	logLevel: v => ['debug', 'info', 'warn', 'error'].includes(v),
	stringArray: v => Array.isArray(v) && v.every(x => typeof x === 'string'),
};

/** Settings whose meaning is unchanged under Relay; copied as-is when well-typed. */
const PRESERVE = {
	apiKey: is.string, requireAuth: is.boolean, host: is.string, port: is.port,
	cacheMaxSizeMB: is.positiveNumber, logLevel: is.logLevel,
	digitalGardenRepoPath: is.string, toolSearchPaths: is.stringArray,
};

/** Preserved too, but reported in a security preview first. */
const SECURITY = {
	enableRemote: is.boolean, enableSSL: is.boolean, certPath: is.string, keyPath: is.string, allowedOrigins: is.stringArray,
};

const SECRET_KEYS = new Set(['apiKey']);

function validCacheDir(value) {
	return typeof value === 'string' && value.trim() !== '' && !value.includes('\0') && !value.split(/[\\/]/).includes('..');
}

/**
 * Map Bridge settings to Relay settings. `fileExists(p)` checks certificate paths.
 * Returns the new settings plus a value-free report.
 */
export function planSettingsMigration(old, { fileExists = () => true } = {}) {
	if (!old || typeof old !== 'object' || Array.isArray(old)) throw new Error('Bridge data.json is not a settings object');
	const settings = {};
	const report = { preserved: [], translated: [], defaulted: [], security: [], warnings: [], rollbackOnly: [] };

	for (const [key, valid] of Object.entries({ ...PRESERVE, ...SECURITY })) {
		if (!(key in old)) continue;
		if (valid(old[key])) {
			settings[key] = old[key];
			(key in SECURITY ? report.security : report.preserved).push(key);
		} else {
			report.defaulted.push(key);
			report.warnings.push(`${key} has an unexpected type; Relay will use its default`);
		}
	}

	if ('cacheDirPath' in old) {
		const value = old.cacheDirPath;
		if (value === OLD_CACHE_DEFAULT) {
			settings.cacheDirPath = NEW_CACHE_DEFAULT;
			report.translated.push({ key: 'cacheDirPath', from: OLD_CACHE_DEFAULT, to: NEW_CACHE_DEFAULT });
		} else if (validCacheDir(value)) {
			settings.cacheDirPath = value;
			report.preserved.push('cacheDirPath');
		} else {
			report.defaulted.push('cacheDirPath');
			report.warnings.push('cacheDirPath is not a safe vault-relative path; Relay will use its default');
		}
	}

	const known = new Set([...Object.keys(PRESERVE), ...Object.keys(SECURITY), 'cacheDirPath']);
	report.rollbackOnly = Object.keys(old).filter(k => !known.has(k)).sort();

	if (settings.enableRemote === true) report.warnings.push('enableRemote is ON: Relay will accept non-loopback connections');
	if (settings.requireAuth === false) report.warnings.push('requireAuth is OFF: Relay will accept unauthenticated requests');
	if (settings.enableSSL === true) {
		for (const key of ['certPath', 'keyPath']) {
			if (!settings[key]) report.warnings.push(`enableSSL is ON but ${key} is empty`);
			else if (!fileExists(settings[key])) report.warnings.push(`enableSSL is ON but ${key} does not exist`);
		}
	}
	report.apiKey = typeof settings.apiKey === 'string' && settings.apiKey !== '' ? 'set' : 'empty';
	return { settings, report };
}

/** A value-free description of settings, safe to print or record. */
export function describeSettings(settings) {
	return Object.fromEntries(Object.entries(settings).map(([k, v]) => [k, SECRET_KEYS.has(k) ? (v ? '<set>' : '<empty>') : v]));
}

function paths(vault) {
	const obsidian = path.join(vault, '.obsidian');
	return {
		obsidian,
		communityPlugins: path.join(obsidian, 'community-plugins.json'),
		oldDir: path.join(obsidian, 'plugins', OLD_ID),
		newDir: path.join(obsidian, 'plugins', NEW_ID),
	};
}

function readJson(file) {
	return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function sha256(file) {
	return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function listFiles(dir, base = dir) {
	if (!fs.existsSync(dir)) return [];
	return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
		const full = path.join(dir, entry.name);
		return entry.isDirectory() ? listFiles(full, base) : [path.relative(base, full).split(path.sep).join('/')];
	}).sort();
}

/** Inspect a vault and release without writing anything. Throws on a precondition failure. */
export function inspectMigration({ vault, release }) {
	const p = paths(vault);
	if (!fs.existsSync(p.obsidian)) throw new Error(`Not an Obsidian vault: ${vault}`);
	if (!fs.existsSync(path.join(p.oldDir, 'data.json'))) throw new Error(`No ${OLD_ID} settings to migrate (${OLD_ID}/data.json is missing)`);
	if (fs.existsSync(p.newDir)) throw new Error(`${NEW_ID} is already installed in this vault; refusing to overwrite it`);
	const releaseManifest = readJson(path.join(release, 'manifest.json'));
	if (releaseManifest.id !== NEW_ID) throw new Error(`Release manifest id is ${releaseManifest.id}; expected ${NEW_ID}`);
	for (const required of ['main.js', 'manifest.json', 'defaults/tools.defaults.yaml', 'server/lattice-relay.mjs']) {
		if (!fs.existsSync(path.join(release, required))) throw new Error(`Release is missing ${required}`);
	}
	if (fs.existsSync(path.join(release, 'data.json'))) throw new Error('Release must not contain data.json');
	const enabled = fs.existsSync(p.communityPlugins) ? readJson(p.communityPlugins) : [];
	if (!Array.isArray(enabled)) throw new Error('community-plugins.json is not an array');
	if (enabled.includes(NEW_ID)) throw new Error(`${NEW_ID} is already enabled`);
	const old = readJson(path.join(p.oldDir, 'data.json'));
	const plan = planSettingsMigration(old, { fileExists: f => fs.existsSync(path.isAbsolute(f) ? f : path.join(vault, f)) });
	return {
		paths: p,
		releaseVersion: releaseManifest.version,
		releaseFiles: listFiles(release),
		oldEnabled: enabled.includes(OLD_ID),
		enabled,
		...plan,
	};
}

/**
 * Apply the migration. Obsidian must be closed so it neither holds the port nor
 * rewrites community-plugins.json underneath us.
 */
export function applyMigration({ vault, release, backupDir, now = new Date(), live = false }) {
	const inspection = inspectMigration({ vault, release });
	const { paths: p } = inspection;
	if (fs.existsSync(backupDir)) throw new Error(`Backup directory already exists: ${backupDir}`);

	// 1. Back up everything the migration or rollback could touch, and verify the copy.
	fs.mkdirSync(backupDir, { recursive: true });
	fs.cpSync(p.oldDir, path.join(backupDir, 'plugins', OLD_ID), { recursive: true });
	if (fs.existsSync(p.communityPlugins)) fs.copyFileSync(p.communityPlugins, path.join(backupDir, 'community-plugins.json'));
	for (const file of listFiles(p.oldDir)) {
		if (sha256(path.join(p.oldDir, file)) !== sha256(path.join(backupDir, 'plugins', OLD_ID, file))) throw new Error(`Backup verification failed for ${file}`);
	}

	// 2. Install the release, then write migrated settings (never copied from the release).
	fs.cpSync(release, p.newDir, { recursive: true });
	fs.writeFileSync(path.join(p.newDir, 'data.json'), JSON.stringify(inspection.settings, null, 2));

	// 3. Swap the enabled entry in one write: Bridge off, Relay on, same position.
	//    In live mode Obsidian is running and owns that file; the operator swaps
	//    the plugins with the Obsidian CLI instead (disable Bridge, then enable Relay).
	if (!live) {
		const enabled = inspection.enabled.map(id => (id === OLD_ID ? NEW_ID : id));
		if (!inspection.oldEnabled) enabled.push(NEW_ID);
		fs.writeFileSync(p.communityPlugins, JSON.stringify(enabled, null, 2));
	}

	const record = {
		kind: 'lattice-relay.bridge-migration',
		version: 1,
		at: now.toISOString(),
		mode: live ? 'live' : 'offline',
		releaseVersion: inspection.releaseVersion,
		installedFiles: listFiles(p.newDir).filter(f => f !== 'data.json'),
		oldPluginWasEnabled: inspection.oldEnabled,
		settings: describeSettings(inspection.settings),
		report: inspection.report,
	};
	fs.writeFileSync(path.join(backupDir, 'migration-record.json'), JSON.stringify(record, null, 2));
	return record;
}

/**
 * Undo `applyMigration` from its backup. The Relay plugin directory is moved
 * into the backup (not deleted) so nothing written under Relay is lost.
 */
export function rollbackMigration({ vault, backupDir, live = false }) {
	const p = paths(vault);
	const recordFile = path.join(backupDir, 'migration-record.json');
	if (!fs.existsSync(recordFile)) throw new Error(`No migration record in ${backupDir}`);
	const record = readJson(recordFile);
	if (record.kind !== 'lattice-relay.bridge-migration') throw new Error('Not a Relay migration backup');

	const backupOld = path.join(backupDir, 'plugins', OLD_ID);
	if (!fs.existsSync(path.join(backupOld, 'data.json'))) throw new Error('Backup has no Bridge settings');
	if (live) {
		const enabled = fs.existsSync(p.communityPlugins) ? readJson(p.communityPlugins) : [];
		if (enabled.includes(NEW_ID)) throw new Error(`${NEW_ID} is still enabled; disable it with the Obsidian CLI first`);
	}

	// Restore the Bridge directory only if it changed: in live mode its server may be in use.
	const sameAsBackup = fs.existsSync(p.oldDir)
		&& JSON.stringify(listFiles(p.oldDir)) === JSON.stringify(listFiles(backupOld))
		&& listFiles(backupOld).every(f => sha256(path.join(p.oldDir, f)) === sha256(path.join(backupOld, f)));

	if (fs.existsSync(p.newDir)) {
		const parked = path.join(backupDir, 'rolled-back', NEW_ID);
		if (fs.existsSync(parked)) throw new Error(`Rollback already ran: ${parked} exists`);
		fs.mkdirSync(path.dirname(parked), { recursive: true });
		fs.cpSync(p.newDir, parked, { recursive: true });
		fs.rmSync(p.newDir, { recursive: true, force: true });
	}
	const restored = [];
	if (!sameAsBackup) {
		fs.rmSync(p.oldDir, { recursive: true, force: true });
		fs.cpSync(backupOld, p.oldDir, { recursive: true });
		restored.push(`plugins/${OLD_ID}`);
	}
	if (!live) {
		// Reverse only Relay's entry so plugin toggles made since the migration survive.
		const current = fs.existsSync(p.communityPlugins) ? readJson(p.communityPlugins) : [];
		const enabled = record.oldPluginWasEnabled
			? current.map(id => (id === NEW_ID ? OLD_ID : id))
			: current.filter(id => id !== NEW_ID);
		if (record.oldPluginWasEnabled && !enabled.includes(OLD_ID)) enabled.push(OLD_ID);
		fs.writeFileSync(p.communityPlugins, JSON.stringify([...new Set(enabled)], null, 2));
		restored.push('community-plugins.json');
	}
	return { restored, parked: fs.existsSync(path.join(backupDir, 'rolled-back', NEW_ID)), reenable: live && record.oldPluginWasEnabled };
}
