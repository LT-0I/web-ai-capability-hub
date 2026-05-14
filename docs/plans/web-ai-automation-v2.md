# Web-AI Automation — adversarial critique + v2 proposal

Author: Codex critique pass, 2026-05-14. Source: `web-ai-automation-v1.md`, Round 1-3 run reports, Round-3 CDP recipe/log, current consumer contract, current adapters, and web research.

## Critique

### Section A — Where v1 is wrong or weak

#### v1 §1 Diagnosis

> "the project models surfaces, not workflows"

- **Architectural mismatch:** the repo already has `workflow:compile`, `workflow:run`, `WorkflowExecutor`, workflow tables, MCP resources, and a consumer contract exposing workflow surfaces. The real gap is not "no workflow layer"; it is that the existing workflow layer is too shallow for stateful browser sessions, mode assertions, iframe-download capture, resumability, and verification.
- **Wrong primitive boundary:** v1 treats the incident as a missing workflow-registry problem, but Round 3 was won by a browser/session capability: browser-level CDP download events plus raw viewport mouse dispatch in a sandboxed iframe. A registry would not have made `page.waitForEvent("download")` work.
- **Under-engineering:** it does not name the existing failure that `browser:click --expect-download` is page-scoped and locator-scoped. The failing primitive is already in `ActionExecutor.click`; the plan should patch/extend that execution boundary instead of pretending `browser:download` is a standalone missing thing.

#### v1 §2 New + extended primitives

> "`browser:download-iframe` (NEW — Tactic 1 from round 3)"

- **Right idea, wrong boundary:** yes, iframe-download capture is the highest-value primitive. But naming it `download-iframe` overfits the current symptom. The capability is really `browser:cdp-download-click`: locate in any frame, optionally by contextual text, click by CDP coordinates, subscribe to browser-level download events, and verify artifact.
- **Fragile assumption:** `--button-selector 'button[aria-label="导出"]'` and `--follow-up-selector 'div[role="menuitem"]:has-text("导出到 Word")'` assume Chinese UI text and one menu implementation. Round 3 also needed scroll positioning and ancestor-text disambiguation (`引言与背景`), which v1 omits from the public contract.
- **Under-engineering:** CDP `Browser.setDownloadBehavior` is Chromium-specific and may be restricted by connection mode; v1 should explicitly state a Playwright-first fallback and a Chromium-CDP-only support matrix.
- **Over-engineering:** `browser:mode-switch` is a huge surface masquerading as a primitive. Model picker, thinking depth, Deep Research toggle, Canvas, voice, and Pro labels are volatile product policy/UI surfaces; implementing all as one CLI will be expensive and flaky.
- **Architectural mismatch:** `browser:close` already exists with `--mode disconnect|close-process|leave-open`. v1 proposes a second meaning (`--release-profile`, clean locks) without reconciling current `ManagedBrowserLauncher.close` semantics.
- **Wrong primitive boundary:** `browser:upload-and-confirm` is useful, but it should be an action postcondition option (`upload` + `until`) rather than a separate command if we want CLI/MCP/TS parity.
- **Duplication:** `browser:wait-for` overlaps current `browser:wait`; the needed extension is enabled/stable/content predicate + last-observed context, not a new noun.

#### v1 §3 Workflow registry + executor

> "`workflow_registry.json` schema + JSON-schema validation, `workflow:run` CLI"

- **Architectural mismatch:** the repo already compiles workflow files and has database tables named `workflow_definitions`, `workflow_runs`, and `run_events`. A second top-level `workflow_registry.json` risks creating a parallel system beside `configs/workflows`, examples, DB export, MCP `workflow_run`, and the consumer contract.
- **Over-engineering:** the sample schema introduces templating, recovery DSL, teardown DSL, output typing, mode requirements, and verifier primitives all at once. That is a lot of interpreter surface before one hardened Deep Research export is stable.
- **Under-engineering:** it handwaves persistence. A 19-minute Pro generation and Deep Research run can span laptop sleep/reboot. The v1 executor has no durable step cursor, idempotency keys, lease, or resume semantics.
- **Fragile assumption:** "recorded-HAR regression test" is weak for ChatGPT/LLM pages; HAR replay does not validate cross-origin sandbox frames, generated blob downloads, or non-deterministic report content.
- **Wrong primitive boundary:** workflows should call existing actions/capabilities plus a few richer action types, not embed browser-specific low-level implementation knobs into registry JSON.

