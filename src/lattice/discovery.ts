import {
	LATTICE_PLUGIN_ID,
	SUPPORTED_FOCUS_API,
	SUPPORTED_FOLD_API,
	SUPPORTED_LATTICE_API_MAJOR,
} from './contract';
import type { RelayDiagnostic } from './envelope';

/**
 * Finds Lattice's public API (`app.plugins.plugins['lattice'].api`) and
 * negotiates the versions Relay supports.
 *
 * What comes back is a set of *narrow read ports*: bound copies of the few
 * read-only methods Relay projects. Projection code never holds the Lattice
 * API object itself, so it has no path to `select`, `attachMember`,
 * `changeInstanceValue` or any other effectful method. Discovery reads the
 * public API only - no private services, no persisted store, no data.json.
 */

/** The read-only Focus surface Relay uses (Focus API 1.1). */
export interface FocusReadPort {
	readonly apiVersion: string;
	inspectContext(request: { expectedContextRevision?: number; foldFacets?: string[] }): Promise<unknown>;
}

/** The read-only Fold surface Relay uses (Fold API 1.0). */
export interface FoldReadPort {
	readonly apiVersion: string;
	inspectFold(request: { foldId: string; facets: string[] }): Promise<unknown>;
	/** Optional: absent when Lattice does not expose it; Relay then omits the selectable-Fold list. */
	listFolds?(): unknown;
}

export interface LatticeVersions {
	lattice: string | null;
	focus: string | null;
	fold: string | null;
	plugin: string | null;
}

export type LatticeUnavailableReason = 'not-installed' | 'disabled' | 'initializing' | 'module-failed' | 'module-unavailable';

export type LatticeDiscovery =
	| { state: 'available'; versions: LatticeVersions; focus: FocusReadPort | null; fold: FoldReadPort }
	| { state: 'unavailable'; reason: LatticeUnavailableReason; versions: LatticeVersions; diagnostics: RelayDiagnostic[] }
	| { state: 'incompatible'; versions: LatticeVersions; diagnostics: RelayDiagnostic[] };

/** The slice of Obsidian's `App` discovery reads. */
export interface PluginHostLike {
	plugins?: {
		plugins?: Record<string, unknown>;
		manifests?: Record<string, { version?: unknown } | undefined>;
		enabledPlugins?: { has(id: string): boolean };
	};
}

type ModuleId = 'focus' | 'fold';

interface ModuleHealth {
	module: string;
	state: string;
	diagnostic?: { code?: unknown; message?: unknown };
}

