# Workflow compiler

Workflows may be YAML or JSON. They reference abstract capabilities rather than raw selectors.

```yaml
id: gemini-image-draft
target: gemini
profile: gemini
mode: assisted
steps:
  - use_capability: open_image_generation
  - use_capability: enter_prompt
    input:
      text: "A clean futuristic laboratory notebook icon"
  - use_capability: verify_draft
```

Compile and dry-run:

```bash
node dist/src/cli.js workflow:compile examples/workflows/gemini-image-draft.yaml --json
node dist/src/cli.js workflow:run examples/workflows/gemini-image-draft.yaml --dry-run --json
```

The compiler resolves capabilities from the latest database records when available. If a record is not available, it falls back to conservative semantic targets such as `{ role: "textbox", name: "prompt" }`. The executor supports open, click, type, press, select, upload, wait, scroll, extract, and download actions. Risky actions require approval.
