# Lattice Relay

**Governed MCP projection of Lattice context, inspection, briefing, and confirmed operations.**

> **Bootstrap status:** This repository continues the history of
> [`papertray3/obsidian-mcp-bridge`](https://github.com/papertray3/obsidian-mcp-bridge).
> The imported runtime still uses the `obsidian-mcp-bridge` package and Obsidian
> plugin identities. Renaming those identifiers belongs to an accepted
> implementation plan, not the repository bootstrap.

## Lattice Context (read-only)

Relay projects Lattice Focus and Fold inspection through two read-only MCP tools:

- `lattice_orient`: where am I working?
- `lattice_fold_describe`: what is this Fold?

Every answer carries `grantsAuthority: false`, and neither tool changes Focus or the vault. Fold topology is reported only when Lattice declares it. Otherwise it is reported as explicitly unavailable, never inferred. See [Lattice Context Tools](docs/features/lattice-context.md).

## Imported Bridge Baseline

Direct API access to Obsidian for AI clients via Model Context Protocol.

## 🎯 Overview

The Obsidian MCP Bridge provides a WebSocket server running inside Obsidian that exposes vault APIs to AI clients through the Model Context Protocol (MCP). This enables AI assistants like Claude Code and Codex to directly access your Obsidian vault with full fidelity - including rendered Dataview queries, plugin integrations, and more.

### What This Provides

- **WebSocket Server** - Runs inside Obsidian, exposes vault APIs
- **MCP Servers** - Python & Node.js adapters implementing MCP protocol
- **Tool Registry** - Extensible YAML-driven system for adding custom tools
- **Plugin Integration** - Access Dataview, Metadata Menu, and other plugin APIs

> **Phase II:** For job orchestration and multi-agent workflows, see the [KANTS plugin](https://github.com/papertray3/kants)

### Key Features

✅ **Extensible Tool System** - Add custom tools via YAML without modifying plugin code
✅ **Auto-Discovery** - MCP servers automatically detect available tools from the registry
✅ **User-Scriptable** - Create custom handlers in JavaScript/TypeScript
✅ **Plugin Integration** - Execute Dataview queries, access Metadata Menu, and more
✅ **Secure by Default** - API key authentication, localhost-only binding

## 📦 Repository Structure

```
obsidian-mcp-bridge/              # ← Obsidian plugin root
├── manifest.json                 # Plugin manifest (required at root)
├── main.js                       # Compiled plugin (required at root)
├── package.json                  # Plugin dependencies
├── src/                          # Plugin source code
│   ├── main.ts                   # Entry point
│   ├── settings.ts               # Settings UI
│   ├── websocket-server.ts       # WebSocket server
│   └── tool-registry.ts          # Tool registry system
│
├── mcp-bridge/                    # Built-in tool registry (shipped with plugin)
│   ├── defaults/                 # tools.defaults.yaml - builtin tool definitions
│   └── generated/                # Auto-generated mcp-config.json (don't edit)
│
├── servers/                      # MCP Servers
│   ├── python/                   # Python MCP server
│   │   ├── obsidian_mcp_server.py
│   │   └── obsidian_mcp_server_auto.py
│   │
│   └── node/                     # Node.js MCP server
│       ├── src/
│       └── package.json
│
└── docs/                         # Documentation
    ├── guides/                   # User guides
    ├── architecture/             # Technical architecture
    ├── development/              # Contributing & publishing
    ├── features/                 # Feature documentation
    └── testing/                  # Testing guides
```

**Why this structure?** The repository **IS** the plugin - `manifest.json` and `main.js` are at the root, so you can place the entire repo in `.obsidian/plugins/` for easy testing and development.

## Architecture

```
AI Client → MCP Server (Python/Node) → WebSocket → Obsidian Plugin → Obsidian APIs
                                                           ↓
                                                   YAML Tool Registry
                                                           ↓
                                                 User Handler Scripts
```

## 🚀 Quick Start

### Plugin Installation

**Method 1: Direct Copy (for production use)**
```bash
# Copy entire repo to plugins directory
cp -r <repo-path>/obsidian-mcp-bridge <vault-path>/.obsidian/plugins/

# Or on Windows:
xcopy "<repo-path>\obsidian-mcp-bridge" ^
  "<vault-path>\.obsidian\plugins\obsidian-mcp-bridge" /E /I
```

**Method 2: Symlink (for development)**
```powershell
# Windows PowerShell
New-Item -ItemType SymbolicLink `
  -Path "<vault-path>\.obsidian\plugins\obsidian-mcp-bridge" `
  -Target "<repo-path>\obsidian-mcp-bridge"

# Linux/macOS
ln -s <repo-path>/obsidian-mcp-bridge <vault-path>/.obsidian/plugins/
```

Enable the plugin in **Obsidian Settings → Community Plugins**

### Building the Plugin

```bash
cd obsidian-mcp-bridge
npm install
npm run build    # Compiles TypeScript → main.js at root

# Development mode (auto-rebuild on changes)
npm run dev
```

### Configure MCP Server

**Python Server (recommended for auto-discovery):**
```bash
cd servers/python-old
pip install -r requirements.txt

# Set API key (get from plugin settings)
export OBSIDIAN_MCP_KEY="your-api-key-here"

# Run auto-discovery server
python obsidian_mcp_server_auto.py
```

**Node Server (alternative):**
```bash
cd servers/node-old
npm install
npm run build
npm start
```

### Connect AI Client

**Claude Code:**
```json
// ~/Library/Application Support/Claude/claude_desktop_config.json (macOS)
// %APPDATA%/Claude/claude_desktop_config.json (Windows)
{
  "mcpServers": {
    "obsidian": {
      "command": "python",
      "args": ["<repo-path>/obsidian-mcp-bridge/servers/python-old/obsidian_mcp_server_auto.py"],
      "env": {
        "OBSIDIAN_MCP_KEY": "your-api-key-from-plugin-settings"
      }
    }
  }
}
```

**Codex:**
```toml
# ~/.codex/config.toml
[[servers]]
name = "obsidian-bridge"
command = "python"
args = ["<repo-path>/obsidian-mcp-bridge/servers/python-old/obsidian_mcp_server_auto.py"]
env = { OBSIDIAN_MCP_KEY = "your-api-key-from-plugin-settings" }
```

> **Note:** Use absolute paths. The auto-discovery server (`_auto.py`) is recommended as it automatically detects all available tools from the plugin.

## Documentation

**Guides:**
- [Quick Start](docs/guides/quick-start.md) - Get up and running in 5 minutes
- [First Use](docs/guides/first-use.md) - Detailed first-time setup
- [Setup Guide](docs/guides/setup.md) - Complete installation and configuration

**Architecture:**
- [Extensibility Guide](docs/architecture/extensibility.md) - Adding custom tools
- [Architecture Improvements](docs/architecture/improvements.md) - Design decisions

**Features:**
- [Lattice Context Tools](docs/features/lattice-context.md) - Read-only `lattice_orient` and `lattice_fold_describe`
- [Dataview Integration](docs/features/dataview-blocks.md) - Execute Dataview queries
- [Digital Garden Rendering](docs/features/digital-garden.md) - Render notes with plugins

**Development:**
- [Contributing](docs/development/contributing.md) - How to contribute
- [Publishing Guide](docs/development/publishing.md) - Community plugin distribution

**Testing:**
- [Test Harness](docs/testing/test-harness.md) - Interactive testing interface
- [Testing Guide](docs/testing/) - Comprehensive testing documentation

## Configuration

### Plugin Settings
- **Host:** `127.0.0.1` (localhost only by default)
- **Port:** `27125`
- **API Key:** Auto-generated (copy to MCP server config)
- **Require Auth:** `true` (API key required for all connections)

### MCP Server Environment Variables
```bash
OBSIDIAN_HOST=localhost        # Plugin host
OBSIDIAN_PORT=27125            # Plugin port
OBSIDIAN_USE_SSL=false         # Use wss:// instead of ws://
OBSIDIAN_MCP_KEY=<api-key>     # API key from plugin settings
```

## Extensibility

The MCP Bridge uses a **YAML-based tool registry** that allows users to add custom functionality without modifying the plugin code.

### Example: Adding a Custom Tool

Tools are discovered from configured **tool search path** directories (default: `.obsidian/mcp-bridge/tools/` in your vault) - each tool is its own YAML file, with its handler script living right next to it (a `handler` path resolves relative to that YAML file's own directory).

> **Check your vault's actual configured search paths before writing anywhere** - `.obsidian/mcp-bridge/tools/` is only the out-of-the-box default (`DEFAULT_SETTINGS.toolSearchPaths` in `src/settings.ts`). It's fully reconfigurable per vault via **Settings → MCP Bridge → Tool Discovery**, or by reading `toolSearchPaths` directly from the plugin's `data.json`, and a vault that's been customized may not use the default path at all. A tool written to the default location when the vault's real search path is something else will sit there silently and never load - the registry only scans configured paths, it doesn't fall back to the default. (This vault, for example, uses `_kants/System/mcp` instead.)

**1. Create the tool definition:**
```yaml
# .obsidian/mcp-bridge/tools/count_notes.yaml
name: count_notes
description: Count total notes in vault
handler: count_notes.js
inputSchema:
  type: object
  properties: {}
```

**2. Create its handler, next to the YAML:**
```javascript
// .obsidian/mcp-bridge/tools/count_notes.js
module.exports = {
  async execute(params, context) {
    const { app } = context;
    const files = app.vault.getMarkdownFiles();
    return { totalFiles: files.length };
  }
};
```

**3. Plugin auto-reloads** - Tool is immediately available to AI assistants!

See the [Extensibility Guide](docs/architecture/extensibility.md#handler-path-resolution) for the full handler path resolution rule and more examples.

📖 **[Complete Extensibility Guide](docs/architecture/extensibility.md)** with examples and best practices.

## Security

### Current (Localhost Only)
- WebSocket binds to `127.0.0.1` only
- API key authentication controls who can invoke tools over the WebSocket connection

### No sandboxing for handler scripts
User handler scripts run with **full, unrestricted Node.js access** - the same privileges as the plugin itself (`fs`, `child_process`, network requests, arbitrary `require()`, the works). There is no sandbox, and the `sandbox_user_scripts` config flag does nothing. Only add handler scripts from sources you trust, exactly as you would an Obsidian community plugin.

See [Extensibility Guide - Security & Sandboxing](docs/architecture/extensibility.md#security--sandboxing) for the full picture.

## License

MIT
