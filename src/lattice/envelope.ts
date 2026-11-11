import { LIMITS } from './contract';
import type { LatticeVersions } from './discovery';

/**
 * Relay's client-facing envelope vocabulary.
 *
 * Errors are kept in four distinguishable classes:
 * - transport/registration failures never reach this module - they surface as
 *   MCP errors from the registry (unknown tool, invalid params, socket loss);
 * - `availability`: Lattice is absent, disabled, initializing or a module failed;
 * - `compatibility`: Lattice is present but speaks an unsupported contract version;
 * - `contract`: Lattice answered with something that is not the published shape;
 * - `domain`: a legitimate Lattice answer that carries a refusal or degradation
 *   (no current Fold, stale context, unknown Fold, ...).
 * `none` means the request was answered as asked.
 */

export interface RelayDiagnostic {
	code: string;
	severity: 'error' | 'warning' | 'info';
	message: string;
	/** Who raised it: Relay itself, or the Lattice module whose answer carried it. */
	origin: 'relay' | 'lattice.focus' | 'lattice.fold';
	facetId?: string;
}

export type RelayErrorClass = 'none' | 'domain' | 'availability' | 'compatibility' | 'contract';

export interface RelaySource {
	provider: 'lattice';
	pluginVersion: string | null;
	latticeApiVersion: string | null;
	focusApiVersion: string | null;
	foldApiVersion: string | null;
	/** The Lattice envelope spec this answer was projected from, when one was read. */
	upstreamSpec: string | null;
	upstreamGeneratedAt: string | null;
}

export class UpstreamContractError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'UpstreamContractError';
	}
}

export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Bounded string or null; never throws on hostile input. */
export function clip(value: unknown, max: number = LIMITS.string): string | null {
	if (typeof value !== 'string') return null;
	return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

export function num(value: unknown): number | null {
	return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function numOrString(value: unknown): number | string | null {
	return typeof value === 'number' && Number.isFinite(value) ? value : clip(value, 120);
}

export function sourceFrom(versions: LatticeVersions, upstream?: Record<string, unknown>): RelaySource {
	return {
		provider: 'lattice',
		pluginVersion: versions.plugin,
		latticeApiVersion: versions.lattice,
		focusApiVersion: versions.focus,
		foldApiVersion: versions.fold,
		upstreamSpec: clip(upstream?.spec, 120),
		upstreamGeneratedAt: clip(upstream?.generatedAt, 64),
	};
}

const SEVERITIES = new Set(['error', 'warning', 'info']);

/** Projects upstream Lattice diagnostics: code, severity, message only (no paths beyond the message, no payloads). */
export function projectDiagnostics(value: unknown, origin: RelayDiagnostic['origin'], facetId?: string): RelayDiagnostic[] {
	if (!Array.isArray(value)) return [];
	const out: RelayDiagnostic[] = [];
	for (const item of value) {
		if (!isRecord(item)) continue;
		const code = clip(item.code, 160);
		if (!code) continue;
		out.push({
			code,
			severity: SEVERITIES.has(item.severity as string) ? (item.severity as RelayDiagnostic['severity']) : 'info',
			message: clip(item.message) ?? '',
			origin,
			...(facetId ? { facetId } : {}),
		});
	}
	return out;
}

/** Caps a diagnostic list, noting how many were dropped. */
export function boundDiagnostics(list: RelayDiagnostic[]): RelayDiagnostic[] {
	if (list.length <= LIMITS.diagnostics) return list;
	const kept = list.slice(0, LIMITS.diagnostics - 1);
	kept.push({ code: 'relay.diagnostics.truncated', severity: 'info', message: `${list.length - kept.length} further diagnostics omitted.`, origin: 'relay' });
	return kept;
}

export function relayDiagnostic(code: string, severity: RelayDiagnostic['severity'], message: string, facetId?: string): RelayDiagnostic {
	return { code, severity, message, origin: 'relay', ...(facetId ? { facetId } : {}) };
}
