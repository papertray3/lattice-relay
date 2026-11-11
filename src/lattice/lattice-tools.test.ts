import { describe, expect, it } from 'vitest';
import examples from './fixtures/focus/context-envelope.v1.examples.json';
import { FACET_MANIFEST, FACET_PREAMBLE, FACET_TOPOLOGY, LIMITS } from './contract';
import { LatticeTools } from './lattice-tools';
import {
	ALLOWED_LATTICE_READS,
	clone,
	DECLARED_TOPOLOGY,
	fakeLattice,
	foldEnvelope,
	inspectedEnvelope,
	notFoundEnvelope,
	type FakeLatticeOptions,
} from './test-support';
import type { PluginHostLike } from './discovery';

const NOW = new Date('2026-11-11T15:00:00.000Z');
const ALL_FACETS = [FACET_MANIFEST, FACET_PREAMBLE, FACET_TOPOLOGY].sort();

function tools(options: FakeLatticeOptions = {}) {
	const fake = fakeLattice(options);
	return { ...fake, relay: new LatticeTools(() => fake.host, () => NOW) };
}

function relayFor(host: PluginHostLike) {
	return new LatticeTools(() => host, () => NOW);
}

describe('lattice_orient', () => {
	it('projects the current Fold, Focus entries, members, folders and selectable Folds', async () => {
		const { relay, focusTarget } = tools();
		const result = await relay.orient();

		expect(focusTarget.inspectContext).toHaveBeenCalledWith({ foldFacets: ALL_FACETS });
		expect(result).toMatchObject({
			spec: 'lattice-relay-orientation/v1',
			outcome: 'inspected',
			errorClass: 'none',
			grantsAuthority: false,
			generatedAt: NOW.toISOString(),
			availability: { state: 'available' },
			source: {
				provider: 'lattice',
				pluginVersion: '2.0.0-beta.70',
				latticeApiVersion: '2.0',
				focusApiVersion: '1.1',
				foldApiVersion: '1.0',
				upstreamSpec: 'lattice-focus-context-envelope/v1',
			},
			context: {
				revision: 1,
				current: { foldId: 'fold-example-0001', label: 'Test Project', foldRevision: 1, evidence: { source: 'selection' } },
				previous: null,
				candidate: null,
			},
		});
		const fold = result.currentFold!;
		expect(fold).toMatchObject({ foldId: 'fold-example-0001', found: true, label: 'Test Project', status: 'active', readiness: 'awaiting-authority' });
		expect(fold.revisions).toEqual({ manifest: 1, effectiveState: 1, authority: 1, workstream: 'ws-p07', automationSettings: 0 });
		expect(fold.members).toEqual({
			status: 'ready',
			completeness: 'complete',
			total: 2,
			truncated: false,
			items: [
				{ memberId: 'member-charter', role: 'charter', state: 'missing', path: 'Projects/test/00_Admin/charter.md', title: 'Charter', creation: 'initial' },
				{ memberId: 'member-hub', role: 'hub', state: 'present', path: 'Projects/test/test.md', title: 'Test Project', creation: 'initial' },
			],
		});
		expect(fold.folders).toEqual({ status: 'ready', truncated: false, items: [{ path: 'Projects/test', reach: 'descendants' }] });
		expect(result.folds).toEqual({
			truncated: false,
			items: [
				{ foldId: 'fold-alpha', label: 'Alpha', status: 'active' },
				{ foldId: 'fold-example-0001', label: 'Test Project', status: 'active' },
			],
		});
	});

	it('reports topology as an explicit unavailable capability, with an info diagnostic instead of the upstream error', async () => {
		const { relay } = tools();
		const result = await relay.orient();
		expect(result.currentFold!.topology).toMatchObject({ status: 'unavailable', policy: 'declared-only', facetId: FACET_TOPOLOGY, reason: 'lattice-contract-missing' });
		expect(result.diagnostics.filter((d) => d.facetId === FACET_TOPOLOGY)).toEqual([
			expect.objectContaining({ code: 'relay.topology.unavailable', severity: 'info', origin: 'relay' }),
		]);
		expect(result.diagnostics.some((d) => d.code === 'inspection.facet.unsupported')).toBe(false);
	});

	it('passes declared topology through when Lattice serves the facet', async () => {
		const { relay } = tools({
			inspectContext: (request) => {
				const envelope = inspectedEnvelope(request.foldFacets);
				envelope.current.fold.facets = envelope.current.fold.facets.map((f: any) => (f.facetId === FACET_TOPOLOGY ? clone(DECLARED_TOPOLOGY) : f));
				return envelope;
			},
		});
		const topology = (await relay.orient()).currentFold!.topology;
		expect(topology).toEqual({
			status: 'declared',
			policy: 'declared-only',
			facetId: FACET_TOPOLOGY,
			provider: 'lattice-fold.topology@1.0.0',
			parent: { foldId: 'fold-office', label: 'Office' },
			ancestors: [{ foldId: 'fold-office', label: 'Office' }],
			siblings: [{ foldId: 'fold-next-door', label: 'Next door' }],
			children: [{ foldId: 'fold-inner', label: 'Inner chamber' }],
			descendants: [{ foldId: 'fold-inner', label: 'Inner chamber' }],
			truncated: false,
		});
	});

	it('honours includeMembers/includeTopology opt-outs by not requesting those facets', async () => {
		const { relay, focusTarget } = tools();
		const result = await relay.orient({ includeMembers: false, includeTopology: false });
		expect(focusTarget.inspectContext).toHaveBeenCalledWith({ foldFacets: [FACET_PREAMBLE] });
		expect(result.currentFold!.members.status).toBe('unavailable');
		expect(result.currentFold!.topology).toMatchObject({ status: 'unavailable', reason: 'not-requested' });
	});

	it('returns context without a Fold when no working Fold is chosen', async () => {
		const { relay } = tools({ inspectContext: () => clone(examples.noCurrentFold) });
		const result = await relay.orient();
		expect(result).toMatchObject({ outcome: 'no-current-fold', errorClass: 'domain', currentFold: null, context: { revision: 0, current: null } });
		expect(result.diagnostics).toEqual([expect.objectContaining({ code: 'focus.current.none', severity: 'info', origin: 'lattice.focus' })]);
		expect(result.folds!.items.length).toBe(2);
	});

	it('keeps previous and candidate entries as identity and evidence only', async () => {
		const { relay } = tools({
			inspectContext: () => {
				const envelope = clone(examples.noCurrentFold) as any;
				envelope.context.previous = { fold: { foldId: 'fold-prev', label: 'Prev', foldRevision: 3 }, evidence: { source: 'selection' }, at: '2026-11-11T10:00:00.000Z' };
				envelope.context.candidate = { fold: { foldId: 'fold-cand', label: 'Cand', foldRevision: 2, members: ['leak'] }, evidence: { source: 'navigation', path: 'Projects/cand/note.md' }, at: '2026-11-11T11:00:00.000Z' };
				return envelope;
			},
		});
		const { context } = await relay.orient();
		expect(context!.previous).toEqual({ foldId: 'fold-prev', label: 'Prev', foldRevision: 3, evidence: { source: 'selection' }, at: '2026-11-11T10:00:00.000Z' });
		expect(context!.candidate).toEqual({ foldId: 'fold-cand', label: 'Cand', foldRevision: 2, evidence: { source: 'navigation', path: 'Projects/cand/note.md' }, at: '2026-11-11T11:00:00.000Z' });
	});

	it('forwards expectedContextRevision and reports a stale context without inspecting a Fold', async () => {
		const { relay, focusTarget } = tools({ inspectContext: () => clone(examples.stale) });
		const result = await relay.orient({ expectedContextRevision: 0 });
		expect(focusTarget.inspectContext).toHaveBeenCalledWith({ expectedContextRevision: 0, foldFacets: ALL_FACETS });
		expect(result).toMatchObject({ outcome: 'stale', errorClass: 'domain', currentFold: null, context: { revision: 1 } });
		expect(result.diagnostics[0]).toMatchObject({ code: 'focus.revision.stale', severity: 'error', origin: 'lattice.focus' });
	});

	it('passes ambiguity and revision-change diagnostics through without choosing for the owner', async () => {
		const { relay } = tools({
			inspectContext: (request) => {
				const envelope = inspectedEnvelope(request.foldFacets);
				envelope.context.diagnostics = [{ code: 'focus.membership.ambiguous', severity: 'warning', message: 'Two Folds claim this note.', foldIds: ['a', 'b'] }];
				envelope.diagnostics = [{ code: 'focus.fold.revision-changed', severity: 'info', message: 'Fold moved.' }];
				return envelope;
			},
		});
		const result = await relay.orient();
		expect(result.outcome).toBe('inspected');
		expect(result.diagnostics.map((d) => d.code)).toEqual(expect.arrayContaining(['focus.membership.ambiguous', 'focus.fold.revision-changed']));
		expect(result.context!.current!.foldId).toBe('fold-example-0001');
	});

	it.each(['fold-unavailable', 'fold-not-found', 'invalid-request'] as const)('reports the %s Focus outcome as a domain result', async (outcome) => {
		const { relay } = tools({
			inspectContext: () => {
				const envelope = clone(examples.stale) as any;
				envelope.outcome = outcome;
				envelope.diagnostics = [{ code: `focus.x.${outcome}`, severity: 'error', message: outcome }];
				return envelope;
			},
		});
		expect(await relay.orient()).toMatchObject({ outcome, errorClass: 'domain', currentFold: null });
	});

	it('degrades a malformed facet without failing the orientation', async () => {
		const { relay } = tools({
			inspectContext: (request) => {
				const envelope = inspectedEnvelope(request.foldFacets);
				const manifest = envelope.current.fold.facets.find((f: any) => f.facetId === FACET_MANIFEST);
				manifest.payload = { spec: 'something-else/v9' };
				return envelope;
			},
		});
		const result = await relay.orient();
		expect(result.outcome).toBe('inspected');
		expect(result.currentFold!.members.status).toBe('unavailable');
		expect(result.currentFold!.facets.find((f) => f.facetId === FACET_MANIFEST)!.status).toBe('malformed');
		expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: 'relay.facet.malformed', facetId: FACET_MANIFEST }));
	});

	it.each([
		['a non-object', () => 'nope'],
		['the wrong spec', () => ({ ...clone(examples.inspected), spec: 'lattice-focus-context-envelope/v2' })],
		['an unknown outcome', () => ({ ...clone(examples.inspected), outcome: 'teleported' })],
		['grantsAuthority not false', () => ({ ...clone(examples.inspected), grantsAuthority: true })],
		['a snapshot granting authority', () => { const e = clone(examples.inspected) as any; e.context.grantsAuthority = true; return e; }],
		['mismatched revisions', () => ({ ...clone(examples.inspected), contextRevision: 7 })],
		['a malformed Fold envelope', () => { const e = clone(examples.inspected) as any; e.current.fold.facets = [{ status: 'ready' }]; return e; }],
	])('fails closed as a contract error on %s', async (_label, answer) => {
		const { relay } = tools({ inspectContext: answer });
		const result = await relay.orient();
		expect(result).toMatchObject({ outcome: 'upstream-invalid', errorClass: 'contract', grantsAuthority: false, context: null, currentFold: null, folds: null });
		expect(result.diagnostics[0].code).toBe('relay.lattice.contract.malformed');
	});

	it('reports a thrown inspectContext as an upstream failure, not a transport error', async () => {
		const { relay } = tools({ inspectContext: () => { throw new Error('boom'); } });
		const result = await relay.orient();
		expect(result).toMatchObject({ outcome: 'upstream-failed', errorClass: 'contract' });
		expect(result.diagnostics[0].message).toContain('boom');
	});

	it('omits selectable Folds when Lattice does not expose listFolds', async () => {
		const { relay } = tools({ listFolds: null });
		expect((await relay.orient()).folds).toBeNull();
	});
});

