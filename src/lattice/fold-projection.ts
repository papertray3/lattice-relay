import {
	FACET_MANIFEST,
	FACET_PREAMBLE,
	FACET_TOPOLOGY,
	FOLD_CONTEXT_ENVELOPE_SPEC,
	FOLD_MANIFEST_INVENTORY_SPEC,
	FOLD_PREAMBLE_SPEC,
	FOLD_TOPOLOGY_SPEC,
	LIMITS,
} from './contract';
import {
	clip,
	isRecord,
	num,
	numOrString,
	projectDiagnostics,
	relayDiagnostic,
	UpstreamContractError,
	type RelayDiagnostic,
} from './envelope';

/**
 * Projects one `lattice-fold-context-envelope/v1` (the answer to
 * `api.fold.inspectFold`, also carried inside the Focus context envelope)
 * into Relay's bounded Fold description.
 *
 * Only facets Lattice actually served contribute data. Nothing here reads
 * the vault, follows links, or looks at folder nesting: members, folders and
 * topology are exactly what Lattice's facets declare, or explicitly absent.
 */

export const FACET_STATUSES = new Set(['ready', 'unavailable', 'failed']);

export interface RelayFacetStatus {
	facetId: string;
	status: 'ready' | 'unavailable' | 'failed' | 'malformed';
	provider: string | null;
}

export interface RelayRememberedValue {
	ref: string;
	type: string | null;
	source: { kind: string | null; ref: string | null } | null;
	sensitive: boolean;
	availability: string | null;
	label?: string;
	writable?: true;
	value?: unknown;
	valueOmitted?: 'too-large';
}

export interface RelayMember {
	memberId: string | null;
	role: string;
	state: string | null;
	path: string;
	title: string | null;
	creation: string | null;
}

export interface RelayFoldRef {
	foldId: string;
	label: string | null;
}

export type RelayTopology =
	| {
			status: 'declared';
			policy: 'declared-only';
			facetId: string;
			provider: string | null;
			parent: RelayFoldRef | null;
			ancestors: RelayFoldRef[];
			siblings: RelayFoldRef[];
			children: RelayFoldRef[];
			descendants: RelayFoldRef[];
			truncated: boolean;
	  }
	| {
			status: 'unavailable';
			policy: 'declared-only';
			facetId: string;
			/** Why Relay has no declared topology to report. Relay never fills the gap by inference. */
			reason: 'lattice-contract-missing' | 'facet-unavailable' | 'facet-failed' | 'unsupported-shape' | 'not-requested';
			message: string;
	  };

export interface RelayMembers {
	status: 'ready' | 'unavailable';
	/** Lattice's own completeness for the manifest read (`partial` while indexing or when anchors were withheld). */
	completeness: string | null;
	total: number;
	truncated: boolean;
	items: RelayMember[];
}

export interface RelayFolders {
	status: 'ready' | 'unavailable';
	truncated: boolean;
	items: Array<{ path: string; reach: string | null }>;
}

export interface RelayFoldDescription {
	foldId: string;
	found: boolean;
	label: string | null;
	status: string | null;
	retiredAt: string | null;
	readiness: string | null;
	revisions: {
		manifest: number | null;
		effectiveState: number | null;
		authority: number | null;
		workstream: string | number | null;
		automationSettings: number | null;
	};
	blueprint: { blueprintId: string | null; version: string | null } | null;
	authority: { review: string | null; acceptedAt: string | null; resolution: string | null } | null;
	automation: { consent: string | null; emergencyStop: string | null } | null;
	counts: Record<string, unknown> | null;
	rememberedValues: { truncated: boolean; items: RelayRememberedValue[] } | null;
	members: RelayMembers;
	folders: RelayFolders;
	topology: RelayTopology;
	facets: RelayFacetStatus[];
}

const SENSITIVE_NAME = /(secret|token|password|passwd|api[-_]?key|credential|private[-_]?key)/i;

interface FacetResult {
	facetId: string;
	status: string;
	provider: string | null;
	payload: unknown;
	diagnostics: unknown;
}

