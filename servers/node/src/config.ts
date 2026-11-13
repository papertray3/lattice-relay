/**
 * Configuration for the Lattice Relay stdio server, read from the environment
 * the MCP client passes when it launches the server.
 *
 * Relay 0.1.0 replaced the Bridge-era `OBSIDIAN_*` variables with
 * `LATTICE_RELAY_*` and deliberately does not read the old names. If only the
 * old names are present, `retiredVariables` reports them so the server can
 * explain the failure instead of silently connecting without a key.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface ServerConfig {
  host: string;
  port: string;
  useSSL: boolean;
  apiKey: string;
  logLevel: LogLevel;
}

export const ENV = {
  key: 'LATTICE_RELAY_KEY',
  host: 'LATTICE_RELAY_HOST',
  port: 'LATTICE_RELAY_PORT',
  useSSL: 'LATTICE_RELAY_USE_SSL',
  logLevel: 'LATTICE_RELAY_LOG_LEVEL',
} as const;

/** Bridge-era names that Relay no longer reads, mapped to their replacements. */
export const RETIRED_ENV: Readonly<Record<string, string>> = {
  OBSIDIAN_MCP_KEY: ENV.key,
  OBSIDIAN_HOST: ENV.host,
  OBSIDIAN_PORT: ENV.port,
  OBSIDIAN_USE_SSL: ENV.useSSL,
  LOG_LEVEL: ENV.logLevel,
};

export const DEFAULT_HOST = 'localhost';
export const DEFAULT_PORT = '27125';

const LOG_LEVELS: readonly LogLevel[] = ['debug', 'info', 'warn', 'error'];

export type Env = Readonly<Record<string, string | undefined>>;

export function loadConfig(env: Env = process.env): ServerConfig {
  const level = (env[ENV.logLevel] ?? 'info').toLowerCase();
  return {
    host: env[ENV.host] || DEFAULT_HOST,
    port: env[ENV.port] || DEFAULT_PORT,
    useSSL: (env[ENV.useSSL] ?? 'false').toLowerCase() === 'true',
    apiKey: env[ENV.key] ?? '',
    logLevel: (LOG_LEVELS as readonly string[]).includes(level) ? (level as LogLevel) : 'info',
  };
}

/**
 * Retired Bridge variables that are set while their Relay replacement is not.
 * Returns names only, never values. `LOG_LEVEL` is generic, so it is reported
 * only alongside another retired name rather than on its own.
 */
export function retiredVariables(env: Env = process.env): Array<{ retired: string; replacement: string }> {
  const found = Object.entries(RETIRED_ENV)
    .filter(([retired, replacement]) => env[retired] !== undefined && env[replacement] === undefined)
    .map(([retired, replacement]) => ({ retired, replacement }));
  return found.some(f => f.retired !== 'LOG_LEVEL') ? found : [];
}

export function getWebSocketURL(config: ServerConfig): string {
  const protocol = config.useSSL ? 'wss' : 'ws';
  return `${protocol}://${config.host}:${config.port}`;
}
