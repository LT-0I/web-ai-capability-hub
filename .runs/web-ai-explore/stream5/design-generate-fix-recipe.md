# Stream #5 — Claude Design `generate` fix recipe (live-confirmed, observe-first)

Date: 2026-05-15 · Profile: `claude-9224` (port 9224, live, logged in, NOT relaunched) ·
Build: existing D1-v2 `dist/` (NO rebuild; drove via `node dist/src/cli.js`) ·
Model: Sonnet 4.6 · Method: real Claude Design UI driven via project CLI
(`browser:tab:alloc`/`browser:type`/`browser:click`/`browser:wait`/`browser:read`),
live DOM read between every step. Own tab `dbg-cl-1` (allocated + freed
`{"freed":true}`). No src/test/config edits. No commit. No dist rebuild.

## TL;DR

**A real generation completed live.** `generate`'s four blind codex rounds failed
for ONE reason: **the completion detector waits for `?file=<name>.html` to appear
in `page.url()`, but that suffix NEVER appears automatically after generation.**
It only appears when the user explicitly clicks the file's **Open** button in the
project sidebar. After a successful generate the project URL stays the bare
`/design/p/<id>` and the produced file is exposed (a) as a sidebar `PAGES`
entry ("index.html … 1.9 KB · HTML") and (b) as a live preview `<iframe>` whose
`src` is `https://<projectId>.claudeusercontent.com/v1/design/projects/<projectId>/serve/index.html?t=…`.
The secondary bug: the submit is done with `page.keyboard.press("Enter")` which
is unreliable on the React composer; the **Send button**
(`button[data-testid="chat-send-button"]`) is the reliable trigger. The tertiary
bug: `projectUrl`/`fileName` are only emitted on the success path, never on the
timeout path (contract violation).

## Proof a real generation completed live (no fabrication)

- Fresh project (via CLI `create-project`):
  `https://claude.ai/design/p/019e2ca9-b6ac-77ea-aeba-3b4f51079d8e` (title `DbgHello R6`).
- Manually typed benign prompt into the real composer, clicked the real Send
  button. Live DOM after ~10s showed: `Writing Shelling... Writing index.html`,
  then `PAGES index.html HTML page just now … Modified just now · 1.9 KB · HTML`,
  and a live preview iframe
  `src=https://019e2ca9-b6ac-77ea-aeba-3b4f51079d8e.claudeusercontent.com/v1/design/projects/019e2ca9-b6ac-77ea-aeba-3b4f51079d8e/serve/index.html?t=622799921e7eb87a…1778869389`.
- Clicking the sidebar file **Open** button changed the page URL to
  **`https://claude.ai/design/p/019e2ca9-b6ac-77ea-aeba-3b4f51079d8e?file=index.html`**
  and mounted `iframe[data-testid="html-viewer-iframe"]` (initial
  `src=https://019e2ca9-….claudeusercontent.com/_bootstrap`, which never swaps
  its `src` attribute — content loads inside the bootstrap frame).
- Real produced HTML artifact captured via `browser:download-url` of the serve
  URL: `data/downloads/dbg-serve.html`, copied to
  **`.runs/web-ai-explore/stream5/dbg-artifacts/dbg-r6-serve-index.html`**.
  - **sha256 (recomputed from disk): `10cf48449855bf2a11e0d8367d13e4d15bcf2b35392a498cf2b0cb368581b903`**
  - byteSize: 9229 bytes; `mimeType: text/html`
  - First ~150 bytes:
    `<!DOCTYPE html>\n<html lang="en">\n<head>\n<style data-omelette-injected>html,body{background:transparent}</style><script data-omelette-injected>(()=>{var j=["https://claude.ai","https://preview.claude.a`
  - Contains `<title>Hello World</title>` and the text `Hello World`. Real HTML, not a stub.

## Exact live-confirmed working manual recipe

All on the project page (navigate the managed page to the `project_url` returned
by `create-project`). Selectors prefer `data-testid`.

1. **Navigate** the managed page to `project_url` (bare `/design/p/<id>`).
2. **Hydration wait**: wait until `textarea[data-testid="chat-composer-input"]`
   is visible. (~4 s in practice; the composer, model button, and send button
   all mount together once visible — confirmed from the first post-nav read.)
3. **(Optional) Model select**:
   - Click `button[data-testid="model-selector-button"]` (live title
     `"Change model"`). Dropdown opens.
   - Click the option button whose exact text is the model label. Live dropdown
     options confirmed: `Haiku 4.5`, `Sonnet 4.6`, `Opus 4.7`, `Sonnet 4.5`,
     `Opus 4.6`, `Claude Opus 3`. The code's `MODEL_LABELS` (`sonnet → "Sonnet 4.6"`,
     `haiku → "Haiku 4.5"`) **match the live DOM exactly**, so this step is NOT
     the bug — but it must be best-effort (`.catch`) so a label drift cannot
     abort the whole generate before the prompt is even typed.
4. **Type the prompt** into `textarea[data-testid="chat-composer-input"]`
   (placeholder `"Describe what you want to create..."`, a real `<textarea>`,
   `rows=3`). Verified the value lands: re-reading the textarea `.value`
   returned the full prompt string.
