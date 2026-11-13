# Obsidian MCP Bridge - Setup Guide

Complete setup instructions for Phase 1 (Proof of Concept).

## Prerequisites

- Obsidian installed (version 1.4.0+)
- Node.js installed (for building the plugin)
- Python 3.9+ installed
- Git (for cloning the repository)

## Step 1: Build the Plugin

```bash
cd C:\path\to\obsidian-mcp-bridge\plugin

# Install dependencies
npm install

# Build the plugin
npm run build
```

This will create `main.js` in the plugin directory.

## Step 2: Install Plugin in Obsidian

### Option A: Symlink (Development)

$pluginPath = "C:\path\to\obsidian-mcp-bridge\plugin"
$obsidianPath = "$env:APPDATA\obsidian\plugins\obsidian-mcp-bridge"

New-Item -ItemType SymbolicLink -Path $obsidianPath -Target $pluginPath
```

**macOS/Linux:**
```bash
ln -s ~/Source/Repos/obsidian-mcp-bridge/plugin ~/.obsidian/plugins/obsidian-mcp-bridge
```

### Option B: Copy (Production)

**Windows:**
```powershell
xcopy "C:\path\to\obsidian-mcp-bridge\plugin" "$env:APPDATA\obsidian\plugins\obsidian-mcp-bridge" /E /I
```

**macOS/Linux:**
```bash
cp -r ~/Source/Repos/obsidian-mcp-bridge/plugin ~/.obsidian/plugins/obsidian-mcp-bridge
```

### Option C: Per-Vault Installation

For your vault:

**Windows:**
```powershell
xcopy "C:\path\to\obsidian-mcp-bridge\plugin" "<path-to-your-vault>\.obsidian\plugins\obsidian-mcp-bridge" /E /I
```

## Step 3: Enable Plugin in Obsidian

1. Open Obsidian
2. Go to Settings → Community Plugins
3. Turn off "Safe Mode" if enabled
4. Click "Reload" to detect the new plugin
5. Find "MCP Bridge" in the list
6. Toggle it ON

You should see:
- "MCP Bridge: API key generated. Copy it from settings..."
- "MCP Bridge: Server started on 127.0.0.1:27125"

## Step 4: Get API Key

1. In Obsidian, go to Settings → MCP Bridge
2. Under "Security Settings", find the API Key field
3. Click "Copy" button
4. Save this key - you'll need it for the MCP server

**Or use the command:**
- Open command palette (Ctrl/Cmd + P)
- Run "MCP Bridge: Copy API Key"

## Step 5: Install MCP Server (Node recommended, Python as backup)

### Node MCP Server (preferred)

```bash
cd C:\path\to\obsidian-mcp-bridge\servers\node-old

# Install dependencies
npm install

# Build the server so dist/main.js exists
npm run build
```

If you already prefer the Python server, skip the Node steps and use the instructions below.

### Python MCP Server (fallback)

```bash
cd C:\path\to\obsidian-mcp-bridge\servers\python-old

# Install dependencies
pip install -r requirements.txt
```

## Step 6: Configure Environment Variables

**Windows (PowerShell):**
```powershell
$env:OBSIDIAN_MCP_KEY = "your-api-key-here"
```

**Windows (Command Prompt):**
```cmd
set OBSIDIAN_MCP_KEY=your-api-key-here
```

**macOS/Linux (bash/zsh):**
```bash
export OBSIDIAN_MCP_KEY="your-api-key-here"
```

**Permanent (Windows):**
```powershell
[System.Environment]::SetEnvironmentVariable('OBSIDIAN_MCP_KEY', 'your-api-key-here', 'User')
```

**Permanent (macOS/Linux):**
Add to `~/.bashrc` or `~/.zshrc`:
```bash
export OBSIDIAN_MCP_KEY="your-api-key-here"
```

## Step 7: Test Connection

### Manual Test

```bash
cd C:\path\to\obsidian-mcp-bridge\servers\node-old
node dist/main.js
```

If you prefer to verify the Python fallback, run the same script from `servers/python-old` instead.

You should see:
```
Connected to Obsidian MCP Bridge at ws://localhost:27125
```

If you see this, the connection works! Press Ctrl+C to stop.

### WebSocket Test (Alternative)

Create a test script `test_connection.py`:

```python
import asyncio
import websockets
import json
import os

