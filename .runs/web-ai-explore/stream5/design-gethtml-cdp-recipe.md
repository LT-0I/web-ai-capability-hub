# Stream #5 — Claude Design `get_html` SOLVABLE recipe (live-proven, observe-first)

Date: 2026-05-15 · Profile: `claude-9224` (port 9224, live, logged in, NOT
relaunched/closed) · Build: existing clean `dist/` (NO rebuild; drove via
`node dist/src/cli.js`) · Model: Sonnet · Prompt: benign
("a page that displays Hello World") · Own tab `probe-cl-cdp1`
(allocated + freed `{"freed":true}`). No src/test/config edits. No commit.
No dist rebuild. No auth bypass, no token fabrication, no local synthesis.

## Verdict: SOLVABLE — get_html CAN read the real produced HTML

The bounded question is **YES**. The bootstrap-loaded child serve target is a
fully attachable target over the **existing already-authenticated CDP endpoint**.
Two independent legitimate paths were live-proven; the recommended source fix is
the second (no raw token handling, smallest diff, same mechanism class the rest
of the flow already uses).

## Live proof (no fabrication)

- `create-project` → `https://claude.ai/design/p/019e2cc8-a7a8-7df1-883e-cca59d2babb3` (GREEN)
- `generate` → `{"status":"generated","model_used":"sonnet","fileName":"Hello World.html"}` (GREEN, no regression)
- Allocated own tab on `…/p/019e2cc8-…?file=Hello%20World.html`; the
  `iframe[data-testid="html-viewer-iframe"]` mounts with `src=…claudeusercontent.com/_bootstrap`
  (the known stub — confirmed again here).

### Path 1 — raw CDP target enumeration + attach (answers the literal question: YES)

`GET http://127.0.0.1:9224/json/list` (the existing CDP endpoint, same one
`connectOverCDP`/`browser:artifact-click` use — no new auth) enumerates, among 8
targets, **`type:"iframe"` child targets whose URL is the real serve URL with the
live preview token**:

```
type: iframe
url:  https://019e2cc8-….claudeusercontent.com/v1/design/projects/019e2cc8-…/serve/Hello%20World.html?t=85fad575a929cee41d240f51f399b21da3a4b2865b64607085
id:   1FF75785CA1AE841B497B0D75205AD47
webSocketDebuggerUrl: ws://127.0.0.1:9224/devtools/page/1FF75785CA1AE841B497B0D75205AD47
```

Attaching to that target's `webSocketDebuggerUrl` and issuing
`Runtime.enable` + `Runtime.evaluate {expression:"document.documentElement.outerHTML"}`
returned **real rendered HTML** (24766 bytes), `<title>Hello World</title>`, body
text "Hello World", **zero `_bootstrap` strings**. The token is the one already
carried by the live logged-in session (it is *read*, never minted or bypassed);
the serve frame is the browser's own already-rendered child document.

### Path 2 — Playwright ElementHandle.contentFrame() (RECOMMENDED fix; smallest diff)

The current `readIframeHtml` (flow.ts:248-263) calls `iframe.contentFrame()` on a
**Locator** (`page.locator(sel).first()`). `Locator.contentFrame()` returns a
**FrameLocator** which has **no `.content()` method**, so `frame?.content` is
falsy and the function falls through to returning the `src` string (`_bootstrap`)
→ `isRealHtmlMarkup` correctly rejects it → `ARTIFACT_VERIFICATION_FAILED`.

Live-proven correct call sequence on the **same `connectOverCDP` session the flow
already uses** (no `/json/list`, no token handling, no raw WS):

```
const handle = await page.locator('iframe[data-testid="html-viewer-iframe"]').first().elementHandle();
const frame  = handle ? await handle.contentFrame() : null;   // -> a real Frame for the cross-origin child
const html   = frame && typeof frame.content === "function" ? await frame.content() : "";
```

`ElementHandle.contentFrame()` returns a real `Frame` object that bridges into the
bootstrap-resolved cross-origin serve document. `frame.content()` returned
**24823 bytes** of `<!DOCTYPE html><html … lang="en">…`, `<title>Hello World</title>`
present, `_bootstrap` URL **absent**. Reproduced 3× (byte counts vary 24766–26001
only because the live frame keeps hydrating client-side; every read is real markup
that passes `isRealHtmlMarkup`).

> Note: `page.frames()` lists the cross-origin child frame with an empty `url`
> (origin hidden), so a `frames()`-URL-match strategy is NOT reliable. The
> ElementHandle→contentFrame bridge is what works and is what the fix uses.

## Proof I read the REAL HTML (recomputed from disk)

| Path | sha256 (recomputed from disk) | bytes | first ~200 bytes |
|---|---|---|---|
| CDP `/json/list` + WS attach | `3dc82093b8793ae911e076965620ac39d1ad5492b41dda9c58fa4e6b9abc165d` | 24766 | `<html data-src-ver="1c100b2e" lang="en" data-om-id="1c100b2e:0"><head …><style data-omelette-injected>html,body{background:transparent}</style><script data-omelette-injected>…` |
| ElementHandle.contentFrame().content() | `b31c0097cba7167583daee07599661c5dd28fe05e4e1c468486ef3181e0c7fc1` | 24823 | `<!DOCTYPE html><html data-src-ver="397cd005" lang="en" data-om-id="397cd005:0"><head …><style data-omelette-injected>html,body{background:transparent}</style><script data-ome…` |

