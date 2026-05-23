# Future work behind benchmark gates

## Stagehand local-mode

v3.2 rejected Stagehand as a runtime dependency for the v1.0 cut. Reconsider only behind a benchmark gate: if the 90th-percentile selector-resolution time stays above 800 ms across 100 runs of `webai_chatgpt_send_prompt`, evaluate Stagehand `act`/`extract` action caching in local mode. Any trial must preserve report-only heal behavior, stable error codes, and the no-graceful-fallback rule.

## Lightpanda sidecar

v3.2 deferred Lightpanda because a second browser runtime multiplies lifecycle and failure modes. Reconsider only if median observation cost stays above 4 KB per snapshot across 500 representative runs. If the gate trips, evaluate Lightpanda as an optional sidecar for headless AX-tree extraction, not as a replacement for managed CDP sessions, ProfilePool, or TabLease.
