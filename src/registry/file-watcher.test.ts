import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ToolFileWatcher } from './file-watcher';

function waitFor(predicate: () => boolean, timeoutMs = 2000, intervalMs = 20): Promise<void> {
	return new Promise((resolve, reject) => {
		const start = Date.now();
		const check = () => {
			if (predicate()) return resolve();
			if (Date.now() - start > timeoutMs) return reject(new Error('waitFor timed out'));
			setTimeout(check, intervalMs);
		};
		check();
	});
}

describe('ToolFileWatcher', () => {
	let dir: string;
	let watcher: ToolFileWatcher;

	afterEach(async () => {
		await watcher?.stop();
		fs.rmSync(dir, { recursive: true, force: true });
	});

	it('triggers onChange when a watched .yaml file is added', async () => {
		dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-relay-watch-'));
		watcher = new ToolFileWatcher(50);

		let calls = 0;
		watcher.start([dir], () => { calls++; });
		await watcher.ready();

		fs.writeFileSync(path.join(dir, 'new_tool.yaml'), 'name: x\n');

		await waitFor(() => calls >= 1);
		expect(calls).toBe(1);
	});

	it('ignores changes to files with unrelated extensions', async () => {
		dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-relay-watch-'));
		watcher = new ToolFileWatcher(50);

		let calls = 0;
		watcher.start([dir], () => { calls++; });
		await watcher.ready();

		fs.writeFileSync(path.join(dir, 'notes.md'), '# not a tool file\n');

		// Give the watcher a moment to (not) notice, then confirm the sentinel .yaml still fires.
		await new Promise((r) => setTimeout(r, 200));
		expect(calls).toBe(0);

		fs.writeFileSync(path.join(dir, 'sentinel.yaml'), 'name: x\n');
		await waitFor(() => calls >= 1);
		expect(calls).toBe(1);
	});

	it('debounces a burst of rapid changes into a single reload', async () => {
		dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-relay-watch-'));
		watcher = new ToolFileWatcher(150);

		let calls = 0;
		watcher.start([dir], () => { calls++; });
		await watcher.ready();

		const filePath = path.join(dir, 'tool.yaml');
		fs.writeFileSync(filePath, 'name: v1\n');
		await new Promise((r) => setTimeout(r, 30));
		fs.writeFileSync(filePath, 'name: v2\n');
		await new Promise((r) => setTimeout(r, 30));
		fs.writeFileSync(filePath, 'name: v3\n');

		// Wait past the debounce window and confirm only one reload fired.
		await new Promise((r) => setTimeout(r, 400));
		expect(calls).toBe(1);
	});

	it('stops watching after stop()', async () => {
		dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-relay-watch-'));
		watcher = new ToolFileWatcher(50);

		let calls = 0;
		watcher.start([dir], () => { calls++; });
		await watcher.ready();
		await watcher.stop();

		fs.writeFileSync(path.join(dir, 'after_stop.yaml'), 'name: x\n');
		await new Promise((r) => setTimeout(r, 300));
		expect(calls).toBe(0);
	});
});
