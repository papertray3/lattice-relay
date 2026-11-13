import { App, TFile } from 'obsidian';

/**
 * Result from executing a Dataview query
 */
export interface DataviewExecutionResult {
	renderedMarkdown?: string;
	renderedHtml?: string;
	data?: any; // Raw data from the query (when available)
	elapsedMs: number;
	warnings?: string[];
	errors?: string[];
	success: boolean;
}

/**
 * Dataview plugin interface (minimal typing)
 */
interface DataviewPlugin {
	api?: {
		// DQL execution
		tryQueryMarkdown?: (query: string, sourcePath?: string) => Promise<string | null>;
		query?: (source: string, originFile?: string) => Promise<{ successful: boolean; value: any; error?: string }>;

		// DataviewJS execution
		executeJs?: (code: string, container: HTMLElement, component: any, filePath: string) => Promise<void>;

		// Index access
		index?: any;
	};
}

/**
 * Error thrown when Dataview plugin is not available
 */
export class DataviewNotAvailableError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'DataviewNotAvailableError';
	}
}

/**
 * Helper class for executing Dataview queries
 */
export class DataviewHelper {
	private app: App;

	constructor(app: App) {
		this.app = app;
	}

	/**
	 * Check if Dataview plugin is available and enabled
	 */
	isAvailable(): boolean {
		const dvPlugin = this.getDataviewPlugin();
		return dvPlugin !== null && dvPlugin.api !== undefined;
	}

	/**
	 * Get Dataview plugin instance
	 */
	private getDataviewPlugin(): DataviewPlugin | null {
		// @ts-ignore - accessing internal API
		const plugins = this.app.plugins?.plugins;
		if (!plugins) {
			return null;
		}

		const dvPlugin = plugins['dataview'] as DataviewPlugin;
		return dvPlugin || null;
	}

	/**
	 * Execute a Dataview query (DQL)
	 *
	 * @param query - The DQL query string (without the ```dataview wrapper)
	 * @param contextPath - File path to use as execution context
	 * @returns Execution result with rendered markdown and raw data
	 */
	async runDataview(query: string, contextPath?: string): Promise<DataviewExecutionResult> {
		const startTime = Date.now();
		const dvPlugin = this.getDataviewPlugin();

		if (!dvPlugin || !dvPlugin.api) {
			return {
				success: false,
				elapsedMs: Date.now() - startTime,
				errors: ['Dataview plugin is not available or not enabled']
			};
		}

		// Validate context path
		let sourcePath = contextPath || '';
		if (contextPath) {
			const file = this.app.vault.getAbstractFileByPath(contextPath);
			if (!file || !(file instanceof TFile)) {
				return {
					success: false,
					elapsedMs: Date.now() - startTime,
					errors: [`Context file not found: ${contextPath}`]
				};
			}
		}

		try {
			// Execute the query to get raw data
			let rawData: any = undefined;
			if (dvPlugin.api.query) {
				const queryResult = await dvPlugin.api.query(query, sourcePath);
				if (queryResult.successful) {
					rawData = this.serializeDataviewValue(queryResult.value);
				}
			}

			// Execute the query for markdown rendering
			const result = await dvPlugin.api.tryQueryMarkdown?.(query, sourcePath);

			if (result === null || result === undefined) {
				return {
					success: false,
					elapsedMs: Date.now() - startTime,
					errors: ['Query returned no results']
				};
			}

			return {
				success: true,
				renderedMarkdown: result,
				data: rawData,
				elapsedMs: Date.now() - startTime
			};
		} catch (error) {
			return {
				success: false,
				elapsedMs: Date.now() - startTime,
				errors: [`Query execution failed: ${error.message}`]
			};
		}
	}

