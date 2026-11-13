#!/usr/bin/env node
// Drives a built Relay stdio server over real stdin/stdout with no plugin
// listening: initialize, list tools, call a tool, then close stdin and expect
// a clean exit. Fails if stdout carries anything other than JSON-RPC.
//
// Usage: node scripts/smoke-server.mjs <path-to-server.mjs>
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** A port with nothing listening, so the server must use its offline paths. */
async function closedPort() {
	const srv = net.createServer();
	await new Promise(resolve => srv.listen(0, '127.0.0.1', resolve));
	const { port } = srv.address();
	await new Promise(resolve => srv.close(resolve));
	return port;
}

export async function smoke(file, { timeoutMs = 15000 } = {}) {
	const port = await closedPort();
	const child = spawn(process.execPath, [file], {
		env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, LATTICE_RELAY_KEY: 'smoke-not-a-secret', LATTICE_RELAY_HOST: '127.0.0.1', LATTICE_RELAY_PORT: String(port) },
		stdio: ['pipe', 'pipe', 'pipe'],
	});
	let stderr = '';
	child.stderr.on('data', d => { stderr += d; });
	const pending = new Map();
	const nonProtocol = [];
	let buffer = '';
	child.stdout.on('data', chunk => {
		buffer += chunk;
		let i;
		while ((i = buffer.indexOf('\n')) >= 0) {
			const line = buffer.slice(0, i).trim();
			buffer = buffer.slice(i + 1);
			if (!line) continue;
			let msg;
			try { msg = JSON.parse(line); } catch { nonProtocol.push(line); continue; }
			if (msg.jsonrpc !== '2.0') { nonProtocol.push(line); continue; }
			pending.get(msg.id)?.(msg);
		}
	});
	const exited = new Promise(resolve => child.on('exit', (code, signal) => resolve({ code, signal })));
	const timer = setTimeout(() => child.kill(), timeoutMs);
	let nextId = 1;
	const request = (method, params) => new Promise(resolve => {
		const id = nextId++;
		pending.set(id, resolve);
		child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
	});

	try {
		const init = await request('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'relay-smoke', version: '0' } });
		child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
		const list = await request('tools/list', {});
		const call = await request('tools/call', { name: 'ping', arguments: {} });
		child.stdin.end();
		const exit = await exited;
		const problems = [];
		if (init.result?.serverInfo?.name !== 'lattice-relay') problems.push(`serverInfo.name is ${init.result?.serverInfo?.name}`);
		if (!init.result?.capabilities?.tools) problems.push('tools capability missing');
		if (!Array.isArray(list.result?.tools) || list.result.tools.length === 0) problems.push('tools/list returned no tools');
		if (call.result?.isError !== true || !/Not connected to Obsidian/.test(call.result?.content?.[0]?.text ?? '')) problems.push('offline tool call did not report a tool error');
		if (nonProtocol.length) problems.push(`non-JSON-RPC output on stdout: ${nonProtocol.slice(0, 3).join(' | ')}`);
		if (exit.code !== 0) problems.push(`exit ${exit.code ?? exit.signal} after stdin closed`);
		if (stderr.includes('smoke-not-a-secret')) problems.push('the key value appeared in diagnostics');
		return { problems, serverInfo: init.result?.serverInfo, protocolVersion: init.result?.protocolVersion, tools: list.result?.tools?.length };
	} finally {
		clearTimeout(timer);
		if (child.exitCode === null) child.kill();
	}
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const serverPath = path.resolve(process.argv[2] ?? 'build/server/lattice-relay.mjs');
	const result = await smoke(serverPath);
	if (result.problems.length) {
		console.error(`Server smoke FAILED (${serverPath}):\n` + result.problems.map(p => `  - ${p}`).join('\n'));
		process.exit(1);
	}
	console.log(`Server smoke passed: ${result.serverInfo.name} ${result.serverInfo.version}, protocol ${result.protocolVersion}, ${result.tools} tools offline, clean exit.`);
}
