# NUAA STEM 第五轮新增高价值资源深探摘要

采集时间：2026-05-13T15:44:48.955238+00:00
范围：deep-explore arxiv + proquest-csa + national-military-standards + scoap3
父运行：nuaa-2026-05-13-round2-headed

| 资源 | tested_ok 数 | 样例导出/元数据 | 主要限制 |
|---|---:|---|---|
| arxiv | 6 | evidence/arxiv/exports/arxiv_sample_bibtex.bib | citation_graph:partial；alerts_and_saved:not_applicable |
| proquest-csa | 3 | 未获得官方导出文件 | export:not_applicable；citation_graph:partial；alerts_and_saved:partial；full_text_link:partial；api_or_openurl:not_applicable |
| national-military-standards | 0 | 未获得官方导出文件 | simple_search:blocked；advanced_search:not_applicable；sort_and_view:not_applicable；export:not_applicable；citation_graph:not_applicable；alerts_and_saved:not_applicable；full_text_link |
| scoap3 | 6 | evidence/scoap3/exports/scoap3_repo_metadata_sample.json | citation_graph:not_applicable；alerts_and_saved:not_applicable |

## 合规说明
- 遵循 database-access-policy.md；未绕过 CAPTCHA、登录、付费墙或下载限制。
- arXiv 仅使用低数量检索/API样本（max_results=5）和单条 PDF 链接验证，不进行批量抓取。
- 国家军用标准 registry home_url 解析失败（DNS_PROBE_FINISHED_NXDOMAIN），未改用非授权镜像或重试绕过。
