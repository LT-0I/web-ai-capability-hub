# Paid STEM Resource Operations

This reference tells Codex how to run literature review and technology novelty work through licensed IP access. It assumes a visible browser, normal IP recognition or authorized institutional login, and each site's built-in search/export tools.

## Automation Contract

1. Start with `full_research_workflow.py run` for a multi-site job or a `scripts/site_adapters/*_search.py` wrapper for one site.
2. Keep the browser headed for paid resources. Use `--headless` only for public smoke checks.
3. Prefer a self-launched real Chrome/Edge CDP browser on an unused port: `--launch-cdp --cdp-port 9333`. Do not use port `9222` when another workflow owns it.
4. Use a stable `--profile-dir` for that CDP browser. If a database needs human institutional login, complete it once in the visible browser; future runs reuse that session.
5. Let the runner attempt visible IP or institutional access first. If the page shows CAPTCHA, abnormal download, IP blacklist, access denied, or account lock, stop that site and keep the blocker evidence.
6. Search through the site's own quick, advanced, topic, metadata, standard, or patent search surface. Do not construct bulk download flows.
7. Save local evidence for every site: evidence JSON, screenshot, HTML, visible text, result count, candidate links, export links, query, timestamp, status, and source URL.
8. Merge with `full_research_workflow.py merge` or let `full_research_workflow.py run` merge automatically. The merged outputs are:
   - `merged/merged_records.jsonl`
   - `merged/merged_records.csv`
   - `merged/source_index.json`
   - `merged/evidence_matrix.md`
   - `merged/literature_novelty_draft.md`

## Multi-Site Commands

```powershell
python .\hba-agent-skills\skills\ip-literature-patent-research\scripts\full_research_workflow.py list-sites --mode combined

python .\hba-agent-skills\skills\ip-literature-patent-research\scripts\full_research_workflow.py run `
  --mode combined `
  --query "turbine blade thermal barrier coating fatigue review patent" `
  --out-dir .\hba-agent-skills\.tmp\full_paid_stem_run `
  --profile-dir .\hba-agent-skills\.tmp\ip-literature-browser-profile `
  --launch-cdp `
  --cdp-port 9333 `
  --manual-wait-seconds 20
```

To restrict scope:

```powershell
python .\hba-agent-skills\skills\ip-literature-patent-research\scripts\full_research_workflow.py run `
  --mode literature `
  --sites "web-of-science;scopus;ei-village;ieee-xplore;acm-dl;science-direct;springer-link;wiley" `
  --query "additive manufacturing fatigue defect detection review" `
  --out-dir .\hba-agent-skills\.tmp\literature_run `
  --launch-cdp `
  --cdp-port 9333
