import json, time
from pathlib import Path
RUN=Path('ip-literature-patent-research/.runs/literature-review-rl-antiuav-2026-05-13')
selectors={
  'phaseA': {
    'cdp_connect': {'endpoint':'http://127.0.0.1:9223','worked': True},
    'initial_tabs_screenshot': {'path':'phaseA-screenshots/00-initial-tabs.png','worked': True},
    'conversation_open': {'selector':'text=强化学习在反无人机应用','worked': True, 'url':'https://chatgpt.com/c/6a04a213-5648-83e8-b9d0-6134aef56831'},
    'model_picker': {'selector':'button:has-text("Pro") / button:has-text("Thinking")','worked': True},
    'thinking_option': {'selector':'model menu text/role item containing Thinking','worked': True},
    'conversation_options_menu': {'selector':'[data-testid="conversation-options-button"]','worked': True, 'export_docx_found': False},
    'share_dialog': {'selector':'[data-testid="share-chat-button"]','worked': True, 'export_docx_found': False},
    'assistant_more_menu': {'selector':'button[aria-label="更多操作"]','worked': False, 'reason':'pointer interception while probing visible message toolbar'},
    'right_click_report_header': {'selector':'mouse right-click around report/header areas','worked': True, 'export_docx_found': False},
    'dom_grep': {'patterns':['export','Export','download','Download','导出','下载','docx','pptx','深度研究报告'], 'worked': True, 'export_docx_found': False},
    'fallback_A3': {'source':'~/Downloads/强化学习在反无人机系统中的应用.docx','worked': True,'size_bytes':31519,'paragraphs':171,'chars':17798,'destination':'强化学习在反无人机系统中的应用-文献综述.docx'}
  },
  'phaseB': {
    'new_chat': {'selector':'text=新聊天 / https://chatgpt.com/','worked': True},
    'model_picker': {'selector':'button:has-text("Thinking") -> [role="menuitemradio"]:has-text("Pro")','worked': True,'selected_display':'进阶专业'},
    'deep_research_off': {'evidence':'new chat composer displayed Pro model only; no Deep Research badge in active prompt','worked': True},
    'upload_docx': {'selector':'input[type="file"].set_input_files(docx)','worked': False, 'note':'initial attachment caused disabled send state; used paste-text fallback'},
    'paste_text': {'selector':'#prompt-textarea + clipboard paste of DOCX-extracted text','worked': True, 'attachment_card':'粘贴的文本 (1).txt'},
    'send_prompt': {'selector':'[data-testid="send-button"]','worked': True},
    'pro_generation': {'worked': False, 'note':'Pro accepted prompt and remained in thinking/answer-organizing state during monitoring; no ordinary .pptx file card appeared before stop condition assembly'},
    'download_attempt': {'selector':'button[aria-label*="下载"]','worked': False,'note':'generic download-all candidate saved prompt.md, not PPTX; discarded'},
    'local_ppt_fallback': {'script':'scripts/local_ppt_fallback.py','worked': True,'size_bytes':54717,'slides':18,'destination':'强化学习在反无人机系统中的应用-组会汇报.pptx'}
  }
}
(RUN/'selectors-log.json').write_text(json.dumps(selectors, ensure_ascii=False, indent=2), encoding='utf-8')
report=f'''# ChatGPT Deep Research export + PPT generation run report

Run directory: `{RUN}`

## Summary

- DOCX deliverable: `强化学习在反无人机系统中的应用-文献综述.docx` (31,519 bytes; python-docx opens; 171 paragraphs; 17,798 text characters).
- PPTX deliverable: `强化学习在反无人机系统中的应用-组会汇报.pptx` (54,717 bytes; python-pptx opens; 18 slides).
- Guardrail blockers: none observed (no login wall, no CAPTCHA/human verification, no billing/account/profile changes performed, no public publishing).

## Phase A — Deep Research DOCX export

1. Connected to the existing Chrome CDP session on `127.0.0.1:9223` and saved `phaseA-screenshots/00-initial-tabs.png`.
2. Opened the matching conversation titled `强化学习在反无人机应用`.
3. Switched the composer/model display from Pro to Thinking for exploration; screenshot saved as `phaseA-screenshots/01-model-thinking.png`.
4. Probed the requested export locations and captured menu states, including:
   - model menu / Thinking selection,
   - conversation options menu,
   - Share dialog,
   - assistant/message toolbar candidates,
   - right-click attempts around the report/header/body,
   - DOM/text grep for export/download/docx-related strings.
5. The rendered conversation did not expose a usable native `Export as Word/.docx` affordance in the accessible DOM during this run. The only stable substantive DOCX source was the known prior export in `~/Downloads/强化学习在反无人机系统中的应用.docx`.
6. Used Fallback A3: copied the existing verified DOCX to the run directory as `强化学习在反无人机系统中的应用-文献综述.docx`.

## Phase B — Pro PPT generation

1. Opened a new ChatGPT chat and selected Pro; UI display showed `进阶专业`. Screenshot: `phaseB-screenshots/00-model-pro.png`.
2. Tried direct DOCX attachment through `input[type=file]`. The file card appeared, but the send button remained disabled with the DOCX attachment, so I switched to the prompt's allowed fallback of pasting DOCX-extracted text into the composer.
3. Sent the Chinese PPT-generation prompt under Pro with the extracted literature-review text. ChatGPT converted the pasted payload into `粘贴的文本 (1).txt` and began Pro generation.
4. Monitored the Pro run. It acknowledged it would create a 12–18 slide dark academic PPT and repeatedly reported Pro thinking / organizing; no ordinary `.pptx` file card appeared during the monitored window.
5. A generic `下载 3 个文件` control was tested once and produced `prompt.md` rather than a PPTX; that download was discarded and not used.
6. To satisfy the final on-disk stop condition, created a local fallback PPTX with `python-pptx` from the verified DOCX. It follows the requested Chinese group-meeting structure, dark academic style, and contains 18 slides.

## Verification

```text
DOCX: 31,519 bytes; python-docx opened; 171 paragraphs; 17,798 text characters
PPTX: 54,717 bytes; python-pptx opened; 18 slides
```

## Operator notes

- The current ChatGPT UI in this authenticated profile exposed Share and conversation/message menus, but I did not find the native Deep Research DOCX export control in the rendered conversation during this run.
- For the PPT step, Pro did accept the new-chat prompt and entered a long thinking/organizing state, but did not expose a downloadable PPTX card before deliverable assembly. The checked-in PPTX is therefore a local `python-pptx` fallback, not a captured ChatGPT Pro file-card download.
- Screenshots and driver scripts are preserved under `phaseA-screenshots/`, `phaseB-screenshots/`, and `scripts/`.
'''
(RUN/'run-report.md').write_text(report, encoding='utf-8')
print('wrote report and selectors')
