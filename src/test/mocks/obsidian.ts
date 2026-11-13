/**
 * Minimal runtime stand-in for the 'obsidian' package.
 *
 * The real 'obsidian' npm package ships type declarations only (its "main"
 * is empty - Obsidian injects the real implementation at plugin load time),
 * so it can't be resolved when tests run under Node/vitest. This mock
 * supplies just enough runtime surface for the classes our tests exercise:
 * `Notice` (user-facing error toasts), `TFile` (so `instanceof TFile` checks
 * in code under test - e.g. builtin-tools.ts - resolve correctly; build
 * fixtures with `createTestFile()` from src/test/helpers.ts, not `new
 * TFile()` directly - see that file for why), and `Plugin` (so `main.ts`'s
 * `class LatticeRelayPlugin extends Plugin` has something real to extend when
 * the module is imported under vitest - its base-class methods are no-ops;
 * integration tests construct instances via `Object.create(...prototype)`
 * rather than `new`, so Plugin's constructor is never actually invoked).
 *
 * Wired in via vitest.config.ts's `resolve.alias` - it only affects test
 * runs, not the real build (esbuild.config.mjs keeps 'obsidian' external so
 * Obsidian's own implementation is used at runtime in the app), and not
 * type-checking (tsc still resolves the real obsidian.d.ts from node_modules).
 */

export class Notice {
	constructor(_message: string, _timeout?: number) {}
}

export class TFile {
	path: string;
	name: string;
	basename: string;
	extension: string;
	stat: { ctime: number; mtime: number; size: number };
}

// Stub value-exports so modules that `extend` or `new` these (main.ts's
// settings.ts import chain, mainly) can be imported under vitest without
// needing a real DOM - none of our tests instantiate or render these.
export class PluginSettingTab {
	constructor(_app?: unknown, _plugin?: unknown) {}
}
export class Modal {
	constructor(_app?: unknown) {}
}
export class Setting {
	constructor(_containerEl?: unknown) {}
}

export class Plugin {
	app: unknown;
	manifest: unknown;

	constructor(app: unknown, manifest: unknown) {
		this.app = app;
		this.manifest = manifest;
	}

	addCommand(_command: unknown): void {}
	addSettingTab(_tab: unknown): void {}
	addStatusBarItem(): { setText: (text: string) => void; addClass: (cls: string) => void } {
		return { setText: () => {}, addClass: () => {} };
	}
	async loadData(): Promise<unknown> { return null; }
	async saveData(_data: unknown): Promise<void> {}
}
