# Web AI adapters

Adapters are implemented in `src/adapters/web-ai` for:

- `chatgpt` -> `https://chatgpt.com/`, profile `chatgpt`
- `claude` -> `https://claude.ai/`, profile `claude`
- `gemini` -> `https://gemini.google.com/app`, profile `gemini`

Each adapter defines base URL, recommended profile, login-state hints, semantic anchors, discovery paths, known capability categories, and safe draft-only actions.

## Login once

```bash
node dist/src/cli.js browser:launch --profile chatgpt --url https://chatgpt.com --json
node dist/src/cli.js browser:launch --profile claude --url https://claude.ai --json
node dist/src/cli.js browser:launch --profile gemini --url https://gemini.google.com/app --json
```

Complete login manually. Then run `capability:update` for that target.

## Adding a new adapter

Create `src/adapters/web-ai/<id>.ts` with a `WebAiAdapter` object. Add it to `src/adapters/web-ai/index.ts`. Use semantic anchors and selector candidates; do not rely on a single fragile selector. Add a fixture and capability extraction test.