#### v1 §4 Mode model

> "Extend each site adapter with explicit modes"

- **Right direction, too absolute:** modes are useful as observations, not guarantees. ChatGPT labels, feature flags, subscription tiers, locale, and rollout cohorts change; a mode detector should return confidence and evidence, not a binary contract.
- **Fragile assumption:** `[data-testid="deep-research-badge"]`, `[data-testid="deep-research-toggle"]`, and iframe `src*="connector_openai_deep_research"` did not match Round 2 exactly; the winning iframe was `about:blank` and required context-text disambiguation.
- **Architectural mismatch:** current `site_registry.json` covers literature/patent sites as static capabilities, while web-AI adapters live elsewhere. Stuffing ChatGPT mode state into the same flat catalog model may pollute research-database site enumeration.
- **Wrong primitive boundary:** mode activation should be a workflow preflight with assertions and possible human handoff, not a reusable primitive that claims idempotence across an adversarial UI.

#### v1 §5 Implementation phases

> "Total: ~2 weeks one-engineer-equivalent"

- **Under-engineering:** this estimate is fantasy if it includes six primitives, a new workflow registry, three reference workflows, recorded-HAR tests, Cloudflare detection, tracing, and dashboard-ish observability across CLI/MCP/TS.
- **Architectural mismatch:** P1 says add `browser:close`, but the command exists; P2 says create `workflow:run`, but it exists. The phase list does not distinguish new work from refactoring current surfaces.
- **Wrong order:** value should be captured by hardening Round-3 export first, then postconditions/resume, then mode detection. v1 spends early effort on `mode-switch` and a full registry before proving one durable primitive.

#### v1 §6 Open design questions

> "Where does the workflow engine live — extend the TS CLI runner, or add a Python sidecar"

- **Wrong question:** consumer contract already promises CLI/MCP/TS surfaces. Python may remain a prototype/reference, but production capability must land in TS or the contract becomes dishonest.
- **Under-engineering:** it asks about Cloudflare detection but not policy: when to stop, what to log, and what not to evade. It also asks about HAR replay but not artifact-quality verification for non-deterministic model output.
- **Missing existing-contract impact:** the plan assumes a minor version bump. A new risky browser action that emits local paths, profile ids, and traces may need explicit sensitive-field rules in `CONSUMER_CONTRACT.md`, not just new command rows.

#### v1 §7 Deliberate exclusions

> "Multi-account / multi-session workflows" and "Proxy rotation or anti-detection plumbing"

- **Correct exclusion, incomplete safety:** excluding proxy rotation is good. But Cloudflare/anti-bot handling still needs a mandatory human-handoff policy, otherwise implementers will fill the gap with stealth hacks.
- **Under-engineering:** excluding a GUI is fine, but long-running web-AI runs still need resumable JSON state, artifact indexes, and safe redaction. CLI-only does not mean stateless.
- **Hard missing exclusion:** account/billing/cost control is not named. Deep Research and Pro runs can consume scarce paid quota; workflows need budgets or explicit deferral.

#### v1 §8 Acceptance criteria

> "given only `workflow:run chatgpt_deep_research_to_docx --topic ... --output-dir ...` and a primed Chrome profile, can reproduce the round-3 deliverable"

- **Not measurable enough:** one green run is not enough. The incident already took three rounds; acceptance should require repeated fresh exports, known failure classification, and no leaked Chrome/profile state.
- **Under-engineering:** it ignores PPTX, upload readiness, reboot/resume, content verification, and cost/time bounds.
- **Fragile assumption:** "primed Chrome profile" hides the hardest operational failure modes: stale tabs, expired auth, Cloudflare challenge, `SingletonLock`, and disk growth.

### Section B — Comparative research

