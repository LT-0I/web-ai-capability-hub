# NUAA STEM Round 4 复核摘要

本轮使用 round-2 的温 CDP profile 对 round-1 中 10 个 `unknown` STEM 资源进行轻量重探测，仅验证主页/IP 识别、一次简单检索、结果列表截图，以及翻转资源的高级检索和排序/视图能力；其中 ScienceDirect 备用入口标记为 round-2 已覆盖的重复项。结果显示 4 个资源从 `unknown` 翻转为可用，4 个资源仍受持续安全验证或访问挑战阻断。

| 序号 | resource_id | 题名 | round-1 | round-4 | features_tested | 备注 |
|---:|---|---|---|---|---|---|
| 1 | `aiaa-6dcbe1b3` | AIAA 美国航空航天学会 | unknown | blocked | access | Persistent challenge / anti-bot or access-denied marker observed. |
| 2 | `asme-0e1b238e` | ASME 美国机械工程师学会 | unknown | ip_login_button_ok | simple_search, advanced_search, sort_and_view | Flipped from round-1 unknown; simple search result list rendered under warm headed CDP profile. |
| 3 | `asce-c44fb45b` | ASCE 美国土木工程学会 | unknown | auto_ip_ok | simple_search, advanced_search, sort_and_view | Flipped from round-1 unknown; simple search result list rendered under warm headed CDP profile. |
| 4 | `aip-cae6db23` | AIP 美国物理联合会 | unknown | blocked | access | Persistent challenge / anti-bot or access-denied marker observed. |
| 5 | `acs-5f505783` | ACS 美国化学学会 | unknown | blocked | access | Persistent challenge / anti-bot or access-denied marker observed. |
| 6 | `annual-reviews-e26ad415` | Annual Reviews 综述类期刊 | unknown | ip_login_button_ok | simple_search, advanced_search, sort_and_view | Flipped from round-1 unknown; simple search result list rendered under warm headed CDP profile. |
| 7 | `elsevier-sciencedirect-ee38095f` | Elsevier ScienceDirect (alt entry) | unknown | duplicate_of:science-direct | — | Duplicate of science-direct entry already explored in round 2; smoke skipped. |
| 8 | `project-euclid-cdef7b59` | Project Euclid | unknown | unreachable | access | No visible page title/body after homepage load. |
| 9 | `annals-of-mathematics-beec49f1` | Annals of Mathematics | unknown | auto_ip_ok | simple_search, advanced_search, sort_and_view | Flipped from round-1 unknown; simple search result list rendered under warm headed CDP profile. |
| 10 | `ahs-1247f19a` | AHS 美国直升机学会 | unknown | blocked | access | Persistent challenge / anti-bot or access-denied marker observed. |
