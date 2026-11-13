import { describe, expect, it } from 'vitest';
import { DEFAULT_HOST, DEFAULT_PORT, getWebSocketURL, loadConfig, retiredVariables } from './config.js';

describe('loadConfig', () => {
  it('reads only LATTICE_RELAY_* variables', () => {
    const config = loadConfig({
      LATTICE_RELAY_KEY: 'k', LATTICE_RELAY_HOST: 'h', LATTICE_RELAY_PORT: '4000',
      LATTICE_RELAY_USE_SSL: 'TRUE', LATTICE_RELAY_LOG_LEVEL: 'Debug',
    });
    expect(config).toEqual({ apiKey: 'k', host: 'h', port: '4000', useSSL: true, logLevel: 'debug' });
    expect(getWebSocketURL(config)).toBe('wss://h:4000');
  });

  it('ignores the retired MCP Bridge variables', () => {
    const config = loadConfig({ OBSIDIAN_MCP_KEY: 'old', OBSIDIAN_HOST: 'old-host', OBSIDIAN_PORT: '1', OBSIDIAN_USE_SSL: 'true', LOG_LEVEL: 'debug' });
    expect(config).toEqual({ apiKey: '', host: DEFAULT_HOST, port: DEFAULT_PORT, useSSL: false, logLevel: 'info' });
    expect(getWebSocketURL(config)).toBe(`ws://${DEFAULT_HOST}:${DEFAULT_PORT}`);
  });

  it('falls back to info for an unknown log level', () => {
    expect(loadConfig({ LATTICE_RELAY_LOG_LEVEL: 'verbose' }).logLevel).toBe('info');
  });
});

describe('retiredVariables', () => {
  it('names retired variables whose replacement is unset, without values', () => {
    const found = retiredVariables({ OBSIDIAN_MCP_KEY: 'secret', OBSIDIAN_PORT: '27127', LATTICE_RELAY_PORT: '27127' });
    expect(found).toEqual([{ retired: 'OBSIDIAN_MCP_KEY', replacement: 'LATTICE_RELAY_KEY' }]);
    expect(JSON.stringify(found)).not.toContain('secret');
  });

  it('does not flag a generic LOG_LEVEL on its own', () => {
    expect(retiredVariables({ LOG_LEVEL: 'debug' })).toEqual([]);
    expect(retiredVariables({ LOG_LEVEL: 'debug', OBSIDIAN_HOST: 'x' }).map(f => f.retired).sort()).toEqual(['LOG_LEVEL', 'OBSIDIAN_HOST']);
  });

  it('is empty for a current configuration', () => {
    expect(retiredVariables({ LATTICE_RELAY_KEY: 'k', LATTICE_RELAY_PORT: '1' })).toEqual([]);
  });
});