	/**
	 * Execute a DataviewJS script
	 *
	 * @param script - The JavaScript code (without the ```dataviewjs wrapper)
	 * @param contextPath - File path to use as execution context
	 * @param input - Optional input data for the script
	 * @returns Execution result with rendered content
	 */
	async runDataviewJS(
		script: string,
		contextPath?: string,
		input?: any
	): Promise<DataviewExecutionResult> {
		const startTime = Date.now();
		const dvPlugin = this.getDataviewPlugin();

		if (!dvPlugin || !dvPlugin.api) {
			return {
				success: false,
				elapsedMs: Date.now() - startTime,
				errors: ['Dataview plugin is not available or not enabled']
			};
		}

		// Validate context path
		let sourcePath = contextPath || '';
		if (contextPath) {
			const file = this.app.vault.getAbstractFileByPath(contextPath);
			if (!file || !(file instanceof TFile)) {
				return {
					success: false,
					elapsedMs: Date.now() - startTime,
					errors: [`Context file not found: ${contextPath}`]
				};
			}
		}

		// Check if script uses dv.view() and expand it
		let scriptToRun = await this.expandDvViewCalls(script, input);

		// Inject input if provided and not already injected
		if (input !== undefined && !scriptToRun.includes('const input =')) {
			scriptToRun = `const input = ${JSON.stringify(input)};\n${scriptToRun}`;
		}

		// Create a temporary container to capture the output
		const container = document.createElement('div');

		// Create a minimal component for lifecycle management
		// DataviewJS expects a component with lifecycle hooks
		const component = {
			registerEvent: () => {},
			load: () => {},
			onload: () => {},
			unload: () => {},
			addChild: () => {},
			removeChild: () => {},
			register: () => {},
		};

		// Capture data by intercepting dv.table, dv.list, etc.
		let capturedData: any = undefined;

		// Wrap the script to capture data
		const wrappedScript = `
(function() {
	const originalTable = dv.table;
	const originalList = dv.list;
	const originalTaskList = dv.taskList;

	let __capturedData = {
		outputs: []
	};

	dv.table = function(headers, rows) {
		__capturedData.outputs.push({
			type: 'table',
			headers: headers,
			rows: rows || []
		});
		return originalTable.call(this, headers, rows);
	};

	dv.list = function(items) {
		__capturedData.outputs.push({
			type: 'list',
			items: items || []
		});
		return originalList.call(this, items);
	};

	dv.taskList = function(tasks, groupByFile = true) {
		__capturedData.outputs.push({
			type: 'taskList',
			tasks: tasks || [],
			groupByFile: groupByFile
		});
		return originalTaskList.call(this, tasks, groupByFile);
	};

	${scriptToRun}

	// Store captured data in window for retrieval
	window.__dataviewCapturedData = __capturedData;
})();
`;

		try {
			// Execute the script
			await dvPlugin.api.executeJs?.(wrappedScript, container, component, sourcePath);

			// Retrieve captured data
			// @ts-ignore
			if (window.__dataviewCapturedData) {
				// @ts-ignore
				const captured = window.__dataviewCapturedData;
				if (captured.outputs && captured.outputs.length > 0) {
					// Serialize all captured outputs
					capturedData = {
						outputs: captured.outputs.map((output: any) => this.serializeDataviewValue(output))
					};
				}
				// Clean up
				// @ts-ignore
				delete window.__dataviewCapturedData;
			}

			// Extract the rendered content
			const renderedHtml = container.innerHTML;

			// Try to convert HTML to markdown (basic conversion)
			// This is a simple approach - could be enhanced
			const renderedMarkdown = this.htmlToMarkdown(renderedHtml);

			return {
				success: true,
				renderedMarkdown,
				renderedHtml,
				data: capturedData,
				elapsedMs: Date.now() - startTime
			};
		} catch (error) {
			return {
				success: false,
				elapsedMs: Date.now() - startTime,
				errors: [`Script execution failed: ${error.message}`]
			};
		}
	}

