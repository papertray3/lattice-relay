import {
	FACET_MANIFEST,
	FACET_PREAMBLE,
	FACET_TOPOLOGY,
	FOCUS_CONTEXT_ENVELOPE_SPEC,
	FOCUS_CONTEXT_SPEC,
	FOCUS_OUTCOMES,
	LIMITS,
	RELAY_FOLD_DESCRIPTION_SPEC,
	RELAY_ORIENTATION_SPEC,
	type FocusOutcome,
} from './contract';
import { discoverLattice, type FoldReadPort, type LatticeDiscovery, type PluginHostLike } from './discovery';
import {
	boundDiagnostics,
	clip,
	isRecord,
	num,
	projectDiagnostics,
	relayDiagnostic,
	sourceFrom,
	UpstreamContractError,
	type RelayDiagnostic,
	type RelayErrorClass,
	type RelaySource,
} from './envelope';
import { assertFoldEnvelope, projectFoldEnvelope, type RelayFoldDescription } from './fold-projection';

/**
 * The two read-only Lattice tools Relay projects over MCP:
 *
 * - `lattice_orient` - "where am I working?": the Focus snapshot (current,
 *   previous, candidate, diagnostics) plus one bounded description of the
 *   current Fold, read through `api.focus.inspectContext`.
 * - `lattice_fold_describe` - "what is this Fold?": one explicitly named Fold,
 *   read through `api.fold.inspectFold`. It never reads or changes Focus.
 *
 * Neither tool can grant authority: every envelope carries
 * `grantsAuthority: false`, and the only Lattice methods reachable here are
 * the read ports discovery hands back (inspectContext, inspectFold, listFolds).
 */

export type RelayOutcome =
	| FocusOutcome
	| 'described'
	| 'lattice-unavailable'
	| 'lattice-incompatible'
	| 'upstream-invalid'
	| 'upstream-failed';

export interface RelayFocusEntry {
	foldId: string;
	label: string | null;
	foldRevision: number | null;
	evidence: { source: string | null; path?: string };
	at: string | null;
}

export interface RelayOrientation {
	spec: typeof RELAY_ORIENTATION_SPEC;
	outcome: RelayOutcome;
	errorClass: RelayErrorClass;
	grantsAuthority: false;
	generatedAt: string;
	source: RelaySource;
	availability: { state: LatticeDiscovery['state']; reason?: string };
	context: {
		revision: number;
		current: RelayFocusEntry | null;
		previous: RelayFocusEntry | null;
		candidate: RelayFocusEntry | null;
	} | null;
	currentFold: RelayFoldDescription | null;
	folds: { truncated: boolean; items: Array<{ foldId: string; label: string | null; status: string | null }> } | null;
	diagnostics: RelayDiagnostic[];
}

export interface RelayFoldDescriptionEnvelope {
	spec: typeof RELAY_FOLD_DESCRIPTION_SPEC;
	outcome: RelayOutcome;
	errorClass: RelayErrorClass;
	grantsAuthority: false;
	generatedAt: string;
	source: RelaySource;
	availability: { state: LatticeDiscovery['state']; reason?: string };
	fold: RelayFoldDescription | null;
	diagnostics: RelayDiagnostic[];
}

export interface OrientParams {
	expectedContextRevision?: number;
	includeMembers?: boolean;
	includeTopology?: boolean;
}

export interface DescribeParams {
	foldId: string;
	includeMembers?: boolean;
	includeTopology?: boolean;
}

export const LATTICE_TOOL_NAMES = ['lattice_orient', 'lattice_fold_describe'] as const;

function facetsFor(params: { includeMembers?: boolean; includeTopology?: boolean }): string[] {
	const facets = [FACET_PREAMBLE];
	if (params.includeMembers !== false) facets.push(FACET_MANIFEST);
	if (params.includeTopology !== false) facets.push(FACET_TOPOLOGY);
	return facets.sort();
}

function availabilityOf(discovery: LatticeDiscovery): { state: LatticeDiscovery['state']; reason?: string } {
	return discovery.state === 'unavailable' ? { state: discovery.state, reason: discovery.reason } : { state: discovery.state };
}

function focusEntry(value: unknown): RelayFocusEntry | null {
	if (!isRecord(value) || !isRecord(value.fold) || typeof value.fold.foldId !== 'string') return null;
	const evidence = isRecord(value.evidence) ? value.evidence : {};
	const path = clip(evidence.path, 1000);
	return {
		foldId: clip(value.fold.foldId, 200) as string,
		label: clip(value.fold.label),
		foldRevision: num(value.fold.foldRevision),
		evidence: { source: clip(evidence.source, 40), ...(path ? { path } : {}) },
		at: clip(value.at, 64),
	};
}

