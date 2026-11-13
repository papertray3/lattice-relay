import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

/**
 * MCP clients (SDK 1.x, protocol 2025-06-18 and later) reject a tools/call
 * result that has no structuredContent when the tool declares an outputSchema.
 * Relay's server supplies structuredContent for JSON-object results, so a
 * built-in that returns plain text must not declare one. Sandbox acceptance
 * (PLAN-002 T16) found get_note_raw doing exactly that.
 */
const TEXT_RESULT_BUILTINS = ['get_note_raw'];

interface ToolDef { name: string; outputSchema?: { type?: string } }

describe('shipped tool output contracts', () => {
	const defaults = yaml.load(fs.readFileSync(path.resolve(__dirname, '..', '..', 'defaults', 'tools.defaults.yaml'), 'utf8')) as { tools: { builtin: ToolDef[] } };
	const builtins = defaults.tools.builtin;

	it('declares no outputSchema for built-ins that return plain text', () => {
		for (const name of TEXT_RESULT_BUILTINS) {
			const tool = builtins.find(t => t.name === name);
			expect(tool, name).toBeDefined();
			expect(tool!.outputSchema, name).toBeUndefined();
		}
	});

	it('declares every outputSchema as a JSON object, the only shape structuredContent allows', () => {
		for (const tool of builtins.filter(t => t.outputSchema)) {
			expect(tool.outputSchema!.type, tool.name).toBe('object');
		}
	});
});