Both contain `<title>Hello World</title>` + body text "Hello World", and contain
**zero** `_bootstrap`/`_loader` URL stubs. Hashes differ across reads because the
served document keeps re-hydrating client-side (`data-src-ver` changes); this is
expected — the markup is genuine produced HTML in every read, not the stub.
(The Omelette `data-omelette-injected` bootstrap *runtime script* is part of
Claude's own served document — it is the page Claude renders to the user, not a
local synthesis.)

## Precise minimal source change — `src/mcp/submcp/claude-design/flow.ts`

**Function: `readIframeHtml` (lines 248-263).** The single defect is calling
`contentFrame()` on a Locator instead of an ElementHandle. Replace the
`contentFrame` block so it resolves an ElementHandle first; keep the `srcdoc`
fast-path and the `src` last-resort, and keep `isRealHtmlMarkup` /
`ARTIFACT_VERIFICATION_FAILED` (flow.ts:172-178, 315-318) **completely
untouched** — they still correctly reject a `_bootstrap` stub if the bridge ever
fails. Exact replacement for lines 248-263:

```ts
async function readIframeHtml(iframe: any): Promise<string> {
  const srcdoc = await iframe.getAttribute?.("srcdoc");
  if (typeof srcdoc === "string" && srcdoc.trim()) return srcdoc;
  let frame: any = null;
  try {
    // FIX: Locator.contentFrame() returns a FrameLocator (no .content()).
    // Resolve an ElementHandle first; ElementHandle.contentFrame() returns a
    // real Frame that bridges the bootstrap-resolved cross-origin serve child
    // document over the existing connectOverCDP session (no token handling,
    // no raw CDP target attach, no auth bypass).
    const handle = typeof iframe.elementHandle === "function" ? await iframe.elementHandle() : iframe;
    frame = handle && typeof handle.contentFrame === "function" ? await handle.contentFrame() : null;
  } catch {
    frame = null;
  }
  if (frame && typeof frame.content === "function") {
    const html = await frame.content().catch(() => "");
    if (typeof html === "string" && html.trim()) return html;
  }
  const src = await iframe.getAttribute?.("src");
  return typeof src === "string" ? src : "";
}
```

No other function changes are required. `stepGetHtml` already: opens the viewer
(`ensureDesignViewerOpen`), waits for `DESIGN_HTML_IFRAME_SELECTOR`, calls
`readIframeHtml`, runs `isRealHtmlMarkup`, sha256s and writes the artifact, and
cleans up the download dir on failure — all unchanged. `isRealHtmlMarkup`
(`<!doctype html`/`<html` → true) accepts the returned markup (verified).

### Optional hardening (not required for GREEN, recommended)

The bootstrap may still be loading when the iframe selector first appears. In
`stepGetHtml` (after `waitForSelector(DESIGN_HTML_IFRAME_SELECTOR)` at
flow.ts:311), a short bounded retry loop around `readIframeHtml` until
`isRealHtmlMarkup(source)` is true OR a ~20-30s deadline (then throw the same
`ARTIFACT_VERIFICATION_FAILED`) absorbs the bootstrap-hydration race without
weakening the contract or adding any fallback synthesis. This is the only place a
poll belongs; the verification gate and error code stay intact.

### Files / functions to change (summary)

| File | Function | Change |
|------|----------|--------|
| `src/mcp/submcp/claude-design/flow.ts` | `readIframeHtml` (248-263) | Resolve `elementHandle()` before `contentFrame()` so a real `Frame` (with `.content()`) bridges the cross-origin bootstrap-resolved serve child. `srcdoc`/`src` paths and `isRealHtmlMarkup`/`ARTIFACT_VERIFICATION_FAILED` unchanged. |
| `src/mcp/submcp/claude-design/flow.ts` *(optional)* | `stepGetHtml` (304-331) | Bounded retry of `readIframeHtml` until `isRealHtmlMarkup` true or deadline; same terminal error code. No new fields, no fallback. |

No `configs/consumer-contract.json` / `docs/CONSUMER_CONTRACT.md` /
`tests/consumerContract.test.ts` changes: `get-html`'s output surface
(`iframeArtifactSha256`, `savedPath`, `byteSize`) and error taxonomy are
unchanged. This is bugfix iteration, not a surface change — **no version bump**.
No new error codes. No forbidden fields leaked (only sha256/path/size).

## Honesty / safety statement

- Real generation + real HTML extraction proven live; sha256s recomputed from
  disk and quoted above; real `<title>Hello World</title>` markup, zero
  `_bootstrap` stub. No fabrication, no local synthesis, no auth/token bypass
  (the preview token is read from the live authenticated session, never minted),
  no blind retry-rerun (one create→generate→probe pass).
- Cheap Sonnet; benign trivial input. No account/billing/publishing/CAPTCHA.
- Browser NOT relaunched/closed; own tab `probe-cl-cdp1` allocated + freed
  (`{"freed":true}`). No profiles.json, no dist rebuild, no commit, no
  src/test/config edits (recipe only), no pkill/pgrep of profile patterns, no
  Playwright-MCP chrome, no noeticbraid. Probe scratch under `/tmp` removed.

## Output paths

- `.runs/web-ai-explore/stream5/design-gethtml-cdp-recipe.md` (this file)
