# Consumer Contract

Package: `web-ai-research-automation-hub` v1.0.0
Contract: `consumer-contract-1.9.0`

This document is generated from `configs/consumer-contract.json`, the authoritative public integration contract for packages that consume the hub as a dependency. It does not change the existing safety policy, manual-login boundary, confirmation policy, or CLI/MCP tool behavior.

## Release notes

- consumer-contract-1.8.0 (2026-05-24 Chrome Extension #15 Phase 3): adds BrowserPagePort backend infrastructure plus Native Messaging bridge error taxonomy for the extension-assisted CDP path. No new commands; commands remain 191, webai_ remains 40, research_ remains 121, wah_ remains 8, and error codes increase 36→39.
- consumer-contract-1.7.2 (2026-05-23 post-refactor W1): added webai_chatgpt_select_model + webai_claude_select_model standalone tools (parallel to webai_gemini_select_model shipped fcbce82). 2 new commands, webai_ 38→40, no error code changes. Underlying selectors already in src/mcp/tools.ts since pre-refactor — this exposes them as first-class MCP/CLI surfaces.
- consumer-contract-1.7.1 (2026-05-23 P3 v1.0 cut): first GA release; obsolete handwritten paths removed; manifest-driven architecture is now the only path; migration notes at docs/MIGRATION_v3.2.md. No surface change.
- consumer-contract-1.7.1 (2026-05-23 P2): wires ExecutionEngine live through 159 legacy aliases; cancel + heartbeat + TTL fully active; drift_events table starts accumulating; adds 2 error codes (PROFILE_LEASE_TIMEOUT, TAB_LEASE_EXPIRED) for lease-lifecycle failures. No new commands, no surface change.
- consumer-contract-1.7.0 (2026-05-23): P1 atomic refactor adds 8 wah_* facade tools (181→189), 2 error codes (32→34: UI_DRIFT_DETECTED, HEAL_CONFIDENCE_LOW), and ports 159 existing tools onto the manifest-driven generator without surface change.
- consumer-contract-1.6.0 (2026-05-20): adds Gemini-only `webai:gemini:select-model` / `webai_gemini_select_model` for programmatic model and thinking-level selection; command rows 181, `webai_*` rows 38, error-code taxonomy unchanged at 32.
- consumer-contract-1.5.0 (2026-05-16): deliberate breaking rename of the prior institution-specific import surface to `research:inventory:import` / `research_inventory_import` / `ResearchDbImporter.importInventorySeed`; package version is now `0.7.0`.
- Phase-B #8 (same contract/package versions): SCOAP3, DBLP, SciELO, INSPIRE-HEP, and PubScholar add 15 plain non-`webai_` research database MCP tools, bringing the locked per-DB research round-trip set to 102 while webai/sub-MCP/error-code counts remain 37/11/32.
- Phase-B #7 (same contract/package versions): Frontiers, arXiv, SIAM, De Gruyter, World Scientific, and Royal Society add 18 plain non-`webai_` research database MCP tools, bringing the locked research round-trip set to 87 while webai/sub-MCP/error-code counts remain 37/11/32.
- consumer-contract-1.5.0 (2026-05-15): chatgpt-codex is live only for the hard-allowlisted `LT-0I/CN-` environment; `submit-task` requires `confirmed=true`, `get-diff` returns code `diff_text` and never clicks Create PR. Webai count remains 37.
- consumer-contract-1.5.0 (2026-05-15): Stream #5 reconciliation confirms 13 pre-existing webai tools → 37 total, 3 new error codes (SENSITIVE_CONTENT_GUARD, SUBMCP_QUOTA_EXHAUSTED, SUBMCP_NOT_PROVISIONED), and model/control parameter updates on existing tools. No phantom tool was added. Sub-MCP modules: claude-design (4 tools, live), gemini-music (3 tools, live), chatgpt-codex (4 tools, live LT-0I/CN- allowlisted).
- Phase C correctness notes (same contract version): `tab_url_contains` is honored as a tab selector/URL hint for Claude send/design and Gemini music/conversation tools; ChatGPT conversation `menu_enumerate` uses the in-chat header options button, `search` uses Control+k, and `share` uses `aria-label="Share"`. Claude Design timeout failures return stable contract codes instead of raw Playwright timeout strings.
- Stream #5 final Claude Design generate note (same contract version): `webai:claude:design:generate` completion is recognized from the served design iframe (`/v1/design/projects/<id>/serve/<file>`) with the existing `?file=<name>.html` URL as a fallback, and timeout/quota envelopes still emit the contracted `status`, `model_used`, `projectUrl`, and `fileName` keys.
- Stream #5 Pulse integration note (same contract version): `webai:chatgpt:pulse:get` and `webai:chatgpt:pulse:onboard` add the live-discovered ChatGPT Pulse surface, increasing `webai_*` command rows from 35 to 37; error code count remains 32.

## Public surfaces

The contract covers three surfaces:

1. **CLI**: colon-style commands, for example `consumer:health`.
2. **MCP**: underscore-style tools/resources, for example `consumer_health`.
3. **TypeScript API**: direct imports from the package barrel, for example `consumerHealth`.

Unlisted commands remain developer/automation surfaces documented elsewhere and are not schema-stable under this consumer contract.

## Consumer-safe health probe

`consumer:health` is the preferred health-check entry point for safe consumers. It returns a deliberately narrow JSON object and must not include forbidden local/browser fields.

```bash
node dist/src/cli.js consumer:health --target chatgpt --profile chatgpt --json
```

```ts
import { consumerHealth } from "web-ai-research-automation-hub";

const result = await consumerHealth({ target: "chatgpt", profile: "chatgpt" });
```

Stable JSON keys are exactly:

| Key | Type | Guarantee |
| --- | --- | --- |
| `ok` | contracted | Always present. |
| `target` | contracted | Always present. |
| `profile` | contracted | Always present. |
| `connected` | contracted | Always present. |
| `pageCount` | contracted | Always present. |
| `loginLikeState` | contracted | Always present. |
| `status` | contracted | Always present. |
| `errorCode` | contracted | Always present. |
| `message` | contracted | Always present. |
| `checkedAt` | contracted | Always present. |

## CLI / MCP / TypeScript mapping

| CLI name | MCP name | TypeScript API | Maturity | Safety class | Sensitive local fields possible? |
| --- | --- | --- | --- | --- | --- |
| `consumer:health` | `consumer_health` | `consumerHealth` | stable | read | no |
| `browser:status` | `browser_status` | `ManagedBrowserLauncher.status` | stable | read | yes |
| `browser:pages` | `browser_pages` | `ManagedBrowserLauncher.pages` | stable | read | yes |
| `capability:query` | `capability_query` | `CapabilityDatabase.queryCapabilities` | experimental | read | no |
| `capability:export` | `capability_export` | `CapabilityDatabase.exportJson` | experimental | read | yes |
| `capability:library:import` | `capability_library_import` | `CapabilityLibraryImporter.importFile` | experimental | mutate | no |
| `research:inventory:import` | `research_inventory_import` | `ResearchDbImporter.importInventorySeed` | experimental | mutate | no |
| `research:aiaa:search` | `research_aiaa_search` | `researchAiaaSearch` | experimental | read | no |
| `research:aiaa:filter` | `research_aiaa_filter` | `researchAiaaFilter` | experimental | read | no |
| `research:aiaa:export` | `research_aiaa_export` | `researchAiaaExport` | experimental | mutate | no |
| `research:wos:search` | `research_wos_search` | `researchWosSearch` | experimental | read | no |
| `research:wos:filter` | `research_wos_filter` | `researchWosFilter` | experimental | read | no |
| `research:wos:export` | `research_wos_export` | `researchWosExport` | experimental | mutate | no |
| `research:acm:search` | `research_acm_search` | `researchAcmSearch` | experimental | read | no |
| `research:acm:filter` | `research_acm_filter` | `researchAcmFilter` | experimental | read | no |
| `research:acm:export` | `research_acm_export` | `researchAcmExport` | experimental | mutate | no |
| `research:ieee:search` | `research_ieee_search` | `researchIeeeSearch` | experimental | read | no |
| `research:ieee:filter` | `research_ieee_filter` | `researchIeeeFilter` | experimental | read | no |
| `research:ieee:export` | `research_ieee_export` | `researchIeeeExport` | experimental | mutate | no |
| `research:acs:search` | `research_acs_search` | `researchAcsSearch` | experimental | read | no |
| `research:acs:filter` | `research_acs_filter` | `researchAcsFilter` | experimental | read | no |
| `research:acs:export` | `research_acs_export` | `researchAcsExport` | experimental | mutate | no |
| `research:asme:search` | `research_asme_search` | `researchAsmeSearch` | experimental | read | no |
| `research:asme:filter` | `research_asme_filter` | `researchAsmeFilter` | experimental | read | no |
| `research:asme:export` | `research_asme_export` | `researchAsmeExport` | experimental | mutate | no |
| `research:rsc:search` | `research_rsc_search` | `researchRscSearch` | experimental | read | no |
| `research:rsc:filter` | `research_rsc_filter` | `researchRscFilter` | experimental | read | no |
| `research:rsc:export` | `research_rsc_export` | `researchRscExport` | experimental | mutate | no |
| `research:wiley:search` | `research_wiley_search` | `researchWileySearch` | experimental | read | no |
| `research:wiley:filter` | `research_wiley_filter` | `researchWileyFilter` | experimental | read | no |
| `research:wiley:export` | `research_wiley_export` | `researchWileyExport` | experimental | mutate | no |
| `research:asce:search` | `research_asce_search` | `researchAsceSearch` | experimental | read | no |
| `research:asce:filter` | `research_asce_filter` | `researchAsceFilter` | experimental | read | no |
| `research:asce:export` | `research_asce_export` | `researchAsceExport` | experimental | mutate | no |
| `research:iop:search` | `research_iop_search` | `researchIopSearch` | experimental | read | no |
| `research:iop:filter` | `research_iop_filter` | `researchIopFilter` | experimental | read | no |
| `research:iop:export` | `research_iop_export` | `researchIopExport` | experimental | mutate | no |
| `research:tandf:search` | `research_tandf_search` | `researchTandfSearch` | experimental | read | no |
| `research:tandf:filter` | `research_tandf_filter` | `researchTandfFilter` | experimental | read | no |
| `research:tandf:export` | `research_tandf_export` | `researchTandfExport` | experimental | mutate | no |
| `research:sae:search` | `research_sae_search` | `researchSaeSearch` | experimental | read | no |
| `research:sae:filter` | `research_sae_filter` | `researchSaeFilter` | experimental | read | no |
| `research:sae:export` | `research_sae_export` | `researchSaeExport` | experimental | mutate | no |
| `research:sciencedirect:search` | `research_sciencedirect_search` | `researchScienceDirectSearch` | experimental | read | no |
| `research:sciencedirect:filter` | `research_sciencedirect_filter` | `researchScienceDirectFilter` | experimental | read | no |
| `research:sciencedirect:export` | `research_sciencedirect_export` | `researchScienceDirectExport` | experimental | mutate | no |
| `research:aps:search` | `research_aps_search` | `researchApsSearch` | experimental | read | no |
| `research:aps:filter` | `research_aps_filter` | `researchApsFilter` | experimental | read | no |
| `research:aps:export` | `research_aps_export` | `researchApsExport` | experimental | mutate | no |
| `research:emerald:search` | `research_emerald_search` | `researchEmeraldSearch` | experimental | read | no |
| `research:emerald:filter` | `research_emerald_filter` | `researchEmeraldFilter` | experimental | read | no |
| `research:emerald:export` | `research_emerald_export` | `researchEmeraldExport` | experimental | mutate | no |
| `research:cambridge:search` | `research_cambridge_search` | `researchCambridgeSearch` | experimental | read | no |
| `research:cambridge:filter` | `research_cambridge_filter` | `researchCambridgeFilter` | experimental | read | no |
| `research:cambridge:export` | `research_cambridge_export` | `researchCambridgeExport` | experimental | mutate | no |
| `research:springer:search` | `research_springer_search` | `researchSpringerSearch` | experimental | read | no |
| `research:springer:filter` | `research_springer_filter` | `researchSpringerFilter` | experimental | read | no |
| `research:springer:export` | `research_springer_export` | `researchSpringerExport` | experimental | mutate | no |
| `research:nature:search` | `research_nature_search` | `researchNatureSearch` | experimental | read | no |
| `research:nature:filter` | `research_nature_filter` | `researchNatureFilter` | experimental | read | no |
| `research:nature:export` | `research_nature_export` | `researchNatureExport` | experimental | mutate | no |
| `research:iet:search` | `research_iet_search` | `researchIetSearch` | experimental | read | no |
| `research:iet:filter` | `research_iet_filter` | `researchIetFilter` | experimental | read | no |
| `research:iet:export` | `research_iet_export` | `researchIetExport` | experimental | mutate | no |
| `research:aip:search` | `research_aip_search` | `researchAipSearch` | experimental | read | no |
| `research:aip:filter` | `research_aip_filter` | `researchAipFilter` | experimental | read | no |
| `research:aip:export` | `research_aip_export` | `researchAipExport` | experimental | mutate | no |
| `research:frontiers:search` | `research_frontiers_search` | `researchFrontiersSearch` | experimental | read | no |
| `research:frontiers:filter` | `research_frontiers_filter` | `researchFrontiersFilter` | experimental | read | no |
| `research:frontiers:export` | `research_frontiers_export` | `researchFrontiersExport` | experimental | mutate | no |
| `research:arxiv:search` | `research_arxiv_search` | `researchArxivSearch` | experimental | read | no |
| `research:arxiv:filter` | `research_arxiv_filter` | `researchArxivFilter` | experimental | read | no |
| `research:arxiv:export` | `research_arxiv_export` | `researchArxivExport` | experimental | mutate | no |
| `research:siam:search` | `research_siam_search` | `researchSiamSearch` | experimental | read | no |
| `research:siam:filter` | `research_siam_filter` | `researchSiamFilter` | experimental | read | no |
| `research:siam:export` | `research_siam_export` | `researchSiamExport` | experimental | mutate | no |
| `research:degruyter:search` | `research_degruyter_search` | `researchDegruyterSearch` | experimental | read | no |
| `research:degruyter:filter` | `research_degruyter_filter` | `researchDegruyterFilter` | experimental | read | no |
| `research:degruyter:export` | `research_degruyter_export` | `researchDegruyterExport` | experimental | mutate | no |
| `research:worldsci:search` | `research_worldsci_search` | `researchWorldsciSearch` | experimental | read | no |
| `research:worldsci:filter` | `research_worldsci_filter` | `researchWorldsciFilter` | experimental | read | no |
| `research:worldsci:export` | `research_worldsci_export` | `researchWorldsciExport` | experimental | mutate | no |
| `research:royalsoc:search` | `research_royalsoc_search` | `researchRoyalSocSearch` | experimental | read | no |
| `research:royalsoc:filter` | `research_royalsoc_filter` | `researchRoyalSocFilter` | experimental | read | no |
| `research:royalsoc:export` | `research_royalsoc_export` | `researchRoyalSocExport` | experimental | mutate | no |
| `research:scoap3:search` | `research_scoap3_search` | `researchScoap3Search` | experimental | read | no |
| `research:scoap3:filter` | `research_scoap3_filter` | `researchScoap3Filter` | experimental | read | no |
| `research:scoap3:export` | `research_scoap3_export` | `researchScoap3Export` | experimental | mutate | no |
| `research:dblp:search` | `research_dblp_search` | `researchDblpSearch` | experimental | read | no |
| `research:dblp:filter` | `research_dblp_filter` | `researchDblpFilter` | experimental | read | no |
| `research:dblp:export` | `research_dblp_export` | `researchDblpExport` | experimental | mutate | no |
| `research:scielo:search` | `research_scielo_search` | `researchScieloSearch` | experimental | read | no |
| `research:scielo:filter` | `research_scielo_filter` | `researchScieloFilter` | experimental | read | no |
| `research:scielo:export` | `research_scielo_export` | `researchScieloExport` | experimental | mutate | no |
| `research:inspirehep:search` | `research_inspirehep_search` | `researchInspirehepSearch` | experimental | read | no |
| `research:inspirehep:filter` | `research_inspirehep_filter` | `researchInspirehepFilter` | experimental | read | no |
| `research:inspirehep:export` | `research_inspirehep_export` | `researchInspirehepExport` | experimental | mutate | no |
| `research:pubscholar:search` | `research_pubscholar_search` | `researchPubscholarSearch` | experimental | read | no |
| `research:pubscholar:filter` | `research_pubscholar_filter` | `researchPubscholarFilter` | experimental | read | no |
| `research:pubscholar:export` | `research_pubscholar_export` | `researchPubscholarExport` | experimental | mutate | no |
| `research:opticsjournal:search` | `research_opticsjournal_search` | `researchOpticsjournalSearch` | experimental | read | no |
| `research:opticsjournal:filter` | `research_opticsjournal_filter` | `researchOpticsjournalFilter` | experimental | read | no |
| `research:opticsjournal:export` | `research_opticsjournal_export` | `researchOpticsjournalExport` | experimental | mutate | no |
| `research:crc:search` | `research_crc_search` | `researchCrcSearch` | experimental | read | no |
| `research:crc:filter` | `research_crc_filter` | `researchCrcFilter` | experimental | read | no |
| `research:crc:export` | `research_crc_export` | `researchCrcExport` | experimental | mutate | no |
| `research:cellpress:search` | `research_cellpress_search` | `researchCellpressSearch` | experimental | read | no |
| `research:cellpress:filter` | `research_cellpress_filter` | `researchCellpressFilter` | experimental | read | no |
| `research:cellpress:export` | `research_cellpress_export` | `researchCellpressExport` | experimental | mutate | no |
| `research:iest:search` | `research_iest_search` | `researchIestSearch` | experimental | read | no |
| `research:iest:filter` | `research_iest_filter` | `researchIestFilter` | experimental | read | no |
| `research:iest:export` | `research_iest_export` | `researchIestExport` | experimental | mutate | no |
| `research:incopat:search` | `research_incopat_search` | `researchIncopatSearch` | experimental | read | no |
| `research:incopat:filter` | `research_incopat_filter` | `researchIncopatFilter` | experimental | read | no |
| `research:incopat:export` | `research_incopat_export` | `researchIncopatExport` | experimental | mutate | no |
| `research:wanfang:search` | `research_wanfang_search` | `researchWanfangSearch` | experimental | read | no |
| `research:wanfang:filter` | `research_wanfang_filter` | `researchWanfangFilter` | experimental | read | no |
| `research:wanfang:export` | `research_wanfang_export` | `researchWanfangExport` | experimental | mutate | no |
| `capability:update` | `capability_update` | `CapabilityUpdater.updateFromSnapshot` | experimental | mutate | yes |
| `workflow:compile` | `workflow_compile` | `WorkflowCompiler.compileFile` | experimental | read | yes |
| `workflow:run` | `workflow_run` | `WorkflowExecutor.runFile` | experimental | risky | yes |
| `browser:read` | `browser_read` | `readPageSnapshot` | experimental | read | yes |
| `browser:read --include-portals` | `browser_read.includePortals` | `readPageSnapshot({includePortals:true})` | experimental | read | yes |
| `browser:screenshot` | `browser_screenshot` | `readPageSnapshot` | experimental | read | yes |
| `browser:launch` | `browser_launch` | `ManagedBrowserLauncher.launch` | experimental | mutate | yes |
| `browser:open` | `browser_open` | `BrowserSessionManager.open` | experimental | mutate | yes |
| `mcp:tools` | n/a | `listMcpTools` | stable | read | no |
| `mcp:resources` | n/a | `listMcpResources` | stable | read | no |
| `browser:click` | n/a | `ActionExecutor.execute({type:'click'})` | experimental | mutate | yes |
| `browser:upload` | n/a | `ActionExecutor.execute({type:'upload'})` | experimental | risky | yes |
| `browser:wait` | n/a | `ActionExecutor.execute({type:'wait'})` | experimental | read | yes |
| `browser:hover --dwell-ms --settle-selector` | n/a | `ActionExecutor.execute({type:'hover'})` | experimental | mutate | no |
| `browser:artifact-click` | n/a | `runArtifactClick` | experimental | risky | yes |
| `verify:docx-min` | n/a | `verifyDocxMin` | experimental | read | yes |
| `browser:audit` | n/a | `auditProfiles` | experimental | read | yes |

## Contract 1.9.0 webai MCP tools

Generated from the manifest: 40 current `webai_*` command rows: 13 pre-existing + 16 main-server (+2 Pulse + 3 standalone model selectors) + 11 sub-MCP. Contract 1.9.0 keeps the 40 webai command rows from 1.8.0 and adds only the ChatGPT generate-image `backend` optional argument; no new MCP tools or error codes are added in Chrome Extension Phase 4.

### Original/B1 existing webai tools

| CLI name | MCP name | TypeScript API | Maturity | Safety class | Sensitive local fields possible? |
| --- | --- | --- | --- | --- | --- |
| `webai:chatgpt:send-prompt` | `webai_chatgpt_send_prompt` | `webAiChatgptSendPrompt` | experimental | read | no |
| `webai:claude:send-prompt` | `webai_claude_send_prompt` | `webAiClaudeSendPrompt` | experimental | read | no |
| `webai:gemini:send-prompt` | `webai_gemini_send_prompt` | `webAiGeminiSendPrompt` | experimental | read | no |
| `webai:chatgpt:upload-and-query` | `webai_chatgpt_upload_and_query` | `webAiChatgptUploadAndQuery` | experimental | mutate | no |
| `webai:claude:upload-and-query` | `webai_claude_upload_and_query` | `webAiClaudeUploadAndQuery` | experimental | mutate | no |
| `webai:gemini:upload-and-query` | `webai_gemini_upload_and_query` | `webAiGeminiUploadAndQuery` | experimental | mutate | no |
| `webai:chatgpt:generate-file` | `webai_chatgpt_generate_file` | `webAiChatgptGenerateFile` | experimental | mutate | no |
| `webai:claude:generate-file` | `webai_claude_generate_file` | `webAiClaudeGenerateFile` | experimental | mutate | no |
| `webai:chatgpt:generate-image` | `webai_chatgpt_generate_image` | `webAiChatgptGenerateImage` | experimental | mutate | no |
| `webai:gemini:generate-image` | `webai_gemini_generate_image` | `webAiGeminiGenerateImage` | experimental | mutate | no |
| `webai:gemini:canvas-to-docs` | `webai_gemini_canvas_to_docs` | `webAiGeminiCanvasToDocs` | experimental | mutate | no |
| `webai:gemini:generate-video` | `webai_gemini_generate_video` | `webAiGeminiGenerateVideo` | experimental | risky | no |
| `webai:task-status` | `webai_task_status` | `webAiTaskStatus` | experimental | read | no |

### Stream #5 + W1 main-server tools (B2-B4 + Pulse + model selectors)

| CLI name | MCP name | TypeScript API | Maturity | Safety class | Sensitive local fields possible? |
| --- | --- | --- | --- | --- | --- |
| `webai:gemini:deep-research` | `webai_gemini_deep_research` | `webAiGeminiDeepResearch` | experimental | mutate | no |
| `webai:gemini:canvas-edit` | `webai_gemini_canvas_edit` | `webAiGeminiCanvasEdit` | experimental | mutate | no |
| `webai:gemini:conversation-manage` | `webai_gemini_conversation_manage` | `webAiGeminiConversationManage` | experimental | mutate | no |
| `webai:gemini:workspace` | `webai_gemini_workspace` | `webAiGeminiWorkspace` | experimental | read | no |
| `webai:chatgpt:select-model` | `webai_chatgpt_select_model` | `webAiChatgptSelectModel` | experimental | mutate | no |
| `webai:claude:select-model` | `webai_claude_select_model` | `webAiClaudeSelectModel` | experimental | mutate | no |
| `webai:gemini:select-model` | `webai_gemini_select_model` | `webAiGeminiSelectModel` | experimental | mutate | no |
| `webai:chatgpt:canvas-export` | `webai_chatgpt_canvas_export` | `webAiChatgptCanvasExport` | experimental | mutate | yes |
| `webai:chatgpt:pulse:get` | `webai_chatgpt_pulse_get` | `webAiChatgptPulseGet` | experimental | read | no |
| `webai:chatgpt:pulse:onboard` | `webai_chatgpt_pulse_onboard` | `webAiChatgptPulseOnboard` | experimental | mutate | no |
| `webai:chatgpt:deep-research` | `webai_chatgpt_deep_research` | `webAiChatgptDeepResearch` | experimental | mutate | no |
| `webai:claude:deep-research` | `webai_claude_deep_research` | `webAiClaudeDeepResearch` | experimental | mutate | no |
| `webai:chatgpt:conversation-manage` | `webai_chatgpt_conversation_manage` | `webAiChatgptConversationManage` | experimental | mutate | no |
| `webai:claude:conversation-manage` | `webai_claude_conversation_manage` | `webAiClaudeConversationManage` | experimental | mutate | no |
| `webai:chatgpt:workspace` | `webai_chatgpt_workspace` | `webAiChatgptWorkspace` | experimental | read | no |
| `webai:claude:workspace` | `webai_claude_workspace` | `webAiClaudeWorkspace` | experimental | read | no |

### Stream #5 sub-MCP tools (B5-B7)

| CLI name | MCP name | TypeScript API | Maturity | Safety class | Sensitive local fields possible? |
| --- | --- | --- | --- | --- | --- |
| `webai:chatgpt:codex:submit-task` | `webai_chatgpt_codex_submit_task` | `webAiChatgptCodexSubmitTask` | experimental | mutate | no |
| `webai:chatgpt:codex:list-envs` | `webai_chatgpt_codex_list_envs` | `webAiChatgptCodexListEnvs` | experimental | read | no |
| `webai:chatgpt:codex:task-status` | `webai_chatgpt_codex_task_status` | `webAiChatgptCodexTaskStatus` | experimental | read | no |
| `webai:chatgpt:codex:get-diff` | `webai_chatgpt_codex_get_diff` | `webAiChatgptCodexGetDiff` | experimental | read | yes |
| `webai:claude:design:create-project` | `webai_claude_design_create_project` | `webAiClaudeDesignCreateProject` | experimental | mutate | no |
| `webai:claude:design:generate` | `webai_claude_design_generate` | `webAiClaudeDesignGenerate` | experimental | mutate | no |
| `webai:claude:design:get-html` | `webai_claude_design_get_html` | `webAiClaudeDesignGetHtml` | experimental | read | yes |
| `webai:claude:design:present` | `webai_claude_design_present` | `webAiClaudeDesignPresent` | experimental | mutate | no |
| `webai:gemini:music:generate` | `webai_gemini_music_generate` | `webAiGeminiMusicGenerate` | experimental | mutate | no |
| `webai:gemini:music:download-track` | `webai_gemini_music_download_track` | `webAiGeminiMusicDownloadTrack` | experimental | read | yes |
| `webai:gemini:music:task-status` | `webai_gemini_music_task_status` | `webAiGeminiMusicTaskStatus` | experimental | read | no |

### Webai optional-argument contract

| Tool | Optional args |
| --- | --- |
| `webai:chatgpt:send-prompt` / `webai_chatgpt_send_prompt` | `model`, `web_search`, `canvas` |
| `webai:claude:send-prompt` / `webai_claude_send_prompt` | `model`, `thinking`, `web_search`, `incognito`, `tab_url_contains` |
| `webai:gemini:send-prompt` / `webai_gemini_send_prompt` | `model`, `thinking`, `web_search` |
| `webai:chatgpt:select-model` / `webai_chatgpt_select_model` | `model`, `thinking_level` |
| `webai:claude:select-model` / `webai_claude_select_model` | `model`, `thinking_level` |
| `webai:gemini:select-model` / `webai_gemini_select_model` | `model`, `thinking_level` |
| `webai:chatgpt:upload-and-query` / `webai_chatgpt_upload_and_query` | `model` |
| `webai:claude:upload-and-query` / `webai_claude_upload_and_query` | `model`, `reuse_conversation` |
| `webai:gemini:upload-and-query` / `webai_gemini_upload_and_query` | `model` |
| `webai:gemini:generate-video` / `webai_gemini_generate_video` | `model`, `account_pool` |

### Webai output-key contract

| Tool | Always-present output keys | Optional output keys |
| --- | --- | --- |
| `webai:chatgpt:send-prompt` / `webai_chatgpt_send_prompt` | `conversation_id`, `chat_url`, `response_text`, `model_used`, `elapsed_ms`, `wait_ms`, `completion_detected`, `reuse_conversation`, `errorCode` | `ok`, `service`, `error_code`, `expected_model` |
| `webai:claude:send-prompt` / `webai_claude_send_prompt` | `conversation_id`, `chat_url`, `response_text`, `elapsed_ms`, `wait_ms`, `completion_detected`, `errorCode` | `ok`, `service`, `error_code`, `expected_model` |
| `webai:gemini:send-prompt` / `webai_gemini_send_prompt` | `chat_url`, `response_text`, `model_used`, `elapsed_ms`, `wait_ms`, `completion_detected`, `errorCode`, `reuse_conversation` | `ok`, `service`, `error_code`, `expected_model` |
| `webai:chatgpt:select-model` / `webai_chatgpt_select_model` | `ok`, `selected_model`, `selected_thinking_level`, `errorCode` | _(none)_ |
| `webai:claude:select-model` / `webai_claude_select_model` | `ok`, `selected_model`, `selected_thinking_level`, `errorCode` | _(none)_ |
| `webai:gemini:select-model` / `webai_gemini_select_model` | `ok`, `selected_model`, `selected_thinking_level`, `errorCode` | _(none)_ |
| `webai:chatgpt:upload-and-query` / `webai_chatgpt_upload_and_query` | `conversation_id`, `attachment_names`, `response_text`, `wait_ms`, `completion_detected`, `errorCode` | `error_code`, `expected_model` |
| `webai:claude:upload-and-query` / `webai_claude_upload_and_query` | `files_uploaded_count`, `attachment_names`, `chat_url`, `response_text`, `wait_ms`, `completion_detected`, `errorCode` | `error_code`, `expected_model` |
| `webai:gemini:upload-and-query` / `webai_gemini_upload_and_query` | `files_in_chip`, `response_text`, `chat_url`, `wait_ms`, `completion_detected`, `errorCode` | `ok`, `error_code`, `selector`, `expected_selector`, `expected_model` |
| `webai:chatgpt:generate-file` / `webai_chatgpt_generate_file` | `path`, `sha256`, `size_bytes`, `suggested_filename`, `errorCode`, `download_filename` | `WARN`, `expected_model` |
| `webai:claude:generate-file` / `webai_claude_generate_file` | `path`, `sha256`, `size_bytes`, `artifact_name`, `errorCode`, `download_filename` | `WARN`, `expected_model` |
| `webai:chatgpt:generate-image` / `webai_chatgpt_generate_image` | `path`, `sha256`, `size_bytes`, `dimensions`, `errorCode`, `download_filename` | `error_code`, `expected_selector`, `message`, `expected_model` |
| `webai:gemini:generate-image` / `webai_gemini_generate_image` | `path`, `sha256`, `size_bytes`, `dimensions`, `errorCode`, `download_filename` | `error_code`, `expected_selector`, `message`, `expected_model` |
| `webai:gemini:canvas-to-docs` / `webai_gemini_canvas_to_docs` | `docs_url`, `docs_doc_id`, `title`, `errorCode` | `cleanup_attempted`, `expected_model` |
| `webai:gemini:generate-video` / `webai_gemini_generate_video` | `task_id`, `status`, `profile`, `lease_id`, `started_at` | `expected_model`, `account_rotations`, `accounts_tried_count` |
| `webai:gemini:deep-research` / `webai_gemini_deep_research` | `task_id`, `status` | `ok`, `errorCode`, `error_code`, `message`, `action` |
| `webai:gemini:canvas-edit` / `webai_gemini_canvas_edit` | `canvas_opened`, `edit_applied`, `ai_action_applied` | `ok`, `errorCode`, `error_code`, `message`, `action` |
| `webai:gemini:conversation-manage` / `webai_gemini_conversation_manage` | _(none)_ | `items`, `dialog_opened`, `results`, `ok`, `errorCode`, `error_code`, `reason`, `message`, `action` |
| `webai:gemini:workspace` / `webai_gemini_workspace` | `surface`, `url`, `summary` | `ok`, `errorCode`, `error_code`, `reason`, `action` |
| `webai:chatgpt:codex:submit-task` / `webai_chatgpt_codex_submit_task` | `task_id`, `task_url`, `repo`, `env`, `env_id`, `status` | `ok`, `errorCode`, `error_code`, `message`, `action` |
| `webai:chatgpt:codex:list-envs` / `webai_chatgpt_codex_list_envs` | `status`, `envs` | `ok`, `errorCode`, `error_code`, `message` |
| `webai:chatgpt:codex:task-status` / `webai_chatgpt_codex_task_status` | `task_id`, `repo`, `env_id`, `status`, `done`, `status_text` | `ok`, `errorCode`, `error_code`, `message` |
| `webai:chatgpt:codex:get-diff` / `webai_chatgpt_codex_get_diff` | `task_id`, `repo`, `env_id`, `status`, `files`, `diff_text`, `create_pr_available` | `ok`, `errorCode`, `error_code`, `message` |
| `webai:chatgpt:canvas-export` / `webai_chatgpt_canvas_export` | `path`, `sha256`, `format`, `byteSize` | `errorCode`, `error_code` |
| `webai:chatgpt:pulse:get` / `webai_chatgpt_pulse_get` | `route`, `status`, `generated_hint` | `digest_text`, `ok`, `errorCode`, `error_code` |
| `webai:chatgpt:pulse:onboard` / `webai_chatgpt_pulse_onboard` | `route`, `onboarded`, `news_topic_selected`, `final_status` | `note`, `ok`, `errorCode`, `error_code`, `reason` |
| `webai:chatgpt:deep-research` / `webai_chatgpt_deep_research` | `task_id`, `status` | `ok`, `service`, `errorCode`, `error_code`, `expected_model` |
| `webai:claude:deep-research` / `webai_claude_deep_research` | `task_id`, `status` | `ok`, `service`, `errorCode`, `error_code`, `expected_model` |
| `webai:chatgpt:conversation-manage` / `webai_chatgpt_conversation_manage` | _(none)_ | `dialog_opened`, `conversationId`, `url`, `surface`, `items`, `results`, `ok`, `errorCode`, `error_code`, `reason` |
| `webai:claude:conversation-manage` / `webai_claude_conversation_manage` | _(none)_ | `results_count`, `action`, `dialog_opened`, `conversationId`, `ok`, `errorCode`, `error_code`, `reason`, `message` |
| `webai:chatgpt:workspace` / `webai_chatgpt_workspace` | `surface`, `url`, `summary` | `ok`, `errorCode`, `error_code`, `reason`, `action` |
| `webai:claude:workspace` / `webai_claude_workspace` | `surface`, `url`, `summary` | `ok`, `errorCode`, `error_code`, `reason`, `action` |
| `webai:claude:design:create-project` / `webai_claude_design_create_project` | `projectUrl`, `projectId` | `ok`, `errorCode`, `error_code` |
| `webai:claude:design:generate` / `webai_claude_design_generate` | `status`, `model_used`, `projectUrl`, `fileName` | `ok`, `errorCode`, `error_code` |
| `webai:claude:design:get-html` / `webai_claude_design_get_html` | `iframeArtifactSha256`, `savedPath`, `byteSize` | `ok`, `errorCode`, `error_code` |
| `webai:claude:design:present` / `webai_claude_design_present` | `presentUrl` | `ok`, `errorCode`, `error_code` |
| `webai:gemini:music:generate` / `webai_gemini_music_generate` | `task_id`, `status`, `conversation_url` | `ok`, `errorCode`, `error_code`, `message`, `action` |
| `webai:gemini:music:download-track` / `webai_gemini_music_download_track` | `savedPath`, `sha256`, `byteSize`, `format` | `ok`, `errorCode`, `error_code` |
| `webai:gemini:music:task-status` / `webai_gemini_music_task_status` | `status`, `download_ready` | `ok`, `errorCode`, `error_code` |
| `webai:task-status` / `webai_task_status` | `status` | `progress_label`, `result`, `errorCode` |



### WebAI model selectors

`webai:chatgpt:select-model` / `webai_chatgpt_select_model`, `webai:claude:select-model` / `webai_claude_select_model`, and `webai:gemini:select-model` / `webai_gemini_select_model` select provider model/thinking controls without sending a prompt. Required args: `profile`. ChatGPT/Claude accept optional human-readable `model` picker labels and `thinking_level` (`auto`, `extended`); ChatGPT `extended` maps to the Thinking tier, Claude `extended` enables Adaptive thinking. Gemini keeps `model` (`3.1-flash-lite`, `3.5-flash`, `3.1-pro`) and `thinking_level` (`standard`, `extended`). Output shape: `ok`, `selected_model`, `selected_thinking_level`, `errorCode`. Error codes: `ELEMENT_NOT_FOUND`, `COMMAND_TIMEOUT`, `INVALID_ARGS`, `MODEL_SELECTION_DRIFT`.

### Veo quota rotation

`webai:gemini:generate-video` accepts optional `account_pool` as a comma-separated list of pre-registered Gemini profile names. Rotation triggers only when the worker receives `PLAN_OR_QUOTA_REQUIRED` from the unchanged Veo quota detection path; all other errors fail honestly without rotation. If every pooled account is exhausted, the task fails honestly with `PLAN_OR_QUOTA_REQUIRED`. The worker never synthesizes video output, does not expose `account_used`, and callers with no declared pool retain the single-profile fallback behavior.

### Async Gemini video polling

`webai:gemini:generate-video` is an async mutation: the initial response returns `status:"running"` plus `task_id`, `profile`, `lease_id`, and `started_at`. Consumers must poll `webai:task-status --task-id <id>` until `status` is no longer `running`; terminal statuses are `done` and `failed`. The expected maximum latency is the worker budget `300000` ms (5 min), overridable per call with `timeout_ms`. If a task is still `running` materially past its budget, the status reader reaps the orphaned task to `failed` with `errorCode:"COMMAND_TIMEOUT"` rather than leaving it running indefinitely. This clarifies the polling contract only; it does not add commands, output keys, error codes, or a contract version bump.

The returned `task_id` is a durable async handle that outlives any single orchestrate or MCP call: it is DB-backed and resolved by a detached, `unref`'d worker whose lifetime is independent of the initiating call and consumer orchestration window. A consumer whose orchestrate window closes before video resolution must retain the `task_id` and resolve it later with `webai:task-status`; `status:"running"` at orchestrate end means an outstanding handle, not non-delivery. The mutually-exclusive terminal outcomes are normalized distinctly: `status:"done"` plus `result` with a governed `path`, `sha256`, and `size_bytes` means the artifact was delivered; `status:"failed"` with `errorCode:"PLAN_OR_QUOTA_REQUIRED"` means capability/quota denial; `status:"failed"` with `errorCode:"COMMAND_TIMEOUT"` means an honest runtime-latency cap (default `300000` ms plus 60s reaper grace), not a capability denial, so re-queue or raise `timeout_ms`. `status:"failed"` with `errorCode:"ELEMENT_NOT_FOUND"` is a genuine automation-defect terminal that the hub fixes at root; it is not a runtime cap, not a deliverable, and not a documented acceptable async outcome. This clarifies the polling/handle contract only; adds no command, output key, error code, or contract version bump.

`webai:gemini:music:task-status` and `webai:chatgpt:codex:task-status` follow the same bounded-polling principle. Music task status has terminal statuses `{complete, error}` and non-terminal status `generating`; codex task status has terminal status `{complete}`, non-terminal status `{running}`, and returns `INVALID_ARGS` for an unknown task. Every MCP poll call is additionally bounded by `withMcpToolDeadline` (default `180000` ms, hard maximum `600000` ms); a poll that exceeds that deadline fails with `COMMAND_TIMEOUT`, so no polling loop is a hub-side infinite wait. This is a clarification only and does not add commands, output keys, error codes, or a contract version bump.

### Consumption & pinning

Consumers must pin this package to a specific resolved commit SHA, preferably the latest commit identified by the maintainer as `Fixed in <sha>`, then rebuild `dist/` deterministically from that pinned tree. Treat `main` as a moving development branch: a digest pinned to a moving branch tip will not hold by design. This is consumption guidance only and does not change any machine-checked contract surface.

**HEAD-stability is not tree-stability.** This repository's checkout is also the maintainer's active issue-fix working directory. Between a fix landing and its commit, the working tree legitimately carries uncommitted tracked modifications while `git HEAD` is unchanged. Digesting that live shared working tree — or any tree you did not yourself reconstruct from a committed SHA — is explicitly **out of the determinism contract**: an unchanged HEAD does not imply unchanged source or `dist/` bytes, and a digest taken over a maintainer working tree is expected to drift and carries no stability guarantee.

**Execution-digest determinism is defined only over a pristine reconstruction of a committed SHA.** The single contractually-stable, digest-deterministic artifact is the `dist/` produced by building a *clean* checkout of a pinned commit in a location the consumer controls. To obtain a reproducible execution digest, the consumer must, in their own workspace:

1. `git clone <repo>` (or `git worktree add <path> <sha>`) and `git checkout <sha>` for the pinned `Fixed in <sha>` commit — never digest, build in, or `git pull` the maintainer's shared checkout;
2. confirm the tree is pristine: `git status --porcelain` is empty and `git rev-parse HEAD` equals `<sha>`;
3. `rm -rf dist && npm ci && npm run build` in that pristine checkout (`npm run build` is `npm run clean && tsc -p tsconfig.json` — a deterministic, codegen-free compile; no source or `dist/` byte is mutated at runtime by the hub);
4. compute the execution digest over that freshly built `dist/` only, excluding any untracked or dirty state.

A digest so computed is byte-stable PRE==POST for a fixed SHA. If two such digests differ, the pinned SHA itself changed (the maintainer published a new `Fixed in <sha>`); re-pin to the new SHA rather than treating it as drift. As of this clarification the recommended pin target is the latest clean commit `d2cc581` (tree clean; supersedes the in-flight state observed at `e866e29`). The hub performs no out-of-band rewrite of committed tracked `src/` or `dist/` bytes; all runtime writes target gitignored runtime directories (`data/`, download dirs, artifact stores) or caller-supplied `--out` paths.

## MCP resources

| Resource URI | TypeScript API | Maturity | Safety class | Sensitive local fields possible? | Always-present output keys | Optional output keys |
| --- | --- | --- | --- | --- | --- | --- |
| `capabilities://targets` | `readMcpResource` | experimental | read | no | _(none)_ | `target_id`, `display_name`, `kind`, `base_url` |
| `capabilities://target/{targetId}` | `readMcpResource` | experimental | read | no | _(none)_ | `id`, `target_id`, `category`, `name`, `description`, `selectors`, `status` |
| `capabilities://target/{targetId}/latest` | `readMcpResource` | experimental | read | yes | _(none)_ | `id`, `target_id`, `url`, `title`, `captured_at`, `artifact_refs` |
| `workflows://definitions` | `readMcpResource` | experimental | read | yes | _(none)_ | `id`, `target_id`, `name`, `definition`, `created_at` |
| `workflows://runs` | `readMcpResource` | experimental | read | yes | _(none)_ | `id`, `workflow_id`, `status`, `started_at`, `finished_at` |
| `browser-profiles://list` | `readMcpResource` | experimental | read | yes | _(none)_ | `profileName`, `browserType`, `profileDir`, `executablePath`, `cdpEndpoint`, `cdpPort`, `processId`, `lastStatus` |
| `site-registry://sites` | `readMcpResource` | experimental | read | no | _(none)_ | `site_id`, `display_name`, `kind`, `base_url` |
| `capability-library://features` | `readMcpResource` | experimental | read | no | _(none)_ | `feature_id`, `service`, `name`, `status`, `mcp_tool`, `raw`, `imported_at` |

## Stable JSON output guarantees

Command rows define `required_args`, `output_keys.always_present`, and `output_keys.optional` in `configs/consumer-contract.json`. Safe consumers should treat always-present keys as the compatibility floor and optional keys as additive, tolerant-parse fields.

## Sensitive local fields

| Field | Handling |
| --- | --- |
| `artifact_click.path` | Local filesystem path; treat as sensitive local metadata. |
| `artifact_click.sha256` | Content fingerprint; acceptable to log when artifact logging is allowed. |
| `artifact_click.frameUrl` | May contain conversation IDs or tenant-specific URLs; treat as sensitive. |
| `profile-id` | Opaque browser profile identifier; do not expose outside trusted local logs. |
| `run_events.evidence` | Redacted by default; use --no-redact only for trusted local debugging. |
| `profile_lease.user_data_dir` | Local browser profile path; treat as sensitive local metadata. |
| `canvas_export.path` | Local filesystem path to exported ChatGPT Canvas artifact; treat as sensitive local metadata. |
| `claude_design.savedPath` | Local filesystem path to saved Design artifact; treat as sensitive local metadata. |
| `gemini_music.savedPath` | Local filesystem path to saved Gemini music artifact; treat as sensitive local metadata. |
| `pulse.digest_text` | Plain ChatGPT Pulse visible page text; safe for contract output but classify because it can contain user-curated topics. |
| `pulse.status` / `pulse.final_status` | Pulse readiness state; safe account feature state. |
| `pulse.route` / `pulse.generated_hint` | Pulse route and generated timing hint; safe route/page metadata. |
| `pulse.onboarded` / `pulse.news_topic_selected` | Pulse onboarding and Quick news recap selection booleans; safe preference metadata. |

### Phase C artifact readiness guarantees

- `webai:claude:design:generate` waits for the Design project URL to acquire the same `?file=<name>.html` readiness signal used by the completed Present flow before reporting `status:"generated"`; a genuine miss returns stable `POSTCONDITION_TIMEOUT`.
- `webai:claude:design:get-html` persists and hashes only verified HTML markup. Bootstrap/loader URL stubs fail with `ARTIFACT_VERIFICATION_FAILED`, are not written as `.html` artifacts, and failed captures clean up newly-created scratch files in the requested download directory.
- `webai:chatgpt:canvas-export` opens the canvas side panel when a canvas tile/control is available, then exports through Download; if no canvas exists it returns stable `ELEMENT_NOT_FOUND`.
- `webai:chatgpt:generate-file`/`webai:claude:generate-file` support `expected_extension=docx` (validated) and `expected_extension=pptx` (validated for ChatGPT via post-revamp file-card download; same OOXML capture path as `.docx`, governed `verifyOoxmlPackage`) plus code/text artifacts; `expected_extension=xlsx` is rejected pre-flight with stable `INVALID_ARGS`; no `.xlsx` is ever synthesized or substituted. (Pre-#16 R1 `pptx` was also rejected; #16 R1 lifted that after a live probe confirmed real `.pptx` is reliably produced.)
- `webai:chatgpt:pulse:get` is read-only: it returns `not_onboarded`, `pending`, or `ready` from the recipe gates and never silently onboards or fabricates `digest_text`.
- `webai:chatgpt:pulse:onboard` requires `--confirmed`, selects `Quick news recap`, and skips Gmail connection.

## Forbidden output fields for safe consumers

Safe consumers must strip these fields defensively even when using consumer-safe surfaces:

- `cdpEndpoint`
- `cdp_endpoint`
- `cdp_port`
- `webSocketDebuggerUrl`
- `profileDir`
- `profile_dir`
- `executablePath`
- `executable_path`
- `cookies`
- `cookie`
- `tokens`
- `token`
- `Authorization`
- `authorization`
- `accountEmail`
- `account_email`
- `email`
- `dom`
- `html`
- `screenshot`
- `screenshotPath`
- `rawSnapshot`
- `snapshot`

The safe `consumer:health` surface is designed not to emit those fields, but downstream re-sanitization is still recommended for defense in depth. The MCP tool boundary centrally rejects any final tool result containing forbidden keys with `SAFE_OUTPUT_REDACTION_REQUIRED`; the MCP resource boundary centrally projects forbidden keys out of database-backed resources and then asserts the sanitized payload is clean before returning it.

## Error code taxonomy

Consumer-stable error codes (39):

- `HUB_NOT_BUILT`
- `BROWSER_NOT_LAUNCHED`
- `PROFILE_NOT_FOUND`
- `TARGET_PAGE_MISSING`
- `LOGIN_REQUIRED`
- `CAPABILITY_DB_NOT_INIT`
- `COMMAND_TIMEOUT`
- `INVALID_ARGS`
- `INVALID_JSON`
- `POLICY_APPROVAL_REQUIRED`
- `IFRAME_NOT_FOUND`
- `ELEMENT_NOT_FOUND`
- `ELEMENT_OUT_OF_VIEWPORT`
- `ARTIFACT_DOWNLOAD_TIMEOUT`
- `ARTIFACT_VERIFICATION_FAILED`
- `DOCX_VERIFICATION_FAILED`
- `POSTCONDITION_TIMEOUT`
- `RESUME_REQUIRES_CONFIRMATION`
- `IDEMPOTENCY_MISMATCH`
- `PROFILE_LOCKED`
- `PROFILE_LEASE_BUSY`
- `SAFE_OUTPUT_REDACTION_REQUIRED`
- `PLAN_OR_QUOTA_REQUIRED`
- `MODEL_SELECTION_DRIFT`
- `ARTIFACT_MODE_UNSUPPORTED`
- `AUTO_PUBLISH_DETECTED`
- `MODE_UNCERTAIN`
- `HUMAN_HANDOFF_REQUIRED`
- `UNKNOWN`
- `SENSITIVE_CONTENT_GUARD`
- `SUBMCP_QUOTA_EXHAUSTED`
- `SUBMCP_NOT_PROVISIONED`
- `UI_DRIFT_DETECTED`
- `HEAL_CONFIDENCE_LOW`
- `PROFILE_LEASE_TIMEOUT`
- `TAB_LEASE_EXPIRED`
- `CHROME_EXTENSION_NOT_CONNECTED`
- `CHROME_EXTENSION_PERMISSION_DENIED`
- `CHROME_EXTENSION_DEBUGGER_UNAVAILABLE`

Chrome-extension bridge additions in `consumer-contract-1.8.0`: `CHROME_EXTENSION_NOT_CONNECTED` means the extension-assisted bridge transport is unavailable, the native host exited, or the bootstrap `browser.ping` heartbeat did not answer within `CHROME_EXTENSION_DISPATCH_TIMEOUT` (default 30s). Consumers should surface the code, verify the extension/native host is installed and connected, then retry the same explicit backend path; the hub must not silently fall back to managed CDP.

`CHROME_EXTENSION_PERMISSION_DENIED` means the extension bridge reached Chrome but lacks the permission required for the requested operation, such as `chrome.debugger`, `scripting`, or `tabs`. Consumers should ask the operator to reinstall or re-enable the extension with the required MV3 permissions, then retry; changing profiles or falling back to another backend is a caller-level decision, not an automatic hub behavior.

`CHROME_EXTENSION_DEBUGGER_UNAVAILABLE` means a `chrome.debugger` attach failed because another debugger is already attached or MV3 prevented the attach for that target. Consumers should close competing DevTools/debugger sessions, choose a different tab, or retry after the attached debugger detaches; the bridge reports this code instead of pretending the CDP-backed operation succeeded.

Lease-lifecycle additions in `consumer-contract-1.7.1`: `PROFILE_LEASE_TIMEOUT`
means a profile lease missed heartbeats for more than 2× its TTL while the holder
PID was still alive, so the runtime force-released it instead of hiding the
stuck owner. `TAB_LEASE_EXPIRED` means an active tab lease for the same URL
pattern had elapsed when a new tab acquire arrived; consumers should retry after
observing the surfaced code rather than assuming a tab was selected silently.

`message` remains human-readable and may change wording within a contract major version. Consumers should branch on `errorCode`, not `message`.

## Backward compatibility promise

Within contract major version `1.x`, stable command/tool/resource schemas will not remove always-present keys, rename keys, or change enum values. Optional keys may be added only when they do not expose forbidden fields on safe surfaces. Experimental surfaces can change across minor package releases and should be wrapped with local sanitization and tolerant parsing.


### Browser hover dwell and portal reads

`browser:hover` keeps its existing instantaneous Playwright hover unless `--dwell-ms` or `--settle-selector` is provided. With those flags it dispatches raw CDP `Input.dispatchMouseEvent` `mouseMoved` steps toward the target, dwells for the requested duration (default 450ms when the dwell path is selected), and optionally requires `--settle-selector` to appear; missing targets or unrevealed submenus surface existing `ELEMENT_NOT_FOUND`/`MODE_UNCERTAIN`-style failures rather than success.

`browser:read --include-portals` is opt-in and includes body-level Radix/command-palette portal roots such as `[data-radix-popper-content-wrapper]`, `[role="menu"]`, `[role="dialog"]`, and `[role="listbox"]`. The default read path remains portal-excluding for compatibility. The MCP `browser_read` tool exposes the same option as `includePortals`; no new MCP/webai tool is added.


## Integration registry surface

`docs/capability-library.json` is the editable seed. `capability:library:import` loads that seed into SQLite `integration_registry`, and `capability-library://features` exposes the authoritative imported rows. Public fields `feature_id`, `service`, `name`, `status`, and `mcp_tool` are classified as safe governance metadata; no forbidden fields are introduced.


## Separate research database MCP surface

`research:inventory:import [configs/research/research_inventory.json] [--stem-only]` is a non-webai database import surface. Its MCP tool is `research_inventory_import`; it is intentionally not `webai_`-prefixed, does not live under the webai sub-MCP family, and is registered as a plain main MCP tool alongside `site_registry_import`.

The implementation lives under `src/mcp/researchdb/` and reuses the existing site registry table/import path without a schema migration or new table. The optional `--stem-only` / `stem_only` filter keeps only records whose `raw.classification.science_engineering` value is `true`. The stable output keys are `imported`, `sites`, and `path`.

The Research inventory governance fields `site_registry.classification.science_engineering` and `site_registry.classification.matched_subjects` are classified as non-sensitive public science/engineering metadata.


### AIAA research database tools

- `research:aiaa:search` / `research_aiaa_search`: always returns `result_count`, `items`, `query_url`.
- `research:aiaa:filter` / `research_aiaa_filter`: always returns `result_count`, `items`, `refined_url`, `confirm_title`.
- `research:aiaa:export` / `research_aiaa_export`: always returns `artifact_path`, `bytes`, `sha256`, `format`, `doi`.

### WoS / ACM / IEEE research database tools

- `research:wos:search` / `research_wos_search`: always returns `result_count`, `items`, `query_url`.
- `research:wos:filter` / `research_wos_filter`: always returns `result_count`, `items`, `refined_url`, `confirm_title`, `active_refine`.
- `research:wos:export` / `research_wos_export`: always returns `artifact_path`, `bytes`, `sha256`, `format`, `result_count`.
- `research:acm:search` / `research_acm_search`: always returns `result_count`, `items`, `query_url`.
- `research:acm:filter` / `research_acm_filter`: always returns `result_count`, `items`, `refined_url`, `confirm_title`; Premium-only facet options honestly surface `PLAN_OR_QUOTA_REQUIRED` from the module instead of masking the blocker.
- `research:acm:export` / `research_acm_export`: always returns `artifact_path`, `bytes`, `sha256`, `format`, `doi`.
- `research:ieee:search` / `research_ieee_search`: always returns `result_count`, `items`, `query_url`.
- `research:ieee:filter` / `research_ieee_filter`: always returns `result_count`, `items`, `refined_url`, `confirm_title`.
- `research:ieee:export` / `research_ieee_export`: successful shape is `artifact_path`, `bytes`, `sha256`, `format`; the current verified live behavior honestly surfaces `HUMAN_HANDOFF_REQUIRED` because the IEEE export modal blocks record selection/export, and no artifact is synthesized.

### ACS / ASME / RSC / Wiley / ASCE research database tools

- `research:acs:search` / `research_acs_search`: always returns `result_count`, `items`, `query_url`.
- `research:acs:filter` / `research_acs_filter`: always returns `result_count`, `items`, `refined_url`, `confirm_title`.
- `research:acs:export` / `research_acs_export`: always returns `artifact_path`, `bytes`, `sha256`, `format`, `doi`.
- `research:asme:search` / `research_asme_search`: always returns `result_count`, `items`, `query_url`.
- `research:asme:filter` / `research_asme_filter`: always returns `result_count`, `items`, `refined_url`, `confirm_title`.
- `research:asme:export` / `research_asme_export`: always returns `artifact_path`, `bytes`, `sha256`, `format`, `doi`, `resource_id`; it uses the verified Silverchair `/Citation/Download` path and does not synthesize artifacts.
- `research:rsc:search` / `research_rsc_search`: always returns `result_count`, `items`, `query_url`.
- `research:rsc:filter` / `research_rsc_filter`: always returns `result_count`, `items`, `refined_url`, `confirm_title`.
- `research:rsc:export` / `research_rsc_export`: always returns `artifact_path`, `bytes`, `sha256`, `format`, `doi`.
- `research:wiley:search` / `research_wiley_search`: always returns `result_count`, `items`, `query_url`.
- `research:wiley:filter` / `research_wiley_filter`: always returns `result_count`, `items`, `refined_url`, `confirm_title`.
- `research:wiley:export` / `research_wiley_export`: always returns `artifact_path`, `bytes`, `sha256`, `format`, `doi`.
- `research:asce:search` / `research_asce_search`: always returns `result_count`, `items`, `query_url`.
- `research:asce:filter` / `research_asce_filter`: always returns `result_count`, `items`, `refined_url`, `confirm_title`.
- `research:asce:export` / `research_asce_export`: always returns `artifact_path`, `bytes`, `sha256`, `format`, `doi`.
- `research:iop:search` / `research_iop_search`: always returns `result_count`, `items`, `query_url`.
- `research:iop:filter` / `research_iop_filter`: always returns `result_count`, `items`, `refined_url`, `confirm_title`.
- `research:iop:export` / `research_iop_export`: always returns `artifact_path`, `bytes`, `sha256`, `format`, `doi`, `export_url`; Radware/handoff blockers and artifact verification failures surface directly from the module without synthesized artifacts.
- `research:tandf:search` / `research_tandf_search`: always returns `result_count`, `items`, `query_url`.
- `research:tandf:filter` / `research_tandf_filter`: always returns `result_count`, `items`, `refined_url`, `confirm_title`.
- `research:tandf:export` / `research_tandf_export`: always returns `artifact_path`, `bytes`, `sha256`, `format`, `doi`; artifact verification failures surface directly from the module without synthesized artifacts.
- `research:sae:search` / `research_sae_search`: always returns `result_count`, `items`, `query_url`.
- `research:sae:filter` / `research_sae_filter`: always returns `result_count`, `items`, `refined_url`, `confirm_title`.
- `research:sae:export` / `research_sae_export`: always returns `artifact_path`, `bytes`, `sha256`, `format`, `query`, `result_count`; SAE export keeps the existing module behavior and does not synthesize artifacts.
- `research:sciencedirect:search` / `research_sciencedirect_search`: always returns `result_count`, `items`, `query_url`.
- `research:sciencedirect:filter` / `research_sciencedirect_filter`: always returns `result_count`, `items`, `refined_url`, `confirm_title`.
- `research:sciencedirect:export` / `research_sciencedirect_export`: always returns `artifact_path`, `bytes`, `sha256`, `format`, `query_url`; it preserves the verified ScienceDirect browser artifact path and does not synthesize artifacts.
- `research:aps:search` / `research_aps_search`: always returns `result_count`, `items`, `query_url`.
- `research:aps:filter` / `research_aps_filter`: always returns `result_count`, `items`, `refined_url`, `confirm_title`.
- `research:aps:export` / `research_aps_export`: always returns `artifact_path`, `bytes`, `sha256`, `format`, `doi`; it preserves the verified APS artifact-click path and does not synthesize artifacts.
- `research:emerald:search` / `research_emerald_search`: always returns `result_count`, `items`, `query_url`.
- `research:emerald:filter` / `research_emerald_filter`: always returns `result_count`, `items`, `refined_url`, `confirm_url`, `confirm_title`.
- `research:emerald:export` / `research_emerald_export`: always returns `artifact_path`, `bytes`, `sha256`, `format`, `doi`, `resource_id`, `source_url`; it uses the verified Silverchair `/Citation/Download` download-url path because the box-less collapsed dropdown blocks `browser:artifact-click`, and no artifact is synthesized.
- `research:cambridge:search` / `research_cambridge_search`: always returns `result_count`, `items`, `query_url`.
- `research:cambridge:filter` / `research_cambridge_filter`: always returns `result_count`, `items`, `refined_url`, `confirm_title`.
- `research:cambridge:export` / `research_cambridge_export`: always returns `artifact_path`, `bytes`, `sha256`, `format`, `product_id`; it preserves the verified Cambridge Citation Tools artifact-click path and does not synthesize artifacts.

### SpringerLink / Nature / IET / AIP research database tools

- `research:springer:search` / `research_springer_search`: always returns `result_count`, `items`, `query_url`.
- `research:springer:filter` / `research_springer_filter`: always returns `result_count`, `items`, `refined_url`, `confirm_url`, `confirm_title`, `applied_filters`.
- `research:springer:export` / `research_springer_export`: always returns `artifact_path`, `bytes`, `sha256`, `format`, `doi`, `source_url` for per-article RIS; bulk CSV honestly surfaces the module's `HUMAN_HANDOFF_REQUIRED` login-walled blocker without synthesized artifacts.
- `research:nature:search` / `research_nature_search`: always returns `result_count`, `items`, `query_url`.
- `research:nature:filter` / `research_nature_filter`: always returns `result_count`, `items`, `refined_url`, `confirm_title`, `facet_param`, `facet_value`, `facet_checked`.
- `research:nature:export` / `research_nature_export`: always returns `artifact_path`, `bytes`, `sha256`, `format`, `doi`, `article_url`, `citation_url`; it preserves the verified Springer citation-needed RIS path and does not synthesize artifacts.
- `research:iet:search` / `research_iet_search`: always returns `result_count`, `items`, `query_url`.
- `research:iet:filter` / `research_iet_filter`: always returns `result_count`, `items`, `refined_url`, `confirm_title`.
- `research:iet:export` / `research_iet_export`: always returns `artifact_path`, `bytes`, `sha256`, `format`, `doi`; it preserves the verified Atypon artifact path and the module's CDP-eval observation path without synthesizing artifacts.
- `research:aip:search` / `research_aip_search`: always returns `result_count`, `items`, `query_url`.
- `research:aip:filter` / `research_aip_filter`: always returns `result_count`, `items`, `refined_url`, `confirm_url`, `confirm_title`.
- `research:aip:export` / `research_aip_export`: always returns `artifact_path`, `bytes`, `sha256`, `format`, `doi`, `resource_id`, `source_url`; it preserves the verified Silverchair download-url path requiring `X-Requested-With: XMLHttpRequest` and does not synthesize artifacts.

ACS/RSC/Wiley/ASCE use their Phase-A verified Atypon-family artifact paths; ASME uses the Phase-A verified Silverchair citation endpoint. Existing handler error-code behavior is part of the contract: gated primitives surface their existing `ConsumerErrorCodes` honestly instead of falling back or fabricating success.

### MDPI / Optica / ProQuest research database tools

- `research:mdpi:search` / `research_mdpi_search`: always returns `result_count`, `item_count`, `items`, `query_url`.
- `research:mdpi:filter` / `research_mdpi_filter`: always returns `result_count`, `item_count`, `items`, `refined_url`, `confirm_title`.
- `research:mdpi:export` / `research_mdpi_export`: always returns `artifact_path`, `bytes`, `sha256`, `format`, `article_url`; it preserves the verified MDPI Cite modal + CDP artifact-click two-step path and POST-only `/export` behavior without synthesized artifacts.
- `research:optica:search` / `research_optica_search`: always returns `result_count`, `total_count`, `items`, `query_url`.
- `research:optica:filter` / `research_optica_filter`: always returns `result_count`, `total_count`, `items`, `refined_url`, `confirm_title`.
- `research:optica:export` / `research_optica_export`: always returns `artifact_path`, `bytes`, `sha256`, `format`, `article_id`; it preserves the verified Optica artifact-click POST form path without synthesized artifacts.
- `research:proquest:search` / `research_proquest_search`: always returns `result_count`, `items`, `query_url`, `results_url`, `title`.
- `research:proquest:filter` / `research_proquest_filter`: always returns `result_count`, `items`, `refined_url`, `confirm_title`, `unfiltered_count`, `unfiltered_url`.
- `research:proquest:export` / `research_proquest_export`: always returns `artifact_path`, `bytes`, `sha256`, `format`, `result_count`, `results_url`; it preserves the verified ProQuest RIS artifact-click path and CDP-eval-observed selectors without synthesized artifacts.

MDPI, Optica, and ProQuest keep their existing module-owned `ConsumerErrorCodes` behavior: live blockers and artifact-verification failures surface honestly instead of falling back or fabricating success.

### Frontiers / arXiv / SIAM / De Gruyter / World Scientific / Royal Society research database tools

- `research:frontiers:search` / `research_frontiers_search`: always returns `result_count`, `items`, `query_url`.
- `research:frontiers:filter` / `research_frontiers_filter`: always returns `result_count`, `items`, `query_url`, `group`, `selected_label`.
- `research:frontiers:export` / `research_frontiers_export`: always returns `artifact_path`, `bytes`, `sha256`, `format`, `doi`, `source_url`; it preserves the verified Frontiers citation download-url path with no synthesized fallback.
- `research:arxiv:search` / `research_arxiv_search`: always returns `result_count`, `items`, `query_url`.
- `research:arxiv:filter` / `research_arxiv_filter`: always returns `result_count`, `items`, `refined_url`, `confirm_url`, `confirm_title`.
- `research:arxiv:export` / `research_arxiv_export`: always returns `artifact_path`, `bytes`, `sha256`, `format`, `id`, `source_url`; it preserves the verified arXiv BibTeX download-url path with no synthesized fallback.
- `research:siam:search` / `research_siam_search`: always returns `result_count`, `items`, `query_url`.
- `research:siam:filter` / `research_siam_filter`: always returns `result_count`, `items`, `refined_url`, `confirm_title`.
- `research:siam:export` / `research_siam_export`: always returns `artifact_path`, `bytes`, `sha256`, `format`, `doi`, `content_type`, `content_disposition`; it preserves the verified in-session same-origin POST path with no synthesized fallback.
- `research:degruyter:search` / `research_degruyter_search`: always returns `result_count`, `items`, `query_url`, `confirm_url`, `confirm_title`.
- `research:degruyter:filter` / `research_degruyter_filter`: always returns `result_count`, `items`, `refined_url`, `confirm_url`, `confirm_title`.
- `research:degruyter:export` / `research_degruyter_export`: always returns `artifact_path`, `bytes`, `sha256`, `format`, `doi`; it preserves the verified artifact-click path with no synthesized fallback.
- `research:worldsci:search` / `research_worldsci_search`: always returns `result_count`, `items`, `query_url`, `cf_interstitial_observed`.
- `research:worldsci:filter` / `research_worldsci_filter`: always returns `result_count`, `items`, `refined_url`, `confirm_title`, `cf_interstitial_observed`.
- `research:worldsci:export` / `research_worldsci_export`: always returns `artifact_path`, `bytes`, `sha256`, `format`, `doi`, `cf_interstitial_observed`; it preserves the verified artifact-click Download-button path with no synthesized fallback.
- `research:royalsoc:search` / `research_royalsoc_search`: always returns `result_count`, `items`, `query_url`, `confirm_url`, `confirm_title`.
- `research:royalsoc:filter` / `research_royalsoc_filter`: always returns `result_count`, `items`, `refined_url`, `confirm_url`, `confirm_title`, `filter_confirmed`.
- `research:royalsoc:export` / `research_royalsoc_export`: always returns `artifact_path`, `bytes`, `sha256`, `format`, `doi`, `resource_id`, `source_url`; it preserves the verified Silverchair `/Citation/Download` path with no synthesized fallback.

Frontiers, arXiv, SIAM, De Gruyter, World Scientific, and Royal Society keep their module-owned `ConsumerErrorCodes` behavior: live blockers and artifact-verification failures surface honestly instead of falling back or fabricating success.

### SCOAP3 / DBLP / SciELO / INSPIRE-HEP / PubScholar research database tools

- `research:scoap3:search` / `research_scoap3_search`: always returns `result_count`, `items`, `query_url`, `confirm_url`, `export_href`.
- `research:scoap3:filter` / `research_scoap3_filter`: always returns `result_count`, `items`, `refined_url`, `confirm_url`, `export_href`.
- `research:scoap3:export` / `research_scoap3_export`: always returns `artifact_path`, `bytes`, `sha256`, `format`, `source_url`; it preserves the verified SCOAP3 CSV/JSON download-url path and does not synthesize unavailable RIS/BibTeX/XML formats.
- `research:dblp:search` / `research_dblp_search`: always returns `result_count`, `items`, `query_url`, `confirm_title`, `facets`.
- `research:dblp:filter` / `research_dblp_filter`: always returns `result_count`, `items`, `refined_url`, `confirm_url`, `confirm_title`, `facets`.
- `research:dblp:export` / `research_dblp_export`: always returns `artifact_path`, `bytes`, `sha256`, `format`, `source_url`, `mime_type`; it preserves the verified DBLP `/rec/<key>.bib` and CompleteSearch API download-url paths.
- `research:scielo:search` / `research_scielo_search`: always returns `result_count`, `items`, `query_url`.
- `research:scielo:filter` / `research_scielo_filter`: always returns `result_count`, `items`, `refined_url`, `confirm_url`, `confirm_title`, `selected_filters`.
- `research:scielo:export` / `research_scielo_export`: always returns `artifact_path`, `bytes`, `sha256`, `format`, `source_url`, `result_count`; it preserves the verified SciELO two-step artifact-click path because direct download-url returns HTTP 403.
- `research:inspirehep:search` / `research_inspirehep_search`: always returns `result_count`, `items`, `query_url`, `confirm_url`, `confirm_title`.
- `research:inspirehep:filter` / `research_inspirehep_filter`: always returns `result_count`, `items`, `refined_url`, `confirm_url`, `confirm_title`, `applied_filters`.
- `research:inspirehep:export` / `research_inspirehep_export`: always returns `artifact_path`, `bytes`, `sha256`, `format`, `source_url`; it preserves the verified first-party `/api/literature` export path.
- `research:pubscholar:search` / `research_pubscholar_search`: always returns `result_count`, `selected_count`, `items`, `query_url`, `results_url`, `title`, `breadcrumb`.
- `research:pubscholar:filter` / `research_pubscholar_filter`: always returns `result_count`, `selected_count`, `items`, `refined_url`, `confirm_title`, `breadcrumb`, `unfiltered_count`, `unfiltered_url`.
- `research:pubscholar:export` / `research_pubscholar_export`: always returns `artifact_path`, `bytes`, `sha256`, `format`, `result_count`, `results_url`, `breadcrumb`, `structural_tags`; it preserves the verified route-only SPA state plus per-record RIS artifact-click path.

SCOAP3, DBLP, SciELO, INSPIRE-HEP, and PubScholar keep their module-owned `ConsumerErrorCodes` behavior: live blockers and artifact-verification failures surface honestly instead of falling back or fabricating success.

### IncoPat research database tools

- `research:incopat:search` / `research_incopat_search`: always returns `result_count`, `items`, `query_url`, `results_url`, `normalized_query`.
- `research:incopat:filter` / `research_incopat_filter`: always returns `result_count`, `items`, `refined_url`, `confirm_title`, `unfiltered_count`, `country`, `breadcrumb`.
- `research:incopat:export` / `research_incopat_export`: always returns `artifact_path`, `bytes`, `sha256`, `format`, `result_count`, `results_url` and may include `country`; it preserves the verified trusted-CDP IncoPat per-row `a.pdf` artifact-click PDF path and does not synthesize artifacts.

IncoPat keeps its module-owned `ConsumerErrorCodes` behavior (`LOGIN_REQUIRED`, `PLAN_OR_QUOTA_REQUIRED`, `ELEMENT_NOT_FOUND`, `ARTIFACT_DOWNLOAD_TIMEOUT`, `ARTIFACT_VERIFICATION_FAILED`, `MODE_UNCERTAIN`, `INVALID_ARGS`, `COMMAND_TIMEOUT`): live blockers and artifact-verification failures surface honestly instead of falling back or fabricating success.

### Wanfang research database tools

- `research:wanfang:search` / `research_wanfang_search`: always returns `result_count`, `items`, `query_url`, `results_url`.
- `research:wanfang:filter` / `research_wanfang_filter`: always returns `result_count`, `items`, `refined_url`, `confirm_title`, `unfiltered_count`, `resource_type`, `resource_label`.
- `research:wanfang:export` / `research_wanfang_export`: always returns `artifact_path`, `bytes`, `sha256`, `format`, `result_count`, `results_url`, `resource_type`, `resource_label`; it preserves the verified institutional-IP Wanfang trusted-CDP facet apply plus per-row selection, 批量引用 new-tab, and CDP artifact-click TXT citation path and does not synthesize artifacts.

Wanfang keeps its module-owned `ConsumerErrorCodes` behavior (`ELEMENT_NOT_FOUND`, `ARTIFACT_DOWNLOAD_TIMEOUT`, `ARTIFACT_VERIFICATION_FAILED`, `MODE_UNCERTAIN`, `PLAN_OR_QUOTA_REQUIRED`, `COMMAND_TIMEOUT`, `INVALID_ARGS`): live blockers and artifact-verification failures surface honestly instead of falling back or fabricating success.
