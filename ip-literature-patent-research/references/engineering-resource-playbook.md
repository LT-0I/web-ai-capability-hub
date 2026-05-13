# Engineering Database Playbook

Use this guide after parsing a `数字资源导航`-style MHTML file with `scripts/resource_nav_tool.py`.

## Search Order

1. **Find and scope the field**: Web of Science, Scopus, Ei Village, Inspec, CPCI.
2. **Retrieve full text**: IEEE, ACM, ScienceDirect, SpringerLink, Wiley, Taylor & Francis, Nature, ScienceOnline, subject society libraries.
3. **Check engineering evidence**: ASTM, SAE, RTCA, AIAA, ASME, ASCE, SPIE, IET/IEL, technical report platforms.
4. **Check novelty**: IncoPat first, then EPO/Espacenet, USPTO, PATENTSCOPE if available.
5. **Add open/public coverage**: arXiv, DBLP, PubScholar, 中国科技论文在线, INSPIRE, SCOAP3, DOAJ.

## Index Databases

| Database | Best Use | How To Work |
|---|---|---|
| Web of Science Core Collection | high-quality citation chain and SCI/EI-adjacent screening | Use Topic search first, then refine by Research Areas, Document Types, Timespan, and Highly Cited/Review flags. Export full records with cited references when allowed. Use Cited Reference Search for predecessor work. |
| Scopus | broad engineering and conference coverage | Use TITLE-ABS-KEY, filter subject area and document type, sort by cited-by and newest. Export citation, abstract, author keywords, affiliation, source title, DOI. |
| Ei Village | engineering novelty and applied technology recall | Search controlled terms plus free terms. Use Compendex filters for subject, treatment type, document type, and year. Keep exact query strings because Ei evidence is often needed in technical novelty reports. |
| Inspec | electronics, physics, computer, control, communication | Use controlled indexing terms for devices/materials/phenomena. Pair with IEEE/SPIE/IOP for full text. |
| CPCI | conference proceeding coverage | Use after Web of Science topic search to catch conference-only work. Export separately so proceedings are not mixed with journal papers. |

## Full-Text and Society Libraries

| Resource | Scope | Search Pattern |
|---|---|---|
| IEEE Xplore / IEL | electrical, electronics, communications, computer, control | Use quoted phrases in All Metadata, then Advanced Search with Abstract/Index Terms. Filter Conference/Journals/Standards. Export citations; download only target papers. |
| ACM Digital Library | computer science and software systems | Search title/abstract first, then ACM Computing Classification/venue. Use DL export for BibTeX/RIS. Pair with DBLP for venue disambiguation. |
| ScienceDirect | Elsevier journals/books | Use Title/Abstract/Keywords; filter article type and years. Good for materials, energy, control, mechanical, chemical engineering. |
| SpringerLink / Wiley / Taylor & Francis | broad engineering journals/books | Search exact phrase plus synonyms, filter discipline and content type, export citation metadata. |
| SPIE Digital Library | optics, imaging, remote sensing, photonics | Use conference proceedings heavily; filter by Proceedings/Journals and event year. |
| IOP / APS / AIP / RSC / ACS / ECS | physics, materials, chemistry, electrochemistry | Use compound/material formula variants, device names, and measurement terms. Export exact DOI and journal metadata. |
| AIAA / ASME / ASCE / SAE | aerospace, mechanical, civil, automotive | Search by system/component/problem. Prioritize conference papers, standards, technical papers, and design handbooks when present. |

## Standards, Reports, Patents

| Resource | Use | Evidence To Keep |
|---|---|---|
| ASTM | materials, testing, manufacturing standards | Standard number, title, scope, active/historical status, year. |
| SAE | aerospace/automotive standards and technical papers | Document number, title, committee/source, year. |
| RTCA and foreign military standards | avionics and aerospace compliance | Standard number, edition, applicability, safety domain. |
| 尚唯科技报告 / 工程科技数字图书馆 / 航空发动机知识库 | technical reports and engineering grey literature | Report title, institution, report number, date, keywords. |
| IncoPat | patent novelty and patent landscape | Query expression, countries, legal status, family grouping, assignees, IPC/CPC, priority date, closest claims/abstracts. |
| EPO / USPTO / PATENTSCOPE | public patent cross-checks | Publication number, priority, family, claims, applicant, legal event. |

## Topic Recipes

### Computer / Communication

Start with IEEE Xplore, ACM DL, DBLP, Scopus, Web of Science, Ei Village, Inspec. Use terms from title/abstract plus algorithm/system names. For software engineering, use ACM + IEEE + Scopus; for communication hardware, add Inspec and SPIE if optical.

### Aerospace / Mechanical / Energy

Start with Ei Village, Web of Science, Scopus, AIAA, ASME, SAE, ASTM. Add RTCA or foreign military standards when avionics/safety/certification appears. For engines, add 航空发动机知识库 and technical report platforms.

### Materials / Chemistry

Start with Web of Science, Scopus, ScienceDirect, ACS, RSC, Wiley, Springer, IOP/AIP/APS. Use formula variants, common names, morphology terms, preparation method, and performance metrics.

### Optics / Physics

Start with Web of Science, Scopus, SPIE, Optica/OSA, IOP, APS, AIP, INSPIRE for high-energy physics. Include arXiv for preprint priority.

### Patent Novelty

Build three query layers:

1. Technical concept terms in Chinese and English.
2. Function/effect terms, including synonyms and failure modes.
3. Structure/material/process terms, including IPC/CPC after the first recall pass.

Run IncoPat first for Chinese interface and family analysis. Cross-check representative documents in EPO/USPTO/PATENTSCOPE. Report closest patents by claim overlap, not only keyword match.

## Export Discipline

For every database, save:

- database name and access route;
- exact query string;
- filters;
- timestamp;
- result count;
- export filename or screenshot path;
- any access limitation.

Never bulk-download full text. Export metadata first, then retrieve only papers/patents needed for close reading.