function assertFocusEnvelope(value: unknown): asserts value is Record<string, unknown> & { context: Record<string, unknown>; outcome: FocusOutcome } {
	if (!isRecord(value)) throw new UpstreamContractError('Focus inspectContext did not return an object.');
	if (value.spec !== FOCUS_CONTEXT_ENVELOPE_SPEC) throw new UpstreamContractError(`Focus returned spec ${JSON.stringify(clip(value.spec, 80))}, expected ${FOCUS_CONTEXT_ENVELOPE_SPEC}.`);
	if (!(FOCUS_OUTCOMES as readonly unknown[]).includes(value.outcome)) throw new UpstreamContractError(`Focus returned unknown outcome ${JSON.stringify(clip(value.outcome, 80))}.`);
	// Lattice guarantees grantsAuthority: false. Anything else is a contract break Relay refuses to pass on.
	if (value.grantsAuthority !== false) throw new UpstreamContractError('Focus envelope does not carry grantsAuthority: false.');
	const context = value.context;
	if (!isRecord(context) || context.spec !== FOCUS_CONTEXT_SPEC || num(context.revision) === null) throw new UpstreamContractError('Focus envelope has no valid lattice-focus-context/v1 snapshot.');
	if (value.contextRevision !== context.revision) throw new UpstreamContractError('Focus envelope contextRevision does not match its snapshot revision.');
	if (context.grantsAuthority !== false) throw new UpstreamContractError('Focus snapshot does not carry grantsAuthority: false.');
	if (!Array.isArray(value.diagnostics)) throw new UpstreamContractError('Focus envelope has no diagnostics list.');
	if (value.current !== null && !isRecord(value.current)) throw new UpstreamContractError('Focus envelope current is neither null nor an object.');
}

function boundedFolds(fold: FoldReadPort, diagnostics: RelayDiagnostic[]): RelayOrientation['folds'] {
	if (!fold.listFolds) return null;
	let raw: unknown;
	try {
		raw = fold.listFolds();
	} catch {
		diagnostics.push(relayDiagnostic('relay.folds.unavailable', 'warning', 'Lattice could not list Folds for this read.'));
		return null;
	}
	if (!Array.isArray(raw)) {
		diagnostics.push(relayDiagnostic('relay.folds.malformed', 'warning', 'Lattice listFolds did not return a list; the selectable Folds were omitted.'));
		return null;
	}
	const items: Array<{ foldId: string; label: string | null; status: string | null }> = [];
	let eligible = 0;
	for (const entry of raw) {
		if (!isRecord(entry) || typeof entry.foldId !== 'string' || entry.status === 'retired') continue;
		eligible += 1;
		if (items.length < LIMITS.folds) items.push({ foldId: clip(entry.foldId, 200) as string, label: clip(entry.label), status: clip(entry.status, 40) });
	}
	items.sort((a, b) => ((a.label ?? a.foldId) < (b.label ?? b.foldId) ? -1 : 1));
	return { truncated: eligible > items.length, items };
}

export class LatticeTools {
	constructor(private readonly host: () => PluginHostLike, private readonly now: () => Date = () => new Date()) {}

	isLatticeTool(name: string): boolean {
		return (LATTICE_TOOL_NAMES as readonly string[]).includes(name);
	}

	async execute(name: string, params: Record<string, unknown>): Promise<RelayOrientation | RelayFoldDescriptionEnvelope> {
		switch (name) {
			case 'lattice_orient':
				return this.orient(params as OrientParams);
			case 'lattice_fold_describe':
				return this.describe(params as unknown as DescribeParams);
			default:
				throw new Error(`Unknown Lattice tool: ${name}`);
		}
	}

