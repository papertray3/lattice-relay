# Lattice Relay

**The governed MCP boundary between [Lattice](https://github.com/papertray3) and agent clients.**

Relay is an Obsidian plugin plus a small stdio MCP server. The plugin runs an authenticated WebSocket server inside Obsidian, which exposes vault tools and read-only Lattice context. The server is what an MCP client (Claude Code, Codex, Gemini CLI, and others) launches: it speaks MCP over stdio and forwards each request to the plugin.

```
MCP client ──stdio──▶ server/lattice-relay.mjs ──ws://127.0.0.1:<port> + key──▶ Lattice Relay plugin ──▶ vault, Lattice public APIs
```

Relay owns transport, tool registration, and response envelopes. Lattice owns Fold state, governance, and authority. Connecting through Relay grants no authority to change anything.

## Lattice context (read-only)

- `lattice_orient`: where am I working?
- `lattice_fold_describe`: what is this Fold?

Every answer carries `grantsAuthority: false`, and neither tool changes Focus or the vault. See [Lattice Context Tools](docs/features/lattice-context.md).

Lattice can also register its own tools through Relay's plugin API (`app.plugins.plugins['lattice-relay'].api`). For example, Foundry registers `lattice_blueprint_draft`.

## Install

Relay ships as a release directory, `lattice-relay/`, that you copy into `<vault>/.obsidian/plugins/`:

```
lattice-relay/
  manifest.json  main.js  test-harness.html  LICENSE
  defaults/tools.defaults.yaml
  server/lattice-relay.mjs        # self-contained stdio MCP server (Node 20+)
```

Enable **Lattice Relay** in Obsidian, then copy a client configuration from **Settings → Lattice Relay → Connect an AI Agent**. Full steps: [Install and configure](docs/guides/install.md). Clients: [Client setup](docs/guides/client-setup.md).

**Upgrading from MCP Bridge** (`obsidian-mcp-bridge`)? Relay 0.1.0 deliberately changes the plugin ID, directory, environment variables, and server path. Use the guided migration and its rollback: [Upgrade from MCP Bridge](docs/guides/upgrade-from-bridge.md).

## Configuration

| Plugin setting | Default | Notes |
|---|---|---|
| Host | `127.0.0.1` | Loopback only unless remote access is enabled |
| Port | `27125` | One process per port; never run two Relay/Bridge plugins on the same port |
| API key | generated on first load | Machine-local; never commit or paste it into notes |
| Require auth | `true` | |
| Tool search paths | `.obsidian/lattice-relay/tools` | Per vault; tools load only from configured paths |
| Render cache | `.obsidian/cache/lattice-relay-render` | Disposable |

Server environment, written for you by the generated client configuration:

| Variable | Default | |
|---|---|---|
| `LATTICE_RELAY_KEY` | (none) | API key from the plugin settings |
| `LATTICE_RELAY_PORT` | `27125` | Must match the plugin port |
| `LATTICE_RELAY_HOST` | `localhost` | Only for non-local setups |
| `LATTICE_RELAY_USE_SSL` | `false` | `wss://` for remote setups with a certificate |
| `LATTICE_RELAY_LOG_LEVEL` | `info` | `debug`, `info`, `warn`, `error`; logs go to stderr and `<tmp>/lattice-relay-server.log` |

The server does not read the retired MCP Bridge variables. If it sees one, it logs the name of its replacement.

## Custom tools

Tools are YAML files, each with an optional handler script next to it, found in the configured **tool search paths**:

```yaml
# .obsidian/lattice-relay/tools/count_notes.yaml
name: count_notes
description: Count total notes in vault
handler: count_notes.js
inputSchema: { type: object, properties: {} }
```

```javascript
// .obsidian/lattice-relay/tools/count_notes.js
module.exports = {
  async execute(params, { app }) {
    return { totalFiles: app.vault.getMarkdownFiles().length };
  }
};
```

Check the vault's configured search paths first: the registry only scans configured paths. See [Extensibility](docs/architecture/extensibility.md) and [Tool YAML format](docs/guides/tool-yaml-format.md).

## Security

- The WebSocket binds to `127.0.0.1` by default, and every request must carry the API key.
- Handler scripts run with full Node.js access and are not sandboxed. Only install tools you trust.
- Remote access and SSL are off by default. Turning them on exposes vault tools beyond this machine.

## Documentation

- Guides: [Install](docs/guides/install.md) · [Client setup](docs/guides/client-setup.md) · [Upgrade from MCP Bridge](docs/guides/upgrade-from-bridge.md) · [Agent SOP](docs/guides/agent-sop.md) · [Tool YAML format](docs/guides/tool-yaml-format.md)
- Features: [Lattice context](docs/features/lattice-context.md) · [Dataview blocks](docs/features/dataview-blocks.md) · [Digital Garden rendering](docs/features/digital-garden.md)
- Architecture: [Extensibility](docs/architecture/extensibility.md)
- Development: [Contributing](docs/development/contributing.md) · [Releasing](docs/development/releasing.md) · [Test harness](docs/testing/test-harness.md)
- History: [MCP Bridge lineage](docs/history/bridge/README.md). Bridge-era documents, including the retired Python servers, are kept there for reference only and are not supported.

## Lineage

Relay continues the history of [`papertray3/obsidian-mcp-bridge`](https://github.com/papertray3/obsidian-mcp-bridge). Bridge 2.0.0, its Node server 1.0.0, and the Python servers are historical. Relay starts its own version line at 0.1.0.

## License

MIT
