const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
import { consumerHealth, ConsumerHealthResult } from "../src/consumer/health";
import { CONSUMER_ERROR_CODES } from "../src/consumer/errorCodes";
import { ManagedBrowserLauncher, ManagedBrowserStatus } from "../src/browser/managedLauncher";
import { pageMatchesTargetUrl } from "../src/browser/managedPageRouting";
import { waitForArtifactPageReady } from "../src/browser/artifactClick";
import { main } from "../src/cli";
import { CapabilityDatabase } from "../src/capabilities/database";
import { listMcpResources } from "../src/mcp/resources";
import { activateGeminiVideoMode, callMcpTool, listMcpTools, webAiChatgptSendPrompt, webAiClaudeSendPrompt, webAiGeminiSendPrompt, webAiChatgptSelectModel, webAiClaudeSelectModel, webAiGeminiSelectModel, webAiChatgptUploadAndQuery, webAiClaudeUploadAndQuery, webAiGeminiUploadAndQuery, webAiChatgptGenerateFile, webAiClaudeGenerateFile, webAiChatgptGenerateImage, webAiGeminiGenerateImage, webAiGeminiCanvasToDocs, webAiGeminiGenerateVideo, webAiChatgptCanvasExport, webAiChatgptPulseGet, webAiChatgptPulseOnboard, webAiChatgptDeepResearch, webAiClaudeDeepResearch, webAiChatgptConversationManage, webAiClaudeConversationManage, webAiChatgptWorkspace, webAiClaudeWorkspace, webAiGeminiDeepResearch, webAiGeminiCanvasEdit, webAiGeminiConversationManage, webAiGeminiWorkspace, webAiClaudeDesignCreateProject, webAiClaudeDesignGenerate, webAiClaudeDesignGetHtml, webAiClaudeDesignPresent, webAiGeminiMusicGenerate, webAiGeminiMusicDownloadTrack, webAiGeminiMusicTaskStatus, webAiChatgptCodexSubmitTask, webAiChatgptCodexListEnvs, webAiChatgptCodexTaskStatus, webAiChatgptCodexGetDiff, webAiTaskStatus, webAiLiteratureTaskStatus, researchAiaaSearch, researchAiaaFilter, researchAiaaExport, researchWosSearch, researchWosFilter, researchWosExport, researchAcmSearch, researchAcmFilter, researchAcmExport, researchIeeeSearch, researchIeeeFilter, researchIeeeExport, researchAcsSearch, researchAcsFilter, researchAcsExport, researchAsmeSearch, researchAsmeFilter, researchAsmeExport, researchRscSearch, researchRscFilter, researchRscExport, researchWileySearch, researchWileyFilter, researchWileyExport, researchAsceSearch, researchAsceFilter, researchAsceExport, researchIopSearch, researchIopFilter, researchIopExport, researchTandfSearch, researchTandfFilter, researchTandfExport, researchSaeSearch, researchSaeFilter, researchSaeExport, researchScienceDirectSearch, researchScienceDirectFilter, researchScienceDirectExport, researchApsSearch, researchApsFilter, researchApsExport, researchEmeraldSearch, researchEmeraldFilter, researchEmeraldExport, researchCambridgeSearch, researchCambridgeFilter, researchCambridgeExport, researchSpringerSearch, researchSpringerFilter, researchSpringerExport, researchNatureSearch, researchNatureFilter, researchNatureExport, researchIetSearch, researchIetFilter, researchIetExport, researchAipSearch, researchAipFilter, researchAipExport, researchMdpiSearch, researchMdpiFilter, researchMdpiExport, researchOpticaSearch, researchOpticaFilter, researchOpticaExport, researchProquestSearch, researchProquestFilter, researchProquestExport, researchFrontiersSearch, researchFrontiersFilter, researchFrontiersExport, researchArxivSearch, researchArxivFilter, researchArxivExport, researchSiamSearch, researchSiamFilter, researchSiamExport, researchDegruyterSearch, researchDegruyterFilter, researchDegruyterExport, researchWorldsciSearch, researchWorldsciFilter, researchWorldsciExport, researchRoyalSocSearch, researchRoyalSocFilter, researchRoyalSocExport, researchScoap3Search, researchScoap3Filter, researchScoap3Export, researchDblpSearch, researchDblpFilter, researchDblpExport, researchScieloSearch, researchScieloFilter, researchScieloExport, researchInspirehepSearch, researchInspirehepFilter, researchInspirehepExport, researchPubscholarSearch, researchPubscholarFilter, researchPubscholarExport, researchOpticsjournalSearch, researchOpticsjournalFilter, researchOpticsjournalExport, researchCrcSearch, researchCrcFilter, researchCrcExport, researchCellpressSearch, researchCellpressFilter, researchCellpressExport, researchIestSearch, researchIestFilter, researchIestExport, researchIncopatSearch, researchIncopatFilter, researchIncopatExport, researchWanfangSearch, researchWanfangFilter, researchWanfangExport, wahCapabilityQuery, wahAdapterHealth, wahPolicyExplain, wahTaskStart, wahTaskStatus, wahTaskCancel, wahTaskResume, wahArtifactGet } from "../src/mcp/tools";
import { isRealHtmlMarkup, waitForDesignFileCompletion } from "../src/mcp/submcp/claude-design/flow";
import { subMcpToolSpecs } from "../src/mcp/submcp";
import { bestEffortMarkVideoTaskBootstrapFailure } from "../src/mcp/videoWorker";

type Scenario = {
  name: string;
  input: { target: string; profile: string };
  status?: ManagedBrowserStatus;
  timeout?: boolean;
  expected: Partial<ConsumerHealthResult>;
  forbiddenSentinels: string[];
};

function readJson(file: string): any {
  return JSON.parse(fs.readFileSync(path.resolve(process.cwd(), file), "utf-8"));
}

function contract(): any { return readJson("configs/consumer-contract.json"); }
function fixtures(): { checkedAt: string; scenarios: Scenario[] } { return readJson("tests/fixtures/consumer-health-scenarios.json"); }

const CHROME_EXTENSION_ERROR_CODES = [
  "CHROME_EXTENSION_NOT_CONNECTED",
  "CHROME_EXTENSION_PERMISSION_DENIED",
  "CHROME_EXTENSION_DEBUGGER_UNAVAILABLE"
] as const;

function consumerContractDoc(): string {
  return fs.readFileSync(path.resolve(process.cwd(), "docs/CONSUMER_CONTRACT.md"), "utf-8");
}

function tempCapabilityDb(): CapabilityDatabase {
  const dir = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "wah-task-db-"));
  return new CapabilityDatabase({ dbPath: path.join(dir, "capability.json"), preferSqlite: false });
}

function launcherForScenario(scenario: Scenario): any {
  if (scenario.timeout) return { status: async () => new Promise(() => undefined) };
  return { status: async () => scenario.status };
}

function assertNoForbiddenFields(value: unknown, forbiddenFields: string[]): void {
  const seen: string[] = [];
  function visit(node: any): void {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) { node.forEach(visit); return; }
    for (const [key, child] of Object.entries(node)) {
      if (forbiddenFields.includes(key)) seen.push(key);
      visit(child);
    }
  }
  visit(value);
  assert.deepEqual(seen, []);
}

function assertNoSentinelValues(value: unknown, sentinels: string[]): void {
  const serialized = JSON.stringify(value);
  for (const sentinel of sentinels) {
    assert.equal(serialized.includes(sentinel), false, `leaked sentinel: ${sentinel}`);
  }
}

function assertConsumerHealthSchema(value: ConsumerHealthResult, alwaysPresent: string[]): void {
  assert.deepEqual(Object.keys(value), alwaysPresent);
  assert.equal(typeof value.ok, "boolean");
  assert.equal(typeof value.target, "string");
  assert.equal(typeof value.profile, "string");
  assert.equal(typeof value.connected, "boolean");
  assert.equal(typeof value.pageCount, "number");
  assert.ok(["healthy", "unhealthy", "not_implemented"].includes(value.loginLikeState));
  assert.ok(["ok", "missing", "blocked", "needs_review"].includes(value.status));
  assert.ok(value.errorCode === null || (CONSUMER_ERROR_CODES as readonly string[]).includes(value.errorCode));
  assert.equal(typeof value.message, "string");
  assert.equal(Number.isNaN(Date.parse(value.checkedAt)), false);
}

async function captureStdout(fn: () => Promise<void>): Promise<string> {
  const originalLog = console.log;
  const lines: string[] = [];
  console.log = (...args: any[]) => { lines.push(args.join(" ")); };
  try {
    await fn();
  } finally {
    console.log = originalLog;
  }
  return lines.join("\n");
}

for (const code of CHROME_EXTENSION_ERROR_CODES) {
  test(`consumer contract includes and documents ${code}`, () => {
    const manifest = contract();
    assert.ok(manifest.error_codes.includes(code), `${code} missing from contract error_codes`);
    assert.ok((CONSUMER_ERROR_CODES as readonly string[]).includes(code), `${code} missing from TypeScript error codes`);
    const docs = consumerContractDoc();
    const description = docs.match(new RegExp(`\`${code}\` means ([^\n]+(?:\n(?!\n)[^\n]+)*)`))?.[1]?.trim();
    assert.ok(description && description.length > 40, `${code} missing non-empty docs description`);
  });
}

test("consumer:health output schema matches contract and strips forbidden fields for fixtures", async () => {
  const manifest = contract();


  const healthCommand = manifest.commands.find((command: any) => command.cli_name === "consumer:health");
  assert.ok(healthCommand, "consumer:health missing from contract manifest");
  const alwaysPresent = healthCommand.output_keys.always_present;

  for (const scenario of fixtures().scenarios) {
    const result = await consumerHealth({
      ...scenario.input,
      launcher: launcherForScenario(scenario),
      timeoutMs: scenario.timeout ? 5 : 100,
      now: () => new Date(fixtures().checkedAt)
    });

    assertConsumerHealthSchema(result, alwaysPresent);
    assert.equal(result.target, scenario.input.target, scenario.name);
    assert.equal(result.profile, scenario.input.profile, scenario.name);
    for (const [key, expected] of Object.entries(scenario.expected)) {
      assert.deepEqual((result as any)[key], expected, `${scenario.name}:${key}`);
    }
    assertNoForbiddenFields(result, manifest.forbidden_output_fields);
    assertNoSentinelValues(result, scenario.forbiddenSentinels);
  }
});


test("consumer:health aliases legacy claude profile only for claude health probes", async () => {
  const calls: string[] = [];
  const launcher = {
    profileStore: { list: () => [{ profileName: "claude-9224" }] },
    status: async (profile?: string): Promise<ManagedBrowserStatus> => {
      calls.push(profile || "");
      if (profile === "claude-9224") {
        return {
          profile,
          profileDir: `/tmp/${profile}`,
          cdpEndpoint: "http://127.0.0.1:9224",
          cdpPort: 9224,
          connected: true,
          launchedByPackage: false,
          pages: [
            {
              id: "claude-page",
              type: "page",
              title: "Claude",
              url: "https://claude.ai/new"
            }
          ]
        } as ManagedBrowserStatus;
      }
      return {
        profile: profile || "",
        profileDir: `/tmp/${profile || "unknown"}`,
        cdpEndpoint: "http://127.0.0.1:0",
        cdpPort: 0,
        connected: false,
        launchedByPackage: false,
        pages: []
      } as ManagedBrowserStatus;
    }
  };

  const aliased = await consumerHealth({
    target: "claude",
    profile: "claude",
    launcher,
    now: () => new Date(fixtures().checkedAt)
  });

  assert.equal(aliased.ok, true);
  assert.equal(aliased.status, "ok");
  assert.equal(aliased.profile, "claude-9224");
  assert.equal(calls.at(-1), "claude-9224");

  const scoped = await consumerHealth({
    target: "chatgpt",
    profile: "claude",
    launcher,
    now: () => new Date(fixtures().checkedAt)
  });

  assert.equal(scoped.profile, "claude");
  assert.equal(calls.at(-1), "claude");
});

test("consumer:health CLI emits the safe contract shape", async (t: any) => {
  const originalStatus = ManagedBrowserLauncher.prototype.status;
  const scenario = fixtures().scenarios.find((item) => item.name === "connected-chatgpt-page")!;
  ManagedBrowserLauncher.prototype.status = async function() { return scenario.status as ManagedBrowserStatus; };
  t.after(() => { ManagedBrowserLauncher.prototype.status = originalStatus; });

  const stdout = await captureStdout(() => main(["consumer:health", "--target", "chatgpt", "--profile", "chatgpt", "--json"]));
  const parsed = JSON.parse(stdout);
  const alwaysPresent = contract().commands.find((command: any) => command.cli_name === "consumer:health").output_keys.always_present;

  assertConsumerHealthSchema(parsed, alwaysPresent);
  assert.equal(parsed.ok, true);
  assertNoForbiddenFields(parsed, contract().forbidden_output_fields);
  assertNoSentinelValues(parsed, scenario.forbiddenSentinels);
});

test("consumer contract manifest is internally consistent", async () => {
  const manifest = contract();
  const packageJson = readJson("package.json");
  const cliSource = fs.readFileSync(path.resolve(process.cwd(), "src/cli.ts"), "utf-8");
  const mcpToolNames = new Set(listMcpTools().map((tool) => tool.name));
  const resourceUris = new Set(listMcpResources().map((resource) => resource.uri));

  assert.equal(manifest.package_version, packageJson.version);
  assert.equal(manifest.contract_version, "consumer-contract-2.1.0");
  assert.equal(manifest.commands.length, 192);
  assert.deepEqual(manifest.error_codes, [...CONSUMER_ERROR_CODES]);
  assert.equal(manifest.error_codes.length, 40);

  for (const code of ["IFRAME_NOT_FOUND", "ELEMENT_OUT_OF_VIEWPORT", "ARTIFACT_DOWNLOAD_TIMEOUT", "ARTIFACT_VERIFICATION_FAILED", "DOCX_VERIFICATION_FAILED", "POSTCONDITION_TIMEOUT", "RESUME_REQUIRES_CONFIRMATION", "IDEMPOTENCY_MISMATCH", "PROFILE_LOCKED", "PROFILE_LEASE_BUSY", "AUTO_PUBLISH_DETECTED", "ARTIFACT_MODE_UNSUPPORTED", "MODEL_SELECTION_DRIFT", "PLAN_OR_QUOTA_REQUIRED", "SAFE_OUTPUT_REDACTION_REQUIRED", "MODE_UNCERTAIN", "HUMAN_HANDOFF_REQUIRED", "SENSITIVE_CONTENT_GUARD", "SUBMCP_QUOTA_EXHAUSTED", "SUBMCP_NOT_PROVISIONED", "UI_DRIFT_DETECTED", "HEAL_CONFIDENCE_LOW", "PROFILE_LEASE_TIMEOUT", "TAB_LEASE_EXPIRED", ...CHROME_EXTENSION_ERROR_CODES]) {
    assert.ok(manifest.error_codes.includes(code), `missing error code ${code}`);
  }
  const docs = consumerContractDoc();
  for (const code of CHROME_EXTENSION_ERROR_CODES) {
    const description = docs.match(new RegExp(`\`${code}\` means ([^\n]+(?:\n(?!\n)[^\n]+)*)`))?.[1]?.trim();
    assert.ok(description && description.length > 40, `${code} missing non-empty docs description`);
  }
  for (const cliName of ["browser:artifact-click", "browser:click", "browser:upload", "browser:wait", "browser:hover", "workflow:run", "browser:audit", "verify:docx-min", "wah:capability:query", "wah:adapter:health", "wah:policy:explain", "wah:task:start", "wah:task:status", "wah:task:cancel", "wah:task:resume", "wah:artifact:get"]) {
    assert.ok(manifest.commands.find((command: any) => command.cli_name === cliName), `missing command row ${cliName}`);
  }
  assert.ok(manifest.sensitive_fields["artifact_click.path"]);

  for (const command of manifest.commands) {
    assert.ok(cliSource.includes(`"${command.cli_name}"`), `${command.cli_name} does not resolve in CLI source`);
    assert.ok(["stable", "experimental", "placeholder"].includes(command.maturity), `${command.cli_name} maturity`);
    assert.ok(["read", "mutate", "risky"].includes(command.safety_class), `${command.cli_name} safety_class`);
    assert.equal(typeof command.may_contain_sensitive_local_fields, "boolean", `${command.cli_name} sensitivity flag`);
    assert.ok(Array.isArray(command.required_args), `${command.cli_name} required_args`);
    assert.ok(Array.isArray(command.output_keys.always_present), `${command.cli_name} always_present`);
    assert.ok(Array.isArray(command.output_keys.optional), `${command.cli_name} optional`);
    if (command.mcp_name) assert.ok(mcpToolNames.has(command.mcp_name), `${command.mcp_name} missing from MCP tools`);
  }

  for (const resource of manifest.resources) {
    assert.ok(resourceUris.has(resource.uri), `${resource.uri} missing from MCP resources`);
    assert.ok(["stable", "experimental", "placeholder"].includes(resource.maturity), `${resource.uri} maturity`);
    assert.ok(["read", "mutate", "risky"].includes(resource.safety_class), `${resource.uri} safety_class`);
  }


  const browserRead = manifest.commands.find((command: any) => command.cli_name === "browser:read");
  assert.ok(browserRead.flags.includes("include-portals"), "browser:read include-portals flag missing from contract");
  const browserHover = manifest.commands.find((command: any) => command.cli_name === "browser:hover");
  assert.ok(browserHover.flags.includes("dwell-ms"), "browser:hover dwell-ms flag missing from contract");
  assert.ok(browserHover.flags.includes("settle-selector"), "browser:hover settle-selector flag missing from contract");

  const healthCommand = manifest.commands.find((command: any) => command.cli_name === "consumer:health");
  const result = await consumerHealth({
    target: "chatgpt",
    profile: "chatgpt",
    launcher: launcherForScenario(fixtures().scenarios[0]),
    now: () => new Date(fixtures().checkedAt)
  });
  assert.deepEqual(Object.keys(result), healthCommand.output_keys.always_present);
});


const expectedWebaiToolCount = 41; // Phase 8 Bucket A: prior 40 webai tools + literature task status

const webAiCodexTools = [
  { cli: "webai:chatgpt:codex:submit-task", mcp: "webai_chatgpt_codex_submit_task", ts: "webAiChatgptCodexSubmitTask", fn: webAiChatgptCodexSubmitTask, maturity: "experimental", safety: "mutate" },
  { cli: "webai:chatgpt:codex:list-envs", mcp: "webai_chatgpt_codex_list_envs", ts: "webAiChatgptCodexListEnvs", fn: webAiChatgptCodexListEnvs, maturity: "experimental", safety: "read" },
  { cli: "webai:chatgpt:codex:task-status", mcp: "webai_chatgpt_codex_task_status", ts: "webAiChatgptCodexTaskStatus", fn: webAiChatgptCodexTaskStatus, maturity: "experimental", safety: "read" },
  { cli: "webai:chatgpt:codex:get-diff", mcp: "webai_chatgpt_codex_get_diff", ts: "webAiChatgptCodexGetDiff", fn: webAiChatgptCodexGetDiff, maturity: "experimental", safety: "read", sensitive: true }
];

const webAiV13Tools = [
  { cli: "webai:chatgpt:send-prompt", mcp: "webai_chatgpt_send_prompt", ts: "webAiChatgptSendPrompt", fn: webAiChatgptSendPrompt },
  { cli: "webai:chatgpt:select-model", mcp: "webai_chatgpt_select_model", ts: "webAiChatgptSelectModel", fn: webAiChatgptSelectModel },
  { cli: "webai:claude:send-prompt", mcp: "webai_claude_send_prompt", ts: "webAiClaudeSendPrompt", fn: webAiClaudeSendPrompt },
  { cli: "webai:claude:select-model", mcp: "webai_claude_select_model", ts: "webAiClaudeSelectModel", fn: webAiClaudeSelectModel },
  { cli: "webai:gemini:send-prompt", mcp: "webai_gemini_send_prompt", ts: "webAiGeminiSendPrompt", fn: webAiGeminiSendPrompt },
  { cli: "webai:gemini:select-model", mcp: "webai_gemini_select_model", ts: "webAiGeminiSelectModel", fn: webAiGeminiSelectModel },
  { cli: "webai:chatgpt:upload-and-query", mcp: "webai_chatgpt_upload_and_query", ts: "webAiChatgptUploadAndQuery", fn: webAiChatgptUploadAndQuery },
  { cli: "webai:claude:upload-and-query", mcp: "webai_claude_upload_and_query", ts: "webAiClaudeUploadAndQuery", fn: webAiClaudeUploadAndQuery },
  { cli: "webai:gemini:upload-and-query", mcp: "webai_gemini_upload_and_query", ts: "webAiGeminiUploadAndQuery", fn: webAiGeminiUploadAndQuery },
  { cli: "webai:chatgpt:generate-file", mcp: "webai_chatgpt_generate_file", ts: "webAiChatgptGenerateFile", fn: webAiChatgptGenerateFile },
  { cli: "webai:claude:generate-file", mcp: "webai_claude_generate_file", ts: "webAiClaudeGenerateFile", fn: webAiClaudeGenerateFile },
  { cli: "webai:chatgpt:generate-image", mcp: "webai_chatgpt_generate_image", ts: "webAiChatgptGenerateImage", fn: webAiChatgptGenerateImage },
  { cli: "webai:gemini:generate-image", mcp: "webai_gemini_generate_image", ts: "webAiGeminiGenerateImage", fn: webAiGeminiGenerateImage },
  { cli: "webai:gemini:canvas-to-docs", mcp: "webai_gemini_canvas_to_docs", ts: "webAiGeminiCanvasToDocs", fn: webAiGeminiCanvasToDocs },
  { cli: "webai:gemini:generate-video", mcp: "webai_gemini_generate_video", ts: "webAiGeminiGenerateVideo", fn: webAiGeminiGenerateVideo },
  { cli: "webai:gemini:deep-research", mcp: "webai_gemini_deep_research", ts: "webAiGeminiDeepResearch", fn: webAiGeminiDeepResearch },
  { cli: "webai:gemini:canvas-edit", mcp: "webai_gemini_canvas_edit", ts: "webAiGeminiCanvasEdit", fn: webAiGeminiCanvasEdit },
  { cli: "webai:gemini:conversation-manage", mcp: "webai_gemini_conversation_manage", ts: "webAiGeminiConversationManage", fn: webAiGeminiConversationManage },
  { cli: "webai:gemini:workspace", mcp: "webai_gemini_workspace", ts: "webAiGeminiWorkspace", fn: webAiGeminiWorkspace },
  { cli: "webai:chatgpt:canvas-export", mcp: "webai_chatgpt_canvas_export", ts: "webAiChatgptCanvasExport", fn: webAiChatgptCanvasExport, sensitive: true },
  { cli: "webai:chatgpt:pulse:get", mcp: "webai_chatgpt_pulse_get", ts: "webAiChatgptPulseGet", fn: webAiChatgptPulseGet },
  { cli: "webai:chatgpt:pulse:onboard", mcp: "webai_chatgpt_pulse_onboard", ts: "webAiChatgptPulseOnboard", fn: webAiChatgptPulseOnboard },
  { cli: "webai:chatgpt:deep-research", mcp: "webai_chatgpt_deep_research", ts: "webAiChatgptDeepResearch", fn: webAiChatgptDeepResearch },
  { cli: "webai:claude:deep-research", mcp: "webai_claude_deep_research", ts: "webAiClaudeDeepResearch", fn: webAiClaudeDeepResearch },
  { cli: "webai:chatgpt:conversation-manage", mcp: "webai_chatgpt_conversation_manage", ts: "webAiChatgptConversationManage", fn: webAiChatgptConversationManage },
  { cli: "webai:claude:conversation-manage", mcp: "webai_claude_conversation_manage", ts: "webAiClaudeConversationManage", fn: webAiClaudeConversationManage },
  { cli: "webai:chatgpt:workspace", mcp: "webai_chatgpt_workspace", ts: "webAiChatgptWorkspace", fn: webAiChatgptWorkspace },
  { cli: "webai:claude:workspace", mcp: "webai_claude_workspace", ts: "webAiClaudeWorkspace", fn: webAiClaudeWorkspace },
  { cli: "webai:claude:design:create-project", mcp: "webai_claude_design_create_project", ts: "webAiClaudeDesignCreateProject", fn: webAiClaudeDesignCreateProject },
  { cli: "webai:claude:design:generate", mcp: "webai_claude_design_generate", ts: "webAiClaudeDesignGenerate", fn: webAiClaudeDesignGenerate },
  { cli: "webai:claude:design:get-html", mcp: "webai_claude_design_get_html", ts: "webAiClaudeDesignGetHtml", fn: webAiClaudeDesignGetHtml, sensitive: true },
  { cli: "webai:claude:design:present", mcp: "webai_claude_design_present", ts: "webAiClaudeDesignPresent", fn: webAiClaudeDesignPresent },
  { cli: "webai:gemini:music:generate", mcp: "webai_gemini_music_generate", ts: "webAiGeminiMusicGenerate", fn: webAiGeminiMusicGenerate },
  { cli: "webai:gemini:music:download-track", mcp: "webai_gemini_music_download_track", ts: "webAiGeminiMusicDownloadTrack", fn: webAiGeminiMusicDownloadTrack, sensitive: true },
  { cli: "webai:gemini:music:task-status", mcp: "webai_gemini_music_task_status", ts: "webAiGeminiMusicTaskStatus", fn: webAiGeminiMusicTaskStatus },
  { cli: "webai:task-status", mcp: "webai_task_status", ts: "webAiTaskStatus", fn: webAiTaskStatus },
  { cli: "webai:literature-task-status", mcp: "webai_literature_task_status", ts: "webAiLiteratureTaskStatus", fn: webAiLiteratureTaskStatus }
];

const wahFacadeTools = [
  { cli: "wah:capability:query", mcp: "wah_capability_query", ts: "wahCapabilityQuery", fn: wahCapabilityQuery, safety: "read", required: [] },
  { cli: "wah:adapter:health", mcp: "wah_adapter_health", ts: "wahAdapterHealth", fn: wahAdapterHealth, safety: "read", required: [] },
  { cli: "wah:policy:explain", mcp: "wah_policy_explain", ts: "wahPolicyExplain", fn: wahPolicyExplain, safety: "read", required: [] },
  { cli: "wah:task:start", mcp: "wah_task_start", ts: "wahTaskStart", fn: wahTaskStart, safety: "mutate", required: ["manifest_id"] },
  { cli: "wah:task:status", mcp: "wah_task_status", ts: "wahTaskStatus", fn: wahTaskStatus, safety: "read", required: ["run_id"] },
  { cli: "wah:task:cancel", mcp: "wah_task_cancel", ts: "wahTaskCancel", fn: wahTaskCancel, safety: "mutate", required: ["run_id"] },
  { cli: "wah:task:resume", mcp: "wah_task_resume", ts: "wahTaskResume", fn: wahTaskResume, safety: "mutate", required: ["run_id", "manifest_id"] },
  { cli: "wah:artifact:get", mcp: "wah_artifact_get", ts: "wahArtifactGet", fn: wahArtifactGet, safety: "read", required: [] }
];


test("stream5 B1 webai send-prompt schemas expose optional model/control params", () => {
  const tools: any[] = listMcpTools();
  const cases = [
    { name: "webai_chatgpt_send_prompt", params: { model: "string", web_search: "boolean", canvas: "boolean" } },
    { name: "webai_claude_send_prompt", params: { model: "string", thinking: "boolean", web_search: "boolean", incognito: "boolean", backend: undefined } },
    { name: "webai_gemini_send_prompt", params: { model: "string", thinking: "boolean", web_search: "boolean" } }
  ];
  for (const item of cases) {
    const tool = tools.find((t) => t.name === item.name);
    assert.ok(tool, `${item.name} missing`);
    const schema = tool.inputSchema || tool.schema || {};
    const props = schema.properties || schema.schema?.properties || {};
    const required = schema.required || schema.schema?.required || [];
    for (const [param, type] of Object.entries(item.params)) {
      assert.equal(props[param]?.type, type, `${item.name}.${param} type`);
      assert.equal(required.includes(param), false, `${item.name}.${param} must be optional`);
    }
  }
});

test("stream5 B1 contract optional_args round-trip for webai model/control params", () => {
  const manifest = contract();
  const expected: Record<string, string[]> = {
    webai_chatgpt_send_prompt: ["model", "web_search", "canvas"],
    webai_claude_send_prompt: ["model", "thinking", "web_search", "incognito", "backend"],
    webai_gemini_send_prompt: ["model", "thinking", "web_search"],
    webai_chatgpt_select_model: ["model", "thinking_level"],
    webai_claude_select_model: ["model", "thinking_level"],
    webai_gemini_select_model: ["model", "thinking_level"],
    webai_chatgpt_upload_and_query: ["model"],
    webai_claude_upload_and_query: ["model", "reuse_conversation", "backend"],
    webai_gemini_upload_and_query: ["model"],
    webai_chatgpt_generate_file: ["model"],
    webai_claude_generate_file: ["model", "backend"],
    webai_chatgpt_generate_image: ["model", "backend"],
    webai_gemini_generate_image: ["model", "backend"],
    webai_gemini_canvas_to_docs: ["model"],
    webai_gemini_generate_video: ["model", "account_pool", "backend"],
    webai_gemini_music_generate: ["confirmed", "tab_url_contains", "backend"]
  };
  for (const [mcp, params] of Object.entries(expected)) {
    const row = manifest.commands.find((command: any) => command.mcp_name === mcp);
    assert.ok(row, `${mcp} contract row missing`);
    for (const param of params) assert.ok(row.optional_args?.includes(param), `${mcp} optional_args missing ${param}`);
  }
  assert.equal(expectedWebaiToolCount, 41);
});

