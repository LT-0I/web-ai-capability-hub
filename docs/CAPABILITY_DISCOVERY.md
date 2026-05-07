# Capability discovery

Discovery starts from a `PageSnapshot` containing URL, title, timestamp, visible text, DOM elements, forms, tables, lists, iframes, optional accessibility summaries, screenshots, warnings, and selector candidates.

`CapabilityExtractor` normalizes the page into records useful for local agents:

- Web AI: `enter_prompt`, `send_message`, `new_chat`, `open_history`, `upload_file`, `download_or_export`, `select_model_or_mode`, `open_image_generation`, `open_canvas_artifact_or_code`.
- Research databases: `enter_search_query`, `open_advanced_search`, `apply_filter_or_facet`, `read_results_metadata`, `download_or_export`.

Each capability stores category, description, inputs, outputs, preconditions, selector candidates, confidence, status, and evidence references. Raw values are redacted by default where sensitive.

## Fixture example

```bash
node dist/src/cli.js capability:update --target gemini --kind web-ai --profile gemini --fixture fixtures/mock-web-ai.html --json
node dist/src/cli.js capability:query --target gemini --text "prompt" --json
```

## Real-site example

```bash
node dist/src/cli.js browser:launch --profile gemini --url https://gemini.google.com/app --json
# user logs in manually if needed
node dist/src/cli.js capability:update --target gemini --profile gemini --json
```
