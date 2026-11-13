#!/usr/bin/env node
// Bundles the canonical stdio server (servers/node) into one self-contained
// ESM file so the release needs no node_modules. Requires `npm run server:install`.
import esbuild from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SERVER_BUNDLE = path.join(root, 'build', 'server', 'lattice-relay.mjs');

await esbuild.build({
	absWorkingDir: root,
	entryPoints: ['servers/node/src/main.ts'],
	outfile: SERVER_BUNDLE,
	bundle: true,
	platform: 'node',
	format: 'esm',
	target: 'node20',
	// ws probes these optional native accelerators inside try/catch.
	external: ['bufferutil', 'utf-8-validate'],
	// Bundled CommonJS dependencies call require() for Node built-ins.
	// (The entry file's shebang is hoisted above this banner by esbuild.)
	banner: { js: "import { createRequire as __relayCreateRequire } from 'node:module';\nconst require = __relayCreateRequire(import.meta.url);" },
	legalComments: 'eof',
	logLevel: 'warning',
	sourcemap: false,
	minify: false,
});
console.log(`Bundled server: ${path.relative(root, SERVER_BUNDLE)}`);