describe('lattice_fold_describe', () => {
	it('describes an explicitly named Fold through inspectFold only', async () => {
		const { relay, foldTarget, accessed } = tools();
		const result = await relay.describe({ foldId: 'fold-alpha' });
		expect(foldTarget.inspectFold).toHaveBeenCalledWith({ foldId: 'fold-alpha', facets: ALL_FACETS });
		expect(result).toMatchObject({ spec: 'lattice-relay-fold-description/v1', outcome: 'described', errorClass: 'none', grantsAuthority: false, source: { upstreamSpec: 'lattice-fold-context-envelope/v1' } });
		expect(result.fold).toMatchObject({ foldId: 'fold-alpha', found: true, readiness: 'awaiting-authority' });
		expect(result.fold!.members.items.map((m) => m.role)).toEqual(['charter', 'hub']);
		// Fold description never reads Focus, so it cannot depend on or move the working context.
		expect(accessed.filter((a) => a.startsWith('focus.') || a === 'api.focus')).toEqual([]);
	});

	it('reports an unknown Fold as a domain result', async () => {
		const { relay } = tools({ inspectFold: (request) => notFoundEnvelope(request.foldId, request.facets) });
		const result = await relay.describe({ foldId: 'fold-nope' });
		expect(result).toMatchObject({ outcome: 'fold-not-found', errorClass: 'domain', fold: null });
		expect(result.diagnostics.map((d) => d.code)).toEqual(['inspection.fold.not-found', 'relay.fold.not-found']);
	});

	it('refuses an answer about a different Fold than requested', async () => {
		const { relay } = tools({ inspectFold: (request) => foldEnvelope(request.facets, 'fold-other') });
		expect(await relay.describe({ foldId: 'fold-alpha' })).toMatchObject({ outcome: 'upstream-invalid', errorClass: 'contract', fold: null });
	});

	it('works when Focus is unavailable, because it does not need it', async () => {
		const { relay } = tools({ focus: 'missing' });
		expect((await relay.describe({ foldId: 'fold-alpha' })).outcome).toBe('described');
	});
});