test("consumer contract v1.7.1 webai tools round-trip through CLI, MCP, and TS exports", () => {
  const manifest = contract();
  const cliSource = fs.readFileSync(path.resolve(process.cwd(), "src/cli.ts"), "utf-8");
  const mcpToolNames = new Set(listMcpTools().map((tool) => tool.name));
  for (const item of webAiV13Tools) {
    const row = manifest.commands.find((command: any) => command.cli_name === item.cli);
    assert.ok(row, `missing contract row ${item.cli}`);
    assert.equal(row.mcp_name, item.mcp);
    assert.equal(row.ts_export, item.ts);
    assert.equal(row.maturity, "experimental");
    assert.equal(row.may_contain_sensitive_local_fields, Boolean((item as any).sensitive));
    assert.ok(cliSource.includes(`"${item.cli}"`), `${item.cli} missing from CLI dispatch map`);
    assert.ok(mcpToolNames.has(item.mcp), `${item.mcp} missing from MCP tools`);
    assert.equal(typeof item.fn, "function", `${item.ts} missing TS export`);
    assertNoForbiddenFields(row.output_keys, manifest.forbidden_output_fields);
  }
  for (const item of webAiCodexTools) {
    const row = manifest.commands.find((command: any) => command.cli_name === item.cli);
    assert.ok(row, `missing contract row ${item.cli}`);
    assert.equal(row.mcp_name, item.mcp);
    assert.equal(row.ts_export, item.ts);
    assert.equal(row.maturity, item.maturity);
    assert.equal(row.safety_class, item.safety);
    assert.equal(row.may_contain_sensitive_local_fields, Boolean((item as any).sensitive));
    assert.ok(cliSource.includes(`"${item.cli}"`), `${item.cli} missing from CLI dispatch map`);
    assert.ok(mcpToolNames.has(item.mcp), `${item.mcp} missing from MCP tools`);
    assert.equal(typeof item.fn, "function", `${item.ts} missing TS export`);
    assertNoForbiddenFields(row.output_keys, manifest.forbidden_output_fields);
  }
  const codexTools = manifest.commands.filter((command: any) => String(command.mcp_name || "").startsWith("webai_chatgpt_codex_"));
  assert.equal(codexTools.length, 4);
  assert.deepEqual(codexTools.map((command: any) => command.mcp_name).sort(), webAiCodexTools.map((item) => item.mcp).sort());
  assert.equal(manifest.commands.filter((command: any) => String(command.mcp_name || "").startsWith("webai_")).length, expectedWebaiToolCount);
  const videoRow = manifest.commands.find((command: any) => command.mcp_name === "webai_gemini_generate_video");
  assert.ok(videoRow.output_keys.optional.includes("account_rotations"), "video optional output missing account_rotations");
  assert.ok(videoRow.output_keys.optional.includes("accounts_tried_count"), "video optional output missing accounts_tried_count");
  assert.equal(videoRow.output_keys.optional.includes("account_used"), false, "video output must not expose account_used");
});


test("p1 wah facade tools round-trip through contract, CLI, MCP, and TS exports", () => {
  const manifest = contract();
  const cliSource = fs.readFileSync(path.resolve(process.cwd(), "src/cli.ts"), "utf-8");
  const mcpToolNames = new Set(listMcpTools().map((tool) => tool.name));
  const byMcp = new Map(manifest.commands.map((command: any) => [command.mcp_name, command]));

  assert.equal(manifest.commands.length, 192, "Phase 8 Bucket A command lock must be 192");
  assert.ok(byMcp.has("wah_capability_query"), "wah_capability_query command row missing");
  assert.ok(byMcp.has("wah_adapter_health"), "wah_adapter_health command row missing");
  assert.ok(byMcp.has("wah_policy_explain"), "wah_policy_explain command row missing");
  assert.ok(byMcp.has("wah_task_start"), "wah_task_start command row missing");
  assert.ok(byMcp.has("wah_task_status"), "wah_task_status command row missing");
  assert.ok(byMcp.has("wah_task_cancel"), "wah_task_cancel command row missing");
  assert.ok(byMcp.has("wah_task_resume"), "wah_task_resume command row missing");
  assert.ok(byMcp.has("wah_artifact_get"), "wah_artifact_get command row missing");

  for (const item of wahFacadeTools) {
    const row = byMcp.get(item.mcp) as any;
    assert.equal(row.cli_name, item.cli, `${item.mcp} cli_name`);
    assert.equal(row.ts_export, item.ts, `${item.mcp} ts_export`);
    assert.equal(row.safety_class, item.safety, `${item.mcp} safety_class`);
    assert.deepEqual(row.required_args, item.required, `${item.mcp} required_args`);
    assert.ok(cliSource.includes(`"${item.cli}"`), `${item.cli} missing from CLI dispatch`);
    assert.ok(mcpToolNames.has(item.mcp), `${item.mcp} missing from MCP tools`);
    assert.equal(typeof item.fn, "function", `${item.ts} missing TS export`);
    assertNoForbiddenFields(row.output_keys, manifest.forbidden_output_fields);
  }
});

test("p1 wah_task_start supports dry_run input in contract and MCP schema", () => {
  const row = contract().commands.find((command: any) => command.mcp_name === "wah_task_start");
  assert.ok(row.optional_args?.includes("dry_run"), "wah_task_start optional_args missing dry_run");
  const tool = listMcpTools().find((entry) => entry.name === "wah_task_start")!;
  assert.equal((tool.inputSchema as any).properties.dry_run.type, "boolean");
});

test("stream5 plus issue14 surface: webai tool count is exactly 41", () => {
  const manifest = contract();
  const webaiCommands = manifest.commands.filter(
    (c: any) => String(c.mcp_name || "").startsWith("webai_")
  );
  assert.equal(webaiCommands.length, expectedWebaiToolCount,
    `Expected 41 webai tools; got ${webaiCommands.length}. W1 selector reconciliation required.`);
  const subMcpTools = webaiCommands.filter(
    (c: any) => ["webai_claude_design_", "webai_gemini_music_", "webai_chatgpt_codex_"].some((prefix) => String(c.mcp_name || "").startsWith(prefix))
  );
  assert.equal(subMcpTools.length, 11,
    `Expected 11 sub-MCP tools; got ${subMcpTools.length}`);
  const originalTools = new Set([
    "webai_chatgpt_send_prompt", "webai_claude_send_prompt",
    "webai_gemini_send_prompt", "webai_chatgpt_upload_and_query",
    "webai_claude_upload_and_query", "webai_gemini_upload_and_query",
    "webai_chatgpt_generate_file", "webai_claude_generate_file",
    "webai_chatgpt_generate_image", "webai_gemini_generate_image",
    "webai_gemini_canvas_to_docs", "webai_gemini_generate_video",
    "webai_task_status"
  ]);
  const originalWebaiTools = webaiCommands.filter((c: any) => originalTools.has(c.mcp_name));
  assert.equal(originalWebaiTools.length, 13,
    `Expected 13 pre-existing webai tools; got ${originalWebaiTools.length}`);
  const mainServerNewTools = webaiCommands.filter(
    (c: any) => !originalTools.has(c.mcp_name) && !subMcpTools.includes(c)
  );
  assert.equal(mainServerNewTools.length, 17,
    `Expected 17 new main-server tools; got ${mainServerNewTools.length}`);
  assert.equal(originalWebaiTools.length + mainServerNewTools.length + subMcpTools.length, expectedWebaiToolCount,
    "Expected Stream #5 plus W1 split to total 41 (13 pre-existing + 17 main-server + 11 sub-MCP)");
});

test("phase8 final error_codes count is 40", () => {
  const manifest = contract();
  assert.equal(manifest.error_codes.length, 40);
  assert.ok(manifest.error_codes.includes("UI_DRIFT_DETECTED"), "UI_DRIFT_DETECTED missing from contract");
  assert.ok((CONSUMER_ERROR_CODES as readonly string[]).includes("UI_DRIFT_DETECTED"), "UI_DRIFT_DETECTED missing from TS export");
  assert.ok(manifest.error_codes.includes("HEAL_CONFIDENCE_LOW"), "HEAL_CONFIDENCE_LOW missing from contract");
  assert.ok((CONSUMER_ERROR_CODES as readonly string[]).includes("HEAL_CONFIDENCE_LOW"), "HEAL_CONFIDENCE_LOW missing from TS export");
  assert.ok(manifest.error_codes.includes("LITERATURE_QUEUED"), "LITERATURE_QUEUED missing from contract");
  assert.ok((CONSUMER_ERROR_CODES as readonly string[]).includes("LITERATURE_QUEUED"), "LITERATURE_QUEUED missing from TS export");
  for (const code of [
    "SENSITIVE_CONTENT_GUARD", "SUBMCP_QUOTA_EXHAUSTED", "SUBMCP_NOT_PROVISIONED", "UI_DRIFT_DETECTED", "HEAL_CONFIDENCE_LOW", "LITERATURE_QUEUED"
  ]) {
    assert.ok(manifest.error_codes.includes(code),
      `stream5 error code missing from contract: ${code}`);
    assert.ok((CONSUMER_ERROR_CODES as readonly string[]).includes(code),
      `stream5 error code missing from TS export: ${code}`);
  }
});

test("p2 error code PROFILE_LEASE_TIMEOUT (#35) is present in TS export and contract", () => {
  const manifest = contract();
  assert.equal(manifest.error_codes[34], "PROFILE_LEASE_TIMEOUT");
  assert.ok((CONSUMER_ERROR_CODES as readonly string[]).includes("PROFILE_LEASE_TIMEOUT"));
});

test("p2 error code TAB_LEASE_EXPIRED (#36) is present in TS export and contract", () => {
  const manifest = contract();
  assert.equal(manifest.error_codes[35], "TAB_LEASE_EXPIRED");
  assert.ok((CONSUMER_ERROR_CODES as readonly string[]).includes("TAB_LEASE_EXPIRED"));
});

test("researchdb Inventory/AIAA/WoS/ACM/IEEE/ACS/ASME/RSC/Wiley/ASCE/IOP/T&F/SAE/ScienceDirect/APS/Emerald/Cambridge/Springer/Nature/IET/AIP/MDPI/Optica/ProQuest/SCOAP3/DBLP/SciELO/INSPIRE-HEP/PubScholar/Opticsjournal/CRC/Cell Press/IEST/IncoPat/Wanfang tools are separate from webai sub-MCP and lock contract counts", () => {
  const manifest = contract();
  const packageJson = readJson("package.json");
  const mcpToolNames = listMcpTools().map((tool) => tool.name);
  const subMcpToolNames = subMcpToolSpecs.map((tool) => tool.name);
  const row = manifest.commands.find((command: any) => command.mcp_name === "research_inventory_import");
  const oldImportToolName = ["research", "nu" + "aa", "import"].join("_");

  assert.ok(row, "research_inventory_import contract row missing");
  assert.equal(row.cli_name, "research:inventory:import");
  assert.equal(row.ts_export, "ResearchDbImporter.importInventorySeed");
  assert.equal(row.maturity, "experimental");
  assert.equal(row.safety_class, "mutate");
  assert.deepEqual(row.required_args, []);
  assert.deepEqual(row.output_keys.always_present, ["imported", "sites", "path"]);
  assert.equal(row.may_contain_sensitive_local_fields, false);
  assert.ok(mcpToolNames.includes("research_inventory_import"), "research_inventory_import missing from listMcpTools()");
  assert.equal("research_inventory_import".startsWith("webai_"), false, "research_inventory_import must not be webai-prefixed");
  assert.equal(mcpToolNames.includes("webai_research_inventory_import"), false, "webai-prefixed academic research tool must not exist");
  assert.equal(subMcpToolNames.includes("research_inventory_import"), false, "research_inventory_import must not be registered via subMcpToolSpecs");
  assert.equal(mcpToolNames.includes(oldImportToolName), false, "old import tool must not be listed");
  assert.equal(manifest.commands.some((command: any) => command.mcp_name === oldImportToolName), false, "old import row must not remain in contract");
  const researchRows = [
    { cli: "research:aiaa:search", mcp: "research_aiaa_search", ts: "researchAiaaSearch", safety: "read", required: ["query"], always: ["result_count", "items", "query_url"], fn: researchAiaaSearch },
    { cli: "research:aiaa:filter", mcp: "research_aiaa_filter", ts: "researchAiaaFilter", safety: "read", required: ["query"], always: ["result_count", "items", "refined_url", "confirm_title"], fn: researchAiaaFilter },
    { cli: "research:aiaa:export", mcp: "research_aiaa_export", ts: "researchAiaaExport", safety: "mutate", required: ["doi"], always: ["artifact_path", "bytes", "sha256", "format", "doi"], fn: researchAiaaExport },
    { cli: "research:wos:search", mcp: "research_wos_search", ts: "researchWosSearch", safety: "read", required: ["query"], always: ["result_count", "items", "query_url"], fn: researchWosSearch },
    { cli: "research:wos:filter", mcp: "research_wos_filter", ts: "researchWosFilter", safety: "read", required: ["query"], always: ["result_count", "items", "refined_url", "confirm_title", "active_refine"], fn: researchWosFilter },
    { cli: "research:wos:export", mcp: "research_wos_export", ts: "researchWosExport", safety: "mutate", required: ["query"], always: ["artifact_path", "bytes", "sha256", "format", "result_count"], fn: researchWosExport },
    { cli: "research:acm:search", mcp: "research_acm_search", ts: "researchAcmSearch", safety: "read", required: ["query"], always: ["result_count", "items", "query_url"], fn: researchAcmSearch },
    { cli: "research:acm:filter", mcp: "research_acm_filter", ts: "researchAcmFilter", safety: "read", required: ["query"], always: ["result_count", "items", "refined_url", "confirm_title"], fn: researchAcmFilter },
    { cli: "research:acm:export", mcp: "research_acm_export", ts: "researchAcmExport", safety: "mutate", required: ["doi"], always: ["artifact_path", "bytes", "sha256", "format", "doi"], fn: researchAcmExport },
    { cli: "research:ieee:search", mcp: "research_ieee_search", ts: "researchIeeeSearch", safety: "read", required: ["query"], always: ["result_count", "items", "query_url"], fn: researchIeeeSearch },
    { cli: "research:ieee:filter", mcp: "research_ieee_filter", ts: "researchIeeeFilter", safety: "read", required: ["query"], always: ["result_count", "items", "refined_url", "confirm_title"], fn: researchIeeeFilter },
    { cli: "research:ieee:export", mcp: "research_ieee_export", ts: "researchIeeeExport", safety: "mutate", required: ["query"], always: ["artifact_path", "bytes", "sha256", "format"], fn: researchIeeeExport },
    { cli: "research:acs:search", mcp: "research_acs_search", ts: "researchAcsSearch", safety: "read", required: ["query"], always: ["result_count", "items", "query_url"], fn: researchAcsSearch },
    { cli: "research:acs:filter", mcp: "research_acs_filter", ts: "researchAcsFilter", safety: "read", required: ["query"], always: ["result_count", "items", "refined_url", "confirm_title"], fn: researchAcsFilter },
    { cli: "research:acs:export", mcp: "research_acs_export", ts: "researchAcsExport", safety: "mutate", required: ["doi"], always: ["artifact_path", "bytes", "sha256", "format", "doi"], fn: researchAcsExport },
    { cli: "research:asme:search", mcp: "research_asme_search", ts: "researchAsmeSearch", safety: "read", required: ["query"], always: ["result_count", "items", "query_url"], fn: researchAsmeSearch },
    { cli: "research:asme:filter", mcp: "research_asme_filter", ts: "researchAsmeFilter", safety: "read", required: ["query"], always: ["result_count", "items", "refined_url", "confirm_title"], fn: researchAsmeFilter },
    { cli: "research:asme:export", mcp: "research_asme_export", ts: "researchAsmeExport", safety: "mutate", required: ["doi"], always: ["artifact_path", "bytes", "sha256", "format", "doi", "resource_id"], fn: researchAsmeExport },
    { cli: "research:rsc:search", mcp: "research_rsc_search", ts: "researchRscSearch", safety: "read", required: ["query"], always: ["result_count", "items", "query_url"], fn: researchRscSearch },
    { cli: "research:rsc:filter", mcp: "research_rsc_filter", ts: "researchRscFilter", safety: "read", required: ["query"], always: ["result_count", "items", "refined_url", "confirm_title"], fn: researchRscFilter },
    { cli: "research:rsc:export", mcp: "research_rsc_export", ts: "researchRscExport", safety: "mutate", required: ["doi"], always: ["artifact_path", "bytes", "sha256", "format", "doi"], fn: researchRscExport },
    { cli: "research:wiley:search", mcp: "research_wiley_search", ts: "researchWileySearch", safety: "read", required: ["query"], always: ["result_count", "items", "query_url"], fn: researchWileySearch },
    { cli: "research:wiley:filter", mcp: "research_wiley_filter", ts: "researchWileyFilter", safety: "read", required: ["query"], always: ["result_count", "items", "refined_url", "confirm_title"], fn: researchWileyFilter },
    { cli: "research:wiley:export", mcp: "research_wiley_export", ts: "researchWileyExport", safety: "mutate", required: ["doi"], always: ["artifact_path", "bytes", "sha256", "format", "doi"], fn: researchWileyExport },
    { cli: "research:asce:search", mcp: "research_asce_search", ts: "researchAsceSearch", safety: "read", required: ["query"], always: ["result_count", "items", "query_url"], fn: researchAsceSearch },
    { cli: "research:asce:filter", mcp: "research_asce_filter", ts: "researchAsceFilter", safety: "read", required: ["query"], always: ["result_count", "items", "refined_url", "confirm_title"], fn: researchAsceFilter },
    { cli: "research:asce:export", mcp: "research_asce_export", ts: "researchAsceExport", safety: "mutate", required: ["doi"], always: ["artifact_path", "bytes", "sha256", "format", "doi"], fn: researchAsceExport },
    { cli: "research:iop:search", mcp: "research_iop_search", ts: "researchIopSearch", safety: "read", required: ["query"], always: ["result_count", "items", "query_url"], fn: researchIopSearch },
    { cli: "research:iop:filter", mcp: "research_iop_filter", ts: "researchIopFilter", safety: "read", required: ["query"], always: ["result_count", "items", "refined_url", "confirm_title"], fn: researchIopFilter },
    { cli: "research:iop:export", mcp: "research_iop_export", ts: "researchIopExport", safety: "mutate", required: ["doi"], always: ["artifact_path", "bytes", "sha256", "format", "doi", "export_url"], fn: researchIopExport },
    { cli: "research:tandf:search", mcp: "research_tandf_search", ts: "researchTandfSearch", safety: "read", required: ["query"], always: ["result_count", "items", "query_url"], fn: researchTandfSearch },
    { cli: "research:tandf:filter", mcp: "research_tandf_filter", ts: "researchTandfFilter", safety: "read", required: ["query"], always: ["result_count", "items", "refined_url", "confirm_title"], fn: researchTandfFilter },
    { cli: "research:tandf:export", mcp: "research_tandf_export", ts: "researchTandfExport", safety: "mutate", required: ["doi"], always: ["artifact_path", "bytes", "sha256", "format", "doi"], fn: researchTandfExport },
    { cli: "research:sae:search", mcp: "research_sae_search", ts: "researchSaeSearch", safety: "read", required: ["query"], always: ["result_count", "items", "query_url"], fn: researchSaeSearch },
    { cli: "research:sae:filter", mcp: "research_sae_filter", ts: "researchSaeFilter", safety: "read", required: ["query"], always: ["result_count", "items", "refined_url", "confirm_title"], fn: researchSaeFilter },
    { cli: "research:sae:export", mcp: "research_sae_export", ts: "researchSaeExport", safety: "mutate", required: ["query"], always: ["artifact_path", "bytes", "sha256", "format", "query", "result_count"], fn: researchSaeExport },
    { cli: "research:sciencedirect:search", mcp: "research_sciencedirect_search", ts: "researchScienceDirectSearch", safety: "read", required: ["query"], always: ["result_count", "items", "query_url"], fn: researchScienceDirectSearch },
    { cli: "research:sciencedirect:filter", mcp: "research_sciencedirect_filter", ts: "researchScienceDirectFilter", safety: "read", required: ["query"], always: ["result_count", "items", "refined_url", "confirm_title"], fn: researchScienceDirectFilter },
    { cli: "research:sciencedirect:export", mcp: "research_sciencedirect_export", ts: "researchScienceDirectExport", safety: "mutate", required: ["query"], always: ["artifact_path", "bytes", "sha256", "format", "query_url"], fn: researchScienceDirectExport },
    { cli: "research:aps:search", mcp: "research_aps_search", ts: "researchApsSearch", safety: "read", required: [], always: ["result_count", "items", "query_url"], fn: researchApsSearch },
    { cli: "research:aps:filter", mcp: "research_aps_filter", ts: "researchApsFilter", safety: "read", required: [], always: ["result_count", "items", "refined_url", "confirm_title"], fn: researchApsFilter },
    { cli: "research:aps:export", mcp: "research_aps_export", ts: "researchApsExport", safety: "mutate", required: ["doi"], always: ["artifact_path", "bytes", "sha256", "format", "doi"], fn: researchApsExport },
    { cli: "research:emerald:search", mcp: "research_emerald_search", ts: "researchEmeraldSearch", safety: "read", required: ["query"], always: ["result_count", "items", "query_url"], fn: researchEmeraldSearch },
    { cli: "research:emerald:filter", mcp: "research_emerald_filter", ts: "researchEmeraldFilter", safety: "read", required: ["query"], always: ["result_count", "items", "refined_url", "confirm_url", "confirm_title"], fn: researchEmeraldFilter },
    { cli: "research:emerald:export", mcp: "research_emerald_export", ts: "researchEmeraldExport", safety: "mutate", required: ["doi"], always: ["artifact_path", "bytes", "sha256", "format", "doi", "resource_id", "source_url"], fn: researchEmeraldExport },
    { cli: "research:cambridge:search", mcp: "research_cambridge_search", ts: "researchCambridgeSearch", safety: "read", required: ["query"], always: ["result_count", "items", "query_url"], fn: researchCambridgeSearch },
    { cli: "research:cambridge:filter", mcp: "research_cambridge_filter", ts: "researchCambridgeFilter", safety: "read", required: ["query"], always: ["result_count", "items", "refined_url", "confirm_title"], fn: researchCambridgeFilter },
    { cli: "research:cambridge:export", mcp: "research_cambridge_export", ts: "researchCambridgeExport", safety: "mutate", required: [], always: ["artifact_path", "bytes", "sha256", "format", "product_id"], fn: researchCambridgeExport },
    { cli: "research:springer:search", mcp: "research_springer_search", ts: "researchSpringerSearch", safety: "read", required: ["query"], always: ["result_count", "items", "query_url"], fn: researchSpringerSearch },
    { cli: "research:springer:filter", mcp: "research_springer_filter", ts: "researchSpringerFilter", safety: "read", required: ["query"], always: ["result_count", "items", "refined_url", "confirm_url", "confirm_title", "applied_filters"], fn: researchSpringerFilter },
    { cli: "research:springer:export", mcp: "research_springer_export", ts: "researchSpringerExport", safety: "mutate", required: [], always: ["artifact_path", "bytes", "sha256", "format", "doi", "source_url"], fn: researchSpringerExport },
    { cli: "research:nature:search", mcp: "research_nature_search", ts: "researchNatureSearch", safety: "read", required: ["query"], always: ["result_count", "items", "query_url"], fn: researchNatureSearch },
    { cli: "research:nature:filter", mcp: "research_nature_filter", ts: "researchNatureFilter", safety: "read", required: ["query"], always: ["result_count", "items", "refined_url", "confirm_title", "facet_param", "facet_value", "facet_checked"], fn: researchNatureFilter },
    { cli: "research:nature:export", mcp: "research_nature_export", ts: "researchNatureExport", safety: "mutate", required: ["doi"], always: ["artifact_path", "bytes", "sha256", "format", "doi", "article_url", "citation_url"], fn: researchNatureExport },
    { cli: "research:iet:search", mcp: "research_iet_search", ts: "researchIetSearch", safety: "read", required: ["query"], always: ["result_count", "items", "query_url"], fn: researchIetSearch },
    { cli: "research:iet:filter", mcp: "research_iet_filter", ts: "researchIetFilter", safety: "read", required: ["query"], always: ["result_count", "items", "refined_url", "confirm_title"], fn: researchIetFilter },
    { cli: "research:iet:export", mcp: "research_iet_export", ts: "researchIetExport", safety: "mutate", required: ["doi"], always: ["artifact_path", "bytes", "sha256", "format", "doi"], fn: researchIetExport },
    { cli: "research:aip:search", mcp: "research_aip_search", ts: "researchAipSearch", safety: "read", required: ["query"], always: ["result_count", "items", "query_url"], fn: researchAipSearch },
    { cli: "research:aip:filter", mcp: "research_aip_filter", ts: "researchAipFilter", safety: "read", required: ["query"], always: ["result_count", "items", "refined_url", "confirm_url", "confirm_title"], fn: researchAipFilter },
    { cli: "research:aip:export", mcp: "research_aip_export", ts: "researchAipExport", safety: "mutate", required: ["doi"], always: ["artifact_path", "bytes", "sha256", "format", "doi", "resource_id", "source_url"], fn: researchAipExport },
    { cli: "research:mdpi:search", mcp: "research_mdpi_search", ts: "researchMdpiSearch", safety: "read", required: ["query"], always: ["result_count", "item_count", "items", "query_url"], fn: researchMdpiSearch },
    { cli: "research:mdpi:filter", mcp: "research_mdpi_filter", ts: "researchMdpiFilter", safety: "read", required: ["query"], always: ["result_count", "item_count", "items", "refined_url", "confirm_title"], fn: researchMdpiFilter },
    { cli: "research:mdpi:export", mcp: "research_mdpi_export", ts: "researchMdpiExport", safety: "mutate", required: [], always: ["artifact_path", "bytes", "sha256", "format", "article_url"], fn: researchMdpiExport },
    { cli: "research:optica:search", mcp: "research_optica_search", ts: "researchOpticaSearch", safety: "read", required: ["query"], always: ["result_count", "total_count", "items", "query_url"], fn: researchOpticaSearch },
    { cli: "research:optica:filter", mcp: "research_optica_filter", ts: "researchOpticaFilter", safety: "read", required: ["query"], always: ["result_count", "total_count", "items", "refined_url", "confirm_title"], fn: researchOpticaFilter },
    { cli: "research:optica:export", mcp: "research_optica_export", ts: "researchOpticaExport", safety: "mutate", required: ["query", "article_id"], always: ["artifact_path", "bytes", "sha256", "format", "article_id"], fn: researchOpticaExport },
    { cli: "research:proquest:search", mcp: "research_proquest_search", ts: "researchProquestSearch", safety: "read", required: ["query"], always: ["result_count", "items", "query_url", "results_url", "title"], fn: researchProquestSearch },
    { cli: "research:proquest:filter", mcp: "research_proquest_filter", ts: "researchProquestFilter", safety: "read", required: ["query"], always: ["result_count", "items", "refined_url", "confirm_title", "unfiltered_count", "unfiltered_url"], fn: researchProquestFilter },
    { cli: "research:proquest:export", mcp: "research_proquest_export", ts: "researchProquestExport", safety: "mutate", required: ["query"], always: ["artifact_path", "bytes", "sha256", "format", "result_count", "results_url"], fn: researchProquestExport },
    { cli: "research:frontiers:search", mcp: "research_frontiers_search", ts: "researchFrontiersSearch", safety: "read", required: ["query"], always: ["result_count", "items", "query_url"], fn: researchFrontiersSearch },
    { cli: "research:frontiers:filter", mcp: "research_frontiers_filter", ts: "researchFrontiersFilter", safety: "read", required: ["query", "group", "option_id"], always: ["result_count", "items", "query_url", "group", "selected_label"], fn: researchFrontiersFilter },
    { cli: "research:frontiers:export", mcp: "research_frontiers_export", ts: "researchFrontiersExport", safety: "mutate", required: ["doi"], always: ["artifact_path", "bytes", "sha256", "format", "doi", "source_url"], fn: researchFrontiersExport },
    { cli: "research:arxiv:search", mcp: "research_arxiv_search", ts: "researchArxivSearch", safety: "read", required: [], always: ["result_count", "items", "query_url"], fn: researchArxivSearch },
    { cli: "research:arxiv:filter", mcp: "research_arxiv_filter", ts: "researchArxivFilter", safety: "read", required: [], always: ["result_count", "items", "refined_url", "confirm_url", "confirm_title"], fn: researchArxivFilter },
    { cli: "research:arxiv:export", mcp: "research_arxiv_export", ts: "researchArxivExport", safety: "mutate", required: ["id"], always: ["artifact_path", "bytes", "sha256", "format", "id", "source_url"], fn: researchArxivExport },
    { cli: "research:siam:search", mcp: "research_siam_search", ts: "researchSiamSearch", safety: "read", required: ["query"], always: ["result_count", "items", "query_url"], fn: researchSiamSearch },
    { cli: "research:siam:filter", mcp: "research_siam_filter", ts: "researchSiamFilter", safety: "read", required: ["query"], always: ["result_count", "items", "refined_url", "confirm_title"], fn: researchSiamFilter },
    { cli: "research:siam:export", mcp: "research_siam_export", ts: "researchSiamExport", safety: "mutate", required: ["doi"], always: ["artifact_path", "bytes", "sha256", "format", "doi", "content_type", "content_disposition"], fn: researchSiamExport },
    { cli: "research:degruyter:search", mcp: "research_degruyter_search", ts: "researchDegruyterSearch", safety: "read", required: [], always: ["result_count", "items", "query_url", "confirm_url", "confirm_title"], fn: researchDegruyterSearch },
    { cli: "research:degruyter:filter", mcp: "research_degruyter_filter", ts: "researchDegruyterFilter", safety: "read", required: [], always: ["result_count", "items", "refined_url", "confirm_url", "confirm_title"], fn: researchDegruyterFilter },
    { cli: "research:degruyter:export", mcp: "research_degruyter_export", ts: "researchDegruyterExport", safety: "mutate", required: ["doi"], always: ["artifact_path", "bytes", "sha256", "format", "doi"], fn: researchDegruyterExport },
    { cli: "research:worldsci:search", mcp: "research_worldsci_search", ts: "researchWorldsciSearch", safety: "read", required: ["query"], always: ["result_count", "items", "query_url", "cf_interstitial_observed"], fn: researchWorldsciSearch },
    { cli: "research:worldsci:filter", mcp: "research_worldsci_filter", ts: "researchWorldsciFilter", safety: "read", required: ["query"], always: ["result_count", "items", "refined_url", "confirm_title", "cf_interstitial_observed"], fn: researchWorldsciFilter },
    { cli: "research:worldsci:export", mcp: "research_worldsci_export", ts: "researchWorldsciExport", safety: "mutate", required: ["doi"], always: ["artifact_path", "bytes", "sha256", "format", "doi", "cf_interstitial_observed"], fn: researchWorldsciExport },
    { cli: "research:royalsoc:search", mcp: "research_royalsoc_search", ts: "researchRoyalSocSearch", safety: "read", required: ["query"], always: ["result_count", "items", "query_url", "confirm_url", "confirm_title"], fn: researchRoyalSocSearch },
    { cli: "research:royalsoc:filter", mcp: "research_royalsoc_filter", ts: "researchRoyalSocFilter", safety: "read", required: ["query"], always: ["result_count", "items", "refined_url", "confirm_url", "confirm_title", "filter_confirmed"], fn: researchRoyalSocFilter },
    { cli: "research:royalsoc:export", mcp: "research_royalsoc_export", ts: "researchRoyalSocExport", safety: "mutate", required: [], always: ["artifact_path", "bytes", "sha256", "format", "doi", "resource_id", "source_url"], fn: researchRoyalSocExport },
    { cli: "research:scoap3:search", mcp: "research_scoap3_search", ts: "researchScoap3Search", safety: "read", required: ["query"], always: ["result_count", "items", "query_url", "confirm_url", "export_href"], fn: researchScoap3Search },
    { cli: "research:scoap3:filter", mcp: "research_scoap3_filter", ts: "researchScoap3Filter", safety: "read", required: ["query"], always: ["result_count", "items", "refined_url", "confirm_url", "export_href"], fn: researchScoap3Filter },
    { cli: "research:scoap3:export", mcp: "research_scoap3_export", ts: "researchScoap3Export", safety: "mutate", required: [], always: ["artifact_path", "bytes", "sha256", "format", "source_url"], fn: researchScoap3Export },
    { cli: "research:dblp:search", mcp: "research_dblp_search", ts: "researchDblpSearch", safety: "read", required: ["query"], always: ["result_count", "items", "query_url", "confirm_title", "facets"], fn: researchDblpSearch },
    { cli: "research:dblp:filter", mcp: "research_dblp_filter", ts: "researchDblpFilter", safety: "read", required: ["query"], always: ["result_count", "items", "refined_url", "confirm_url", "confirm_title", "facets"], fn: researchDblpFilter },
    { cli: "research:dblp:export", mcp: "research_dblp_export", ts: "researchDblpExport", safety: "mutate", required: [], always: ["artifact_path", "bytes", "sha256", "format", "source_url", "mime_type"], fn: researchDblpExport },
    { cli: "research:scielo:search", mcp: "research_scielo_search", ts: "researchScieloSearch", safety: "read", required: ["query"], always: ["result_count", "items", "query_url"], fn: researchScieloSearch },
    { cli: "research:scielo:filter", mcp: "research_scielo_filter", ts: "researchScieloFilter", safety: "read", required: ["query"], always: ["result_count", "items", "refined_url", "confirm_url", "confirm_title", "selected_filters"], fn: researchScieloFilter },
    { cli: "research:scielo:export", mcp: "research_scielo_export", ts: "researchScieloExport", safety: "mutate", required: ["query"], always: ["artifact_path", "bytes", "sha256", "format", "source_url", "result_count"], fn: researchScieloExport },
    { cli: "research:inspirehep:search", mcp: "research_inspirehep_search", ts: "researchInspirehepSearch", safety: "read", required: ["query"], always: ["result_count", "items", "query_url", "confirm_url", "confirm_title"], fn: researchInspirehepSearch },
    { cli: "research:inspirehep:filter", mcp: "research_inspirehep_filter", ts: "researchInspirehepFilter", safety: "read", required: ["query"], always: ["result_count", "items", "refined_url", "confirm_url", "confirm_title", "applied_filters"], fn: researchInspirehepFilter },
    { cli: "research:inspirehep:export", mcp: "research_inspirehep_export", ts: "researchInspirehepExport", safety: "mutate", required: [], always: ["artifact_path", "bytes", "sha256", "format", "source_url"], fn: researchInspirehepExport },
    { cli: "research:pubscholar:search", mcp: "research_pubscholar_search", ts: "researchPubscholarSearch", safety: "read", required: ["query"], always: ["result_count", "selected_count", "items", "query_url", "results_url", "title", "breadcrumb"], fn: researchPubscholarSearch },
    { cli: "research:pubscholar:filter", mcp: "research_pubscholar_filter", ts: "researchPubscholarFilter", safety: "read", required: ["query"], always: ["result_count", "selected_count", "items", "refined_url", "confirm_title", "breadcrumb", "unfiltered_count", "unfiltered_url"], fn: researchPubscholarFilter },
    { cli: "research:pubscholar:export", mcp: "research_pubscholar_export", ts: "researchPubscholarExport", safety: "mutate", required: ["query"], always: ["artifact_path", "bytes", "sha256", "format", "result_count", "results_url", "breadcrumb", "structural_tags"], fn: researchPubscholarExport },
    { cli: "research:opticsjournal:search", mcp: "research_opticsjournal_search", ts: "researchOpticsjournalSearch", safety: "read", required: ["query"], always: ["result_count", "item_count", "items", "query_url", "results_url", "title", "note"], fn: researchOpticsjournalSearch },
    { cli: "research:opticsjournal:filter", mcp: "research_opticsjournal_filter", ts: "researchOpticsjournalFilter", safety: "read", required: ["query"], always: ["result_count", "item_count", "items", "refined_url", "confirm_title", "unfiltered_count"], fn: researchOpticsjournalFilter },
    { cli: "research:opticsjournal:export", mcp: "research_opticsjournal_export", ts: "researchOpticsjournalExport", safety: "mutate", required: ["query"], always: ["artifact_path", "bytes", "sha256", "format", "result_count", "results_url", "records"], fn: researchOpticsjournalExport },
    { cli: "research:crc:search", mcp: "research_crc_search", ts: "researchCrcSearch", safety: "read", required: [], always: ["result_count", "items", "query_url", "results_url", "title"], fn: researchCrcSearch },
    { cli: "research:crc:filter", mcp: "research_crc_filter", ts: "researchCrcFilter", safety: "read", required: [], always: ["result_count", "items", "refined_url", "confirm_title", "unfiltered_count", "unfiltered_url"], fn: researchCrcFilter },
    { cli: "research:crc:export", mcp: "research_crc_export", ts: "researchCrcExport", safety: "mutate", required: [], always: ["artifact_path", "bytes", "sha256", "format", "result_count", "results_url", "columns", "rows"], fn: researchCrcExport },
    { cli: "research:cellpress:search", mcp: "research_cellpress_search", ts: "researchCellpressSearch", safety: "read", required: ["query"], always: ["result_count", "items", "query_url", "confirm_title"], fn: researchCellpressSearch },
    { cli: "research:cellpress:filter", mcp: "research_cellpress_filter", ts: "researchCellpressFilter", safety: "read", required: ["query"], always: ["result_count", "base_result_count", "items", "refined_url", "confirm_title", "refine_mode"], fn: researchCellpressFilter },
    { cli: "research:cellpress:export", mcp: "research_cellpress_export", ts: "researchCellpressExport", safety: "mutate", required: ["pii"], always: ["artifact_path", "bytes", "sha256", "format", "pii", "doi", "source_url", "mime_type"], fn: researchCellpressExport },
    { cli: "research:iest:search", mcp: "research_iest_search", ts: "researchIestSearch", safety: "read", required: ["query"], always: ["result_count", "item_count", "items", "query_url", "results_url", "title"], fn: researchIestSearch },
    { cli: "research:iest:filter", mcp: "research_iest_filter", ts: "researchIestFilter", safety: "read", required: ["query"], always: ["result_count", "item_count", "items", "refined_url", "confirm_title", "unfiltered_count", "unfiltered_url"], fn: researchIestFilter },
    { cli: "research:iest:export", mcp: "research_iest_export", ts: "researchIestExport", safety: "mutate", required: [], always: ["artifact_path", "bytes", "sha256", "format", "article_url"], fn: researchIestExport },
    { cli: "research:incopat:search", mcp: "research_incopat_search", ts: "researchIncopatSearch", safety: "read", required: ["query"], always: ["result_count", "items", "query_url", "results_url", "normalized_query"], fn: researchIncopatSearch },
    { cli: "research:incopat:filter", mcp: "research_incopat_filter", ts: "researchIncopatFilter", safety: "read", required: ["query"], always: ["result_count", "items", "refined_url", "confirm_title", "unfiltered_count", "country", "breadcrumb"], fn: researchIncopatFilter },
    { cli: "research:incopat:export", mcp: "research_incopat_export", ts: "researchIncopatExport", safety: "mutate", required: ["query"], always: ["artifact_path", "bytes", "sha256", "format", "result_count", "results_url"], fn: researchIncopatExport },
    { cli: "research:wanfang:search", mcp: "research_wanfang_search", ts: "researchWanfangSearch", safety: "read", required: ["query"], always: ["result_count", "items", "query_url", "results_url"], fn: researchWanfangSearch },
    { cli: "research:wanfang:filter", mcp: "research_wanfang_filter", ts: "researchWanfangFilter", safety: "read", required: ["query"], always: ["result_count", "items", "refined_url", "confirm_title", "unfiltered_count", "resource_type", "resource_label"], fn: researchWanfangFilter },
    { cli: "research:wanfang:export", mcp: "research_wanfang_export", ts: "researchWanfangExport", safety: "mutate", required: ["query"], always: ["artifact_path", "bytes", "sha256", "format", "result_count", "results_url", "resource_type", "resource_label"], fn: researchWanfangExport }
  ];
  assert.equal(researchRows.length, 120, "120 per-DB research_ tool rows locked");
  for (const item of researchRows) {
    const researchRow = manifest.commands.find((command: any) => command.mcp_name === item.mcp);
    assert.ok(researchRow, `${item.mcp} contract row missing`);
    assert.equal(researchRow.cli_name, item.cli);
    assert.equal(researchRow.ts_export, item.ts);
    assert.equal(researchRow.maturity, "experimental");
    assert.equal(researchRow.safety_class, item.safety);
    assert.deepEqual(researchRow.required_args, item.required);
    assert.deepEqual(researchRow.output_keys.always_present, item.always);
    assert.equal(researchRow.may_contain_sensitive_local_fields, false);
    assert.ok(mcpToolNames.includes(item.mcp), `${item.mcp} missing from listMcpTools()`);
    assert.equal(item.mcp.startsWith("webai_"), false, `${item.mcp} must not be webai-prefixed`);
    assert.equal(mcpToolNames.includes(`webai_${item.mcp}`), false, `webai-prefixed ${item.mcp} must not exist`);
    assert.equal(subMcpToolNames.includes(item.mcp), false, `${item.mcp} must not be registered via subMcpToolSpecs`);
    assert.equal(typeof item.fn, "function", `${item.ts} missing TS export`);
  }
  assert.equal(mcpToolNames.filter((name) => /^research_(aiaa|wos|acm|ieee|acs|asme|rsc|wiley|asce|iop|tandf|sae|sciencedirect|aps|emerald|cambridge|springer|nature|iet|aip|mdpi|optica|proquest|frontiers|arxiv|siam|degruyter|worldsci|royalsoc|scoap3|dblp|scielo|inspirehep|pubscholar|opticsjournal|crc|cellpress|iest|incopat|wanfang)_(search|filter|export)$/.test(name)).length, 120, "120 per-DB research_ tools in listMcpTools()");
  assert.equal(expectedWebaiToolCount, 41, "expectedWebaiToolCount now 41");
  assert.equal(subMcpToolNames.length, 11, "webai sub-MCP tools still 11");
  assert.equal(manifest.commands.filter((command: any) => String(command.mcp_name || "").startsWith("webai_")).length, 41, "webai command rows now 41");
  assert.equal(listMcpTools().filter((tool) => tool.name.startsWith("webai_")).length, 41, "webai MCP tools now 41");
  assert.equal(manifest.error_codes.length, 40, "error codes now 40");
  assert.equal(manifest.commands.length, 192, "commands now 192");
  assert.equal(manifest.contract_version, "consumer-contract-2.1.0");
  assert.equal(packageJson.version, "2.1.0");
  assert.equal(manifest.package_version, "2.1.0");
  assert.equal(manifest.sensitive_fields["site_registry.classification.science_engineering"], "Public science/engineering classification flag; safe governance metadata.");
  assert.equal(manifest.sensitive_fields["site_registry.classification.matched_subjects"], "Public matched science/engineering subject labels; safe governance metadata.");
});

