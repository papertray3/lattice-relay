# Contributing to Lattice Relay

## Layout

```
src/                     Obsidian plugin (TypeScript): WebSocket server, tool registry, settings, Lattice projection
  lattice/               read-only Lattice context tools and vendored contract fixtures
  release/               release identity and migration contract tests
defaults/                built-in tool definitions shipped with the plugin
servers/node/            the stdio MCP server (TypeScript, own lockfile), bundled into server/lattice-relay.mjs
scripts/                 version, bundling, smoke, release assembly, Bridge migration (temporary)
docs/                    current documentation; docs/history/ holds superseded Bridge-era material
```

Relay supports one server: `servers/node`. Python and other Bridge-era servers are retired and kept only in Git history.

## Setup

Node 20 or later.

```
npm ci
npm run server:install
npm run verify
```

`npm run verify` runs the version/identity check, plugin tests, the plugin build, server typecheck, lint and tests, and the server bundle. CI runs the same gates plus audits, release assembly, and the smoke test.

For a live check, install into a sandbox vault. Use `npm run release:assemble -- --allow-dirty` and copy `release/lattice-relay-<version>/lattice-relay/` into the vault's plugins folder. Never test against a vault you can't reset.

## Rules

- **Lattice owns semantics.** Relay projects Lattice's public, versioned APIs and never reaches into private plugin state. Contract fixtures in `src/lattice/fixtures/` are vendored byte-for-byte with provenance.
- **Context is not consent.** No read-only tool may change notes, Focus, Fold state, or authority.
- **stdout is the MCP channel.** The server must write nothing but JSON-RPC to stdout. Diagnostics go to stderr or the log.
- **No secrets in the repository.** No keys, `.env`, `data.json`, client configs, or machine paths. A contract test enforces this.
- **One identity.** The retired Bridge identity may appear only in history, migration tooling, and the tests that prove its retirement (`src/release/identity.test.ts`).
- **Dependencies:** don't run `npm audit fix --force`. Review each change against the contract and smoke tests.

## Pull requests

Keep changes focused, include tests, update `CHANGELOG.md` under `[Unreleased]`, and make sure `npm run verify` passes. See [Releasing](releasing.md) for versions and release candidates.
