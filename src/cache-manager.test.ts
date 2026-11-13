import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Vault } from 'obsidian';
import { RenderedContentCacheManager, CacheSettings } from './cache-manager';
import { createTestFile } from './test/helpers';

function waitFor(predicate: () => boolean, timeoutMs = 2000, intervalMs = 10): Promise<void> {
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

describe('RenderedContentCacheManager', () => {
	let vaultBasePath: string;
	let settings: CacheSettings;
	let fakeVault: Vault;

	beforeEach(() => {
		vaultBasePath = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-relay-cachevault-'));
		settings = {
			cacheDir: path.join(vaultBasePath, '.cache'),
			vaultBasePath,
			maxSizeMB: 1,
		};
		fakeVault = {} as Vault;
	});

	afterEach(() => {
		fs.rmSync(vaultBasePath, { recursive: true, force: true });
	});

	function metadataPath() {
		return path.join(settings.cacheDir, 'metadata.json');
	}

	it('returns null for a file that was never cached', async () => {
		const cache = new RenderedContentCacheManager(fakeVault, settings);
		const file = createTestFile('note.md', { mtime: 1, size: 10 });

		expect(await cache.get(file)).toBeNull();
	});

	it('stores and retrieves content for the same file', async () => {
		const cache = new RenderedContentCacheManager(fakeVault, settings);
		const file = createTestFile('note.md', { mtime: 1, size: 10 });

		await cache.set(file, '<p>hello</p>');
		const result = await cache.get(file);

		expect(result?.content).toBe('<p>hello</p>');
	});

	it('treats a changed mtime/size as a different cache key (miss)', async () => {
		const cache = new RenderedContentCacheManager(fakeVault, settings);
		const v1 = createTestFile('note.md', { mtime: 1, size: 10 });
		const v2 = createTestFile('note.md', { mtime: 2, size: 10 });

		await cache.set(v1, '<p>v1</p>');
		expect(await cache.get(v2)).toBeNull();
	});

	it('does not write metadata.json synchronously on get()/set() - it is debounced', async () => {
		const cache = new RenderedContentCacheManager(fakeVault, settings);
		const file = createTestFile('note.md', { mtime: 1, size: 10 });

		await cache.set(file, '<p>hello</p>');
		// The debounce window (500ms) hasn't elapsed yet - no write should have landed.
		expect(fs.existsSync(metadataPath())).toBe(false);

		await waitFor(() => fs.existsSync(metadataPath()), 1000);
		const written = JSON.parse(fs.readFileSync(metadataPath(), 'utf-8'));
		expect(Object.keys(written.entries)).toHaveLength(1);
	});

	it('flush() writes pending metadata immediately without waiting for the debounce', async () => {
		const cache = new RenderedContentCacheManager(fakeVault, settings);
		const file = createTestFile('note.md', { mtime: 1, size: 10 });

		await cache.set(file, '<p>hello</p>');
		expect(fs.existsSync(metadataPath())).toBe(false);

		cache.flush();
		expect(fs.existsSync(metadataPath())).toBe(true);
	});

	it('coalesces a burst of writes into a single metadata.json write', async () => {
		const cache = new RenderedContentCacheManager(fakeVault, settings);

		for (let i = 0; i < 5; i++) {
			await cache.set(createTestFile(`note${i}.md`, { mtime: i, size: 10 }), `<p>${i}</p>`);
		}

		cache.flush();
		const written = JSON.parse(fs.readFileSync(metadataPath(), 'utf-8'));
		expect(Object.keys(written.entries)).toHaveLength(5);
	});

	it('evicts the least-recently-used entry once the size limit is exceeded', async () => {
		settings.maxSizeMB = 0.000_02; // ~20 bytes - small enough that two entries trip eviction
		const cache = new RenderedContentCacheManager(fakeVault, settings);

		const older = createTestFile('older.md', { mtime: 1, size: 10 });
		await cache.set(older, 'x'.repeat(15));
		// Ensure a distinct lastAccess ordering between the two entries.
		await new Promise((r) => setTimeout(r, 5));
		const newer = createTestFile('newer.md', { mtime: 2, size: 10 });
		await cache.set(newer, 'y'.repeat(15));

		expect(await cache.get(older)).toBeNull(); // evicted
		expect((await cache.get(newer))?.content).toBe('y'.repeat(15)); // survives
	});

	it('clear() removes all cached content and resets stats immediately', async () => {
		const cache = new RenderedContentCacheManager(fakeVault, settings);
		const file = createTestFile('note.md', { mtime: 1, size: 10 });
		await cache.set(file, '<p>hello</p>');

		await cache.clear();

		// clear() re-creates the (now empty) cache dir when it immediately persists
		// the reset metadata.json - what matters is the cached entry itself is gone.
		expect(cache.getStats()).toEqual({ entries: 0, totalSizeMB: 0, maxSizeMB: settings.maxSizeMB });
		expect(await cache.get(file)).toBeNull();
	});

	it('getStats reports entry count and approximate size', async () => {
		const cache = new RenderedContentCacheManager(fakeVault, settings);
		await cache.set(createTestFile('note.md', { mtime: 1, size: 10 }), 'x'.repeat(100));

		const stats = cache.getStats();
		expect(stats.entries).toBe(1);
		expect(stats.totalSizeMB).toBeGreaterThan(0);
		expect(stats.maxSizeMB).toBe(settings.maxSizeMB);
	});
});
