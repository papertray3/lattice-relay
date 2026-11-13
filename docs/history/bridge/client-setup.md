# AI Client Setup Guide

## Architecture Overview

```
┌──────────────────┐         ┌───────────────────┐         ┌─────────────────────────┐
│   Claude Code    │   MCP   │   MCP Server      │   WS    │   Obsidian Plugin       │
│   (AI Client)    │ ◄─────► │   (Proxy/Bridge)  │ ◄─────► │   (MCP Bridge)          │
└──────────────────┘ Protocol└───────────────────┘         └─────────────────────────┘
     Stdio/JSON-RPC         Node or Python              WebSocket (127.0.0.1:27125)
                                                                       │
                                                                       ├─ ToolRegistry
                                                                       ├─ mcp-config.json
                                                                       └─ Tool Handlers
```

---

## How It Works

### **1. Obsidian Plugin (MCP Bridge)**

**What it does:**
- Runs WebSocket server on `127.0.0.1:27125`
- Loads builtin tools from `mcp-bridge/defaults/tools.defaults.yaml`
- Discovers user tools from `.obsidian/mcp-bridge/tools/*.yaml`
- Generates `mcp-config.json` with all available tools
- Handles tool execution requests

**Generated File:**
```
.obsidian/plugins/obsidian-mcp-bridge/
  └── mcp-bridge/
      └── generated/
          └── mcp-config.json    ← Auto-generated tool catalog
```

**Purpose of `mcp-config.json`:**
- ✅ Contains all tool definitions (builtin + user)
- ✅ Used by MCP Server to discover available tools
- ✅ Regenerated automatically when tools change
- ✅ Includes input/output schemas for validation
- ❌ NOT read directly by AI clients

---

### **2. MCP Server (Proxy)**

**What it does:**
- Connects to Obsidian's WebSocket server
- Reads `mcp-config.json` OR queries tools via WebSocket
- Translates between MCP protocol and WebSocket
- Acts as bridge between AI client and Obsidian

**Location:**
- Node: `servers/node-old/dist/main.js`
- Python: `servers/python-old/obsidian_mcp_server.py`

**Why it exists:**
- MCP clients expect stdio/JSON-RPC protocol
- Obsidian plugin uses WebSocket
- Server translates between the two

---

### **3. AI Client (Claude Code, Codex, etc.)**

**What it does:**
- Launches MCP Server as subprocess
- Sends `tools/list` request to discover tools
- Sends `tools/call` requests to execute tools
- Receives results and presents to user

**Configuration:**
- Specifies which MCP server to launch
- Provides environment variables (API key)
- Sets up communication channel

---

## Setting Up Claude Code

### **Step 1: Get API Key**

In Obsidian:
1. Open Settings → MCP Bridge
2. Under "Security Settings", find API Key
3. Click "Copy" button
4. Save this key - you'll need it for configuration

Or use command palette:
- `Ctrl/Cmd + P` → "MCP Bridge: Copy API Key"

---

### **Step 2: Configure Claude Code**

**Location:**

- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Linux:** `~/.config/Claude/claude_desktop_config.json`

**Configuration:**

```json
{
  "mcpServers": {
    "obsidian": {
      "command": "node",
      "args": [
        "C:/Users/<user>/Source/Obsidian/dg-kants/.obsidian/plugins/obsidian-mcp-bridge/servers/node-old/dist/main.js"
      ],
      "env": {
        "OBSIDIAN_MCP_KEY": "your-api-key-here"
      }
    }
  }
}
```

**Important:**
- Replace `C:/Users/<user>/...` with your actual path
- Replace `your-api-key-here` with the API key from Step 1
- Use forward slashes `/` even on Windows
- Make sure `dist/main.js` exists (run `npm run build` in `servers/node-old/`)

---

### **Step 3: Verify Server is Built**

```bash
cd C:/Users/<user>/Source/Obsidian/dg-kants/.obsidian/plugins/obsidian-mcp-bridge/servers/node-old

# Install dependencies (if not done)
npm install

# Build the server
npm run build

# Verify dist/main.js exists
ls dist/main.js
```

---

### **Step 4: Restart Claude Code**

1. Quit Claude Code completely
2. Restart Claude Code
3. Check MCP connection status (usually shown in settings or status bar)

---

### **Step 5: Test the Connection**

