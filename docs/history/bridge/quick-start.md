# Quick Start - Obsidian MCP Bridge

**Status:** ✅ Built and installed, ready for testing

## Current State

### ✅ Completed
- [x] Plugin built (`main.js` created)
- [x] Plugin installed in your vault
- [x] Python dependencies installed
- [x] Test script created

### ⏳ Next Steps (Manual)
- [ ] Enable plugin in Obsidian
- [ ] Copy API key
- [ ] Set environment variable
- [ ] Run connection test

---

## Step-by-Step Instructions

### 1. Enable Plugin in Obsidian

1. **Open Obsidian** (your vault)
2. Go to **Settings** (gear icon) → **Community Plugins**
3. If "Safe Mode" is on, turn it **OFF**
4. Click **"Reload"** button to detect new plugins
5. Find **"MCP Bridge"** in the list
6. Toggle it **ON**

**Expected result:**
- Notification: "MCP Bridge: API key generated..."
- Notification: "MCP Bridge: Server started on 127.0.0.1:27125"
- Status bar shows "MCP Bridge: Active"

**If it doesn't appear:**
- Check console: `View → Toggle Developer Tools → Console`
- Look for errors mentioning "MCP Bridge"
- Verify files exist: `.obsidian/plugins/obsidian-mcp-bridge/main.js` and `manifest.json`

---

### 2. Copy API Key

**Option A: Via Settings**
1. Settings → MCP Bridge
2. Under "Security Settings", find "API Key"
3. Click **"Copy"** button
4. Key is now in clipboard

**Option B: Via Command**
1. Press `Ctrl+P` (Windows) or `Cmd+P` (Mac)
2. Type: "MCP Bridge: Copy API Key"
3. Press Enter

**Save this key** - you'll need it in the next step.

---

### 3. Set Environment Variable

**Windows PowerShell:**
```powershell
$env:OBSIDIAN_MCP_KEY = "paste-api-key-here"
```

**Windows CMD:**
```cmd
set OBSIDIAN_MCP_KEY=paste-api-key-here
```

**Verify it's set:**
```powershell
echo $env:OBSIDIAN_MCP_KEY
```

---

### 4. Run Connection Test

```bash
# Navigate to your repository directory
cd /path/to/obsidian-mcp-bridge

# Run the test
python test_connection.py
```

> **Windows example:** `cd C:\Users\YourName\repos\obsidian-mcp-bridge`
> **macOS/Linux example:** `cd ~/repos/obsidian-mcp-bridge`

**Expected output:**
```
============================================================
Obsidian MCP Bridge - Connection Test
============================================================

✓ API key found: 12345678...

Connecting to ws://localhost:27125...
✓ WebSocket connection established

Test 1: Ping
----------------------------------------
✓ Response: {
  "status": "ok",
  "timestamp": 1234567890
}

Test 2: List vault files
----------------------------------------
✓ Found 120 markdown files in vault
  First few: ['Notes/00_Sowing/Home.md', ...]

Test 3: Get raw note content
----------------------------------------
✓ Successfully read Notes/00_Sowing/Home.md
  Content length: 2500 characters
  First 100 chars: ---
fileClass: menu
...

Test 4: Render note with Dataview
----------------------------------------
Requesting render (this may take 2-3 seconds for Dataview)...
✓ Successfully rendered Notes/00_Sowing/Home.md
  HTML length: 25000 characters
  ✓ Dataview content detected!
  ✓ HTML tables found
  First 200 chars: <div class="markdown-preview-view">...

============================================================
✅ All tests passed! Connection is working.
============================================================
```

---

## Troubleshooting

### Plugin Won't Enable

**Check:**
- Is Obsidian up to date? (Need v1.4.0+)
- Are Community Plugins allowed? (Safe Mode = OFF)
- Do the files exist?
  ```bash
  # Windows
  dir "<VAULT_PATH>\.obsidian\plugins\obsidian-mcp-bridge"

  # macOS/Linux
  ls "<VAULT_PATH>/.obsidian/plugins/obsidian-mcp-bridge"
  ```

**Fix:**
- View → Toggle Developer Tools → Console
- Look for error messages
- If "module not found", rebuild: `cd plugin && npm run build`

---

### Connection Refused

**Error:**
```
❌ Connection refused
```

**Check:**
1. Is Obsidian running?
2. Is plugin enabled? (see Settings → Community Plugins)
3. Is server running? (see Settings → MCP Bridge → Server Status)

**Fix:**
- Restart server: Command Palette → "MCP Bridge: Restart WebSocket Server"
- Check port isn't blocked: Try `telnet localhost 27125`
- Check firewall settings

---

### Unauthorized Error

**Error:**
```
❌ Error: Unauthorized: Invalid API key
```

**Fix:**
1. Copy API key again from plugin settings
2. Make sure no extra spaces or quotes
3. Set environment variable in **same terminal** where you run test
4. Verify: `echo $env:OBSIDIAN_MCP_KEY`

---

### Empty/Incomplete Rendering

**Issue:** HTML looks incomplete, Dataview queries not executed

**Check:**
- Is Dataview plugin installed and enabled?
- Wait full 2-3 seconds for render
- Try opening the note manually in Obsidian first

