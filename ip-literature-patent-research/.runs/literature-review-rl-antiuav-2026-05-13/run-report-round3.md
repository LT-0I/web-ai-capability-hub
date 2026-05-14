# Round 3 run report — ChatGPT Deep Research native DOCX export

## Result

Success. A fresh DOCX was captured from ChatGPT's native Deep Research export menu using browser-level CDP download capture plus raw mouse events.

- Final fresh export: `round3-chatgpt-dr-export-strong-form.docx`
- Canonical overwritten after validation: `强化学习在反无人机系统中的应用-文献综述.docx`
- Raw CDP download: `round3-raw-downloads/7cb1f897-cd7e-42af-9e21-7bb5430b95e4`
- Named raw copy: `round3-raw-downloads/round3-native-deep-research-export.docx`
- Driver script: `scripts/round3_actual_scroll900_export.py`
- Main CDP/event log: `scripts/round3-actual-scroll900-export-log.json`
- Selector log updated under `selectors-log.json` → `phaseA_round3`

## What worked

Tactic 1 worked:

1. Connected to existing Chrome over CDP at `http://127.0.0.1:9223`.
2. Opened the Deep Research conversation: `https://chatgpt.com/c/6a04a213-5648-83e8-b9d0-6134aef56831`.
3. Set browser-level download behavior:
   - CDP method: `Browser.setDownloadBehavior`
   - behavior: `allowAndName`
   - download path: `round3-raw-downloads/`
   - events: enabled
4. Located the main ChatGPT scroll container and set `scrollTop=900`, which brought the native full Deep Research report iframe into the viewport.
5. Located the target export control:
   - sandbox iframe: `about:blank`
   - selector: `button[aria-label="导出"]`
   - disambiguation: ancestor text contained `强化学习在反无人机系统中的应用` and `引言与背景`
   - viewport bbox at click time: `{x: 1186, y: 176, width: 32, height: 32}`
6. Dispatched raw mouse events through CDP `Input.dispatchMouseEvent` at `(1202, 192)`.
7. The native export menu opened in the iframe. Clicked menu item:
   - text: `导出到 Word`
   - bbox: `{x: 1030, y: 288, width: 184, height: 36}`
   - click point: `(1122, 306)`
8. Browser-level CDP emitted `Browser.downloadWillBegin` for:
   - `blob:https://chatgpt.com/baf414a1-9027-4543-b766-122030d30644`
   - suggested filename: `强化学习在反无人机系统中的应用.docx`
9. `Browser.downloadProgress` reached `state=completed`, with file path:
   - `round3-raw-downloads/7cb1f897-cd7e-42af-9e21-7bb5430b95e4`

## Verification

DOCX parse/content check:

```bash
ip-literature-patent-research/.venv/bin/python3 -c "from docx import Document; d=Document('ip-literature-patent-research/.runs/literature-review-rl-antiuav-2026-05-13/round3-chatgpt-dr-export-strong-form.docx'); print(len(d.paragraphs), sum(len(p.text) for p in d.paragraphs))"
# 171 17798
```

Freshness / not byte-identical to the prior manual download:

```bash
sha256sum \
  ip-literature-patent-research/.runs/literature-review-rl-antiuav-2026-05-13/round3-chatgpt-dr-export-strong-form.docx \
  "$HOME/Downloads/强化学习在反无人机系统中的应用.docx"

# 58b0cb05eeb225c0af890c56f09ae7a6d7bc405aeffe7d7715f787578e1d0882  round3-chatgpt-dr-export-strong-form.docx
# a19cc0436af9b42886852faab3154b80b12b840cedad553da1daa39161385ff8  ~/Downloads/强化学习在反无人机系统中的应用.docx

cmp -s round3-chatgpt-dr-export-strong-form.docx ~/Downloads/强化学习在反无人机系统中的应用.docx
# cmp_exit=1
```

Final validated properties:

- Size: `31,520` bytes
- Paragraphs: `171`
- Text characters: `17,798`
- Valid DOCX: yes
- Substantive threshold met: yes (`>=50` paragraphs and `>=5,000` chars)
- Byte-identical to pre-existing manual file: no
- Canonical deliverable overwritten: yes

## Screenshots

- `round3-screenshots/actual-scroll900-before.png` — full Deep Research report export button visible after scroll container positioning.
- `round3-screenshots/actual-scroll900-after-export.png` — export menu open after raw CDP click.

## Tactics not needed

Tactics 2–5 were not pursued after completion because Tactic 1 satisfied the stop condition: browser-level CDP download event fired, completed, and produced a validated fresh DOCX.
