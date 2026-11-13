# Releasing

A Relay release is one coordinated version across the plugin, both packages, the server, the changelog, and the release manifest. Assembling a release candidate publishes nothing. Tags, GitHub releases, registry or community-store publication, and deployments are separate, explicitly authorized steps.

## Version

`package.json` is the single version source. These files are synchronized from it:

- `package-lock.json`
- `manifest.json`
- `versions.json` (Obsidian's plugin-version to `minAppVersion` map)
- `servers/node/package.json` and `servers/node/package-lock.json`
- `servers/node/src/version.ts`, which the server reports in `serverInfo`

```
npm run version:check            # fails on any mismatch, retired identity, or missing changelog section
npm run version:set -- 0.2.0     # requires a "## [0.2.0]" section in CHANGELOG.md first
npm run version:set -- 0.2.0 --dry
```

`version:set` refuses an invalid version, a tree that is already inconsistent, or a version with no changelog section. It changes only the files listed above. It does not commit or tag.

Both packages are `private`. Relay ships release artifacts, not npm packages.

## Build and assemble

From a clean checkout:

```
npm ci
npm run server:install
npm run verify              # version check, plugin tests, plugin build, server typecheck/lint/tests, server bundle
npm run release:assemble
```

`release:assemble` refuses a dirty worktree or an inconsistent version. `--allow-dirty` exists for local iteration only, and its output is marked `"releaseCandidate": false`. The script:

1. builds `main.js` and bundles the server with esbuild into one self-contained `server/lattice-relay.mjs`, so no `node_modules` ship;
2. lays out `release/lattice-relay-<version>/lattice-relay/`;
3. runs the stdio smoke test (`scripts/smoke-server.mjs`) against the assembled server: initialize, list tools and call one with no plugin listening, then a clean exit on stdin close, with nothing but JSON-RPC on stdout;
4. writes `release/lattice-relay-<version>/release-manifest.json`.

## Release manifest

```json
{
  "kind": "lattice-relay.release-manifest",
  "version": "0.1.0",
  "sourceCommit": "<sha>",
  "dirty": false,
  "releaseCandidate": true,
  "artifacts": [{ "path": "lattice-relay/main.js", "bytes": 0, "sha256": "..." }],
  "mcp": { "sdkVersion": "...", "latest": "...", "smokeNegotiated": "..." },
  "latticeContracts": { "latticeApiMajor": 2, "focusApiMin": "1.1", "foldApiMin": "1.0", "facets": ["..."] },
  "node": { "built": "...", "supported": ">=20.0.0" },
  "buildCommands": ["..."]
}
```

## Reproducibility

`.gitattributes` pins LF line endings, so checkouts on Windows and Linux feed identical bytes to the build. Two clean checkouts of the same commit, built with the same lockfiles and Node major, must produce identical artifact hashes. Compare the `artifacts` arrays of the two manifests. CI performs the same build on Linux.

## Checklist for a candidate

- [ ] `CHANGELOG.md` section written; `npm run version:set -- <v>`; `npm run version:check`
- [ ] `npm audit --omit=dev` is clean in both the root and `servers/node`; development advisories reviewed
- [ ] `npm run verify` and `npm run release:assemble` pass on a clean checkout
- [ ] A second clean checkout reproduces the artifact hashes
- [ ] Sandbox install, upgrade, and rollback pass ([Upgrade from MCP Bridge](../guides/upgrade-from-bridge.md))
- [ ] Owner authorizes any tag, publication, or deployment
