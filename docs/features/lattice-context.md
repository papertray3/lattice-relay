# Lattice context tools

Relay projects two read-only Lattice capabilities over MCP:

| Tool | Answers | Lattice API read |
| --- | --- | --- |
| `lattice_orient` | *Where am I working?* | `api.focus.inspectContext` (Focus API 1.1), plus `api.fold.listFolds` for selectable Folds |
| `lattice_fold_describe` | *What is this Fold?* | `api.fold.inspectFold` (Fold API 1.0) only |

Both are registered as builtin tools in `mcp-bridge/defaults/tools.defaults.yaml` and implemented in `src/lattice/`.

## The authority rule

**Context is not consent.** Every response carries `grantsAuthority: false`. Neither tool changes Focus, selects or attaches anything, or writes to the vault. Being able to read a Fold, knowing it is the working Fold, knowing its members, or knowing its topology never authorizes changing it.

The rule is enforced structurally as well as documented. Discovery returns narrow, frozen read ports (`inspectContext`, `inspectFold`, `listFolds`), so projection code has no reference to effectful Lattice methods. Tests wrap the Lattice API in a recording proxy and fail if Relay reads any other member (`src/lattice/lattice-tools.test.ts`, "touches only the read-only Lattice surface"). If Lattice ever answers with anything other than `grantsAuthority: false`, Relay refuses the answer as a contract error.

## Inputs

`lattice_orient`:

| Field | Type | Meaning |
| --- | --- | --- |
| `expectedContextRevision` | integer ≥ 0, optional | If Focus has moved since this revision, nothing is inspected and the outcome is `stale`. A stale context never retargets the read. |
| `includeMembers` | boolean, default `true` | Request `lattice.fold.manifest@2.0.0` for members and folders. |
| `includeTopology` | boolean, default `true` | Request declared topology (see below). |

`lattice_fold_describe`:

| Field | Type | Meaning |
| --- | --- | --- |
| `foldId` | string, 1–200 chars, required | The Fold to describe, for example from `lattice_orient`'s `folds.items`. |
| `includeMembers`, `includeTopology` | boolean | As above. |

Unknown properties are rejected. Invalid parameters fail as MCP errors before Lattice is called.

## Envelopes

Both tools return a JSON envelope with these shared fields:

```json
{
  "spec": "lattice-relay-orientation/v1",
  "outcome": "inspected",
  "errorClass": "none",
  "grantsAuthority": false,
  "generatedAt": "2026-11-11T15:00:00.000Z",
  "availability": { "state": "available" },
  "source": {
    "provider": "lattice",
    "pluginVersion": "2.0.0-beta.70",
    "latticeApiVersion": "2.0",
    "focusApiVersion": "1.1",
    "foldApiVersion": "1.0",
    "upstreamSpec": "lattice-focus-context-envelope/v1",
    "upstreamGeneratedAt": "2026-11-11T15:00:00.000Z"
  },
  "diagnostics": []
}
```

`lattice_orient` adds:

- `context`: `{ revision, current, previous, candidate }`. Each entry is identity and evidence only: `foldId`, `label`, `foldRevision`, `evidence.source`, an optional `evidence.path`, and `at`.
- `currentFold`: a Fold description, or `null`.
- `folds`: `{ truncated, items: [{ foldId, label, status }] }` for non-retired Folds, or `null` when Lattice does not expose `listFolds`.

`lattice_fold_describe` (`spec: lattice-relay-fold-description/v1`) adds `fold`, which is a Fold description or `null`.

A **Fold description** holds:

- **Identity and briefing:** `foldId`, `found`, `label`, `status`, `retiredAt`, `readiness`.
- **Revisions:** `manifest`, `effectiveState`, `authority`, `workstream`, `automationSettings`. These come from Lattice, and none of them stands in for another.
- **Preamble data:** `blueprint`, `authority` (review, acceptedAt, resolution), `automation`, `counts`.
- **`rememberedValues`:** `{ truncated, items }`. A value appears only when it is non-sensitive and present (see below).
- **`members`:** `{ status, completeness, total, truncated, items: [{ memberId, role, state, path, title, creation }] }`. These are member records, not note content.
- **`folders`:** `{ status, truncated, items: [{ path, reach }] }`, the directory scopes of the Fold's anchors.
- **`topology`:** see below.
- **`facets`:** `[{ facetId, status, provider }]`, where `status` is `ready`, `unavailable`, `failed` or `malformed`.

