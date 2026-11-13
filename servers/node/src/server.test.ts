import { afterEach, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { createRelayServer, SERVER_NAME, type PluginConnection, type RelayServerOptions } from './server.js';
import { RELAY_VERSION } from './version.js';

class FakeConnection implements PluginConnection {
  connected = false;
  failConnect = false;
  calls: Array<{ method: string; params: Record<string, unknown> }> = [];
  responses = new Map<string, unknown>();
  isConnected() { return this.connected; }
  async connect() {
    if (this.failConnect) throw new Error('ECONNREFUSED');
    this.connected = true;
  }
  async call(method: string, params: Record<string, unknown> = {}) {
    this.calls.push({ method, params });
    const response = this.responses.get(method);
    if (response instanceof Error) throw response;
    return response;
  }
}

const localTool = { name: 'local_tool', description: 'local', inputSchema: { type: 'object' as const, properties: {} } };
const tmpDirs: string[] = [];

async function connect(overrides: Partial<RelayServerOptions> = {}) {
  const connection = (overrides.connection as FakeConnection | undefined) ?? new FakeConnection();
  const server = createRelayServer({
    localHandlers: { local_tool: async (caller, args) => `local:${JSON.stringify(args)}:${String(await caller.call('ping'))}` },
    localDefinitions: [localTool],
    generatedConfigPaths: [],
    ...overrides,
    connection,
  });
  const client = new Client({ name: 'relay-test', version: '0.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return { client, server, connection };
}

function text(result: Awaited<ReturnType<Client['callTool']>>): string {
  return (result.content as Array<{ text: string }>)[0]!.text;
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('Relay MCP server', () => {
  it('identifies as lattice-relay at the release version with the tools capability', async () => {
    const { client, server } = await connect();
    expect(SERVER_NAME).toBe('lattice-relay');
    expect(client.getServerVersion()).toEqual({ name: 'lattice-relay', version: RELAY_VERSION });
    expect(client.getServerCapabilities()?.tools).toBeDefined();
    await client.close();
    await server.close();
  });

  it('lists the plugin tools when the plugin answers', async () => {
    const connection = new FakeConnection();
    connection.responses.set('tools/list', { tools: [{ name: 'lattice_orient', description: 'x', inputSchema: { type: 'object', properties: {} } }] });
    const { client } = await connect({ connection });
    expect((await client.listTools()).tools.map(t => t.name)).toEqual(['lattice_orient']);
  });

  it('falls back to the generated config, then to local definitions, when the plugin is unreachable', async () => {
    const connection = new FakeConnection();
    connection.failConnect = true;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'relay-generated-'));
    tmpDirs.push(dir);
    const generated = path.join(dir, 'mcp-config.json');
    fs.writeFileSync(generated, JSON.stringify({ tools: [{ name: 'from_file', inputSchema: { type: 'object' } }] }));

    const withFile = await connect({ connection, generatedConfigPaths: [path.join(dir, 'missing.json'), generated] });
    expect((await withFile.client.listTools()).tools.map(t => t.name)).toEqual(['from_file']);

    const withoutFile = await connect({ connection, generatedConfigPaths: [path.join(dir, 'missing.json')] });
    expect((await withoutFile.client.listTools()).tools.map(t => t.name)).toEqual(['local_tool']);
  });

  it('forwards unknown tools to the plugin and returns objects as JSON text', async () => {
    const connection = new FakeConnection();
    connection.responses.set('lattice_orient', { status: 'ok', n: 1 });
    const { client } = await connect({ connection });
    const result = await client.callTool({ name: 'lattice_orient', arguments: { detail: 'brief' } });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(text(result))).toEqual({ status: 'ok', n: 1 });
    // One tools/list first to learn output schemas, then the forwarded call, unchanged.
    expect(connection.calls).toEqual([
      { method: 'tools/list', params: {} },
      { method: 'lattice_orient', params: { detail: 'brief' } },
    ]);
  });

  it('prefers a local handler over forwarding', async () => {
    const connection = new FakeConnection();
    connection.responses.set('ping', 'pong');
    const { client } = await connect({ connection });
    expect(text(await client.callTool({ name: 'local_tool', arguments: { a: 1 } }))).toBe('local:{"a":1}:pong');
  });

  describe('structured results (MCP output schemas)', () => {
    const outputSchema = { type: 'object', properties: { status: { type: 'string' } }, required: ['status'] };
    const schemaTools = [
      { name: 'ping', inputSchema: { type: 'object', properties: {} }, outputSchema },
      { name: 'stats', inputSchema: { type: 'object', properties: {} }, outputSchema },
      { name: 'free_text', inputSchema: { type: 'object', properties: {} } },
    ];

    function schemaConnection() {
      const connection = new FakeConnection();
      connection.responses.set('tools/list', { tools: schemaTools });
      return connection;
    }

    it('returns structuredContent for a forwarded object result, which SDK clients require', async () => {
      const connection = schemaConnection();
      connection.responses.set('stats', { status: 'ok', count: 3 });
      const { client } = await connect({ connection });
      await client.listTools();
      const result = await client.callTool({ name: 'stats', arguments: {} });
      expect(result.isError).toBeFalsy();
      expect(result.structuredContent).toEqual({ status: 'ok', count: 3 });
      expect(JSON.parse(text(result))).toEqual({ status: 'ok', count: 3 });
    });

    it('parses a local handler JSON string into structuredContent', async () => {
      const connection = schemaConnection();
      connection.responses.set('ping', { status: 'pong' });
      const { client } = await connect({
        connection,
        localHandlers: { ping: async caller => JSON.stringify(await caller.call('ping')) },
      });
      await client.listTools();
      const result = await client.callTool({ name: 'ping', arguments: {} });
      expect(result.structuredContent).toEqual({ status: 'pong' });
    });

    it('learns output schemas even when the client calls before listing', async () => {
      const connection = schemaConnection();
      connection.responses.set('stats', 'not json');
      const { client } = await connect({ connection });
      const result = await client.callTool({ name: 'stats', arguments: {} });
      expect(result.isError).toBe(true);
      expect(text(result)).toMatch(/declares an output schema but returned string/);
    });

    it('leaves plain-text results of schema-less tools alone', async () => {
      const connection = schemaConnection();
      connection.responses.set('free_text', 'hello');
      const { client } = await connect({ connection });
      await client.listTools();
      const result = await client.callTool({ name: 'free_text', arguments: {} });
      expect(result.isError).toBeFalsy();
      expect(result.structuredContent).toBeUndefined();
      expect(text(result)).toBe('hello');
    });
  });

  it('reports plugin errors and an unreachable plugin as tool errors, not protocol failures', async () => {
    const connection = new FakeConnection();
    connection.responses.set('broken', new Error('Unauthorized'));
    const { client } = await connect({ connection });
    const failed = await client.callTool({ name: 'broken', arguments: {} });
    expect(failed.isError).toBe(true);
    expect(text(failed)).toBe('Error: Unauthorized');

    const offline = new FakeConnection();
    offline.failConnect = true;
    const second = await connect({ connection: offline });
    const unreachable = await second.client.callTool({ name: 'anything', arguments: {} });
    expect(unreachable.isError).toBe(true);
    expect(text(unreachable)).toContain('Not connected to Obsidian. ECONNREFUSED');
  });
});
