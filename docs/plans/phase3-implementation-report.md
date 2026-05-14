# Phase 3 implementation report — ChatGPT Deep Research DOCX

Date: 2026-05-14

## Delivered

- Added `configs/workflows/chatgpt-deep-research-docx.yaml` for
  `chatgpt_deep_research_export_docx`.
- Added reusable DOCX verifier `verifyDocxMin` in `src/verifiers/docxMin.ts`.
- Added CLI command `verify:docx-min` with JSON output and pass/fail exit code.
- Added verifier, CLI, and workflow dry-run tests.
- Added `docs/WORKFLOW_CHATGPT_DR_DOCX.md` and catalog entry.
- Added consumer contract row for `verify:docx-min` and error code
  `DOCX_VERIFICATION_FAILED` without changing contract versioning.

## Schema/runtime gaps observed

The existing workflow schema accepts extra YAML metadata, so the workflow can
record `version`, `inputs`, `outputs`, and `teardown`. However, `src/workflows/*`
currently does not type or execute these fields, does not resolve `--input`
templates, and does not live-execute custom `artifactClick` / `verifyDocxMin`
action types. Per Phase 3 stay-out rules, `schema.ts`, `compiler.ts`, and
`executor.ts` were left untouched. The reference workflow therefore dry-runs with
both intended actions preserved in the plan, and live execution needs a later
executor lane to dispatch those custom action types.

## Verifier evidence

The real Phase-1 fixture passes minimum verification:

- Fixture:
  `ip-literature-patent-research/.runs/literature-review-rl-antiuav-2026-05-13/phase1-resmoke4-downloads/phase1-resmoke4-export.docx`
- Size: `31520`
- SHA-256: `9c1ebc65b137a1f063659e7f6d310375f1735537219bed3aa7ec94b8a2572727`
- Test thresholds exercised: happy path, paragraph failure, char failure,
  topic-regex failure, invalid non-zip file, CLI failing exit code.

## Dry-run evidence

Command:

```bash
node dist/src/cli.js workflow:run configs/workflows/chatgpt-deep-research-docx.yaml \
  --input conversationUrl=https://chatgpt.com/c/6a04a213-5648-83e8-b9d0-6134aef56831 \
  --input outputDir=/abs/path/run-out \
  --dry-run --output-json
```

Output:

```json
{
  "ok": true,
  "dryRun": true,
  "plan": {
    "id": "chatgpt_deep_research_export_docx",
    "target": "chatgpt",
    "profile": "chatgpt",
    "mode": "assisted",
    "compiledAt": "2026-05-14T10:25:17.678Z",
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
        "idempotent": false
      }
    ],
    "warnings": []
  },
  "results": [
    {
      "stepId": "capture_docx",
      "ok": true,
      "message": "Dry run: artifactClick"
    },
    {
      "stepId": "verify_docx",
      "ok": true,
      "message": "Dry run: verifyDocxMin"
    }
  ]
}
```

## Final verification

- `npm run build` passed.
- `npm test` passed: 90 tests, 90 pass, 0 fail.
