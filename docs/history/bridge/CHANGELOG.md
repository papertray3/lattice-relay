# MCP Bridge changelog (historical)

Entries from the MCP Bridge lineage, kept for reference. These versions are not Lattice Relay releases; Relay's own history starts at 0.1.0 in the [current changelog](../../../CHANGELOG.md).

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
