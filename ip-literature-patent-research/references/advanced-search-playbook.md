---
title: Paid Chinese Literature and Patent Advanced Search Playbook
last_verified: 2026-05-04
evidence_dirs:
  - C:\Users\13080\Desktop\HBA\hba-agent-skills\.tmp\advanced_search_routes_probe_20260504
  - C:\Users\13080\Desktop\HBA\hba-agent-skills\.tmp\advanced_search_controls_20260504
  - C:\Users\13080\Desktop\HBA\hba-agent-skills\.tmp\paid_stem_first_batch_cn_patent_investigation_v5_redacted
---

# Advanced Search Playbook

Use this reference when the task requires a deeper literature review, novelty search, or technology landscape rather than a single keyword run. Prefer each site's own advanced search, refinement, sorting, citation, export, and analysis controls.

## Cross-Site Strategy

1. Start broad with title/keyword/abstract or subject fields, using Chinese terms plus English equivalents when the site supports expansion.
2. Run a precision pass with title-only or title/keyword-only fields and explicit Boolean logic.
3. Run a recall pass using subject/full-text/abstract fields plus synonym or Chinese-English expansion.
4. Use result-page refinement instead of rewriting the query when narrowing by year, resource type, source, institution, author, IPC, legal status, or full-text availability.
5. Save per-site evidence before merging: query expression, advanced fields, filters, sort order, total result count, representative records, export file path, and screenshot path.
6. For novelty checks, keep patents, standards, theses, conference papers, and journal papers separate until the final synthesis; merge only after labeling every row with `source_site_id`.

## CNKI

Verified advanced URL: `https://kns.cnki.net/kns8s/AdvSearch`.

Use CNKI for Chinese literature breadth plus cross-type resource discovery.

Advanced fields:

- `主题`, `篇关摘`, `关键词`, `篇名`, `全文`
- `作者`, `第一作者`, `通讯作者`, `作者单位`
- `基金`, `摘要`, `小标题`, `参考文献`
- `分类号`, `文献来源`, `DOI`

Resource scopes:

- `总库`, `中文`, `外文`
- `学术期刊`, `学位论文`, `会议`, `报纸`, `年鉴`, `图书`
- `专利`, `标准`, `法律法规`

Built-in refinement:

- Result categories: Chinese/foreign, journal, thesis, conference, patent, standard, book, newspaper.
- Facets: main topic, secondary topic, discipline, year, research level, document type, source, author, institution, fund, OA.
- Sorts: relevance, publication time, citation count, download count, comprehensive.

Best use:

- Broad review: `主题=(core concept AND application object)` with Chinese-English and synonym expansion enabled.
- Precision review: `篇名` or `关键词` rows with `AND` and exact mode.
- Source tracing: filter by `文献来源`, `作者`, `机构`, or `基金`, then sort by cited/downloaded for high-impact records.
- Evidence export: use `导出与分析` or `导出文献` for citation metadata; do not bulk download full text.

## Wanfang

Verified advanced URL: `https://s.wanfangdata.com.cn/advanced-search/paper`.

Use Wanfang for literature, patents, standards, reports, achievements, and novelty-search style exports.

Advanced fields:

- General: `主题`, `题名或关键词`, `题名`, `作者`, `作者单位`, `关键词`, `摘要`, `中图分类号`, `DOI`, `第一作者`
- Journal-specific: `期刊-通讯作者`, `期刊-基金`, `期刊-刊名`, `期刊-ISSN/CN`, `期刊-期`, `期刊-栏目`
- Thesis/conference: `学位-专业`, `学位-学位授予单位`, `学位-导师`, `学位-学位`, `会议名称`, `会议-主办单位`

Resource scopes:

- `全部`, `期刊论文`, `学位论文`, `会议论文`, `专利`, `中外标准`, `科技成果`, `法律法规`, `科技报告`, `地方志`

Built-in refinement:

- Access facets: institution-purchased, core-only, full text, open access.
- Facets: resource type, year, language, source database, author, institution.
- Sorts: relevance, publication time, cited frequency.
- Result operations: result-in-search, batch citation, batch download, online reading, download, citation, collection, review material.

Best use:

