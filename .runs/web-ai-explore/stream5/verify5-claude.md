# Stream #5 — Claude design generate→get-html chain FINAL re-verify (round 5, D1-v2)

Date: 2026-05-15 · Profile: `claude-9224` (port 9224, live, logged in, NOT relaunched) ·
Build: existing D1-v2 `dist/` (NO rebuild) · Model: Sonnet · Tools: Bash + Read only ·
No Playwright-MCP, no noeticbraid. Own tab-ids `r5-cl-*` (allocated + freed).

Scope: confirm whether the D1-v2 micro-fix made `claude-design` generate→get-html
fully GREEN. The D1-v2 claim: `generate` detects completion via the project URL
gaining `?file=<Name>.html` (same signal GREEN `present` uses) and exposes
`projectUrl`/`fileName`.

## Verdict summary

| id | tool | status |
|----|------|--------|
| 1a | design:create-project | VERIFIED_GREEN |
| 1b | design:generate | **FAILED** — `POSTCONDITION_TIMEOUT` (D1-v2 NOT effectively landed) |
| 1c | design:get-html | GUARD_OK — `ELEMENT_NOT_FOUND`, honest, no stub, zero scratch files (downstream of 1b) |
| 1d | design:present | GUARD_OK — `ELEMENT_NOT_FOUND`, honest, empty presentUrl (downstream of 1b) |

**The generate→get-html chain is NOT GREEN.** Generation still fails.

## 1a create-project — VERIFIED_GREEN

```
webai:claude:design:create-project --profile claude-9224 --name "Hello World R5" --output-json
-> {"projectUrl":"https://claude.ai/design/p/019e2c9f-eb07-7a43-a1bc-454b96242f10",
    "projectId":"019e2c9f-eb07-7a43-a1bc-454b96242f10"}  EXIT=0
```
Real project URL + id, no forbidden fields. Confirmed live via own tab
`r5-cl-design` (page title `Hello World R5`).

## 1b generate — FAILED, D1-v2 NOT effectively landed

```
webai:claude:design:generate --profile claude-9224 \
  --project-url https://claude.ai/design/p/019e2c9f-eb07-7a43-a1bc-454b96242f10 \
  --prompt "a single static page that displays the words Hello World" \
  --model sonnet --output-json
-> {"ok":false,"errorCode":"POSTCONDITION_TIMEOUT",
    "error_code":"POSTCONDITION_TIMEOUT","status":"failed"}  EXIT=0
```

Two independent problems:

1. **The output does NOT contain the new `projectUrl` / `fileName` keys** the
   D1-v2 fix was supposed to expose. Only the legacy `{ok,errorCode,error_code,
   status}` envelope is returned. The contract (consumer-contract.json) lists
   `projectUrl`/`fileName` as `always_present` for `design:generate`, so the
   shipped binary is not honoring its own contract on this path.

2. **No `Hello World.html` file was produced server-side this run.** I read the
   live design tab (own tab `r5-cl-design`, `--profile claude-9224`) immediately
   after the failed `generate` and again after a 20s `browser:wait`. Both reads
   show:
   - `"url": "https://claude.ai/design/p/019e2c9f-eb07-7a43-a1bc-454b96242f10"` —
     the **bare** project URL, **no `?file=<Name>.html` suffix**.
   - `"visibleText": "... Describe what you want to create... ... New sketch ...
     Paste from clipboard ..."` — an **empty, pristine composer** and a fresh
     project shell. No generated artifact, no design iframe content, no file tab.

   This is **materially worse than round-4**, where the project URL did resolve
   to `?file=Hello+World.html` (proving generation completed server-side and the
   defect was only postcondition *detection*). In round-5 the project stays in a
   blank pre-generation state — the prompt submission / generation drive itself
   did not take effect on this fresh project.

**Precise root cause:** The D1-v2 completion detector keys on the project URL
gaining `?file=<Name>.html`. But in this run no `?file=` ever appears because no
file is ever generated — the generate command's submit/drive step never moves
the fresh project out of the empty-composer state. So the new detector has
nothing to detect and the command falls through to `POSTCONDITION_TIMEOUT`,
*and* it never emits the contracted `projectUrl`/`fileName` keys (so even when a
file is produced, the contract-required keys would still be absent on the
timeout path). D1-v2 did not make the chain GREEN; it neither reliably drives
generation nor emits the new output keys on the failure path. This is a stable
contract code with no stub and no fabrication — but the underlying generate
behavior is unfixed (and the project-shell state is now blank rather than
file-resolved, so this is a regression in observable progress vs round-4).

