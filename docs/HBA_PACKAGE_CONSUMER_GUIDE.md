# HBA package consumer guide

Other local packages can integrate through one of three surfaces:

1. **CLI** for shell-first orchestration and logs.
2. **MCP** for coding agents or LLM clients.
3. **TypeScript API** for direct integration.

## Query capabilities from another package

```ts
import { CapabilityDatabase, CapabilityQueryService } from "web-ai-research-automation-hub";

const db = new CapabilityDatabase({ dbPath: process.env.WAH_SQLITE_PATH });
db.init();
const service = new CapabilityQueryService(db);
console.log(service.query({ target: "gemini", text: "image generation" }));
```

## Compile a workflow

```ts
import { WorkflowCompiler } from "web-ai-research-automation-hub";
const plan = new WorkflowCompiler().compileFile("examples/workflows/gemini-image-draft.yaml");
```

## Consume exported JSON

```bash
node dist/src/cli.js capability:export --target gemini --out data/exports/gemini-capabilities.json --json
```

Read `capabilities[]`, `ui_elements[]`, and `page_captures[]` from that file. Do not parse browser profile files or cookies.