- Novelty review: include `专利`, `中外标准`, `科技报告`, and `科技成果` in addition to papers.
- Precision pass: `题名或关键词` AND `摘要` rows, then filter by `有全文` or core journal only when needed.
- Formal report support: use `查新格式导出` or custom-field export when available.

## VIP / CQVIP

Verified advanced URL: `https://www.cqvip.com/advancesearch`.

Use VIP for Chinese journal coverage, fast result filtering, citation/export support, and pre-novelty-search workflows.

Login path:

- Open home page.
- Click upper-right `登录`.
- Click `IP登录`.
- Click the IP icon in the login panel.

Advanced fields:

- Literature: `任意字段`, `主题词`, `篇关摘`, `篇名`, `关键词`, `摘要`, `作者`, `第一作者`, `作者单位`, `刊名`, `中图分类号`, `学科分类号`, `DOI`, `基金`
- Patent fields exposed in the same front-end field map: `申请（专利权）人`, `发明人`, `申请号`, `公开（公告）号`, `国际分类号(IPC)`
- Standard fields exposed in the same front-end field map: `标准名称`, `标准号`, `文摘`, `国际标准分类号(ICS)`

Resource scopes:

- `期刊论文`, `学位论文`, `会议论文`, `专利`, `标准`

Built-in refinement:

- Language/resource counts: all, Chinese, foreign, journal, thesis, conference, patent, standard, newspaper.
- Secondary search: search within results or remove from results.
- Facets: full text, OA, year, discipline, core index, topic, journal, author, author institution.
- Core index facets include `北大核心`, `CSCD`, `CA`, `卓越期刊`, and `EI` when present.
- Sorts: relevance, timeliness, citation count.
- Result operations: batch download, batch citation, smart reading, free/PDF download, citation, search history.

Best use:

- First pass: `主题词` AND `作者/作者单位` only when known; otherwise use `任意字段` plus expansion.
- Tight pass: title/keyword/abstract fields with exact mode.
- Novelty pre-check: use `检索历史` to combine query sets, then inspect highly cited and recent records separately.

## IncoPat

Verified authenticated result evidence: `paid_stem_first_batch_cn_patent_investigation_v5_redacted`.

Current route set observed from authenticated evidence:

- Simple search: `/advancedSearch/simpleInit`
- Advanced search: `/advancedSearch/init`
- Batch search: `/batchSearch/init`
- Citation search: `/citeSearch/init`
- Legal search: `/lawSearch/init`
- AI search: `/intelligentSearch/init`
- Semantic search: `/semanticSearch/init`
- Extended search: `/expandSearch/init`
- Graph search: `/graphSearch/init`

Login path:

- If not already IP-authenticated, open `登录`, choose `IP登录`, or use the `input#ipLoginBtn` button on `newLogin`.
- If the browser lands on the public marketing home instead of the patent UI, treat this as a manual checkpoint and have the user refresh IP access.

Search and analysis controls:

- Simple input: `input#searchValue`, supporting company, inventor/designer, keywords, classification number, and patent number.
- Default range options: bibliographic data, bibliographic data plus description, description included, and other-country description included.
- Search modes: simple, advanced, batch, citation, legal, AI, semantic, extended, graph.
- Result filters: all patents, country/area, document type, legal status, legal event, applicant, applicant country/area, inventor, technical effect phrase, IPC, technical effect, China province, application date, publication date, examiner, agency, document type code.
- Sorts: relevance, publication date, application date, backward citation times, cited times, family backward citation, family forward citation, applicant, number of claims, application number, legal instrument date, publication number, simple family ID, extended family ID.
- Merge modes: not merged, simple family merger, extended family merger, application-number merger, dual-application merger.
- Tools: display fields, topic words, highlight, alternatives, IncoFolder, incoNavigation, analysis, IPC Tool, IPC Inquiry.

Best use:

- Recall pass: simple search over ALL, with Chinese and English technology terms.
- Precision pass: advanced search by `IPC`, `Applicant`, `Inventor`, `Application Date`, and `Publication Date`.
- Novelty pass: merge by family, sort by publication date and citation metrics, inspect legal status and closest families.
- Citation pass: use citation search and family citation metrics to identify blocking prior art.
- Legal/FTO pass: use legal search/status filters only after candidate families are identified.