1. **Playwright cross-origin iframe download.** Playwright's sanctioned download model is still page/context download events: start waiting before the click, then save the `Download` object; docs say downloads are emitted by `Page` and cleaned with the browser context. Playwright has strong `frameLocator` support, and `connectOverCDP` exists, but the official docs also warn CDP attachment is lower-fidelity than Playwright protocol. I found no sanctioned Playwright 1.50+ browser-level API equivalent to CDP `Browser.setDownloadBehavior(eventsEnabled=true)` for blob downloads fired from sandbox/cross-origin iframes, so Round-3's raw CDP remains justified as a Chromium-specific escape hatch. Sources: https://github.com/microsoft/playwright.dev/blob/main/nodejs/versioned_docs/version-stable/api/class-download.mdx , https://github.com/microsoft/playwright.dev/blob/main/nodejs/versioned_docs/version-stable/api/class-browsertype.mdx .

2. **Browser Use.** Browser Use models browser automation as an LLM agent that loops over observation, planning, actions, validation, and memory rather than a static workflow registry. Its public positioning emphasizes natural-language tasks, browser sessions/profiles, custom actions, and cloud/local browser execution; I did not find iframe-download-specific guidance. Applicability: useful for resilient action selection and fallback, but too nondeterministic for this repo's consumer contract unless wrapped by explicit artifact verification and policy gates. Sources: https://github.com/browser-use/browser-use , https://docs.browser-use.com/ .

3. **Stagehand (Browserbase).** Stagehand advertises AI-native browser automation through high-level `act`, `extract`, and `observe` operations, with Playwright-compatible page access underneath. That is a good model for selector drift: observe/extract can help rediscover UI affordances, while deterministic Playwright/CDP handles the final risky click/download. Applicability: copy the split-brain pattern, not the dependency wholesale: natural-language observe for recovery, typed primitive for artifact capture. Sources: https://github.com/browserbase/stagehand , https://docs.stagehand.dev/ .

4. **Skyvern / AgentQL / MultiOn / Replit Agent.** Skyvern leans into workflow/run concepts and task automation with screenshots/AI decisions; AgentQL focuses on stable natural-language element queries over brittle selectors. These projects suggest a hybrid: keep explicit workflow state for auditability, but let discovery steps use semantic queries/observations instead of freezing every selector. I found less directly applicable public detail for MultiOn/Replit on downloadable iframe artifacts, so the lesson is abstraction shape rather than implementation. Sources: https://github.com/Skyvern-AI/skyvern , https://docs.skyvern.com/ , https://docs.agentql.com/ .

5. **OpenAI Operator / ChatGPT agent mode / Deep Research.** Public OpenAI docs now expose Deep Research through the API/Responses stack, which may eventually be a cleaner source for research artifacts than driving ChatGPT UI. I did not find an official public ChatGPT `/backend-api/...` download endpoint for exporting an existing Deep Research conversation to DOCX; relying on private routes would be brittle and likely contract-hostile. Applicability: monitor official API export possibilities, but do not base v2 on reverse-engineered ChatGPT backend routes. Sources: https://platform.openai.com/docs/guides/deep-research , https://help.openai.com/en/articles/11752874-chatgpt-agent .

6. **Cloudflare-challenge handling.** Current practice splits between stealth browser forks (`patchright`, Camoufox) and conservative human handoff. Patchright/Camoufox can reduce bot-detection friction for legitimate browsing tests, but using stealth to bypass access controls is a policy and account-risk trap; for ChatGPT/paid research databases, v2 should detect challenge/login/risk states and pause for manual completion rather than escalating evasion. Sources: https://github.com/Kaliiiiiiiiii-Vinyzu/patchright , https://github.com/daijro/camoufox , https://developers.cloudflare.com/cloudflare-challenges/ .

7. **Profile lifecycle in long-running Chrome+CDP setups.** Mature crawler stacks use browser pools, retire/recycle browser instances, cap sessions per browser, and isolate state to avoid memory leaks and runaway profile/cache growth. Crawlee documents browser pooling/session rotation concepts; Chrome profile lock files (`SingletonLock`, `SingletonSocket`) are a known operational footgun when processes die uncleanly. Applicability: implement profile lease/audit/cleanup as lifecycle management, not just a `kill` command. Sources: https://crawlee.dev/js/docs/guides/browser-pool , https://pptr.dev/ .

### Section C — Hard questions v1 does not ask