test("no webai command row exposes forbidden output fields", () => {
  const manifest = contract();
  const forbidden = manifest.forbidden_output_fields;
  const webaiCommands = manifest.commands.filter(
    (c: any) => String(c.mcp_name || "").startsWith("webai_")
  );
  for (const cmd of webaiCommands) {
    assertNoForbiddenFields(cmd.output_keys, forbidden);
  }
});


test("submcp/chatgpt-codex has no import-time side effects", async () => {
  const { chatgptCodexToolSpecs } = await import("../src/mcp/submcp/chatgpt-codex/tools");
  assert.ok(Array.isArray(chatgptCodexToolSpecs));
  assert.equal(chatgptCodexToolSpecs.length, 4);
  const mcpTools = listMcpTools();
  for (const spec of chatgptCodexToolSpecs) {
    assert.ok(mcpTools.find((t) => t.name === spec.name), `${spec.name} missing from listMcpTools()`);
  }
});

test("chatgpt-codex handlers return SUBMCP_NOT_PROVISIONED (no live task executed)", async () => {
  const result = await callMcpTool("webai_chatgpt_codex_submit_task", { backend: "managed-cdp", prompt: "test", profile: "chatgpt" });
  assert.equal((result as any).status, "failed");
  assert.equal((result as any).errorCode, "SENSITIVE_CONTENT_GUARD");
  assert.match((result as any).message, /confirmed=true/);
  assertNoForbiddenFields(result, contract().forbidden_output_fields);

  const listResult = await callMcpTool("webai_chatgpt_codex_list_envs", { backend: "managed-cdp", profile: "chatgpt" }, mockWebAiRuntime(mockCodexPage({ envRows: [] })));
  assert.equal((listResult as any).errorCode, "SUBMCP_NOT_PROVISIONED");
  assertNoForbiddenFields(listResult, contract().forbidden_output_fields);
});

test("chatgpt-codex list-envs returns only LT-0I/CN- and filters noeticbraid", async () => {
  const page = mockCodexPage({
    envRows: [
      { text: "LT-0I/CN- LT-0I/CN- 0 cherrypie85arrow@gmail.com May 15, 2026", href: "/codex/cloud/settings/environment/6a07e4ffdafc8191b77e6cff2264cd9a" },
      { text: "noeticbraid LT-0I/noeticbraid 0 cherrypie85arrow@gmail.com May 12, 2026", href: "/codex/cloud/settings/environment/deadbeefdeadbeefdeadbeefdeadbeef" }
    ]
  });
  const result: any = await callMcpTool("webai_chatgpt_codex_list_envs", { backend: "managed-cdp", profile: "chatgpt" }, mockWebAiRuntime(page));
  assert.equal(result.status, "ok");
  assert.equal(result.envs.length, 1);
  assert.equal(result.envs[0].repo, "LT-0I/CN-");
  assert.equal(result.envs[0].env_id, "6a07e4ffdafc8191b77e6cff2264cd9a");
  assert.equal(JSON.stringify(result).includes("noeticbraid"), false);
});

test("chatgpt-codex submit-task requires confirmation and selects only LT-0I/CN-", async () => {
  const taskId = "task_e_22222222222222222222222222222222";
  const stalePriorId = "task_e_99999999999999999999999999999999";
  const page = mockCodexPage({ taskId, preSubmitTaskHref: `/codex/cloud/tasks/${stalePriorId}` });
  const result: any = await callMcpTool("webai_chatgpt_codex_submit_task", { backend: "managed-cdp", profile: "chatgpt", prompt: "Inventory only", confirmed: true }, mockWebAiRuntime(page));
  assert.equal(result.task_id, taskId);
  assert.notEqual(result.task_id, stalePriorId);
  assert.equal(result.repo, "LT-0I/CN-");
  assert.ok(page.calls.includes("click:button[aria-label='View all code environments']"));
  assert.ok(page.calls.some((call: string) => call.includes("normalize-space(.)='LT-0I/CN-'")));
  assert.ok(page.calls.includes("click:button[aria-label='Submit']"));
  assert.equal(page.calls.some((call: string) => /noeticbraid/i.test(call)), false);

  const refused: any = await callMcpTool("webai_chatgpt_codex_submit_task", { backend: "managed-cdp", profile: "chatgpt", prompt: "x", confirmed: true, repo: "LT-0I/noeticbraid" }, mockWebAiRuntime(mockCodexPage({})));
  assert.equal(refused.errorCode, "INVALID_ARGS");
});

test("chatgpt-codex task-status maps running, complete, and refuses non-allowlisted tasks", async () => {
  const taskId = "task_e_33333333333333333333333333333333";
  const running: any = await callMcpTool("webai_chatgpt_codex_task_status", { backend: "managed-cdp", profile: "chatgpt", task_id: taskId }, mockWebAiRuntime(mockCodexPage({
    bodyText: "Task · LT-0I/CN- · main Running setup scripts Cancel task",
    counts: { cancel: 1, thumbs: 0 }
  })));
  assert.equal(running.status, "running");
  assert.equal(running.status_text, "Running setup scripts");

  const complete: any = await callMcpTool("webai_chatgpt_codex_task_status", { backend: "managed-cdp", profile: "chatgpt", task_id: taskId }, mockWebAiRuntime(mockCodexPage({
    bodyText: "Task · LT-0I/CN- · main Worked for 48s Give thumbs up feedback",
    counts: { cancel: 0, thumbs: 1 }
  })));
  assert.equal(complete.status, "complete");
  assert.equal(complete.done, true);

  const refused: any = await callMcpTool("webai_chatgpt_codex_task_status", { backend: "managed-cdp", profile: "chatgpt", task_id: taskId }, mockWebAiRuntime(mockCodexPage({
    bodyText: "Task · LT-0I/noeticbraid · main Worked for 1m Give thumbs up feedback",
    counts: { cancel: 0, thumbs: 1 }
  })));
  assert.equal(refused.errorCode, "INVALID_ARGS");
});

test("chatgpt-codex task readers use snapshot visibleText for delimited LT-0I/CN- proof", async () => {
  const taskId = "task_e_6a07e803d3e4832dab14de939e456e7f";
  const realHeaderText = [
    "Append line to README.md May 15 · LT-0I/CN- · main · +2 -0 Archive Share Create PR",
    "Worked for 33s",
    "Give thumbs up feedback",
    "README.md +2 -0",
    "@@ -57,2 +57,4 @@",
    " MIT License",
    "+",
    "+<!-- codex-sandbox-probe 2026-05-15 -->",
    "Summary"
  ].join(" ");

  const statusPage = mockCodexPage({
    snapshotVisibleText: realHeaderText,
    legacyBodyText: "Append line to README.md May 15 · LT-0I/noeticbraid · main Worked for 33s Give thumbs up feedback",
    counts: { cancel: 0, thumbs: 1 }
  });
  const status: any = await callMcpTool("webai_chatgpt_codex_task_status", { backend: "managed-cdp", profile: "chatgpt", task_id: taskId }, mockWebAiRuntime(statusPage));
  assert.equal(status.status, "complete");
  assert.equal(status.done, true);
  assert.equal(status.status_text, "Worked for 33s");
  assert.ok(statusPage.calls.includes("snapshot-read:include-portals"));
  assert.equal(statusPage.calls.includes("legacy-evaluate"), false);

  const diffPage = mockCodexPage({
    snapshotVisibleText: realHeaderText,
    legacyBodyText: "Task · LT-0I/noeticbraid · main Worked for 33s Give thumbs up feedback",
    counts: { cancel: 0, thumbs: 1, createPr: 1 },
    fileLabels: ["View file README.md"],
    toggleText: "File (1)"
  });
  const diff: any = await callMcpTool("webai_chatgpt_codex_get_diff", { backend: "managed-cdp", profile: "chatgpt", task_id: taskId }, mockWebAiRuntime(diffPage));
  assert.equal(diff.status, "complete");
  assert.deepEqual(diff.files, ["README.md"]);
  assert.match(diff.diff_text, /^README\.md \+2 -0\n@@ -57,2 \+57,4 @@/);
  assert.ok(diffPage.calls.includes("snapshot-read:include-portals"));
  assert.equal(diffPage.calls.includes("legacy-evaluate"), false);

  const refusedPage = mockCodexPage({
    snapshotVisibleText: "Task · LT-0I/noeticbraid · main Worked for 33s Give thumbs up feedback",
    legacyBodyText: "Task · LT-0I/CN- · main Worked for 33s Give thumbs up feedback",
    counts: { cancel: 0, thumbs: 1 }
  });
  const refused: any = await callMcpTool("webai_chatgpt_codex_task_status", { backend: "managed-cdp", profile: "chatgpt", task_id: taskId }, mockWebAiRuntime(refusedPage));
  assert.equal(refused.errorCode, "INVALID_ARGS");
  assert.match(refused.message, /forbidden noeticbraid|does not prove LT-0I\/CN-/);
});

test("chatgpt-codex ownership guard waits for SPA hydration before refusing (regression)", async () => {
  const { waitForCodexTaskHydration, assertTaskBelongsToAllowlist } = require("../src/mcp/submcp/chatgpt-codex/flow");
  const hydratedHeader = "Append line to README.md May 15 · LT-0I/CN- · main · +2 -0 Archive Share Create PR Worked for 33s Give thumbs up feedback";
  // Reproduces the live defect: the Codex task SPA is empty at
  // domcontentloaded (visibleText === ""), then hydrates a few reads later.
  // The pre-fix guard read once at textLen 0 and refused a genuine
  // LT-0I/CN- task; the fix polls until the header proves ownership.
  let reads = 0;
  const hydratingPage: any = {
    _url: "https://chatgpt.com/codex/cloud/tasks/task_e_6a07e803d3e4832dab14de939e456e7f",
    url() { return this._url; },
    evaluate: async (_fn: unknown, arg: any) => {
      reads += 1;
      const visibleText = reads >= 3 ? hydratedHeader : "";
      return { visibleText, elements: [], forms: [], tables: [], lists: [], iframes: [], portalRootCount: arg?.includePortals ? 1 : 0 };
    }
  };
  const hydratedText = await waitForCodexTaskHydration(hydratingPage, 30000);
  assert.equal(hydratedText, hydratedHeader);
  assert.ok(reads >= 3, "guard must keep polling past the empty SPA shell");
  assert.equal(await assertTaskBelongsToAllowlist(hydratingPage), null);
});

test("chatgpt-codex submit-task returns the freshly-created card id, never the stale top card (regression)", async () => {
  const { extractSubmittedTaskId, readTopTaskCardId } = require("../src/mcp/submcp/chatgpt-codex/flow");
  const staleId = "task_e_6a07e803d3e4832dab14de939e456e7f"; // previous run's card
  const newId = "task_e_6a0803eb5780832d8cc6927474fdc0df";   // card this submit created
  // Reproduces the live divergence: at Submit-click time the SPA has not yet
  // prepended the new card, so the document-order top <a> href is still the
  // previous run's stale id; a few reads later the new card is prepended and
  // the top href flips to the new id. The page does NOT navigate to a task
  // route on this account, so URL stays /codex/cloud throughout.
  let reads = 0;
  const submittingPage: any = {
    _url: "https://chatgpt.com/codex/cloud",
    url() { return this._url; },
    locator: (selector: string) => ({
      first() { return this; },
      async getAttribute(name: string) {
        if (selector.includes("/codex/cloud/tasks") && name === "href") {
          reads += 1;
          const id = reads >= 3 ? newId : staleId;
          return `/codex/cloud/tasks/${id}`;
        }
        return "";
      }
    })
  };
  const preSubmitTopId = await readTopTaskCardId(submittingPage);
  assert.equal(preSubmitTopId, staleId, "pre-submit top card is the stale previous-run id");
  const captured = await extractSubmittedTaskId(submittingPage, preSubmitTopId, 30000);
  assert.equal(captured, newId, "must return the new card id, not the stale top card");
  assert.notEqual(captured, staleId);
  assert.match(captured, /^task_e_[0-9a-f]{32}$/);
  assert.ok(reads >= 3, "must keep polling until the new card is prepended");

  // Bounded-timeout honesty: if the top card never changes, fail (null) so the
  // caller surfaces a stable contract error instead of returning the stale id.
  let stuckReads = 0;
  const stuckPage: any = {
    _url: "https://chatgpt.com/codex/cloud",
    url() { return this._url; },
    locator: (selector: string) => ({
      first() { return this; },
      async getAttribute(name: string) {
        if (selector.includes("/codex/cloud/tasks") && name === "href") {
          stuckReads += 1;
          return `/codex/cloud/tasks/${staleId}`;
        }
        return "";
      }
    })
  };
  const stuck = await extractSubmittedTaskId(stuckPage, staleId, 10);
  assert.equal(stuck, null, "never return the stale id on bounded timeout");
});

test("chatgpt-codex ownership guard still refuses a noeticbraid task page", async () => {
  const { assertTaskBelongsToAllowlist } = require("../src/mcp/submcp/chatgpt-codex/flow");
  const forbiddenPage: any = {
    _url: "https://chatgpt.com/codex/cloud/tasks/task_e_6a07e803d3e4832dab14de939e456e7f",
    url() { return this._url; },
    evaluate: async (_fn: unknown, arg: any) => ({
      visibleText: "Append line to README.md May 15 · LT-0I/noeticbraid · main · +2 -0 Worked for 33s Give thumbs up feedback",
      elements: [], forms: [], tables: [], lists: [], iframes: [], portalRootCount: arg?.includePortals ? 1 : 0
    })
  };
  const guard: any = await assertTaskBelongsToAllowlist(forbiddenPage);
  assert.equal(guard.errorCode, "INVALID_ARGS");
  assert.match(guard.message, /forbidden noeticbraid/);
});

test("chatgpt-codex get-diff extracts visible unified diff and never clicks Create PR", async () => {
  const taskId = "task_e_44444444444444444444444444444444";
  const page = mockCodexPage({
    bodyText: [
      "Append line to README.md May 15 · LT-0I/CN- · main · +2 -0",
      "Worked for 33s",
      "Give thumbs up feedback",
      "File (1)",
      "README.md +2 -0",
      "@@ -57,2 +57,4 @@",
      " MIT License",
      "+",
      "+<!-- codex-sandbox-probe 2026-05-15 -->",
      "Summary",
      "Create PR"
    ].join("\n"),
    counts: { cancel: 0, thumbs: 1, createPr: 1 },
    fileLabels: ["View file README.md"],
    toggleText: "File (1)"
  });
  const result: any = await callMcpTool("webai_chatgpt_codex_get_diff", { backend: "managed-cdp", profile: "chatgpt", task_id: taskId }, mockWebAiRuntime(page));
  assert.equal(result.status, "complete");
  assert.deepEqual(result.files, ["README.md"]);
  assert.match(result.diff_text, /^README\.md \+2 -0\n@@ -57,2 \+57,4 @@/);
  assert.match(result.diff_text, /@@ -57,2 \+57,4 @@/);
  assert.equal(result.create_pr_available, true);
  assert.equal(page.calls.includes("click:xpath=//button[normalize-space(.)='Create PR']"), false);

  const incomplete: any = await callMcpTool("webai_chatgpt_codex_get_diff", { backend: "managed-cdp", profile: "chatgpt", task_id: taskId }, mockWebAiRuntime(mockCodexPage({
    bodyText: "Task · LT-0I/CN- · main Running setup scripts Cancel task",
    counts: { cancel: 1, thumbs: 0 },
    fileLabels: ["View file README.md"],
    toggleText: "File (1)"
  })));
  assert.equal(incomplete.errorCode, "INVALID_ARGS");
});


test("submcp/claude-design has no import-time side effects", async () => {
  const { claudeDesignToolSpecs } = await import("../src/mcp/submcp/claude-design/tools");
  assert.ok(Array.isArray(claudeDesignToolSpecs));
  assert.equal(claudeDesignToolSpecs.length, 4);
  const mcpTools = listMcpTools();
  for (const spec of claudeDesignToolSpecs) {
    assert.ok(mcpTools.find((t) => t.name === spec.name), `${spec.name} missing from listMcpTools()`);
  }
});

test("submcp/gemini-music has no import-time side effects", async () => {
  const { geminiMusicToolSpecs } = await import("../src/mcp/submcp/gemini-music/tools");
  assert.ok(Array.isArray(geminiMusicToolSpecs));
  assert.equal(geminiMusicToolSpecs.length, 3);
  const mcpTools = listMcpTools();
  for (const spec of geminiMusicToolSpecs) {
    assert.ok(mcpTools.find((t) => t.name === spec.name), `${spec.name} missing from listMcpTools()`);
  }
});


