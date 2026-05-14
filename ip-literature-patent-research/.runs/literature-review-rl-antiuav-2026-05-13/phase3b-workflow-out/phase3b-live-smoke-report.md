# Phase 3b live smoke report

Date: 2026-05-14
Run directory: `/home/l1u/workspace/noeticmind/web-ai-capability-hub/ip-literature-patent-research/.runs/literature-review-rl-antiuav-2026-05-13/phase3b-workflow-out`
Workflow run id: `run_accd4c671fd80205`
Result: **FAIL**

## Command

```bash
node dist/src/cli.js workflow:run configs/workflows/chatgpt-deep-research-docx.yaml \
  --input conversationUrl=https://chatgpt.com/c/6a04a213-5648-83e8-b9d0-6134aef56831 \
  --input outputDir=/home/l1u/workspace/noeticmind/web-ai-capability-hub/ip-literature-patent-research/.runs/literature-review-rl-antiuav-2026-05-13/phase3b-workflow-out \
  --output-json
```

Exit: `1`

## Reset evidence

The provided Python helper could not run because the Python Playwright package is not installed in this environment. I used the equivalent Node Playwright CDP reset against `http://127.0.0.1:9223`: navigate kept tab to `about:blank`, navigate back to the target conversation, close duplicates, press Escape. Final reset output showed one clean tab:

```
Final tab list:
1. https://chatgpt.com/c/6a04a213-5648-83e8-b9d0-6134aef56831 KEEP
```

## stdout

```
COMMAND_START 2026-05-14T03:51:45-07:00
COMMAND_EXIT 1 2026-05-14T03:52:06-07:00
```

## stderr

```json
{"ok":false,"errorCode":"ELEMENT_OUT_OF_VIEWPORT","error":"Follow-up element was outside viewport y range [0,1000]","evidence":{"scroll":{"ranScroll":true,"candidates":3,"scrolledTo":900},"selector":"(下载\\s*DOCX|DOCX|Word|导出.*Word)"}}
```

## Workflow plan JSON

```json
{
  "id": "chatgpt_deep_research_export_docx",
  "target": "chatgpt",
  "profile": "chatgpt",
  "mode": "assisted",
  "compiledAt": "2026-05-14T10:51:46.167Z",
  "actions": [
    {
      "stepId": "capture_docx",
      "action": {
        "type": "artifactClick",
        "target": {
          "command": "browser:artifact-click",
          "profile": "chatgpt",
          "url": "{{inputs.conversationUrl}}",
          "buttonSelector": "button[aria-label=\"导出\"]",
          "followUpTextRegex": "(下载\\s*DOCX|DOCX|Word|导出.*Word)",
          "viewportWidth": 1500,
          "viewportHeight": 1000,
          "prerenderWaitMs": 15000,
          "scrollMainToY": 900,
          "scrollMainWaitMs": 1000,
          "locateTimeoutMs": 12000,
          "timeoutMs": 90000,
          "downloadDir": "{{inputs.outputDir}}",
          "filenamePattern": "*.docx",
          "verifyMinBytes": 20000,
          "noDisconnect": false
        },
        "confirmed": true
      },
      "requiresApproval": false,
      "resolvedSelectors": [],
      "idempotent": false
    },
    {
      "stepId": "verify_docx",
      "action": {
        "type": "verifyDocxMin",
        "target": {
          "command": "verify:docx-min",
          "path": "{{steps.capture_docx.path}}",
          "minParagraphs": 50,
          "minChars": 5000,
          "topicRegex": "{{inputs.topicRegex}}",
          "recordSha256": true
        },
        "confirmed": true
      },
      "requiresApproval": false,
      "resolvedSelectors": [],
      "idempotent": true
    }
  ],
  "warnings": [],
  "definition": {
    "id": "chatgpt_deep_research_export_docx",
    "version": "1.0.0",
    "target": "chatgpt",
    "profile": "chatgpt",
    "mode": "assisted",
    "description": "Export an already-complete ChatGPT Deep Research report to DOCX and verify minimum content quality.",
    "inputs": {
      "conversationUrl": {
        "type": "string",
        "required": true
      },
      "outputDir": {
        "type": "path",
        "required": true
      },
      "topicRegex": {
        "type": "string",
        "default": "强化学习|RL"
      },
      "runDir": {
        "type": "path",
        "required": false
      }
    },
    "outputs": {
      "docxPath": "{{steps.capture_docx.path}}",
      "sha256": "{{steps.verify_docx.sha256}}",
      "paragraphs": "{{steps.verify_docx.paragraphs}}",
      "chars": "{{steps.verify_docx.chars}}"
    },
    "steps": [
      {
        "id": "capture_docx",
        "action": "artifactClick",
        "target": {
          "command": "browser:artifact-click",
          "profile": "chatgpt",
          "url": "{{inputs.conversationUrl}}",
          "buttonSelector": "button[aria-label=\"导出\"]",
          "followUpTextRegex": "(下载\\s*DOCX|DOCX|Word|导出.*Word)",
          "viewportWidth": 1500,
          "viewportHeight": 1000,
          "prerenderWaitMs": 15000,
          "scrollMainToY": 900,
          "scrollMainWaitMs": 1000,
          "locateTimeoutMs": 12000,
          "timeoutMs": 90000,
          "downloadDir": "{{inputs.outputDir}}",
          "filenamePattern": "*.docx",
          "verifyMinBytes": 20000,
          "noDisconnect": false
        },
        "confirmed": true
      },
      {
        "id": "verify_docx",
        "action": "verifyDocxMin",
        "target": {
          "command": "verify:docx-min",
          "path": "{{steps.capture_docx.path}}",
          "minParagraphs": 50,
          "minChars": 5000,
          "topicRegex": "{{inputs.topicRegex}}",
          "recordSha256": true
        },
        "confirmed": true
      }
    ],
    "teardown": {
      "browser": "leave-connected"
    },
    "notes": {
      "schema_gap": "Current workflow schema accepts extra metadata but does not yet type inputs, outputs, teardown, artifactClick, verifyDocxMin, or inter-step bindings."
    }
  }
}
```

