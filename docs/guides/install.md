# Install and configure Lattice Relay

This guide is for a clean install. If the vault already runs MCP Bridge (`obsidian-mcp-bridge`), follow [Upgrade from MCP Bridge](upgrade-from-bridge.md) instead. Running both plugins at once is not supported.

## Requirements

- Obsidian desktop 1.4.0 or later (Relay is desktop-only).
- Node.js 20 or later on `PATH`. MCP clients launch the server with `node`.
- A Relay release directory, `release/lattice-relay-<version>/lattice-relay/`, either built yourself ([Releasing](../development/releasing.md)) or from a published release.

## 1. Install the plugin

1. Close the vault in Obsidian.
2. Copy the release's `lattice-relay/` directory to `<vault>/.obsidian/plugins/lattice-relay/`.
3. Reopen the vault and enable **Lattice Relay** under **Settings → Community plugins**.

On first load Relay generates an API key, starts the WebSocket server on `127.0.0.1:27125`, and shows `Lattice Relay: <n> tools` in the status bar.

Check the [release manifest](../development/releasing.md#release-manifest) hashes before installing a build you didn't make yourself.

## 2. Choose the port

Each vault needs its own port if more than one vault runs Relay at the same time. Change **Settings → Lattice Relay → Connection Settings → Port**, then restart the server from the command palette with **Lattice Relay: Restart WebSocket Server**.

## 3. Connect a client

Open **Settings → Lattice Relay → Connect an AI Agent**, pick your client, and press **Copy Config**. The copied block includes the real API key, so paste it only into that client's local configuration file, never into notes, issues, or chat. See [Client setup](client-setup.md).

The generated entry is named `lattice_relay_<vault>` and launches:

```
node <vault>/.obsidian/plugins/lattice-relay/server/lattice-relay.mjs
```

with `LATTICE_RELAY_KEY` and `LATTICE_RELAY_PORT` set.

## 4. Verify

From the client, list tools and call `ping`, then `lattice_orient`. If Lattice is installed and enabled, `lattice_orient` reports the current Fold (or none) with `grantsAuthority: false`.

## Custom tools

Relay loads custom tools only from the **Tool Discovery → Tool search paths** setting. The default is `.obsidian/lattice-relay/tools`. See [Extensibility](../architecture/extensibility.md).

## Troubleshooting

| Symptom | Check |
|---|---|
| Client lists tools but every call says `Not connected to Obsidian` | Is Obsidian open with Relay enabled? Do `LATTICE_RELAY_PORT` and the plugin port match? |
| Calls fail with `Unauthorized` | The client's `LATTICE_RELAY_KEY` doesn't match the plugin key. Copy the config again. |
| Server log says `OBSIDIAN_MCP_KEY is no longer read` | The client still has a Bridge-era configuration. Replace it with a freshly copied Relay config. |
| `Failed to start server` notice | Another process (often an old Bridge plugin) holds the port. Disable it or change the port. |
| A custom tool doesn't appear | Its folder isn't in **Tool search paths**, or its YAML failed validation (see the developer console). |

Server diagnostics go to the client's stderr log and to `<os tmp>/lattice-relay-server.log`. Set `LATTICE_RELAY_LOG_LEVEL=debug` in the client config for more detail.

## Uninstall

Disable the plugin, then delete `<vault>/.obsidian/plugins/lattice-relay/`. Remove the `lattice_relay_<vault>` entry from each client. User tools under `.obsidian/lattice-relay/tools` and the render cache under `.obsidian/cache/lattice-relay-render` are yours to keep or delete.