test("stream5 B6 Gemini Music generate returns SENSITIVE_CONTENT_GUARD unless confirmed", async () => {
  const result: any = await callMcpTool("webai_gemini_music_generate", { backend: "managed-cdp", profile: "gemini-9225", prompt: "gentle instrumental piano" });
  assert.equal(result.ok, false);
  assert.equal(result.errorCode, "SENSITIVE_CONTENT_GUARD");
  assert.equal(result.error_code, "SENSITIVE_CONTENT_GUARD");
  assert.equal(result.action, "gemini_music_generate");
  assertNoForbiddenFields(result, contract().forbidden_output_fields);
});

test("stream5 B6 Gemini Music download_track returns ARTIFACT_DOWNLOAD_TIMEOUT when Download track is missing", async () => {
  const page = mockSendPromptPage("https://gemini.google.com/app/test-music");
  const runtime = {
    ...mockWebAiRuntime(page),
    artifactClick: async (options: any) => {
      assert.equal(options.buttonSelector, 'button[aria-label="Download track"]');
      assert.equal(options.followUpTextRegex, "MP3");
      assert.equal(options.locateTimeoutMs, 20000);
      assert.equal(options.prerenderWaitMs, 1500);
      const error: any = new Error("Download track button not found before timeout");
      error.errorCode = "ARTIFACT_DOWNLOAD_TIMEOUT";
      throw error;
    }
  } as any;
  const result: any = await webAiGeminiMusicDownloadTrack({ backend: "managed-cdp", profile: "gemini-9225", tab_url_contains: "test-music", download_dir: path.join(require("node:os").tmpdir(), "gemini-music-timeout"), format: "mp3" }, runtime);
  assert.equal(result.ok, false);
  assert.equal(result.errorCode, "ARTIFACT_DOWNLOAD_TIMEOUT");
  assert.equal(result.error_code, "ARTIFACT_DOWNLOAD_TIMEOUT");
  assert.equal(result.format, "mp3");
  assertNoForbiddenFields(result, contract().forbidden_output_fields);
});

test("phase C path-aware target matching treats same-host wrong conversations as misses", () => {
  assert.equal(pageMatchesTargetUrl("https://claude.ai/chat/abc", "https://claude.ai/new"), false);
  assert.equal(pageMatchesTargetUrl("https://gemini.google.com/app/wrong-chat", "https://gemini.google.com/app/targetMusic123"), false);
  assert.equal(pageMatchesTargetUrl("https://gemini.google.com/app/targetMusic123", "https://gemini.google.com/app/targetMusic123"), true);
});

test("phase C Gemini Music status and download navigate to target conversation before inspecting", async () => {
  const page = mockSendPromptPage("https://gemini.google.com/app/wrong-chat");
  page.locator = (selector: string) => {
    const loc: any = {
      first: () => loc,
      count: async () => page._url.includes("/targetMusic123") && selector === 'button[aria-label="Download track"]' ? 1 : 0,
      isVisible: async () => page._url.includes("/targetMusic123") && selector === 'button[aria-label="Download track"]'
    };
    return loc;
  };
  const status: any = await webAiGeminiMusicTaskStatus({ backend: "managed-cdp", profile: "gemini-9225", tab_url_contains: "targetMusic123" }, mockWebAiRuntime(page));
  assert.equal(status.status, "complete");
  assert.deepEqual(page.calls.goto, ["https://gemini.google.com/app/targetMusic123"]);

  page._url = "https://gemini.google.com/app/wrong-chat";
  page.calls.goto.length = 0;
  const runtime = {
    ...mockWebAiRuntime(page),
    artifactClick: async (options: any) => {
      assert.equal(options.tabUrlContains, "targetMusic123");
      return { path: "", savedPath: "", sha256: "", size: 0 };
    }
  } as any;
  await webAiGeminiMusicDownloadTrack({ backend: "managed-cdp", profile: "gemini-9225", tab_url_contains: "targetMusic123", download_dir: path.join(require("node:os").tmpdir(), "gemini-music-target"), format: "mp3" }, runtime);
  assert.deepEqual(page.calls.goto, ["https://gemini.google.com/app/targetMusic123"]);
});

test("stream5 B5 Claude Design get_html returns fingerprint and savedPath, never html", async () => {
  const tmp = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "claude-design-html-"));
  const page = mockClaudeDesignPage({ iframeSrcdoc: "<main>hello design</main>" });
  const result: any = await webAiClaudeDesignGetHtml({ backend: "managed-cdp", project_url: "https://claude.ai/design/p/test-project", download_dir: tmp, profile: "claude-9224" }, mockWebAiRuntime(page));
  assert.equal(typeof result.iframeArtifactSha256, "string");
  assert.match(result.iframeArtifactSha256, /^[a-f0-9]{64}$/);
  assert.equal(typeof result.savedPath, "string");
  assert.equal(fs.existsSync(result.savedPath), true);
  assert.equal(result.byteSize, Buffer.byteLength("<main>hello design</main>"));
  assert.equal(Object.prototype.hasOwnProperty.call(result, "html"), false);
  assertNoForbiddenFields(result, contract().forbidden_output_fields);
});

test("stream5 Claude Design isRealHtmlMarkup rejects empty shells and bootstrap while accepting real body content", () => {
  assert.equal(isRealHtmlMarkup("<html><head></head><body></body></html>"), false);
  assert.equal(isRealHtmlMarkup("<!doctype html><html><head></head><body>   \n\t </body></html>"), false);
  assert.equal(isRealHtmlMarkup("<html><head><title>Only head</title></head><body><!-- empty --><style>body{}</style></body></html>"), false);
  assert.equal(isRealHtmlMarkup("https://019e2c78-13a1-70b4-9e59-18d635816ee5.claudeusercontent.com/_bootstrap"), false);
  assert.equal(isRealHtmlMarkup("<!doctype html><html><body><main>Hello design</main></body></html>"), true);
});

test("stream5 Claude Design get_html polls past cold empty shell until real content", async () => {
  const tmp = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "claude-design-coldstart-"));
  const emptyShell = "<html><head></head><body></body></html>";
  const real = "<!doctype html><html><body><main>Hydrated design</main></body></html>";
  const page = mockClaudeDesignPage({ iframeSrcdocSequence: [emptyShell, "  <html><head></head><body> \n </body></html>  ", real] });
  const result: any = await webAiClaudeDesignGetHtml({ backend: "managed-cdp", project_url: "https://claude.ai/design/p/test-project", download_dir: tmp, profile: "claude-9224" }, mockWebAiRuntime(page));
  assert.equal(result.byteSize, Buffer.byteLength(real));
  assert.equal(fs.readFileSync(result.savedPath, "utf-8"), real);
  assert.equal(page.calls.filter((call: string) => call === "waitForTimeout:500").length, 2);
  assertNoForbiddenFields(result, contract().forbidden_output_fields);
});

test("stream5 Claude Design get_html returns ARTIFACT_VERIFICATION_FAILED when cold empty shell never hydrates", async () => {
  const tmp = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "claude-design-coldstart-fail-"));
  const emptyShell = "<html><head></head><body></body></html>";
  const page = mockClaudeDesignPage({ iframeSrcdocSequence: Array.from({ length: 60 }, () => emptyShell) });
  const result: any = await webAiClaudeDesignGetHtml({ backend: "managed-cdp", project_url: "https://claude.ai/design/p/test-project", download_dir: tmp, profile: "claude-9224" }, mockWebAiRuntime(page));
  assert.equal(result.ok, false);
  assert.equal(result.errorCode, "ARTIFACT_VERIFICATION_FAILED");
  assert.equal(result.error_code, "ARTIFACT_VERIFICATION_FAILED");
  assert.equal(result.iframeArtifactSha256, "");
  assert.equal(result.savedPath, "");
  assert.equal(result.byteSize, 0);
  assert.deepEqual(fs.readdirSync(tmp), []);
  assert.equal(page.calls.filter((call: string) => call === "waitForTimeout:500").length, 60);
  assertNoForbiddenFields(result, contract().forbidden_output_fields);
});

test("phase C D2 Claude Design get_html rejects bootstrap URL stubs without persisting", async () => {
  const tmp = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "claude-design-stub-"));
  const page = mockClaudeDesignPage({ iframeSrc: "https://019e2c78-13a1-70b4-9e59-18d635816ee5.claudeusercontent.com/_bootstrap" });
  const result: any = await webAiClaudeDesignGetHtml({ backend: "managed-cdp", project_url: "https://claude.ai/design/p/test-project", download_dir: tmp, profile: "claude-9224" }, mockWebAiRuntime(page));
  assert.equal(result.ok, false);
  assert.equal(result.errorCode, "ARTIFACT_VERIFICATION_FAILED");
  assert.equal(result.error_code, "ARTIFACT_VERIFICATION_FAILED");
  assert.equal(result.iframeArtifactSha256, "");
  assert.equal(result.savedPath, "");
  assert.equal(result.byteSize, 0);
  assert.deepEqual(fs.readdirSync(tmp), []);
  assert.equal(Object.prototype.hasOwnProperty.call(result, "html"), false);
  assertNoForbiddenFields(result, contract().forbidden_output_fields);
});

test("phase C D1-v2 Claude Design get_html removes scratch file on failed capture", async () => {
  const tmp = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "claude-design-scratch-"));
  const page = mockClaudeDesignPage({
    iframeSrc: "https://019e2c78-13a1-70b4-9e59-18d635816ee5.claudeusercontent.com/_bootstrap",
    scratchFile: { dir: tmp, name: "r_4_canvas_document.md", content: "not html scratch" }
  });
  const result: any = await webAiClaudeDesignGetHtml({ backend: "managed-cdp", project_url: "https://claude.ai/design/p/test-project", download_dir: tmp, profile: "claude-9224" }, mockWebAiRuntime(page));
  assert.equal(result.errorCode, "ARTIFACT_VERIFICATION_FAILED");
  assert.deepEqual(fs.readdirSync(tmp), []);
  assertNoForbiddenFields(result, contract().forbidden_output_fields);
});

test("phase C D2 Claude Design get_html accepts frame.content real HTML", async () => {
  const tmp = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "claude-design-frame-html-"));
  const html = "<!doctype html><html><body><main>Hello design</main></body></html>";
  const page = mockClaudeDesignPage({ iframeContent: html });
  const result: any = await webAiClaudeDesignGetHtml({ backend: "managed-cdp", project_url: "https://claude.ai/design/p/test-project", download_dir: tmp, profile: "claude-9224" }, mockWebAiRuntime(page));
  assert.equal(result.byteSize, Buffer.byteLength(html));
  assert.equal(fs.readFileSync(result.savedPath, "utf-8"), html);
  assertNoForbiddenFields(result, contract().forbidden_output_fields);
});

test("stream5 Claude Design get_html resolves ElementHandle contentFrame real HTML and still rejects bootstrap stubs", async () => {
  const htmlTmp = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "claude-design-elementhandle-html-"));
  const html = "<!doctype html><html><head><title>Hello World</title></head><body><main>Hello World</main></body></html>";
  const htmlPage = mockClaudeDesignPage({ iframeContent: html });
  const ok: any = await webAiClaudeDesignGetHtml({ backend: "managed-cdp", project_url: "https://claude.ai/design/p/test-project", download_dir: htmlTmp, profile: "claude-9224" }, mockWebAiRuntime(htmlPage));
  assert.equal(ok.byteSize, Buffer.byteLength(html));
  assert.equal(fs.readFileSync(ok.savedPath, "utf-8"), html);
  assert.equal(htmlPage.calls.includes("elementHandle:html-viewer-iframe"), true);
  assert.equal(htmlPage.calls.includes("handle-contentFrame:html-viewer-iframe"), true);
  assert.equal(htmlPage.calls.includes("locator-contentFrame:html-viewer-iframe"), false);
  assertNoForbiddenFields(ok, contract().forbidden_output_fields);

  const stubTmp = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "claude-design-elementhandle-stub-"));
  const stubPage = mockClaudeDesignPage({ iframeSrc: "https://019e2c78-13a1-70b4-9e59-18d635816ee5.claudeusercontent.com/_bootstrap" });
  const rejected: any = await webAiClaudeDesignGetHtml({ backend: "managed-cdp", project_url: "https://claude.ai/design/p/test-project", download_dir: stubTmp, profile: "claude-9224" }, mockWebAiRuntime(stubPage));
  assert.equal(rejected.ok, false);
  assert.equal(rejected.errorCode, "ARTIFACT_VERIFICATION_FAILED");
  assert.equal(rejected.error_code, "ARTIFACT_VERIFICATION_FAILED");
  assert.equal(rejected.iframeArtifactSha256, "");
  assert.equal(rejected.savedPath, "");
  assert.equal(rejected.byteSize, 0);
  assert.deepEqual(fs.readdirSync(stubTmp), []);
  assertNoForbiddenFields(rejected, contract().forbidden_output_fields);
});

test("stream5 Claude Design get_html opens produced file viewer before capture", async () => {
  const tmp = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "claude-design-open-html-"));
  const html = "<!doctype html><html><body><main>Opened viewer</main></body></html>";
  const page = mockClaudeDesignPage({ iframeSrcdoc: html, htmlIframeInitiallyPresent: false, htmlIframeAppearsAfterOpen: true, openFileName: "Foo.html" });
  const result: any = await webAiClaudeDesignGetHtml({ backend: "managed-cdp", project_url: "https://claude.ai/design/p/test-project?file=Foo.html", download_dir: tmp, profile: "claude-9224" }, mockWebAiRuntime(page));
  assert.equal(result.byteSize, Buffer.byteLength(html));
  assert.ok(page.calls.some((call: string) => call.includes('Foo.html') && call.includes('Open')));
  assert.equal(page.url(), "https://claude.ai/design/p/test-project?file=Foo.html");
  assertNoForbiddenFields(result, contract().forbidden_output_fields);
});

test("stream5 Claude Design get_html keeps D2 validation after opening viewer", async () => {
  const tmp = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "claude-design-open-stub-"));
  const page = mockClaudeDesignPage({ iframeSrc: "https://019e2c78-13a1-70b4-9e59-18d635816ee5.claudeusercontent.com/_loader", htmlIframeInitiallyPresent: false, htmlIframeAppearsAfterOpen: true, openFileName: "Foo.html" });
  const result: any = await webAiClaudeDesignGetHtml({ backend: "managed-cdp", project_url: "https://claude.ai/design/p/test-project?file=Foo.html", download_dir: tmp, profile: "claude-9224" }, mockWebAiRuntime(page));
  assert.equal(result.errorCode, "ARTIFACT_VERIFICATION_FAILED");
  assert.equal(result.error_code, "ARTIFACT_VERIFICATION_FAILED");
  assert.deepEqual(fs.readdirSync(tmp), []);
  assert.ok(page.calls.some((call: string) => call.includes('Foo.html') && call.includes('Open')));
  assertNoForbiddenFields(result, contract().forbidden_output_fields);
});

test("stream5 Claude Design present opens produced file viewer before present", async () => {
  const page = mockClaudeDesignPage({ htmlIframeInitiallyPresent: false, htmlIframeAppearsAfterOpen: true, openFileName: "Foo.html" });
  const result: any = await webAiClaudeDesignPresent({ backend: "managed-cdp", project_url: "https://claude.ai/design/p/test-project?file=Foo.html", profile: "claude-9224" }, mockWebAiRuntime(page));
  const openIndex = page.calls.findIndex((call: string) => call.includes('Foo.html') && call.includes('Open'));
  const presentIndex = page.calls.findIndex((call: string) => call.includes('Present'));
  assert.ok(openIndex >= 0, page.calls.join("\n"));
  assert.ok(presentIndex > openIndex, page.calls.join("\n"));
  assert.equal(result.presentUrl, "https://claude.ai/design/p/test-project?file=Foo.html");
  assertNoForbiddenFields(result, contract().forbidden_output_fields);
});

test("phase C D1-v2 Claude Design generate resolves when project URL gains file html param", async () => {
  const page = mockClaudeDesignPage({
    urlsAfterWait: ["https://claude.ai/design/p/test-project?file=Foo.html"]
  });
  const result: any = await webAiClaudeDesignGenerate({ backend: "managed-cdp", project_url: "https://claude.ai/design/p/test-project", prompt: "make a card", profile: "claude-9224", timeout_ms: 5000 }, mockWebAiRuntime(page));
  assert.equal(result.status, "generated");
  assert.equal(result.model_used, "sonnet");
  assert.equal(result.projectUrl, "https://claude.ai/design/p/test-project?file=Foo.html");
  assert.equal(result.fileName, "Foo.html");
  assert.equal(Object.prototype.hasOwnProperty.call(result, "errorCode"), false);
  assert.ok(page.calls.includes("waitForTimeout:1000"));
  assert.ok(page.calls.includes('click:[data-testid="chat-send-button"]'));
  assert.equal(page.calls.includes("press:Enter"), false);
  assertNoForbiddenFields(result, contract().forbidden_output_fields);
});

test("stream5 Claude Design completion resolves from serve iframe and derives fileName", async () => {
  const page = mockClaudeDesignPage({
    iframeSrcs: ["https://test-project.claudeusercontent.com/v1/design/projects/test-project/serve/foo.html?t=123"]
  });
  const completion = await waitForDesignFileCompletion(page, "https://claude.ai/design/p/test-project", 5000);
  assert.deepEqual(completion, { projectUrl: "https://claude.ai/design/p/test-project", fileName: "foo.html" });
});

test("stream5 Claude Design completion timeout carries projectUrl and fileName", async () => {
  const page = mockClaudeDesignPage({ iframeSrcs: [] });
  await assert.rejects(
    () => waitForDesignFileCompletion(page, "https://claude.ai/design/p/test-project", 1),
    (error: any) => {
      assert.equal(error.errorCode, "POSTCONDITION_TIMEOUT");
      assert.equal(error.projectUrl, "https://claude.ai/design/p/test-project");
      assert.equal(error.fileName, "");
      return true;
    }
  );
});

test("stream5 Claude Design generate timeout envelope includes contract keys", async () => {
  const page = mockClaudeDesignPage({ iframeSrcs: [] });
  const result: any = await webAiClaudeDesignGenerate({ backend: "managed-cdp", project_url: "https://claude.ai/design/p/test-project", prompt: "make a card", profile: "claude-9224", timeout_ms: 1 }, mockWebAiRuntime(page));
  assert.equal(result.ok, false);
  assert.equal(result.errorCode, "POSTCONDITION_TIMEOUT");
  assert.equal(result.error_code, "POSTCONDITION_TIMEOUT");
  assert.equal(result.status, "failed");
  assert.equal(result.model_used, "sonnet");
  assert.equal(result.projectUrl, "https://claude.ai/design/p/test-project");
  assert.equal(result.fileName, "");
  assertNoForbiddenFields(result, contract().forbidden_output_fields);
});

test("stream5 B5 Claude Design generate returns SUBMCP_QUOTA_EXHAUSTED on quota wall", async () => {
  const page = mockClaudeDesignPage({ bodyText: "You have reached your Design quota. Try again later." });
  const result: any = await webAiClaudeDesignGenerate({ backend: "managed-cdp", project_url: "https://claude.ai/design/p/quota", prompt: "make a card", profile: "claude-9224" }, mockWebAiRuntime(page));
  assert.equal(result.ok, false);
  assert.equal(result.status, "failed");
  assert.equal(result.model_used, "sonnet");
  assert.equal(result.projectUrl, "https://claude.ai/design/p/quota");
  assert.equal(result.fileName, "");
  assert.equal(result.errorCode, "SUBMCP_QUOTA_EXHAUSTED");
  assert.equal(result.error_code, "SUBMCP_QUOTA_EXHAUSTED");
  assertNoForbiddenFields(result, contract().forbidden_output_fields);
});

test("phase C Claude Design create_project/get_html map Playwright timeouts to stable codes without raw leaks", async () => {
  const timeout = new Error('page.waitForSelector: Timeout 15000ms exceeded. waiting for locator("input[placeholder=\\"Project name\\"]")');
  const page = mockClaudeDesignPage();
  page.waitForSelector = async () => { throw timeout; };
  const createResult: any = await webAiClaudeDesignCreateProject({ backend: "managed-cdp", name: "Phase C", profile: "claude-9224" }, mockWebAiRuntime(page));
  assert.equal(createResult.errorCode, "ELEMENT_NOT_FOUND");
  assert.equal(JSON.stringify(createResult).includes("waitForSelector"), false);

  const htmlResult: any = await webAiClaudeDesignGetHtml({ backend: "managed-cdp", project_url: "https://claude.ai/design/p/test-project", profile: "claude-9224" }, mockWebAiRuntime(page));
  assert.equal(htmlResult.errorCode, "ELEMENT_NOT_FOUND");
  assert.equal(Object.prototype.hasOwnProperty.call(htmlResult, "html"), false);
  assert.equal(JSON.stringify(htmlResult).includes("Timeout 15000ms"), false);
  assertNoForbiddenFields(htmlResult, contract().forbidden_output_fields);
});

test("phase C refreshed selectors are used for ChatGPT share/canvas/menu and Claude composer plus", async () => {
  const sharePage = mockSendPromptPage("https://chatgpt.com/c/abc123");
  const shareSelectors: string[] = [];
  sharePage.locator = (selector: string) => {
    shareSelectors.push(selector);
    const loc: any = {
      first: () => loc,
      count: async () => selector === 'button[aria-label="Share"]' ? 1 : 0,
      click: async () => undefined,
      elementHandles: async () => []
    };
    return loc;
  };
  const shared: any = await webAiChatgptConversationManage({ backend: "managed-cdp", profile: "chatgpt", action: "share", tab_url_contains: "abc123" }, mockWebAiRuntime(sharePage));
  assert.equal(shared.dialog_opened, true);
  assert.ok(shareSelectors.includes('button[aria-label="Share"]'));
  assert.equal(shareSelectors.includes('button[data-testid="share-chat-button"]'), false);

  const runtime = {
    ...mockWebAiRuntime(sharePage),
    artifactClick: async (options: any) => {
      assert.match(options.buttonSelector, /Download/);
      assert.equal(options.openPanelIfMissing, "chatgpt-canvas");
      assert.notEqual(options.noDisconnect, true);
      return { path: "", savedPath: "", sha256: "", size: 0 };
    }
  } as any;
  await webAiChatgptCanvasExport({ backend: "managed-cdp", profile: "chatgpt", tab_url_contains: "abc123", download_dir: path.join(require("node:os").tmpdir(), "chatgpt-canvas-selector") }, runtime);

  const menuPage = mockSendPromptPage("https://chatgpt.com/c/abc123");
  const menuSelectors: string[] = [];
  menuPage.waitForSelector = async () => undefined;
  menuPage.locator = (selector: string) => {
    menuSelectors.push(selector);
    const loc: any = {
      first: () => loc,
      count: async () => selector === 'button[aria-label="Open conversation options"]' || selector === '[role="menuitem"]' ? 1 : 0,
      click: async () => undefined,
      elementHandles: async () => [],
      textContent: async () => "Archive"
    };
    return loc;
  };
  const menu: any = await webAiChatgptConversationManage({ backend: "managed-cdp", profile: "chatgpt", action: "menu_enumerate", tab_url_contains: "abc123" }, mockWebAiRuntime(menuPage));
  assert.deepEqual(menu.items, ["Archive"]);
  assert.ok(menuSelectors.includes('button[aria-label="Open conversation options"]'));

  const claudePage = mockSendPromptPage("https://claude.ai/");
  const claudeSelectors: string[] = [];
  claudePage.waitForSelector = async () => undefined;
  claudePage.locator = (selector: string) => {
    claudeSelectors.push(selector);
    const loc: any = {
      first: () => loc,
      count: async () => 1,
      click: async () => undefined,
      elementHandles: async () => [],
      textContent: async () => "Add connectors"
    };
    return loc;
  };
  await webAiClaudeWorkspace({ backend: "managed-cdp", profile: "claude-9224", surface: "integrations" }, mockWebAiRuntime(claudePage));
  assert.ok(claudeSelectors.some((s) => s.includes('button[aria-label="Add files, connectors, and more"]') && s.includes('button[aria-label="Upload files"]')));
  assert.equal(claudeSelectors.some((s) => s.includes("#composer-plus-btn") || s.includes("Attach content")), false);
});

test("phase C D3 ChatGPT canvas export releases artifact runner on success and error", async () => {
  const dir = path.join(require("node:os").tmpdir(), "chatgpt-canvas-teardown");
  const successRuntime = {
    ...mockWebAiRuntime(mockSendPromptPage("https://chatgpt.com/c/abc123")),
    artifactClick: async (options: any) => {
      assert.equal(options.openPanelIfMissing, "chatgpt-canvas");
      assert.notEqual(options.noDisconnect, true);
      return { path: path.join(dir, "canvas.md"), sha256: "abc", size: 10 };
    }
  } as any;
  const ok: any = await webAiChatgptCanvasExport({ backend: "managed-cdp", profile: "chatgpt", tab_url_contains: "abc123", download_dir: dir, format: "md" }, successRuntime);
  assert.equal(ok.errorCode, undefined);
  assert.equal(ok.path, path.join(dir, "canvas.md"));

  const errorRuntime = {
    ...mockWebAiRuntime(mockSendPromptPage("https://chatgpt.com/c/abc123")),
    artifactClick: async (options: any) => {
      assert.equal(options.openPanelIfMissing, "chatgpt-canvas");
      assert.notEqual(options.noDisconnect, true);
      const error: any = new Error("No element matched --button-selector");
      error.errorCode = "ELEMENT_NOT_FOUND";
      throw error;
    }
  } as any;
  const failed: any = await webAiChatgptCanvasExport({ backend: "managed-cdp", profile: "chatgpt", tab_url_contains: "abc123", download_dir: dir, format: "md" }, errorRuntime);
  assert.equal(failed.errorCode, "ELEMENT_NOT_FOUND");
  assert.equal(failed.byteSize, 0);
});

test("phase C D3 ChatGPT canvas export readiness opens a closed canvas panel when a tile exists", async () => {
  let panelOpen = false;
  let canvasClicked = false;
  const page: any = {
    waitForLoadState: async () => undefined,
    locator: (selector: string) => {
      const isDownload = selector === 'button[aria-haspopup="menu"]:has-text("Download"), button:has-text("Download")';
      const isCanvas = selector.toLowerCase().includes("canvas");
      const loc: any = {
        count: async () => isDownload ? (panelOpen ? 1 : 0) : (isCanvas ? 1 : 0),
        nth: () => loc,
        isVisible: async () => true,
        click: async () => { if (isCanvas && !isDownload) { canvasClicked = true; panelOpen = true; } }
      };
      return loc;
    }
  };
  const evidence = await waitForArtifactPageReady(page, {
    profile: "chatgpt",
    tabUrlContains: "abc123",
    buttonSelector: 'button[aria-haspopup="menu"]:has-text("Download"), button:has-text("Download")',
    downloadDir: path.join(require("node:os").tmpdir(), "chatgpt-canvas-panel"),
    openPanelIfMissing: "chatgpt-canvas",
    frameMinCount: 0,
    locateTimeoutMs: 100
  });
  assert.equal(canvasClicked, true);
  assert.equal((evidence.openPanelIfMissing as any).downloadControlsAfter, 1);
});


test("stream5 B4 Gemini canvas prompt send requires sensitive-content confirmation", async () => {
  const result: any = await callMcpTool("webai_gemini_canvas_edit", { backend: "managed-cdp", profile: "gemini-9225", prompt: "Create a substantial canvas draft" });
  assert.equal(result.ok, false);
  assert.equal(result.errorCode, "SENSITIVE_CONTENT_GUARD");
  assert.equal(result.error_code, "SENSITIVE_CONTENT_GUARD");
  assert.equal(result.action, "canvas_edit");
  assertNoForbiddenFields(result, contract().forbidden_output_fields);
});

test("stream5 B4 Gemini conversation delete requires policy approval", async () => {
  const result: any = await callMcpTool("webai_gemini_conversation_manage", { backend: "managed-cdp", profile: "gemini-9225", action: "delete" });
  assert.equal(result.ok, false);
  assert.equal(result.errorCode, "POLICY_APPROVAL_REQUIRED");
  assert.equal(result.error_code, "POLICY_APPROVAL_REQUIRED");
  assert.equal(result.action, "delete");
  assertNoForbiddenFields(result, contract().forbidden_output_fields);
});

test("stream5 B2 ChatGPT workspace destructive actions require policy approval", async () => {
  const result: any = await callMcpTool("webai_chatgpt_workspace", { backend: "managed-cdp", profile: "chatgpt", surface: "memory", action: "delete_memory" });
  assert.equal(result.ok, false);
  assert.equal(result.errorCode, "POLICY_APPROVAL_REQUIRED");
  assert.equal(result.error_code, "POLICY_APPROVAL_REQUIRED");
  assert.equal(result.surface, "memory");
  assert.equal(result.action, "delete_memory");
  assertNoForbiddenFields(result, contract().forbidden_output_fields);
});

test("stream5 B2 ChatGPT conversation kebab actions require human handoff", async () => {
  const result: any = await callMcpTool("webai_chatgpt_conversation_manage", { backend: "managed-cdp", profile: "chatgpt", action: "delete" });
  assert.equal(result.ok, false);
  assert.equal(result.errorCode, "HUMAN_HANDOFF_REQUIRED");
  assert.equal(result.error_code, "HUMAN_HANDOFF_REQUIRED");
  assert.equal(result.action, "delete");
  assert.match(result.reason, /kebab menu/i);
  assertNoForbiddenFields(result, contract().forbidden_output_fields);
});

test("new v1.3.0 error codes exist in TS export and contract manifest", () => {
  const manifest = contract();
  for (const code of ["AUTO_PUBLISH_DETECTED", "ARTIFACT_MODE_UNSUPPORTED", "MODEL_SELECTION_DRIFT", "PLAN_OR_QUOTA_REQUIRED", "SAFE_OUTPUT_REDACTION_REQUIRED", "PROFILE_LEASE_BUSY"]) {
    assert.ok((CONSUMER_ERROR_CODES as readonly string[]).includes(code), `TS missing ${code}`);
    assert.ok(manifest.error_codes.includes(code), `contract missing ${code}`);
  }
});