	/**
	 * Expand dv.view() calls by inlining the view file's code
	 * This allows custom views to work through Lattice Relay
	 */
	private async expandDvViewCalls(script: string, providedInput?: any): Promise<string> {
		// Match dv.view("path", {params}) or await dv.view("path", {params})
		const viewRegex = /(?:await\s+)?dv\.view\s*\(\s*["']([^"']+)["']\s*(?:,\s*(\{[^}]*\}|\w+))?\s*\)/g;

		let expandedScript = script;
		const matches = [...script.matchAll(viewRegex)];

		for (const match of matches) {
			const viewPath = match[1];
			const inputParam = match[2] || '{}';

			try {
				// Try to read the view file
				// View paths are relative to vault root
				let fullPath = viewPath;

				// Add .js extension if not present
				if (!fullPath.endsWith('.js')) {
					fullPath += '.js';
				}

				const viewFile = this.app.vault.getAbstractFileByPath(fullPath);

				if (viewFile && viewFile instanceof TFile) {
					// Read the view file
					const viewCode = await this.app.vault.read(viewFile);

					// Extract the function and its body
					// Most view files follow pattern: function name(dv, input) { ... } name(dv, input);
					// We'll inline it and call it directly

					// Replace the dv.view() call with the inlined code
					const inlinedCode = `
(async function() {
  const input = ${inputParam};
  ${viewCode}
})();
`;
					expandedScript = expandedScript.replace(match[0], inlinedCode);
				}
			} catch (error) {
				// If we can't read the view, leave the call as-is
				// It will fail naturally during execution
				console.warn(`Could not expand dv.view("${viewPath}"):`, error);
			}
		}

