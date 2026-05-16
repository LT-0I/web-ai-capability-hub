# Round 7 (FINAL) — claude-design chain end-to-end re-verification

Repo: /home/l1u/workspace/noeticmind/web-ai-capability-hub
Profile: claude-9224 (port 9224), live logged-in, no relaunch/close. Model: Sonnet.
Build: used pre-built `dist/` as instructed (no rebuild).
Prompt: benign — "a single static page that displays Hello World".

## Verdict: NOT end-to-end GREEN

3 of 4 steps GREEN. `get-html` still FAILS with `ARTIFACT_VERIFICATION_FAILED`.

| Step | Tool | Status |
|---|---|---|
| create-project | webai:claude:design:create-project | VERIFIED_GREEN |
| generate | webai:claude:design:generate | VERIFIED_GREEN |
| get-html | webai:claude:design:get-html | **FAILED — ARTIFACT_VERIFICATION_FAILED** |
| present | webai:claude:design:present | VERIFIED_GREEN |

## Per-step detail

### create-project — GREEN
`{"projectUrl":"https://claude.ai/design/p/019e2cc2-af9d-718e-bc9d-07460918fce7","projectId":"019e2cc2-af9d-718e-bc9d-07460918fce7"}`

### generate — GREEN (no regression vs round-6)
`{"status":"generated","model_used":"sonnet","projectUrl":"https://claude.ai/design/p/019e2cc2-af9d-718e-bc9d-07460918fce7","fileName":"index.html"}`

### get-html — FAILED
CLI JSON:
`{"ok":false,"errorCode":"ARTIFACT_VERIFICATION_FAILED","error_code":"ARTIFACT_VERIFICATION_FAILED","iframeArtifactSha256":"","savedPath":"","byteSize":0}`

No HTML artifact produced (savedPath empty, byteSize 0). Download dir `/tmp/r7-cl-gethtml/` left empty — failure cleanup verified, no scratch files. No html/dom/screenshot fields leaked.

#### Did the round-7 scoped fix land? YES — but it does not fix get-html.
Live DOM probe (tab `r7-cl-probe` on the project URL) confirms the fix works at its stated scope:
- Page redirected to the viewer: `https://claude.ai/.../p/019e2cc2-...?file=index.html`
- `iframe[data-testid="html-viewer-iframe"]` IS present in the DOM.
- `ensureDesignViewerOpen` / file-Open-control click path reaches the `?file=` viewer.

#### Precise root cause
The `html-viewer-iframe` `src` attribute is the **bootstrap stub**:
`https://019e2cc2-af9d-718e-bc9d-07460918fce7.claudeusercontent.com/_bootstrap`
and it never transitions to a `/serve/index.html` URL at the DOM-attribute level even after waiting (re-probed twice — still `/_bootstrap`).

`readIframeHtml()` (flow.ts:248-263) chain:
1. `srcdoc` attr — absent.
2. `contentFrame().content()` — blocked: iframe is cross-origin (`*.claudeusercontent.com`) and `sandbox="allow-scripts allow-forms allow-popups allow-modals allow-downloads allow-same-origin"`; Playwright/CDP cannot read its document.
3. Falls back to returning the `src` attr = the `/_bootstrap` URL string.

`isRealHtmlMarkup()` (flow.ts:172-178) rejects it: `BOOTSTRAP_OR_LOADER_URL_RE` (`/_(bootstrap|loader)/`) matches → returns false → `stepGetHtml` throws `ARTIFACT_VERIFICATION_FAILED` at flow.ts:315-318. This is the contract behaving correctly and honestly (it refused to save a `_bootstrap` stub as the artifact — no fallback synthesis).

#### Why in-viewer capture cannot currently succeed
CDP target enumeration shows the *live* iframe target resolves to a real serve URL with a preview token:
`https://019e2cc2-....claudeusercontent.com/v1/design/projects/019e2cc2-.../serve/index.html?t=<preview-token>...`
But the real HTML is gated: allocating a tab directly on the serve URL returns visibleText `"preview token required"`. The genuine HTML only renders inside the embedded, cross-origin, sandboxed bootstrap-loader iframe (loaded client-side with the parent's per-session preview token), whose document content is unreadable over CDP via `contentFrame()`. The round-7 fix correctly navigates to the viewer but does NOT extract real HTML out of the bootstrap-loader iframe — that is the unsolved part.

HTML artifact sha256 / first ~200 bytes: **N/A — no real HTML artifact was ever produced.** The only reachable string was the `_bootstrap` URL (correctly rejected, not saved). No fabricated content.

### present — GREEN
`{"presentUrl":"https://claude.ai/design/p/019e2cc2-af9d-718e-bc9d-07460918fce7?file=index.html"}` — real presentUrl, no error code.

## Bottom line
- create-project: GREEN
- generate: GREEN (no regression)
- get-html: **FAILED — `ARTIFACT_VERIFICATION_FAILED`**
- present: GREEN

Is the full claude-design chain end-to-end GREEN? **NO.** The round-7 viewer-navigation fix landed and works for reaching the `?file=` viewer (and for `present`), but `get-html` still cannot capture a real HTML artifact: the html-viewer-iframe is a cross-origin sandboxed `_bootstrap` loader whose real content (served from `/serve/index.html?t=<preview-token>`) is unreadable via CDP `contentFrame()` and not exposed via `srcdoc`/`src`. The remaining fix must extract HTML from the bootstrap-loaded serve target (e.g. via a CDP frame/target attach to the resolved `/serve/index.html?t=...` iframe), not just open the viewer.