test("webai task status and prompt-deny responses do not leak forbidden fields", async () => {
  const manifest = contract();
  const missing = await callMcpTool("webai_task_status", { backend: "managed-cdp", task_id: "missing" });
  assertNoForbiddenFields(missing, manifest.forbidden_output_fields);
  assert.deepEqual(missing, { status: "failed", errorCode: "INVALID_ARGS" });
  await assert.rejects(
    () => callMcpTool("webai_gemini_generate_video", { backend: "managed-cdp", profile: "p", prompt: "please publish this publicly", download_dir: process.cwd() }),
    (error: any) => error.errorCode === "POLICY_APPROVAL_REQUIRED"
  );
});

import { redactValue } from "../src/trace/redact";
import { webAiSendPromptInput, webAiSendPromptOutputShape } from "../src/mcp/schemas";

function mockClaudeDesignPage(options: { iframeSrcdoc?: string; iframeSrcdocSequence?: string[]; iframeSrc?: string; iframeSrcs?: string[]; iframeContent?: string; bodyText?: string; designStates?: Array<{ stopVisible: boolean; sendReady: boolean; hasPreview: boolean; presentReady: boolean }>; urlsAfterWait?: string[]; scratchFile?: { dir: string; name: string; content: string }; htmlIframeInitiallyPresent?: boolean; htmlIframeAppearsAfterOpen?: boolean; openFileName?: string } = {}): any {
  const calls: string[] = [];
  const designStates = [...(options.designStates || [])];
  const urlsAfterWait = [...(options.urlsAfterWait || [])];
  const iframeSrcdocSequence = [...(options.iframeSrcdocSequence || [])];
  let scratchWritten = false;
  let htmlIframePresent = options.htmlIframeInitiallyPresent !== false;
  const page: any = {
    _url: "https://claude.ai/design/p/test-project",
    calls,
    url() { return this._url; },
    goto: async (url: string) => { calls.push(`goto:${url}`); page._url = url; },
    waitForLoadState: async () => undefined,
    waitForSelector: async () => undefined,
    waitForURL: async () => undefined,
    waitForTimeout: async (ms: number) => {
      calls.push(`waitForTimeout:${ms}`);
      if (urlsAfterWait.length) page._url = urlsAfterWait.shift();
    },
    keyboard: { press: async (key: string) => { calls.push(`press:${key}`); }, type: async () => undefined },
    evaluate: async (fn: any) => {
      const source = String(fn);
      if (source.includes("document.body")) return options.bodyText || "";
      calls.push("design-state");
      return designStates.length ? designStates.shift() : { stopVisible: false, sendReady: true, hasPreview: true, presentReady: true };
    },
    locator: (selector: string) => {
      if (selector === "iframe") {
        const iframeSrcs = options.iframeSrcs || (options.iframeSrc ? [options.iframeSrc] : []);
        const makeFrame = (index: number) => ({
          first: () => makeFrame(0),
          nth: (nextIndex: number) => makeFrame(nextIndex),
          count: async () => iframeSrcs.length,
          waitFor: async () => undefined,
          click: async () => { calls.push(`click:${selector}`); },
          getAttribute: async (name: string) => name === "src" ? (iframeSrcs[index] || null) : null,
          contentFrame: async () => null,
          textContent: async () => options.bodyText || ""
        });
        return makeFrame(0);
      }
      const loc: any = {
        first: () => loc,
        waitFor: async () => undefined,
        fill: async (value: string) => { calls.push(`fill:${selector}:${value}`); },
        click: async () => {
          calls.push(`click:${selector}`);
          if (selector.includes('Open') && options.htmlIframeAppearsAfterOpen) {
            htmlIframePresent = true;
            const fileName = options.openFileName || "Foo.html";
            page._url = `https://claude.ai/design/p/test-project?file=${encodeURIComponent(fileName)}`;
          }
        },
        getAttribute: async (name: string) => {
          if (!selector.includes("html-viewer-iframe") || !htmlIframePresent) return null;
          if (!scratchWritten && options.scratchFile && (name === "srcdoc" || name === "src")) {
            scratchWritten = true;
            fs.mkdirSync(options.scratchFile.dir, { recursive: true });
            fs.writeFileSync(path.join(options.scratchFile.dir, options.scratchFile.name), options.scratchFile.content);
          }
          if (name === "srcdoc") return iframeSrcdocSequence.length ? iframeSrcdocSequence.shift() : (options.iframeSrcdoc || null);
          if (name === "src") return options.iframeSrc || null;
          return null;
        },
        elementHandle: async () => {
          if (selector.includes("html-viewer-iframe")) calls.push("elementHandle:html-viewer-iframe");
          if (!options.iframeContent) return null;
          return {
            contentFrame: async () => {
              if (selector.includes("html-viewer-iframe")) calls.push("handle-contentFrame:html-viewer-iframe");
              return { content: async () => options.iframeContent };
            }
          };
        },
        contentFrame: async () => {
          if (selector.includes("html-viewer-iframe")) calls.push("locator-contentFrame:html-viewer-iframe");
          return options.iframeContent ? { content: async () => options.iframeContent } : null;
        },
        count: async () => selector.includes("html-viewer-iframe") ? (htmlIframePresent ? 1 : 0) : 1,
        textContent: async () => options.bodyText || ""
      };
      return loc;
    }
  };
  return page;
}

function mockWebAiRuntime(page: any): any {
  const context = { pages: () => [page], newPage: async () => page };
  const browser = { contexts: () => [context], close: async () => undefined };
  return {
    launcher: {
      launch: async () => ({}),
      connectOverCdp: async () => browser
    }
  };
}

function mockWebAiRuntimePages(pages: any[]): any {
  const context = { pages: () => pages, newPage: async () => pages[0] };
  const browser = { contexts: () => [context], close: async () => undefined };
  return { launcher: { launch: async () => ({}), connectOverCdp: async () => browser } };
}

type CodexMockOptions = {
  envRows?: Array<{ text: string; href: string }>;
  selectedEnv?: string;
  bodyText?: string;
  snapshotVisibleText?: string;
  legacyBodyText?: string;
  taskId?: string;
  taskHref?: string;
  preSubmitTaskHref?: string;
  fileLabels?: string[];
  toggleText?: string;
  counts?: Record<string, number>;
};

function mockCodexPage(options: CodexMockOptions): any {
  const calls: string[] = [];
  const taskId = options.taskId || "task_e_11111111111111111111111111111111";
  const page: any = {
    _url: "about:blank",
    calls,
    selectedEnv: options.selectedEnv || "noeticbraid",
    url() { return this._url; },
    goto: async (url: string) => { calls.push(`goto:${url}`); page._url = url; },
    waitForLoadState: async () => undefined,
    waitForSelector: async (selector: string) => { calls.push(`wait:${selector}`); },
    evaluate: async (_fn: unknown, arg?: any) => {
      calls.push(arg?.includePortals === true ? "snapshot-read:include-portals" : "legacy-evaluate");
      if (arg && typeof arg === "object" && "liteMode" in arg) {
        const visibleText = options.snapshotVisibleText ?? options.bodyText ?? "";
        return {
          visibleText,
          elements: [],
          forms: [],
          tables: [],
          lists: [],
          iframes: [],
          portalRootCount: arg.includePortals ? 1 : 0
        };
      }
      return options.legacyBodyText ?? "";
    },
    keyboard: { type: async (text: string) => calls.push(`keyboard-type:${text}`) },
    locator: (selector: string) => makeCodexLocator(page, selector, options)
  };
  return page;
}

function makeCodexLocator(page: any, selector: string, options: CodexMockOptions, rowIndex?: number, fileIndex?: number): any {
  const loc: any = {
    first: () => loc,
    nth: (index: number) => makeCodexLocator(page, selector, options, selector === "tr" ? index : rowIndex, selector.includes("View file") ? index : fileIndex),
    locator: (child: string) => makeCodexLocator(page, child, options, rowIndex, fileIndex),
    waitFor: async () => undefined,
    count: async () => {
      if (selector === "tr") return (options.envRows || []).length;
      if (selector === 'button[aria-label="Cancel task"]') return options.counts?.cancel ?? ((options.bodyText || "").includes("Cancel task") ? 1 : 0);
      if (selector === 'button[aria-label="Give thumbs up feedback"]') return options.counts?.thumbs ?? ((options.bodyText || "").includes("Give thumbs up feedback") ? 1 : 0);
      if (selector === 'button[aria-label^="View file "]') return (options.fileLabels || []).length;
      if (selector === "xpath=//button[normalize-space(.)='Create PR']") return options.counts?.createPr ?? ((options.bodyText || "").includes("Create PR") ? 1 : 0);
      return options.counts?.[selector] ?? 1;
    },
    textContent: async () => {
      if (selector === "tr") return options.envRows?.[rowIndex || 0]?.text || "";
      if (selector === "button[aria-label='View all code environments']") return page.selectedEnv;
      if (selector === 'button[aria-label="Toggle file list diffs"]') return options.toggleText || `File (${(options.fileLabels || []).length})`;
      return "";
    },
    innerText: async () => loc.textContent(),
    getAttribute: async (name: string) => {
      if (selector.includes("settings/environment") && name === "href") return options.envRows?.[rowIndex || 0]?.href || "";
      if (selector.includes("/codex/cloud/tasks") && name === "href") {
        if (!page._submitted && options.preSubmitTaskHref) return options.preSubmitTaskHref;
        return options.taskHref || `/codex/cloud/tasks/${options.taskId || "task_e_11111111111111111111111111111111"}`;
      }
      if (selector === 'button[aria-label^="View file "]' && name === "aria-label") return options.fileLabels?.[fileIndex || 0] || "";
      return "";
    },
    fill: async (text: string) => { page.calls.push(`fill:${selector}:${text}`); },
    click: async () => {
      page.calls.push(`click:${selector}`);
      if (selector.includes("normalize-space(.)='LT-0I/CN-'") && (options.counts?.envPick ?? 1) > 0) page.selectedEnv = "LT-0I/CN-";
      if (selector === "button[aria-label='Submit']") {
        page._submitted = true;
        // Live-accurate path (preSubmitTaskHref configured): the account does
        // NOT route to /tasks/<id>; the new card is prepended in place and the
        // top-card href flips. Legacy path keeps the prior URL-nav behavior.
        if (!options.preSubmitTaskHref) page._url = `https://chatgpt.com/codex/cloud/tasks/${options.taskId || "task_e_11111111111111111111111111111111"}`;
      }
    }
  };
  return loc;
}

function mockSendPromptPage(initialUrl: string): any {
  const calls: { goto: string[] } = { goto: [] };
  const page: any = {
    _url: initialUrl,
    calls,
    url() { return this._url; },
    goto: async (url: string) => { calls.goto.push(url); page._url = url; },
    waitForLoadState: async () => undefined,
    waitForFunction: async () => undefined,
    // Gemini responseText() scopes to the latest <model-response> via
    // page.evaluate (NOT locator("main")). Default mock returns the clean
    // scoped answer; tests that need to assert scoping override this.
    evaluate: async () => "scoped gemini answer",
    keyboard: { press: async () => undefined, type: async () => undefined },
    locator: (_selector: string) => {
      const loc: any = {
        first: () => loc,
        last: () => loc,
        count: async () => _selector.includes('aria-haspopup="menu"') || _selector.includes('[role="menuitemradio"]:has-text("Thinking")') ? 1 : 0,
        waitFor: async () => undefined,
        fill: async () => undefined,
        click: async () => undefined,
        getAttribute: async (name: string) => _selector.includes('aria-haspopup="menu"') && name === "aria-label" ? "Thinking" : null,
        textContent: async () => _selector.includes('aria-haspopup="menu"') ? "Thinking" : "assistant response"
      };
      return loc;
    }
  };
  return page;
}

function mockPulsePage(initialUrl: string, visibleText: string, presentSelectors: Set<string>, options: { redirectPulseToHome?: boolean; quickNewsPressed?: boolean } = {}): any {
  const calls: { goto: string[]; click: string[]; snapshotOptions: any[] } = { goto: [], click: [], snapshotOptions: [] };
  const page: any = {
    _url: initialUrl,
    _text: visibleText,
    _selectors: presentSelectors,
    _quickNewsPressed: Boolean(options.quickNewsPressed),
    calls,
    url() { return this._url; },
    goto: async (url: string) => {
      calls.goto.push(url);
      page._url = options.redirectPulseToHome && url === "https://chatgpt.com/pulse" ? "https://chatgpt.com/" : url;
    },
    waitForLoadState: async () => undefined,
    waitForTimeout: async () => undefined,
    evaluate: async (_fn?: unknown, arg?: any) => {
      if (arg && Object.prototype.hasOwnProperty.call(arg, "liteMode")) {
        page.calls.snapshotOptions.push(arg);
        return {
          visibleText: arg.liteMode ? "" : page._text,
          elements: [],
          forms: [],
          tables: [],
          lists: [],
          iframes: [],
          portalRootCount: arg.includePortals ? 1 : 0
        };
      }
      return page._text;
    },
    locator: (selector: string) => {
      const loc: any = {
        first: () => loc,
        count: async () => {
          if (selector === 'xpath=//div[@role="dialog"]//button[contains(normalize-space(.),"Quick news recap")]') return page._selectors.has(selector) ? 1 : 0;
          return page._selectors.has(selector) ? 1 : 0;
        },
        click: async () => {
          calls.click.push(selector);
          if (selector.includes("Get started")) {
            page._selectors.delete('xpath=//div[@role="dialog"]//button[normalize-space(.)="Get started"]');
            page._selectors.add('xpath=//div[@role="dialog"]//button[contains(normalize-space(.),"Quick news recap")]');
            page._selectors.add('xpath=//div[@role="dialog"]//button[normalize-space(.)="Next"]');
          }
          if (selector.includes("Quick news recap")) page._quickNewsPressed = true;
          if (selector.includes("Next")) page._selectors.add('xpath=//div[@role="dialog"]//button[normalize-space(.)="Skip for now"]');
          if (selector.includes("Skip for now")) {
            page._url = "https://chatgpt.com/pulse";
            page._text = "Pulse Your first Pulse is in the works Check back in about 30 minutes";
            page._selectors.delete("#radix-_r_ch_");
            page._selectors.add('button[aria-label="Actions"]');
          }
        },
        getAttribute: async (name: string) => name === "aria-pressed" && page._quickNewsPressed ? "true" : null,
        textContent: async () => ""
      };
      return loc;
    }
  };
  return page;
}

function mockPulseSequencePage(states: Array<{ url: string; text: string; selectors: Set<string> }>): any {
  let index = 0;
  const calls: { goto: string[]; waitForTimeout: number[]; snapshotOptions: any[] } = { goto: [], waitForTimeout: [], snapshotOptions: [] };
  const current = () => states[Math.min(index, states.length - 1)];
  const page: any = {
    calls,
    url: () => current().url,
    goto: async (url: string) => {
      calls.goto.push(url);
      states[index] = { ...states[index], url };
    },
    waitForLoadState: async () => undefined,
    waitForTimeout: async (ms: number) => {
      calls.waitForTimeout.push(ms);
      if (index < states.length - 1) index += 1;
    },
    evaluate: async (_fn?: unknown, arg?: any) => {
      if (arg && Object.prototype.hasOwnProperty.call(arg, "liteMode")) {
        calls.snapshotOptions.push(arg);
        return {
          visibleText: arg.liteMode ? "" : current().text,
          elements: [],
          forms: [],
          tables: [],
          lists: [],
          iframes: [],
          portalRootCount: arg.includePortals ? 1 : 0
        };
      }
      return current().text;
    },
    locator: (selector: string) => {
      const loc: any = {
        first: () => loc,
        count: async () => current().selectors.has(selector) ? 1 : 0,
        click: async () => undefined,
        getAttribute: async () => null,
        textContent: async () => ""
      };
      return loc;
    }
  };
  return page;
}

test("webai_chatgpt_pulse_get detects not_onboarded redirect with Get started dialog", async () => {
  const page = mockPulsePage("https://chatgpt.com/", "Pulse can help you stay on top of anything Get started", new Set([
    "#radix-_r_ch_",
    'xpath=//div[@role="dialog"]//button[normalize-space(.)="Get started"]'
  ]), { redirectPulseToHome: true });
  const result: any = await webAiChatgptPulseGet({ backend: "managed-cdp", profile: "chatgpt" }, mockWebAiRuntime(page));
  assert.equal(result.status, "not_onboarded");
  assert.equal(result.route, "https://chatgpt.com/");
  assert.equal(Object.prototype.hasOwnProperty.call(result, "digest_text"), false);
});

test("webai_chatgpt_pulse_get detects pending from in-the-works page text", async () => {
  const page = mockPulsePage("https://chatgpt.com/pulse", "Pulse Your first Pulse is in the works Check back in about 30 minutes", new Set([
    'button[aria-label="Actions"]'
  ]));
  const result: any = await webAiChatgptPulseGet({ backend: "managed-cdp", profile: "chatgpt" }, mockWebAiRuntime(page));
  assert.equal(result.status, "pending");
  assert.match(result.generated_hint, /Check back in|works/);
  assert.equal(Object.prototype.hasOwnProperty.call(result, "digest_text"), false);
});

test("webai_chatgpt_pulse_get extracts hydrated digest body without Pulse chrome or footer", async () => {
  const body = "我先把今天最该看的变化放前面。近24小时要闻速览：机器人安全标准新动向，AI产品发布节奏继续加快。今天就到这里。✨ 最近在想什么？我会把它当作明天的灵感。";
  const visibleText = `Chat history ChatGPT New chat Search chats Codex More Python Primes File Shark Pro Pulse Curate 5月15日\n\n${body}\n Curate for tomorrow`;
  const page = mockPulsePage("https://chatgpt.com/pulse", visibleText, new Set([
    'button[aria-label="Actions"]'
  ]));
  const result: any = await webAiChatgptPulseGet({ backend: "managed-cdp", profile: "chatgpt" }, mockWebAiRuntime(page));
  assert.equal(result.status, "ready");
  assert.equal(result.digest_text, body);
  assert.ok(!result.digest_text.includes("Chat history"));
  assert.ok(!result.digest_text.includes("New chat"));
  assert.ok(!result.digest_text.includes("Curate for tomorrow"));
  assert.match(result.digest_text, /机器人安全标准新动向/);
  assert.match(result.digest_text, /明天的灵感/);
  assert.equal(result.generated_hint, "A fresh update lands every morning");
});

test("webai_chatgpt_pulse_get reads Pulse text from full include-portals snapshot", async () => {
  const body = "Here is the real digest body. Robotics safety updates landed today, AI product launches accelerated, and tomorrow should focus on practical deployment signals. ✨";
  const visibleText = `Chat history ChatGPT New chat Search chats Codex More Shark Pro Pulse Curate May 15\n\n${body}\n Curate for tomorrow`;
  const page = mockPulsePage("https://chatgpt.com/pulse", visibleText, new Set([
    'button[aria-label="Actions"]'
  ]));
  const result: any = await webAiChatgptPulseGet({ backend: "managed-cdp", profile: "chatgpt" }, mockWebAiRuntime(page));

  assert.equal(result.status, "ready");
  assert.equal(result.digest_text, body);
  assert.ok(!result.digest_text.includes("Chat history"));
  assert.ok(!result.digest_text.includes("Curate for tomorrow"));
  assert.ok(page.calls.snapshotOptions.length > 0);
  assert.equal(page.calls.snapshotOptions[0].includePortals, true);
  assert.equal(page.calls.snapshotOptions[0].liteMode, false);

  const shell = mockPulsePage("https://chatgpt.com/pulse", "Chat history ChatGPT New chat Search chats Codex More Shark Pro Pulse \n \n \n ", new Set([
    'button[aria-label="Actions"]'
  ]));
  await assert.rejects(
    () => webAiChatgptPulseGet({ backend: "managed-cdp", profile: "chatgpt" }, mockWebAiRuntime(shell)),
    (error: any) => error?.errorCode === "ELEMENT_NOT_FOUND"
  );
  assert.ok(shell.calls.snapshotOptions.length > 0);
  assert.equal(shell.calls.snapshotOptions[0].includePortals, true);
  assert.equal(shell.calls.snapshotOptions[0].liteMode, false);
});
test("webai_chatgpt_pulse_get waits through empty Pulse shell before detecting hydrated digest", async () => {
  const body = "我先把今天最该看的变化放前面。近24小时要闻速览：机器人安全标准新动向，AI产品发布节奏继续加快。今天就到这里。✨ 最近在想什么？我会把它当作明天的灵感。";
  const shell = "Chat history ChatGPT New chat Search chats Codex More Shark Pro Pulse \n \n \n \n";
  const hydrated = `Chat history ChatGPT New chat Search chats Codex More Python Primes File Shark Pro Pulse Curate 5月15日 ${body} Curate for tomorrow`;
  const page = mockPulseSequencePage([
    { url: "https://chatgpt.com/pulse", text: shell, selectors: new Set(['button[aria-label="Actions"]']) },
    { url: "https://chatgpt.com/pulse", text: hydrated, selectors: new Set(['button[aria-label="Actions"]']) }
  ]);
  const result: any = await webAiChatgptPulseGet({ backend: "managed-cdp", profile: "chatgpt" }, mockWebAiRuntime(page));
  assert.equal(result.status, "ready");
  assert.equal(result.digest_text, body);
  assert.deepEqual(page.calls.waitForTimeout, [250]);
});

test("webai_chatgpt_pulse_get rejects empty Pulse shell for the whole hydration budget", async () => {
  const shell = "Chat history ChatGPT New chat Search chats Codex More Shark Pro Pulse \n \n \n \n";
  const page = mockPulseSequencePage([
    { url: "https://chatgpt.com/pulse", text: shell, selectors: new Set(['button[aria-label="Actions"]']) }
  ]);
  await assert.rejects(
    () => webAiChatgptPulseGet({ backend: "managed-cdp", profile: "chatgpt" }, mockWebAiRuntime(page)),
    (error: any) => error?.errorCode === "ELEMENT_NOT_FOUND"
  );
  assert.ok(page.calls.waitForTimeout.length > 0);
});

test("webai_chatgpt_pulse_onboard refuses without confirmed and never clicks Connect with Gmail", async () => {
  const refused: any = await webAiChatgptPulseOnboard({ backend: "managed-cdp", profile: "chatgpt" }, mockWebAiRuntime(mockPulsePage("https://chatgpt.com/", "", new Set())));
  assert.equal(refused.errorCode, "INVALID_ARGS");

  const page = mockPulsePage("https://chatgpt.com/", "Pulse can help you stay on top of anything Get started", new Set([
    "#radix-_r_ch_",
    'xpath=//div[@role="dialog"]//button[normalize-space(.)="Get started"]'
  ]), { redirectPulseToHome: true });
  const result: any = await webAiChatgptPulseOnboard({ backend: "managed-cdp", profile: "chatgpt", confirmed: true }, mockWebAiRuntime(page));
  assert.equal(result.onboarded, true);
  assert.equal(result.news_topic_selected, true);
  assert.equal(result.final_status, "pending");
  assert.equal(page.calls.click.some((selector: string) => selector.includes("Connect with Gmail")), false);
  assert.ok(page.calls.click.includes('xpath=//div[@role="dialog"]//button[normalize-space(.)="Skip for now"]'));
});

test("LOGIN_REQUIRED returned for send-prompt login URL precheck", async () => {
  const page = mockSendPromptPage("https://claude.ai/login?from=logout");
  let locatorTouched = false;
  page.locator = () => {
    locatorTouched = true;
    throw new Error("prompt locator should not be touched on login page");
  };
  const result: any = await webAiClaudeSendPrompt({ backend: "managed-cdp", profile: "claude", prompt: "hello" }, mockWebAiRuntime(page));
  assert.equal(result.ok, false);
  assert.equal(result.error_code, "LOGIN_REQUIRED");
  assert.equal(result.errorCode, "LOGIN_REQUIRED");
  assert.equal(result.service, "claude");
  assert.equal(locatorTouched, false);
});

test("phase C ChatGPT canvas export maps selector failures to stable codes promptly", async () => {
  const page = mockSendPromptPage("https://chatgpt.com/c/abc123");
  const runtime = {
    ...mockWebAiRuntime(page),
    artifactClick: async (options: any) => {
      assert.equal(options.profile, "chatgpt");
      assert.equal(options.buttonSelector, 'button[aria-haspopup="menu"]:has-text("Download"), button:has-text("Download")');
      const error: any = new Error('No element matched --button-selector on https://chatgpt.com/c/<conversation-id>');
      error.errorCode = "ELEMENT_NOT_FOUND";
      throw error;
    }
  } as any;
  const started = Date.now();
  const result: any = await webAiChatgptCanvasExport({ backend: "managed-cdp", profile: "chatgpt", tab_url_contains: "abc123", download_dir: path.join(require("node:os").tmpdir(), "chatgpt-canvas-stable"), timeout_ms: 100 }, runtime);
  assert.equal(result.errorCode, "ELEMENT_NOT_FOUND");
  assert.equal(result.error_code, "ELEMENT_NOT_FOUND");
  assert.equal(result.path, "");
  assert.equal(Date.now() - started < 1000, true);
  assert.equal(JSON.stringify(result).includes("<conversation-id>"), false);
  assertNoForbiddenFields(result, contract().forbidden_output_fields);
});

test("phase C Claude send-prompt honors tab_url_contains instead of forcing claude.ai/code", async () => {
  const codePage = mockSendPromptPage("https://claude.ai/code");
  const newPage = mockSendPromptPage("https://claude.ai/new");
  let codeTouched = false;
  let newTouched = false;
  const codeOriginal = codePage.locator;
  codePage.locator = (selector: string) => { codeTouched = true; return codeOriginal(selector); };
  const original = newPage.locator;
  newPage.locator = (selector: string) => { newTouched = true; return original(selector); };
  const result: any = await webAiClaudeSendPrompt({ backend: "managed-cdp", profile: "claude-9224", prompt: "hello", tab_url_contains: "claude.ai/new", response_timeout_ms: 1000 }, mockWebAiRuntimePages([codePage, newPage]));
  assert.equal(result.chat_url, "https://claude.ai/new");
  assert.equal(newTouched, true);
  assert.equal(result.chat_url.includes("/code"), false);
});



test("phase C ChatGPT model detection reads composer control instead of sidebar Recents", async () => {
  const page = mockSendPromptPage("https://chatgpt.com/");
  const selectors: string[] = [];
  page.locator = (selector: string) => {
    selectors.push(selector);
    const loc: any = {
      first: () => loc,
      last: () => loc,
      count: async () => selector.includes("form button") || selector.includes('[role="menuitemradio"]:has-text("Thinking")') || selector === '#prompt-textarea' || selector.includes('[data-message-author-role="assistant"]') ? 1 : 0,
      waitFor: async () => undefined,
      fill: async () => undefined,
      click: async () => undefined,
      elementHandles: async () => [],
      getAttribute: async (name: string) => selector.includes("form button") && name === "aria-label" ? "Thinking" : null,
      textContent: async () => selector.includes("form button") ? "Thinking" : selector.includes("Recents") ? "Recents" : "assistant response"
    };
    return loc;
  };
  const result: any = await webAiChatgptSendPrompt({ backend: "managed-cdp", profile: "chatgpt", prompt: "hi", response_timeout_ms: 10 }, mockWebAiRuntime(page));
  assert.notEqual(result.model_used, "Recents");
  assert.equal(result.errorCode, null);
  assert.equal(selectors.some((selector) => selector.startsWith("form button")), true);
});

test("webai:chatgpt:send-prompt emits MODEL_SELECTION_DRIFT when Thinking selection label does not match", async () => {
  const page = mockSendPromptPage("https://chatgpt.com/");
  const clicks: string[] = [];
  let promptTouched = false;
  page.locator = (selector: string) => {
    const loc: any = {
      first: () => loc,
      last: () => loc,
      count: async () => selector.includes('aria-haspopup="menu"') || selector.includes('[role="menuitemradio"]:has-text("Thinking")') ? 1 : 0,
      waitFor: async () => { promptTouched = true; },
      fill: async () => { promptTouched = true; },
      click: async () => { clicks.push(selector); },
      getAttribute: async (name: string) => selector.includes('aria-haspopup="menu"') && name === "aria-label" ? "Extended Pro" : null,
      textContent: async () => selector.includes('aria-haspopup="menu"') ? "Extended Pro" : "assistant response"
    };
    return loc;
  };
  const result: any = await webAiChatgptSendPrompt({ backend: "managed-cdp", profile: "chatgpt", prompt: "hi", response_timeout_ms: 10 }, mockWebAiRuntime(page));
  assert.equal(result.errorCode, "MODEL_SELECTION_DRIFT");
  assert.equal(result.error_code, "MODEL_SELECTION_DRIFT");
  assert.equal(result.expected_model, "Thinking");
  assert.equal(promptTouched, false, "prompt composer must not be touched after drift");
  assert.ok(clicks.some((selector) => selector.includes('[role="menuitemradio"]:has-text("Thinking")')), clicks.join("\n"));
});



