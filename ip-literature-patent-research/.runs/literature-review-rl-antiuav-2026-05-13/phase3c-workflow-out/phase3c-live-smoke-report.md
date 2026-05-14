# Phase 3c live smoke report

Date: 2026-05-14
Run directory: `/home/l1u/workspace/noeticmind/web-ai-capability-hub/ip-literature-patent-research/.runs/literature-review-rl-antiuav-2026-05-13/phase3c-workflow-out`
Workflow run id: `run_2f295602261c19e4`
Result: **FAIL — one allowed re-smoke hung and was interrupted after evidence capture**

## Pre-smoke local validation

- `npm run build`: clean.
- `npm test`: 116/116 pass.
- New mock tests added: 5 total.

## Reset evidence

Node Playwright CDP reset against `http://127.0.0.1:9223` completed before the smoke:

```text
Final tab list:
1. https://chatgpt.com/c/6a04a213-5648-83e8-b9d0-6134aef56831 KEEP
```

## Command

```bash
node dist/src/cli.js workflow:run configs/workflows/chatgpt-deep-research-docx.yaml \
  --input conversationUrl=https://chatgpt.com/c/6a04a213-5648-83e8-b9d0-6134aef56831 \
  --input outputDir=/home/l1u/workspace/noeticmind/web-ai-capability-hub/ip-literature-patent-research/.runs/literature-review-rl-antiuav-2026-05-13/phase3c-workflow-out \
  --output-json
```

Exit: `130` (interrupted after the single allowed re-smoke remained non-terminal for ~6m46s)

## stdout

```text
COMMAND_START 2026-05-14T04:35:52-07:00
COMMAND_EXIT 130 2026-05-14T04:42:38-07:00
```

## stderr

```text

```

## workflow_runs row

```json
{
  "id": "run_2f295602261c19e4",
  "workflow_id": "chatgpt_deep_research_export_docx",
  "target_id": "chatgpt",
  "profile": "chatgpt",
  "mode": "assisted",
  "status": "running",
  "started_at": "2026-05-14T11:35:52.584Z",
  "finished_at": null,
  "plan": {
    "id": "chatgpt_deep_research_export_docx",
    "target": "chatgpt",
    "profile": "chatgpt",
    "mode": "assisted",
    "compiledAt": "2026-05-14T11:35:52.584Z",
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
}
```

## run_events log

```json
[
  {
    "id": "event_8e6e16efdf537091",
    "run_id": "run_2f295602261c19e4",
    "step_id": "capture_docx",
    "event_type": "started",
    "timestamp": "2026-05-14T11:35:52.619Z",
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
    "started_at": "2026-05-14T11:35:52.619Z",
    "finished_at": null,
    "inputs_hash": "aa354e67d443ace9e121b405dac1893f45861a6ded5fa1582c5f677322e59a3e",
    "output_artifact_ids": [],
    "error_code": null,
    "idempotency_key": null
  }
]
```

## DOCX verifier results

No `.docx` file was produced in the Phase 3c output directory, so v2 §9 verification could not run.

- Paragraphs: not available
- Chars: not available
- Topic regex: not available
- SHA-256: not available
- Freshness against `58b0cb05...`, `a19cc043...`, `9c1ebc65...`: not available

Directory evidence:

```text
db-evidence.json	6122
docx-verify.json	0
docx-verify.stderr	63
files.tsv	0
page-evidence.json	797
workflow.stderr	0
workflow.stdout	83
```

## Page evidence at stop time

```json
[
  {
    "url": "https://chatgpt.com/c/6a04a213-5648-83e8-b9d0-6134aef56831",
    "itemCount": 136,
    "matchingItems": [
      {
        "text": "PPTX下载和内容总结",
        "aria": null,
        "x": 0,
        "y": 516,
        "width": 245,
        "height": 36,
        "visible": true
      },
      {
        "text": "PPTX下载和内容总结",
        "aria": "PPTX下载和内容总结",
        "x": 6,
        "y": 516,
        "width": 233,
        "height": 36,
        "visible": true
      },
      {
        "text": "打开“PPTX下载和内容总结”的对话选项",
        "aria": "打开“PPTX下载和内容总结”的对话选项",
        "x": -0.5,
        "y": 503.5,
        "width": 38,
        "height": 36,
        "visible": true
      }
    ]
  }
]
```

## Conclusion

The code-level fixes and mock tests passed locally, but the single allowed live re-smoke did not complete. The workflow row remained `running`, only the `capture_docx` started event was present, and no DOCX was emitted. Per the Phase 3c fail-handling instruction, I did not run a second live smoke.
