# NUAA STEM 第三轮导出文件捕获摘要

采集时间：2026-05-13T12:49:09.335459+00:00。本轮仅修复第二轮 8 个导出 partial/not_applicable 数据库的官方元数据导出落盘问题，复用同一个可见 CDP Chrome 与 round-2 profile，按库顺序小批量尝试；未批量下载全文，incoPat 出现验证码后立即停止。

| 资源 | 第二轮导出 | 第三轮导出 | 格式 | 文件 | 字节 | 解析 | 说明 |
|---|---|---|---|---|---:|:-:|---|
| cnki | partial | still_partial | unknown | - | 0 | 否 | export/citation controls were visible but second attempt still produced no final file; no abuse warning observed |
| wanfang | not_applicable | still_partial | unknown | - | 0 | 否 | homepage/search flow did not expose a working export/citation metadata control before timeout |
| web-of-science | partial | still_partial | ris | - | 0 | 否 | RIS export menu and final modal reached (#exportToRisButton/#exportButton), but no download event/file landed |
| science-direct | partial | tested_ok | ris | evidence/science-direct/ris_sample.ris | 2369 | 是 | individual result Export → Export citation to RIS captured via Playwright download |
| ieee-xplore | partial | tested_ok | csv | evidence/ieee-xplore/csv_sample.csv | 2438872 | 是 | selected visible result rows, Export → Download Results produced CSV metadata export |
| acm-dl | partial | tested_ok | ris | evidence/acm-dl/ris_sample.ris | 548 | 是 | official ACM downloadCitation RIS endpoint captured for first result DOI after export-control discovery |
| springer-link | partial | tested_ok | ris | evidence/springer-link/ris_sample.ris | 1651 | 是 | article Download citation link captured from official citation-needed Springer endpoint |
| incopat | partial | blocked | unknown | - | 0 | 否 | stopped after CAPTCHA marker appeared during search/access probe |
