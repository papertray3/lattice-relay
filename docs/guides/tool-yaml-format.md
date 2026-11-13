# Tool YAML Format Specification

## Overview

Custom tools for the Lattice Relay are defined in YAML files located in `.obsidian/lattice-relay/tools/`. Each tool is defined in a separate `.yaml` file that specifies its name, description, handler, and input/output schemas.

---

## YAML Structure

### Complete Example

```yaml
name: my_custom_tool
description: A clear description of what this tool does
handler: path/to/handler.js
category: custom
tags:
  - automation
  - helper
inputSchema:
  type: object
  properties:
    input:
      type: string
      description: Input parameter description
    optional_param:
      type: number
      description: Optional parameter
  required:
    - input
outputSchema:
  type: object
  properties:
    result:
      type: string
      description: The result of the operation
    metadata:
      type: object
      description: Additional metadata
```

---

## Field Reference

### Required Fields

#### `name` (string, required)
- **Description**: Unique identifier for the tool
- **Format**: Lowercase, underscores allowed, no spaces
- **Example**: `my_custom_tool`, `kants_project_manager`
- **Used for**: Tool invocation, filename generation

#### `description` (string, required)
- **Description**: Clear, concise explanation of what the tool does
- **Format**: Free text, 1-3 sentences recommended
- **Example**: `"Manages KANTS projects - create, update, and query project data"`
- **Used for**: AI client tool selection, documentation

#### `handler` (string, required)
- **Description**: Path to the JavaScript handler file
- **Format**: Can be vault-relative or absolute
- **Examples**:
  - Vault-relative: `_kants/System/src/handlers/my_handler.js`
  - Absolute: `/Users/username/handlers/my_handler.js`
  - Windows absolute: `C:/Users/username/handlers/my_handler.js`
- **Used for**: Loading the tool's execution logic