- **Reboot/resume:** a workflow run needs durable state: run id, browser profile lease, current step, step idempotency, artifacts, last URL/tab id, and recovery cursor. Without this, any Deep Research/Pro wait is a gambling session.
- **Non-deterministic output:** every artifact-producing workflow needs a verifier contract. For DOCX/PPTX, minimum parseability, character/paragraph/slide counts, title/topic match, source/citation presence, and optional manual review status must be explicit.
- **Cost/quota:** paid web-AI workflows need a budget envelope: max wall time, max model runs, max uploads, max retries, and possibly "do not start if quota is unknown".
- **Registry vs LLM runtime:** static registries are auditable but brittle; pure LLM action selection is adaptive but hard to guarantee. The right abstraction here is hybrid: deterministic steps for irreversible/risky actions and semantic discovery only inside bounded recovery/preflight.
- **Record-and-replay:** the current site catalog is static. For volatile web-AI UI, the better seed is a recorded green trace with screenshots, DOM snippets, frame tree, click bboxes, and artifact events; generated workflow definitions should be derived from traces, not hand-authored from memory alone.
- **Locale/account variance:** selectors and labels differ by locale, plan tier, rollout cohort, and conversation state. The plan must support locale-aware aliases and evidence-based mode confidence.
- **Sensitive traces:** CDP logs, screenshots, profile dirs, conversation URLs, and artifact paths are sensitive local fields. Trace storage/redaction must be part of the contract.

---

## v2 proposal

### Changes from v1

This v2 rejects v1's "build a new workflow registry first" path (see A §3, A §5). It keeps the strongest v1 ideas—browser-level CDP download capture, upload readiness postconditions, mode evidence, and lifecycle audit—but folds them into the existing CLI/MCP/TS workflow/action architecture (see A §1-§4). The full document is longer than v1 because the user required Sections A-E inline; the **v2 plan body** is intentionally shorter and narrower than v1.

### 1. Diagnosis

The incident exposed a weaker truth than v1 claimed: the repo has workflows, but they are not durable enough for volatile web-AI sessions. The gap is a missing **stateful execution contract** around existing actions: frame-aware artifact capture, postconditions, mode evidence, resumable run state, verification, and profile lifecycle.

### 2. Primitive ranking by value vs cost

1. **P0: `browser:artifact-click` / action type `artifactClick`** — highest value. Generalize Round-3: locate across frames, optional scroll recipe, contextual ancestor-text filter, CDP coordinate click, browser-level download events, filename pattern, sha256, parse verifier hook. Chromium-CDP only; Playwright download fallback first when it works.
2. **P0: postconditions on existing actions** — extend `upload`, `click`, and `wait` with `until: visible|enabled|stable|download|contentRegex` and last-observed evidence. This replaces separate `upload-and-confirm` and `wait-for` commands.
3. **P1: profile lifecycle lease/audit** — extend existing `browser:close/status/profiles` with run ownership, stale-process detection, lock-file warning/cleanup only when no live Chrome owns the profile, cache-size reporting, and close mode clarity.
4. **P1: mode evidence detector** — add read-only `mode:detect` capability returning `{mode, confidence, evidence, missingSignals}`. Do not build a broad `mode-switch` primitive yet.
5. **P2: semantic rediscovery helper** — bounded `observe`/AgentQL-like recovery that can suggest selectors from accessibility/DOM/screenshot evidence, but cannot perform risky sends/downloads without deterministic confirmation.

### 3. Workflow model decision

Commit to the **existing workflow engine**, not a new `workflow_registry.json`. Add schema fields to current workflow files/plans: `preflight`, `postconditions`, `resumePolicy`, `budget`, `verifiers`, `teardown`, and `traceRedaction`. Store compiled definitions/runs in the existing capability DB and expose them through the existing CLI/MCP/TS contract.

Static workflow definitions remain the audit source. AI-driven action selection is allowed only inside explicit discovery/recovery steps whose outputs are recorded as evidence and then consumed by deterministic actions.

### 4. Reference workflow for first delivery

Ship exactly one green reference first: `chatgpt_deep_research_export_docx`.

Required steps: preflight health/profile/mode evidence; open known/new conversation; wait for completed Deep Research report; locate export affordance across frames with locale aliases; capture DOCX with `artifactClick`; verify DOCX parseability and topic/content thresholds; record trace; close/disconnect according to lease policy.

Do not include PPTX or Claude project workflows in the first slice. PPTX remains a second workflow after DOCX proves repeatable.

### 5. Resumability and reboot handling

