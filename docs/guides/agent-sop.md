# AI Agent Standard Operating Procedures

## Overview

This document defines best practices for AI agents working with Obsidian vaults through the Lattice Relay. Following these procedures ensures efficient, accurate, and vault-native operations.

---

## The Vault-Native First Protocol

**Golden Rule**: Always use Lattice Relay tools instead of shell commands for vault operations.

### Why Vault-Native?

1. **Accuracy**: Tools understand Obsidian's [[wiki-links]], frontmatter, and metadata
2. **Efficiency**: Direct access to Obsidian's cached metadata (no file parsing)
3. **Reliability**: Changes respect vault structure and plugin ecosystem
4. **Safety**: Operations validate against vault state

### Shell Commands to Avoid

❌ **Never use these for vault operations:**
```bash
grep "pattern" *.md          # Use search_notes_structured instead
find . -name "*.md"          # Use list_vault_files instead
cat note.md                  # Use get_note_raw instead
sed -i "s/old/new/"          # Use proper write tools instead
```

---

## Standard Workflows

### 1. Understanding a Note

**Correct Pattern:**
```javascript
// Step 1: Get raw content (foundation)
const raw = await get_note_raw({ filepath: "path/to/note.md" });

// Step 2: Get structured metadata (parsed structure)
const metadata = await get_note_metadata({
  filepath: "path/to/note.md",
  includeLinks: true,
  includeBacklinks: true,
  resolvePaths: true
});

// Step 3: Extract dataview results if note has queries
const dvBlocks = await extract_dataview_blocks({ filepath: "path/to/note.md" });
for (const block of dvBlocks) {
  const result = await run_dataview_block({
    flavor: block.flavor,
    source: block.source,
    filepath: "path/to/note.md",
    format: "structured"  // Get JSON, not HTML
  });
}

// Step 4: Synthesize information
// Now you have:
// - raw.content: Full markdown text
// - metadata.frontmatter: Parsed YAML
// - metadata.tags: All tags (frontmatter + inline)
// - metadata.links: Resolved outgoing links
// - metadata.backlinks: Notes that link here
// - dvBlocks: Dataview query results
```

**Why this order?**
- Raw content first provides the full picture
- Metadata adds structured understanding
- Dataview results show dynamic content
- Synthesis creates complete understanding

### 2. Exploring Note Connections

**For a few links (< 100):**
```javascript
const metadata = await get_note_metadata({
  filepath: "path/to/note.md",
  includeLinks: true,
  includeBacklinks: true,
  resolvePaths: true,
  maxLinks: 50
});

// metadata.links.outgoing: Notes this note links to
// metadata.backlinks.incoming: Notes that link here
```

**For many links (> 100):**
```javascript
// First page
const links = await get_note_links({
  filepath: "path/to/note.md",
  includeOutgoing: true,
  includeBacklinks: true,
  resolvePaths: true,
  limit: 100,
  offset: 0
});

// If more pages exist
if (links.hasMore) {
  const nextPage = await get_note_links({
    filepath: "path/to/note.md",
    limit: 100,
    offset: links.nextOffset
  });
}
```

### 3. Validating Wiki Links

**Before creating links:**
```javascript
const links = ["Target Note 1", "Target Note 2", "Non-existent"];

const resolved = await resolve_wiki_links({
  links: links,
  sourcePath: "current/note.md"  // For relative resolution
});

// Check results
resolved.resolved.forEach(item => {
  if (!item.exists) {
    console.log(`Warning: ${item.link} does not exist`);
  }
});
```

### 4. Finding Notes

**Never use find/grep:**
```javascript
// ❌ WRONG
await bash({ command: "find . -name '*project*'" });

// ✅ CORRECT
const files = await search_files({ pattern: "**/*project*.md" });
```

**With metadata filters (coming in Phase 2):**
```javascript
const results = await search_notes_structured({
  pattern: "project",
  filters: {
    tags: ["#active"],
    frontmatter: { status: "in-progress" }
  }
});
```

### 5. Working with Dataview

**Extract and run queries:**
```javascript
// Find all dataview blocks in a note
const blocks = await extract_dataview_blocks({
  filepath: "Notes/Dashboards/Dashboard.md"
});

// Execute each block with structured output
for (const block of blocks) {
  const result = await run_dataview_block({
    flavor: block.flavor,
    source: block.source,
    filepath: "Notes/Dashboards/Dashboard.md",
    format: "structured"  // Returns JSON, not HTML
  });

  // Process results programmatically
  if (result.success && result.data) {
    // result.data is parsed JSON you can work with
  }
}
```

**Run ad-hoc queries:**
```javascript
const result = await run_dataview_block({
  flavor: "dataview",
  source: `
    TABLE title, status, tags
    FROM "Notes/Projects"
    WHERE status = "active"
    SORT file.mtime DESC
  `,
  format: "structured"
});

// Process the table rows
result.data.rows.forEach(row => {
  console.log(`Project: ${row.title}, Status: ${row.status}`);
});
```

---

## Tool Selection Guide

### Metadata Operations

