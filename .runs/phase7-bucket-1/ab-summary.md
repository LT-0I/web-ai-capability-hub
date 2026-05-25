# Phase 7 Bucket 1 A/B Summary

| service | backend | attempts | success_rate | wait p50/p95 ms | elapsed p50/p95 ms | mean elapsed ms | errors | aborted |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- |
| chatgpt | managed-cdp | 20/20 | 0.00 | n/a/n/a | 12224/12235 | 12223 | `{"UNKNOWN":20}` | no |
| chatgpt | extension-assisted-cdp | 20/20 | 0.80 | 8205/11729 | 13502/24252 | 14191 | `{"null":16,"ELEMENT_NOT_FOUND":4}` | no |
| gemini | managed-cdp | 20/20 | 1.00 | 9434/11844 | 20898/23313 | 21413 | `{"null":20}` | no |
| gemini | extension-assisted-cdp | 20/20 | 1.00 | 3596/4612 | 6487/8621 | 6838 | `{"null":20}` | no |

B1 VALIDATION PASS — recommend GO on B2-B8
