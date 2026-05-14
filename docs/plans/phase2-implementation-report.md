# Phase 1 implementation report

## Added

- `browser:artifact-click` Chromium-CDP primitive with frame-aware locate, ancestor text filtering, raw coordinate clicks, browser-level download events, filename/size validation, optional rename, and sha256 output.
- `docs/PRIMITIVE_ARTIFACT_CLICK.md` documenting the primitive, Round-3 mapping, error codes, and a DOCX export example.
- Tests for artifact-click success, iframe miss, viewport rejection, download timeout, filename mismatch, rename, and deterministic hashing.

## Extended

- `browser:click`, `browser:upload`, and `browser:wait` accept postcondition flags: `--until`, `--until-selector`, `--until-content-regex`, `--until-stable-ms`, `--until-download`, and `--until-timeout-ms`.
- Workflow action schema/compiler can pass postconditions into `ActionExecutor`, so CLI and workflow execution share the same behavior.
- Consumer contract bumped from `consumer-contract-1.0.0` / package `0.2.0` to `consumer-contract-1.1.0` / package `0.3.0`.

## Contract diff

- Added command rows: `browser:artifact-click`, `browser:click`, `browser:upload`, `browser:wait`.
- Added error codes: `IFRAME_NOT_FOUND`, `ELEMENT_NOT_FOUND`, `ELEMENT_OUT_OF_VIEWPORT`, `ARTIFACT_DOWNLOAD_TIMEOUT`, `ARTIFACT_VERIFICATION_FAILED`, `POSTCONDITION_TIMEOUT`, `MODE_UNCERTAIN`, `HUMAN_HANDOFF_REQUIRED`.
- Added sensitive-field notes for artifact `path`, `sha256`, `frameUrl`, and opaque `profile-id`.

## Deliberately deferred

- Workflow files and Deep Research reference workflow.
- `mode:detect`.
- Profile lease/audit improvements.
- Semantic rediscovery helpers.

## Bugfix iteration (2026-05-14)

- Fixed `browser:artifact-click` tab selection so it reuses an existing tab matched by `--url` pathname/substr or `--tab-url-contains`, and rejects ambiguous calls instead of silently selecting `pages()[0]`.
- Added page/frame readiness waits for reused tabs plus configurable `--frame-min-count`.
- Added locate retries via `--locate-timeout-ms` for late-attaching DR sandbox iframes.
- Expanded `IFRAME_NOT_FOUND` / `ELEMENT_NOT_FOUND` evidence with `pageUrl`, `frameCount`, and truncated `triedFrames`.


## Bugfix-2 iteration (2026-05-14)

- Added opt-in Deep Research readiness flags to `browser:artifact-click`: `--viewport-width`, `--viewport-height`, `--prerender-wait-ms`, `--scroll-main-to-y`, and `--scroll-main-wait-ms`.
- Ported the Round-3 main-scroll-container heuristic so virtualized/lazy sandbox iframes can attach before frame walking.
- Added scroll readiness evidence (`scroll.ranScroll`, `scroll.candidates`, `scroll.scrolledTo`) to locate failure evidence when the scroll recipe was requested.
- Changed duplicate matching-tab selection to prefer the tab with the most current frames.
- Covered viewport resize, scroll/evaluate/wait, duplicate-tab selection, and scroll evidence in artifact-click tests.
- Contract remains `1.1.0`; this is an additive primitive option set.

---

## Phase 2 implementation addendum

Implemented Phase 2 hardening from `web-ai-automation-v2.md` §5-§8:

- Durable workflow step events: `started` / `succeeded` / `failed` records include step id, status, timestamps, input hash, output artifact ids, error code, redacted evidence, and idempotency key.
- Workflow resume: `WorkflowExecutor.resumeRun(runId)` and `workflow:run --resume <run-id>` load the stored plan/events, validate idempotency hashes, reuse successful idempotent steps, and require `--confirm-replay` when a prior successful non-idempotent step is crossed.
- Profile lifecycle: added profile lease records, `browser:status` lease surfacing, `browser:close --release-lease [--force]`, and `browser:audit --output-json` with cache size and stale lock reporting.
- Trace redaction: added `src/trace/redact.ts` and wired default redaction into run-event evidence and CLI JSON error evidence. `--no-redact` remains a trusted-local opt-out.
- Consumer contract/docs: bumped contract to 1.2.0 and package contract metadata to 0.4.0; added new error codes and profile lifecycle documentation.

Verification targets: `npm run build` and `npm test`.
