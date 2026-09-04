import * as fs from 'fs';
import * as path from 'path';
import { createRequire } from 'module';
import { logger } from '../logger';
import { ToolDefinition, UserHandlerModule, isUserHandlerModule } from './types';

/**
 * Resolve and load a single user tool's handler script.
 *
 * Resolution rule (deliberately just one, not a list of guesses):
 *   - An absolute `handler` path is used as-is.
 *   - Otherwise it's resolved relative to the directory containing the tool's own
 *     YAML file (`tool._sourceDir`, set by discoverUserTools()) - i.e. handler scripts
 *     are expected to live alongside the YAML that references them.
 *
 * Returns null (after logging why) rather than throwing - a single bad handler
 * shouldn't prevent every other tool from loading.
 */
export function loadUserHandler(tool: ToolDefinition): UserHandlerModule | null {
	let resolved: string;
	if (path.isAbsolute(tool.handler)) {
		resolved = tool.handler;
	} else if (tool._sourceDir) {
		resolved = path.join(tool._sourceDir, tool.handler);
	} else {
		// Tools loaded via addTool() are always rediscovered (with _sourceDir set)
		// by the reload() at the end of that method, so this should be unreachable
		// in practice - but fail loudly rather than guessing at a location.
		logger.error(`Cannot resolve handler for "${tool.name}": no source directory known for handler "${tool.handler}"`);
		return null;
	}

	try {
		if (!fs.existsSync(resolved)) {
			logger.warn(`Handler not found for "${tool.name}": ${resolved}`);
			return null;
		}

		// Use a native require rooted at the handler. The ambient require inside an
		// Electron bundle can retain a separate cache, making schema reload while
		// continuing to execute an older handler body.
		const handlerRequire = createRequire(resolved);
		const cacheKey = handlerRequire.resolve(resolved);
		delete handlerRequire.cache[cacheKey];
		const handler: unknown = handlerRequire(resolved);
		if (isUserHandlerModule(handler)) {
			logger.debug(`Loaded handler for "${tool.name}" from ${resolved}`);
			return handler;
		}

		logger.error(`Handler for "${tool.name}" at ${resolved} is missing an execute() function`);
		return null;
	} catch (err) {
		logger.error(`Failed to load handler for "${tool.name}" from ${resolved}:`, err);
		return null;
	}
}