describe('Lattice availability and compatibility', () => {
	it('reports a missing plugin as not installed', async () => {
		const host: PluginHostLike = { plugins: { plugins: {}, manifests: {}, enabledPlugins: new Set() } };
		expect(await relayFor(host).orient()).toMatchObject({ outcome: 'lattice-unavailable', errorClass: 'availability', availability: { state: 'unavailable', reason: 'not-installed' }, context: null });
	});

	it('reports an installed but disabled plugin as disabled', async () => {
		const host: PluginHostLike = { plugins: { plugins: {}, manifests: { lattice: { version: '2.0.0-beta.70' } }, enabledPlugins: new Set() } };
		const result = await relayFor(host).describe({ foldId: 'x' });
		expect(result).toMatchObject({ outcome: 'lattice-unavailable', availability: { reason: 'disabled' }, source: { pluginVersion: '2.0.0-beta.70' } });
	});

	it('reports an enabled plugin that has not loaded or published its API as initializing', async () => {
		const loading: PluginHostLike = { plugins: { plugins: {}, manifests: { lattice: {} }, enabledPlugins: new Set(['lattice']) } };
		const noApi: PluginHostLike = { plugins: { plugins: { lattice: {} }, manifests: { lattice: {} }, enabledPlugins: new Set(['lattice']) } };
		for (const host of [loading, noApi]) {
			const result = await relayFor(host).orient();
			expect(result).toMatchObject({ outcome: 'lattice-unavailable', availability: { reason: 'initializing' } });
			expect(result.diagnostics[0]).toMatchObject({ code: 'relay.lattice.initializing', severity: 'warning' });
		}
	});

	it('treats a Focus module that has not started yet as an initialization race', async () => {
		const { relay } = tools({ focus: 'missing' });
		expect(await relay.orient()).toMatchObject({ outcome: 'lattice-unavailable', availability: { reason: 'initializing' } });
	});

	it('reports a Focus module that failed to start', async () => {
		const { relay } = tools({
			focus: 'missing',
			health: [{ module: 'fold', state: 'ready' }, { module: 'focus', state: 'failed', diagnostic: { code: 'lattice.focus.start-failed', message: 'Focus could not start: x' } }],
		});
		const result = await relay.orient();
		expect(result).toMatchObject({ outcome: 'lattice-unavailable', availability: { reason: 'module-failed' } });
		expect(result.diagnostics[0].code).toBe('relay.lattice.focus.failed');
	});

	it.each([
		['Lattice API 3.0', { latticeApiVersion: '3.0' }, 'relay.lattice.api.unsupported-version'],
		['Focus API 1.0 (no inspectContext)', { focusApiVersion: '1.0' }, 'relay.lattice.focus.unsupported-version'],
		['Focus API 2.0', { focusApiVersion: '2.0' }, 'relay.lattice.focus.unsupported-version'],
		['Fold API 2.0', { foldApiVersion: '2.0' }, 'relay.lattice.fold.unsupported-version'],
	])('reports %s as incompatible without calling it', async (_label, options, code) => {
		const { relay, focusTarget, foldTarget } = tools(options as FakeLatticeOptions);
		const result = await relay.orient();
		expect(result).toMatchObject({ outcome: 'lattice-incompatible', errorClass: 'compatibility', context: null });
		expect(result.diagnostics[0].code).toBe(code);
		expect(focusTarget.inspectContext).not.toHaveBeenCalled();
		expect(foldTarget.inspectFold).not.toHaveBeenCalled();
	});

	it('rediscovers Lattice on every call, so a later-loaded Lattice is picked up', async () => {
		const fake = fakeLattice();
		let host: PluginHostLike = { plugins: { plugins: {}, manifests: { lattice: {} }, enabledPlugins: new Set(['lattice']) } };
		const relay = new LatticeTools(() => host, () => NOW);
		expect((await relay.orient()).outcome).toBe('lattice-unavailable');
		host = fake.host;
		expect((await relay.orient()).outcome).toBe('inspected');
	});
});

