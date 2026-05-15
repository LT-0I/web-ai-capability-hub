#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
import { BrowserSessionManager } from "./browser/sessionManager";
import { ManagedBrowserLauncher, BrowserCloseMode } from "./browser/managedLauncher";
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
import { runHealthCheck } from "./capabilities/healthCheck";
import { CapabilityUpdater } from "./capabilities/updater";
import { SiteRegistryImporter } from "./adapters/research/siteRegistryImporter";
import { WorkflowCompiler, listWorkflowFiles } from "./workflows/compiler";
import { WorkflowExecutor } from "./workflows/executor";
import { HealthCheckReport } from "./shared/types";
import { consumerHealth } from "./consumer/health";
import { redactValue } from "./trace/redact";
import { verifyDocxMin } from "./verifiers/docxMin";

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
    timeout_ms: asNumber(options["timeout-ms"] || options.timeoutMs),
    response_timeout_ms: asNumber(options["response-timeout-ms"] || options.responseTimeoutMs),
    reuse_conversation: asBoolean(options["reuse-conversation"] || options.reuseConversation),
    model: asString(options.model),
    style: asString(options.style),
    download_dir: asString(options["download-dir"] || options.downloadDir),
    expected_extension: asString(options["expected-extension"] || options.expectedExtension),
    artifact_class: asString(options["artifact-class"] || options.artifactClass),
    title: asString(options.title),
    size: asString(options.size),
    duration_seconds: asNumber(options["duration-seconds"] || options.durationSeconds),
    task_id: asString(options["task-id"] || options.taskId)
  };
  const files = asStringList(options.file || options.files);
  if (files.length) base.files = files;
  for (const key of Object.keys(base)) if (base[key] === undefined) delete base[key];
  if (command === "webai:task-status" && !base.task_id) throw new Error("webai:task-status requires --task-id <id>");
  return base;
}

