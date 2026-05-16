# Stream #5 — Round 6 (final) re-verify: claude-design chain

Date: 2026-05-15 · Profile: `claude-9224` (port 9224, live, logged in, NOT
relaunched/closed) · Build: pre-rebuilt `dist/` (NO rebuild; drove via
`node dist/src/cli.js`) · Model: Sonnet · Own tabs `r6-cl-verify` /
`r6-cl-serve` (both allocated + freed `{"freed":true}`) · No src/test/config
edits · No commit · No dist rebuild.

## Verdict: the generate fix is GREEN; the chain is NOT yet fully GREEN

| Step | Tool | Status |
|------|------|--------|
| create | `webai:claude:design:create-project` | **VERIFIED_GREEN** |
| generate | `webai:claude:design:generate` | **VERIFIED_GREEN** (the fix works) |
| get-html | `webai:claude:design:get-html` | **FAILED** — `ELEMENT_NOT_FOUND` (out-of-scope structural gap) |
| present | `webai:claude:design:present` | **FAILED** — `ELEMENT_NOT_FOUND` (same structural class) |

**The source-grounded generate fix landed and is confirmed working.** The four
prior rounds' `POSTCONDITION_TIMEOUT` is resolved: `generate` now SUCCEEDS,
returns `status:"generated"` + `projectUrl` + `fileName`, with no timeout and
no stub. **However the full create→generate→get-html→present chain is NOT
fully GREEN**: `get-html` and `present` fail with stable `ELEMENT_NOT_FOUND`
because of a *separate, deliberately-deferred* capture-path gap (the live
diagnosis recipe explicitly scoped this out of the generate fix).

## Evidence (one clean attempt per step, no blind retry-rerun)

### 1a create-project — VERIFIED_GREEN
```
{"projectUrl":"https://claude.ai/design/p/019e2cb8-ed8c-707b-917d-97e420fd581a",
 "projectId":"019e2cb8-ed8c-707b-917d-97e420fd581a"}  EXIT=0
```
Real project URL+id; no forbidden fields. Live tab confirmed title
`Verify6 HelloWorld`.

### 1b generate — VERIFIED_GREEN (the fix is confirmed)
```
{"status":"generated","model_used":"sonnet",
 "projectUrl":"https://claude.ai/design/p/019e2cb8-ed8c-707b-917d-97e420fd581a",
 "fileName":"index.html"}  EXIT=0
```
- NO `POSTCONDITION_TIMEOUT`. All 4 contract `always_present` keys emitted.
- Source confirmed compiled into `dist/`:
  `DESIGN_SERVE_IFRAME_RE = /\/v1\/design\/projects\/[^/]+\/serve\//i`,
  `DESIGN_SEND_SELECTOR = '[data-testid="chat-send-button"]'`,
  serve-iframe completion detector in `waitForDesignFileCompletion`.
- **Independent corroboration (not fabrication):** live DOM read of own tab
  `r6-cl-verify` on the project URL after generate showed the project sidebar
  `PAGES index.html HTML page 1m ago` — a real `index.html` was produced
  server-side. Generation is genuine and the new detector fired correctly.

### 1c get-html — FAILED (`ELEMENT_NOT_FOUND`), honest terminal, NOT a regression
```
{"ok":false,"errorCode":"ELEMENT_NOT_FOUND","error_code":"ELEMENT_NOT_FOUND",
 "iframeArtifactSha256":"","savedPath":"","byteSize":0}  EXIT=0
```
- Artifact dir `verify6-artifacts/` is **EMPTY** — no `_bootstrap` stub, no
  scratch files, no fabricated artifact. No html/dom/screenshot fields.
- **No fabricated sha256** — none reported because no artifact was captured.
  (Honesty constraint satisfied: I do not invent a hash.)