async def test():
    api_key = os.getenv('OBSIDIAN_MCP_KEY')

    ws = await websockets.connect('ws://localhost:27125')

    request = {
        "auth": api_key,
        "method": "ping",
        "params": {}
    }

    await ws.send(json.dumps(request))
    response = await ws.recv()
    print("Response:", response)
    await ws.close()

asyncio.run(test())
```

Run it:
```bash
python test_connection.py
```

Expected output:
```json
Response: {"result":{"status":"ok","timestamp":1234567890}}
```

## Step 8: Configure AI Client

### For Claude Code

Point Claude at the Node MCP server first. Set the command to `node dist/main.js` and pass the API key via `env`.

```json
{
  "mcpServers": {
    "obsidian": {
      "command": "node",
      "args": ["C:/path/to/obsidian-mcp-bridge/servers/node-old/dist/main.js"],
      "env": {
        "OBSIDIAN_MCP_KEY": "your-api-key-here"
      }
    }
  }
}
```

If you still need the Python fallback, change the args to `["C:/path/to/obsidian-mcp-bridge/servers/python-old/obsidian_mcp_server.py"]` and keep the same `env` block (Claude supports both equally).

**macOS:**
Edit `~/Library/Application Support/Claude/claude_desktop_config.json`

**Linux:**
Edit `~/.config/Claude/claude_desktop_config.json`

### For Codex

Configure Codex to invoke the Node MCP server binary and supply the API key.

```toml
[[servers]]
name = "obsidian-direct"
command = "node"
args = ["C:/path/to/obsidian-mcp-bridge/servers/node-old/dist/main.js"]
env = { OBSIDIAN_MCP_KEY = "your-api-key-here" }
```

You can keep the Python path as an alternative by swapping `args` to `["C:/path/to/obsidian-mcp-bridge/servers/python-old/obsidian_mcp_server.py"]`.

## Step 9: Test End-to-End

### In Claude Code

Restart Claude Code, then try:

```
Can you render my Home.md file?
```

Claude should:
1. Call `render_note` tool
2. Pass `"Notes/00_Sowing/Home.md"` as filepath
3. Receive fully-rendered HTML with Dataview tables
4. Show you the content

### In Codex

```bash
codex "Show me what's in my Garden Dashboard"
```

## Troubleshooting

### Plugin won't load
- Check Obsidian console: View → Toggle Developer Tools → Console
- Look for errors mentioning "MCP Bridge"
- Make sure `main.js` exists in the plugin folder

### WebSocket connection refused
- Check that Obsidian is running
- Check that plugin is enabled (Settings → Community Plugins)
- Check plugin settings: is server status showing "Running"?
- Try restarting the server: Command Palette → "MCP Bridge: Restart WebSocket Server"

### Unauthorized errors
- Make sure API key is copied correctly
- No extra spaces or quotes
- Environment variable is set in the same shell/terminal
- For Claude Code, API key must be in config file

### Rendering looks incomplete
- Dataview queries take 2-3 seconds to execute
- Try manually opening the note in Obsidian first
- Check that Dataview plugin is installed and enabled
- Look at Obsidian console for Dataview errors

### Python module not found
```bash
pip install --upgrade mcp websockets
```

### Port already in use
Change port in plugin settings:
1. Settings → MCP Bridge
2. Change "Port" from 27125 to something else (e.g., 27126)
3. Restart plugin server
4. Update `OBSIDIAN_PORT` environment variable

## Next Steps

Once everything is working:

1. **Test with your vault:**
   - Try rendering different notes
   - Test notes with Dataview queries
   - Test notes with other plugins

2. **Explore capabilities:**
   - List vault files
   - Get raw markdown
   - Test performance with large notes

3. **Move to Phase 2:**
   - Add more tools (list_plugins, dataview_query, etc.)
   - Add plugin discovery
   - Test with SmartConnections

## Development Mode

For active development with auto-rebuild:

```bash
cd plugin
npm run dev
```

This watches for file changes and rebuilds automatically. You'll still need to reload the plugin in Obsidian (Ctrl/Cmd + R in Settings → Community Plugins).

## Support

- Check console logs in both Obsidian and MCP server
- Review architecture doc: `Direct-API-Architecture.md`
- Check GitHub issues
