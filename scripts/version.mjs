#!/usr/bin/env node
// Usage:
//   node scripts/version.mjs --check        verify coordinated identity and version
//   node scripts/version.mjs 0.2.0 [--dry]  set the coordinated version (needs a CHANGELOG section)
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkRelease, setVersion } from './lib/release-identity.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);

if (args[0] === '--check' || args.length === 0) {
	const problems = checkRelease(root);
	if (problems.length) {
		console.error('Release identity check failed:\n' + problems.map(p => `  - ${p}`).join('\n'));
		process.exit(1);
	}
	console.log('Release identity and versions are consistent.');
} else {
	try {
		const changed = setVersion(root, args[0], { dryRun: args.includes('--dry') });
		console.log(`${args.includes('--dry') ? 'Would change' : 'Changed'}: ${changed.join(', ') || 'nothing'}`);
		const problems = args.includes('--dry') ? [] : checkRelease(root);
		if (problems.length) {
			console.error(problems.join('\n'));
			process.exit(1);
		}
	} catch (error) {
		console.error(error.message);
		process.exit(1);
	}
}
