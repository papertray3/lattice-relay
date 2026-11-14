#!/usr/bin/env node
// Migrate one vault from MCP Bridge to Lattice Relay (PLAN-002 D4). Temporary tooling.
//
//   node scripts/migrate-from-bridge.mjs preview  --vault <vault> --release <release-dir>
//   node scripts/migrate-from-bridge.mjs apply    --vault <vault> --release <release-dir> --backup <new-dir> (--obsidian-closed | --live)
//   node scripts/migrate-from-bridge.mjs rollback --vault <vault> --backup <dir> (--obsidian-closed | --live)
//
// Offline (--obsidian-closed): close the vault first; the tool swaps the enabled
// plugin entry itself. Live (--live): Obsidian stays open and owns
// community-plugins.json; the tool installs and backs up, and you swap the
// plugins with the Obsidian CLI. Output never includes the API key or
// certificate contents.
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

function needMode() {
	if (Boolean(opts.live) === Boolean(opts['obsidian-closed'])) {
		console.error('Choose exactly one of --obsidian-closed (vault closed) or --live (vault open; swap plugins with the Obsidian CLI)');
		process.exit(2);
	}
	return Boolean(opts.live);
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
		need('vault', 'release', 'backup');
		const live = needMode();
		const record = applyMigration({ vault: opts.vault, release: opts.release, backupDir: opts.backup, live });
		printReport(record.settings, record.report);
		console.log(`Backup and record: ${opts.backup}`);
		if (live) {
			console.log(`Installed Lattice Relay ${record.releaseVersion} beside the running Bridge (not yet enabled). Swap them in the running vault, in this order:`);
			console.log(`  obsidian plugin:disable id=obsidian-mcp-bridge vault=<vault name>`);
			console.log(`  obsidian plugin:enable id=lattice-relay vault=<vault name>`);
			console.log('Then reload Lattice (or install the matching Lattice build) so it registers its tools with Relay.');
		} else {
			console.log(`Migrated to Lattice Relay ${record.releaseVersion}. Bridge is disabled but left installed for rollback.`);
			console.log('Next: open the vault, confirm Relay starts, then copy a new client config from Settings > Lattice Relay.');
		}
	} else if (command === 'rollback') {
		need('vault', 'backup');
		const live = needMode();
		const result = rollbackMigration({ vault: opts.vault, backupDir: opts.backup, live });
		console.log(`Rolled back: restored ${result.restored.join(', ') || 'nothing (Bridge files unchanged)'}.${result.parked ? ' Relay plugin directory parked in the backup.' : ''}`);
		if (result.reenable) console.log('Re-enable Bridge in the running vault: obsidian plugin:enable id=obsidian-mcp-bridge vault=<vault name>');
		console.log('Restore the previous MCP client configuration before reconnecting clients.');
	} else {
		console.error('Usage: migrate-from-bridge.mjs preview|apply|rollback --vault <dir> [--release <dir>] [--backup <dir>] [--obsidian-closed | --live]');
		process.exit(2);
	}
} catch (error) {
	console.error(`Refused: ${error.message}`);
	process.exit(1);
}