## Per-step results

- `capture_docx`: **FAIL** — `ELEMENT_OUT_OF_VIEWPORT`: Follow-up element was outside viewport y range [0,1000]
  - Redacted evidence: `{"scroll":{"ranScroll":true,"candidates":3,"scrolledTo":900},"selector":"(下载\\s*DOCX|DOCX|Word|导出.*Word)"}`
- `verify_docx`: **NOT RUN** — capture failed before any DOCX path was produced.

## Run event log

```json
[
  {
    "id": "event_f0d2757391f58ef7",
    "run_id": "run_accd4c671fd80205",
    "step_id": "capture_docx",
    "event_type": "started",
    "timestamp": "2026-05-14T10:51:46.195Z",
    "payload": {
      "action": {
        "type": "artifactClick",
        "target": {
          "command": "browser:artifact-click",
          "profile": "<profile>",
          "url": "{{inputs.conversationUrl}}",
          "buttonSelector": "button[aria-label=\"导出\"]",
          "followUpTextRegex": "(下载\\s*DOCX|DOCX|Word|导出.*Word)",
          "viewportWidth": 1500,
          "viewportHeight": 1000,
          "prerenderWaitMs": 15000,
          "scrollMainToY": 900,
          "scrollMainWaitMs": 1000,
          "locateTimeoutMs": 12000,
          "timeoutMs": 90000,
          "downloadDir": "{{inputs.outputDir}}",
          "filenamePattern": "*.docx",
          "verifyMinBytes": 20000,
          "noDisconnect": false
        },
        "confirmed": true
      },
      "approvalRequired": false,
      "idempotent": false
    },
    "status": "started",
    "started_at": "2026-05-14T10:51:46.195Z",
    "finished_at": null,
    "inputs_hash": "aa354e67d443ace9e121b405dac1893f45861a6ded5fa1582c5f677322e59a3e",
    "output_artifact_ids": [],
    "error_code": null,
    "idempotency_key": null
  },
  {
    "id": "event_c1f9514ab633a59d",
    "run_id": "run_accd4c671fd80205",
    "step_id": "capture_docx",
    "event_type": "failed",
    "timestamp": "2026-05-14T10:52:06.346Z",
    "payload": {
      "error": "Follow-up element was outside viewport y range [0,1000]",
      "errorCode": "ELEMENT_OUT_OF_VIEWPORT",
      "evidence": {
        "scroll": {
          "ranScroll": true,
          "candidates": 3,
          "scrolledTo": 900
        },
        "selector": "(下载\\s*DOCX|DOCX|Word|导出.*Word)"
      }
    },
    "status": "failed",
    "started_at": "2026-05-14T10:51:46.195Z",
    "finished_at": "2026-05-14T10:52:06.346Z",
    "inputs_hash": "aa354e67d443ace9e121b405dac1893f45861a6ded5fa1582c5f677322e59a3e",
    "output_artifact_ids": [],
    "error_code": "ELEMENT_OUT_OF_VIEWPORT",
    "evidence": {
      "scroll": {
        "ranScroll": true,
        "candidates": 3,
        "scrolledTo": 900
      },
      "selector": "(下载\\s*DOCX|DOCX|Word|导出.*Word)"
    },
    "idempotency_key": null
  }
]
```

## DOCX artifact

No fresh DOCX was captured. Final DOCX path: `none`. SHA-256: `none`.

## §9 pass/fail criteria

| Criterion | Result | Evidence |
| --- | --- | --- |
| Valid DOCX | FAIL | No DOCX captured. |
| >=50 paragraphs | FAIL | Verifier step did not run. |
| >=5,000 chars | FAIL | Verifier step did not run. |
| Topic regex match | FAIL | Verifier step did not run. |
| sha256 recorded | FAIL | No DOCX captured. |
| Fresh hash distinct from 58b0cb05, a19cc043, 9c1ebc65 | FAIL | No fresh hash. |
| Durable run events | PARTIAL | `2` rows for started/failed `capture_docx`; `verify_docx` did not run after capture failure. |

## Observed issue

The single live smoke stopped at `capture_docx` with `ELEMENT_OUT_OF_VIEWPORT` while locating the DOCX/Word follow-up menu item after export click. Per the Phase 3b anti-slop instruction, I did not retry or adjust selectors after this failed live run.

Additional note: the latest `workflow_runs` row remained `running` even though a failed run event was recorded, because the executor rethrew before writing a terminal failed run row.
