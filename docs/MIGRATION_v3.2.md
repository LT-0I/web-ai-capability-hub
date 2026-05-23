# Migration notes — web-ai-refactor v3.2 / v1.0.0

## Consumers: CLI, MCP, and TypeScript callers

### What changes for existing scripts?

No migration is required for existing `webai_*` and `research_*` MCP callers. The legacy names remain present and byte-identical in `listMcpTools()`; the contract stays `consumer-contract-1.7.1`, with 189 command rows, 36 error codes, 38 `webai_` rows, 121 `research_` rows, and 8 `wah_` rows.

The package version moves to `1.0.0` for the first GA cut. Public command names, required arguments, schemas, and golden MCP metadata do not change in P3.

### New `wah_*` tools from P1

The v3.2 facade added eight manifest-oriented tools. They are stable MCP tools, not replacements for legacy names:

| MCP tool | Purpose | Typical arguments |
| --- | --- | --- |
| `wah_capability_query` | Discover manifest-backed capabilities and legacy aliases. | `{ "target": "chatgpt" }` or `{ "mcp_name": "research_acm_search" }` |
| `wah_adapter_health` | Read adapter/manifest availability for a provider. | `{ "provider": "gemini" }` |
| `wah_policy_explain` | Explain safety class, approval need, and error taxonomy. | `{ "mcp_name": "webai_chatgpt_send_prompt" }` |
| `wah_task_start` | Start or dry-run a manifest-backed task. | `{ "manifest_id": "webai.chatgpt.send_prompt", "input": { "prompt": "hi" }, "dry_run": true }` |
| `wah_task_status` | Read run status/events. | `{ "run_id": "run_..." }` |
| `wah_task_cancel` | Request cooperative cancellation. | `{ "run_id": "run_...", "reason": "user stopped" }` |
| `wah_task_resume` | Resume/re-plan from persisted evidence. | `{ "run_id": "run_...", "manifest_id": "webai.gemini.generate_video" }` |
| `wah_artifact_get` | Read redacted artifact metadata. | `{ "artifact_id": "..." }` or `{ "path": "data/downloads/..." }` |

Examples:

```json
{ "tool": "wah_policy_explain", "arguments": { "mcp_name": "research_acm_search" } }
{ "tool": "wah_task_start", "arguments": { "manifest_id": "researchdb.acm.search", "input": { "query": "browser agents" }, "dry_run": true } }
{ "tool": "wah_task_cancel", "arguments": { "run_id": "run_123", "reason": "operator requested stop" } }
```

### Error codes added during v3.2

| # | Code | When to expect it | Consumer handling |
| --- | --- | --- | --- |
| 33 | `UI_DRIFT_DETECTED` | Report-mode heal found that a selector no longer resolves. | Treat as degraded evidence; do not retry blindly. Capture the evidence and update selectors/manifests. |
| 34 | `HEAL_CONFIDENCE_LOW` | A possible replacement selector exists but confidence is below the safe threshold. | Ask for human review or maintenance-codex; never auto-click low-confidence candidates. |
| 35 | `PROFILE_LEASE_TIMEOUT` | A profile lease heartbeat is older than 2×TTL while the holder still appears alive. | Cancel/release the run if owned by you; otherwise wait or inspect the lease store. |
| 36 | `TAB_LEASE_EXPIRED` | A tab lease expired before reuse. | Acquire a fresh tab lease; do not silently fall back to `pages()[0]`. |

### Version history

- `consumer-contract-1.6.0`: Gemini model-selection surface.
- `consumer-contract-1.7.0`: P1 added 8 `wah_*` tools and the first two drift/heal error codes.
- `consumer-contract-1.7.1`: P2 wired legacy aliases through ExecutionEngine and added lease-lifecycle error codes.
- Package: `0.7.0` → `0.7.1` → `0.9.0` → `1.0.0` (P3 GA cut).

### Adding a new tool after v1.0

The architecture is manifest-driven. Add or promote a tool by:

1. Authoring YAML under `configs/adapters/<kind>/<provider>/<operation>.yaml` with `id`, `target`, `operation`, `safety`, schema refs, selectors, and a `direct.handler` or `recipe.handler`.
2. Implementing the handler in `src/handlers/<kind>/<operation>.ts` (or reusing an existing handler).
3. Running `npm run generate:tools`, `npm run build`, `npm test`, `npm run verify:contract-version`, and `npm run verify:golden`.
4. If the public surface changes, update `configs/consumer-contract.json`, `docs/CONSUMER_CONTRACT.md`, tests, and the golden snapshot in the same dispatch.

## Internal contributors

### Module ownership

- **M1 observe**: lite snapshots, scout discovery, selector candidates, ElementBank evidence.
- **M2 registry**: YAML manifest schema/loader, generated ToolSpec files, contract/version verification.
- **M3 runtime**: `ExecutionEngine`, ProfilePool, TabLease, lease store, cancel registry, heartbeat/TTL, report-mode heal.
- **M4 facade**: stable `wah_*` tools, legacy alias mapping, consumer-safe artifact/policy/health facades.

### Review protocol

Use cross-model review for substantive changes: Codex writes, Claude reviews, writes/adjusts tests, executes gates, and flags problems. Reverse the roles when Claude writes. Do not self-approve architecture or safety-sensitive changes without an independent reviewer.

### Atomic codemod history

P1 (`b24efaa`) performed the large structural collapse: 92 launcher call sites moved behind ProfilePool, 40 research DB flows moved behind manifests/generator, and jscodeshift-style transformations removed dual architecture limbo.

### Runtime lifecycle

ProfilePool owns profile leases in SQLite. TabLease owns per-run tabs with TTL and heartbeat. The cancel registry stores cooperative cancel requests and ExecutionEngine checks them at await boundaries. Expired or stuck leases surface stable error codes; no code path may silently choose `pages()[0]`.

### Heal/report mode

D7 keeps heal defaulted to `report`. Drift evidence is written to `drift_events` with selector role, confidence, component scores, manifest id, and run id. It is evidence for maintainers, not permission to auto-substitute unsafe selectors.
