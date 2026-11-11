/**
 * Test-only fake of Lattice's public plugin API, built from the vendored
 * fixtures. Every Lattice namespace is wrapped in a Proxy that records each
 * property read, so tests can prove which methods Relay touched - and that
 * no effectful method (select, attachMember, changeInstanceValue, ...) was
 * reachable, let alone called.
 */
import { vi } from 'vitest';
import examples from './fixtures/focus/context-envelope.v1.examples.json';
import preambleEnvelope from './fixtures/fold/preamble.v1.example.json';
import manifestFacet from './fixtures/fold/manifest.v2.relay-sample.json';
import { FACET_TOPOLOGY } from './contract';
import type { PluginHostLike } from './discovery';

export const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** What Lattice actually answers for a facet no provider supplies (inspection.ts unsupportedFacet). */
export function unsupportedFacet(facetId: string) {
	return {
		facetId,
		provider: null,
		generatedAt: '2026-10-17T12:00:00.000Z',
		sources: {},
		status: 'unavailable',
		payload: null,
		diagnostics: [{ code: 'inspection.facet.unsupported', severity: 'error', message: `No provider supplies facet "${facetId}".`, origin: 'inspection', path: `$.facets[${facetId}]` }],
	};
}

/** A Fold envelope answering exactly `facets`, as Lattice beta.70 would. */
export function foldEnvelope(facets: readonly string[], foldId = 'fold-example-0001'): Record<string, any> {
	const base = clone(preambleEnvelope) as Record<string, any>;
	const preamble = base.facets[0];
	base.foldId = foldId;
	preamble.payload.foldId = foldId;
	base.requestedFacets = [...facets];
	base.facets = facets.map((facetId) => {
		if (facetId === preamble.facetId) return preamble;
		if (facetId === manifestFacet.facetId) return { ...clone(manifestFacet), payload: { ...clone(manifestFacet.payload), foldId } };
		return unsupportedFacet(facetId);
	});
	return base;
}

export function notFoundEnvelope(foldId: string, facets: readonly string[]) {
	const unknown = { code: 'inspection.fold.unknown', severity: 'error', message: `No installed Fold has ID "${foldId}".`, origin: 'inspection', path: '$.foldId' };
	return {
		spec: 'lattice-fold-context-envelope/v1',
		foldId,
		found: false,
		manifestRevision: null,
		effectiveStateRevision: null,
		authorityRevision: null,
		workstreamRevision: null,
		generatedAt: '2026-10-17T12:00:00.000Z',
		requestedFacets: [...facets],
		observationWatermark: null,
		diagnostics: [unknown],
		// As inspection.ts answers an unknown Fold (and as observed live on beta.69): every requested
		// facet is listed as unavailable, carrying the not-found reason, or the unsupported reason when
		// no provider exists.
		facets: facets.map((facetId) =>
			facetId === FACET_TOPOLOGY
				? unsupportedFacet(facetId)
				: { facetId, provider: 'lattice-fold.builtin-inspection@1.0.0', generatedAt: '2026-10-17T12:00:00.000Z', sources: {}, status: 'unavailable', payload: null, diagnostics: [unknown] },
		),
	};
}

/** The published `inspected` example, re-answered for the requested facets. */
export function inspectedEnvelope(facets: readonly string[]): Record<string, any> {
	const envelope = clone(examples.inspected) as Record<string, any>;
	envelope.requestedFoldFacets = [...facets];
	envelope.current.fold = foldEnvelope(facets);
	return envelope;
}

export const DECLARED_TOPOLOGY = {
	facetId: FACET_TOPOLOGY,
	provider: { providerId: 'lattice-fold.topology', version: '1.0.0' },
	generatedAt: '2026-10-17T12:00:00.000Z',
	sources: { manifestRevision: 1 },
	status: 'ready',
	payload: {
		spec: 'lattice-fold-topology/v1',
		parent: { foldId: 'fold-office', label: 'Office' },
		ancestors: [{ foldId: 'fold-office', label: 'Office' }],
		siblings: [{ foldId: 'fold-next-door', label: 'Next door' }],
		children: [{ foldId: 'fold-inner', label: 'Inner chamber' }],
		descendants: [{ foldId: 'fold-inner', label: 'Inner chamber' }],
	},
	diagnostics: [],
};