		return expandedScript;
	}

	/**
	 * Basic HTML to Markdown conversion
	 * Enhanced to handle Dataview tables properly
	 */
	private htmlToMarkdown(html: string): string {
		// Try to convert tables first (before stripping HTML)
		html = this.convertTablesToMarkdown(html);

		// Remove empty elements
		let markdown = html.replace(/<[^>]*>\s*<\/[^>]*>/g, '');

		// Convert common elements
		markdown = markdown.replace(/<br\s*\/?>/gi, '\n');
		markdown = markdown.replace(/<\/p>/gi, '\n\n');
		markdown = markdown.replace(/<p[^>]*>/gi, '');
		markdown = markdown.replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**');
		markdown = markdown.replace(/<b[^>]*>(.*?)<\/b>/gi, '**$1**');
		markdown = markdown.replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*');
		markdown = markdown.replace(/<i[^>]*>(.*?)<\/i>/gi, '*$1*');
		markdown = markdown.replace(/<code[^>]*>(.*?)<\/code>/gi, '`$1`');

		// Convert headers
		markdown = markdown.replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n');
		markdown = markdown.replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n');
		markdown = markdown.replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n');
		markdown = markdown.replace(/<h4[^>]*>(.*?)<\/h4>/gi, '#### $1\n');
		markdown = markdown.replace(/<h5[^>]*>(.*?)<\/h5>/gi, '##### $1\n');
		markdown = markdown.replace(/<h6[^>]*>(.*?)<\/h6>/gi, '###### $1\n');

		// Convert lists
		markdown = markdown.replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n');
		markdown = markdown.replace(/<\/?[uo]l[^>]*>/gi, '\n');

		// Convert links
		markdown = markdown.replace(/<a[^>]*href=["']([^"']*)["'][^>]*>(.*?)<\/a>/gi, '[$2]($1)');

		// Remove remaining HTML tags
		markdown = markdown.replace(/<[^>]*>/g, '');

		// Clean up whitespace
		markdown = markdown.replace(/\n{3,}/g, '\n\n').trim();

		return markdown;
	}

	/**
	 * Convert HTML tables to Markdown tables
	 */
	private convertTablesToMarkdown(html: string): string {
		// Use DOM parser to extract table structure
		const tableRegex = /<table[^>]*>(.*?)<\/table>/gis;

		return html.replace(tableRegex, (tableMatch) => {
			// Extract headers
			const headerRegex = /<thead[^>]*>.*?<tr[^>]*>(.*?)<\/tr>.*?<\/thead>/is;
			const headerMatch = tableMatch.match(headerRegex);

			let headers: string[] = [];
			if (headerMatch) {
				const thRegex = /<th[^>]*>(.*?)<\/th>/gi;
				const thMatches = headerMatch[1].matchAll(thRegex);
				headers = Array.from(thMatches, m => this.stripHtml(m[1]));
			}

			// Extract rows
			const tbodyRegex = /<tbody[^>]*>(.*?)<\/tbody>/is;
			const tbodyMatch = tableMatch.match(tbodyRegex);

			const rows: string[][] = [];
			if (tbodyMatch) {
				const trRegex = /<tr[^>]*>(.*?)<\/tr>/gi;
				const trMatches = tbodyMatch[1].matchAll(trRegex);

				for (const trMatch of trMatches) {
					const tdRegex = /<td[^>]*>(.*?)<\/td>/gi;
					const tdMatches = trMatch[1].matchAll(tdRegex);
					const cells = Array.from(tdMatches, m => this.stripHtml(m[1]));
					if (cells.length > 0) {
						rows.push(cells);
					}
				}
			}

			// Build markdown table
			if (headers.length === 0 && rows.length === 0) {
				return '';
			}

			// If no headers, use first row as headers
			if (headers.length === 0 && rows.length > 0) {
				headers = rows.shift() || [];
			}

			let markdown = '';

			// Header row
			if (headers.length > 0) {
				markdown += '| ' + headers.join(' | ') + ' |\n';
				markdown += '| ' + headers.map(() => '---').join(' | ') + ' |\n';
			}

			// Data rows
			for (const row of rows) {
				// Pad row to match header length
				while (row.length < headers.length) {
					row.push('');
				}
				markdown += '| ' + row.join(' | ') + ' |\n';
			}

			return markdown;
		});
	}

	/**
	 * Strip HTML tags from a string
	 */
	private stripHtml(html: string): string {
		return html
			.replace(/<br\s*\/?>/gi, ' ')
			.replace(/<[^>]*>/g, '')
			.trim();
	}

	/**
	 * Serialize Dataview values to plain JSON
	 * Handles DataArray, Links, Dates, and other Dataview-specific types
	 */
	private serializeDataviewValue(value: any): any {
		// Null or undefined
		if (value === null || value === undefined) {
			return value;
		}

		// DataArray - has .array property
		if (value && typeof value === 'object' && 'array' in value && Array.isArray(value.array)) {
			return value.array.map((item: any) => this.serializeDataviewValue(item));
		}

		// Regular Array
		if (Array.isArray(value)) {
			return value.map((item: any) => this.serializeDataviewValue(item));
		}

		// Date object
		if (value instanceof Date) {
			return value.toISOString();
		}

		// Link object - has .path property
		if (value && typeof value === 'object' && 'path' in value) {
			return {
				path: value.path,
				display: value.display || value.path,
				type: value.type || 'file'
			};
		}

		// Duration object - has .values property
		if (value && typeof value === 'object' && 'values' in value && typeof value.toString === 'function') {
			return value.toString();
		}

		// Plain object - recursively serialize
		if (value && typeof value === 'object' && value.constructor === Object) {
			const result: any = {};
			for (const [key, val] of Object.entries(value)) {
				result[key] = this.serializeDataviewValue(val);
			}
			return result;
		}

		// Primitive or unknown - return as-is
		return value;
	}

	/**
	 * Get a user-friendly error message for when Dataview is not available
	 */
	getNotAvailableMessage(): string {
		const dvPlugin = this.getDataviewPlugin();

		if (!dvPlugin) {
			return 'Dataview plugin is not installed or not enabled. Please install and enable the Dataview plugin to use this feature.';
		}

		if (!dvPlugin.api) {
			return 'Dataview plugin is installed but its API is not available. The plugin may not be fully loaded.';
		}

		return 'Dataview plugin is not available for an unknown reason.';
	}
}
