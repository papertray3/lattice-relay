# Dataview Query Cache Plan

## Problem Statement

Large Dataview query results (>10KB) exceed MCP transport limits and cause failures. Need to cache large results to disk and return metadata instead of full content, similar to `render_note_dg_compiled`.

## Solution Overview

Implement TTL-based caching with context file mtime tracking for `run_dataview_block` results that exceed 10KB.

## Design Decisions

### Cache Strategy: Option 1 (TTL + Context mtime)

**Invalidation triggers:**
1. Cache age exceeds 5 minutes (TTL)
2. Context file mtime changed (if `filepath` parameter provided)
3. `force_refresh=true` parameter set (user/AI request)

**Why this approach:**
- Simple and reliable
- Respects file changes without complex dependency tracking
- Fast for repeated queries during active work sessions
- AI agents can force refresh when needed
- Doesn't attempt to track vault-wide data changes (too complex for Phase I)

### Cache Key Generation

```
cacheKey = hash(flavor + source + filepath + JSON.stringify(input))
```

**Rationale:**
- Unique per query configuration
- Same query with same params hits same cache
- Different input data creates separate cache entries

### Storage Structure

**Location:** `.cache/dataview-queries/`

**Files per cached query:**
```
.cache/dataview-queries/
├── abc123def456.md          # Cached markdown content
├── abc123def456.html        # Cached HTML content
└── abc123def456.meta.json   # Cache metadata
```

**Metadata format:**
```json
{
  "queryHash": "abc123def456",
  "flavor": "dataview",
  "source": "TABLE FROM #project",
  "contextPath": "Notes/Dashboard.md",
  "contextMtime": 1699999999000,
  "cachedAt": 1699999999000,
  "ttlSeconds": 300,
  "contentLength": 45000
}
```

## Implementation Plan

### 1. Create Query Cache Manager

**File:** `plugin/src/query-cache-manager.ts`

**Key methods:**
```typescript
class QueryCacheManager {
  // Generate cache key from query params
  generateCacheKey(params: QueryCacheParams): string

  // Check if cache is valid (not expired, context file unchanged)
  async isValid(cacheKey: string, contextPath?: string): Promise<boolean>

  // Read cached result
  async get(cacheKey: string): Promise<CachedQueryResult | null>

  // Write query result to cache
  async set(cacheKey: string, result: QueryResult, params: QueryCacheParams): Promise<string>

  // Clear expired entries (called periodically)
  async clearExpired(): Promise<void>
}
```

**Interfaces:**
```typescript
interface QueryCacheParams {
  flavor: 'dataview' | 'dataviewjs';
  source: string;
  filepath?: string;
  input?: any;
}

interface CachedQueryResult {
  cachePath: string;
  hash: string;
  contentLength: number;
  cacheAge: number; // seconds since cached
  metadata: QueryCacheMetadata;
}

interface QueryCacheMetadata {
  queryHash: string;
  flavor: string;
  source: string;
  contextPath?: string;
  contextMtime?: number;
  cachedAt: number;
  ttlSeconds: number;
  contentLength: number;
}
```

### 2. Update DataviewExecutionResult Interface

**File:** `plugin/src/dataview-helper.ts`

```typescript
export interface DataviewExecutionResult {
  // Existing fields
  renderedMarkdown?: string;  // Only present if < 10KB
  renderedHtml?: string;      // Only present if < 10KB
  elapsedMs: number;
  warnings?: string[];
  errors?: string[];
  success: boolean;

  // NEW: Cache fields (only present if >= 10KB)
  cached?: boolean;           // true if result came from cache
  cachePath?: string;         // absolute path to cached markdown file
  hash?: string;              // cache key hash
  contentLength?: number;     // size in bytes
  cacheAge?: number;          // seconds since cached
}
```

### 3. Update RunDataviewBlockParams

**File:** `plugin/src/handlers/dataview-block.ts`

```typescript
export interface RunDataviewBlockParams {
  filepath?: string;
  flavor: 'dataview' | 'dataviewjs';
  source: string;
  input?: any;
  force_refresh?: boolean;    // NEW: bypass cache
}
```

### 4. Integrate Caching into Dataview Execution

**File:** `plugin/src/dataview-helper.ts`

**Logic flow:**
```typescript
async runDataview(query: string, contextPath?: string, forceRefresh?: boolean): Promise<DataviewExecutionResult> {
  // Generate cache key
  const cacheParams = { flavor: 'dataview', source: query, filepath: contextPath };
  const cacheKey = queryCacheManager.generateCacheKey(cacheParams);

  // Check cache (unless force_refresh)
  if (!forceRefresh) {
    const cached = await queryCacheManager.get(cacheKey);
    if (cached && await queryCacheManager.isValid(cacheKey, contextPath)) {
      return {
        success: true,
        cached: true,
        cachePath: cached.cachePath,
        hash: cached.hash,
        contentLength: cached.contentLength,
        cacheAge: cached.cacheAge,
        elapsedMs: 5 // Cache hit is fast
      };
    }
  }

  // Execute query
  const result = await dvPlugin.api.tryQueryMarkdown?.(query, contextPath);

  // Check size threshold (10KB = 10240 bytes)
  const contentLength = result.length;

  if (contentLength < 10240) {
    // Small result - return directly
    return {
      success: true,
      renderedMarkdown: result,
      elapsedMs: Date.now() - startTime
    };
  } else {
    // Large result - cache it
    const cachePath = await queryCacheManager.set(cacheKey, result, cacheParams);

    return {
      success: true,
      cached: false,  // Fresh execution
      cachePath,
      hash: cacheKey,
      contentLength,
      cacheAge: 0,
      elapsedMs: Date.now() - startTime
    };
  }
}
```

### 5. Update Python MCP Server

