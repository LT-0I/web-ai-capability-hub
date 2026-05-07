# Reference research

Research date: 2026-05-06. This document records the public-reference and uploaded-local-reference investigation used to evolve the package into a managed-CDP capability database and workflow hub. Links are included for traceability; design ideas were synthesized, not copied.

## Summary matrix

| Project | Observed focus | Borrowed design influence | Rejected or constrained ideas | License/access note |
| --- | --- | --- | --- | --- |
| nashsu/AutoCLI | Fast CLI access to many websites with session reuse and AI-native discovery | CLI-first, session-reuse mindset; concise machine-readable outputs | Site scraping breadth and any non-visible extraction emphasis are outside this package | Review upstream license before copying code; no code copied |
| nashsu/autocli-skill | Skill wrapper around AutoCLI for coding agents; reuse existing Chrome logins | Agent-facing skill documentation and command discoverability | Reusing arbitrary default user profiles; this package uses dedicated project-managed profiles | No code copied |
| lightpanda-io/browser | AI-oriented headless browser written in Zig, CDP compatibility goals | CDP abstraction boundary and future alternate-browser possibility | Headless-first strategy rejected for real target sites; visible Chrome/Edge required | AGPL-3.0 upstream means no code copied |
| browser-use/browser-use | Browser automation for AI agents; CLI examples include headed mode, profiles, sessions, state, click/type/screenshot | Multi-session concepts, element-state presentation, CLI commands that are token-efficient | Cloud/stealth/proxy/scaling features are outside safety scope | MIT license; no code copied |
| D4Vinci/Scrapling | Adaptive scraping, parser resilience, CLI/MCP mentions | Selector resilience and changed-page tolerance | Anti-bot/stealth/bypass functionality is explicitly rejected | BSD-3-Clause; no code copied |
| browser-use/web-ui | Gradio UI for browser-use | Optional future dashboard pattern and human-visible control surface | UI dashboard deprioritized; package delivers CLI/MCP/API first | MIT license; no code copied |
| browseros-ai/BrowserOS | Privacy-first agentic browser/Chromium fork with local-agent framing | Local-first privacy framing and browser-as-agent-platform thinking | Building/forking a browser is out of scope; use installed Chrome/Edge | Upstream license requires review; no code copied |
| h4ckf0r0day/obscura | Rust headless browser engine with CDP and stealth-oriented wording | Future CDP backend abstraction idea | Stealth/evasion and headless-only real-site operation rejected | Apache-2.0 metadata noted in releases; no code copied |
| magnitudedev/browser-agent | Vision-first browser agent | Screenshots as optional evidence alongside DOM/ARIA | Vision-first control loop not implemented; deterministic DOM/ARIA first | Apache-2.0; no code copied |
| ntegrals/openbrowser | TypeScript Playwright autonomous browsing framework | TypeScript API orientation and Playwright compatibility | Autonomous task execution is not the default; workflows must be explicit and safety-gated | No code copied |
| reworkd/AgentGPT | Autonomous agent UI; repository archived in 2026 | Task/run/event logging concepts | Open-ended autonomous goals rejected; this package compiles explicit workflows | Archived/read-only; no code copied |
| browserbase/stagehand | Browser automation primitives `act`, `extract`, `observe`, `agent` | Separation of observe/extract/action concepts; workflow compiler maps capabilities to actions | Natural-language actions as primary selector source rejected for deterministic foundation | No code copied |
| vercel-labs/agent-browser | CLI for AI agents, compact snapshots, ref-based operations, batch style | Ref/selector-candidate pattern and concise CLI outputs | Clipboard/system-control breadth not prioritized; no remote skills dependency | Apache-2.0; no code copied |
| microsoft/playwright-mcp | MCP server using structured accessibility snapshots for LLM browser interaction | Accessibility snapshot emphasis and MCP tools/resources interface | Screenshot-only control rejected; snapshot content is redacted by default | Apache-2.0; no code copied |
| actionbook/actionbook | Up-to-date action manuals and DOM/action guides for agents | Capability/action-manual database concept, versioned UI maps | External extension dependency not required; this package stays local CLI/MCP/API | No code copied |
| Skyvern-AI/skyvern | Playwright-compatible AI browser automation and MCP integration | Workflow run/event logging and form/download automation patterns | Hosted/task-agent model and bypass behaviors are not included | No code copied |
| Uploaded `reference-ip-literature-patent-research` | Visible CDP browser, institutional/IP access, official advanced search/filter/export, evidence logs, blockers | Research registry importer, stop conditions, evidence-first logs, site-map update workflow | Account/password handling and bypass attempts rejected | Local user-provided context; design ideas adapted |

## Public sources checked

- `https://github.com/microsoft/playwright-mcp` describes a Playwright MCP server that lets LLMs interact through structured accessibility snapshots.
- `https://github.com/browserbase/stagehand` and Browserbase docs describe browser automation primitives such as act/extract/observe/agent.
- `https://github.com/vercel-labs/agent-browser` describes a browser automation CLI for AI agents; visible reference material included role/text/label/find commands and batch execution.
- `https://github.com/Skyvern-AI/skyvern` describes a Playwright-compatible AI browser automation system and MCP integration.
- `https://github.com/nashsu/AutoCLI` and `https://github.com/nashsu/autocli-skill` emphasize CLI access, session reuse, and coding-agent skill integration.
- `https://github.com/lightpanda-io/browser` positions Lightpanda as an AI/headless browser with CDP compatibility goals.
- `https://github.com/browser-use/browser-use` documents headed/profile/session CLI modes and state/click/type/screenshot commands.
- `https://github.com/D4Vinci/Scrapling` describes adaptive scraping; any stealth or anti-bot bypass idea was rejected.
- `https://github.com/browser-use/web-ui` documents a user-facing browser-agent UI.
- `https://github.com/browseros-ai/BrowserOS` and `https://www.browseros.com/` emphasize local/private agentic browser use.
- `https://github.com/h4ckf0r0day/obscura` describes a Rust headless browser engine; stealth/headless-first behavior was rejected.
- `https://github.com/magnitudedev/browser-agent` describes a vision-first browser agent.
- `https://github.com/ntegrals/openbrowser` presents a TypeScript Playwright autonomous browsing framework.
- `https://github.com/reworkd/AgentGPT` was observed as archived/read-only in 2026.
- `https://github.com/actionbook/actionbook` and Actionbook docs emphasize action manuals and DOM/action guides.

## Architecture decisions influenced by research

1. **Visible managed browser first.** Lightpanda/Obscura are interesting CDP backends, but real user-authorized service automation must run in a visible Chrome/Edge profile.
2. **Accessibility + DOM + selector candidates.** Playwright MCP and agent-browser reinforce that structured snapshots are more stable and token-efficient than screenshots alone.
3. **Capability database rather than hard-coded selectors.** Actionbook-style action guides and the uploaded research registry motivate storing capabilities, evidence, versions, and diffs.
4. **Explicit workflows, not autonomous goals.** AgentGPT/OpenBrowser/Skyvern show the power of agent loops; this package constrains execution to explicit YAML/JSON workflows and approval gates.
5. **No stealth or bypass.** Browser-use cloud/stealth, Scrapling stealth, and Obscura stealth ideas are intentionally excluded because the package must respect access controls.
6. **Research database stop conditions.** The uploaded research reference is the strongest influence for paid database support: IP/institution first, official UI only, evidence capture, and hard stops.
