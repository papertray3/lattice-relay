import { TFile } from 'obsidian';
import type LatticeRelayPlugin from '../main';
import { DataviewHelper, DataviewExecutionResult } from '../dataview-helper';

/**
 * Request parameters for run_dataview_block
 */
export interface RunDataviewBlockParams {
	filepath?: string;
	flavor: 'dataview' | 'dataviewjs';
	source: string;
	input?: any;
}

/**
 * Execute a Dataview or DataviewJS block
 *
 * @param plugin - The Lattice Relay plugin instance
 * @param params - Execution parameters
 * @returns Execution result with rendered content
 */
export async function runDataviewBlock(
	plugin: LatticeRelayPlugin,
	params: RunDataviewBlockParams
): Promise<DataviewExecutionResult> {
	const { filepath, flavor, source, input } = params;

	// Validate parameters
	if (!flavor) {
		return {
			success: false,
			elapsedMs: 0,
			errors: ['Missing required parameter: flavor (must be "dataview" or "dataviewjs")']
		};
	}

	if (!source) {
		return {
			success: false,
			elapsedMs: 0,
			errors: ['Missing required parameter: source (the query or script to execute)']
		};
	}

	if (flavor !== 'dataview' && flavor !== 'dataviewjs') {
		return {
			success: false,
			elapsedMs: 0,
			errors: ['Invalid flavor: must be "dataview" or "dataviewjs"']
		};
	}

	// Create Dataview helper
	const dvHelper = new DataviewHelper(plugin.app);

	// Check if Dataview is available
	if (!dvHelper.isAvailable()) {
		return {
			success: false,
			elapsedMs: 0,
			errors: [dvHelper.getNotAvailableMessage()]
		};
	}

	// Execute based on flavor
	if (flavor === 'dataview') {
		return await dvHelper.runDataview(source, filepath);
	} else {
		return await dvHelper.runDataviewJS(source, filepath, input);
	}
}

/**
 * Extract Dataview blocks from a note
 *
 * @param plugin - The Lattice Relay plugin instance
 * @param filepath - Path to the note file
 * @returns List of Dataview blocks found in the note
 */
export async function extractDataviewBlocks(
	plugin: LatticeRelayPlugin,
	filepath: string
): Promise<{
	success: boolean;
	blocks?: Array<{
		flavor: 'dataview' | 'dataviewjs';
		source: string;
		lineStart: number;
		lineEnd: number;
	}>;
	errors?: string[];
}> {
	// Validate filepath
	if (!filepath) {
		return {
			success: false,
			errors: ['Missing required parameter: filepath']
		};
	}

	// Get the file
	const file = plugin.app.vault.getAbstractFileByPath(filepath);

	if (!file) {
		return {
			success: false,
			errors: [`File not found: ${filepath}`]
		};
	}

	// Check if it's a TFile (not a folder)
	if (!(file instanceof TFile)) {
		return {
			success: false,
			errors: [`Not a file: ${filepath}`]
		};
	}

	try {
		// Read the file content
		const content = await plugin.app.vault.read(file);
		const lines = content.split('\n');

		// Find all dataview blocks
		const blocks: Array<{
			flavor: 'dataview' | 'dataviewjs';
			source: string;
			lineStart: number;
			lineEnd: number;
		}> = [];

		let inBlock = false;
		let currentFlavor: 'dataview' | 'dataviewjs' | null = null;
		let currentSource: string[] = [];
		let blockStart = 0;

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];

			// Check for block start
			if (!inBlock) {
				const dvMatch = line.match(/^```dataview\s*$/);
				const dvjsMatch = line.match(/^```dataviewjs\s*$/);

				if (dvMatch) {
					inBlock = true;
					currentFlavor = 'dataview';
					currentSource = [];
					blockStart = i + 1; // Line after the opening ```
				} else if (dvjsMatch) {
					inBlock = true;
					currentFlavor = 'dataviewjs';
					currentSource = [];
					blockStart = i + 1;
				}
			}
			// Check for block end
			else if (line.match(/^```\s*$/)) {
				// Block ended
				if (currentFlavor) {
					blocks.push({
						flavor: currentFlavor,
						source: currentSource.join('\n'),
						lineStart: blockStart,
						lineEnd: i - 1
					});
				}

				inBlock = false;
				currentFlavor = null;
				currentSource = [];
			}
			// Accumulate block content
			else if (inBlock) {
				currentSource.push(line);
			}
		}

		return {
			success: true,
			blocks
		};
	} catch (error) {
		return {
			success: false,
			errors: [`Failed to read file: ${error.message}`]
		};
	}
}
