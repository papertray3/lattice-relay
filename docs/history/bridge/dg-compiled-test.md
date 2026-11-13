# Testing Guide: DG Compiled Render Feature

## Overview
This test plan covers the new `render_note_dg_compiled` tool that uses Digital Garden's compiler with caching to render notes.

## Prerequisites
1. Obsidian MCP Bridge plugin installed and running
2. Digital Garden plugin installed and enabled
3. MCP server configured in Claude Code
4. Test notes available in vault

## Manual Test Cases

### Test 1: Basic Functionality - Digital Garden Available
**Objective:** Verify the tool works when Digital Garden is installed and enabled

**Steps:**
1. Ensure Digital Garden plugin is enabled in Obsidian
2. Use the MCP tool:
   ```
   render_note_dg_compiled with filepath: "Notes/Dashboards/🔎Garden Dashboard.md"
   ```
3. Expected result:
   ```json
   {
     "success": true,
     "cachePath": "/path/to/.obsidian/cache/mcp-bridge-render/<hash>/note.html",
     "length": 25000,
     "hash": "abc123...",
     "lastModified": 1234567890,
     "cacheHit": false
   }
   ```

### Test 2: Cache Hit
**Objective:** Verify cache returns existing content on second request

**Steps:**
1. Call `render_note_dg_compiled` on the same file twice
2. First call should have `cacheHit: false`
3. Second call should have `cacheHit: true`
4. Both should return same `cachePath` and `hash`

### Test 3: Cache Invalidation
**Objective:** Verify cache invalidates when file changes

**Steps:**
1. Call `render_note_dg_compiled` on a note
2. Modify the note in Obsidian (save changes)
3. Call `render_note_dg_compiled` again on same note
4. Expected: `cacheHit: false` and new `hash` value

### Test 4: Digital Garden Not Available
**Objective:** Verify graceful error when DG not available

**Steps:**
1. Disable Digital Garden plugin in Obsidian
2. Call `render_note_dg_compiled`
3. Expected result:
   ```json
   {
     "success": false,
     "error": "DigitalGardenNotAvailable",
     "message": "Digital Garden plugin is not installed or not enabled..."
   }
   ```

### Test 5: File Not Found
**Objective:** Verify error handling for non-existent files

**Steps:**
1. Call `render_note_dg_compiled` with invalid filepath
2. Expected result:
   ```json
   {
     "success": false,
     "error": "FileNotFound",
     "message": "File not found: invalid/path.md"
   }
   ```

### Test 6: Cache Size Limit
**Objective:** Verify LRU eviction when cache exceeds size limit

**Steps:**
1. Set cache size limit to 10 MB in settings
2. Render multiple large notes (total > 10 MB)
3. Check cache statistics in settings
4. Verify oldest entries are evicted
5. Total size should stay under 10 MB

### Test 7: Cache Clear
**Objective:** Verify manual cache clearing works

**Steps:**
1. Render several notes to populate cache
2. Check cache stats (should show entries)
3. Click "Clear Cache" button in settings
4. Check cache stats again (should show 0 entries)

### Test 8: Large Dashboard with Dataview
**Objective:** Verify compilation of complex notes with Dataview

**Steps:**
1. Use a note with multiple Dataview queries
2. Call `render_note_dg_compiled`
3. Read the cached file directly from filesystem
4. Verify Dataview queries are executed and HTML is present

### Test 9: Read Cached File
**Objective:** Verify cached file can be read directly

**Steps:**
1. Call `render_note_dg_compiled` and get `cachePath`
2. Use filesystem read to access the cached HTML file
3. Verify HTML content is complete and valid
4. Verify Dataview content is rendered

## Automated Test Script

```python
#!/usr/bin/env python3
"""
Automated tests for render_note_dg_compiled
Run from: mcp-server/
"""

import asyncio
import websockets
import json

OBSIDIAN_WS_URL = "ws://localhost:27125"
OBSIDIAN_API_KEY = "your-api-key-here"

async def test_dg_compiled_render():
    """Test DG compiled render functionality"""

    async with websockets.connect(OBSIDIAN_WS_URL) as ws:
        # Test 1: Basic functionality
        print("Test 1: Basic functionality...")
        request = {
            "auth": OBSIDIAN_API_KEY,
            "method": "render_note_dg_compiled",
            "params": {
                "filepath": "Notes/Dashboards/🔎Garden Dashboard.md"
            }
        }
        await ws.send(json.dumps(request))
        response = json.loads(await ws.recv())
        result = response.get("result")

        assert result.get("success") == True, "Should succeed"
        assert "cachePath" in result, "Should return cachePath"
        assert "hash" in result, "Should return hash"
        print(f"✓ Success: {result}")

        # Test 2: Cache hit
        print("\nTest 2: Cache hit...")
        await ws.send(json.dumps(request))
        response = json.loads(await ws.recv())
        result2 = response.get("result")

        assert result2.get("cacheHit") == True, "Should be cache hit"
        assert result2.get("hash") == result.get("hash"), "Hash should match"
        print(f"✓ Cache hit verified")

        # Test 3: File not found
        print("\nTest 3: File not found...")
        request["params"]["filepath"] = "invalid/path.md"
        await ws.send(json.dumps(request))
        response = json.loads(await ws.recv())
        result3 = response.get("result")

        assert result3.get("success") == False, "Should fail"
        assert result3.get("error") == "FileNotFound", "Should be FileNotFound"
        print(f"✓ Error handling verified")

        print("\n✅ All tests passed!")

if __name__ == "__main__":
    asyncio.run(test_dg_compiled_render())
```

## Performance Benchmarks

### Expected Performance
- **First render (cache miss):** 1-3 seconds (depends on note complexity)
- **Subsequent render (cache hit):** < 50ms
- **Cache lookup:** < 10ms
- **LRU eviction (when needed):** < 100ms

### Comparison to render_note
- `render_note`: 2-3 seconds per call (always renders)
- `render_note_dg_compiled`: 2-3 seconds first call, < 50ms subsequent calls

## Troubleshooting

### Issue: "DigitalGardenNotAvailable" error
**Cause:** Digital Garden plugin not installed or disabled
**Solution:**
1. Install Digital Garden plugin
2. Enable it in Obsidian settings
3. Configure Digital Garden settings

### Issue: Cache not invalidating
**Cause:** File modification time not updating
**Solution:**
1. Make actual changes to file content
2. Save the file in Obsidian
3. Cache uses mtime + size for invalidation

### Issue: Cache size growing unexpectedly
**Cause:** Many large files being rendered
**Solution:**
1. Reduce cache size limit in settings
2. Clear cache manually
3. LRU eviction will remove oldest entries

### Issue: Cached file not found
**Cause:** Cache directory permissions or path issue
**Solution:**
1. Check cache directory path in settings
2. Ensure Obsidian has write permissions
3. Try clearing cache and re-rendering

## Success Criteria

All tests pass when:
- ✅ Tool returns success when DG plugin is available
- ✅ Cache hits return same hash and path
- ✅ Cache invalidates when file changes
- ✅ Graceful errors when DG not available
- ✅ Graceful errors for invalid filepaths
- ✅ LRU eviction works correctly
- ✅ Manual cache clear works
- ✅ Cached files are readable and valid HTML
- ✅ Dataview queries are executed in cached output
- ✅ Performance meets benchmarks

## Notes for Phase I Completion

Once all tests pass:
1. Update DG-Compiled-Render-Plan.md with completion status
2. Document in Implementation-Complete-2025-01-XX.md
3. Update README with new tool documentation
4. Consider this feature complete for Phase I
