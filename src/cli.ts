#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
import { BrowserSessionManager } from "./browser/sessionManager";
import { ManagedBrowserLauncher, BrowserCloseMode } from "./browser/managedLauncher";
import { createManagedBrowserLauncher } from "./runtime/pool/profilePool";
import { BrowserProfileStore } from "./browser/profileStore";
import { auditProfiles, releaseLeaseAndCleanLocks } from "./browser/profileLease";
import { DownloadManager } from "./browser/downloads";
import { activeManagedPage } from "./browser/managedPageRouting";
import { runArtifactClick } from "./browser/artifactClick";
import { allocateSession, freeSession, listSessions } from "./browser/sessionPool";
import { TabRegistry } from "./browser/tabRegistry";
import { getStoragePaths } from "./utils/paths";
import { readHtmlSnapshotFromFile, readPageSnapshot } from "./reader/snapshot";
import { ActionExecutor } from "./actions/executor";
import { ArtifactStore } from "./artifacts/store";
import { assertActionPermitted, defaultConfirmationPolicy } from "./actions/confirmationPolicy";
import { BrowserAction } from "./shared/types";
import { loadRecipeById, listRecipes } from "./recipes/loader";
import { RecipeEngine } from "./recipes/engine";
import { listAdapters } from "./adapters/adapterLoader";
import { listWebAiAdapters, getWebAiAdapter } from "./adapters/web-ai";
import { captureSiteMapForSnapshot, saveSiteMap } from "./maintenance/captureSiteMap";
import { diffSiteMapFiles, latestSiteMapPath } from "./maintenance/diffSiteMap";
import { startMcpServer } from "./mcp/server";
import { callMcpTool, listMcpTools } from "./mcp/tools";
import { listMcpResources } from "./mcp/resources";
import { readConfigFile } from "./utils/yaml";
import { policyNotice } from "./safety/policy";
import { CapabilityDatabase } from "./capabilities/database";
import { ConsumerErrorCodes, isConsumerErrorCode } from "./consumer/errorCodes";
import { runHealthCheck } from "./capabilities/healthCheck";
import { CapabilityUpdater } from "./capabilities/updater";
import { SiteRegistryImporter } from "./adapters/research/siteRegistryImporter";
import { CapabilityLibraryImporter } from "./adapters/research/capabilityLibraryImporter";
import { ResearchDbImporter, researchAiaaSearch, researchAiaaFilter, researchAiaaExport, researchWosSearch, researchWosFilter, researchWosExport, researchAcmSearch, researchAcmFilter, researchAcmExport, researchIeeeSearch, researchIeeeFilter, researchIeeeExport, researchAcsSearch, researchAcsFilter, researchAcsExport, researchAsmeSearch, researchAsmeFilter, researchAsmeExport, researchRscSearch, researchRscFilter, researchRscExport, researchWileySearch, researchWileyFilter, researchWileyExport, researchAsceSearch, researchAsceFilter, researchAsceExport, researchIopSearch, researchIopFilter, researchIopExport, researchTandfSearch, researchTandfFilter, researchTandfExport, researchSaeSearch, researchSaeFilter, researchSaeExport, researchScienceDirectSearch, researchScienceDirectFilter, researchScienceDirectExport, researchApsSearch, researchApsFilter, researchApsExport, researchEmeraldSearch, researchEmeraldFilter, researchEmeraldExport, researchCambridgeSearch, researchCambridgeFilter, researchCambridgeExport, researchSpringerSearch, researchSpringerFilter, researchSpringerExport, researchNatureSearch, researchNatureFilter, researchNatureExport, researchIetSearch, researchIetFilter, researchIetExport, researchAipSearch, researchAipFilter, researchAipExport, researchMdpiSearch, researchMdpiFilter, researchMdpiExport, researchOpticaSearch, researchOpticaFilter, researchOpticaExport, researchProquestSearch, researchProquestFilter, researchProquestExport, researchFrontiersSearch, researchFrontiersFilter, researchFrontiersExport, researchArxivSearch, researchArxivFilter, researchArxivExport, researchSiamSearch, researchSiamFilter, researchSiamExport, researchDegruyterSearch, researchDegruyterFilter, researchDegruyterExport, researchWorldsciSearch, researchWorldsciFilter, researchWorldsciExport, researchRoyalSocSearch, researchRoyalSocFilter, researchRoyalSocExport, researchScoap3Search, researchScoap3Filter, researchScoap3Export, researchDblpSearch, researchDblpFilter, researchDblpExport, researchScieloSearch, researchScieloFilter, researchScieloExport, researchInspirehepSearch, researchInspirehepFilter, researchInspirehepExport, researchPubscholarSearch, researchPubscholarFilter, researchPubscholarExport, researchOpticsjournalSearch, researchOpticsjournalFilter, researchOpticsjournalExport, researchCrcSearch, researchCrcFilter, researchCrcExport, researchCellpressSearch, researchCellpressFilter, researchCellpressExport, researchIestSearch, researchIestFilter, researchIestExport, researchIncopatSearch, researchIncopatFilter, researchIncopatExport, researchWanfangSearch, researchWanfangFilter, researchWanfangExport } from "./mcp/researchdb";
import { WorkflowCompiler, listWorkflowFiles } from "./workflows/compiler";
import { WorkflowExecutor } from "./workflows/executor";
import { HealthCheckReport } from "./shared/types";
import { consumerHealth } from "./consumer/health";
import { redactValue } from "./trace/redact";
import { verifyDocxMin } from "./verifiers/docxMin";
import { runWahScout } from "./observe/scout/cli";

type CliOptionValue = string | boolean | Array<string | boolean>;
interface ParsedArgs { options: Record<string, CliOptionValue>; positionals: string[]; }

function parseArgs(args: string[]): ParsedArgs {
  const options: Record<string, CliOptionValue> = {};
  const positionals: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--") { positionals.push(...args.slice(i + 1)); break; }
    if (arg.startsWith("--")) {
      const eq = arg.indexOf("=");
      if (eq > 2) { addOption(options, arg.slice(2, eq), arg.slice(eq + 1)); continue; }
      const key = arg.slice(2);
      const next = args[i + 1];
      if (!next || next.startsWith("--")) addOption(options, key, true);
      else { addOption(options, key, next); i++; }
    } else positionals.push(arg);
  }
  return { options, positionals };
}

function addOption(options: Record<string, CliOptionValue>, key: string, value: string | boolean): void {
  const current = options[key];
  if (current === undefined) options[key] = value;
  else if (Array.isArray(current)) current.push(value);
  else options[key] = [current, value];
}

function asString(value: CliOptionValue | undefined, fallback?: string): string | undefined {
  if (Array.isArray(value)) return asString(value[value.length - 1], fallback);
  return typeof value === "string" ? value : fallback;
}
function asNumber(value: CliOptionValue | undefined): number | undefined {
  if (Array.isArray(value)) return asNumber(value[value.length - 1]);
  return typeof value === "string" ? Number(value) : undefined;
}
function asPoint(value: CliOptionValue | undefined, flag: string): [number, number] | undefined {
  const raw = asString(value);
  if (raw === undefined) return undefined;
  const parts = raw.split(",").map((item) => Number(item.trim()));
  if (parts.length !== 2 || parts.some((item) => !Number.isFinite(item))) throw new Error(`${flag} must be in x,y format`);
  return [parts[0], parts[1]];
}
function wantJson(options: Record<string, CliOptionValue>): boolean { return options.json === true || options.json === "true" || options["output-json"] === true || options.outputJson === true || (Array.isArray(options.json) && options.json.some((value) => value === true || value === "true")); }
function output(value: unknown, options: Record<string, CliOptionValue> = {}): void { console.log(wantJson(options) ? JSON.stringify(value, null, 2) : typeof value === "string" ? value : JSON.stringify(value, null, 2)); }
function redactForCli(value: unknown, options: Record<string, CliOptionValue> = {}): unknown {
  if (options["no-redact"] === true || options.noRedact === true) return value;
  return redactValue(value, { mode: "default" });
}
function consumerErrorCodeFromResult(value: unknown): string | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const code = record.errorCode || record.error_code;
  if (record.ok === true && code === ConsumerErrorCodes.LITERATURE_QUEUED) return undefined;
  return isConsumerErrorCode(code) ? code : undefined;
}
function cliExitCodeForErrorCode(errorCode: string | undefined): number {
  if (errorCode === ConsumerErrorCodes.POSTCONDITION_TIMEOUT) return 12;
  return errorCode ? 1 : 0;
}
function flushWritable(stream: any): Promise<void> {
  if (!stream?.writable || stream.destroyed) return Promise.resolve();
  return new Promise((resolve) => stream.write("", resolve));
}
async function finishWebAiDispatch(exitCode: number): Promise<void> {
  process.exitCode = exitCode;
  if (require.main !== module) return;
  await Promise.all([flushWritable(process.stdout), flushWritable(process.stderr)]);
  process.exit(exitCode);
}
function downloadManager(): DownloadManager { return new DownloadManager(getStoragePaths().downloadDir); }

function formatDownloadRecords(records: any[]): any[] {
  return records.map((record) => ({
    id: record.id,
    profile: record.profile,
    ...(record.tabId ? { tabId: record.tabId } : {}),
    suggestedFilename: record.suggestedFilename,
    savedPath: record.savedPath,
    sizeBytes: record.sizeBytes ?? 0,
    ...(record.mimeType ? { mimeType: record.mimeType } : {}),
    createdAt: record.createdAt || record.timestamp,
    ...(record.sourceUrl || record.url ? { sourceUrl: record.sourceUrl || record.url } : {})
  }));
}

function filenameFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const base = path.basename(parsed.pathname);
    return base && base !== "/" ? base : `download-${Date.now()}`;
  } catch {
    return `download-${Date.now()}`;
  }
}