Every workflow run writes a durable event after each step: run id, step id, status, inputs hash, outputs/artifact ids, browser profile lease, tab id/URL, and verifier result. On restart, `workflow:run --resume <run-id>` resumes only from idempotent wait/verify/export steps; prompt submission or paid model-start steps require explicit budget confirmation or manual review.

### 6. Verification contract for model output

Artifact workflows must declare verifiers. DOCX minimum: valid zip/docx parse, sha256, size, paragraph count, character count, title/topic regex, citation/source marker count, and "freshness" check when a prior artifact path is known. PPTX minimum: valid pptx parse, slide count, non-empty titles, topic regex, and file-card provenance if captured from UI.

A workflow is not successful merely because a download completed.

### 7. Cost, quota, and human handoff

Each run has `budget`: max wall time, max retries, max paid submissions, max downloads, and optional max uploaded bytes. Cloudflare, login wall, billing prompt, account switch, CAPTCHA, suspicious automation warning, or quota ambiguity must produce `HUMAN_HANDOFF_REQUIRED`; v2 will not implement stealth/proxy bypass.

### 8. Implementation phases

- **Phase 1 (2-3 days):** implement `artifactClick` in TS with tests around mocked CDP/download events; extend action postconditions; update consumer contract sensitive-field notes.
- **Phase 2 (2-3 days):** durable run events/resume skeleton, profile lease/audit improvements, trace redaction defaults.
- **Phase 3 (2-3 days):** one ChatGPT Deep Research DOCX workflow from the Round-3 trace, with verifier and locale/context aliases.
- **Phase 4 (1-2 days):** repeatability runbook and failure taxonomy; then decide whether PPTX is next.

### 9. Success metric

v2 closes the gap only if, on a primed ChatGPT profile, `workflow:run configs/workflows/chatgpt-deep-research-docx.yaml --json` completes **3 fresh DOCX exports in 3 attempts or at least 3/5 attempts**, each under **10 minutes after the report is already complete**, with: valid DOCX, `>=50` paragraphs, `>=5,000` text chars, topic regex match, sha256 recorded, trace recorded/redacted, no orphan Chrome process owned by the run, profile cache growth reported, and every failure classified into a stable code (`IFRAME_NOT_FOUND`, `ARTIFACT_DOWNLOAD_TIMEOUT`, `MODE_UNCERTAIN`, `HUMAN_HANDOFF_REQUIRED`, etc.).

---

## Honest unknowns

1. **Playwright roadmap:** I did not find a current official Playwright API that replaces browser-level CDP download events for sandboxed iframe blob downloads, but this should be rechecked against release notes/issues before implementation. Tried: https://github.com/microsoft/playwright.dev/blob/main/nodejs/versioned_docs/version-stable/api/class-download.mdx and https://github.com/microsoft/playwright.dev/blob/main/nodejs/versioned_docs/version-stable/api/class-browsertype.mdx .
2. **Official ChatGPT export endpoint:** I found official Deep Research API/docs, but no public supported endpoint to export an existing ChatGPT Deep Research conversation as DOCX. Tried: https://platform.openai.com/docs/guides/deep-research and https://help.openai.com/en/articles/11752874-chatgpt-agent .
3. **Browser Use iframe-download behavior:** Browser Use documents agent/task abstractions, but I did not find explicit handling of cross-origin iframe blob downloads. Tried: https://github.com/browser-use/browser-use and https://docs.browser-use.com/ .
4. **Stagehand download semantics:** Stagehand's high-level `act/observe/extract` pattern is relevant, but I did not confirm whether it wraps browser-level download capture or relies on Playwright page downloads. Tried: https://github.com/browserbase/stagehand and https://docs.stagehand.dev/ .
5. **Cloudflare boundary:** Patchright/Camoufox may work technically, but the project needs a policy decision on whether any stealth tooling is allowed for paid AI/research sites. Tried: https://github.com/Kaliiiiiiiiii-Vinyzu/patchright , https://github.com/daijro/camoufox , https://developers.cloudflare.com/cloudflare-challenges/ .
6. **Profile cleanup exact safety:** Stale `SingletonLock` cleanup is safe only if the owning process is dead; implementation needs OS-specific process/lock validation. Tried: https://crawlee.dev/js/docs/guides/browser-pool and https://pptr.dev/ .