| Task | Use This Tool | Not This |
|------|---------------|----------|
| Get note content | `get_note_raw` | `cat`, `head`, `tail` |
| Get frontmatter | `get_note_metadata` | `grep "^---"`, manual parsing |
| Get tags | `get_note_metadata` | `grep "#"` |
| Get links | `get_note_metadata` or `get_note_links` | `grep "\[\["` |
| Get backlinks | `get_note_links` | Manual search |
| Validate links | `resolve_wiki_links` | Manual checking |

### Search Operations

| Task | Use This Tool | Not This |
|------|---------------|----------|
| Find files | `search_files` | `find`, `ls -R` |
| List vault | `list_vault_files` | `find . -name "*.md"` |
| Search content | `search_notes_structured` (Phase 2) | `grep -r` |

### Query Operations

| Task | Use This Tool | Not This |
|------|---------------|----------|
| Run dataview | `run_dataview_block` | Manual parsing |
| Find queries | `extract_dataview_blocks` | `grep "dataview"` |

---

## Performance Guidelines

### Use Pagination for Large Datasets

```javascript
// ✅ Good: Paginate large link lists
async function getAllLinks(filepath) {
  const allLinks = [];
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const page = await get_note_links({
      filepath,
      limit: 100,
      offset
    });

    allLinks.push(...page.outgoing);
    hasMore = page.hasMore;
    offset = page.nextOffset;
  }

  return allLinks;
}
```

### Batch Operations

```javascript
// ✅ Good: Validate multiple links at once
const toValidate = ["Note 1", "Note 2", "Note 3", ...];
const results = await resolve_wiki_links({ links: toValidate });

// ❌ Bad: One at a time
for (const link of toValidate) {
  const result = await resolve_wiki_links({ links: [link] });
}
```

### Conditional Metadata

```javascript
// ✅ Good: Only fetch what you need
const metadata = await get_note_metadata({
  filepath: "note.md",
  includeLinks: false,      // Don't need links
  includeBacklinks: false   // Don't need backlinks
});

// ❌ Bad: Always fetching everything
const metadata = await get_note_metadata({
  filepath: "note.md",
  includeLinks: true,       // Unnecessary if not used
  includeBacklinks: true    // Expensive operation
});
```

---

## Common Anti-Patterns

### ❌ Anti-Pattern: Manual Parsing

```javascript
// DON'T DO THIS
const raw = await get_note_raw({ filepath: "note.md" });
const frontmatterMatch = raw.content.match(/^---\n(.*?)\n---/s);
const yamlText = frontmatterMatch[1];
// ... manual YAML parsing ...
```

**Why it's wrong:**
- Fragile (breaks on edge cases)
- Inefficient (re-parsing cached data)
- Error-prone (YAML parsing is complex)

**✅ Correct approach:**
```javascript
const metadata = await get_note_metadata({ filepath: "note.md" });
const frontmatter = metadata.frontmatter;  // Already parsed!
```

### ❌ Anti-Pattern: Shell Commands for Vault Ops

```javascript
// DON'T DO THIS
await bash({ command: "grep -r 'TODO' Notes/" });
```

**Why it's wrong:**
- Can't parse wiki links
- Can't read frontmatter
- Ignores Obsidian metadata
- Slower (no caching)

**✅ Correct approach:**
```javascript
// Use proper search tools (Phase 2)
const results = await search_notes_structured({
  pattern: "TODO",
  folder: "Notes"
});
```

### ❌ Anti-Pattern: Ignoring Pagination

```javascript
// DON'T DO THIS - May fail on large graphs
const metadata = await get_note_metadata({
  filepath: "hub-note.md",
  includeBacklinks: true,
  maxLinks: 9999  // Trying to get all at once
});
```

**Why it's wrong:**
- May exceed MCP response limit (10KB)
- Inefficient memory usage
- Slow response times

**✅ Correct approach:**
```javascript
const links = await get_note_links({
  filepath: "hub-note.md",
  limit: 100,  // Reasonable page size
  offset: 0
});

if (links.hasMore) {
  // Handle pagination
}
```

---

## Decision Tree

```
Need to work with an Obsidian note?
│
├─ Need raw markdown content?
│  └─ Use: get_note_raw()
│
├─ Need structured metadata?
│  ├─ Frontmatter, tags, basic info?
│  │  └─ Use: get_note_metadata()
│  │
│  └─ Many links (>100)?
│     └─ Use: get_note_links() with pagination
│
├─ Need to validate wiki links?
│  └─ Use: resolve_wiki_links()
│
├─ Need to find notes?
│  ├─ By filename pattern?
│  │  └─ Use: search_files()
│  │
│  └─ By content/metadata?
│     └─ Use: search_notes_structured() (Phase 2)
│
└─ Need dataview results?
   ├─ Extract queries from note?
   │  └─ Use: extract_dataview_blocks()
   │
   └─ Run specific query?
      └─ Use: run_dataview_block() with format: "structured"
```

---

## Version History

- **2024-11-28**: Initial version - Vault-Native First protocol
- **Phase 1**: Core metadata tools (get_note_metadata, get_note_links, resolve_wiki_links)
- **Phase 2** (Planned): Search and batch tools
- **Phase 3** (Planned): Cache removal and simplification
