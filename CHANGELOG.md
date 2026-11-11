# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- `lattice_orient` and `lattice_fold_describe`: read-only, bounded MCP projection of Lattice Focus (`inspectContext`, Focus API 1.1) and Fold inspection (`inspectFold`, Fold API 1.0), with version negotiation, availability/compatibility/contract/domain error classes, redaction, and explicit unavailable Fold topology (PLAN-001, issue #1)
- Vendored Lattice contract fixtures with provenance and drift tests (`src/lattice/fixtures/`)
- `list_plugins()` tool exposes installed plugins (enabled + disabled) with manifest metadata
- `get_plugin_info()` returns manifest, API method names, and registered hotkeys for a plugin
- `dataview_query()` executes Dataview queries directly and returns rendered markdown
- `search_vault()` performs filename/path searches with parent folder + tag context
- Updated MCP server + docs to describe the new discovery/search workflow

### Security
- Bumped runtime dependencies within their current major versions to clear every `npm audit --omit=dev` finding: `ws` 8.22.2, `js-yaml` 4.3.2, `fast-uri` 3.1.9 (via `ajv`) and `picomatch` 2.3.2 (via `chokidar`). The remaining audit findings are in development and test tooling only.

### Planned - Phase 3
- SmartConnections integration
- Digital Garden integration
- Safe plugin method calling

### Planned - Phase 4
- Permission system (tiered operations)
- User approval modals
- Rate limiting
- Community plugin distribution

## [0.1.0] - 2025-01-11

### Added
- Initial release (Phase 1: Proof of Concept)
- Obsidian plugin with custom WebSocket server implementation
- Python MCP server with stdio transport
- API key authentication
- Core tools:
  - `render_note` - Get fully-rendered HTML with Dataview support
  - `get_note_raw` - Get raw markdown content
  - `list_vault_files` - List markdown files in vault
  - `ping` - Connection health check
- Settings UI with remote-ready configuration
- Comprehensive documentation

### Technical Notes
- Built custom WebSocket implementation to work in Obsidian's Electron environment
- Uses only Node.js built-in modules (http, crypto) for compatibility
- Localhost-only by default, with future remote access capability
