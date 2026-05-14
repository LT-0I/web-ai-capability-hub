# ChatGPT Deep Research DOCX workflow

Reference workflow: `configs/workflows/chatgpt-deep-research-docx.yaml`

## Purpose

Exports an already-present ChatGPT Deep Research report to DOCX with the Phase 1
`browser:artifact-click` recipe, then verifies that the DOCX is parseable and has
minimum report-like content.

## Inputs

- `conversationUrl` (required string): ChatGPT conversation URL, for example
  `https://chatgpt.com/c/<conversation-id>`.
- `outputDir` (required absolute path): directory where the exported DOCX lands.
- `topicRegex` (string, default `强化学习|RL`): body-text regex that must match.
- `runDir` (optional path): reserved for durable run artifacts when workflow
  schema/runtime support lands.

## Outputs

- `docxPath`: exported DOCX path from `browser:artifact-click`.
- `sha256`: content hash recorded by `verify:docx-min`.
- `paragraphs`: number of `<w:p>` elements in `word/document.xml`.
- `chars`: aggregate text length from `<w:t>` runs.

## Sample dry run

```bash
node dist/src/cli.js workflow:run configs/workflows/chatgpt-deep-research-docx.yaml \
  --input conversationUrl=https://chatgpt.com/c/6a04a213-5648-83e8-b9d0-6134aef56831 \
  --input outputDir=/abs/path/run-out \
  --dry-run --output-json
```

## Capture recipe

The capture step uses the proven Round-3/Phase-1 flags from
`ip-literature-patent-research/.runs/literature-review-rl-antiuav-2026-05-13/phase1-resmoke4-report.md`:

- profile: `chatgpt`
- URL reuse/selection: `{{inputs.conversationUrl}}`
- export button: `button[aria-label="导出"]`
- follow-up item regex: `(下载\s*DOCX|DOCX|Word|导出.*Word)`
- viewport: `1500x1000`
- prerender wait: `15000ms`
- main scroll: `y=900`, then `1000ms` wait
- locate timeout: `12000ms`
- total timeout: `90000ms`
- filename pattern: `*.docx`
- minimum download size: `20000` bytes

Primitive details: `docs/PRIMITIVE_ARTIFACT_CLICK.md`.

## Verification

`verify:docx-min` parses the DOCX as a ZIP, reads `word/document.xml`, counts
paragraph tags, aggregates text runs, optionally checks a topic regex, and records
SHA-256 unless `--no-sha256` is supplied.

Workflow thresholds:

- paragraphs `>= 50`
- chars `>= 5000`
- body text matches `topicRegex`
- SHA-256 present

Human CLI example:

```bash
node dist/src/cli.js verify:docx-min \
  --path /abs/path/report.docx \
  --min-paragraphs 50 \
  --min-chars 5000 \
  --topic-regex '强化学习|RL' \
  --output-json
```

## Known limitations

- Current workflow schema accepts this reference metadata but does not yet type
  `inputs`, `outputs`, `teardown`, or inter-step output binding.
- The current dry-run compiler preserves custom `artifactClick` and
  `verifyDocxMin` action records, but live workflow execution of those custom
  action types requires executor support in a later non-Phase-2 lane.
- Duplicate ChatGPT tabs are mitigated by `browser:artifact-click` tab selection,
  but URL collisions can still be a corner case.
- Menu discovery can perturb menu state; avoid running discovery immediately
  before export unless the page is reset.
- The workflow intentionally leaves Chrome connected because Deep Research
  sessions are expensive to recreate.