#### `inputSchema` (object, required)
- **Description**: JSON Schema defining the tool's input parameters
- **Format**: Valid JSON Schema (written in YAML)
- **Used for**: Parameter validation, AI client UI generation
- **See**: [Input Schema Format](#input-schema-format) below

---

### Optional Fields

#### `category` (string, optional)
- **Description**: Categorization for organizational purposes
- **Default**: `"custom"` if not specified
- **Examples**: `automation`, `project`, `data`, `integration`
- **Used for**: Grouping tools in UI, filtering

#### `tags` (array of strings, optional)
- **Description**: Keywords for searching and filtering
- **Format**: Array of lowercase strings
- **Examples**: `[helper, automation]`, `[kants, project, management]`
- **Used for**: Search, discovery, filtering

#### `outputSchema` (object, optional)
- **Description**: JSON Schema defining the tool's output format
- **Format**: Valid JSON Schema (written in YAML)
- **Used for**: Output validation, type checking, documentation
- **See**: [Output Schema Format](#output-schema-format) below

---

## Schema Format

### Input Schema Format

The `inputSchema` follows [JSON Schema](https://json-schema.org/) specification, written in YAML format.

#### Basic Structure

```yaml
inputSchema:
  type: object
  properties:
    # Define each parameter here
  required:
    # List required parameters
```

#### Common Data Types

**String:**
```yaml
inputSchema:
  type: object
  properties:
    name:
      type: string
      description: User's name
      minLength: 1
      maxLength: 100
```

**Number:**
```yaml
inputSchema:
  type: object
  properties:
    age:
      type: number
      description: Age in years
      minimum: 0
      maximum: 150
```

**Boolean:**
```yaml
inputSchema:
  type: object
  properties:
    enabled:
      type: boolean
      description: Whether the feature is enabled
```

**Array:**
```yaml
inputSchema:
  type: object
  properties:
    tags:
      type: array
      description: List of tags
      items:
        type: string
```

**Object (Nested):**
```yaml
inputSchema:
  type: object
  properties:
    config:
      type: object
      description: Configuration object
      properties:
        host:
          type: string
        port:
          type: number
      required:
        - host
```

**Enum (Choice):**
```yaml
inputSchema:
  type: object
  properties:
    action:
      type: string
      description: Action to perform
      enum:
        - create
        - update
        - delete
```

#### Required vs Optional Parameters

```yaml
inputSchema:
  type: object
  properties:
    required_param:
      type: string
      description: This parameter is required
    optional_param:
      type: string
      description: This parameter is optional
  required:
    - required_param
    # optional_param is not listed, so it's optional
```

---

### Output Schema Format

The `outputSchema` is optional but recommended for documentation and validation.

```yaml
outputSchema:
  type: object
  properties:
    success:
      type: boolean
      description: Whether the operation succeeded
    result:
      type: string
      description: The result data
    error:
      type: string
      description: Error message if failed
```

---

## Complete Examples

### Example 1: Simple String Processing Tool

```yaml
name: reverse_string
description: Reverses the input string
handler: _kants/System/src/handlers/reverse_string.js
category: utility
tags:
  - string
  - helper
inputSchema:
  type: object
  properties:
    text:
      type: string
      description: The text to reverse
  required:
    - text
outputSchema:
  type: object
  properties:
    reversed:
      type: string
      description: The reversed text
```

**Handler Example** (`_kants/System/src/handlers/reverse_string.js`):
```javascript
module.exports = {
  async execute(params, context) {
    const { text } = params;
    return {
      reversed: text.split('').reverse().join('')
    };
  }
};
```

---

### Example 2: Project Management Tool

```yaml
name: kants_manage_project
description: Manage KANTS projects - create, update, query, and list projects
handler: _kants/System/src/handlers/project_manager.js
category: kants
tags:
  - project
  - management
  - crud
inputSchema:
  type: object
  properties:
    action:
      type: string
      description: Action to perform
      enum:
        - create
        - update
        - get
        - list
        - delete
    projectId:
      type: string
      description: Project ID (required for update, get, delete)
    data:
      type: object
      description: Project data for create/update
      properties:
        title:
          type: string
        description:
          type: string
        status:
          type: string
          enum:
            - active
            - completed
            - archived
  required:
    - action
outputSchema:
  type: object
  properties:
    success:
      type: boolean
      description: Whether the operation succeeded
    project:
      type: object
      description: Project data (for get/create/update)
    projects:
      type: array
      description: List of projects (for list action)
      items:
        type: object
    error:
      type: string
      description: Error message if operation failed
```

---

### Example 3: File Search Tool

```yaml
name: search_vault_files
description: Search vault files by pattern and optional metadata filters
handler: _kants/System/src/handlers/vault_search.js
category: search
tags:
  - search
  - files
  - metadata
inputSchema:
  type: object
  properties:
    pattern:
      type: string
      description: Glob pattern to match files (e.g., "*.md", "Notes/**/*.md")
    includeContent:
      type: boolean
      description: Whether to include file contents in results
      default: false
    filters:
      type: object
      description: Optional metadata filters
      properties:
        tags:
          type: array
          description: Filter by tags
          items:
            type: string
        frontmatter:
          type: object
          description: Filter by frontmatter fields
  required:
    - pattern
outputSchema:
  type: object
  properties:
    files:
      type: array
      description: Matching files
      items:
        type: object
        properties:
          path:
            type: string
          content:
            type: string
          metadata:
            type: object
    count:
      type: number
      description: Number of files found
```

---

### Example 4: API Integration Tool

```yaml
name: fetch_external_data
description: Fetch data from an external API with optional caching
handler: _kants/System/src/handlers/api_fetch.js
category: integration
tags:
  - api
  - http
  - external
inputSchema:
  type: object
  properties:
    url:
      type: string
      description: The API URL to fetch from
      format: uri
    method:
      type: string
      description: HTTP method
      enum:
        - GET
        - POST
        - PUT
        - DELETE
      default: GET
    headers:
      type: object
      description: HTTP headers
      additionalProperties:
        type: string
    body:
      description: Request body (for POST/PUT)
    cache:
      type: boolean
      description: Whether to cache the response
      default: true
    cacheTTL:
      type: number
      description: Cache time-to-live in seconds
      default: 3600
  required:
    - url
outputSchema:
  type: object
  properties:
    success:
      type: boolean
    data:
      description: Response data
    statusCode:
      type: number
    cached:
      type: boolean
      description: Whether this result came from cache
    error:
      type: string
```

---

## Handler File Format

Handlers must export an object with an `execute` function:

```javascript
module.exports = {
  /**
   * Execute the tool
   * @param {object} params - Input parameters (validated against inputSchema)
   * @param {object} context - Handler context
   * @param {App} context.app - Obsidian App instance
   * @param {Vault} context.vault - Vault instance
   * @param {object} context.workspace - Workspace instance
   * @param {object} context.metadataCache - Metadata cache
   * @param {object} context.fileManager - File manager
   * @param {object} context.plugins - Available plugin APIs
   * @returns {Promise<object>} - Result object (should match outputSchema if defined)
   */
  async execute(params, context) {
    // Your tool logic here
    const { app, vault, plugins } = context;

    // Access params (already validated)
    const { input1, input2 } = params;

    // Perform operations
    const result = await someOperation(input1, input2);

    // Return result (will be validated against outputSchema if defined)
    return {
      success: true,
      result: result
    };
  }
};
```

### Context Object

The `context` parameter provides access to Obsidian APIs:

- **`context.app`** - Full Obsidian App instance
- **`context.vault`** - Vault API for file operations
- **`context.workspace`** - Workspace API
- **`context.metadataCache`** - Metadata cache for frontmatter, links, etc.
- **`context.fileManager`** - File manager for advanced file operations
- **`context.plugins`** - Available plugin APIs:
  - `context.plugins.dataview` - Dataview plugin (if installed)
  - `context.plugins['metadata-menu']` - Metadata Menu plugin (if installed)
  - `context.plugins['digital-garden']` - Digital Garden plugin (if installed)

---

## Best Practices

### 1. Clear Naming
- Use descriptive, lowercase names with underscores
- Include plugin/namespace prefix for plugin-specific tools
- Examples: `kants_create_project`, `dg_publish_note`

### 2. Comprehensive Descriptions
- Explain what the tool does clearly
- Mention key capabilities and use cases
- Keep it under 100 words

### 3. Detailed Schema Documentation
- Add `description` to every parameter
- Use `enum` for predefined choices
- Set sensible `default` values for optional parameters
- Include `minimum`/`maximum` for numeric ranges

### 4. Handler Paths
- Use vault-relative paths when possible for portability
- Place handlers in a consistent location (e.g., `_System/handlers/`)
- Use forward slashes even on Windows: `_kants/handlers/tool.js`

### 5. Error Handling in Handlers
```javascript
async execute(params, context) {
  try {
    // Your logic here
    return { success: true, result: data };
  } catch (error) {
    console.error('Tool error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}
```

### 6. Validation
- Define `required` fields explicitly
- Use appropriate data types
- Add format validation where applicable (`format: uri`, `format: email`)

### 7. Output Consistency
- Always include a `success` boolean in output
- Include an `error` field for failure cases
- Match your `outputSchema` definition

---

## Common Patterns

### Action-Based Tools

For tools that perform multiple related actions:

```yaml
inputSchema:
  type: object
  properties:
    action:
      type: string
      enum: [create, read, update, delete]
    id:
      type: string
      description: Resource ID (required for read, update, delete)
    data:
      type: object
      description: Data (required for create, update)
  required:
    - action
```

### Paginated Results

For tools that return large datasets:

```yaml
inputSchema:
  type: object
  properties:
    query:
      type: string
    limit:
      type: number
      default: 100
    offset:
      type: number
      default: 0

outputSchema:
  type: object
  properties:
    results:
      type: array
    total:
      type: number
    hasMore:
      type: boolean
    nextOffset:
      type: number
```

### Filter-Based Search

For search/query tools:

```yaml
inputSchema:
  type: object
  properties:
    query:
      type: string
      description: Search query
    filters:
      type: object
      description: Optional filters
      properties:
        tags:
          type: array
          items:
            type: string
        dateFrom:
          type: string
          format: date
        dateTo:
          type: string
          format: date
```

---

## File Location

Custom tool YAML files must be placed in:
```
.obsidian/lattice-relay/tools/
```

Each tool should be in its own file, named after the tool:
```
.obsidian/lattice-relay/tools/
├── my_tool.yaml
├── another_tool.yaml
└── kants_project_manager.yaml
```

The filename doesn't have to match the `name` field, but it's recommended for clarity.

---

## Validation

Tools are validated when:
1. Plugin loads/reloads
2. Tool is imported via UI
3. Tool is added programmatically

**Validation checks:**
- All required fields present (`name`, `description`, `handler`, `inputSchema`)
- `name` is a non-empty string
- `inputSchema` is a valid object
- Handler file exists at specified path (logged as warning if missing)

---

## Version History

- **v2.0** (2025-11-28): Custom tool system with YAML definitions
- **v1.0**: Original tools.yaml format (deprecated)
