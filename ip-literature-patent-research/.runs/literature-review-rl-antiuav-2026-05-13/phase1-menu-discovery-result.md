# Phase 1 menu discovery result

Ran `scripts/phase1-menu-discovery.py` against CDP `127.0.0.1:9223` after reloading the Deep Research conversation, applying the 1500×1000 viewport and main-scroll-to-900 recipe, then raw-clicking the visible `button[aria-label="导出"]`.

Artifacts:

- Full dump: `phase1-menu-discovery-all.json`
- Filtered candidates: `phase1-menu-discovery-candidates.json`
- Screenshot: `phase1-menu-discovery.png`

Strongest export-to-DOCX candidate discovered:

- Frame index: `7`
- Frame URL: `about:blank`
- Tag: `a`
- Text: `下载 DOCX：强化学习在反无人机系统中的应用-文献综述.docx`
- Aria label: empty
- Href: empty in DOM attribute dump
- BBox: `x=84.6176528930664 y=224.86932373046875 width=369.70892333984375 height=15.246322631835938`
- Selector path: `div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > ul:nth-of-type(1) > li:nth-of-type(1) > a:nth-of-type(1)`

Reason: this is the first visible anchor candidate whose own text directly matches the DOCX download target (`下载 DOCX...文献综述.docx`). The permissive CLI matcher should use `--follow-up-text-regex '(DOCX|下载\s*DOCX|Word|导出.*Word)'` rather than a `div[role="menuitem"]` selector.