test("webai:chatgpt:send-prompt accepts Thinking row when trigger pill collapses to Heavy", async () => {
  const page = mockSendPromptPage("https://chatgpt.com/");
  let promptTouched = false;
  page.locator = (selector: string) => {
    const loc: any = {
      first: () => loc,
      last: () => loc,
      count: async () => {
        if (selector.includes('aria-haspopup="menu"')) return 1;
        if (selector.includes('[role="menuitemradio"][aria-checked="true"]')) return 1;
        if (selector.includes('model-switcher-gpt-5-5-thinking') || selector.includes('[role="menuitemradio"]:has-text("Thinking")')) return 1;
        if (selector === '#prompt-textarea' || selector.includes('[data-message-author-role="assistant"]')) return 1;
        return 0;
      },
      waitFor: async () => { if (selector === '#prompt-textarea') promptTouched = true; },
      fill: async () => { if (selector === '#prompt-textarea') promptTouched = true; },
      click: async () => undefined,
      getAttribute: async (name: string) => {
        if (selector.includes('[role="menuitemradio"][aria-checked="true"]') && name === "data-testid") return "model-switcher-gpt-5-5-thinking";
        if (selector.includes('aria-haspopup="menu"') && name === "aria-label") return "Heavy";
        return null;
      },
      textContent: async () => {
        if (selector.includes('[role="menuitemradio"][aria-checked="true"]')) return "Thinking • Heavy";
        if (selector.includes('aria-haspopup="menu"')) return "Heavy";
        return "assistant response";
      }
    };
    return loc;
  };
  const result: any = await webAiChatgptSendPrompt({ backend: "managed-cdp", profile: "chatgpt", prompt: "hi", response_timeout_ms: 10 }, mockWebAiRuntime(page));
  assert.equal(result.errorCode, null);
  assert.equal(promptTouched, true, "prompt composer should be touched when Thinking identity is selected");
});

test("webai:chatgpt:send-prompt drifts when checked ChatGPT model identity remains Instant while Thinking expected", async () => {
  const page = mockSendPromptPage("https://chatgpt.com/");
  let promptTouched = false;
  page.locator = (selector: string) => {
    const loc: any = {
      first: () => loc,
      last: () => loc,
      count: async () => {
        if (selector.includes('aria-haspopup="menu"')) return 1;
        if (selector.includes('[role="menuitemradio"][aria-checked="true"]')) return 1;
        if (selector.includes('model-switcher-gpt-5-5-thinking') || selector.includes('[role="menuitemradio"]:has-text("Thinking")')) return 1;
        if (selector === '#prompt-textarea' || selector.includes('[data-message-author-role="assistant"]')) return 1;
        return 0;
      },
      waitFor: async () => { if (selector === '#prompt-textarea') promptTouched = true; },
      fill: async () => { if (selector === '#prompt-textarea') promptTouched = true; },
      click: async () => undefined,
      getAttribute: async (name: string) => {
        if (selector.includes('[role="menuitemradio"][aria-checked="true"]') && name === "data-testid") return "model-switcher-gpt-5-5";
        if (selector.includes('aria-haspopup="menu"') && name === "aria-label") return "Instant";
        return null;
      },
      textContent: async () => selector.includes('[role="menuitemradio"][aria-checked="true"]') ? "Instant" : "assistant response"
    };
    return loc;
  };
  const result: any = await webAiChatgptSendPrompt({ backend: "managed-cdp", profile: "chatgpt", prompt: "hi", response_timeout_ms: 10 }, mockWebAiRuntime(page));
  assert.equal(result.errorCode, "MODEL_SELECTION_DRIFT");
  assert.equal(result.expected_model, "Thinking");
  assert.equal(result.model_used, "Instant");
  assert.equal(promptTouched, false, "prompt composer must not be touched after genuine identity drift");
});

test("webai:chatgpt:send-prompt routes explicit Pro model to Pro row only", async () => {
  const page = mockSendPromptPage("https://chatgpt.com/");
  let selected = "model-switcher-gpt-5-5-thinking";
  const clicks: string[] = [];
  page.locator = (selector: string) => {
    const loc: any = {
      first: () => loc,
      last: () => loc,
      count: async () => {
        if (selector.includes('aria-haspopup="menu"')) return 1;
        if (selector.includes('[role="menuitemradio"][aria-checked="true"]')) return 1;
        if (selector.includes('model-switcher-gpt-5-5-pro')) return 1;
        if (selector === '#prompt-textarea' || selector.includes('[data-message-author-role="assistant"]')) return 1;
        return 0;
      },
      waitFor: async () => undefined,
      fill: async () => undefined,
      click: async () => {
        clicks.push(selector);
        if (selector.includes('model-switcher-gpt-5-5-pro')) selected = "model-switcher-gpt-5-5-pro";
      },
      getAttribute: async (name: string) => {
        if (selector.includes('[role="menuitemradio"][aria-checked="true"]') && name === "data-testid") return selected;
        return null;
      },
      textContent: async () => selected === "model-switcher-gpt-5-5-pro" ? "Pro • Extended" : "Thinking • Heavy"
    };
    return loc;
  };
  const result: any = await webAiChatgptSendPrompt({ backend: "managed-cdp", profile: "chatgpt", prompt: "hi", model: "pro", response_timeout_ms: 10 }, mockWebAiRuntime(page));
  assert.equal(result.errorCode, null);
  assert.ok(clicks.some((selector) => selector.includes('model-switcher-gpt-5-5-pro')), clicks.join("\n"));
  assert.equal(clicks.some((selector) => selector.includes('model-switcher-gpt-5-5-thinking')), false, clicks.join("\n"));
});

test("chat_url is not redacted to placeholder literal", () => {
  const id = "6a04a213-5648-83e8-b9d0-6134aef56831";
  const url = `https://chatgpt.com/c/${id}`;
  const redacted: any = redactValue({ chat_url: url, trace: url }, { mode: "default" });
  assert.equal(redacted.chat_url, url);
  assert.equal(redacted.trace, "https://chatgpt.com/c/<conversation-id>");
});

test("send-prompt wait_ms and completion_detected round-trip through schema and contract", () => {
  const manifest = contract();
  const inputSchema: any = webAiSendPromptInput.toJsonSchema();
  assert.ok(inputSchema.properties.response_timeout_ms, "response_timeout_ms input schema missing");
  assert.ok(inputSchema.properties.reuse_conversation, "reuse_conversation input schema missing");
  assert.ok(webAiSendPromptOutputShape.wait_ms, "wait_ms output shape missing");
  assert.ok(webAiSendPromptOutputShape.completion_detected, "completion_detected output shape missing");
  for (const cli of ["webai:chatgpt:send-prompt", "webai:claude:send-prompt", "webai:gemini:send-prompt"]) {
    const row = manifest.commands.find((command: any) => command.cli_name === cli);
    assert.ok(row.output_keys.always_present.includes("wait_ms"), `${cli} wait_ms missing`);
    assert.ok(row.output_keys.always_present.includes("completion_detected"), `${cli} completion_detected missing`);
  }
  const chatgpt = manifest.commands.find((command: any) => command.cli_name === "webai:chatgpt:send-prompt");
  assert.ok(chatgpt.output_keys.always_present.includes("reuse_conversation"), "chatgpt reuse_conversation missing");
});

test("webai:chatgpt:send-prompt navigates away from stale conversation unless reuse-conversation", async () => {
  const stale = "https://chatgpt.com/c/6a04a213-5648-83e8-b9d0-6134aef56831";
  const freshPage = mockSendPromptPage(stale);
  const result: any = await webAiChatgptSendPrompt({ backend: "managed-cdp", profile: "chatgpt", prompt: "hi", response_timeout_ms: 10 }, mockWebAiRuntime(freshPage));
  assert.equal(freshPage.calls.goto.length, 1);
  assert.match(freshPage.calls.goto[0], /^https:\/\/chatgpt\.com\/\?model=gpt-4o/);
  assert.equal(result.completion_detected, true);
  assert.equal(typeof result.wait_ms, "number");

  const reusePage = mockSendPromptPage(stale);
  await webAiChatgptSendPrompt({ backend: "managed-cdp", profile: "chatgpt", prompt: "hi", reuse_conversation: true, response_timeout_ms: 10 }, mockWebAiRuntime(reusePage));
  assert.equal(reusePage.calls.goto.length, 0);
});

function installCompletionDom(options: { stopVisible?: boolean; sendDisabled?: boolean; assistantTexts?: string[]; renderedImage?: boolean; regenerateVisible?: boolean } = {}): void {
  const visibleBox = [{ width: 1 }];
  const stop = { offsetWidth: options.stopVisible ? 1 : 0, offsetHeight: 0, getClientRects: () => options.stopVisible ? visibleBox : [] };
  const send = { offsetWidth: 1, offsetHeight: 0, disabled: Boolean(options.sendDisabled), getClientRects: () => visibleBox, getAttribute: (name: string) => name === "aria-disabled" ? String(Boolean(options.sendDisabled)) : null };
  const regenerate = { offsetWidth: options.regenerateVisible ? 1 : 0, offsetHeight: 0, getClientRects: () => options.regenerateVisible ? visibleBox : [], getAttribute: (name: string) => name === "aria-label" ? "Redo" : null };
  const assistants = (options.assistantTexts || []).map((text) => ({ offsetWidth: 1, offsetHeight: 0, getClientRects: () => visibleBox, textContent: text }));
  const main = { textContent: (options.assistantTexts || []).join("\n") };
  const image = { naturalWidth: options.renderedImage ? 64 : 0, naturalHeight: options.renderedImage ? 64 : 0 };
  (globalThis as any).window = (globalThis as any).window || {};
  (globalThis as any).document = {
    querySelectorAll: (selector: string) => {
      if (selector.includes("Stop response") || selector.includes("stop-button") || selector.includes("Stop")) return options.stopVisible ? [stop] : [];
      if (selector.includes("Send message")) return [send];
      if (selector.includes("Good response")) return options.regenerateVisible ? [regenerate] : [];
      if (selector.includes("role=\"article\"") || selector.includes("article") || selector.includes("turn") || selector.includes("response") || selector.includes("assistant")) return assistants;
      if (selector.includes("AI generated") || selector.includes("img")) return [image];
      return [];
    },
    querySelector: (selector: string) => selector === "main" ? main : selector.includes("Send message") ? send : null
  };
}

function cleanupCompletionDom(): void {
  delete (globalThis as any).document;
  delete (globalThis as any).window;
}

test("waitForPromptCompletion phase A times out when generation never starts", async () => {
  const page = mockSendPromptPage("https://gemini.google.com/app?hl=en");
  let waitCalls = 0;
  page.waitForFunction = async (_fn: any, _arg: any, options: any) => {
    waitCalls++;
    assert.equal(options.timeout, 25);
    throw new Error("phase a timeout");
  };
  page.locator = (selector: string) => {
    const loc: any = {
      first: () => loc,
      last: () => loc,
      count: async () => selector.includes("Send message") ? 1 : 0,
      waitFor: async () => undefined,
      fill: async () => undefined,
      click: async () => undefined,
      textContent: async () => selector === "main" ? "should not be read" : "Fast"
    };
    return loc;
  };
  const result: any = await webAiGeminiSendPrompt({ backend: "managed-cdp", profile: "gemini-9225", prompt: "hello", response_timeout_ms: 25 }, mockWebAiRuntime(page));
  assert.equal(waitCalls, 1, "Phase B must not run when generation never starts");
  assert.equal(result.completion_detected, false);
  assert.equal(result.errorCode, "COMMAND_TIMEOUT");
  assert.equal(result.response_text, "");
});

test("waitForPromptCompletion returns true only after Phase A start then Phase B completion and stable content", async () => {
  const phases: string[] = [];
  const page = mockSendPromptPage("https://gemini.google.com/app?hl=en");
  page.waitForFunction = async (fn: any, arg: any) => {
    try {
      if (arg.assistantCountBefore !== undefined) {
        phases.push("phase-a");
        installCompletionDom({ stopVisible: false, sendDisabled: false, assistantTexts: [] });
        assert.equal(fn(arg), false);
        installCompletionDom({ stopVisible: true, sendDisabled: true, assistantTexts: [] });
        assert.equal(fn(arg), true);
        assert.match(arg.turnSelector, /article|turn|response/);
        assert.equal(arg.assistantSelector, undefined);
        return;
      }
      phases.push("phase-b");
      installCompletionDom({ stopVisible: false, sendDisabled: false, assistantTexts: ["final answer"], regenerateVisible: true });
      assert.equal(fn(arg), false);
      assert.match(arg.regenerateSelector, /Good response/);
      (globalThis as any).window.__webAiCompletionStable.since -= 1600;
      assert.equal(fn(arg), true);
    } finally {
      cleanupCompletionDom();
    }
  };
  // Gemini responseText() reads the latest <model-response> via page.evaluate
  // (scoped clean answer), NOT locator("main") (chrome-polluted).
  page.evaluate = async () => "final answer";
  page.locator = (selector: string) => {
    const loc: any = {
      first: () => loc,
      last: () => loc,
      count: async () => selector.includes("Send message") ? 1 : 0,
      waitFor: async () => undefined,
      fill: async () => undefined,
      click: async () => undefined,
      textContent: async () => selector === "main" ? "MAIN should not be the response source" : "Fast"
    };
    return loc;
  };
  const result: any = await webAiGeminiSendPrompt({ backend: "managed-cdp", profile: "gemini-9225", prompt: "hello", response_timeout_ms: 100 }, mockWebAiRuntime(page));
  assert.deepEqual(phases, ["phase-a", "phase-b"]);
  assert.equal(result.completion_detected, true);
  assert.equal(result.response_text, "final answer");
});

test("gemini send.prompt completion polling uses extractor-visible Stop response/Send message/regenerate selectors", async () => {
  const seen: string[] = [];
  const page = mockSendPromptPage("https://gemini.google.com/app?hl=en");
  page.waitForFunction = async (_fn: any, arg: any) => { seen.push(JSON.stringify(arg)); };
  // The whole <main> is polluted with nav chrome + cross-conversation titles.
  // response_text MUST NOT be sourced from it (CLAUDE.md anti-pattern).
  const POLLUTED_MAIN = "Gemini New chat My stuff Notebooks Gems Chats Other Convo Title You said q Gemini said the clean answer is 42.";
  page.evaluate = async () => "the clean answer is 42.";
  page.locator = (selector: string) => {
    seen.push(selector);
    const loc: any = {
      first: () => loc,
      last: () => loc,
      count: async () => selector.includes("Send message") ? 1 : 0,
      waitFor: async () => undefined,
      fill: async () => undefined,
      click: async () => undefined,
      textContent: async () => selector === "main" ? POLLUTED_MAIN : "Fast"
    };
    return loc;
  };
  const result: any = await webAiGeminiSendPrompt({ backend: "managed-cdp", profile: "gemini-9225", prompt: "hello", response_timeout_ms: 10 }, mockWebAiRuntime(page));
  assert.equal(result.completion_detected, true);
  // Scoped to the latest model-response answer body — NOT the chrome-polluted <main>.
  assert.equal(result.response_text, "the clean answer is 42.");
  assert.equal(result.response_text.includes("New chat"), false);
  assert.equal(result.response_text.includes("My stuff"), false);
  assert.equal(result.response_text.includes("Other Convo Title"), false);
  assert.notEqual(result.response_text, POLLUTED_MAIN);
  assert.match(seen.join("\n"), /button\[aria-label="Stop response"\]/);
  assert.match(seen.join("\n"), /button\[aria-label="Send message"\]/);
  assert.match(seen.join("\n"), /Good response/);
  assert.match(seen.join("\n"), /assistantCountBefore/);
});

test("gemini responseText scopes to latest model-response, not the chrome-polluted main", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "src/mcp/tools.ts"), "utf-8");
  const fn = source.slice(source.indexOf("async function responseText("), source.indexOf("async function composerText("));
  // Gemini branch must use page.evaluate scoped to model-response, never
  // locator("main")/assistantMessageSelector for the returned text.
  assert.match(fn, /service === "gemini"/);
  assert.match(fn, /GEMINI_LATEST_RESPONSE_SELECTOR/);
  assert.match(fn, /GEMINI_RESPONSE_TEXT_INNER_SELECTORS/);
  assert.match(fn, /page\.evaluate/);
  const geminiBranch = fn.slice(0, fn.indexOf("return await page.locator"));
  assert.equal(/assistantMessageSelector\(service\)/.test(geminiBranch), false);
  // The model-response inner targets are the live-observed clean answer nodes.
  const constLine = source.match(/const GEMINI_RESPONSE_TEXT_INNER_SELECTORS = .*;/)?.[0] || "";
  assert.match(constLine, /model-response-text/);
  assert.match(constLine, /message-content/);
  assert.match(constLine, /markdown/);
});

test("gemini upload-and-query intercepts filechooser before clicking upload-files item", async () => {
  const dir = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "gemini-upload-"));
  const file = path.join(dir, "fixture.csv");
  fs.writeFileSync(file, "a,b\n1,2\n");
  const calls: string[] = [];
  const setFilesCalls: string[][] = [];
  const chooser = { setFiles: async (files: string[]) => { calls.push("chooser.setFiles"); setFilesCalls.push(files); } };
  const page = mockSendPromptPage("https://gemini.google.com/app?hl=en");
  page.setInputFiles = async (selector: string) => { calls.push(`setInputFiles:${selector}`); };
  page.waitForEvent = async (event: string, options: any) => { calls.push(`waitForEvent:${event}:${options?.timeout}`); return chooser; };
  page.waitForSelector = async (selector: string) => { calls.push(`waitForSelector:${selector}`); };
  page.waitForFunction = async (_fn: any, _arg: any, options: any) => { calls.push(`waitForFunction:${options?.timeout}`); };
  page.locator = (selector: string) => {
    const loc: any = {
      first: () => loc,
      last: () => loc,
      locator: () => loc,
      hover: async () => undefined,
      count: async () => selector.includes("Upload & tools") || selector.includes("Upload files") || selector.includes("local-images-files-uploader-button") || selector.includes("Send message") ? 1 : 0,
      waitFor: async () => { calls.push(`waitFor:${selector}`); },
      fill: async () => { calls.push(`fill:${selector}`); },
      click: async () => { calls.push(`click:${selector}`); },
      textContent: async () => "uploaded response"
    };
    return loc;
  };
  const result: any = await webAiGeminiUploadAndQuery({ backend: "managed-cdp", profile: "gemini-9225", files: [file], prompt: "read it", response_timeout_ms: 10 }, mockWebAiRuntime(page));
  assert.equal(result.errorCode, null);
  assert.deepEqual(setFilesCalls, [[path.resolve(file)]]);
  assert.equal(calls.some((c) => c === 'waitForSelector:input[type="file"]'), false, calls.join("\n"));
  assert.equal(calls.some((c) => c === 'setInputFiles:input[type="file"]'), false, calls.join("\n"));
  const menuWaitIndex = calls.findIndex((c) => c.includes('[role="menuitem"][aria-label^="Upload files"]') && c.startsWith('waitForSelector:'));
  const chooserWaitIndex = calls.findIndex((c) => c === "waitForEvent:filechooser:15000");
  const menuClickIndex = calls.findIndex((c) => c.startsWith('click:[role="menuitem"][aria-label^="Upload files"]'));
  const setFilesIndex = calls.findIndex((c) => c === "chooser.setFiles");
  assert.ok(menuWaitIndex >= 0, calls.join("\n"));
  assert.ok(chooserWaitIndex > menuWaitIndex, calls.join("\n"));
  assert.ok(menuClickIndex > chooserWaitIndex, calls.join("\n"));
  assert.ok(setFilesIndex > menuClickIndex, calls.join("\n"));
  assert.ok(menuClickIndex > menuWaitIndex, calls.join("\n"));
  assert.ok(calls.find((c) => c === "waitForFunction:15000"), calls.join("\n"));
  assert.ok(calls.findIndex((c) => c === "waitForFunction:15000") < calls.findIndex((c) => c === 'click:button[aria-label="Send message"]'), calls.join("\n"));
  fs.rmSync(dir, { recursive: true, force: true });
});

test("gemini upload-and-query completion gate recognizes post-upload response container", async () => {
  const dir = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "gemini-upload-complete-"));
  const file = path.join(dir, "fixture.csv");
  fs.writeFileSync(file, "a,b\n1,2\n");
  const phases: string[] = [];
  const chooser = { setFiles: async () => undefined };
  const page = mockSendPromptPage("https://gemini.google.com/app?hl=en");
  page.waitForEvent = async () => chooser;
  page.waitForSelector = async () => undefined;
  page.waitForTimeout = async () => undefined;
  page.waitForFunction = async (fn: any, arg: any, options: any) => {
    if (options?.timeout === 15000) {
      phases.push("upload-ready");
      return;
    }
    try {
      if (arg.assistantCountBefore !== undefined) {
        phases.push("phase-a");
        installCompletionDom({ stopVisible: false, sendDisabled: false, assistantTexts: ["uploaded answer"] });
        assert.equal(fn(arg), true);
        assert.match(arg.turnSelector, /article|turn|response/);
        assert.equal(arg.assistantSelector, undefined);
        return;
      }
      phases.push("phase-b");
      installCompletionDom({ stopVisible: false, sendDisabled: false, assistantTexts: ["uploaded answer"], regenerateVisible: true });
      assert.equal(fn(arg), false);
      assert.match(arg.regenerateSelector, /Good response/);
      (globalThis as any).window.__webAiCompletionStable.since -= 1600;
      assert.equal(fn(arg), true);
    } finally {
      cleanupCompletionDom();
    }
  };
  // responseText() reads the scoped latest <model-response> via page.evaluate,
  // not locator("main") (which is chrome-polluted on real Gemini).
  page.evaluate = async () => "uploaded answer";
  page.locator = (selector: string) => {
    const loc: any = {
      first: () => loc,
      last: () => loc,
      locator: () => loc,
      hover: async () => undefined,
      count: async () => selector.includes("Upload & tools") || selector.includes("Upload files") || selector.includes("local-images-files-uploader-button") || selector.includes("Remove file") || selector.includes("Send message") || selector.includes("rich-textarea") ? 1 : 0,
      waitFor: async () => undefined,
      fill: async () => undefined,
      click: async () => undefined,
      inputValue: async () => "",
      textContent: async () => selector === "main" ? "MAIN should not be the response source" : "Fast"
    };
    return loc;
  };
  const result: any = await webAiGeminiUploadAndQuery({ backend: "managed-cdp", profile: "gemini-upload-complete", files: [file], prompt: "read it", response_timeout_ms: 100 }, mockWebAiRuntime(page));
  assert.equal(result.errorCode, null);
  assert.equal(result.completion_detected, true);
  assert.equal(result.response_text, "uploaded answer");
  assert.deepEqual(phases, ["upload-ready", "phase-a", "phase-b"]);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("gemini upload-and-query returns COMMAND_TIMEOUT when post-upload response never renders", async () => {
  const dir = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "gemini-upload-no-response-"));
  const file = path.join(dir, "fixture.csv");
  fs.writeFileSync(file, "a,b\n1,2\n");
  const chooser = { setFiles: async () => undefined };
  const page = mockSendPromptPage("https://gemini.google.com/app?hl=en");
  page.waitForEvent = async () => chooser;
  page.waitForSelector = async () => undefined;
  page.waitForFunction = async (_fn: any, _arg: any, options: any) => {
    if (options?.timeout === 15000) return;
    throw new Error("post-upload response never rendered");
  };
  page.locator = (selector: string) => {
    const loc: any = {
      first: () => loc,
      last: () => loc,
      locator: () => loc,
      hover: async () => undefined,
      count: async () => selector.includes("Upload & tools") || selector.includes("Upload files") || selector.includes("local-images-files-uploader-button") || selector.includes("Remove file") || selector.includes("Send message") || selector.includes("rich-textarea") ? 1 : 0,
      waitFor: async () => undefined,
      fill: async () => undefined,
      click: async () => undefined,
      inputValue: async () => "",
      textContent: async () => ""
    };
    return loc;
  };
  const result: any = await webAiGeminiUploadAndQuery({ backend: "managed-cdp", profile: "gemini-upload-no-response", files: [file], prompt: "read it", response_timeout_ms: 10 }, mockWebAiRuntime(page));
  assert.equal(result.errorCode, "COMMAND_TIMEOUT");
  assert.equal(result.error_code, "COMMAND_TIMEOUT");
  assert.equal(result.completion_detected, false);
  assert.equal(result.response_text, "");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("gemini completion returns COMMAND_TIMEOUT when Phase-B regenerate anchor never appears", async () => {
  const seen: any[] = [];
  const page = mockSendPromptPage("https://gemini.google.com/app?hl=en");
  page.waitForFunction = async (fn: any, arg: any) => {
    seen.push(arg);
    if (arg.assistantCountBefore !== undefined) {
      installCompletionDom({ stopVisible: true, sendDisabled: true, assistantTexts: [] });
      assert.equal(fn(arg), true);
      cleanupCompletionDom();
      return;
    }
    installCompletionDom({ stopVisible: false, sendDisabled: false, assistantTexts: ["done"], regenerateVisible: false });
    assert.equal(fn(arg), false);
    cleanupCompletionDom();
    throw new Error("regenerate never appeared");
  };
  page.locator = (selector: string) => {
    const loc: any = {
      first: () => loc,
      last: () => loc,
      count: async () => selector.includes("Send message") ? 1 : 0,
      waitFor: async () => undefined,
      fill: async () => undefined,
      click: async () => undefined,
      textContent: async () => selector === "main" ? "done" : "Fast"
    };
    return loc;
  };
  const result: any = await webAiGeminiSendPrompt({ backend: "managed-cdp", profile: "gemini-regenerate-timeout", prompt: "hello", response_timeout_ms: 100 }, mockWebAiRuntime(page));
  assert.equal(result.errorCode, "COMMAND_TIMEOUT");
  assert.equal(result.completion_detected, false);
  assert.match(JSON.stringify(seen), /Good response/);
});

test("tools.ts Gemini completion path does not rely on stale Angular response selectors", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "src/mcp/tools.ts"), "utf-8");
  const nonGeminiBranchStart = source.indexOf('  try {\n    // Phase A / generation-started gate');
  const geminiBranch = source.slice(source.indexOf('if (service === \"gemini\")'), nonGeminiBranchStart);
  assert.match(geminiBranch, /GEMINI_REGENERATE_BUTTON_SELECTOR/);
  assert.equal(/model-response|message-content|data-response-id/.test(geminiBranch), false);
  assert.equal(/model-response|message-content|data-response-id/.test(source.match(/const GEMINI_RESPONSE_SELECTOR = .*;/)?.[0] || ""), false);
});

test("gemini upload-and-query returns COMMAND_TIMEOUT when filechooser never opens", async () => {
  const dir = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "gemini-upload-timeout-"));
  const file = path.join(dir, "fixture.csv");
  fs.writeFileSync(file, "a,b\n1,2\n");
  const page = mockSendPromptPage("https://gemini.google.com/app?hl=en");
  page.waitForEvent = async (event: string) => {
    assert.equal(event, "filechooser");
    throw new Error("Timed out waiting for filechooser");
  };
  page.waitForSelector = async () => undefined;
  page.setInputFiles = async () => { throw new Error("stale setInputFiles path should not run"); };
  page.locator = (selector: string) => {
    const loc: any = {
      first: () => loc,
      last: () => loc,
      locator: () => loc,
      hover: async () => undefined,
      count: async () => selector.includes("Upload & tools") || selector.includes("Upload files") || selector.includes("local-images-files-uploader-button") ? 1 : 0,
      waitFor: async () => undefined,
      fill: async () => undefined,
      click: async () => undefined,
      textContent: async () => "uploaded response"
    };
    return loc;
  };
  const result: any = await webAiGeminiUploadAndQuery({ backend: "managed-cdp", profile: "gemini-upload-timeout", files: [file], prompt: "read it", response_timeout_ms: 10 }, mockWebAiRuntime(page));
  assert.equal(result.ok, false);
  assert.equal(result.errorCode, "COMMAND_TIMEOUT");
  assert.equal(result.error_code, "COMMAND_TIMEOUT");
  assert.equal(result.selector, '[role="menuitem"][aria-label^="Upload files"]');
  fs.rmSync(dir, { recursive: true, force: true });
});

test("gemini upload-and-query returns ELEMENT_NOT_FOUND when upload-files item is absent", async () => {
  const dir = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "gemini-upload-missing-"));
  const file = path.join(dir, "fixture.csv");
  fs.writeFileSync(file, "a,b\n1,2\n");
  let waitForEventTouched = false;
  const page = mockSendPromptPage("https://gemini.google.com/app?hl=en");
  page.waitForEvent = async () => { waitForEventTouched = true; };
  page.waitForSelector = async (selector: string) => {
    // Post-revamp: impl waits for the Upload files menuitem after opening Upload & tools.
    // The "upload-files item is absent" condition is simulated by throwing on that selector.
    if (selector.includes('[role="menuitem"][aria-label^="Upload files"]')) throw new Error("not visible");
  };
  page.setInputFiles = async () => { throw new Error("stale setInputFiles path should not run"); };
  page.locator = (selector: string) => {
    const loc: any = {
      first: () => loc,
      last: () => loc,
      count: async () => selector.includes("Upload & tools") ? 1 : 0,
      waitFor: async () => undefined,
      fill: async () => undefined,
      click: async () => undefined,
      textContent: async () => "uploaded response"
    };
    return loc;
  };
  const result: any = await webAiGeminiUploadAndQuery({ backend: "managed-cdp", profile: "gemini-upload-missing", files: [file], prompt: "read it", response_timeout_ms: 10 }, mockWebAiRuntime(page));
  assert.equal(result.ok, false);
  assert.equal(result.errorCode, "ELEMENT_NOT_FOUND");
  assert.equal(result.error_code, "ELEMENT_NOT_FOUND");
  assert.match(result.selector, /\[role="menuitem"\]\[aria-label\^="Upload files"\]/);
  assert.equal(waitForEventTouched, false);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("gemini generate-image forces fresh composer navigation before activating image mode", async () => {
  const page = mockSendPromptPage("https://gemini.google.com/app/stale123?hl=en");
  const clicks: string[] = [];
  const waits: string[] = [];
  page.waitForSelector = async (selector: string, options: any) => { waits.push(`${selector}:${options?.state}:${options?.timeout}`); };
  page.locator = (selector: string) => {
    const loc: any = {
      first: () => loc,
      last: () => loc,
      count: async () => selector.includes("New chat") || selector.includes("Create image") || selector.includes("Send message") || selector.includes("rich-textarea") ? 1 : 0,
      getAttribute: async (name: string) => name === "aria-label" && selector.includes("Create image") ? "Deselect Images" : "",
      waitFor: async () => undefined,
      fill: async () => undefined,
      click: async () => { clicks.push(selector); if (selector.includes("New chat")) page._url = "https://gemini.google.com/app?hl=en"; },
      textContent: async () => "image response"
    };
    return loc;
  };
  const runtime = { ...mockWebAiRuntime(page), artifactClick: async () => ({ path: path.join(process.cwd(), "out.png"), sha256: "abc", size: 123, downloadFilename: "out.png", downloadGuid: "g", bbox: { x: 0, y: 0, width: 1, height: 1 }, elapsedMs: 1 }) } as any;
  const result: any = await webAiGeminiGenerateImage({ backend: "managed-cdp", profile: "gemini-9225", prompt: "make image", download_dir: process.cwd(), response_timeout_ms: 10 }, runtime);
  assert.equal(result.download_filename, "out.png");
  assert.deepEqual(page.calls.goto, ["https://gemini.google.com/app?hl=en"]);
  assert.ok(waits.some((entry) => entry === 'button[aria-label*="Create image"]:visible:4000'), waits.join("\n"));
  assert.equal(clicks.some((selector) => selector.includes("New chat")), false, clicks.join("\n"));
});

