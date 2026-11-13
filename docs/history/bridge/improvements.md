# Architecture Improvements & Technical Debt

**Purpose:** Track architectural enhancements and refactoring opportunities for Phase 2+

**Status:** Living document - add items as discovered during development

---

## Schema Management & Code Generation

### Problem: Tool Schema Duplication

**Current State:**
The API schema exists in **three separate locations**:

1. **Obsidian Plugin** (`plugin/src/main.ts:104-158`)
   - TypeScript switch statement with hardcoded method names
   - No programmatic schema introspection

2. **Python MCP Server** (`mcp-server/obsidian_mcp_server.py:150-301`)
   - Hand-written Python `Tool` definitions with JSON Schema
   - Duplicates parameter names, types, descriptions

3. **Node MCP Server** (`mcp-server-node/src/tools/*.ts`)
   - Hand-written TypeScript tool definitions
   - Organized by domain (vault, plugins, dataview, render)

**Issues:**
- ⚠️ **Maintenance burden**: Adding a new tool requires updates in 3 places
- ⚠️ **Schema drift risk**: Manual sync can lead to inconsistencies
- ⚠️ **No single source of truth**: Changes must be coordinated across codebases
- ⚠️ **WebSocket has no discovery**: Direct WebSocket clients must know API intrinsically

**Impact:**
- Phase 2: Manageable with ~10 tools
- Phase 3+: Will become painful as tool count grows

### Proposed Solution: Single-Source Schema Definition

**Approach:** Define API schema once, generate code for all three layers

**Option A: OpenAPI/JSON Schema File**
```yaml
# schema/obsidian-mcp-api.yaml
openapi: 3.0.0
info:
  title: Obsidian MCP Bridge API
  version: 2.0.0

paths:
  /get_note_raw:
    post:
      summary: Get raw markdown content of a note
      parameters:
        - name: filepath
          in: body
          required: true
          schema:
            type: string
            description: Path to note file (relative to vault root)
      responses:
        200:
          description: Raw markdown content
          content:
            text/plain:
              schema:
                type: string
  # ... other tools
```

**Generated artifacts:**
- `plugin/src/generated/methods.ts` - TypeScript handler signatures + router
- `mcp-server/generated/tools.py` - MCP tool definitions
- `mcp-server-node/src/generated/tools.ts` - MCP tool definitions
- `docs/API-REFERENCE.md` - Human-readable documentation

**Option B: TypeScript-First Schema**
```typescript
// schema/api-schema.ts
export const API_SCHEMA = {
  get_note_raw: {
    description: "Get raw markdown content of a note",
    params: {
      filepath: { type: "string", required: true, description: "..." }
    },
    returns: { type: "string" }
  },
  // ... other tools
} as const;
```

**Code generation workflow:**
```bash
# Development workflow
npm run generate-schemas  # Reads schema/api-schema.ts or .yaml
                         # Generates code for all three layers
                         # Validates no breaking changes

# CI/CD check
npm run validate-schemas  # Ensures generated code is up-to-date
                         # Fails if manual edits drift from schema
```

**Benefits:**
- ✅ Single source of truth for API contract
- ✅ Reduces manual sync errors
- ✅ Enables WebSocket API discovery (optional `/schema` endpoint)
- ✅ Auto-generates API documentation
- ✅ Validates breaking changes during development
- ✅ Supports TypeScript types for compile-time safety

**Implementation Phases:**

**Phase 1: Schema definition & validation** (Week 1)
- [ ] Choose format (OpenAPI vs TypeScript DSL)
- [ ] Define schema for all 10 current tools
- [ ] Create validation script

**Phase 2: Code generation** (Week 2-3)
- [ ] Build generator for TypeScript plugin handlers
- [ ] Build generator for Python MCP tools
- [ ] Build generator for Node MCP tools
- [ ] Add npm scripts for generation workflow

**Phase 3: Migration** (Week 4)
- [ ] Replace hand-written schemas with generated code
- [ ] Update development workflow documentation
- [ ] Add CI checks to enforce schema-first development

**Phase 4: Enhancements** (Post-migration)
- [ ] Add optional `/schema` endpoint to WebSocket server
- [ ] Generate API documentation from schema
- [ ] Add versioning support (breaking vs non-breaking changes)

**Estimated Effort:** 2-3 weeks for full implementation

**Priority:** Medium (good foundation for Phase 3 plugin ecosystem expansion)

**Dependencies:** None (can start immediately)

**References:**
- [Model Context Protocol Spec](https://spec.modelcontextprotocol.io/)
- [OpenAPI 3.0 Specification](https://swagger.io/specification/)
- [JSON Schema](https://json-schema.org/)

---

## Future Improvement Ideas

### WebSocket Protocol Enhancement
- Add `/list_methods` endpoint for introspection
- Version negotiation during handshake
- Binary message support for large payloads

### Performance Optimizations
- Connection pooling for multiple MCP clients
- Response streaming for large query results
- Caching layer for frequently accessed notes

### Security Enhancements
- Token rotation mechanism
- Rate limiting per client
- Audit logging for sensitive operations

### Developer Experience
- Hot reload for plugin development
- Debug mode with verbose logging
- Integration tests for tool contract validation

---

**Document History:**
- 2025-01-19: Initial version - Schema duplication improvement documented