/** Validates the envelope frame; throws UpstreamContractError when it is not the published shape. */
export function assertFoldEnvelope(value: unknown): asserts value is Record<string, unknown> & { facets: unknown[] } {
	if (!isRecord(value)) throw new UpstreamContractError('Fold inspection did not return an object.');
	if (value.spec !== FOLD_CONTEXT_ENVELOPE_SPEC) throw new UpstreamContractError(`Fold inspection returned spec ${JSON.stringify(clip(value.spec, 80))}, expected ${FOLD_CONTEXT_ENVELOPE_SPEC}.`);
	if (typeof value.foldId !== 'string' || typeof value.found !== 'boolean') throw new UpstreamContractError('Fold inspection envelope is missing foldId or found.');
	if (!Array.isArray(value.facets) || !Array.isArray(value.diagnostics)) throw new UpstreamContractError('Fold inspection envelope is missing facets or diagnostics.');
	for (const facet of value.facets) {
		if (!isRecord(facet) || typeof facet.facetId !== 'string' || !FACET_STATUSES.has(facet.status as string)) {
			throw new UpstreamContractError('Fold inspection envelope holds a facet result without a facetId or a known status.');
		}
	}
}

function facetResults(envelope: { facets: unknown[] }): Map<string, FacetResult> {
	const map = new Map<string, FacetResult>();
	for (const raw of envelope.facets) {
		const facet = raw as Record<string, unknown>;
		const provider = isRecord(facet.provider) ? clip(`${facet.provider.providerId}@${facet.provider.version}`, 160) : null;
		map.set(facet.facetId as string, { facetId: facet.facetId as string, status: facet.status as string, provider, payload: facet.payload, diagnostics: facet.diagnostics });
	}
	return map;
}

function projectRememberedValue(raw: unknown, diagnostics: RelayDiagnostic[]): RelayRememberedValue | null {
	if (!isRecord(raw)) return null;
	const ref = clip(raw.ref, 200);
	if (!ref) return null;
	const type = clip(raw.type, 80);
	const sensitiveUpstream = raw.sensitive !== false;
	const looksSensitive = SENSITIVE_NAME.test(ref) || (type !== null && SENSITIVE_NAME.test(type));
	const entry: RelayRememberedValue = {
		ref,
		type,
		source: isRecord(raw.source) ? { kind: clip(raw.source.kind, 40), ref: clip(raw.source.ref, 200) } : null,
		sensitive: sensitiveUpstream || looksSensitive,
		availability: clip(raw.availability, 40),
		...(typeof raw.label === 'string' ? { label: clip(raw.label) as string } : {}),
		...(raw.writable === true ? { writable: true as const } : {}),
	};
	if (!sensitiveUpstream && looksSensitive && 'value' in raw) {
		// Defence in depth: Lattice redacts by type and ref; Relay withholds anything that still looks secret.
		diagnostics.push(relayDiagnostic('relay.redaction.applied', 'warning', `Relay withheld the value of ${ref} because its name or type looks sensitive.`, FACET_PREAMBLE));
		return entry;
	}
	if (!entry.sensitive && raw.availability === 'present' && 'value' in raw) {
		let serialized: string | undefined;
		try {
			serialized = JSON.stringify(raw.value);
		} catch {
			serialized = undefined;
		}
		if (serialized === undefined) return entry;
		if (serialized.length > LIMITS.valueJson) entry.valueOmitted = 'too-large';
		else entry.value = JSON.parse(serialized);
	}
	return entry;
}

function projectPreamble(payload: unknown, out: RelayFoldDescription, diagnostics: RelayDiagnostic[]): boolean {
	if (!isRecord(payload) || payload.spec !== FOLD_PREAMBLE_SPEC) return false;
	out.label = clip(payload.label) ?? out.label;
	out.status = clip(payload.status, 40) ?? out.status;
	out.retiredAt = clip(payload.retiredAt, 64);
	out.readiness = clip(payload.readiness, 40);
	if (isRecord(payload.revisions)) {
		out.revisions = {
			manifest: num(payload.revisions.manifest) ?? out.revisions.manifest,
			effectiveState: num(payload.revisions.effectiveState) ?? out.revisions.effectiveState,
			authority: num(payload.revisions.authority),
			workstream: numOrString(payload.revisions.workstream),
			automationSettings: num(payload.revisions.automationSettings),
		};
	}
	out.blueprint = isRecord(payload.blueprint) ? { blueprintId: clip(payload.blueprint.blueprintId, 200), version: clip(payload.blueprint.version, 40) } : null;
	out.authority = isRecord(payload.authority)
		? { review: clip(payload.authority.review, 40), acceptedAt: clip(payload.authority.acceptedAt, 64), resolution: clip(payload.authority.resolution, 40) }
		: null;
	out.automation = isRecord(payload.automation) ? { consent: clip(payload.automation.consent, 40), emergencyStop: clip(payload.automation.emergencyStop, 40) } : null;
	if (isRecord(payload.counts)) {
		const counts: Record<string, unknown> = {};
		for (const [key, value] of Object.entries(payload.counts)) {
			if (typeof value === 'number') counts[key] = value;
			else if (isRecord(value)) counts[key] = Object.fromEntries(Object.entries(value).filter(([, v]) => typeof v === 'number'));
		}
		out.counts = counts;
	}
	const values = Array.isArray(payload.rememberedValues) ? payload.rememberedValues : [];
	const items: RelayRememberedValue[] = [];
	for (const raw of values.slice(0, LIMITS.rememberedValues)) {
		const entry = projectRememberedValue(raw, diagnostics);
		if (entry) items.push(entry);
	}
	out.rememberedValues = { truncated: values.length > LIMITS.rememberedValues, items };
	return true;
}

