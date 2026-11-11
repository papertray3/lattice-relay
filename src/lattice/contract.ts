/**
 * Relay's pinned view of the Lattice public contracts it consumes.
 *
 * Every constant here mirrors a published Lattice artifact (see
 * fixtures/PROVENANCE.json). Relay never imports Lattice code: these values
 * are copied deliberately so a change on the Lattice side shows up as a
 * failing contract test (contract.test.ts) instead of a silent semantic drift.
 */

/** Plugin id Lattice registers under `app.plugins.plugins`. */
export const LATTICE_PLUGIN_ID = 'lattice';

/** `api.apiVersion` - the top-level namespace contract (ADR-0021 runtime). */
export const SUPPORTED_LATTICE_API_MAJOR = 2;

/** `api.focus.apiVersion` - `inspectContext` arrived in 1.1. */
export const SUPPORTED_FOCUS_API = { major: 1, minMinor: 1 } as const;

/** `api.fold.apiVersion` - `inspectFold` is part of 1.0. */
export const SUPPORTED_FOLD_API = { major: 1, minMinor: 0 } as const;

export const FOCUS_CONTEXT_ENVELOPE_SPEC = 'lattice-focus-context-envelope/v1';
export const FOCUS_CONTEXT_SPEC = 'lattice-focus-context/v1';
export const FOLD_CONTEXT_ENVELOPE_SPEC = 'lattice-fold-context-envelope/v1';
export const FOLD_PREAMBLE_SPEC = 'lattice-fold-preamble/v1';
export const FOLD_MANIFEST_INVENTORY_SPEC = 'lattice-fold-manifest-inventory/v2';

export const FACET_PREAMBLE = 'lattice.fold.preamble@1.0.0';
export const FACET_MANIFEST = 'lattice.fold.manifest@2.0.0';

/**
 * The facet id Relay requests for declared Fold topology. Lattice does not
 * serve it yet (it answers `unavailable` / `inspection.facet.unsupported`),
 * so Relay reports topology as an explicit unavailable capability. The id is
 * Relay's proposal to the companion Lattice contract plan; when Lattice
 * publishes the facet under this id, Relay consumes it without a tool
 * redesign. Relay never derives topology from paths, links or folders.
 */
export const FACET_TOPOLOGY = 'lattice.fold.topology@1.0.0';
export const FOLD_TOPOLOGY_SPEC = 'lattice-fold-topology/v1';

export const FOCUS_OUTCOMES = ['inspected', 'no-current-fold', 'stale', 'invalid-request', 'fold-unavailable', 'fold-not-found'] as const;
export type FocusOutcome = typeof FOCUS_OUTCOMES[number];

export const MAX_FOLD_FACETS = 16;

/** Spec ids of the envelopes Relay itself emits. */
export const RELAY_ORIENTATION_SPEC = 'lattice-relay-orientation/v1' as const;
export const RELAY_FOLD_DESCRIPTION_SPEC = 'lattice-relay-fold-description/v1' as const;

/** Bounds Relay applies to everything it projects. */
export const LIMITS = {
	members: 100,
	folders: 50,
	folds: 100,
	rememberedValues: 50,
	diagnostics: 50,
	facets: MAX_FOLD_FACETS,
	topologyRelations: 100,
	/** Characters per projected string. */
	string: 500,
	/** Serialized characters for one remembered value. */
	valueJson: 2000,
} as const;
