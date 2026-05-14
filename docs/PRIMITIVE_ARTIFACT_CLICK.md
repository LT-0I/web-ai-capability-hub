# `browser:artifact-click`

`browser:artifact-click` is a Chromium-CDP export primitive for iframe-backed or sandboxed web-AI artifact downloads. It generalizes the Round-3 literature-review DOCX export recipe into a TypeScript CLI/action surface.

## CLI contract

```bash
browser:artifact-click \
  --profile <profile-id> \
  [--url <absolute-url>] \
  [--tab-url-contains <substr>] \
  --button-selector <css> \
  [--button-ancestor-text <substr>] \
  [--scroll-into-view <auto|y:NNN|none>] \
  [--follow-up-selector <css>] \
  [--follow-up-text-regex <regex>] \
  [--follow-up-ancestor-text <substr>] \
  [--frame-text-filter <substr>] \
  --download-dir <abs-path> \
  [--filename-pattern <glob>] \
  [--rename-to <basename>] \
  [--verify-min-bytes <int>] \
  [--timeout-ms <int>] \
  [--locate-timeout-ms <int>] \
  [--frame-min-count <int>] \
  [--viewport-width <int>] \
  [--viewport-height <int>] \
  [--prerender-wait-ms <int>] \
  [--scroll-main-to-y <int>] \
  [--scroll-main-wait-ms <int>] \
  [--no-disconnect] \
  [--output-json]
```

When `--output-json` is set, success returns:

```json
{
  "path": "/abs/download/final.docx",
  "sha256": "...",
  "size": 12345,
  "suggestedFilename": "report.docx",
  "downloadGuid": "...",
  "frameUrl": "https://...",
  "bbox": { "x": 1, "y": 2, "width": 3, "height": 4 },
  "elapsedMs": 1000
}
```


## Page and frame readiness

`browser:artifact-click` no longer falls back to `context.pages()[0]`. To avoid acting on a random ChatGPT tab, callers must provide one of:

- `--url <absolute-url>` — selects an already-open tab whose current URL contains the supplied URL or the supplied URL's pathname. The primitive reuses that tab instead of opening a blank tab.
- `--tab-url-contains <substr>` — selects an already-open tab whose URL contains a stable substring, useful when conversation URLs are volatile.

When multiple open tabs match the same `--url` or `--tab-url-contains`, the primitive picks the matching tab with the most current child frames, which favors the rendered Deep Research tab over a duplicate lightweight tab.

After tab selection, the primitive best-effort waits for `networkidle` (up to 3s), then `domcontentloaded`, optionally runs the Deep Research scroll/viewport recipe, then waits for iframe readiness. `--frame-min-count <int>` controls the minimum descendant iframe count to wait for when the selected page initially has fewer than three total frames; the default is `1`.

Optional readiness flags:

- `--viewport-width <int>` and `--viewport-height <int>` resize the selected page before readiness waits when either flag is supplied. If only one dimension is supplied, the other recipe default is used (`1500` width, `1000` height). If neither is supplied, viewport behavior is unchanged.
- `--prerender-wait-ms <int>` waits after load-state readiness and before the main-container scroll; default `0`.
- `--scroll-main-to-y <int>` runs the Round-3 main scroll-container heuristic and sets `main.scrollTop` to the supplied value.
- `--scroll-main-wait-ms <int>` waits after the main-container scroll; default `1000`.

For ChatGPT Deep Research report cards, use the known working Round-3 recipe: `--viewport-width 1500 --viewport-height 1000 --prerender-wait-ms 15000 --scroll-main-to-y 900`.

Element location is retried for late-loading sandbox frames. `--locate-timeout-ms <int>` controls the retry budget; the default is `8000`, with a 500ms retry interval.

Follow-up menu clicks can be located precisely with `--follow-up-selector <css>`, or permissively with `--follow-up-text-regex <regex>`. The regex is case-insensitive and is matched against `innerText + " " + aria-label + " " + href` for `[role="menuitem"], button, a, [role="button"], li` elements across all frames; only candidates whose bounding-box `y` is in `[0,1000]` are accepted. Use the regex form for live menus whose item tag/text varies, e.g. `--follow-up-text-regex '(DOCX|下载\s*DOCX|Word|导出.*Word)'`.

## Mapping to the Round-3 recipe

The primitive ports the successful Round-3 path:

- recursively considers root and descendant frames;
- filters candidate frames by visible text when `--frame-text-filter` is supplied;
- disambiguates repeated export buttons by ancestor text, e.g. `引言与背景`;
- scrolls candidates into view and only keeps viewport boxes with `y` in `[0,1000]`;
- configures `Browser.setDownloadBehavior({ behavior: "allowAndName", eventsEnabled: true })` before clicking;
- subscribes to browser-level `Browser.downloadWillBegin` and `Browser.downloadProgress`;
- clicks with raw `Input.dispatchMouseEvent` `mouseMoved`, `mousePressed`, `mouseReleased` at the element center;
- optionally repeats the same coordinate click for a follow-up menu item located by selector or by `--follow-up-text-regex`, such as `Word` / `下载 DOCX` / `导出为 Word`;
- validates filename and minimum bytes, optionally renames, and records sha256.

## Error codes

- `IFRAME_NOT_FOUND` — no frame matched `--frame-text-filter` after the locate retry budget.
- `ELEMENT_NOT_FOUND` — no element matched the requested selector in matching frames after the locate retry budget.
- `ELEMENT_OUT_OF_VIEWPORT` — matching elements were outside viewport y `[0,1000]` after scroll.
- `ARTIFACT_DOWNLOAD_TIMEOUT` — no browser-level download begin/completion arrived in time.
- `ARTIFACT_VERIFICATION_FAILED` — filename pattern or minimum-byte verification failed.
- `INVALID_ARGS` — required arguments are missing, no existing tab matches `--url` / `--tab-url-contains`, no tab selector was supplied, or unsupported CDP download behavior is unavailable.

For `IFRAME_NOT_FOUND` and `ELEMENT_NOT_FOUND`, error evidence includes:

```json
{
  "pageUrl": "https://chatgpt.com/c/...",
  "frameCount": 7,
  "triedFrames": [
    { "url": "https://...", "hadSelectorMatch": false, "hadFrameTextFilterMatch": true }
  ],
  "scroll": { "ranScroll": true, "candidates": 4, "scrolledTo": 900 }
}
```

`triedFrames` is truncated to the first 20 walked frames. `hadFrameTextFilterMatch` appears when `--frame-text-filter` is supplied. `scroll` appears only when `--scroll-main-to-y` was supplied before the failing locate step.

## Worked example: literature-review DOCX

```bash
node dist/src/cli.js browser:artifact-click \
  --profile chatgpt \
  --url 'https://chatgpt.com/c/<conversation-id>' \
  --button-selector 'button[aria-label="导出"]' \
  --button-ancestor-text '引言与背景' \
  --follow-up-text-regex '(DOCX|下载\s*DOCX|Word|导出.*Word)' \
  --frame-text-filter '引言与背景' \
  --download-dir '/absolute/path/to/run/downloads' \
  --filename-pattern '*.docx' \
  --rename-to 'literature-review.docx' \
  --verify-min-bytes 5000 \
  --timeout-ms 60000 \
  --locate-timeout-ms 8000 \
  --frame-min-count 1 \
  --viewport-width 1500 \
  --viewport-height 1000 \
  --prerender-wait-ms 15000 \
  --scroll-main-to-y 900 \
  --output-json
```

Treat `path`, `frameUrl`, and profile identifiers as sensitive local metadata. `sha256` is a content fingerprint and may be logged when artifact logging is allowed.
