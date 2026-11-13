# Client setup

Relay's settings tab generates a configuration for each supported client: **Settings → Lattice Relay → Connect an AI Agent → Copy Config**. Prefer the generated block over typing one by hand, because it carries the correct path, port and key.

Every client runs the same stdio server:

| Field | Value |
|---|---|
| Server name | `lattice_relay_<vault>` (for example `lattice_relay_papertrail`) |
| Command | `node` |
| Argument | `<vault>/.obsidian/plugins/lattice-relay/server/lattice-relay.mjs` |
| `LATTICE_RELAY_KEY` | The plugin's API key |
| `LATTICE_RELAY_PORT` | The plugin's port |

The MCP client prefixes tool names with the server name (for example `mcp__lattice_relay_papertrail__get_note_raw` in Claude Code). Permission allowlists written for an older server name need updating too.

## Where each client keeps its configuration

| Client | File | Format |
|---|---|---|
| Claude Code | `<vault>/.mcp.json` (project scope) | `mcpServers` JSON |
| Codex | `~/.codex/config.toml` | `[mcp_servers.<name>]` TOML |
| Gemini CLI | `~/.gemini/settings.json` | `mcpServers` JSON |
| OpenCode | `~/.config/opencode/opencode.json` | `mcp` JSON (`type: local`) |
| Kiro | `<vault>/.kiro/settings/mcp.json` | `mcpServers` JSON |
| Mistral Vibe, Hermes Agent | see settings tab | best effort; the tab flags unverified formats |

## Example (Claude Code, key shown as a placeholder)

```json
{
  "mcpServers": {
    "lattice_relay_myvault": {
      "command": "node",
      "args": ["C:/path/to/MyVault/.obsidian/plugins/lattice-relay/server/lattice-relay.mjs"],
      "env": {
        "LATTICE_RELAY_KEY": "<copy your key here>",
        "LATTICE_RELAY_PORT": "27125"
      }
    }
  }
}
```

These files hold a credential. Keep them out of Git, notes, issues, and chat. If the vault is a Git repository, make sure its `.gitignore` covers `.mcp.json`.

## Optional variables

`LATTICE_RELAY_HOST`, `LATTICE_RELAY_USE_SSL` and `LATTICE_RELAY_LOG_LEVEL` are described in the [README](../../README.md#configuration). Local setups don't need them.

## Protocol

The server uses the official MCP TypeScript SDK and negotiates the newest protocol version both sides support. The release manifest records the exact SDK version and latest protocol version (`mcp` section). It exposes the `tools` capability only: `tools/list` and `tools/call`.
