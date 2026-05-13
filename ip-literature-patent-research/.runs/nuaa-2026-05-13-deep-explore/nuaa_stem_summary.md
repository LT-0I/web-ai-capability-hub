# NUAA 理工科数据库搜索功能摸底（部分完成）

本次已完成：从南航图书馆数字资源导航实时枚举 159 条资源，并按既有理工科分类表复核出 109 条 STEM/理工科相关资源；对 109 条做了轻量访问状态探测；对 7 个已注册适配器资源做了搜索页 DOM/screenshot 证据快照。

访问状态统计：{'ip_login_button_ok': 11, 'proxy_error': 2, 'unreachable': 74, 'auto_ip_ok': 11, 'unknown': 10, 'requires_account': 1}。

搜索功能深挖状态：本轮只形成部分证据目录，未完成每个可达数据库的高级检索、导出、引文网络、提醒/保存、全文链接/API 等逐项穷尽测试。受限原因包括：大量导航直达 URL 在无可见会话/代理链下不可达，多个出版商页面出现 unknown/challenge-like 状态，以及合规策略禁止绕过验证码、反爬、账号或异常下载限制。

建议后续优先在可见 CDP 浏览器、校园网稳定会话下分批继续：CNKI、万方、Web of Science、Scopus、ScienceDirect、IEEE、ACM、Springer、Wiley、ACS/RSC/IOP/AIP/APS、AIAA/ASME/ASCE/ASTM/SAE、IncoPat、Espacenet/PATENTSCOPE。