export interface FakeLatticeOptions {
	inspectContext?: (request: any) => unknown | Promise<unknown>;
	inspectFold?: (request: any) => unknown | Promise<unknown>;
	listFolds?: (() => unknown) | null;
	latticeApiVersion?: string;
	focusApiVersion?: string;
	foldApiVersion?: string;
	focus?: 'ready' | 'missing';
	fold?: 'ready' | 'missing';
	health?: Array<{ module: string; state: string; diagnostic?: { code: string; message: string } }>;
}

const EFFECTFUL_FOCUS = ['select', 'commitCandidate', 'dismissCandidate', 'restorePrevious', 'clear'] as const;
const EFFECTFUL_FOLD = [
	'attachMember', 'detachMember', 'changeInstanceValue', 'acceptAuthorityGrant', 'retireFold', 'archiveFold',
	'planForObservation', 'approvePlan', 'recordMoveReceipt', 'applyPropertyProjection', 'recordPropertyProjection',
	'reconcileMembershipLineage', 'recordBlockReconciliation', 'prepareInstallation', 'commitInstallation',
	'prepareMemberCreation', 'executeWorkflow', 'planManualWorkflow', 'dispatchWorkflowEvent', 'followMemberRename',
] as const;

export function fakeLattice(options: FakeLatticeOptions = {}) {
	const accessed: string[] = [];
	const effects: Record<string, ReturnType<typeof vi.fn>> = {};
	const track = <T extends object>(name: string, target: T): T =>
		new Proxy(target, {
			get(obj, prop, receiver) {
				if (typeof prop === 'string') accessed.push(`${name}.${prop}`);
				return Reflect.get(obj, prop, receiver);
			},
		});

	const focusTarget: Record<string, unknown> = {
		apiVersion: options.focusApiVersion ?? '1.1',
		inspectContext: vi.fn(async (request: any) => (options.inspectContext ? options.inspectContext(request) : inspectedEnvelope(request.foldFacets))),
		snapshot: vi.fn(() => clone(examples.inspected.context)),
		subscribe: vi.fn(() => () => undefined),
		// A private-looking field that must never surface in Relay output.
		_service: { secretToken: 'PRIVATE-FOCUS-STATE' },
	};
	for (const name of EFFECTFUL_FOCUS) focusTarget[name] = effects[`focus.${name}`] = vi.fn();

	const foldTarget: Record<string, unknown> = {
		apiVersion: options.foldApiVersion ?? '1.0',
		inspectFold: vi.fn(async (request: any) => (options.inspectFold ? options.inspectFold(request) : foldEnvelope(request.facets, request.foldId))),
		getFold: vi.fn(),
		resolveMembership: vi.fn(),
		_store: { secretToken: 'PRIVATE-FOLD-STORE' },
	};
	if (options.listFolds !== null) {
		foldTarget.listFolds = vi.fn(options.listFolds ?? (() => [
			{ foldId: 'fold-example-0001', label: 'Test Project', status: 'active', members: [{ locator: 'x' }] },
			{ foldId: 'fold-old', label: 'Old', status: 'retired' },
			{ foldId: 'fold-alpha', label: 'Alpha', status: 'active' },
		]));
	}
	for (const name of EFFECTFUL_FOLD) foldTarget[name] = effects[`fold.${name}`] = vi.fn();

	const focus = track('focus', focusTarget);
	const fold = track('fold', foldTarget);
	const health = options.health ?? [
		{ module: 'fold', state: options.fold === 'missing' ? 'unavailable' : 'ready' },
		{ module: 'foundry', state: 'ready' },
		{ module: 'focus', state: options.focus === 'missing' ? 'unavailable' : 'ready' },
	];
	const api = track('api', {
		apiVersion: options.latticeApiVersion ?? '2.0',
		health: () => health,
		get focus() {
			return options.focus === 'missing' ? undefined : focus;
		},
		get fold() {
			return options.fold === 'missing' ? undefined : fold;
		},
		foundry: { secret: 'PRIVATE-FOUNDRY' },
	});

	const host: PluginHostLike = {
		plugins: {
			plugins: { lattice: { api, settings: { token: 'PRIVATE-SETTINGS' } } },
			manifests: { lattice: { version: '2.0.0-beta.70' } },
			enabledPlugins: new Set(['lattice']),
		},
	};

	return { host, accessed, effects, focusTarget, foldTarget };
}

export const ALLOWED_LATTICE_READS = new Set([
	'api.apiVersion', 'api.health', 'api.focus', 'api.fold',
	'focus.apiVersion', 'focus.inspectContext',
	'fold.apiVersion', 'fold.inspectFold', 'fold.listFolds',
]);
