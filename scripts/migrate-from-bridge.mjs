#!/usr/bin/env node
// Migrate one vault from MCP Bridge to Lattice Relay (PLAN-002 D4). Temporary tooling.
//
//   node scripts/migrate-from-bridge.mjs preview  --vault <vault> --release <release-dir>
//   node scripts/migrate-from-bridge.mjs apply    --vault <vault> --release <release-dir> --backup <new-dir> --obsidian-closed
//   node scripts/migrate-from-bridge.mjs rollback --vault <vault> --backup <dir> --obsidian-closed
//
// Close Obsidian (or at least this vault) before apply/rollback: the running Bridge
// holds the port, and Obsidian rewrites community-plugins.json. Output never
// includes the API key or certificate contents.
import { applyMigration, describeSettings, inspectMigration, rollbackMigration } from './lib/bridge-migration.mjs';

const [command, ...rest] = process.argv.slice(2);
const opts = {};
for (let i = 0; i < rest.length; i++) {
	const arg = rest[i];
	if (!arg.startsWith('--')) continue;
	const key = arg.slice(2);
	if (rest[i + 1] && !rest[i + 1].startsWith('--')) opts[key] = rest[++i];
	else opts[key] = true;
}

function need(...keys) {
	const missing = keys.filter(k => !opts[k]);
	if (missing.length) {
		console.error(`Missing ${missing.map(k => `--${k}`).join(', ')}`);
		process.exit(2);
	}
}

function printReport(settings, report) {
	console.log('Settings Relay will use (secrets masked):');
	console.log(JSON.stringify(describeSettings(settings), null, 2));
	console.log(`Preserved: ${report.preserved.join(', ') || 'none'}`);
	console.log(`Security-reviewed: ${report.security.join(', ') || 'none'}`);
	for (const t of report.translated) console.log(`Translated ${t.key}: ${t.from} -> ${t.to}`);
	if (report.defaulted.length) console.log(`Reset to Relay defaults: ${report.defaulted.join(', ')}`);
	if (report.rollbackOnly.length) console.log(`Unknown keys kept only in the rollback backup: ${report.rollbackOnly.join(', ')}`);
	for (const w of report.warnings) console.log(`WARNING: ${w}`);
}

try {
	if (command === 'preview') {
		need('vault', 'release');
		const plan = inspectMigration({ vault: opts.vault, release: opts.release });
		console.log(`Preview only - nothing written. Release ${plan.releaseVersion}; Bridge currently ${plan.oldEnabled ? 'enabled' : 'disabled'}.`);
		printReport(plan.settings, plan.report);
		console.log('Rendered cache contents are not migrated.');
	} else if (command === 'apply') {
		need('vault', 'release', 'backup', 'obsidian-closed');
		const record = applyMigration({ vault: opts.vault, release: opts.release, backupDir: opts.backup });
		console.log(`Migrated to Lattice Relay ${record.releaseVersion}. Bridge is disabled but left installed for rollback.`);
		printReport(record.settings, record.report);
		console.log(`Backup and record: ${opts.backup}`);
		console.log('Next: open the vault, confirm Relay starts, then copy a new client config from Settings > Lattice Relay.');
	} else if (command === 'rollback') {
		need('vault', 'backup', 'obsidian-closed');
		const result = rollbackMigration({ vault: opts.vault, backupDir: opts.backup });
		console.log(`Rolled back: restored ${result.restored.join(', ')}.${result.parked ? ' Relay plugin directory parked in the backup.' : ''}`);
		console.log('Restore the previous MCP client configuration before reconnecting clients.');
	} else {
		console.error('Usage: migrate-from-bridge.mjs preview|apply|rollback --vault <dir> [--release <dir>] [--backup <dir>] [--obsidian-closed]');
		process.exit(2);
	}
} catch (error) {
	console.error(`Refused: ${error.message}`);
	process.exit(1);
}
