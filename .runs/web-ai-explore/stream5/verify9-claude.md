# Verify Round 9 — Claude Design chain — DEFINITIVE COLD-PATH CLOSE

Date: 2026-05-15
Repo: /home/l1u/workspace/noeticmind/web-ai-capability-hub
Binary: `node dist/src/cli.js` (pre-rebuilt fixed source; no rebuild performed)
Browser: live logged-in `claude-9224` port 9224 (NOT relaunched/closed)
Model: Sonnet (cheap, as required)
Prompt: "a single static page that displays Hello World" (benign)

## Objective

Confirm the cold-start honesty fix landed correctly: the COLD-FIRST `get-html`
call (the exact path that previously returned a 39-byte
`<html><head></head><body></body></html>` empty shell as a **false positive**)
no longer false-positives, and the full claude-design chain is honestly
end-to-end GREEN.

## The fix under test (src/mcp/submcp/claude-design/flow.ts)

`stepGetHtml` polls up to 60 attempts / 30s, breaking only when
`isRealHtmlMarkup(source)` is true (waits through hydration). If the budget
expires without real markup, it throws `ARTIFACT_VERIFICATION_FAILED`
(honest terminal) instead of saving the empty shell. `isRealHtmlMarkup`
rejects the empty shell because `hasMeaningfulBodyContent(extractHtmlBody(...))`
returns false for an empty `<body></body>`, and rejects `_bootstrap`/`_loader`
URLs via `BOOTSTRAP_OR_LOADER_URL_RE`.

## Execution (cold path, exactly as specified)

1. **create-project** -> `https://claude.ai/design/p/019e2cdb-8b66-70d8-b1fc-97ccd2cdc964` — GREEN
2. **generate** (sonnet) -> `Hello World.html`, status=generated — GREEN
3. **get-html IMMEDIATELY (cold-first call)** — the critical test
4. **get-html warm re-call** — regression check
5. **present** — GREEN

## Cold-first get-html outcome — OUTCOME (a): REAL ARTIFACT

- Tool reported: sha256 `fb42d3fd674c0753f438eb0a905b1ea5e62416765cb3628d78dfdbee973d4e0f`, byteSize **12319**
- **Independently recomputed sha256 from disk**:
  `fb42d3fd674c0753f438eb0a905b1ea5e62416765cb3628d78dfdbee973d4e0f` — **EXACT MATCH**
- File: `/tmp/r9-cl-dl/019e2cdb-8b66-70d8-b1fc-97ccd2cdc964-fb42d3fd674c.html` (12319 bytes)
- First 200 bytes:
  `<!DOCTYPE html><html data-src-ver="06ea04b8" lang="en" data-om-id="06ea04b8:0"><head data-om-id="06ea04b8:1"><style data-omelette-injected="">html,body{background:transparent}</style><script data-ome`
- Genuine HTML content: `<title>Hello World</title>`,
  `<h1 data-om-id="06ea04b8:10">Hello, <em data-om-id="06ea04b8:11">World</em></h1>`
- Extracted visible body text: `"A greeting Hello, World"` (23 chars of real rendered content)

**EXPLICIT STATEMENT: This was NOT an empty-shell false-positive.** The artifact
is 12319 bytes (not 39), contains a real `<title>`, a real `<h1>` with the text
"Hello, World", real body text, and is not a `_bootstrap`/`_loader` stub. The
poll loop correctly waited through hydration and returned a real artifact.

## Warm re-call

- sha256 `fb42d3fd674c0753f438eb0a905b1ea5e62416765cb3628d78dfdbee973d4e0f`, byteSize 12319
- **Identical** to the cold call. No regression on the warm path. Deterministic.

## present

- presentUrl: `https://claude.ai/design/p/019e2cdb-8b66-70d8-b1fc-97ccd2cdc964?file=Hello+World.html`
- Real, concrete, file-scoped URL. GREEN.

## Verdict

**YES — the full claude-design chain is now honestly end-to-end GREEN.**

create-project -> generate -> cold-first get-html (real 12319-byte artifact,
disk sha256 matched, NOT an empty-shell false-positive) -> warm get-html
(identical, no regression) -> present (real URL). All five checkpoints
VERIFIED_GREEN. The cold-start honesty fix is confirmed working: the previously
false-positiving cold-first path now returns a genuine hydrated HTML artifact.

## Output artifacts

- `.runs/web-ai-explore/stream5/verify9-claude.json`
- `.runs/web-ai-explore/stream5/verify9-claude.md`
- `.runs/web-ai-explore/stream5/r9-step1-create.json`
- `.runs/web-ai-explore/stream5/r9-step2-generate.json`
- `.runs/web-ai-explore/stream5/r9-step3-gethtml-cold.json`
- `.runs/web-ai-explore/stream5/r9-step3-gethtml-warm.json`
- `.runs/web-ai-explore/stream5/r9-step4-present.json`
