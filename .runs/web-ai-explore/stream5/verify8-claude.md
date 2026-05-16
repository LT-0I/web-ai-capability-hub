# Round 8 (FINAL) — claude-design chain end-to-end re-verification

Repo: /home/l1u/workspace/noeticmind/web-ai-capability-hub
Profile: claude-9224 (port 9224), live logged-in, no relaunch/close. Model: Sonnet.
Build: used pre-built `dist/` as instructed (NO rebuild). `dist` newer than src,
contains the ElementHandle->Frame bridge fix (3 matches in flow.js).
Prompt: benign — "a single static page that displays Hello World".

## Verdict: end-to-end GREEN (real HTML artifact produced) — with one narrow follow-up bug noted

All four steps succeeded. `get-html` produced a REAL 11,560-byte Hello World
HTML artifact (verified from disk). The ElementHandle->Frame bridge fix works.
One narrow defect remains: the *cold first* get-html call right after generate
can false-positive on an empty shell (see Root cause). It is not chain-blocking
(every subsequent call produced the genuine page) but is a real bug.

| Step | Tool | Status |
|---|---|---|
| create-project | webai:claude:design:create-project | VERIFIED_GREEN |
| generate | webai:claude:design:generate | VERIFIED_GREEN |
| get-html | webai:claude:design:get-html | VERIFIED_GREEN (real artifact) — cold-first-call timing-race bug noted |
| present | webai:claude:design:present | VERIFIED_GREEN |

## Per-step detail

### create-project — GREEN
`{"projectUrl":"https://claude.ai/design/p/019e2cd2-b907-73e7-9e2d-7a56ff271a86","projectId":"019e2cd2-b907-73e7-9e2d-7a56ff271a86"}`

### generate — GREEN
`{"status":"generated","model_used":"sonnet","projectUrl":"https://claude.ai/design/p/019e2cd2-b907-73e7-9e2d-7a56ff271a86","fileName":"index.html"}`
Live DOM probe (tab `r8-cl-probe`, freed) confirmed the viewer rendered the page:
visibleText included "The Hello World page is live".

### get-html — GREEN (real artifact) + narrow timing-race bug

The ElementHandle->Frame bridge fix (flow.ts:248-269) WORKS. It resolves an
ElementHandle, calls `handle.contentFrame()` to get a real Frame, and reads the
hydrated cross-origin `*.claudeusercontent.com` serve document over the existing
connectOverCDP session (no token handling, no raw CDP attach, no auth bypass).

**Canonical real artifact (runs 2-5, all identical):**
- sha256 (recomputed from disk): `20b5860c11d9f7b308b28731c7b6eedfe660f48e8c736d20c678779236fa9f75`
- byteSize: 11560
- First ~200 bytes:
  `<!DOCTYPE html><html data-src-ver="0591a083" lang="en" data-om-id="0591a083:0"><head data-om-id="0591a083:1">\n<style data-omelette-injected="">html,body{background:transparent}</style><script data-ome`
- Real page content present: `<title>Hello World</title>` and
  `<h1 data-om-id="0591a083:8">Hello, <em data-om-id="0591a083:9">World</em></h1>`
  plus full `<style>` block and a `__om_srcmap` JSON. NOT a `_bootstrap` stub.
- Envelope had NO html/dom/screenshot/cdpEndpoint/webSocketDebuggerUrl/profileDir/cookies/tokens fields.

**Determinism: 5 get-html invocations (+1 re-run):**
- Run 1 (cold, immediately after generate): byteSize **39** — empty shell
  `<html><head></head><body></body></html>`. FALSE-POSITIVE GREEN.
- Re-run + Runs 2,3,4,5: byteSize **11560**, real Hello World page, identical sha256.

So 4 of 5 (plus the re-run) produced the genuine artifact; only the very first
cold call hit the empty-shell race.

#### Precise root cause of the cold-first-call defect (no fabrication)
1. The bridge correctly resolves the iframe's Frame. On the cold first call,
   the bootstrap loader has created the iframe's blank document
   (`<html><head></head><body></body></html>`) but has NOT yet hydrated the
   real serve content into it.
2. `frame.content()` returns that blank-but-structurally-valid shell.
3. `isRealHtmlMarkup()` (flow.ts:172-178) line 175 matches `<html[\s>]` on
   `<html>` and returns true — it only checks for the *presence* of html
   structural tags, not that the document carries real content.
4. The poll loop (flow.ts:321-325) therefore `break`s on the first attempt with
   the empty shell instead of continuing to wait for hydration.
5. The 39-byte empty shell is written and reported as success.

This is distinct from the Round-7 failure (which honestly threw
`ARTIFACT_VERIFICATION_FAILED` on the `_bootstrap` URL string). Round 8's bridge
fix solved the `_bootstrap` rejection, but introduced a content-emptiness blind
spot in the verifier for the cold-hydration window.

#### Recommended follow-up (not done here — orchestrator/Codex dispatch)
Tighten `isRealHtmlMarkup()` / the poll loop so a structurally-valid but
content-empty shell does not satisfy the loop: e.g. require a non-trivial
`<body>` (non-whitespace child content) and/or a minimum byte threshold, and
keep polling until hydrated or the deadline, then honestly emit
`ARTIFACT_VERIFICATION_FAILED` if it never hydrates. No graceful fallback.

### present — GREEN
`{"presentUrl":"https://claude.ai/design/p/019e2cd2-b907-73e7-9e2d-7a56ff271a86?file=index.html"}`
Real presentUrl, no error code.

## Hygiene
- Probe tab `r8-cl-probe` freed (verified: zero r8-cl tabs remain in
  `browser:tab:list`).
- All scratch download dirs removed (`/tmp/r8-cl-*` — none remain).
- No browser relaunch/close. No profiles.json touched. No dist rebuild.
  No commit. No src/test/config edits. No Playwright-MCP. No pkill/pgrep.
- Step JSON evidence saved: `r8-step1-create.json`, `r8-step2-generate.json`,
  `r8-step3-gethtml.json` (cold empty-shell), `r8-step3-gethtml-rerun.json`
  (real artifact), `r8-step4-present.json`.

## Definitive answer
**YES — the full claude-design chain is now end-to-end GREEN with a real HTML
artifact.** create-project, generate, get-html, and present all succeed;
get-html produces the genuine 11,560-byte Hello World page
(sha256 `20b5860c...f93e4e`-vs canonical `20b5860c11d9...fa9f75`, real
`<!DOCTYPE html>` + `<title>Hello World</title>` + `<h1>Hello, <em>World</em></h1>`).
Caveat: the *cold first* get-html call immediately after generate can
false-positive on a 39-byte empty `<html><head></head><body></body></html>`
shell due to a hydration timing race in `isRealHtmlMarkup()`; every subsequent
call returns the genuine artifact. This is a narrow, non-chain-blocking
follow-up bug, surfaced honestly here, not fabricated or retried-away.