describe('authority, redaction and bounds', () => {
	it('touches only the read-only Lattice surface and calls no effectful method', async () => {
		const { relay, accessed, effects } = tools();
		await relay.orient();
		await relay.orient({ expectedContextRevision: 1 });
		await relay.describe({ foldId: 'fold-alpha' });
		expect(accessed.filter((name) => !ALLOWED_LATTICE_READS.has(name))).toEqual([]);
		for (const [name, spy] of Object.entries(effects)) expect(spy, name).not.toHaveBeenCalled();
	});

	it('always reports grantsAuthority false, whatever the outcome', async () => {
		const cases = [tools(), tools({ inspectContext: () => clone(examples.stale) }), tools({ latticeApiVersion: '9.0' }), tools({ inspectContext: () => 'bad' })];
		for (const { relay } of cases) {
			expect((await relay.orient()).grantsAuthority).toBe(false);
			expect((await relay.describe({ foldId: 'fold-alpha' })).grantsAuthority).toBe(false);
		}
	});

	it('never exposes sensitive values, secret-looking values or private Lattice objects', async () => {
		const { relay } = tools({
			inspectContext: (request) => {
				const envelope = inspectedEnvelope(request.foldFacets);
				const preamble = envelope.current.fold.facets.find((f: any) => f.facetId === FACET_PREAMBLE);
				preamble.payload.rememberedValues.push(
					// Upstream marks sensitive but (contract break) still sends a value.
					{ ref: 'instance.dbPassword', type: 'string', source: { kind: 'input', ref: 'input.db' }, sensitive: true, availability: 'present', value: 'LEAK-1' },
					// Upstream forgot to mark it sensitive; the name gives it away.
					{ ref: 'instance.githubToken', type: 'string', source: { kind: 'input', ref: 'input.gh' }, sensitive: false, availability: 'present', value: 'LEAK-2' },
				);
				preamble.payload._internal = { store: 'LEAK-3' };
				envelope.current.fold._manifest = { secret: 'LEAK-4' };
				envelope.context._service = 'LEAK-5';
				return envelope;
			},
		});
		const result = await relay.orient();
		const text = JSON.stringify(result);
		for (const marker of ['LEAK-', 'PRIVATE-', 'keychain-secret']) expect(text).not.toContain(marker);
		const values = result.currentFold!.rememberedValues!.items;
		expect(values.find((v) => v.ref === 'instance.apiKey')).toEqual({ ref: 'instance.apiKey', type: 'secret', source: { kind: 'provider', ref: 'keychain' }, sensitive: true, availability: 'reference-only' });
		expect(values.find((v) => v.ref === 'instance.password')).not.toHaveProperty('value');
		expect(values.find((v) => v.ref === 'instance.githubToken')).toMatchObject({ sensitive: true });
		expect(values.find((v) => v.ref === 'instance.title')).toMatchObject({ value: 'Visible Title' });
		expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: 'relay.redaction.applied' }));
	});

	it('returns detached JSON, not live Lattice objects', async () => {
		const { relay } = tools();
		const result = await relay.orient();
		expect(JSON.parse(JSON.stringify(result))).toEqual(result);
	});

	it('bounds members, strings, values and diagnostics', async () => {
		const { relay } = tools({
			inspectContext: (request) => {
				const envelope = inspectedEnvelope(request.foldFacets);
				const fold = envelope.current.fold;
				const manifest = fold.facets.find((f: any) => f.facetId === FACET_MANIFEST);
				manifest.payload.members = Array.from({ length: 250 }, (_, i) => ({ memberId: `m${i}`, role: 'note', state: 'present', path: `n/${String(i).padStart(3, '0')}.md`, title: 'x'.repeat(5000), creation: 'attached' }));
				const preamble = fold.facets.find((f: any) => f.facetId === FACET_PREAMBLE);
				preamble.payload.rememberedValues.push({ ref: 'instance.big', type: 'string', source: { kind: 'input', ref: 'i' }, sensitive: false, availability: 'present', value: 'y'.repeat(10_000) });
				fold.diagnostics = Array.from({ length: 200 }, (_, i) => ({ code: `d${i}`, severity: 'info', message: 'm' }));
				return envelope;
			},
		});
		const result = await relay.orient();
		const members = result.currentFold!.members;
		expect(members).toMatchObject({ total: 250, truncated: true });
		expect(members.items).toHaveLength(LIMITS.members);
		expect(members.items[0].title!.length).toBeLessThanOrEqual(LIMITS.string);
		expect(result.currentFold!.rememberedValues!.items.find((v) => v.ref === 'instance.big')).toMatchObject({ valueOmitted: 'too-large' });
		expect(result.diagnostics).toHaveLength(LIMITS.diagnostics);
		expect(result.diagnostics[result.diagnostics.length - 1].code).toBe('relay.diagnostics.truncated');
	});
});

