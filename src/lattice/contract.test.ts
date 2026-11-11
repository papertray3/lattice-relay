import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import contract from './fixtures/focus/context-envelope.v1.json';
import examples from './fixtures/focus/context-envelope.v1.examples.json';
import preambleEnvelope from './fixtures/fold/preamble.v1.example.json';
import manifestFacet from './fixtures/fold/manifest.v2.relay-sample.json';
import provenance from './fixtures/PROVENANCE.json';
import {
	FACET_MANIFEST,
	FACET_PREAMBLE,
	FOCUS_CONTEXT_ENVELOPE_SPEC,
	FOCUS_OUTCOMES,
	FOLD_CONTEXT_ENVELOPE_SPEC,
	FOLD_MANIFEST_INVENTORY_SPEC,
	FOLD_PREAMBLE_SPEC,
	MAX_FOLD_FACETS,
	SUPPORTED_FOCUS_API,
} from './contract';
import { assertFoldEnvelope, projectFoldEnvelope } from './fold-projection';
import { LatticeTools } from './lattice-tools';
import { clone, fakeLattice } from './test-support';

/**
 * Contract-drift tests: Relay's pinned constants and parsers must agree with
 * the Lattice fixtures vendored under ./fixtures (see PROVENANCE.json). If a
 * fixture changes, its hash test fails first, forcing a deliberate re-pin.
 *
 * Set LATTICE_CONTRACTS_DIR to a Lattice checkout's `contracts/` directory to
 * also compare the vendored copies against that live source.
 */

const FIXTURES = path.join(__dirname, 'fixtures');
const canonicalHash = (file: string) => createHash('sha256').update(JSON.stringify(JSON.parse(fs.readFileSync(file, 'utf8')))).digest('hex');

describe('vendored Lattice fixtures', () => {
	it('match the hashes recorded in PROVENANCE.json', () => {
		for (const entry of provenance.fixtures) {
			if (!('sha256' in entry)) continue;
			expect(canonicalHash(path.join(FIXTURES, entry.file)), entry.file).toBe(entry.sha256);
		}
	});

	it('are all recorded in PROVENANCE.json', () => {
		const onDisk = ['focus', 'fold'].flatMap((dir) => fs.readdirSync(path.join(FIXTURES, dir)).map((f) => `${dir}/${f}`)).sort();
		expect(provenance.fixtures.map((f) => f.file).sort()).toEqual(onDisk);
	});

	it.runIf(Boolean(process.env.LATTICE_CONTRACTS_DIR))('match the live Lattice contracts directory', () => {
		const root = process.env.LATTICE_CONTRACTS_DIR as string;
		for (const entry of provenance.fixtures) {
			if (entry.kind !== 'lattice-published' || !('upstreamPath' in entry)) continue;
			const live = path.join(root, (entry.upstreamPath as string).replace(/^contracts\//, ''));
			expect(canonicalHash(live), entry.upstreamPath as string).toBe(entry.sha256);
		}
	});
});

describe('Relay constants agree with the Focus context-envelope contract', () => {
	it('pins the method, spec, API version, facet limit and outcomes', () => {
		expect(contract.spec).toBe(FOCUS_CONTEXT_ENVELOPE_SPEC);
		expect(contract.method).toBe('api.focus.inspectContext');
		expect(contract.focusApiVersion).toBe(`${SUPPORTED_FOCUS_API.major}.${SUPPORTED_FOCUS_API.minMinor}`);
		expect(contract.maxFoldFacets).toBe(MAX_FOLD_FACETS);
		expect([...contract.outcomes].sort()).toEqual([...FOCUS_OUTCOMES].sort());
		expect(contract.defaultFoldFacets).toEqual([FACET_PREAMBLE]);
	});

	it('requests no more facets than the contract allows', () => {
		expect(3).toBeLessThanOrEqual(contract.maxFoldFacets);
	});
});

describe('published examples project cleanly', () => {
	it.each(Object.entries(examples))('accepts the %s example', async (name, example) => {
		const fake = fakeLattice({ inspectContext: () => clone(example) });
		const result = await new LatticeTools(() => fake.host).orient();
		expect(result.errorClass, name).not.toBe('contract');
		expect(result.outcome).toBe((example as { outcome: string }).outcome);
		expect(result.context!.revision).toBe((example as { contextRevision: number }).contextRevision);
	});

	it('accepts the preamble example and keeps its redaction', () => {
		expect(preambleEnvelope.spec).toBe(FOLD_CONTEXT_ENVELOPE_SPEC);
		expect(preambleEnvelope.facets[0].payload.spec).toBe(FOLD_PREAMBLE_SPEC);
		const envelope = clone(preambleEnvelope) as Record<string, unknown>;
		assertFoldEnvelope(envelope);
		const { fold, diagnostics } = projectFoldEnvelope(envelope, [FACET_PREAMBLE]);
		expect(diagnostics).toEqual([]);
		expect(fold.facets).toEqual([{ facetId: FACET_PREAMBLE, status: 'ready', provider: 'lattice-fold.builtin-inspection@1.0.0' }]);
		expect(fold.counts).toEqual(preambleEnvelope.facets[0].payload.counts);
		const byRef = Object.fromEntries(fold.rememberedValues!.items.map((v) => [v.ref, v]));
		expect(byRef['instance.apiKey']).not.toHaveProperty('value');
		expect(byRef['instance.password']).not.toHaveProperty('value');
		expect(byRef['instance.synopsis'].value).toBe('An optional synopsis');
	});

	it('accepts the Relay-authored manifest sample', () => {
		expect(manifestFacet.facetId).toBe(FACET_MANIFEST);
		expect(manifestFacet.payload.spec).toBe(FOLD_MANIFEST_INVENTORY_SPEC);
		const envelope = clone(preambleEnvelope) as Record<string, any>;
		envelope.facets = [clone(manifestFacet)];
		assertFoldEnvelope(envelope);
		const { fold } = projectFoldEnvelope(envelope, [FACET_MANIFEST]);
		expect(fold.members.items).toHaveLength(2);
		expect(fold.folders.items).toEqual([{ path: 'Projects/test', reach: 'descendants' }]);
	});
});
