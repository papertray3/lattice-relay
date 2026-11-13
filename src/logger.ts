/**
 * Plugin Logger - Provides leveled logging with optional file output
 * Levels: debug, info, warn, error
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
	debug: 0,
	info: 1,
	warn: 2,
	error: 3
};

/**
 * Simple logger with level filtering
 */
export class Logger {
	private level: LogLevel;
	private prefix: string;

	constructor(level: LogLevel = 'info', prefix: string = 'Lattice Relay') {
		this.level = level;
		this.prefix = prefix;
	}

	setLevel(level: LogLevel) {
		this.level = level;
	}

	private shouldLog(level: LogLevel): boolean {
		return LOG_LEVELS[level] >= LOG_LEVELS[this.level];
	}

	private format(levelName: string, message: string, args: unknown[]): string {
		const timestamp = new Date().toISOString();
		const argsStr = args.length > 0 ? ' ' + JSON.stringify(args) : '';
		return `[${timestamp}] [${this.prefix}:${levelName}] ${message}${argsStr}`;
	}

	debug(message: string, ...args: unknown[]) {
		if (this.shouldLog('debug')) {
			const formatted = this.format('DEBUG', message, args);
			console.debug(formatted);
		}
	}

	info(message: string, ...args: unknown[]) {
		if (this.shouldLog('info')) {
			const formatted = this.format('INFO', message, args);
			console.info(formatted);
		}
	}

	warn(message: string, ...args: unknown[]) {
		if (this.shouldLog('warn')) {
			const formatted = this.format('WARN', message, args);
			console.warn(formatted);
		}
	}

	error(message: string, ...args: unknown[]) {
		if (this.shouldLog('error')) {
			const formatted = this.format('ERROR', message, args);
			console.error(formatted);
		}
	}
}

// Export singleton instance
export const logger = new Logger('info', 'Lattice Relay');
