# Lattice Relay Test Harness

**HTML-based tool testing interface with automatic tool discovery**

## Overview

The test harness provides a web-based interface for testing Lattice Relay tools without needing to configure an MCP server or AI assistant. It automatically discovers available tools from the WebSocket server and generates test forms based on tool schemas.

## Features

- ✅ **Auto-Discovery**: Automatically loads all available tools from `tools/list`
- ✅ **Dynamic Forms**: Generates input forms from tool `inputSchema`
- ✅ **Real-time Testing**: Execute tools and see responses immediately
- ✅ **Category Grouping**: Tools organized by category
- ✅ **Schema Validation**: Required fields, types, enums handled automatically
- ✅ **Response Formatting**: JSON responses prettified and syntax highlighted

## Usage

### 1. Start Obsidian with Lattice Relay Plugin

Ensure the Lattice Relay plugin is installed and running in Obsidian.

### 2. Open Test Harness

Open `test-harness.html` in your web browser:

```bash
# From the plugin directory
open test-harness.html

# Or on Windows
start test-harness.html
```

### 3. Configure Connection

1. **Host**: Enter the WebSocket host (default: `127.0.0.1`)
2. **Port**: Enter the WebSocket port (default: `27125`)
3. **API Key**: Enter your API key from plugin settings
4. Click **Connect**

### 4. Test Tools

1. Select a tool from the left sidebar
2. Fill in the required parameters (marked with *)
3. Click **Execute Tool**
4. View the response in the Response section

## Screenshots

### Connection Screen
```
┌─────────────────────────────────────────────────┐
│ Lattice Relay Test Harness     [Disconnected]     │
│                                                 │
│ Host: [127.0.0.1]  Port: [27125]               │
│ API Key: [•••••••••••••]  [Connect]            │
└─────────────────────────────────────────────────┘
```

### Tool Selection
```
┌──────────────────┬──────────────────────────────┐
│ Available Tools  │  search_files               │
│                  │  ───────────────────────────│
│ ▸ ping           │  Search for files using     │
│ ▸ search_files   │  glob patterns             │
│ ▸ get_note_raw   │                            │
│ ▸ list_vault     │  Pattern: [*.md]           │
│ ▸ run_dataview   │  Required field            │
│ ▸ extract_dv     │                            │
│                  │  [Execute Tool]            │
└──────────────────┴──────────────────────────────┘
```

## Tool Categories

Tools are automatically grouped by category:

- **search**: File search and discovery tools
- **notes**: Note reading and listing tools
- **dataview**: Dataview query tools
- **custom**: User-added tools
- **other**: Uncategorized tools

## Input Types

The test harness automatically handles different input types based on the tool's `inputSchema`:

### Text Input
```yaml
filepath:
  type: string
  description: Path to note
```
→ `<input type="text">`

### Number Input
```yaml
limit:
  type: number
  description: Maximum results
```
→ `<input type="number">`

### Boolean Input
```yaml
includeArchived:
  type: boolean
  description: Include archived notes
```
→ `<select>` with true/false options

### Enum Input
```yaml
flavor:
  type: string
  enum: [dataview, dataviewjs]
```
→ `<select>` with enum values

### Textarea Input
Special fields like `source` and `query` automatically use `<textarea>` for multi-line input.

## Response Handling

### Success Response
```json
{
  "pattern": "*.md",
  "matches": 42,
  "files": [...]
}
```
Displayed with green text color.

### Error Response
```json
{
  "error": "File not found: invalid.md"
}
```
Displayed with red text color.

## Auto-Discovery Protocol

The test harness uses the `tools/list` endpoint to discover available tools:

**Request:**
```json
{
  "id": "req-1",
  "method": "tools/list",
  "params": {},
  "auth": "your-api-key"
}
```

**Response:**
```json
{
  "id": "req-1",
  "result": {
    "tools": [
      {
        "name": "search_files",
        "description": "Search for files...",
        "inputSchema": {...},
        "category": "search"
      },
      ...
    ]
  }
}
```

## Advanced Features

### Request ID Tracking
Each request gets a unique ID to match responses, allowing for concurrent requests.

### Timeout Handling
Requests timeout after 30 seconds with an error message.

### Connection Recovery
Automatically reconnects if the WebSocket connection drops.

### Broadcast Notifications
Can receive broadcast notifications from the vault (displayed in console).

## Troubleshooting

### Cannot Connect

**Problem:** "Error" status or connection fails

**Solutions:**
1. Check Obsidian is running
2. Check Lattice Relay plugin is enabled
3. Verify host and port settings match plugin settings
4. Check API key is correct (copy from plugin settings)
5. Check firewall isn't blocking localhost connections

### Tools Not Loading

**Problem:** "Failed to load tools" error

**Solutions:**
1. Check API key is correct
2. Check WebSocket connection is established
3. View browser console (F12) for detailed errors
4. Restart the plugin and reconnect

### Tool Execution Fails

**Problem:** Tool returns error

**Solutions:**
1. Check all required parameters are filled
2. Verify parameter format (e.g., valid file paths)
3. Check Obsidian console for plugin errors
4. Try simpler parameters first

### Form Not Showing

**Problem:** Tool selected but no form appears

**Solutions:**
1. Check tool has valid `inputSchema`
2. Check browser console for JavaScript errors
3. Try refreshing the page and reconnecting

## Development

### Modifying the Test Harness

The test harness is a single HTML file with embedded CSS and JavaScript:

```html
test-harness.html
├── <style>     - Visual styling (VS Code Dark theme)
├── <body>      - HTML structure
└── <script>    - WebSocket client and UI logic
```

**Key Functions:**
- `connect()` - Establish WebSocket connection
- `loadTools()` - Fetch tools from `tools/list`
- `renderToolsList()` - Display tools in sidebar
- `selectTool()` - Handle tool selection
- `renderToolDetails()` - Generate input form from schema
- `executeTool()` - Send tool request and display response
- `sendRequest()` - Generic WebSocket request handler

### Adding Custom Features

**Example: Add request history**

```javascript
let requestHistory = [];

async function executeTool(event) {
    // ... existing code ...

    // Save to history
    requestHistory.push({
        tool: currentTool.name,
        params: params,
        result: result,
        timestamp: Date.now()
    });

    // Update UI to show history
    renderHistory();
}
```

## Security Notes

⚠️ **API Key Storage**

The test harness does NOT store your API key. It's only kept in memory during the browser session. Close the browser to clear it.

⚠️ **Localhost Only**

By default, the plugin only accepts connections from `127.0.0.1`. This is intentional for security.

⚠️ **No Authentication Bypass**

Every request requires a valid API key. The test harness cannot bypass plugin authentication.

## Examples

### Test Dataview Query

1. Select `run_dataview_block`
2. Set flavor: `dataview`
3. Set source: `LIST FROM "Notes"`
4. Click Execute
5. View rendered results

### Search for Files

1. Select `search_files`
2. Set pattern: `Notes/**/*.md`
3. Click Execute
4. View list of matching files

### Extract Dataview Blocks

1. Select `extract_dataview_blocks`
2. Set filepath: `Notes/Dashboard.md`
3. Click Execute
4. View extracted blocks with line numbers

## Related Documentation

- [Extensibility](../architecture/extensibility.md) - Tool registry architecture
- [README](../../README.md) - Lattice Relay overview

---
