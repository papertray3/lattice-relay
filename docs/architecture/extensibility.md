# Lattice Relay Extensibility Architecture

**Status:** Phase 1 (YAML + Script Registry)

This document describes how to extend the Lattice Relay plugin with custom tools without modifying the plugin code.

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [File Structure](#file-structure)
- [YAML Schema Format](#yaml-schema-format)
- [Handler Scripts](#handler-scripts)
  - [Handler Path Resolution](#handler-path-resolution)
- [Adding Custom Tools](#adding-custom-tools)
- [Built-in vs User Tools](#built-in-vs-user-tools)
- [Security & Sandboxing](#security--sandboxing)
- [Examples](#examples)
- [Future: Auto-Generation (Phase 2)](#future-auto-generation-phase-2)

---

## Overview

The Lattice Relay plugin uses a **YAML-driven tool registry** as the single source of truth for all available tools. This allows users to:

- ✅ Add custom tools without modifying plugin code
- ✅ Write handler scripts in JavaScript
- ✅ Access the full Obsidian API from handlers
- ✅ Keep WebSocket server and MCP server configs in sync
- ✅ Hot-reload tools when files change

**Design Philosophy:**

- **YAML as Schema:** Single source of truth for tool definitions
- **Scripts as Implementation:** Separate handler logic from schema
- **Plugin as Platform:** Core plugin loads and orchestrates user tools
- **Zero Plugin Recompilation:** Add tools by editing files, not code

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Lattice Relay Plugin                     │
│  ┌────────────────────────────────────────────────────┐ │
│  │          Tool Registry (tools.yaml)                │ │
│  │  • Reads YAML at startup                           │ │
│  │  • Watches for changes (hot-reload)                │ │
│  │  • Validates schemas                               │ │
│  └────────────────────────────────────────────────────┘ │
│                          ↓                               │
│  ┌────────────────────────────────────────────────────┐ │
│  │          Handler Loader                            │ │
│  │  • Loads builtin handlers (in plugin)             │ │
│  │  • Loads user handlers (from vault, via require()) │ │
│  │  • No sandboxing - see Security & Sandboxing below │ │
│  └────────────────────────────────────────────────────┘ │
│                          ↓                               │
│  ┌────────────────────────────────────────────────────┐ │
│  │          WebSocket Server                          │ │
│  │  • Serves tools via JSON-RPC                      │ │
│  │  • Routes requests to handlers                    │ │
│  └────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
                          ↓
                  WebSocket Connection
                          ↓
┌─────────────────────────────────────────────────────────┐
│                    MCP Server                            │
│  • Reads generated config                               │
│  • Exposes tools to AI assistants                       │
│  • Forwards requests to WebSocket                       │
└─────────────────────────────────────────────────────────┘
                          ↓
                    AI Assistant (Claude)
```

---

## File Structure

Built-in tools are defined in the plugin's own `defaults/tools.defaults.yaml` and implemented in plugin code (`handler: builtin`) - you never touch these directly.

User tools are discovered by scanning every directory listed in the plugin's **tool search paths** setting (configurable in Obsidian Settings → Lattice Relay → Tool Discovery) for `.yaml`/`.yml` files, one tool definition per file. Each search path directory is independent and can live anywhere - inside the vault, inside another plugin's folder, wherever is convenient:

```
<a configured tool search path>/
├── my_tool.yaml           # Tool definition
├── my_tool.js             # Its handler - see "Handler Path Resolution" below
├── another_tool.yaml
└── another_tool.js
```

Tools added via the "Custom Tools" section of plugin settings are written to `.obsidian/lattice-relay/tools/` in the vault - which only becomes a real search path if it's also listed under Tool Discovery (it is by default).

**Key locations:**

- **`defaults/tools.defaults.yaml`** (plugin dir) - built-in tool definitions, shipped with the plugin
- **Configured tool search paths** - where user tool `.yaml` + handler `.js` pairs live (see below)
- **`generated/mcp-config.json`** (plugin dir) - auto-generated MCP server config; don't edit manually

---

## YAML Schema Format

### Basic Structure

```yaml
version: 2.0

config:
  # Global settings
  auto_reload: true                # Watch for file changes
  sandbox_user_scripts: true       # Reserved for future use - currently has no effect, see Security & Sandboxing
  enable_auto_generation: false    # Phase 2: auto-gen from classes

tools:
  # Built-in tools (part of plugin)
  builtin:
    - name: search_files
      description: Search for files matching a pattern
      handler: builtin              # Special keyword for core handlers
      inputSchema:
        type: object
        properties:
          pattern:
            type: string
            description: Glob pattern (e.g., "*.md", "Notes/**/*.md")
        required: [pattern]

    - name: get_note_raw
      description: Get raw markdown content of a note
      handler: builtin
      inputSchema:
        type: object
        properties:
          filepath:
            type: string
            description: Path to note (relative to vault root)
        required: [filepath]

  # User-added custom tools
  user:
    - name: my_custom_tool
      description: A custom tool I created
      handler: my_tool.js            # Path relative to this YAML file's own directory - see Handler Path Resolution
      inputSchema:
        type: object
        properties:
          param1:
            type: string
            description: Description of parameter
          param2:
            type: number
            description: Another parameter
        required: [param1]
```

### Tool Definition Fields

| Field | Required | Description |
|-------|----------|-------------|
| `name` | ✅ Yes | Unique identifier for the tool (snake_case recommended) |
| `description` | ✅ Yes | Clear description of what the tool does (used by AI) |
| `handler` | ✅ Yes | Either "builtin", an absolute path, or a path relative to this YAML file's own directory (e.g., "my_tool.js") - see [Handler Path Resolution](#handler-path-resolution) |
| `inputSchema` | ✅ Yes | JSON Schema for tool parameters. Both shown to AI clients (via `tools/list`) *and enforced*: every call is validated against it before your handler ever runs, so a call missing a required field or with a wrong type is rejected with a clear error instead of reaching your code |
| `outputSchema` | ❌ No | JSON Schema for return value (optional, for documentation) |
| `tags` | ❌ No | Array of tags for organization |
| `category` | ❌ No | Category for grouping (e.g., "notes", "search", "analysis") |

### Input Schema Format

Uses standard JSON Schema (same as MCP protocol):

```yaml
inputSchema:
  type: object
  properties:
    # String parameter
    filepath:
      type: string
      description: Path to the file

    # Number parameter
    limit:
      type: number
      description: Maximum number of results
      default: 10

    # Boolean parameter
    includeArchived:
      type: boolean
      description: Include archived notes
      default: false

    # Array parameter
    tags:
      type: array
      items:
        type: string
      description: List of tags to filter by

    # Object parameter
    options:
      type: object
      properties:
        caseSensitive:
          type: boolean
        maxDepth:
          type: number

  required: [filepath]  # List of required parameters
```

---

## Handler Scripts

### Handler Path Resolution

A tool's `handler` value is resolved by exactly one rule, applied in this order:

1. **Absolute path** → used as-is.
2. **Relative path** → resolved relative to the directory containing that tool's own YAML file. In other words: **put the handler script next to its YAML definition** (optionally in a subfolder, e.g. `handler: scripts/my_tool.js`).

That's it - there's no search across the plugin directory, the vault config directory, or any other guessed location. If a handler doesn't load, the log names the exact single path that was tried, so there's one place to look.

(Earlier versions of this plugin tried several candidate directories per handler, silently falling through to the first one that matched. That made failures hard to diagnose and made deployment layout ambiguous, so it was replaced with the co-location rule above.)

### Handler Format

Every handler script must export an object with an `execute` function:

```javascript
// my_tool.js, next to my_tool.yaml

module.exports = {
  /**
   * Execute the tool
   *
   * @param {Object} params - Parameters from YAML inputSchema
   * @param {Object} context - Obsidian API context
   * @returns {Promise<any>} - Result returned to AI assistant
   */
  async execute(params, context) {
    // Your implementation here

    return {
      // Return data
    };
  }
};
```

### Context Object

The `context` parameter provides access to Obsidian APIs. This mirrors the real `HandlerContext` shape built by `ToolRegistry.createContext()` in `src/tool-registry.ts`:

```javascript
const context = {
  app,             // Obsidian App instance
  vault,           // Vault API (read/write files)
  workspace,       // Workspace API (UI, tabs, etc.)
  metadataCache,   // Metadata cache (frontmatter, links)
  fileManager,     // File operations

  // Other installed plugins, keyed by plugin id - only entries for plugins
  // that are actually installed and enabled are present. Currently allow-listed:
  // 'dataview', 'metadata-menu', 'smart-connections', 'digital-garden', 'templater'.
  plugins: {
    dataview: app.plugins.plugins['dataview'],
    // ... etc, only if installed
  },
};
```

There is no `context.utils` helper object - handlers that need path sanitization, date formatting, or similar should bring their own logic (or, as noted in [Security & Sandboxing](#security--sandboxing), `require()` whatever they need directly).

### Example: Simple Handler

```javascript
// count_words.js

module.exports = {
  async execute(params, context) {
    const { filepath } = params;
    const { vault } = context;

    // Read file
    const file = vault.getAbstractFileByPath(filepath);
    if (!file) {
      throw new Error(`File not found: ${filepath}`);
    }

    const content = await vault.read(file);

    // Count words
    const words = content.split(/\s+/).filter(w => w.length > 0);

    return {
      filepath: filepath,
      wordCount: words.length,
      characterCount: content.length
    };
  }
};
```

### Example: Using Other Plugins

```javascript
// query_dataview.js

module.exports = {
  async execute(params, context) {
    const { query } = params;
    const { plugins, app } = context;

    // Check if Dataview is installed
    if (!plugins.dataview) {
      throw new Error('Dataview plugin not installed');
    }

    const dv = plugins.dataview.api;

    // Execute query
    const results = await dv.query(query);

    return {
      success: true,
      results: results.values
    };
  }
};
```

### Example: Creating a Note

```javascript
// create_note.js

module.exports = {
  async execute(params, context) {
    const { path, content, frontmatter } = params;
    const { vault } = context;

    // Build frontmatter
    let fullContent = '';
    if (frontmatter) {
      fullContent += '---\n';
      for (const [key, value] of Object.entries(frontmatter)) {
        fullContent += `${key}: ${value}\n`;
      }
      fullContent += '---\n\n';
    }
    fullContent += content;

    // Create file
    await vault.create(path, fullContent);

    return {
      success: true,
      path: path
    };
  }
};
```

---

## Adding Custom Tools

### Step-by-Step Guide

This uses the default tool search path, `.obsidian/lattice-relay/tools/` in your vault (see Obsidian Settings → Lattice Relay → Tool Discovery for the full list of configured search paths - you can add your own).

**1. Create the tool's YAML definition and its handler script, side by side:**

```bash
mkdir -p .obsidian/lattice-relay/tools
touch .obsidian/lattice-relay/tools/my_tool.yaml
touch .obsidian/lattice-relay/tools/my_tool.js
```

**2. Write the YAML definition** (one tool per file - this is a standalone YAML document, not an entry appended to a shared list):

```yaml
# .obsidian/lattice-relay/tools/my_tool.yaml
name: my_tool
description: Counts all markdown files in vault
handler: my_tool.js   # relative to this file's own directory - see Handler Path Resolution
inputSchema:
  type: object
  properties: {}       # No parameters for this tool
```

**3. Write the handler**, in the same directory as its YAML:

```javascript
// .obsidian/lattice-relay/tools/my_tool.js

module.exports = {
  async execute(params, context) {
    const { vault } = context;

    // Your logic here
    const files = vault.getMarkdownFiles();

    return {
      totalFiles: files.length
    };
  }
};
```

**4. Reload the plugin:**

- If `auto_reload: true` in config, changes are detected automatically
- Otherwise, run command: "Lattice Relay: Reload Tool Registry"
- Or restart Obsidian

**5. Test your tool:**

The tool is now available to any MCP server connected to Relay!

---

## Built-in vs User Tools

### Built-in Tools

Built-in tools are part of the plugin codebase and use `handler: builtin`:

```yaml
builtin:
  - name: search_files
    handler: builtin
    # ...
```

These are implemented in the plugin's TypeScript code and provide core functionality:

- `ping` - Connectivity test
- `search_files` - File search with glob patterns
- `get_note_raw` - Read note content
- `list_vault_files` - List all files in vault
- _(more to come in future versions)_

**When to use built-in:**
- Core functionality used by most users
- Requires deep plugin integration
- Performance-critical operations

### User Tools

User tools are defined by a YAML file in one of your configured tool search paths, with a handler script next to it:

```yaml
name: my_custom_tool
handler: my_custom_tool.js
# ...
```

**When to use user tools:**
- Custom workflows specific to your vault
- Integrations with other plugins
- Experimental features
- Personal automation scripts

---

## Security & Sandboxing

### There is no sandbox

**User handler scripts run with the same privileges as the plugin itself - full Node.js access, unrestricted.** They are loaded with a plain CommonJS `require()` call (see `ToolRegistry.loadHandlers()` in `src/tool-registry.ts`), not inside a VM, worker thread, or any other isolation boundary. A handler script can, without restriction:

- `require('fs')`, `require('child_process')`, `require('http')` - or any other Node.js built-in or installed npm package reachable from its location
- Read, write, or delete **any file the Obsidian process can reach**, not just files inside the vault
- Make arbitrary outbound network requests
- Spawn processes

The `config.sandbox_user_scripts` field in `tools.yaml` **does nothing**. It is not read anywhere in the codebase - setting it to `false` has no effect, because there is no restriction for it to lift. Treat it as reserved/aspirational, not as an active setting, until this doc says otherwise.

### What this means for you

Adding a handler script to one of your tool search paths is exactly as trusting as installing any other Obsidian community plugin, or any VS Code extension: the code runs with your full user-level permissions. The plugin's WebSocket API-key authentication controls **who can invoke a tool over the network** - it is a separate boundary from **what an installed handler is allowed to do once invoked**, and it provides no protection against a malicious or buggy handler script.

### Best Practices

Given the above, these aren't optional hardening tips - they're the only protection you currently have:

1. **Review every handler script before adding it** - read the whole file; don't copy/paste code you haven't inspected
2. **Only add handlers from sources you trust** - the same bar you'd apply to installing a plugin
3. **Version control your handlers** - so you can see exactly what changed and when
4. **Test with a non-critical vault first** - before pointing a new handler at data you care about
5. **Prefer the provided Obsidian APIs** (`context.vault`, `context.app`, etc.) over reaching for `fs`/`child_process` directly - not because it's enforced, but because it keeps your handler's blast radius small and its behavior predictable

If real sandboxing (a VM, a worker thread with a restricted API surface, or similar) gets implemented in a future phase, this section will be updated to describe the actual enforced boundary - see the [phased refactoring notes](../history/bridge/eval-20260831.md) for where that sits in the roadmap.

---

## Examples

### Example 1: Vault Statistics

**YAML definition:**

```yaml
name: get_vault_stats
description: Get comprehensive vault statistics
handler: vault_stats.js
inputSchema:
  type: object
  properties:
    includeArchived:
      type: boolean
      description: Include archived notes in statistics
      default: false
```

**Handler:**

```javascript
// vault_stats.js

module.exports = {
  async execute(params, context) {
    const { includeArchived = false } = params;
    const { vault, metadataCache } = context;

    const files = vault.getMarkdownFiles();
    let totalWords = 0;
    let totalLinks = 0;
    let totalTags = new Set();

    for (const file of files) {
      // Skip archived if needed
      if (!includeArchived && file.path.includes('Archive')) {
        continue;
      }

      // Read content
      const content = await vault.read(file);
      const words = content.split(/\s+/).filter(w => w.length > 0);
      totalWords += words.length;

      // Get metadata
      const cache = metadataCache.getFileCache(file);
      if (cache) {
        totalLinks += (cache.links || []).length;
        (cache.tags || []).forEach(tag => totalTags.add(tag.tag));
      }
    }

    return {
      totalNotes: files.length,
      totalWords: totalWords,
      totalLinks: totalLinks,
      uniqueTags: totalTags.size,
      tags: Array.from(totalTags)
    };
  }
};
```

### Example 2: Find Orphaned Notes

**YAML definition:**

```yaml
name: find_orphaned_notes
description: Find notes with no incoming or outgoing links
handler: find_orphans.js
inputSchema:
  type: object
  properties:
    folder:
      type: string
      description: Optional folder to search within
```

**Handler:**

```javascript
// find_orphans.js

module.exports = {
  async execute(params, context) {
    const { folder = '' } = params;
    const { vault, metadataCache } = context;

    const files = vault.getMarkdownFiles();
    const linkMap = new Map();

    // Build link graph
    for (const file of files) {
      if (folder && !file.path.startsWith(folder)) continue;

      const cache = metadataCache.getFileCache(file);
      const outgoingLinks = (cache?.links || []).map(l => l.link);
      linkMap.set(file.path, {
        outgoing: outgoingLinks,
        incoming: []
      });
    }

    // Populate incoming links
    for (const [sourcePath, data] of linkMap) {
      for (const targetPath of data.outgoing) {
        const target = linkMap.get(targetPath);
        if (target) {
          target.incoming.push(sourcePath);
        }
      }
    }

    // Find orphans (no incoming or outgoing)
    const orphans = [];
    for (const [path, data] of linkMap) {
      if (data.incoming.length === 0 && data.outgoing.length === 0) {
        orphans.push(path);
      }
    }

    return {
      orphanedNotes: orphans,
      count: orphans.length
    };
  }
};
```

### Example 3: Tag Manager

**YAML definition:**

```yaml
name: bulk_update_tags
description: Add or remove tags from multiple notes
handler: tag_manager.js
inputSchema:
  type: object
  properties:
    operation:
      type: string
      enum: [add, remove]
      description: Whether to add or remove tags
    tags:
      type: array
      items:
        type: string
      description: List of tags to add/remove
    filter:
      type: object
      properties:
        folder:
          type: string
        hasTag:
          type: string
  required: [operation, tags]
```

**Handler:**

```javascript
// tag_manager.js

module.exports = {
  async execute(params, context) {
    const { operation, tags, filter = {} } = params;
    const { vault, metadataCache, fileManager } = context;

    const files = vault.getMarkdownFiles();
    const updated = [];

    for (const file of files) {
      // Apply filters
      if (filter.folder && !file.path.startsWith(filter.folder)) {
        continue;
      }

      const cache = metadataCache.getFileCache(file);
      const existingTags = (cache?.tags || []).map(t => t.tag);

      if (filter.hasTag && !existingTags.includes(filter.hasTag)) {
        continue;
      }

      // Read content
      let content = await vault.read(file);

      // Modify tags (simple append/remove)
      if (operation === 'add') {
        for (const tag of tags) {
          if (!existingTags.includes(tag)) {
            content += `\n${tag}`;
          }
        }
      } else if (operation === 'remove') {
        for (const tag of tags) {
          content = content.replace(new RegExp(`\\s*${tag}`, 'g'), '');
        }
      }

      // Write back
      await vault.modify(file, content);
      updated.push(file.path);
    }

    return {
      updatedFiles: updated,
      count: updated.length
    };
  }
};
```

---

## Future: Auto-Generation (Phase 2)

**Coming soon:** Automatic tool generation from Metadata Menu classes.

### Planned Features

When `enable_auto_generation: true` in config:

```yaml
config:
  enable_auto_generation: true

tools:
  auto:
    # These will be auto-generated from Metadata Menu classes
    - name: create_book
      auto_generated: true
      source: metadata-menu:book
      # Schema extracted from class definition

    - name: create_project
      auto_generated: true
      source: metadata-menu:project
      # Schema extracted from class definition
```

**How it will work:**

1. Plugin watches Metadata Menu class definitions
2. When a class is created/updated, plugin auto-generates:
   - Tool schema in `tools.yaml`
   - Handler that creates notes with proper frontmatter
3. AI assistants can create notes without guessing frontmatter fields
4. Always in sync with your class definitions

**Example auto-generated tool:**

```yaml
auto:
  - name: create_book
    description: Create a new book note with proper frontmatter
    auto_generated: true
    source: metadata-menu:book
    inputSchema:
      type: object
      properties:
        path:
          type: string
          description: Path where note should be created
        title:
          type: string
          description: Book title
        author:
          type: string
          description: Book author
        isbn:
          type: string
          description: ISBN number
        rating:
          type: number
          description: Rating (1-5)
      required: [path, title]
```

This will be implemented in a future update. For now, you can create similar tools manually using the user handler pattern.

---

## Troubleshooting

### Tool not appearing in MCP server

1. Check YAML syntax: `npx js-yaml tools.yaml`
2. Verify handler path is correct
3. Check Obsidian console for errors
4. Reload plugin: "Lattice Relay: Reload Tool Registry"
5. Check generated config: `.obsidian/plugins/lattice-relay/generated/mcp-config.json`

### Handler script errors

1. Check Obsidian Developer Console (Ctrl+Shift+I)
2. Verify `module.exports` format is correct
3. Ensure `execute` function is async
4. Check that context object is used correctly
5. Add console.log() for debugging

### Hot-reload not working

1. Verify `auto_reload: true` in tools.yaml config
2. Check file watcher is active (console logs)
3. Manually reload: "Lattice Relay: Reload Tool Registry"
4. Restart Obsidian if issues persist

### "Module not found" errors

`require()` in a handler script is real Node.js `require` (see [Security & Sandboxing](#security--sandboxing) - there is no sandbox restricting it), so a "module not found" error means exactly what it says: the module isn't installed anywhere `require()`'s normal resolution can find it. Either install it (e.g. as a dependency alongside the handler) or use the equivalent Obsidian API (`context.vault`, `context.app`, etc.) instead.

---

## Contributing

Have a useful handler you want to share? Consider:

1. Creating a GitHub gist with your handler
2. Sharing in Obsidian community forums
3. Opening a PR to add it to the built-in tools (if generally useful)

---

## Related Documentation

- [Tool YAML format](../guides/tool-yaml-format.md)
- [Install and configure](../guides/install.md)
- [Bridge-era design history](../history/bridge/README.md)

---

**History:** first written for the MCP Bridge lineage (2025-01-21); paths and names updated for Lattice Relay 0.1.0.