## 1c get-html — GUARD_OK (honest, cleaner than round-4)

```
webai:claude:design:get-html --profile claude-9224 \
  --project-url https://claude.ai/design/p/019e2c9f-eb07-7a43-a1bc-454b96242f10 \
  --download-dir .../verify5-artifacts --output-json
-> {"ok":false,"errorCode":"ELEMENT_NOT_FOUND","error_code":"ELEMENT_NOT_FOUND",
    "iframeArtifactSha256":"","savedPath":"","byteSize":0}  EXIT=0
```
`verify5-artifacts/` is **empty** — no bootstrap-URL `.html` stub, and (unlike
round-4) **no `r_3`/`r_4` canvas scratch `.md` files**. get-html fails honestly
with a stable contract code, empty `savedPath`/`iframeArtifactSha256`,
`byteSize:0`, and writes nothing to disk. No `html`/`dom`/`screenshot`/forbidden
fields. **No design HTML artifact sha256 / first-bytes can be reported because
get-html correctly produced NO artifact** (there is no generated design — strictly
downstream of the 1b generate failure). Reporting any sha256 would be
fabrication; none is reported. D2 remains landed and is now even cleaner.

## 1d present — GUARD_OK (honest)

```
webai:claude:design:present --profile claude-9224 \
  --project-url https://claude.ai/design/p/019e2c9f-eb07-7a43-a1bc-454b96242f10 --output-json
-> {"ok":false,"errorCode":"ELEMENT_NOT_FOUND","error_code":"ELEMENT_NOT_FOUND",
    "presentUrl":""}  EXIT=0
```
No generated design to present (downstream of 1b). Stable contract code, empty
`presentUrl`, no fabricated URL.

## Honesty / safety statement

- **NO fabricated success or sha256.** generate honestly FAILED
  `POSTCONDITION_TIMEOUT`; get-html honestly FAILED `ELEMENT_NOT_FOUND` with
  empty savedPath/sha/byteSize and an empty download dir; present honestly
  FAILED `ELEMENT_NOT_FOUND` with empty presentUrl. No sha256/first-bytes
  reported because no HTML artifact exists.
- **One clean attempt per tool.** No blind retry-rerun. The single 20s
  `browser:wait` + re-read was diagnostic confirmation of the live server-side
  state, not a generate retry.
- All failures carry an exact stable contract code + CLI JSON + precise root
  cause. No raw Playwright timeout/locator strings leaked.
- No forbidden fields in any output (no cdpEndpoint/dom/html/screenshot/etc).
- Cheap Sonnet only; benign trivial input ("a single static page that displays
  the words Hello World").
- Browser NOT relaunched/closed. Own tab `r5-cl-design` allocated and freed
  (`{"freed":true}`). No profiles.json, no dist rebuild, no commit, no
  src/test/config edits, no pkill/pgrep of profile patterns, no Playwright-MCP
  chrome, no noeticbraid. docs/capability-library.json NOT edited.

## Net assessment

- **D1-v2 fix NOT effectively landed.** `design:generate` still returns
  `POSTCONDITION_TIMEOUT`, does NOT emit the contract-required `projectUrl` /
  `fileName` keys, and this run did not even drive the fresh project to a
  generated-file state (no `?file=<Name>.html`; composer stayed empty). The
  generate→get-html chain is **NOT GREEN**.
- get-html (D2) and present continue to fail **honestly** with stable contract
  codes and zero stub/scratch artifacts — those guards hold.
- A further targeted bugfix on `design:generate` is required: (a) actually drive
  prompt submission + generation on a freshly created project, (b) detect the
  `?file=<Name>.html` completion signal, and (c) emit `projectUrl`/`fileName`
  per the consumer contract on both success and timeout paths.

## Output paths

- `/home/l1u/workspace/noeticmind/web-ai-capability-hub/.runs/web-ai-explore/stream5/verify5-claude.json`
- `/home/l1u/workspace/noeticmind/web-ai-capability-hub/.runs/web-ai-explore/stream5/verify5-claude.md`
