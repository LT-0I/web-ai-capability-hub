# G1 blocker

3 of 4 Gemini G1 capabilities failed closed.

```json
[
  {
    "id": "gemini-send-basic-mgr",
    "ok": true,
    "wall_ms": 11017,
    "evidence": ".runs/capability-explore-2026-05-25/gemini/gemini-send-basic-mgr.json",
    "workflow": "examples/workflows/gemini-gemini-send-basic-mgr.yaml",
    "status": "OK_MANAGED_CDP_ONLY"
  },
  {
    "id": "gemini-select-model-flash-mgr",
    "ok": false,
    "wall_ms": 15893,
    "evidence": ".runs/capability-explore-2026-05-25/gemini/gemini-select-model-flash-mgr.json",
    "workflow": "examples/workflows/gemini-gemini-select-model-flash-mgr.yaml",
    "status": "FAIL_CLOSED_MANAGED",
    "errorCode": "ELEMENT_NOT_FOUND",
    "cause": "ELEMENT_NOT_FOUND: Gemini mode picker trigger was not found"
  },
  {
    "id": "gemini-send-thinking-mgr",
    "ok": false,
    "wall_ms": 5849,
    "evidence": ".runs/capability-explore-2026-05-25/gemini/gemini-send-thinking-mgr.json",
    "workflow": "examples/workflows/gemini-gemini-send-thinking-mgr.yaml",
    "status": "FAIL_CLOSED_MANAGED",
    "errorCode": "MODEL_SELECTION_DRIFT",
    "cause": "MODEL_SELECTION_DRIFT"
  },
  {
    "id": "gemini-send-web-search-mgr",
    "ok": false,
    "wall_ms": 16387,
    "evidence": ".runs/capability-explore-2026-05-25/gemini/gemini-send-web-search-mgr.json",
    "workflow": "examples/workflows/gemini-gemini-send-web-search-mgr.yaml",
    "status": "FAIL_CLOSED_MANAGED",
    "errorCode": "ELEMENT_NOT_FOUND",
    "cause": "ELEMENT_NOT_FOUND: Gemini Upload & tools menu did not open"
  }
]
```