function projectManifest(payload: unknown, out: RelayFoldDescription): boolean {
	if (!isRecord(payload) || payload.spec !== FOLD_MANIFEST_INVENTORY_SPEC || !Array.isArray(payload.members)) return false;
	const members: RelayMember[] = [];
	for (const raw of payload.members) {
		if (members.length >= LIMITS.members) break;
		if (!isRecord(raw)) continue;
		const role = clip(raw.role, 120);
		const path = clip(raw.path, 1000);
		if (!role || !path) continue;
		members.push({ memberId: clip(raw.memberId, 120), role, state: clip(raw.state, 40), path, title: clip(raw.title), creation: clip(raw.creation, 40) });
	}
	members.sort((a, b) => (a.role === b.role ? (a.path < b.path ? -1 : a.path > b.path ? 1 : 0) : a.role < b.role ? -1 : 1));
	out.members = {
		status: 'ready',
		completeness: clip(payload.completeness, 40),
		total: payload.members.length,
		truncated: payload.members.length > LIMITS.members,
		items: members,
	};

	const scopes = isRecord(payload.coverage) && Array.isArray(payload.coverage.scopes) ? payload.coverage.scopes : [];
	const seen = new Set<string>();
	const folders: Array<{ path: string; reach: string | null }> = [];
	let foldersTruncated = false;
	for (const scope of scopes) {
		if (!isRecord(scope)) continue;
		const path = clip(scope.path, 1000);
		if (path === null || seen.has(path)) continue;
		if (folders.length >= LIMITS.folders) {
			foldersTruncated = true;
			break;
		}
		seen.add(path);
		folders.push({ path, reach: clip(scope.reach, 40) });
	}
	out.folders = { status: 'ready', truncated: foldersTruncated, items: folders };
	return true;
}

function foldRefs(value: unknown, budget: { remaining: number; truncated: boolean }): RelayFoldRef[] | null {
	if (!Array.isArray(value)) return null;
	const refs: RelayFoldRef[] = [];
	for (const raw of value) {
		if (!isRecord(raw) || typeof raw.foldId !== 'string') return null;
		if (budget.remaining <= 0) {
			budget.truncated = true;
			break;
		}
		budget.remaining -= 1;
		refs.push({ foldId: clip(raw.foldId, 200) as string, label: clip(raw.label) });
	}
	return refs;
}

/**
 * Topology is reported only from a Lattice-declared facet. When the facet is
 * absent, unavailable, failed or not in the shape Relay pins, the answer is
 * an explicit `unavailable` capability - never relationships guessed from
 * paths, folder containment, filenames, links or activation anchors.
 */
