import { afterEach, describe, expect, it } from 'vitest';
import { WebSocketServer, type WebSocket } from 'ws';
import type { AddressInfo } from 'net';

import { loadConfig } from './config.js';
import { ObsidianWebSocketClient } from './websocket-client.js';

let wss: WebSocketServer | undefined;
let client: ObsidianWebSocketClient | undefined;

async function startPlugin(onMessage: (socket: WebSocket, message: { auth: string; method: string; params: unknown; id: string }) => void): Promise<number> {
  wss = new WebSocketServer({ host: '127.0.0.1', port: 0 });
  wss.on('connection', socket => socket.on('message', data => onMessage(socket, JSON.parse(data.toString()))));
  await new Promise<void>(resolve => wss!.once('listening', () => resolve()));
  return (wss.address() as AddressInfo).port;
}

function relayClient(port: number, key = 'test-key'): ObsidianWebSocketClient {
  const config = loadConfig({ LATTICE_RELAY_KEY: key, LATTICE_RELAY_HOST: '127.0.0.1', LATTICE_RELAY_PORT: String(port) });
  client = new ObsidianWebSocketClient(config, `ws://127.0.0.1:${port}`);
  return client;
}

afterEach(async () => {
  await client?.close();
  client = undefined;
  await new Promise<void>(resolve => (wss ? wss.close(() => resolve()) : resolve()));
  wss = undefined;
});

describe('ObsidianWebSocketClient', () => {
  it('sends the Relay key with each request and resolves the matching response', async () => {
    const seen: Array<{ auth: string; method: string; params: unknown }> = [];
    const port = await startPlugin((socket, message) => {
      seen.push({ auth: message.auth, method: message.method, params: message.params });
      socket.send(JSON.stringify({ id: 'unrelated-broadcast', result: 'ignored' }));
      socket.send(JSON.stringify({ id: message.id, result: { echoed: message.params } }));
    });
    const relay = relayClient(port);
    await relay.connect();
    expect(relay.isConnected()).toBe(true);
    await expect(relay.call('lattice_orient', { detail: 'brief' })).resolves.toEqual({ echoed: { detail: 'brief' } });
    expect(seen).toEqual([{ auth: 'test-key', method: 'lattice_orient', params: { detail: 'brief' } }]);
  });

  it('rejects with the plugin error message', async () => {
    const port = await startPlugin((socket, message) => socket.send(JSON.stringify({ id: message.id, error: 'Unauthorized' })));
    const relay = relayClient(port, 'wrong');
    await relay.connect();
    await expect(relay.call('ping')).rejects.toThrow('Unauthorized');
  });

  it('fails to connect when no plugin is listening', async () => {
    const port = await startPlugin(() => undefined);
    await new Promise<void>(resolve => wss!.close(() => resolve()));
    wss = undefined;
    await expect(relayClient(port).connect()).rejects.toBeDefined();
  });
});
