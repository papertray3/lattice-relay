# Using render_note_dg_compiled

## Overview
The `render_note_dg_compiled` MCP tool leverages the Digital Garden plugin's compiler to render notes with full Dataview execution and caching. This solves two key problems:
1. **Size limits:** Returns cached file path instead of full HTML content
2. **Performance:** Caches rendered output for fast repeated access

## Prerequisites
- Digital Garden plugin must be installed and enabled
- Lattice Relay plugin running
- MCP server configured in your AI client

**Note:** The Lattice Relay will automatically initialize the Digital Garden compiler on first use. You may see the Publication Center modal open and close briefly - this is normal and only happens once per Obsidian session.

## Important: dg-publish Not Required

**This tool compiles ANY file you request, regardless of `dg-publish` frontmatter.**

Unlike Digital Garden's normal publishing workflow, `render_note_dg_compiled` bypasses the publish filtering and directly calls the compiler. This means:

- ✅ You can render notes with `dg-publish: false`
- ✅ You can preview drafts before marking them for publish
- ✅ You can render private notes that shouldn't go to your public garden
- ✅ The `dg-publish` flag only matters for actual GitHub publishing, not rendering

**Why?** The Lattice Relay is for **reading/previewing** your vault, not publishing it. You should be able to render any note for local use.

## Basic Usage

### Via Claude Code

```
Use the render_note_dg_compiled tool to render "Notes/Dashboards/🔎Garden Dashboard.md"
```

**Response:**
```json
{
  "success": true,
  "cachePath": ".cache/compiled-notes/abc123.../note.html",
  "length": 25432,
  "hash": "abc123...",
  "lastModified": 1736605234000,
  "cacheHit": false
}
```

**Note:** The `cachePath` is vault-relative (e.g., `.cache/...`) for cross-environment compatibility. AI agents can construct the full path based on their environment:
- Windows: `${vaultPath}\.cache\compiled-notes\...`
- WSL: `/mnt/c/.../vault/.cache/compiled-notes/...`
- Unix: `/Users/.../vault/.cache/compiled-notes/...`

### Reading the Cached File

Once you have the `cachePath`, read the file directly:

```
Read the file at the cachePath returned
```

This gives you the full rendered HTML with all Dataview queries executed.

## When to Use

### Use `render_note_dg_compiled` when:
- ✅ Note contains Dataview queries that need execution
- ✅ Note is large (>10KB) and may exceed MCP limits
- ✅ You need Digital Garden's exact compilation output
- ✅ You'll access the same note multiple times (caching benefit)
- ✅ You want the same output that would be published to your digital garden

### Use `get_note_raw` when:
- ✅ You only need the raw markdown
- ✅ You'll process the content yourself
- ✅ You don't need Dataview execution or plugin rendering

## Cache Behavior

### Cache Key
Cache key is based on: `hash(filepath + mtime + size)`

**Cache invalidates automatically when:**
- File content changes (mtime updates)
- File size changes

**Cache does NOT invalidate when:**
- Only viewing the file
- Opening/closing the file

### Cache Management

**View cache stats:**
1. Open Obsidian Settings
2. Go to Lattice Relay plugin settings
3. Scroll to "Cache Settings" section
4. View statistics: entries count, total size, limit

**Clear cache manually:**
1. Open Lattice Relay plugin settings
2. Click "Clear Cache" button in Cache Settings
3. All cached files deleted

**Adjust cache size:**
1. Open Lattice Relay plugin settings
2. Update "Cache Size Limit" (default: 100 MB)
3. Save settings
4. LRU eviction happens automatically when limit reached

## Configuration

### Cache Directory
**Default:** `.obsidian/cache/lattice-relay-render`

**To change:**
1. Open Lattice Relay plugin settings
2. Update "Cache Directory" field
3. Use path relative to vault root
4. Restart plugin to apply

### Cache Size Limit
**Default:** 100 MB

**To change:**
1. Open Lattice Relay plugin settings
2. Update "Cache Size Limit" field
3. Enter size in MB
4. Changes apply immediately

## Error Handling

### Digital Garden Not Available
**Error:**
```json
{
  "success": false,
  "error": "DigitalGardenNotAvailable",
  "message": "Digital Garden plugin is not installed or not enabled..."
}
```

**Solution:**
1. Install Digital Garden plugin from Community Plugins
2. Enable it in Settings → Community Plugins
3. Configure Digital Garden settings (repo URL, etc.)
4. The Lattice Relay will automatically initialize the compiler on first use

**Note:** If you see this error, the auto-initialization failed. The Digital Garden plugin must be enabled for the Lattice Relay to initialize it.

### File Not Found
**Error:**
```json
{
  "success": false,
  "error": "FileNotFound",
  "message": "File not found: path/to/note.md"
}
```

**Solution:**
- Check filepath is correct (relative to vault root)
- Verify file exists in vault
- Use `list_vault_files` to find correct path

### Compilation Error
**Error:**
```json
{
  "success": false,
  "error": "CompilationError",
  "message": "Failed to compile file: ..."
}
```

**Solution:**
- Check note has valid markdown syntax
- Check Dataview queries are valid
- Review Digital Garden plugin logs
- Try rendering the note manually in DG

## Advanced Usage

### Cache Warming
Pre-render frequently accessed notes:

```
For each dashboard note, call render_note_dg_compiled to warm the cache
```

### Monitoring Cache Performance
```
Get cache stats from Lattice Relay settings
- If cache hit rate is low, consider increasing size limit
- If cache size is maxed out, consider clearing old entries
```

### Integration with Workflows
```
1. Call render_note_dg_compiled on note
2. Parse the response to get cachePath
3. Read cached file for full HTML
4. Process HTML (extract tables, links, etc.)
5. Repeat step 3 for fast access (cache hit)
```

## Performance Tips

1. **Batch operations:** Render multiple notes, then read cached files
2. **Cache warming:** Pre-render frequently used dashboards
3. **Size management:** Adjust cache limit based on vault size
4. **Selective caching:** Only use for notes that benefit from caching

## Comparison Table

| Feature | render_note_dg_compiled | get_note_raw |
|---------|-------------------------|--------------|
| Dataview execution | ✅ Yes | ❌ No |
| Caching | ✅ Yes | ❌ No |
| Size limit | No limit (returns vault-relative path) | 10KB MCP limit |
| DG compilation | ✅ Yes | ❌ No |
| First call speed | 2-3 sec | <100ms |
| Cached call speed | <50ms | N/A |
| Requires DG plugin | ✅ Yes (auto-initialized) | ❌ No |
| Cross-environment paths | ✅ Yes (vault-relative) | N/A |

## Examples

### Example 1: Render Dashboard
```
Render Notes/Dashboards/🔎Garden Dashboard.md using DG compiled render
```

**Output:** Cache metadata with path

```
Read the HTML from the cached file
```

**Output:** Full HTML with executed Dataview

### Example 2: Monitor Cache
```
What are the current cache statistics?
```

Check Lattice Relay settings → Cache Settings section

### Example 3: Clear Cache
```
The cache is getting too large, please clear it
```

Open Lattice Relay settings → Click "Clear Cache" button

## Troubleshooting

See the Bridge-era [compiled render test notes](../history/bridge/dg-compiled-test.md) for detailed troubleshooting.

## Related Documentation
- [README](../../README.md) - Main documentation
- Digital Garden plugin documentation