In Claude Code, try:

```
List files in my vault
```

Claude should call `list_vault_files` tool and show your vault's markdown files.

Or try:

```
Show me the content of Notes/00_Sowing/Home.md
```

Claude should call `get_note_raw` tool and display the file content.

---

## Setting Up Codex

**Config file:** `.codex/config.toml`

```toml
[[servers]]
name = "obsidian"
command = "node"
args = [
  "C:/Users/<user>/Source/Obsidian/dg-kants/.obsidian/plugins/obsidian-mcp-bridge/servers/node-old/dist/main.js"
]

[servers.env]
OBSIDIAN_MCP_KEY = "your-api-key-here"
```

**Test:**
```bash
codex "List my vault files"
```

---

## How Tool Discovery Works

### **When AI Client Starts:**

1. **Client launches MCP Server**
   ```bash
   node servers/node-old/dist/main.js
   ```

2. **MCP Server connects to Obsidian**
   ```
   WebSocket → ws://127.0.0.1:27125
   Auth: OBSIDIAN_MCP_KEY
   ```

3. **MCP Server discovers tools**
   - **Option A:** Reads `mcp-config.json`
   - **Option B:** Sends `tools/list` request to plugin
   - Result: List of all available tools with schemas

4. **Client queries server for tools**
   ```json
   Client → Server: {"method": "tools/list"}
   Server → Client: {
     "tools": [
       {
         "name": "ping",
         "description": "Test connectivity...",
         "inputSchema": {...}
       },
       ...
     ]
   }
   ```

5. **Client can now call tools**
   ```json
   Client → Server: {
     "method": "tools/call",
     "params": {
       "name": "get_note_raw",
       "arguments": {"filepath": "Home.md"}
     }
   }
   Server → Obsidian → Server → Client: {
     "result": {"filepath": "Home.md", "content": "..."}
   }
   ```

---

## Verifying Your Setup

### **Check 1: Obsidian Plugin Status**

In Obsidian:
1. Open Developer Tools (`Ctrl/Cmd + Shift + I`)
2. Go to Console tab
3. Look for:
   ```
   MCP Bridge: Server started on 127.0.0.1:27125
   MCP Bridge: Tool registry initialized (9 tools: 9 builtin, 0 user)
   ```

### **Check 2: Generated Config**

Verify file exists and has tools:
```bash
cat .obsidian/plugins/obsidian-mcp-bridge/mcp-bridge/generated/mcp-config.json
```

Should show all 9 builtin tools:
- ping
- search_files
- get_note_raw
- get_note_metadata
- get_note_links
- resolve_wiki_links
- list_vault_files
- run_dataview_block
- extract_dataview_blocks

### **Check 3: MCP Server Test**

Manually run the MCP server:
```bash
cd servers/node-old
OBSIDIAN_MCP_KEY="your-key-here" node dist/main.js
```

Should output:
```
Connected to Obsidian MCP Bridge at ws://localhost:27125
```

Press `Ctrl+C` to stop.

### **Check 4: Claude Code Connection**

In Claude Code:
1. Open Settings
2. Look for MCP servers section
3. Should show "obsidian" server as connected

---

## How Tools are Updated

### **When You Add a Custom Tool:**

1. **Via Settings UI:**
   - Settings → Custom Tools → Add Tool
   - Fill out form, click Save

2. **Via Import:**
   - Settings → Custom Tools → Import Tool
   - Select `.yaml` file

3. **Programmatically (KANTS):**
   ```javascript
   await mcpBridge.toolRegistry.addTool({...});
   ```

4. **What Happens:**
   - Tool saved to `.obsidian/mcp-bridge/tools/tool_name.yaml`
   - ToolRegistry calls `reload()`
   - `mcp-config.json` regenerated with new tool
   - MCP Server detects change
   - AI client gets updated tool list

5. **How Client Sees It:**
   - Most clients cache tool list on startup
   - Restart Claude Code to see new tools
   - Some clients auto-detect changes

---

## Troubleshooting

### **"No tools found" in Claude Code**

**Check:**
1. Is Obsidian running?
2. Is MCP Bridge plugin enabled?
3. Is WebSocket server running? (Check status in plugin settings)
4. Is API key correct in `claude_desktop_config.json`?
5. Did you restart Claude Code after configuration?