test("gemini generate-image returns ELEMENT_NOT_FOUND when Create image button wait expires", async () => {
  const page = mockSendPromptPage("https://gemini.google.com/app/stale-image?hl=en");
  page.waitForSelector = async (selector: string, options: any) => {
    if (selector === 'button[aria-label*="Create image"]') {
      assert.deepEqual(options, { state: "visible", timeout: 4000 });
      throw new Error("create image button did not render");
    }
  };
  page.locator = (selector: string) => {
    const loc: any = {
      first: () => loc,
      last: () => loc,
      count: async () => selector.includes("rich-textarea") ? 1 : 0,
      waitFor: async () => undefined,
      fill: async () => undefined,
      click: async () => undefined,
      textContent: async () => ""
    };
    return loc;
  };
  const result: any = await webAiGeminiGenerateImage({ backend: "managed-cdp", profile: "gemini-image-button-missing", prompt: "make image", download_dir: process.cwd(), response_timeout_ms: 10 }, mockWebAiRuntime(page));
  assert.equal(result.errorCode, "ELEMENT_NOT_FOUND");
  assert.match(result.expected_selector, /button\[aria-label\*=\"Create image\"\].*Upload & tools.*menuitemcheckbox/);
  assert.deepEqual(page.calls.goto, ["https://gemini.google.com/app?hl=en"]);
});

const GEMINI_MODE_PICKER_TRIGGER_SELECTOR_FOR_TEST = 'button[data-test-id="bard-mode-menu-button"], button[aria-label^="Open mode picker"]';
const GEMINI_FLASH_LITE_OPTION_SELECTOR_FOR_TEST = '[role="menuitem"]:has-text("Fastest answers")';
const GEMINI_THINKING_EXPANDER_SELECTOR_FOR_TEST = '[role="menuitem"][aria-label*="Thinking level"], [role="menuitem"]:has-text("Thinking level")';
const GEMINI_THINKING_STANDARD_SELECTOR_FOR_TEST = '[role="menuitem"]:has-text("Best for most questions")';
const GEMINI_THINKING_EXTENDED_SELECTOR_FOR_TEST = '[role="menuitem"]:has-text("Complex problem solving")';
const CLAUDE_MODEL_SELECTOR_FOR_TEST = '[data-testid="model-selector-dropdown"]';
const CLAUDE_ADAPTIVE_THINKING_SELECTOR_FOR_TEST = 'input[aria-label="Adaptive thinking"]';

function mockChatgptSelectModelPage(): any {
  const page = mockSendPromptPage("https://chatgpt.com/");
  page.calls.click = [];
  page.calls.waitForSelector = [];
  page.calls.keyboard = [];
  page.waitForSelector = async (selector: string) => { page.calls.waitForSelector.push(selector); };
  page.waitForTimeout = async () => undefined;
  page.keyboard = { press: async (key: string) => { page.calls.keyboard.push(`key:${key}`); } };
  page.locator = (selector: string) => {
    const loc: any = {
      first: () => loc,
      count: async () => {
        if (selector.includes('aria-haspopup="menu"')) return 1;
        if (selector.includes("model-switcher-gpt-5-5-thinking") || selector.includes('[role="menuitemradio"]:has-text("Thinking")')) return 1;
        return 0;
      },
      click: async () => { page.calls.click.push(selector); },
      getAttribute: async (name: string) => selector.includes('aria-haspopup="menu"') && name === "aria-label" ? "Thinking" : null,
      textContent: async () => selector.includes('aria-haspopup="menu"') ? "Thinking" : ""
    };
    return loc;
  };
  return page;
}

function mockClaudeSelectModelPage(): any {
  const page = mockSendPromptPage("https://claude.ai/chat/mock");
  page.calls.click = [];
  page.calls.waitForSelector = [];
  page.waitForSelector = async (selector: string) => { page.calls.waitForSelector.push(selector); };
  page.waitForTimeout = async () => undefined;
  page.locator = (selector: string) => {
    const loc: any = {
      first: () => loc,
      count: async () => {
        if (selector === CLAUDE_MODEL_SELECTOR_FOR_TEST) return 1;
        if (selector.includes('role="menuitemradio"') && selector.includes("Claude Sonnet 4.6")) return 1;
        if (selector === CLAUDE_ADAPTIVE_THINKING_SELECTOR_FOR_TEST) return 1;
        return 0;
      },
      click: async () => { page.calls.click.push(selector); },
      isChecked: async () => false,
      getAttribute: async (name: string) => selector === CLAUDE_ADAPTIVE_THINKING_SELECTOR_FOR_TEST && name === "aria-checked" ? "false" : null,
      textContent: async () => selector === CLAUDE_MODEL_SELECTOR_FOR_TEST ? "Claude Sonnet 4.6" : ""
    };
    return loc;
  };
  return page;
}

function mockGeminiSelectModelPage(options: { missingTrigger?: boolean } = {}): any {
  const page = mockSendPromptPage("https://gemini.google.com/app?hl=en");
  page.calls.click = [];
  page.calls.waitForSelector = [];
  page.calls.keyboard = [];
  page.waitForSelector = async (selector: string) => { page.calls.waitForSelector.push(selector); };
  page.waitForTimeout = async () => undefined;
  page.waitForFunction = async () => undefined;
  page.keyboard = { press: async (key: string) => { page.calls.keyboard.push(`key:${key}`); } };
  page.locator = (selector: string) => {
    const loc: any = {
      first: () => loc,
      waitFor: async () => {
        if (options.missingTrigger && selector === GEMINI_MODE_PICKER_TRIGGER_SELECTOR_FOR_TEST) throw new Error("missing trigger");
      },
      getAttribute: async (name: string) => name === "aria-expanded" ? "false" : null,
      click: async () => { page.calls.click.push(selector); },
      count: async () => 1,
      textContent: async () => ""
    };
    return loc;
  };
  return page;
}

test("webai_gemini_select_model is registered in contract with the 6 expected args", () => {
  const manifest = contract();
  const row = manifest.commands.find((command: any) => command.mcp_name === "webai_gemini_select_model");
  assert.ok(row, "webai_gemini_select_model contract row missing");
  assert.equal(row.cli_name, "webai:gemini:select-model");
  assert.equal(row.ts_export, "webAiGeminiSelectModel");
  assert.deepEqual(row.required_args, ["profile"]);
  assert.deepEqual(row.optional_args, ["model", "thinking_level", "backend"]);
  assert.deepEqual(row.output_keys.always_present, ["ok", "selected_model", "selected_thinking_level", "errorCode"]);
  assert.deepEqual(row.output_keys.optional, []);
  assert.ok(listMcpTools().some((tool) => tool.name === "webai_gemini_select_model"));
});

test("webai_chatgpt_select_model and webai_claude_select_model are registered in contract with the expected args", () => {
  const manifest = contract();
  const cases = [
    { cli: "webai:chatgpt:select-model", mcp: "webai_chatgpt_select_model", ts: "webAiChatgptSelectModel" },
    { cli: "webai:claude:select-model", mcp: "webai_claude_select_model", ts: "webAiClaudeSelectModel" }
  ];
  for (const item of cases) {
    const row = manifest.commands.find((command: any) => command.mcp_name === item.mcp);
    assert.ok(row, `${item.mcp} contract row missing`);
    assert.equal(row.cli_name, item.cli);
    assert.equal(row.ts_export, item.ts);
    assert.deepEqual(row.required_args, ["profile"]);
    assert.deepEqual(row.optional_args, ["model", "thinking_level", "backend"]);
    assert.deepEqual(row.output_keys.always_present, ["ok", "selected_model", "selected_thinking_level", "errorCode"]);
    assert.deepEqual(row.output_keys.optional, []);
    assert.ok(listMcpTools().some((tool) => tool.name === item.mcp));
  }
});

test("webai_chatgpt_select_model and webai_claude_select_model validate args and drive existing selectors", async () => {
  for (const tool of ["webai_chatgpt_select_model", "webai_claude_select_model"]) {
    const missingChoice: any = await callMcpTool(tool, { profile: "unit-profile" }, mockWebAiRuntime(mockChatgptSelectModelPage()));
    assert.equal(missingChoice.errorCode, "INVALID_ARGS");
    const badThinking: any = await callMcpTool(tool, { profile: "unit-profile", thinking_level: "standard" }, mockWebAiRuntime(mockChatgptSelectModelPage()));
    assert.equal(badThinking.errorCode, "INVALID_ARGS");
  }

  const chatgptPage = mockChatgptSelectModelPage();
  const chatgptResult: any = await webAiChatgptSelectModel({ backend: "managed-cdp", profile: "chatgpt", thinking_level: "extended" }, mockWebAiRuntime(chatgptPage));
  assert.equal(chatgptResult.ok, true);
  assert.equal(chatgptResult.selected_model, "Thinking");
  assert.equal(chatgptResult.selected_thinking_level, "extended");
  assert.ok(chatgptPage.calls.click.some((selector: string) => selector.includes("model-switcher-gpt-5-5-thinking")));

  const claudePage = mockClaudeSelectModelPage();
  const claudeResult: any = await webAiClaudeSelectModel({ backend: "managed-cdp", profile: "claude-9224", model: "Claude Sonnet 4.6", thinking_level: "extended" }, mockWebAiRuntime(claudePage));
  assert.equal(claudeResult.ok, true);
  assert.equal(claudeResult.selected_model, "Claude Sonnet 4.6");
  assert.equal(claudeResult.selected_thinking_level, "extended");
  assert.ok(claudePage.calls.click.includes(CLAUDE_ADAPTIVE_THINKING_SELECTOR_FOR_TEST));
});

test("webai_gemini_select_model returns INVALID_ARGS when neither model nor thinking_level provided", async () => {
  const result: any = await callMcpTool("webai_gemini_select_model", { backend: "managed-cdp", profile: "gemini-9225" }, mockWebAiRuntime(mockGeminiSelectModelPage()));
  assert.equal(result.errorCode, "INVALID_ARGS");
  assert.match(result.message, /requires at least one of: model, thinking_level/);
});

test("webai_gemini_select_model returns INVALID_ARGS for unknown model value", async () => {
  const result: any = await callMcpTool("webai_gemini_select_model", { backend: "managed-cdp", profile: "gemini-9225", model: "unknown" }, mockWebAiRuntime(mockGeminiSelectModelPage()));
  assert.equal(result.errorCode, "INVALID_ARGS");
  assert.match(result.message, /unsupported model/);
});

test("webai_gemini_select_model clicks Open mode picker then the 3.1 Flash-Lite menuitem", async () => {
  const page = mockGeminiSelectModelPage();
  const result: any = await webAiGeminiSelectModel({ backend: "managed-cdp", profile: "gemini-9225", model: "3.1-flash-lite" }, mockWebAiRuntime(page));
  assert.equal(result.ok, true);
  assert.equal(result.selected_model, "3.1-flash-lite");
  assert.deepEqual(page.calls.click.slice(0, 2), [
    GEMINI_MODE_PICKER_TRIGGER_SELECTOR_FOR_TEST,
    GEMINI_FLASH_LITE_OPTION_SELECTOR_FOR_TEST
  ]);
});

test("webai_gemini_select_model returns ELEMENT_NOT_FOUND when mode picker trigger is missing", async () => {
  const result: any = await callMcpTool("webai_gemini_select_model", { backend: "managed-cdp", profile: "gemini-9225", model: "3.1-flash-lite" }, mockWebAiRuntime(mockGeminiSelectModelPage({ missingTrigger: true })));
  assert.equal(result.errorCode, "ELEMENT_NOT_FOUND");
  assert.equal(result.evidence?.selector, GEMINI_MODE_PICKER_TRIGGER_SELECTOR_FOR_TEST);
});

test("webai_gemini_select_model clicks Thinking level expander, then Extended sub-option", async () => {
  const page = mockGeminiSelectModelPage();
  const result: any = await webAiGeminiSelectModel({ backend: "managed-cdp", profile: "gemini-9225", thinking_level: "extended" }, mockWebAiRuntime(page));
  assert.equal(result.ok, true);
  assert.equal(result.selected_thinking_level, "extended");
  assert.deepEqual(page.calls.click.slice(0, 3), [
    GEMINI_MODE_PICKER_TRIGGER_SELECTOR_FOR_TEST,
    GEMINI_THINKING_EXPANDER_SELECTOR_FOR_TEST,
    GEMINI_THINKING_EXTENDED_SELECTOR_FOR_TEST
  ]);
});

test("webai_gemini_select_model handles dual-set: clicks model, picker auto-closes, re-opens, then expands Thinking level, then Standard", async () => {
  const page = mockGeminiSelectModelPage();
  const result: any = await webAiGeminiSelectModel({ backend: "managed-cdp", profile: "gemini-9225", model: "3.1-flash-lite", thinking_level: "standard" }, mockWebAiRuntime(page));
  assert.equal(result.ok, true);
  assert.equal(result.selected_model, "3.1-flash-lite");
  assert.equal(result.selected_thinking_level, "standard");
  assert.deepEqual(page.calls.click.slice(0, 5), [
    GEMINI_MODE_PICKER_TRIGGER_SELECTOR_FOR_TEST,
    GEMINI_FLASH_LITE_OPTION_SELECTOR_FOR_TEST,
    GEMINI_MODE_PICKER_TRIGGER_SELECTOR_FOR_TEST,
    GEMINI_THINKING_EXPANDER_SELECTOR_FOR_TEST,
    GEMINI_THINKING_STANDARD_SELECTOR_FOR_TEST
  ]);
});

test("upload-and-query completion fields round-trip through schema and contract", () => {
  const manifest = contract();
  const { webAiUploadAndQueryInput } = require("../src/mcp/schemas");
  const inputSchema: any = webAiUploadAndQueryInput.toJsonSchema();
  assert.ok(inputSchema.properties.response_timeout_ms, "upload_and_query response_timeout_ms input schema missing");
  for (const cli of ["webai:chatgpt:upload-and-query", "webai:claude:upload-and-query", "webai:gemini:upload-and-query"]) {
    const row = manifest.commands.find((command: any) => command.cli_name === cli);
    assert.ok(row.output_keys.always_present.includes("wait_ms"), `${cli} wait_ms missing`);
    assert.ok(row.output_keys.always_present.includes("completion_detected"), `${cli} completion_detected missing`);
  }
});

test("chatgpt upload-and-query reads response before managed page closes", async () => {
  const dir = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "chatgpt-upload-"));
  const file = path.join(dir, "fixture.csv");
  fs.writeFileSync(file, "a,b\n1,2\n");
  let closed = false;
  let responseReadWhileOpen = false;
  const page = mockSendPromptPage("https://chatgpt.com/");
  page.setInputFiles = async () => undefined;
  page.locator = (selector: string) => {
    const loc: any = {
      first: () => loc,
      last: () => loc,
      count: async () => selector.includes('aria-haspopup="menu"') || selector.includes('[role="menuitemradio"]:has-text("Thinking")') || selector.includes("assistant") || selector.includes("main") ? 1 : 0,
      waitFor: async () => undefined,
      fill: async () => undefined,
      click: async () => undefined,
      getAttribute: async (name: string) => selector.includes('aria-haspopup="menu"') && name === "aria-label" ? "Thinking" : null,
      textContent: async () => {
        if (selector.includes('aria-haspopup="menu"')) return "Thinking";
        assert.equal(closed, false, "responseText must be read before browser close");
        responseReadWhileOpen = true;
        return "real assistant answer";
      }
    };
    return loc;
  };
  const context = { pages: () => [page], newPage: async () => page };
  const browser = { contexts: () => [context], close: async () => { closed = true; } };
  const runtime = { launcher: { launch: async () => ({}), connectOverCdp: async () => browser } } as any;
  const result: any = await webAiChatgptUploadAndQuery({ backend: "managed-cdp", profile: "chatgpt-upload-open", files: [file], prompt: "read it", response_timeout_ms: 10 }, runtime);
  assert.equal(result.response_text, "real assistant answer");
  assert.equal(result.completion_detected, true);
  assert.equal(typeof result.wait_ms, "number");
  assert.equal(responseReadWhileOpen, true);
  assert.equal(closed, true);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("upload-and-query timeout returns COMMAND_TIMEOUT with empty response text", async () => {
  const dir = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "claude-upload-timeout-"));
  const file = path.join(dir, "fixture.txt");
  fs.writeFileSync(file, "hello\n");
  const page = mockSendPromptPage("https://claude.ai/new");
  page.setInputFiles = async () => undefined;
  page.waitForFunction = async () => { throw new Error("timeout"); };
  page.locator = (selector: string) => {
    const loc: any = {
      first: () => loc,
      last: () => loc,
      count: async () => 1,
      waitFor: async () => undefined,
      fill: async () => undefined,
      click: async () => undefined,
      textContent: async () => selector.includes("assistant") || selector.includes("main") ? "garbled homepage DOM" : "Claude"
    };
    return loc;
  };
  const result: any = await webAiClaudeUploadAndQuery({ backend: "managed-cdp", profile: "claude-upload-timeout", files: [file], prompt: "read it", response_timeout_ms: 1 }, mockWebAiRuntime(page));
  assert.equal(result.errorCode, "COMMAND_TIMEOUT");
  assert.equal(result.error_code, "COMMAND_TIMEOUT");
  assert.equal(result.completion_detected, false);
  assert.equal(result.response_text, "");
  fs.rmSync(dir, { recursive: true, force: true });
});

function installClaudeAttachmentDom(filename: string, stillLoading: boolean, shape: "text" | "image" = "text"): void {
  // #16 R3 (2026-05-21): Claude composer renders TWO chip shapes side by side.
  // Both wrappers carry the discrete class token 'group/thumbnail'. The
  // identifier signal differs:
  //   TEXT  — wrapper data-testid="file-thumbnail" + inner button[aria-label]
  //           LEFT-of-first-comma is the filename. Remove button is unlabeled.
  //   IMAGE — wrapper has no data-testid + inner <div data-testid="<filename>">
  //           wraps <img alt="<filename>">. Remove button aria-label =
  //           "Remove <filename>" (filename-suffixed).
  // This mock lets a single test exercise either shape.
  const loadingHint = stillLoading
    ? { getAttribute: (name: string) => name === "role" ? "progressbar" : null, tagName: "DIV" }
    : null;
  let wrapperClassName: string;
  let wrapperTestid: string | null;
  let innerTestidNodes: any[];
  let mainButton: any;
  let removeButton: any;
  if (shape === "text") {
    wrapperClassName = "group/thumbnail";
    wrapperTestid = "file-thumbnail";
    innerTestidNodes = []; // text chip has no inner testid descendants
    mainButton = { getAttribute: (n: string) => n === "aria-label" ? `${filename}, txt, 2 lines` : null };
    removeButton = { getAttribute: (n: string) => n === "aria-label" ? "Remove" : null };
  } else {
    // IMAGE shape
    wrapperClassName = "relative group/thumbnail";
    wrapperTestid = null;
    innerTestidNodes = [
      { getAttribute: (n: string) => n === "data-testid" ? filename : null }
    ];
    // image chip's main inner button has no aria-label (it wraps the <img>); only
    // the Remove button advertises the filename.
    mainButton = { getAttribute: (_n: string) => null };
    removeButton = { getAttribute: (n: string) => n === "aria-label" ? `Remove ${filename}` : null };
  }
  const wrapper: any = {
    className: wrapperClassName,
    getAttribute: (n: string) => n === "data-testid" ? wrapperTestid : null,
    querySelector: (selector: string) => {
      if (
        selector.includes('progressbar') ||
        selector.includes('oading') ||
        selector.includes('rogress') ||
        selector.includes('animate-spin') ||
        selector.includes('spin')
      ) {
        return loadingHint;
      }
      if (selector === 'button[aria-label]') return mainButton;
      return null;
    },
    querySelectorAll: (selector: string) => {
      if (selector === '[data-testid]') return innerTestidNodes;
      if (selector === 'button[aria-label]') return [mainButton, removeButton];
      return [];
    }
  };
  const root = {
    querySelectorAll: (selector: string) => selector === 'div[class*="group/thumbnail"]' ? [wrapper] : [],
    querySelector: () => null
  };
  (globalThis as any).document = {
    querySelector: (selector: string) => selector.includes("fieldset") || selector.includes("composer") || selector.includes("main") ? root : null,
    body: root
  };
}

test("claude upload wait recognizes text-chip aria-label after loading hint disappears", async () => {
  const dir = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "claude-chip-"));
  const file = path.join(dir, "deck-outline.md");
  fs.writeFileSync(file, "hello\n");
  const page = mockSendPromptPage("https://claude.ai/new");
  page.setInputFiles = async () => undefined;
  let checkedPredicate = false;
  page.waitForFunction = async (fn: any, arg: any, options: any) => {
    if (options?.timeout === 30000) {
      checkedPredicate = true;
      assert.deepEqual(arg, ["deck-outline.md"]);
      installClaudeAttachmentDom("deck-outline.md", true, "text");
      assert.equal(fn(arg), false);
      installClaudeAttachmentDom("deck-outline.md", false, "text");
      assert.equal(fn(arg), true);
      cleanupCompletionDom();
      return;
    }
  };
  page.locator = (selector: string) => {
    const loc: any = {
      first: () => loc,
      last: () => loc,
      count: async () => selector.includes("chat-input") || selector.includes("Send message") || selector.includes("Write your prompt") || selector.includes("contenteditable") ? 1 : 0,
      waitFor: async () => undefined,
      fill: async () => undefined,
      click: async () => undefined,
      textContent: async () => selector.includes("main") || selector.includes("assistant") ? "uploaded answer" : "Claude"
    };
    return loc;
  };
  const result: any = await webAiClaudeUploadAndQuery({ backend: "managed-cdp", profile: "claude-chip", files: [file], prompt: "read it", response_timeout_ms: 10 }, mockWebAiRuntime(page));
  assert.equal(result.errorCode, null);
  assert.equal(checkedPredicate, true);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("claude upload wait recognizes image-chip via inner data-testid (issue #16 R3 cycle#26 PNG regression)", async () => {
  // #16 R3 (2026-05-21): cycle#26 R2 verdict on d676f60 regressed image uploads
  // because the R2 detector hard-coded the text-chip shape (wrapper carries
  // data-testid="file-thumbnail" + inner button[aria-label] LEFT-of-comma). The
  // image chip is rendered with a different shape — wrapper has no testid, the
  // filename is on an inner <div data-testid="<filename>"> wrapping <img>, and
  // the Remove button carries aria-label="Remove <filename>". This test pins
  // the R3 dual-shape detector against the image shape.
  const dir = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "claude-image-chip-"));
  const file = path.join(dir, "req_3_poster.png");
  fs.writeFileSync(file, "fake-png\n");
  const page = mockSendPromptPage("https://claude.ai/new");
  page.setInputFiles = async () => undefined;
  let checkedPredicate = false;
  page.waitForFunction = async (fn: any, arg: any, options: any) => {
    if (options?.timeout === 30000) {
      checkedPredicate = true;
      assert.deepEqual(arg, ["req_3_poster.png"]);
      installClaudeAttachmentDom("req_3_poster.png", true, "image");
      assert.equal(fn(arg), false);
      installClaudeAttachmentDom("req_3_poster.png", false, "image");
      assert.equal(fn(arg), true);
      cleanupCompletionDom();
      return;
    }
  };
  page.locator = (selector: string) => {
    const loc: any = {
      first: () => loc,
      last: () => loc,
      count: async () => selector.includes("chat-input") || selector.includes("Send message") || selector.includes("Write your prompt") || selector.includes("contenteditable") ? 1 : 0,
      waitFor: async () => undefined,
      fill: async () => undefined,
      click: async () => undefined,
      textContent: async () => selector.includes("main") || selector.includes("assistant") ? "image uploaded" : "Claude"
    };
    return loc;
  };
  const result: any = await webAiClaudeUploadAndQuery({ backend: "managed-cdp", profile: "claude-image-chip", files: [file], prompt: "describe it", response_timeout_ms: 10 }, mockWebAiRuntime(page));
  assert.equal(result.errorCode, null);
  assert.equal(checkedPredicate, true);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("generate-file passes captured conversation URL to artifactClickRunner", async () => {
  const calls: any[] = [];
  const page = mockSendPromptPage("https://claude.ai/chat/conversation-123");
  const runtime = {
    ...mockWebAiRuntime(page),
    artifactClick: async (options: any) => {
      calls.push(options);
      return { path: path.join(process.cwd(), "artifact.md"), sha256: "abc", size: 12, downloadFilename: "artifact.md", downloadGuid: "g", bbox: { x: 0, y: 0, width: 1, height: 1 }, elapsedMs: 1 };
    }
  } as any;
  const result: any = await webAiClaudeGenerateFile({ backend: "managed-cdp", profile: "claude-generate-file", prompt: "make md", expected_extension: "md", download_dir: process.cwd(), response_timeout_ms: 10 }, runtime);
  assert.equal(result.artifact_name, "artifact.md");
  assert.equal(calls[0].tabUrlContains, "https://claude.ai/chat/conversation-123");
  assert.notEqual(calls[0].tabUrlContains, "https://claude.ai");
});

test("chatgpt generate-file widens artifactClick locate budget for the file-card render race (issue #16 R2)", async () => {
  const calls: any[] = [];
  const page = mockSendPromptPage("https://chatgpt.com/c/conversation-pptx");
  const runtime = {
    ...mockWebAiRuntime(page),
    artifactClick: async (options: any) => {
      calls.push(options);
      return { path: path.join(process.cwd(), "deck.pptx"), sha256: "abc", size: 4096, downloadFilename: "deck.pptx", downloadGuid: "g", bbox: { x: 0, y: 0, width: 1, height: 1 }, elapsedMs: 1 };
    }
  } as any;
  await webAiChatgptGenerateFile({ backend: "managed-cdp", profile: "chatgpt-generate-file-r2", prompt: "make pptx", expected_extension: "pptx", download_dir: process.cwd(), response_timeout_ms: 10 }, runtime);
  // The file card streams in AFTER the text-response completion signal; without
  // a widened locate budget the artifactClick races the file-card render and
  // returns ELEMENT_NOT_FOUND. Live smoke 2026-05-21 on chatgpt-9223 observed
  // 3m 20s of "Thought for ..." before the file card emitted, and consumer
  // cycle#26 (smoke 09) confirmed the file-card can stream in 6-9 min into the
  // run on Thinking-class paths. Pin the 360s locate budget and the 480s
  // overall ceiling so artifactClick's locate phase can wait through the
  // longest observed file-card render windows without leaking ELEMENT_NOT_FOUND.
  assert.equal(calls.length, 1);
  assert.equal(calls[0].locateTimeoutMs, 360000);
  assert.equal(calls[0].timeoutMs, 480000);
  // The ChatGPT file-card download chip needs the JS-click fallback because
  // its onClick is on the inner SVG via React synthetic events and is NOT
  // reached by Input.dispatchMouseEvent alone (verified live 2026-05-21:
  // probe-pptx-rawclick.mjs sees 0 download events, probe-pptx-js-click.mjs
  // sees 1). The chip's onClick is idempotent so the dual-fire is safe.
  assert.equal(calls[0].useJsClickFallback, true);
});

test("claude generate-file does NOT widen the locate budget — its file card is bundled with the response (issue #16 R2 scope)", async () => {
  const calls: any[] = [];
  const page = mockSendPromptPage("https://claude.ai/chat/conversation-claude");
  const runtime = {
    ...mockWebAiRuntime(page),
    artifactClick: async (options: any) => {
      calls.push(options);
      return { path: path.join(process.cwd(), "doc.md"), sha256: "abc", size: 12, downloadFilename: "doc.md", downloadGuid: "g", bbox: { x: 0, y: 0, width: 1, height: 1 }, elapsedMs: 1 };
    }
  } as any;
  await webAiClaudeGenerateFile({ backend: "managed-cdp", profile: "claude-generate-file-r2", prompt: "make md", expected_extension: "md", download_dir: process.cwd(), response_timeout_ms: 10 }, runtime);
  assert.equal(calls.length, 1);
  // No locateTimeoutMs or useJsClickFallback override for claude — keeps the
  // R2 selector-locate fix surgically scoped to chatgpt (the React-synthetic
  // event hit-test gap is chatgpt-specific; claude's file-card download
  // button is reached by Input.dispatchMouseEvent alone).
  assert.equal(calls[0].locateTimeoutMs, undefined);
  assert.equal(calls[0].useJsClickFallback, undefined);
});