```

## Per-Site Wrappers

Each wrapper opens one paid resource in a visible browser, searches with the local adapter profile, and writes local evidence under `.tmp/paid_resource_site_runs/<site-id>/`.

```powershell
python .\hba-agent-skills\skills\ip-literature-patent-research\scripts\site_adapters\springer_link_search.py --query "thermal barrier coating fatigue review" --launch-cdp --cdp-port 9333
python .\hba-agent-skills\skills\ip-literature-patent-research\scripts\site_adapters\incopat_search.py --query "thermal barrier coating turbine blade" --launch-cdp --cdp-port 9333
python .\hba-agent-skills\skills\ip-literature-patent-research\scripts\site_adapters\web_of_science_search.py --query "TS=(thermal barrier coating AND fatigue)" --launch-cdp --cdp-port 9333
```

## Source-Specific Search Pattern

For the verified CNKI, Wanfang, VIP/CQVIP, and IncoPat advanced-search fields, filters, sort orders, and novelty-search recipes, use `advanced-search-playbook.md` before running a plain keyword search.

| Resource | Built-In Tools To Use | Information To Save |
|---|---|---|
| IncoPat | Smart search, advanced search, patent family grouping, legal status, assignee, inventor, IPC/CPC, priority date, patent analysis charts, official export. | Search expression, country scope, family rule, result count, representative closest patents, assignees, IPC/CPC, priority date, claims/abstract overlap, export link/path. |
| CNKI | Advanced search with subject/title/keyword/abstract fields, source category, discipline, year, language, citation/export tools. | Query fields, filters, result count, source category, candidate title/authors/source/year, DOI or local identifier, export/citation path. |
| Wanfang | Advanced search, journal/thesis/conference/patent scopes, discipline/year/source filters, citation export. | Query, database scope, filters, candidate metadata, result count, export/citation path. |
| VIP/CQVIP | Journal article search, title/keyword/abstract fields, journal/year/discipline filters, citation/export tools. | Query fields, journal/year filters, candidate title/authors/source/year, result count, export path. |
| Web of Science | Topic search, advanced field tags, timespan, document type, research area, citation report, cited reference search, full-record export with cited references when licensed. | Database collection, exact query, timespan, filters, result count, top cited/review candidates, DOI, cited references export path. |
| Scopus | Document search, `TITLE-ABS-KEY`, subject area, document type, year, source title, cited-by sorting, export citation/abstract/keywords/affiliation. | Query string, filters, result count, candidate metadata, cited-by counts, DOI, export path. |
| Ei Village / Engineering Village | Quick/Expert search, Compendex database selection, controlled terms, treatment type, document type, year, export. | Exact query, database selection, controlled terms, treatment/document filters, result count, export path. |
| Inspec | Engineering Village or licensed Inspec interface, controlled indexing terms, classification, year/document filters. | Controlled terms, query, filters, result count, candidate DOI/source/year, export path. |
| IEEE Xplore / IEL | All Metadata search, Advanced Search with Abstract/Index Terms, content type filters for journals/conferences/standards/books, citation export. | Query, content type, year, index terms, result count, DOI/document number, export path. |
| ACM Digital Library | AllField search, advanced title/abstract fields, ACM CCS concepts, venue/publication filters, BibTeX/RIS export. | Query, CCS/venue filters, result count, DOI, venue, year, export path. |
| ScienceDirect | Search within title/abstract/keywords when available, article type, journal/book, year, access-type filters, citation export. | Query, filters, result count, DOI, source title, export/citation path. |
| SpringerLink | Search results, content type, discipline, subdiscipline, date filters, CSV export when available. | Query, filters, result count, candidate links, CSV/export link, DOI/source/year. |
| Wiley Online Library | Advanced search or AllField search, publication type, journal/book, date filters, citation export. | Query, filters, result count, DOI/source/year, export path. |
| Taylor & Francis Online | AllField/advanced search, subject, content type, date, access filters, citation export. | Query, filters, result count, DOI/source/year, export path. |
| AIAA ARC | AllField search, aerospace journals/conferences/standards/books filters, citation export. | Query, content type, meeting/source, year, DOI/document number, export path. |
| ASME Digital Collection | Search results, journals/conferences/books filters, topic and year refinements, citation export. | Query, filters, DOI, conference/journal, year, result count, export path. |
| ASCE Library | AllField search, journals/proceedings/books filters, civil engineering topic filters, citation export. | Query, filters, DOI/source/year, result count, export path. |
| ASTM Compass | Standards search by keyword, standard number, committee, active/historical status, year. | Standard number, title, active/historical status, committee, year, scope, evidence screenshot/export. |
| SAE Mobilus | Technical paper/standard search, content type, mobility sector, year, committee/source filters. | Document number, title, content type, year, committee/source, result count, export path. |
| SPIE Digital Library | Search term, proceedings/journals filter, event/year/topic filters, citation export. | Query, event/source/year, DOI, result count, export path. |
| IET Digital Library | AllField search, journals/books/conferences filters, engineering subject filters, citation export. | Query, filters, DOI/source/year, result count, export path. |
| ACS Publications | AllField search, journal/date/article type filters, citation export. | Query, journal/year/type filters, DOI, source, export path. |
| RSC | Search text, journal/book filters, chemistry/materials topic filters, citation export. | Query, filters, DOI, source/year, export path. |
| IOPscience | Search term, journal/year/article type filters, citation export. | Query, filters, DOI/source/year, export path. |
| AIP Publishing | Search results, journal/year/article filters, citation export. | Query, filters, DOI/source/year, export path. |
| APS Journals | Search query, journal/date filters, citation export. | Query, journal/year filters, DOI, result count, export path. |
| Nature Portfolio | Search query, article type, journal, year filters, citation export. | Query, filters, DOI/source/year, export path. |
| Science Online | AllField search, journal/year/article type filters, citation export. | Query, filters, DOI/source/year, export path. |

## Verified First Batch Profiles

Live smoke query used for this batch: `涡轮叶片 热障涂层`. Output set:

`C:\Users\13080\Desktop\HBA\hba-agent-skills\.tmp\paid_stem_first_batch_cn_patent_investigation_v5_redacted\`

Generated evidence is privacy-redacted before local storage; institution markers are stored as `[REDACTED_INSTITUTION]`.

| Resource | Login Path Observed | Search / Filter Path To Use | Extraction Path |
|---|---|---|---|
| CNKI | IP recognition was already active; no manual login click was needed. | Home search textarea to CNKI result list. Use resource/category entries such as 学术期刊、会议、标准, author/source navigation, subject grouping, year/topic filters, and the page's 导出与分析、导出文献、BibTeX tools. Stop on IP blacklist or abnormal-download warnings. | Result links under `kns.cnki.net/kcms*`; save candidate title/href, result count, export/citation links, HTML/text/screenshot evidence. |
| Wanfang | IP recognition was already active; no manual login click was needed. | Home search to Wanfang result page. Use resource scopes 期刊、学位、会议、专利、科技报告、成果、标准、法规; then apply 获取范围、只看核心、有全文、资源类型、年份、语种、作者/机构, 结果中检索, sorting by 相关度/出版时间/被引频次, and 批量引用/批量下载 only within license limits. | The result page is SPA-rendered; extract `title-id-hidden` IDs such as `periodical_*` and map them to `https://d.wanfangdata.com.cn/<type>/<id>`. |
| VIP/CQVIP | Click upper-right 登录, click IP登录, then click the IP icon in the login panel. The runner records these as `site_specific_ip_login` steps. | After IP login, jump directly to `/search?k=<query>`. Use document-type filters 期刊论文、学位论文、会议论文、专利、标准; field selector 任意字段; advanced search; discipline filters; and index filters such as 北大核心、CSCD、CA、卓越期刊、EI. | Result links use `/doc/...`; save title, signed document URL, result count, and available filter candidates. |
| IncoPat | If already IP-authenticated, the login menu is absent and the site lands on Simple Search. Otherwise, hover/click upper-right 登录 and choose IP登录 from the dropdown. | Use Simple Search input `input#searchValue` or advanced search. Use country filters, application/publication date filters, document-type filters, sort by relevance/similarity, patent family, citation, legal status, and export fields such as title/abstract/applicant/publication/application data. | Group `openDetailedInfo(publication, rank)` links into `publication number - title` records; keep legal-status/family links as filters, not candidate rows. |