function contentDispositionFilename(header: string | null | undefined): string | undefined {
  if (!header) return undefined;
  const utf = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (utf) return decodeURIComponent(utf[1].replace(/\"/g, ""));
  const plain = /filename=\"?([^\";]+)\"?/i.exec(header);
  return plain?.[1];
}

function snapshotMode(options: Record<string, CliOptionValue>): "full" | "lite" | undefined {
  const mode = asString(options.mode);
  if (!mode) return undefined;
  if (mode === "full" || mode === "lite") return mode;
  throw new Error("--mode must be one of full|lite");
}

function hasOption(options: Record<string, CliOptionValue>, ...keys: string[]): boolean { return keys.some((key) => Object.prototype.hasOwnProperty.call(options, key)); }

function asBoolean(value: CliOptionValue | undefined): boolean | undefined {
  if (Array.isArray(value)) return asBoolean(value[value.length - 1]);
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  return undefined;
}

function asStringList(value: CliOptionValue | undefined): string[] {
  const values = Array.isArray(value) ? value : value === undefined ? [] : [value];
  return values
    .filter((item): item is string => typeof item === "string")
    .flatMap((item) => item.split(","))
    .map((item) => item.trim())
    .filter(Boolean);
}

function webAiArgsFromCli(command: string, options: Record<string, CliOptionValue>): Record<string, unknown> {
  const base: Record<string, unknown> = {
    profile: asString(options.profile),
    prompt: asString(options.prompt),
    tab_url_contains: asString(options["tab-url-contains"] || options.tabUrlContains),
    url: asString(options.url),
    timeout_ms: asNumber(options["timeout-ms"] || options.timeoutMs),
    response_timeout_ms: asNumber(options["response-timeout-ms"] || options.responseTimeoutMs),
    backend: asString(options.backend),
    http_bridge_url: asString(options["http-bridge-url"] || options.httpBridgeUrl),
    reuse_conversation: asBoolean(options["reuse-conversation"] || options.reuseConversation),
    model: asString(options.model),
    thinking_level: asString(options["thinking-level"] || options.thinkingLevel),
    thinking: asBoolean(options.thinking),
    web_search: asBoolean(options["web-search"] || options.webSearch),
    incognito: asBoolean(options.incognito),
    canvas: asBoolean(options.canvas),
    style: asString(options.style),
    download_dir: asString(options["download-dir"] || options.downloadDir),
    expected_extension: asString(options["expected-extension"] || options.expectedExtension),
    artifact_class: asString(options["artifact-class"] || options.artifactClass),
    title: asString(options.title),
    size: asString(options.size),
    duration_seconds: asNumber(options["duration-seconds"] || options.durationSeconds),
    account_pool: asString(options["account-pool"] || options.accountPool),
    task_id: asString(options["task-id"] || options.taskId),
    format: asString(options.format),
    action: asString(options.action),
    surface: asString(options.surface),
    query: asString(options.query),
    edit_text: asString(options["edit-text"] || options.editText),
    ai_action: asString(options["ai-action"] || options.aiAction),
    confirmed: asBoolean(options.confirmed),
    name: asString(options.name),
    fidelity: asString(options.fidelity),
    project_url: asString(options["project-url"] || options.projectUrl),
    repo: asString(options.repo),
    branch: asString(options.branch),
    tab: asString(options.tab),
    tab_id: asString(options["tab-id"] || options.tabId),
    wait_ready: asBoolean(options["wait-ready"] || options.waitReady)
  };
  const files = asStringList(options.file || options.files);
  if (files.length) base.files = files;
  for (const key of Object.keys(base)) if (base[key] === undefined) delete base[key];
  if (command === "webai:task-status" && !base.task_id) throw new Error("INVALID_ARGS: webai:task-status requires --task-id <id>");
  if (command === "webai:literature-task-status" && !base.task_id) throw new Error("INVALID_ARGS: webai:literature-task-status requires --task-id <id>");
  return base;
}

function webAiMcpNameFromCli(command: string): string | undefined {
  const map: Record<string, string> = {
    "webai:chatgpt:send-prompt": "webai_chatgpt_send_prompt",
    "webai:chatgpt:select-model": "webai_chatgpt_select_model",
    "webai:claude:send-prompt": "webai_claude_send_prompt",
    "webai:claude:select-model": "webai_claude_select_model",
    "webai:gemini:send-prompt": "webai_gemini_send_prompt",
    "webai:gemini:select-model": "webai_gemini_select_model",
    "webai:chatgpt:upload-and-query": "webai_chatgpt_upload_and_query",
    "webai:claude:upload-and-query": "webai_claude_upload_and_query",
    "webai:gemini:upload-and-query": "webai_gemini_upload_and_query",
    "webai:chatgpt:generate-file": "webai_chatgpt_generate_file",
    "webai:claude:generate-file": "webai_claude_generate_file",
    "webai:chatgpt:generate-image": "webai_chatgpt_generate_image",
    "webai:gemini:generate-image": "webai_gemini_generate_image",
    "webai:gemini:canvas-to-docs": "webai_gemini_canvas_to_docs",
    "webai:gemini:generate-video": "webai_gemini_generate_video",
    "webai:gemini:deep-research": "webai_gemini_deep_research",
    "webai:gemini:canvas-edit": "webai_gemini_canvas_edit",
    "webai:gemini:conversation-manage": "webai_gemini_conversation_manage",
    "webai:gemini:workspace": "webai_gemini_workspace",
    "webai:gemini:music:generate": "webai_gemini_music_generate",
    "webai:gemini:music:download-track": "webai_gemini_music_download_track",
    "webai:gemini:music:task-status": "webai_gemini_music_task_status",
    "webai:chatgpt:codex:submit-task": "webai_chatgpt_codex_submit_task",
    "webai:chatgpt:codex:list-envs": "webai_chatgpt_codex_list_envs",
    "webai:chatgpt:codex:task-status": "webai_chatgpt_codex_task_status",
    "webai:chatgpt:codex:get-diff": "webai_chatgpt_codex_get_diff",
    "webai:chatgpt:canvas-export": "webai_chatgpt_canvas_export",
    "webai:chatgpt:pulse:get": "webai_chatgpt_pulse_get",
    "webai:chatgpt:pulse:onboard": "webai_chatgpt_pulse_onboard",
    "webai:chatgpt:deep-research": "webai_chatgpt_deep_research",
    "webai:claude:deep-research": "webai_claude_deep_research",
    "webai:chatgpt:conversation-manage": "webai_chatgpt_conversation_manage",
    "webai:claude:conversation-manage": "webai_claude_conversation_manage",
    "webai:chatgpt:workspace": "webai_chatgpt_workspace",
    "webai:claude:workspace": "webai_claude_workspace",
    "webai:claude:design:create-project": "webai_claude_design_create_project",
    "webai:claude:design:generate": "webai_claude_design_generate",
    "webai:claude:design:get-html": "webai_claude_design_get_html",
    "webai:claude:design:present": "webai_claude_design_present",
    "webai:task-status": "webai_task_status",
    "webai:literature-task-status": "webai_literature_task_status"
  };
  return map[command];
}


function wahMcpNameFromCli(command: string): string | undefined {
  const map: Record<string, string> = {
    "wah:capability:query": "wah_capability_query",
    "wah:adapter:health": "wah_adapter_health",
    "wah:policy:explain": "wah_policy_explain",
    "wah:task:start": "wah_task_start",
    "wah:task:status": "wah_task_status",
    "wah:task:cancel": "wah_task_cancel",
    "wah:task:resume": "wah_task_resume",
    "wah:artifact:get": "wah_artifact_get"
  };
  return map[command];
}

function wahArgsFromCli(options: Record<string, CliOptionValue>, positionals: string[]): Record<string, unknown> {
  const args: Record<string, unknown> = {
    target: asString(options.target),
    text: asString(options.text) || positionals[0],
    operation: asString(options.operation),
    provider: asString(options.provider),
    kind: asString(options.kind),
    manifest_id: asString(options["manifest-id"] || options.manifestId) || positionals[0],
    mcp_name: asString(options["mcp-name"] || options.mcpName),
    run_id: asString(options["run-id"] || options.runId) || positionals[0],
    artifact_id: asString(options["artifact-id"] || options.artifactId) || positionals[0],
    path: asString(options.path),
    reason: asString(options.reason),
    dry_run: asBoolean(options["dry-run"] || options.dryRun),
    confirmed: asBoolean(options.confirmed),
    limit: asNumber(options.limit)
  };
  const input = asString(options.input);
  if (input) args.input = JSON.parse(input);
  for (const key of Object.keys(args)) if (args[key] === undefined) delete args[key];
  return args;
}

function workflowInputsFromCli(value: CliOptionValue | undefined): Record<string, unknown> {
  const entries = Array.isArray(value) ? value : value === undefined ? [] : [value];
  const inputs: Record<string, unknown> = {};
  for (const entry of entries) {
    if (typeof entry !== "string") continue;
    const eq = entry.indexOf("=");
    if (eq < 1) throw new Error("workflow:run --input must use key=value");
    inputs[entry.slice(0, eq)] = entry.slice(eq + 1);
  }
  return inputs;
}

function existingFilePaths(value: CliOptionValue | undefined): string[] {
  const files = asStringList(value);
  if (!files.length) throw new Error("browser:upload requires --file <path>");
  const resolved = files.map((file) => path.resolve(file));
  const missing = resolved.filter((file) => !fs.existsSync(file));
  if (missing.length) throw new Error(`browser:upload file(s) not found: ${missing.join(", ")}`);
  return resolved;
}

async function withSession(fn: (session: BrowserSessionManager) => Promise<unknown>, options: Record<string, CliOptionValue> = {}): Promise<unknown> {
  const targetId = asString(options.target) || asString(options.site);
  const session = new BrowserSessionManager({ cdpEndpoint: asString(options.cdp), headless: options.headless === true, targetId });
  session.setDatabase(new CapabilityDatabase());
  try {
    await session.start();
    return await fn(session);
  } finally {
    if (!options["keep-open"]) await session.close();
  }
}

function targetBaseUrl(target?: string): string | undefined {
  if (!target) return undefined;
  return getWebAiAdapter(target)?.baseUrl;
}

function registeredTargetBaseUrl(db: CapabilityDatabase, target?: string): string | undefined {
  if (!target) return undefined;
  return db.listTargets().find((row) => row.target_id === target)?.base_url || targetBaseUrl(target);
}

function formatHealthCheckReport(report: HealthCheckReport): string {
  const lines = [
    `Health check for ${report.target_id}`,
    `Checked at: ${report.checked_at}`,
    `Total: ${report.total}  ok: ${report.ok}  missing: ${report.missing}  ambiguous: ${report.ambiguous}  blocked: ${report.blocked}  needs_review: ${report.needs_review}`,
    ""
  ];
  const rows = [
    ["Name", "Category", "Before", "Result", "Selectors"],
    ...report.items.map((item) => [item.name, item.category, item.status_before, item.result, String(item.selectors_checked.length)])
  ];
  const widths = rows[0].map((_, column) => Math.max(...rows.map((row) => row[column].length)));
  rows.forEach((row, index) => {
    lines.push(row.map((cell, column) => cell.padEnd(widths[column])).join("  "));
    if (index === 0) lines.push(widths.map((width) => "-".repeat(width)).join("  "));
  });
  return lines.join("\n");
}

async function withManagedPage(fn: (page: any) => Promise<unknown>, options: Record<string, CliOptionValue> = {}, targetUrl?: string): Promise<unknown> {
  const profile = asString(options.profile) || process.env.WAH_DEFAULT_PROFILE || "default";
  const tabId = asString(options["tab-id"] || options.tabId);
  const launcher = createManagedBrowserLauncher();
  const status = await launcher.launch({ profile, url: tabId ? undefined : targetUrl, cdpPort: asNumber(options["cdp-port"] || options.cdpPort) });
  const browser = await launcher.connectOverCdp(status);
  try {
    const page = await activeManagedPage(browser, targetUrl, tabId);
    const result = await fn(page);
    if (tabId) {
      const registry = new TabRegistry(getStoragePaths().dataDir);
      const entry = await registry.get(tabId);
      if (entry) await registry.register({ ...entry, url: page.url?.() || entry.url, status: "active" });
    }
    return result;
  } finally {
    await browser.close?.().catch(() => undefined);
  }
}


function postconditionFromCli(options: Record<string, CliOptionValue>): Partial<BrowserAction> {
  const untilDownload = options["until-download"] === true || options.untilDownload === true;
  const until = (untilDownload ? "download" : asString(options.until)) as BrowserAction["until"] | undefined;
  if (!until) return {};
  if (!["visible", "enabled", "stable", "download", "contentRegex"].includes(until)) throw new Error("--until must be one of visible|enabled|stable|download|contentRegex");
  const untilSelector = asString(options["until-selector"] || options.untilSelector);
  const untilContentRegex = asString(options["until-content-regex"] || options.untilContentRegex);
  if (["visible", "enabled", "stable", "contentRegex"].includes(until) && !untilSelector) throw new Error(`--until-selector is required when --until=${until}`);
  if (until === "contentRegex" && !untilContentRegex) throw new Error("--until-content-regex is required when --until=contentRegex");
  return {
    until,
    ...(untilSelector ? { untilSelector } : {}),
    ...(untilContentRegex ? { untilContentRegex } : {}),
    untilStableMs: asNumber(options["until-stable-ms"] || options.untilStableMs) ?? 1000,
    untilTimeoutMs: asNumber(options["until-timeout-ms"] || options.untilTimeoutMs) ?? 15000
  };
}

function artifactClickOptionsFromCli(options: Record<string, CliOptionValue>): any {
  return {
    profile: asString(options.profile) || "",
    url: asString(options.url),
    tabUrlContains: asString(options["tab-url-contains"] || options.tabUrlContains),
    buttonSelector: asString(options["button-selector"] || options.buttonSelector) || "",
    buttonAncestorText: asString(options["button-ancestor-text"] || options.buttonAncestorText),
    scrollIntoView: asString(options["scroll-into-view"] || options.scrollIntoView, "auto"),
    followUpSelector: asString(options["follow-up-selector"] || options.followUpSelector),
    followUpTextRegex: asString(options["follow-up-text-regex"] || options.followUpTextRegex),
    followUpAncestorText: asString(options["follow-up-ancestor-text"] || options.followUpAncestorText),
    frameTextFilter: asString(options["frame-text-filter"] || options.frameTextFilter),
    downloadDir: asString(options["download-dir"] || options.downloadDir) || "",
    filenamePattern: asString(options["filename-pattern"] || options.filenamePattern),
    renameTo: asString(options["rename-to"] || options.renameTo),
    verifyMinBytes: asNumber(options["verify-min-bytes"] || options.verifyMinBytes),
    timeoutMs: asNumber(options["timeout-ms"] || options.timeoutMs) ?? 60000,
    locateTimeoutMs: asNumber(options["locate-timeout-ms"] || options.locateTimeoutMs) ?? 8000,
    frameMinCount: asNumber(options["frame-min-count"] || options.frameMinCount) ?? 1,
    viewportWidth: asNumber(options["viewport-width"] || options.viewportWidth),
    viewportHeight: asNumber(options["viewport-height"] || options.viewportHeight),
    prerenderWaitMs: asNumber(options["prerender-wait-ms"] || options.prerenderWaitMs) ?? 0,
    scrollMainToY: asNumber(options["scroll-main-to-y"] || options.scrollMainToY),
    scrollMainWaitMs: asNumber(options["scroll-main-wait-ms"] || options.scrollMainWaitMs) ?? 1000,
    noDisconnect: options["no-disconnect"] === true || options.noDisconnect === true
  };
}

function browserActionFromCli(command: string, options: Record<string, CliOptionValue>): BrowserAction {
  const confirmed = asBoolean(options.confirmed);
  const base = confirmed === undefined ? {} : { confirmed };
  if (command === "browser:click") {
    const selector = asString(options.selector);
    if (!selector) throw new Error("browser:click requires --selector <css-or-xpath>");
    const timeoutMs = asNumber(options.ms);
    const expectDownload = asBoolean(options["expect-download"] || options.expectDownload);
    return { ...base, type: "click", selector, ...(timeoutMs === undefined ? {} : { timeoutMs }), ...(expectDownload ? { expectDownload: true } : {}), ...postconditionFromCli(options) };
  }
  if (command === "browser:type") {
    const selector = asString(options.selector);
    const text = asString(options.text);
    if (!selector) throw new Error("browser:type requires --selector <css-or-xpath>");
    if (text === undefined) throw new Error("browser:type requires --text <text>");
    return { ...base, type: "type", selector, text };
  }
  if (command === "browser:select") {
    const selector = asString(options.selector);
    const value = asString(options.value);
    if (!selector) throw new Error("browser:select requires --selector <css-or-xpath>");
    if (value === undefined) throw new Error("browser:select requires --value <value>");
    return { ...base, type: "select", selector, option: value };
  }
  if (command === "browser:upload") {
    const selector = asString(options.selector);
    if (!selector) throw new Error("browser:upload requires --selector <css-or-xpath>");
    return { ...base, type: "upload", selector, files: existingFilePaths(options.file), ...postconditionFromCli(options) };
  }
  if (command === "browser:hover") {
    const selector = asString(options.selector);
    if (!selector) throw new Error("browser:hover requires --selector <css-or-xpath>");
    const timeoutMs = asNumber(options.ms);
    const dwellMs = hasOption(options, "dwell-ms", "dwellMs") ? (asNumber(options["dwell-ms"] || options.dwellMs) ?? 450) : undefined;
    if (dwellMs !== undefined && (!Number.isInteger(dwellMs) || dwellMs < 0)) throw new Error("browser:hover --dwell-ms must be a non-negative integer");
    const settleSelector = asString(options["settle-selector"] || options.settleSelector);
    return {
      ...base,
      type: "hover",
      selector,
      ...(timeoutMs === undefined ? {} : { timeoutMs }),
      ...(dwellMs === undefined && !settleSelector ? {} : { dwellMs: dwellMs ?? 450 }),
      ...(settleSelector ? { settleSelector } : {})
    };
  }
  if (command === "browser:select-text") {
    const selector = asString(options.selector);
    if (!selector) throw new Error("browser:select-text requires --selector <css-or-xpath>");
    const start = asNumber(options.start);
    const end = asNumber(options.end);
    if ((start === undefined) !== (end === undefined)) throw new Error("browser:select-text requires both --start and --end when selecting by offsets");
    return { ...base, type: "select-text", selector, ...(start === undefined ? {} : { start, end }) };
  }
  if (command === "browser:drag") {
    const selector = asString(options.selector);
    const from = asPoint(options.from, "--from");
    const to = asPoint(options.to, "--to");
    const fromOffset = asPoint(options["from-offset"] || options.fromOffset, "--from-offset");
    const toOffset = asPoint(options["to-offset"] || options.toOffset, "--to-offset");
    const steps = asNumber(options.steps);
    const holdMs = asNumber(options["hold-ms"] || options.holdMs);
    if (selector && (from || to)) throw new Error("browser:drag accepts either --selector offsets or --from/--to, not both");
    if (!selector && (!from || !to)) throw new Error("browser:drag requires --selector <css-or-xpath> or both --from <x,y> and --to <x,y>");
    if ((from === undefined) !== (to === undefined)) throw new Error("browser:drag requires both --from and --to in absolute pixel mode");
    if (!selector && (fromOffset || toOffset)) throw new Error("browser:drag --from-offset/--to-offset require --selector");
    if (steps !== undefined && (!Number.isInteger(steps) || steps < 1)) throw new Error("browser:drag --steps must be a positive integer");
    if (holdMs !== undefined && (!Number.isInteger(holdMs) || holdMs < 0)) throw new Error("browser:drag --hold-ms must be a non-negative integer");
    return {
      ...base,
      type: "drag",
      ...(selector ? { selector } : { from, to }),
      ...(fromOffset ? { fromOffset } : {}),
      ...(toOffset ? { toOffset } : {}),
      steps: steps ?? 10,
      holdMs: holdMs ?? 0
    } as BrowserAction;
  }
  if (command === "browser:press") {
    const key = asString(options.key);
    if (!key) throw new Error("browser:press requires --key <keystroke>");
    const selector = asString(options.selector);
    return { ...base, type: "press", key, ...(selector ? { selector } : {}) };
  }
  if (command === "browser:wait") {
    const selector = asString(options.selector);
    const timeoutMs = asNumber(options.ms);
    const state = asString(options.state);
    if (state && !["visible", "hidden", "attached", "detached"].includes(state)) throw new Error("browser:wait --state must be one of visible|hidden|attached|detached");
    return {
      ...base,
      type: "wait",
      ...(selector ? { selector } : {}),
      waitFor: selector ? "selector" : "timeout",
      ...(timeoutMs === undefined ? {} : { timeoutMs }),
      ...(state ? { state } : {}),
      ...postconditionFromCli(options)
    } as BrowserAction;
  }
  throw new Error(`Unsupported browser action command: ${command}`);
}

async function runManagedBrowserAction(command: string, options: Record<string, CliOptionValue>): Promise<unknown> {
  const action = browserActionFromCli(command, options);
  return withManagedPage(async (page) => {
    const downloads = downloadManager();
    return new ActionExecutor({
      getActivePage: () => page,
      openUrl: async (url) => { await page.goto(url, { waitUntil: "domcontentloaded" }); return page; },
      downloads,
      profile: asString(options.profile) || process.env.WAH_DEFAULT_PROFILE || "default",
      tabId: asString(options["tab-id"] || options.tabId),
      artifacts: new ArtifactStore()
    }).execute(action);
  }, options, asString(options.url));
}

async function runBrowserDownloadUrl(options: Record<string, CliOptionValue>): Promise<unknown> {
  const url = asString(options.url);
  if (!url) throw new Error("browser:download-url requires --url <absolute-url>");
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw new Error("browser:download-url requires --url <absolute-url>"); }
  if (!/^https?:$/i.test(parsed.protocol)) throw new Error("browser:download-url supports only http(s) URLs");

  const action: BrowserAction = { type: "download", selector: url, confirmed: asBoolean(options.confirmed), riskyReason: `Direct URL download: ${url}` };
  assertActionPermitted(action, defaultConfirmationPolicy());

  return withManagedPage(async (page) => {
    const response = await page.request.get(url);
    if (!response.ok?.()) throw new Error(`download failed: HTTP ${response.status?.() ?? "unknown"}`);
    const headers = response.headers?.() || {};
    const filename = asString(options.filename) || contentDispositionFilename(headers["content-disposition"]) || filenameFromUrl(url);
    const body = await response.body();
    const manager = downloadManager();
    const record = await manager.saveBuffer({
      filename,
      bytes: Buffer.from(body),
      mimeType: headers["content-type"],
      sourceUrl: url,
      profile: asString(options.profile) || process.env.WAH_DEFAULT_PROFILE || "default",
      tabId: asString(options["tab-id"] || options.tabId)
    });
    const artifact = new ArtifactStore().recordFile("download", record.savedPath, { suggestedFilename: record.suggestedFilename, sourceUrl: url });
    return { ok: true, action: "browser:download-url", data: { savedPath: record.savedPath, suggestedFilename: record.suggestedFilename, mimeType: record.mimeType, bytes: record.sizeBytes, artifactId: artifact.path } };
  }, options);
}

function help(): string {
  return `Web AI Capability Database and Workflow Hub

${policyNotice()}

Core commands:
  consumer:health --target <id> --profile <name> [--json]

  browser:launch --profile <name> [--url <url>] [--cdp-port <port>] [--json]
  browser:status --profile <name> [--json]
  browser:pages --profile <name> [--json]
  browser:tab:alloc --profile <name> --url <url> --tab-id <id> [--json]
  browser:tab:list --profile <name> [--json]
  browser:tab:free --tab-id <id> [--json]
  browser:close --profile <name> --mode disconnect|close-process|leave-open [--release-lease] [--force] [--json]
  browser:profiles [--json]
  browser:audit [--output-json]

  capability:init-db [--json]
  capability:update --target <id> --profile <name> [--kind web-ai|research-database] [--fixture <html>] [--tab-id <id>] [--json]
  capability:health-check --target <id> --profile <name> [--url <url>] [--apply] [--json]
  capability:query --target <id> --text <query> [--json]
  capability:export --target <id> --out <path> [--json]
  capability:library:import [docs/capability-library.json] [--json]
  research:inventory:import [configs/research/research_inventory.json] [--stem-only] [--json]
  research:aiaa:search <query>|--query <query> [--area AllField|Title|Contrib|Keyword|AbstractText|Affiliation] [--page-size N] [--json]
  research:aiaa:filter <query>|--query <query> [--area <area>] [--after-year YYYY] [--before-year YYYY] [--series-key <key>] [--contrib-raw <author>] [--concept-id <id>] [--page-size N] [--json]
  research:aiaa:export <doi>|--doi <doi> [--format ris|bibtex|endnote|medlars] [--download-dir <abs>] --confirmed [--json]
  research:wos:search <query>|--query <query> [--page-size N] [--json]
  research:wos:filter <query>|--query <query> [--document-type Article] [--page-size N] [--json]
  research:wos:export <query>|--query <query> [--document-type Article] [--format bibtex|ris|tab|plain|excel|endnote] [--download-dir <abs>] --confirmed [--json]
  research:acm:search <query>|--query <query> [--area <area>] [--page-size N] [--json]
  research:acm:filter <query>|--query <query> [--area <area>] [--after-year YYYY] [--before-year YYYY] [--sort-by relevance|downloaded|cited] [--page-size N] [--json]
  research:acm:export <doi>|--doi <doi> [--format bibtex|endnote|acm] [--download-dir <abs>] --confirmed [--json]
  research:ieee:search <query>|--query <query> [--field <field>] [--page-size N] [--json]
  research:ieee:filter <query>|--query <query> [--field <field>] [--content-type Journals|Conferences|Books|Magazines|Early\ Access\ Articles] [--page-size N] [--json]
  research:ieee:export <query>|--query <query> [--field <field>] [--content-type <type>] [--format ris|bibtex|csv] [--download-dir <abs>] --confirmed [--json]
  research:acs:search <query>|--query <query> [--area <area>] [--title-query <query>] [--page-size N] [--json]
  research:acs:filter <query>|--query <query> [--area <area>] [--title-query <query>] [--earliest <range>] [--pub-type <type>] [--article-type <type>] [--article-subject <subject>] [--concept-id <id>] [--contrib-raw <author>] [--series-key <key>] [--publisher <publisher>] [--page-size N] [--json]
  research:acs:export <doi>|--doi <doi> [--format ris|bibtex] [--download-dir <abs>] --confirmed [--json]
  research:asme:search <query>|--query <query> [--page-size N] [--json]
  research:asme:filter <query>|--query <query> [--format <facet>] [--publisher <facet>] [--subject <facet>] [--journal <facet>] [--topic <facet>] [--from-date mm/dd/yyyy] [--to-date mm/dd/yyyy] [--page-size N] [--json]
  research:asme:export <doi>|--doi <doi> [--format ris|bibtex|endnote|refworks] [--download-dir <abs>] --confirmed [--json]
  research:rsc:search <query>|--query <query> [--area <area>] [--page-size N] [--json]
  research:rsc:filter <query>|--query <query> [--area <area>] [--access Open\ Access] [--page-size N] [--json]
  research:rsc:export <doi>|--doi <doi> [--article-url <url>] [--format ris|bibtex|endnote|medline|procite|referencemanager|refworks] [--download-dir <abs>] --confirmed [--json]
  research:wiley:search <query>|--query <query> [--area <area>] [--query2 <query>] [--area2 <area>] [--page-size N] [--json]
  research:wiley:filter <query>|--query <query> [--area <area>] [--query2 <query>] [--area2 <area>] [--after-year YYYY] [--before-year YYYY] [--series-key <key>] [--ppub <facet>] [--concept-id <id>] [--access] [--page-size N] [--json]
  research:wiley:export <doi>|--doi <doi> [--format txt|ris|endnote|bibtex|medlars|refworks] [--include-abstract] [--download-dir <abs>] --confirmed [--json]
  research:asce:search <query>|--query <query> [--query2 <query>] [--area <area>] [--area2 <area>] [--page-size N] [--json]
  research:asce:filter <query>|--query <query> [--query2 <query>] [--area <area>] [--area2 <area>] [--after-year YYYY] [--before-year YYYY] [--content-item-type <type>] [--contrib-raw <author>] [--concept-id <id>] [--publication <publication>] [--page-size N] [--json]
  research:asce:export <doi>|--doi <doi> [--format ris|bibtex|endnote|medlars] [--download-dir <abs>] --confirmed [--json]
  research:iop:search <query>|--query <query> [--page-size N] [--json]
  research:iop:filter <query>|--query <query> [--search-date-period anytime|lastThirtyDays|lastTwelveMonths|lastFiveYears] [--pub-type article|chapter|book] [--access-type open-access] [--journal-issn <issn>] [--order-by relevance|recent|oldest] [--page-size N] [--json]
  research:iop:export <doi>|--doi <doi> [--format ris|bibtex] [--download-dir <abs>] --confirmed [--json]
  research:tandf:search <query>|--query <query> [--area <area>] [--page-size N] [--json]
  research:tandf:filter <query>|--query <query> [--area <area>] [--after-year YYYY] [--before-year YYYY] [--content-item-type <type>] [--pub-type <type>] [--journal <journal>] [--access full|open] [--page-size N] [--json]
  research:tandf:export <doi>|--doi <doi> [--format ris|bibtex] [--download-dir <abs>] --confirmed [--json]
  research:sae:search <query>|--query <query> [--page-size N] [--json]
  research:sae:filter <query>|--query <query> [--facet <facet>] [--page-size N] [--json]
  research:sae:export <query>|--query <query> [--facet <facet>] [--format ris|bibtex|endnote|metadata] [--download-dir <abs>] --confirmed [--json]
  research:sciencedirect:search <query>|--query <query> [--date <year-range>] [--pub <title>] [--authors <authors>] [--tak <terms>] [--title <title>] [--doc-id <id>] [--json]
  research:sciencedirect:filter <query>|--query <query> [--article-type REV|FLA|CH|EN] [--year YYYY] [--access-type openaccess] [--facet-input-id <id>] [--json]
  research:sciencedirect:export <query>|--query <query> [--article-type REV|FLA|CH|EN] [--year YYYY] [--access-type openaccess] [--format ris|bibtex|text|refworks] [--download-dir <abs>] --confirmed [--json]
  research:aps:search [<query>|--query <query>] [--field <field>] [--page-size N] [--json]
  research:aps:filter [<query>|--query <query>] [--field <field>] [--date-range week|month|year] [--page-size N] [--json]
  research:aps:export <doi>|--doi <doi> [--journal-code <code>] [--article-url <url>] [--format ris|bibtex] [--download-dir <abs>] --confirmed [--json]
  research:emerald:search <query>|--query <query> [--mode Any|All|Exact\ Phrase] [--page-size N] [--json]
  research:emerald:filter <query>|--query <query> [--content-type <type>] [--subject <subject>] [--case-provider <provider>] [--page-size N] [--json]
  research:emerald:export <doi>|--doi <doi> [--format ris|bibtex|endnote|refworks] [--download-dir <abs>] --confirmed [--json]
  research:cambridge:search <query>|--query <query> [--page-size N] [--json]
  research:cambridge:filter <query>|--query <query> [--product-type JOURNAL_ARTICLE|BOOK_PART|BOOK|ELEMENT] [--open-access <value>] [--only-show-available] [--start-year YYYY] [--end-year YYYY] [--sort <value>] [--page-size N] [--json]
  research:cambridge:export [--query <query>] [--product-id <id>] [--format ris|bibtex|word|text] [--download-dir <abs>] --confirmed [--json]
  research:springer:search <query>|--query <query> [--title <title>] [--contributor <name>] [--journal <journal>] [--date-from YYYY] [--date-to YYYY] [--page N] [--json]
  research:springer:filter <query>|--query <query> [--content-type <type>] [--open-access <value>] [--language <value>] [--taxonomy <value>] [--discipline <value>] [--sub-discipline <value>] [--sustainable-development-goal <value>] [--json]
  research:springer:export [--doi <doi>] [--format ris|csv] [--bulk-export] [--download-dir <abs>] --confirmed [--json]
  research:nature:search <query>|--query <query> [--start-year YYYY] [--end-year YYYY] [--order relevance|date_desc] [--json]
  research:nature:filter <query>|--query <query> [--article-type research|reviews] [--journal <journal>] [--subject <subject>] [--date-range <range>] [--facet-param <param>] [--facet-value <value>] [--json]
  research:nature:export <doi>|--doi <doi> [--format ris] [--download-dir <abs>] --confirmed [--json]
  research:iet:search <query>|--query <query> [--area <area>] [--page-size N] [--json]
  research:iet:filter <query>|--query <query> [--area <area>] [--ppub <range>] [--after-year YYYY] [--before-year YYYY] [--concept-id <id>] [--contrib-raw <author>] [--series-key <key>] [--alphabet-range <range>] [--page-size N] [--json]
  research:iet:export <doi>|--doi <doi> [--format ris|endnote|bibtex|medlars|refworks] [--download-dir <abs>] --confirmed [--json]
  research:aip:search <query>|--query <query> [--page-size N] [--json]
  research:aip:filter <query>|--query <query> [--content-type <type>] [--journal <journal>] [--subject <subject>] [--article-type <type>] [--book-series <series>] [--issue-section <section>] [--collection <collection>] [--from-date YYYY/MM/DD] [--to-date YYYY/MM/DD] [--page-size N] [--json]
  research:aip:export <doi>|--doi <doi> [--format ris|bibtex|endnote|refworks] [--download-dir <abs>] --confirmed [--json]
  research:mdpi:search <query>|--query <query> [--journal <key>] [--article-type <key>] [--year-from YYYY] [--year-to YYYY] [--view default|abstract|compact] [--page-count N] [--json]
  research:mdpi:filter <query>|--query <query> [--journal <key>] [--article-type <key>] [--year-from YYYY] [--year-to YYYY] [--country <value>] [--subject <value>] [--view default|abstract|compact] [--page-count N] [--json]
  research:mdpi:export [--article-url <url>|--article-path <path>] [--doi <doi>] [--format bibtex|endnote|ris] [--download-dir <abs>] --confirmed [--json]
  research:optica:search <query>|--query <query> [--page-size N] [--json]
  research:optica:filter <query>|--query <query> [--year YYYY] [--page-size N] [--json]
  research:optica:export <query>|--query <query> --article-id <id> [--format bibtex|ris] [--download-dir <abs>] --confirmed [--json]
  research:proquest:search <query>|--query <query> [--page-size N] [--json]
  research:proquest:filter <query>|--query <query> [--full-text] [--peer-reviewed] [--page-size N] [--json]
  research:proquest:export <query>|--query <query> [--full-text] [--peer-reviewed] [--format ris] [--download-dir <abs>] --confirmed [--json]
  research:frontiers:search <query>|--query <query> [--page-size N] [--json]
  research:frontiers:filter <query>|--query <query> --group <group> --option-id <id> [--option-label <label>] [--page-size N] [--json]
  research:frontiers:export <doi>|--doi <doi> [--journal-slug <slug>|--article-url <url>] [--format bibtex|endnote|reference] [--download-dir <abs>] --confirmed [--json]
  research:arxiv:search [<query>|--query <query>] [--field <field>] [--page-size N] [--json]
  research:arxiv:filter [<query>|--query <query>] [--field <field>] [--subject <classification>] [--date-filter-by all_dates|past_12|specific_year|date_range] [--year YYYY] [--page-size N] [--json]
  research:arxiv:export <id>|--id <id> [--format bibtex] [--download-dir <abs>] --confirmed [--json]
  research:siam:search <query>|--query <query> [--area <area>] [--page-size N] [--json]
  research:siam:filter <query>|--query <query> [--area <area>] [--after-year YYYY] [--before-year YYYY] [--pub-type <type>] [--series-key <key>] [--contrib-raw <author>] [--concept-id <id>] [--page-size N] [--json]
  research:siam:export <doi>|--doi <doi> [--format ris|endnote|bibtex|medlars|refworks] [--download-dir <abs>] --confirmed [--json]
  research:degruyter:search [--title <title>] [--family-name <name>] [--reference <doi|isbn|issn>] [--match all|any] [--min-pub-year YYYY] [--max-pub-year YYYY] [--document-types <type[,type]>] [--json]
  research:degruyter:filter [--title <title>] [--family-name <name>] [--reference <doi|isbn|issn>] [--document-type-facet <facet>] [--subject <facet>] [--publisher <facet>] [--language <facet>] [--access <facet>] [--pub-date <facet>] [--json]
  research:degruyter:export <doi>|--doi <doi> [--format ris|bibtex|endnote] [--download-dir <abs>] --confirmed [--json]
  research:worldsci:search <query>|--query <query> [--area <area>] [--page-size N] [--json]
  research:worldsci:filter <query>|--query <query> [--area <area>] [--pub-type <type>] [--content-item-type <type>] [--after-year YYYY] [--before-year YYYY] [--access full|open] [--page-size N] [--json]
  research:worldsci:export <doi>|--doi <doi> [--format ris|bibtex] [--download-dir <abs>] --confirmed [--json]
  research:royalsoc:search <query>|--query <query> [--page N] [--json]
  research:royalsoc:filter <query>|--query <query> [--journal <name>] [--article-type <type>] [--subject-id <id>] [--issue-section <section>] [--page N] [--json]
  research:royalsoc:export [<doi>|--doi <doi>] [--resource-id <id>] [--format ris|endnote|bibtex|refworks] [--download-dir <abs>] --confirmed [--json]
  research:scoap3:search <query>|--query <query> [--page N] [--size N] [--sort <sort>] [--json]
  research:scoap3:filter <query>|--query <query> [--journal <value>] [--country <value>] [--country-logic AND|OR] [--publication-year-gte YYYY] [--publication-year-lte YYYY] [--json]
  research:scoap3:export [--query <query>] [--record-id <id>] [--format csv|json] [--download-dir <abs>] --confirmed [--json]
  research:dblp:search <query>|--query <query> [--mode combined|author|venue|publ] [--json]
  research:dblp:filter <query>|--query <query> [--mode <mode>] [--refine-token <token>] [--type <type>] [--year YYYY] [--author-token <token>] [--venue-token <token>] [--access-token <token>] [--json]
  research:dblp:export [--key <key>|--query <query>] [--format bibtex|xml|json] [--bulk] [--h N] [--download-dir <abs>] --confirmed [--json]
  research:scielo:search <query>|--query <query> [--lang <lang>] [--count N] [--from N] [--page N] [--sort <sort>] [--json]
  research:scielo:filter <query>|--query <query> [--collection <value>] [--country <value>] [--journal-title <title>] [--language <lang>] [--year-cluster YYYY] [--subject-area <value>] [--json]
  research:scielo:export <query>|--query <query> [--export-format ris|bibtex|citation|csv] [--selection current_page|all_results|selection] [--download-dir <abs>] --confirmed [--json]
  research:inspirehep:search <query>|--query <query> [--page-size N] [--json]
  research:inspirehep:filter <query>|--query <query> [--doc-type <type>] [--author-count <value>] [--rpp <value>] [--author <name>] [--subject <subject>] [--arxiv-category <cat>] [--collaboration <name>] [--earliest-date <range>] [--facet <facet>] [--facet-value <value>] [--json]
  research:inspirehep:export [--control-number <id>|--query <query>] [--doc-type <type>] [--size N] [--format bibtex|latex-eu|latex-us|json|cv] [--download-dir <abs>] --confirmed [--json]
  research:pubscholar:search <query>|--query <query> [--keyword <keyword>] [--field <field>] [--page-size N] [--json]
  research:pubscholar:filter <query>|--query <query> [--keyword <keyword>] [--field <field>] [--facet-group <group>] [--facet-value <value>] [--publication-year YYYY] [--resource-type <type>] [--full-text] [--json]
  research:pubscholar:export <query>|--query <query> [--keyword <keyword>] [--field <field>] [--format ris] [--download-dir <abs>] --confirmed [--json]
  research:opticsjournal:search <query>|--query <query> [--field-type title|author|keyword|affiliation|first_author|first_affiliation|abstract|doi|cstr] [--journal-scope <value>] [--year-from YYYY] [--year-to YYYY] [--page-size N] [--json]
  research:opticsjournal:filter <query>|--query <query> [--facet journal|pubyear|author|topic_cn|topic_en] [--facet-value <value>] [--journal-code <code>] [--pubyear YYYY] [--author <name>] [--topic-cn <value>] [--topic-en <value>] [--json]
  research:opticsjournal:export <query>|--query <query> [--format enw|ref|txt|xml] [--download-dir <abs>] --confirmed [--json]
  research:crc:search [<query>|--query <query>] [--title <title>] [--author <author>] [--keyword <keyword>] [--page-size N] [--json]
  research:crc:filter [<query>|--query <query>] [--access-facet <facet>] [--open-access] [--free-to-view] [--access-content] [--licensed-content] [--include-forthcoming] [--fully-oa-books] [--books-with-oa-chapters] [--year-from YYYY] [--year-to YYYY] [--json]
  research:crc:export [<query>|--query <query>] [--format csv] [--download-dir <abs>] --confirmed [--json]
  research:cellpress:search <query>|--query <query> [--area AllField|Title|Contrib|Keyword|Abstract|AbstractTitleKeywordFilterField] [--page-size N] [--json]
  research:cellpress:filter <query>|--query <query> [--content-item-type <type>] [--after-year YYYY] [--before-year YYYY] [--author <author>] [--journal <journal>] [--collection <collection>] [--keyword <keyword>] [--access full|open] [--sort-by <value>] [--json]
  research:cellpress:export <pii>|--pii <pii> [--format ris] [--download-dir <abs>] --confirmed [--json]
  research:iest:search <query>|--query <query> [--field all|alternative-title|publisher|affiliation|subject|abstract|fulltext|title|identifier|author] [--page-size N] [--json]
  research:iest:filter <query>|--query <query> [--access <value>] [--type <value>] [--from-year YYYY] [--to-year YYYY] [--refine-query <query>] [--refine-field <field>] [--json]
  research:iest:export [--article-url <url>|--article-path <path>] [--format ris|bib|enw] [--download-dir <abs>] --confirmed [--json]
  research:incopat:search <query>|--query <query> [--page-size N] [--json]
  research:incopat:filter <query>|--query <query> [--country CN|US|KR|WO|EP] [--page-size N] [--json]
  research:incopat:export <query>|--query <query> [--country <code>] [--format pdf] [--download-dir <abs>] --confirmed [--json]
  research:wanfang:search <query>|--query <query> [--page-size N] [--json]
  research:wanfang:filter <query>|--query <query> [--resource-type Thesis|Periodical|Conference|Patent] [--resource-label <label>] [--page-size N] [--json]
  research:wanfang:export <query>|--query <query> [--resource-type Thesis|Periodical|Conference|Patent] [--resource-label <label>] [--format txt] [--download-dir <abs>] [--row-index N] --confirmed [--json]

  workflow:list [--json]
  workflow:compile <workflow.yaml|json> [--json]
  workflow:test <workflow.yaml|json> [--json]
  workflow:run <workflow.yaml|json> [--dry-run] [--resume <run-id>] [--confirm-replay] [--no-redact] [--json]
  verify:docx-min --path <abs> [--min-paragraphs N] [--min-chars N] [--topic-regex <pattern>] [--no-sha256] [--output-json]

  site:registry:import <site_registry.json> [--json]
  research:inventory:import [configs/research/research_inventory.json] [--stem-only] [--json]
  research:aiaa:search <query>|--query <query> [--area AllField|Title|Contrib|Keyword|AbstractText|Affiliation] [--page-size N] [--json]
  research:aiaa:filter <query>|--query <query> [--area <area>] [--after-year YYYY] [--before-year YYYY] [--series-key <key>] [--contrib-raw <author>] [--concept-id <id>] [--page-size N] [--json]
  research:aiaa:export <doi>|--doi <doi> [--format ris|bibtex|endnote|medlars] [--download-dir <abs>] --confirmed [--json]
  research:wos:search <query>|--query <query> [--page-size N] [--json]
  research:wos:filter <query>|--query <query> [--document-type Article] [--page-size N] [--json]
  research:wos:export <query>|--query <query> [--document-type Article] [--format bibtex|ris|tab|plain|excel|endnote] [--download-dir <abs>] --confirmed [--json]
  research:acm:search <query>|--query <query> [--area <area>] [--page-size N] [--json]
  research:acm:filter <query>|--query <query> [--area <area>] [--after-year YYYY] [--before-year YYYY] [--sort-by relevance|downloaded|cited] [--page-size N] [--json]
  research:acm:export <doi>|--doi <doi> [--format bibtex|endnote|acm] [--download-dir <abs>] --confirmed [--json]
  research:ieee:search <query>|--query <query> [--field <field>] [--page-size N] [--json]
  research:ieee:filter <query>|--query <query> [--field <field>] [--content-type Journals|Conferences|Books|Magazines|Early\ Access\ Articles] [--page-size N] [--json]
  research:ieee:export <query>|--query <query> [--field <field>] [--content-type <type>] [--format ris|bibtex|csv] [--download-dir <abs>] --confirmed [--json]
  research:acs:search <query>|--query <query> [--area <area>] [--title-query <query>] [--page-size N] [--json]
  research:acs:filter <query>|--query <query> [--area <area>] [--title-query <query>] [--earliest <range>] [--pub-type <type>] [--article-type <type>] [--article-subject <subject>] [--concept-id <id>] [--contrib-raw <author>] [--series-key <key>] [--publisher <publisher>] [--page-size N] [--json]
  research:acs:export <doi>|--doi <doi> [--format ris|bibtex] [--download-dir <abs>] --confirmed [--json]
  research:asme:search <query>|--query <query> [--page-size N] [--json]
  research:asme:filter <query>|--query <query> [--format <facet>] [--publisher <facet>] [--subject <facet>] [--journal <facet>] [--topic <facet>] [--from-date mm/dd/yyyy] [--to-date mm/dd/yyyy] [--page-size N] [--json]
  research:asme:export <doi>|--doi <doi> [--format ris|bibtex|endnote|refworks] [--download-dir <abs>] --confirmed [--json]
  research:rsc:search <query>|--query <query> [--area <area>] [--page-size N] [--json]
  research:rsc:filter <query>|--query <query> [--area <area>] [--access Open\ Access] [--page-size N] [--json]
  research:rsc:export <doi>|--doi <doi> [--article-url <url>] [--format ris|bibtex|endnote|medline|procite|referencemanager|refworks] [--download-dir <abs>] --confirmed [--json]
  research:wiley:search <query>|--query <query> [--area <area>] [--query2 <query>] [--area2 <area>] [--page-size N] [--json]
  research:wiley:filter <query>|--query <query> [--area <area>] [--query2 <query>] [--area2 <area>] [--after-year YYYY] [--before-year YYYY] [--series-key <key>] [--ppub <facet>] [--concept-id <id>] [--access] [--page-size N] [--json]
  research:wiley:export <doi>|--doi <doi> [--format txt|ris|endnote|bibtex|medlars|refworks] [--include-abstract] [--download-dir <abs>] --confirmed [--json]
  research:asce:search <query>|--query <query> [--query2 <query>] [--area <area>] [--area2 <area>] [--page-size N] [--json]
  research:asce:filter <query>|--query <query> [--query2 <query>] [--area <area>] [--area2 <area>] [--after-year YYYY] [--before-year YYYY] [--content-item-type <type>] [--contrib-raw <author>] [--concept-id <id>] [--publication <publication>] [--page-size N] [--json]
  research:asce:export <doi>|--doi <doi> [--format ris|bibtex|endnote|medlars] [--download-dir <abs>] --confirmed [--json]
  research:iop:search <query>|--query <query> [--page-size N] [--json]
  research:iop:filter <query>|--query <query> [--search-date-period anytime|lastThirtyDays|lastTwelveMonths|lastFiveYears] [--pub-type article|chapter|book] [--access-type open-access] [--journal-issn <issn>] [--order-by relevance|recent|oldest] [--page-size N] [--json]
  research:iop:export <doi>|--doi <doi> [--format ris|bibtex] [--download-dir <abs>] --confirmed [--json]
  research:tandf:search <query>|--query <query> [--area <area>] [--page-size N] [--json]
  research:tandf:filter <query>|--query <query> [--area <area>] [--after-year YYYY] [--before-year YYYY] [--content-item-type <type>] [--pub-type <type>] [--journal <journal>] [--access full|open] [--page-size N] [--json]
  research:tandf:export <doi>|--doi <doi> [--format ris|bibtex] [--download-dir <abs>] --confirmed [--json]
  research:sae:search <query>|--query <query> [--page-size N] [--json]
  research:sae:filter <query>|--query <query> [--facet <facet>] [--page-size N] [--json]
  research:sae:export <query>|--query <query> [--facet <facet>] [--format ris|bibtex|endnote|metadata] [--download-dir <abs>] --confirmed [--json]
  research:sciencedirect:search <query>|--query <query> [--date <year-range>] [--pub <title>] [--authors <authors>] [--tak <terms>] [--title <title>] [--doc-id <id>] [--json]
  research:sciencedirect:filter <query>|--query <query> [--article-type REV|FLA|CH|EN] [--year YYYY] [--access-type openaccess] [--facet-input-id <id>] [--json]
  research:sciencedirect:export <query>|--query <query> [--article-type REV|FLA|CH|EN] [--year YYYY] [--access-type openaccess] [--format ris|bibtex|text|refworks] [--download-dir <abs>] --confirmed [--json]
  research:aps:search [<query>|--query <query>] [--field <field>] [--page-size N] [--json]
  research:aps:filter [<query>|--query <query>] [--field <field>] [--date-range week|month|year] [--page-size N] [--json]
  research:aps:export <doi>|--doi <doi> [--journal-code <code>] [--article-url <url>] [--format ris|bibtex] [--download-dir <abs>] --confirmed [--json]
  research:emerald:search <query>|--query <query> [--mode Any|All|Exact\ Phrase] [--page-size N] [--json]
  research:emerald:filter <query>|--query <query> [--content-type <type>] [--subject <subject>] [--case-provider <provider>] [--page-size N] [--json]
  research:emerald:export <doi>|--doi <doi> [--format ris|bibtex|endnote|refworks] [--download-dir <abs>] --confirmed [--json]
  research:cambridge:search <query>|--query <query> [--page-size N] [--json]
  research:cambridge:filter <query>|--query <query> [--product-type JOURNAL_ARTICLE|BOOK_PART|BOOK|ELEMENT] [--open-access <value>] [--only-show-available] [--start-year YYYY] [--end-year YYYY] [--sort <value>] [--page-size N] [--json]
  research:cambridge:export [--query <query>] [--product-id <id>] [--format ris|bibtex|word|text] [--download-dir <abs>] --confirmed [--json]
  research:springer:search <query>|--query <query> [--title <title>] [--contributor <name>] [--journal <journal>] [--date-from YYYY] [--date-to YYYY] [--page N] [--json]
  research:springer:filter <query>|--query <query> [--content-type <type>] [--open-access <value>] [--language <value>] [--taxonomy <value>] [--discipline <value>] [--sub-discipline <value>] [--sustainable-development-goal <value>] [--json]
  research:springer:export [--doi <doi>] [--format ris|csv] [--bulk-export] [--download-dir <abs>] --confirmed [--json]
  research:nature:search <query>|--query <query> [--start-year YYYY] [--end-year YYYY] [--order relevance|date_desc] [--json]
  research:nature:filter <query>|--query <query> [--article-type research|reviews] [--journal <journal>] [--subject <subject>] [--date-range <range>] [--facet-param <param>] [--facet-value <value>] [--json]
  research:nature:export <doi>|--doi <doi> [--format ris] [--download-dir <abs>] --confirmed [--json]
  research:iet:search <query>|--query <query> [--area <area>] [--page-size N] [--json]
  research:iet:filter <query>|--query <query> [--area <area>] [--ppub <range>] [--after-year YYYY] [--before-year YYYY] [--concept-id <id>] [--contrib-raw <author>] [--series-key <key>] [--alphabet-range <range>] [--page-size N] [--json]
  research:iet:export <doi>|--doi <doi> [--format ris|endnote|bibtex|medlars|refworks] [--download-dir <abs>] --confirmed [--json]
  research:aip:search <query>|--query <query> [--page-size N] [--json]
  research:aip:filter <query>|--query <query> [--content-type <type>] [--journal <journal>] [--subject <subject>] [--article-type <type>] [--book-series <series>] [--issue-section <section>] [--collection <collection>] [--from-date YYYY/MM/DD] [--to-date YYYY/MM/DD] [--page-size N] [--json]
  research:aip:export <doi>|--doi <doi> [--format ris|bibtex|endnote|refworks] [--download-dir <abs>] --confirmed [--json]
  research:mdpi:search <query>|--query <query> [--journal <key>] [--article-type <key>] [--year-from YYYY] [--year-to YYYY] [--view default|abstract|compact] [--page-count N] [--json]
  research:mdpi:filter <query>|--query <query> [--journal <key>] [--article-type <key>] [--year-from YYYY] [--year-to YYYY] [--country <value>] [--subject <value>] [--view default|abstract|compact] [--page-count N] [--json]
  research:mdpi:export [--article-url <url>|--article-path <path>] [--doi <doi>] [--format bibtex|endnote|ris] [--download-dir <abs>] --confirmed [--json]
  research:optica:search <query>|--query <query> [--page-size N] [--json]
  research:optica:filter <query>|--query <query> [--year YYYY] [--page-size N] [--json]
  research:optica:export <query>|--query <query> --article-id <id> [--format bibtex|ris] [--download-dir <abs>] --confirmed [--json]
  research:proquest:search <query>|--query <query> [--page-size N] [--json]
  research:proquest:filter <query>|--query <query> [--full-text] [--peer-reviewed] [--page-size N] [--json]
  research:proquest:export <query>|--query <query> [--full-text] [--peer-reviewed] [--format ris] [--download-dir <abs>] --confirmed [--json]
  research:frontiers:search <query>|--query <query> [--page-size N] [--json]
  research:frontiers:filter <query>|--query <query> --group <group> --option-id <id> [--option-label <label>] [--page-size N] [--json]
  research:frontiers:export <doi>|--doi <doi> [--journal-slug <slug>|--article-url <url>] [--format bibtex|endnote|reference] [--download-dir <abs>] --confirmed [--json]
  research:arxiv:search [<query>|--query <query>] [--field <field>] [--page-size N] [--json]
  research:arxiv:filter [<query>|--query <query>] [--field <field>] [--subject <classification>] [--date-filter-by all_dates|past_12|specific_year|date_range] [--year YYYY] [--page-size N] [--json]
  research:arxiv:export <id>|--id <id> [--format bibtex] [--download-dir <abs>] --confirmed [--json]
  research:siam:search <query>|--query <query> [--area <area>] [--page-size N] [--json]
  research:siam:filter <query>|--query <query> [--area <area>] [--after-year YYYY] [--before-year YYYY] [--pub-type <type>] [--series-key <key>] [--contrib-raw <author>] [--concept-id <id>] [--page-size N] [--json]
  research:siam:export <doi>|--doi <doi> [--format ris|endnote|bibtex|medlars|refworks] [--download-dir <abs>] --confirmed [--json]
  research:degruyter:search [--title <title>] [--family-name <name>] [--reference <doi|isbn|issn>] [--match all|any] [--min-pub-year YYYY] [--max-pub-year YYYY] [--document-types <type[,type]>] [--json]
  research:degruyter:filter [--title <title>] [--family-name <name>] [--reference <doi|isbn|issn>] [--document-type-facet <facet>] [--subject <facet>] [--publisher <facet>] [--language <facet>] [--access <facet>] [--pub-date <facet>] [--json]
  research:degruyter:export <doi>|--doi <doi> [--format ris|bibtex|endnote] [--download-dir <abs>] --confirmed [--json]
  research:worldsci:search <query>|--query <query> [--area <area>] [--page-size N] [--json]
  research:worldsci:filter <query>|--query <query> [--area <area>] [--pub-type <type>] [--content-item-type <type>] [--after-year YYYY] [--before-year YYYY] [--access full|open] [--page-size N] [--json]
  research:worldsci:export <doi>|--doi <doi> [--format ris|bibtex] [--download-dir <abs>] --confirmed [--json]
  research:royalsoc:search <query>|--query <query> [--page N] [--json]
  research:royalsoc:filter <query>|--query <query> [--journal <name>] [--article-type <type>] [--subject-id <id>] [--issue-section <section>] [--page N] [--json]
  research:royalsoc:export [<doi>|--doi <doi>] [--resource-id <id>] [--format ris|endnote|bibtex|refworks] [--download-dir <abs>] --confirmed [--json]
  research:scoap3:search <query>|--query <query> [--page N] [--size N] [--sort <sort>] [--json]
  research:scoap3:filter <query>|--query <query> [--journal <value>] [--country <value>] [--country-logic AND|OR] [--publication-year-gte YYYY] [--publication-year-lte YYYY] [--json]
  research:scoap3:export [--query <query>] [--record-id <id>] [--format csv|json] [--download-dir <abs>] --confirmed [--json]
  research:dblp:search <query>|--query <query> [--mode combined|author|venue|publ] [--json]
  research:dblp:filter <query>|--query <query> [--mode <mode>] [--refine-token <token>] [--type <type>] [--year YYYY] [--author-token <token>] [--venue-token <token>] [--access-token <token>] [--json]
  research:dblp:export [--key <key>|--query <query>] [--format bibtex|xml|json] [--bulk] [--h N] [--download-dir <abs>] --confirmed [--json]
  research:scielo:search <query>|--query <query> [--lang <lang>] [--count N] [--from N] [--page N] [--sort <sort>] [--json]
  research:scielo:filter <query>|--query <query> [--collection <value>] [--country <value>] [--journal-title <title>] [--language <lang>] [--year-cluster YYYY] [--subject-area <value>] [--json]
  research:scielo:export <query>|--query <query> [--export-format ris|bibtex|citation|csv] [--selection current_page|all_results|selection] [--download-dir <abs>] --confirmed [--json]
  research:inspirehep:search <query>|--query <query> [--page-size N] [--json]
  research:inspirehep:filter <query>|--query <query> [--doc-type <type>] [--author-count <value>] [--rpp <value>] [--author <name>] [--subject <subject>] [--arxiv-category <cat>] [--collaboration <name>] [--earliest-date <range>] [--facet <facet>] [--facet-value <value>] [--json]
  research:inspirehep:export [--control-number <id>|--query <query>] [--doc-type <type>] [--size N] [--format bibtex|latex-eu|latex-us|json|cv] [--download-dir <abs>] --confirmed [--json]
  research:pubscholar:search <query>|--query <query> [--keyword <keyword>] [--field <field>] [--page-size N] [--json]
  research:pubscholar:filter <query>|--query <query> [--keyword <keyword>] [--field <field>] [--facet-group <group>] [--facet-value <value>] [--publication-year YYYY] [--resource-type <type>] [--full-text] [--json]
  research:pubscholar:export <query>|--query <query> [--keyword <keyword>] [--field <field>] [--format ris] [--download-dir <abs>] --confirmed [--json]
  research:opticsjournal:search <query>|--query <query> [--field-type title|author|keyword|affiliation|first_author|first_affiliation|abstract|doi|cstr] [--journal-scope <value>] [--year-from YYYY] [--year-to YYYY] [--page-size N] [--json]
  research:opticsjournal:filter <query>|--query <query> [--facet journal|pubyear|author|topic_cn|topic_en] [--facet-value <value>] [--journal-code <code>] [--pubyear YYYY] [--author <name>] [--topic-cn <value>] [--topic-en <value>] [--json]
  research:opticsjournal:export <query>|--query <query> [--format enw|ref|txt|xml] [--download-dir <abs>] --confirmed [--json]
  research:crc:search [<query>|--query <query>] [--title <title>] [--author <author>] [--keyword <keyword>] [--page-size N] [--json]
  research:crc:filter [<query>|--query <query>] [--access-facet <facet>] [--open-access] [--free-to-view] [--access-content] [--licensed-content] [--include-forthcoming] [--fully-oa-books] [--books-with-oa-chapters] [--year-from YYYY] [--year-to YYYY] [--json]
  research:crc:export [<query>|--query <query>] [--format csv] [--download-dir <abs>] --confirmed [--json]
  research:cellpress:search <query>|--query <query> [--area AllField|Title|Contrib|Keyword|Abstract|AbstractTitleKeywordFilterField] [--page-size N] [--json]
  research:cellpress:filter <query>|--query <query> [--content-item-type <type>] [--after-year YYYY] [--before-year YYYY] [--author <author>] [--journal <journal>] [--collection <collection>] [--keyword <keyword>] [--access full|open] [--sort-by <value>] [--json]
  research:cellpress:export <pii>|--pii <pii> [--format ris] [--download-dir <abs>] --confirmed [--json]
  research:iest:search <query>|--query <query> [--field all|alternative-title|publisher|affiliation|subject|abstract|fulltext|title|identifier|author] [--page-size N] [--json]
  research:iest:filter <query>|--query <query> [--access <value>] [--type <value>] [--from-year YYYY] [--to-year YYYY] [--refine-query <query>] [--refine-field <field>] [--json]
  research:iest:export [--article-url <url>|--article-path <path>] [--format ris|bib|enw] [--download-dir <abs>] --confirmed [--json]
  research:incopat:search <query>|--query <query> [--page-size N] [--json]
  research:incopat:filter <query>|--query <query> [--country CN|US|KR|WO|EP] [--page-size N] [--json]
  research:incopat:export <query>|--query <query> [--country <code>] [--format pdf] [--download-dir <abs>] --confirmed [--json]
  research:wanfang:search <query>|--query <query> [--page-size N] [--json]
  research:wanfang:filter <query>|--query <query> [--resource-type Thesis|Periodical|Conference|Patent] [--resource-label <label>] [--page-size N] [--json]
  research:wanfang:export <query>|--query <query> [--resource-type Thesis|Periodical|Conference|Patent] [--resource-label <label>] [--format txt] [--download-dir <abs>] [--row-index N] --confirmed [--json]
  capability:library:import [docs/capability-library.json] [--json]
  site:capture-map --site <id> [--profile research-default] [--fixture <html>] [--json]
  scheduler:run --interval-minutes <n> [--json]

MCP and compatibility commands:
  webai:chatgpt:send-prompt|webai:claude:send-prompt|webai:gemini:send-prompt --profile <name> --prompt <text> [--response-timeout-ms <ms>] [--reuse-conversation] [--output-json]
  webai:chatgpt:select-model|webai:claude:select-model --profile <name> [--model <picker label>] [--thinking-level <auto|extended>] [--output-json]
  webai:gemini:select-model --profile <name> [--model <3.1-flash-lite|3.5-flash|3.1-pro>] [--thinking-level <standard|extended>] [--output-json]
  webai:chatgpt:upload-and-query|webai:claude:upload-and-query|webai:gemini:upload-and-query --profile <name> --file <path> --prompt <text> [--output-json]
  webai:chatgpt:generate-file|webai:claude:generate-file --profile <name> --prompt <text> --expected-extension <ext> --download-dir <abs> [--output-json]
  webai:chatgpt:generate-image|webai:gemini:generate-image --profile <name> --prompt <text> --download-dir <abs> [--output-json]
  webai:gemini:canvas-to-docs --profile <name> --prompt <text> [--title <title>] [--output-json]
  webai:gemini:generate-video --profile <name> --prompt <text> --download-dir <abs> [--account-pool <p1,p2,...>] [--output-json]
  webai:gemini:deep-research --profile <name> --prompt <text> --confirmed [--output-json]
  webai:gemini:canvas-edit --profile <name> [--prompt <text> --confirmed] [--edit-text <text>] [--ai-action length|tone|suggest] [--output-json]
  webai:gemini:conversation-manage --profile <name> --action menu_enumerate|share|search [--query <text>] [--confirmed] [--output-json]
  webai:gemini:workspace --profile <name> --surface gems|scheduled|study|audio_overview|workspace_integration|connected_apps|personalization [--output-json]
  webai:gemini:music:generate --profile gemini-9225 --prompt <text> --confirmed [--output-json]
  webai:gemini:music:download-track --profile gemini-9225 --tab-url-contains <url-fragment> [--format mp3|video] [--download-dir <abs>] [--output-json]
  webai:gemini:music:task-status --profile gemini-9225 --tab-url-contains <url-fragment> [--output-json]
  webai:chatgpt:codex:submit-task --profile chatgpt --prompt <text> --confirmed [--repo LT-0I/CN-] [--branch <branch>] [--output-json]
  webai:chatgpt:codex:list-envs --profile chatgpt [--output-json]
  webai:chatgpt:codex:task-status --profile chatgpt --task-id <id> [--output-json]
  webai:chatgpt:codex:get-diff --profile chatgpt --task-id <id> [--output-json]
  webai:chatgpt:canvas-export --tab-url-contains <url-fragment> [--format md|pdf|docx] [--download-dir <abs>] [--output-json]
  webai:chatgpt:pulse:get --profile <name> [--tab-id <id>] [--wait-ready] [--timeout-ms <ms>] [--output-json]
  webai:chatgpt:pulse:onboard --profile <name> [--tab-id <id>] --confirmed [--output-json]
  webai:chatgpt:deep-research --profile <name> --prompt <text> [--output-json]
  webai:chatgpt:conversation-manage --profile <name> --action share|navigate_settings [--surface <name>] [--output-json]
  webai:chatgpt:workspace --profile <name> --surface projects|gpts|tasks|apps|memory|personalization|data_controls [--output-json]
  webai:claude:design:create-project --profile claude-9224 --name <project> [--fidelity wireframe|high_fidelity] [--output-json]
  webai:claude:design:generate --profile claude-9224 --project-url <url> --prompt <text> [--model sonnet|haiku] [--output-json]
  webai:claude:design:get-html --profile claude-9224 --project-url <url> [--download-dir <abs>] [--output-json]
  webai:claude:design:present --profile claude-9224 --project-url <url> [--output-json]
  webai:task-status --task-id <id> [--output-json]
  webai:literature-task-status --task-id <id> [--output-json]
  mcp
  mcp:tools [--json]
  mcp:resources [--json]
  wah scout --target <id> --fixture <html> [--json]
  wah:capability:query [--target <id>] [--text <text>] [--json]
  wah:adapter:health [--provider <id>] [--kind webai|researchdb|generic] [--json]
  wah:policy:explain --manifest-id <id>|--mcp-name <name> [--json]
  wah:task:start --manifest-id <id> [--input JSON] [--dry-run] [--json]
  wah:task:status --run-id <id> [--json]
  wah:task:cancel --run-id <id> [--reason <text>] [--json]
  wah:task:resume --run-id <id> --manifest-id <id> [--input JSON] [--json]
  wah:artifact:get --artifact-id <id>|--path <path> [--json]
  adapter:list [--json]
  web-ai:adapters [--json]
  recipe:list [--json]
  browser:start|browser:open|browser:read|browser:screenshot [--tab-id <id>] [--mode full|lite] [browser:read --include-portals]
  browser:click|browser:type|browser:select|browser:press|browser:wait|browser:upload|browser:hover [--dwell-ms 450] [--settle-selector <css>]|browser:select-text|browser:drag [--tab-id <id>] [--json]
  browser:downloads [--profile <name>] [--limit <n>] [--json]
  browser:download-url --url <absolute-url> [--filename <name>] [--tab-id <id>] [--json]
  browser:artifact-click --profile <name> (--url <url>|--tab-url-contains <substr>) --button-selector <css> --download-dir <abs-path> [--follow-up-selector <css>|--follow-up-text-regex <regex>] [--locate-timeout-ms <ms>] [--frame-min-count <n>] [--viewport-width <px>] [--viewport-height <px>] [--prerender-wait-ms <ms>] [--scroll-main-to-y <y>] [--scroll-main-wait-ms <ms>] [--output-json]
  verify:docx-min --path <abs> [--min-paragraphs N] [--min-chars N] [--topic-regex <pattern>] [--no-sha256] [--output-json]
  recipe <id> --key value
  snapshot:capture --site <site> [--url <url>] [--tab-id <id>]
  snapshot:diff --site <site> --previous <path> --current <path>`;
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  const [command, ...rest] = argv;
  const { options, positionals } = parseArgs(rest);
  if (!command || command === "help" || command === "--help" || command === "-h") { console.log(help()); return; }

  if (command === "mcp") { await startMcpServer(); return; }
  if (command === "mcp:tools") { output(listMcpTools(), options); return; }
  if (command === "mcp:resources") { output(listMcpResources(), options); return; }
  if (command === "adapter:list") { output(listAdapters(), options); return; }
  if (command === "web-ai:adapters") { output(listWebAiAdapters(), options); return; }
  if (command === "recipe:list") { output(listRecipes().map((recipe) => ({ id: recipe.id, name: recipe.name, adapter: recipe.adapter })), options); return; }
  if (command === "verify:docx-min") {
    const docxPath = asString(options.path) || positionals[0];
    if (!docxPath) throw new Error("verify:docx-min requires --path <abs>");
    if (!path.isAbsolute(docxPath)) throw new Error("verify:docx-min --path must be absolute");
    const topicPattern = asString(options["topic-regex"] || options.topicRegex);
    const result = verifyDocxMin(docxPath, {
      minParagraphs: asNumber(options["min-paragraphs"] || options.minParagraphs) ?? 50,
      minChars: asNumber(options["min-chars"] || options.minChars) ?? 5000,
      topicRegex: topicPattern ? new RegExp(topicPattern) : undefined,
      recordSha256: options.sha256 === false || options.sha256 === "false" || options["no-sha256"] === true ? false : true
    });
    output(result, options);
    if (!result.ok) process.exitCode = 1;
    return;
  }



  if (command === "wah" && positionals[0] === "scout") {
    output(await runWahScout({
      target: asString(options.target) || asString(options.site) || "",
      fixture: asString(options.fixture),
      feature: asString(options.feature) || positionals[1],
      url: asString(options.url),
      notes: asString(options.notes),
      save: asBoolean(options.save)
    }), options);
    return;
  }

  const wahMcpName = wahMcpNameFromCli(command);
  if (wahMcpName) {
    output(redactForCli(await callMcpTool(wahMcpName, wahArgsFromCli(options, positionals)), options), options);
    return;
  }

  const webAiMcpName = webAiMcpNameFromCli(command);
  if (webAiMcpName) {
    const result = redactForCli(await callMcpTool(webAiMcpName, webAiArgsFromCli(command, options)), options);
    output(result, options);
    await finishWebAiDispatch(cliExitCodeForErrorCode(consumerErrorCodeFromResult(result)));
    return;
  }

  if (command === "consumer:health") {
    output(await consumerHealth({ target: asString(options.target) || "", profile: asString(options.profile) || "" }), options);
    return;
  }

  if (command === "browser:launch") {
    const launcher = createManagedBrowserLauncher();
    output(await launcher.launch({ profile: asString(options.profile), url: asString(options.url), cdpPort: asNumber(options["cdp-port"] || options.cdpPort), executablePath: asString(options.executable || options.executablePath) }), options);
    return;
  }
  if (command === "browser:status") {
    const status = await createManagedBrowserLauncher().status(asString(options.profile));
    output({ ...status, lease: new CapabilityDatabase().getActiveProfileLease(status.profile) }, options);
    return;
  }
  if (command === "browser:pages") {
    output(await createManagedBrowserLauncher().pages(asString(options.profile)), options);
    return;
  }
  if (command === "browser:tab:alloc") {
    const profile = asString(options.profile);
    const url = asString(options.url);
    const tabId = asString(options["tab-id"] || options.tabId);
    if (!profile) throw new Error("browser:tab:alloc requires --profile <name>");
    if (!url) throw new Error("browser:tab:alloc requires --url <url>");
    if (!tabId) throw new Error("browser:tab:alloc requires --tab-id <id>");
    output(await allocateSession(profile, url, tabId), options);
    return;
  }
  if (command === "browser:tab:list") {
    const profile = asString(options.profile) || process.env.WAH_DEFAULT_PROFILE || "default";
    output(await listSessions(profile), options);
    return;
  }
  if (command === "browser:tab:free") {
    const tabId = asString(options["tab-id"] || options.tabId);
    if (!tabId) throw new Error("browser:tab:free requires --tab-id <id>");
    await freeSession(tabId);
    output({ tabId, freed: true }, options);
    return;
  }
  if (command === "browser:close") {
    const mode = (asString(options.mode, "disconnect") || "disconnect") as BrowserCloseMode;
    const profile = asString(options.profile) || process.env.WAH_DEFAULT_PROFILE || "default";
    if (options["release-lease"] === true || options.releaseLease === true) {
      const release = releaseLeaseAndCleanLocks(profile, { force: options.force === true });
      if (!release.ok) {
        const error: any = new Error(release.message || "Profile lease is busy");
        error.errorCode = release.errorCode || "PROFILE_LEASE_BUSY";
        error.evidence = release;
        throw error;
      }
      output(release, options);
      return;
    }
    output(await createManagedBrowserLauncher().close(profile, mode), options);
    return;
  }
  if (command === "browser:profiles") {
    output(new BrowserProfileStore().list(), options);
    return;
  }
  if (command === "browser:audit") {
    output(auditProfiles(), options);
    return;
  }
  if (command === "browser:downloads") {
    output(formatDownloadRecords(downloadManager().list({ profile: asString(options.profile), limit: asNumber(options.limit) || 50 })), options);
    return;
  }
  if (command === "browser:download-url") {
    output(await runBrowserDownloadUrl(options), options);
    return;
  }
  if (command === "browser:artifact-click") {
    output(redactForCli(await runArtifactClick(artifactClickOptionsFromCli(options)), options), options);
    return;
  }

  if (["browser:click", "browser:type", "browser:select", "browser:press", "browser:wait", "browser:upload", "browser:hover", "browser:select-text", "browser:drag"].includes(command)) {
    output(await runManagedBrowserAction(command, options), options);
    return;
  }

  if (command === "capability:init-db") {
    output(new CapabilityDatabase().init(), options);
    return;
  }
  if (command === "capability:update") {
    const target = asString(options.target);
    if (!target) throw new Error("capability:update requires --target <id>");
    const fixture = asString(options.fixture);
    const targetUrl = asString(options.url) || targetBaseUrl(target);
    const mode = snapshotMode(options);
    const snapshot = fixture
      ? readHtmlSnapshotFromFile(path.resolve(fixture), undefined, { mode })
      : await withManagedPage(async (page) => readPageSnapshot(page, { mode, includeAccessibility: mode !== "lite", screenshot: options.screenshot === true }), options, targetUrl) as any;
    output(new CapabilityUpdater(new CapabilityDatabase()).updateFromSnapshot({ target, kind: asString(options.kind), profile: asString(options.profile), snapshot }), options);
    return;
  }
  if (command === "capability:health-check") {
    const target = asString(options.target);
    if (!target) throw new Error("capability:health-check requires --target <id>");
    const profile = asString(options.profile);
    if (!profile) throw new Error("capability:health-check requires --profile <name>");
    const db = new CapabilityDatabase();
    const targetUrl = asString(options.url) || registeredTargetBaseUrl(db, target);
    if (!targetUrl) throw new Error("capability:health-check requires --url <url> or a registered target base_url");
    const report = await withManagedPage(
      async (page) => runHealthCheck({
        targetId: target,
        profile,
        url: targetUrl,
        apply: options.apply === true || options.apply === "true",
        db,
        page
      }),
      { ...options, profile },
      targetUrl
    ) as HealthCheckReport;
    if (wantJson(options)) output(report, options);
    else console.log(formatHealthCheckReport(report));
    return;
  }
  if (command === "capability:query") {
    output(new CapabilityDatabase().queryCapabilities({ target: asString(options.target), text: asString(options.text) || positionals.join(" "), category: asString(options.category), limit: asNumber(options.limit) }), options);
    return;
  }
  if (command === "capability:export") {
    const db = new CapabilityDatabase();
    const exported = db.exportJson(asString(options.target));
    const out = asString(options.out);
    if (out) { fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true }); fs.writeFileSync(path.resolve(out), JSON.stringify(exported, null, 2), "utf-8"); output({ out: path.resolve(out), exportedAt: exported.exportedAt, target: asString(options.target) }, options); }
    else output(exported, options);
    return;
  }
  if (command === "capability:import") {
    const file = positionals[0] || asString(options.file);
    if (!file) throw new Error("capability:import requires a JSON file path");
    const db = new CapabilityDatabase();
    output(db.importJson(JSON.parse(fs.readFileSync(path.resolve(file), "utf-8"))), options);
    return;
  }

  if (command === "workflow:list") {
    const compiler = new WorkflowCompiler(new CapabilityDatabase());
    const files = listWorkflowFiles().map((file) => ({ file, workflow: (() => { try { const wf = compiler.load(file); return { id: wf.id, target: wf.target, profile: wf.profile, mode: wf.mode }; } catch (error) { return { error: error instanceof Error ? error.message : String(error) }; } })() }));
    output(files, options);
    return;
  }
  if (command === "workflow:compile") {
    const file = positionals[0] || asString(options.file);
    if (!file) throw new Error("workflow:compile requires a workflow YAML/JSON file");
    output(new WorkflowCompiler(new CapabilityDatabase()).compileFile(file), options);
    return;
  }
  if (command === "workflow:test") {
    const file = positionals[0] || asString(options.file);
    if (!file) throw new Error("workflow:test requires a workflow YAML/JSON file");
    const plan = new WorkflowCompiler(new CapabilityDatabase()).compileFile(file);
    output({ ok: true, plan, approvalGates: plan.actions.filter((action) => action.requiresApproval).map((action) => ({ stepId: action.stepId, reason: action.reason })) }, options);
    return;
  }
  if (command === "workflow:run") {
    const resumeRunId = asString(options.resume);
    const confirmReplay = options["confirm-replay"] === true || options.confirmReplay === true;
    const redaction = (options["no-redact"] === true || options.noRedact === true) ? { mode: "off" as const } : { mode: "default" as const };
    if (resumeRunId && (options["no-redact"] === true || options.noRedact === true)) console.error("WARNING: --no-redact may expose local paths, profile ids, and conversation URLs in trace output.");
    const file = positionals[0] || asString(options.file);
    if (!file && !resumeRunId) throw new Error("workflow:run requires a workflow YAML/JSON file or --resume <run-id>");
    const dryRun = options["dry-run"] === true || options.dryRun === true;
    const inputs = workflowInputsFromCli(options.input);
    if (dryRun) output(await new WorkflowExecutor({ database: new CapabilityDatabase() }).runFile(file as string, { dryRun: true, redaction, inputs }), options);
    else {
      const db = new CapabilityDatabase();
      const workflow = file ? readConfigFile(path.resolve(file)) : db.getWorkflowRun(resumeRunId as string)?.plan;
      if (!workflow) throw new Error(`workflow:run --resume could not find stored run ${resumeRunId}`);
      const workflowOptions = { ...options, profile: asString(options.profile) || workflow.profile || workflow.target };
      const workflowUrl = asString(options.url) || targetBaseUrl(workflow.target);
      // Command-only workflows do not need a managed browser page; subprocesses make their
      // own CDP connections as needed. Skipping withManagedPage avoids spawning a new
      // Chrome when WAH_BROWSER_EXECUTABLE is locked down (e.g. closure runner).
      const onlyCommandSteps = Array.isArray(workflow.steps) && workflow.steps.length > 0 && workflow.steps.every((step: any) => Array.isArray(step?.command) && step.command.length > 0);
      let result: unknown;
      if (onlyCommandSteps) {
        const executor = new WorkflowExecutor({ database: db });
        result = resumeRunId
          ? await executor.resumeRun(resumeRunId, { dryRun: false, confirmReplay, redaction, inputs })
          : await executor.runFile(file as string, { dryRun: false, redaction, inputs });
      } else {
        result = await withManagedPage(async (page) => {
          const downloads = new DownloadManager(path.join(process.cwd(), "data", "downloads"));
          const executor = new WorkflowExecutor({ database: db, actionExecutor: new ActionExecutor({ getActivePage: () => page, openUrl: async (url) => { await page.goto(url, { waitUntil: "domcontentloaded" }); return page; }, downloads }) });
          return resumeRunId
            ? executor.resumeRun(resumeRunId, { dryRun: false, confirmReplay, redaction, inputs })
            : executor.runFile(file as string, { dryRun: false, redaction, inputs });
        }, workflowOptions, workflowUrl);
      }
      output(redactForCli(result, options), options);
    }
    return;
  }

  if (command === "site:registry:import") {
    const file = positionals[0] || asString(options.file);
    if (!file) throw new Error("site:registry:import requires a site_registry.json file path");
    output(new SiteRegistryImporter(new CapabilityDatabase()).importFile(file), options);
    return;
  }
  if (command === "research:inventory:import") {
    const file = positionals[0] || asString(options.file) || "configs/research/research_inventory.json";
    output(new ResearchDbImporter(new CapabilityDatabase()).importInventorySeed(file, { stemOnly: options["stem-only"] === true || options.stemOnly === true }), options);
    return;
  }
  if (command === "research:aiaa:search") {
    const query = asString(options.query) || positionals[0];
    output(await researchAiaaSearch({ query: query || "", area: asString(options.area), page_size: asNumber(options["page-size"] || options.pageSize), profile: asString(options.profile), cdp_port: asNumber(options["cdp-port"] || options.cdpPort), tab_id: asString(options["tab-id"] || options.tabId) }), options);
    return;
  }
  if (command === "research:aiaa:filter") {
    const query = asString(options.query) || positionals[0];
    output(await researchAiaaFilter({ query: query || "", area: asString(options.area), after_year: asNumber(options["after-year"] || options.afterYear), before_year: asNumber(options["before-year"] || options.beforeYear), series_key: asString(options["series-key"] || options.seriesKey), contrib_raw: asString(options["contrib-raw"] || options.contribRaw), concept_id: asString(options["concept-id"] || options.conceptId), page_size: asNumber(options["page-size"] || options.pageSize), profile: asString(options.profile), cdp_port: asNumber(options["cdp-port"] || options.cdpPort), tab_id: asString(options["tab-id"] || options.tabId) }), options);
    return;
  }
  if (command === "research:aiaa:export") {
    if (asBoolean(options.confirmed) !== true) throw new Error("research:aiaa:export requires --confirmed because it writes a browser-downloaded artifact");
    const doi = asString(options.doi) || positionals[0];
    output(await researchAiaaExport({ doi: doi || "", format: asString(options.format) as any, download_dir: asString(options["download-dir"] || options.downloadDir), profile: asString(options.profile), cdp_port: asNumber(options["cdp-port"] || options.cdpPort), tab_id: asString(options["tab-id"] || options.tabId) }), options);
    return;
  }
  if (command === "research:wos:search") {
    const query = asString(options.query) || positionals[0];
    output(await researchWosSearch({ query: query || "", mode: asString(options.mode) as any, page_size: asNumber(options["page-size"] || options.pageSize), profile: asString(options.profile), cdp_port: asNumber(options["cdp-port"] || options.cdpPort), tab_id: asString(options["tab-id"] || options.tabId) }), options);
    return;
  }
  if (command === "research:wos:filter") {
    const query = asString(options.query) || positionals[0];
    output(await researchWosFilter({ query: query || "", mode: asString(options.mode) as any, document_type: asString(options["document-type"] || options.documentType) as any, page_size: asNumber(options["page-size"] || options.pageSize), profile: asString(options.profile), cdp_port: asNumber(options["cdp-port"] || options.cdpPort), tab_id: asString(options["tab-id"] || options.tabId) }), options);
    return;
  }
  if (command === "research:wos:export") {
    if (asBoolean(options.confirmed) !== true) throw new Error("research:wos:export requires --confirmed because it writes a browser-downloaded artifact");
    const query = asString(options.query) || positionals[0];
    output(await researchWosExport({ query: query || "", document_type: asString(options["document-type"] || options.documentType) as any, format: asString(options.format) as any, download_dir: asString(options["download-dir"] || options.downloadDir), profile: asString(options.profile), cdp_port: asNumber(options["cdp-port"] || options.cdpPort), tab_id: asString(options["tab-id"] || options.tabId) }), options);
    return;
  }
  if (command === "research:acm:search") {
    const query = asString(options.query) || positionals[0];
    output(await researchAcmSearch({ query: query || "", area: asString(options.area) as any, page_size: asNumber(options["page-size"] || options.pageSize), profile: asString(options.profile), cdp_port: asNumber(options["cdp-port"] || options.cdpPort), tab_id: asString(options["tab-id"] || options.tabId) }), options);
    return;
  }
  if (command === "research:acm:filter") {
    const query = asString(options.query) || positionals[0];
    output(await researchAcmFilter({ query: query || "", area: asString(options.area) as any, after_year: asNumber(options["after-year"] || options.afterYear), before_year: asNumber(options["before-year"] || options.beforeYear), sort_by: asString(options["sort-by"] || options.sortBy), facet: asString(options.facet), content_type: asString(options["content-type"] || options.contentType), author: asString(options.author), publisher: asString(options.publisher), page_size: asNumber(options["page-size"] || options.pageSize), profile: asString(options.profile), cdp_port: asNumber(options["cdp-port"] || options.cdpPort), tab_id: asString(options["tab-id"] || options.tabId) }), options);
    return;
  }
  if (command === "research:acm:export") {
    if (asBoolean(options.confirmed) !== true) throw new Error("research:acm:export requires --confirmed because it writes a browser-downloaded artifact");
    const doi = asString(options.doi) || positionals[0];
    output(await researchAcmExport({ doi: doi || "", format: asString(options.format) as any, download_dir: asString(options["download-dir"] || options.downloadDir), profile: asString(options.profile), cdp_port: asNumber(options["cdp-port"] || options.cdpPort), tab_id: asString(options["tab-id"] || options.tabId) }), options);
    return;
  }
  if (command === "research:ieee:search") {
    const query = asString(options.query) || positionals[0];
    output(await researchIeeeSearch({ query: query || "", field: asString(options.field) as any, page_size: asNumber(options["page-size"] || options.pageSize), profile: asString(options.profile), cdp_port: asNumber(options["cdp-port"] || options.cdpPort), tab_id: asString(options["tab-id"] || options.tabId) }), options);
    return;
  }
  if (command === "research:ieee:filter") {
    const query = asString(options.query) || positionals[0];
    output(await researchIeeeFilter({ query: query || "", field: asString(options.field) as any, content_type: asString(options["content-type"] || options.contentType) as any, page_size: asNumber(options["page-size"] || options.pageSize), profile: asString(options.profile), cdp_port: asNumber(options["cdp-port"] || options.cdpPort), tab_id: asString(options["tab-id"] || options.tabId) }), options);
    return;
  }
  if (command === "research:ieee:export") {
    if (asBoolean(options.confirmed) !== true) throw new Error("research:ieee:export requires --confirmed because it writes a browser-downloaded artifact or surfaces the verified handoff blocker");
    const query = asString(options.query) || positionals[0];
    output(await researchIeeeExport({ query: query || "", field: asString(options.field) as any, content_type: asString(options["content-type"] || options.contentType) as any, format: asString(options.format) as any, download_dir: asString(options["download-dir"] || options.downloadDir), profile: asString(options.profile), cdp_port: asNumber(options["cdp-port"] || options.cdpPort), tab_id: asString(options["tab-id"] || options.tabId) }), options);
    return;
  }

  if (command === "research:acs:search") {
    const query = asString(options.query) || positionals[0];
    output(await researchAcsSearch({ query: query || "", area: asString(options.area) as any, title_query: asString(options["title-query"] || options.titleQuery), page_size: asNumber(options["page-size"] || options.pageSize), profile: asString(options.profile), cdp_port: asNumber(options["cdp-port"] || options.cdpPort), tab_id: asString(options["tab-id"] || options.tabId) }), options);
    return;
  }
  if (command === "research:acs:filter") {
    const query = asString(options.query) || positionals[0];
    output(await researchAcsFilter({ query: query || "", area: asString(options.area) as any, title_query: asString(options["title-query"] || options.titleQuery), earliest: asString(options.earliest), pub_type: asString(options["pub-type"] || options.pubType), article_type: asString(options["article-type"] || options.articleType), article_subject: asString(options["article-subject"] || options.articleSubject), concept_id: asString(options["concept-id"] || options.conceptId), contrib_raw: asString(options["contrib-raw"] || options.contribRaw), series_key: asString(options["series-key"] || options.seriesKey), publisher: asString(options.publisher), page_size: asNumber(options["page-size"] || options.pageSize), profile: asString(options.profile), cdp_port: asNumber(options["cdp-port"] || options.cdpPort), tab_id: asString(options["tab-id"] || options.tabId) }), options);
    return;
  }
  if (command === "research:acs:export") {
    if (asBoolean(options.confirmed) !== true) throw new Error("research:acs:export requires --confirmed because it writes a browser-downloaded artifact");
    const doi = asString(options.doi) || positionals[0];
    output(await researchAcsExport({ doi: doi || "", format: asString(options.format) as any, download_dir: asString(options["download-dir"] || options.downloadDir), profile: asString(options.profile), cdp_port: asNumber(options["cdp-port"] || options.cdpPort), tab_id: asString(options["tab-id"] || options.tabId) }), options);
    return;
  }
  if (command === "research:asme:search") {
    const query = asString(options.query) || positionals[0];
    output(await researchAsmeSearch({ query: query || "", page_size: asNumber(options["page-size"] || options.pageSize), profile: asString(options.profile), cdp_port: asNumber(options["cdp-port"] || options.cdpPort), tab_id: asString(options["tab-id"] || options.tabId) }), options);
    return;
  }
  if (command === "research:asme:filter") {
    const query = asString(options.query) || positionals[0];
    output(await researchAsmeFilter({ query: query || "", format: asString(options.format), publisher: asString(options.publisher), subject: asString(options.subject), journal: asString(options.journal), topic: asString(options.topic), from_date: asString(options["from-date"] || options.fromDate), to_date: asString(options["to-date"] || options.toDate), page_size: asNumber(options["page-size"] || options.pageSize), profile: asString(options.profile), cdp_port: asNumber(options["cdp-port"] || options.cdpPort), tab_id: asString(options["tab-id"] || options.tabId) }), options);
    return;
  }
  if (command === "research:asme:export") {
    if (asBoolean(options.confirmed) !== true) throw new Error("research:asme:export requires --confirmed because it writes a browser-downloaded artifact");
    const doi = asString(options.doi) || positionals[0];
    output(await researchAsmeExport({ doi: doi || "", format: asString(options.format) as any, download_dir: asString(options["download-dir"] || options.downloadDir), profile: asString(options.profile), cdp_port: asNumber(options["cdp-port"] || options.cdpPort), tab_id: asString(options["tab-id"] || options.tabId) }), options);
    return;
  }
  if (command === "research:rsc:search") {
    const query = asString(options.query) || positionals[0];
    output(await researchRscSearch({ query: query || "", area: asString(options.area) as any, page_size: asNumber(options["page-size"] || options.pageSize), profile: asString(options.profile), cdp_port: asNumber(options["cdp-port"] || options.cdpPort), tab_id: asString(options["tab-id"] || options.tabId) }), options);
    return;
  }
  if (command === "research:rsc:filter") {
    const query = asString(options.query) || positionals[0];
    output(await researchRscFilter({ query: query || "", area: asString(options.area) as any, access: asString(options.access) as any, page_size: asNumber(options["page-size"] || options.pageSize), profile: asString(options.profile), cdp_port: asNumber(options["cdp-port"] || options.cdpPort), tab_id: asString(options["tab-id"] || options.tabId) }), options);
    return;
  }
  if (command === "research:rsc:export") {
    if (asBoolean(options.confirmed) !== true) throw new Error("research:rsc:export requires --confirmed because it writes a browser-downloaded artifact");
    const doi = asString(options.doi) || positionals[0];
    output(await researchRscExport({ doi: doi || "", article_url: asString(options["article-url"] || options.articleUrl), format: asString(options.format) as any, download_dir: asString(options["download-dir"] || options.downloadDir), profile: asString(options.profile), cdp_port: asNumber(options["cdp-port"] || options.cdpPort), tab_id: asString(options["tab-id"] || options.tabId) }), options);
    return;
  }
  if (command === "research:wiley:search") {
    const query = asString(options.query) || positionals[0];
    output(await researchWileySearch({ query: query || "", area: asString(options.area) as any, query2: asString(options.query2), area2: asString(options.area2) as any, page_size: asNumber(options["page-size"] || options.pageSize), profile: asString(options.profile), cdp_port: asNumber(options["cdp-port"] || options.cdpPort), tab_id: asString(options["tab-id"] || options.tabId) }), options);
    return;
  }
  if (command === "research:wiley:filter") {
    const query = asString(options.query) || positionals[0];
    output(await researchWileyFilter({ query: query || "", area: asString(options.area) as any, query2: asString(options.query2), area2: asString(options.area2) as any, after_year: asNumber(options["after-year"] || options.afterYear), before_year: asNumber(options["before-year"] || options.beforeYear), series_key: asString(options["series-key"] || options.seriesKey), ppub: asString(options.ppub), concept_id: asString(options["concept-id"] || options.conceptId), access: asBoolean(options.access), page_size: asNumber(options["page-size"] || options.pageSize), profile: asString(options.profile), cdp_port: asNumber(options["cdp-port"] || options.cdpPort), tab_id: asString(options["tab-id"] || options.tabId) }), options);
    return;
  }
  if (command === "research:wiley:export") {
    if (asBoolean(options.confirmed) !== true) throw new Error("research:wiley:export requires --confirmed because it writes a browser-downloaded artifact");
    const doi = asString(options.doi) || positionals[0];
    output(await researchWileyExport({ doi: doi || "", format: asString(options.format) as any, include_abstract: asBoolean(options["include-abstract"] || options.includeAbstract), download_dir: asString(options["download-dir"] || options.downloadDir), profile: asString(options.profile), cdp_port: asNumber(options["cdp-port"] || options.cdpPort), tab_id: asString(options["tab-id"] || options.tabId) }), options);
    return;
  }
  if (command === "research:asce:search") {
    const query = asString(options.query) || positionals[0];
    output(await researchAsceSearch({ query: query || "", query2: asString(options.query2), area: asString(options.area) as any, area2: asString(options.area2) as any, page_size: asNumber(options["page-size"] || options.pageSize), profile: asString(options.profile), cdp_port: asNumber(options["cdp-port"] || options.cdpPort), tab_id: asString(options["tab-id"] || options.tabId) }), options);
    return;
  }
  if (command === "research:asce:filter") {
    const query = asString(options.query) || positionals[0];
    output(await researchAsceFilter({ query: query || "", query2: asString(options.query2), area: asString(options.area) as any, area2: asString(options.area2) as any, after_year: asNumber(options["after-year"] || options.afterYear), before_year: asNumber(options["before-year"] || options.beforeYear), content_item_type: asString(options["content-item-type"] || options.contentItemType), contrib_raw: asString(options["contrib-raw"] || options.contribRaw), concept_id: asString(options["concept-id"] || options.conceptId), publication: asString(options.publication), page_size: asNumber(options["page-size"] || options.pageSize), profile: asString(options.profile), cdp_port: asNumber(options["cdp-port"] || options.cdpPort), tab_id: asString(options["tab-id"] || options.tabId) }), options);
    return;
  }
  if (command === "research:asce:export") {
    if (asBoolean(options.confirmed) !== true) throw new Error("research:asce:export requires --confirmed because it writes a browser-downloaded artifact");
    const doi = asString(options.doi) || positionals[0];
    output(await researchAsceExport({ doi: doi || "", format: asString(options.format) as any, download_dir: asString(options["download-dir"] || options.downloadDir), profile: asString(options.profile), cdp_port: asNumber(options["cdp-port"] || options.cdpPort), tab_id: asString(options["tab-id"] || options.tabId) }), options);
    return;
  }
  if (command === "research:iop:search") {
    const query = asString(options.query) || positionals[0];
    output(await researchIopSearch({ query: query || "", page_size: asNumber(options["page-size"] || options.pageSize), profile: asString(options.profile), cdp_port: asNumber(options["cdp-port"] || options.cdpPort), tab_id: asString(options["tab-id"] || options.tabId) }), options);
    return;
  }
  if (command === "research:iop:filter") {
    const query = asString(options.query) || positionals[0];
    output(await researchIopFilter({ query: query || "", search_date_period: asString(options["search-date-period"] || options.searchDatePeriod), pub_type: asString(options["pub-type"] || options.pubType), access_type: asString(options["access-type"] || options.accessType), journal_issn: asString(options["journal-issn"] || options.journalIssn), order_by: asString(options["order-by"] || options.orderBy), page_size: asNumber(options["page-size"] || options.pageSize), profile: asString(options.profile), cdp_port: asNumber(options["cdp-port"] || options.cdpPort), tab_id: asString(options["tab-id"] || options.tabId) }), options);
    return;
  }
  if (command === "research:iop:export") {
    if (asBoolean(options.confirmed) !== true) throw new Error("research:iop:export requires --confirmed because it writes a browser-downloaded artifact");
    const doi = asString(options.doi) || positionals[0];
    output(await researchIopExport({ doi: doi || "", format: asString(options.format) as any, download_dir: asString(options["download-dir"] || options.downloadDir), profile: asString(options.profile), cdp_port: asNumber(options["cdp-port"] || options.cdpPort), tab_id: asString(options["tab-id"] || options.tabId) }), options);
    return;
  }
  if (command === "research:tandf:search") {
    const query = asString(options.query) || positionals[0];
    output(await researchTandfSearch({ query: query || "", area: asString(options.area) as any, page_size: asNumber(options["page-size"] || options.pageSize), profile: asString(options.profile), cdp_port: asNumber(options["cdp-port"] || options.cdpPort), tab_id: asString(options["tab-id"] || options.tabId) }), options);
    return;
  }
  if (command === "research:tandf:filter") {
    const query = asString(options.query) || positionals[0];
    output(await researchTandfFilter({ query: query || "", area: asString(options.area) as any, after_year: asNumber(options["after-year"] || options.afterYear), before_year: asNumber(options["before-year"] || options.beforeYear), content_item_type: asString(options["content-item-type"] || options.contentItemType), pub_type: asString(options["pub-type"] || options.pubType), journal: asString(options.journal), access: asString(options.access), page_size: asNumber(options["page-size"] || options.pageSize), profile: asString(options.profile), cdp_port: asNumber(options["cdp-port"] || options.cdpPort), tab_id: asString(options["tab-id"] || options.tabId) }), options);
    return;
  }
  if (command === "research:tandf:export") {
    if (asBoolean(options.confirmed) !== true) throw new Error("research:tandf:export requires --confirmed because it writes a browser-downloaded artifact");
    const doi = asString(options.doi) || positionals[0];
    output(await researchTandfExport({ doi: doi || "", format: asString(options.format) as any, download_dir: asString(options["download-dir"] || options.downloadDir), profile: asString(options.profile), cdp_port: asNumber(options["cdp-port"] || options.cdpPort), tab_id: asString(options["tab-id"] || options.tabId) }), options);
    return;
  }
  if (command === "research:sae:search") {
    const query = asString(options.query) || positionals[0];
    output(await researchSaeSearch({ query: query || "", page_size: asNumber(options["page-size"] || options.pageSize), profile: asString(options.profile), cdp_port: asNumber(options["cdp-port"] || options.cdpPort), tab_id: asString(options["tab-id"] || options.tabId) }), options);
    return;
  }
  if (command === "research:sae:filter") {
    const query = asString(options.query) || positionals[0];
    output(await researchSaeFilter({ query: query || "", facet: asString(options.facet), page_size: asNumber(options["page-size"] || options.pageSize), profile: asString(options.profile), cdp_port: asNumber(options["cdp-port"] || options.cdpPort), tab_id: asString(options["tab-id"] || options.tabId) }), options);
    return;
  }
  if (command === "research:sae:export") {
    if (asBoolean(options.confirmed) !== true) throw new Error("research:sae:export requires --confirmed because it writes a browser-downloaded artifact");
    const query = asString(options.query) || positionals[0];
    output(await researchSaeExport({ query: query || "", facet: asString(options.facet), format: asString(options.format) as any, download_dir: asString(options["download-dir"] || options.downloadDir), profile: asString(options.profile), cdp_port: asNumber(options["cdp-port"] || options.cdpPort), tab_id: asString(options["tab-id"] || options.tabId) }), options);
    return;
  }
  if (command === "research:sciencedirect:search") {
    const query = asString(options.query) || positionals[0];
    output(await researchScienceDirectSearch({ query: query || "", date: asString(options.date), pub: asString(options.pub), authors: asString(options.authors), affiliations: asString(options.affiliations), tak: asString(options.tak), title: asString(options.title), doc_id: asString(options["doc-id"] || options.docId), profile: asString(options.profile), cdp_port: asNumber(options["cdp-port"] || options.cdpPort), tab_id: asString(options["tab-id"] || options.tabId) }), options);
    return;
  }
  if (command === "research:sciencedirect:filter") {
    const query = asString(options.query) || positionals[0];
    output(await researchScienceDirectFilter({ query: query || "", date: asString(options.date), pub: asString(options.pub), authors: asString(options.authors), affiliations: asString(options.affiliations), tak: asString(options.tak), title: asString(options.title), doc_id: asString(options["doc-id"] || options.docId), article_type: asString(options["article-type"] || options.articleType) as any, year: asNumber(options.year), access_type: asString(options["access-type"] || options.accessType) as any, facet_input_id: asString(options["facet-input-id"] || options.facetInputId), profile: asString(options.profile), cdp_port: asNumber(options["cdp-port"] || options.cdpPort), tab_id: asString(options["tab-id"] || options.tabId) }), options);
    return;
  }
  if (command === "research:sciencedirect:export") {
    if (asBoolean(options.confirmed) !== true) throw new Error("research:sciencedirect:export requires --confirmed because it writes a browser-downloaded artifact");
    const query = asString(options.query) || positionals[0];
    output(await researchScienceDirectExport({ query: query || "", date: asString(options.date), pub: asString(options.pub), authors: asString(options.authors), affiliations: asString(options.affiliations), tak: asString(options.tak), title: asString(options.title), doc_id: asString(options["doc-id"] || options.docId), article_type: asString(options["article-type"] || options.articleType) as any, year: asNumber(options.year), access_type: asString(options["access-type"] || options.accessType) as any, facet_input_id: asString(options["facet-input-id"] || options.facetInputId), format: asString(options.format) as any, download_dir: asString(options["download-dir"] || options.downloadDir), profile: asString(options.profile), cdp_port: asNumber(options["cdp-port"] || options.cdpPort), tab_id: asString(options["tab-id"] || options.tabId) }), options);
    return;
  }
  if (command === "research:aps:search") {
    const query = asString(options.query) || positionals[0];
    output(await researchApsSearch({ query: query || "", field: asString(options.field) as any, page_size: asNumber(options["page-size"] || options.pageSize), profile: asString(options.profile), cdp_port: asNumber(options["cdp-port"] || options.cdpPort), tab_id: asString(options["tab-id"] || options.tabId) }), options);
    return;
  }
  if (command === "research:aps:filter") {
    const query = asString(options.query) || positionals[0];
    output(await researchApsFilter({ query: query || "", field: asString(options.field) as any, date_range: asString(options["date-range"] || options.dateRange) as any, page_size: asNumber(options["page-size"] || options.pageSize), profile: asString(options.profile), cdp_port: asNumber(options["cdp-port"] || options.cdpPort), tab_id: asString(options["tab-id"] || options.tabId) }), options);
    return;
  }
  if (command === "research:aps:export") {
    if (asBoolean(options.confirmed) !== true) throw new Error("research:aps:export requires --confirmed because it writes a browser-downloaded artifact");
    const doi = asString(options.doi) || positionals[0];
    output(await researchApsExport({ doi: doi || "", journal_code: asString(options["journal-code"] || options.journalCode), article_url: asString(options["article-url"] || options.articleUrl), format: asString(options.format) as any, download_dir: asString(options["download-dir"] || options.downloadDir), profile: asString(options.profile), cdp_port: asNumber(options["cdp-port"] || options.cdpPort), tab_id: asString(options["tab-id"] || options.tabId) }), options);
    return;
  }
  if (command === "research:emerald:search") {
    const query = asString(options.query) || positionals[0];
    output(await researchEmeraldSearch({ query: query || "", mode: asString(options.mode) as any, page_size: asNumber(options["page-size"] || options.pageSize), profile: asString(options.profile), cdp_port: asNumber(options["cdp-port"] || options.cdpPort), tab_id: asString(options["tab-id"] || options.tabId) }), options);
    return;
  }
  if (command === "research:emerald:filter") {
    const query = asString(options.query) || positionals[0];
    output(await researchEmeraldFilter({ query: query || "", mode: asString(options.mode) as any, content_type: asString(options["content-type"] || options.contentType), subject: asString(options.subject), case_provider: asString(options["case-provider"] || options.caseProvider), page_size: asNumber(options["page-size"] || options.pageSize), profile: asString(options.profile), cdp_port: asNumber(options["cdp-port"] || options.cdpPort), tab_id: asString(options["tab-id"] || options.tabId) }), options);
    return;
  }
  if (command === "research:emerald:export") {
    if (asBoolean(options.confirmed) !== true) throw new Error("research:emerald:export requires --confirmed because it writes a browser-downloaded artifact");
    const doi = asString(options.doi) || positionals[0];
    output(await researchEmeraldExport({ doi: doi || "", format: asString(options.format) as any, download_dir: asString(options["download-dir"] || options.downloadDir), profile: asString(options.profile), cdp_port: asNumber(options["cdp-port"] || options.cdpPort), tab_id: asString(options["tab-id"] || options.tabId) }), options);
    return;
  }
  if (command === "research:cambridge:search") {
    const query = asString(options.query) || positionals[0];
    output(await researchCambridgeSearch({ query: query || "", page_size: asNumber(options["page-size"] || options.pageSize), profile: asString(options.profile), cdp_port: asNumber(options["cdp-port"] || options.cdpPort), tab_id: asString(options["tab-id"] || options.tabId) }), options);
    return;
  }
  if (command === "research:cambridge:filter") {
    const query = asString(options.query) || positionals[0];
    output(await researchCambridgeFilter({ query: query || "", product_type: asString(options["product-type"] || options.productType) as any, open_access: asString(options["open-access"] || options.openAccess), only_show_available: asBoolean(options["only-show-available"] || options.onlyShowAvailable), start_year: asNumber(options["start-year"] || options.startYear), end_year: asNumber(options["end-year"] || options.endYear), sort: asString(options.sort), page_size: asNumber(options["page-size"] || options.pageSize), profile: asString(options.profile), cdp_port: asNumber(options["cdp-port"] || options.cdpPort), tab_id: asString(options["tab-id"] || options.tabId) }), options);
    return;
  }
  if (command === "research:cambridge:export") {
    if (asBoolean(options.confirmed) !== true) throw new Error("research:cambridge:export requires --confirmed because it writes a browser-downloaded artifact");
    output(await researchCambridgeExport({ query: asString(options.query), product_id: asString(options["product-id"] || options.productId), format: asString(options.format) as any, download_dir: asString(options["download-dir"] || options.downloadDir), profile: asString(options.profile), cdp_port: asNumber(options["cdp-port"] || options.cdpPort), tab_id: asString(options["tab-id"] || options.tabId) }), options);
    return;
  }
  if (command === "research:springer:search") {
    const query = asString(options.query) || positionals[0];
    output(await researchSpringerSearch({ query: query || "", title: asString(options.title), contributor: asString(options.contributor), journal: asString(options.journal), date_from: asNumber(options["date-from"] || options.dateFrom), date_to: asNumber(options["date-to"] || options.dateTo), date: asString(options.date), page: asNumber(options.page), profile: asString(options.profile), cdp_port: asNumber(options["cdp-port"] || options.cdpPort), tab_id: asString(options["tab-id"] || options.tabId) }), options);
    return;
  }
  if (command === "research:springer:filter") {
    const query = asString(options.query) || positionals[0];
    output(await researchSpringerFilter({ query: query || "", title: asString(options.title), contributor: asString(options.contributor), journal: asString(options.journal), date_from: asNumber(options["date-from"] || options.dateFrom), date_to: asNumber(options["date-to"] || options.dateTo), date: asString(options.date), content_type: asString(options["content-type"] || options.contentType), open_access: asString(options["open-access"] || options.openAccess), language: asString(options.language), taxonomy: asString(options.taxonomy), discipline: asString(options.discipline), sub_discipline: asString(options["sub-discipline"] || options.subDiscipline), sustainable_development_goal: asString(options["sustainable-development-goal"] || options.sustainableDevelopmentGoal), page: asNumber(options.page), profile: asString(options.profile), cdp_port: asNumber(options["cdp-port"] || options.cdpPort), tab_id: asString(options["tab-id"] || options.tabId) }), options);
    return;
  }
  if (command === "research:springer:export") {
    if (asBoolean(options.confirmed) !== true) throw new Error("research:springer:export requires --confirmed because it writes a browser-downloaded artifact or surfaces the verified handoff blocker");
    const doi = asString(options.doi) || positionals[0];
    output(await researchSpringerExport({ doi: doi, format: asString(options.format) as any, bulk_export: asBoolean(options["bulk-export"] || options.bulkExport), download_dir: asString(options["download-dir"] || options.downloadDir), profile: asString(options.profile), cdp_port: asNumber(options["cdp-port"] || options.cdpPort), tab_id: asString(options["tab-id"] || options.tabId) }), options);
    return;
  }
  if (command === "research:nature:search") {
    const query = asString(options.query) || positionals[0];
    output(await researchNatureSearch({ query: query || "", start_year: asNumber(options["start-year"] || options.startYear), end_year: asNumber(options["end-year"] || options.endYear), order: asString(options.order), profile: asString(options.profile), cdp_port: asNumber(options["cdp-port"] || options.cdpPort), tab_id: asString(options["tab-id"] || options.tabId) }), options);
    return;
  }
  if (command === "research:nature:filter") {
    const query = asString(options.query) || positionals[0];
    output(await researchNatureFilter({ query: query || "", start_year: asNumber(options["start-year"] || options.startYear), end_year: asNumber(options["end-year"] || options.endYear), order: asString(options.order), article_type: asString(options["article-type"] || options.articleType) as any, journal: asString(options.journal), subject: asString(options.subject), date_range: asString(options["date-range"] || options.dateRange), facet_param: asString(options["facet-param"] || options.facetParam) as any, facet_value: asString(options["facet-value"] || options.facetValue), profile: asString(options.profile), cdp_port: asNumber(options["cdp-port"] || options.cdpPort), tab_id: asString(options["tab-id"] || options.tabId) }), options);
    return;
  }
  if (command === "research:nature:export") {
    if (asBoolean(options.confirmed) !== true) throw new Error("research:nature:export requires --confirmed because it writes a browser-downloaded artifact");
    const doi = asString(options.doi) || positionals[0];
    output(await researchNatureExport({ doi: doi || "", format: asString(options.format) as any, download_dir: asString(options["download-dir"] || options.downloadDir), profile: asString(options.profile), cdp_port: asNumber(options["cdp-port"] || options.cdpPort), tab_id: asString(options["tab-id"] || options.tabId) }), options);
    return;
  }
  if (command === "research:iet:search") {
    const query = asString(options.query) || positionals[0];
    output(await researchIetSearch({ query: query || "", area: asString(options.area) as any, page_size: asNumber(options["page-size"] || options.pageSize), profile: asString(options.profile), cdp_port: asNumber(options["cdp-port"] || options.cdpPort), tab_id: asString(options["tab-id"] || options.tabId) }), options);
    return;
  }
  if (command === "research:iet:filter") {
    const query = asString(options.query) || positionals[0];
    output(await researchIetFilter({ query: query || "", area: asString(options.area) as any, ppub: asString(options.ppub), after_year: asNumber(options["after-year"] || options.afterYear), before_year: asNumber(options["before-year"] || options.beforeYear), concept_id: asString(options["concept-id"] || options.conceptId), contrib_raw: asString(options["contrib-raw"] || options.contribRaw), series_key: asString(options["series-key"] || options.seriesKey), alphabet_range: asString(options["alphabet-range"] || options.alphabetRange), page_size: asNumber(options["page-size"] || options.pageSize), profile: asString(options.profile), cdp_port: asNumber(options["cdp-port"] || options.cdpPort), tab_id: asString(options["tab-id"] || options.tabId) }), options);
    return;
  }
  if (command === "research:iet:export") {
    if (asBoolean(options.confirmed) !== true) throw new Error("research:iet:export requires --confirmed because it writes a browser-downloaded artifact");
    const doi = asString(options.doi) || positionals[0];
    output(await researchIetExport({ doi: doi || "", format: asString(options.format) as any, download_dir: asString(options["download-dir"] || options.downloadDir), profile: asString(options.profile), cdp_port: asNumber(options["cdp-port"] || options.cdpPort), tab_id: asString(options["tab-id"] || options.tabId) }), options);
    return;
  }
  if (command === "research:aip:search") {
    const query = asString(options.query) || positionals[0];
    output(await researchAipSearch({ query: query || "", page_size: asNumber(options["page-size"] || options.pageSize), profile: asString(options.profile), cdp_port: asNumber(options["cdp-port"] || options.cdpPort), tab_id: asString(options["tab-id"] || options.tabId) }), options);
    return;
  }
  if (command === "research:aip:filter") {
    const query = asString(options.query) || positionals[0];
    output(await researchAipFilter({ query: query || "", content_type: asString(options["content-type"] || options.contentType), journal: asString(options.journal), subject: asString(options.subject), article_type: asString(options["article-type"] || options.articleType), book_series: asString(options["book-series"] || options.bookSeries), issue_section: asString(options["issue-section"] || options.issueSection), collection: asString(options.collection), from_date: asString(options["from-date"] || options.fromDate), to_date: asString(options["to-date"] || options.toDate), page_size: asNumber(options["page-size"] || options.pageSize), profile: asString(options.profile), cdp_port: asNumber(options["cdp-port"] || options.cdpPort), tab_id: asString(options["tab-id"] || options.tabId) }), options);
    return;
  }
  if (command === "research:aip:export") {
    if (asBoolean(options.confirmed) !== true) throw new Error("research:aip:export requires --confirmed because it writes a browser-downloaded artifact");
    const doi = asString(options.doi) || positionals[0];
    output(await researchAipExport({ doi: doi || "", format: asString(options.format) as any, download_dir: asString(options["download-dir"] || options.downloadDir), profile: asString(options.profile), cdp_port: asNumber(options["cdp-port"] || options.cdpPort), tab_id: asString(options["tab-id"] || options.tabId) }), options);
    return;
  }
  if (command === "research:mdpi:search") {
    const query = asString(options.query) || positionals[0];
    output(await researchMdpiSearch({ query: query || "", journal: asString(options.journal), article_type: asString(options["article-type"] || options.articleType), year_from: asNumber(options["year-from"] || options.yearFrom), year_to: asNumber(options["year-to"] || options.yearTo), view: asString(options.view) as any, sort: asString(options.sort), page_count: asNumber(options["page-count"] || options.pageCount), profile: asString(options.profile), cdp_port: asNumber(options["cdp-port"] || options.cdpPort), tab_id: asString(options["tab-id"] || options.tabId) }), options);
    return;
  }
  if (command === "research:mdpi:filter") {
    const query = asString(options.query) || positionals[0];
    output(await researchMdpiFilter({ query: query || "", journal: asString(options.journal), article_type: asString(options["article-type"] || options.articleType), year_from: asNumber(options["year-from"] || options.yearFrom), year_to: asNumber(options["year-to"] || options.yearTo), view: asString(options.view) as any, sort: asString(options.sort), page_count: asNumber(options["page-count"] || options.pageCount), country: asString(options.country), subject: asString(options.subject), profile: asString(options.profile), cdp_port: asNumber(options["cdp-port"] || options.cdpPort), tab_id: asString(options["tab-id"] || options.tabId) }), options);
    return;
  }
  if (command === "research:mdpi:export") {
    if (asBoolean(options.confirmed) !== true) throw new Error("research:mdpi:export requires --confirmed because it writes a browser-downloaded artifact");
    output(await researchMdpiExport({ article_url: asString(options["article-url"] || options.articleUrl), article_path: asString(options["article-path"] || options.articlePath), doi: asString(options.doi), format: asString(options.format) as any, download_dir: asString(options["download-dir"] || options.downloadDir), profile: asString(options.profile), cdp_port: asNumber(options["cdp-port"] || options.cdpPort), tab_id: asString(options["tab-id"] || options.tabId) }), options);
    return;
  }
  if (command === "research:optica:search") {
    const query = asString(options.query) || positionals[0];
    output(await researchOpticaSearch({ query: query || "", page_size: asNumber(options["page-size"] || options.pageSize), profile: asString(options.profile), cdp_port: asNumber(options["cdp-port"] || options.cdpPort), tab_id: asString(options["tab-id"] || options.tabId) }), options);
    return;
  }
  if (command === "research:optica:filter") {
    const query = asString(options.query) || positionals[0];
    output(await researchOpticaFilter({ query: query || "", year: asNumber(options.year), page_size: asNumber(options["page-size"] || options.pageSize), profile: asString(options.profile), cdp_port: asNumber(options["cdp-port"] || options.cdpPort), tab_id: asString(options["tab-id"] || options.tabId) }), options);
    return;
  }
  if (command === "research:optica:export") {
    if (asBoolean(options.confirmed) !== true) throw new Error("research:optica:export requires --confirmed because it writes a browser-downloaded artifact");
    const query = asString(options.query) || positionals[0];
    output(await researchOpticaExport({ query: query || "", article_id: asString(options["article-id"] || options.articleId) || "", format: asString(options.format) as any, download_dir: asString(options["download-dir"] || options.downloadDir), profile: asString(options.profile), cdp_port: asNumber(options["cdp-port"] || options.cdpPort), tab_id: asString(options["tab-id"] || options.tabId) }), options);
    return;
  }
  if (command === "research:proquest:search") {
    const query = asString(options.query) || positionals[0];
    output(await researchProquestSearch({ query: query || "", page_size: asNumber(options["page-size"] || options.pageSize), profile: asString(options.profile), cdp_port: asNumber(options["cdp-port"] || options.cdpPort), tab_id: asString(options["tab-id"] || options.tabId) }), options);
    return;
  }
  if (command === "research:proquest:filter") {
    const query = asString(options.query) || positionals[0];
    output(await researchProquestFilter({ query: query || "", full_text: asBoolean(options["full-text"] || options.fullText), peer_reviewed: asBoolean(options["peer-reviewed"] || options.peerReviewed), page_size: asNumber(options["page-size"] || options.pageSize), profile: asString(options.profile), cdp_port: asNumber(options["cdp-port"] || options.cdpPort), tab_id: asString(options["tab-id"] || options.tabId) }), options);
    return;
  }
  if (command === "research:proquest:export") {
    if (asBoolean(options.confirmed) !== true) throw new Error("research:proquest:export requires --confirmed because it writes a browser-downloaded artifact");
    const query = asString(options.query) || positionals[0];
    output(await researchProquestExport({ query: query || "", full_text: asBoolean(options["full-text"] || options.fullText), peer_reviewed: asBoolean(options["peer-reviewed"] || options.peerReviewed), format: asString(options.format) as any, download_dir: asString(options["download-dir"] || options.downloadDir), profile: asString(options.profile), cdp_port: asNumber(options["cdp-port"] || options.cdpPort), tab_id: asString(options["tab-id"] || options.tabId) }), options);
    return;
  }

  if (command === "research:frontiers:search") {
    const query = asString(options.query) || positionals[0];
    output(await researchFrontiersSearch({ query: query || "", page_size: asNumber(options["page-size"] || options.pageSize), profile: asString(options.profile), cdp_port: asNumber(options["cdp-port"] || options.cdpPort), tab_id: asString(options["tab-id"] || options.tabId) }), options);
    return;
  }
  if (command === "research:frontiers:filter") {
    const query = asString(options.query) || positionals[0];
    output(await researchFrontiersFilter({ query: query || "", group: asString(options.group) as any, option_id: asString(options["option-id"] || options.optionId) || "", option_label: asString(options["option-label"] || options.optionLabel), page_size: asNumber(options["page-size"] || options.pageSize), profile: asString(options.profile), cdp_port: asNumber(options["cdp-port"] || options.cdpPort), tab_id: asString(options["tab-id"] || options.tabId) }), options);
    return;
  }
  if (command === "research:frontiers:export") {
    if (asBoolean(options.confirmed) !== true) throw new Error("research:frontiers:export requires --confirmed because it writes a browser-downloaded artifact");
    const doi = asString(options.doi) || positionals[0];
    output(await researchFrontiersExport({ doi: doi || "", journal_slug: asString(options["journal-slug"] || options.journalSlug), article_url: asString(options["article-url"] || options.articleUrl), format: asString(options.format) as any, filename: asString(options.filename), download_dir: asString(options["download-dir"] || options.downloadDir), profile: asString(options.profile), cdp_port: asNumber(options["cdp-port"] || options.cdpPort), tab_id: asString(options["tab-id"] || options.tabId) }), options);
    return;
  }
  if (command === "research:arxiv:search") {
    const query = asString(options.query) || positionals[0];
    output(await researchArxivSearch({ query, field: asString(options.field) as any, page_size: asNumber(options["page-size"] || options.pageSize), order: asString(options.order) as any, profile: asString(options.profile), cdp_port: asNumber(options["cdp-port"] || options.cdpPort), tab_id: asString(options["tab-id"] || options.tabId) }), options);
    return;
  }
  if (command === "research:arxiv:filter") {
    const query = asString(options.query) || positionals[0];
    output(await researchArxivFilter({ query, field: asString(options.field) as any, subject: asString(options.subject), physics_archive: asString(options["physics-archive"] || options.physicsArchive), include_cross_list: asString(options["include-cross-list"] || options.includeCrossList) as any, date_filter_by: asString(options["date-filter-by"] || options.dateFilterBy) as any, year: asNumber(options.year), from_date: asString(options["from-date"] || options.fromDate), to_date: asString(options["to-date"] || options.toDate), date_type: asString(options["date-type"] || options.dateType) as any, abstracts: asString(options.abstracts) as any, include_older_versions: asBoolean(options["include-older-versions"] || options.includeOlderVersions), page_size: asNumber(options["page-size"] || options.pageSize), order: asString(options.order) as any, profile: asString(options.profile), cdp_port: asNumber(options["cdp-port"] || options.cdpPort), tab_id: asString(options["tab-id"] || options.tabId) }), options);
    return;
  }
  if (command === "research:arxiv:export") {
    if (asBoolean(options.confirmed) !== true) throw new Error("research:arxiv:export requires --confirmed because it writes a browser-downloaded artifact");
    const id = asString(options.id) || positionals[0];
    output(await researchArxivExport({ id: id || "", format: asString(options.format) as any, filename: asString(options.filename), download_dir: asString(options["download-dir"] || options.downloadDir), profile: asString(options.profile), cdp_port: asNumber(options["cdp-port"] || options.cdpPort), tab_id: asString(options["tab-id"] || options.tabId) }), options);
    return;
  }
  if (command === "research:siam:search") {
    const query = asString(options.query) || positionals[0];
    output(await researchSiamSearch({ query: query || "", area: asString(options.area) as any, page_size: asNumber(options["page-size"] || options.pageSize), profile: asString(options.profile), cdp_port: asNumber(options["cdp-port"] || options.cdpPort), tab_id: asString(options["tab-id"] || options.tabId) }), options);
    return;
  }
  if (command === "research:siam:filter") {
    const query = asString(options.query) || positionals[0];
    output(await researchSiamFilter({ query: query || "", area: asString(options.area) as any, after_year: asNumber(options["after-year"] || options.afterYear), before_year: asNumber(options["before-year"] || options.beforeYear), pub_type: asString(options["pub-type"] || options.pubType), series_key: asString(options["series-key"] || options.seriesKey), contrib_raw: asString(options["contrib-raw"] || options.contribRaw), concept_id: asString(options["concept-id"] || options.conceptId), page_size: asNumber(options["page-size"] || options.pageSize), profile: asString(options.profile), cdp_port: asNumber(options["cdp-port"] || options.cdpPort), tab_id: asString(options["tab-id"] || options.tabId) }), options);
    return;
  }
  if (command === "research:siam:export") {
    if (asBoolean(options.confirmed) !== true) throw new Error("research:siam:export requires --confirmed because it writes a browser-downloaded artifact");
    const doi = asString(options.doi) || positionals[0];
    output(await researchSiamExport({ doi: doi || "", format: asString(options.format) as any, download_dir: asString(options["download-dir"] || options.downloadDir), profile: asString(options.profile), cdp_port: asNumber(options["cdp-port"] || options.cdpPort), tab_id: asString(options["tab-id"] || options.tabId) }), options);
    return;
  }
  if (command === "research:degruyter:search") {
    output(await researchDegruyterSearch({ title: asString(options.title), family_name: asString(options["family-name"] || options.familyName), reference: asString(options.reference), match: asString(options.match) as any, min_pub_year: asNumber(options["min-pub-year"] || options.minPubYear), max_pub_year: asNumber(options["max-pub-year"] || options.maxPubYear), document_types: asStringList(options["document-types"] || options.documentTypes), sort_by: asString(options["sort-by"] || options.sortBy) as any, document_visibility: asString(options["document-visibility"] || options.documentVisibility) as any, page_size: asNumber(options["page-size"] || options.pageSize), profile: asString(options.profile), cdp_port: asNumber(options["cdp-port"] || options.cdpPort), tab_id: asString(options["tab-id"] || options.tabId) }), options);
    return;
  }
  if (command === "research:degruyter:filter") {
    output(await researchDegruyterFilter({ title: asString(options.title), family_name: asString(options["family-name"] || options.familyName), reference: asString(options.reference), match: asString(options.match) as any, min_pub_year: asNumber(options["min-pub-year"] || options.minPubYear), max_pub_year: asNumber(options["max-pub-year"] || options.maxPubYear), document_type_facet: asString(options["document-type-facet"] || options.documentTypeFacet), subject: asString(options.subject), publisher: asString(options.publisher), language: asString(options.language), access: asString(options.access), pub_date: asString(options["pub-date"] || options.pubDate), sort_by: asString(options["sort-by"] || options.sortBy) as any, document_visibility: asString(options["document-visibility"] || options.documentVisibility) as any, page_size: asNumber(options["page-size"] || options.pageSize), profile: asString(options.profile), cdp_port: asNumber(options["cdp-port"] || options.cdpPort), tab_id: asString(options["tab-id"] || options.tabId) }), options);
    return;
  }
  if (command === "research:degruyter:export") {
    if (asBoolean(options.confirmed) !== true) throw new Error("research:degruyter:export requires --confirmed because it writes a browser-downloaded artifact");
    const doi = asString(options.doi) || positionals[0];
    output(await researchDegruyterExport({ doi: doi || "", format: asString(options.format) as any, download_dir: asString(options["download-dir"] || options.downloadDir), profile: asString(options.profile), cdp_port: asNumber(options["cdp-port"] || options.cdpPort), tab_id: asString(options["tab-id"] || options.tabId) }), options);
    return;
  }
  if (command === "research:worldsci:search") {
    const query = asString(options.query) || positionals[0];
    output(await researchWorldsciSearch({ query: query || "", area: asString(options.area) as any, page_size: asNumber(options["page-size"] || options.pageSize), profile: asString(options.profile), cdp_port: asNumber(options["cdp-port"] || options.cdpPort), tab_id: asString(options["tab-id"] || options.tabId) }), options);
    return;
  }
  if (command === "research:worldsci:filter") {
    const query = asString(options.query) || positionals[0];
    output(await researchWorldsciFilter({ query: query || "", area: asString(options.area) as any, pub_type: asString(options["pub-type"] || options.pubType), content_item_type: asString(options["content-item-type"] || options.contentItemType), ppub: asString(options.ppub), after_year: asNumber(options["after-year"] || options.afterYear), before_year: asNumber(options["before-year"] || options.beforeYear), contrib_raw: asString(options["contrib-raw"] || options.contribRaw), concept_id: asString(options["concept-id"] || options.conceptId), access: asString(options.access), sort_by: asString(options["sort-by"] || options.sortBy), page_size: asNumber(options["page-size"] || options.pageSize), profile: asString(options.profile), cdp_port: asNumber(options["cdp-port"] || options.cdpPort), tab_id: asString(options["tab-id"] || options.tabId) }), options);
    return;
  }
  if (command === "research:worldsci:export") {
    if (asBoolean(options.confirmed) !== true) throw new Error("research:worldsci:export requires --confirmed because it writes a browser-downloaded artifact");
    const doi = asString(options.doi) || positionals[0];
    output(await researchWorldsciExport({ doi: doi || "", format: asString(options.format) as any, download_dir: asString(options["download-dir"] || options.downloadDir), profile: asString(options.profile), cdp_port: asNumber(options["cdp-port"] || options.cdpPort), tab_id: asString(options["tab-id"] || options.tabId) }), options);
    return;
  }
  if (command === "research:royalsoc:search") {
    const query = asString(options.query) || positionals[0];
    output(await researchRoyalSocSearch({ query: query || "", page: asNumber(options.page), profile: asString(options.profile), cdp_port: asNumber(options["cdp-port"] || options.cdpPort), tab_id: asString(options["tab-id"] || options.tabId) }), options);
    return;
  }
  if (command === "research:royalsoc:filter") {
    const query = asString(options.query) || positionals[0];
    output(await researchRoyalSocFilter({ query: query || "", page: asNumber(options.page), journal: asString(options.journal), article_type: asString(options["article-type"] || options.articleType), subject_id: asString(options["subject-id"] || options.subjectId), issue_section: asString(options["issue-section"] || options.issueSection), profile: asString(options.profile), cdp_port: asNumber(options["cdp-port"] || options.cdpPort), tab_id: asString(options["tab-id"] || options.tabId) }), options);
    return;
  }
  if (command === "research:royalsoc:export") {
    if (asBoolean(options.confirmed) !== true) throw new Error("research:royalsoc:export requires --confirmed because it writes a browser-downloaded artifact");
    const doi = asString(options.doi) || positionals[0];
    output(await researchRoyalSocExport({ doi, resource_id: asString(options["resource-id"] || options.resourceId), format: asString(options.format) as any, download_dir: asString(options["download-dir"] || options.downloadDir), profile: asString(options.profile), cdp_port: asNumber(options["cdp-port"] || options.cdpPort), tab_id: asString(options["tab-id"] || options.tabId) }), options);
    return;
  }
  if (command === "research:scoap3:search") {
    const query = asString(options.query) || positionals[0];
    output(await researchScoap3Search({ query: query || "", page: asNumber(options.page), size: asNumber(options.size), sort: asString(options.sort), profile: asString(options.profile), cdp_port: asNumber(options["cdp-port"] || options.cdpPort), tab_id: asString(options["tab-id"] || options.tabId) }), options);
    return;
  }
  if (command === "research:scoap3:filter") {
    const query = asString(options.query) || positionals[0];
    output(await researchScoap3Filter({ query: query || "", journal: asString(options.journal) as any, country: asString(options.country) as any, country_logic: asString(options["country-logic"] || options.countryLogic), publication_year_gte: asNumber(options["publication-year-gte"] || options.publicationYearGte), publication_year_lte: asNumber(options["publication-year-lte"] || options.publicationYearLte), page: asNumber(options.page), size: asNumber(options.size), sort: asString(options.sort), profile: asString(options.profile), cdp_port: asNumber(options["cdp-port"] || options.cdpPort), tab_id: asString(options["tab-id"] || options.tabId) }), options);
    return;
  }
  if (command === "research:scoap3:export") {
    if (asBoolean(options.confirmed) !== true) throw new Error("research:scoap3:export requires --confirmed because it writes a browser-downloaded artifact");
    const query = asString(options.query) || positionals[0];
    output(await researchScoap3Export({ query: query || "", journal: asString(options.journal) as any, country: asString(options.country) as any, country_logic: asString(options["country-logic"] || options.countryLogic), publication_year_gte: asNumber(options["publication-year-gte"] || options.publicationYearGte), publication_year_lte: asNumber(options["publication-year-lte"] || options.publicationYearLte), record_id: asNumber(options["record-id"] || options.recordId), format: asString(options.format) as any, filename: asString(options.filename), download_dir: asString(options["download-dir"] || options.downloadDir), profile: asString(options.profile), cdp_port: asNumber(options["cdp-port"] || options.cdpPort), tab_id: asString(options["tab-id"] || options.tabId) }), options);
    return;
  }
  if (command === "research:dblp:search") {
    const query = asString(options.query) || positionals[0];
    output(await researchDblpSearch({ query: query || "", mode: asString(options.mode) as any, profile: asString(options.profile), cdp_port: asNumber(options["cdp-port"] || options.cdpPort), tab_id: asString(options["tab-id"] || options.tabId) }), options);
    return;
  }
  if (command === "research:dblp:filter") {
    const query = asString(options.query) || positionals[0];
    output(await researchDblpFilter({ query: query || "", mode: asString(options.mode) as any, refine_token: asString(options["refine-token"] || options.refineToken), type: asString(options.type), year: asNumber(options.year), author_token: asString(options["author-token"] || options.authorToken), venue_token: asString(options["venue-token"] || options.venueToken), access_token: asString(options["access-token"] || options.accessToken), profile: asString(options.profile), cdp_port: asNumber(options["cdp-port"] || options.cdpPort), tab_id: asString(options["tab-id"] || options.tabId) }), options);
    return;
  }
  if (command === "research:dblp:export") {
    if (asBoolean(options.confirmed) !== true) throw new Error("research:dblp:export requires --confirmed because it writes a browser-downloaded artifact");
    const key = asString(options.key) || positionals[0];
    output(await researchDblpExport({ key, query: asString(options.query), format: asString(options.format) as any, bulk: asBoolean(options.bulk), h: asNumber(options.h), filename: asString(options.filename), download_dir: asString(options["download-dir"] || options.downloadDir), profile: asString(options.profile), cdp_port: asNumber(options["cdp-port"] || options.cdpPort), tab_id: asString(options["tab-id"] || options.tabId) }), options);
    return;
  }
  if (command === "research:scielo:search") {
    const query = asString(options.query) || positionals[0];
    output(await researchScieloSearch({ query: query || "", lang: asString(options.lang), count: asNumber(options.count), from: asNumber(options.from), page: asNumber(options.page), sort: asString(options.sort), format: asString(options.format), profile: asString(options.profile), cdp_port: asNumber(options["cdp-port"] || options.cdpPort), tab_id: asString(options["tab-id"] || options.tabId) }), options);
    return;
  }
  if (command === "research:scielo:filter") {
    const query = asString(options.query) || positionals[0];
    output(await researchScieloFilter({ query: query || "", lang: asString(options.lang), count: asNumber(options.count), from: asNumber(options.from), page: asNumber(options.page), sort: asString(options.sort), format: asString(options.format), collection: asString(options.collection), country: asString(options.country), journal_title: asString(options["journal-title"] || options.journalTitle), language: asString(options.language), year_cluster: asString(options["year-cluster"] || options.yearCluster), subject_area: asString(options["subject-area"] || options.subjectArea), wok_subject_categories: asString(options["wok-subject-categories"] || options.wokSubjectCategories), wok_citation_index: asString(options["wok-citation-index"] || options.wokCitationIndex), is_citable: asString(options["is-citable"] || options.isCitable), literature_type: asString(options["literature-type"] || options.literatureType), network_classification: asString(options["network-classification"] || options.networkClassification), profile: asString(options.profile), cdp_port: asNumber(options["cdp-port"] || options.cdpPort), tab_id: asString(options["tab-id"] || options.tabId) }), options);
    return;
  }
  if (command === "research:scielo:export") {
    if (asBoolean(options.confirmed) !== true) throw new Error("research:scielo:export requires --confirmed because it writes a browser-downloaded artifact");
    const query = asString(options.query) || positionals[0];
    output(await researchScieloExport({ query: query || "", lang: asString(options.lang), count: asNumber(options.count), from: asNumber(options.from), page: asNumber(options.page), sort: asString(options.sort), format: asString(options.format), collection: asString(options.collection), country: asString(options.country), journal_title: asString(options["journal-title"] || options.journalTitle), language: asString(options.language), year_cluster: asString(options["year-cluster"] || options.yearCluster), subject_area: asString(options["subject-area"] || options.subjectArea), wok_subject_categories: asString(options["wok-subject-categories"] || options.wokSubjectCategories), wok_citation_index: asString(options["wok-citation-index"] || options.wokCitationIndex), is_citable: asString(options["is-citable"] || options.isCitable), literature_type: asString(options["literature-type"] || options.literatureType), network_classification: asString(options["network-classification"] || options.networkClassification), export_format: asString(options["export-format"] || options.exportFormat) as any, selection: asString(options.selection) as any, download_dir: asString(options["download-dir"] || options.downloadDir), profile: asString(options.profile), cdp_port: asNumber(options["cdp-port"] || options.cdpPort), tab_id: asString(options["tab-id"] || options.tabId) }), options);
    return;
  }
  if (command === "research:inspirehep:search") {
    const query = asString(options.query) || positionals[0];
    output(await researchInspirehepSearch({ query: query || "", page_size: asNumber(options["page-size"] || options.pageSize), profile: asString(options.profile), cdp_port: asNumber(options["cdp-port"] || options.cdpPort), tab_id: asString(options["tab-id"] || options.tabId) }), options);
    return;
  }
  if (command === "research:inspirehep:filter") {
    const query = asString(options.query) || positionals[0];
    output(await researchInspirehepFilter({ query: query || "", doc_type: asString(options["doc-type"] || options.docType), author_count: asString(options["author-count"] || options.authorCount), rpp: asString(options.rpp), author: asString(options.author), subject: asString(options.subject), arxiv_category: asString(options["arxiv-category"] || options.arxivCategory), collaboration: asString(options.collaboration), earliest_date: asString(options["earliest-date"] || options.earliestDate), facet: asString(options.facet) as any, facet_value: asString(options["facet-value"] || options.facetValue), page_size: asNumber(options["page-size"] || options.pageSize), profile: asString(options.profile), cdp_port: asNumber(options["cdp-port"] || options.cdpPort), tab_id: asString(options["tab-id"] || options.tabId) }), options);
    return;
  }
  if (command === "research:inspirehep:export") {
    if (asBoolean(options.confirmed) !== true) throw new Error("research:inspirehep:export requires --confirmed because it writes a browser-downloaded artifact");
    const control_number = asString(options["control-number"] || options.controlNumber) || positionals[0];
    output(await researchInspirehepExport({ control_number, query: asString(options.query), doc_type: asString(options["doc-type"] || options.docType), size: asNumber(options.size), format: asString(options.format) as any, filename: asString(options.filename), download_dir: asString(options["download-dir"] || options.downloadDir), profile: asString(options.profile), cdp_port: asNumber(options["cdp-port"] || options.cdpPort), tab_id: asString(options["tab-id"] || options.tabId) }), options);
    return;
  }
  if (command === "research:pubscholar:search") {
    const query = asString(options.query) || positionals[0];
    output(await researchPubscholarSearch({ query: query || "", keyword: asString(options.keyword), field: asString(options.field) as any, page_size: asNumber(options["page-size"] || options.pageSize), profile: asString(options.profile), cdp_port: asNumber(options["cdp-port"] || options.cdpPort), tab_id: asString(options["tab-id"] || options.tabId) }), options);
    return;
  }
  if (command === "research:pubscholar:filter") {
    const query = asString(options.query) || positionals[0];
    output(await researchPubscholarFilter({ query: query || "", keyword: asString(options.keyword), field: asString(options.field) as any, facet_group: asString(options["facet-group"] || options.facetGroup), facet_value: asString(options["facet-value"] || options.facetValue), publication_year: asNumber(options["publication-year"] || options.publicationYear), resource_type: asString(options["resource-type"] || options.resourceType), full_text: asBoolean(options["full-text"] || options.fullText), page_size: asNumber(options["page-size"] || options.pageSize), profile: asString(options.profile), cdp_port: asNumber(options["cdp-port"] || options.cdpPort), tab_id: asString(options["tab-id"] || options.tabId) }), options);
    return;
  }
  if (command === "research:pubscholar:export") {
    if (asBoolean(options.confirmed) !== true) throw new Error("research:pubscholar:export requires --confirmed because it writes a browser-downloaded artifact");
    const query = asString(options.query) || positionals[0];
    output(await researchPubscholarExport({ query: query || "", keyword: asString(options.keyword), field: asString(options.field) as any, facet_group: asString(options["facet-group"] || options.facetGroup), facet_value: asString(options["facet-value"] || options.facetValue), publication_year: asNumber(options["publication-year"] || options.publicationYear), resource_type: asString(options["resource-type"] || options.resourceType), full_text: asBoolean(options["full-text"] || options.fullText), format: asString(options.format) as any, download_dir: asString(options["download-dir"] || options.downloadDir), profile: asString(options.profile), cdp_port: asNumber(options["cdp-port"] || options.cdpPort), tab_id: asString(options["tab-id"] || options.tabId) }), options);
    return;
  }
  if (command === "research:opticsjournal:search") {
    const query = asString(options.query) || positionals[0];
    output(await researchOpticsjournalSearch({ query: query || "", field_type: asString(options["field-type"] || options.fieldType) as any, journal_scope: asString(options["journal-scope"] || options.journalScope), year_from: asNumber(options["year-from"] || options.yearFrom), year_to: asNumber(options["year-to"] || options.yearTo), sort: asString(options.sort), page_size: asNumber(options["page-size"] || options.pageSize), profile: asString(options.profile), cdp_port: asNumber(options["cdp-port"] || options.cdpPort), tab_id: asString(options["tab-id"] || options.tabId) }), options);
    return;
  }
  if (command === "research:opticsjournal:filter") {
    const query = asString(options.query) || positionals[0];
    output(await researchOpticsjournalFilter({ query: query || "", field_type: asString(options["field-type"] || options.fieldType) as any, journal_scope: asString(options["journal-scope"] || options.journalScope), year_from: asNumber(options["year-from"] || options.yearFrom), year_to: asNumber(options["year-to"] || options.yearTo), sort: asString(options.sort), page_size: asNumber(options["page-size"] || options.pageSize), facet: asString(options.facet) as any, facet_value: asString(options["facet-value"] || options.facetValue), journal_code: asString(options["journal-code"] || options.journalCode), pubyear: asNumber(options.pubyear), author: asString(options.author), topic_cn: asString(options["topic-cn"] || options.topicCn), topic_en: asString(options["topic-en"] || options.topicEn), profile: asString(options.profile), cdp_port: asNumber(options["cdp-port"] || options.cdpPort), tab_id: asString(options["tab-id"] || options.tabId) }), options);
    return;
  }
  if (command === "research:opticsjournal:export") {
    if (asBoolean(options.confirmed) !== true) throw new Error("research:opticsjournal:export requires --confirmed because it writes a browser-downloaded artifact");
    const query = asString(options.query) || positionals[0];
    output(await researchOpticsjournalExport({ query: query || "", field_type: asString(options["field-type"] || options.fieldType) as any, journal_scope: asString(options["journal-scope"] || options.journalScope), year_from: asNumber(options["year-from"] || options.yearFrom), year_to: asNumber(options["year-to"] || options.yearTo), sort: asString(options.sort), page_size: asNumber(options["page-size"] || options.pageSize), facet: asString(options.facet) as any, facet_value: asString(options["facet-value"] || options.facetValue), journal_code: asString(options["journal-code"] || options.journalCode), pubyear: asNumber(options.pubyear), author: asString(options.author), topic_cn: asString(options["topic-cn"] || options.topicCn), topic_en: asString(options["topic-en"] || options.topicEn), format: asString(options.format) as any, download_dir: asString(options["download-dir"] || options.downloadDir), profile: asString(options.profile), cdp_port: asNumber(options["cdp-port"] || options.cdpPort), tab_id: asString(options["tab-id"] || options.tabId) }), options);
    return;
  }
  if (command === "research:crc:search") {
    const query = asString(options.query) || positionals[0];
    output(await researchCrcSearch({ query: query || "", title: asString(options.title), author: asString(options.author), keyword: asString(options.keyword), page_size: asNumber(options["page-size"] || options.pageSize), profile: asString(options.profile), cdp_port: asNumber(options["cdp-port"] || options.cdpPort), tab_id: asString(options["tab-id"] || options.tabId) }), options);
    return;
  }
  if (command === "research:crc:filter") {
    const query = asString(options.query) || positionals[0];
    output(await researchCrcFilter({ query: query || "", title: asString(options.title), author: asString(options.author), keyword: asString(options.keyword), access_facet: asString(options["access-facet"] || options.accessFacet) as any, open_access: asBoolean(options["open-access"] || options.openAccess), free_to_view: asBoolean(options["free-to-view"] || options.freeToView), access_content: asBoolean(options["access-content"] || options.accessContent), licensed_content: asBoolean(options["licensed-content"] || options.licensedContent), include_forthcoming: asBoolean(options["include-forthcoming"] || options.includeForthcoming), fully_oa_books: asBoolean(options["fully-oa-books"] || options.fullyOaBooks), books_with_oa_chapters: asBoolean(options["books-with-oa-chapters"] || options.booksWithOaChapters), year_from: asNumber(options["year-from"] || options.yearFrom), year_to: asNumber(options["year-to"] || options.yearTo), page_size: asNumber(options["page-size"] || options.pageSize), profile: asString(options.profile), cdp_port: asNumber(options["cdp-port"] || options.cdpPort), tab_id: asString(options["tab-id"] || options.tabId) }), options);
    return;
  }
  if (command === "research:crc:export") {
    if (asBoolean(options.confirmed) !== true) throw new Error("research:crc:export requires --confirmed because it writes a browser-downloaded artifact");
    const query = asString(options.query) || positionals[0];
    output(await researchCrcExport({ query: query || "", title: asString(options.title), author: asString(options.author), keyword: asString(options.keyword), access_facet: asString(options["access-facet"] || options.accessFacet) as any, open_access: asBoolean(options["open-access"] || options.openAccess), free_to_view: asBoolean(options["free-to-view"] || options.freeToView), access_content: asBoolean(options["access-content"] || options.accessContent), licensed_content: asBoolean(options["licensed-content"] || options.licensedContent), include_forthcoming: asBoolean(options["include-forthcoming"] || options.includeForthcoming), fully_oa_books: asBoolean(options["fully-oa-books"] || options.fullyOaBooks), books_with_oa_chapters: asBoolean(options["books-with-oa-chapters"] || options.booksWithOaChapters), year_from: asNumber(options["year-from"] || options.yearFrom), year_to: asNumber(options["year-to"] || options.yearTo), format: asString(options.format) as any, download_dir: asString(options["download-dir"] || options.downloadDir), profile: asString(options.profile), cdp_port: asNumber(options["cdp-port"] || options.cdpPort), tab_id: asString(options["tab-id"] || options.tabId) }), options);
    return;
  }
  if (command === "research:cellpress:search") {
    const query = asString(options.query) || positionals[0];
    output(await researchCellpressSearch({ query: query || "", area: asString(options.area) as any, page_size: asNumber(options["page-size"] || options.pageSize), profile: asString(options.profile), cdp_port: asNumber(options["cdp-port"] || options.cdpPort), tab_id: asString(options["tab-id"] || options.tabId) }), options);
    return;
  }
  if (command === "research:cellpress:filter") {
    const query = asString(options.query) || positionals[0];
    output(await researchCellpressFilter({ query: query || "", area: asString(options.area) as any, content_item_type: asString(options["content-item-type"] || options.contentItemType), after_year: asNumber(options["after-year"] || options.afterYear), before_year: asNumber(options["before-year"] || options.beforeYear), author: asString(options.author), journal: asString(options.journal), collection: asString(options.collection), keyword: asString(options.keyword), access: asString(options.access), sort_by: asString(options["sort-by"] || options.sortBy), page_size: asNumber(options["page-size"] || options.pageSize), profile: asString(options.profile), cdp_port: asNumber(options["cdp-port"] || options.cdpPort), tab_id: asString(options["tab-id"] || options.tabId) }), options);
    return;
  }
  if (command === "research:cellpress:export") {
    if (asBoolean(options.confirmed) !== true) throw new Error("research:cellpress:export requires --confirmed because it writes a browser-downloaded artifact");
    const pii = asString(options.pii) || positionals[0];
    output(await researchCellpressExport({ pii: pii || "", format: asString(options.format) as any, filename: asString(options.filename), download_dir: asString(options["download-dir"] || options.downloadDir), profile: asString(options.profile), cdp_port: asNumber(options["cdp-port"] || options.cdpPort), tab_id: asString(options["tab-id"] || options.tabId) }), options);
    return;
  }
  if (command === "research:iest:search") {
    const query = asString(options.query) || positionals[0];
    output(await researchIestSearch({ query: query || "", field: asString(options.field) as any, page_size: asNumber(options["page-size"] || options.pageSize), profile: asString(options.profile), cdp_port: asNumber(options["cdp-port"] || options.cdpPort), tab_id: asString(options["tab-id"] || options.tabId) }), options);
    return;
  }
  if (command === "research:iest:filter") {
    const query = asString(options.query) || positionals[0];
    output(await researchIestFilter({ query: query || "", field: asString(options.field) as any, access: asString(options.access), type: asString(options.type), from_year: asNumber(options["from-year"] || options.fromYear), to_year: asNumber(options["to-year"] || options.toYear), refine_query: asString(options["refine-query"] || options.refineQuery), refine_field: asString(options["refine-field"] || options.refineField) as any, page_size: asNumber(options["page-size"] || options.pageSize), profile: asString(options.profile), cdp_port: asNumber(options["cdp-port"] || options.cdpPort), tab_id: asString(options["tab-id"] || options.tabId) }), options);
    return;
  }
  if (command === "research:iest:export") {
    if (asBoolean(options.confirmed) !== true) throw new Error("research:iest:export requires --confirmed because it writes a browser-downloaded artifact");
    output(await researchIestExport({ article_url: asString(options["article-url"] || options.articleUrl), article_path: asString(options["article-path"] || options.articlePath), format: asString(options.format) as any, download_dir: asString(options["download-dir"] || options.downloadDir), profile: asString(options.profile), cdp_port: asNumber(options["cdp-port"] || options.cdpPort), tab_id: asString(options["tab-id"] || options.tabId) }), options);
    return;
  }
  if (command === "research:incopat:search") {
    const query = asString(options.query) || positionals[0];
    output(await researchIncopatSearch({ query: query || "", page_size: asNumber(options["page-size"] || options.pageSize), profile: asString(options.profile), cdp_port: asNumber(options["cdp-port"] || options.cdpPort), tab_id: asString(options["tab-id"] || options.tabId) }), options);
    return;
  }
  if (command === "research:incopat:filter") {
    const query = asString(options.query) || positionals[0];
    output(await researchIncopatFilter({ query: query || "", country: asString(options.country), page_size: asNumber(options["page-size"] || options.pageSize), profile: asString(options.profile), cdp_port: asNumber(options["cdp-port"] || options.cdpPort), tab_id: asString(options["tab-id"] || options.tabId) }), options);
    return;
  }
  if (command === "research:incopat:export") {
    if (asBoolean(options.confirmed) !== true) throw new Error("research:incopat:export requires --confirmed because it writes a browser-downloaded artifact");
    const query = asString(options.query) || positionals[0];
    output(await researchIncopatExport({ query: query || "", country: asString(options.country), format: asString(options.format) as any, download_dir: asString(options["download-dir"] || options.downloadDir), page_size: asNumber(options["page-size"] || options.pageSize), profile: asString(options.profile), cdp_port: asNumber(options["cdp-port"] || options.cdpPort), tab_id: asString(options["tab-id"] || options.tabId) }), options);
    return;
  }
  if (command === "research:wanfang:search") {
    const query = asString(options.query) || positionals[0];
    output(await researchWanfangSearch({ query: query || "", page_size: asNumber(options["page-size"] || options.pageSize), profile: asString(options.profile), cdp_port: asNumber(options["cdp-port"] || options.cdpPort), tab_id: asString(options["tab-id"] || options.tabId) }), options);
    return;
  }
  if (command === "research:wanfang:filter") {
    const query = asString(options.query) || positionals[0];
    output(await researchWanfangFilter({ query: query || "", resource_type: asString(options["resource-type"] || options.resourceType), resource_label: asString(options["resource-label"] || options.resourceLabel), page_size: asNumber(options["page-size"] || options.pageSize), profile: asString(options.profile), cdp_port: asNumber(options["cdp-port"] || options.cdpPort), tab_id: asString(options["tab-id"] || options.tabId) }), options);
    return;
  }
  if (command === "research:wanfang:export") {
    if (asBoolean(options.confirmed) !== true) throw new Error("research:wanfang:export requires --confirmed because it writes a browser-downloaded artifact");
    const query = asString(options.query) || positionals[0];
    output(await researchWanfangExport({ query: query || "", resource_type: asString(options["resource-type"] || options.resourceType), resource_label: asString(options["resource-label"] || options.resourceLabel), format: asString(options.format) as any, download_dir: asString(options["download-dir"] || options.downloadDir), row_index: asNumber(options["row-index"] || options.rowIndex), page_size: asNumber(options["page-size"] || options.pageSize), profile: asString(options.profile), cdp_port: asNumber(options["cdp-port"] || options.cdpPort), tab_id: asString(options["tab-id"] || options.tabId) }), options);
    return;
  }
  if (command === "capability:library:import") {
    const file = positionals[0] || asString(options.file) || path.resolve(process.cwd(), "docs/capability-library.json");
    output(new CapabilityLibraryImporter(new CapabilityDatabase()).importFile(file), options);
    return;
  }
  if (command === "site:capture-map") {
    const site = asString(options.site) || positionals[0];
    if (!site) throw new Error("site:capture-map requires --site <id>");
    const fixture = asString(options.fixture);
    const snapshot = fixture ? readHtmlSnapshotFromFile(path.resolve(fixture)) : await withManagedPage(async (page) => readPageSnapshot(page, { includeAccessibility: true }), options, asString(options.url)) as any;
    const siteMap = captureSiteMapForSnapshot(site, snapshot, `profile=${asString(options.profile, "research-default")}`);
    const saved = saveSiteMap(siteMap);
    output({ saved, siteMap }, options);
    return;
  }

  if (command === "scheduler:run") {
    output({ ok: true, mode: "foreground", intervalMinutes: asNumber(options["interval-minutes"]) || 60, message: "Foreground scheduler is configured. Add scheduled_jobs rows or invoke capability:update manually for now." }, options);
    return;
  }

  // Backwards-compatible commands from the first version.
  if (command === "browser:start") {
    const result = await withSession(async (session) => ({ started: true, pages: await session.pages() }), { ...options, "keep-open": options["keep-open"] ?? true });
    output(result, options);
    if (options["keep-open"]) await new Promise(() => undefined);
    return;
  }
  if (command === "browser:open") {
    const url = positionals[0];
    if (!url) throw new Error("browser:open requires a URL");
    if (asString(options["tab-id"] || options.tabId)) {
      output(await withManagedPage(async (page) => {
        await page.goto(url, { waitUntil: "domcontentloaded" });
        return { opened: url, tabId: asString(options["tab-id"] || options.tabId), url: page.url?.() || url };
      }, options, url), options);
      return;
    }
    output(await withSession(async (session) => { await session.open(url); return { opened: url, pages: await session.pages() }; }, options), options);
    return;
  }
  if (command === "browser:read" || command === "browser:screenshot") {
    const mode = snapshotMode(options);
    const includePortals = command === "browser:read" && (options["include-portals"] === true || options.includePortals === true);
    if (asString(options["tab-id"] || options.tabId)) {
      output(await withManagedPage(async (page) => readPageSnapshot(page, { mode, screenshot: command === "browser:screenshot" || options.screenshot === true, includeAccessibility: mode !== "lite", includePortals }), options, asString(options.url)), options);
      return;
    }
    output(await withSession(async (session) => {
      const page = session.activePage() || await session.newPage();
      return readPageSnapshot(page, { mode, screenshot: command === "browser:screenshot" || options.screenshot === true, includeAccessibility: mode !== "lite", includePortals });
    }, options), options);
    return;
  }
  if (command === "recipe") {
    const id = positionals[0];
    if (!id) throw new Error("recipe requires an id");
    const variables: Record<string, string> = {};
    for (const [key, value] of Object.entries(options)) if (key !== "_" && typeof value === "string") variables[key] = value;
    output(await withSession(async (session) => {
      const exec = new ActionExecutor({ getActivePage: () => session.activePage(), openUrl: (url) => session.open(url), downloads: session.downloads });
      const engine = new RecipeEngine({ executor: exec, getActivePage: () => session.activePage() });
      return engine.run(loadRecipeById(id), variables);
    }, options), options);
    return;
  }
  if (command === "snapshot:capture") {
    const site = asString(options.site, "default")!;
    if (asString(options["tab-id"] || options.tabId)) {
      output(await withManagedPage(async (page) => {
        if (typeof options.url === "string") await page.goto(options.url, { waitUntil: "domcontentloaded" });
        const snapshot = await readPageSnapshot(page, { mode: snapshotMode(options), includeAccessibility: snapshotMode(options) !== "lite" });
        const siteMap = captureSiteMapForSnapshot(site, snapshot);
        const saved = saveSiteMap(siteMap);
        return { saved, siteMap };
      }, options, asString(options.url)), options);
      return;
    }
    output(await withSession(async (session) => {
      if (typeof options.url === "string") await session.open(options.url);
      const page = session.activePage() || await session.newPage();
      const snapshot = await readPageSnapshot(page, { includeAccessibility: true });
      const siteMap = captureSiteMapForSnapshot(site, snapshot);
      const saved = saveSiteMap(siteMap);
      return { saved, siteMap };
    }, options), options);
    return;
  }
  if (command === "snapshot:diff") {
    const site = asString(options.site, "default")!;
    const previous = asString(options.previous) || latestSiteMapPath(site);
    const current = asString(options.current);
    if (!previous || !current) throw new Error("snapshot:diff requires --previous and --current paths unless a latest snapshot exists for --previous");
    output(diffSiteMapFiles(previous, current), options);
    return;
  }
  if (command === "login:check") {
    const target = asString(options.target) || positionals[0];
    if (!target) throw new Error("login:check requires --target chatgpt|claude|gemini");
    const adapter = getWebAiAdapter(target);
    output({ target, knownAdapter: !!adapter, loginStateHints: adapter?.loginStateHints || [], note: "Run browser:launch, complete login manually in the visible browser, then run capability:update to record evidence without secrets." }, options);
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

if (require.main === module) {
  main().catch((error) => {
    const parsed = parseArgs(process.argv.slice(3));
    const message = error instanceof Error ? error.message : String(error);
    const rawErrorCode = (error as any)?.errorCode || (message.startsWith("INVALID_ARGS:") ? ConsumerErrorCodes.INVALID_ARGS : undefined);
    const errorCode = isConsumerErrorCode(rawErrorCode) ? rawErrorCode : rawErrorCode !== undefined ? ConsumerErrorCodes.UNKNOWN : undefined;
    const evidence = (error as any)?.evidence
      || (errorCode === ConsumerErrorCodes.INVALID_ARGS ? { message } : undefined)
      || (rawErrorCode !== undefined && !isConsumerErrorCode(rawErrorCode) ? { original_error_code: String(rawErrorCode), message } : undefined);
    const redactedEvidence = evidence ? redactForCli(evidence, parsed.options) : undefined;
    if (wantJson(parsed.options)) console.error(JSON.stringify({ ok: false, ...(errorCode ? { errorCode } : {}), error: message, ...(redactedEvidence ? { evidence: redactedEvidence } : {}) }));
    else console.error(errorCode ? `${errorCode}: ${message}` : message);
    process.exitCode = errorCode === ConsumerErrorCodes.POSTCONDITION_TIMEOUT ? 12 : 1;
  });
}