test("gemini generate-image uses Download full size image then Download full size image chain", async () => {
  const page = mockSendPromptPage("https://gemini.google.com/app/stale456?hl=en");
  page.waitForSelector = async () => undefined;
  page.locator = (selector: string) => {
    const loc: any = {
      first: () => loc,
      last: () => loc,
      count: async () => selector.includes("New chat") || selector.includes("Create image") || selector.includes("Send message") || selector.includes("rich-textarea") ? 1 : 0,
      getAttribute: async (name: string) => name === "aria-label" && selector.includes("Create image") ? "Deselect Images" : "",
      waitFor: async () => undefined,
      fill: async () => undefined,
      click: async () => { if (selector.includes("New chat")) page._url = "https://gemini.google.com/app/conversation-456?hl=en"; },
      textContent: async () => selector === "main" ? "image response" : "Fast"
    };
    return loc;
  };
  const calls: any[] = [];
  const runtime = { ...mockWebAiRuntime(page), artifactClick: async (options: any) => { calls.push(options); return { path: path.join(process.cwd(), "out.png"), sha256: "abc", size: 123, downloadFilename: "out.png", downloadGuid: "g", bbox: { x: 0, y: 0, width: 1, height: 1 }, elapsedMs: 1 }; } } as any;
  const result: any = await webAiGeminiGenerateImage({ backend: "managed-cdp", profile: "gemini-image-chain", prompt: "make image", download_dir: process.cwd(), response_timeout_ms: 10 }, runtime);
  assert.equal(result.download_filename, "out.png");
  assert.equal(calls[0].buttonSelector, 'button[aria-label="Download full size image"]');
  assert.equal(calls[0].followUpSelector, 'button[aria-label="Download full size image"]');
});

test("activateGeminiVideoMode opens tools with force and waits for Videos pill", async () => {
  const calls: string[] = [];
  const page: any = {
    waitForSelector: async (selector: string, options: any) => {
      calls.push(`wait:${selector}:${options?.state}:${options?.timeout}`);
    },
    locator: (selector: string) => {
      const loc: any = {
        first: () => loc,
        count: async () => 1,
        click: async (options?: any) => calls.push(`click:${selector}:${JSON.stringify(options || {})}`)
      };
      return loc;
    }
  };
  await activateGeminiVideoMode(page);
  assert.ok(calls.includes('click:button[aria-label="Upload & tools"]:{"force":true}'), calls.join("\n"));
  assert.ok(calls.includes('click:[role="menuitemcheckbox"]:has-text("Create video"), [role="menuitem"]:has-text("Create video"):{}'), calls.join("\n"));
  assert.ok(calls.some((call) => call.startsWith('wait:button[aria-label="Deselect Videos"]:visible:')), calls.join("\n"));
});


test("generateImageOnPage waits for image toolbar before artifact-click", async () => {
  const events: string[] = [];
  const page = mockSendPromptPage("https://gemini.google.com/app/stale789?hl=en");
  page.waitForSelector = async (selector: string) => {
    if (selector.includes("Download full size image")) events.push("render-toolbar");
  };
  page.locator = (selector: string) => {
    const loc: any = {
      first: () => loc,
      last: () => loc,
      count: async () => selector.includes("New chat") || selector.includes("Create image") || selector.includes("Send message") || selector.includes("rich-textarea") ? 1 : 0,
      getAttribute: async (name: string) => name === "aria-label" && selector.includes("Create image") ? "Deselect Images" : "",
      waitFor: async () => undefined,
      fill: async () => undefined,
      click: async () => { if (selector.includes("New chat")) page._url = "https://gemini.google.com/app/conversation-789?hl=en"; },
      textContent: async () => selector === "main" ? "image ready" : "Fast"
    };
    return loc;
  };
  const runtime = { ...mockWebAiRuntime(page), artifactClick: async () => { events.push("artifact-click"); return { path: path.join(process.cwd(), "out.png"), sha256: "abc", size: 123, downloadFilename: "out.png" }; } } as any;
  const result: any = await webAiGeminiGenerateImage({ backend: "managed-cdp", profile: "gemini-image-render-order", prompt: "make image", download_dir: process.cwd(), response_timeout_ms: 10 }, runtime);
  assert.equal(result.download_filename, "out.png");
  assert.deepEqual(events, ["render-toolbar", "artifact-click"]);
});

test("generateImageOnPage returns COMMAND_TIMEOUT when generated image never renders", async () => {
  const page = mockSendPromptPage("https://gemini.google.com/app?hl=en");
  page.waitForSelector = async (selector: string) => {
    if (selector.includes("Download full size image")) throw new Error("image toolbar never rendered");
  };
  page.locator = (selector: string) => {
    const loc: any = {
      first: () => loc,
      last: () => loc,
      count: async () => selector.includes("Create image") || selector.includes("Send message") || selector.includes("rich-textarea") ? 1 : 0,
      getAttribute: async (name: string) => name === "aria-label" && selector.includes("Create image") ? "Deselect Images" : "",
      waitFor: async () => undefined,
      fill: async () => undefined,
      click: async () => undefined,
      textContent: async () => selector === "main" ? "image pending" : "Fast"
    };
    return loc;
  };
  let artifactClicked = false;
  const runtime = { ...mockWebAiRuntime(page), artifactClick: async () => { artifactClicked = true; throw new Error("must not click artifact"); } } as any;
  const result: any = await webAiGeminiGenerateImage({ backend: "managed-cdp", profile: "gemini-image-render-timeout", prompt: "make image", download_dir: process.cwd(), timeout_ms: 50, response_timeout_ms: 10 }, runtime);
  assert.equal(result.errorCode, "COMMAND_TIMEOUT");
  assert.equal(result.error_code, "COMMAND_TIMEOUT");
  assert.equal(result.download_filename, "");
  assert.equal(artifactClicked, false);
});



test("chatgpt generate-image enters image mode before typing prompt", async () => {
  const events: string[] = [];
  const page = mockSendPromptPage("https://chatgpt.com/c/stale");
  page.waitForSelector = async (selector: string, options: any) => {
    if (selector.includes('menuitemradio')) events.push(`waitForSelector:${selector}:${options?.state}:${options?.timeout}`);
    if (selector.includes("Image, click to remove")) events.push(`waitForSelector:image-mode-active:${options?.state}:${options?.timeout}`);
    if (selector.includes("Edit image")) events.push(`render:${selector}`);
  };
  page.waitForTimeout = async () => undefined;
  page.keyboard = { press: async (key: string) => { events.push(`press:${key}`); }, type: async () => undefined };
  page.locator = (selector: string) => {
    const loc: any = {
      first: () => loc,
      last: () => loc,
      count: async () => selector.includes('aria-haspopup="menu"') || selector.includes("composer-plus-btn") || selector.includes("menuitemradio") || selector.includes("prompt-textarea") ? 1 : 0,
      getAttribute: async (name: string) => {
        if (selector.includes('[role="menuitemradio"][aria-checked="true"]') && name === "data-testid") return "model-switcher-gpt-5-5-thinking";
        return selector.includes('aria-haspopup="menu"') && name === "aria-label" ? "Thinking" : "";
      },
      waitFor: async () => { events.push(`wait:${selector}`); },
      fill: async () => { events.push(`fill:${selector}`); },
      click: async (options: any) => { events.push(`click:${selector}:${options?.timeout}`); },
      textContent: async () => selector.includes("prompt-textarea") ? "" : selector.includes('[role="menuitemradio"][aria-checked="true"]') ? "Thinking • Heavy" : "image response"
    };
    return loc;
  };
  const calls: any[] = [];
  const runtime = { ...mockWebAiRuntime(page), artifactClick: async (options: any) => { calls.push(options); return { path: path.join(process.cwd(), "cg.png"), sha256: "abc", size: 123, downloadFilename: "cg.png", downloadGuid: "g", bbox: { x: 0, y: 0, width: 1, height: 1 }, elapsedMs: 1 }; } } as any;
  const result: any = await webAiChatgptGenerateImage({ backend: "managed-cdp", profile: "chatgpt-image-mode", prompt: "make image", download_dir: process.cwd(), response_timeout_ms: 10 }, runtime);
  assert.equal(result.download_filename, "cg.png");
  const plus = events.findIndex((e) => e === "click:#composer-plus-btn:5000");
  const waitRadio = events.findIndex((e) => e === 'waitForSelector:[role="menuitemradio"]:has-text("Create image"):visible:8000');
  const radio = events.findIndex((e) => e === 'click:[role="menuitemradio"]:has-text("Create image"):8000');
  const waitActive = events.findIndex((e) => e === 'waitForSelector:image-mode-active:visible:8000');
  const fill = events.findIndex((e) => e === "fill:#prompt-textarea");
  assert.ok(plus >= 0 && plus < waitRadio && waitRadio < radio && radio < waitActive && waitActive < fill, events.join("\n"));
  assert.ok(events.includes("press:Enter"), events.join("\n"));
  // Live-verified 2026-05-15 (Extended Pro account): the inline image-hover
  // toolbar has NO download button. The real download path is: click the
  // generated image -> full-screen viewer toolbar Save, now primarily anchored
  // via header[data-testid="fullscreen-shell-header"] with the legacy
  // [role="dialog"] button[aria-label="Save"] selector retained as a trailing
  // fallback for post-generation layer swap-in race-hardening (re-verified
  // 2026-05-17, issue #2). Two-step CDP artifact-click: open viewer then Save.
  assert.equal(calls[0].buttonSelector, 'img[alt^="Generated image" i]');
  assert.equal(calls[0].followUpSelector, '[data-testid="fullscreen-shell-header"] button[aria-label="Save"], [role="dialog"] button[aria-label="Save"]');
});

test("chatgpt generate-image returns ELEMENT_NOT_FOUND when Create image radio wait expires", async () => {
  const page = mockSendPromptPage("https://chatgpt.com/");
  page.waitForSelector = async (selector: string, options: any) => {
    assert.equal(selector, '[role="menuitemradio"]:has-text("Create image")');
    assert.deepEqual(options, { state: "visible", timeout: 8000 });
    throw new Error("radio did not render");
  };
  page.locator = (selector: string) => {
    const loc: any = {
      first: () => loc,
      last: () => loc,
      count: async () => selector.includes("composer-plus-btn") ? 1 : 0,
      waitFor: async () => undefined,
      fill: async () => undefined,
      click: async () => undefined,
      textContent: async () => ""
    };
    return loc;
  };
  const result: any = await webAiChatgptGenerateImage({ backend: "managed-cdp", profile: "chatgpt-image-radio-missing", prompt: "make image", download_dir: process.cwd(), response_timeout_ms: 10 }, mockWebAiRuntime(page));
  assert.equal(result.errorCode, "ELEMENT_NOT_FOUND");
  assert.equal(result.expected_selector, '[role="menuitemradio"]:has-text("Create image")');
});

test("chatgpt generate-image returns ELEMENT_NOT_FOUND when image mode does not activate after selecting Create image", async () => {
  const clicks: any[] = [];
  const page = mockSendPromptPage("https://chatgpt.com/");
  page.waitForSelector = async (selector: string, options: any) => {
    if (selector.includes("menuitemradio")) {
      assert.deepEqual(options, { state: "visible", timeout: 8000 });
      return;
    }
    if (selector.includes("Image, click to remove")) {
      // Radix removed the radio on selection but the composer image-mode pill
      // never appears -> activation genuinely failed.
      assert.deepEqual(options, { state: "visible", timeout: 8000 });
      throw new Error("image mode pill did not render");
    }
  };
  page.waitForTimeout = async () => undefined;
  page.locator = (selector: string) => {
    const loc: any = {
      first: () => loc,
      last: () => loc,
      count: async () => selector.includes("composer-plus-btn") || selector.includes("menuitemradio") ? 1 : 0,
      waitFor: async () => undefined,
      fill: async () => undefined,
      click: async (options: any) => { clicks.push({ selector, timeout: options?.timeout }); },
      getAttribute: async () => "",
      textContent: async () => ""
    };
    return loc;
  };
  const result: any = await webAiChatgptGenerateImage({ backend: "managed-cdp", profile: "chatgpt-image-mode-no-activate", prompt: "make image", download_dir: process.cwd(), response_timeout_ms: 10 }, mockWebAiRuntime(page));
  assert.equal(result.errorCode, "ELEMENT_NOT_FOUND");
  assert.equal(result.expected_selector, 'button[aria-label="Image, click to remove"], button[aria-label*="image aspect ratio" i]');
  // The radio is clicked exactly once (no detached-element retry loop).
  assert.deepEqual(clicks.filter((entry) => entry.selector === '[role="menuitemradio"]:has-text("Create image")').map((entry) => entry.timeout), [8000]);
});

test("gemini generate-image activates Create image and sends from ql-editor with Enter", async () => {
  const events: string[] = [];
  let label = "🖼️ Create image, button, tap to use tool";
  const page = mockSendPromptPage("https://gemini.google.com/app?hl=en");
  page.waitForSelector = async (selector: string, options: any) => {
    if (selector.includes("Create image")) events.push(`waitForSelector:${selector}:${options?.state}:${options?.timeout}`);
    if (selector.includes("Download full size image")) events.push(`render:${selector}`);
  };
  page.waitForTimeout = async () => undefined;
  page.keyboard = { press: async (key: string) => { events.push(`press:${key}`); }, type: async () => undefined };
  page.locator = (selector: string) => {
    const loc: any = {
      first: () => loc,
      last: () => loc,
      count: async () => selector.includes("Create image") || selector.includes("rich-textarea") || selector === "main" ? 1 : 0,
      getAttribute: async (name: string) => name === "aria-label" && selector.includes("Create image") ? label : "",
      waitFor: async () => { events.push(`wait:${selector}`); },
      fill: async () => { events.push(`fill:${selector}`); },
      click: async () => { events.push(`click:${selector}`); if (selector.includes("Create image")) label = "Deselect Images"; },
      textContent: async () => selector.includes("rich-textarea") ? "" : "image response"
    };
    return loc;
  };
  const runtime = { ...mockWebAiRuntime(page), artifactClick: async () => ({ path: path.join(process.cwd(), "gm.png"), sha256: "abc", size: 123, downloadFilename: "gm.png", downloadGuid: "g", bbox: { x: 0, y: 0, width: 1, height: 1 }, elapsedMs: 1 }) } as any;
  const result: any = await webAiGeminiGenerateImage({ backend: "managed-cdp", profile: "gemini-image-enter", prompt: "make image", download_dir: process.cwd(), response_timeout_ms: 10 }, runtime);
  assert.equal(result.download_filename, "gm.png");
  const waitCreate = events.findIndex((e) => e === 'waitForSelector:button[aria-label*="Create image"]:visible:4000');
  const create = events.findIndex((e) => e.includes('click:button[aria-label*="Create image"]'));
  const fill = events.findIndex((e) => e === 'fill:rich-textarea .ql-editor[contenteditable="true"]');
  const enter = events.findIndex((e) => e === "press:Enter");
  const render = events.findIndex((e) => e.includes('render:button[aria-label="Download full size image"]'));
  assert.ok(waitCreate >= 0 && waitCreate < create && create < fill && fill < enter && enter < render, events.join("\n"));
});

test("tools.ts does not retain stale image/upload selectors", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "src/mcp/tools.ts"), "utf-8");
  // The old speculative xpath-ancestor download hack must be gone; the live-
  // verified path is: open the generated image -> [role="dialog"] viewer ->
  // its direct button[aria-label="Save"] (confirmed live 2026-05-15).
  assert.equal(source.includes('xpath=ancestor::*[contains(concat'), false);
  assert.equal(source.includes('CHATGPT_IMAGE_OPEN_VIEWER_SELECTOR'), true);
  assert.equal(source.includes('[role="dialog"] button[aria-label="Save"]'), true);
  assert.equal(source.includes(':has-text("Upload files")'), false);
  assert.equal(source.includes('main img[alt], main img[src^="blob:"], main img[src*="oaiusercontent"], main img'), false);
  assert.equal(source.includes('local-images-files-uploader-button'), true);
});

test("upload-and-query retries uncleared composer once then returns COMMAND_TIMEOUT", async () => {
  const dir = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "chatgpt-upload-send-confirm-"));
  const file = path.join(dir, "fixture.csv");
  fs.writeFileSync(file, "a,b\n1,2\n");
  let sendClicks = 0;
  const page = mockSendPromptPage("https://chatgpt.com/");
  page.setInputFiles = async () => undefined;
  page.locator = (selector: string) => {
    const isPrompt = selector.includes("ProseMirror") || selector.includes("textarea") || selector.includes("prompt-textarea");
    const loc: any = {
      first: () => loc,
      last: () => loc,
      count: async () => selector.includes('aria-haspopup="menu"') || selector.includes('[role="menuitemradio"]:has-text("Thinking")') || selector.includes("send-button") || selector.includes("Send") ? 1 : 0,
      waitFor: async () => undefined,
      fill: async () => undefined,
      click: async () => { if (selector.includes("send-button") || selector.includes("Send")) sendClicks++; },
      getAttribute: async (name: string) => selector.includes('aria-haspopup="menu"') && name === "aria-label" ? "Thinking" : null,
      inputValue: async () => isPrompt ? "read it" : "",
      textContent: async () => selector.includes('aria-haspopup="menu"') ? "Thinking" : isPrompt ? "read it" : "GPT"
    };
    return loc;
  };
  const result: any = await webAiChatgptUploadAndQuery({ backend: "managed-cdp", profile: "chatgpt-upload-send-confirm", files: [file], prompt: "read it", response_timeout_ms: 10 }, mockWebAiRuntime(page));
  assert.equal(sendClicks, 2);
  assert.equal(result.errorCode, "COMMAND_TIMEOUT");
  assert.equal(result.error_code, "COMMAND_TIMEOUT");
  assert.equal(result.completion_detected, false);
  assert.equal(result.response_text, "");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("canvas-to-docs honest-fails (ELEMENT_NOT_FOUND) when Canvas mode cannot activate", async () => {
  // No Canvas affordance present (Tools drawer + Canvas menuitem absent) -> the
  // tool must surface a stable contract error, never a fake/chrome docs_url.
  const page = mockSendPromptPage("https://gemini.google.com/app?hl=en");
  page.locator = (selector: string) => {
    const loc: any = {
      first: () => loc,
      last: () => loc,
      count: async () => selector.includes("Send message") ? 1 : 0,
      waitFor: async () => undefined,
      fill: async () => undefined,
      click: async () => undefined,
      textContent: async () => "Fast"
    };
    return loc;
  };
  const result: any = await webAiGeminiCanvasToDocs({ backend: "managed-cdp", profile: "gemini-canvas-verify", prompt: "make canvas", title: "gd-canvas-smoke", response_timeout_ms: 10 }, mockWebAiRuntime(page));
  assert.equal(result.docs_url, null);
  assert.equal(result.docs_doc_id, null);
  assert.equal(result.errorCode, "ELEMENT_NOT_FOUND");
  assert.equal(result.error_code, "ELEMENT_NOT_FOUND");
});

test("canvas-to-docs returns a real docs.google.com URL + doc id from the spawned Docs tab", async () => {
  // Drives the live-observed flow: Canvas mode active -> prompt completes ->
  // share/export -> Export to Docs spawns a docs.google.com/document/d/<id>
  // page in the same browser context.
  const docId = "1cMiO8CxtyqiIu4QjayRhc7E-Y9qRsDEZcbxBS_13inY";
  const docsPage: any = { _closed: false, url: () => `https://docs.google.com/document/d/${docId}/edit?tab=t.0`, close: async () => { docsPage._closed = true; } };
  const ctxPages: any[] = [];
  const page: any = {
    _url: "https://gemini.google.com/app?hl=en",
    url() { return this._url; },
    goto: async () => undefined,
    waitForLoadState: async () => undefined,
    waitForFunction: async () => undefined,
    waitForSelector: async () => undefined,
    waitForTimeout: async () => { if (!ctxPages.includes(docsPage)) ctxPages.push(docsPage); },
    evaluate: async () => "Canvas note ready",
    context: () => ({ pages: () => ctxPages }),
    keyboard: { press: async () => undefined, type: async () => undefined },
    locator: (selector: string) => {
      // Canvas active pill present so activateGeminiToolMode short-circuits to
      // "already active"; Send present so submit confirms; share/export
      // controls present so the export click path proceeds.
      const present = selector.includes("Deselect Canvas")
        || selector.includes("Send message")
        || selector.includes("share-button")
        || selector.includes("export-to-docs-button");
      const loc: any = {
        first: () => loc,
        last: () => loc,
        count: async () => present ? 1 : 0,
        waitFor: async () => undefined,
        fill: async () => undefined,
        click: async () => undefined,
        getAttribute: async () => null,
        textContent: async () => "Fast"
      };
      return loc;
    }
  };
  const result: any = await webAiGeminiCanvasToDocs({ backend: "managed-cdp", profile: "gemini-canvas-ok", prompt: "make canvas", title: "ProbeDoc", response_timeout_ms: 10, timeout_ms: 3000 }, mockWebAiRuntime(page));
  assert.equal(result.docs_url, `https://docs.google.com/document/d/${docId}/edit`);
  assert.equal(result.docs_doc_id, docId);
  assert.equal(result.title, "ProbeDoc");
  assert.equal(result.errorCode, null);
  assert.equal(docsPage._closed, true);
});

test("gemini generate-video returns an async task envelope and persists a running task row", async () => {
  const dir = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "vid-"));
  const db = tempCapabilityDb();
  const page = mockSendPromptPage("https://gemini.google.com/app?hl=en");
  page.locator = (selector: string) => {
    const loc: any = {
      first: () => loc,
      last: () => loc,
      count: async () => selector.includes("Send message") ? 1 : 0,
      waitFor: async () => undefined,
      fill: async () => undefined,
      click: async () => undefined,
      getAttribute: async () => null,
      textContent: async () => "Fast"
    };
    return loc;
  };
  let spawnedTaskId = "";
  const env: any = await webAiGeminiGenerateVideo(
    { backend: "managed-cdp", profile: "gemini-video-async", prompt: "a 2-second clip of a rotating blue cube", download_dir: dir },
    { ...mockWebAiRuntime(page), database: db, spawnVideoWorker: (taskId: string) => { spawnedTaskId = taskId; return { pid: process.pid }; } } as any
  );
  assert.equal(typeof env.task_id, "string");
  assert.ok(env.task_id.startsWith("task_"));
  assert.equal(env.status, "running");
  assert.equal(env.profile, "gemini-video-async");
  assert.equal(typeof env.lease_id, "string");
  assert.equal(typeof env.started_at, "string");
  assert.equal(spawnedTaskId, env.task_id);
  const persisted = db.getWebAiTask(env.task_id);
  assert.equal(persisted?.status, "running");
  assert.equal(persisted?.profile, "gemini-video-async");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("webai task status reads durable task rows through a fresh database handle", async () => {
  const db = tempCapabilityDb();
  db.upsertWebAiTask({
    task_id: "task_cross_process",
    status: "done",
    profile: "gemini-cross-process",
    lease_id: "lease_cross",
    started_at: new Date().toISOString(),
    progress_label: "video generated and downloaded",
    result: { path: "/tmp/video.mp4", sha256: "abc", size_bytes: 12, download_filename: "video.mp4" }
  });
  const fresh = new CapabilityDatabase({ dbPath: db.dbPath, preferSqlite: false });
  const status: any = await webAiTaskStatus({ backend: "managed-cdp", task_id: "task_cross_process" }, { database: fresh });
  assert.equal(status.status, "done");
  assert.equal(status.progress_label, "video generated and downloaded");
  assert.deepEqual(status.result, { path: "/tmp/video.mp4", sha256: "abc", size_bytes: 12, download_filename: "video.mp4" });
  assert.equal(status.errorCode, undefined);
  assert.deepEqual(await webAiTaskStatus({ backend: "managed-cdp", task_id: "missing" }, { database: fresh }), { status: "failed", errorCode: "INVALID_ARGS" });
});

test("gemini generate-video detached-worker contract reflects worker terminal result from a fresh store", async () => {
  const dir = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "vid-done-"));
  const artifactPath = path.join(dir, "done.mp4");
  fs.writeFileSync(artifactPath, Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftypisom", "ascii"), Buffer.alloc(32)]));
  const db = tempCapabilityDb();
  const runtime = {
    ...mockWebAiRuntime(mockSendPromptPage("https://gemini.google.com/app?hl=en")),
    database: db,
    spawnVideoWorker: (taskId: string, _args: any, database: CapabilityDatabase) => {
      const row = database.getWebAiTask(taskId)!;
      database.upsertWebAiTask({
        ...row,
        status: "done",
        progress_label: "video generated and downloaded",
        result: { path: artifactPath, sha256: "sha", size_bytes: fs.statSync(artifactPath).size, download_filename: "done.mp4" },
        worker_pid: process.pid
      });
      return { pid: process.pid };
    }
  } as any;
  const env: any = await webAiGeminiGenerateVideo({ backend: "managed-cdp", profile: "gemini-video-detached", prompt: "make video", download_dir: dir }, runtime);
  assert.deepEqual(Object.keys(env), ["task_id", "status", "profile", "lease_id", "started_at"]);
  const fresh = new CapabilityDatabase({ dbPath: db.dbPath, preferSqlite: false });
  const status: any = await webAiTaskStatus({ backend: "managed-cdp", task_id: env.task_id }, { database: fresh });
  assert.equal(status.status, "done");
  assert.equal(status.result.path, artifactPath);
  assert.equal(status.result.size_bytes > 0, true);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("webai task status marks abandoned stale running video task as COMMAND_TIMEOUT", async () => {
  const db = tempCapabilityDb();
  db.upsertWebAiTask({
    task_id: "task_stale",
    status: "running",
    profile: "gemini-stale",
    lease_id: "lease_stale",
    started_at: new Date(Date.now() - 70_000).toISOString(),
    progress_label: "generating video",
    timeout_ms: 1
  });
  const status: any = await webAiTaskStatus({ backend: "managed-cdp", task_id: "task_stale" }, { database: new CapabilityDatabase({ dbPath: db.dbPath, preferSqlite: false }) });
  assert.equal(status.status, "failed");
  assert.equal(status.errorCode, "COMMAND_TIMEOUT");
  const persisted = db.getWebAiTask("task_stale");
  assert.equal(persisted?.status, "failed");
  assert.equal(persisted?.errorCode, "COMMAND_TIMEOUT");
});

test("webai task status keeps healthy in-budget running video task active", async () => {
  const db = tempCapabilityDb();
  db.upsertWebAiTask({
    task_id: "task_healthy",
    status: "running",
    profile: "gemini-healthy",
    lease_id: "lease_healthy",
    started_at: new Date().toISOString(),
    progress_label: "generating video",
    timeout_ms: 300000,
    worker_pid: process.pid
  });
  const status: any = await webAiTaskStatus({ backend: "managed-cdp", task_id: "task_healthy" }, { database: new CapabilityDatabase({ dbPath: db.dbPath, preferSqlite: false }) });
  assert.equal(status.status, "running");
  assert.equal(status.errorCode, undefined);
  assert.equal(db.getWebAiTask("task_healthy")?.status, "running");
});

test("gemini video worker bootstrap failure persists terminal COMMAND_TIMEOUT", () => {
  const db = tempCapabilityDb();
  db.upsertWebAiTask({
    task_id: "task_bootstrap",
    status: "running",
    profile: "gemini-bootstrap",
    lease_id: "lease_bootstrap",
    started_at: new Date().toISOString(),
    progress_label: "queued Gemini video generation",
    timeout_ms: 300000
  });
  const previousArgv = process.argv;
  process.argv = ["node", "videoWorker.js", "--task-id", "task_bootstrap", "--db-path", db.dbPath];
  try {
    bestEffortMarkVideoTaskBootstrapFailure();
    const fresh = new CapabilityDatabase({ dbPath: db.dbPath, preferSqlite: false });
    const failed = fresh.getWebAiTask("task_bootstrap");
    assert.equal(failed?.status, "failed");
    assert.equal(failed?.errorCode, "COMMAND_TIMEOUT");
    assert.equal(failed?.progress_label, "failed: COMMAND_TIMEOUT");
    fresh.upsertWebAiTask({ ...failed!, status: "done", errorCode: undefined, progress_label: "video generated and downloaded" });
    bestEffortMarkVideoTaskBootstrapFailure();
    assert.equal(new CapabilityDatabase({ dbPath: db.dbPath, preferSqlite: false }).getWebAiTask("task_bootstrap")?.status, "done");
  } finally {
    process.argv = previousArgv;
  }
});

test("new v1.5.0 error codes exist in TS export and contract manifest", () => {
  const manifest = contract();
  for (const code of ["SENSITIVE_CONTENT_GUARD", "SUBMCP_QUOTA_EXHAUSTED", "SUBMCP_NOT_PROVISIONED"]) {
    assert.ok((CONSUMER_ERROR_CODES as readonly string[]).includes(code), `TS missing ${code}`);
    assert.ok(manifest.error_codes.includes(code), `contract missing ${code}`);
  }
});


test("stream5 B3 Claude conversation_manage share respects sensitive-content guard", async () => {
  const result: any = await webAiClaudeConversationManage({ backend: "managed-cdp", action: "share", profile: "claude-9224" }, { database: tempCapabilityDb() } as any);
  assert.equal(result.ok, false);
  assert.equal(result.errorCode, "SENSITIVE_CONTENT_GUARD");
  assert.equal(result.error_code, "SENSITIVE_CONTENT_GUARD");
  assert.equal(result.action, "share");
  assertNoForbiddenFields(result, contract().forbidden_output_fields);
});

test("stream5 B3 Claude conversation_manage sidebar_options returns human handoff", async () => {
  const result: any = await webAiClaudeConversationManage({ backend: "managed-cdp", action: "sidebar_options", profile: "claude-9224" }, { database: tempCapabilityDb() } as any);
  assert.equal(result.ok, false);
  assert.equal(result.errorCode, "HUMAN_HANDOFF_REQUIRED");
  assert.equal(result.error_code, "HUMAN_HANDOFF_REQUIRED");
  assert.equal(result.reason, "sidebar_kebab_radix_portal_unreliable");
  assertNoForbiddenFields(result, contract().forbidden_output_fields);
});