describe('topology is declared, never inferred', () => {
	it('reports no relationships for Folds whose folders nest inside each other', async () => {
		// The current Fold's only folder sits inside another Fold's folder, and its hub links to that Fold's hub.
		// Paths, containment and links are not topology evidence, so nothing may be derived from them.
		const { relay } = tools({
			listFolds: () => [
				{ foldId: 'fold-parent-ish', label: 'Projects', status: 'active', directoryBindings: [{ locator: 'Projects' }] },
				{ foldId: 'fold-example-0001', label: 'Test Project', status: 'active', directoryBindings: [{ locator: 'Projects/test' }] },
			],
			inspectContext: (request) => {
				const envelope = inspectedEnvelope(request.foldFacets);
				const manifest = envelope.current.fold.facets.find((f: any) => f.facetId === FACET_MANIFEST);
				manifest.payload.resources.push({ path: 'Projects/projects.md', kind: 'note', labels: [{ kind: 'external-reference', fromMemberId: 'member-hub', connection: 'link', otherFoldId: 'fold-parent-ish' }], hiddenByDefault: false });
				return envelope;
			},
		});
		const result = await relay.orient();
		expect(result.currentFold!.topology).toMatchObject({ status: 'unavailable', reason: 'lattice-contract-missing' });
		expect(result.currentFold!.topology).not.toHaveProperty('parent');
		expect(JSON.stringify(result.currentFold!.topology)).not.toContain('fold-parent-ish');
	});

	it.each([
		['an unknown spec', { spec: 'lattice-fold-topology/v2' }],
		['missing relationship lists', { spec: 'lattice-fold-topology/v1', parent: null }],
		['a malformed parent', { spec: 'lattice-fold-topology/v1', parent: 'Projects', ancestors: [], siblings: [], children: [], descendants: [] }],
		['refs without foldId', { spec: 'lattice-fold-topology/v1', parent: null, ancestors: [{ path: 'Projects' }], siblings: [], children: [], descendants: [] }],
	])('treats a topology facet with %s as unsupported, not as data', async (_label, payload) => {
		const { relay } = tools({
			inspectFold: (request) => {
				const envelope = foldEnvelope(request.facets, request.foldId);
				envelope.facets = envelope.facets.map((f: any) => (f.facetId === FACET_TOPOLOGY ? { ...clone(DECLARED_TOPOLOGY), payload } : f));
				return envelope;
			},
		});
		const result = await relay.describe({ foldId: 'fold-alpha' });
		expect(result.fold!.topology).toMatchObject({ status: 'unavailable', reason: 'unsupported-shape' });
		expect(result.fold!.facets.find((f) => f.facetId === FACET_TOPOLOGY)!.status).toBe('malformed');
	});

	it('reports a failed topology facet as failed', async () => {
		const { relay } = tools({
			inspectFold: (request) => {
				const envelope = foldEnvelope(request.facets, request.foldId);
				envelope.facets = envelope.facets.map((f: any) => (f.facetId === FACET_TOPOLOGY ? { ...clone(DECLARED_TOPOLOGY), status: 'failed', payload: null } : f));
				return envelope;
			},
		});
		expect((await relay.describe({ foldId: 'fold-alpha' })).fold!.topology).toMatchObject({ status: 'unavailable', reason: 'facet-failed' });
	});
});
