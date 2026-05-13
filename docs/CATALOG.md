# Capability catalog layout

This document describes the tracked JSON catalog deliverables under `data/`.
They are reproducibility anchors for capability query, replay, and refresh work.

## 1. Per-service file set

Each service uses a common set of eight primary files per locale. Historical or
run-specific JSON files may also exist, but the table below is the consumer
contract for catalog tooling.

| File name | Purpose |
| --- | --- |
| `<svc>_feature_inventory.json` | Doc-driven feature list (built by crawling official help center). |
| `<svc>_feature_tests.json` | Per-feature live-test status. |
| `<svc>_full_catalog.json` | Top-level area inventory (Gemini-shape). |
| `<svc>_deep_catalog.json` | Per-feature deep entries (activation + controls + generated_output + screenshot). |
| `<svc>_remaining_catalog.json` | Derivative controls (post-output). |
| `<svc>_unexplored_catalog.json` | Surfaces visible but not exercised. |
| `<svc>_manual_capabilities.json` | SQLite DB export (`schemaVersion`, `capabilities`, `ui_elements`, `page_captures`, etc.). |
| `<svc>_verification_report.json` | Live-replay × help-docs cross-check. |

Current service prefixes are `claude`, `chatgpt`, and `gemini`. The prefix is
also the normal `--target` value for query/update commands.

### Feature inventory

`<svc>_feature_inventory.json` is the documentation-derived baseline. It tells
consumers which features official help pages describe, what gates they mention,
and which documentation URLs support an entry. It is not proof that a feature is
available in the current signed-in UI.

### Feature tests

`<svc>_feature_tests.json` records live browser checks against inventory entries.
Use it to distinguish features that were tested, partially reached, gated,
observed only, skipped for policy boundaries, or blocked by tooling limits.

### Full catalog

`<svc>_full_catalog.json` keeps the top-level Gemini-shaped area inventory used
by earlier catalog sessions. It is best for broad navigation, service-area
summaries, and cross-service comparisons.

### Deep catalog

`<svc>_deep_catalog.json` is the richest per-feature file. Entries normally hold
activation paths, visible controls, generated-output observations, screenshot or
capture references, labels, and replay notes from an authenticated session.

### Remaining catalog

`<svc>_remaining_catalog.json` describes controls that appear after generation or
after a feature is activated. Examples include copy, download, export, share,
regenerate, insert, refine, rate, and open-in-tool controls.

### Unexplored catalog

`<svc>_unexplored_catalog.json` lists visible surfaces that were not fully
exercised. Treat these as leads rather than confirmed capabilities.

### Manual capabilities export

`<svc>_manual_capabilities.json` exports the local capability database. It may
include `targets`, `capabilities`, `ui_elements`, `page_captures`,
`capability_versions`, `workflow_definitions`, `workflow_runs`, and `artifacts`.
Use it for imports, migrations, and database-backed CLI queries.

### Verification report

`<svc>_verification_report.json` compares live replay evidence with help-doc
expectations. It is the place to find documented-but-hidden features,
visible-but-undocumented surfaces, and entitlement or platform mismatches.

## 2. Locale conventions

Locale files use two forms: `*.json` and `*.en.json`. The base `*.json` files are
the primary tracked deliverables for a service, but their locale depends on how
the capture session was run.

Current convention:

- ChatGPT `*.json` files are Chinese (`zh-CN`) captures.
- Claude `*.json` files are English captures.
- Claude and ChatGPT `*.en.json` files are English-locale variants.
- Gemini currently uses the original single-locale catalog files.
- `data/locale_diff_report.json` summarizes differences between locale pairs.

If a future refresh adds another locale, prefer an explicit suffix before
`.json`, such as `.zh-CN.json` or `.en.json`, and update this document before
consumers depend on the new naming convention.

## 3. Feature-test status enum

`feature_tests` entries use this status enum:

- `tested_ok`
- `partial`
- `inaccessible`
- `requires_paid_tier`
- `requires_admin`
- `requires_extension_install`
- `requires_mobile_app`
- `requires_voice`
- `requires_api_console`
- `cli_insufficient`
- `skipped_off_limits`
- `error`
- `observed_only`
- `observed_ok`

Operational notes:

- `tested_ok` means the feature was exercised successfully.
- `observed_ok` means the feature was observed and appears available.
- `observed_only` means it was visible but not fully exercised.
- `partial` means only some expected behavior was reached.
- `cli_insufficient` means the browser/CLI surface could not safely finish it.
- `skipped_off_limits` means the flow crossed an avoided boundary such as
  payment, deletion, publishing, account changes, or another risky action.
- `error` means the run failed unexpectedly and should be retried before drawing
  product conclusions.
- `requires_*` statuses record entitlement or platform gates, not catalog
  failures.

## 4. How to query

Build first:

```bash
npm run build
```

Query a catalog target:

```bash
node dist/src/cli.js capability:query --target claude --text "deep research" --json
```

Use `--target chatgpt` or `--target gemini` for the other services. Add
`--limit <n>` to bound output and `--category <category>` for category-specific
queries.

## 5. How to refresh a single area

Refreshes use visible browser profiles with the user manually signed in. Example:

```bash
node dist/src/cli.js capability:update --target claude --profile claude --json
```

For lower-output snapshots, add lite mode:

```bash
node dist/src/cli.js capability:update --target claude --profile claude --mode=lite --json
```

Only refresh accounts, workspaces, and flows where automation is authorized.
Avoid irreversible flows such as payment, deletion, publishing, or account
changes unless explicitly intended and safe.

## 6. Reproducibility note

Catalogs were built against Chrome browser profiles under:

```text
data/browser-profiles/<service>/
```

The user was manually signed in before capture. Cookies and credentials are not
exported into catalog JSON files.

To re-run from a clean checkout, see the README setup section, then:

1. Install dependencies and browser prerequisites.
2. Build the project.
3. Launch a visible profile for the service.
4. Sign in manually.
5. Run the relevant `capability:update`, replay, or catalog script.
6. Review generated JSON diffs before committing refreshed deliverables.

Runtime files such as browser profiles, screenshots, downloads, SQLite journals,
logs, and site maps stay ignored. Catalog JSON files remain tracked because they
are the portable output of the cataloging process.