export function projectTopology(facet: FacetResult | undefined, requested: boolean): RelayTopology {
	const unavailable = (reason: Extract<RelayTopology, { status: 'unavailable' }>['reason'], message: string): RelayTopology => ({ status: 'unavailable', policy: 'declared-only', facetId: FACET_TOPOLOGY, reason, message });
	if (!requested) return unavailable('not-requested', 'Topology was not requested for this read.');
	if (!facet) return unavailable('lattice-contract-missing', 'Lattice did not answer the topology facet; no declared Fold topology is available.');
	if (facet.status === 'unavailable') {
		const unsupported = Array.isArray(facet.diagnostics) && facet.diagnostics.some((d) => isRecord(d) && d.code === 'inspection.facet.unsupported');
		return unsupported
			? unavailable('lattice-contract-missing', 'This Lattice publishes no declared Fold topology contract yet, so parent, ancestor, sibling, child and descendant Folds are unknown. Relay does not infer them.')
			: unavailable('facet-unavailable', 'Lattice reported the topology facet as unavailable for this Fold.');
	}
	if (facet.status === 'failed') return unavailable('facet-failed', 'Lattice failed to compute the topology facet for this Fold.');
	const payload = facet.payload;
	if (!isRecord(payload) || payload.spec !== FOLD_TOPOLOGY_SPEC) return unavailable('unsupported-shape', `Lattice served a topology facet Relay does not understand (expected ${FOLD_TOPOLOGY_SPEC}).`);
	const budget = { remaining: LIMITS.topologyRelations, truncated: false };
	const parentRaw = payload.parent;
	let parent: RelayFoldRef | null = null;
	if (parentRaw !== null) {
		if (!isRecord(parentRaw) || typeof parentRaw.foldId !== 'string') return unavailable('unsupported-shape', 'Lattice topology facet has a malformed parent.');
		parent = { foldId: clip(parentRaw.foldId, 200) as string, label: clip(parentRaw.label) };
	}
	const ancestors = foldRefs(payload.ancestors, budget);
	const siblings = foldRefs(payload.siblings, budget);
	const children = foldRefs(payload.children, budget);
	const descendants = foldRefs(payload.descendants, budget);
	if (!ancestors || !siblings || !children || !descendants) return unavailable('unsupported-shape', 'Lattice topology facet is missing or has malformed relationship lists.');
	return { status: 'declared', policy: 'declared-only', facetId: FACET_TOPOLOGY, provider: facet.provider, parent, ancestors, siblings, children, descendants, truncated: budget.truncated };
}

/**
 * Builds the bounded Fold description from a validated envelope. Facet-level
 * problems (an unavailable or malformed facet) degrade only that part and
 * add diagnostics; they never fail the whole description.
 */
export function projectFoldEnvelope(envelope: Record<string, unknown> & { facets: unknown[] }, requestedFacets: readonly string[]): { fold: RelayFoldDescription; diagnostics: RelayDiagnostic[] } {
	const diagnostics: RelayDiagnostic[] = projectDiagnostics(envelope.diagnostics, 'lattice.fold');
	const results = facetResults(envelope);
	const fold: RelayFoldDescription = {
		foldId: clip(envelope.foldId, 200) as string,
		found: envelope.found as boolean,
		label: null,
		status: null,
		retiredAt: null,
		readiness: null,
		revisions: {
			manifest: num(envelope.manifestRevision),
			effectiveState: num(envelope.effectiveStateRevision),
			authority: num(envelope.authorityRevision),
			workstream: numOrString(envelope.workstreamRevision),
			automationSettings: null,
		},
		blueprint: null,
		authority: null,
		automation: null,
		counts: null,
		rememberedValues: null,
		members: { status: 'unavailable', completeness: null, total: 0, truncated: false, items: [] },
		folders: { status: 'unavailable', truncated: false, items: [] },
		topology: projectTopology(results.get(FACET_TOPOLOGY), requestedFacets.includes(FACET_TOPOLOGY)),
		facets: [],
	};

	for (const facetId of requestedFacets) {
		const result = results.get(facetId);
		if (!result) {
			fold.facets.push({ facetId, status: 'unavailable', provider: null });
			if (fold.found) diagnostics.push(relayDiagnostic('relay.facet.missing', 'warning', `Lattice did not answer requested facet ${facetId}.`, facetId));
			continue;
		}
		if (facetId === FACET_TOPOLOGY && fold.topology.status === 'unavailable' && fold.topology.reason === 'lattice-contract-missing') {
			// Lattice flags any facet it has no provider for as an error. For topology that absence is
			// the expected state of this release and is already reported as an explicit capability.
			diagnostics.push(relayDiagnostic('relay.topology.unavailable', 'info', fold.topology.message, facetId));
		} else {
			diagnostics.push(...projectDiagnostics(result.diagnostics, 'lattice.fold', facetId));
		}
		let status: RelayFacetStatus['status'] = result.status as RelayFacetStatus['status'];
		if (result.status === 'ready') {
			const understood =
				facetId === FACET_PREAMBLE ? projectPreamble(result.payload, fold, diagnostics)
				: facetId === FACET_MANIFEST ? projectManifest(result.payload, fold)
				: facetId === FACET_TOPOLOGY ? fold.topology.status === 'declared'
				: true;
			if (!understood) {
				status = 'malformed';
				diagnostics.push(relayDiagnostic('relay.facet.malformed', 'warning', `Lattice facet ${facetId} did not match the shape Relay pins; it was ignored.`, facetId));
			}
		}
		fold.facets.push({ facetId, status, provider: result.provider });
	}
	return { fold, diagnostics };
}
