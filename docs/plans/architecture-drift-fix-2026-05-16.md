# Architecture drift fix — capability store unification (2026-05-16)

Status: **DONE & independently verified** · Commit `aae0c49` (pushed `e43ee27..aae0c49`)

## Problem (drift discovered post-Stream-#5)

The project shipped a real SQLite `CapabilityDatabase`
(`src/capabilities/`, `better-sqlite3@^11.9.1`, `data/capability-hub.sqlite`;
24 capabilities / 591 capability_versions / 5879 ui_elements / 80
page_captures live) as the documented capability store. During Stream #5
the orchestrator additionally created a hand-maintained
`docs/capability-library.json` (+ `docs/CAPABILITY_LIBRARY.md`, 79 records)
as a campaign tracker, and a project memory wrongly declared **the JSON
file itself** the authoritative "never re-explore" source of truth. Result:
a de-facto **parallel capability store** beside the SQLite DB and the
consumer contract — exactly the anti-pattern `docs/plans/web-ai-automation-v2.md`
§A had warned against ("a second top-level registry … parallel system
beside … DB export … and the consumer contract").

## Decision process

1. Initial orchestrator proposal: "relabel the JSON as a governance ledger,
   keep it authoritative, add a thin consistency test."
2. **Adversarial architect red-team rejected it**: it is a post-hoc
   rationalization of an accident; a hand-maintained `docs/*.json` as the
   authoritative store has no transactional integrity, no FTS, merge
   conflicts under parallel sub-agents, hand-maintained tallies that
   already drifted. It also rejected "merge into the runtime `capabilities`
   table" (schema mismatch: `CapabilityStatus` is a runtime-health enum
   disjoint from the campaign enum; the auto-extractor keyed
   `UNIQUE(target_id,name)` would clobber hand-written rows).
3. Decisive finding: the repo **already ships** the correct pattern —
   `site_registry_entries` table + `SiteRegistryImporter` +
   `importSiteRegistry` (transactional UPSERT + documented
   better-sqlite3→JSON fallback) + CLI/MCP/resource, already in the
   versioned consumer contract.

## Implemented fix — one store, two tables, two views

Codex dispatch `stream5-integration-registry.md`, mirroring the shipped
`site_registry` pattern:

- **New `integration_registry` SQLite table** (sibling of
  `site_registry_entries`): typed columns
  `(feature_id PK, service, name, status, mcp_tool, raw, imported_at)` +
  `CHECK(status IN (…6 campaign statuses…))`; `CAPABILITY_DB_SCHEMA_VERSION`
  bumped 1→2. **Caveat (per `architecture-audit-2026-05-16.md` R3): this
  constant is currently cosmetic — it is only ever assigned, never compared
  as a migration guard, so the bump itself triggers no migration. A real
  `PRAGMA user_version`/stored-vs-constant gate is tracked as audit R3.**
- **`CapabilityLibraryImporter`** (`src/adapters/research/`), mirroring
  `SiteRegistryImporter`: `parseFile(docs/capability-library.json)` →
  records → `database.importIntegrationRegistry` (transactional UPSERT +
  better-sqlite3→JSON-fallback parity). Bad status rejected at parse time
  AND by the DB CHECK (defense in depth).
- **`docs/capability-library.json` is now only the editable SEED.** The
  `integration_registry` table is authoritative; tallies are DERIVED from
  the table, not hand-maintained.
- **Surfaced through the consumer contract** (same dispatch):
  CLI `capability:library:import [path] [--json]`, MCP
  `capability_library_import`, resource `capability-library://features`;
  round-tripped `configs/consumer-contract.json` ↔
  `docs/CONSUMER_CONTRACT.md` ↔ `tests/consumerContract.test.ts`.
  `consumer-contract-1.4.0` / `package 0.6.0` / 32 error codes / `webai_`
  count 37 **all unchanged** (additive within the minor, per the Stream-#5
  precedent; `capability:*` is not a `webai_` tool).
- Runtime `capabilities` table + extractor/updater/WorkflowCompiler
  **untouched** (the runtime-vs-governance layer split is real, now
  correctly homed).
- Corrected the contradictory `docs/ARCHITECTURE.md`,
  `docs/CAPABILITY_DATABASE.md`, `docs/CAPABILITY_LIBRARY.md` and the
  `~/.claude` project memory that had crowned the JSON.

## Independent verification (effectiveness check, isolated temp DB)

| Check | Result |
|---|---|
| CLI import → table row count | **79 rows / 65 IMPLEMENTED_GREEN** = seed ✅ |
| Authoritative = table (DB API query, not file read) | `listIntegrationRegistry()` → 79 ✅ |
| Enum CHECK enforced in real SQLite | bad status → `CHECK constraint failed` ✅ |
| Seed-is-seed (mutate seed → re-import → table reflects) | mutated row → `OUT_OF_SCOPE` in table ✅ |
| JSON-fallback parity (`preferSqlite:false`) | 79 / 65 identical to SQLite ✅ |
| Bidirectional consistency (real DB) | 0 GREEN.mcp_tool∉contract, 0 webai_∉registry ✅ |
| Parse-time defense | bad status rejected in `parseFile` ✅ |
| Clean build + full test | build 0, **225 tests pass** ✅ |

## Net effect

Honors the original "store web-AI capabilities in SQL" intent via a proven
in-repo pattern; eliminates the parallel system; zero consumer-contract
churn; runtime pipeline untouched. The JSON remains human-diffable as the
import seed.
