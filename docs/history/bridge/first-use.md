# First Time Using Obsidian MCP Bridge

**You've just set everything up! Here's what to do next.**

---

## ✅ What You've Already Done

- [x] Built and installed the Obsidian plugin
- [x] Plugin is running (WebSocket server on port 27125)
- [x] Python MCP server dependencies installed
- [x] Claude Code configured with your API key
- [x] Connection test passed (all 4 tests green)

---

## 🚀 Starting Your First Session

### 1. Make Sure Everything is Running

**Before using Claude Code, verify:**

✓ **Obsidian is open** with your your vault
✓ **MCP Bridge plugin is enabled** (check Settings → Community Plugins)
✓ **Server status shows "Running"** (Settings → MCP Bridge → bottom of page)

### 2. Restart Claude Code

**Important:** You must fully restart Claude Code for config changes to take effect.

1. **Quit Claude Code completely** (not just close the window)
   - Windows: Right-click taskbar icon → Quit
   - Or: Alt+F4 when Claude is focused

2. **Reopen Claude Code**

3. **Check for MCP connection**
   - You might see a brief notification about MCP servers
   - Or check the status bar/logs

### 3. Test with Simple Prompts

Start with these to verify everything works:

#### Test 1: Ping (Connection Test)
```
Can you ping the Obsidian MCP server to check if it's working?
```

**Expected:** Claude uses the `ping` tool and shows:
```json
{
  "status": "ok",
  "timestamp": 1234567890
}
```

#### Test 2: List Files
```
List all the markdown files in my vault
```

**Expected:** Claude uses `list_vault_files` and shows your note paths.

#### Test 3: Read Raw Content
```
Show me the raw markdown content of my Home.md file (Notes/00_Sowing/Home.md)
```

**Expected:** Claude uses `get_note_raw` and shows frontmatter + markdown.

#### Test 4: Rendered Content (The Big One!)
```
Render my Home.md file and show me the Dataview tables
```

**Expected:** Claude uses `render_note`, waits 2-3 seconds, and shows fully-rendered HTML with Dataview content executed.

---

## 🎯 Real-World Use Cases

Once the tests work, try these actual workflows:

### Workflow 1: Dashboard Analysis
```
What's currently on my workbench according to the Garden Dashboard?
```

Claude will:
1. Render `Notes/Dashboards/🔎Garden Dashboard.md`
2. Parse the Dataview tables
3. Tell you what notes are in your workbench queue

### Workflow 2: Content Discovery
```
What are all the notes in my 00_Sowing folder about?
```

Claude will:
1. List files in `Notes/00_Sowing/`
2. Read several notes
3. Summarize themes and topics

### Workflow 3: Note Summarization
```
Summarize my note about "Digital Garden Plugin"
```

Claude will:
1. Find the note (search or you provide path)
2. Render it fully
3. Give you a summary

### Workflow 4: Cross-Reference
```
Which of my public notes mention AI or automation?
```

Claude will:
1. List vault files
2. Search through public notes
3. Find relevant mentions
4. Summarize findings

---

## 🐛 Troubleshooting

### "I don't see any Obsidian tools"

**Check:**
1. Did you fully restart Claude Code?
2. Is the config file path correct?
   - Windows: `C:\Users\<user>\AppData\Roaming\Claude\claude_desktop_config.json`
3. Is Python in your PATH? Test: `python --version`

**Fix:**
- Open Claude Code's logs/console (Help → View Logs)
- Look for MCP server errors
- Verify the Python path in config exists

### "Connection refused"

**Check:**
1. Is Obsidian running?
2. Is the plugin enabled?
3. Does Settings → MCP Bridge show "Running"?
4. Can you see port 27125? `netstat -an | findstr 27125`

**Fix:**
- Restart Obsidian
- Or: Command Palette → "MCP Bridge: Restart WebSocket Server"

### "Unauthorized" or API key errors

**Check:**
1. Is the API key in `claude_desktop_config.json` correct?
2. Copy it fresh from Obsidian Settings → MCP Bridge

**Fix:**
- Update the key in config file
- Restart Claude Code

### "Dataview tables are empty"

**Check:**
1. Is Dataview plugin installed and enabled in Obsidian?
2. Do the notes actually have Dataview queries?

**Fix:**
- Wait the full 2-3 seconds for render
- Manually open the note in Obsidian first to verify Dataview works

---

## 📚 Available Tools (Phase 1)

Claude Code now has access to these tools:

### `render_note(filepath)`
Get fully-rendered HTML with Dataview queries executed.

**When to use:**
- You want to see what a note looks like rendered
- You need Dataview table data
- You want plugin outputs included

**Example prompt:**
"Show me the rendered version of my Garden Dashboard"

### `get_note_raw(filepath)`
Get raw markdown content.

**When to use:**
- You want to see the source markdown
- You need frontmatter data
- You're editing/analyzing structure

**Example prompt:**
"Show me the raw markdown of Home.md"

### `list_vault_files(folder?)`
List all markdown files in vault or specific folder.

**When to use:**
- Discovering what notes exist
- Finding notes in a category
- Building an index

**Example prompt:**
"List all notes in my 00_Sowing folder"

### `ping()`
Health check / connection test.

**When to use:**
- Verifying the connection works
- Debugging issues

**Example prompt:**
"Ping the Obsidian server"

---

## 🎨 Creative Ways to Use It

### Writing Assistant
```
Read my note about "Keeping a Journal" and suggest improvements
```

### Knowledge Graph
```
Show me all notes that reference "Digital Garden" and summarize the connections
```

### Dashboard Automation
```
Based on my Garden Dashboard, what should I work on today?
```

### Content Audit
```
Which of my public notes haven't been updated in over a month?
(Tip: use the new `dataview_query` tool if you just need the table output)
```

### Research Helper
```
I'm writing about X, find all my notes that might be relevant
```

---

## ⏭️ What's Coming Next (Phase 3)

We're planning to add:
- SmartConnections-powered semantic search + similarity lookups
- Digital Garden preview endpoints so AI can show publish-ready output
- Safe plugin method calls with guardrails/approval prompts

---

## 💡 Tips for Best Results

1. **Be specific with file paths**
   - Good: "Notes/00_Sowing/Home.md"
   - Bad: "Home.md" (might not find it)

2. **Wait for Dataview rendering**
   - The tool automatically waits 2-3 seconds
   - Be patient for complex dashboards

3. **Start small, go big**
   - Test with simple notes first
   - Then try complex dashboards
   - Then try multiple operations

4. **Give context**
   - "My Garden Dashboard is at Notes/Dashboards/🔎Garden Dashboard.md"
   - Claude will remember this in the conversation

5. **Use natural language**
   - Don't worry about exact tool names
   - Claude figures out which tool to use
   - Just ask naturally!

---

## 🎉 You're Ready!

You've built something powerful:
- Direct access to your Obsidian vault
- Perfect Dataview rendering
- AI that can reason over your knowledge base
- Future-proof architecture

**Now go explore your vault with AI!** 🚀

---

## 📝 Keep Notes On What Works

As you use it, note:
- What prompts work well
- What features you wish existed
- Any bugs or issues
- Ideas for Phase 2

This will help us improve it together!

---

**Questions?** Check:
- `README.md` - Main documentation
- `QUICK-START.md` - Technical setup
- `PUBLISHING-GUIDE.md` - Future distribution plans
- `docs/setup.md` - Detailed installation

**Have fun!** 🎊