The same run produced source-labeled merged outputs:

- `merged/merged_records.jsonl`
- `merged/merged_records.csv`
- `merged/source_index.json`
- `merged/evidence_matrix.md`
- `merged/literature_novelty_draft.md`

## Merging Rule

The workflow never merges records without source labels. Every row in `merged_records.jsonl` and `merged_records.csv` must include:

- `source_site_id`
- `source_site_name`
- `source_type`
- `source_status`
- `query`
- `result_count`
- `record_kind`
- `record_title`
- `record_url`
- `evidence_path`
- screenshot/text artifact paths when available

Blocked sites are still useful evidence. If IncoPat, CNKI, or another paid resource blocks automation, the merged output records a `site_status` row instead of silently dropping the source.

## DOM Update Entry

When a site changes:

```powershell
python .\hba-agent-skills\skills\ip-literature-patent-research\scripts\browser_research_runner.py dom-snapshot `
  --site ieee-xplore `
  --query "graph neural network defect detection" `
  --out-dir .\hba-agent-skills\.tmp\dom_refresh `
  --profile-dir .\hba-agent-skills\.tmp\ip-literature-browser-profile `
  --manual-wait-seconds 20
```

Then inspect the snapshot JSON and screenshot, update only that site's selector fields in `site_registry.json`, run `site_registry_tool.py validate`, unit tests, and one live smoke for the affected wrapper.
