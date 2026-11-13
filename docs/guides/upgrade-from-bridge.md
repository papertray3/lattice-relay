# Upgrade from MCP Bridge

Lattice Relay 0.1.0 replaces the MCP Bridge plugin (`obsidian-mcp-bridge`, last version 2.0.0). This is a deliberate identity change, with no compatibility alias:

| | MCP Bridge | Lattice Relay |
|---|---|---|
| Plugin ID and directory | `obsidian-mcp-bridge` | `lattice-relay` |
| Plugin API | `app.plugins.plugins['obsidian-mcp-bridge'].api` | `app.plugins.plugins['lattice-relay'].api` |
| Server | `servers/node/dist/main.js` (`obsidian-direct`) | `server/lattice-relay.mjs` (`lattice-relay`) |
| Client entry name | `obsidian_mcp_<vault>` | `lattice_relay_<vault>` |
| Environment | `OBSIDIAN_MCP_KEY`, `OBSIDIAN_PORT`, `OBSIDIAN_HOST`, `OBSIDIAN_USE_SSL`, `LOG_LEVEL` | `LATTICE_RELAY_KEY`, `LATTICE_RELAY_PORT`, `LATTICE_RELAY_HOST`, `LATTICE_RELAY_USE_SSL`, `LATTICE_RELAY_LOG_LEVEL` |
| New-install tool folder | `.obsidian/mcp-bridge/tools` | `.obsidian/lattice-relay/tools` |
| Render cache default | `.obsidian/cache/mcp-bridge-render` | `.obsidian/cache/lattice-relay-render` |

**Lattice must be updated together with Relay.** Lattice registers `lattice_blueprint_draft` through the Relay plugin API. A Lattice build that predates the Relay rename looks for `obsidian-mcp-bridge`, and one that includes it looks only for `lattice-relay`. Install the matching Lattice build when you migrate, or that tool silently disappears.

## What carries over

The migration tool (`scripts/migrate-from-bridge.mjs`, temporary tooling) maps Bridge settings as follows:

- **Kept:** `apiKey`, `requireAuth`, `host`, `port`, `cacheMaxSizeMB`, `logLevel`, `digitalGardenRepoPath`, and every `toolSearchPaths` entry. Existing tool folders keep working even if their path contains `mcp-bridge`.
- **Kept after a security preview:** `enableRemote`, `enableSSL`, `certPath`, `keyPath`, `allowedOrigins`. The preview warns about remote exposure, disabled auth, and missing certificate files, but never prints key contents.
- **Cache:** rendered cache contents are not migrated. The exact old default cache path becomes the new default; a custom path is kept if it stays inside the vault.
- **Unknown keys:** kept only in the rollback backup, never in active settings.
- **Mistyped values:** reset to Relay defaults, with a warning.

Client configuration files are never edited for you. Copy a fresh configuration from Relay's settings tab.

## Procedure

Run from a Relay checkout (or anywhere with the scripts), with the release directory built or downloaded.

1. **Preview** (writes nothing):

   ```
   node scripts/migrate-from-bridge.mjs preview --vault <vault> --release <release>/lattice-relay
   ```

   Read the warnings and the list of rollback-only keys. API keys show only as `<set>`/`<empty>`.

2. **Close the vault in Obsidian.** The running Bridge holds the port, and Obsidian rewrites `community-plugins.json`.

3. **Back up client configurations** that reference the Bridge (for example `.mcp.json`, `~/.codex/config.toml`). The migration doesn't touch them, but rollback needs the old copies.

4. **Apply**, writing the backup to a new directory outside the vault:

   ```
   node scripts/migrate-from-bridge.mjs apply --vault <vault> --release <release>/lattice-relay --backup <new-backup-dir> --obsidian-closed
   ```

   This copies and verifies the Bridge plugin directory and `community-plugins.json` into the backup, installs Relay, and writes the migrated settings. It then swaps Bridge for Relay in the enabled-plugins list in one write. Bridge stays installed but disabled, so only one of them ever owns the port. It writes nothing else in the vault.

5. **Install the matching Lattice build**, if the vault uses Lattice.

6. **Open the vault.** Confirm the `Lattice Relay: <n> tools` status-bar item and that `lattice_blueprint_draft` is listed when Lattice is enabled.

7. **Reconnect clients:** replace each Bridge entry with a freshly copied Relay configuration, then call `ping` and `lattice_orient`.

8. **Retire Bridge later.** Once you're satisfied, delete `.obsidian/plugins/obsidian-mcp-bridge/`. Until then it is your fast rollback path.

## Rollback

1. Close the vault in Obsidian.
2. Run:

   ```
   node scripts/migrate-from-bridge.mjs rollback --vault <vault> --backup <backup-dir> --obsidian-closed
   ```

   This restores the Bridge plugin directory from the backup and re-enables Bridge in Relay's place. It keeps any other plugin toggles made since the migration, and moves the Relay plugin directory, with its settings, into `<backup-dir>/rolled-back/` instead of deleting it. Vault notes and Lattice state are never touched. Running it twice is harmless.
3. Restore the matching earlier Lattice build, if you updated it.
4. Restore the client configurations you backed up in step 3, then reopen the vault.