5. **Submit by clicking the Send button**:
   `button[data-testid="chat-send-button"]` (live title `"Send (Enter)"`,
   enabled once the textarea is non-empty). **This is the reliable trigger.**
   After click: composer empties, sidebar shows `Writing … Writing index.html`.
   (Do NOT rely on `keyboard.press("Enter")` — see Divergence #2.)
6. **Wait for completion** by polling the live DOM for the real completion
   signal — **NOT** a `?file=` URL change. The robust signal is the appearance
   of the preview iframe whose `src` matches
   `https://<projectId>.claudeusercontent.com/v1/design/projects/<projectId>/serve/`.
   Equivalent secondary signal: a sidebar `PAGES` file entry `*.html`
   ("… · N KB · HTML"). In this run the serve-iframe appeared within ~10–15 s
   of clicking Send.
7. **Derive `fileName`** from the served iframe path (`…/serve/<fileName>`,
   here `index.html`) or from the `PAGES` entry text. **Do not** require a
   `?file=` URL — that only exists if the file's **Open** button is clicked.
8. **(For get-html / downstream)** To get the canonical `?file=` viewer +
   `iframe[data-testid="html-viewer-iframe"]`, click the sidebar file's **Open**
   button — selector `xpath=//button[contains(normalize-space(.),"Open") and not(@data-testid)]`
   (its accessible name is `" Open"` with a leading icon space; a plain
   `text()="Open"` xpath times out). URL then becomes `…?file=index.html`.
   The `html-viewer-iframe`'s `src` stays `…/_bootstrap` and never swaps; the
   real HTML lives in the nested bootstrap document. The reliable artifact
   capture is `browser:download-url` of the serve URL
   (`…/serve/<fileName>?t=…`), which returns real `text/html` (9229 bytes here).

## Precise source-level fix — `src/mcp/submcp/claude-design/flow.ts`

### Divergence #1 (PRIMARY — the four-round failure) — wrong completion signal

`stepGenerate` (line ~182) calls `waitForDesignFileCompletion(page, …)`
(lines 102–113), which loops on `currentDesignFileResolution(page)` →
`designFileNameFromProjectUrl(page.url())` looking for `?file=<name>.html` in
**`page.url()`**. Live-confirmed: after a successful generation the page URL
stays the bare `/design/p/<id>` — `?file=` is only added by an explicit sidebar
**Open** click, which `generate` never performs. So the detector can never fire,
the loop runs to `deadline`, and `generate` throws `POSTCONDITION_TIMEOUT`
(rounds 4/5 root cause). Round-4 only saw `?file=` because a prior manual/Open
interaction had set it; round-5 (truly fresh) correctly never did.

**Minimal change**: replace the completion detector with one that keys on the
real readiness signal — the served-design iframe. In `flow.ts`:

- Add a constant:
  `export const DESIGN_SERVE_IFRAME_RE = /\/v1\/design\/projects\/[^/]+\/serve\//i;`
- Rewrite `waitForDesignFileCompletion` to poll, each tick:
  - quota check (keep `assertNotQuotaExhausted`);
  - read all iframe `src` attributes on the page
    (`page.locator('iframe')` → for each, `getAttribute('src')`); the FIRST whose
    `src` matches `DESIGN_SERVE_IFRAME_RE` is the completion signal;
  - derive `fileName` = last path segment of that serve URL before `?`
    (`/serve/(.+?)(?:[?#]|$)/`, e.g. `index.html`);
  - return `{ projectUrl: <bare project_url passed in / page.url()>, fileName }`.
  - Keep the `?file=` URL check as a *fallback* OR (covers the case where the
    caller passed a `?file=`-suffixed URL).
- On timeout still throw an error carrying
  `error.errorCode = ConsumerErrorCodes.POSTCONDITION_TIMEOUT`, **but also attach
  the best-known `projectUrl` and (possibly empty) `fileName`** so the tools
  layer can emit them (see Divergence #3).

`stepGenerate` should pass/return the bare project URL as `projectUrl`
(`args.project_url`), and `fileName` from the serve-iframe match.

### Divergence #2 (SECONDARY) — unreliable submit + model click can abort

In `stepGenerate` (lines 177–181):
```
await page.waitForSelector?.(DESIGN_MODEL_SELECTOR, …).catch(()=>undefined);
await clickLocator(page, DESIGN_MODEL_SELECTOR);          // NOT guarded
await clickButtonByText(page, MODEL_LABELS[modelKey]);    // NOT guarded — throws if label drifts
await fillLocator(page, DESIGN_COMPOSER_SELECTOR, args.prompt);
await page.keyboard?.press("Enter");                      // unreliable submit
```
- `clickLocator(DESIGN_MODEL_SELECTOR)` and `clickButtonByText(MODEL_LABELS…)`
  are unguarded; if the dropdown markup/label shifts, the whole generate aborts
  **before the prompt is ever typed** (consistent with round-5's pristine
  composer / no file). Wrap both model-select calls in `.catch(()=>undefined)`
  (best-effort; the default model is fine for a smoke).
- Replace `await page.keyboard?.press("Enter")` with an explicit Send-button
  click: wait for `DESIGN_SEND_SELECTOR`
  (`[data-testid="chat-send-button"]`, already defined line 9) to be visible &
  enabled, then `await clickLocator(page, DESIGN_SEND_SELECTOR)`. Keep an
  `Enter` press only as a `.catch` fallback. `DESIGN_COMPOSER_SELECTOR`
  (`textarea[data-testid="chat-composer-input"]`) and `DESIGN_SEND_SELECTOR`
  are **already correct** vs live DOM — only the *trigger mechanism* changes.

### Divergence #3 (CONTRACT) — `projectUrl`/`fileName` missing on timeout path

`src/mcp/submcp/claude-design/tools.ts` `webAiClaudeDesignGenerate`
(lines 78–89): success returns `{status,model_used,projectUrl,fileName}`
(good), but the catch path returns `designFailure(error, { status: "failed" })`
— **no `projectUrl`/`fileName`**. `configs/consumer-contract.json`
(lines 1368–1374) lists `status,model_used,projectUrl,fileName` as
`always_present` for `webai:claude:design:generate`. So the timeout path
violates the contract.

**Minimal change**: on timeout, emit the contract keys with the best-known /
empty values, e.g.:
```
const stable = designFailure(error, {
  status: "failed",
  model_used: effective.model || "sonnet",
  projectUrl: error?.projectUrl || effective.project_url || "",
  fileName: error?.fileName || ""
});
```
For this to work, `waitForDesignFileCompletion` must attach `projectUrl`
(= the project URL) and `fileName` (if known, else "") to the thrown error
object before `throw` (Divergence #1 change). Apply the same
`projectUrl/fileName` enrichment to the quota branch
(`quotaResponse({ status:"failed", model_used, projectUrl, fileName:"" })`).
No raw Playwright string leaks (keep routing through `stableDesignErrorCode`),
no stub, no fabrication. **Leave `stepGetHtml` / D2 `isRealHtmlMarkup`
validation untouched** — it is correct and still rejects the `_bootstrap`
stub; downstream get-html capture is a separate concern (it should
`browser:download-url` the serve URL, but that is NOT in scope for this
generate fix and the user asked to keep D2 intact).

### Files / functions to change (summary)

| File | Function | Change |
|------|----------|--------|
| `src/mcp/submcp/claude-design/flow.ts` | `waitForDesignFileCompletion` (102–113) + new `DESIGN_SERVE_IFRAME_RE` | Detect completion via serve-iframe `src` regex (+ keep `?file=` as OR fallback); derive `fileName` from `/serve/<name>`; on timeout attach `projectUrl`+`fileName` to the thrown error |
| `src/mcp/submcp/claude-design/flow.ts` | `stepGenerate` (172–186) | Guard the two model-select clicks with `.catch`; replace `keyboard.press("Enter")` with a wait-for + click on `DESIGN_SEND_SELECTOR` (Enter only as fallback); return bare `projectUrl`=`args.project_url` |
| `src/mcp/submcp/claude-design/tools.ts` | `webAiClaudeDesignGenerate` (78–89) | Emit `status,model_used,projectUrl,fileName` on the timeout AND quota branches (contract `always_present`) |

No changes to `configs/consumer-contract.json` /
`docs/CONSUMER_CONTRACT.md` / `tests/consumerContract.test.ts` are required:
the contract already lists `projectUrl`/`fileName` as `always_present`; this fix
makes the failure path *honor* the existing contract (no version bump — this is
bugfix iteration, not a surface change). No new error codes
(`POSTCONDITION_TIMEOUT` / `SUBMCP_QUOTA_EXHAUSTED` already exist and remain the
stable terminal codes).

## Not a quota / guard wall

Generation is fully automatable: the benign prompt produced a real 1.9 KB
`index.html` server-side and a live serve-iframe within ~10–15 s, with no quota
text, no CAPTCHA, no auth wall. No `blocked-claude-design.md` is warranted —
the failure was purely a wrong completion-signal + unreliable submit + a
contract-key omission, all fixable in `flow.ts`/`tools.ts`.

## Honesty / safety statement

- Real generation completed live; sha256 recomputed from disk
  (`10cf48449855bf2a11e0d8367d13e4d15bcf2b35392a498cf2b0cb368581b903`), real
  HTML head quoted. No fabrication, no stub, no blind retry-rerun (one clean
  manual reproduction; polling was diagnostic observation, not generate retries).
- Cheap Sonnet 4.6; benign trivial input ("a single static page that displays
  the words Hello World"). No account/billing/publishing/CAPTCHA.
- Browser NOT relaunched/closed. Own tab `dbg-cl-1` allocated + freed. No
  profiles.json, no dist rebuild, no commit, no src/test/config edits (recipe
  only), no pkill/pgrep of profile patterns, no Playwright-MCP chrome, no
  noeticbraid.

## Output paths

- `.runs/web-ai-explore/stream5/design-generate-fix-recipe.md` (this file)
- `.runs/web-ai-explore/stream5/dbg-artifacts/dbg-r6-serve-index.html`
  (real produced artifact, sha256 above)
