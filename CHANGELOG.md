# Changelog

All notable changes to Lattice Relay are recorded here. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and Relay uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Relay starts its own version line at 0.1.0. Earlier MCP Bridge versions are historical: see [docs/history/bridge/CHANGELOG.md](docs/history/bridge/CHANGELOG.md).

## [Unreleased]

## [0.1.0] - 2026-11-13

First Lattice Relay release candidate (PLAN-002). It replaces the MCP Bridge plugin under a new identity. See [Upgrade from MCP Bridge](docs/guides/upgrade-from-bridge.md).

### Changed (breaking: no compatibility alias)
- Plugin ID, directory, and API lookup are now `lattice-relay` (`app.plugins.plugins['lattice-relay'].api`); the display name is **Lattice Relay**. Notices, the status bar, the settings title, and log prefixes all say Relay.
- The stdio server is now `lattice-relay-server`, reports itself as `lattice-relay` at the release version, and ships as one bundled file, `server/lattice-relay.mjs`, inside the plugin directory.
- Server environment: `LATTICE_RELAY_KEY`, `LATTICE_RELAY_PORT`, `LATTICE_RELAY_HOST`, `LATTICE_RELAY_USE_SSL`, `LATTICE_RELAY_LOG_LEVEL`. The Bridge-era names are no longer read. When the server sees one, it logs the name of its replacement.
- Generated client configurations use the server name `lattice_relay_<vault>`, the new variables, and the bundled server path.
- New-install defaults: user tools in `.obsidian/lattice-relay/tools` and the render cache in `.obsidian/cache/lattice-relay-render`. The plugin's shipped tool definitions moved to `defaults/`, and its generated tool list to `generated/`.
- The server no longer loads `.env` files (dotenv removed). Clients pass the environment explicitly.
- The server shuts down when its client closes stdin.
- Fold topology now projects Lattice's published `lattice.fold.topology@1.0.0` (Lattice PLAN-006). Each node adds its endpoint status, depth, relation, and role meaning beside the existing `{ foldId, label }` fields. A new `completeness` object carries Lattice's per-collection bounds, and a facet without `grantsAuthority: false` is refused as `unsupported-shape`.
- Contract fixtures now pin Lattice's canonical manifest and topology examples.

### Added
- `lattice_orient` and `lattice_fold_describe`: read-only, bounded MCP projection of Lattice Focus (`inspectContext`, Focus API 1.1) and Fold inspection (`inspectFold`, Fold API 1.0), with version negotiation, error classes for availability, compatibility, contract and domain failures, redaction, and explicit unavailable topology (PLAN-001, issue #1).
- Vendored Lattice contract fixtures with provenance and drift tests (`src/lattice/fixtures/`).
- Coordinated versioning: `npm run version:check` / `version:set`, `versions.json`, and contract tests that fail on mismatched versions, the retired identity, tracked secrets, or Python servers.
- Release assembly (`npm run release:assemble`) with a machine-readable `release-manifest.json` (source commit, artifact SHA-256s, MCP SDK/protocol, Lattice contract versions), plus an automated stdio smoke test.
- Server test suite (configuration, MCP behavior over an in-memory transport, WebSocket client), alongside a server typecheck and lint in `npm run verify` and in CI.
- GitHub Actions CI running the supported gates on clean installs of both lockfiles.
- Temporary Bridge-to-Relay migration tooling with preview, verified backup, apply, and rollback (`scripts/migrate-from-bridge.mjs`).

### Removed
- The Python MCP servers, `test_connection.py`, and the Bridge-era server helper scripts. Node/TypeScript is the only supported server.
- Bridge-era setup, publishing, and evaluation documents moved to `docs/history/bridge/` (unsupported).

### Security
- The MCP TypeScript SDK went from 0.5.0 to 1.32.2, with zod pinned to 4.6.7 or later and `ws` at 8.23.0. `npm audit --omit=dev` is now clean for the server as well as the plugin. Development-tool advisories remain and are tracked in the release plan.
- Runtime dependencies were updated within their majors (`ws` 8.22.2, `js-yaml` 4.3.2, `fast-uri` 3.1.9, `picomatch` 2.3.2).