	async orient(params: OrientParams = {}): Promise<RelayOrientation> {
		const discovery = discoverLattice(this.host(), { focus: true });
		const base = {
			spec: RELAY_ORIENTATION_SPEC,
			grantsAuthority: false as const,
			generatedAt: this.now().toISOString(),
			availability: availabilityOf(discovery),
		};
		if (discovery.state !== 'available' || !discovery.focus) {
			const unavailable = discovery.state === 'unavailable';
			return {
				...base,
				outcome: unavailable ? 'lattice-unavailable' : 'lattice-incompatible',
				errorClass: unavailable ? 'availability' : 'compatibility',
				source: sourceFrom(discovery.versions),
				context: null,
				currentFold: null,
				folds: null,
				diagnostics: discovery.state === 'available' ? [] : discovery.diagnostics,
			};
		}

		const facets = facetsFor(params);
		const request: { expectedContextRevision?: number; foldFacets: string[] } = { foldFacets: facets };
		if (params.expectedContextRevision !== undefined) request.expectedContextRevision = params.expectedContextRevision;

		let envelope: unknown;
		try {
			envelope = await discovery.focus.inspectContext(request);
		} catch (error) {
			return {
				...base,
				outcome: 'upstream-failed',
				errorClass: 'contract',
				source: sourceFrom(discovery.versions),
				context: null,
				currentFold: null,
				folds: null,
				diagnostics: [relayDiagnostic('relay.lattice.focus.threw', 'error', `Focus inspectContext threw, which its contract forbids: ${clip(error instanceof Error ? error.message : String(error), 300)}`)],
			};
		}

		try {
			assertFocusEnvelope(envelope);
			const context = envelope.context;
			const diagnostics: RelayDiagnostic[] = [
				...projectDiagnostics(context.diagnostics, 'lattice.focus'),
				...projectDiagnostics(envelope.diagnostics, 'lattice.focus'),
			];
			let currentFold: RelayFoldDescription | null = null;
			const current = envelope.current as Record<string, unknown> | null;
			if (current && current.fold !== undefined && current.fold !== null) {
				assertFoldEnvelope(current.fold);
				const projected = projectFoldEnvelope(current.fold, facets);
				currentFold = projected.fold;
				diagnostics.push(...projected.diagnostics);
				// The Focus entry carries the label even when the preamble facet is degraded.
				const entry = focusEntry(current.entry);
				if (entry && currentFold.label === null) currentFold.label = entry.label;
			}
			const folds = boundedFolds(discovery.fold, diagnostics);
			return {
				...base,
				outcome: envelope.outcome,
				errorClass: envelope.outcome === 'inspected' ? 'none' : 'domain',
				source: sourceFrom(discovery.versions, envelope),
				context: {
					revision: context.revision as number,
					current: focusEntry(context.current),
					previous: focusEntry(context.previous),
					candidate: focusEntry(context.candidate),
				},
				currentFold,
				folds,
				diagnostics: boundDiagnostics(diagnostics),
			};
		} catch (error) {
			if (!(error instanceof UpstreamContractError)) throw error;
			return {
				...base,
				outcome: 'upstream-invalid',
				errorClass: 'contract',
				source: sourceFrom(discovery.versions, isRecord(envelope) ? envelope : undefined),
				context: null,
				currentFold: null,
				folds: null,
				diagnostics: [relayDiagnostic('relay.lattice.contract.malformed', 'error', error.message)],
			};
		}
	}

	async describe(params: DescribeParams): Promise<RelayFoldDescriptionEnvelope> {
		const discovery = discoverLattice(this.host(), { focus: false });
		const base = {
			spec: RELAY_FOLD_DESCRIPTION_SPEC,
			grantsAuthority: false as const,
			generatedAt: this.now().toISOString(),
			availability: availabilityOf(discovery),
		};
		if (discovery.state !== 'available') {
			const unavailable = discovery.state === 'unavailable';
			return {
				...base,
				outcome: unavailable ? 'lattice-unavailable' : 'lattice-incompatible',
				errorClass: unavailable ? 'availability' : 'compatibility',
				source: sourceFrom(discovery.versions),
				fold: null,
				diagnostics: discovery.diagnostics,
			};
		}

		const facets = facetsFor(params);
		let envelope: unknown;
		try {
			envelope = await discovery.fold.inspectFold({ foldId: params.foldId, facets });
		} catch (error) {
			return {
				...base,
				outcome: 'upstream-failed',
				errorClass: 'contract',
				source: sourceFrom(discovery.versions),
				fold: null,
				diagnostics: [relayDiagnostic('relay.lattice.fold.threw', 'error', `Fold inspectFold threw, which its contract forbids: ${clip(error instanceof Error ? error.message : String(error), 300)}`)],
			};
		}

		try {
			assertFoldEnvelope(envelope);
			if (envelope.foldId !== params.foldId) throw new UpstreamContractError('Fold inspection answered for a different Fold than the one requested.');
			const projected = projectFoldEnvelope(envelope, facets);
			const found = projected.fold.found;
			return {
				...base,
				outcome: found ? 'described' : 'fold-not-found',
				errorClass: found ? 'none' : 'domain',
				source: sourceFrom(discovery.versions, envelope),
				fold: found ? projected.fold : null,
				diagnostics: boundDiagnostics(found ? projected.diagnostics : [...projected.diagnostics, relayDiagnostic('relay.fold.not-found', 'error', 'Lattice has no Fold with that id. Use lattice_orient to list selectable Folds.')]),
			};
		} catch (error) {
			if (!(error instanceof UpstreamContractError)) throw error;
			return {
				...base,
				outcome: 'upstream-invalid',
				errorClass: 'contract',
				source: sourceFrom(discovery.versions, isRecord(envelope) ? envelope : undefined),
				fold: null,
				diagnostics: [relayDiagnostic('relay.lattice.contract.malformed', 'error', error.message)],
			};
		}
	}
}