function webAiMcpNameFromCli(command: string): string | undefined {
  const map: Record<string, string> = {
    "webai:chatgpt:send-prompt": "webai_chatgpt_send_prompt",
    "webai:claude:send-prompt": "webai_claude_send_prompt",
    "webai:gemini:send-prompt": "webai_gemini_send_prompt",
    "webai:chatgpt:upload-and-query": "webai_chatgpt_upload_and_query",
    "webai:claude:upload-and-query": "webai_claude_upload_and_query",
    "webai:gemini:upload-and-query": "webai_gemini_upload_and_query",
    "webai:chatgpt:generate-file": "webai_chatgpt_generate_file",
    "webai:claude:generate-file": "webai_claude_generate_file",
    "webai:chatgpt:generate-image": "webai_chatgpt_generate_image",
    "webai:gemini:generate-image": "webai_gemini_generate_image",
    "webai:gemini:canvas-to-docs": "webai_gemini_canvas_to_docs",
    "webai:gemini:generate-video": "webai_gemini_generate_video",
    "webai:task-status": "webai_task_status"
  };
  return map[command];
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
  const launcher = new ManagedBrowserLauncher();
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
    return { ...base, type: "hover", selector, ...(timeoutMs === undefined ? {} : { timeoutMs }) };
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

  workflow:list [--json]
  workflow:compile <workflow.yaml|json> [--json]
  workflow:test <workflow.yaml|json> [--json]
  workflow:run <workflow.yaml|json> [--dry-run] [--resume <run-id>] [--confirm-replay] [--no-redact] [--json]
  verify:docx-min --path <abs> [--min-paragraphs N] [--min-chars N] [--topic-regex <pattern>] [--no-sha256] [--output-json]

  site:registry:import <site_registry.json> [--json]
  site:capture-map --site <id> [--profile research-default] [--fixture <html>] [--json]
  scheduler:run --interval-minutes <n> [--json]

MCP and compatibility commands:
  webai:chatgpt:send-prompt|webai:claude:send-prompt|webai:gemini:send-prompt --profile <name> --prompt <text> [--response-timeout-ms <ms>] [--reuse-conversation] [--output-json]
  webai:chatgpt:upload-and-query|webai:claude:upload-and-query|webai:gemini:upload-and-query --profile <name> --file <path> --prompt <text> [--output-json]
  webai:chatgpt:generate-file|webai:claude:generate-file --profile <name> --prompt <text> --expected-extension <ext> --download-dir <abs> [--output-json]
  webai:chatgpt:generate-image|webai:gemini:generate-image --profile <name> --prompt <text> --download-dir <abs> [--output-json]
  webai:gemini:canvas-to-docs --profile <name> --prompt <text> [--title <title>] [--output-json]
  webai:gemini:generate-video --profile <name> --prompt <text> --download-dir <abs> [--output-json]
  webai:task-status --task-id <id> [--output-json]
  mcp
  mcp:tools [--json]
  mcp:resources [--json]
  adapter:list [--json]
  web-ai:adapters [--json]
  recipe:list [--json]
  browser:start|browser:open|browser:read|browser:screenshot [--tab-id <id>] [--mode full|lite]
  browser:click|browser:type|browser:select|browser:press|browser:wait|browser:upload|browser:hover|browser:select-text|browser:drag [--tab-id <id>] [--json]
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


  const webAiMcpName = webAiMcpNameFromCli(command);
  if (webAiMcpName) {
    output(redactForCli(await callMcpTool(webAiMcpName, webAiArgsFromCli(command, options)), options), options);
    return;
  }

  if (command === "consumer:health") {
    output(await consumerHealth({ target: asString(options.target) || "", profile: asString(options.profile) || "" }), options);
    return;
  }

  if (command === "browser:launch") {
    const launcher = new ManagedBrowserLauncher();
    output(await launcher.launch({ profile: asString(options.profile), url: asString(options.url), cdpPort: asNumber(options["cdp-port"] || options.cdpPort), executablePath: asString(options.executable || options.executablePath) }), options);
    return;
  }
  if (command === "browser:status") {
    const status = await new ManagedBrowserLauncher().status(asString(options.profile));
    output({ ...status, lease: new CapabilityDatabase().getActiveProfileLease(status.profile) }, options);
    return;
  }
  if (command === "browser:pages") {
    output(await new ManagedBrowserLauncher().pages(asString(options.profile)), options);
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
    output(await new ManagedBrowserLauncher().close(profile, mode), options);
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
      const result = await withManagedPage(async (page) => {
        const downloads = new DownloadManager(path.join(process.cwd(), "data", "downloads"));
        const executor = new WorkflowExecutor({ database: db, actionExecutor: new ActionExecutor({ getActivePage: () => page, openUrl: async (url) => { await page.goto(url, { waitUntil: "domcontentloaded" }); return page; }, downloads }) });
        return resumeRunId
          ? executor.resumeRun(resumeRunId, { dryRun: false, confirmReplay, redaction, inputs })
          : executor.runFile(file as string, { dryRun: false, redaction, inputs });
      }, workflowOptions, workflowUrl);
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
    if (asString(options["tab-id"] || options.tabId)) {
      output(await withManagedPage(async (page) => readPageSnapshot(page, { mode, screenshot: command === "browser:screenshot" || options.screenshot === true, includeAccessibility: mode !== "lite" }), options, asString(options.url)), options);
      return;
    }
    output(await withSession(async (session) => {
      const page = session.activePage() || await session.newPage();
      return readPageSnapshot(page, { mode, screenshot: command === "browser:screenshot" || options.screenshot === true, includeAccessibility: mode !== "lite" });
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
    const errorCode = (error as any)?.errorCode || (message.startsWith("INVALID_ARGS:") ? "INVALID_ARGS" : undefined);
    const evidence = (error as any)?.evidence;
    const redactedEvidence = evidence ? redactForCli(evidence, parsed.options) : undefined;
    if (wantJson(parsed.options)) console.error(JSON.stringify({ ok: false, ...(errorCode ? { errorCode } : {}), error: message, ...(redactedEvidence ? { evidence: redactedEvidence } : {}) }));
    else console.error(message);
    process.exitCode = errorCode === "POSTCONDITION_TIMEOUT" ? 12 : 1;
  });
}