**Fix:**
- Install Dataview: Settings → Community Plugins → Browse → "Dataview"
- Check Dataview settings: Settings → Dataview → Enable JavaScript Queries

---

## What to Test

### Basic Tests (via test_connection.py)
- ✓ Ping (connection alive)
- ✓ List files (vault access)
- ✓ Get raw note (file reading)
- ✓ Render note (HTML with Dataview)

### Manual Tests (via Claude Code/Codex)
Once connection test passes, try these prompts:

**Test 1: Simple render**
```
Can you render my Home.md file?
(Notes/00_Sowing/Home.md)
```

**Test 2: Complex Dataview**
```
Show me what's on my Garden Dashboard
(Notes/Dashboards/🔎Garden Dashboard.md)
```

**Test 3: File listing**
```
List all notes in my 00_Sowing folder
```

**Test 4: Raw content**
```
Show me the raw markdown of Home.md
```

---

## Next Steps After Success

### Configure AI Client

**Claude Code (Python Server):**
Edit `%APPDATA%\Claude\claude_desktop_config.json` (Windows) or `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS):
```json
{
  "mcpServers": {
    "obsidian": {
      "command": "python",
      "args": ["/absolute/path/to/obsidian-mcp-bridge/mcp-server/obsidian_mcp_server.py"],
      "env": {
        "OBSIDIAN_MCP_KEY": "your-api-key-here"
      }
    }
  }
}
```

**Claude Code (Node Server - Recommended):**
```json
{
  "mcpServers": {
    "obsidian": {
      "command": "node",
      "args": ["/absolute/path/to/obsidian-mcp-bridge/mcp-server-node/dist/main.js"],
      "env": {
        "OBSIDIAN_MCP_KEY": "your-api-key-here"
      }
    }
  }
}
```

> **Path Examples:**
> - **Windows:** `"C:/Users/YourName/repos/obsidian-mcp-bridge/mcp-server-node/dist/main.js"`
> - **macOS/Linux:** `"/home/username/repos/obsidian-mcp-bridge/mcp-server-node/dist/main.js"`
> - **WSL:** `"/mnt/c/Users/YourName/repos/obsidian-mcp-bridge/mcp-server-node/dist/main.js"`

**Codex:**
Edit `~/.codex/config.toml`:
```toml
[[servers]]
name = "obsidian-direct"
command = "python"
args = ["/absolute/path/to/obsidian-mcp-bridge/mcp-server/obsidian_mcp_server.py"]
env = { OBSIDIAN_MCP_KEY = "your-api-key-here" }
```

### Test End-to-End

1. Restart Claude Code/Codex
2. Try prompts like: "What's on my workbench?" or "Show me my Garden Dashboard"
3. AI should use `render_note` tool and show Dataview content

---

## File Locations

### Repository
```
/path/to/obsidian-mcp-bridge/
├── plugin/src/              # Plugin source code
├── plugin/main.js           # Built plugin
├── mcp-server/              # Python MCP server
├── mcp-server-node/         # Node/TypeScript MCP server
├── test_connection.py       # Connection test script
└── docs/                    # Documentation
```

> **Your repository location:**
> - **Windows:** `C:\Users\YourName\repos\obsidian-mcp-bridge\`
> - **macOS:** `/Users/username/repos/obsidian-mcp-bridge/`
> - **Linux:** `/home/username/repos/obsidian-mcp-bridge/`

### Installed Plugin
```
<VAULT_PATH>/.obsidian/plugins/obsidian-mcp-bridge/
├── main.js
└── manifest.json
```

> **Default Obsidian vault locations:**
> - **Windows:** `C:\Users\YourName\Documents\Obsidian\VaultName\`
> - **macOS:** `~/Documents/Obsidian/VaultName/`
> - **Linux:** `~/Documents/Obsidian/VaultName/`

---

## Quick Commands

**Build plugin:**
```bash
cd /path/to/obsidian-mcp-bridge/plugin
npm run build
```

**Rebuild and update (Windows):**
```bash
npm run build
copy main.js "<VAULT_PATH>\.obsidian\plugins\obsidian-mcp-bridge\main.js"
```

**Rebuild and update (macOS/Linux):**
```bash
npm run build && cp main.js "<VAULT_PATH>/.obsidian/plugins/obsidian-mcp-bridge/main.js"
```

**Test connection:**
```bash
cd /path/to/obsidian-mcp-bridge
python test_connection.py
```

> **Note:** Replace `/path/to/` and `<VAULT_PATH>` with your actual paths.

**Check plugin status (in Obsidian):**
- Command Palette → "MCP Bridge: Copy API Key"
- Settings → MCP Bridge → Server Status

---

## Support Resources

- **Setup Guide:** [docs/guides/setup.md](setup.md)
- **Architecture:** [docs/architecture/extensibility.md](../architecture/extensibility.md)
- **Test Script:** `test_connection.py` (in repository root)

**Console Logs:**
- Obsidian: `View → Toggle Developer Tools → Console`
- Python: Check terminal output where `test_connection.py` runs

---

## Success Criteria

Phase 1 is complete when:
- ✅ Plugin loads without errors
- ✅ WebSocket server starts
- ✅ API key authentication works
- ✅ `render_note` returns HTML with Dataview tables
- ✅ AI client can access vault content

**You're almost there! Just need to enable the plugin in Obsidian.** 🚀
