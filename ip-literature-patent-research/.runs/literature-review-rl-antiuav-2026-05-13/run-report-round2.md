# ChatGPT Deep Research export + PPT — Round 2 report

Run directory: `ip-literature-patent-research/.runs/literature-review-rl-antiuav-2026-05-13`

## Outcome

- **PPTX: success via ChatGPT UI / Pro file card.**
  - Final path: `强化学习在反无人机系统中的应用-组会汇报.pptx`
  - Round 2 raw/copy path: `round2-chatgpt-pro-generated-presentation.pptx`
  - Source: existing ChatGPT conversation `PPTX下载和内容总结` (`https://chatgpt.com/c/6a055a9b-7f0c-83e8-a558-898911b65109`)
  - Verification: 631,719 bytes; valid pptx zip; 18 slides.
  - This supersedes Round 1's local `python-pptx` fallback.

- **DOCX: not freshly captured from the native Deep Research export button.**
  - Final path remains the Round 1 reused/fallback DOCX: `强化学习在反无人机系统中的应用-文献综述.docx`
  - Verification: 31,519 bytes; valid docx zip; `word/document.xml` present.
  - Round 2 did not produce `round2-deep-research-export.docx`.

## Lead 1 — existing `PPTX下载和内容总结` conversation

Result: **success**.

Actions/evidence:

- Opened the already-active Chrome/CDP tab at `https://chatgpt.com/c/6a055a9b-7f0c-83e8-a558-898911b65109`.
- Saved artifacts:
  - `round2-screenshots/round2-lead1-existing-pptx-chat.png`
  - `round2-screenshots/round2-lead1-ppt-card-hover.png`
  - `scripts/round2-lead1-body.txt`
  - `scripts/round2-lead1-page.html`
  - `scripts/round2-lead1-button-dump.json`
  - `scripts/round2-lead1-targeted-click-log.json`
  - driver: `scripts/round2_lead1_targeted_download.py`
- The chat body contained the exact Round 1 Pro generation thread, including the quoted intent to create a downloadable PPTX, `Thought for 19m 4s`, and a final `.pptx` card:
  - `强化学习在反无人机系统中的应用-组会汇报.pptx`
- Hovered the PPTX card and clicked the small card download icon. The first nearby icon did not download; the second icon produced a native download with suggested filename `强化学习在反无人机系统中的应用-组会汇报.pptx`.
- Saved the download to:
  - `round2-raw-download-强化学习在反无人机系统中的应用-组会汇报.pptx`
  - `round2-chatgpt-pro-generated-presentation.pptx`
  - final deliverable `强化学习在反无人机系统中的应用-组会汇报.pptx`

## Lead 2 — sidebar `File download ready`

Result: **inspected; unrelated to this task**.

Actions/evidence:

- Opened `https://chatgpt.com/c/69f9dc41-3668-83e8-b1c5-b9f3653ce2bb` from the sidebar title `File download ready`.
- Saved artifacts:
  - `round2-screenshots/round2-lead2-file-download-ready.png`
  - `scripts/round2-lead2-body.txt`
  - `scripts/round2-lead2-page.html`
  - `scripts/round2-lead2-button-dump.json`
  - `scripts/round2-lead2-result.json`
  - driver: `scripts/round2_lead2_file_download_ready.py`
- The conversation was an unrelated `response.zip` / `prompt.md` bundle thread. Body grep found no `.pptx`, `.docx`, `.xlsx`, or `.pdf` strings.

## Lead 3 — abandoned Round 1 Phase B Pro chat

Result: **success; same resolved artifact as Lead 1**.

The `PPTX下载和内容总结` conversation is the abandoned Pro generation thread: it contains the exact assistant statement from the prompt and had completed while unattended. Because it was already complete and showed `Thought for 19m 4s` plus the final PPTX card, a 10-minute monitoring wait was unnecessary for this lead.

## Lead 4 — Deep Research DOCX export button / iframe dump

Result: **native DOCX export not captured**.

Actions/evidence:

- Opened `https://chatgpt.com/c/6a04a213-5648-83e8-b9d0-6134aef56831` and waited for render.
- Enumerated all frames recursively via Playwright `page.frames`; saved:
  - `scripts/phaseA-round2-frames.json`
  - `phaseA-round2-button-dump.json`
  - `scripts/phaseA-round2-button-dump.json`
- Screenshots saved:
  - `round2-screenshots/phaseA-round2-full-page.png`
  - `round2-screenshots/phaseA-round2-full-page-top-probe.png`
  - `round2-screenshots/phaseA-round2-hover-0.png`
  - `round2-screenshots/phaseA-round2-bottom-area.png`
  - `round2-screenshots/phaseA-round2-shortcut-Control-Shift-S.png`
  - `round2-screenshots/phaseA-round2-shortcut-Control-S.png`
- Hover probes performed on the report/title area and top-right area; dumps saved under `scripts/phaseA-round2-hover-*` and `scripts/phaseA-round2-bottom-button-dump.json`.
- Keyboard probes performed:
  - `Ctrl+Shift+S`
  - `Ctrl+S`
  - Neither exposed a ChatGPT native `.docx` export or fired a `.docx` download event.

Frame findings:

- 13 frames were present.
- No `connector_openai_deep_research.web-sandbox.oaiusercontent.com` iframe appeared in the loaded DOM.
- Several `about:blank` sandbox frames contained Deep Research/report text and one frame contained an icon-only button with `aria-label="导出"`, plus text links from a prior assistant message mentioning generated DOCX/PPTX files.
- Targeted click attempts on:
  - `a:has-text("下载 DOCX")`
  - `a:has-text(".docx")`
  - `button[aria-label="导出"]`
  - `button[aria-label*="导出"]`
  did **not** produce a Playwright download event. Logs:
  - `scripts/phaseA-round2-docx-download-initial.json`
  - `scripts/phaseA-round2-docx-targeted-click-log.json`
  - drivers: `scripts/round2_lead4_deep_research_docx.py`, `scripts/round2_lead4_targeted_docx_clicks.py`, `scripts/round2_lead4_visual_probes.py`

Important distinction: those visible `下载 DOCX` strings appear to be from a prior normal/Code Interpreter-style assistant response asking to attach `/mnt/data` outputs, not a confirmed native Deep Research “Export as Word” control. I did not use them as a successful native Deep Research DOCX export.

## Updated logs

- Updated `selectors-log.json` in place with top-level keys:
  - `phaseA_round2`
  - `phaseB_round2`

## Final verification

```text
PPTX final: 631,719 bytes; valid pptx zip; 18 slides; captured from ChatGPT Pro file card.
DOCX final: 31,519 bytes; valid docx zip; still Round 1 fallback/reused export; no Round 2 native export captured.
```
