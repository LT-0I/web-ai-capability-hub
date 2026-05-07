# Integration guide

Use CLI for simple process orchestration, MCP for coding-agent tools/resources, or TypeScript APIs for direct embedding.

Recommended integration flow:

1. `browser:launch` the service profile and ask the user to log in manually.
2. `capability:update` to populate local records.
3. `capability:query` or `capability:export` so the consumer package can reason over available UI functions.
4. Write a YAML/JSON workflow against capability names.
5. `workflow:compile` then `workflow:run --dry-run`.
6. Execute only after explicit user approval for risky steps.

Never read cookies or browser profile files directly.
