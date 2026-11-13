# lattice-relay-server

The Lattice Relay stdio MCP server. An MCP client launches it. It speaks MCP over stdin/stdout using the official TypeScript SDK and forwards tool calls to the Lattice Relay Obsidian plugin over an authenticated WebSocket.

```
MCP client ──stdio──▶ lattice-relay-server ──ws + LATTICE_RELAY_KEY──▶ Lattice Relay plugin (Obsidian)
```

- `tools/list` asks the plugin first. If the plugin is unreachable, it falls back to the plugin's last generated `generated/mcp-config.json`, then to a small built-in list.
- `tools/call` runs one of the built-in handlers in `src/tools/` or forwards the call unchanged to the plugin. Plugin and connection failures come back as tool errors (`isError: true`), not protocol errors.
- Closing stdin shuts the server down.

## Release form

Releases don't ship this package's `node_modules`. `npm run server:bundle` (from the repository root) bundles it into one file, `server/lattice-relay.mjs`, inside the plugin directory. Clients run it with `node`.

## Environment

| Variable | Default |
|---|---|
| `LATTICE_RELAY_KEY` | (none) |
| `LATTICE_RELAY_PORT` | `27125` |
| `LATTICE_RELAY_HOST` | `localhost` |
| `LATTICE_RELAY_USE_SSL` | `false` |
| `LATTICE_RELAY_LOG_LEVEL` | `info` |

`.env` files are not read: clients pass the environment explicitly. Retired Bridge-era names are ignored, and each one is reported by name with its replacement.

## Development

```
npm ci
npm run typecheck
npm run lint
npm test
```

From the repository root, `node scripts/smoke-server.mjs build/server/lattice-relay.mjs` drives a built bundle over real stdio.