- **Root cause (structural, deliberately out of scope for the generate fix):**
  `stepGetHtml` (`flow.ts:241`) does
  `waitForSelector(page, DESIGN_HTML_IFRAME_SELECTOR, 30000)` where
  `DESIGN_HTML_IFRAME_SELECTOR = iframe[data-testid="html-viewer-iframe"]`.
  That iframe only mounts on the canonical `?file=<name>` viewer, which (per
  the live recipe) only appears after the sidebar file's **Open** button is
  clicked. After a successful generate the page stays on the **bare**
  `/design/p/<id>` URL. Live DOM read of own tab confirmed the preview pane
  shows literally `Select a file to preview` and **zero `<iframe>` elements**.
  So `waitForSelector(html-viewer-iframe)` times out → `ELEMENT_NOT_FOUND`.
- This was **explicitly declared out of scope** by the live-confirmed recipe
  (`design-generate-fix-recipe.md`): *"Leave `stepGetHtml` / D2
  `isRealHtmlMarkup` validation untouched … downstream get-html capture is a
  separate concern (it should `browser:download-url` the serve URL, but that
  is NOT in scope for this generate fix)."*
- The artifact **is real and exists server-side** as `index.html` (proven by
  the live PAGES sidebar entry). I attempted the recipe's recovery path
  (`browser:download-url` of the serve URL) — it correctly requires human
  confirmation (download guard), so I did not bypass it. A read-only
  re-alloc of own tab directly at the bare serve URL returned
  `preview token required` (the working serve URL needs the `?t=<token>`
  query that only appears in the live preview iframe mounted after Open).
  Hence get-html cannot produce the artifact without first driving to the
  `?file=` viewer or using a tokened serve download — neither is wired today.

### 1d present — FAILED (`ELEMENT_NOT_FOUND`), honest terminal
```
{"ok":false,"errorCode":"ELEMENT_NOT_FOUND","error_code":"ELEMENT_NOT_FOUND",
 "presentUrl":""}  EXIT=0
```
Same structural class as 1c: `stepPresent` clicks `DESIGN_PRESENT_SELECTOR`,
which is not present on the bare `/design/p/<id>` URL after generate. Empty
`presentUrl`, no fabricated URL, no blind retry.

## What is now GREEN vs not

- **GREEN and confirmed:** `create-project`, **`generate`** (the round-6
  target — the source-grounded serve-iframe + send-button + contract-key fix
  is verified working; the 4-round `POSTCONDITION_TIMEOUT` is resolved).
- **Still FAILED (separate, known, deferred follow-up):** `get-html` and
  `present` — both hit a structural capture-path gap that the generate fix
  recipe deliberately scoped out. They fail honestly with stable contract
  codes and leave zero artifacts/scratch.

**The full claude-design chain is NOT yet fully GREEN end-to-end.** The
generate fix itself is GREEN; closing the chain requires a separate in-scope
dispatch to make `stepGetHtml`/`stepPresent` drive to the `?file=` viewer
(click sidebar **Open**, xpath
`//button[contains(normalize-space(.),"Open") and not(@data-testid)]`) before
waiting for `html-viewer-iframe`, or capture via `browser:download-url` of the
tokened serve URL.

## Honesty / safety statement

- No fabricated success, no fabricated sha256, no fabricated URL. `generate`
  success is real and independently corroborated by a live DOM read of the
  produced `index.html` PAGES entry.
- One clean attempt per step. No blind retry-rerun. Failures reported with the
  exact contract code + CLI JSON + precise root cause.
- Cheap Sonnet; benign trivial prompt. No account/billing/publishing, no
  CAPTCHA, no stealth tooling.
- Browser NOT relaunched/closed. Own tabs `r6-cl-verify` + `r6-cl-serve`
  allocated and freed. No `profiles.json`, no dist rebuild, no commit, no
  src/test/config edits, no `pkill`/`pgrep` of profile patterns, no
  Playwright-MCP chrome, no noeticbraid. `docs/capability-library.json` not
  touched.

## Output paths

- `.runs/web-ai-explore/stream5/verify6-claude.json`
- `.runs/web-ai-explore/stream5/verify6-claude.md` (this file)
- `.runs/web-ai-explore/stream5/verify6-artifacts/` (empty — get-html
  correctly wrote nothing on failure)
