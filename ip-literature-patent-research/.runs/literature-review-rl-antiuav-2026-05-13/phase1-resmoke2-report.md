# Phase 1 re-smoke 2 — Round-3 viewport+scroll recipe

Date: 2026-05-14
Repository: `/home/l1u/workspace/noeticmind/web-ai-capability-hub`
Run directory: `ip-literature-patent-research/.runs/literature-review-rl-antiuav-2026-05-13/`

## Result

**FAIL** — the live smoke did not produce a DOCX. The command exited non-zero after the follow-up export menu item could not be located and no `Browser.downloadWillBegin` event was observed.

## Pass criteria status

| Criterion | Status | Evidence |
| --- | --- | --- |
| exit 0 | FAIL | `phase1-resmoke2-command.exit` contains `1` |
| DOCX >= 20 KB | FAIL | No DOCX was downloaded in `phase1-resmoke2-downloads/` |
| >= 150 paragraphs | NOT RUN | No DOCX available to inspect |
| >= 15,000 chars | NOT RUN | No DOCX available to inspect |
| sha256 differs from Round-3/manual | NOT RUN | No DOCX available to hash |
| `evidence.scroll.ranScroll: true` | PASS | stderr evidence shows `"ranScroll": true`, `"candidates": 3`, `"scrolledTo": 900` |

## Pre-check

CDP on port 9223 was reachable.

```json
{
   "Browser": "Chrome/148.0.7778.167",
   "Protocol-Version": "1.3",
   "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
   "V8-Version": "14.8.178.21",
   "WebKit-Version": "537.36 (@65db666ac2cf205fcc36db8bb5b9cd87f94808ac)",
   "webSocketDebuggerUrl": "ws://127.0.0.1:9223/devtools/browser/579a76ec-5354-490f-8be2-b4619d37c50a"
}
```

The DR conversation tab was already open. Two matching page targets were present:

```json
{
  "id": "0EFE0CAD6E3F578A634CE5C802A24C00",
  "type": "page",
  "title": "强化学习在反无人机应用",
  "url": "https://chatgpt.com/c/6a04a213-5648-83e8-b9d0-6134aef56831"
}
{
  "id": "FFBA2546FFD9E69E3767D7C8B96C17EF",
  "type": "page",
  "title": "强化学习在反无人机应用",
  "url": "https://chatgpt.com/c/6a04a213-5648-83e8-b9d0-6134aef56831"
}
```

## Command

```bash
node dist/src/cli.js browser:artifact-click \
  --profile chatgpt \
  --url https://chatgpt.com/c/6a04a213-5648-83e8-b9d0-6134aef56831 \
  --button-selector 'button[aria-label="导出"]' \
  --follow-up-selector 'div[role="menuitem"]:has-text("导出到 Word")' \
  --download-dir /home/l1u/workspace/noeticmind/web-ai-capability-hub/ip-literature-patent-research/.runs/literature-review-rl-antiuav-2026-05-13/phase1-resmoke2-downloads \
  --rename-to phase1-resmoke2-export.docx \
  --filename-pattern '*.docx' \
  --verify-min-bytes 20000 \
  --viewport-width 1500 \
  --viewport-height 1000 \
  --prerender-wait-ms 15000 \
  --scroll-main-to-y 900 \
  --scroll-main-wait-ms 1000 \
  --locate-timeout-ms 12000 \
  --timeout-ms 60000 \
  --output-json
```

Artifacts captured:

- `phase1-resmoke2-command.stdout` — 0 bytes
- `phase1-resmoke2-command.stderr` — full stderr/error evidence
- `phase1-resmoke2-command.exit` — command exit status
- `phase1-resmoke2-downloads/` — empty download directory

## stdout

No stdout was emitted.

## stderr / error evidence

```text
{
  "ok": false,
  "errorCode": "ELEMENT_NOT_FOUND",
  "error": "No element matched --follow-up-selector",
  "evidence": {
    "scroll": {
      "ranScroll": true,
      "candidates": 3,
      "scrolledTo": 900
    },
    "selector": "div[role=\"menuitem\"]:has-text(\"导出到 Word\")",
    "pageUrl": "https://chatgpt.com/c/6a04a213-5648-83e8-b9d0-6134aef56831",
    "frameCount": 10,
    "triedFrames": [
      {
        "url": "https://chatgpt.com/c/6a04a213-5648-83e8-b9d0-6134aef56831",
        "hadSelectorMatch": false
      },
      {
        "url": "about:blank",
        "hadSelectorMatch": false
      },
      {
        "url": "",
        "hadSelectorMatch": false
      },
      {
        "url": "",
        "hadSelectorMatch": false
      },
      {
        "url": "",
        "hadSelectorMatch": false
      },
      {
        "url": "",
        "hadSelectorMatch": false
      },
      {
        "url": "https://connector_openai_deep_research.web-sandbox.oaiusercontent.com/?app=chatgpt&locale=zh-CN&deviceType=desktop",
        "hadSelectorMatch": false
      },
      {
        "url": "about:blank",
        "hadSelectorMatch": false
      },
      {
        "url": "https://connector_openai_deep_research.web-sandbox.oaiusercontent.com/?app=chatgpt&locale=zh-CN&deviceType=desktop",
        "hadSelectorMatch": false
      },
      {
        "url": "about:blank",
        "hadSelectorMatch": false
      }
    ]
  }
}
/home/l1u/workspace/noeticmind/web-ai-capability-hub/dist/src/browser/artifactClick.js:182
        throw new ArtifactClickError("ARTIFACT_DOWNLOAD_TIMEOUT", "No Browser.downloadWillBegin event was observed", { timeoutMs });
              ^

ArtifactClickError: No Browser.downloadWillBegin event was observed
    at pollDownload (/home/l1u/workspace/noeticmind/web-ai-capability-hub/dist/src/browser/artifactClick.js:182:15) {
  errorCode: 'ARTIFACT_DOWNLOAD_TIMEOUT',
  evidence: { timeoutMs: 60000 }
}

Node.js v24.14.0
```

## Download verification

`phase1-resmoke2-downloads/` is empty. Because no DOCX was downloaded, paragraph count, character count, and SHA-256 comparison against prior hashes (`58b0cb05...`, `a19cc043...`) could not be performed.

## Notes

No code edits were made. No commits were made. This report is intentionally stored in the requested run directory, not the repository root.