function parseVersion(value: unknown): { major: number; minor: number } | null {
	if (typeof value !== 'string') return null;
	const match = /^(\d+)\.(\d+)(?:\.\d+)?$/.exec(value);
	return match ? { major: Number(match[1]), minor: Number(match[2]) } : null;
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function diag(code: string, severity: RelayDiagnostic['severity'], message: string): RelayDiagnostic {
	return { code, severity, message, origin: 'relay' };
}

function readHealth(api: Record<string, unknown>): ModuleHealth[] {
	try {
		const health = typeof api.health === 'function' ? (api.health as () => unknown)() : undefined;
		return Array.isArray(health) ? health.filter((h): h is ModuleHealth => isObject(h) && typeof h.module === 'string' && typeof h.state === 'string') : [];
	} catch {
		return [];
	}
}

function moduleUnavailable(id: ModuleId, health: ModuleHealth[], versions: LatticeVersions): LatticeDiscovery {
	const entry = health.find((h) => h.module === id);
	const title = id === 'focus' ? 'Focus' : 'Fold';
	if (entry?.state === 'failed') {
		const detail = typeof entry.diagnostic?.message === 'string' ? ` ${entry.diagnostic.message.slice(0, 300)}` : '';
		return { state: 'unavailable', reason: 'module-failed', versions, diagnostics: [diag(`relay.lattice.${id}.failed`, 'error', `Lattice ${title} failed to start.${detail}`)] };
	}
	if (!entry || entry.state === 'unavailable') {
		// Not started yet (load order) or not part of this build: retryable, never a substitute answer.
		const notIncluded = typeof entry?.diagnostic?.code === 'string' && entry.diagnostic.code.endsWith('.not-included');
		return notIncluded
			? { state: 'unavailable', reason: 'module-unavailable', versions, diagnostics: [diag(`relay.lattice.${id}.not-included`, 'error', `This Lattice build does not include ${title}.`)] }
			: { state: 'unavailable', reason: 'initializing', versions, diagnostics: [diag('relay.lattice.initializing', 'warning', `Lattice ${title} is not ready yet; retry shortly.`)] };
	}
	// Health says ready but the namespace is missing: treat as a race, not as data.
	return { state: 'unavailable', reason: 'initializing', versions, diagnostics: [diag('relay.lattice.initializing', 'warning', `Lattice ${title} is not ready yet; retry shortly.`)] };
}

function supports(version: { major: number; minor: number } | null, wanted: { major: number; minMinor: number }): boolean {
	return version !== null && version.major === wanted.major && version.minor >= wanted.minMinor;
}

/**
 * Discovers Lattice. `needs` names the modules this caller reads: orientation
 * needs Focus and Fold, Fold description needs only Fold (it never touches
 * Focus, so it cannot move or depend on the working context).
 */
export function discoverLattice(host: PluginHostLike, needs: { focus: boolean }): LatticeDiscovery {
	const versions: LatticeVersions = { lattice: null, focus: null, fold: null, plugin: null };
	const plugins = host.plugins;
	const manifest = plugins?.manifests?.[LATTICE_PLUGIN_ID];
	if (manifest && typeof manifest.version === 'string') versions.plugin = manifest.version;
	const plugin = plugins?.plugins?.[LATTICE_PLUGIN_ID];

	if (!isObject(plugin)) {
		if (plugins?.manifests && !manifest) {
			return { state: 'unavailable', reason: 'not-installed', versions, diagnostics: [diag('relay.lattice.not-installed', 'error', 'The Lattice plugin is not installed in this vault.')] };
		}
		if (plugins?.enabledPlugins && !plugins.enabledPlugins.has(LATTICE_PLUGIN_ID)) {
			return { state: 'unavailable', reason: 'disabled', versions, diagnostics: [diag('relay.lattice.disabled', 'error', 'The Lattice plugin is installed but not enabled.')] };
		}
		return { state: 'unavailable', reason: 'initializing', versions, diagnostics: [diag('relay.lattice.initializing', 'warning', 'Lattice is enabled but has not finished loading; retry shortly.')] };
	}

	const api = plugin.api;
	if (!isObject(api)) {
		return { state: 'unavailable', reason: 'initializing', versions, diagnostics: [diag('relay.lattice.initializing', 'warning', 'Lattice has not published its API yet; retry shortly.')] };
	}

	versions.lattice = typeof api.apiVersion === 'string' ? api.apiVersion.slice(0, 32) : null;
	const latticeVersion = parseVersion(api.apiVersion);
	if (!latticeVersion || latticeVersion.major !== SUPPORTED_LATTICE_API_MAJOR) {
		return { state: 'incompatible', versions, diagnostics: [diag('relay.lattice.api.unsupported-version', 'error', `Relay supports Lattice API ${SUPPORTED_LATTICE_API_MAJOR}.x; this Lattice reports ${versions.lattice ?? 'no version'}.`)] };
	}

	// Read each live namespace getter exactly once so a module stopping mid-call cannot swap objects under us.
	const health = readHealth(api);
	const fold = api.fold;
	const focus = needs.focus ? api.focus : undefined;
	if (isObject(fold)) versions.fold = typeof fold.apiVersion === 'string' ? fold.apiVersion.slice(0, 32) : null;
	if (isObject(focus)) versions.focus = typeof focus.apiVersion === 'string' ? focus.apiVersion.slice(0, 32) : null;

	if (!isObject(fold)) return moduleUnavailable('fold', health, versions);
	if (needs.focus && !isObject(focus)) return moduleUnavailable('focus', health, versions);

	const incompatible: RelayDiagnostic[] = [];
	if (!supports(parseVersion(fold.apiVersion), SUPPORTED_FOLD_API) || typeof fold.inspectFold !== 'function') {
		incompatible.push(diag('relay.lattice.fold.unsupported-version', 'error', `Relay needs Fold API ${SUPPORTED_FOLD_API.major}.${SUPPORTED_FOLD_API.minMinor}+ with inspectFold; this Lattice reports ${versions.fold ?? 'no version'}.`));
	}
	if (needs.focus && isObject(focus) && (!supports(parseVersion(focus.apiVersion), SUPPORTED_FOCUS_API) || typeof focus.inspectContext !== 'function')) {
		incompatible.push(diag('relay.lattice.focus.unsupported-version', 'error', `Relay needs Focus API ${SUPPORTED_FOCUS_API.major}.${SUPPORTED_FOCUS_API.minMinor}+ with inspectContext; this Lattice reports ${versions.focus ?? 'no version'}.`));
	}
	if (incompatible.length) return { state: 'incompatible', versions, diagnostics: incompatible };

	const inspectFold = (fold.inspectFold as FoldReadPort['inspectFold']).bind(fold);
	const listFolds = typeof fold.listFolds === 'function' ? (fold.listFolds as () => unknown).bind(fold) : undefined;
	const foldPort: FoldReadPort = Object.freeze({ apiVersion: versions.fold ?? '', inspectFold, ...(listFolds ? { listFolds } : {}) });

	let focusPort: FocusReadPort | null = null;
	if (needs.focus && isObject(focus)) {
		const inspectContext = (focus.inspectContext as FocusReadPort['inspectContext']).bind(focus);
		focusPort = Object.freeze({ apiVersion: versions.focus ?? '', inspectContext });
	}

	return { state: 'available', versions, focus: focusPort, fold: foldPort };
}