**File:** `mcp-server/obsidian_mcp_server.py`

Update `run_dataview_block` tool schema:
```python
Tool(
    name="run_dataview_block",
    description="Execute a Dataview query. Large results (>10KB) are cached and return metadata with cachePath instead of full content.",
    inputSchema={
        "type": "object",
        "properties": {
            "filepath": {...},
            "flavor": {...},
            "source": {...},
            "input": {...},
            "force_refresh": {
                "type": "boolean",
                "description": "Force re-execution, bypass cache even if valid"
            }
        },
        "required": ["flavor", "source"]
    }
)
```

### 6. Add Cache Management to Main Plugin

**File:** `plugin/src/main.ts`

```typescript
export default class MCPBridgePlugin extends Plugin {
  cacheManager: RenderedContentCacheManager;
  queryCacheManager: QueryCacheManager;  // NEW

  async onload() {
    // ... existing cache manager init ...

    // Initialize query cache manager
    const queryCacheDir = path.join(
      (this.app.vault.adapter as any).basePath,
      this.settings.cacheDirPath,
      'dataview-queries'
    );
    this.queryCacheManager = new QueryCacheManager(this.app.vault, {
      cacheDir: queryCacheDir,
      maxSizeMB: this.settings.cacheMaxSizeMB / 2,  // Share cache budget
      ttlSeconds: 300  // 5 minutes
    });
  }

  getQueryCacheManager(): QueryCacheManager {
    return this.queryCacheManager;
  }
}
```

### 7. Update Settings UI

**File:** `plugin/src/settings.ts`

Add cache statistics for query cache:
```typescript
// Cache Statistics
new Setting(containerEl)
  .setName('Cache Statistics')
  .setDesc('Current cache usage')
  .addButton(button => button
    .setButtonText('Refresh')
    .onClick(async () => {
      const renderStats = await plugin.getCacheManager().getCacheStats();
      const queryStats = await plugin.getQueryCacheManager().getCacheStats();

      new Notice(`Render Cache: ${renderStats.count} files, ${renderStats.sizeMB.toFixed(2)} MB\n` +
                 `Query Cache: ${queryStats.count} files, ${queryStats.sizeMB.toFixed(2)} MB`);
    })
  );
```

### 8. Update Documentation

**File:** `DATAVIEW-BLOCK-USAGE.md`

Add section on cache behavior:

```markdown
## Cache Behavior for Large Results

### When Results Exceed 10KB

If a query result exceeds 10KB, it will be cached to disk:

```json
{
  "success": true,
  "cached": false,
  "cachePath": "/vault/.cache/dataview-queries/abc123.md",
  "hash": "abc123def456",
  "contentLength": 45000,
  "cacheAge": 0,
  "elapsedMs": 120
}
```

Read the content from `cachePath` to get the full result.

### Cache Invalidation

Cache entries are invalidated when:
1. **Age > 5 minutes** - TTL expires, query re-executed
2. **Context file modified** - If you provided `filepath` parameter, cache invalidates when that file changes
3. **Force refresh** - Set `force_refresh: true` to bypass cache

### Force Refresh

```
Use run_dataview_block with force_refresh: true to bypass cache and get fresh data
```

This is useful when:
- You know vault data has changed significantly
- You're debugging query results
- You need real-time data despite recent cache

### Cache Location

Query results are stored in: `.cache/dataview-queries/`

Each cached query has:
- `.md` file (markdown output)
- `.html` file (HTML output, if available)
- `.meta.json` file (cache metadata)

### Performance

- **Small results (<10KB)**: Returned directly, ~50-100ms
- **Large results (cached)**: Cache hit, ~5-10ms
- **Large results (fresh)**: Full execution + cache write, ~100-500ms
```

## Testing Plan

### Manual Tests

1. **Small result (no caching)**
   ```
   Query: "LIST FROM #small-tag"
   Expected: renderedMarkdown returned directly
   ```

2. **Large result (initial cache write)**
   ```
   Query: "TABLE FROM #project"
   Expected: cached=false, cachePath returned
   Verify: .cache/dataview-queries/ contains files
   ```

3. **Large result (cache hit)**
   ```
   Same query within 5 minutes
   Expected: cached=true, cacheAge < 300
   ```

4. **Cache invalidation (TTL)**
   ```
   Wait 6 minutes, run same query
   Expected: cached=false (re-executed)
   ```

5. **Cache invalidation (context mtime)**
   ```
   Query with filepath parameter
   Modify context file
   Run query again
   Expected: cached=false (re-executed)
   ```

6. **Force refresh**
   ```
   Run query with force_refresh=true
   Expected: cached=false even if valid cache exists
   ```

### Automated Tests (Future)

- Unit tests for cache key generation
- Mock cache validity checks
- Size threshold detection
- TTL expiration logic

## Success Criteria

- [ ] Large query results (>10KB) are cached and return metadata
- [ ] Small query results (<10KB) are returned directly (no caching)
- [ ] Cache entries expire after 5 minutes
- [ ] Context file changes invalidate cache
- [ ] `force_refresh` parameter bypasses cache
- [ ] Cache statistics visible in settings UI
- [ ] Documentation updated with cache behavior
- [ ] No regressions in existing `run_dataview_block` functionality

## Timeline

**Estimated effort:** 4-6 hours

1. Create QueryCacheManager (1-2h)
2. Integrate into dataview-helper (1-2h)
3. Update MCP server + tests (1h)
4. Update settings UI (30min)
5. Documentation (30min)
6. Testing & refinement (1h)

## Future Enhancements (Phase II+)

- Smart dependency tracking (track which files query reads)
- Cache compression for very large results
- Cache statistics dashboard
- Configurable TTL per query
- Cache warming for frequently-used queries