**Debug:**
```bash
# Test MCP server manually
cd servers/node-old
OBSIDIAN_MCP_KEY="your-key" node dist/main.js
# Should connect without errors
```

---

### **"Connection refused" error**

**Possible causes:**
- Obsidian not running
- Plugin disabled
- Different port configured

**Fix:**
1. Check plugin settings: Port should be `27125`
2. Restart Obsidian
3. Restart server: Command Palette → "MCP Bridge: Restart WebSocket Server"

---

### **"Unauthorized" error**

**Possible causes:**
- Wrong API key
- API key has extra spaces/quotes
- Environment variable not set

**Fix:**
1. Copy API key fresh from plugin settings
2. Verify in config file (no quotes around the key value in JSON)
3. For manual testing, export variable:
   ```bash
   export OBSIDIAN_MCP_KEY="your-key-here"
   ```

---

### **Custom tools not appearing**

**Check:**
1. Tool YAML file in correct location: `.obsidian/mcp-bridge/tools/`
2. Valid YAML syntax
3. Required fields present: `name`, `description`, `handler`, `inputSchema`
4. Check Obsidian console for validation errors
5. Plugin reloaded after adding tool

**Verify:**
```bash
# Check generated config includes your tool
cat mcp-bridge/generated/mcp-config.json | grep "your_tool_name"
```

---

### **MCP Server not starting**

**Node version:**
```bash
# Check if dist/main.js exists
ls servers/node-old/dist/main.js

# Rebuild if needed
cd servers/node-old
npm install
npm run build
```

**Dependencies:**
```bash
# Install MCP SDK
cd servers/node-old
npm install @modelcontextprotocol/sdk
```

---

## Advanced Configuration

### **Custom Port**

If port 27125 is in use:

1. **In Obsidian plugin settings:**
   - Settings → MCP Bridge
   - Change Port to `27126` (or other)
   - Click "Restart Server"

2. **Update MCP server environment:**
   ```json
   {
     "env": {
       "OBSIDIAN_MCP_KEY": "your-key",
       "OBSIDIAN_PORT": "27126"
     }
   }
   ```

---

### **Remote Access (Advanced)**

⚠️ **Warning:** Remote access exposes your vault. Use with caution.

1. **In plugin settings:**
   - Host: `0.0.0.0` (listen on all interfaces)
   - Enable Remote: ON
   - Enable SSL: ON (recommended)
   - Configure certificate paths

2. **Update MCP server:**
   ```json
   {
     "env": {
       "OBSIDIAN_HOST": "192.168.1.100",
       "OBSIDIAN_PORT": "27125",
       "OBSIDIAN_MCP_KEY": "your-key"
     }
   }
   ```

---

### **Multiple Vaults**

To connect to different vaults:

```json
{
  "mcpServers": {
    "vault1": {
      "command": "node",
      "args": ["path/to/vault1/.obsidian/plugins/obsidian-mcp-bridge/servers/node-old/dist/main.js"],
      "env": {"OBSIDIAN_MCP_KEY": "vault1-key"}
    },
    "vault2": {
      "command": "node",
      "args": ["path/to/vault2/.obsidian/plugins/obsidian-mcp-bridge/servers/node-old/dist/main.js"],
      "env": {"OBSIDIAN_MCP_KEY": "vault2-key"}
    }
  }
}
```

Each vault needs:
- Own MCP Bridge plugin instance
- Own API key
- Different port (if running simultaneously)

---

## Next Steps

Once connected:

1. **Explore available tools:**
   ```
   What tools do you have available for Obsidian?
   ```

2. **Test basic operations:**
   ```
   List all files in my vault
   Get the content of <some-file>.md
   Show me metadata for <some-file>.md
   ```

3. **Try advanced features:**
   ```
   Run this Dataview query: TABLE file.name FROM "Notes"
   Get all backlinks for <some-file>.md
   ```

4. **Add custom tools:**
   - Use Settings UI to create custom tools
   - Install KANTS tools programmatically
   - Import tools from YAML files

---

## Resources

- **Tool YAML Format:** `docs/guides/tool-yaml-format.md`
- **Agent SOP:** `docs/guides/agent-sop.md`
- **Plugin Setup:** `docs/guides/setup.md`
- **MCP Protocol:** https://spec.modelcontextprotocol.io/