### Outcomes and error classes

| `outcome` | `errorClass` | Meaning |
| --- | --- | --- |
| `inspected` / `described` | `none` | Answered as asked. |
| `no-current-fold`, `stale`, `invalid-request`, `fold-unavailable`, `fold-not-found` | `domain` | A legitimate Lattice refusal or degradation, with Lattice's diagnostics. |
| `lattice-unavailable` | `availability` | `availability.reason` is `not-installed`, `disabled`, `initializing` (retry), `module-failed`, or `module-unavailable`. |
| `lattice-incompatible` | `compatibility` | Lattice is present but its API version is unsupported (see Compatibility). |
| `upstream-invalid`, `upstream-failed` | `contract` | Lattice answered outside its published contract, or threw where its contract forbids it. Relay fails closed and passes nothing on. |

Transport problems never take one of these shapes. A lost socket, an unknown tool, failed authentication or invalid parameters all surface as MCP errors. A Lattice answer, even a refusal, is always a successful MCP result with an `outcome`.

Each diagnostic has `code`, `severity`, `message`, `origin` (`relay`, `lattice.focus`, or `lattice.fold`), and an optional `facetId`.

## Topology: declared or explicitly unavailable

Relay reports a Fold's parent, ancestors, siblings, children and descendants **only** from a Lattice-declared facet. It requests `lattice.fold.topology@1.0.0`. Lattice `2.0.0-beta.70` has no provider for that facet, so the answer today is:

```json
{
  "status": "unavailable",
  "policy": "declared-only",
  "facetId": "lattice.fold.topology@1.0.0",
  "reason": "lattice-contract-missing",
  "message": "This Lattice publishes no declared Fold topology contract yet, ..."
}
```

Lattice marks an unsupported facet with an `error` diagnostic. For topology, Relay replaces that with one informational `relay.topology.unavailable` diagnostic, because the absence is already reported as a capability.

When Lattice serves `lattice-fold-topology/v1` (`parent`, `ancestors`, `siblings`, `children`, `descendants`, each a `{ foldId, label }` ref), Relay returns `status: "declared"` with those relationships. The tools do not change shape. A topology facet in any other shape is reported as `unsupported-shape`.

Relay never derives topology from vault paths, folder containment, filenames, links, or activation anchors. Tests prove that nested folders and cross-Fold links produce no relationships.

## Privacy and bounds

- **Redaction:** Lattice already withholds sensitive values and secret references. Relay withholds again any value whose `ref` or `type` looks secret (`secret`, `token`, `password`, `api-key`, `credential`, `private-key`), and records `relay.redaction.applied`.
- **Detached projection:** responses are built field by field. Private Lattice objects, extra upstream fields and functions are never copied.
- **Limits** (`src/lattice/contract.ts` `LIMITS`):
  - 100 members, 50 folders, 100 selectable Folds, 50 remembered values, 50 diagnostics, and 100 topology relations;
  - 500 characters per string;
  - 2000 serialized characters per remembered value. A larger value is replaced by `valueOmitted: "too-large"`.

  Any truncation is flagged.
- **No note content:** members are records (`role`, `path`, `state`, `title`); Relay never reads member notes.

## Compatibility

| Surface | Supported |
| --- | --- |
| `api.apiVersion` | `2.x` |
| `api.focus.apiVersion` | `1.x`, with x ≥ 1 (`inspectContext`) |
| `api.fold.apiVersion` | `1.x` (`inspectFold`) |

Lattice is rediscovered on every call. Enabling, disabling, upgrading or late-loading Lattice therefore needs no Relay restart. `lattice_fold_describe` does not need Focus and keeps working when Focus is unavailable.

## Contract fixtures

`src/lattice/fixtures/` vendors Lattice's published Focus envelope contract, its examples and the preamble example. Its `PROVENANCE.json` records the source commit and a canonical hash for each file. `contract.test.ts` fails if a fixture changes or if Relay's pinned constants drift from the contract.

To compare the fixtures with a Lattice checkout, run:

```sh
LATTICE_CONTRACTS_DIR=<lattice>/contracts npx vitest run src/lattice/contract.test.ts
```

Lattice publishes no example for `lattice.fold.manifest@2.0.0`. `fold/manifest.v2.relay-sample.json` is Relay-authored from the TypeScript contract and is marked that way in `PROVENANCE.json`.
