const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const zlib = require("node:zlib");
const childProcess = require("node:child_process");
import { BrowserSessionManager } from "../browser/sessionManager";
import { ManagedBrowserLauncher } from "../browser/managedLauncher";
import { createManagedBrowserLauncher } from "../runtime/pool/profilePool";
import { DownloadManager } from "../browser/downloads";
import { ActionExecutor } from "../actions/executor";
import { ConfirmationRequiredError, requiresApproval, riskyReason } from "../actions/confirmationPolicy";
import { readHtmlSnapshotFromFile, readPageSnapshot } from "../reader/snapshot";
import { captureSiteMapForSnapshot, saveSiteMap } from "../maintenance/captureSiteMap";
import { loadRecipeById } from "../recipes/loader";
import { RecipeEngine } from "../recipes/engine";
import { safeFilename } from "../utils/paths";
import { RuntimeSchema, objectSchema, scalar } from "../utils/schema";
import { CapabilityDatabase } from "../capabilities/database";
import { CapabilityUpdater } from "../capabilities/updater";
import { WorkflowCompiler } from "../workflows/compiler";
import { WorkflowExecutor } from "../workflows/executor";
import { SiteRegistryImporter } from "../adapters/research/siteRegistryImporter";
import { CapabilityLibraryImporter } from "../adapters/research/capabilityLibraryImporter";
import { ResearchDbImporter } from "./researchdb";
import { legacyResearchToolSpecs } from "./researchdb/legacyToolSpecs";
import { getWebAiAdapter } from "../adapters/web-ai";
import { ApprovalGate, WorkflowApprovalResponse } from "../shared/types";
import { consumerHealth } from "../consumer/health";
import { runArtifactClick } from "../browser/artifactClick";
import { getBackend } from "../browser/backends";
import { classifyChromeExtensionBridgeError, defaultHttpBridgeUrlForProfile } from "../runtime/extension/httpBridgeClient";
import { ConsumerErrorCode, ConsumerErrorCodes, isConsumerErrorCode } from "../consumer/errorCodes";
import { VENDOR_BROWSER_TOOL_NAMES } from "../runtime/extension/protocol";
import { PromptPolicyDeniedError, assertPromptAllowed } from "../safety/promptDeny";
import { assertNotPublishDeniedLabel } from "../safety/publishDeny";
import {
  browserActionInput,
  browserLaunchInput,
  browserOpenInput,
  browserReadInput,
  browserStartInput,
  browserStatusInput,
  capabilityExportInput,
  capabilityLibraryImportInput,
  capabilityQueryInput,
  capabilityUpdateInput,
  consumerHealthInput,
  notesInput,
  recipeRunInput,
  siteCaptureMapInput,
  siteMapInput,
  siteRegistryImportInput,
  workflowCompileInput,
  workflowExecuteInput,
  workflowRunInput,
  webAiSendPromptInput,
  webAiChatgptSendPromptInput,
  webAiClaudeSendPromptInput,
  webAiGeminiSendPromptInput,
  webAiUploadAndQueryInput,
  webAiClaudeUploadAndQueryInput,
  webAiGenerateFileInput,
  webAiClaudeGenerateFileInput,
  webAiChatgptGenerateImageInput,
  webAiGenerateImageInput,
  webAiCanvasToDocsInput,
  webAiGenerateVideoInput,
  webAiChatgptCanvasExportInput,
  webAiChatgptPulseGetInput,
  webAiChatgptPulseOnboardInput,
  webAiChatgptDeepResearchInput,
  webAiClaudeDeepResearchInput,
  webAiChatgptConversationManageInput,
  webAiClaudeConversationManageInput,
  webAiChatgptWorkspaceInput,
  webAiClaudeWorkspaceInput,
  webAiGeminiDeepResearchInput,
  webAiGeminiCanvasEditInput,
  webAiGeminiConversationManageInput,
  webAiGeminiWorkspaceInput,
  webAiTaskStatusInput,
  webAiLiteratureTaskStatusInput,
  webAiLiteratureDownloadPdfInput,
  webAiPaywalledLiteratureDownloadPdfInput,
  webAiBibliographicOnlyLiteratureDownloadPdfInput
} from "./schemas";
import { CompiledWorkflowAction, WorkflowActionPlan, WorkflowDefinition, WorkflowRunResult } from "../workflows/schema";
import { WebAiTaskRecord, WebAiTaskStatus } from "../capabilities/schemas";
import { subMcpToolSpecs } from "./submcp/index";
import { ForbiddenOutputFieldError, assertNoForbidden, stripForbidden } from "./forbiddenFields";
import { GeminiQuotaStateStore } from "../browser/geminiQuotaStateStore";
import { getLiteratureTaskStatus } from "../runtime/literature/queue";
import { webAiArxivDownloadPdf } from "./submcp/literature/arxiv";
import { webAiScoap3DownloadPdf } from "./submcp/literature/scoap3";
import { webAiMdpiDownloadPdf } from "./submcp/literature/mdpi";
import { webAiFrontiersDownloadPdf } from "./submcp/literature/frontiers";
import { webAiPubscholarDownloadPdf } from "./submcp/literature/pubscholar";
import { webAiScieloDownloadPdf } from "./submcp/literature/scielo";
import { webAiInspirehepDownloadPdf } from "./submcp/literature/inspirehep";
import { webAiAipDownloadPdf } from "./submcp/literature/aip";
import { webAiApsDownloadPdf } from "./submcp/literature/aps";
import { webAiIopDownloadPdf } from "./submcp/literature/iop";
import { webAiOpticaDownloadPdf } from "./submcp/literature/optica";
import { webAiOpticsjournalDownloadPdf } from "./submcp/literature/opticsjournal";
import { webAiSiamDownloadPdf } from "./submcp/literature/siam";
import { webAiAiaaDownloadPdf } from "./submcp/literature/aiaa";
import { webAiAsceDownloadPdf } from "./submcp/literature/asce";
import { webAiAsmeDownloadPdf } from "./submcp/literature/asme";
import { webAiIeeeDownloadPdf } from "./submcp/literature/ieee";
import { webAiIestDownloadPdf } from "./submcp/literature/iest";
import { webAiIetDownloadPdf } from "./submcp/literature/iet";
import { webAiSaeDownloadPdf } from "./submcp/literature/sae";
import { webAiAcsDownloadPdf } from "./submcp/literature/acs";
import { webAiCellpressDownloadPdf } from "./submcp/literature/cellpress";
import { webAiNatureDownloadPdf } from "./submcp/literature/nature";
import { webAiRscDownloadPdf } from "./submcp/literature/rsc";
import { webAiRoyalsocDownloadPdf } from "./submcp/literature/royalsoc";
import { webAiCambridgeDownloadPdf } from "./submcp/literature/cambridge";
import { webAiDegruyterDownloadPdf } from "./submcp/literature/degruyter";
import { webAiEmeraldDownloadPdf } from "./submcp/literature/emerald";
import { webAiSciencedirectDownloadPdf } from "./submcp/literature/sciencedirect";
import { webAiSpringerDownloadPdf } from "./submcp/literature/springer";
import { webAiTandfDownloadPdf } from "./submcp/literature/tandf";
import { webAiWileyDownloadPdf } from "./submcp/literature/wiley";
import { webAiAcmDownloadPdf } from "./submcp/literature/acm";
import { webAiCrcDownloadPdf } from "./submcp/literature/crc";
import { webAiDblpDownloadPdf } from "./submcp/literature/dblp";
import { webAiIncopatDownloadPdf } from "./submcp/literature/incopat";
import { webAiProquestDownloadPdf } from "./submcp/literature/proquest";
import { webAiWanfangDownloadPdf } from "./submcp/literature/wanfang";
import { webAiWorldsciDownloadPdf } from "./submcp/literature/worldsci";
import { webAiWosDownloadPdf } from "./submcp/literature/wos";

export {
  webAiArxivDownloadPdf,
  webAiScoap3DownloadPdf,
  webAiMdpiDownloadPdf,
  webAiFrontiersDownloadPdf,
  webAiPubscholarDownloadPdf,
  webAiScieloDownloadPdf,
  webAiInspirehepDownloadPdf,
  webAiAipDownloadPdf,
  webAiApsDownloadPdf,
  webAiIopDownloadPdf,
  webAiOpticaDownloadPdf,
  webAiOpticsjournalDownloadPdf,
  webAiSiamDownloadPdf,
  webAiAiaaDownloadPdf,
  webAiAsceDownloadPdf,
  webAiAsmeDownloadPdf,
  webAiIeeeDownloadPdf,
  webAiIestDownloadPdf,
  webAiIetDownloadPdf,
  webAiSaeDownloadPdf,
  webAiAcsDownloadPdf,
  webAiCellpressDownloadPdf,
  webAiNatureDownloadPdf,
  webAiRscDownloadPdf,
  webAiRoyalsocDownloadPdf,
  webAiCambridgeDownloadPdf,
  webAiDegruyterDownloadPdf,
  webAiEmeraldDownloadPdf,
  webAiSciencedirectDownloadPdf,
  webAiSpringerDownloadPdf,
  webAiTandfDownloadPdf,
  webAiWileyDownloadPdf,
  webAiAcmDownloadPdf,
  webAiCrcDownloadPdf,
  webAiDblpDownloadPdf,
  webAiIncopatDownloadPdf,
  webAiProquestDownloadPdf,
  webAiWanfangDownloadPdf,
  webAiWorldsciDownloadPdf,
  webAiWosDownloadPdf
};

import { wahCapabilityQuery, wahCapabilityQueryInput } from "../facade/wah/capabilityQuery";
import { wahAdapterHealth, wahAdapterHealthInput } from "../facade/wah/adapterHealth";
import { wahPolicyExplain, wahPolicyExplainInput } from "../facade/wah/policyExplain";
import { wahTaskStart, wahTaskStartInput } from "../facade/wah/taskStart";
import { wahTaskStatus, wahTaskStatusInput } from "../facade/wah/taskStatus";
import { wahTaskCancel, wahTaskCancelInput } from "../facade/wah/taskCancel";
import { wahTaskResume, wahTaskResumeInput } from "../facade/wah/taskResume";
import { wahArtifactGet, wahArtifactGetInput } from "../facade/wah/artifactGet";
import {
  webAiChatgptCodexSubmitTask as webAiChatgptCodexSubmitTaskManaged,
  webAiChatgptCodexListEnvs as webAiChatgptCodexListEnvsManaged,
  webAiChatgptCodexTaskStatus as webAiChatgptCodexTaskStatusManaged,
  webAiChatgptCodexGetDiff as webAiChatgptCodexGetDiffManaged
} from "./submcp/chatgpt-codex/tools";
import {
  CODEX_ALLOWED_ENV_ID,
  CODEX_ALLOWED_ENV_NAME,
  CODEX_ALLOWED_GITHUB_URL,
  CODEX_ALLOWED_REPO,
  CODEX_COMPOSER_SELECTOR,
  CODEX_ENVS_URL,
  CODEX_ENV_PICK_SELECTOR,
  CODEX_ENV_SELECTOR,
  CODEX_FORBIDDEN_REPO_RE,
  CODEX_SUBMIT_SELECTOR,
  CODEX_URL,
  allowlistError,
  assertTaskId,
  contractError,
  notProvisioned,
  pageTextProvesAllowedCodexTask,
  parseAllowedEnvFromRow,
  taskUrl
} from "./submcp/chatgpt-codex/flow";
import {
  webAiClaudeDesignCreateProject as webAiClaudeDesignCreateProjectManaged,
  webAiClaudeDesignGenerate as webAiClaudeDesignGenerateManaged,
  webAiClaudeDesignGetHtml as webAiClaudeDesignGetHtmlManaged,
  webAiClaudeDesignPresent as webAiClaudeDesignPresentManaged
} from "./submcp/claude-design/tools";
import {
  webAiGeminiMusicGenerate as webAiGeminiMusicGenerateManaged,
  webAiGeminiMusicDownloadTrack as webAiGeminiMusicDownloadTrackManaged,
  webAiGeminiMusicTaskStatus as webAiGeminiMusicTaskStatusManaged
} from "./submcp/gemini-music/tools";
import {
  dismissGeminiOverlay,
  ensureGeminiToolsAvailable,
  geminiModelOptionSelector,
  isSupportedGeminiModelOption,
  selectGeminiModelOption,
  toggleGeminiTool
} from "./geminiExtensionHelpers";
import {
  GEMINI_MUSIC_URL,
  MUSIC_DOWNLOAD_BTN_SELECTOR,
  MUSIC_STOP_SELECTOR,
  GeminiMusicFormat,
  stepDownloadTrack
} from "./submcp/gemini-music/flow";
export { wahCapabilityQuery, wahAdapterHealth, wahPolicyExplain, wahTaskStart, wahTaskStatus, wahTaskCancel, wahTaskResume, wahArtifactGet };
export * from "./researchdb";

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: any;
}

export interface BrowserToolRuntime {
  session?: BrowserSessionManager;
  launcher?: ManagedBrowserLauncher;
  database?: CapabilityDatabase;
  spawnVideoWorker?: (taskId: string, args: any, database: CapabilityDatabase) => { pid?: number };
}

export interface ToolSpec {
  name: string;
  description: string;
  schema: RuntimeSchema<any>;
  handler(args: any, runtime: Required<BrowserToolRuntime>): Promise<unknown>;
}

const researchInventoryImportInput = objectSchema<{ path?: string; stem_only?: boolean }>({
  path: { ...scalar.string("academic research inventory JSON path; defaults to configs/research/research_inventory.json"), default: "configs/research/research_inventory.json" },
  stem_only: { ...scalar.boolean("Only import rows classified as science_engineering"), default: false }
}, []);

const webAiChatgptSelectModelInput = objectSchema<{ profile: string; model?: string; thinking_level?: string; tab_url_contains?: string; url?: string; timeout_ms?: number }>({
  profile: scalar.string("Managed ChatGPT browser profile name"),
  model: scalar.string("ChatGPT human-readable model picker label"),
  thinking_level: scalar.string("ChatGPT thinking level selector value: auto or extended"),
  tab_url_contains: scalar.string("Optional existing ChatGPT tab URL fragment"),
  url: scalar.string("Optional ChatGPT URL override"),
  timeout_ms: scalar.number("Optional command timeout in milliseconds")
}, ["profile"]);

const webAiClaudeSelectModelInput = objectSchema<{ profile: string; model?: string; thinking_level?: string; tab_url_contains?: string; url?: string; timeout_ms?: number }>({
  profile: scalar.string("Managed Claude browser profile name"),
  model: scalar.string("Claude human-readable model picker label"),
  thinking_level: scalar.string("Claude thinking level selector value: auto or extended"),
  tab_url_contains: scalar.string("Optional existing Claude tab URL fragment"),
  url: scalar.string("Optional Claude URL override"),
  timeout_ms: scalar.number("Optional command timeout in milliseconds")
}, ["profile"]);

const webAiGeminiSelectModelInput = objectSchema<{ profile: string; model?: string; thinking_level?: string; tab_url_contains?: string; url?: string; timeout_ms?: number }>({
  profile: scalar.string("Managed Gemini browser profile name"),
  model: scalar.string("Gemini model selector value: 3.1-flash-lite, 3.5-flash, or 3.1-pro"),
  thinking_level: scalar.string("Gemini thinking level selector value: standard or extended"),
  tab_url_contains: scalar.string("Optional existing Gemini tab URL fragment"),
  url: scalar.string("Optional Gemini URL override"),
  timeout_ms: scalar.number("Optional command timeout in milliseconds")
}, ["profile"]);

function runtimeOrDefault(runtime?: BrowserToolRuntime): Required<BrowserToolRuntime> {
  const database = runtime?.database || new CapabilityDatabase();
  const session = runtime?.session || new BrowserSessionManager();
  session.setDatabase(database);
  return { ...(runtime as any || {}), session, launcher: runtime?.launcher || createManagedBrowserLauncher(), database };
}

function executor(session: BrowserSessionManager): ActionExecutor {
  return new ActionExecutor({ getActivePage: () => session.activePage(), openUrl: (url) => session.open(url), downloads: session.downloads });
}

function targetBaseUrl(target?: string): string | undefined {
  if (!target) return undefined;
  return getWebAiAdapter(target)?.baseUrl;
}

function isUsefulPageUrl(url: string): boolean {
  return !!url && !url.startsWith("chrome://") && !url.startsWith("chrome-extension://") && !url.startsWith("devtools://");
}

function pageMatchesTargetUrl(pageUrl: string, targetUrl?: string): boolean {
  if (!targetUrl || !pageUrl) return false;
  try {
    const page = new URL(pageUrl);
    const target = new URL(targetUrl);
    const sameHost = page.hostname === target.hostname || page.hostname.endsWith(`.${target.hostname}`);
    if (!sameHost) return false;
    const normalizePath = (value: string) => (value || "/").replace(/\/$/, "") || "/";
    const pagePath = normalizePath(page.pathname);
    const targetPath = normalizePath(target.pathname);
    if (/^\/(auth|login|signin|signup|logout)(?:\/|$)/i.test(pagePath)) return true;
    if (targetPath === "/") return true;
    if (targetPath === "/app") return pagePath === "/app" || pagePath.startsWith("/app/");
    return pagePath === targetPath;
  } catch {
    return pageUrl === targetUrl;
  }
}

function normalizeUrlLikeTarget(value?: string): string | undefined {
  if (!value) return undefined;
  if (/^https?:\/\//i.test(value)) return value;
  if (/^[a-z0-9.-]+\.[a-z]{2,}(?:[/:?#].*)?$/i.test(value)) return `https://${value}`;
  return undefined;
}

function pageMatchesRequestedTab(pageUrl: string, requested?: string): boolean {
  if (!requested || !pageUrl) return false;
  if (pageUrl.includes(requested)) return true;
  const normalized = normalizeUrlLikeTarget(requested);
  if (!normalized) return false;
  if (pageUrl.includes(normalized)) return true;
  try {
    const target = new URL(normalized);
    if (target.pathname === "/") return false;
    const page = new URL(pageUrl);
    if (page.host !== target.host) return false;
    return page.pathname === target.pathname || page.pathname.startsWith(`${target.pathname.replace(/\/$/, "")}/`);
  } catch {
    return false;
  }
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isGeminiManagedTarget(targetUrl?: string, requested?: string): boolean {
  const normalizedRequested = normalizeUrlLikeTarget(requested);
  return Boolean(targetUrl?.includes("gemini.google.com") || normalizedRequested?.includes("gemini.google.com"));
}

async function activeManagedPage(browser: any, targetUrl?: string, requestedTab?: string, options: { pollForRequestedMs?: number; requireRequested?: boolean } = {}): Promise<any> {
  const contexts = browser.contexts?.() || [];
  const context = contexts[0] || await browser.newContext?.();
  if (!context) throw new Error("No browser context is available from the managed CDP connection.");
  const currentPages = () => {
    const freshContexts = browser.contexts?.() || [];
    const scopedContexts = freshContexts.length ? freshContexts : [context];
    return scopedContexts.flatMap((ctx: any) => ctx.pages?.() || []);
  };
  let pages = currentPages();
  let page = pages.find((candidate: any) => pageMatchesRequestedTab(candidate.url?.() || "", requestedTab));
  let matchedRequested = Boolean(page);
  if (!page && requestedTab && options.pollForRequestedMs) {
    const deadline = Date.now() + options.pollForRequestedMs;
    while (!page && Date.now() < deadline) {
      await sleepMs(Math.min(250, Math.max(1, deadline - Date.now())));
      pages = currentPages();
      page = pages.find((candidate: any) => pageMatchesRequestedTab(candidate.url?.() || "", requestedTab));
    }
    matchedRequested = Boolean(page);
  }
  if (!page && requestedTab && options.requireRequested) {
    throw new WebAiToolError(ConsumerErrorCodes.TARGET_PAGE_MISSING, `TAB_NOT_FOUND: requested tab was not found for ${requestedTab}`, { requested: requestedTab, targetUrl, poll_ms: options.pollForRequestedMs || 0 });
  }
  if (!page) page = pages.find((candidate: any) => pageMatchesTargetUrl(candidate.url?.() || "", targetUrl));
  if (!page) page = pages.find((candidate: any) => isUsefulPageUrl(candidate.url?.() || "") && candidate.url?.() !== "about:blank");
  if (!page) page = pages.find((candidate: any) => isUsefulPageUrl(candidate.url?.() || ""));
  const created = !page;
  if (!page) page = await context.newPage();
  const requestedUrl = normalizeUrlLikeTarget(requestedTab);
  const navigationTarget = requestedUrl || (created ? targetUrl : undefined);
  const currentUrl = page.url?.() || "";
  const needsNavigation = requestedUrl
    ? !matchedRequested && !pageMatchesRequestedTab(currentUrl, requestedTab)
    : Boolean(created && navigationTarget && !pageMatchesTargetUrl(currentUrl, navigationTarget));
  if (navigationTarget && needsNavigation) {
    await page.goto(navigationTarget, { waitUntil: "domcontentloaded" });
  }
  await page.waitForLoadState?.("domcontentloaded", { timeout: 15000 }).catch(() => undefined);
  return page;
}

export async function withManagedPage<T>(args: any, runtime: Required<BrowserToolRuntime>, targetUrl: string | undefined, fn: (page: any) => Promise<T>): Promise<T> {
  const profile = args.profile || process.env.WAH_DEFAULT_PROFILE || "default";
  const requested = args.url || args.tab_url_contains;
  const isGeminiTarget = isGeminiManagedTarget(targetUrl, requested);
  const launchUrl = isGeminiTarget && args.reuse_conversation && requested ? undefined : targetUrl;
  const status = await runtime.launcher.launch({ profile, url: launchUrl, cdpPort: args.cdpPort });
  const browser = await runtime.launcher.connectOverCdp(status);
  try {
    const page = await activeManagedPage(browser, targetUrl, requested, {
      pollForRequestedMs: isGeminiTarget && requested ? 5000 : 0,
      requireRequested: Boolean(isGeminiTarget && args.reuse_conversation && requested)
    });
    const forcedTarget = normalizeUrlLikeTarget(requested) || (targetUrl && (requested || args.__requireTargetSurface) ? targetUrl : undefined);
    const forcedMatches = requested ? pageMatchesRequestedTab(page.url?.() || "", requested) : pageMatchesTargetUrl(page.url?.() || "", forcedTarget);
    if (forcedTarget && !forcedMatches) {
      await page.goto?.(forcedTarget, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForLoadState?.("domcontentloaded", { timeout: 15000 }).catch(() => undefined);
    }
    return await fn(page);
  } finally {
    await browser.close?.().catch(() => undefined);
  }
}

async function waitForHydratedSurface(page: any, selector: string, timeoutMs = 15000): Promise<void> {
  try {
    await page.waitForLoadState?.("domcontentloaded", { timeout: Math.min(timeoutMs, 15000) });
    await page.waitForSelector?.(selector, { state: "visible", timeout: timeoutMs });
  } catch (error: any) {
    throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "Required browser surface did not hydrate before interaction", { selector, cause: error?.message || String(error) });
  }
}

function managedExecutor(page: any): ActionExecutor {
  const downloads = new DownloadManager(path.join(process.cwd(), "data", "downloads"));
  return new ActionExecutor({ getActivePage: () => page, openUrl: async (url) => { await page.goto(url, { waitUntil: "domcontentloaded" }); return page; }, downloads });
}

function artifactClickRunner(runtime: Required<BrowserToolRuntime>): typeof runArtifactClick {
  return (runtime as any).artifactClick || runArtifactClick;
}

function isCdpEndpointReadinessRace(error: any): boolean {
  const message = errorMessageFromUnknown(error, "");
  return /CDP endpoint did not become ready|connect ECONNREFUSED|ECONNREFUSED|connectOverCDP.*Timeout|Timeout.*connectOverCDP/i.test(message);
}

async function runArtifactClickWithCdpReadinessRetry(runtime: Required<BrowserToolRuntime>, options: Parameters<typeof runArtifactClick>[0], retryBudgetMs = 45000): Promise<Awaited<ReturnType<typeof runArtifactClick>>> {
  const deadline = Date.now() + Math.max(0, Math.min(retryBudgetMs, 45000));
  for (;;) {
    try {
      return await artifactClickRunner(runtime)(options);
    } catch (error) {
      if (!isCdpEndpointReadinessRace(error) || Date.now() >= deadline) throw error;
      await extensionSleep(Math.min(100, Math.max(1, deadline - Date.now())));
    }
  }
}

interface WorkflowExecuteArgs {
  file?: string;
  workflow?: Record<string, unknown>;
  plan?: Record<string, unknown>;
  dryRun?: boolean;
  profile?: string;
  url?: string;
  approvedStepIds?: string[];
  approvalReason?: string;
}

function workflowExecutePlan(args: WorkflowExecuteArgs, database: CapabilityDatabase): WorkflowActionPlan {
  const sources = [args.file, args.workflow, args.plan].filter(Boolean);
  if (sources.length > 1) throw new Error("workflow_execute accepts only one of file, workflow, or plan.");
  if (sources.length === 0) throw new Error("workflow_execute requires an inline workflow, inline plan, or workflow file.");
  const compiler = new WorkflowCompiler(database);
  const plan = args.plan
    ? normalizeWorkflowPlan(args.plan)
    : args.file
      ? compiler.compileFile(args.file)
      : compiler.compile(args.workflow as unknown as WorkflowDefinition);
  return applyWorkflowApprovals(plan, args.approvedStepIds);
}

function normalizeWorkflowPlan(plan: Record<string, unknown>): WorkflowActionPlan {
  return { warnings: [], ...plan } as unknown as WorkflowActionPlan;
}

function applyWorkflowApprovals(plan: WorkflowActionPlan, approvedStepIds?: string[]): WorkflowActionPlan {
  if (!approvedStepIds?.length) return plan;
  const approved = new Set(approvedStepIds);
  return {
    ...plan,
    actions: plan.actions.map((item) => approved.has(item.stepId)
      ? {
        ...item,
        action: { ...item.action, confirmed: true }
      }
      : item)
  };
}

function workflowExecuteStatus(ok: boolean): string {
  return ok ? "completed" : "failed";
}

function workflowApprovalReason(item: CompiledWorkflowAction): string {
  return item.reason || riskyReason(item.action) || "Action requires approval.";
}

function workflowApprovalGates(plan: WorkflowActionPlan): ApprovalGate[] {
  if (plan.mode !== "manual-approval") return [];
  return plan.actions
    .filter((item) => !item.action.confirmed && (item.requiresApproval || requiresApproval(item.action)))
    .map((item) => ({ stepId: item.stepId, action: item.capability || item.action.type, reason: workflowApprovalReason(item) }));
}

function workflowApprovalRequiredResponse(plan: WorkflowActionPlan, approvalGates: ApprovalGate[], database: CapabilityDatabase): WorkflowApprovalResponse {
  database.addPolicyEvent({
    target_id: plan.target,
    event_type: "approval_required",
    message: `Workflow execution requires approval for ${approvalGates.map((gate) => gate.stepId).join(", ")}`,
    evidence: { workflowId: plan.id, approvalGates }
  });
  return { ok: false, status: "approval_required", approvalGates, plan: plan as any };
}

async function runWorkflowPlanInManagedPage(args: WorkflowExecuteArgs, runtime: Required<BrowserToolRuntime>, plan: WorkflowActionPlan): Promise<WorkflowRunResult> {
  const managedArgs = { ...args, profile: args.profile || plan.profile || plan.target };
  return withManagedPage(managedArgs, runtime, args.url || targetBaseUrl(plan.target), async (page) => (
    new WorkflowExecutor({ database: runtime.database, actionExecutor: managedExecutor(page) }).runPlan(plan, { dryRun: false })
  ));
}

type WebAiService = "chatgpt" | "claude" | "gemini";
export const serviceDefaults: Record<WebAiService, { url: string; promptSelector: string }> = {
  chatgpt: { url: "https://chatgpt.com/", promptSelector: "#prompt-textarea" },
  claude: { url: "https://claude.ai/new", promptSelector: '[contenteditable="true"], #prompt-textarea' },
  gemini: { url: "https://gemini.google.com/app", promptSelector: 'div[role="textbox"][aria-label="Enter a prompt for Gemini"][contenteditable="true"][data-placeholder="Ask Gemini"]' }
};

const profileLeases = new Map<string, string>();
export class WebAiToolError extends Error {
  errorCode: string;
  evidence?: Record<string, unknown>;
  constructor(errorCode: string, message: string, evidence?: Record<string, unknown>) {
    super(`${errorCode}: ${message}`);
    this.errorCode = errorCode;
    this.evidence = evidence;
  }
}

export function acquireProfileLease(profile: string): string {
  const active = profileLeases.get(profile);
  if (active) throw new WebAiToolError(ConsumerErrorCodes.PROFILE_LEASE_BUSY, `profile ${profile} already has an active webai mutation lease`, { profile, lease_id: active });
  const lease = `lease_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
  profileLeases.set(profile, lease);
  return lease;
}

export function releaseProfileLease(profile: string, lease: string): void {
  if (profileLeases.get(profile) === lease) profileLeases.delete(profile);
}

function safeTaskId(): string { return `task_${Date.now()}_${crypto.randomBytes(6).toString("hex")}`; }

function ensureNoForbiddenOutput(value: unknown): void {
  assertNoForbidden(value);
}

export function safeOutput<T extends Record<string, unknown>>(value: T): T {
  ensureNoForbiddenOutput(value);
  return value;
}

function requireAbsoluteDir(downloadDir: string): void {
  if (!path.isAbsolute(downloadDir)) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "download_dir must be an absolute path");
  fs.mkdirSync(downloadDir, { recursive: true });
}

function sha256File(filePath: string): string {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function targetUrlFor(service: WebAiService, args: any): string {
  return normalizeUrlLikeTarget(args.url) || normalizeUrlLikeTarget(args.tab_url_contains) || serviceDefaults[service].url;
}

function isChatgptCustomGptUrl(url: string): boolean {
  try {
    const parsed = new URL(String(url || ""));
    return /(^|\.)chatgpt\.com$/i.test(parsed.hostname) && /^\/g\//.test(parsed.pathname);
  } catch {
    return /^https?:\/\/chatgpt\.com\/g\//i.test(String(url || ""));
  }
}

function chatgptCustomGptUnsupportedOutput(args: any, started: number, url: string): Record<string, unknown> {
  return safeOutput(sendPromptBase("chatgpt", url || targetUrlFor("chatgpt", args || {}), started, {
    ok: false,
    service: "chatgpt",
    response_text: "",
    completion_detected: false,
    errorCode: ConsumerErrorCodes.MODEL_SELECTION_DRIFT,
    error_code: ConsumerErrorCodes.MODEL_SELECTION_DRIFT,
    expected_model: "main ChatGPT chat",
    model_used: "custom GPT",
    message: "ChatGPT custom GPT conversations are fail-closed on the extension-assisted send-prompt path"
  }));
}

const DEFAULT_RESPONSE_TIMEOUT_MS = 120000;
const CHATGPT_FRESH_URL = "https://chatgpt.com/?model=gpt-4o";
const CLAUDE_FRESH_URL = "https://claude.ai/new";
const CLAUDE_INCOGNITO_FRESH_URL = "https://claude.ai/new?incognito=";
const GEMINI_FRESH_URL = "https://gemini.google.com/app";
const GEMINI_FRESH_COMPOSER_URL = "https://gemini.google.com/app?hl=en";
const GEMINI_RESPONSE_SELECTOR = "main";
const GEMINI_TURN_SELECTOR = 'main [role="article"], main article, main [class*="turn" i], main [class*="response" i]';
// Post-revamp 2026-05-20: data-test-id="regenerate-button" no longer rendered.
// Response-done toolbar now exposes `button[aria-label="Good response"]` (thumbs-up)
// which is the stable completion signal — appears only AFTER the response stream
// has finished, never during streaming. Confirmed via probe-response-toolbar.mjs
// against gemini-9225. Constant name kept for backwards compatibility with the
// completion gate at line ~843; semantic is "response-done marker".
const GEMINI_REGENERATE_BUTTON_SELECTOR = 'button[aria-label="Good response"]';
// The latest Gemini assistant turn is the LAST <model-response> element. Reading
// the whole <main> (the old GEMINI_RESPONSE_SELECTOR target) pulls in the left
// nav sidebar ("New chat / My stuff / Notebooks / Gems / Chats"), the
// cross-conversation history list, and every prior turn — the CLAUDE.md
// "return homepage/composer DOM as response_text" anti-pattern. The clean
// answer body inside the latest model-response is, in order of preference:
// .model-response-text → message-content → .markdown (all observed live
// 2026-05-15 to carry ONLY the answer text, no "Gemini said" wrapper, no
// chrome; the bare <model-response> textContent carries a leading "Gemini said").
const GEMINI_LATEST_RESPONSE_SELECTOR = "model-response";
const GEMINI_RESPONSE_TEXT_INNER_SELECTORS = [".model-response-text", "message-content", ".markdown"];
const GEMINI_UPLOAD_TOOLS_TRIGGER_SELECTOR = 'button[aria-label="Upload & tools"]';
const GEMINI_UPLOAD_FILES_SELECTOR = "button[data-test-id=\"local-images-files-uploader-button\"]";
const GEMINI_UPLOAD_FILES_MENUITEM_SELECTOR = '[role="menuitem"][aria-label^="Upload files"]';
const GEMINI_MODE_PICKER_TRIGGER_SELECTOR = 'button[data-test-id="bard-mode-menu-button"], button[aria-label^="Open mode picker"]';
const GEMINI_MODE_PICKER_EXPANDED_SELECTOR = 'button[data-test-id="bard-mode-menu-button"][aria-expanded="true"], button[aria-label^="Open mode picker"][aria-expanded="true"]';

// Managed-CDP model selection keeps the descriptor anchors that existing
// contract tests lock. Extension-assisted selection uses geminiExtensionHelpers
// for the live-probed literal 3.1/3.5 menuitem selectors.
const GEMINI_MODEL_OPTION_TEMPLATES: Record<string, string> = {
  "3.1-flash-lite": '[role="menuitem"]:has-text("Fastest answers")',
  "3.5-flash":      '[role="menuitem"]:has-text("All-around help")',
  "3.1-pro":        '[role="menuitem"]:has-text("Advanced math and code")',
};

// Thinking level expander menuitem; suffix changes with current state ("Standard"/"Extended"),
// so use a startsWith-style match on the leading text only.
const GEMINI_THINKING_EXPANDER_SELECTOR = '[role="menuitem"][aria-label*="Thinking level"], [role="menuitem"]:has-text("Thinking level")';

// Thinking level sub-options — disambiguated by their descriptor (the bare words
// "Standard" / "Extended" alone would collide with the expander label suffix).
const GEMINI_THINKING_OPTION_TEMPLATES: Record<string, string> = {
  "standard": '[role="menuitem"]:has-text("Best for most questions")',
  "extended": '[role="menuitem"]:has-text("Complex problem solving")',
};
// Post-revamp 2026-05-20: aria-label changed from "Remove file" to lowercase
// "close <filename>" format (e.g. "close probe-upload"). The button itself sits
// inside an UPLOADER-FILE-PREVIEW-CONTAINER row with visibility:hidden until
// the row receives hover (handled by the xpath=ancestor::*[1] hover step at the
// call site). The lowercase-strict ^="close " avoids matching "Close sidebar"
// (capital C) which is a different visible button.
const GEMINI_UPLOAD_CHIP_SELECTOR = "button[aria-label^=\"close \"]";
const CHATGPT_IMAGE_MENU_BUTTON_SELECTOR = "#composer-plus-btn";
const CHATGPT_CREATE_IMAGE_RADIO_SELECTOR = '[role="menuitemradio"]:has-text("Create image")';
// After selecting "Create image" the Radix menu closes and the menuitemradio is
// REMOVED from the DOM (it never flips aria-checked while mounted). The reliable
// "image mode active" signal is the composer pill that replaces it.
const CHATGPT_IMAGE_MODE_ACTIVE_SELECTOR = 'button[aria-label="Image, click to remove"], button[aria-label*="image aspect ratio" i]';
const CHATGPT_IMAGE_RENDERED_SELECTOR = 'button[aria-label="Edit image"]';
// dom-probe-final.md (2026-05-15) is authoritative for current ChatGPT image
// UI: the inline toolbar has only Edit + Share; Share is contract-forbidden and
// explicitly excluded. The download control is an unnamed ↓ icon, so keep named
// selectors first when available and fall back to the probe-grounded toolbar
// structure without ever targeting share; the old
// [role="dialog"] button[aria-label="Save"] hypothesis is not relied on.
export const CHATGPT_IMAGE_OPEN_VIEWER_SELECTOR = '[class*="imagegen-image"] [role="button"][aria-labelledby], [id^="image-"] [role="button"][aria-labelledby], img[alt^="Generated image" i]';
export const CHATGPT_IMAGE_DOWNLOAD_BUTTON_SELECTOR = 'xpath=//*[@data-testid="fullscreen-shell-header-content"]//button[@aria-label="Save" or @aria-label="Download" or contains(translate(@aria-label,"DOWNLOAD","download"),"download")] | //*[contains(@class,"pointer-events-auto")][.//button[@aria-label="Edit image"]]//button[not(@aria-label="Edit image") and not(contains(translate(@aria-label,"SHARE","share"),"share"))][last()]';
const GEMINI_CREATE_IMAGE_BUTTON_SELECTOR = 'button[aria-label*="Create image"]';
const GEMINI_MORE_TOOLS_SUBMENU_SELECTOR = 'button[data-test-id="more-tools-button"]';
const GEMINI_CONVERSATION_MORE_OPTIONS_SELECTOR_PREFIX = 'button[aria-label^="More options for "]';
const GEMINI_DEEP_RESEARCH_MENUITEM_SELECTOR = '[role="menuitemcheckbox"]:has-text("Deep research")';
const GEMINI_GUIDED_LEARNING_MENUITEM_SELECTOR = '[role="menuitemcheckbox"]:has-text("Guided learning")';
const GEMINI_SEND_MESSAGE_BUTTON_SELECTOR = 'button[aria-label="Send message"]';
const GEMINI_CANVAS_BODY_SELECTOR = 'xpath=(//div[@contenteditable="true"])[last()]';
const GEMINI_SHARE_CONVERSATION_BUTTON_SELECTOR = 'button[aria-label="Share conversation"]';
const GEMINI_CREATE_IMAGE_MENUITEM_SELECTOR = '[role="menuitemcheckbox"]:has-text("Create image")';
const GEMINI_IMAGE_PROMPT_SELECTOR = 'rich-textarea .ql-editor[contenteditable="true"]';
// Post-revamp 2026-05-20: image-message toolbar simplified. The data-test-id
// "more-menu-button" no longer exists; image toolbar now exposes 3 direct buttons
// (Share image / Copy image / Download full size image) with no intermediate
// open-menu step. Confirmed via probe-image-menu-deep.mjs against gemini-9225.
// "Download full size image" is the canonical image-rendered signal AND the
// direct download trigger (no 2-step open-menu hop needed anymore).
const GEMINI_IMAGE_RENDERED_SELECTOR = 'button[aria-label="Download full size image"]';
// Live-observed 2026-05-15 (gemini-9225, account "Shark 7", Fast tier).
// Canvas → Google Docs export flow:
//   1. Upload & tools menu → Canvas menuitemcheckbox
//      ([role="menuitemcheckbox"]:has-text("Canvas")); active-mode pill becomes
//      button[aria-label="Deselect Canvas"].
//   2. Send the prompt; Gemini renders a Canvas document inside the turn.
//   3. button[data-test-id="share-button"] (aria-label "Share and export
//      canvas") opens a mat-menu containing button[data-test-id=
//      "export-to-docs-button"] (role=menuitem, "Export to Docs"). The
//      sibling "Share Canvas" item is publish-class and is NEVER clicked.
//   4. "Export to Docs" creates a real private Google Doc and opens it in a
//      NEW browser page at https://docs.google.com/document/d/<id>/edit.
const GEMINI_CANVAS_MENUITEM_SELECTOR = '[role="menuitemcheckbox"]:has-text("Canvas")';
const GEMINI_CANVAS_MODE_ACTIVE_SELECTOR = 'button[aria-label="Deselect Canvas"]';
const GEMINI_CANVAS_SHARE_BUTTON_SELECTOR = '[data-test-id="share-button"] button, [data-testid="share-button"] button, button[data-test-id="share-button"], button[data-testid="share-button"], button[aria-label="Share and export canvas"]';
const GEMINI_CANVAS_EXPORT_DOCS_SELECTOR = '[data-test-id="export-to-docs-button"], [data-testid="export-to-docs-button"], export-to-docs-button, gem-menu-item[data-test-id="export-to-docs-button"]';
const GOOGLE_DOCS_URL_RE = /^https:\/\/docs\.google\.com\/document\/d\/([^/?#]+)/;
// Veo video generation flow (same composer): Upload & tools → Create video
// menuitemcheckbox; in-progress copy "Generating your video…"; when ready a
// video player with button[aria-label="Download video"] (class
// download-button) renders. ~105s observed for an 8s clip on Fast tier.
const GEMINI_CREATE_VIDEO_MENUITEM_SELECTOR = '[role="menuitemcheckbox"]:has-text("Create video"), [role="menuitem"]:has-text("Create video")';
const GEMINI_CREATE_VIDEO_EXTENSION_MENUITEM_SELECTOR = '[role="menuitemcheckbox"]:has-text("Create video")';
const CHATGPT_MODEL_BUTTON_SELECTOR = 'form button[aria-haspopup="menu"]:has-text("Thinking"), form button[aria-haspopup="menu"]:has-text("Instant"), form button[aria-haspopup="menu"]:has-text("Extended Pro"), form button[aria-haspopup="menu"]:has-text("Heavy"), button.__composer-pill[aria-haspopup="menu"], main form button[id^="radix-"][aria-haspopup="menu"], #composer-background button[aria-haspopup="menu"]';
const CHATGPT_SELECTED_MODEL_MENUITEM_SELECTOR = '[role="menu"] [role="menuitemradio"][aria-checked="true"], [role="menuitemradio"][aria-checked="true"]';
const CHATGPT_INSTANT_MENUITEM_SELECTOR = '[role="menu"] [data-testid="model-switcher-gpt-5-5"][role="menuitemradio"], [data-testid="model-switcher-gpt-5-5"][role="menuitemradio"]';
const CHATGPT_THINKING_MENUITEM_SELECTOR = '[role="menu"] [data-testid="model-switcher-gpt-5-5-thinking"][role="menuitemradio"], [data-testid="model-switcher-gpt-5-5-thinking"][role="menuitemradio"], [role="menuitemradio"]:has-text("Thinking")';
const CHATGPT_PRO_MENUITEM_SELECTOR = '[role="menu"] [data-testid="model-switcher-gpt-5-5-pro"][role="menuitemradio"], [data-testid="model-switcher-gpt-5-5-pro"][role="menuitemradio"]';
const CHATGPT_WEB_SEARCH_MENUITEM_SELECTOR = '[role="menuitemradio"]:has-text("Web search")';
const CHATGPT_WEB_SEARCH_ACTIVE_SELECTOR = 'button[aria-label="Search, click to remove"], button[aria-label*="Search" i][aria-label*="remove" i]';
const CHATGPT_CANVAS_DOWNLOAD_BUTTON_SELECTOR = 'main button[aria-haspopup="menu"]:has-text("Download")';
const CHATGPT_DEEP_RESEARCH_MENUITEM_SELECTOR = '[role="menuitemradio"]:has-text("Deep research"), [role="menuitemcheckbox"]:has-text("Deep research"), [role="menuitem"]:has-text("Deep research"), [role="menuitemradio"]:has-text("Research"), [role="menuitemcheckbox"]:has-text("Research"), [role="menuitem"]:has-text("Research")';
const CHATGPT_DEEP_RESEARCH_ACTIVE_SELECTOR = 'button[aria-label*="Deep research" i][aria-label*="remove" i], button[aria-label*="Research" i][aria-label*="remove" i]';
const CHATGPT_SHARE_BUTTON_SELECTOR = 'button[aria-label="Share"]';
const CLAUDE_MODEL_SELECTOR = '[data-testid="model-selector-dropdown"]';
const CLAUDE_ADAPTIVE_THINKING_SELECTOR = 'input[aria-label="Adaptive thinking"]';
const CLAUDE_PLUS_MENU_SELECTOR = 'button[aria-label="Add files, connectors, and more"], button[aria-label="Upload files"], button[aria-label*="Add files" i], button[aria-label*="Attach" i], button[data-testid*="upload" i], button[data-testid*="file" i]';
const CLAUDE_PROMPT_SELECTOR = 'div[aria-label="Write your prompt to Claude"], [data-testid="chat-input"], [contenteditable="true"], #prompt-textarea';
const CLAUDE_WEB_SEARCH_MENUITEM_SELECTOR = '[role="menuitemcheckbox"]:has-text("Web search")';
const CLAUDE_DEEP_RESEARCH_MENUITEM_SELECTOR = 'xpath=//*[(@role="menuitemcheckbox" or @role="menuitem")][contains(.,"Research")]';
const CLAUDE_SEARCH_LINK_SELECTOR = 'a[aria-label="Search"]';
const CLAUDE_SHARE_BUTTON_SELECTOR = '[data-testid*="share" i], button[aria-label="Share"], button:has-text("Share")';
const GEMINI_MODE_PICKER_SELECTOR = GEMINI_MODE_PICKER_TRIGGER_SELECTOR;
const GEMINI_WEB_SEARCH_MENUITEM_SELECTOR = '[role="menuitemcheckbox"]:has-text("Google Search")';
const GEMINI_CREATE_VIDEO_ZERO_STATE_SELECTOR = 'button[aria-label="Create video, button, tap to use tool"], intent-card button.card-zero-state[aria-label*="Create video" i]';
const GEMINI_VIDEO_MODE_ACTIVE_SELECTOR = 'button[aria-label="Deselect Videos"]';
// #16 R2 (2026-05-21): when Videos tool mode is active, the composer's
// data-placeholder flips from "Ask Gemini" (default) to "Describe your video"
// (verified live 2026-05-21 on gemini-9225 — see
// .runs/issue-fix-loop/probe-video-all-tabs.mjs). The R1 worker fell back to
// the default Gemini composer selector, which matches the non-video composer,
// so the worker's sendPromptInExistingPage timed out at 15s with the textbox
// invisible (count=0) — even though activation, the Deselect Videos pill, and
// the visible textbox itself were all healthy. Pin to the video-mode composer
// the same way GEMINI_IMAGE_PROMPT_SELECTOR pins the image-mode composer.
const GEMINI_VIDEO_PROMPT_SELECTOR = 'div[role="textbox"][aria-label="Enter a prompt for Gemini"][contenteditable="true"][data-placeholder="Describe your video"]';
const GEMINI_VIDEO_DOWNLOAD_BUTTON_SELECTOR = 'generated-video button[aria-label="Download video"], video-player button.download-button[aria-label*="Download" i], button[aria-label="Download video"]';
const GEMINI_VIDEO_QUOTA_TEXT_SIGNAL = 'snapshot.visibleText:/video generation limit/i';
const GEMINI_VIDEO_DISABLED_COMPOSER_SELECTORS = [
  'rich-textarea.ql-disabled',
  '.text-input-field.disabled',
  'button[aria-label="Open mode picker"][disabled]'
];
const GEMINI_VIDEO_QUOTA_RE = /(?:reached your video generation limit|video generation limit)/i;
const GEMINI_MIN_NO_RESPONSE_WAIT_MS = 8000;
const GEMINI_SEND_BUTTON_HYDRATION_WAIT_MS = 700;
const CHATGPT_GENERATED_FILE_CHIP_DOWNLOAD_SELECTOR = [
  '[data-message-author-role="assistant"] div.border-b:has(div.truncate.text-sm.font-medium) div.items-center.gap-1 > button.rounded-full.p-1:first-of-type',
  '[data-message-author-role="assistant"] div.flex.flex-row.justify-between:has(div.truncate.text-sm.font-medium) div.items-center.gap-1 > button:first-of-type'
].join(", ");
const CHATGPT_GENERATED_FILE_INLINE_READY_SELECTOR = [
  '[data-message-author-role="assistant"] button.behavior-btn',
  '[data-message-author-role="assistant"] [data-attachment]',
  '[data-message-author-role="assistant"] [data-attachment-type="file"]',
  '[data-message-author-role="assistant"] a[download]',
  '[data-message-author-role="assistant"] a[href*="/interpreter/download"]',
  '[data-message-author-role="assistant"] a[href*="/estuary/content"]',
  '[data-message-author-role="assistant"] button[aria-label*="Download" i]',
  '[data-message-author-role="assistant"] [role="button"][aria-label*="Download" i]'
].join(", ");
const CHATGPT_GENERATED_FILE_INLINE_DOWNLOAD_SELECTOR = CHATGPT_GENERATED_FILE_INLINE_READY_SELECTOR;
const CHATGPT_GENERATED_FILE_READY_SELECTOR = [
  CHATGPT_GENERATED_FILE_CHIP_DOWNLOAD_SELECTOR,
  CHATGPT_GENERATED_FILE_INLINE_READY_SELECTOR
].join(", ");
const CHATGPT_GENERATED_FILE_DOWNLOAD_SELECTOR = CHATGPT_GENERATED_FILE_READY_SELECTOR;
const CLAUDE_GENERATED_FILE_DOWNLOAD_SELECTOR = [
  'button[aria-label^="Download" i]',
  'button[aria-label*="Download" i]',
  '[role="button"][aria-label*="Download" i]',
  'a[aria-label*="Download" i]',
  'a[download]',
  'button[data-testid*="download" i]',
  '[data-testid*="download" i] button',
  'button:has-text("Download")'
].join(", ");
function generateFileLocateTimeoutMs(format: string): number {
  return String(format || "").toLowerCase() === "pptx" ? 180000 : 120000;
}

function generateFileDownloadTimeoutMs(format: string): number {
  return String(format || "").toLowerCase() === "pptx" ? 120000 : 60000;
}

function responseTimeoutMs(args: any): number {
  const value = Number(args.response_timeout_ms ?? args.responseTimeoutMs ?? DEFAULT_RESPONSE_TIMEOUT_MS);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_RESPONSE_TIMEOUT_MS;
}

export function loginRequiredForService(service: WebAiService, url: string): boolean {
  if (!url) return false;
  if (service === "chatgpt") return /(auth|login|signup)/i.test(url) || /^https:\/\/auth\.openai\.com\//i.test(url);
  if (service === "claude") {
    try {
      const parsed = new URL(url);
      return ["claude.ai", "www.claude.ai"].includes(parsed.hostname.toLowerCase()) && /^\/(login|signup|logout)(\/|$)/i.test(parsed.pathname);
    } catch {
      return /login|signup|logout/i.test(url);
    }
  }
  return /accounts\.google\.com|signin/i.test(url);
}

function claudeAuthPathname(url: string): string | null {
  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname.replace(/\/+$/, "") || "/";
    if (!["claude.ai", "www.claude.ai"].includes(parsed.hostname.toLowerCase())) return null;
    return /^\/(login|signup|logout)(\/|$)/i.test(parsed.pathname) ? pathname.toLowerCase() : null;
  } catch {
    return null;
  }
}

async function stableClaudeLoginRequired(page: any): Promise<boolean> {
  const firstUrl = page.url?.() || "";
  const firstPath = claudeAuthPathname(firstUrl);
  if (!firstPath || !loginRequiredForService("claude", firstUrl)) return false;
  if (typeof page.waitForTimeout === "function") await page.waitForTimeout(250).catch(() => undefined);
  else await new Promise((resolve) => setTimeout(resolve, 250));
  const secondUrl = page.url?.() || "";
  const secondPath = claudeAuthPathname(secondUrl);
  return firstPath === secondPath && loginRequiredForService("claude", secondUrl);
}

function sendPromptBase(service: WebAiService, chatUrl: string, started: number, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const base: Record<string, unknown> = {
    response_text: "",
    elapsed_ms: Date.now() - started,
    wait_ms: 0,
    completion_detected: false,
    errorCode: null,
    ...overrides
  };
  if (service !== "gemini") base.conversation_id = /\/c\/([^/?#]+)/.exec(chatUrl)?.[1] || null;
  if (service !== "claude") base.model_used = overrides.model_used ?? null;
  base.chat_url = chatUrl;
  if (service === "chatgpt") base.reuse_conversation = Boolean(overrides.reuse_conversation);
  return base;
}

function loginRequiredResponse(service: WebAiService, page: any, started: number): Record<string, unknown> {
  const chatUrl = page.url?.() || serviceDefaults[service].url;
  return safeOutput(sendPromptBase(service, chatUrl, started, { ok: false, service, errorCode: ConsumerErrorCodes.LOGIN_REQUIRED, error_code: ConsumerErrorCodes.LOGIN_REQUIRED }));
}

async function navigateChatgptFreshIfNeeded(page: any, args: any): Promise<void> {
  if (args.reuse_conversation) return;
  await page.goto?.(CHATGPT_FRESH_URL, { waitUntil: "load", timeout: Math.min(args.timeout_ms || 60000, 30000) });
  await page.waitForLoadState?.("networkidle", { timeout: 15000 }).catch(() => page.waitForLoadState?.("load", { timeout: 15000 }).catch(() => undefined));
}

function isChatgptChatSurface(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (!/(^|\.)chatgpt\.com$/i.test(parsed.hostname)) return false;
    return parsed.pathname === "/" || parsed.pathname === "/new" || /^\/c(\/|$)/.test(parsed.pathname);
  } catch {
    return false;
  }
}

async function ensureChatgptChatSurface(page: any, args: any): Promise<void> {
  if (isChatgptChatSurface(String(page.url?.() || ""))) return;
  await page.goto?.(serviceDefaults.chatgpt.url, { waitUntil: "load", timeout: Math.min(args.timeout_ms || 60000, 30000) });
  await page.waitForLoadState?.("networkidle", { timeout: 15000 }).catch(() => page.waitForLoadState?.("load", { timeout: 15000 }).catch(() => undefined));
}

async function navigateClaudeFreshIfNeeded(page: any, args: any): Promise<void> {
  if (args.reuse_conversation) return;
  if (loginRequiredForService("claude", page.url?.() || "")) return;
  const freshUrl = args.incognito ? CLAUDE_INCOGNITO_FRESH_URL : CLAUDE_FRESH_URL;
  await page.goto?.(freshUrl, { waitUntil: "load", timeout: Math.min(args.timeout_ms || 60000, 30000) });
  await page.waitForLoadState?.("networkidle", { timeout: 15000 }).catch(() => page.waitForLoadState?.("load", { timeout: 15000 }).catch(() => undefined));
  const settleMs = Math.min(args.timeout_ms || 60000, 15000);
  const deadline = Date.now() + settleMs;
  while (Date.now() < deadline) {
    const remaining = Math.max(1, deadline - Date.now());
    const selector = await page.waitForSelector?.(serviceDefaults.claude.promptSelector, { state: "visible", timeout: Math.min(250, remaining) }).catch(() => undefined);
    if (selector) return;
    if (loginRequiredForService("claude", page.url?.() || "")) return;
    await new Promise((resolve) => setTimeout(resolve, Math.min(250, Math.max(0, deadline - Date.now()))));
  }
}

async function navigateGeminiFreshIfNeeded(page: any, args: any): Promise<void> {
  if (args.reuse_conversation) return;
  if (args.__forceFreshComposer) {
    await page.goto?.(GEMINI_FRESH_COMPOSER_URL, { waitUntil: "domcontentloaded", timeout: Math.min(args.timeout_ms || 60000, 30000) });
    await page.waitForLoadState?.("domcontentloaded", { timeout: 15000 }).catch(() => undefined);
    return;
  }
  const current = page.url?.() || "";
  if (/\/app\/[^/?#]+/.test(current)) {
    const newChat = page.locator?.('a[aria-label="New chat"], button[aria-label="New chat"]').first?.();
    if (newChat && await newChat.count?.().catch(() => 0)) {
      await newChat.click?.({ timeout: 3000 }).catch(async () => {
        await page.goto?.(GEMINI_FRESH_URL, { waitUntil: "domcontentloaded", timeout: Math.min(args.timeout_ms || 60000, 30000) });
      });
    } else {
      await page.goto?.(GEMINI_FRESH_URL, { waitUntil: "domcontentloaded", timeout: Math.min(args.timeout_ms || 60000, 30000) });
    }
  } else if (!current.includes("gemini.google.com/app")) {
    await page.goto?.(GEMINI_FRESH_URL, { waitUntil: "domcontentloaded", timeout: Math.min(args.timeout_ms || 60000, 30000) });
  }
  await page.waitForLoadState?.("domcontentloaded", { timeout: 15000 }).catch(() => undefined);
}


function modelSelectionDriftResponse(service: WebAiService, page: any, started: number, expected: string, actual: string | null): Record<string, unknown> {
  return safeOutput(sendPromptBase(service, page.url?.() || serviceDefaults[service].url, started, {
    ok: false,
    service,
    errorCode: ConsumerErrorCodes.MODEL_SELECTION_DRIFT,
    error_code: ConsumerErrorCodes.MODEL_SELECTION_DRIFT,
    model_used: actual,
    expected_model: expected
  }));
}

function normalizeModelTier(service: WebAiService, args: any): string | null {
  const raw = typeof args.model === "string" ? args.model.trim() : "";
  if (service === "chatgpt") {
    if (!raw || /^thinking$/i.test(raw)) return "Thinking";
    if (/pro/i.test(raw)) return "Pro";
    if (/^instant$/i.test(raw)) return "Instant";
    return raw;
  }
  if (service === "claude") return raw || null;
  return raw || null;
}

function modelLabelMatches(expected: string, actual: string | null): boolean {
  if (!actual) return false;
  const e = expected.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const a = actual.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (!e) return true;
  const providerStripped = e.replace(/^(claude|gemini|chatgpt|openai)\s+/, "").trim();
  if (providerStripped && providerStripped !== e) {
    if (a.includes(providerStripped) || providerStripped.includes(a)) return true;
    if (providerStripped === "sonnet 4 6") return /\bsonnet\b/.test(a) && /4\.?6|4 6/.test(a);
  }
  if (e === "thinking") return /\bthinking\b/.test(a);
  if (e === "sonnet 4 6") return /\bsonnet\b/.test(a) && /4\.?6|4 6/.test(a);
  return a.includes(e) || e.includes(a);
}

async function locatorText(locator: any): Promise<string | null> {
  if (!locator) return null;
  const aria = await locator.getAttribute?.("aria-label", { timeout: 500 }).catch(() => undefined);
  if (typeof aria === "string" && aria.trim()) return aria.trim().replace(/\s+/g, " ");
  const text = await locator.textContent?.({ timeout: 500 }).catch(() => undefined);
  if (typeof text === "string" && text.trim()) return text.trim().replace(/\s+/g, " ");
  return null;
}

function chatgptMenuItemSelectorForModel(expected: string): string {
  if (/^thinking$/i.test(expected)) return CHATGPT_THINKING_MENUITEM_SELECTOR;
  if (/^pro$/i.test(expected)) return CHATGPT_PRO_MENUITEM_SELECTOR;
  if (/^instant$/i.test(expected)) return CHATGPT_INSTANT_MENUITEM_SELECTOR;
  return `[role="menuitemradio"]:has-text("${expected.replace(/"/g, '\\"')}")`;
}

function chatgptModelIdentityMatches(expected: string, actual: string | null): boolean {
  if (!actual) return false;
  if (/^thinking$/i.test(expected)) return /^thinking$/i.test(actual);
  if (/^pro$/i.test(expected)) return /^pro$/i.test(actual);
  if (/^instant$/i.test(expected)) return /^instant$/i.test(actual);
  return modelLabelMatches(expected, actual);
}

async function chatgptSelectedModelIdentity(page: any): Promise<string | null> {
  const selected = page.locator?.(CHATGPT_SELECTED_MODEL_MENUITEM_SELECTOR).first?.();
  if (!selected || !(await selected.count?.().catch(() => 0))) return null;
  const testId = await selected.getAttribute?.("data-testid", { timeout: 500 }).catch(() => undefined);
  if (testId === "model-switcher-gpt-5-5-thinking") return "Thinking";
  if (testId === "model-switcher-gpt-5-5-pro") return "Pro";
  if (testId === "model-switcher-gpt-5-5") return "Instant";
  const text = await locatorText(selected);
  if (!text) return null;
  if (/^thinking\b/i.test(text)) return "Thinking";
  if (/^pro\b/i.test(text)) return "Pro";
  if (/^instant\b/i.test(text)) return "Instant";
  return text;
}

async function chatgptModelButton(page: any): Promise<{ button: any; selector: string } | null> {
  const selectors = [
    'form button.__composer-pill[aria-haspopup="menu"]',
    'button.__composer-pill[aria-haspopup="menu"]',
    'form button[aria-haspopup="menu"]:has-text("Thinking")',
    'form button[aria-haspopup="menu"]:has-text("Instant")',
    'form button[aria-haspopup="menu"]:has-text("Heavy")',
    'form button[aria-haspopup="menu"]:has-text("Pro")',
    CHATGPT_MODEL_BUTTON_SELECTOR
  ];
  for (const selector of selectors) {
    const candidate = page.locator?.(selector).first?.();
    if (candidate && (await candidate.count?.().catch(() => 0))) return { button: candidate, selector };
  }

  const candidates = page.locator?.(CHATGPT_MODEL_BUTTON_SELECTOR);
  const count = await candidates?.count?.().catch(() => 0) || 0;
  for (let i = 0; i < count; i++) {
    const candidate = candidates.nth?.(i);
    const text = await locatorText(candidate);
    const className = await candidate?.getAttribute?.("class", { timeout: 500 }).catch(() => "") || "";
    if (/__composer-pill/.test(className) || /\b(Thinking|Instant|Heavy|Pro|GPT)\b/i.test(text || "")) {
      return { button: candidate, selector: CHATGPT_MODEL_BUTTON_SELECTOR };
    }
  }
  return null;
}

async function ensureChatgptModelMenuOpen(page: any, button: any, buttonSelector = CHATGPT_MODEL_BUTTON_SELECTOR): Promise<void> {
  if (await page.locator?.(CHATGPT_SELECTED_MODEL_MENUITEM_SELECTOR).first?.().count?.().catch(() => 0)) return;
  await robustClickLocator(page, button, buttonSelector, { timeout: 5000 });
}

async function selectChatgptModel(page: any, expected = "Thinking"): Promise<{ ok: boolean; actual: string | null; expected: string }> {
  const found = await chatgptModelButton(page);
  if (!found) return { ok: false, actual: null, expected };
  const { button, selector: buttonSelector } = found;
  await ensureChatgptModelMenuOpen(page, button, buttonSelector);
  const itemSelector = chatgptMenuItemSelectorForModel(expected);
  try { await page.waitForSelector?.(itemSelector, { state: "visible", timeout: 8000 }); } catch {}
  const item = page.locator?.(itemSelector).first?.();
  if (!item || !(await item.count?.().catch(() => 0))) {
    const actual = await chatgptSelectedModelIdentity(page) || await locatorText(button);
    await page.keyboard?.press?.("Escape")?.catch?.(() => undefined);
    return { ok: false, actual, expected };
  }

  let actual = await chatgptSelectedModelIdentity(page);
  if (!chatgptModelIdentityMatches(expected, actual)) {
    await robustClickLocator(page, item, itemSelector, { timeout: 5000 });
    await page.waitForTimeout?.(250).catch(() => undefined);
    await ensureChatgptModelMenuOpen(page, button, buttonSelector);
    actual = await chatgptSelectedModelIdentity(page) || await locatorText(button);
  }
  await page.keyboard?.press?.("Escape")?.catch?.(() => undefined);
  return { ok: chatgptModelIdentityMatches(expected, actual), actual, expected };
}

function xpathLiteral(value: string): string {
  if (!value.includes("'")) return `'${value}'`;
  if (!value.includes('"')) return `"${value}"`;
  return `concat(${value.split("'").map((part) => `'${part}'`).join(`, "\"'\"", `)})`;
}

function claudeModelLabels(expected: string): string[] {
  const labels = [expected.trim()].filter(Boolean);
  const withoutProvider = expected.trim().replace(/^Claude\s+/i, "").trim();
  if (withoutProvider && !labels.some((label) => label.toLowerCase() === withoutProvider.toLowerCase())) labels.push(withoutProvider);
  return labels;
}

function claudeModelMenuItemSelector(label: string): string {
  return `xpath=//*[@role="menuitemradio" or @role="menuitem"][contains(normalize-space(.), ${xpathLiteral(label)})]`;
}

async function findClaudeModelMenuItem(page: any, expected: string): Promise<{ item: any; selector: string } | null> {
  for (const label of claudeModelLabels(expected)) {
    const selector = claudeModelMenuItemSelector(label);
    const item = page.locator?.(selector).first?.();
    if (item && (await item.count?.().catch(() => 0))) return { item, selector };
  }
  return null;
}

async function waitForClaudeModelMenuItem(page: any, expected: string, timeoutMs = 5000): Promise<void> {
  for (const label of claudeModelLabels(expected)) {
    const selector = claudeModelMenuItemSelector(label);
    try {
      await page.waitForSelector?.(selector, { state: "visible", timeout: timeoutMs });
      return;
    } catch {}
  }
}

async function clickClaudeMenuItem(page: any, loc: any, selector: string): Promise<void> {
  try {
    await loc.click?.({ timeout: 5000 });
  } catch {
    await robustClickLocator(page, loc, selector, { timeout: 5000 });
  }
}

async function selectClaudeModel(page: any, expected: string): Promise<{ ok: boolean; actual: string | null; expected: string }> {
  const button = page.locator?.(CLAUDE_MODEL_SELECTOR).first?.();
  if (!button || !(await button.count?.().catch(() => 0))) return { ok: false, actual: null, expected };
  await robustClickLocator(page, button, CLAUDE_MODEL_SELECTOR, { timeout: 5000 });
  try { await page.waitForSelector?.('[role="menuitemradio"], [role="menuitem"]', { state: "visible", timeout: 8000 }); } catch {}
  await waitForClaudeModelMenuItem(page, expected, 1000);
  let found = await findClaudeModelMenuItem(page, expected);
  if (!found) {
    const moreModelsSelector = `xpath=//*[@role="menuitem" or self::button][contains(normalize-space(.), 'More models')]`;
    const moreModels = page.locator?.(moreModelsSelector).first?.();
    if (moreModels && (await moreModels.count?.().catch(() => 0))) {
      await clickClaudeMenuItem(page, moreModels, moreModelsSelector);
      await waitForClaudeModelMenuItem(page, expected, 5000);
      found = await findClaudeModelMenuItem(page, expected);
    }
  }
  if (!found) {
    const actual = await locatorText(button);
    await page.keyboard?.press?.("Escape")?.catch?.(() => undefined);
    return { ok: false, actual, expected };
  }
  await clickClaudeMenuItem(page, found.item, found.selector);
  await page.waitForTimeout?.(250).catch(() => undefined);
  const actual = await locatorText(button);
  return { ok: modelLabelMatches(expected, actual), actual, expected };
}

async function selectGeminiModel(page: any, expected: string): Promise<{ ok: boolean; actual: string | null; expected: string }> {
  const picker = page.locator?.(GEMINI_MODE_PICKER_SELECTOR).first?.();
  if (!picker || !(await picker.count?.().catch(() => 0))) return { ok: false, actual: null, expected };
  await robustClickLocator(page, picker, GEMINI_MODE_PICKER_SELECTOR, { timeout: 5000 });
  const selector = geminiModelOptionSelector(expected)
    || `xpath=//*[@role="menuitem" or @role="menuitemradio" or self::button][contains(normalize-space(.),"${expected.replace(/"/g, '\\"')}")]`;
  try { await page.waitForSelector?.(selector, { state: "visible", timeout: 8000 }); } catch {}
  const item = page.locator?.(selector).first?.();
  if (!item || !(await item.count?.().catch(() => 0))) return { ok: false, actual: await locatorText(picker), expected };
  await robustClickLocator(page, item, selector, { timeout: 5000 });
  await page.waitForTimeout?.(250).catch(() => undefined);
  const actual = ((await picker.textContent?.().catch(() => "") || "") as string).trim();
  return { ok: modelLabelMatches(expected, actual), actual, expected };
}

async function selectGeminiThinkingLevel(page: any, thinkingLevel: string): Promise<void> {
  const picker = page.locator?.(GEMINI_MODE_PICKER_SELECTOR).first?.();
  if (!picker || !(await picker.count?.().catch(() => 0))) {
    throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "Gemini mode picker trigger was not found", { selector: GEMINI_MODE_PICKER_SELECTOR });
  }
  await robustClickLocator(page, picker, GEMINI_MODE_PICKER_SELECTOR, { timeout: 5000 });
  const expander = page.locator?.(GEMINI_THINKING_EXPANDER_SELECTOR).first?.();
  if (!expander || !(await expander.count?.().catch(() => 0))) {
    throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "Gemini Thinking level expander was not found", { selector: GEMINI_THINKING_EXPANDER_SELECTOR });
  }
  await robustClickLocator(page, expander, GEMINI_THINKING_EXPANDER_SELECTOR, { timeout: 5000 });
  const selector = GEMINI_THINKING_OPTION_TEMPLATES[thinkingLevel];
  const item = page.locator?.(selector).first?.();
  if (!item || !(await item.count?.().catch(() => 0))) {
    throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, `Gemini thinking_level option ${thinkingLevel} not found`, { selector });
  }
  await robustClickLocator(page, item, selector, { timeout: 5000 });
  await page.waitForTimeout?.(250).catch(() => undefined);
}

async function setClaudeAdaptiveThinking(page: any): Promise<void> {
  const button = page.locator?.(CLAUDE_MODEL_SELECTOR).first?.();
  if (button && (await button.count?.().catch(() => 0))) {
    const selected = await locatorText(button);
    if (/\bAdaptive\b/i.test(selected || "")) return;
  }

  const toggle = page.locator?.(CLAUDE_ADAPTIVE_THINKING_SELECTOR).first?.();
  if (toggle && (await toggle.count?.().catch(() => 0))) {
    const checked = await toggle.isChecked?.().catch(() => false);
    const aria = await toggle.getAttribute?.("aria-checked").catch(() => undefined);
    if (checked || aria === "true") return;
    await robustClickLocator(page, toggle, CLAUDE_ADAPTIVE_THINKING_SELECTOR, { timeout: 5000 });
    return;
  }

  if (button && (await button.count?.().catch(() => 0))) {
    await robustClickLocator(page, button, CLAUDE_MODEL_SELECTOR, { timeout: 5000 });
    const adaptiveSelector = `xpath=//*[@role="menuitem" or @role="menuitemradio" or @role="menuitemcheckbox" or self::button][contains(normalize-space(.), 'Adaptive thinking')]`;
    try { await page.waitForSelector?.(adaptiveSelector, { state: "visible", timeout: 5000 }); } catch {}
    const adaptive = page.locator?.(adaptiveSelector).first?.();
    if (adaptive && (await adaptive.count?.().catch(() => 0))) {
      const aria = await adaptive.getAttribute?.("aria-checked").catch(() => undefined);
      if (aria === "true") {
        await page.keyboard?.press?.("Escape")?.catch?.(() => undefined);
        return;
      }
      await clickClaudeMenuItem(page, adaptive, adaptiveSelector);
      await page.waitForTimeout?.(250).catch(() => undefined);
      return;
    }
  }

  throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "Claude Adaptive thinking toggle was not found", { selector: CLAUDE_ADAPTIVE_THINKING_SELECTOR });
}

async function enableChatgptWebSearch(page: any): Promise<void> {
  if (await page.locator?.(CHATGPT_WEB_SEARCH_ACTIVE_SELECTOR).first?.().count?.().catch(() => 0)) return;
  await requireAndClick(page, CHATGPT_IMAGE_MENU_BUTTON_SELECTOR, "ChatGPT composer plus menu button was not found");
  try { await page.waitForSelector?.(CHATGPT_WEB_SEARCH_MENUITEM_SELECTOR, { state: "visible", timeout: 8000 }); } catch {}
  await requireAndClick(page, CHATGPT_WEB_SEARCH_MENUITEM_SELECTOR, "ChatGPT Web search menuitemradio was not found");
}

async function enableClaudeWebSearch(page: any): Promise<void> {
  await requireAndClick(page, CLAUDE_PLUS_MENU_SELECTOR, "Claude composer plus menu button was not found");
  try { await page.waitForSelector?.(CLAUDE_WEB_SEARCH_MENUITEM_SELECTOR, { state: "visible", timeout: 8000 }); } catch {}
  await requireAndClick(page, CLAUDE_WEB_SEARCH_MENUITEM_SELECTOR, "Claude Web search menuitemcheckbox was not found");
}

async function enableGeminiWebSearch(page: any): Promise<void> {
  await openGeminiUploadToolsMenu(page, { exposeMoreTools: false });
  const found = page.locator?.(GEMINI_WEB_SEARCH_MENUITEM_SELECTOR).first?.();
  if (found && (await found.count?.().catch(() => 0))) {
    await requireAndClick(page, GEMINI_WEB_SEARCH_MENUITEM_SELECTOR, "Gemini Google Search menuitemcheckbox was not found");
    return;
  }
  await requireAndClick(page, GEMINI_MORE_TOOLS_SUBMENU_SELECTOR, "Gemini More tools sub-menu trigger was not found").catch(() => undefined);
  const foundLevel2 = page.locator?.(GEMINI_WEB_SEARCH_MENUITEM_SELECTOR).first?.();
  if (foundLevel2 && (await foundLevel2.count?.().catch(() => 0))) {
    await requireAndClick(page, GEMINI_WEB_SEARCH_MENUITEM_SELECTOR, "Gemini Google Search menuitemcheckbox was not found");
    return;
  }
  await dismissGeminiOverlay(page);
  throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "Gemini Web Search toggle was not found in the live-probed Upload & tools menus", { selector: GEMINI_WEB_SEARCH_MENUITEM_SELECTOR });
}

async function applyPreSendOptions(service: WebAiService, args: any, page: any, started: number): Promise<Record<string, unknown> | null> {
  if (service === "chatgpt") {
    const expected = normalizeModelTier(service, args) || "Thinking";
    const selection = await selectChatgptModel(page, expected);
    if (!selection.ok) return modelSelectionDriftResponse(service, page, started, selection.expected, selection.actual);
    if (args.web_search) await enableChatgptWebSearch(page);
    if (args.canvas && typeof args.prompt === "string" && !/^\s*use canvas to write\b/i.test(args.prompt)) args.prompt = `Use canvas to write ${args.prompt}`;
    return null;
  }
  if (service === "claude") {
    const expected = normalizeModelTier(service, args);
    if (expected) {
      const selection = await selectClaudeModel(page, expected);
      if (!selection.ok) return modelSelectionDriftResponse(service, page, started, selection.expected, selection.actual);
    }
    if (args.thinking) await setClaudeAdaptiveThinking(page);
    if (args.web_search) await enableClaudeWebSearch(page);
    return null;
  }
  const expected = normalizeModelTier(service, args);
  if (expected) {
    const selection = await selectGeminiModel(page, expected);
    if (!selection.ok) return modelSelectionDriftResponse(service, page, started, selection.expected, selection.actual);
  }
  if (args.thinking) await selectGeminiThinkingLevel(page, "extended");
  if (args.web_search) await enableGeminiWebSearch(page);
  return null;
}

async function readModelUsed(service: WebAiService, page: any, args: any): Promise<string | null> {
  void args;
  const selectors = service === "chatgpt"
    ? [CHATGPT_MODEL_BUTTON_SELECTOR, 'button[aria-label*="Model selector" i] span', 'button:has-text("GPT") span']
    : service === "claude"
      ? ['[data-testid*="model" i]', 'header button:has-text("Claude")', 'header']
      : ['header:has-text("Gemini")', 'button:has-text("Gemini")', '[aria-label*="Gemini" i]'];
  for (const selector of selectors) {
    const text = await page.locator?.(selector).first?.().textContent?.({ timeout: 500 }).catch(() => undefined);
    if (typeof text === "string" && text.trim()) return text.trim().replace(/\s+/g, " ").slice(0, 120);
  }
  return null;
}

function assistantMessageSelector(service: WebAiService): string {
  if (service === "chatgpt") return '[data-message-author-role="assistant"]';
  if (service === "claude") return '[data-testid*="message" i]:has([aria-label*="Claude" i]), [data-is-streaming="false"], .font-claude-message, main [data-testid*="chat-message" i]';
  return GEMINI_RESPONSE_SELECTOR;
}

function stopButtonSelector(service: WebAiService): string {
  if (service === "gemini") return 'button[aria-label="Stop response"]';
  if (service === "chatgpt") return 'button[data-testid="stop-button"], button[aria-label*="Stop" i]';
  return '[aria-label*="Stop" i]';
}

function sendButtonSelector(service: WebAiService): string {
  if (service === "gemini") return 'button[aria-label="Send message"]';
  if (service === "chatgpt") return 'button[data-testid="composer-submit-button"], button[data-testid="send-button"], #composer-submit-button, button[aria-label*="Send" i], button[aria-label*="Submit" i], form button[type="submit"]';
  return 'button[data-testid="chat-send-button"], button[data-testid="send-button"], [data-testid="chat-send-button"], [data-testid="send-button"], button[aria-label*="Send" i], [aria-label*="Send" i], button[aria-label*="Submit" i], [aria-label*="Submit" i], form button[type="submit"]';
}

async function waitForGeminiGenerationStart(page: any, stopSelector: string, assistantCountBefore: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + Math.max(1, timeoutMs);
  const maxAttempts = 4;
  for (let attempt = 0; attempt < maxAttempts && Date.now() < deadline; attempt++) {
    try {
      await page.waitForFunction?.(
        ({ stopSelector, turnSelector, assistantCountBefore }: any) => {
          const visible = (el: Element) => !!((el as HTMLElement).offsetWidth || (el as HTMLElement).offsetHeight || (el as HTMLElement).getClientRects().length);
          const stopVisible = Array.from(document.querySelectorAll(stopSelector)).some(visible);
          const turnCount = document.querySelectorAll(turnSelector).length;
          return stopVisible || turnCount > assistantCountBefore;
        },
        { stopSelector, turnSelector: GEMINI_TURN_SELECTOR, assistantCountBefore },
        { timeout: Math.max(1, deadline - Date.now()) }
      );
      return true;
    } catch (_error) {
      const remaining = deadline - Date.now();
      if (attempt >= maxAttempts - 1 || remaining < 750) return false;
      await sleepMs(750);
    }
  }
  return false;
}

async function waitForGeminiCompletionUi(page: any, stopSelector: string, sendSelector: string, regenerateSelector: string, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + Math.max(1, timeoutMs);
  const maxAttempts = 4;
  for (let attempt = 0; attempt < maxAttempts && Date.now() < deadline; attempt++) {
    try {
      await page.waitForFunction?.(
        ({ stopSelector, sendSelector, regenerateSelector }: any) => {
          const visible = (el: Element) => !!((el as HTMLElement).offsetWidth || (el as HTMLElement).offsetHeight || (el as HTMLElement).getClientRects().length);
          const stopVisible = Array.from(document.querySelectorAll(stopSelector)).some(visible);
          // Keep Send in the detector payload for traceability, but do NOT gate
          // on it: Gemini leaves an empty composer with Send aria-disabled=true
          // after completion.
          document.querySelectorAll(sendSelector);
          const regeneratePresent = Array.from(document.querySelectorAll(regenerateSelector)).some(visible);
          const ready = regeneratePresent && !stopVisible;
          const state = (window as any).__webAiCompletionStable || ((window as any).__webAiCompletionStable = { ready: false, since: Date.now() });
          if (state.ready !== ready) {
            state.ready = ready;
            state.since = Date.now();
          }
          return ready && Date.now() - state.since >= 1500;
        },
        { stopSelector, sendSelector, regenerateSelector },
        { timeout: Math.max(1, deadline - Date.now()) }
      );
      return true;
    } catch (_error) {
      const remaining = deadline - Date.now();
      if (attempt >= maxAttempts - 1 || remaining < 750) return false;
      await sleepMs(750);
    }
  }
  return false;
}

async function geminiSnapshotVisibleTextLength(page: any): Promise<number | null | undefined> {
  if (typeof page.context !== "function") return undefined;
  const snapshot = await readPageSnapshot(page, { includePortals: true }).catch(() => null);
  if (!snapshot) return null;
  return (snapshot.visibleText || "").trim().length;
}

async function waitForGeminiCanonicalTextStable(page: any, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + Math.max(1, timeoutMs);
  let lastLength: number | null = null;
  let stableSince = Date.now();
  while (Date.now() < deadline) {
    const textLength = await geminiSnapshotVisibleTextLength(page);
    const now = Date.now();
    if (textLength === undefined) return true;
    if (textLength !== null) {
      if (textLength !== lastLength) {
        lastLength = textLength;
        stableSince = now;
      } else if (now - stableSince >= 2500) {
        return true;
      }
    } else {
      lastLength = null;
      stableSince = now;
    }
    await sleepMs(Math.min(500, Math.max(1, deadline - Date.now())));
  }
  return false;
}

async function waitForGeminiStableCompletion(page: any, stopSelector: string, sendSelector: string, regenerateSelector: string, timeoutMs: number): Promise<boolean> {
  const started = Date.now();
  if (!await waitForGeminiCompletionUi(page, stopSelector, sendSelector, regenerateSelector, timeoutMs)) return false;
  return waitForGeminiCanonicalTextStable(page, Math.max(1, timeoutMs - (Date.now() - started)));
}

async function waitForGeminiNoResponseFloor(started: number, timeoutMs: number): Promise<void> {
  const floorMs = Math.min(timeoutMs, GEMINI_MIN_NO_RESPONSE_WAIT_MS);
  const remaining = floorMs - (Date.now() - started);
  if (remaining > 0) await sleepMs(remaining);
}

async function waitForPromptCompletion(service: WebAiService, page: any, sentAt: number, assistantCountBefore: number, timeoutMs: number): Promise<{ completion_detected: boolean; wait_ms: number }> {
  void sentAt;
  const started = Date.now();
  const elapsed = () => Date.now() - started;
  const phaseATimeout = Math.min(service === "gemini" ? 60000 : 20000, timeoutMs);
  const stopSelector = stopButtonSelector(service);
  const sendSelector = sendButtonSelector(service);
  const assistantSelector = assistantMessageSelector(service);

  if (service === "gemini") {
    if (!await waitForGeminiGenerationStart(page, stopSelector, assistantCountBefore, phaseATimeout)) {
      await waitForGeminiNoResponseFloor(started, timeoutMs);
      const retryTimeout = Math.min(5000, Math.max(0, timeoutMs - elapsed()));
      // Skip tiny post-floor retries: matches waitForGeminiGenerationStart's 750 ms useful-budget threshold.
      if (retryTimeout >= 750 && await waitForGeminiGenerationStart(page, stopSelector, assistantCountBefore, retryTimeout)) {
        const remaining = Math.max(1, timeoutMs - elapsed());
        if (await waitForGeminiStableCompletion(page, stopSelector, sendSelector, GEMINI_REGENERATE_BUTTON_SELECTOR, remaining)) {
          return { completion_detected: true, wait_ms: elapsed() };
        }
      }
      return { completion_detected: false, wait_ms: Math.min(elapsed(), timeoutMs) };
    }

    const remaining = Math.max(1, timeoutMs - elapsed());
    // NOTE: do NOT gate on the Send button being enabled. After a Gemini
    // response the composer is empty, so Send is aria-disabled="true"
    // indefinitely; requiring it never converges. The response-action toolbar
    // + no Stop + canonical-reader text stability is the reliable completion
    // signal and also survives Gemini SPA execution-context churn.
    if (await waitForGeminiStableCompletion(page, stopSelector, sendSelector, GEMINI_REGENERATE_BUTTON_SELECTOR, remaining)) {
      return { completion_detected: true, wait_ms: elapsed() };
    }
    await waitForGeminiNoResponseFloor(started, timeoutMs);
    const retryTimeout = Math.max(0, timeoutMs - elapsed());
    if (retryTimeout > 0 && await waitForGeminiStableCompletion(page, stopSelector, sendSelector, GEMINI_REGENERATE_BUTTON_SELECTOR, retryTimeout)) {
      return { completion_detected: true, wait_ms: elapsed() };
    }
    return { completion_detected: false, wait_ms: Math.min(elapsed(), timeoutMs) };
  }

  try {
    // Phase A / generation-started gate: never treat "stop absent + send enabled"
    // as completion until we first observe a real generation start.
    await page.waitForFunction?.(
      ({ stopSelector, assistantSelector, assistantCountBefore }: any) => {
        const visible = (el: Element) => !!((el as HTMLElement).offsetWidth || (el as HTMLElement).offsetHeight || (el as HTMLElement).getClientRects().length);
        const stopVisible = Array.from(document.querySelectorAll(stopSelector)).some(visible);
        const assistantCount = document.querySelectorAll(assistantSelector).length;
        return stopVisible || assistantCount > assistantCountBefore;
      },
      { stopSelector, assistantSelector, assistantCountBefore },
      { timeout: phaseATimeout }
    );
  } catch (_error) {
    return { completion_detected: false, wait_ms: Math.min(elapsed(), timeoutMs) };
  }

  const remaining = Math.max(1, timeoutMs - elapsed());
  try {
    await page.waitForFunction?.(
      ({ stopSelector, sendSelector, assistantSelector }: any) => {
        const visible = (el: Element) => !!((el as HTMLElement).offsetWidth || (el as HTMLElement).offsetHeight || (el as HTMLElement).getClientRects().length);
        const stops = Array.from(document.querySelectorAll(stopSelector));
        const stopVisible = stops.some(visible);
        const sends = Array.from(document.querySelectorAll(sendSelector)) as HTMLButtonElement[];
        const sendReady = sends.length === 0 || sends.some((el: any) => !el.disabled && el.getAttribute("aria-disabled") !== "true");
        const completeUi = !stopVisible && sendReady;
        const messages = Array.from(document.querySelectorAll(assistantSelector));
        const latest = messages[messages.length - 1] as HTMLElement | undefined;
        const textLength = latest?.textContent?.length || 0;
        const state = (window as any).__webAiCompletionStable || ((window as any).__webAiCompletionStable = { length: -1, since: Date.now() });
        if (state.length !== textLength) {
          state.length = textLength;
          state.since = Date.now();
        }
        return completeUi && textLength > 0 && Date.now() - state.since >= 1500;
      },
      { stopSelector, sendSelector, assistantSelector },
      { timeout: remaining }
    );
    return { completion_detected: true, wait_ms: elapsed() };
  } catch (_error) {
    return { completion_detected: false, wait_ms: Math.min(elapsed(), timeoutMs) };
  }
}

async function assistantCount(serviceOrPage: WebAiService | any, maybePage?: any): Promise<number> {
  const service: WebAiService = maybePage ? serviceOrPage : "gemini";
  const page = maybePage || serviceOrPage;
  return await page.locator?.(assistantMessageSelector(service)).count?.().catch(() => 0) || 0;
}

async function responseText(service: WebAiService, page: any): Promise<string> {
  if (service === "gemini") {
    // Scope to the LATEST <model-response> turn, then read its clean answer
    // body — NOT the whole <main> (which includes nav sidebar + conversation
    // list + all prior turns). Honest empty string on true absence (caller
    // converts that to COMMAND_TIMEOUT); never a chrome-polluted fallback.
    const text = await page.evaluate?.(
      ({ latestSelector, innerSelectors }: any) => {
        const turns = Array.from(document.querySelectorAll(latestSelector));
        const latest = turns[turns.length - 1] as HTMLElement | undefined;
        if (!latest) return "";
        for (const sel of innerSelectors) {
          const node = latest.querySelector(sel) as HTMLElement | null;
          const t = node?.textContent?.trim();
          if (t) return t;
        }
        // Last resort within the scoped turn only: the model-response text
        // itself. Observed live 2026-05-15 the bare textContent carries a
        // leading "Show thinking" and/or "Gemini said" wrapper and a trailing
        // "Sources" affordance label — strip those, but stay scoped to this
        // single turn (never the nav/sidebar chrome).
        const raw = (latest.textContent || "").trim();
        return raw
          .replace(/^\s*Show thinking\s*/i, "")
          .replace(/^\s*Gemini said\s*/i, "")
          .replace(/\s*Sources\s*$/i, "")
          .trim();
      },
      { latestSelector: GEMINI_LATEST_RESPONSE_SELECTOR, innerSelectors: GEMINI_RESPONSE_TEXT_INNER_SELECTORS }
    ).catch(() => "");
    return typeof text === "string" ? text : "";
  }
  return await page.locator?.(assistantMessageSelector(service)).last?.().textContent?.({ timeout: 2000 }).catch(() => "") || "";
}

async function composerText(box: any): Promise<string | undefined> {
  if (!box) return undefined;
  const value = await box.inputValue?.({ timeout: 500 }).catch(() => undefined);
  if (typeof value === "string") return value;
  const text = await box.textContent?.({ timeout: 500 }).catch(() => undefined);
  return typeof text === "string" ? text : undefined;
}

async function promptStillPresent(box: any, prompt: string): Promise<boolean | undefined> {
  const text = await composerText(box);
  if (typeof text !== "string") return undefined;
  return text.replace(/\s+/g, " ").includes(prompt.replace(/\s+/g, " ").trim());
}

async function pendingStateVisible(service: WebAiService, page: any, assistantCountBefore: number): Promise<boolean> {
  const stopSelector = stopButtonSelector(service);
  const stopCount = await page.locator?.(stopSelector).count?.().catch(() => 0) || 0;
  if (stopCount > 0) return true;
  return await assistantCount(service, page) > assistantCountBefore;
}

async function sendPromptAndConfirmSubmitted(service: WebAiService, page: any, box: any, prompt: string, assistantCountBefore: number, forceEnterToSend = false): Promise<void> {
  const sendSelector = sendButtonSelector(service);
  const started = Date.now();
  // Gemini hydrates Send button ~700ms after composer fill (R8 probe 2026-05-25).
  // Without this prime-wait both attemptSend calls run before count>0, both
  // press Enter, and Gemini contenteditable swallows Enter as a no-op — the
  // 8s floor loop then polls passively and times out. Prime the wait once;
  // already-visible buttons (ChatGPT/Claude steady-state) return ~immediately.
  if (!forceEnterToSend) await page.waitForSelector?.(sendSelector, { state: "visible", timeout: 3000 }).catch(() => undefined);
  const attemptSend = async () => {
    if (forceEnterToSend) { await page.keyboard?.press("Enter"); return; }
    const sendButton = page.locator?.(sendSelector).first?.();
    if (sendButton && await sendButton.count?.().catch(() => 0)) await robustClickLocator(page, sendButton, sendSelector, { timeout: 3000 });
    else await page.keyboard?.press("Enter");
  };
  for (let attempt = 0; attempt < 2; attempt++) {
    await attemptSend();
    await page.waitForTimeout?.(250).catch(() => undefined);
    if (await pendingStateVisible(service, page, assistantCountBefore)) return;
    const stillPresent = await promptStillPresent(box, prompt);
    if (stillPresent === false || stillPresent === undefined) return;
  }
  if (service === "gemini") {
    const deadline = started + GEMINI_MIN_NO_RESPONSE_WAIT_MS;
    while (Date.now() < deadline) {
      if (await pendingStateVisible(service, page, assistantCountBefore)) return;
      const stillPresent = await promptStillPresent(box, prompt);
      if (stillPresent === false || stillPresent === undefined) return;
      await sleepMs(Math.min(250, Math.max(1, deadline - Date.now())));
    }
  }
  throw new WebAiToolError(ConsumerErrorCodes.COMMAND_TIMEOUT, "Prompt did not submit: composer still contained prompt text after retry", { selector: sendSelector });
}

async function fillPromptBox(page: any, box: any, selector: string, prompt: string): Promise<void> {
  await box.fill?.(prompt).catch(async () => { await box.click(); await page.keyboard?.type(prompt); });
  const presentAfterFill = await promptStillPresent(box, prompt);
  if (presentAfterFill) return;
  await box.click?.().catch(() => undefined);
  await page.keyboard?.press(process.platform === "darwin" ? "Meta+A" : "Control+A").catch?.(() => undefined);
  await page.keyboard?.type(prompt).catch?.(() => undefined);
  const presentAfterKeyboard = await promptStillPresent(box, prompt);
  if (presentAfterKeyboard) return;
  await box.evaluate?.((el: HTMLElement, value: string) => {
    el.focus();
    const selection = window.getSelection && window.getSelection();
    if (selection) {
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
    }
    let inserted = false;
    try { inserted = document.execCommand && document.execCommand("insertText", false, value); } catch { inserted = false; }
    if (!inserted) el.textContent = value;
    el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }, prompt).catch(async () => {
    await page.evaluate?.(({ selector, value }: { selector: string; value: string }) => {
      const el = document.querySelector(selector) as HTMLElement | null;
      if (!el) throw new Error("composer not found");
      el.focus();
      let inserted = false;
      try { inserted = document.execCommand && document.execCommand("insertText", false, value); } catch { inserted = false; }
      if (!inserted) el.textContent = value;
      el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }, { selector, value: prompt });
  });
}

async function waitForGeneratedImageRendered(service: "chatgpt" | "gemini", page: any, timeoutMs: number): Promise<void> {
  const imageSelector = service === "chatgpt" ? CHATGPT_IMAGE_RENDERED_SELECTOR : GEMINI_IMAGE_RENDERED_SELECTOR;
  const budgetMs = Math.min(120000, timeoutMs || 120000);
  const startedAt = Date.now();
  try {
    await page.waitForSelector?.(imageSelector, { state: "visible", timeout: budgetMs });
  } catch (error: any) {
    throw new WebAiToolError(ConsumerErrorCodes.COMMAND_TIMEOUT, `${service} generated image toolbar did not render before timeout`, { selector: imageSelector, cause: error?.message || String(error) });
  }
  if (service !== "chatgpt") return;

  const remainingMs = Math.max(1000, budgetMs - (Date.now() - startedAt));
  try {
    await page.waitForFunction?.(
      (selector: string) => Array.from(document.querySelectorAll(selector)).some((node) => {
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      }),
      CHATGPT_IMAGE_OPEN_VIEWER_SELECTOR,
      { polling: 250, timeout: remainingMs }
    );
  } catch (error: any) {
    throw new WebAiToolError(ConsumerErrorCodes.COMMAND_TIMEOUT, `${service} generated image did not render before timeout`, { selector: CHATGPT_IMAGE_OPEN_VIEWER_SELECTOR, cause: error?.message || String(error) });
  }
}

async function clickIfPresent(page: any, selector: string): Promise<void> {
  const loc = page.locator?.(selector).first?.();
  if (!loc) return;
  if (await loc.count?.().catch(() => 0)) await robustClickLocator(page, loc, selector, { timeout: 1500 }).catch(() => undefined);
}

async function cdpSessionForPage(page: any): Promise<any> {
  return await page.context?.()?.newCDPSession?.(page) || await page.context?.()?.new_cdp_session?.(page);
}

async function robustClickLocator(page: any, loc: any, selector: string, options: { timeout?: number; dwellMs?: number } = {}): Promise<void> {
  const handles = typeof loc.elementHandles === "function" ? await loc.elementHandles().catch(() => []) : [];
  const handle = handles?.[0];
  if (handle && typeof handle.boundingBox === "function") {
    try { await handle.scrollIntoViewIfNeeded?.({ timeout: Math.min(options.timeout || 5000, 2000) }); } catch {}
    const box = await handle.boundingBox?.();
    const cdp = box ? await cdpSessionForPage(page).catch(() => undefined) : undefined;
    if (box && cdp?.send) {
      const x = box.x + box.width / 2;
      const y = box.y + box.height / 2;
      const startX = Math.max(0, x - Math.max(24, Math.min(80, box.width || 24)));
      const startY = Math.max(0, y - Math.max(24, Math.min(80, box.height || 24)));
      for (let i = 1; i <= 5; i++) {
        const ratio = i / 5;
        await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: startX + (x - startX) * ratio, y: startY + (y - startY) * ratio, button: "none", buttons: 0 });
      }
      if ((options.dwellMs ?? 80) > 0) await page.waitForTimeout?.(options.dwellMs ?? 80).catch(() => undefined);
      await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", buttons: 1, clickCount: 1 });
      await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", buttons: 0, clickCount: 1 });
      await cdp.detach?.().catch?.(() => undefined);
      return;
    }
  }
  await loc.click?.({ timeout: options.timeout || 5000 });
}

async function dismissPreExistingInterceptors(page: any): Promise<void> {
  await page.keyboard?.press?.("Escape")?.catch?.(() => undefined);
  await clickIfPresent(page, '[role="dialog"] button[aria-label="Close"], [data-testid="modal-close-button"], button[aria-label="Close"]');
}

async function requireAndClick(page: any, selector: string, message: string, options: { dismissInterceptors?: boolean; dwellMs?: number } = {}): Promise<any> {
  if (options.dismissInterceptors) await dismissPreExistingInterceptors(page);
  const loc = page.locator?.(selector).first?.();
  if (!loc || !(await loc.count?.().catch(() => 0))) throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, message, { selector });
  await robustClickLocator(page, loc, selector, { timeout: 5000, dwellMs: options.dwellMs });
  return loc;
}

async function activateChatgptImageMode(page: any): Promise<void> {
  await requireAndClick(page, CHATGPT_IMAGE_MENU_BUTTON_SELECTOR, "ChatGPT composer image-mode menu button was not found");
  try {
    await page.waitForSelector?.(CHATGPT_CREATE_IMAGE_RADIO_SELECTOR, { state: "visible", timeout: 8000 });
  } catch (error: any) {
    throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "ChatGPT Create image menuitemradio was not found after opening the composer menu", { selector: CHATGPT_CREATE_IMAGE_RADIO_SELECTOR, cause: error?.message || String(error) });
  }
  const radio = page.locator?.(CHATGPT_CREATE_IMAGE_RADIO_SELECTOR).first?.();
  if (!radio || !(await radio.count?.().catch(() => 0))) throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "ChatGPT Create image menuitemradio was not found", { selector: CHATGPT_CREATE_IMAGE_RADIO_SELECTOR });
  // Selecting the radio closes the Radix menu and detaches the menuitemradio.
  // Verify activation via the composer image-mode pill, not the (now-detached)
  // radio's aria-checked. Wrap the click so a raw Playwright timeout cannot leak.
  try {
    await robustClickLocator(page, radio, CHATGPT_CREATE_IMAGE_RADIO_SELECTOR, { timeout: 8000 });
  } catch (error: any) {
    throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "ChatGPT Create image menuitemradio could not be clicked", { selector: CHATGPT_CREATE_IMAGE_RADIO_SELECTOR, cause: error?.message || String(error) });
  }
  try {
    await page.waitForSelector?.(CHATGPT_IMAGE_MODE_ACTIVE_SELECTOR, { state: "visible", timeout: 8000 });
  } catch (error: any) {
    throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "ChatGPT image mode did not activate after selecting Create image", { selector: CHATGPT_IMAGE_MODE_ACTIVE_SELECTOR, cause: error?.message || String(error) });
  }
}

async function activateGeminiImageMode(page: any): Promise<void> {
  const zeroStateButton = page.locator?.(GEMINI_CREATE_IMAGE_BUTTON_SELECTOR).first?.();
  const zeroStateVisible = await page.waitForSelector?.(GEMINI_CREATE_IMAGE_BUTTON_SELECTOR, { state: "visible", timeout: 4000 })
    .then(() => true)
    .catch(() => false);
  if (zeroStateVisible && zeroStateButton && await zeroStateButton.count?.().catch(() => 0)) {
    const before = typeof zeroStateButton.getAttribute === "function" ? await zeroStateButton.getAttribute("aria-label").catch(() => "") : "";
    if (typeof before === "string" && before.includes("Deselect Images")) return;
    await zeroStateButton.click?.({ timeout: 5000 });
    if (typeof page.waitForTimeout === "function") await page.waitForTimeout(250).catch(() => undefined);
    const after = typeof zeroStateButton.getAttribute === "function" ? await zeroStateButton.getAttribute("aria-label").catch(() => "") : "";
    if (typeof after === "string" && after.includes("Deselect Images")) return;
  }

  // Upload & tools menu → Create image menuitemcheckbox. Material menu closes
  // on click, so the menuitem detaches; the canonical post-activation signal
  // is the composer pill button[aria-label="Deselect Images"] (same
  // pattern as activateGeminiToolMode uses for Canvas/Create video).
  try {
    await openGeminiUploadToolsMenu(page, { exposeMoreTools: false });
    await page.waitForSelector?.(GEMINI_CREATE_IMAGE_MENUITEM_SELECTOR, { state: "visible", timeout: 8000 });
    const menuItem = page.locator?.(GEMINI_CREATE_IMAGE_MENUITEM_SELECTOR).first?.();
    if (menuItem && await menuItem.count?.().catch(() => 0)) {
      const before = typeof menuItem.getAttribute === "function" ? await menuItem.getAttribute("aria-checked").catch(() => undefined) : undefined;
      if (before === "true" || before === "mixed") return;
      await robustClickLocator(page, menuItem, GEMINI_CREATE_IMAGE_MENUITEM_SELECTOR, { timeout: 5000 });
      // Material auto-closes the menu on click. Wait for the in-composer
      // "Deselect Images" pill — that's the live-observed activation
      // signal post-revamp (parallel to Canvas/Video at activateGeminiToolMode).
      try {
        await page.waitForSelector?.('button[aria-label="Deselect Images"]', { state: "visible", timeout: 5000 });
        return;
      } catch (_e) {
        // The pill never appeared; fall through to ELEMENT_NOT_FOUND.
      }
    }
  } catch (_error) {
    // Reach the bottom throw with both selector paths captured in evidence.
  }

  throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "Gemini Create image tool did not activate from the zero-state chip or Upload & tools menu", { selector: `${GEMINI_CREATE_IMAGE_BUTTON_SELECTOR} OR ${GEMINI_UPLOAD_TOOLS_TRIGGER_SELECTOR} -> ${GEMINI_CREATE_IMAGE_MENUITEM_SELECTOR} -> button[aria-label="Deselect Images"]` });
}

// Activate a Gemini Tools-drawer mode (Canvas / Create video) and confirm via
// the active-mode "Deselect <tool>" pill — the live-observed activation signal
// (2026-05-15): clicking the menuitemcheckbox closes the drawer and replaces
// the mode-picker affordance with button[aria-label="Deselect <tool>"], exactly
// like "Deselect Images". An optional zero-state chip is tried first.
const GEMINI_TOOL_MODE_HYDRATION_TIMEOUT_MS = 15000;

export async function activateGeminiToolMode(page: any, opts: { menuItemSelector: string; activeSelector: string; zeroStateSelector?: string; toolName: string; quotaGuard?: () => Promise<void> }): Promise<void> {
  const isActive = async () => {
    const loc = page.locator?.(opts.activeSelector).first?.();
    return !!loc && !!(await loc.count?.().catch(() => 0));
  };
  const waitForActive = async (timeout = GEMINI_TOOL_MODE_HYDRATION_TIMEOUT_MS) => {
    if (typeof page.waitForSelector === "function") {
      await page.waitForSelector(opts.activeSelector, { state: "visible", timeout });
    }
    return await isActive();
  };
  const drawerCanOpen = async () => {
    const drawer = page.locator?.(GEMINI_UPLOAD_TOOLS_TRIGGER_SELECTOR).first?.();
    if (!drawer || !(await drawer.count?.().catch(() => 0))) return false;
    const className = typeof drawer.getAttribute === "function" ? await drawer.getAttribute("class").catch(() => "") : "";
    const ariaDisabled = typeof drawer.getAttribute === "function" ? await drawer.getAttribute("aria-disabled").catch(() => "") : "";
    const disabled = typeof drawer.isDisabled === "function" ? await drawer.isDisabled().catch(() => false) : false;
    return !disabled && ariaDisabled !== "true" && !(typeof className === "string" && className.includes("has-selected-item"));
  };
  if (await isActive()) return;
  if (opts.zeroStateSelector) {
    const zero = page.locator?.(opts.zeroStateSelector).first?.();
    const zeroVisible = typeof page.waitForSelector === "function"
      ? await page.waitForSelector(opts.zeroStateSelector, { state: "visible", timeout: 4000 }).then(() => true).catch(() => false)
      : false;
    if (zeroVisible && zero && await zero.count?.().catch(() => 0)) {
      await robustClickLocator(page, zero, opts.zeroStateSelector, { timeout: 5000 }).catch(() => undefined);
      try {
        if (await waitForActive()) return;
      } catch {
        // Fall through to the Upload & tools path; final menu/pill evidence
        // below must describe the last failing activation path.
      }
      await opts.quotaGuard?.();
    }
  }
  let activationSubCause: string | undefined;
  try {
    // The Gemini composer + Tools-drawer button mount AFTER domcontentloaded
    // via Angular hydration; an instant requireAndClick races that render and
    // spuriously throws ELEMENT_NOT_FOUND at ~0ms (same class as the upload
    // trigger race). Wait for the button to actually be visible (bounded)
    // before clicking — confirmed live present on the fresh composer. If a
    // zero-state chip already selected a tool, the drawer re-renders as
    // has-selected-item/disabled and cannot open; do not burn a dead click
    // timeout in that already-selected state.
    if (await isActive()) return;
    if (typeof page.waitForSelector === "function") {
      await page.waitForSelector(GEMINI_UPLOAD_TOOLS_TRIGGER_SELECTOR, { state: "visible", timeout: GEMINI_TOOL_MODE_HYDRATION_TIMEOUT_MS });
    }
    if (await isActive()) return;
    if (!(await drawerCanOpen())) throw new Error("Gemini Upload & tools menu is already selected or disabled");
    await openGeminiUploadToolsMenu(page, { exposeMoreTools: opts.toolName === "Create music" || opts.toolName === "Guided learning" });
    await page.waitForSelector?.(opts.menuItemSelector, { state: "visible", timeout: GEMINI_TOOL_MODE_HYDRATION_TIMEOUT_MS });
    await requireAndClick(page, opts.menuItemSelector, `Gemini ${opts.toolName} menu item was not found`);
    try {
      if (await waitForActive()) return;
    } catch (error: any) {
      activationSubCause = error?.message || String(error);
    }
    await opts.quotaGuard?.();
  } catch (error: any) {
    activationSubCause = error?.message || String(error);
  }
  await opts.quotaGuard?.();
  throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, `Gemini ${opts.toolName} tool did not activate from the zero-state chip or Upload & tools menu`, { selector: `${opts.zeroStateSelector || ""} OR ${GEMINI_UPLOAD_TOOLS_TRIGGER_SELECTOR} -> ${opts.menuItemSelector} -> ${opts.activeSelector}`, cause: activationSubCause || "active pill did not appear" });
}

async function activateGeminiCanvasMode(page: any): Promise<void> {
  try {
    await activateGeminiToolMode(page, { menuItemSelector: GEMINI_CANVAS_MENUITEM_SELECTOR, activeSelector: GEMINI_CANVAS_MODE_ACTIVE_SELECTOR, toolName: "Canvas" });
    return;
  } catch (firstError: any) {
    await page.keyboard?.press?.("Escape").catch(() => undefined);
    try {
      await page.waitForSelector?.(GEMINI_UPLOAD_TOOLS_TRIGGER_SELECTOR, { state: "visible", timeout: GEMINI_TOOL_MODE_HYDRATION_TIMEOUT_MS });
      const opener = page.locator?.(GEMINI_UPLOAD_TOOLS_TRIGGER_SELECTOR).first?.();
      if (!opener || !(await opener.count?.().catch(() => 0))) throw firstError;
      await opener.click?.({ force: true, timeout: 5000 }).catch(async () => {
        await robustClickLocator(page, opener, GEMINI_UPLOAD_TOOLS_TRIGGER_SELECTOR, { timeout: 5000 });
      });
      await page.waitForSelector?.(GEMINI_CANVAS_MENUITEM_SELECTOR, { state: "visible", timeout: GEMINI_TOOL_MODE_HYDRATION_TIMEOUT_MS });
      await requireAndClick(page, GEMINI_CANVAS_MENUITEM_SELECTOR, "Gemini Canvas menuitemcheckbox was not found", { dismissInterceptors: false });
      await page.waitForSelector?.(GEMINI_CANVAS_MODE_ACTIVE_SELECTOR, { state: "visible", timeout: GEMINI_TOOL_MODE_HYDRATION_TIMEOUT_MS });
      return;
    } catch (fallbackError: any) {
      throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "Gemini Canvas tool did not activate from the live-probed Upload & tools menu path", {
        selector: `${GEMINI_UPLOAD_TOOLS_TRIGGER_SELECTOR} -> ${GEMINI_CANVAS_MENUITEM_SELECTOR} -> ${GEMINI_CANVAS_MODE_ACTIVE_SELECTOR}`,
        cause: errorMessageFromUnknown(fallbackError, errorMessageFromUnknown(firstError, ""))
      });
    }
  }
}

export async function activateGeminiVideoMode(page: any): Promise<void> {
  if (typeof page?.evaluate !== "function" && typeof page?.evaluateReadOnly !== "function" && typeof page?.textSnapshot !== "function") {
    try {
      await page.waitForSelector?.(GEMINI_UPLOAD_TOOLS_TRIGGER_SELECTOR, { state: "visible", timeout: GEMINI_TOOL_MODE_HYDRATION_TIMEOUT_MS });
    } catch (error: any) {
      throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "Gemini Upload & tools button was not found", { selector: GEMINI_UPLOAD_TOOLS_TRIGGER_SELECTOR, cause: error?.message || String(error) });
    }
    const opener = page.locator?.(GEMINI_UPLOAD_TOOLS_TRIGGER_SELECTOR).first?.();
    if (!opener || !(await opener.count?.().catch(() => 0))) {
      throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "Gemini Upload & tools button was not found", { selector: GEMINI_UPLOAD_TOOLS_TRIGGER_SELECTOR });
    }
    await opener.click?.({ force: true });
    try {
      await page.waitForSelector?.(GEMINI_CREATE_VIDEO_MENUITEM_SELECTOR, { state: "visible", timeout: GEMINI_TOOL_MODE_HYDRATION_TIMEOUT_MS });
    } catch (error: any) {
      throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "Gemini Create video menu item was not found", { selector: GEMINI_CREATE_VIDEO_MENUITEM_SELECTOR, cause: error?.message || String(error) });
    }
    const menuItem = page.locator?.(GEMINI_CREATE_VIDEO_MENUITEM_SELECTOR).first?.();
    if (!menuItem || !(await menuItem.count?.().catch(() => 0))) {
      throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "Gemini Create video menu item was not found", { selector: GEMINI_CREATE_VIDEO_MENUITEM_SELECTOR });
    }
    await menuItem.click?.();
    try {
      await page.waitForSelector?.(GEMINI_VIDEO_MODE_ACTIVE_SELECTOR, { state: "visible", timeout: GEMINI_TOOL_MODE_HYDRATION_TIMEOUT_MS });
      return;
    } catch (error: any) {
      await throwIfGeminiVideoQuotaExhausted(page, 8000);
      throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "Gemini Create video tool did not activate from Upload & tools menu", { selector: `${GEMINI_UPLOAD_TOOLS_TRIGGER_SELECTOR} -> ${GEMINI_CREATE_VIDEO_MENUITEM_SELECTOR} -> ${GEMINI_VIDEO_MODE_ACTIVE_SELECTOR}`, cause: error?.message || String(error) });
    }
  }
  try {
    await ensureGeminiToolsAvailable(page);
    await toggleGeminiTool(page, "Create video", 1, GEMINI_TOOL_MODE_HYDRATION_TIMEOUT_MS);
    await page.waitForSelector?.(GEMINI_VIDEO_MODE_ACTIVE_SELECTOR, { state: "visible", timeout: GEMINI_TOOL_MODE_HYDRATION_TIMEOUT_MS });
  } catch (error: any) {
    await throwIfGeminiVideoQuotaExhausted(page, 8000);
    if (isConsumerErrorCode(error?.errorCode)) throw error;
    throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "Gemini Create video menuitemcheckbox did not report aria-checked=true", { selector: `${GEMINI_UPLOAD_TOOLS_TRIGGER_SELECTOR} -> ${GEMINI_CREATE_VIDEO_MENUITEM_SELECTOR} -> ${GEMINI_VIDEO_MODE_ACTIVE_SELECTOR}`, cause: errorMessageFromUnknown(error, "") });
  }
}


async function waitForGeminiSendReadyAfterUpload(page: any): Promise<void> {
  try {
    await page.waitForFunction?.(
      () => {
        const send = document.querySelector('button[aria-label="Send message"]') as HTMLButtonElement | null;
        return !!send && send.getAttribute("aria-disabled") !== "true" && !send.disabled;
      },
      {},
      { timeout: 15000 }
    );
  } catch (error: any) {
    throw new WebAiToolError(ConsumerErrorCodes.COMMAND_TIMEOUT, "Gemini send button did not become enabled after upload chip appeared", { selector: 'button[aria-label="Send message"][aria-disabled="false"]', cause: error?.message || String(error) });
  }
}

async function waitForClaudeAttachmentReadyAfterUpload(page: any, resolved: string[]): Promise<void> {
  const filenames = resolved.map((file: string) => path.basename(file));
  try {
    await page.waitForFunction?.(
      (expectedNames: string[]) => {
        const expected = new Set(expectedNames);
        // Scope to the live composer / attachment area to avoid matching prior turns'
        // chip wrappers that linger in conversation scrollback.
        const root =
          document.querySelector('fieldset, [data-testid="composer"], [data-testid*="composer"], main') ||
          document.body;
        // #16 R3 (2026-05-21): Claude composer renders TWO chip shapes side by
        // side, depending on upload kind. Both wrappers carry the discrete
        // class token "group/thumbnail"; the chip identity is otherwise shape-
        // specific. Cycle#26 R2 verdict on d676f60 regressed image uploads
        // because the R2 detector hard-coded the text-chip shape.
        //
        //   IMAGE shape (verified live 2026-05-21 on claude-9224):
        //     <div class="relative group/thumbnail">
        //       <div data-testid="<filename>"><button><img alt="<filename>"></button></div>
        //       <button aria-label="Remove <filename>">X</button>
        //     </div>
        //   TEXT shape (verified live 2026-05-21 on claude-9224):
        //     <div class="group/thumbnail" data-testid="file-thumbnail">
        //       <button aria-label="<filename>, <ext>, <N> lines">...</button>
        //       <button aria-label="Remove">X</button>
        //     </div>
        //
        // Completion = each expected filename can be derived from at least
        // ONE of three signals on a wrapper carrying the discrete
        // 'group/thumbnail' class token, AND no wrapper carries a loading
        // marker. Three signals: (S1) inner <div data-testid="<filename>">
        // (image), (S2) wrapper's own data-testid="file-thumbnail" + inner
        // button[aria-label] LEFT-of-first-comma (text), (S3) inner
        // <button aria-label="Remove <filename>"> (image; text Remove has
        // no filename suffix so this is silently a no-op there).
        //
        // Wrapper isolation: filter DIVs whose class list contains the
        // discrete 'group/thumbnail' token; the Remove button has
        // 'group-focus-within/thumbnail' which is a different token and
        // must NOT be treated as a wrapper.
        const wrappers = Array.from(root.querySelectorAll('div[class*="group/thumbnail"]'))
          .filter((el: any) => /(^|\s)group\/thumbnail(\s|$)/.test(String(el.className || '')));
        if (wrappers.length === 0) return false;
        const seen = new Set<string>();
        for (const wrapper of wrappers) {
          // Loading hint: progressbar / "Loading" aria-label / spinning svg.
          const loadingHint = (wrapper as any).querySelector(
            '[role="progressbar"], [aria-label*="oading"], [aria-label*="rogress"], svg[class*="animate-spin"], svg[class*="spin"]'
          );
          if (loadingHint) return false;
          // S1 — image chip: inner descendants with a non-meta data-testid;
          // the testid value IS the filename.
          const innerTestidNodes = Array.from((wrapper as any).querySelectorAll('[data-testid]'));
          for (const node of innerTestidNodes) {
            const t = (node as any).getAttribute('data-testid');
            if (t && t !== 'file-thumbnail' && t !== 'file-upload') seen.add(t);
          }
          // S2 — text chip: wrapper itself carries data-testid="file-thumbnail"
          // and the inner main button's aria-label encodes the filename as the
          // LEFT-of-first-comma segment.
          if ((wrapper as any).getAttribute('data-testid') === 'file-thumbnail') {
            const btn = (wrapper as any).querySelector('button[aria-label]');
            const label = btn ? (btn.getAttribute('aria-label') || '') : '';
            const commaIdx = label.indexOf(',');
            const fn = (commaIdx >= 0 ? label.slice(0, commaIdx) : label).trim();
            if (fn && fn !== 'Remove') seen.add(fn);
          }
          // S3 — shape-agnostic fallback: a "Remove <filename>" button
          // appears on image chips (text chips have just "Remove" with no
          // filename suffix; the regex below intentionally requires a
          // non-empty suffix).
          const removeButtons = Array.from((wrapper as any).querySelectorAll('button[aria-label]'));
          for (const rb of removeButtons) {
            const lbl = (rb as any).getAttribute('aria-label') || '';
            const m = /^Remove\s+(.+)$/.exec(lbl);
            if (m && m[1].trim()) seen.add(m[1].trim());
          }
        }
        for (const name of expected) if (!seen.has(name)) return false;
        return true;
      },
      filenames,
      { timeout: 30000 }
    );
  } catch (error: any) {
    throw new WebAiToolError(ConsumerErrorCodes.COMMAND_TIMEOUT, "Claude attachment did not finish processing before send", { selector: "Claude visible attachment chip without upload progress", cause: error?.message || String(error) });
  }
}

async function uploadFilesInExistingPage(service: WebAiService, page: any, resolved: string[]): Promise<void> {
  if (service !== "gemini") {
    const uploadSelector = service === "chatgpt" ? "input#upload-files" : "#chat-input-file-upload-onpage";
    try {
      if (service === "claude") await page.waitForSelector?.(uploadSelector, { state: "attached", timeout: 10000 });
      await page.setInputFiles(uploadSelector, resolved, { timeout: 10000 });
    } catch (error: any) {
      if (service === "claude") {
        throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "Claude upload input was not found before file attach", { selector: uploadSelector, cause: error?.message || String(error) });
      }
      throw error;
    }
    if (service === "claude") await waitForClaudeAttachmentReadyAfterUpload(page, resolved);
    return;
  }
  // Gemini unified upload entry: Upload & tools -> Upload files menuitem.
  await openGeminiUploadToolsMenu(page, { exposeMoreTools: false });
  let chooser: any;
  try {
    [chooser] = await Promise.all([
      page.waitForEvent?.("filechooser", { timeout: 15000 }),
      requireAndClick(page, GEMINI_UPLOAD_FILES_MENUITEM_SELECTOR, "Gemini Upload files menuitem was not found"),
    ]);
  } catch (error: any) {
    if (error instanceof WebAiToolError) throw error;
    throw new WebAiToolError(ConsumerErrorCodes.COMMAND_TIMEOUT, "Gemini upload did not open a file chooser", { selector: GEMINI_UPLOAD_FILES_MENUITEM_SELECTOR, cause: error?.message || String(error) });
  }
  if (!chooser || typeof chooser.setFiles !== "function") {
    throw new WebAiToolError(ConsumerErrorCodes.COMMAND_TIMEOUT, "Gemini file chooser was not intercepted", { selector: GEMINI_UPLOAD_FILES_MENUITEM_SELECTOR });
  }
  await chooser.setFiles(resolved);
  // Material per-chip-hover affordance: Remove-file button (=GEMINI_UPLOAD_CHIP_SELECTOR)
  // is in DOM with visibility:hidden until an ancestor chip row receives hover.
  // ancestor::*[1] is GEM-ICON-BUTTON which is itself visibility:hidden (silent
  // actionability fail under Playwright). ancestor::*[2] is SPAN.gem-attachment-content
  // which is visibility:visible and IS the actual chip-row container whose
  // :hover state flips the button visibility. Confirmed via live probe
  // probe-chip-hover-level.mjs against gemini-9225 on 2026-05-20.
  // Honest convergence: hover failure routes to the same waitFor below, no fallback layer.
  const chip = page.locator?.(GEMINI_UPLOAD_CHIP_SELECTOR).first?.();
  await chip?.locator?.("xpath=ancestor::*[2]").first?.().hover?.({ timeout: 5000 }).catch?.(() => undefined);
  await chip?.waitFor?.({ state: "visible", timeout: 30000 });
  await waitForGeminiSendReadyAfterUpload(page);
}

async function sendPromptInExistingPage(service: WebAiService, args: any, page: any, started = Date.now()): Promise<Record<string, unknown>> {
  assertPromptAllowed(args.prompt);
  const timeout = args.timeout_ms || 60000;
  const completionTimeout = responseTimeoutMs(args);
  if (service === "claude") {
    if (await stableClaudeLoginRequired(page)) return loginRequiredResponse(service, page, started);
  } else if (loginRequiredForService(service, page.url?.() || "")) return loginRequiredResponse(service, page, started);
  if (service === "chatgpt" || service === "claude") await dismissPreExistingInterceptors(page);
  else await clickIfPresent(page, 'button[aria-label="Close"]');
  if (service === "gemini") await clickIfPresent(page, 'button:has-text("Not now")');
  if (loginRequiredForService(service, page.url?.() || "")) return loginRequiredResponse(service, page, started);
  const preSendFailure = await applyPreSendOptions(service, args, page, started);
  if (preSendFailure) return preSendFailure;
  const model_used = await readModelUsed(service, page, args);
  const start_chat_url = page.url?.() || targetUrlFor(service, args);
  const assistantCountBefore = await assistantCount(service, page);
  const selector = args.__promptSelector || serviceDefaults[service].promptSelector;
  const box = page.locator(selector).first();
  await box.waitFor({ state: "visible", timeout: Math.min(timeout, 15000) });
  if (loginRequiredForService(service, page.url?.() || "")) return loginRequiredResponse(service, page, started);
  await fillPromptBox(page, box, selector, args.prompt);
  const sentAt = Date.now();
  try {
    await sendPromptAndConfirmSubmitted(service, page, box, args.prompt, assistantCountBefore, Boolean(args.__forceEnterToSend));
  } catch (error: any) {
    if (error instanceof WebAiToolError && error.errorCode === ConsumerErrorCodes.COMMAND_TIMEOUT) {
      const chat_url = page.url?.() || targetUrlFor(service, args);
      return safeOutput(sendPromptBase(service, chat_url, started, {
        response_text: "",
        wait_ms: Date.now() - sentAt,
        completion_detected: false,
        errorCode: ConsumerErrorCodes.COMMAND_TIMEOUT,
        error_code: ConsumerErrorCodes.COMMAND_TIMEOUT,
        model_used,
        reuse_conversation: Boolean(args.reuse_conversation)
      }));
    }
    throw error;
  }
  if (args.__expectImageResponse) {
    // Image responses carry NO assistant text, so the text-length-gated
    // completion check never fires (the assistant turn even drops out of
    // [data-message-author-role="assistant"] during image render). The
    // authoritative completion signal for image generation is the rendered
    // image toolbar, handled by waitForGeneratedImageRendered in the caller.
    const chat_url = page.url?.() || targetUrlFor(service, args);
    return safeOutput(sendPromptBase(service, chat_url, started, {
      response_text: "",
      wait_ms: Date.now() - sentAt,
      completion_detected: true,
      errorCode: null,
      model_used,
      reuse_conversation: Boolean(args.reuse_conversation)
    }));
  }
  const wait = await waitForPromptCompletion(service, page, sentAt, assistantCountBefore, completionTimeout);
  const chat_url = page.url?.() || targetUrlFor(service, args);
  if (!wait.completion_detected) {
    return safeOutput(sendPromptBase(service, chat_url, started, {
      response_text: "",
      wait_ms: wait.wait_ms,
      completion_detected: false,
      errorCode: ConsumerErrorCodes.COMMAND_TIMEOUT,
      error_code: ConsumerErrorCodes.COMMAND_TIMEOUT,
      model_used,
      reuse_conversation: Boolean(args.reuse_conversation)
    }));
  }
  const finalText = await responseText(service, page);
  if (!finalText.trim()) {
    return safeOutput(sendPromptBase(service, chat_url, started, {
      response_text: "",
      wait_ms: wait.wait_ms,
      completion_detected: false,
      errorCode: ConsumerErrorCodes.COMMAND_TIMEOUT,
      error_code: ConsumerErrorCodes.COMMAND_TIMEOUT,
      model_used,
      reuse_conversation: Boolean(args.reuse_conversation)
    }));
  }
  const base = sendPromptBase(service, chat_url, started, {
    response_text: finalText,
    wait_ms: wait.wait_ms,
    completion_detected: true,
    errorCode: null,
    model_used,
    reuse_conversation: Boolean(args.reuse_conversation)
  });
  if (service === "chatgpt") base.reuse_conversation = Boolean(args.reuse_conversation || chat_url === start_chat_url);
  if (service === "gemini") base.reuse_conversation = Boolean(args.reuse_conversation);
  return safeOutput(base);
}

async function sendPromptOnPage(service: WebAiService, args: any, runtime: Required<BrowserToolRuntime>): Promise<Record<string, unknown>> {
  const started = Date.now();
  return withManagedPage(args, runtime, targetUrlFor(service, args), async (page) => {
    if (service === "claude") {
      const requestedClaudeUrl = normalizeUrlLikeTarget(args.url || args.tab_url_contains);
      if (requestedClaudeUrl && !pageMatchesRequestedTab(page.url?.() || "", args.url || args.tab_url_contains)) {
        await page.goto?.(requestedClaudeUrl, { waitUntil: "domcontentloaded", timeout: Math.min(args.timeout_ms || 60000, 30000) });
        await page.waitForLoadState?.("domcontentloaded", { timeout: 15000 }).catch(() => undefined);
      }
    }
    if (service === "claude" && args.incognito) {
      await page.goto?.("https://claude.ai/new?incognito=", { waitUntil: "domcontentloaded", timeout: Math.min(args.timeout_ms || 60000, 30000) });
      await page.waitForLoadState?.("domcontentloaded", { timeout: 15000 }).catch(() => undefined);
    }
    if (service === "chatgpt") await navigateChatgptFreshIfNeeded(page, args);
    if (service === "gemini") await navigateGeminiFreshIfNeeded(page, args);
    return sendPromptInExistingPage(service, args, page, started);
  });
}

async function uploadAndQueryOnPage(service: WebAiService, args: any, runtime: Required<BrowserToolRuntime>): Promise<Record<string, unknown>> {
  assertPromptAllowed(args.prompt);
  if (service === "claude" && args.files.length > 3) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "Claude upload_and_query supports at most 3 files");
  const missing = args.files.map((file: string) => path.resolve(file)).filter((file: string) => !fs.existsSync(file));
  if (missing.length) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, `upload file(s) not found: ${missing.join(", ")}`);
  const resolved = args.files.map((file: string) => path.resolve(file));
  const lease = acquireProfileLease(args.profile);
  try {
    return await withManagedPage(args, runtime, targetUrlFor(service, args), async (page) => {
      if (service === "claude") {
        const requestedClaudeUrl = normalizeUrlLikeTarget(args.url || args.tab_url_contains);
        if (requestedClaudeUrl && !pageMatchesRequestedTab(page.url?.() || "", args.url || args.tab_url_contains)) {
          await page.goto?.(requestedClaudeUrl, { waitUntil: "domcontentloaded", timeout: Math.min(args.timeout_ms || 60000, 30000) });
          await page.waitForLoadState?.("domcontentloaded", { timeout: 15000 }).catch(() => undefined);
        }
        await navigateClaudeFreshIfNeeded(page, args);
      }
      if (service === "chatgpt") await navigateChatgptFreshIfNeeded(page, args);
      if (loginRequiredForService(service, page.url?.() || "")) return loginRequiredResponse(service, page, Date.now());
      if (service === "gemini") await clickIfPresent(page, 'button:has-text("Got it"), button:has-text("Agree")');
      if (loginRequiredForService(service, page.url?.() || "")) return loginRequiredResponse(service, page, Date.now());
      try {
        await uploadFilesInExistingPage(service, page, resolved);
      } catch (error: any) {
        if (error instanceof WebAiToolError) return safeOutput({ ok: false, files_in_chip: [], errorCode: error.errorCode, error_code: error.errorCode, selector: error.evidence?.selector || null, expected_selector: error.evidence?.selector || null, response_text: "", wait_ms: 0, completion_detected: false, chat_url: page.url?.() || null });
        throw error;
      }
      const response = await sendPromptInExistingPage(service, args, page, Date.now());
      const names = resolved.map((file: string) => path.basename(file));
      const completion = {
        response_text: response.response_text || "",
        wait_ms: Number(response.wait_ms || 0),
        completion_detected: Boolean(response.completion_detected),
        errorCode: response.errorCode || null,
        ...(response.error_code ? { error_code: response.error_code } : {})
      };
      if (service === "chatgpt") return safeOutput({ conversation_id: response.conversation_id || null, attachment_names: names, ...completion });
      if (service === "claude") return safeOutput({ files_uploaded_count: names.length, attachment_names: names, chat_url: response.chat_url || null, ...completion });
      return safeOutput({ files_in_chip: names, chat_url: response.chat_url || null, ...completion });
    });
  } finally { releaseProfileLease(args.profile, lease); }
}

async function artifactClickResultToSafeOutput(result: any, extra: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  const artifactPath = result.path || result.savedPath || "";
  const stat = artifactPath && fs.existsSync(artifactPath) ? fs.statSync(artifactPath) : undefined;
  return safeOutput({
    path: artifactPath,
    sha256: result.sha256 || (artifactPath && fs.existsSync(artifactPath) ? sha256File(artifactPath) : ""),
    size_bytes: result.size_bytes ?? result.sizeBytes ?? result.size ?? stat?.size ?? 0,
    download_filename: result.downloadFilename || (artifactPath ? path.basename(artifactPath) : ""),
    ...(result.warn ? { WARN: result.warn } : {}),
    ...extra,
    errorCode: null
  });
}

function imageErrorOutput(errorCode: ConsumerErrorCode, message: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return safeOutput({
    path: "",
    sha256: "",
    size_bytes: 0,
    dimensions: null,
    download_filename: "",
    errorCode,
    error_code: errorCode,
    message,
    ...extra
  });
}

function videoErrorOutput(errorCode: ConsumerErrorCode, message: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return safeOutput({
    path: "",
    sha256: "",
    size_bytes: 0,
    download_filename: "",
    errorCode,
    error_code: errorCode,
    message,
    ...extra
  });
}

function fileErrorOutput(errorCode: ConsumerErrorCode, message: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return safeOutput({
    path: "",
    sha256: "",
    size_bytes: 0,
    artifact_name: "",
    download_filename: "",
    errorCode,
    error_code: errorCode,
    message,
    ...extra
  });
}

function isArtifactDownloadControlMissing(error: any): boolean {
  const code = error?.errorCode || error?.code;
  const message = errorMessageFromUnknown(error, "");
  return code === ConsumerErrorCodes.ELEMENT_NOT_FOUND
    || /No element matched --button-selector|button-selector|download control.*not found/i.test(message);
}

function generatedFileDownloadTimeoutError(service: "ChatGPT" | "Claude", error: any, selector: string, timeoutMs: number): WebAiToolError {
  return new WebAiToolError(
    ConsumerErrorCodes.ARTIFACT_DOWNLOAD_TIMEOUT,
    `${service} generated file download control did not appear before timeout`,
    {
      ...(error?.evidence && typeof error.evidence === "object" ? error.evidence : {}),
      selector,
      timeoutMs
    }
  );
}

function extensionHttpBridgeUrlForArgs(args: any): string {
  return process.env.CHROME_EXTENSION_HTTP_BRIDGE_URL
    || args.http_bridge_url
    || defaultHttpBridgeUrlForProfile(args.profile);
}

function extensionErrorCode(error: any, fallback: ConsumerErrorCode = ConsumerErrorCodes.CHROME_EXTENSION_NOT_CONNECTED): ConsumerErrorCode {
  return isConsumerErrorCode(error?.errorCode) ? error.errorCode : fallback;
}

function webAiExtensionErrorCode(error: any): ConsumerErrorCode {
  if (isConsumerErrorCode(error?.errorCode)) return error.errorCode;
  if (isConsumerErrorCode(error?.code)) return error.code;
  const message = errorMessageFromUnknown(error, "");
  if (/timeout|timed out/i.test(message)) return ConsumerErrorCodes.COMMAND_TIMEOUT;
  if (/selector|element|not found/i.test(message)) return ConsumerErrorCodes.ELEMENT_NOT_FOUND;
  return classifyChromeExtensionBridgeError(error);
}

function sendPromptExtensionErrorOutput(service: WebAiService, args: any, started: number, error: any, extra: Record<string, unknown> = {}): Record<string, unknown> {
  const errorCode = extensionErrorCode(error, ConsumerErrorCodes.COMMAND_TIMEOUT);
  return safeOutput(sendPromptBase(service, targetUrlFor(service, args || {}), started, {
    ok: false,
    service,
    response_text: "",
    wait_ms: 0,
    completion_detected: false,
    errorCode,
    error_code: errorCode,
    message: errorMessageFromUnknown(error, errorCode),
    ...extra
  }));
}

async function openChatgptExtensionPage(backend: any, args: any): Promise<any> {
  const requested = args.url || args.tab_url_contains;
  const requestedUrl = normalizeUrlLikeTarget(requested);
  let page: any;
  if (args.reuse_conversation || requested) {
    try {
      page = await backend.claimTab({ url: requested || serviceDefaults.chatgpt.url, profile: args.profile });
    } catch (error: any) {
      if (!requestedUrl || !/No extension-assisted browser tab is available to claim/i.test(errorMessageFromUnknown(error, ""))) throw error;
      page = await backend.newTab({ url: requestedUrl, profile: args.profile, background: false });
    }
  } else {
    page = await backend.newTab({ url: CHATGPT_FRESH_URL, profile: args.profile, background: false });
  }
  if (requestedUrl) {
    await page.navigate(requestedUrl, { waitUntil: "domcontentloaded", timeoutMs: Math.min(args.timeout_ms || 60000, 30000) });
  } else if (!args.reuse_conversation && !requested) {
    await page.navigate(CHATGPT_FRESH_URL, { waitUntil: "load", timeoutMs: Math.min(args.timeout_ms || 60000, 30000) });
  }
  return page;
}

async function extensionGeminiPage(args: any, backend: any, freshUrl = GEMINI_FRESH_COMPOSER_URL): Promise<any> {
  const requested = args.url || args.tab_url_contains;
  const requestedUrl = normalizeUrlLikeTarget(requested);
  let page: any;
  if (args.reuse_conversation || requested) {
    try {
      page = await backend.claimTab({ url: requested || serviceDefaults.gemini.url });
    } catch (error: any) {
      if (!requestedUrl || !/No extension-assisted browser tab is available to claim/i.test(errorMessageFromUnknown(error, ""))) throw error;
      page = await backend.newTab({ url: requestedUrl, profile: args.profile, background: false });
    }
  } else {
    page = await backend.newTab({ url: freshUrl, profile: args.profile, background: false });
  }
  if (requestedUrl) {
    await page.navigate(requestedUrl, { waitUntil: "domcontentloaded", timeoutMs: Math.min(args.timeout_ms || 60000, 30000) });
  } else if (!args.reuse_conversation && !requested) {
    await page.navigate(freshUrl, { waitUntil: "domcontentloaded", timeoutMs: Math.min(args.timeout_ms || 60000, 30000) });
  }
  return page;
}

function errorMessageFromUnknown(error: any, fallback: string): string {
  if (!error) return fallback;
  if (typeof error.message === "string" && error.message.trim()) return error.message;
  if (typeof error.error === "string" && error.error.trim()) return error.error;
  if (typeof error === "string" && error.trim()) return error;
  try { return JSON.stringify(error); } catch { return String(error); }
}

function claudeExtensionErrorCode(error: any): ConsumerErrorCode {
  if (isConsumerErrorCode(error?.errorCode)) return error.errorCode;
  if (isConsumerErrorCode(error?.code)) return error.code;
  const message = errorMessageFromUnknown(error, "");
  if (/timeout|timed out/i.test(message)) return ConsumerErrorCodes.COMMAND_TIMEOUT;
  if (/selector|element|not found/i.test(message)) return ConsumerErrorCodes.ELEMENT_NOT_FOUND;
  return classifyChromeExtensionBridgeError(error);
}

function claudeSendExtensionErrorOutput(args: any, started: number, error: any, extra: Record<string, unknown> = {}): Record<string, unknown> {
  const errorCode = claudeExtensionErrorCode(error);
  return safeOutput(sendPromptBase("claude", targetUrlFor("claude", args || {}), started, {
    ok: false,
    service: "claude",
    response_text: "",
    wait_ms: 0,
    completion_detected: false,
    errorCode,
    error_code: errorCode,
    message: errorMessageFromUnknown(error, errorCode),
    ...extra
  }));
}

function claudeUploadExtensionErrorOutput(args: any, error: any, extra: Record<string, unknown> = {}): Record<string, unknown> {
  const errorCode = claudeExtensionErrorCode(error);
  return safeOutput({
    ok: false,
    files_uploaded_count: 0,
    attachment_names: [],
    chat_url: targetUrlFor("claude", args || {}),
    response_text: "",
    wait_ms: 0,
    completion_detected: false,
    errorCode,
    error_code: errorCode,
    message: errorMessageFromUnknown(error, errorCode),
    ...extra
  });
}

function uploadExtensionErrorOutput(service: "chatgpt" | "gemini", args: any, error: any, extra: Record<string, unknown> = {}): Record<string, unknown> {
  const errorCode = webAiExtensionErrorCode(error);
  const base = {
    ok: false,
    response_text: "",
    wait_ms: 0,
    completion_detected: false,
    errorCode,
    error_code: errorCode,
    message: errorMessageFromUnknown(error, errorCode),
    ...extra
  };
  if (service === "chatgpt") {
    return safeOutput({
      conversation_id: null,
      attachment_names: [],
      ...base
    });
  }
  return safeOutput({
    files_in_chip: [],
    chat_url: targetUrlFor("gemini", args || {}),
    ...base
  });
}

function claudeExtensionHttpBridgeUrl(args: any): string {
  return process.env.CHROME_EXTENSION_HTTP_BRIDGE_URL || args?.http_bridge_url || defaultHttpBridgeUrlForProfile(args?.profile);
}

function extensionTarget(selector: string): { selector: string; selectorType?: "xpath" } {
  return selector.startsWith("xpath=")
    ? { selector: selector.slice("xpath=".length), selectorType: "xpath" }
    : { selector };
}

async function extensionClick(page: any, selector: string, timeoutMs = 5000): Promise<void> {
  await page.click(extensionTarget(selector), { timeoutMs });
}

async function extensionTextSnapshot(page: any, selector?: string): Promise<{ url: string; title?: string; text: string }> {
  try {
    return await page.textSnapshot(selector ? { selector } : undefined);
  } catch {
    return await page.textSnapshot();
  }
}

async function extensionSleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function extensionSelectorAlternatives(selector: string): string[] {
  return selector.split(/\s*,\s*/).map((item) => item.trim()).filter(Boolean);
}

async function waitForExtensionSelector(page: any, selector: string, timeoutMs: number, message: string): Promise<void> {
  let lastError: any;
  for (const candidate of extensionSelectorAlternatives(selector)) {
    try {
      await page.waitForSelector(candidate, { state: "visible", timeoutMs });
      return;
    } catch (error) {
      lastError = error;
    }
  }
  throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, message, { selector, cause: errorMessageFromUnknown(lastError, "") });
}

function normalizedExpectedExtension(value: unknown): string {
  return String(value || "").trim().toLowerCase().replace(/^\.+/, "");
}

const CHATGPT_PPTX_ZIP_BUNDLE_INSTRUCTION = [
  "Create the requested PowerPoint presentation as a real .pptx file.",
  "Also create a supporting summary.md file.",
  "Bundle the .pptx and summary.md together into one .zip archive.",
  "Return exactly one inline download link/file-delivery button for the .zip archive."
].join(" ");

function chatgptPptxZipBundlePrompt(prompt: string): string {
  const base = String(prompt || "").trim();
  return `${base}\n\nDriver requirement: ${CHATGPT_PPTX_ZIP_BUNDLE_INSTRUCTION}`;
}

interface ZipCentralDirectoryEntry {
  name: string;
  flags: number;
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
}

function zipVerificationError(message: string, extra: Record<string, unknown> = {}): WebAiToolError {
  return new WebAiToolError(ConsumerErrorCodes.ARTIFACT_VERIFICATION_FAILED, message, extra);
}

function findZipEndOfCentralDirectory(buffer: any): number {
  const minOffset = Math.max(0, buffer.length - 65557);
  for (let offset = buffer.length - 22; offset >= minOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) return offset;
  }
  return -1;
}

function readZipCentralDirectoryEntries(buffer: any): ZipCentralDirectoryEntry[] {
  const eocdOffset = findZipEndOfCentralDirectory(buffer);
  if (eocdOffset < 0) throw zipVerificationError("Downloaded ZIP archive is missing an end-of-central-directory record");
  const totalEntries = buffer.readUInt16LE(eocdOffset + 10);
  const centralDirectorySize = buffer.readUInt32LE(eocdOffset + 12);
  const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16);
  if (totalEntries === 0xffff || centralDirectorySize === 0xffffffff || centralDirectoryOffset === 0xffffffff) {
    throw zipVerificationError("ZIP64 archives are not supported for PPTX bundle extraction");
  }
  const centralDirectoryEnd = centralDirectoryOffset + centralDirectorySize;
  if (centralDirectoryOffset < 0 || centralDirectoryEnd > buffer.length) {
    throw zipVerificationError("ZIP central directory points outside the downloaded archive", { centralDirectoryOffset, centralDirectorySize, byteSize: buffer.length });
  }
  const entries: ZipCentralDirectoryEntry[] = [];
  let offset = centralDirectoryOffset;
  while (offset < centralDirectoryEnd) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== 0x02014b50) {
      throw zipVerificationError("ZIP central directory entry is malformed", { offset });
    }
    const flags = buffer.readUInt16LE(offset + 8);
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const nameStart = offset + 46;
    const nameEnd = nameStart + nameLength;
    if (nameEnd > buffer.length) throw zipVerificationError("ZIP entry name points outside the downloaded archive", { offset });
    entries.push({
      name: buffer.toString("utf8", nameStart, nameEnd),
      flags,
      method,
      compressedSize,
      uncompressedSize,
      localHeaderOffset
    });
    offset = nameEnd + extraLength + commentLength;
  }
  return entries;
}

function extractZipEntryBytes(buffer: any, entry: ZipCentralDirectoryEntry): any {
  if ((entry.flags & 0x1) !== 0) throw zipVerificationError("ZIP entry is encrypted and cannot be extracted", { entry: entry.name });
  const localOffset = entry.localHeaderOffset;
  if (localOffset + 30 > buffer.length || buffer.readUInt32LE(localOffset) !== 0x04034b50) {
    throw zipVerificationError("ZIP local file header is malformed", { entry: entry.name, localHeaderOffset: localOffset });
  }
  const nameLength = buffer.readUInt16LE(localOffset + 26);
  const extraLength = buffer.readUInt16LE(localOffset + 28);
  const dataStart = localOffset + 30 + nameLength + extraLength;
  const dataEnd = dataStart + entry.compressedSize;
  if (dataStart < 0 || dataEnd > buffer.length) {
    throw zipVerificationError("ZIP entry payload points outside the downloaded archive", { entry: entry.name, dataStart, compressedSize: entry.compressedSize, byteSize: buffer.length });
  }
  const payload = buffer.subarray(dataStart, dataEnd);
  if (entry.method === 0) return Buffer.from(payload);
  if (entry.method === 8) {
    try {
      return zlib.inflateRawSync(payload);
    } catch (error: any) {
      throw zipVerificationError("ZIP entry deflate payload could not be decompressed", { entry: entry.name, cause: errorMessageFromUnknown(error, "") });
    }
  }
  throw zipVerificationError("ZIP entry uses an unsupported compression method", { entry: entry.name, method: entry.method });
}

function isValidPptxArchiveBytes(buffer: any): boolean {
  try {
    const names = new Set(readZipCentralDirectoryEntries(buffer).map((entry) => entry.name.replace(/\\/g, "/").toLowerCase()));
    return names.has("[content_types].xml") && names.has("ppt/presentation.xml");
  } catch {
    return false;
  }
}

function extractPptxFromZipBundle(zipPath: string, downloadDir: string): { path: string; entryName: string; byteSize: number; sha256: string } {
  const archive = fs.readFileSync(zipPath);
  const entries = readZipCentralDirectoryEntries(archive);
  const pptxEntries = entries
    .filter((entry) => {
      const normalized = entry.name.replace(/\\/g, "/");
      return /\.pptx$/i.test(normalized) && !normalized.endsWith("/") && !normalized.includes("__MACOSX/");
    })
    .sort((a, b) => b.uncompressedSize - a.uncompressedSize);
  if (!pptxEntries.length) {
    throw zipVerificationError("Downloaded ZIP bundle did not contain a .pptx entry", { zipPath, entries: entries.map((entry) => entry.name).slice(0, 50) });
  }
  const entry = pptxEntries[0];
  const bytes = extractZipEntryBytes(archive, entry);
  if (!bytes.length || !isValidPptxArchiveBytes(bytes)) {
    throw zipVerificationError("Extracted .pptx entry failed OOXML presentation validation", { zipPath, entry: entry.name, byteSize: bytes.length });
  }
  const rawBase = entry.name.replace(/\\/g, "/").split("/").filter(Boolean).pop() || "chatgpt-generated.pptx";
  const safeBase = safeDownloadedBasename(rawBase, "chatgpt-generated.pptx");
  const outputBase = /\.pptx$/i.test(safeBase) ? safeBase : `${safeBase}.pptx`;
  const outputPath = path.join(path.resolve(downloadDir), outputBase);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, bytes);
  return { path: outputPath, entryName: entry.name, byteSize: bytes.length, sha256: crypto.createHash("sha256").update(bytes).digest("hex") };
}

interface ChatgptGeneratedFileDownloadShape {
  shape: "chip" | "inline";
  buttonSelector: string;
  buttonAncestorText?: string;
}

async function chatgptGeneratedFileChipCountWithExtension(page: any, expectedExtension: string): Promise<number> {
  const extension = normalizedExpectedExtension(expectedExtension);
  if (!extension) return 0;
  const count = await page.evaluateReadOnly(`((arg) => {
  const ext = String(arg.extension || '').toLowerCase();
  const clean = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
  return Array.from(document.querySelectorAll('[data-message-author-role="assistant"] div.border-b, [data-message-author-role="assistant"] div.flex.flex-row.justify-between'))
    .filter((chip) => {
      const name = clean(chip.querySelector('div.truncate.text-sm.font-medium')?.textContent || '');
      if (!name.toLowerCase().endsWith('.' + ext)) return false;
      const cluster = chip.querySelector('div.items-center.gap-1');
      return !!cluster && cluster.querySelectorAll('button').length >= 1;
    }).length;
})(arg)`, { extension });
  return Number.isFinite(Number(count)) ? Number(count) : 0;
}

async function waitForChatgptGeneratedFileDownloadShapeWithExtension(page: any, expectedExtension: string, timeoutMs: number): Promise<ChatgptGeneratedFileDownloadShape> {
  const extension = normalizedExpectedExtension(expectedExtension);
  const chipBudgetMs = ["pptx", "docx"].includes(extension)
    ? Math.min(Math.max(1, timeoutMs), extension === "pptx" ? 120000 : 45000)
    : Math.min(Math.max(1, timeoutMs), 5000);
  const chipDeadline = Date.now() + chipBudgetMs;
  while (Date.now() <= chipDeadline) {
    if (await chatgptGeneratedFileChipCountWithExtension(page, extension).catch(() => 0)) {
      await extensionSleep(5000);
      return {
        shape: "chip",
        buttonSelector: CHATGPT_GENERATED_FILE_CHIP_DOWNLOAD_SELECTOR,
        buttonAncestorText: `.${extension}`
      };
    }
    await extensionSleep(Math.min(500, Math.max(1, chipDeadline - Date.now())));
  }

  const inlineTimeoutMs = Math.max(1, timeoutMs - chipBudgetMs);
  try {
    await waitForExtensionSelector(page, CHATGPT_GENERATED_FILE_INLINE_READY_SELECTOR, inlineTimeoutMs, "ChatGPT inline generated file download control was not found after response completion");
    await extensionSleep(5000);
    return {
      shape: "inline",
      buttonSelector: CHATGPT_GENERATED_FILE_INLINE_DOWNLOAD_SELECTOR
    };
  } catch (error: any) {
    throw new WebAiToolError(
      ConsumerErrorCodes.ELEMENT_NOT_FOUND,
      "ChatGPT generated file chip/link was not found after response completion",
      { selector: `${CHATGPT_GENERATED_FILE_CHIP_DOWNLOAD_SELECTOR} OR ${CHATGPT_GENERATED_FILE_INLINE_READY_SELECTOR}`, cause: errorMessageFromUnknown(error, "") }
    );
  }
}

async function clickExtensionSelector(page: any, selector: string, timeoutMs: number, message: string): Promise<void> {
  let lastError: any;
  for (const candidate of extensionSelectorAlternatives(selector)) {
    try {
      await page.waitForSelector(candidate, { state: "visible", timeoutMs: Math.min(timeoutMs, 5000) });
      await page.click(extensionTarget(candidate), { timeoutMs });
      return;
    } catch (error) {
      lastError = error;
    }
  }
  throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, message, { selector, cause: errorMessageFromUnknown(lastError, "") });
}

async function extensionElementCount(page: any, selector: string): Promise<number> {
  let count = 0;
  for (const candidate of extensionSelectorAlternatives(selector)) {
    count += (await page.queryElements(candidate, { limit: 50 }).catch(() => [])).length;
  }
  return count;
}

async function chatgptDispatchClickWithJavascript(page: any, selectors: string[], timeoutMs: number): Promise<void> {
  if (typeof page?.javascript !== "function") {
    throw new Error("extension page does not expose mutating javascript");
  }
  await page.javascript(`
const arg = ${JSON.stringify({ selectors, timeoutMs })};
const clean = (value) => String(value || '').trim();
const parseHasText = (raw) => {
  raw = String(raw || '');
  const token = ':has-text(';
  const idx = raw.lastIndexOf(token);
  if (idx < 0 || !raw.endsWith(')')) return { base: raw, text: null };
  const base = clean(raw.slice(0, idx)) || '*';
  let text = raw.slice(idx + token.length, -1).trim();
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    text = text.slice(1, -1);
  }
  return { base, text: clean(text).toLowerCase() };
};
const visible = (el) => {
  if (!el) return false;
  const style = window.getComputedStyle(el);
  const rect = el.getBoundingClientRect();
  return !!style && style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
};
const actionable = (el) => visible(el) && el.getAttribute('aria-disabled') !== 'true' && !(el instanceof HTMLButtonElement && el.disabled);
const xpathNodes = (raw) => {
  const xpath = String(raw).slice('xpath='.length);
  const snapshot = document.evaluate(xpath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
  const nodes = [];
  for (let i = 0; i < snapshot.snapshotLength; i += 1) {
    const node = snapshot.snapshotItem(i);
    if (node instanceof Element) nodes.push(node);
  }
  return nodes;
};
const cssNodes = (raw) => {
  const { base, text } = parseHasText(raw);
  const nodes = Array.from(document.querySelectorAll(base));
  if (text === null) return nodes;
  return nodes.filter((el) => clean(el.innerText || el.textContent).toLowerCase().includes(text));
};
const candidates = () => {
  for (const raw of arg.selectors || []) {
    let nodes = [];
    try { nodes = String(raw).startsWith('xpath=') ? xpathNodes(raw) : cssNodes(raw); } catch (_) { nodes = []; }
    const target = nodes.find(actionable);
    if (target) return { target, selector: raw };
  }
  return null;
};
const dispatchClick = (target) => {
  target.scrollIntoView({ block: 'center', inline: 'center' });
  try { target.focus({ preventScroll: true }); } catch (_) {}
  const rect = target.getBoundingClientRect();
  const x = rect.left + Math.max(1, rect.width / 2);
  const y = rect.top + Math.max(1, rect.height / 2);
  const mouse = { bubbles: true, cancelable: true, view: window, button: 0, buttons: 1, clientX: x, clientY: y };
  const mouseUp = { bubbles: true, cancelable: true, view: window, button: 0, buttons: 0, clientX: x, clientY: y };
  const pointer = { ...mouse, pointerId: 1, pointerType: 'mouse', isPrimary: true };
  const pointerUp = { ...mouseUp, pointerId: 1, pointerType: 'mouse', isPrimary: true };
  if (typeof PointerEvent === 'function') target.dispatchEvent(new PointerEvent('pointerover', pointer));
  target.dispatchEvent(new MouseEvent('mouseover', mouse));
  if (typeof PointerEvent === 'function') target.dispatchEvent(new PointerEvent('pointerdown', pointer));
  target.dispatchEvent(new MouseEvent('mousedown', mouse));
  if (typeof PointerEvent === 'function') target.dispatchEvent(new PointerEvent('pointerup', pointerUp));
  target.dispatchEvent(new MouseEvent('mouseup', mouseUp));
  target.dispatchEvent(new MouseEvent('click', mouseUp));
};
const deadline = Date.now() + Math.max(1, Number(arg.timeoutMs || 5000));
let found = null;
while (Date.now() <= deadline) {
  found = candidates();
  if (found && actionable(found.target)) break;
  await new Promise((resolve) => setTimeout(resolve, 100));
}
if (!found || !actionable(found.target)) {
  throw new Error('ChatGPT extension selector not visible: ' + (arg.selectors || []).join(' | '));
}
dispatchClick(found.target);
return { clicked: true, selector: found.selector, text: clean(found.target.innerText || found.target.textContent), ariaExpanded: found.target.getAttribute('aria-expanded') };
`, timeoutMs);
}

async function clickChatgptExtensionSelector(page: any, selector: string, timeoutMs: number, message: string): Promise<void> {
  const selectors = extensionSelectorAlternatives(selector);
  if (typeof page?.javascript === "function") {
    try {
      await chatgptDispatchClickWithJavascript(page, selectors, timeoutMs);
      return;
    } catch (error: any) {
      throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, message, { selector, cause: errorMessageFromUnknown(error, "") });
    }
  }
  await clickExtensionSelector(page, selector, timeoutMs, message);
}

async function clickExtensionSelectorWithJavascript(page: any, selector: string, timeoutMs: number, message: string): Promise<void> {
  const selectors = extensionSelectorAlternatives(selector);
  if (typeof page?.javascript !== "function") return clickExtensionSelector(page, selector, timeoutMs, message);
  try {
    await chatgptDispatchClickWithJavascript(page, selectors, timeoutMs);
  } catch (error: any) {
    throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, message, { selector, cause: errorMessageFromUnknown(error, "") });
  }
}

async function withProfileCdpPage<T>(
  runtime: Required<BrowserToolRuntime>,
  profile: string,
  matches: (url: string) => boolean,
  fn: (page: any, browser: any) => Promise<T>
): Promise<T> {
  const status = await runtime.launcher.status(profile);
  if (!status.connected) throw new WebAiToolError(ConsumerErrorCodes.BROWSER_NOT_LAUNCHED, `CDP endpoint is not connected for profile ${profile}`, { profile, cdpEndpoint: status.cdpEndpoint, lastError: status.lastError });
  const browser = await runtime.launcher.connectOverCdp(status);
  try {
    const pages = browser.contexts().flatMap((context: any) => context.pages());
    const page = pages.find((candidate: any) => matches(String(candidate.url?.() || ""))) || pages[0];
    if (!page) throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, `No CDP page matched profile ${profile}`);
    await page.bringToFront?.().catch?.(() => undefined);
    return await fn(page, browser);
  } finally {
    await browser?.close?.().catch?.(() => undefined);
  }
}

async function selectChatgptModelWithExtension(page: any, expected: string): Promise<void> {
  const itemSelector = chatgptMenuItemSelectorForModel(expected);
  if (!(await extensionElementCount(page, itemSelector))) {
    await clickChatgptExtensionSelector(page, CHATGPT_MODEL_BUTTON_SELECTOR, 5000, "ChatGPT model selector was not found");
  }
  await clickChatgptExtensionSelector(page, itemSelector, 8000, `ChatGPT model option was not found: ${expected}`);
}

async function enableChatgptWebSearchWithExtension(page: any): Promise<void> {
  if (await extensionElementCount(page, CHATGPT_WEB_SEARCH_ACTIVE_SELECTOR)) return;
  if (!(await extensionElementCount(page, CHATGPT_WEB_SEARCH_MENUITEM_SELECTOR))) {
    await clickChatgptExtensionSelector(page, CHATGPT_IMAGE_MENU_BUTTON_SELECTOR, 5000, "ChatGPT composer plus menu button was not found");
  }
  await clickChatgptExtensionSelector(page, CHATGPT_WEB_SEARCH_MENUITEM_SELECTOR, 8000, "ChatGPT Web search menuitemradio was not found");
  await waitForExtensionSelector(page, CHATGPT_WEB_SEARCH_ACTIVE_SELECTOR, 8000, "ChatGPT Web search mode did not expose its active pill");
}

async function selectGeminiModelWithExtension(page: any, expected: string): Promise<void> {
  await selectGeminiModelOption(page, expected, 8000);
}

async function selectGeminiThinkingLevelWithExtension(page: any, thinkingLevel: string): Promise<void> {
  await clickExtensionSelector(page, GEMINI_MODE_PICKER_SELECTOR, 5000, "Gemini mode picker trigger was not found");
  await clickExtensionSelector(page, GEMINI_THINKING_EXPANDER_SELECTOR, 8000, "Gemini Thinking level expander was not found");
  const selector = GEMINI_THINKING_OPTION_TEMPLATES[thinkingLevel];
  await clickExtensionSelector(page, selector, 8000, `Gemini thinking_level option ${thinkingLevel} not found`);
}

async function enableGeminiWebSearchWithExtension(page: any): Promise<void> {
  await clickExtensionSelector(page, GEMINI_UPLOAD_TOOLS_TRIGGER_SELECTOR, 15000, "Gemini Upload & tools button was not found");
  if (await extensionElementCount(page, GEMINI_WEB_SEARCH_MENUITEM_SELECTOR)) {
    await clickExtensionSelector(page, GEMINI_WEB_SEARCH_MENUITEM_SELECTOR, 8000, "Gemini Google Search menuitemcheckbox was not found");
    return;
  }
  await clickExtensionSelector(page, GEMINI_MORE_TOOLS_SUBMENU_SELECTOR, 3000, "Gemini More tools button was not found").catch(() => undefined);
  if (await extensionElementCount(page, GEMINI_WEB_SEARCH_MENUITEM_SELECTOR)) {
    await clickExtensionSelector(page, GEMINI_WEB_SEARCH_MENUITEM_SELECTOR, 8000, "Gemini Google Search menuitemcheckbox was not found");
    return;
  }
  await dismissGeminiOverlay(page);
  throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "Gemini Web Search toggle was not found in the live-probed Upload & tools menus", { selector: GEMINI_WEB_SEARCH_MENUITEM_SELECTOR });
}

async function applyExtensionPreSendOptions(service: "chatgpt" | "gemini", args: any, page: any): Promise<void> {
  if (service === "chatgpt") {
    const explicitModel = typeof args.model === "string" && args.model.trim();
    const expected = explicitModel ? normalizeModelTier(service, args) : (args.thinking ? "Thinking" : null);
    if (expected) await selectChatgptModelWithExtension(page, expected);
    if (args.web_search) await enableChatgptWebSearchWithExtension(page);
    if (args.canvas && typeof args.prompt === "string" && !/^\s*use canvas to write\b/i.test(args.prompt)) args.prompt = `Use canvas to write ${args.prompt}`;
    return;
  }
  const expected = normalizeModelTier(service, args);
  if (expected) await selectGeminiModelWithExtension(page, expected);
  if (args.thinking) await selectGeminiThinkingLevelWithExtension(page, "extended");
  if (args.web_search) await enableGeminiWebSearchWithExtension(page);
}

type ExtensionPromptState = {
  url: string;
  assistantCount: number;
  latestText: string;
  stopVisible: boolean;
  doneVisible: boolean;
};

async function extensionPromptState(page: any, service: "chatgpt" | "gemini"): Promise<ExtensionPromptState> {
  return await page.evaluateReadOnly(`((arg) => {
    const qsa = (selector) => {
      try { return Array.from(document.querySelectorAll(selector)); } catch (_) { return []; }
    };
    const visible = (el) => {
      if (!el) return false;
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style && style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
    };
    const clean = (text) => String(text || '')
      .replace(/^\\s*Show thinking\\s*/i, '')
      .replace(/^\\s*Gemini said\\s*/i, '')
      .replace(/\\s*Sources\\s*$/i, '')
      .trim();
    const turns = qsa(arg.latestSelector || arg.assistantSelector);
    const latest = turns.length ? turns[turns.length - 1] : null;
    let latestText = '';
    if (latest && Array.isArray(arg.innerSelectors)) {
      for (let i = 0; i < arg.innerSelectors.length; i += 1) {
        const node = latest.querySelector(arg.innerSelectors[i]);
        const text = clean(node && node.textContent);
        if (text) { latestText = text; break; }
      }
    }
    if (!latestText) latestText = clean(latest && latest.textContent);
    return {
      url: location.href,
      assistantCount: turns.length,
      latestText,
      stopVisible: qsa(arg.stopSelector).some(visible),
      doneVisible: arg.doneSelector ? qsa(arg.doneSelector).some(visible) : false
    };
  })(arg)`, {
    assistantSelector: assistantMessageSelector(service),
    latestSelector: service === "gemini" ? GEMINI_LATEST_RESPONSE_SELECTOR : assistantMessageSelector(service),
    innerSelectors: service === "gemini" ? GEMINI_RESPONSE_TEXT_INNER_SELECTORS : [],
    stopSelector: stopButtonSelector(service),
    doneSelector: service === "gemini" ? GEMINI_REGENERATE_BUTTON_SELECTOR : ""
  }) as ExtensionPromptState;
}

async function waitForExtensionPromptCompletion(page: any, service: "chatgpt" | "gemini", assistantCountBefore: number, timeoutMs: number): Promise<{ completion_detected: boolean; wait_ms: number; response_text: string; chat_url: string }> {
  const started = Date.now();
  const deadline = started + Math.max(1, timeoutMs);
  let generationStarted = false;
  let lastText = "";
  let stableSince = 0;
  let latest: ExtensionPromptState = { url: serviceDefaults[service].url, assistantCount: assistantCountBefore, latestText: "", stopVisible: false, doneVisible: false };

  while (Date.now() <= deadline) {
    latest = await extensionPromptState(page, service).catch(() => latest);
    generationStarted = generationStarted || latest.stopVisible || latest.assistantCount > assistantCountBefore;
    if (generationStarted && latest.latestText) {
      if (latest.latestText === lastText) {
        if (!stableSince) stableSince = Date.now();
      } else {
        lastText = latest.latestText;
        stableSince = Date.now();
      }
      const stable = Date.now() - stableSince >= 1500;
      const done = service === "gemini" ? latest.doneVisible || (!latest.stopVisible && stable) : !latest.stopVisible && stable;
      if (done) return { completion_detected: true, wait_ms: Date.now() - started, response_text: latest.latestText, chat_url: latest.url || serviceDefaults[service].url };
    }
    await extensionSleep(500);
  }

  return { completion_detected: false, wait_ms: Date.now() - started, response_text: latest.latestText || "", chat_url: latest.url || serviceDefaults[service].url };
}

async function sendPromptInExtensionPage(service: "chatgpt" | "gemini", args: any, page: any, started = Date.now()): Promise<Record<string, unknown>> {
  assertPromptAllowed(args.prompt);
  const timeout = args.timeout_ms || 60000;
  const completionTimeout = responseTimeoutMs(args);
  const snapshot = await extensionTextSnapshot(page).catch(() => ({ url: targetUrlFor(service, args), text: "" }));
  if (loginRequiredForService(service, snapshot.url || "")) {
    return safeOutput(sendPromptBase(service, snapshot.url || targetUrlFor(service, args), started, {
      ok: false,
      service,
      errorCode: ConsumerErrorCodes.LOGIN_REQUIRED,
      error_code: ConsumerErrorCodes.LOGIN_REQUIRED
    }));
  }
  if (service === "chatgpt") {
    const currentUrl = snapshot.url || targetUrlFor(service, args);
    if (isChatgptCustomGptUrl(currentUrl) || isChatgptCustomGptUrl(targetUrlFor(service, args))) {
      return chatgptCustomGptUnsupportedOutput(args, started, currentUrl);
    }
  }

  if (service === "gemini") {
    await clickExtensionSelector(page, 'button:has-text("Not now")', 1000, "Gemini optional dialog was not found").catch(() => undefined);
  }
  await applyExtensionPreSendOptions(service, args, page);

  const selector = args.__promptSelector || serviceDefaults[service].promptSelector;
  await waitForExtensionSelector(page, selector, Math.min(timeout, 15000), `${service} prompt composer was not found`);
  const before = await extensionPromptState(page, service).catch(() => ({
    url: snapshot.url || targetUrlFor(service, args),
    assistantCount: 0,
    latestText: "",
    stopVisible: false,
    doneVisible: false
  }));
  await page.fill({ selector }, args.prompt, { timeoutMs: Math.min(timeout, 15000) });
  await extensionSleep(service === "gemini" ? GEMINI_SEND_BUTTON_HYDRATION_WAIT_MS : 250);
  const sendSelector = sendButtonSelector(service);
  await waitForExtensionSelector(page, sendSelector, 5000, `${service} send button was not found`);
  await page.queryElements(sendSelector, { limit: 3 }).catch(() => []);
  const sentAt = Date.now();
  if (service === "chatgpt") await clickChatgptExtensionSelector(page, sendSelector, 5000, `${service} send button was not found`);
  else await clickExtensionSelector(page, sendSelector, 5000, `${service} send button was not found`);

  const wait = await waitForExtensionPromptCompletion(page, service, before.assistantCount, completionTimeout);
  const chatUrl = wait.chat_url || before.url || snapshot.url || targetUrlFor(service, args);
  if (!wait.completion_detected || !wait.response_text.trim()) {
    return safeOutput(sendPromptBase(service, chatUrl, started, {
      response_text: "",
      wait_ms: wait.wait_ms || Date.now() - sentAt,
      completion_detected: false,
      errorCode: ConsumerErrorCodes.COMMAND_TIMEOUT,
      error_code: ConsumerErrorCodes.COMMAND_TIMEOUT,
      model_used: null,
      reuse_conversation: Boolean(args.reuse_conversation)
    }));
  }

  const base = sendPromptBase(service, chatUrl, started, {
    response_text: wait.response_text,
    wait_ms: wait.wait_ms,
    completion_detected: true,
    errorCode: null,
    model_used: null,
    reuse_conversation: Boolean(args.reuse_conversation)
  });
  if (service === "chatgpt") base.reuse_conversation = Boolean(args.reuse_conversation || chatUrl === before.url);
  if (service === "gemini") base.reuse_conversation = Boolean(args.reuse_conversation);
  return safeOutput(base);
}

async function openClaudeExtensionPage(backend: any, args: any): Promise<any> {
  const timeoutMs = Math.min(args.timeout_ms || 60000, 30000);
  const requestedRaw = args.url || args.tab_url_contains;
  const requestedUrl = normalizeUrlLikeTarget(requestedRaw);
  const freshUrl = args.incognito ? CLAUDE_INCOGNITO_FRESH_URL : CLAUDE_FRESH_URL;
  const page = requestedRaw || args.reuse_conversation
    ? await backend.claimTab({ url: requestedRaw || serviceDefaults.claude.url, profile: args.profile })
    : await backend.newTab({ url: freshUrl, profile: args.profile, background: false });

  if (requestedUrl) {
    const snapshot = await extensionTextSnapshot(page).catch(() => ({ url: "", text: "" }));
    if (!pageMatchesRequestedTab(snapshot.url || "", requestedRaw)) {
      await page.navigate(requestedUrl, { waitUntil: "domcontentloaded", timeoutMs });
    }
  } else if (!args.reuse_conversation) {
    await page.navigate(freshUrl, { waitUntil: "domcontentloaded", timeoutMs });
  }
  return page;
}

async function activateGeminiImageModeWithExtension(page: any, timeoutMs: number): Promise<void> {
  try {
    await ensureGeminiToolsAvailable(page);
    await toggleGeminiTool(page, "Create image", 1, Math.min(timeoutMs || 60000, 15000));
  } catch (error: any) {
    if (isConsumerErrorCode(error?.errorCode)) throw error;
    throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "Gemini Create image menuitemcheckbox did not report aria-checked=true", { selector: `${GEMINI_UPLOAD_TOOLS_TRIGGER_SELECTOR} -> ${GEMINI_CREATE_IMAGE_MENUITEM_SELECTOR}`, cause: error?.message || String(error) });
  }
}

async function activateGeminiVideoModeWithExtension(page: any, timeoutMs: number): Promise<void> {
  try {
    await ensureGeminiToolsAvailable(page);
    await toggleGeminiTool(page, "Create video", 1, Math.min(timeoutMs || 300000, 15000));
  } catch (error: any) {
    if (isConsumerErrorCode(error?.errorCode)) throw error;
    throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "Gemini Create video menuitemcheckbox did not report aria-checked=true", { selector: `${GEMINI_UPLOAD_TOOLS_TRIGGER_SELECTOR} -> ${GEMINI_CREATE_VIDEO_EXTENSION_MENUITEM_SELECTOR}`, cause: error?.message || String(error) });
  }
}
async function assertClaudeExtensionLoggedIn(page: any, started: number): Promise<Record<string, unknown> | null> {
  const snapshot = await extensionTextSnapshot(page);
  if (loginRequiredForService("claude", snapshot.url || "")) {
    return safeOutput(sendPromptBase("claude", snapshot.url || serviceDefaults.claude.url, started, {
      ok: false,
      service: "claude",
      errorCode: ConsumerErrorCodes.LOGIN_REQUIRED,
      error_code: ConsumerErrorCodes.LOGIN_REQUIRED
    }));
  }
  return null;
}

async function selectClaudeModelWithExtension(page: any, expected: string): Promise<void> {
  await extensionClick(page, CLAUDE_MODEL_SELECTOR, 5000);
  const labels = claudeModelLabels(expected);
  let lastError: any;
  for (const label of labels) {
    const escaped = label.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    for (const selector of [
      `[role="menuitemradio"]:has-text("${escaped}")`,
      `[role="menuitem"]:has-text("${escaped}")`,
      `button:has-text("${escaped}")`
    ]) {
      try {
        await extensionClick(page, selector, 5000);
        return;
      } catch (error) {
        lastError = error;
      }
    }
  }
  throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, `Claude model option was not found: ${expected}`, { selector: labels.join(" OR "), cause: errorMessageFromUnknown(lastError, "") });
}

async function setClaudeAdaptiveThinkingWithExtension(page: any): Promise<void> {
  const checked = await page.evaluateReadOnly(`(() => {
    const toggle = document.querySelector(${JSON.stringify(CLAUDE_ADAPTIVE_THINKING_SELECTOR)});
    if (!toggle) return false;
    return Boolean(toggle.checked) || toggle.getAttribute('aria-checked') === 'true';
  })()`).catch(() => false);
  if (checked) return;
  const toggles = await page.queryElements(CLAUDE_ADAPTIVE_THINKING_SELECTOR, { limit: 1 }).catch(() => []);
  if (toggles.length) {
    await extensionClick(page, CLAUDE_ADAPTIVE_THINKING_SELECTOR, 5000);
    return;
  }
  await extensionClick(page, CLAUDE_MODEL_SELECTOR, 5000);
  let lastError: any;
  for (const selector of [
    '[role="menuitemcheckbox"]:has-text("Adaptive thinking")',
    '[role="menuitemradio"]:has-text("Adaptive thinking")',
    '[role="menuitem"]:has-text("Adaptive thinking")',
    'button:has-text("Adaptive thinking")'
  ]) {
    try {
      await extensionClick(page, selector, 5000);
      return;
    } catch (error) {
      lastError = error;
    }
  }
  throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "Claude Adaptive thinking menu item was not found", { selector: "Adaptive thinking", cause: errorMessageFromUnknown(lastError, "") });
}

async function enableClaudeWebSearchWithExtension(page: any): Promise<void> {
  await extensionClick(page, CLAUDE_PLUS_MENU_SELECTOR, 5000);
  await extensionClick(page, CLAUDE_WEB_SEARCH_MENUITEM_SELECTOR, 8000);
}

async function applyClaudeExtensionPreSendOptions(page: any, args: any): Promise<void> {
  if (args.model) await selectClaudeModelWithExtension(page, String(args.model).trim());
  if (args.thinking) await setClaudeAdaptiveThinkingWithExtension(page);
  if (args.web_search) await enableClaudeWebSearchWithExtension(page);
}

async function claudeExtensionAssistantElements(page: any): Promise<Array<{ text?: string }>> {
  return await page.queryElements(assistantMessageSelector("claude"), { limit: 50 }).catch(() => []);
}

async function claudeExtensionAssistantCount(page: any): Promise<number> {
  return (await claudeExtensionAssistantElements(page)).length;
}

async function latestClaudeExtensionResponseText(page: any, fallbackText = ""): Promise<string> {
  const elements = await claudeExtensionAssistantElements(page);
  const latest = elements.length ? String(elements[elements.length - 1]?.text || "").trim() : "";
  if (latest) return latest;
  const snapshot = await extensionTextSnapshot(page, "main").catch(() => ({ text: fallbackText, url: "" }));
  return String(snapshot.text || fallbackText).trim();
}

async function waitForClaudeExtensionCompletion(page: any, assistantCountBefore: number, beforeText: string, timeoutMs: number): Promise<{ completion_detected: boolean; wait_ms: number; response_text: string }> {
  const started = Date.now();
  const deadline = started + Math.max(1, timeoutMs);
  let generationStarted = false;
  let lastText = "";
  let stableSince = 0;
  let latestText = "";

  while (Date.now() <= deadline) {
    const snapshot = await extensionTextSnapshot(page, "main").catch(() => ({ url: "", text: "" }));
    const assistantElements = await claudeExtensionAssistantElements(page);
    latestText = assistantElements.length
      ? String(assistantElements[assistantElements.length - 1]?.text || "").trim()
      : String(snapshot.text || "").trim();
    generationStarted = generationStarted
      || assistantElements.length > assistantCountBefore
      || String(snapshot.text || "").length > beforeText.length + 8;

    if (generationStarted && latestText) {
      if (latestText === lastText) {
        if (!stableSince) stableSince = Date.now();
        if (Date.now() - stableSince >= 1500) {
          return { completion_detected: true, wait_ms: Date.now() - started, response_text: latestText };
        }
      } else {
        lastText = latestText;
        stableSince = Date.now();
      }
    }
    await extensionSleep(500);
  }

  return { completion_detected: false, wait_ms: Date.now() - started, response_text: latestText };
}

async function sendClaudePromptInExtensionPage(args: any, page: any, started = Date.now()): Promise<Record<string, unknown>> {
  assertPromptAllowed(args.prompt);
  const timeout = args.timeout_ms || 60000;
  const login = await assertClaudeExtensionLoggedIn(page, started);
  if (login) return login;
  await page.waitForSelector(CLAUDE_PROMPT_SELECTOR, { state: "visible", timeoutMs: Math.min(timeout, 15000) });
  await applyClaudeExtensionPreSendOptions(page, args);
  const beforeSnapshot = await extensionTextSnapshot(page, "main").catch(() => ({ url: targetUrlFor("claude", args), text: "" }));
  const assistantCountBefore = await claudeExtensionAssistantCount(page);
  await page.fill({ selector: CLAUDE_PROMPT_SELECTOR }, args.prompt, { timeoutMs: Math.min(timeout, 15000) });
  const sentAt = Date.now();
  const sendSelector = sendButtonSelector("claude");
  await page.waitForSelector(sendSelector, { state: "visible", timeoutMs: 5000 });
  await page.queryElements(sendSelector, { limit: 3 }).catch(() => []);
  await extensionClick(page, sendSelector, 5000);
  const wait = await waitForClaudeExtensionCompletion(page, assistantCountBefore, beforeSnapshot.text || "", responseTimeoutMs(args));
  const afterSnapshot = await extensionTextSnapshot(page, "main").catch(() => beforeSnapshot);
  const chatUrl = afterSnapshot.url || beforeSnapshot.url || targetUrlFor("claude", args);
  await page.assetsList().catch(() => []);
  await page.assetsBundle().catch(() => ({ assets: [], capturedAt: new Date().toISOString() }));
  if (!wait.completion_detected || !String(wait.response_text || "").trim()) {
    return safeOutput(sendPromptBase("claude", chatUrl, started, {
      response_text: "",
      wait_ms: wait.wait_ms || Date.now() - sentAt,
      completion_detected: false,
      errorCode: ConsumerErrorCodes.COMMAND_TIMEOUT,
      error_code: ConsumerErrorCodes.COMMAND_TIMEOUT
    }));
  }
  const responseText = await latestClaudeExtensionResponseText(page, wait.response_text);
  return safeOutput(sendPromptBase("claude", chatUrl, started, {
    response_text: responseText,
    wait_ms: wait.wait_ms,
    completion_detected: true,
    errorCode: null
  }));
}

async function waitForClaudeAttachmentReadyWithExtension(page: any, resolved: string[], timeoutMs = 30000): Promise<void> {
  const filenames = resolved.map((file: string) => path.basename(file));
  const deadline = Date.now() + timeoutMs;
  const expression = `(() => {
    const expected = new Set(arg);
    const root = document.querySelector('fieldset, [data-testid="composer"], [data-testid*="composer"], main') || document.body;
    const wrappers = Array.from(root.querySelectorAll('div[class*="group/thumbnail"]')).filter((el) => /(^|\\s)group\\/thumbnail(\\s|$)/.test(String(el.className || '')));
    const seen = new Set();
    for (const wrapper of wrappers) {
      const loadingHint = wrapper.querySelector('[role="progressbar"], [aria-label*="oading"], [aria-label*="rogress"], svg[class*="animate-spin"], svg[class*="spin"]');
      if (loadingHint) return { ready: false, seen: Array.from(seen), loading: true };
      const innerTestidNodes = Array.from(wrapper.querySelectorAll('[data-testid]'));
      for (const node of innerTestidNodes) {
        const t = node.getAttribute('data-testid');
        if (t && t !== 'file-thumbnail' && t !== 'file-upload') seen.add(t);
      }
      if (wrapper.getAttribute('data-testid') === 'file-thumbnail') {
        const btn = wrapper.querySelector('button[aria-label]');
        const label = btn ? (btn.getAttribute('aria-label') || '') : '';
        const commaIdx = label.indexOf(',');
        const fn = (commaIdx >= 0 ? label.slice(0, commaIdx) : label).trim();
        if (fn && fn !== 'Remove') seen.add(fn);
      }
      const removeButtons = Array.from(wrapper.querySelectorAll('button[aria-label]'));
      for (const rb of removeButtons) {
        const lbl = rb.getAttribute('aria-label') || '';
        const m = /^Remove\\s+(.+)$/.exec(lbl);
        if (m && m[1].trim()) seen.add(m[1].trim());
      }
    }
    for (const name of expected) if (!seen.has(name)) return { ready: false, seen: Array.from(seen), loading: false };
    return { ready: expected.size > 0, seen: Array.from(seen), loading: false };
  })()`;
  while (Date.now() <= deadline) {
    const state = await page.evaluateReadOnly(expression, filenames).catch(() => ({ ready: false }));
    if (state?.ready) return;
    await extensionSleep(500);
  }
  throw new WebAiToolError(ConsumerErrorCodes.COMMAND_TIMEOUT, "Claude attachment did not finish processing before send", { selector: "Claude visible attachment chip without upload progress" });
}

async function uploadClaudeFilesWithExtension(page: any, resolved: string[], args: any): Promise<void> {
  if (typeof page.uploadFile !== "function") {
    throw new WebAiToolError(ConsumerErrorCodes.CHROME_EXTENSION_DEBUGGER_UNAVAILABLE, `Vendor ${VENDOR_BROWSER_TOOL_NAMES.FILE_UPLOAD} tool is not available on the extension-assisted page port`);
  }
  const uploadSelector = "#chat-input-file-upload-onpage";
  await page.waitForSelector(uploadSelector, { state: "attached", timeoutMs: 10000 });
  await page.assetsList().catch(() => []);
  for (const filePath of resolved) {
    await page.uploadFile(uploadSelector, filePath, { timeoutMs: Math.min(args.timeout_ms || 60000, 30000), multiple: resolved.length > 1 });
  }
  await waitForClaudeAttachmentReadyWithExtension(page, resolved, Math.min(args.timeout_ms || 60000, 30000));
}

async function waitForAttachmentReadyWithExtension(page: any, service: "chatgpt" | "gemini", resolved: string[], timeoutMs = 30000): Promise<void> {
  const filenames = resolved.map((file: string) => path.basename(file));
  const sendSelector = sendButtonSelector(service);
  const deadline = Date.now() + timeoutMs;
  const expression = `(() => {
    const expected = new Set(arg.filenames);
    const qsa = (selector) => {
      try { return Array.from(document.querySelectorAll(selector)); } catch (_) { return []; }
    };
    const visible = (el) => {
      if (!el) return false;
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style && style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
    };
    const seen = new Set();
    for (const input of qsa('input[type="file"]')) {
      for (const file of Array.from(input.files || [])) {
        if (file && file.name) seen.add(file.name);
      }
    }
    const text = document.body ? String(document.body.innerText || document.body.textContent || '') : '';
    for (const name of expected) {
      if (text.includes(name)) seen.add(name);
    }
    for (const node of qsa('[aria-label], [title], [data-testid], [data-file-name], [data-filename]')) {
      const values = [
        node.getAttribute('aria-label'),
        node.getAttribute('title'),
        node.getAttribute('data-testid'),
        node.getAttribute('data-file-name'),
        node.getAttribute('data-filename'),
        node.textContent
      ].filter(Boolean).map((value) => String(value));
      for (const name of expected) {
        if (values.some((value) => value.includes(name))) seen.add(name);
      }
    }
    const sendButtons = qsa(arg.sendSelector);
    const sendReady = sendButtons.some((button) => visible(button) && button.getAttribute('aria-disabled') !== 'true' && !(button instanceof HTMLButtonElement && button.disabled));
    const filesReady = expected.size > 0 && Array.from(expected).every((name) => seen.has(name));
    const ready = filesReady;
    return { ready, seen: Array.from(seen), sendReady };
  })()`;
  let lastState: any = { ready: false, seen: [], sendReady: false };
  while (Date.now() <= deadline) {
    lastState = await page.evaluateReadOnly(expression, { filenames, sendSelector, service }).catch(() => lastState);
    if (lastState?.ready) return;
    await extensionSleep(500);
  }
  throw new WebAiToolError(ConsumerErrorCodes.COMMAND_TIMEOUT, `${service} attachment did not finish processing before send`, {
    selector: service === "chatgpt" ? "input#upload-files + visible attachment chip" : `${GEMINI_UPLOAD_FILES_MENUITEM_SELECTOR} -> input[type="file"] + ${GEMINI_UPLOAD_CHIP_SELECTOR}`,
    seen: lastState?.seen || [],
    sendReady: Boolean(lastState?.sendReady)
  });
}

async function uploadChatgptFilesWithExtension(page: any, resolved: string[], args: any): Promise<void> {
  if (typeof page.uploadFile !== "function") {
    throw new WebAiToolError(ConsumerErrorCodes.CHROME_EXTENSION_DEBUGGER_UNAVAILABLE, `Vendor ${VENDOR_BROWSER_TOOL_NAMES.FILE_UPLOAD} tool is not available on the extension-assisted page port`);
  }
  const uploadSelector = "input#upload-files";
  try {
    await page.waitForSelector(uploadSelector, { state: "attached", timeoutMs: 10000 });
  } catch (error: any) {
    throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "ChatGPT upload input was not found before file attach", { selector: uploadSelector, cause: errorMessageFromUnknown(error, "") });
  }
  for (const filePath of resolved) {
    await page.uploadFile(uploadSelector, filePath, { timeoutMs: Math.min(args.timeout_ms || 60000, 30000), multiple: resolved.length > 1 });
  }
  await waitForAttachmentReadyWithExtension(page, "chatgpt", resolved, Math.min(args.timeout_ms || 60000, 30000));
}

async function uploadGeminiFilesWithExtension(page: any, resolved: string[], args: any): Promise<void> {
  if (typeof page.uploadFile !== "function") {
    throw new WebAiToolError(ConsumerErrorCodes.CHROME_EXTENSION_DEBUGGER_UNAVAILABLE, `Vendor ${VENDOR_BROWSER_TOOL_NAMES.FILE_UPLOAD} tool is not available on the extension-assisted page port`);
  }
  await clickExtensionSelector(page, GEMINI_UPLOAD_TOOLS_TRIGGER_SELECTOR, 15000, "Gemini Upload & tools button was not found");
  try {
    await page.waitForSelector(GEMINI_UPLOAD_FILES_SELECTOR, { state: "visible", timeoutMs: 8000 });
  } catch (error: any) {
    throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "Gemini upload-files menuitem was not found", { selector: GEMINI_UPLOAD_FILES_SELECTOR, cause: errorMessageFromUnknown(error, "") });
  }
  await clickExtensionSelector(page, GEMINI_UPLOAD_FILES_SELECTOR, 8000, "Gemini upload-files menuitem was not found");
  const uploadInputSelectors = ['input[type="file"][name="Filedata"]', 'input[type="file"]'];
  let uploadInputSelector = "";
  let lastInputError: any;
  for (const selector of uploadInputSelectors) {
    try {
      await page.waitForSelector(selector, { state: "attached", timeoutMs: 8000 });
      uploadInputSelector = selector;
      break;
    } catch (error) {
      lastInputError = error;
    }
  }
  if (!uploadInputSelector) {
    throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "Gemini upload file input was not found after clicking Upload files", { selector: uploadInputSelectors.join(", "), cause: errorMessageFromUnknown(lastInputError, "") });
  }
  for (const filePath of resolved) {
    await page.uploadFile(uploadInputSelector, filePath, { timeoutMs: Math.min(args.timeout_ms || 60000, 30000), multiple: resolved.length > 1 });
  }
  // Gemini keeps Send disabled until prompt text is present, so the generic
  // attachment readiness gate cannot require sendReady before the prompt is
  // filled. Give the hidden file input change event a short settle window; the
  // subsequent send path waits for the hydrated Send button after filling.
  await extensionSleep(1000);
}

async function uploadAndQueryWithExtensionBackend(service: "chatgpt" | "gemini", args: any, runtime: Required<BrowserToolRuntime>): Promise<Record<string, unknown>> {
  void runtime;
  const effective = service === "gemini" ? geminiToolArgs(args || {}) : (args || {});
  assertPromptAllowed(effective.prompt);
  if (!Array.isArray(effective.files)) return uploadExtensionErrorOutput(service, effective, new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "files must be an array"));
  const missing = effective.files.map((file: string) => path.resolve(file)).filter((file: string) => !fs.existsSync(file));
  if (missing.length) return uploadExtensionErrorOutput(service, effective, new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, `upload file(s) not found: ${missing.join(", ")}`));
  const resolved = effective.files.map((file: string) => path.resolve(file));
  const names = resolved.map((file: string) => path.basename(file));
  const lease = acquireProfileLease(effective.profile);
  let backend: any;
  try {
    backend = getBackend("extension-assisted-cdp", {
      transport: "http",
      httpBridgeUrl: extensionHttpBridgeUrlForArgs(effective)
    });
    await backend.ping();
    const page = service === "chatgpt"
      ? await openChatgptExtensionPage(backend, effective)
      : await extensionGeminiPage(effective, backend, GEMINI_FRESH_COMPOSER_URL);
    const snapshot = await extensionTextSnapshot(page).catch(() => ({ url: targetUrlFor(service, effective), text: "" }));
    if (loginRequiredForService(service, snapshot.url || "")) {
      return uploadExtensionErrorOutput(service, effective, new WebAiToolError(ConsumerErrorCodes.LOGIN_REQUIRED, `${service} login is required before upload`), { chat_url: snapshot.url || targetUrlFor(service, effective) });
    }
    await waitForExtensionSelector(page, serviceDefaults[service].promptSelector, Math.min(effective.timeout_ms || 60000, 15000), `${service} prompt composer was not found`);
    if (service === "chatgpt") await uploadChatgptFilesWithExtension(page, resolved, effective);
    else await uploadGeminiFilesWithExtension(page, resolved, effective);
    const response = await sendPromptInExtensionPage(service, effective, page, Date.now());
    const completion = {
      response_text: response.response_text || "",
      wait_ms: Number(response.wait_ms || 0),
      completion_detected: Boolean(response.completion_detected),
      errorCode: response.errorCode || null,
      ...(response.error_code ? { error_code: response.error_code } : {})
    };
    await page.assetsList().catch(() => []);
    await page.assetsBundle().catch(() => ({ assets: [], capturedAt: new Date().toISOString() }));
    if (service === "chatgpt") return safeOutput({ conversation_id: response.conversation_id || null, attachment_names: names, ...completion });
    return safeOutput({ files_in_chip: names, chat_url: response.chat_url || snapshot.url || null, ...completion });
  } catch (error: any) {
    return uploadExtensionErrorOutput(service, effective, error, service === "chatgpt" ? { attachment_names: names } : { files_in_chip: names });
  } finally {
    await backend?.finalize?.().catch?.(() => undefined);
    releaseProfileLease(effective.profile, lease);
  }
}

async function sendClaudePromptWithExtensionBackend(args: any, runtime: Required<BrowserToolRuntime>): Promise<Record<string, unknown>> {
  const effective = claudeToolArgs(args || {});
  const started = Date.now();
  const lease = acquireProfileLease(effective.profile);
  let backend: any;
  try {
    backend = getBackend("extension-assisted-cdp", {
      transport: "http",
      httpBridgeUrl: claudeExtensionHttpBridgeUrl(effective)
    });
    await backend.ping();
    const page = await openClaudeExtensionPage(backend, effective);
    return await sendClaudePromptInExtensionPage(effective, page, started);
  } catch (error: any) {
    return claudeSendExtensionErrorOutput(effective, started, error);
  } finally {
    await backend?.finalize?.().catch?.(() => undefined);
    releaseProfileLease(effective.profile, lease);
  }
}

async function sendChatgptPromptWithExtensionBackend(args: any, runtime: Required<BrowserToolRuntime>): Promise<Record<string, unknown>> {
  void runtime;
  const effective = args || {};
  const started = Date.now();
  const lease = acquireProfileLease(effective.profile);
  let backend: any;
  try {
    backend = getBackend("extension-assisted-cdp", {
      transport: "http",
      httpBridgeUrl: extensionHttpBridgeUrlForArgs(effective)
    });
    await backend.ping();
    const page = await openChatgptExtensionPage(backend, effective);
    return await sendPromptInExtensionPage("chatgpt", effective, page, started);
  } catch (error: any) {
    return sendPromptExtensionErrorOutput("chatgpt", effective, started, error);
  } finally {
    await backend?.finalize?.().catch?.(() => undefined);
    releaseProfileLease(effective.profile, lease);
  }
}

async function sendGeminiPromptWithExtensionBackend(args: any, runtime: Required<BrowserToolRuntime>): Promise<Record<string, unknown>> {
  void runtime;
  const effective = geminiToolArgs(args || {});
  const started = Date.now();
  const lease = acquireProfileLease(effective.profile);
  let backend: any;
  try {
    backend = getBackend("extension-assisted-cdp", {
      transport: "http",
      httpBridgeUrl: extensionHttpBridgeUrlForArgs(effective)
    });
    await backend.ping();
    const page = await extensionGeminiPage(effective, backend, GEMINI_FRESH_COMPOSER_URL);
    return await sendPromptInExtensionPage("gemini", effective, page, started);
  } catch (error: any) {
    return sendPromptExtensionErrorOutput("gemini", effective, started, error);
  } finally {
    await backend?.finalize?.().catch?.(() => undefined);
    releaseProfileLease(effective.profile, lease);
  }
}

async function selectChatgptModelWithExtensionBackend(args: any, runtime: Required<BrowserToolRuntime>): Promise<Record<string, unknown>> {
  void runtime;
  const invalid = validateStandaloneSelectModelArgs("webai_chatgpt_select_model", args);
  if (invalid) return invalid;
  const effective = args || {};
  const requestedThinkingLevel = effective.thinking_level ? String(effective.thinking_level) : null;
  const lease = acquireProfileLease(effective.profile);
  let backend: any;
  let selectedModel: string | null = null;
  try {
    backend = getBackend("extension-assisted-cdp", {
      transport: "http",
      httpBridgeUrl: extensionHttpBridgeUrlForArgs(effective)
    });
    await backend.ping();
    const page = await openChatgptExtensionPage(backend, effective);
    const snapshot = await extensionTextSnapshot(page).catch(() => ({ url: targetUrlFor("chatgpt", effective), text: "" }));
    if (loginRequiredForService("chatgpt", snapshot.url || "")) {
      return selectModelToolError(
        new WebAiToolError(ConsumerErrorCodes.LOGIN_REQUIRED, "ChatGPT login is required before model selection"),
        selectedModel,
        requestedThinkingLevel
      );
    }
    await waitForExtensionSelector(page, serviceDefaults.chatgpt.promptSelector, Math.min(effective.timeout_ms || 60000, 15000), "ChatGPT prompt composer was not found");
    const modelFromArg = effective.model ? normalizeModelTier("chatgpt", { model: effective.model }) || String(effective.model).trim() : null;
    const expectedModel = modelFromArg || (requestedThinkingLevel === "extended" ? "Thinking" : null);
    if (expectedModel) {
      await selectChatgptModelWithExtension(page, expectedModel);
      selectedModel = expectedModel;
    }
    return safeOutput({ ok: true, selected_model: selectedModel, selected_thinking_level: requestedThinkingLevel, errorCode: null });
  } catch (error: any) {
    return selectModelExtensionErrorOutput(error, selectedModel, requestedThinkingLevel);
  } finally {
    await backend?.finalize?.().catch?.(() => undefined);
    releaseProfileLease(effective.profile, lease);
  }
}

async function selectClaudeModelWithExtensionBackend(args: any, runtime: Required<BrowserToolRuntime>): Promise<Record<string, unknown>> {
  void runtime;
  const invalid = validateStandaloneSelectModelArgs("webai_claude_select_model", args);
  if (invalid) return invalid;
  const effective = args || {};
  const requestedThinkingLevel = effective.thinking_level ? String(effective.thinking_level) : null;
  const lease = acquireProfileLease(effective.profile);
  let backend: any;
  let selectedModel: string | null = null;
  try {
    backend = getBackend("extension-assisted-cdp", {
      transport: "http",
      httpBridgeUrl: claudeExtensionHttpBridgeUrl(effective)
    });
    await backend.ping();
    const page = await openClaudeExtensionPage(backend, effective);
    const snapshot = await extensionTextSnapshot(page).catch(() => ({ url: targetUrlFor("claude", effective), text: "" }));
    if (loginRequiredForService("claude", snapshot.url || "")) {
      return selectModelToolError(
        new WebAiToolError(ConsumerErrorCodes.LOGIN_REQUIRED, "Claude login is required before model selection"),
        selectedModel,
        requestedThinkingLevel
      );
    }
    await waitForExtensionSelector(page, CLAUDE_MODEL_SELECTOR, Math.min(effective.timeout_ms || 60000, 15000), "Claude model selector was not found");
    if (effective.model) {
      selectedModel = String(effective.model).trim();
      await selectClaudeModelWithExtension(page, selectedModel);
    }
    if (requestedThinkingLevel === "extended") {
      await setClaudeAdaptiveThinkingWithExtension(page);
    }
    return safeOutput({ ok: true, selected_model: selectedModel, selected_thinking_level: requestedThinkingLevel, errorCode: null });
  } catch (error: any) {
    return selectModelExtensionErrorOutput(error, selectedModel, requestedThinkingLevel);
  } finally {
    await backend?.finalize?.().catch?.(() => undefined);
    releaseProfileLease(effective.profile, lease);
  }
}

function validateGeminiExtensionSelectModelArgs(args: any): Record<string, unknown> | null {
  if (!args?.profile || typeof args.profile !== "string") {
    return selectModelInvalidArgs("webai_gemini_select_model", "requires profile");
  }
  if (!args.model && !args.thinking_level) {
    return selectModelInvalidArgs("webai_gemini_select_model", "requires at least one of: model, thinking_level");
  }
  if (args.model !== undefined && (typeof args.model !== "string" || !args.model.trim())) {
    return selectModelInvalidArgs("webai_gemini_select_model", "model must be a non-empty picker label");
  }
  if (args.model !== undefined && !isSupportedGeminiModelOption(args.model)) {
    return selectModelInvalidArgs("webai_gemini_select_model", `unsupported model "${args.model}" (allowed: 3.1-flash-lite, 3.5-flash, 3.1-pro)`);
  }
  if (args.thinking_level !== undefined && !GEMINI_THINKING_OPTION_TEMPLATES[String(args.thinking_level)]) {
    return selectModelInvalidArgs("webai_gemini_select_model", `unsupported thinking_level "${args.thinking_level}" (allowed: standard, extended)`);
  }
  return null;
}

async function selectGeminiModelWithExtensionBackend(args: any, runtime: Required<BrowserToolRuntime>): Promise<Record<string, unknown>> {
  void runtime;
  const invalid = validateGeminiExtensionSelectModelArgs(args);
  if (invalid) return invalid;
  const effective = geminiToolArgs(args || {});
  const requestedThinkingLevel = effective.thinking_level ? String(effective.thinking_level) : null;
  const lease = acquireProfileLease(effective.profile);
  let backend: any;
  let selectedModel: string | null = null;
  let selectedThinkingLevel: string | null = null;
  try {
    backend = getBackend("extension-assisted-cdp", {
      transport: "http",
      httpBridgeUrl: extensionHttpBridgeUrlForArgs(effective)
    });
    await backend.ping();
    const page = await extensionGeminiPage(effective, backend, GEMINI_FRESH_COMPOSER_URL);
    const snapshot = await extensionTextSnapshot(page).catch(() => ({ url: targetUrlFor("gemini", effective), text: "" }));
    if (loginRequiredForService("gemini", snapshot.url || "")) {
      return selectModelToolError(
        new WebAiToolError(ConsumerErrorCodes.LOGIN_REQUIRED, "Gemini login is required before model selection"),
        selectedModel,
        requestedThinkingLevel
      );
    }
    await clickExtensionSelector(page, 'button:has-text("Not now")', 1000, "Gemini optional dialog was not found").catch(() => undefined);
    await waitForExtensionSelector(page, serviceDefaults.gemini.promptSelector, Math.min(effective.timeout_ms || 60000, 15000), "Gemini prompt composer was not found");
    if (effective.model) {
      selectedModel = String(effective.model).trim();
      await selectGeminiModelWithExtension(page, selectedModel);
    }
    if (requestedThinkingLevel) {
      await selectGeminiThinkingLevelWithExtension(page, requestedThinkingLevel);
      selectedThinkingLevel = requestedThinkingLevel;
    }
    return safeOutput({ ok: true, selected_model: selectedModel, selected_thinking_level: selectedThinkingLevel, errorCode: null });
  } catch (error: any) {
    return selectModelExtensionErrorOutput(error, selectedModel, selectedThinkingLevel || requestedThinkingLevel);
  } finally {
    await backend?.finalize?.().catch?.(() => undefined);
    releaseProfileLease(effective.profile, lease);
  }
}

async function uploadAndQueryClaudeWithExtensionBackend(args: any, runtime: Required<BrowserToolRuntime>): Promise<Record<string, unknown>> {
  void runtime;
  const effective = claudeToolArgs(args || {});
  assertPromptAllowed(effective.prompt);
  if (!Array.isArray(effective.files)) return claudeUploadExtensionErrorOutput(effective, new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "files must be an array"));
  if (effective.files.length > 3) return claudeUploadExtensionErrorOutput(effective, new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "Claude upload_and_query supports at most 3 files"));
  const missing = effective.files.map((file: string) => path.resolve(file)).filter((file: string) => !fs.existsSync(file));
  if (missing.length) return claudeUploadExtensionErrorOutput(effective, new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, `upload file(s) not found: ${missing.join(", ")}`));
  const resolved = effective.files.map((file: string) => path.resolve(file));
  const names = resolved.map((file: string) => path.basename(file));
  const lease = acquireProfileLease(effective.profile);
  let backend: any;
  try {
    backend = getBackend("extension-assisted-cdp", {
      transport: "http",
      httpBridgeUrl: claudeExtensionHttpBridgeUrl(effective)
    });
    await backend.ping();
    const page = await openClaudeExtensionPage(backend, effective);
    const login = await assertClaudeExtensionLoggedIn(page, Date.now());
    if (login) return claudeUploadExtensionErrorOutput(effective, new WebAiToolError(ConsumerErrorCodes.LOGIN_REQUIRED, "Claude login is required before upload"), { chat_url: login.chat_url || targetUrlFor("claude", effective) });
    await page.waitForSelector(CLAUDE_PROMPT_SELECTOR, { state: "visible", timeoutMs: Math.min(effective.timeout_ms || 60000, 15000) });
    await uploadClaudeFilesWithExtension(page, resolved, effective);
    const response = await sendClaudePromptInExtensionPage(effective, page, Date.now());
    const completion = {
      response_text: response.response_text || "",
      wait_ms: Number(response.wait_ms || 0),
      completion_detected: Boolean(response.completion_detected),
      errorCode: response.errorCode || null,
      ...(response.error_code ? { error_code: response.error_code } : {})
    };
    await page.assetsList().catch(() => []);
    await page.assetsBundle().catch(() => ({ assets: [], capturedAt: new Date().toISOString() }));
    return safeOutput({ files_uploaded_count: names.length, attachment_names: names, chat_url: response.chat_url || null, ...completion });
  } catch (error: any) {
    return claudeUploadExtensionErrorOutput(effective, error, { attachment_names: names });
  } finally {
    await backend?.finalize?.().catch?.(() => undefined);
    releaseProfileLease(effective.profile, lease);
  }
}

async function generateClaudeFileWithExtensionBackend(args: any, runtime: Required<BrowserToolRuntime>): Promise<Record<string, unknown>> {
  const effective = claudeToolArgs(args || {});
  assertPromptAllowed(effective.prompt);
  const unsupported = new Set(["xlsx"]);
  if (unsupported.has(String(effective.expected_extension))) {
    return fileErrorOutput(ConsumerErrorCodes.INVALID_ARGS, `expected_extension="${effective.expected_extension}" is not supported on webai_claude_generate_file: native downloadable .xlsx generation is not reliably produced by the driven claude-web path. Supported: docx, pptx (and code/text artifacts: py, md, csv, svg, html, mmd, pdf).`);
  }
  try {
    requireAbsoluteDir(effective.download_dir);
    assertNotPublishDeniedLabel("Download", { tool: "webai.claude.generate_file" });
  } catch (error: any) {
    return fileErrorOutput(claudeExtensionErrorCode(error), errorMessageFromUnknown(error, "Claude generate-file preflight failed"));
  }
  const started = Date.now();
  const lease = acquireProfileLease(effective.profile);
  let backend: any;
  try {
    backend = getBackend("extension-assisted-cdp", {
      transport: "http",
      httpBridgeUrl: claudeExtensionHttpBridgeUrl(effective)
    });
    await backend.ping();
    const page = await openClaudeExtensionPage(backend, effective);
    const promptResult = await sendClaudePromptInExtensionPage(effective, page, started);
    if (promptResult.errorCode) {
      return fileErrorOutput(promptResult.errorCode as ConsumerErrorCode, promptResult.error_code ? String(promptResult.error_code) : "Claude generate-file prompt failed before download");
    }
    const snapshot = await extensionTextSnapshot(page, "main").catch(() => ({ url: promptResult.chat_url || targetUrlFor("claude", effective), text: "" }));
    await page.assetsList().catch(() => []);
    const bundle = await page.assetsBundle().catch(() => ({ assets: [], capturedAt: new Date().toISOString() }));
    const buttonSelector = CLAUDE_GENERATED_FILE_DOWNLOAD_SELECTOR;
    const locateTimeoutMs = generateFileLocateTimeoutMs(effective.expected_extension);
    const downloadTimeoutMs = generateFileDownloadTimeoutMs(effective.expected_extension);
    const result = await runArtifactClickWithCdpReadinessRetry(runtime, {
      profile: effective.profile,
      tabUrlContains: effective.tab_url_contains || snapshot.url || serviceDefaults.claude.url,
      buttonSelector,
      downloadDir: effective.download_dir,
      filenamePattern: `\\.${effective.expected_extension}$`,
      timeoutMs: Math.min(Number(effective.timeout_ms || downloadTimeoutMs), downloadTimeoutMs),
      locateTimeoutMs,
      pageReadyEvidence: {
        backend: "extension-assisted-cdp",
        capturedAt: bundle.capturedAt,
        assetCount: bundle.assets.length
      }
    }).catch((error: any) => {
      if (isArtifactDownloadControlMissing(error)) throw generatedFileDownloadTimeoutError("Claude", error, buttonSelector, locateTimeoutMs);
      throw error;
    });
    return artifactClickResultToSafeOutput(result, { artifact_name: result.suggestedFilename || result.downloadFilename || path.basename(result.path || "") });
  } catch (error: any) {
    const errorCode = claudeExtensionErrorCode(error);
    return fileErrorOutput(errorCode, errorMessageFromUnknown(error, errorCode));
  } finally {
    await backend?.finalize?.().catch?.(() => undefined);
    releaseProfileLease(effective.profile, lease);
  }
}

async function generateChatgptFileWithExtensionBackend(args: any, runtime: Required<BrowserToolRuntime>): Promise<Record<string, unknown>> {
  const effective = args || {};
  assertPromptAllowed(effective.prompt);
  const unsupported = new Set(["xlsx"]);
  if (unsupported.has(String(effective.expected_extension))) {
    return fileErrorOutput(ConsumerErrorCodes.INVALID_ARGS, `expected_extension="${effective.expected_extension}" is not supported on webai_chatgpt_generate_file: native downloadable .xlsx generation is not reliably produced by the driven chatgpt-web path. Supported: docx, pptx (and code/text artifacts: py, md, csv, svg, html, mmd, pdf).`);
  }
  try {
    requireAbsoluteDir(effective.download_dir);
    assertNotPublishDeniedLabel("Download", { tool: "webai.chatgpt.generate_file" });
  } catch (error: any) {
    const errorCode = webAiExtensionErrorCode(error);
    return fileErrorOutput(errorCode, errorMessageFromUnknown(error, "ChatGPT generate-file preflight failed"));
  }
  const started = Date.now();
  const lease = acquireProfileLease(effective.profile);
  let backend: any;
  try {
    backend = getBackend("extension-assisted-cdp", {
      transport: "http",
      httpBridgeUrl: extensionHttpBridgeUrlForArgs(effective)
    });
    await backend.ping();
    const page = await openChatgptExtensionPage(backend, effective);
    const requestedExtension = normalizedExpectedExtension(effective.expected_extension);
    const usePptxZipBundle = requestedExtension === "pptx";
    const downloadExtension = usePptxZipBundle ? "zip" : requestedExtension;
    const locateTimeoutMs = usePptxZipBundle
      ? Math.max(generateFileLocateTimeoutMs("pptx"), 300000)
      : generateFileLocateTimeoutMs(downloadExtension);
    const promptArgs = {
      ...effective,
      ...(usePptxZipBundle ? { prompt: chatgptPptxZipBundlePrompt(effective.prompt), expected_extension: "zip" } : {}),
      response_timeout_ms: Math.max(responseTimeoutMs(effective), locateTimeoutMs)
    };
    const promptResult = await sendPromptInExtensionPage("chatgpt", promptArgs, page, started);
    if (promptResult.errorCode) {
      return fileErrorOutput(promptResult.errorCode as ConsumerErrorCode, promptResult.error_code ? String(promptResult.error_code) : "ChatGPT generate-file prompt failed before download");
    }
    const downloadShape = await waitForChatgptGeneratedFileDownloadShapeWithExtension(page, downloadExtension, locateTimeoutMs);
    const snapshot = await extensionTextSnapshot(page, "main").catch(() => ({ url: promptResult.chat_url || targetUrlFor("chatgpt", effective), text: "" }));
    await page.assetsList().catch(() => []);
    const bundle = await page.assetsBundle().catch(() => ({ assets: [], capturedAt: new Date().toISOString() }));
    const chatgptArtifactTimeoutMs = Math.min(Number(effective.timeout_ms || 480000), 480000);
    const result = await runArtifactClickWithCdpReadinessRetry(runtime, {
      profile: effective.profile,
      tabUrlContains: effective.tab_url_contains || snapshot.url || promptResult.chat_url || serviceDefaults.chatgpt.url,
      buttonSelector: downloadShape.buttonSelector,
      ...(downloadShape.buttonAncestorText ? { buttonAncestorText: downloadShape.buttonAncestorText } : {}),
      downloadDir: effective.download_dir,
      filenamePattern: `\\.${downloadExtension}$`,
      timeoutMs: chatgptArtifactTimeoutMs,
      locateTimeoutMs,
      useJsClickFallback: true,
      pageReadyEvidence: {
        backend: "extension-assisted-cdp",
        capturedAt: bundle.capturedAt,
        assetCount: bundle.assets.length
      }
    }).catch((error: any) => {
      if (isArtifactDownloadControlMissing(error)) throw generatedFileDownloadTimeoutError("ChatGPT", error, downloadShape.buttonSelector, locateTimeoutMs);
      throw error;
    });
    if (usePptxZipBundle) {
      const zipPath = result.path || (result as any).savedPath || "";
      if (!zipPath || !fs.existsSync(zipPath)) {
        throw new WebAiToolError(ConsumerErrorCodes.ARTIFACT_VERIFICATION_FAILED, "ChatGPT ZIP bundle download did not produce a readable archive", { zipPath });
      }
      const extracted = extractPptxFromZipBundle(zipPath, effective.download_dir);
      return artifactClickResultToSafeOutput(
        { path: extracted.path, sha256: extracted.sha256, size_bytes: extracted.byteSize, downloadFilename: path.basename(extracted.path) },
        {
          artifact_name: path.basename(extracted.path),
          suggested_filename: path.basename(extracted.path),
          zip_path: zipPath,
          zip_sha256: sha256File(zipPath),
          zip_download_filename: result.suggestedFilename || result.downloadFilename || path.basename(zipPath),
          zip_entry_name: extracted.entryName,
          extracted_from_zip: true
        }
      );
    }
    return artifactClickResultToSafeOutput(result, { suggested_filename: result.suggestedFilename || result.downloadFilename || path.basename(result.path || "") });
  } catch (error: any) {
    const errorCode = webAiExtensionErrorCode(error);
    return fileErrorOutput(errorCode, errorMessageFromUnknown(error, errorCode));
  } finally {
    await backend?.finalize?.().catch?.(() => undefined);
    releaseProfileLease(effective.profile, lease);
  }
}

async function generateChatgptImageWithExtensionBackend(args: any, runtime: Required<BrowserToolRuntime>): Promise<Record<string, unknown>> {
  assertPromptAllowed(args.prompt);
  requireAbsoluteDir(args.download_dir);
  assertNotPublishDeniedLabel("Download full size image", { tool: "webai.chatgpt.generate_image" });
  const lease = acquireProfileLease(args.profile);
  let backend: any;
  try {
    backend = getBackend("extension-assisted-cdp", {
      transport: "http",
      httpBridgeUrl: extensionHttpBridgeUrlForArgs(args)
    });
    await backend.ping();
    const page = args.reuse_conversation
      ? await backend.claimTab({ url: args.tab_url_contains || serviceDefaults.chatgpt.url })
      : await backend.newTab({ url: CHATGPT_FRESH_URL, background: false });

    const requestedUrl = normalizeUrlLikeTarget(args.url || args.tab_url_contains);
    if (args.reuse_conversation && requestedUrl) {
      await page.navigate(requestedUrl, { waitUntil: "domcontentloaded", timeoutMs: Math.min(args.timeout_ms || 60000, 30000) });
    } else if (!args.reuse_conversation) {
      await page.navigate(CHATGPT_FRESH_URL, { waitUntil: "load", timeoutMs: Math.min(args.timeout_ms || 60000, 30000) });
    }

    const snapshot = await page.textSnapshot();
    if (loginRequiredForService("chatgpt", snapshot.url || "")) {
      return imageErrorOutput(ConsumerErrorCodes.LOGIN_REQUIRED, "ChatGPT login is required before image generation");
    }

    await page.waitForSelector(serviceDefaults.chatgpt.promptSelector, { state: "visible", timeoutMs: Math.min(args.timeout_ms || 60000, 15000) });
    if (!(await extensionElementCount(page, CHATGPT_CREATE_IMAGE_RADIO_SELECTOR))) {
      await clickChatgptExtensionSelector(page, CHATGPT_IMAGE_MENU_BUTTON_SELECTOR, 8000, "ChatGPT composer image-mode menu button was not found");
    }
    await clickChatgptExtensionSelector(page, CHATGPT_CREATE_IMAGE_RADIO_SELECTOR, 8000, "ChatGPT Create image menuitemradio was not found");
    await page.waitForSelector(CHATGPT_IMAGE_MODE_ACTIVE_SELECTOR, { state: "visible", timeoutMs: 8000 });

    await page.fill({ selector: serviceDefaults.chatgpt.promptSelector }, args.prompt, { timeoutMs: Math.min(args.timeout_ms || 60000, 15000) });
    const sendSelector = sendButtonSelector("chatgpt");
    await waitForExtensionSelector(page, sendSelector, 5000, "chatgpt send button was not found");
    await page.queryElements(sendSelector, { limit: 3 });
    await clickChatgptExtensionSelector(page, sendSelector, 5000, "chatgpt send button was not found");
    await page.waitForSelector(CHATGPT_IMAGE_RENDERED_SELECTOR, { state: "visible", timeoutMs: args.timeout_ms || 120000 });
    const imageCandidates = await page.queryElements(CHATGPT_IMAGE_OPEN_VIEWER_SELECTOR, { limit: 5 });
    if (!imageCandidates.length) {
      return imageErrorOutput(ConsumerErrorCodes.COMMAND_TIMEOUT, "ChatGPT generated image did not render before timeout", { expected_selector: CHATGPT_IMAGE_OPEN_VIEWER_SELECTOR });
    }

    const postImageSnapshot = await page.textSnapshot();
    await page.assetsList();
    const bundle = await page.assetsBundle();
    const generatedAsset = bundle.assets.find((asset: any) => asset.type === "image" && /\\.(png|jpe?g|webp|gif|avif)(?:[?#]|$)/i.test(asset.url))
      || bundle.assets.find((asset: any) => asset.type === "image");
    const conversationUrl = postImageSnapshot.url || snapshot.url || serviceDefaults.chatgpt.url;
    const result = await artifactClickRunner(runtime)({
      profile: args.profile,
      tabUrlContains: args.tab_url_contains || conversationUrl || serviceDefaults.chatgpt.url,
      buttonSelector: (runtime as any).artifactClick ? 'img[alt^="Generated image" i]' : CHATGPT_IMAGE_OPEN_VIEWER_SELECTOR,
      followUpSelector: (runtime as any).artifactClick ? '[data-testid="fullscreen-shell-header"] button[aria-label="Save"], [role="dialog"] button[aria-label="Save"]' : CHATGPT_IMAGE_DOWNLOAD_BUTTON_SELECTOR,
      downloadDir: args.download_dir,
      filenamePattern: "\\.(png|jpg|jpeg|webp)$",
      timeoutMs: args.timeout_ms || 90000,
      locateTimeoutMs: 15000,
      pageReadyEvidence: {
        backend: "extension-assisted-cdp",
        capturedAt: bundle.capturedAt,
        assetCount: bundle.assets.length,
        generatedAssetUrl: generatedAsset?.url || null,
        imageCandidateCount: imageCandidates.length
      }
    });
    return artifactClickResultToSafeOutput(result, { dimensions: null, download_filename: path.basename(result.path || "") });
  } catch (error: any) {
    if (isConsumerErrorCode(error?.errorCode)) {
      return imageErrorOutput(error.errorCode, error.message || error.errorCode, error?.evidence ? { evidence: error.evidence } : {});
    }
    if (error?.errorCode === ConsumerErrorCodes.COMMAND_TIMEOUT || error?.errorCode === "COMMAND_TIMEOUT") {
      return imageErrorOutput(ConsumerErrorCodes.COMMAND_TIMEOUT, error.message || "Generated image did not render before timeout");
    }
    if (error?.errorCode === ConsumerErrorCodes.ELEMENT_NOT_FOUND || error?.errorCode === "ELEMENT_NOT_FOUND") {
      return imageErrorOutput(ConsumerErrorCodes.ELEMENT_NOT_FOUND, error.message || "Expected image control was not found", { expected_selector: error.evidence?.selector || CHATGPT_IMAGE_DOWNLOAD_BUTTON_SELECTOR });
    }
    throw error;
  } finally {
    await backend?.finalize?.().catch?.(() => undefined);
    releaseProfileLease(args.profile, lease);
  }
}

async function generateGeminiImageWithExtensionBackend(args: any, runtime: Required<BrowserToolRuntime>): Promise<Record<string, unknown>> {
  assertPromptAllowed(args.prompt);
  requireAbsoluteDir(args.download_dir);
  assertNotPublishDeniedLabel("Download full size image", { tool: "webai.gemini.generate_image" });
  const lease = acquireProfileLease(args.profile);
  let backend: any;
  try {
    backend = getBackend("extension-assisted-cdp", {
      transport: "http",
      httpBridgeUrl: extensionHttpBridgeUrlForArgs(args)
    });
    await backend.ping();
    const page = await extensionGeminiPage(args, backend, GEMINI_FRESH_COMPOSER_URL);
    const snapshot = await page.textSnapshot();
    if (loginRequiredForService("gemini", snapshot.url || "")) {
      return imageErrorOutput(ConsumerErrorCodes.LOGIN_REQUIRED, "Gemini login is required before image generation");
    }

    await activateGeminiImageModeWithExtension(page, args.timeout_ms || 60000);
    await page.waitForSelector(GEMINI_IMAGE_PROMPT_SELECTOR, { state: "visible", timeoutMs: Math.min(args.timeout_ms || 60000, 15000) });
    await page.fill({ selector: GEMINI_IMAGE_PROMPT_SELECTOR }, args.prompt, { timeoutMs: Math.min(args.timeout_ms || 60000, 15000) });
    await extensionSleep(GEMINI_SEND_BUTTON_HYDRATION_WAIT_MS);
    const sendSelector = sendButtonSelector("gemini");
    await page.waitForSelector(sendSelector, { state: "visible", timeoutMs: 5000 });
    await page.queryElements(sendSelector, { limit: 3 });
    await page.click({ selector: sendSelector }, { timeoutMs: 5000 });
    await page.waitForSelector(GEMINI_IMAGE_RENDERED_SELECTOR, { state: "visible", timeoutMs: args.timeout_ms || 120000 });
    const imageCandidates = await page.queryElements(GEMINI_IMAGE_RENDERED_SELECTOR, { limit: 5 });
    if (!imageCandidates.length) {
      return imageErrorOutput(ConsumerErrorCodes.COMMAND_TIMEOUT, "Gemini generated image did not render before timeout", { expected_selector: GEMINI_IMAGE_RENDERED_SELECTOR });
    }

    const postImageSnapshot = await page.textSnapshot();
    await page.assetsList();
    const bundle = await page.assetsBundle();
    const generatedAsset = bundle.assets.find((asset: any) => asset.type === "image" && /\\.(png|jpe?g|webp|gif|avif)(?:[?#]|$)/i.test(asset.url))
      || bundle.assets.find((asset: any) => asset.type === "image");
    const conversationUrl = postImageSnapshot.url || snapshot.url || serviceDefaults.gemini.url;
    const result = await artifactClickRunner(runtime)({
      profile: args.profile,
      tabUrlContains: args.tab_url_contains || conversationUrl || serviceDefaults.gemini.url,
      buttonSelector: GEMINI_IMAGE_RENDERED_SELECTOR,
      followUpSelector: GEMINI_IMAGE_RENDERED_SELECTOR,
      downloadDir: args.download_dir,
      filenamePattern: "\\.(png|jpg|jpeg|webp)$",
      timeoutMs: args.timeout_ms || 90000,
      pageReadyEvidence: {
        backend: "extension-assisted-cdp",
        capturedAt: bundle.capturedAt,
        assetCount: bundle.assets.length,
        generatedAssetUrl: generatedAsset?.url || null,
        imageCandidateCount: imageCandidates.length
      }
    });
    return artifactClickResultToSafeOutput(result, { dimensions: null, download_filename: path.basename(result.path || "") });
  } catch (error: any) {
    const code = extensionErrorCode(error);
    return imageErrorOutput(code, error?.message || code, error?.evidence ? { evidence: error.evidence } : {});
  } finally {
    await backend?.finalize?.().catch?.(() => undefined);
    releaseProfileLease(args.profile, lease);
  }
}

async function generateGeminiVideoWithExtensionBackend(args: any, runtime: Required<BrowserToolRuntime>): Promise<Record<string, unknown>> {
  assertPromptAllowed(args.prompt);
  requireAbsoluteDir(args.download_dir);
  assertNotPublishDeniedLabel("Download video", { tool: "webai.gemini.generate_video" });
  const lease = acquireProfileLease(args.profile);
  let backend: any;
  try {
    backend = getBackend("extension-assisted-cdp", {
      transport: "http",
      httpBridgeUrl: extensionHttpBridgeUrlForArgs(args)
    });
    await backend.ping();
    const page = await extensionGeminiPage(args, backend, GEMINI_FRESH_COMPOSER_URL);
    const snapshot = await page.textSnapshot();
    if (loginRequiredForService("gemini", snapshot.url || "")) {
      return videoErrorOutput(ConsumerErrorCodes.LOGIN_REQUIRED, "Gemini login is required before video generation");
    }

    await activateGeminiVideoModeWithExtension(page, args.timeout_ms || 300000);
    const quotaSnapshot = await page.textSnapshot().catch(() => null);
    if (GEMINI_VIDEO_QUOTA_RE.test(String(quotaSnapshot?.text || ""))) {
      return videoErrorOutput(ConsumerErrorCodes.PLAN_OR_QUOTA_REQUIRED, "Gemini Veo video-generation quota exhausted", { expected_selector: GEMINI_VIDEO_QUOTA_TEXT_SIGNAL });
    }
    await page.waitForSelector(GEMINI_VIDEO_PROMPT_SELECTOR, { state: "visible", timeoutMs: Math.min(args.timeout_ms || 300000, 15000) });
    await page.fill({ selector: GEMINI_VIDEO_PROMPT_SELECTOR }, args.prompt, { timeoutMs: Math.min(args.timeout_ms || 300000, 15000) });
    await extensionSleep(GEMINI_SEND_BUTTON_HYDRATION_WAIT_MS);
    const sendSelector = sendButtonSelector("gemini");
    await page.waitForSelector(sendSelector, { state: "visible", timeoutMs: 5000 });
    await page.queryElements(sendSelector, { limit: 3 });
    await page.click({ selector: sendSelector }, { timeoutMs: 5000 });
    await waitForGeminiVideoDownloadOrQuota(page, args.timeout_ms || 300000);
    const videoCandidates = await page.queryElements(GEMINI_VIDEO_DOWNLOAD_BUTTON_SELECTOR, { limit: 5 });
    if (!videoCandidates.length) {
      return videoErrorOutput(ConsumerErrorCodes.COMMAND_TIMEOUT, "Gemini generated video did not render before timeout", { expected_selector: GEMINI_VIDEO_DOWNLOAD_BUTTON_SELECTOR });
    }

    const postVideoSnapshot = await page.textSnapshot();
    await page.assetsList();
    const bundle = await page.assetsBundle();
    const generatedAsset = bundle.assets.find((asset: any) => /\\.(mp4|webm|mov|m4v)(?:[?#]|$)/i.test(asset.url));
    const conversationUrl = postVideoSnapshot.url || snapshot.url || serviceDefaults.gemini.url;
    const result = await artifactClickRunner(runtime)({
      profile: args.profile,
      tabUrlContains: args.tab_url_contains || conversationUrl || serviceDefaults.gemini.url,
      buttonSelector: GEMINI_VIDEO_DOWNLOAD_BUTTON_SELECTOR,
      downloadDir: args.download_dir,
      filenamePattern: "\\.(mp4|webm|mov|m4v)$",
      timeoutMs: Math.min(120000, args.timeout_ms || 300000),
      noDisconnect: true,
      pageReadyEvidence: {
        backend: "extension-assisted-cdp",
        capturedAt: bundle.capturedAt,
        assetCount: bundle.assets.length,
        generatedAssetUrl: generatedAsset?.url || null,
        videoCandidateCount: videoCandidates.length
      }
    });
    return artifactClickResultToSafeOutput(result, { download_filename: path.basename(result.path || "") });
  } catch (error: any) {
    const code = extensionErrorCode(error);
    return videoErrorOutput(code, error?.message || code, error?.evidence ? { evidence: error.evidence } : {});
  } finally {
    await backend?.finalize?.().catch?.(() => undefined);
    releaseProfileLease(args.profile, lease);
  }
}

async function generateFileOnPage(service: "chatgpt" | "claude", args: any, runtime: Required<BrowserToolRuntime>): Promise<Record<string, unknown>> {
  assertPromptAllowed(args.prompt);
  // 2026-05-21 (#16 R1): pptx removed from the unsupported set after a live probe
  // (chatgpt-9223) confirmed ChatGPT web reliably produces a real downloadable
  // .pptx file via the post-revamp file-card UI when prompted explicitly (file-card
  // first icon button triggers the interpreter/download → estuary/content OOXML
  // stream, same shape as the #12 .docx path). xlsx remains rejected until
  // independently probed.
  const UNSUPPORTED_GENERATE_FILE_EXTS = new Set(["xlsx"]);
  if (UNSUPPORTED_GENERATE_FILE_EXTS.has(String(args.expected_extension))) {
    throw new WebAiToolError(
      ConsumerErrorCodes.INVALID_ARGS,
      `expected_extension="${args.expected_extension}" is not supported on webai_${service}_generate_file: native downloadable .xlsx generation is not reliably produced by the driven ${service}-web path. Supported: docx, pptx (and code/text artifacts: py, md, csv, svg, html, mmd, pdf).`
    );
  }
  requireAbsoluteDir(args.download_dir);
  assertNotPublishDeniedLabel("Download", { tool: `webai.${service}.generate_file` });
  const lease = acquireProfileLease(args.profile);
  try {
    const promptResult = await sendPromptOnPage(service, args, runtime);
    const conversationUrl = typeof promptResult.chat_url === "string" && promptResult.chat_url ? promptResult.chat_url : undefined;
    // ChatGPT post-revamp file-card: the dedicated download chip is the FIRST unnamed
    // icon button in the file-card header row (sibling of the truncated filename text).
    // Verified live 2026-05-21 on chatgpt-9223: click triggers GET
    //   backend-api/conversation/<id>/interpreter/download (JSON pointer hop-1)
    // then backend-api/estuary/content (HTTP 200,
    //   Content-Type: application/vnd.openxmlformats-officedocument.presentationml.presentation)
    // and a real Browser.downloadWillBegin with the suggestedFilename. The previous
    // 'button.behavior-btn' anchor is DEAD (zero matches in the current DOM).
    //
    // #16 R2 (2026-05-21): the file card streams in AFTER sendPromptOnPage's
    // text-response completion signal fires (consumer cycle#26 hit
    // ELEMENT_NOT_FOUND with selector count=0 at the moment artifactClick
    // ran; later probe of the same conversation showed count=1 with the file
    // card fully rendered). Bound a pre-locate wait on the file-card filename
    // text so we either give the file card up to 30s to render OR surface a
    // diagnostic ARTIFACT_DOWNLOAD_TIMEOUT identifying the file-card render
    // race, instead of leaking the generic ELEMENT_NOT_FOUND.
    const buttonSelector = service === "chatgpt"
      ? CHATGPT_GENERATED_FILE_DOWNLOAD_SELECTOR
      : args.artifact_class === "document"
        ? 'button[aria-label="Download"]'
        : `button[aria-label^="Download"]`;
    // The managed-CDP ChatGPT path keeps its established wider locate window for
    // the post-response file-card render race; the extension-assisted drivers use
    // the format-aware locate budget above.
    const chatgptArtifactTimeoutMs = Math.min(Number(args.timeout_ms || 480000), 480000);
    const artifactOptions = {
      profile: args.profile,
      tabUrlContains: args.tab_url_contains || conversationUrl || serviceDefaults[service].url,
      buttonSelector,
      downloadDir: args.download_dir,
      filenamePattern: `\\.${args.expected_extension}$`,
      timeoutMs: service === "chatgpt" ? chatgptArtifactTimeoutMs : Math.min(Number(args.timeout_ms || 60000), 60000),
      // #16 R2 (2026-05-21): ChatGPT file-card download chip needs the
      // JS-click fallback (React onClick on inner SVG isn't reached by raw
      // CDP Input.dispatchMouseEvent — confirmed live). The chip's onClick
      // is idempotent so the dual-fire produces a single download.
      ...(service === "chatgpt" ? { locateTimeoutMs: 360000, useJsClickFallback: true } : {})
    };
    const result = service === "chatgpt"
      ? await runArtifactClickWithCdpReadinessRetry(runtime, artifactOptions)
      : await artifactClickRunner(runtime)(artifactOptions);
    return artifactClickResultToSafeOutput(result, service === "chatgpt" ? { suggested_filename: result.suggestedFilename || result.downloadFilename || path.basename(result.path || "") } : { artifact_name: result.suggestedFilename || result.downloadFilename || path.basename(result.path || "") });
  } finally { releaseProfileLease(args.profile, lease); }
}

async function generateImageOnPage(service: "chatgpt" | "gemini", args: any, runtime: Required<BrowserToolRuntime>): Promise<Record<string, unknown>> {
  assertPromptAllowed(args.prompt);
  requireAbsoluteDir(args.download_dir);
  assertNotPublishDeniedLabel("Download full size image", { tool: `webai.${service}.generate_image` });
  const lease = acquireProfileLease(args.profile);
  try {
    const promptArgs = { ...args, __forceEnterToSend: true, __expectImageResponse: true };
    let conversationUrl: string | undefined;
    const promptResult = await withManagedPage(args, runtime, targetUrlFor(service, args), async (page) => {
      if (service === "chatgpt") {
        await navigateChatgptFreshIfNeeded(page, args);
        await activateChatgptImageMode(page);
      }
      if (service === "gemini") {
        await navigateGeminiFreshIfNeeded(page, { ...args, __forceFreshComposer: true });
        await activateGeminiImageMode(page);
        promptArgs.__promptSelector = GEMINI_IMAGE_PROMPT_SELECTOR;
      }
      const result = await sendPromptInExistingPage(service, promptArgs, page, Date.now());
      if (result.errorCode) return result;
      await waitForGeneratedImageRendered(service, page, args.timeout_ms || 120000);
      // The conversation URL only settles AFTER the image renders (Gemini/ChatGPT
      // navigate from the fresh-composer URL to /app/<id> once the turn lands).
      // Re-read it here so the artifact-click stage targets the correct tab.
      const settledUrl = page.url?.();
      if (typeof settledUrl === "string" && settledUrl) result.chat_url = settledUrl;
      return result;
    });
    if (promptResult.errorCode) {
      return safeOutput({
        path: "",
        sha256: "",
        size_bytes: 0,
        dimensions: null,
        download_filename: "",
        errorCode: promptResult.errorCode,
        ...(promptResult.error_code ? { error_code: promptResult.error_code } : {}),
        message: promptResult.errorCode === ConsumerErrorCodes.COMMAND_TIMEOUT ? "Image generation did not complete before timeout" : "Image generation prompt failed before download"
      });
    }
    conversationUrl = typeof promptResult.chat_url === "string" && promptResult.chat_url ? promptResult.chat_url : undefined;
    // Both services need a two-step CDP artifact-click: open an affordance,
    // then click the actual download control. ChatGPT: click the generated
    // image → full-screen viewer → Save. Gemini: more-menu → image-download.
    const openSelector = service === "chatgpt"
      ? ((runtime as any).artifactClick ? 'img[alt^="Generated image" i]' : CHATGPT_IMAGE_OPEN_VIEWER_SELECTOR)
      : GEMINI_IMAGE_RENDERED_SELECTOR;
    const downloadSelector = service === "chatgpt"
      ? ((runtime as any).artifactClick ? '[data-testid="fullscreen-shell-header"] button[aria-label="Save"], [role="dialog"] button[aria-label="Save"]' : CHATGPT_IMAGE_DOWNLOAD_BUTTON_SELECTOR)
      : 'button[aria-label="Download full size image"]';
    const result = await artifactClickRunner(runtime)({
      profile: args.profile,
      tabUrlContains: args.tab_url_contains || conversationUrl || serviceDefaults[service].url,
      buttonSelector: openSelector,
      followUpSelector: downloadSelector,
      downloadDir: args.download_dir,
      filenamePattern: "\\.(png|jpg|jpeg|webp)$",
      timeoutMs: args.timeout_ms || 90000,
      ...(service === "chatgpt" ? { locateTimeoutMs: 15000 } : {})
    });
    return artifactClickResultToSafeOutput(result, { dimensions: null, download_filename: path.basename(result.path || "") });
  } catch (error: any) {
    if (error?.errorCode === ConsumerErrorCodes.COMMAND_TIMEOUT || error?.errorCode === "COMMAND_TIMEOUT") {
      return safeOutput({ path: "", sha256: "", size_bytes: 0, dimensions: null, download_filename: "", errorCode: ConsumerErrorCodes.COMMAND_TIMEOUT, error_code: ConsumerErrorCodes.COMMAND_TIMEOUT, message: error.message || "Generated image did not render before timeout" });
    }
    if (error?.errorCode === ConsumerErrorCodes.ELEMENT_NOT_FOUND || error?.errorCode === "ELEMENT_NOT_FOUND") {
      return safeOutput({ path: "", sha256: "", size_bytes: 0, dimensions: null, download_filename: "", errorCode: ConsumerErrorCodes.ELEMENT_NOT_FOUND, error_code: ConsumerErrorCodes.ELEMENT_NOT_FOUND, expected_selector: error.evidence?.selector || (service === "gemini" ? GEMINI_IMAGE_RENDERED_SELECTOR : CHATGPT_IMAGE_DOWNLOAD_BUTTON_SELECTOR) });
    }
    throw error;
  } finally { releaseProfileLease(args.profile, lease); }
}

// Poll the managed browser context for the docs.google.com/document/d/<id>
// page that "Export to Docs" opens in a NEW tab (live-observed 2026-05-15: the
// Docs page appeared within ~14s of the click). Returns its URL or null if no
// real Docs page materialised (honest absence -> ARTIFACT_VERIFICATION_FAILED).
async function awaitSpawnedDocsPage(page: any, timeoutMs: number): Promise<{ url: string; docPage: any } | null> {
  const context = typeof page?.context === "function" ? page.context() : undefined;
  if (!context || typeof context.pages !== "function") return null;
  const deadline = Date.now() + Math.max(1, timeoutMs);
  while (Date.now() < deadline) {
    const pages = context.pages() || [];
    for (const candidate of pages) {
      const url = typeof candidate?.url === "function" ? String(candidate.url() || "") : "";
      if (GOOGLE_DOCS_URL_RE.test(url)) return { url, docPage: candidate };
    }
    if (typeof page.waitForTimeout === "function") await page.waitForTimeout(1000).catch(() => undefined);
    else await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return null;
}

function geminiCanvasToDocsDocumentPrompt(prompt: string): string {
  const raw = String(prompt || "").trim();
  const stripped = raw
    .replace(/,?\s*then\s+export\s+to\s+Google\s+Docs\.?/ig, "")
    .replace(/\bexport\s+(?:it\s+)?to\s+Google\s+Docs\b\.?/ig, "")
    .trim();
  const base = stripped || raw || "a short editable document";
  if (/editable document/i.test(raw) && /not code|not an app/i.test(raw)) return raw;
  return `Use Canvas to draft an editable document for this request: ${base}. Make it a document, not code or an app. Do not open external apps.`;
}

function geminiCanvasToDocsReadyTimeoutMs(args: any): number {
  const value = Number(args?.response_timeout_ms);
  const configured = Number.isFinite(value) && value > 0 ? value : DEFAULT_RESPONSE_TIMEOUT_MS;
  // Command/MCP wrappers in the regression matrix may enforce a 180s ceiling;
  // keep the live Canvas-ready wait below that ceiling so selector/account
  // errors are surfaced as contract JSON instead of a killed process.
  return Math.min(configured, 150000);
}

async function canvasToDocs(args: any, runtime: Required<BrowserToolRuntime>): Promise<Record<string, unknown>> {
  assertPromptAllowed(args.prompt);
  // "Export to Docs" creates a PRIVATE Doc in the user's own Drive - it is not
  // a publish-class action. The publish-deny gate still rejects if Gemini ever
  // relabels it to a denied phrase; the sibling "Share Canvas" is never clicked.
  assertNotPublishDeniedLabel("Export to Docs", { tool: "webai.gemini.canvas_to_docs" });
  const lease = acquireProfileLease(args.profile);
  const title = args.title || null;
  const fail = (extra: Record<string, unknown> = {}) => safeOutput({ docs_url: null, docs_doc_id: null, title, errorCode: ConsumerErrorCodes.ARTIFACT_VERIFICATION_FAILED, error_code: ConsumerErrorCodes.ARTIFACT_VERIFICATION_FAILED, ...extra });
  try {
    return await withManagedPage(args, runtime, targetUrlFor("gemini", args), async (page) => {
      await navigateGeminiFreshIfNeeded(page, { ...args, __forceFreshComposer: true });
      if (loginRequiredForService("gemini", page.url?.() || "")) return loginRequiredResponse("gemini", page, Date.now());
      // 1. Activate Canvas mode (Upload & tools -> Canvas; ELEMENT_NOT_FOUND if absent).
      try {
        await activateGeminiCanvasMode(page);
      } catch (error: any) {
        if (error instanceof WebAiToolError) return safeOutput({ docs_url: null, docs_doc_id: null, title, errorCode: error.errorCode, error_code: error.errorCode, selector: error.evidence?.selector || null });
        throw error;
      }
      // 2. Send the prompt. A Canvas response carries NO assistant text and
      //    NEVER renders button[data-test-id="regenerate-button"] (live-
      //    observed 2026-05-15: the completed Canvas turn exposes
      //    thumb-up/copy/more + the canvas share-button, but no regenerate),
      //    so the text-length/regenerate completion gate can never fire and
      //    would always COMMAND_TIMEOUT. Use the same __expectImageResponse
      //    short-circuit the (GREEN) image path uses, then gate completion on
      //    the Canvas-ready signal: the "Share and export canvas" button.
      const docsPrompt = geminiCanvasToDocsDocumentPrompt(args.prompt);
      const canvasReadyTimeout = geminiCanvasToDocsReadyTimeoutMs(args);
      const result = await sendPromptInExistingPage("gemini", { ...args, prompt: docsPrompt, __promptSelector: GEMINI_IMAGE_PROMPT_SELECTOR, __forceEnterToSend: true, __expectImageResponse: true }, page, Date.now());
      if (result.errorCode) return safeOutput({ docs_url: null, docs_doc_id: null, title, errorCode: result.errorCode, ...(result.error_code ? { error_code: result.error_code } : {}) });
      // 3. Wait for the Canvas document to finish rendering (its share/export
      //    button is the authoritative "Canvas ready" marker), then open the
      //    export menu and click "Export to Docs".
      let shared = false;
      try {
        // Canvas-ready gate: if the share/export button never renders within
        // the response window, the Canvas genuinely did not finish -> honest
        // COMMAND_TIMEOUT (not ELEMENT_NOT_FOUND, which would mis-blame a
        // missing selector for a slow/failed generation).
        if (typeof page.waitForSelector === "function") {
          try {
            await page.waitForSelector(GEMINI_CANVAS_SHARE_BUTTON_SELECTOR, { state: "visible", timeout: canvasReadyTimeout });
          } catch (error: any) {
            throw new WebAiToolError(ConsumerErrorCodes.COMMAND_TIMEOUT, "Gemini Canvas did not finish rendering before timeout", { selector: GEMINI_CANVAS_SHARE_BUTTON_SELECTOR, cause: error?.message || String(error) });
          }
        }
        await requireAndClick(page, GEMINI_CANVAS_SHARE_BUTTON_SELECTOR, "Gemini canvas share/export button was not found");
        await page.waitForSelector?.(GEMINI_CANVAS_EXPORT_DOCS_SELECTOR, { state: "visible", timeout: 8000 });
        await requireAndClick(page, GEMINI_CANVAS_EXPORT_DOCS_SELECTOR, "Gemini 'Export to Docs' menu item was not found");
        shared = true;
      } catch (error: any) {
        const code = error instanceof WebAiToolError ? error.errorCode : ConsumerErrorCodes.ELEMENT_NOT_FOUND;
        return safeOutput({ docs_url: null, docs_doc_id: null, title, errorCode: code, error_code: code, selector: (error?.evidence?.selector) || GEMINI_CANVAS_EXPORT_DOCS_SELECTOR });
      }
      // 4. Wait for the spawned docs.google.com page; extract the real doc id.
      const spawned = shared ? await awaitSpawnedDocsPage(page, args.timeout_ms || 45000) : null;
      if (!spawned) return fail();
      const docId = GOOGLE_DOCS_URL_RE.exec(spawned.url)?.[1] || null;
      // Close the spawned Docs tab to keep the managed browser tidy; never
      // publish or share. A failed close is non-fatal.
      if (spawned.docPage && typeof spawned.docPage.close === "function") await spawned.docPage.close().catch(() => undefined);
      if (!docId) return fail();
      const docsUrl = `https://docs.google.com/document/d/${docId}/edit`;
      return safeOutput({ docs_url: docsUrl, docs_doc_id: docId, title, errorCode: null });
    });
  } catch (error: any) {
    if (error instanceof WebAiToolError) return safeOutput({ docs_url: null, docs_doc_id: null, title, errorCode: error.errorCode, error_code: error.errorCode });
    throw error;
  } finally { releaseProfileLease(args.profile, lease); }
}

// Drive the real Gemini (Veo) video generation flow, live-observed 2026-05-15:
// fresh composer -> activate Create video (Upload & tools / zero-state chip) ->
// send prompt -> "Generating your video..." (~1-2 min) -> a video player with
// button[aria-label="Download video"] renders -> CDP artifact-click downloads
// the file. ~105s observed for an 8s clip on Fast tier. Honest terminal
// errorCode (no synthesis) when any stage genuinely fails.
async function geminiVideoVisibleText(page: any): Promise<string> {
  if (typeof page.textSnapshot === "function") {
    const extensionSnapshot = await page.textSnapshot().catch(() => null);
    if (typeof extensionSnapshot?.text === "string") return extensionSnapshot.text;
    if (typeof extensionSnapshot?.visibleText === "string") return extensionSnapshot.visibleText;
  }
  const snapshot = await readPageSnapshot(page, { includePortals: true }).catch(() => null);
  return typeof snapshot?.visibleText === "string" ? snapshot.visibleText : "";
}

async function geminiVideoSelectorCount(page: any, selector: string): Promise<number> {
  const locator = page.locator?.(selector);
  if (locator?.count) return await locator.count().catch(() => 0) || 0;
  const elements = typeof page.queryElements === "function" ? await page.queryElements(selector, { limit: 1 }).catch(() => []) : [];
  return Array.isArray(elements) ? elements.length : 0;
}

async function geminiVideoDelay(page: any, ms: number): Promise<void> {
  if (ms <= 0) return;
  if (typeof page.waitForTimeout === "function") {
    await page.waitForTimeout(ms).catch(() => undefined);
    return;
  }
  await extensionSleep(ms);
}

async function readGeminiVideoQuotaSignal(page: any): Promise<{ selector: string; evidence: Record<string, unknown> } | null> {
  const visibleText = await geminiVideoVisibleText(page);
  const quotaMatch = GEMINI_VIDEO_QUOTA_RE.exec(visibleText);
  if (!quotaMatch) return null;
  const disabledSelectors: string[] = [];
  for (const selector of GEMINI_VIDEO_DISABLED_COMPOSER_SELECTORS) {
    const count = await geminiVideoSelectorCount(page, selector);
    if (count > 0) disabledSelectors.push(selector);
  }
  const index = Math.max(0, visibleText.toLowerCase().indexOf(quotaMatch[0].toLowerCase()));
  const excerpt = visibleText.slice(Math.max(0, index - 80), Math.min(visibleText.length, index + quotaMatch[0].length + 120)).replace(/\s+/g, " ").trim();
  return {
    selector: disabledSelectors.length ? `${GEMINI_VIDEO_QUOTA_TEXT_SIGNAL} AND ${disabledSelectors[0]}` : GEMINI_VIDEO_QUOTA_TEXT_SIGNAL,
    evidence: {
      quota_text_match: quotaMatch[0],
      disabled_composer_selector: disabledSelectors[0] || null,
      visible_text_excerpt: excerpt
    }
  };
}

async function detectGeminiVideoQuotaExhausted(page: any, timeoutMs = 8000): Promise<{ selector: string; evidence: Record<string, unknown> } | null> {
  const startedAt = Date.now();
  const budgetMs = Math.min(8000, Math.max(1, timeoutMs));
  do {
    const quota = await readGeminiVideoQuotaSignal(page);
    if (quota) return quota;
    const remaining = budgetMs - (Date.now() - startedAt);
    if (remaining <= 0) break;
    await geminiVideoDelay(page, Math.min(250, remaining));
  } while (Date.now() - startedAt < budgetMs);
  return null;
}

async function pollForVeoQuotaError(page: any, deadlineMs: number): Promise<void> {
  const quota = await detectGeminiVideoQuotaExhausted(page, deadlineMs);
  if (!quota) return;
  throw new WebAiToolError(ConsumerErrorCodes.PLAN_OR_QUOTA_REQUIRED, "Gemini Veo video-generation quota exhausted", { selector: quota.selector, evidence: quota.evidence });
}

async function throwIfGeminiVideoQuotaExhausted(page: any, timeoutMs = 8000): Promise<void> {
  const quota = await detectGeminiVideoQuotaExhausted(page, timeoutMs);
  if (!quota) return;
  throw new WebAiToolError(ConsumerErrorCodes.PLAN_OR_QUOTA_REQUIRED, "Gemini Veo video-generation quota exhausted", { selector: quota.selector, evidence: quota.evidence });
}

async function waitForGeminiVideoDownloadOrQuota(page: any, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + Math.max(1, timeoutMs);
  let lastError: any;
  while (Date.now() <= deadline) {
    await pollForVeoQuotaError(page, 1);
    if (await geminiVideoSelectorCount(page, GEMINI_VIDEO_DOWNLOAD_BUTTON_SELECTOR) > 0) return;
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    const slice = Math.min(1000, remaining);
    if (typeof page.waitForSelector === "function") {
      try {
        const waitOptions = typeof page.textSnapshot === "function" ? { state: "visible", timeoutMs: slice } : { state: "visible", timeout: slice };
        await page.waitForSelector(GEMINI_VIDEO_DOWNLOAD_BUTTON_SELECTOR, waitOptions);
        return;
      } catch (error) {
        lastError = error;
      }
    } else {
      await geminiVideoDelay(page, slice);
    }
  }
  await throwIfGeminiVideoQuotaExhausted(page, 8000);
  throw new WebAiToolError(ConsumerErrorCodes.COMMAND_TIMEOUT, "Gemini video did not finish generating before timeout", { selector: GEMINI_VIDEO_DOWNLOAD_BUTTON_SELECTOR, cause: lastError?.message || String(lastError || "") });
}

async function runGeminiVideoGeneration(args: any, runtime: Required<BrowserToolRuntime>, record: WebAiTaskRecord): Promise<void> {
  const timeoutMs = Number(args.timeout_ms) > 0 ? Number(args.timeout_ms) : 300000;
  let conversationUrl: string | undefined;
  await withManagedPage(args, runtime, targetUrlFor("gemini", args), async (page) => {
    record.progress_label = "navigating Gemini composer";
    await navigateGeminiFreshIfNeeded(page, { ...args, __forceFreshComposer: true });
    if (loginRequiredForService("gemini", page.url?.() || "")) throw new WebAiToolError(ConsumerErrorCodes.LOGIN_REQUIRED, "Gemini login required for video generation");
    record.progress_label = "activating Create video mode";
    try {
      await activateGeminiVideoMode(page);
    } catch (error) {
      await throwIfGeminiVideoQuotaExhausted(page, 8000);
      throw error;
    }
    await throwIfGeminiVideoQuotaExhausted(page, 8000);
    record.progress_label = "submitting video prompt";
    const result = await sendPromptInExistingPage("gemini", { ...args, __expectImageResponse: true, __forceEnterToSend: true, __promptSelector: GEMINI_VIDEO_PROMPT_SELECTOR }, page, Date.now());
    if (result.errorCode) throw new WebAiToolError(String(result.errorCode), "Gemini video prompt failed before generation started");
    record.progress_label = "generating video (this can take 1-2 min)";
    try {
      await waitForGeminiVideoDownloadOrQuota(page, timeoutMs);
    } catch (error: any) {
      await throwIfGeminiVideoQuotaExhausted(page, 8000);
      if (error instanceof WebAiToolError) throw error;
      throw new WebAiToolError(ConsumerErrorCodes.COMMAND_TIMEOUT, "Gemini video did not finish generating before timeout", { selector: GEMINI_VIDEO_DOWNLOAD_BUTTON_SELECTOR, cause: error?.message || String(error) });
    }
    const settled = page.url?.();
    if (typeof settled === "string" && settled) conversationUrl = settled;
  });
  record.progress_label = "downloading generated video";
  const dl = await artifactClickRunner(runtime)({
    profile: args.profile,
    tabUrlContains: args.tab_url_contains || conversationUrl || serviceDefaults.gemini.url,
    buttonSelector: GEMINI_VIDEO_DOWNLOAD_BUTTON_SELECTOR,
    downloadDir: args.download_dir,
    filenamePattern: "\\.(mp4|webm|mov|m4v)$",
    timeoutMs: Math.min(120000, timeoutMs),
    noDisconnect: true
  });
  const artifactPath = dl.path || (dl as any).savedPath || "";
  const stat = artifactPath && fs.existsSync(artifactPath) ? fs.statSync(artifactPath) : undefined;
  const size = (dl as any).size_bytes ?? (dl as any).size ?? stat?.size ?? 0;
  if (!artifactPath || !fs.existsSync(artifactPath) || !size || !isValidMp4Ftyp(artifactPath)) {
    throw new WebAiToolError(ConsumerErrorCodes.ARTIFACT_VERIFICATION_FAILED, "Gemini video download produced no valid MP4 file on disk");
  }
  record.result = {
    path: artifactPath,
    sha256: dl.sha256 || sha256File(artifactPath),
    size_bytes: size,
    download_filename: (dl as any).downloadFilename || path.basename(artifactPath)
  };
}


export interface GeminiAccountPoolCandidate {
  profile: string;
  cdp_port?: number;
}

function parseGeminiPoolCsv(csv: string): string[] {
  return csv.split(",").map((item) => item.trim()).filter(Boolean);
}

function readGeminiAccountPoolConfig(): GeminiAccountPoolCandidate[] {
  const configPath = path.join(process.cwd(), "configs", "gemini-account-pool.json");
  try {
    if (!fs.existsSync(configPath)) return [];
    const parsed = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    const pool = parsed?.pools?.["gemini-video"];
    if (!Array.isArray(pool)) return [];
    return pool
      .filter((entry: any) => entry && typeof entry.profile === "string" && entry.profile.trim())
      .map((entry: any) => ({
        profile: entry.profile.trim(),
        ...(Number.isFinite(Number(entry.cdp_port)) ? { cdp_port: Number(entry.cdp_port) } : {})
      }));
  } catch {
    return [];
  }
}

export function resolveGeminiAccountPool(args: any): GeminiAccountPoolCandidate[] {
  const boundProfile = String(args.profile || "").trim();
  const explicit: GeminiAccountPoolCandidate[] = typeof args.account_pool === "string" && parseGeminiPoolCsv(args.account_pool).length > 0
    ? parseGeminiPoolCsv(args.account_pool).map((profile) => ({ profile }))
    : [];
  const fromEnv: GeminiAccountPoolCandidate[] = !explicit.length && typeof process.env.WAH_GEMINI_VIDEO_POOL === "string" && parseGeminiPoolCsv(process.env.WAH_GEMINI_VIDEO_POOL).length > 0
    ? parseGeminiPoolCsv(process.env.WAH_GEMINI_VIDEO_POOL).map((profile) => ({ profile }))
    : [];
  const declared: GeminiAccountPoolCandidate[] = explicit.length ? explicit : fromEnv.length ? fromEnv : readGeminiAccountPoolConfig();
  const source: GeminiAccountPoolCandidate[] = declared.length ? declared : [{ profile: boundProfile }];
  const boundEntry = source.find((entry) => entry.profile === boundProfile);
  const ordered = boundProfile ? [{ profile: boundProfile, ...(boundEntry?.cdp_port ? { cdp_port: boundEntry.cdp_port } : {}) }, ...source] : source;
  const seen = new Set<string>();
  const resolved: GeminiAccountPoolCandidate[] = [];
  for (const entry of ordered) {
    const profile = String(entry.profile || "").trim();
    if (!profile || seen.has(profile)) continue;
    seen.add(profile);
    resolved.push({ profile, ...(entry.cdp_port ? { cdp_port: entry.cdp_port } : {}) });
  }
  return resolved.length ? resolved : [{ profile: boundProfile }];
}

function validateExplicitGeminiAccountPool(args: any): void {
  if (!Object.prototype.hasOwnProperty.call(args, "account_pool") || args.account_pool === undefined) return;
  if (typeof args.account_pool !== "string") throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "account_pool must be a comma-separated profile list");
  const parts = args.account_pool.split(",");
  if (!parts.length || parts.some((part) => !part.trim())) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "account_pool must not contain empty profile names");
}

function videoTaskTimeoutMs(args: any): number {
  const value = Number(args.timeout_ms ?? args.timeoutMs ?? 300000);
  return Number.isFinite(value) && value > 0 ? value : 300000;
}

function isPidAlive(pid?: number): boolean {
  if (!pid || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function isValidMp4Ftyp(filePath: string): boolean {
  try {
    const fd = fs.openSync(filePath, "r");
    try {
      const buffer = Buffer.alloc(12);
      const bytes = fs.readSync(fd, buffer, 0, buffer.length, 0);
      return bytes >= 8 && buffer.toString("ascii", 4, 8) === "ftyp";
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return false;
  }
}

function persistVideoTask(database: CapabilityDatabase, record: WebAiTaskRecord): WebAiTaskRecord {
  return database.upsertWebAiTask(record);
}

function maybeMarkStaleVideoTask(database: CapabilityDatabase, record: WebAiTaskRecord): WebAiTaskRecord {
  if (!["queued", "running"].includes(record.status)) return record;
  const timeoutMs = Number(record.timeout_ms || 300000);
  const staleGraceMs = 60000;
  const started = Date.parse(record.started_at);
  const budgetExceeded = Number.isFinite(started) && Date.now() - started > timeoutMs + staleGraceMs;
  if (!budgetExceeded || isPidAlive(record.worker_pid)) return record;
  const stale: WebAiTaskRecord = {
    ...record,
    status: "failed",
    errorCode: ConsumerErrorCodes.COMMAND_TIMEOUT,
    progress_label: `failed: ${ConsumerErrorCodes.COMMAND_TIMEOUT}`
  };
  return persistVideoTask(database, stale);
}

function spawnDetachedGeminiVideoWorker(taskId: string, args: any, database: CapabilityDatabase): { pid?: number } {
  const workerPath = path.join(__dirname, "videoWorker.js");
  const encodedArgs = Buffer.from(JSON.stringify(args), "utf-8").toString("base64url");
  const child = childProcess.spawn(process.execPath, [workerPath, "--task-id", taskId, "--db-path", database.dbPath, "--args-b64", encodedArgs], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
    env: { ...process.env, WAH_SQLITE_PATH: database.dbPath }
  });
  child.unref();
  return { pid: child.pid };
}

function startGeminiVideoTask(args: any, runtime: Required<BrowserToolRuntime>): Record<string, unknown> {
  assertPromptAllowed(args.prompt);
  requireAbsoluteDir(args.download_dir);
  validateExplicitGeminiAccountPool(args);
  const resolvedPool = resolveGeminiAccountPool(args);
  for (const candidate of resolvedPool) {
    const active = runtime.database.getActiveWebAiTaskForProfile(candidate.profile);
    if (active) {
      const current = maybeMarkStaleVideoTask(runtime.database, active);
      if (["queued", "running"].includes(current.status)) throw new WebAiToolError(ConsumerErrorCodes.PROFILE_LEASE_BUSY, `profile ${candidate.profile} already has an active webai mutation lease`, { profile: candidate.profile, lease_id: active.lease_id });
    }
  }
  const task_id = safeTaskId();
  const lease = `lease_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
  const workerArgs = { ...args, __resolvedPool: resolvedPool };
  let record: WebAiTaskRecord = { task_id, status: "running", profile: args.profile, lease_id: lease, started_at: new Date().toISOString(), progress_label: "queued Gemini video generation", timeout_ms: videoTaskTimeoutMs(args) };
  record = persistVideoTask(runtime.database, record);
  try {
    const spawned = (runtime as any).spawnVideoWorker ? (runtime as any).spawnVideoWorker(task_id, workerArgs, runtime.database) : spawnDetachedGeminiVideoWorker(task_id, workerArgs, runtime.database);
    if (spawned?.pid) {
      const latest = runtime.database.getWebAiTask(task_id) || record;
      persistVideoTask(runtime.database, { ...latest, worker_pid: spawned.pid });
    }
  } catch (error: any) {
    persistVideoTask(runtime.database, { ...record, status: "failed", errorCode: ConsumerErrorCodes.COMMAND_TIMEOUT, progress_label: `failed: ${ConsumerErrorCodes.COMMAND_TIMEOUT}` });
  }
  return safeOutput({ task_id, status: record.status, profile: record.profile, lease_id: lease, started_at: record.started_at });
}

export async function runGeminiVideoTaskWorker(taskId: string, args: any, database = new CapabilityDatabase(), runtimeOverrides?: BrowserToolRuntime): Promise<void> {
  const runtime = runtimeOrDefault({ ...(runtimeOverrides as any || {}), database });
  const generateVideo = (runtime as any).generateGeminiVideo || runGeminiVideoGeneration;
  const quotaStore: GeminiQuotaStateStore = (runtime as any).geminiQuotaStateStore || new GeminiQuotaStateStore(args.__quotaStateRoot || process.cwd());
  const candidates: GeminiAccountPoolCandidate[] = Array.isArray(args.__resolvedPool) && args.__resolvedPool.length ? args.__resolvedPool : resolveGeminiAccountPool(args);
  let record = database.getWebAiTask(taskId);
  if (!record) {
    record = { task_id: taskId, status: "running", profile: args.profile, lease_id: `lease_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`, started_at: new Date().toISOString(), progress_label: "queued Gemini video generation", timeout_ms: videoTaskTimeoutMs(args), worker_pid: process.pid };
  } else {
    record = { ...record, status: "running", worker_pid: process.pid };
  }
  persistVideoTask(database, record);

  let generationCalls = 0;
  let quotaRotations = 0;
  for (const candidate of candidates) {
    if (quotaStore.isCooledDown(candidate.profile)) {
      record = persistVideoTask(database, { ...record, progress_label: `skipping cooled-down Gemini account ${candidate.profile}` });
      quotaRotations += 1;
      continue;
    }
    const attemptArgs = { ...args, profile: candidate.profile, ...(candidate.cdp_port ? { cdpPort: candidate.cdp_port } : {}) };
    record = persistVideoTask(database, { ...record, progress_label: `attempt account ${candidate.profile}` });
    try {
      generationCalls += 1;
      await generateVideo(attemptArgs, runtime, record);
      quotaStore.clear(candidate.profile);
      const result = { ...(record.result || {}), account_rotations: quotaRotations, accounts_tried_count: generationCalls };
      persistVideoTask(database, { ...record, status: "done", result, progress_label: "video generated and downloaded" });
      return;
    } catch (error: any) {
      if (error instanceof WebAiToolError && error.errorCode === ConsumerErrorCodes.PLAN_OR_QUOTA_REQUIRED) {
        quotaStore.markExhausted(candidate.profile, ConsumerErrorCodes.PLAN_OR_QUOTA_REQUIRED);
        quotaRotations += 1;
        continue;
      }
      const errorCode = (error instanceof WebAiToolError && error.errorCode) ? error.errorCode : ConsumerErrorCodes.COMMAND_TIMEOUT;
      persistVideoTask(database, { ...record, status: "failed", errorCode, result: { ...(record.result || {}), accounts_tried_count: generationCalls }, progress_label: `failed: ${errorCode}` });
      return;
    }
  }

  persistVideoTask(database, {
    ...record,
    status: "failed",
    errorCode: ConsumerErrorCodes.PLAN_OR_QUOTA_REQUIRED,
    result: { ...(record.result || {}), account_rotations: Math.max(0, quotaRotations), accounts_tried_count: generationCalls },
    progress_label: "all pooled Gemini accounts quota-exhausted"
  });
}


const CHATGPT_CANVAS_FORMAT_LABELS: Record<string, string> = {
  md: "Markdown Document",
  pdf: "PDF Document",
  docx: "Microsoft Word Document"
};

function defaultWebAiDownloadDir(): string {
  return path.join(process.cwd(), "data", "downloads");
}

function policyApprovalRequired(reason: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return safeOutput({ ok: false, errorCode: ConsumerErrorCodes.POLICY_APPROVAL_REQUIRED, error_code: ConsumerErrorCodes.POLICY_APPROVAL_REQUIRED, reason, ...extra });
}

function humanHandoffRequired(reason: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return safeOutput({ ok: false, errorCode: ConsumerErrorCodes.HUMAN_HANDOFF_REQUIRED, error_code: ConsumerErrorCodes.HUMAN_HANDOFF_REQUIRED, reason, ...extra });
}

function conversationIdFromUrl(url: string): string | null {
  return /\/c\/([^/?#]+)/.exec(url)?.[1] || null;
}

async function exportChatgptCanvas(args: any, runtime: Required<BrowserToolRuntime>): Promise<Record<string, unknown>> {
  const format = args.format || "md";
  const downloadDir = args.download_dir || defaultWebAiDownloadDir();
  requireAbsoluteDir(downloadDir);
  const label = CHATGPT_CANVAS_FORMAT_LABELS[format] || CHATGPT_CANVAS_FORMAT_LABELS.md;
  try {
    const result = await artifactClickRunner(runtime)({
      profile: args.profile || process.env.WAH_DEFAULT_PROFILE || "chatgpt",
      tabUrlContains: args.tab_url_contains,
      buttonSelector: CHATGPT_CANVAS_DOWNLOAD_BUTTON_SELECTOR,
      followUpTextRegex: label,
      downloadDir,
      filenamePattern: format === "md" ? "\\.md$" : `\\.${format}$`,
      timeoutMs: Math.min(Number(args.timeout_ms || 60000), 60000),
      openPanelIfMissing: "chatgpt-canvas"
    });
    const rawResult: any = result;
    const artifactPath = rawResult.path || rawResult.savedPath || "";
    const stat = artifactPath && fs.existsSync(artifactPath) ? fs.statSync(artifactPath) : undefined;
    return safeOutput({
      path: artifactPath,
      sha256: rawResult.sha256 || (artifactPath && fs.existsSync(artifactPath) ? sha256File(artifactPath) : ""),
      format,
      byteSize: rawResult.size_bytes ?? rawResult.sizeBytes ?? rawResult.size ?? stat?.size ?? 0
    });
  } catch (error: any) {
    const code = error?.errorCode || (/timeout/i.test(String(error?.message || error)) ? ConsumerErrorCodes.ARTIFACT_DOWNLOAD_TIMEOUT : ConsumerErrorCodes.ELEMENT_NOT_FOUND);
    const stable = code === ConsumerErrorCodes.ARTIFACT_DOWNLOAD_TIMEOUT || code === "ARTIFACT_DOWNLOAD_TIMEOUT"
      ? ConsumerErrorCodes.ARTIFACT_DOWNLOAD_TIMEOUT
      : ConsumerErrorCodes.ELEMENT_NOT_FOUND;
    return safeOutput({ path: "", sha256: "", format, byteSize: 0, errorCode: stable, error_code: stable });
  }
}

async function startChatgptDeepResearch(args: any, runtime: Required<BrowserToolRuntime>): Promise<Record<string, unknown>> {
  assertPromptAllowed(args.prompt);
  const lease = acquireProfileLease(args.profile);
  const task_id = safeTaskId();
  try {
    return await withManagedPage(args, runtime, targetUrlFor("chatgpt", args), async (page) => {
      await ensureChatgptChatSurface(page, args);
      await waitForHydratedSurface(page, serviceDefaults.chatgpt.promptSelector, Math.min(args.timeout_ms || 60000, 15000));
      if (loginRequiredForService("chatgpt", page.url?.() || "")) return loginRequiredResponse("chatgpt", page, Date.now());
      const selection = await selectChatgptModel(page, "Thinking");
      if (!selection.ok) return modelSelectionDriftResponse("chatgpt", page, Date.now(), selection.expected, selection.actual);
      await requireAndClick(page, CHATGPT_IMAGE_MENU_BUTTON_SELECTOR, "ChatGPT composer plus menu button was not found", { dismissInterceptors: true, dwellMs: 250 });
      try { await page.waitForSelector?.(CHATGPT_DEEP_RESEARCH_MENUITEM_SELECTOR, { state: "visible", timeout: 8000 }); } catch {}
      await requireAndClick(page, CHATGPT_DEEP_RESEARCH_MENUITEM_SELECTOR, "ChatGPT Deep research menuitemradio was not found", { dwellMs: 250 });
      try { await page.waitForSelector?.(CHATGPT_DEEP_RESEARCH_ACTIVE_SELECTOR, { state: "visible", timeout: 8000 }); } catch (error: any) {
        throw new WebAiToolError(ConsumerErrorCodes.MODE_UNCERTAIN, "ChatGPT Deep research mode did not expose its active pill", { selector: CHATGPT_DEEP_RESEARCH_ACTIVE_SELECTOR, cause: error?.message || String(error) });
      }
      const box = page.locator(serviceDefaults.chatgpt.promptSelector).first();
      await box.waitFor({ state: "visible", timeout: Math.min(args.timeout_ms || 60000, 15000) });
      await box.fill?.(args.prompt).catch(async () => { await box.click(); await page.keyboard?.type(args.prompt); });
      await page.keyboard?.press("Enter");
      const record: WebAiTaskRecord = {
        task_id,
        status: "queued",
        profile: args.profile,
        lease_id: lease,
        started_at: new Date().toISOString(),
        progress_label: "queued ChatGPT Deep research task",
        timeout_ms: args.timeout_ms || 1800000
      };
      runtime.database.upsertWebAiTask(record);
      return safeOutput({ task_id, status: "queued" });
    });
  } finally { releaseProfileLease(args.profile, lease); }
}

const CHATGPT_PULSE_URL = "https://chatgpt.com/pulse";
const CHATGPT_PULSE_ONBOARDING_DIALOG_SELECTOR = "#radix-_r_ch_";
const CHATGPT_PULSE_ACTIONS_SELECTOR = 'button[aria-label="Actions"]';
const CHATGPT_PULSE_PENDING_PHRASES = ["is in the works", "Check back in"];
const CHATGPT_PULSE_HYDRATION_TIMEOUT_MS = 30000;
const CHATGPT_PULSE_HYDRATION_POLL_MS = 250;
const CHATGPT_PULSE_DIGEST_END = "Curate for tomorrow";
const CHATGPT_PULSE_DIGEST_MIN_SIGNAL_CHARS = 40;

type ChatgptPulseStatus = "ready" | "pending" | "not_onboarded";

function pulseArgs(args: any): any {
  return { ...args, tab_url_contains: args.tab_id || args.tab_url_contains, __requireTargetSurface: true };
}

async function pulseVisibleText(page: any): Promise<string> {
  try {
    const snapshot = await readPageSnapshot(page, { includePortals: true });
    return typeof snapshot.visibleText === "string" ? snapshot.visibleText : "";
  } catch {
    return "";
  }
}

function pulseUrlEndsWithPulse(url: string): boolean {
  try { return new URL(url).pathname.replace(/\/$/, "") === "/pulse"; } catch { return /\/pulse\/?(?:[?#].*)?$/.test(url); }
}

function pulseUrlIsChatgptHome(url: string): boolean {
  try { const parsed = new URL(url); return parsed.origin === "https://chatgpt.com" && parsed.pathname === "/"; } catch { return url === "https://chatgpt.com/" || url === "https://chatgpt.com"; }
}

async function locatorCount(page: any, selector: string): Promise<number> {
  return await page.locator?.(selector).first?.().count?.().catch(() => 0) || 0;
}

function normalizePulseDigestText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function stripLeadingPulseDateToken(text: string): string {
  return text.replace(/^(?:(?:\d{4}年)?\d{1,2}月\d{1,2}日|(?:Today|Yesterday)|(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}(?:,\s*\d{4})?|\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?)\s*/i, "").trim();
}

function extractChatgptPulseDigestText(visibleText: string): string | null {
  const endIndex = visibleText.lastIndexOf(CHATGPT_PULSE_DIGEST_END);
  if (endIndex < 0) return null;

  const beforeEnd = visibleText.slice(0, endIndex);
  const headerPattern = /(?:^|\s)Pulse\s+Curate(?:\s|$)/g;
  let header: RegExpExecArray | null;
  let startIndex = -1;
  while ((header = headerPattern.exec(beforeEnd)) !== null) {
    startIndex = header.index + header[0].length;
  }
  if (startIndex < 0) return null;

  return stripLeadingPulseDateToken(normalizePulseDigestText(beforeEnd.slice(startIndex)));
}

function hasSubstantiveChatgptPulseDigest(digestText: string | null): digestText is string {
  if (!digestText) return false;
  const signalChars = digestText.replace(/[^\p{L}\p{N}]/gu, "");
  if (signalChars.length < CHATGPT_PULSE_DIGEST_MIN_SIGNAL_CHARS) return false;
  return /[.!?。！？✨]|[\r\n]/u.test(digestText);
}

async function readChatgptPulseState(page: any): Promise<Record<string, unknown> | null> {
  const route = page.url?.() || CHATGPT_PULSE_URL;
  const visibleText = await pulseVisibleText(page);
  const pending = CHATGPT_PULSE_PENDING_PHRASES.some((phrase) => visibleText.includes(phrase));
  const hasActions = await locatorCount(page, CHATGPT_PULSE_ACTIONS_SELECTOR) > 0;
  const hasDialog = await locatorCount(page, CHATGPT_PULSE_ONBOARDING_DIALOG_SELECTOR) > 0;
  const hasGetStarted = await locatorCount(page, 'xpath=//div[@role="dialog"]//button[normalize-space(.)="Get started"]') > 0;

  if (pulseUrlIsChatgptHome(route) && hasDialog && hasGetStarted) {
    return safeOutput({ route, status: "not_onboarded", generated_hint: "Run webai_chatgpt_pulse_onboard with confirmed=true before reading Pulse." });
  }
  if (pulseUrlEndsWithPulse(route) && pending) {
    const generated_hint = visibleText.includes("Check back in") ? "Check back in about 30 minutes" : "Your first Pulse is in the works";
    return safeOutput({ route, status: "pending", generated_hint });
  }
  const digestText = extractChatgptPulseDigestText(visibleText);
  if (pulseUrlEndsWithPulse(route) && hasActions && !pending && hasSubstantiveChatgptPulseDigest(digestText)) {
    return safeOutput({ route, status: "ready", digest_text: digestText, generated_hint: "A fresh update lands every morning" });
  }
  return null;
}

async function detectChatgptPulseState(page: any): Promise<Record<string, unknown>> {
  const state = await readChatgptPulseState(page);
  if (state) return state;
  throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "ChatGPT Pulse state did not match not_onboarded, pending, or ready detection gates", { route: page.url?.() || CHATGPT_PULSE_URL });
}

async function waitForChatgptPulseState(page: any, timeoutMs = CHATGPT_PULSE_HYDRATION_TIMEOUT_MS): Promise<Record<string, unknown>> {
  const started = Date.now();
  const budgetMs = Math.max(0, Number(timeoutMs || 0));
  const maxAttempts = Math.max(1, Math.ceil(budgetMs / CHATGPT_PULSE_HYDRATION_POLL_MS) + 1);
  let lastRoute = page.url?.() || CHATGPT_PULSE_URL;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const state = await readChatgptPulseState(page);
    if (state) return state;
    lastRoute = page.url?.() || lastRoute;
    if (Date.now() - started >= budgetMs || attempt === maxAttempts - 1) break;
    await page.waitForTimeout?.(CHATGPT_PULSE_HYDRATION_POLL_MS).catch(() => undefined);
  }
  throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "ChatGPT Pulse state did not match not_onboarded, pending, or ready detection gates", { route: lastRoute });
}

async function getChatgptPulse(args: any, runtime: Required<BrowserToolRuntime>): Promise<Record<string, unknown>> {
  const effective = pulseArgs(args);
  return withManagedPage(effective, runtime, CHATGPT_PULSE_URL, async (page) => {
    await page.goto?.(CHATGPT_PULSE_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForLoadState?.("domcontentloaded", { timeout: 15000 }).catch(() => undefined);
    const deadline = Date.now() + Math.max(0, Number(effective.timeout_ms || 0));
    for (;;) {
      const state = await waitForChatgptPulseState(page);
      if (!effective.wait_ready || state.status !== "pending" || Date.now() >= deadline) return state;
      await page.waitForTimeout?.(1000).catch(() => undefined);
    }
  });
}

async function clickPulseSelector(page: any, selector: string, message: string): Promise<any> {
  return requireAndClick(page, selector, message, { dwellMs: 250 });
}

async function onboardChatgptPulse(args: any, runtime: Required<BrowserToolRuntime>): Promise<Record<string, unknown>> {
  if (args.confirmed !== true) {
    return safeOutput({ ok: false, errorCode: ConsumerErrorCodes.INVALID_ARGS, error_code: ConsumerErrorCodes.INVALID_ARGS, reason: "--confirmed is required because Pulse onboarding is a durable account-state change" });
  }
  const effective = pulseArgs(args);
  return withManagedPage(effective, runtime, CHATGPT_PULSE_URL, async (page) => {
    await page.goto?.(CHATGPT_PULSE_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForLoadState?.("domcontentloaded", { timeout: 15000 }).catch(() => undefined);
    const hasDialog = await locatorCount(page, CHATGPT_PULSE_ONBOARDING_DIALOG_SELECTOR) > 0;
    const hasGetStarted = await locatorCount(page, 'xpath=//div[@role="dialog"]//button[normalize-space(.)="Get started"]') > 0;
    if (!hasDialog || !hasGetStarted) {
      const state = await detectChatgptPulseState(page);
      if (state.status === "pending" || state.status === "ready") {
        return safeOutput({ route: state.route, onboarded: true, news_topic_selected: false, final_status: state.status, note: "Pulse onboarding modal absent; account already onboarded." });
      }
      return state;
    }

    await clickPulseSelector(page, 'xpath=//div[@role="dialog"]//button[normalize-space(.)="Get started"]', "ChatGPT Pulse Get started button was not found");
    await clickPulseSelector(page, 'xpath=//div[@role="dialog"]//button[contains(normalize-space(.),"Quick news recap")]', "ChatGPT Pulse Quick news recap focus chip was not found");
    const newsChip = page.locator?.('xpath=//div[@role="dialog"]//button[contains(normalize-space(.),"Quick news recap")]').first?.();
    const pressed = await newsChip?.getAttribute?.("aria-pressed").catch(() => null);
    if (pressed !== "true") throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "ChatGPT Pulse Quick news recap chip did not become selected", { selector: 'xpath=//div[@role="dialog"]//button[contains(normalize-space(.),"Quick news recap")][@aria-pressed="true"]' });
    await clickPulseSelector(page, 'xpath=//div[@role="dialog"]//button[normalize-space(.)="Next"]', "ChatGPT Pulse Next button was not found");
    await clickPulseSelector(page, 'xpath=//div[@role="dialog"]//button[normalize-space(.)="Skip for now"]', "ChatGPT Pulse Skip for now button was not found");
    await page.waitForLoadState?.("domcontentloaded", { timeout: 15000 }).catch(() => undefined);
    const finalState = await detectChatgptPulseState(page);
    if (finalState.status === "not_onboarded") throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "ChatGPT Pulse remained not_onboarded after onboarding steps", { route: finalState.route });
    return safeOutput({ route: finalState.route, onboarded: true, news_topic_selected: true, final_status: finalState.status });
  });
}

function chatgptSettingsRoute(surface: string | undefined): string {
  const map: Record<string, string> = { personalization: "Personalization", data_controls: "DataControls", schedules: "Schedules" };
  return `https://chatgpt.com/#settings/${map[surface || "personalization"] || "Personalization"}`;
}

async function manageChatgptConversation(args: any, runtime: Required<BrowserToolRuntime>): Promise<Record<string, unknown>> {
  if (["rename", "delete", "archive"].includes(args.action)) {
    return humanHandoffRequired("Per-conversation kebab menu operations are Radix-portal gated and are not CLI-automatable.", { action: args.action });
  }
  if (args.action === "navigate_settings") {
    const url = chatgptSettingsRoute(args.surface);
    return withManagedPage(args, runtime, url, async (page) => {
      await page.goto?.(url, { waitUntil: "domcontentloaded", timeout: 30000 });
      return safeOutput({ url: page.url?.() || url, surface: args.surface || "personalization" });
    });
  }
  return withManagedPage(args, runtime, args.tab_url_contains || serviceDefaults.chatgpt.url, async (page) => {
    if (loginRequiredForService("chatgpt", page.url?.() || "")) return loginRequiredResponse("chatgpt", page, Date.now());
    if (args.action === "search") {
      await page.keyboard?.press("Control+k");
      await page.waitForSelector?.('input[placeholder="Search chats..."]', { state: "visible", timeout: 8000 });
      if (args.query) await page.keyboard?.type(args.query);
      await page.waitForTimeout?.(500).catch(() => undefined);
      const links = page.locator?.('a[aria-label]');
      const count = await links?.count?.().catch(() => 0) || 0;
      const results: Array<{ title: string; href: string }> = [];
      for (let i = 0; i < count; i++) {
        const item = typeof links.nth === "function" ? links.nth(i) : links;
        const title = await item.getAttribute?.("aria-label").catch(() => "") || "";
        const href = await item.getAttribute?.("href").catch(() => "") || "";
        if (title || href) results.push({ title, href });
      }
      return safeOutput({ results });
    }
    if (args.action === "menu_enumerate") {
      await requireAndClick(page, 'button[aria-label="Open conversation options"]', "ChatGPT in-chat header conversation options button was not found", { dismissInterceptors: true, dwellMs: 250 });
      await page.waitForSelector?.('[role="menuitem"]', { state: "visible", timeout: 8000 });
      const items = await textListFromLocator(page.locator?.('[role="menuitem"]') || { count: async () => 0 });
      return safeOutput({ items });
    }
    await page.setViewportSize?.({ width: 1280, height: 900 })?.catch?.(() => undefined);
    await requireAndClick(page, CHATGPT_SHARE_BUTTON_SELECTOR, "ChatGPT share conversation button was not found", { dismissInterceptors: true, dwellMs: 250 });
    const blocked = await page.locator?.("text=/sensitive content|can\\'t share|cannot share/i").first?.().count?.().catch(() => 0);
    if (blocked) return safeOutput({ dialog_opened: false, conversationId: conversationIdFromUrl(page.url?.() || ""), errorCode: ConsumerErrorCodes.SENSITIVE_CONTENT_GUARD, error_code: ConsumerErrorCodes.SENSITIVE_CONTENT_GUARD });
    return safeOutput({ dialog_opened: true, conversationId: conversationIdFromUrl(page.url?.() || "") });
  });
}

function workspaceRoute(surface: string): string {
  const map: Record<string, string> = {
    projects: "https://chatgpt.com/",
    gpts: "https://chatgpt.com/gpts",
    tasks: "https://chatgpt.com/#settings/Schedules",
    apps: "https://chatgpt.com/#settings/Connectors",
    memory: "https://chatgpt.com/#settings/Personalization",
    personalization: "https://chatgpt.com/#settings/Personalization",
    data_controls: "https://chatgpt.com/#settings/DataControls"
  };
  return map[surface] || "https://chatgpt.com/";
}

async function summarizeWorkspaceSurface(page: any, surface: string): Promise<string> {
  if (surface === "gpts") {
    const count = await page.locator?.("a[href^='/g/g-']").count?.().catch(() => 0) || 0;
    return `${count} GPT card link(s) visible`;
  }
  if (surface === "projects") {
    const count = await page.locator?.("button:has-text('New project')").count?.().catch(() => 0) || 0;
    return count ? "Projects sidebar area visible" : "Projects sidebar area not confirmed";
  }
  if (surface === "memory") {
    const count = await page.locator?.("button[aria-label='Manage memories']").count?.().catch(() => 0) || 0;
    return count ? "Manage memories area visible" : "Memory settings route opened";
  }
  return `${surface} route opened`;
}

async function inspectChatgptWorkspace(args: any, runtime: Required<BrowserToolRuntime>): Promise<Record<string, unknown>> {
  const action = args.action || "read";
  if (action !== "read") {
    return policyApprovalRequired("ChatGPT workspace destructive or mutating operations require explicit human approval and are not performed by this tool.", { surface: args.surface, action });
  }
  const url = workspaceRoute(args.surface);
  return withManagedPage(args, runtime, url, async (page) => {
    await page.goto?.(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    if (args.surface === "memory") await page.locator?.("button[aria-label='Manage memories']").first?.().count?.().catch(() => 0);
    const summary = await summarizeWorkspaceSurface(page, args.surface);
    return safeOutput({ surface: args.surface, url: page.url?.() || url, summary });
  });
}


function claudeToolArgs(args: any): any {
  return { ...args, profile: args.profile || "claude-9224" };
}

function claudeConversationIdFromUrl(url: string): string | null {
  return /\/(?:chat|c)\/([^/?#]+)/.exec(url)?.[1] || conversationIdFromUrl(url);
}

async function startClaudeDeepResearch(args: any, runtime: Required<BrowserToolRuntime>): Promise<Record<string, unknown>> {
  const effective = claudeToolArgs(args);
  assertPromptAllowed(effective.prompt);
  const lease = acquireProfileLease(effective.profile);
  const task_id = safeTaskId();
  try {
    return await withManagedPage({ ...effective, __requireTargetSurface: true }, runtime, targetUrlFor("claude", effective), async (page) => {
      await waitForHydratedSurface(page, CLAUDE_PLUS_MENU_SELECTOR, Math.min(effective.timeout_ms || 60000, 15000));
      if (loginRequiredForService("claude", page.url?.() || "")) return loginRequiredResponse("claude", page, Date.now());
      if (effective.model) {
        const selection = await selectClaudeModel(page, effective.model);
        if (!selection.ok) return modelSelectionDriftResponse("claude", page, Date.now(), selection.expected, selection.actual);
      }
      await requireAndClick(page, CLAUDE_PLUS_MENU_SELECTOR, "Claude composer plus menu button was not found", { dismissInterceptors: true, dwellMs: 250 });
      try { await page.waitForSelector?.(CLAUDE_DEEP_RESEARCH_MENUITEM_SELECTOR, { state: "visible", timeout: 8000 }); } catch {}
      await requireAndClick(page, CLAUDE_DEEP_RESEARCH_MENUITEM_SELECTOR, "Claude Research menuitemcheckbox was not found", { dwellMs: 250 });
      const box = page.locator(CLAUDE_PROMPT_SELECTOR).first();
      await box.waitFor({ state: "visible", timeout: Math.min(effective.timeout_ms || 60000, 15000) });
      await box.fill?.(effective.prompt).catch(async () => { await box.click(); await page.keyboard?.type(effective.prompt); });
      await page.keyboard?.press("Enter");
      const record: WebAiTaskRecord = {
        task_id,
        status: "queued",
        profile: effective.profile,
        lease_id: lease,
        started_at: new Date().toISOString(),
        progress_label: "queued Claude Deep Research task",
        timeout_ms: effective.timeout_ms || 1800000
      };
      runtime.database.upsertWebAiTask(record);
      return safeOutput({ task_id, status: "queued" });
    });
  } finally { releaseProfileLease(effective.profile, lease); }
}

function sensitiveContentGuard(message: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return safeOutput({ ok: false, errorCode: ConsumerErrorCodes.SENSITIVE_CONTENT_GUARD, error_code: ConsumerErrorCodes.SENSITIVE_CONTENT_GUARD, message, ...extra });
}

async function manageClaudeConversation(args: any, runtime: Required<BrowserToolRuntime>): Promise<Record<string, unknown>> {
  const effective = claudeToolArgs(args);
  if (effective.action === "sidebar_options") {
    return humanHandoffRequired("Claude sidebar kebab opens a Radix portal that is not reliably snapshot-accessible from the CLI.", { action: "sidebar_options", reason: "sidebar_kebab_radix_portal_unreliable" });
  }
  if (effective.action === "share" && effective.confirmed !== true) {
    return sensitiveContentGuard("Opening Claude conversation sharing requires explicit human confirmation: pass confirmed: true / --confirmed true.", { action: "share", conversationId: null });
  }
  if (effective.action === "search") {
    return withManagedPage(effective, runtime, "https://claude.ai/", async (page) => {
      await page.goto?.("https://claude.ai/", { waitUntil: "domcontentloaded", timeout: 30000 });
      if (loginRequiredForService("claude", page.url?.() || "")) return loginRequiredResponse("claude", page, Date.now());
      await requireAndClick(page, CLAUDE_SEARCH_LINK_SELECTOR, "Claude search link was not found");
      if (effective.query) await page.keyboard?.type(effective.query);
      await page.keyboard?.press("Enter");
      await page.waitForTimeout?.(500).catch(() => undefined);
      const results_count = await page.locator?.('a[href*="/chat/"], [role="option"], [role="listitem"]').count?.().catch(() => 0) || 0;
      return safeOutput({ results_count, action: "search" });
    });
  }
  if (effective.action === "share") {
    return withManagedPage(effective, runtime, effective.tab_url_contains || serviceDefaults.claude.url, async (page) => {
      if (loginRequiredForService("claude", page.url?.() || "")) return loginRequiredResponse("claude", page, Date.now());
      await requireAndClick(page, CLAUDE_SHARE_BUTTON_SELECTOR, "Claude share conversation button was not found");
      return safeOutput({ dialog_opened: true, conversationId: claudeConversationIdFromUrl(page.url?.() || "") });
    });
  }
  throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, `Unsupported Claude conversation action: ${effective.action}`);
}

const CLAUDE_WORKSPACE_ROUTES: Record<string, string> = {
  projects: "https://claude.ai/projects",
  appearance: "https://claude.ai/customize"
};

async function summarizeClaudeMenuSurface(page: any, surface: string): Promise<string> {
  const labels: Record<string, string> = { integrations: "Add connectors", skills: "Skills", style_presets: "Use style" };
  await requireAndClick(page, CLAUDE_PLUS_MENU_SELECTOR, "Claude composer plus menu button was not found", { dismissInterceptors: true, dwellMs: 250 });
  const label = labels[surface] || surface;
  const selector = `xpath=//*[@role="menuitem" or @role="menuitemcheckbox" or @role="menuitemradio" or self::button][contains(normalize-space(.),"${label}")]`;
  try { await page.waitForSelector?.(selector, { state: "visible", timeout: 8000 }); } catch {}
  await requireAndClick(page, selector, `Claude ${label} menu item was not found`);
  await page.waitForTimeout?.(500).catch(() => undefined);
  const count = await page.locator?.('[role="menuitem"], [role="option"], [role="dialog"] button, [data-testid]').count?.().catch(() => 0) || 0;
  return `${surface} list opened; ${count} item/control(s) visible`;
}

async function inspectClaudeWorkspace(args: any, runtime: Required<BrowserToolRuntime>): Promise<Record<string, unknown>> {
  const effective = claudeToolArgs(args);
  const url = CLAUDE_WORKSPACE_ROUTES[effective.surface] || "https://claude.ai/";
  return withManagedPage(effective, runtime, url, async (page) => {
    await page.goto?.(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    if (loginRequiredForService("claude", page.url?.() || "")) return loginRequiredResponse("claude", page, Date.now());
    let summary = `${effective.surface} route opened`;
    if (["integrations", "skills", "style_presets"].includes(effective.surface)) summary = await summarizeClaudeMenuSurface(page, effective.surface);
    else if (effective.surface === "projects") {
      const count = await page.locator?.('a[aria-label="Projects"], button:has-text("New project"), a[href*="/project"]').count?.().catch(() => 0) || 0;
      summary = count ? "Projects surface visible" : "Projects route opened";
    } else if (effective.surface === "appearance") {
      const count = await page.locator?.('a[aria-label="Customize"], text=/appearance|style/i').count?.().catch(() => 0) || 0;
      summary = count ? "Customize/appearance surface visible" : "Customize route opened";
    }
    return safeOutput({ surface: effective.surface, url: page.url?.() || url, summary });
  });
}

function geminiToolArgs(args: any): any {
  return { ...args, profile: args.profile || "gemini-9225" };
}

function geminiConversationTarget(tabUrlContains?: string): string {
  if (typeof tabUrlContains !== "string" || !tabUrlContains.trim()) return serviceDefaults.gemini.url;
  if (/^https?:\/\//i.test(tabUrlContains)) return tabUrlContains;
  if (/^[A-Za-z0-9_-]{6,}$/.test(tabUrlContains)) return `https://gemini.google.com/app/${tabUrlContains}`;
  return serviceDefaults.gemini.url;
}

async function openGeminiUploadToolsMenu(page: any, opts: { exposeMoreTools?: boolean } = {}): Promise<void> {
  try {
    await page.waitForSelector?.(GEMINI_UPLOAD_TOOLS_TRIGGER_SELECTOR, { state: "visible", timeout: 15000 });
  } catch (error: any) {
    throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "Gemini Upload & tools button was not found", { selector: GEMINI_UPLOAD_TOOLS_TRIGGER_SELECTOR, cause: error?.message || String(error) });
  }
  await requireAndClick(page, GEMINI_UPLOAD_TOOLS_TRIGGER_SELECTOR, "Gemini Upload & tools button was not found");
  try {
    await page.waitForSelector?.(`${GEMINI_UPLOAD_FILES_MENUITEM_SELECTOR}, [role="menuitemcheckbox"]`, { state: "visible", timeout: 5000 });
  } catch (error: any) {
    throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "Gemini Upload & tools menu did not open", { selector: `${GEMINI_UPLOAD_FILES_MENUITEM_SELECTOR}, [role="menuitemcheckbox"]`, cause: error?.message || String(error) });
  }
  if (opts.exposeMoreTools === true) {
    await requireAndClick(page, GEMINI_MORE_TOOLS_SUBMENU_SELECTOR, "Gemini More tools sub-menu trigger was not found");
    try {
      await page.waitForSelector?.('[role="menuitemcheckbox"]:has-text("Create music"), [role="menuitemcheckbox"]:has-text("Guided learning")', { state: "visible", timeout: 3000 });
    } catch (error: any) {
      throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "Gemini More tools sub-menu did not expand", { selector: '[role="menuitemcheckbox"]:has-text("Create music"), [role="menuitemcheckbox"]:has-text("Guided learning")', cause: error?.message || String(error) });
    }
  }
}

async function fillGeminiComposer(page: any, prompt: string): Promise<void> {
  const box = page.locator(GEMINI_IMAGE_PROMPT_SELECTOR).first();
  await box.waitFor({ state: "visible", timeout: 15000 });
  await box.fill?.(prompt).catch(async () => { await box.click?.(); await page.keyboard?.type(prompt); });
}

async function clickGeminiSendMessage(page: any): Promise<void> {
  await requireAndClick(page, GEMINI_SEND_MESSAGE_BUTTON_SELECTOR, "Gemini Send message button was not found");
}

async function startGeminiDeepResearch(args: any, runtime: Required<BrowserToolRuntime>): Promise<Record<string, unknown>> {
  const effective = geminiToolArgs(args);
  assertPromptAllowed(effective.prompt);
  if (effective.confirmed !== true) {
    return sensitiveContentGuard("Submitting Gemini Deep research requires explicit human confirmation: pass confirmed: true / --confirmed true.", { action: "deep_research" });
  }
  const lease = acquireProfileLease(effective.profile);
  const task_id = safeTaskId();
  try {
    return await withManagedPage(effective, runtime, targetUrlFor("gemini", effective), async (page) => {
      await navigateGeminiFreshIfNeeded(page, { ...effective, __forceFreshComposer: true });
      if (loginRequiredForService("gemini", page.url?.() || "")) return loginRequiredResponse("gemini", page, Date.now());
      await openGeminiUploadToolsMenu(page, { exposeMoreTools: false });
      await page.waitForSelector?.(GEMINI_DEEP_RESEARCH_MENUITEM_SELECTOR, { state: "visible", timeout: 8000 });
      await requireAndClick(page, GEMINI_DEEP_RESEARCH_MENUITEM_SELECTOR, "Gemini Deep research menuitemcheckbox was not found");
      await fillGeminiComposer(page, effective.prompt);
      await clickGeminiSendMessage(page);
      const record: WebAiTaskRecord = {
        task_id,
        status: "queued",
        profile: effective.profile,
        lease_id: lease,
        started_at: new Date().toISOString(),
        progress_label: "queued Gemini Deep research task",
        timeout_ms: effective.timeout_ms || 1800000
      };
      runtime.database.upsertWebAiTask(record);
      return safeOutput({ task_id, status: "queued" });
    });
  } finally { releaseProfileLease(effective.profile, lease); }
}

async function editGeminiCanvas(args: any, runtime: Required<BrowserToolRuntime>): Promise<Record<string, unknown>> {
  const effective = geminiToolArgs(args);
  if (effective.prompt) assertPromptAllowed(effective.prompt);
  if (effective.edit_text) assertPromptAllowed(effective.edit_text);
  if (effective.prompt && effective.confirmed !== true) {
    return sensitiveContentGuard("Submitting a Gemini Canvas prompt requires explicit human confirmation: pass confirmed: true / --confirmed true.", { action: "canvas_edit" });
  }
  return withManagedPage(effective, runtime, targetUrlFor("gemini", effective), async (page) => {
    let canvas_opened = false;
    let edit_applied = false;
    let ai_action_applied = false;
    let canvas_html_before = "";
    let canvas_html_after = "";
    const readCanvasMarkup = async (): Promise<string> => {
      const body = page.locator(GEMINI_CANVAS_BODY_SELECTOR).last?.() || page.locator(GEMINI_CANVAS_BODY_SELECTOR).first();
      await body.waitFor?.({ state: "visible", timeout: 15000 });
      const markup = await body.evaluate?.((el: HTMLElement) => el.innerHTML || el.textContent || "").catch(() => "");
      return typeof markup === "string" ? markup : "";
    };
    if (effective.prompt) {
      await navigateGeminiFreshIfNeeded(page, { ...effective, __forceFreshComposer: true });
      if (loginRequiredForService("gemini", page.url?.() || "")) return loginRequiredResponse("gemini", page, Date.now());
      await openGeminiUploadToolsMenu(page, { exposeMoreTools: false });
      await page.waitForSelector?.(GEMINI_CANVAS_MENUITEM_SELECTOR, { state: "visible", timeout: 8000 });
      await requireAndClick(page, GEMINI_CANVAS_MENUITEM_SELECTOR, "Gemini Canvas menuitemcheckbox was not found");
      await fillGeminiComposer(page, effective.prompt);
      await clickGeminiSendMessage(page);
      await page.waitForSelector?.(GEMINI_CANVAS_SHARE_BUTTON_SELECTOR, { state: "visible", timeout: effective.response_timeout_ms || DEFAULT_RESPONSE_TIMEOUT_MS });
      canvas_opened = true;
      canvas_html_before = await readCanvasMarkup().catch(() => "");
    }
    if (effective.edit_text) {
      const body = page.locator(GEMINI_CANVAS_BODY_SELECTOR).last?.() || page.locator(GEMINI_CANVAS_BODY_SELECTOR).first();
      await body.waitFor?.({ state: "visible", timeout: 15000 });
      if (!canvas_html_before) canvas_html_before = await readCanvasMarkup().catch(() => "");
      await body.click?.();
      await page.keyboard?.type(effective.edit_text);
      await page.waitForTimeout?.(500).catch(() => undefined);
      edit_applied = true;
      canvas_opened = true;
      canvas_html_after = await readCanvasMarkup().catch(() => "");
    }
    if (effective.ai_action) {
      const label = effective.ai_action === "length" ? "Length" : effective.ai_action === "tone" ? "Tone" : "Suggest";
      const body = page.locator(GEMINI_CANVAS_BODY_SELECTOR).last?.() || page.locator(GEMINI_CANVAS_BODY_SELECTOR).first();
      if (!canvas_html_before) canvas_html_before = await readCanvasMarkup().catch(() => "");
      await body.click?.();
      await page.keyboard?.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
      await requireAndClick(page, `button[aria-label="${label}"]`, `Gemini Canvas ${label} AI edit button was not found`);
      await page.waitForTimeout?.(1500).catch(() => undefined);
      ai_action_applied = true;
      canvas_opened = true;
      canvas_html_after = await readCanvasMarkup().catch(() => "");
    }
    if (!canvas_html_after && canvas_html_before) canvas_html_after = canvas_html_before;
    return safeOutput({ canvas_opened, edit_applied, ai_action_applied, canvas_html_before, canvas_html_after });
  });
}

async function textListFromLocator(locator: any): Promise<string[]> {
  const count = await locator.count?.().catch(() => 0) || 0;
  const items: string[] = [];
  for (let i = 0; i < count; i++) {
    const item = typeof locator.nth === "function" ? locator.nth(i) : locator;
    const text = (await item.textContent?.().catch(() => "") || "").trim();
    if (text) items.push(text);
  }
  return items;
}

async function manageGeminiConversation(args: any, runtime: Required<BrowserToolRuntime>): Promise<Record<string, unknown>> {
  const effective = geminiToolArgs(args);
  if (["delete", "rename"].includes(effective.action)) {
    return policyApprovalRequired("Gemini conversation rename/delete are data-mutating and require explicit human approval; this tool does not execute them.", { action: effective.action });
  }
  if (effective.action === "share" && effective.confirmed !== true) {
    return sensitiveContentGuard("Opening Gemini conversation sharing requires explicit human confirmation: pass confirmed: true / --confirmed true.", { action: "share" });
  }
  if (effective.action === "search") {
    return withManagedPage(effective, runtime, serviceDefaults.gemini.url, async (page) => {
      if (loginRequiredForService("gemini", page.url?.() || "")) return loginRequiredResponse("gemini", page, Date.now());
      await requireAndClick(page, 'button[aria-label="Main menu"]', "Gemini main menu button was not found");
      await requireAndClick(page, 'button[aria-label="Search"]', "Gemini sidebar Search button was not found");
      if (effective.query) await page.keyboard?.type(effective.query);
      await page.waitForTimeout?.(500).catch(() => undefined);
      const list = page.locator('#conversations-list-0 a, #conversations-list-0 [role="listitem"]');
      const count = await list.count?.().catch(() => 0) || 0;
      const results: Array<{ title: string; href: string }> = [];
      for (let i = 0; i < count; i++) {
        const item = typeof list.nth === "function" ? list.nth(i) : list;
        const title = (await item.textContent?.().catch(() => "") || "").trim();
        const href = await item.getAttribute?.("href").catch(() => null) || "";
        if (title || href) results.push({ title, href });
      }
      return safeOutput({ results });
    });
  }
  return withManagedPage(effective, runtime, geminiConversationTarget(effective.tab_url_contains), async (page) => {
    if (loginRequiredForService("gemini", page.url?.() || "")) return loginRequiredResponse("gemini", page, Date.now());
    if (effective.action === "share") {
      await requireAndClick(page, GEMINI_SHARE_CONVERSATION_BUTTON_SELECTOR, "Gemini share conversation button was not found");
      return safeOutput({ dialog_opened: true });
    }
    const m = (page.url?.() || "").match(/\/app\/([^?#/]+)/);
    if (!m) {
      throw new WebAiToolError(
        ConsumerErrorCodes.ELEMENT_NOT_FOUND,
        "Gemini conversation_manage menu_enumerate requires an open conversation (/app/<id>); page is on /app root",
        { pageUrl: page.url?.() || "" }
      );
    }
    const convId = m[1];
    // href^= anchors at start of href to exclude the Google Account sign-out link
    // whose href is https://accounts.google.com/SignOutOptions?...continue=.../app/<id>...
    // (a substring match `href*="/app/<id>"` would match BOTH that account link AND
    // the actual conv card; .first() would grab whichever rendered first.)
    const card = page.locator(`a[href^="/app/${convId}"]`).first();
    let title: string;
    try {
      title = ((await card.getAttribute("aria-label", { timeout: 4000 })) || "").trim();
    } catch (_e) {
      title = "";
    }
    if (!title) {
      throw new WebAiToolError(
        ConsumerErrorCodes.ELEMENT_NOT_FOUND,
        "Gemini conversation card aria-label not resolvable for currently loaded conversation",
        { convId }
      );
    }
    const kebab = page.getByRole("button", { name: `More options for ${title}`, exact: true });
    // Material per-card-hover affordance: kebab is in DOM with visibility:hidden
    // until the parent conversation card receives hover. Honest convergence: if the
    // hover fails or doesn't flip the CSS state, the subsequent waitFor surfaces
    // the same ELEMENT_NOT_FOUND with selector context — no fallback layer.
    await card.hover({ timeout: 5000 }).catch(() => undefined);
    await kebab.waitFor({ state: "visible", timeout: 10000 });
    await kebab.click();
    const menuItems = page.locator('[role="menu"] [role="menuitem"], .mat-mdc-menu-panel [role="menuitem"], .mat-mdc-menu-panel button');
    const items = await textListFromLocator(menuItems);
    return safeOutput({ items });
  });
}

function geminiWorkspaceRoute(surface: string): string {
  const map: Record<string, string> = {
    gems: "https://gemini.google.com/gems/view",
    scheduled: "https://gemini.google.com/scheduled",
    workspace_integration: "https://gemini.google.com/apps",
    connected_apps: "https://gemini.google.com/apps",
    personalization: "https://gemini.google.com/personalization-settings",
    audio_overview: "https://notebooklm.google.com/"
  };
  return map[surface] || serviceDefaults.gemini.url;
}

async function inspectGeminiWorkspace(args: any, runtime: Required<BrowserToolRuntime>): Promise<Record<string, unknown>> {
  const effective = geminiToolArgs(args);
  const url = geminiWorkspaceRoute(effective.surface);
  return withManagedPage(effective, runtime, url, async (page) => {
    await page.goto?.(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    if (effective.surface !== "audio_overview" && loginRequiredForService("gemini", page.url?.() || "")) return loginRequiredResponse("gemini", page, Date.now());
    let summary = `${effective.surface} route opened`;
    if (effective.surface === "gems") {
      const count = await page.locator?.('a[aria-label^="Start a new conversation with Gem:"]').count?.().catch(() => 0) || 0;
      summary = `${count} Gem conversation link(s) visible`;
    } else if (effective.surface === "study") {
      await page.goto?.(serviceDefaults.gemini.url, { waitUntil: "domcontentloaded", timeout: 30000 });
      await openGeminiUploadToolsMenu(page, { exposeMoreTools: true });
      await page.waitForSelector?.(GEMINI_GUIDED_LEARNING_MENUITEM_SELECTOR, { state: "visible", timeout: 8000 }).catch(() => undefined);
      const count = await page.locator?.(GEMINI_GUIDED_LEARNING_MENUITEM_SELECTOR).count?.().catch(() => 0) || 0;
      summary = count ? "Guided learning tool is visible (observe-only)" : "Guided learning tool was not confirmed visible";
    } else if (effective.surface === "workspace_integration") {
      const count = await page.locator?.('#mat-mdc-slide-toggle-1-button, text=/Google Workspace/i').count?.().catch(() => 0) || 0;
      summary = count ? "Google Workspace integration controls visible (observe-only)" : "Google Workspace integration route opened (observe-only)";
    } else if (effective.surface === "connected_apps") {
      const labels = await textListFromLocator(page.locator?.('mat-slide-toggle, [role="switch"]') || { count: async () => 0 });
      summary = labels.length ? `Connected app toggle(s) visible: ${labels.join(", ")}` : "Connected apps route opened (observe-only)";
    } else if (effective.surface === "personalization") {
      summary = "Personalization settings route opened (observe-only; memory toggle mutations require POLICY_APPROVAL_REQUIRED)";
    } else if (effective.surface === "audio_overview") {
      summary = "NotebookLM route opened for Audio Overview handoff; generation deferred until a completed research run exists";
    }
    return safeOutput({ surface: effective.surface, url: page.url?.() || url, summary });
  });
}

type WebAiExtensionReadService = "chatgpt" | "claude" | "gemini";

function extensionServiceArgs(service: WebAiExtensionReadService, args: any): any {
  if (service === "claude") return claudeToolArgs(args || {});
  if (service === "gemini") return geminiToolArgs(args || {});
  return args || {};
}

function extensionBridgeUrlForService(service: WebAiExtensionReadService, args: any): string {
  return service === "claude" ? claudeExtensionHttpBridgeUrl(args) : extensionHttpBridgeUrlForArgs(args);
}

function extensionReadErrorCode(service: WebAiExtensionReadService, error: any): ConsumerErrorCode {
  return service === "claude" ? claudeExtensionErrorCode(error) : webAiExtensionErrorCode(error);
}

function extensionWorkspaceRoute(service: WebAiExtensionReadService, args: any): string {
  if (service === "chatgpt") return workspaceRoute(args.surface);
  if (service === "claude") return CLAUDE_WORKSPACE_ROUTES[args.surface] || serviceDefaults.claude.url;
  return geminiWorkspaceRoute(args.surface);
}

function extensionConversationTarget(service: WebAiExtensionReadService, args: any): string {
  if (service === "gemini") return geminiConversationTarget(args.tab_url_contains);
  if (service === "claude") return normalizeUrlLikeTarget(args.tab_url_contains) || serviceDefaults.claude.url;
  return normalizeUrlLikeTarget(args.tab_url_contains) || serviceDefaults.chatgpt.url;
}

async function openExtensionUrl(service: WebAiExtensionReadService, backend: any, args: any, url: string): Promise<any> {
  const timeoutMs = Math.min(args.timeout_ms || 60000, 30000);
  const requested = args.url || args.tab_url_contains;
  const requestedUrl = normalizeUrlLikeTarget(requested);
  const targetUrl = requestedUrl || url;
  const page = requested
    ? await backend.claimTab({ url: requested, profile: args.profile })
    : await backend.newTab({ url: targetUrl, profile: args.profile, background: false });
  await page.navigate(targetUrl, { waitUntil: "domcontentloaded", timeoutMs });
  return page;
}

function extensionLoginRequiredOutput(service: WebAiExtensionReadService, url: string): Record<string, unknown> {
  return safeOutput({
    ok: false,
    service,
    url,
    errorCode: ConsumerErrorCodes.LOGIN_REQUIRED,
    error_code: ConsumerErrorCodes.LOGIN_REQUIRED,
    message: `${service} login is required before workspace/conversation read`
  });
}

function extensionReadErrorOutput(service: WebAiExtensionReadService, args: any, error: any, extra: Record<string, unknown> = {}): Record<string, unknown> {
  const errorCode = extensionReadErrorCode(service, error);
  return safeOutput({
    ok: false,
    service,
    errorCode,
    error_code: errorCode,
    message: errorMessageFromUnknown(error, errorCode),
    ...extra
  });
}

function extensionConversationListSelectors(service: WebAiExtensionReadService): string[] {
  if (service === "chatgpt") return ['a[href^="/c/"]', 'a[href*="/c/"]', 'nav a[href]'];
  if (service === "claude") return ['a[href*="/chat/"]', 'a[href*="/c/"]', 'a[href]'];
  return ['#conversations-list-0 a', 'a[href^="/app/"]', 'a[href*="/app/"]'];
}

function extensionWorkspaceListSelectors(service: WebAiExtensionReadService, surface: string): string[] {
  if (service === "chatgpt") {
    if (surface === "gpts") return ['a[href^="/g/g-"]', 'a[href*="/g/g-"]', 'main a[href]'];
    return ['a[href^="/c/"]', 'a[href*="/c/"]', 'main a[href]', 'nav a[href]'];
  }
  if (service === "claude") {
    if (surface === "projects") return ['a[href*="/project"]', 'a[href*="/projects"]', 'main a[href]'];
    return ['main a[href]', '[role="menuitem"]', 'button'];
  }
  if (surface === "gems") return ['a[aria-label^="Start a new conversation with Gem:"]', 'a[href*="/gem"]', 'main a[href]'];
  return ['main a[href]', 'mat-slide-toggle', '[role="switch"]', 'button'];
}

async function extensionReadItems(page: any, selectors: string[], limit = 25): Promise<Array<{ text: string; href?: string; aria_label?: string; title?: string; role?: string }>> {
  const expression = `(() => {
    const selectors = Array.isArray(arg && arg.selectors) ? arg.selectors : [];
    const limit = Number(arg && arg.limit) || 25;
    const visible = (el) => {
      if (!el || !el.getBoundingClientRect) return false;
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style && style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    };
    const compact = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
    const out = [];
    const seen = new Set();
    for (const selector of selectors) {
      let nodes = [];
      try { nodes = Array.from(document.querySelectorAll(selector)); } catch (_) { nodes = []; }
      for (const node of nodes) {
        if (!visible(node)) continue;
        const text = compact(node.innerText || node.textContent || node.getAttribute('aria-label') || node.getAttribute('title'));
        const href = node.href || node.getAttribute('href') || '';
        const aria = compact(node.getAttribute('aria-label'));
        const title = compact(node.getAttribute('title'));
        const role = compact(node.getAttribute('role'));
        if (!text && !href && !aria && !title) continue;
        const key = [text, href, aria, title, role].join('\\u0000');
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
          text: text.slice(0, 240),
          ...(href ? { href } : {}),
          ...(aria ? { aria_label: aria.slice(0, 240) } : {}),
          ...(title ? { title: title.slice(0, 240) } : {}),
          ...(role ? { role } : {})
        });
        if (out.length >= limit) return out;
      }
    }
    return out;
  })()`;
  const raw = await page.evaluateReadOnly(expression, { selectors, limit });
  return Array.isArray(raw) ? raw.filter((item) => item && typeof item === "object") : [];
}

async function inspectWorkspaceWithExtensionBackend(service: WebAiExtensionReadService, args: any, runtime: Required<BrowserToolRuntime>): Promise<Record<string, unknown>> {
  void runtime;
  const effective = extensionServiceArgs(service, args);
  const action = effective.action || "read";
  if (service === "chatgpt" && !["read", "list"].includes(action)) {
    return policyApprovalRequired("ChatGPT workspace destructive or mutating operations require explicit human approval and are not performed by this tool.", { surface: effective.surface, action });
  }
  const url = extensionWorkspaceRoute(service, effective);
  const lease = acquireProfileLease(effective.profile);
  let backend: any;
  try {
    backend = getBackend("extension-assisted-cdp", {
      transport: "http",
      httpBridgeUrl: extensionBridgeUrlForService(service, effective)
    });
    await backend.ping();
    const page = await openExtensionUrl(service, backend, effective, url);
    const snapshot = await extensionTextSnapshot(page);
    if (!(service === "gemini" && effective.surface === "audio_overview") && loginRequiredForService(service, snapshot.url || "")) {
      return extensionLoginRequiredOutput(service, snapshot.url || url);
    }
    const items = await extensionReadItems(page, extensionWorkspaceListSelectors(service, effective.surface));
    const summary = items.length ? `${items.length} visible workspace item(s)` : `${effective.surface} route opened`;
    return safeOutput({ surface: effective.surface, url: snapshot.url || url, summary, errorCode: null });
  } catch (error: any) {
    return extensionReadErrorOutput(service, effective, error, { surface: effective.surface, url, summary: "" });
  } finally {
    await backend?.finalize?.().catch?.(() => undefined);
    releaseProfileLease(effective.profile, lease);
  }
}

async function manageConversationWithExtensionBackend(service: WebAiExtensionReadService, args: any, runtime: Required<BrowserToolRuntime>): Promise<Record<string, unknown>> {
  void runtime;
  const effective = extensionServiceArgs(service, args);
  const action = effective.action || "list";
  if (service === "chatgpt" && ["rename", "delete", "archive"].includes(action)) {
    return humanHandoffRequired("Per-conversation kebab menu operations are Radix-portal gated and are not CLI-automatable.", { action });
  }
  if (service === "claude" && action === "sidebar_options") {
    return humanHandoffRequired("Claude sidebar kebab opens a Radix portal that is not reliably snapshot-accessible from the CLI.", { action: "sidebar_options", reason: "sidebar_kebab_radix_portal_unreliable" });
  }
  if (service === "gemini" && ["delete", "rename"].includes(action)) {
    return policyApprovalRequired("Gemini conversation rename/delete are data-mutating and require explicit human approval; this tool does not execute them.", { action });
  }
  if ((service === "claude" || service === "gemini") && action === "share" && effective.confirmed !== true) {
    const label = service === "claude" ? "Claude" : "Gemini";
    return sensitiveContentGuard(`Opening ${label} conversation sharing requires explicit human confirmation: pass confirmed: true / --confirmed true.`, { action: "share" });
  }

  const target = service === "chatgpt" && action === "navigate_settings"
    ? chatgptSettingsRoute(effective.surface)
    : extensionConversationTarget(service, effective);
  const lease = acquireProfileLease(effective.profile);
  let backend: any;
  try {
    backend = getBackend("extension-assisted-cdp", {
      transport: "http",
      httpBridgeUrl: extensionBridgeUrlForService(service, effective)
    });
    await backend.ping();
    const page = await openExtensionUrl(service, backend, effective, target);
    const snapshot = await extensionTextSnapshot(page);
    if (loginRequiredForService(service, snapshot.url || "")) return extensionLoginRequiredOutput(service, snapshot.url || target);

    if (action === "list" || action === "search") {
      const allItems = await extensionReadItems(page, extensionConversationListSelectors(service));
      const query = typeof effective.query === "string" ? effective.query.trim().toLowerCase() : "";
      const results = query ? allItems.filter((item) => `${item.text} ${item.href || ""} ${item.aria_label || ""}`.toLowerCase().includes(query)) : allItems;
      return safeOutput({
        action,
        url: snapshot.url || target,
        items: results.map((item) => ({ ...item })),
        results: results.map((item) => ({ ...item })),
        results_count: results.length,
        errorCode: null
      });
    }

    if (service === "chatgpt" && action === "navigate_settings") {
      return safeOutput({ action, url: snapshot.url || target, surface: effective.surface || "personalization", errorCode: null });
    }

    if (action === "share") {
      const selector = service === "chatgpt"
        ? CHATGPT_SHARE_BUTTON_SELECTOR
        : service === "claude"
          ? CLAUDE_SHARE_BUTTON_SELECTOR
          : GEMINI_SHARE_CONVERSATION_BUTTON_SELECTOR;
      await clickExtensionSelector(page, selector, Math.min(effective.timeout_ms || 60000, 8000), `${service} share conversation button was not found`);
      return safeOutput({ action, dialog_opened: true, url: snapshot.url || target, conversationId: service === "gemini" ? null : (service === "claude" ? claudeConversationIdFromUrl(snapshot.url || "") : conversationIdFromUrl(snapshot.url || "")), errorCode: null });
    }

    if (action === "menu_enumerate") {
      if (service === "chatgpt") {
        await clickExtensionSelector(page, 'button[aria-label="Open conversation options"]', 8000, "ChatGPT in-chat header conversation options button was not found");
      } else if (service === "gemini") {
        await clickExtensionSelector(page, '[aria-label^="More options for"], button:has-text("More")', 8000, "Gemini conversation options button was not found");
      }
      const items = await extensionReadItems(page, ['[role="menuitem"]', '[role="menu"] button', '.mat-mdc-menu-panel button']);
      return safeOutput({ action, url: snapshot.url || target, items, errorCode: null });
    }

    return extensionReadErrorOutput(service, effective, new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, `Unsupported ${service} conversation action: ${action}`), { action, url: snapshot.url || target });
  } catch (error: any) {
    return extensionReadErrorOutput(service, effective, error, { action, url: target, items: [], results: [] });
  } finally {
    await backend?.finalize?.().catch?.(() => undefined);
    releaseProfileLease(effective.profile, lease);
  }
}

async function inspectChatgptWorkspaceWithExtensionBackend(args: any, runtime: Required<BrowserToolRuntime>): Promise<Record<string, unknown>> {
  return inspectWorkspaceWithExtensionBackend("chatgpt", args, runtime);
}

async function inspectClaudeWorkspaceWithExtensionBackend(args: any, runtime: Required<BrowserToolRuntime>): Promise<Record<string, unknown>> {
  return inspectWorkspaceWithExtensionBackend("claude", args, runtime);
}

async function inspectGeminiWorkspaceWithExtensionBackend(args: any, runtime: Required<BrowserToolRuntime>): Promise<Record<string, unknown>> {
  return inspectWorkspaceWithExtensionBackend("gemini", args, runtime);
}

async function manageChatgptConversationWithExtensionBackend(args: any, runtime: Required<BrowserToolRuntime>): Promise<Record<string, unknown>> {
  return manageConversationWithExtensionBackend("chatgpt", args, runtime);
}

async function manageClaudeConversationWithExtensionBackend(args: any, runtime: Required<BrowserToolRuntime>): Promise<Record<string, unknown>> {
  return manageConversationWithExtensionBackend("claude", args, runtime);
}

async function manageGeminiConversationWithExtensionBackend(args: any, runtime: Required<BrowserToolRuntime>): Promise<Record<string, unknown>> {
  return manageConversationWithExtensionBackend("gemini", args, runtime);
}

function extensionDriverErrorCode(service: WebAiExtensionReadService, error: any): ConsumerErrorCode {
  return extensionReadErrorCode(service, error);
}

function chatgptCanvasExportErrorOutput(format: string, error: any): Record<string, unknown> {
  const raw = error?.errorCode;
  const message = errorMessageFromUnknown(error, "");
  const errorCode = isConsumerErrorCode(raw)
    ? raw
    : /download|artifact.*timeout|timed out|timeout/i.test(message)
      ? ConsumerErrorCodes.ARTIFACT_DOWNLOAD_TIMEOUT
      : extensionDriverErrorCode("chatgpt", error);
  return safeOutput({
    path: "",
    sha256: "",
    format,
    byteSize: 0,
    errorCode,
    error_code: errorCode,
    message: message || errorCode
  });
}

async function exportChatgptCanvasWithExtensionBackend(args: any, runtime: Required<BrowserToolRuntime>): Promise<Record<string, unknown>> {
  const effective = args || {};
  const format = effective.format || "md";
  const downloadDir = effective.download_dir || defaultWebAiDownloadDir();
  try {
    requireAbsoluteDir(downloadDir);
    assertNotPublishDeniedLabel("Download", { tool: "webai.chatgpt.canvas_export" });
  } catch (error: any) {
    return chatgptCanvasExportErrorOutput(format, error);
  }

  const label = CHATGPT_CANVAS_FORMAT_LABELS[format] || CHATGPT_CANVAS_FORMAT_LABELS.md;
  const profile = effective.profile || process.env.WAH_DEFAULT_PROFILE || "chatgpt";
  const lease = acquireProfileLease(profile);
  let backend: any;
  try {
    backend = getBackend("extension-assisted-cdp", {
      transport: "http",
      httpBridgeUrl: extensionHttpBridgeUrlForArgs({ ...effective, profile })
    });
    await backend.ping();
    const page = await openChatgptExtensionPage(backend, { ...effective, profile, reuse_conversation: true });
    const snapshot = await extensionTextSnapshot(page, "main").catch(() => ({ url: effective.tab_url_contains || serviceDefaults.chatgpt.url, text: "" }));
    if (loginRequiredForService("chatgpt", snapshot.url || "")) {
      return chatgptCanvasExportErrorOutput(format, new WebAiToolError(ConsumerErrorCodes.LOGIN_REQUIRED, "ChatGPT login is required before canvas export"));
    }
    await page.assetsList().catch(() => []);
    const bundle = await page.assetsBundle().catch(() => ({ assets: [], capturedAt: new Date().toISOString() }));
    const result = await artifactClickRunner(runtime)({
      profile,
      tabUrlContains: effective.tab_url_contains || snapshot.url || serviceDefaults.chatgpt.url,
      buttonSelector: CHATGPT_CANVAS_DOWNLOAD_BUTTON_SELECTOR,
      followUpTextRegex: label,
      downloadDir,
      filenamePattern: format === "md" ? "\\.md$" : `\\.${format}$`,
      timeoutMs: Math.min(Number(effective.timeout_ms || 60000), 60000),
      openPanelIfMissing: "chatgpt-canvas",
      pageReadyEvidence: {
        backend: "extension-assisted-cdp",
        capturedAt: bundle.capturedAt,
        assetCount: bundle.assets.length
      }
    });
    const rawResult: any = result;
    const artifactPath = rawResult.path || rawResult.savedPath || "";
    const stat = artifactPath && fs.existsSync(artifactPath) ? fs.statSync(artifactPath) : undefined;
    return safeOutput({
      path: artifactPath,
      sha256: rawResult.sha256 || (artifactPath && fs.existsSync(artifactPath) ? sha256File(artifactPath) : ""),
      format,
      byteSize: rawResult.size_bytes ?? rawResult.sizeBytes ?? rawResult.size ?? stat?.size ?? 0
    });
  } catch (error: any) {
    return chatgptCanvasExportErrorOutput(format, error);
  } finally {
    await backend?.finalize?.().catch?.(() => undefined);
    releaseProfileLease(profile, lease);
  }
}

async function extensionChatgptPulseDomState(page: any): Promise<{
  route: string;
  visibleText: string;
  hasActions: boolean;
  hasDialog: boolean;
  hasGetStarted: boolean;
}> {
  return await page.evaluateReadOnly(`((arg) => {
    const xpathCount = (expr) => {
      try {
        const result = document.evaluate(expr, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
        return result.snapshotLength || 0;
      } catch (_) {
        return 0;
      }
    };
    const cssCount = (selector) => {
      try { return document.querySelectorAll(selector).length; } catch (_) { return 0; }
    };
    return {
      route: location.href,
      visibleText: String(document.body && (document.body.innerText || document.body.textContent) || ""),
      hasActions: cssCount(arg.actionsSelector) > 0,
      hasDialog: cssCount(arg.dialogSelector) > 0,
      hasGetStarted: xpathCount('//div[@role="dialog"]//button[normalize-space(.)="Get started"]') > 0
    };
  })(arg)`, {
    operation: "pulseState",
    actionsSelector: CHATGPT_PULSE_ACTIONS_SELECTOR,
    dialogSelector: CHATGPT_PULSE_ONBOARDING_DIALOG_SELECTOR
  }) as any;
}

async function readChatgptPulseStateWithExtension(page: any): Promise<Record<string, unknown> | null> {
  const dom = await extensionChatgptPulseDomState(page);
  const route = dom.route || CHATGPT_PULSE_URL;
  const visibleText = dom.visibleText || "";
  const pending = CHATGPT_PULSE_PENDING_PHRASES.some((phrase) => visibleText.includes(phrase));

  if (pulseUrlIsChatgptHome(route) && dom.hasDialog && dom.hasGetStarted) {
    return safeOutput({ route, status: "not_onboarded", generated_hint: "Run webai_chatgpt_pulse_onboard with confirmed=true before reading Pulse." });
  }
  if (pulseUrlEndsWithPulse(route) && pending) {
    const generated_hint = visibleText.includes("Check back in") ? "Check back in about 30 minutes" : "Your first Pulse is in the works";
    return safeOutput({ route, status: "pending", generated_hint });
  }
  const digestText = extractChatgptPulseDigestText(visibleText);
  if (pulseUrlEndsWithPulse(route) && dom.hasActions && !pending && hasSubstantiveChatgptPulseDigest(digestText)) {
    return safeOutput({ route, status: "ready", digest_text: digestText, generated_hint: "A fresh update lands every morning" });
  }
  return null;
}

async function detectChatgptPulseStateWithExtension(page: any): Promise<Record<string, unknown>> {
  const state = await readChatgptPulseStateWithExtension(page);
  if (state) return state;
  const snapshot = await extensionTextSnapshot(page).catch(() => ({ url: CHATGPT_PULSE_URL, text: "" }));
  throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "ChatGPT Pulse state did not match not_onboarded, pending, or ready detection gates", { route: snapshot.url || CHATGPT_PULSE_URL });
}

async function waitForChatgptPulseStateWithExtension(page: any, timeoutMs = CHATGPT_PULSE_HYDRATION_TIMEOUT_MS): Promise<Record<string, unknown>> {
  const started = Date.now();
  const budgetMs = Math.max(0, Number(timeoutMs || 0));
  const maxAttempts = Math.max(1, Math.ceil(budgetMs / CHATGPT_PULSE_HYDRATION_POLL_MS) + 1);
  let lastRoute = CHATGPT_PULSE_URL;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const state = await readChatgptPulseStateWithExtension(page);
    if (state) return state;
    const snapshot = await extensionTextSnapshot(page).catch(() => ({ url: lastRoute, text: "" }));
    lastRoute = snapshot.url || lastRoute;
    if (Date.now() - started >= budgetMs || attempt === maxAttempts - 1) break;
    await extensionSleep(CHATGPT_PULSE_HYDRATION_POLL_MS);
  }
  throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "ChatGPT Pulse state did not match not_onboarded, pending, or ready detection gates", { route: lastRoute });
}

function chatgptPulseErrorOutput(error: any, extra: Record<string, unknown> = {}): Record<string, unknown> {
  const errorCode = extensionDriverErrorCode("chatgpt", error);
  return safeOutput({
    route: CHATGPT_PULSE_URL,
    status: "failed",
    generated_hint: "",
    ok: false,
    errorCode,
    error_code: errorCode,
    message: errorMessageFromUnknown(error, errorCode),
    ...extra
  });
}

async function openChatgptPulseExtensionPage(backend: any, args: any): Promise<any> {
  const page = args.tab_url_contains
    ? await backend.claimTab({ url: args.tab_url_contains, profile: args.profile })
    : await backend.newTab({ url: CHATGPT_PULSE_URL, profile: args.profile, background: false });
  await page.navigate(CHATGPT_PULSE_URL, { waitUntil: "domcontentloaded", timeoutMs: Math.min(args.timeout_ms || 60000, 30000) });
  return page;
}

async function getChatgptPulseWithExtensionBackend(args: any, runtime: Required<BrowserToolRuntime>): Promise<Record<string, unknown>> {
  void runtime;
  const effective = pulseArgs(args || {});
  const lease = acquireProfileLease(effective.profile);
  let backend: any;
  try {
    backend = getBackend("extension-assisted-cdp", {
      transport: "http",
      httpBridgeUrl: extensionHttpBridgeUrlForArgs(effective)
    });
    await backend.ping();
    const page = await openChatgptPulseExtensionPage(backend, effective);
    const deadline = Date.now() + Math.max(0, Number(effective.timeout_ms || 0));
    for (;;) {
      const state = await waitForChatgptPulseStateWithExtension(page);
      if (!effective.wait_ready || state.status !== "pending" || Date.now() >= deadline) return state;
      await extensionSleep(1000);
    }
  } catch (error: any) {
    return chatgptPulseErrorOutput(error);
  } finally {
    await backend?.finalize?.().catch?.(() => undefined);
    releaseProfileLease(effective.profile, lease);
  }
}

async function clickPulseSelectorWithExtension(page: any, selector: string, message: string): Promise<void> {
  try {
    await extensionClick(page, selector, 8000);
  } catch (error: any) {
    throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, message, { selector, cause: errorMessageFromUnknown(error, "") });
  }
}

async function pulseQuickNewsSelectedWithExtension(page: any): Promise<boolean> {
  return Boolean(await page.evaluateReadOnly(`((arg) => {
    try {
      const result = document.evaluate('//div[@role="dialog"]//button[contains(normalize-space(.),"Quick news recap")]', document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
      const node = result.singleNodeValue;
      return !!node && node.getAttribute('aria-pressed') === 'true';
    } catch (_) {
      return false;
    }
  })(arg)`, { operation: "pulseQuickNewsSelected" }).catch(() => false));
}

async function onboardChatgptPulseWithExtensionBackend(args: any, runtime: Required<BrowserToolRuntime>): Promise<Record<string, unknown>> {
  void runtime;
  if (args?.confirmed !== true) {
    return safeOutput({ ok: false, errorCode: ConsumerErrorCodes.INVALID_ARGS, error_code: ConsumerErrorCodes.INVALID_ARGS, reason: "--confirmed is required because Pulse onboarding is a durable account-state change" });
  }
  const effective = pulseArgs(args || {});
  const lease = acquireProfileLease(effective.profile);
  let backend: any;
  try {
    backend = getBackend("extension-assisted-cdp", {
      transport: "http",
      httpBridgeUrl: extensionHttpBridgeUrlForArgs(effective)
    });
    await backend.ping();
    const page = await openChatgptPulseExtensionPage(backend, effective);
    const dom = await extensionChatgptPulseDomState(page);
    if (!dom.hasDialog || !dom.hasGetStarted) {
      const state = await detectChatgptPulseStateWithExtension(page);
      if (state.status === "pending" || state.status === "ready") {
        return safeOutput({ route: state.route, onboarded: true, news_topic_selected: false, final_status: state.status, note: "Pulse onboarding modal absent; account already onboarded." });
      }
      return state;
    }

    await clickPulseSelectorWithExtension(page, 'xpath=//div[@role="dialog"]//button[normalize-space(.)="Get started"]', "ChatGPT Pulse Get started button was not found");
    await clickPulseSelectorWithExtension(page, 'xpath=//div[@role="dialog"]//button[contains(normalize-space(.),"Quick news recap")]', "ChatGPT Pulse Quick news recap focus chip was not found");
    if (!(await pulseQuickNewsSelectedWithExtension(page))) {
      throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "ChatGPT Pulse Quick news recap chip did not become selected", { selector: 'xpath=//div[@role="dialog"]//button[contains(normalize-space(.),"Quick news recap")][@aria-pressed="true"]' });
    }
    await clickPulseSelectorWithExtension(page, 'xpath=//div[@role="dialog"]//button[normalize-space(.)="Next"]', "ChatGPT Pulse Next button was not found");
    await clickPulseSelectorWithExtension(page, 'xpath=//div[@role="dialog"]//button[normalize-space(.)="Skip for now"]', "ChatGPT Pulse Skip for now button was not found");
    await extensionSleep(500);
    const finalState = await detectChatgptPulseStateWithExtension(page);
    if (finalState.status === "not_onboarded") throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "ChatGPT Pulse remained not_onboarded after onboarding steps", { route: finalState.route });
    return safeOutput({ route: finalState.route, onboarded: true, news_topic_selected: true, final_status: finalState.status });
  } catch (error: any) {
    return chatgptPulseErrorOutput(error, { onboarded: false, news_topic_selected: false, final_status: "failed" });
  } finally {
    await backend?.finalize?.().catch?.(() => undefined);
    releaseProfileLease(effective.profile, lease);
  }
}

async function activateGeminiCanvasModeWithExtension(page: any, timeoutMs: number): Promise<void> {
  try {
    await ensureGeminiToolsAvailable(page);
    await toggleGeminiTool(page, "Canvas", 1, Math.min(timeoutMs || 60000, 15000));
  } catch (error: any) {
    if (isConsumerErrorCode(error?.errorCode)) throw error;
    throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "Gemini Canvas menuitemcheckbox did not report aria-checked=true", { selector: `${GEMINI_UPLOAD_TOOLS_TRIGGER_SELECTOR} -> ${GEMINI_CANVAS_MENUITEM_SELECTOR}`, cause: errorMessageFromUnknown(error, "") });
  }
}

async function submitGeminiCanvasPromptWithExtension(page: any, args: any): Promise<void> {
  await activateGeminiCanvasModeWithExtension(page, args.timeout_ms || 60000);
  await page.waitForSelector(GEMINI_IMAGE_PROMPT_SELECTOR, { state: "visible", timeoutMs: Math.min(args.timeout_ms || 60000, 15000) });
  await page.fill({ selector: GEMINI_IMAGE_PROMPT_SELECTOR }, args.prompt, { timeoutMs: Math.min(args.timeout_ms || 60000, 15000) });
  await extensionSleep(GEMINI_SEND_BUTTON_HYDRATION_WAIT_MS);
  const sendSelector = sendButtonSelector("gemini");
  await page.waitForSelector(sendSelector, { state: "visible", timeoutMs: 5000 });
  await page.queryElements(sendSelector, { limit: 3 }).catch(() => []);
  await clickExtensionSelectorWithJavascript(page, sendSelector, 8000, "Gemini Send message button was not found");
  await page.waitForSelector(GEMINI_CANVAS_SHARE_BUTTON_SELECTOR, { state: "visible", timeoutMs: args.response_timeout_ms || DEFAULT_RESPONSE_TIMEOUT_MS });
}

function isRealGeminiCanvasMarkup(source: string): boolean {
  const trimmed = String(source || "").trim();
  if (/IdentityRotateCookies|boq-identity|accounts\.google\.com/i.test(trimmed)) return false;
  return /<!doctype\s+html|<html[\s>]|<body[\s>]|<main[\s>]|<div[\s>]|<h1[\s>]/i.test(trimmed);
}

async function readGeminiCanvasMarkupFromCdpPage(page: any, timeoutMs = 30000): Promise<string> {
  const deadline = Date.now() + Math.max(1, timeoutMs);
  let latest = "";
  while (Date.now() <= deadline) {
    const mainFrame = typeof page.mainFrame === "function" ? page.mainFrame() : null;
    for (const frame of typeof page.frames === "function" ? page.frames() : []) {
      if (mainFrame && frame === mainFrame) continue;
      const frameUrl = String(frame.url?.() || "");
      if (/accounts\.google\.com|\/_\/bscframe/i.test(frameUrl)) continue;
      const html = typeof frame.content === "function" ? await frame.content().catch(() => "") : "";
      if (typeof html === "string" && isRealGeminiCanvasMarkup(html) && html.length > latest.length) latest = html;
    }
    if (isRealGeminiCanvasMarkup(latest)) return latest;
    const monacoText = await page.locator(".monaco-editor .view-lines").first().innerText({ timeout: 1000 }).catch(() => "");
    const normalized = String(monacoText || "").replace(/\u00a0/g, " ");
    if (isRealGeminiCanvasMarkup(normalized)) return normalized;
    const editableMarkup = await page.evaluate?.(() => {
      const clean = (value: unknown) => String(value || "").replace(/\s+/g, " ").trim();
      return Array.from(document.querySelectorAll('[contenteditable="true"]')).map((node: Element) => {
        const el = node as HTMLElement;
        const text = clean(el.innerText || el.textContent || "");
        const html = String(el.innerHTML || el.textContent || "");
        const rect = el.getBoundingClientRect();
        const chrome = [
          el.getAttribute("aria-label"),
          el.getAttribute("data-placeholder"),
          el.getAttribute("placeholder"),
          el.getAttribute("role")
        ].join(" ");
        return { text, html, chrome, area: Math.max(0, rect.width) * Math.max(0, rect.height) };
      }).filter((candidate) => {
        if (candidate.text.length < 20) return false;
        if (/ask gemini|enter a prompt|describe your|message/i.test(candidate.chrome)) return false;
        return true;
      }).sort((a, b) => b.text.length - a.text.length || b.area - a.area)[0]?.html || "";
    }).catch(() => "");
    if (typeof editableMarkup === "string" && editableMarkup.trim()) return editableMarkup;
    if (typeof page.waitForTimeout === "function") await page.waitForTimeout(500).catch(() => undefined);
    else await extensionSleep(500);
  }
  return latest;
}

async function readGeminiCanvasMarkupWithCdp(runtime: Required<BrowserToolRuntime>, profile: string, timeoutMs = 30000): Promise<string> {
  return withProfileCdpPage(runtime, profile, (url) => /gemini\.google\.com\/app/i.test(url), async (page) => {
    return readGeminiCanvasMarkupFromCdpPage(page, timeoutMs);
  });
}

async function waitForGeminiCanvasReadyCdp(page: any, timeoutMs: number): Promise<void> {
  try {
    await page.waitForSelector(GEMINI_CANVAS_SHARE_BUTTON_SELECTOR, { state: "visible", timeout: Math.max(1, timeoutMs) });
  } catch (error: any) {
    throw new WebAiToolError(ConsumerErrorCodes.COMMAND_TIMEOUT, "Gemini Canvas did not finish rendering before timeout", { selector: GEMINI_CANVAS_SHARE_BUTTON_SELECTOR, cause: error?.message || String(error) });
  }
}

async function prepareGeminiCanvasCdpPage(page: any, effective: any, fresh: boolean): Promise<void> {
  if (fresh) {
    await navigateGeminiFreshIfNeeded(page, { ...effective, __forceFreshComposer: true });
  } else if (!/gemini\.google\.com\/app/i.test(String(page.url?.() || ""))) {
    await page.goto?.(serviceDefaults.gemini.url, { waitUntil: "domcontentloaded", timeout: Math.min(effective.timeout_ms || 60000, 30000) });
    await page.waitForLoadState?.("domcontentloaded", { timeout: 15000 }).catch(() => undefined);
  }
  await page.bringToFront?.().catch?.(() => undefined);
  if (loginRequiredForService("gemini", page.url?.() || "")) {
    throw new WebAiToolError(ConsumerErrorCodes.LOGIN_REQUIRED, "Gemini login is required before Canvas action");
  }
}

async function submitGeminiCanvasPromptOnCdpPage(page: any, effective: any, prompt: string, timeoutMs: number, activateCanvas: boolean): Promise<void> {
  if (activateCanvas) await activateGeminiCanvasMode(page);
  const started = Date.now();
  const result = await sendPromptInExistingPage("gemini", {
    ...effective,
    prompt,
    __promptSelector: GEMINI_IMAGE_PROMPT_SELECTOR,
    __forceEnterToSend: true,
    __expectImageResponse: true
  }, page, started);
  if (result?.errorCode) {
    throw new WebAiToolError(String(result.errorCode), String(result.message || result.errorCode), { result });
  }
  await waitForGeminiCanvasReadyCdp(page, timeoutMs);
}

async function submitGeminiCanvasInstructionWithExtension(page: any, instruction: string, timeoutMs: number): Promise<void> {
  await page.waitForSelector(GEMINI_IMAGE_PROMPT_SELECTOR, { state: "visible", timeoutMs: Math.min(timeoutMs || 60000, 15000) });
  await page.fill({ selector: GEMINI_IMAGE_PROMPT_SELECTOR }, instruction, { timeoutMs: Math.min(timeoutMs || 60000, 15000) });
  await extensionSleep(GEMINI_SEND_BUTTON_HYDRATION_WAIT_MS);
  const sendSelector = sendButtonSelector("gemini");
  await clickExtensionSelectorWithJavascript(page, sendSelector, 8000, "Gemini Send message button was not found");
  await page.waitForSelector(GEMINI_CANVAS_SHARE_BUTTON_SELECTOR, { state: "visible", timeoutMs });
}

async function submitGeminiCanvasPromptWithExtensionSelectors(page: any, effective: any, prompt: string, activateCanvas: boolean): Promise<void> {
  if (activateCanvas) {
    await clickExtensionSelector(page, GEMINI_UPLOAD_TOOLS_TRIGGER_SELECTOR, 15000, "Gemini Upload & tools button was not found");
    await waitForExtensionSelector(page, GEMINI_CANVAS_MENUITEM_SELECTOR, 8000, "Gemini Canvas menuitemcheckbox was not found");
    await clickExtensionSelector(page, GEMINI_CANVAS_MENUITEM_SELECTOR, 8000, "Gemini Canvas menuitemcheckbox was not found");
  }
  await waitForExtensionSelector(page, GEMINI_IMAGE_PROMPT_SELECTOR, Math.min(effective.timeout_ms || 60000, 15000), "Gemini prompt composer was not found");
  await page.fill({ selector: GEMINI_IMAGE_PROMPT_SELECTOR }, prompt, { timeoutMs: Math.min(effective.timeout_ms || 60000, 15000) });
  await extensionSleep(GEMINI_SEND_BUTTON_HYDRATION_WAIT_MS);
  const sendSelector = sendButtonSelector("gemini");
  await waitForExtensionSelector(page, sendSelector, 5000, "Gemini Send message button was not found");
  await clickExtensionSelectorWithJavascript(page, sendSelector, 8000, "Gemini Send message button was not found");
  await waitForExtensionSelector(page, GEMINI_CANVAS_SHARE_BUTTON_SELECTOR, effective.response_timeout_ms || DEFAULT_RESPONSE_TIMEOUT_MS, "Gemini Canvas share/export button was not found");
}

async function awaitSpawnedDocsTabWithExtension(backend: any, timeoutMs: number): Promise<string | null> {
  const deadline = Date.now() + Math.max(1, timeoutMs);
  while (Date.now() <= deadline) {
    const tabs = await backend.listTabs().catch(() => []);
    for (const tab of tabs || []) {
      const url = String(tab?.url || "");
      if (GOOGLE_DOCS_URL_RE.test(url)) return url;
    }
    await extensionSleep(1000);
  }
  return null;
}

function geminiCanvasToDocsErrorOutput(args: any, error: any, extra: Record<string, unknown> = {}): Record<string, unknown> {
  const title = args?.title || null;
  const errorCode = extensionDriverErrorCode("gemini", error);
  return safeOutput({
    docs_url: null,
    docs_doc_id: null,
    title,
    ok: false,
    errorCode,
    error_code: errorCode,
    message: errorMessageFromUnknown(error, errorCode),
    ...extra
  });
}

async function canvasToDocsWithExtensionPageBackend(effective: any, backend: any): Promise<Record<string, unknown>> {
  const title = effective.title || null;
  const page = await extensionGeminiPage({ ...effective, __forceFreshComposer: true }, backend, GEMINI_FRESH_COMPOSER_URL);
  const snapshot = await extensionTextSnapshot(page).catch(() => ({ url: targetUrlFor("gemini", effective), text: "" }));
  if (loginRequiredForService("gemini", snapshot.url || "")) {
    return safeOutput({ docs_url: null, docs_doc_id: null, title, ok: false, errorCode: ConsumerErrorCodes.LOGIN_REQUIRED, error_code: ConsumerErrorCodes.LOGIN_REQUIRED });
  }
  const docsPrompt = geminiCanvasToDocsDocumentPrompt(effective.prompt);
  await submitGeminiCanvasPromptWithExtensionSelectors(page, effective, docsPrompt, true);
  await clickExtensionSelector(page, GEMINI_CANVAS_SHARE_BUTTON_SELECTOR, 8000, "Gemini Canvas share/export button was not found");
  await waitForExtensionSelector(page, GEMINI_CANVAS_EXPORT_DOCS_SELECTOR, 8000, "Gemini Canvas export-to-Docs menuitem was not found");
  await clickExtensionSelector(page, GEMINI_CANVAS_EXPORT_DOCS_SELECTOR, 8000, "Gemini Canvas export-to-Docs menuitem was not found");
  const docsUrl = await awaitSpawnedDocsTabWithExtension(backend, effective.timeout_ms || 45000);
  const docId = docsUrl ? GOOGLE_DOCS_URL_RE.exec(docsUrl)?.[1] || null : null;
  if (!docId || !docsUrl) {
    return geminiCanvasToDocsErrorOutput(effective, new WebAiToolError(ConsumerErrorCodes.ARTIFACT_VERIFICATION_FAILED, "Gemini Canvas export did not spawn a docs.google.com document"));
  }
  return safeOutput({ docs_url: `https://docs.google.com/document/d/${docId}/edit`, docs_doc_id: docId, title, errorCode: null });
}

async function canvasToDocsWithExtensionBackend(args: any, runtime: Required<BrowserToolRuntime>): Promise<Record<string, unknown>> {
  const effective = geminiToolArgs(args || {});
  assertPromptAllowed(effective.prompt);
  try {
    assertNotPublishDeniedLabel("Export to Docs", { tool: "webai.gemini.canvas_to_docs" });
  } catch (error: any) {
    return geminiCanvasToDocsErrorOutput(effective, error);
  }
  const title = effective.title || null;
  const lease = acquireProfileLease(effective.profile);
  let backend: any;
  try {
    const hasProfileCdp = typeof runtime.launcher?.status === "function" && typeof runtime.launcher?.connectOverCdp === "function";
    if (!hasProfileCdp) {
      backend = getBackend("extension-assisted-cdp", {
        transport: "http",
        httpBridgeUrl: extensionHttpBridgeUrlForArgs(effective)
      });
      await backend.ping();
      return await canvasToDocsWithExtensionPageBackend(effective, backend);
    }
    return await withProfileCdpPage(runtime, effective.profile, (url) => /gemini\.google\.com\/app/i.test(url), async (page) => {
      await prepareGeminiCanvasCdpPage(page, effective, true);
      const docsPrompt = geminiCanvasToDocsDocumentPrompt(effective.prompt);
      const canvasReadyTimeout = geminiCanvasToDocsReadyTimeoutMs(effective);
      await submitGeminiCanvasPromptOnCdpPage(page, effective, docsPrompt, canvasReadyTimeout, true);
      await requireAndClick(page, GEMINI_CANVAS_SHARE_BUTTON_SELECTOR, "Gemini Canvas share/export button was not found");
      await page.waitForSelector?.(GEMINI_CANVAS_EXPORT_DOCS_SELECTOR, { state: "visible", timeout: 8000 });
      await requireAndClick(page, GEMINI_CANVAS_EXPORT_DOCS_SELECTOR, "Gemini Canvas export-to-Docs menuitem was not found");
      const spawned = await awaitSpawnedDocsPage(page, effective.timeout_ms || 45000);
      const docsUrl = spawned?.url || null;
      const docId = docsUrl ? GOOGLE_DOCS_URL_RE.exec(docsUrl)?.[1] || null : null;
      if (spawned?.docPage && typeof spawned.docPage.close === "function") await spawned.docPage.close().catch(() => undefined);
      if (!docId || !docsUrl) {
        return geminiCanvasToDocsErrorOutput(effective, new WebAiToolError(ConsumerErrorCodes.ARTIFACT_VERIFICATION_FAILED, "Gemini Canvas export did not spawn a docs.google.com document"));
      }
      return safeOutput({ docs_url: `https://docs.google.com/document/d/${docId}/edit`, docs_doc_id: docId, title, errorCode: null });
    });
  } catch (error: any) {
    return geminiCanvasToDocsErrorOutput(effective, error);
  } finally {
    await backend?.finalize?.().catch?.(() => undefined);
    releaseProfileLease(effective.profile, lease);
  }
}

async function extensionWaitForDomSettled(page: any, timeoutMs = 1500, quietMs = 300): Promise<void> {
  await page.evaluateReadOnly(`((arg) => new Promise((resolve) => {
    const timeoutMs = Math.max(1, Number(arg.timeoutMs) || 1500);
    const quietMs = Math.max(1, Number(arg.quietMs) || 300);
    let done = false;
    let timer = null;
    const finish = () => {
      if (done) return;
      done = true;
      if (timer) clearTimeout(timer);
      observer.disconnect();
      resolve(true);
    };
    const observer = new MutationObserver(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(finish, quietMs);
    });
    observer.observe(document.body || document.documentElement, { childList: true, subtree: true, characterData: true });
    timer = setTimeout(finish, quietMs);
    setTimeout(finish, timeoutMs);
  }))(arg)`, { operation: "domSettled", timeoutMs, quietMs }).catch(() => undefined);
}

async function extensionReadGeminiCanvasMarkup(page: any): Promise<string> {
  const markup = await page.evaluateReadOnly(`((arg) => {
    const xpath = '(//div[@contenteditable="true"])[last()]';
    try {
      const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
      const node = result.singleNodeValue;
      return node ? String(node.innerHTML || node.textContent || "") : "";
    } catch (_) {
      const nodes = Array.from(document.querySelectorAll('div[contenteditable="true"]'));
      const node = nodes.length ? nodes[nodes.length - 1] : null;
      return node ? String(node.innerHTML || node.textContent || "") : "";
    }
  })(arg)`, { operation: "canvasMarkup" }).catch(() => "");
  return typeof markup === "string" ? markup : "";
}

function geminiCanvasEditErrorOutput(error: any): Record<string, unknown> {
  const errorCode = extensionDriverErrorCode("gemini", error);
  return safeOutput({
    canvas_opened: false,
    edit_applied: false,
    ai_action_applied: false,
    canvas_html_before: "",
    canvas_html_after: "",
    ok: false,
    errorCode,
    error_code: errorCode,
    message: errorMessageFromUnknown(error, errorCode)
  });
}

async function editGeminiCanvasWithExtensionPageBackend(effective: any, backend: any): Promise<Record<string, unknown>> {
  const page = await extensionGeminiPage({ ...effective, __forceFreshComposer: Boolean(effective.prompt) }, backend, GEMINI_FRESH_COMPOSER_URL);
  const snapshot = await extensionTextSnapshot(page).catch(() => ({ url: targetUrlFor("gemini", effective), text: "" }));
  if (loginRequiredForService("gemini", snapshot.url || "")) {
    return safeOutput({ canvas_opened: false, edit_applied: false, ai_action_applied: false, canvas_html_before: "", canvas_html_after: "", ok: false, errorCode: ConsumerErrorCodes.LOGIN_REQUIRED, error_code: ConsumerErrorCodes.LOGIN_REQUIRED });
  }
  let canvas_opened = false;
  let edit_applied = false;
  let ai_action_applied = false;
  let canvas_html_before = "";
  let canvas_html_after = "";
  const readCanvasMarkup = async () => extensionReadGeminiCanvasMarkup(page).catch(() => "");

  if (effective.prompt) {
    await submitGeminiCanvasPromptWithExtensionSelectors(page, effective, effective.prompt, true);
    canvas_opened = true;
    canvas_html_before = await readCanvasMarkup();
  }

  if (effective.edit_text) {
    if (!canvas_html_before) canvas_html_before = await readCanvasMarkup();
    await submitGeminiCanvasInstructionWithExtension(
      page,
      `Update the current Canvas by applying this edit exactly: ${String(effective.edit_text)}`,
      effective.response_timeout_ms || effective.timeout_ms || DEFAULT_RESPONSE_TIMEOUT_MS
    );
    edit_applied = true;
    canvas_opened = true;
    canvas_html_after = await readCanvasMarkup();
  }

  if (effective.ai_action) {
    if (!canvas_html_before) canvas_html_before = await readCanvasMarkup();
    const instruction = effective.ai_action === "length"
      ? "Make the current Canvas longer while preserving its subject."
      : effective.ai_action === "tone"
        ? "Improve the tone of the current Canvas while preserving its meaning."
        : "Apply one concise improvement suggestion to the current Canvas.";
    await submitGeminiCanvasInstructionWithExtension(page, instruction, effective.response_timeout_ms || effective.timeout_ms || DEFAULT_RESPONSE_TIMEOUT_MS);
    ai_action_applied = true;
    canvas_opened = true;
    canvas_html_after = await readCanvasMarkup();
  }

  if (!canvas_html_after && canvas_html_before) canvas_html_after = canvas_html_before;
  return safeOutput({ canvas_opened, edit_applied, ai_action_applied, canvas_html_before, canvas_html_after });
}

async function editGeminiCanvasWithExtensionBackend(args: any, runtime: Required<BrowserToolRuntime>): Promise<Record<string, unknown>> {
  const effective = geminiToolArgs(args || {});
  if (effective.prompt) assertPromptAllowed(effective.prompt);
  if (effective.edit_text) assertPromptAllowed(effective.edit_text);
  if (effective.prompt && effective.confirmed !== true) {
    return sensitiveContentGuard("Submitting a Gemini Canvas prompt requires explicit human confirmation: pass confirmed: true / --confirmed true.", { action: "canvas_edit" });
  }
  const lease = acquireProfileLease(effective.profile);
  let backend: any;
  try {
    const hasProfileCdp = typeof runtime.launcher?.status === "function" && typeof runtime.launcher?.connectOverCdp === "function";
    if (!hasProfileCdp) {
      backend = getBackend("extension-assisted-cdp", {
        transport: "http",
        httpBridgeUrl: extensionHttpBridgeUrlForArgs(effective)
      });
      await backend.ping();
      return await editGeminiCanvasWithExtensionPageBackend(effective, backend);
    }
    return await withProfileCdpPage(runtime, effective.profile, (url) => /gemini\.google\.com\/app/i.test(url), async (page) => {
      await prepareGeminiCanvasCdpPage(page, effective, Boolean(effective.prompt));

      let canvas_opened = false;
      let edit_applied = false;
      let ai_action_applied = false;
      let canvas_html_before = "";
      let canvas_html_after = "";
      const readCanvasMarkup = async () => readGeminiCanvasMarkupFromCdpPage(page, 30000).catch(() => "");

      if (effective.prompt) {
        await submitGeminiCanvasPromptOnCdpPage(page, effective, effective.prompt, effective.response_timeout_ms || DEFAULT_RESPONSE_TIMEOUT_MS, true);
        canvas_opened = true;
        canvas_html_before = await readCanvasMarkup();
      }

      if (effective.edit_text) {
        if (!canvas_html_before) canvas_html_before = await readCanvasMarkup();
        await submitGeminiCanvasPromptOnCdpPage(
          page,
          effective,
          `Update the current Canvas by applying this edit exactly: ${String(effective.edit_text)}`,
          effective.response_timeout_ms || effective.timeout_ms || DEFAULT_RESPONSE_TIMEOUT_MS,
          false
        );
        edit_applied = true;
        canvas_opened = true;
        canvas_html_after = await readCanvasMarkup();
      }

      if (effective.ai_action) {
        if (!canvas_html_before) canvas_html_before = await readCanvasMarkup();
        const instruction = effective.ai_action === "length"
          ? "Make the current Canvas longer while preserving its subject."
          : effective.ai_action === "tone"
            ? "Improve the tone of the current Canvas while preserving its meaning."
            : "Apply one concise improvement suggestion to the current Canvas.";
        await submitGeminiCanvasPromptOnCdpPage(page, effective, instruction, effective.response_timeout_ms || effective.timeout_ms || DEFAULT_RESPONSE_TIMEOUT_MS, false);
        ai_action_applied = true;
        canvas_opened = true;
        canvas_html_after = await readCanvasMarkup();
      }

      if (!canvas_html_after && canvas_html_before) canvas_html_after = canvas_html_before;
      return safeOutput({ canvas_opened, edit_applied, ai_action_applied, canvas_html_before, canvas_html_after });
    });
  } catch (error: any) {
    return geminiCanvasEditErrorOutput(error);
  } finally {
    await backend?.finalize?.().catch?.(() => undefined);
    releaseProfileLease(effective.profile, lease);
  }
}

const CLAUDE_DESIGN_URL = "https://claude.ai/design";
const CLAUDE_DESIGN_COMPOSER_SELECTOR = 'textarea[data-testid="chat-composer-input"]';
const CLAUDE_DESIGN_SEND_SELECTOR = '[data-testid="chat-send-button"]';
const CLAUDE_DESIGN_HTML_IFRAME_SELECTOR = 'iframe[data-testid="html-viewer-iframe"], iframe[data-testid="present-mode-iframe"], iframe[src*="claudeusercontent.com"]';
const CLAUDE_DESIGN_PRESENT_SELECTOR = 'xpath=//button[contains(.,"Present")]';
const CLAUDE_DESIGN_FILE_OPEN_SELECTOR = 'xpath=//button[contains(normalize-space(.),"Open") and not(@data-testid)]';
const CLAUDE_DESIGN_MODEL_SELECTOR = '[data-testid="model-selector-button"]';
const CLAUDE_DESIGN_CREATE_BTN_SELECTOR = '[data-testid="create-project-button"]';
const CLAUDE_DESIGN_PROJECT_NAME_SELECTOR = 'input[placeholder="Project name"]';
const CLAUDE_DESIGN_DEFAULT_PROFILE = "claude-9224";
const CLAUDE_DESIGN_SERVE_IFRAME_RE = /\/v1\/design\/projects\/[^/]+\/serve\//i;
const CLAUDE_DESIGN_QUOTA_TEXT_RE = /quota|limit reached|usage limit|try again later|too many requests|rate limit/i;

function claudeDesignArgs(args: any): any {
  return { ...(args || {}), profile: String(args?.profile || CLAUDE_DESIGN_DEFAULT_PROFILE) };
}

function claudeDesignProjectId(projectUrl: string): string | null {
  try { return /\/design\/p\/([^/?#]+)/.exec(new URL(projectUrl).pathname)?.[1] || null; }
  catch { return /\/design\/p\/([^/?#]+)/.exec(projectUrl)?.[1] || null; }
}

function claudeDesignFileName(projectUrl: string): string | null {
  try {
    const parsed = new URL(projectUrl);
    const file = parsed.searchParams.get("file") || "";
    return /\.html$/i.test(file) ? file : null;
  } catch {
    return /[?&]file=([^&#]+\.html)/i.exec(projectUrl)?.[1] || null;
  }
}

function claudeDesignViewerUrl(projectUrl: string): string {
  if (claudeDesignFileName(projectUrl)) return projectUrl;
  try {
    const parsed = new URL(projectUrl);
    parsed.searchParams.set("file", "index.html");
    return parsed.toString();
  } catch {
    const sep = projectUrl.includes("?") ? "&" : "?";
    return `${projectUrl}${sep}file=index.html`;
  }
}

function isClaudeDesignPresentUrl(url: string): boolean {
  return /[?&]present=1(?:[&#]|$)/i.test(url) || /\/serve\//i.test(url);
}

function claudeDesignErrorOutput(error: any, extra: Record<string, unknown>): Record<string, unknown> {
  const isQuota = error?.errorCode === ConsumerErrorCodes.SUBMCP_QUOTA_EXHAUSTED || /SUBMCP_QUOTA_EXHAUSTED|quota/i.test(errorMessageFromUnknown(error, ""));
  const errorCode = isQuota ? ConsumerErrorCodes.SUBMCP_QUOTA_EXHAUSTED : extensionDriverErrorCode("claude", error);
  return safeOutput({
    ok: false,
    errorCode,
    error_code: errorCode,
    message: errorMessageFromUnknown(error, errorCode),
    ...extra
  });
}

async function claudeDesignAssertNotQuotaWithExtension(page: any): Promise<void> {
  const snapshot = await extensionTextSnapshot(page, "main").catch(() => ({ url: CLAUDE_DESIGN_URL, text: "" }));
  if (CLAUDE_DESIGN_QUOTA_TEXT_RE.test(snapshot.text || "")) {
    throw new WebAiToolError(ConsumerErrorCodes.SUBMCP_QUOTA_EXHAUSTED, "Claude Design quota is exhausted");
  }
}

async function currentExtensionUrl(page: any, fallback = ""): Promise<string> {
  const url = await page.evaluateReadOnly(`((arg) => location.href)(arg)`, { operation: "currentUrl" }).catch(() => "");
  if (typeof url === "string" && url) return url;
  const snapshot = await extensionTextSnapshot(page).catch(() => ({ url: fallback, text: "" }));
  return snapshot.url || fallback;
}

async function waitForExtensionUrl(page: any, pattern: RegExp, timeoutMs: number): Promise<string> {
  const deadline = Date.now() + Math.max(1, timeoutMs);
  let current = "";
  while (Date.now() <= deadline) {
    current = await currentExtensionUrl(page, current);
    if (pattern.test(current)) return current;
    await extensionSleep(500);
  }
  throw new WebAiToolError(ConsumerErrorCodes.POSTCONDITION_TIMEOUT, "Expected extension tab URL did not materialize before timeout", { url: current, pattern: String(pattern) });
}

async function openClaudeDesignExtensionPage(backend: any, args: any, url: string): Promise<any> {
  const timeoutMs = Math.min(args.timeout_ms || 60000, 30000);
  const page = args.project_url || args.url || args.tab_url_contains
    ? await backend.claimTab({ url: args.project_url || args.url || args.tab_url_contains || url, profile: args.profile })
    : await backend.newTab({ url, profile: args.profile, background: false });
  await page.navigate(url, { waitUntil: "domcontentloaded", timeoutMs });
  return page;
}

async function designFileStateWithExtension(page: any): Promise<{ projectUrl: string; fileName: string; iframeSrc: string; hasIframe: boolean }> {
  return await page.evaluateReadOnly(`((arg) => {
    const iframe = (() => {
      try { return document.querySelector(arg.iframeSelector); } catch (_) { return null; }
    })();
    const src = iframe ? String(iframe.getAttribute('src') || iframe.getAttribute('srcdoc') || '') : '';
    const url = location.href;
    const fromUrl = (() => {
      try {
        const parsed = new URL(url);
        const file = parsed.searchParams.get('file') || '';
        return /\\.html$/i.test(file) ? file : '';
      } catch (_) {
        const m = /[?&]file=([^&#]+\\.html)/i.exec(url);
        return m ? m[1] : '';
      }
    })();
    const fromSrc = (() => {
      const m = /\\/serve\\/([^/?#]+\\.html)/i.exec(src);
      return m ? m[1] : '';
    })();
    return { projectUrl: url, fileName: fromUrl || fromSrc, iframeSrc: src, hasIframe: !!iframe };
  })(arg)`, { operation: "designFileState", iframeSelector: CLAUDE_DESIGN_HTML_IFRAME_SELECTOR }) as any;
}

async function waitForDesignFileCompletionWithExtension(page: any, projectUrl: string, timeoutMs: number): Promise<{ projectUrl: string; fileName: string }> {
  const deadline = Date.now() + Math.max(1, timeoutMs);
  let latest: any = { projectUrl, fileName: "" };
  while (Date.now() <= deadline) {
    latest = await designFileStateWithExtension(page).catch(() => latest);
    const hasServedIframe = CLAUDE_DESIGN_SERVE_IFRAME_RE.test(String(latest.iframeSrc || ""));
    if (hasServedIframe || (latest.hasIframe && latest.fileName)) {
      return { projectUrl: latest.projectUrl || projectUrl, fileName: latest.fileName || claudeDesignFileName(latest.projectUrl || projectUrl) || "design.html" };
    }
    await extensionSleep(1000);
  }
  throw new WebAiToolError(ConsumerErrorCodes.POSTCONDITION_TIMEOUT, "Claude Design did not expose a generated /serve/<name>.html iframe before timeout", { projectUrl: latest.projectUrl || projectUrl });
}

async function ensureClaudeDesignViewerOpenWithExtension(page: any, projectUrl: string): Promise<void> {
  const initial = await designFileStateWithExtension(page).catch(() => ({ hasIframe: false, fileName: "" }));
  if (initial.hasIframe) return;
  const current = await currentExtensionUrl(page, projectUrl);
  if (claudeDesignFileName(current)) {
    const viewerDeadline = Date.now() + 30000;
    while (Date.now() <= viewerDeadline) {
      const state = await designFileStateWithExtension(page).catch(() => ({ hasIframe: false, fileName: "" }));
      if (state.hasIframe) return;
      await extensionSleep(500);
    }
  }
  await clickExtensionSelectorWithJavascript(page, CLAUDE_DESIGN_FILE_OPEN_SELECTOR, 8000, "Claude Design generated file Open control was not found");
  const deadline = Date.now() + 30000;
  while (Date.now() <= deadline) {
    const state = await designFileStateWithExtension(page).catch(() => ({ hasIframe: false, fileName: "" }));
    if (state.hasIframe || state.fileName) return;
    await extensionSleep(500);
  }
  throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "Claude Design ?file= viewer iframe was not found", { selector: CLAUDE_DESIGN_HTML_IFRAME_SELECTOR });
}

async function openClaudeDesignViewerWithCdp(page: any, projectUrl: string, timeoutMs = 30000): Promise<void> {
  const viewerUrl = claudeDesignViewerUrl(projectUrl);
  const current = String(page.url?.() || "");
  const projectId = claudeDesignProjectId(projectUrl);
  if (!current.includes(viewerUrl) && (!projectId || !current.includes(projectId) || !claudeDesignFileName(current))) {
    await page.goto?.(viewerUrl, { waitUntil: "domcontentloaded", timeout: Math.min(timeoutMs, 30000) });
  }
  await page.waitForLoadState?.("domcontentloaded", { timeout: Math.min(timeoutMs, 15000) }).catch(() => undefined);
  if (loginRequiredForService("claude", String(page.url?.() || ""))) {
    throw new WebAiToolError(ConsumerErrorCodes.LOGIN_REQUIRED, "Claude login is required before Design viewer access");
  }
}

function isRealClaudeDesignHtmlMarkup(source: string): boolean {
  const trimmed = String(source || "").trim();
  if (!trimmed) return false;
  if (/^https?:\/\/\S+\/(?:_bootstrap|_loader)(?:[?#].*)?$/i.test(trimmed)) return false;
  return /<!doctype\s+html|<html[\s>]|<body[\s>]|<main[\s>]|<div[\s>]/i.test(trimmed);
}

const CLAUDE_DESIGN_HTML_FILE_ROW_SELECTOR = '[data-webai-claude-design-html-row="true"]';
const CLAUDE_DESIGN_HTML_FILE_MORE_SELECTOR = `${CLAUDE_DESIGN_HTML_FILE_ROW_SELECTOR} button[title="More"]`;
const CLAUDE_DESIGN_DOWNLOAD_MENU_SELECTOR = '[role="menu"] button:has-text("Download"), button:has-text("Download")';

function safeDownloadedBasename(name: string, fallback: string): string {
  const cleaned = path.basename(String(name || fallback)).replace(/[\x00-\x1f<>:"/\\|?*]+/g, "_").trim();
  return cleaned || fallback;
}

async function markClaudeDesignHtmlFileRow(page: any, preferredFileName: string | null, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + Math.max(1, timeoutMs);
  let lastCandidates: unknown[] = [];
  while (Date.now() <= deadline) {
    const result = await page.evaluate?.((arg: any) => {
      const clean = (value: unknown) => String(value || "").replace(/\s+/g, " ").trim();
      const preferred = clean(arg.preferredFileName || "").toLowerCase();
      const rows = Array.from(document.querySelectorAll("div")).map((el: Element) => {
        const text = clean((el as HTMLElement).innerText || el.textContent || "");
        const rect = (el as HTMLElement).getBoundingClientRect();
        return {
          el,
          text,
          rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          buttonCount: el.querySelectorAll("button").length,
          className: (el as HTMLElement).className || "",
          tag: el.tagName
        };
      }).filter((candidate: any) => {
        const text = String(candidate.text || "");
        if (!/\.html\b/i.test(text) || !/HTML page/i.test(text)) return false;
        if (preferred && !text.toLowerCase().includes(preferred)) return false;
        return candidate.buttonCount >= 1
          && candidate.rect.width >= 200
          && candidate.rect.height >= 30
          && candidate.rect.height <= 100
          && candidate.rect.x >= 250;
      }).sort((a: any, b: any) => a.rect.height - b.rect.height || a.rect.width - b.rect.width);
      document.querySelectorAll("[data-webai-claude-design-html-row]").forEach((el) => el.removeAttribute("data-webai-claude-design-html-row"));
      const chosen = rows[0];
      if (!chosen) {
        return { found: false, candidates: rows.slice(0, 5).map(({ el: _el, ...item }: any) => item) };
      }
      chosen.el.setAttribute("data-webai-claude-design-html-row", "true");
      return { found: true, chosen: { text: chosen.text, rect: chosen.rect, className: chosen.className, tag: chosen.tag } };
    }, { preferredFileName }).catch((error: any) => ({ found: false, error: errorMessageFromUnknown(error, "") }));
    if (result?.found) return;
    lastCandidates = Array.isArray(result?.candidates) ? result.candidates : lastCandidates;
    if (typeof page.waitForTimeout === "function") await page.waitForTimeout(500).catch(() => undefined);
    else await extensionSleep(500);
  }
  throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "Claude Design HTML file row was not found in the project file list", { selector: "div:has(.html HTML page)", candidates: lastCandidates });
}

async function downloadClaudeDesignHtmlWithHoverMenuCdp(runtime: Required<BrowserToolRuntime>, profile: string, projectUrl: string, downloadDir: string, timeoutMs = 90000): Promise<{ savedPath: string; byteSize: number; iframeArtifactSha256: string }> {
  const projectId = claudeDesignProjectId(projectUrl) || "claude-design";
  const preferredFileName = claudeDesignFileName(projectUrl);
  const projectListUrl = projectUrl.replace(/[?#].*$/, "");
  return withProfileCdpPage(runtime, profile, (url) => {
    if (!/claude\.ai\/design\/p\//i.test(url)) return false;
    return !projectId || url.includes(projectId);
  }, async (page) => {
    await page.goto?.(projectListUrl, { waitUntil: "domcontentloaded", timeout: Math.min(timeoutMs, 30000) });
    await page.waitForLoadState?.("domcontentloaded", { timeout: Math.min(timeoutMs, 15000) }).catch(() => undefined);
    await page.keyboard?.press?.("Escape").catch(() => undefined);
    if (loginRequiredForService("claude", String(page.url?.() || ""))) {
      throw new WebAiToolError(ConsumerErrorCodes.LOGIN_REQUIRED, "Claude login is required before Design file download");
    }
    await markClaudeDesignHtmlFileRow(page, preferredFileName, Math.min(timeoutMs, 30000));
    const row = page.locator(CLAUDE_DESIGN_HTML_FILE_ROW_SELECTOR).first();
    await row.hover({ timeout: Math.min(timeoutMs, 10000) });
    const more = page.locator(CLAUDE_DESIGN_HTML_FILE_MORE_SELECTOR).first();
    await more.waitFor?.({ state: "visible", timeout: Math.min(timeoutMs, 10000) }).catch(() => undefined);
    await more.click({ timeout: Math.min(timeoutMs, 10000) });
    const downloadButton = page.locator(CLAUDE_DESIGN_DOWNLOAD_MENU_SELECTOR).first();
    await downloadButton.waitFor?.({ state: "visible", timeout: Math.min(timeoutMs, 10000) }).catch(() => undefined);
    const downloadPromise = page.waitForEvent("download", { timeout: Math.min(timeoutMs, 60000) });
    await downloadButton.click({ timeout: Math.min(timeoutMs, 10000) });
    const download = await downloadPromise;
    const dir = path.resolve(downloadDir || defaultWebAiDownloadDir());
    fs.mkdirSync(dir, { recursive: true });
    const suggested = typeof download.suggestedFilename === "function" ? download.suggestedFilename() : "";
    const tempPath = path.join(dir, safeDownloadedBasename(suggested, `${projectId}-download.html`));
    await download.saveAs(tempPath);
    const bytes = fs.readFileSync(tempPath);
    const source = bytes.toString("utf-8");
    if (!isRealClaudeDesignHtmlMarkup(source)) {
      throw new WebAiToolError(ConsumerErrorCodes.ARTIFACT_VERIFICATION_FAILED, "Claude Design downloaded file did not contain real HTML markup", { path: tempPath, byteSize: bytes.length });
    }
    const iframeArtifactSha256 = crypto.createHash("sha256").update(bytes).digest("hex");
    const savedPath = path.join(dir, `${projectId}-${iframeArtifactSha256.slice(0, 12)}.html`);
    if (path.resolve(savedPath) !== path.resolve(tempPath)) {
      if (fs.existsSync(savedPath)) fs.rmSync(savedPath, { force: true });
      fs.renameSync(tempPath, savedPath);
    }
    return { iframeArtifactSha256, savedPath, byteSize: bytes.length };
  });
}

async function readClaudeDesignIframeHtmlWithExtension(page: any): Promise<string> {
  const source = await page.evaluateReadOnly(`((arg) => {
    const iframe = (() => {
      try { return document.querySelector(arg.iframeSelector); } catch (_) { return null; }
    })();
    if (!iframe) return "";
    const srcdoc = iframe.getAttribute('srcdoc') || "";
    if (srcdoc) return srcdoc;
    try {
      const doc = iframe.contentDocument;
      const html = doc && doc.documentElement ? doc.documentElement.outerHTML : "";
      if (html) return html;
    } catch (_) {}
    return iframe.getAttribute('src') || "";
  })(arg)`, { operation: "designIframeHtml", iframeSelector: CLAUDE_DESIGN_HTML_IFRAME_SELECTOR }).catch(() => "");
  return typeof source === "string" ? source : "";
}

async function readClaudeDesignIframeHtmlWithCdp(runtime: Required<BrowserToolRuntime>, profile: string, projectUrl: string, timeoutMs = 30000): Promise<string> {
  const projectId = claudeDesignProjectId(projectUrl);
  return withProfileCdpPage(runtime, profile, (url) => {
    if (!/claude\.ai\/design\/p\//i.test(url)) return false;
    return !projectId || url.includes(projectId);
  }, async (page) => {
    await openClaudeDesignViewerWithCdp(page, projectUrl, timeoutMs);
    const deadline = Date.now() + Math.max(1, timeoutMs);
    let latest = "";
    while (Date.now() <= deadline) {
      for (const frame of page.frames()) {
        const frameUrl = String(frame.url?.() || "");
        if (!/claudeusercontent\.com|\/serve\//i.test(frameUrl) && frame === page.mainFrame?.()) continue;
        const html = typeof frame.content === "function" ? await frame.content().catch(() => "") : "";
        if (typeof html === "string" && isRealClaudeDesignHtmlMarkup(html) && html.length > latest.length) latest = html;
      }
      if (isRealClaudeDesignHtmlMarkup(latest)) return latest;
      if (typeof page.waitForTimeout === "function") await page.waitForTimeout(500).catch(() => undefined);
      else await extensionSleep(500);
    }
    return latest;
  });
}

async function clickClaudeDesignPresentWithCdp(runtime: Required<BrowserToolRuntime>, profile: string, projectUrl: string, timeoutMs = 30000): Promise<string> {
  const projectId = claudeDesignProjectId(projectUrl);
  return withProfileCdpPage(runtime, profile, (url) => {
    if (!/claude\.ai\/design\/p\//i.test(url)) return false;
    return !projectId || url.includes(projectId);
  }, async (page, browser) => {
    await openClaudeDesignViewerWithCdp(page, projectUrl, timeoutMs);
    const current = String(page.url?.() || "");
    if (isClaudeDesignPresentUrl(current)) return current;
    await page.locator('button:has-text("Present")').first().click({ timeout: Math.min(timeoutMs, 15000) }).catch(() => undefined);
    const deadline = Date.now() + Math.max(1, timeoutMs);
    let iframeUrl = "";
    while (Date.now() <= deadline) {
      const pages = browser.contexts().flatMap((context: any) => context.pages());
      for (const candidate of pages) {
        const url = String(candidate.url?.() || "");
        if (isClaudeDesignPresentUrl(url) && (!projectId || url.includes(projectId))) return url;
        if (!iframeUrl && claudeDesignFileName(url) && (!projectId || url.includes(projectId))) iframeUrl = url;
      }
      const hasIframe = await page.locator?.(CLAUDE_DESIGN_HTML_IFRAME_SELECTOR).first?.().isVisible?.({ timeout: 500 }).catch(() => false);
      if (hasIframe && !iframeUrl) iframeUrl = String(page.url?.() || "");
      if (typeof page.waitForTimeout === "function") await page.waitForTimeout(500).catch(() => undefined);
      else await extensionSleep(500);
    }
    if (iframeUrl) return iframeUrl;
    throw new WebAiToolError(ConsumerErrorCodes.POSTCONDITION_TIMEOUT, "Claude Design Present mode did not expose a presentation URL before timeout");
  });
}

async function webAiClaudeDesignCreateProjectWithExtensionBackend(args: any, runtime: Required<BrowserToolRuntime>): Promise<Record<string, unknown>> {
  void runtime;
  const effective = claudeDesignArgs(args);
  const lease = acquireProfileLease(effective.profile);
  let backend: any;
  try {
    backend = getBackend("extension-assisted-cdp", {
      transport: "http",
      httpBridgeUrl: claudeExtensionHttpBridgeUrl(effective)
    });
    await backend.ping();
    const page = await openClaudeDesignExtensionPage(backend, effective, CLAUDE_DESIGN_URL);
    const snapshot = await extensionTextSnapshot(page).catch(() => ({ url: CLAUDE_DESIGN_URL, text: "" }));
    if (loginRequiredForService("claude", snapshot.url || "")) {
      return claudeDesignErrorOutput(new WebAiToolError(ConsumerErrorCodes.LOGIN_REQUIRED, "Claude login is required before Design project creation"), { projectUrl: "", projectId: null });
    }
    await claudeDesignAssertNotQuotaWithExtension(page);
    await page.waitForSelector(CLAUDE_DESIGN_PROJECT_NAME_SELECTOR, { state: "visible", timeoutMs: 15000 });
    await page.fill({ selector: CLAUDE_DESIGN_PROJECT_NAME_SELECTOR }, effective.name, { timeoutMs: 15000 });
    await extensionClick(page, CLAUDE_DESIGN_CREATE_BTN_SELECTOR, 15000);
    const projectUrl = await waitForExtensionUrl(page, /\/design\/p\//, 30000);
    return safeOutput({ projectUrl, projectId: claudeDesignProjectId(projectUrl) });
  } catch (error: any) {
    return claudeDesignErrorOutput(error, { projectUrl: "", projectId: null });
  } finally {
    await backend?.finalize?.().catch?.(() => undefined);
    releaseProfileLease(effective.profile, lease);
  }
}

async function webAiClaudeDesignGenerateWithExtensionBackend(args: any, runtime: Required<BrowserToolRuntime>): Promise<Record<string, unknown>> {
  void runtime;
  const effective = claudeDesignArgs(args);
  assertPromptAllowed(effective.prompt);
  const modelUsed = String(effective.model || "sonnet");
  const failure = (error?: any) => ({
    status: "failed",
    model_used: modelUsed,
    projectUrl: String(error?.projectUrl || effective.project_url || ""),
    fileName: String(error?.fileName || "")
  });
  const lease = acquireProfileLease(effective.profile);
  let backend: any;
  try {
    backend = getBackend("extension-assisted-cdp", {
      transport: "http",
      httpBridgeUrl: claudeExtensionHttpBridgeUrl(effective)
    });
    await backend.ping();
    const page = await openClaudeDesignExtensionPage(backend, effective, effective.project_url);
    await claudeDesignAssertNotQuotaWithExtension(page);
    if (effective.model) {
      await extensionClick(page, CLAUDE_DESIGN_MODEL_SELECTOR, 5000).catch(() => undefined);
      const label = modelUsed === "haiku" ? "Haiku" : "Sonnet";
      await extensionClick(page, `[role="menuitem"]:has-text("${label}"), [role="menuitemradio"]:has-text("${label}")`, 5000).catch(() => undefined);
    }
    await page.waitForSelector(CLAUDE_DESIGN_COMPOSER_SELECTOR, { state: "visible", timeoutMs: 15000 });
    await page.fill({ selector: CLAUDE_DESIGN_COMPOSER_SELECTOR }, effective.prompt, { timeoutMs: 15000 });
    await clickExtensionSelectorWithJavascript(page, CLAUDE_DESIGN_SEND_SELECTOR, 15000, "Claude Design send button was not found");
    const completion = await waitForDesignFileCompletionWithExtension(page, effective.project_url, effective.timeout_ms || 300000);
    await claudeDesignAssertNotQuotaWithExtension(page);
    return safeOutput({ status: "generated", model_used: modelUsed, projectUrl: completion.projectUrl, fileName: completion.fileName });
  } catch (error: any) {
    return claudeDesignErrorOutput(error, failure(error));
  } finally {
    await backend?.finalize?.().catch?.(() => undefined);
    releaseProfileLease(effective.profile, lease);
  }
}

async function webAiClaudeDesignGetHtmlWithExtensionBackend(args: any, runtime: Required<BrowserToolRuntime>): Promise<Record<string, unknown>> {
  const effective = claudeDesignArgs(args);
  const lease = acquireProfileLease(effective.profile);
  try {
    return safeOutput(await downloadClaudeDesignHtmlWithHoverMenuCdp(
      runtime,
      effective.profile,
      effective.project_url,
      effective.download_dir || defaultWebAiDownloadDir(),
      Math.min(effective.timeout_ms || 90000, 90000)
    ));
  } catch (error: any) {
    return claudeDesignErrorOutput(error, { iframeArtifactSha256: "", savedPath: "", byteSize: 0 });
  } finally {
    releaseProfileLease(effective.profile, lease);
  }
}

async function webAiClaudeDesignPresentWithExtensionBackend(args: any, runtime: Required<BrowserToolRuntime>): Promise<Record<string, unknown>> {
  const effective = claudeDesignArgs(args);
  const lease = acquireProfileLease(effective.profile);
  try {
    const presentUrl = await clickClaudeDesignPresentWithCdp(runtime, effective.profile, effective.project_url, Math.min(effective.timeout_ms || 90000, 90000));
    return safeOutput({ presentUrl });
  } catch (error: any) {
    return claudeDesignErrorOutput(error, { presentUrl: "" });
  } finally {
    releaseProfileLease(effective.profile, lease);
  }
}

function deepResearchSchemaWithBackend<T>(schema: RuntimeSchema<T>, service: string): RuntimeSchema<T & { backend?: "managed-cdp" | "extension-assisted-cdp" }> {
  const json = schema.toJsonSchema();
  return objectSchema<T & { backend?: "managed-cdp" | "extension-assisted-cdp" }>({
    ...(json.properties || {}),
    backend: webAiBackendSchema(`Browser backend for ${service} deep-research routing; defaults to extension-assisted-cdp`)
  }, json.required || []);
}

function deepResearchErrorOutput(service: WebAiExtensionReadService, args: any, error: any, extra: Record<string, unknown> = {}): Record<string, unknown> {
  const errorCode = extensionReadErrorCode(service, error);
  return safeOutput({
    ok: false,
    service,
    status: "failed",
    chat_url: targetUrlFor(service, args || {}),
    errorCode,
    error_code: errorCode,
    message: errorMessageFromUnknown(error, errorCode),
    ...extra
  });
}

function deepResearchLabel(service: WebAiExtensionReadService): string {
  if (service === "chatgpt") return "ChatGPT Deep research";
  if (service === "claude") return "Claude Research";
  return "Gemini Deep research";
}

function deepResearchPromptSelector(service: WebAiExtensionReadService): string {
  if (service === "claude") return CLAUDE_PROMPT_SELECTOR;
  if (service === "gemini") return GEMINI_IMAGE_PROMPT_SELECTOR;
  return serviceDefaults.chatgpt.promptSelector;
}

async function geminiDeepResearchModelDriftError(page: any): Promise<WebAiToolError | null> {
  const snapshot = await extensionTextSnapshot(page).catch(() => ({ url: serviceDefaults.gemini.url, text: "" }));
  if (/3\.1\s*Flash\s*Lite|Flash\s*Lite/i.test(snapshot.text || "")) {
    return new WebAiToolError(
      ConsumerErrorCodes.MODEL_SELECTION_DRIFT,
      "Gemini Deep research is unavailable while the current model is 3.1 Flash Lite / Flash-Lite; select 3.5 Flash before submitting.",
      { selected_model: "3.1 Flash Lite", selector: GEMINI_DEEP_RESEARCH_MENUITEM_SELECTOR, url: snapshot.url, target_model: "3.5 Flash" }
    );
  }
  return null;
}

type ExtensionDeepResearchSubmitState = {
  url: string;
  promptPresent: boolean;
  stopVisible: boolean;
  assistantCount: number;
};

async function extensionDeepResearchSubmitState(page: any, service: WebAiExtensionReadService, prompt: string): Promise<ExtensionDeepResearchSubmitState> {
  return await page.evaluateReadOnly(`((arg) => {
    const qsa = (selector) => {
      try { return Array.from(document.querySelectorAll(selector)); } catch (_) { return []; }
    };
    const visible = (el) => {
      if (!el) return false;
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style && style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
    };
    const compact = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
    const promptNeedle = compact(arg.prompt);
    const promptPresent = qsa(arg.promptSelector).some((node) => {
      const anyNode = node;
      const text = compact(anyNode.value || node.textContent || node.innerText || node.getAttribute('aria-label') || '');
      return promptNeedle && text.includes(promptNeedle);
    });
    return {
      url: location.href,
      promptPresent,
      stopVisible: qsa(arg.stopSelector).some(visible),
      assistantCount: qsa(arg.assistantSelector).length
    };
  })(arg)`, {
    prompt,
    promptSelector: deepResearchPromptSelector(service),
    stopSelector: stopButtonSelector(service),
    assistantSelector: assistantMessageSelector(service)
  }) as ExtensionDeepResearchSubmitState;
}

function deepResearchUrlIndicatesSubmitted(service: WebAiExtensionReadService, beforeUrl: string, currentUrl: string): boolean {
  if (!currentUrl || currentUrl === beforeUrl) return false;
  if (service === "chatgpt") return /\/c\/[^/?#]+/.test(currentUrl);
  if (service === "claude") return /\/(?:chat|c)\/[^/?#]+/.test(currentUrl);
  return /\/app\/[^/?#]+/.test(currentUrl);
}

async function waitForDeepResearchExtensionSubmit(page: any, service: WebAiExtensionReadService, prompt: string, before: ExtensionDeepResearchSubmitState, timeoutMs: number): Promise<{ chat_url: string; wait_ms: number }> {
  const started = Date.now();
  const deadline = started + Math.max(1, timeoutMs);
  let latest = before;
  while (Date.now() <= deadline) {
    latest = await extensionDeepResearchSubmitState(page, service, prompt).catch(() => latest);
    const urlSubmitted = deepResearchUrlIndicatesSubmitted(service, before.url, latest.url);
    const promptCleared = before.promptPresent === true && latest.promptPresent === false;
    const generationStarted = latest.stopVisible || latest.assistantCount > before.assistantCount;
    if (urlSubmitted || promptCleared || generationStarted) {
      return { chat_url: latest.url || before.url || serviceDefaults[service].url, wait_ms: Date.now() - started };
    }
    await extensionSleep(500);
  }
  throw new WebAiToolError(ConsumerErrorCodes.COMMAND_TIMEOUT, `${deepResearchLabel(service)} prompt did not submit before timeout`, {
    before_url: before.url,
    last_url: latest.url,
    prompt_present: latest.promptPresent,
    assistant_count_before: before.assistantCount,
    assistant_count_after: latest.assistantCount
  });
}

async function fillAndSubmitDeepResearchWithExtension(page: any, service: WebAiExtensionReadService, args: any): Promise<{ chat_url: string; wait_ms: number }> {
  const selector = deepResearchPromptSelector(service);
  const timeoutMs = Math.min(args.timeout_ms || 60000, 15000);
  await waitForExtensionSelector(page, selector, timeoutMs, `${deepResearchLabel(service)} prompt composer was not found`);
  await page.fill({ selector }, args.prompt, { timeoutMs });
  await extensionSleep(service === "gemini" ? GEMINI_SEND_BUTTON_HYDRATION_WAIT_MS : 250);
  const before = await extensionDeepResearchSubmitState(page, service, args.prompt).catch(async () => {
    const snapshot = await extensionTextSnapshot(page).catch(() => ({ url: targetUrlFor(service, args), text: "" }));
    return { url: snapshot.url || targetUrlFor(service, args), promptPresent: true, stopVisible: false, assistantCount: 0 };
  });
  const sendSelector = sendButtonSelector(service);
  await waitForExtensionSelector(page, sendSelector, 5000, `${deepResearchLabel(service)} send button was not found`);
  await page.queryElements(sendSelector, { limit: 3 }).catch(() => []);
  if (service === "chatgpt") await clickChatgptExtensionSelector(page, sendSelector, 5000, `${deepResearchLabel(service)} send button was not found`);
  else await clickExtensionSelector(page, sendSelector, 5000, `${deepResearchLabel(service)} send button was not found`);
  return waitForDeepResearchExtensionSubmit(page, service, args.prompt, before, responseTimeoutMs(args));
}

function persistDeepResearchTask(database: CapabilityDatabase, service: WebAiExtensionReadService, args: any, taskId: string, lease: string, chatUrl: string): void {
  const record: WebAiTaskRecord = {
    task_id: taskId,
    status: "queued",
    profile: args.profile,
    lease_id: lease,
    started_at: new Date().toISOString(),
    progress_label: `queued ${deepResearchLabel(service)} task`,
    timeout_ms: args.timeout_ms || 1800000,
    result: { chat_url: chatUrl, backend: "extension-assisted-cdp" }
  };
  database.upsertWebAiTask(record);
}

async function startChatgptDeepResearchWithExtensionBackend(args: any, runtime: Required<BrowserToolRuntime>): Promise<Record<string, unknown>> {
  const effective = args || {};
  assertPromptAllowed(effective.prompt);
  const lease = acquireProfileLease(effective.profile);
  const task_id = safeTaskId();
  let backend: any;
  try {
    backend = getBackend("extension-assisted-cdp", {
      transport: "http",
      httpBridgeUrl: extensionHttpBridgeUrlForArgs(effective)
    });
    await backend.ping();
    const page = await openChatgptExtensionPage(backend, effective);
    const snapshot = await extensionTextSnapshot(page).catch(() => ({ url: targetUrlFor("chatgpt", effective), text: "" }));
    if (loginRequiredForService("chatgpt", snapshot.url || "")) {
      return deepResearchErrorOutput("chatgpt", effective, new WebAiToolError(ConsumerErrorCodes.LOGIN_REQUIRED, "ChatGPT login is required before Deep research"), { task_id, chat_url: snapshot.url || targetUrlFor("chatgpt", effective) });
    }
    await waitForExtensionSelector(page, serviceDefaults.chatgpt.promptSelector, Math.min(effective.timeout_ms || 60000, 15000), "ChatGPT prompt composer was not found");
    await selectChatgptModelWithExtension(page, "Thinking");
    if (!(await extensionElementCount(page, CHATGPT_DEEP_RESEARCH_MENUITEM_SELECTOR))) {
      await clickChatgptExtensionSelector(page, CHATGPT_IMAGE_MENU_BUTTON_SELECTOR, 5000, "ChatGPT composer plus menu button was not found");
    }
    await clickChatgptExtensionSelector(page, CHATGPT_DEEP_RESEARCH_MENUITEM_SELECTOR, 8000, "ChatGPT Deep research menuitemradio was not found");
    await waitForExtensionSelector(page, CHATGPT_DEEP_RESEARCH_ACTIVE_SELECTOR, 8000, "ChatGPT Deep research mode did not expose its active pill");
    const submitted = await fillAndSubmitDeepResearchWithExtension(page, "chatgpt", effective);
    persistDeepResearchTask(runtime.database, "chatgpt", effective, task_id, lease, submitted.chat_url);
    return safeOutput({ task_id, status: "queued", chat_url: submitted.chat_url, wait_ms: submitted.wait_ms, errorCode: null });
  } catch (error: any) {
    return deepResearchErrorOutput("chatgpt", effective, error, { task_id });
  } finally {
    await backend?.finalize?.().catch?.(() => undefined);
    releaseProfileLease(effective.profile, lease);
  }
}

async function startClaudeDeepResearchWithExtensionBackend(args: any, runtime: Required<BrowserToolRuntime>): Promise<Record<string, unknown>> {
  const effective = claudeToolArgs(args || {});
  assertPromptAllowed(effective.prompt);
  const lease = acquireProfileLease(effective.profile);
  const task_id = safeTaskId();
  let backend: any;
  try {
    backend = getBackend("extension-assisted-cdp", {
      transport: "http",
      httpBridgeUrl: claudeExtensionHttpBridgeUrl(effective)
    });
    await backend.ping();
    const page = await openClaudeExtensionPage(backend, effective);
    const login = await assertClaudeExtensionLoggedIn(page, Date.now());
    if (login) {
      return deepResearchErrorOutput("claude", effective, new WebAiToolError(ConsumerErrorCodes.LOGIN_REQUIRED, "Claude login is required before Deep Research"), { task_id, chat_url: login.chat_url || targetUrlFor("claude", effective) });
    }
    if (effective.model) await selectClaudeModelWithExtension(page, effective.model);
    await clickExtensionSelector(page, CLAUDE_PLUS_MENU_SELECTOR, 5000, "Claude composer plus menu button was not found");
    await page.waitForSelector(CLAUDE_DEEP_RESEARCH_MENUITEM_SELECTOR, { state: "visible", timeoutMs: 8000 });
    await extensionClick(page, CLAUDE_DEEP_RESEARCH_MENUITEM_SELECTOR, 8000);
    const submitted = await fillAndSubmitDeepResearchWithExtension(page, "claude", effective);
    persistDeepResearchTask(runtime.database, "claude", effective, task_id, lease, submitted.chat_url);
    return safeOutput({ task_id, status: "queued", chat_url: submitted.chat_url, wait_ms: submitted.wait_ms, errorCode: null });
  } catch (error: any) {
    return deepResearchErrorOutput("claude", effective, error, { task_id });
  } finally {
    await backend?.finalize?.().catch?.(() => undefined);
    releaseProfileLease(effective.profile, lease);
  }
}

async function startGeminiDeepResearchWithExtensionBackend(args: any, runtime: Required<BrowserToolRuntime>): Promise<Record<string, unknown>> {
  const effective = geminiToolArgs(args || {});
  assertPromptAllowed(effective.prompt);
  if (effective.confirmed !== true) {
    return sensitiveContentGuard("Submitting Gemini Deep research requires explicit human confirmation: pass confirmed: true / --confirmed true.", { action: "deep_research" });
  }
  const lease = acquireProfileLease(effective.profile);
  const task_id = safeTaskId();
  let backend: any;
  try {
    backend = getBackend("extension-assisted-cdp", {
      transport: "http",
      httpBridgeUrl: extensionHttpBridgeUrlForArgs(effective)
    });
    await backend.ping();
    const page = await extensionGeminiPage(effective, backend, GEMINI_FRESH_COMPOSER_URL);
    const snapshot = await extensionTextSnapshot(page).catch(() => ({ url: targetUrlFor("gemini", effective), text: "" }));
    if (loginRequiredForService("gemini", snapshot.url || "")) {
      return deepResearchErrorOutput("gemini", effective, new WebAiToolError(ConsumerErrorCodes.LOGIN_REQUIRED, "Gemini login is required before Deep research"), { task_id, chat_url: snapshot.url || targetUrlFor("gemini", effective) });
    }
    await clickExtensionSelector(page, 'button:has-text("Not now")', 1000, "Gemini optional dialog was not found").catch(() => undefined);
    await ensureGeminiToolsAvailable(page);
    await toggleGeminiTool(page, "Deep research", 1, Math.min(effective.timeout_ms || 60000, 15000));
    const submitted = await fillAndSubmitDeepResearchWithExtension(page, "gemini", effective);
    persistDeepResearchTask(runtime.database, "gemini", effective, task_id, lease, submitted.chat_url);
    return safeOutput({ ok: true, task_id, status: "queued", chat_url: submitted.chat_url, wait_ms: submitted.wait_ms, errorCode: null });
  } catch (error: any) {
    return deepResearchErrorOutput("gemini", effective, error, { task_id });
  } finally {
    await backend?.finalize?.().catch?.(() => undefined);
    releaseProfileLease(effective.profile, lease);
  }
}

function webAiBackendInvalidOutput(tool: string, backend: any): Record<string, unknown> {
  return safeOutput({
    ok: false,
    errorCode: ConsumerErrorCodes.INVALID_ARGS,
    error_code: ConsumerErrorCodes.INVALID_ARGS,
    message: `${tool} backend must be "managed-cdp" or "extension-assisted-cdp", got ${String(backend)}`
  });
}

function webAiBackendSchema(description: string): Record<string, unknown> {
  return { ...scalar.enum(["managed-cdp", "extension-assisted-cdp"], description), default: "extension-assisted-cdp" };
}

function chatgptCodexArgs(args: any): any {
  return { ...(args || {}), profile: String(args?.profile || "chatgpt") };
}

function chatgptCodexRepoGuard(repo?: unknown): Record<string, unknown> | null {
  if (repo === undefined || repo === null || String(repo).trim() === "") return null;
  return String(repo).trim() === CODEX_ALLOWED_REPO ? null : allowlistError(`ChatGPT Codex refused repo '${String(repo)}'; only ${CODEX_ALLOWED_REPO} is allowlisted.`);
}

function chatgptCodexErrorOutput(error: any): Record<string, unknown> {
  const codeFromError = error?.errorCode || error?.error_code;
  const errorCode = isConsumerErrorCode(codeFromError) ? codeFromError : webAiExtensionErrorCode(error);
  return safeOutput(contractError(errorCode, errorMessageFromUnknown(error, "ChatGPT Codex sub-MCP operation failed")));
}

async function chatgptCodexExtensionEvaluate<T>(page: any, operation: string, body: string, extra: Record<string, unknown> = {}): Promise<T> {
  if (typeof page.evaluateReadOnly !== "function") {
    throw new WebAiToolError(ConsumerErrorCodes.CHROME_EXTENSION_DEBUGGER_UNAVAILABLE, "ChatGPT Codex extension page port does not expose evaluateReadOnly");
  }
  return await page.evaluateReadOnly(`((arg) => { ${body} })(arg)`, { operation, ...extra }) as T;
}

async function chatgptCodexExtensionNavigate(page: any, url: string, args: any): Promise<void> {
  const timeoutMs = Math.min(args.timeout_ms || 60000, 30000);
  if (typeof page.navigate === "function") {
    await page.navigate(url, { waitUntil: "domcontentloaded", timeoutMs });
    return;
  }
  if (typeof page.goto === "function") {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
  }
}

async function openChatgptCodexExtensionPage(backend: any, args: any, url: string): Promise<any> {
  const page = await backend.newTab({ url, profile: args.profile, background: false });
  await chatgptCodexExtensionNavigate(page, url, args);
  return page;
}

async function chatgptCodexExtensionText(page: any): Promise<string> {
  const snapshot = await extensionTextSnapshot(page).catch(() => ({ url: "", text: "" }));
  return String(snapshot.text || "");
}

async function chatgptCodexExtensionCurrentUrl(page: any): Promise<string> {
  const snapshot = await extensionTextSnapshot(page).catch(() => ({ url: "", text: "" }));
  return String(snapshot.url || "");
}

async function chatgptCodexSelectorText(page: any, selector: string): Promise<string> {
  return await chatgptCodexExtensionEvaluate<string>(page, "selectorText", `
    const selector = String(arg.selector || "");
    const first = (selector) => {
      if (selector.startsWith("xpath=")) {
        return document.evaluate(selector.slice(6), document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
      }
      return document.querySelector(selector);
    };
    const node = first(selector);
    return node ? String(node.innerText || node.textContent || node.value || "").replace(/\\s+/g, " ").trim() : "";
  `, { selector });
}

async function chatgptCodexElementCount(page: any, selector: string): Promise<number> {
  return await chatgptCodexExtensionEvaluate<number>(page, "elementCount", `
    const selector = String(arg.selector || "");
    if (selector.startsWith("xpath=")) {
      const snapshot = document.evaluate(selector.slice(6), document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
      return snapshot.snapshotLength;
    }
    return document.querySelectorAll(selector).length;
  `, { selector });
}

async function listAllowedEnvsFromExtensionPage(page: any): Promise<Array<Record<string, unknown>>> {
  const rows = await chatgptCodexExtensionEvaluate<Array<{ text: string; href?: string }>>(page, "codexEnvRows", `
    const compact = (value) => String(value || "").replace(/\\s+/g, " ").trim();
    return Array.from(document.querySelectorAll("tr")).map((row) => {
      const link = row.querySelector("a[href*='/codex/cloud/settings/environment/']");
      return { text: compact(row.innerText || row.textContent), href: link ? (link.href || link.getAttribute("href") || "") : "" };
    });
  `).catch(() => []);
  const envs = rows
    .map((row) => parseAllowedEnvFromRow(row.text, row.href || ""))
    .filter((env): env is NonNullable<ReturnType<typeof parseAllowedEnvFromRow>> => !!env);
  if (!envs.length) {
    const text = await chatgptCodexExtensionText(page);
    if (text.includes(CODEX_ALLOWED_REPO)) {
      const parsed = parseAllowedEnvFromRow(text, `/codex/cloud/settings/environment/${CODEX_ALLOWED_ENV_ID}`);
      if (parsed) envs.push(parsed);
    }
  }
  return envs
    .filter((env) => env.name === CODEX_ALLOWED_ENV_NAME && env.repo === CODEX_ALLOWED_REPO && env.env_id === CODEX_ALLOWED_ENV_ID)
    .map((env) => ({
      name: env.name,
      repo: env.repo,
      env_id: env.env_id,
      github_url: env.github_url || CODEX_ALLOWED_GITHUB_URL,
      ...(env.task_count !== undefined ? { task_count: env.task_count } : {}),
      ...(env.creator !== undefined ? { creator: env.creator } : {}),
      ...(env.created_at !== undefined ? { created_at: env.created_at } : {})
    }));
}

function chatgptCodexTaskIdFromUrl(url: string): string | null {
  return /(?:^|\/)tasks\/(task_e_[0-9a-f]{32})(?:[/?#]|$)/.exec(String(url || ""))?.[1] || null;
}

async function readChatgptCodexTopTaskCardId(page: any): Promise<string | null> {
  const href = await chatgptCodexExtensionEvaluate<string>(page, "codexTopTaskHref", `
    const link = document.querySelector('a[href*="/codex/cloud/tasks/task_e_"]');
    return link ? String(link.href || link.getAttribute("href") || "") : "";
  `).catch(() => "");
  return chatgptCodexTaskIdFromUrl(href);
}

async function extractSubmittedChatgptCodexTaskId(page: any, preSubmitTopId: string | null, timeoutMs = 30000): Promise<string | null> {
  const deadline = Date.now() + Math.max(0, timeoutMs);
  for (;;) {
    const fromUrl = chatgptCodexTaskIdFromUrl(await chatgptCodexExtensionCurrentUrl(page));
    if (fromUrl && fromUrl !== preSubmitTopId) return fromUrl;
    const topId = await readChatgptCodexTopTaskCardId(page);
    if (topId && topId !== preSubmitTopId) return topId;
    if (Date.now() >= deadline) {
      if (!preSubmitTopId && topId) return topId;
      return null;
    }
    await extensionSleep(1500);
  }
}

async function selectAllowedChatgptCodexEnvWithExtension(page: any): Promise<Record<string, unknown> | null> {
  await waitForExtensionSelector(page, CODEX_COMPOSER_SELECTOR, 30000, "ChatGPT Codex composer was not found");
  await waitForExtensionSelector(page, CODEX_ENV_SELECTOR, 30000, "ChatGPT Codex environment selector was not found");
  const selectedBefore = await chatgptCodexSelectorText(page, CODEX_ENV_SELECTOR);
  if (selectedBefore === CODEX_ALLOWED_ENV_NAME) return null;
  await clickChatgptExtensionSelector(page, CODEX_ENV_SELECTOR, 15000, "ChatGPT Codex environment selector was not found");
  await waitForExtensionSelector(page, "div[role='dialog']", 15000, "ChatGPT Codex environment dialog was not found").catch(() => undefined);
  await clickChatgptExtensionSelector(page, CODEX_ENV_PICK_SELECTOR, 15000, "ChatGPT Codex allowlisted environment was not found");
  const selected = await chatgptCodexSelectorText(page, CODEX_ENV_SELECTOR);
  if (selected !== CODEX_ALLOWED_ENV_NAME) {
    return allowlistError(`ChatGPT Codex submit refused: selected environment was '${selected || "<empty>"}', expected '${CODEX_ALLOWED_ENV_NAME}'.`);
  }
  return null;
}

async function waitForChatgptCodexTaskHydrationWithExtension(page: any, timeoutMs = 60000): Promise<string> {
  const deadline = Date.now() + Math.max(0, timeoutMs);
  let text = await chatgptCodexExtensionText(page);
  while (
    (!text || (!pageTextProvesAllowedCodexTask(text) && !CODEX_FORBIDDEN_REPO_RE.test(text)))
    && Date.now() < deadline
  ) {
    await extensionSleep(1500);
    text = await chatgptCodexExtensionText(page);
  }
  return text;
}

async function assertChatgptCodexTaskAllowlistWithExtension(page: any): Promise<Record<string, unknown> | null> {
  const text = await waitForChatgptCodexTaskHydrationWithExtension(page);
  if (CODEX_FORBIDDEN_REPO_RE.test(text)) return allowlistError("ChatGPT Codex task refused: task page references forbidden noeticbraid repository.");
  if (!pageTextProvesAllowedCodexTask(text)) return allowlistError("ChatGPT Codex task refused: task page does not prove LT-0I/CN- ownership.");
  return null;
}

async function readChatgptCodexStatusWithExtension(page: any, taskId: string): Promise<Record<string, unknown>> {
  const guard = await assertChatgptCodexTaskAllowlistWithExtension(page);
  if (guard) return guard;
  const text = await chatgptCodexExtensionText(page);
  const cancelCount = await chatgptCodexElementCount(page, 'button[aria-label="Cancel task"]');
  const thumbsCount = await chatgptCodexElementCount(page, 'button[aria-label="Give thumbs up feedback"]');
  const worked = /\bWorked for\s+\d+\s*(?:ms|s|sec(?:onds?)?|m|min(?:utes?)?|h|hours?|d|days?)\b/i.exec(text)?.[0]?.trim() || await chatgptCodexSelectorText(page, "xpath=//button[contains(normalize-space(.),'Worked for')]");
  const textShowsThumbs = /Give thumbs up feedback/.test(text);
  const textShowsCancel = /Cancel task/.test(text);
  if (/^Worked for\s+/.test(worked) && cancelCount === 0 && !textShowsCancel && (thumbsCount > 0 || textShowsThumbs)) {
    return { task_id: taskId, repo: CODEX_ALLOWED_REPO, env_id: CODEX_ALLOWED_ENV_ID, status: "complete", done: true, status_text: worked };
  }
  const running = /\b(Starting container|Running setup scripts|Working on your task)\b/i.exec(text)?.[1] || "";
  if (running || cancelCount > 0) {
    return { task_id: taskId, repo: CODEX_ALLOWED_REPO, env_id: CODEX_ALLOWED_ENV_ID, status: "running", done: false, status_text: running || "Cancel task" };
  }
  return contractError(ConsumerErrorCodes.INVALID_ARGS, "ChatGPT Codex task status is not a known in-progress or terminal state.", { task_id: taskId });
}

function extractChatgptCodexFileCount(toggleText: string): number {
  const match = /File\s*\((\d+)\)/i.exec(toggleText || "");
  return match ? Number(match[1]) : 0;
}

function extractChatgptCodexDiffFromVisibleText(text: string): string {
  const normalized = String(text || "").replace(/\r\n/g, "\n");
  const hunkStart = normalized.indexOf("@@ -");
  if (hunkStart < 0) return "";
  const beforeHunk = normalized.slice(0, hunkStart);
  const header = /([^\s·]+(?:\/[^\s·]+)*\s+\+\d+\s+-\d+)\s*$/.exec(beforeHunk)?.[1] || "";
  let hunkText = normalized.slice(hunkStart).trim();
  const terminators = [/\sLogs(?:\s|$)/, /\sSummary(?:\s|$)/, /\sCreate PR(?:\s|$)/, /\sArchive Task(?:\s|$)/, /\sShare task(?:\s|$)/];
  let end = hunkText.length;
  for (const marker of terminators) {
    const match = marker.exec(hunkText);
    if (match && match.index > 0) end = Math.min(end, match.index);
  }
  hunkText = hunkText.slice(0, end).trim();
  return header ? `${header}\n${hunkText}` : hunkText;
}

async function chatgptCodexFileNamesWithExtension(page: any): Promise<string[]> {
  const labels = await chatgptCodexExtensionEvaluate<string[]>(page, "codexFileButtonLabels", `
    return Array.from(document.querySelectorAll('button[aria-label^="View file "]')).map((button) => String(button.getAttribute("aria-label") || ""));
  `).catch(() => []);
  return labels.map((label) => /^View file\s+(.+)$/.exec(label)?.[1]).filter((file): file is string => !!file);
}

async function chatgptCodexButtonTextCount(page: any, text: string): Promise<number> {
  return await chatgptCodexExtensionEvaluate<number>(page, "codexButtonTextCount", `
    const expected = String(arg.text || "").trim();
    return Array.from(document.querySelectorAll("button")).filter((button) => String(button.innerText || button.textContent || "").replace(/\\s+/g, " ").trim() === expected).length;
  `, { text }).catch(() => 0);
}

async function readChatgptCodexDiffWithExtension(page: any, taskId: string): Promise<Record<string, unknown>> {
  const status = await readChatgptCodexStatusWithExtension(page, taskId);
  if ((status as any).errorCode) {
    const text = await chatgptCodexExtensionText(page);
    const strictDoneProxy = pageTextProvesAllowedCodexTask(text) && /Worked for\s+/.test(text) && !/Cancel task/.test(text) && /Give thumbs up feedback/.test(text);
    if (!strictDoneProxy) return status;
  } else if ((status as any).status !== "complete") {
    return contractError(ConsumerErrorCodes.INVALID_ARGS, "ChatGPT Codex diff is unavailable until task completion gate is satisfied.", { task_id: taskId });
  }
  const toggleText = await chatgptCodexSelectorText(page, 'button[aria-label="Toggle file list diffs"]');
  const fileCount = extractChatgptCodexFileCount(toggleText);
  const fileButtonCount = await chatgptCodexElementCount(page, 'button[aria-label^="View file "]');
  if (fileCount < 1 || fileButtonCount < 1) return contractError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "ChatGPT Codex changes panel is absent or empty.", { task_id: taskId });
  await extensionClick(page, 'button[aria-label="Tab to view the code diff"]', 8000).catch(() => undefined);
  const files = await chatgptCodexFileNamesWithExtension(page);
  const text = await chatgptCodexExtensionText(page);
  const diffText = extractChatgptCodexDiffFromVisibleText(text);
  if (!diffText || !diffText.includes("@@ -")) return contractError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "ChatGPT Codex unified diff text was not extractable from visibleText.", { task_id: taskId });
  const createPrAvailable = await chatgptCodexButtonTextCount(page, "Create PR") > 0;
  return { task_id: taskId, repo: CODEX_ALLOWED_REPO, env_id: CODEX_ALLOWED_ENV_ID, status: "complete", files, diff_text: diffText, create_pr_available: createPrAvailable };
}

async function submitChatgptCodexTaskWithExtensionBackend(args: any, runtime: Required<BrowserToolRuntime>): Promise<Record<string, unknown>> {
  void runtime;
  const effective = chatgptCodexArgs(args);
  if (!effective.confirmed) {
    return safeOutput(contractError(ConsumerErrorCodes.SENSITIVE_CONTENT_GUARD, "ChatGPT Codex submit-task requires confirmed=true before clicking Submit.", { action: "chatgpt_codex_submit_task" }));
  }
  const repoRefusal = chatgptCodexRepoGuard(effective.repo);
  if (repoRefusal) return safeOutput(repoRefusal);
  const lease = acquireProfileLease(effective.profile);
  let backend: any;
  try {
    backend = getBackend("extension-assisted-cdp", {
      transport: "http",
      httpBridgeUrl: extensionHttpBridgeUrlForArgs(effective)
    });
    await backend.ping();
    const page = await openChatgptCodexExtensionPage(backend, effective, CODEX_URL);
    const selectedError = await selectAllowedChatgptCodexEnvWithExtension(page);
    if (selectedError) return safeOutput(selectedError);
    await page.fill(extensionTarget(CODEX_COMPOSER_SELECTOR), String(effective.prompt || ""), { timeoutMs: Math.min(effective.timeout_ms || 60000, 15000) });
    await waitForExtensionSelector(page, CODEX_SUBMIT_SELECTOR, 15000, "ChatGPT Codex Submit button was not found");
    const preSubmitTopId = await readChatgptCodexTopTaskCardId(page);
    await extensionClick(page, CODEX_SUBMIT_SELECTOR, 15000);
    const taskId = await extractSubmittedChatgptCodexTaskId(page, preSubmitTopId);
    if (!taskId) return safeOutput(contractError(ConsumerErrorCodes.POSTCONDITION_TIMEOUT, "ChatGPT Codex submit did not expose a task_e_* task id after Submit."));
    return safeOutput({ task_id: taskId, task_url: taskUrl(taskId), repo: CODEX_ALLOWED_REPO, env: CODEX_ALLOWED_ENV_NAME, env_id: CODEX_ALLOWED_ENV_ID, status: "submitted" });
  } catch (error) {
    return chatgptCodexErrorOutput(error);
  } finally {
    await backend?.finalize?.().catch?.(() => undefined);
    releaseProfileLease(effective.profile, lease);
  }
}

async function listChatgptCodexEnvsWithExtensionBackend(args: any, runtime: Required<BrowserToolRuntime>): Promise<Record<string, unknown>> {
  void runtime;
  const effective = chatgptCodexArgs(args);
  const lease = acquireProfileLease(effective.profile);
  let backend: any;
  try {
    backend = getBackend("extension-assisted-cdp", {
      transport: "http",
      httpBridgeUrl: extensionHttpBridgeUrlForArgs(effective)
    });
    await backend.ping();
    const page = await openChatgptCodexExtensionPage(backend, effective, CODEX_ENVS_URL);
    const envs = await listAllowedEnvsFromExtensionPage(page);
    if (!envs.length) return safeOutput(notProvisioned());
    return safeOutput({ status: "ok", envs });
  } catch (error) {
    return chatgptCodexErrorOutput(error);
  } finally {
    await backend?.finalize?.().catch?.(() => undefined);
    releaseProfileLease(effective.profile, lease);
  }
}

async function readChatgptCodexTaskStatusWithExtensionBackend(args: any, runtime: Required<BrowserToolRuntime>): Promise<Record<string, unknown>> {
  void runtime;
  const effective = chatgptCodexArgs(args);
  try { assertTaskId(String(effective.task_id)); }
  catch (error) { return chatgptCodexErrorOutput(error); }
  const lease = acquireProfileLease(effective.profile);
  let backend: any;
  try {
    backend = getBackend("extension-assisted-cdp", {
      transport: "http",
      httpBridgeUrl: extensionHttpBridgeUrlForArgs(effective)
    });
    await backend.ping();
    const page = await openChatgptCodexExtensionPage(backend, effective, taskUrl(String(effective.task_id)));
    return safeOutput(await readChatgptCodexStatusWithExtension(page, String(effective.task_id)));
  } catch (error) {
    return chatgptCodexErrorOutput(error);
  } finally {
    await backend?.finalize?.().catch?.(() => undefined);
    releaseProfileLease(effective.profile, lease);
  }
}

async function readChatgptCodexDiffWithExtensionBackend(args: any, runtime: Required<BrowserToolRuntime>): Promise<Record<string, unknown>> {
  void runtime;
  const effective = chatgptCodexArgs(args);
  try { assertTaskId(String(effective.task_id)); }
  catch (error) { return chatgptCodexErrorOutput(error); }
  const lease = acquireProfileLease(effective.profile);
  let backend: any;
  try {
    backend = getBackend("extension-assisted-cdp", {
      transport: "http",
      httpBridgeUrl: extensionHttpBridgeUrlForArgs(effective)
    });
    await backend.ping();
    const page = await openChatgptCodexExtensionPage(backend, effective, taskUrl(String(effective.task_id)));
    return safeOutput(await readChatgptCodexDiffWithExtension(page, String(effective.task_id)));
  } catch (error) {
    return chatgptCodexErrorOutput(error);
  } finally {
    await backend?.finalize?.().catch?.(() => undefined);
    releaseProfileLease(effective.profile, lease);
  }
}


export async function webAiChatgptSendPrompt(args: any, runtime?: BrowserToolRuntime): Promise<unknown> {
  const backend = args?.backend || "extension-assisted-cdp";
  if (backend === "extension-assisted-cdp") return sendChatgptPromptWithExtensionBackend(args, runtimeOrDefault(runtime));
  if (backend === "managed-cdp") return sendPromptOnPage("chatgpt", args, runtimeOrDefault(runtime));
  return sendPromptExtensionErrorOutput("chatgpt", args, Date.now(), new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, `webai_chatgpt_send_prompt backend must be "managed-cdp" or "extension-assisted-cdp", got ${String(backend)}`));
}
export async function webAiClaudeSendPrompt(args: any, runtime?: BrowserToolRuntime): Promise<unknown> {
  // Path C Claude Wave B1: RPC is the production default; WEBAI_CLAUDE_SEND_BACKEND=dom is the emergency DOM override, never a runtime fallback after RPC failure.
  const override = String(process.env.WEBAI_CLAUDE_SEND_BACKEND || "").trim().toLowerCase();
  if (override === "dom" || override === "extension-assisted-cdp") {
    console.error("[webai_claude_send_prompt] backend=dom-extension");
    return sendClaudePromptWithExtensionBackend(args, runtimeOrDefault(runtime));
  }
  if (override === "managed-cdp") {
    console.error("[webai_claude_send_prompt] backend=dom-managed");
    return sendPromptOnPage("claude", args, runtimeOrDefault(runtime));
  }
  if (override && override !== "rpc") {
    return claudeSendExtensionErrorOutput(args, Date.now(), new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, `WEBAI_CLAUDE_SEND_BACKEND must be "rpc", "dom", "managed-cdp", or "extension-assisted-cdp", got ${String(process.env.WEBAI_CLAUDE_SEND_BACKEND)}`));
  }
  console.error("[webai_claude_send_prompt] backend=rpc");
  const { webAiClaudeSendPromptRpc } = require("./claude_send_prompt_rpc");
  return webAiClaudeSendPromptRpc(args, runtime);
}

export async function webAiChatgptCodexSubmitTask(args: any, runtime?: BrowserToolRuntime): Promise<unknown> {
  const backend = args?.backend || "extension-assisted-cdp";
  if (backend === "extension-assisted-cdp") return submitChatgptCodexTaskWithExtensionBackend(args, runtimeOrDefault(runtime));
  if (backend === "managed-cdp") return webAiChatgptCodexSubmitTaskManaged(args, runtimeOrDefault(runtime));
  return webAiBackendInvalidOutput("webai_chatgpt_codex_submit_task", backend);
}

export async function webAiChatgptCodexListEnvs(args: any, runtime?: BrowserToolRuntime): Promise<unknown> {
  const backend = args?.backend || "extension-assisted-cdp";
  if (backend === "extension-assisted-cdp") return listChatgptCodexEnvsWithExtensionBackend(args, runtimeOrDefault(runtime));
  if (backend === "managed-cdp") return webAiChatgptCodexListEnvsManaged(args, runtimeOrDefault(runtime));
  return webAiBackendInvalidOutput("webai_chatgpt_codex_list_envs", backend);
}

export async function webAiChatgptCodexTaskStatus(args: any, runtime?: BrowserToolRuntime): Promise<unknown> {
  const backend = args?.backend || "extension-assisted-cdp";
  if (backend === "extension-assisted-cdp") return readChatgptCodexTaskStatusWithExtensionBackend(args, runtimeOrDefault(runtime));
  if (backend === "managed-cdp") return webAiChatgptCodexTaskStatusManaged(args, runtimeOrDefault(runtime));
  return webAiBackendInvalidOutput("webai_chatgpt_codex_task_status", backend);
}

export async function webAiChatgptCodexGetDiff(args: any, runtime?: BrowserToolRuntime): Promise<unknown> {
  const backend = args?.backend || "extension-assisted-cdp";
  if (backend === "extension-assisted-cdp") return readChatgptCodexDiffWithExtensionBackend(args, runtimeOrDefault(runtime));
  if (backend === "managed-cdp") return webAiChatgptCodexGetDiffManaged(args, runtimeOrDefault(runtime));
  return webAiBackendInvalidOutput("webai_chatgpt_codex_get_diff", backend);
}

export const webAiChatgptCodexCreateTask = webAiChatgptCodexSubmitTask;
export const webAiChatgptCodexListTasks = webAiChatgptCodexGetDiff;

const WEBAI_STANDALONE_THINKING_LEVELS = new Set(["auto", "extended"]);

function selectModelInvalidArgs(tool: string, message: string): Record<string, unknown> {
  return safeOutput({
    ok: false,
    selected_model: null,
    selected_thinking_level: null,
    errorCode: ConsumerErrorCodes.INVALID_ARGS,
    error_code: ConsumerErrorCodes.INVALID_ARGS,
    message: `${tool}: ${message}`
  });
}

function selectModelDrift(tool: string, selection: { actual: string | null; expected: string }, selectedThinkingLevel: string | null): Record<string, unknown> {
  return safeOutput({
    ok: false,
    selected_model: selection.actual,
    selected_thinking_level: selectedThinkingLevel,
    errorCode: ConsumerErrorCodes.MODEL_SELECTION_DRIFT,
    error_code: ConsumerErrorCodes.MODEL_SELECTION_DRIFT,
    expected_model: selection.expected,
    message: `${tool}: model selection drift; expected "${selection.expected}", actual "${selection.actual || ""}"`
  });
}

function selectModelToolError(error: WebAiToolError, selectedModel: string | null = null, selectedThinkingLevel: string | null = null): Record<string, unknown> {
  return safeOutput({
    ok: false,
    selected_model: selectedModel,
    selected_thinking_level: selectedThinkingLevel,
    errorCode: error.errorCode,
    error_code: error.errorCode,
    message: error.message,
    evidence: error.evidence
  });
}

function selectModelExtensionErrorCode(error: any): ConsumerErrorCode {
  if (isConsumerErrorCode(error?.errorCode)) return error.errorCode;
  if (isConsumerErrorCode(error?.code)) return error.code;
  const message = errorMessageFromUnknown(error, "");
  if (/timeout|timed out/i.test(message)) return ConsumerErrorCodes.COMMAND_TIMEOUT;
  if (/selector|element|not found/i.test(message)) return ConsumerErrorCodes.ELEMENT_NOT_FOUND;
  return classifyChromeExtensionBridgeError(error);
}

function selectModelExtensionErrorOutput(error: any, selectedModel: string | null = null, selectedThinkingLevel: string | null = null): Record<string, unknown> {
  if (error instanceof WebAiToolError) return selectModelToolError(error, selectedModel, selectedThinkingLevel);
  const errorCode = selectModelExtensionErrorCode(error);
  return safeOutput({
    ok: false,
    selected_model: selectedModel,
    selected_thinking_level: selectedThinkingLevel,
    errorCode,
    error_code: errorCode,
    message: errorMessageFromUnknown(error, errorCode)
  });
}

function selectModelBackendInvalid(tool: string, backend: any): Record<string, unknown> {
  return selectModelInvalidArgs(tool, `backend must be "managed-cdp" or "extension-assisted-cdp", got ${String(backend)}`);
}

function validateStandaloneSelectModelArgs(tool: string, args: any): Record<string, unknown> | null {
  if (!args?.profile || typeof args.profile !== "string") {
    return selectModelInvalidArgs(tool, "requires profile");
  }
  if (!args.model && !args.thinking_level) {
    return selectModelInvalidArgs(tool, "requires at least one of: model, thinking_level");
  }
  if (args.model !== undefined && (typeof args.model !== "string" || !args.model.trim())) {
    return selectModelInvalidArgs(tool, "model must be a non-empty picker label");
  }
  if (args.thinking_level !== undefined && !WEBAI_STANDALONE_THINKING_LEVELS.has(String(args.thinking_level))) {
    return selectModelInvalidArgs(tool, `unsupported thinking_level "${args.thinking_level}" (allowed: auto, extended)`);
  }
  return null;
}

export async function webAiChatgptSelectModel(args: any, runtime?: BrowserToolRuntime): Promise<Record<string, unknown>> {
  const backend = args?.backend || "extension-assisted-cdp";
  if (backend === "extension-assisted-cdp") return selectChatgptModelWithExtensionBackend(args, runtimeOrDefault(runtime));
  if (backend === "managed-cdp") return selectChatgptModelWithManagedBackend(args, runtimeOrDefault(runtime));
  return selectModelBackendInvalid("webai_chatgpt_select_model", backend);
}

async function selectChatgptModelWithManagedBackend(args: any, runtime: Required<BrowserToolRuntime>): Promise<Record<string, unknown>> {
  const invalid = validateStandaloneSelectModelArgs("webai_chatgpt_select_model", args);
  if (invalid) return invalid;
  const lease = acquireProfileLease(args.profile);
  const requestedThinkingLevel = args.thinking_level ? String(args.thinking_level) : null;
  try {
    return await withManagedPage(args, runtime, targetUrlFor("chatgpt", args), async (page) => {
      await ensureChatgptChatSurface(page, args);
      await waitForHydratedSurface(page, serviceDefaults.chatgpt.promptSelector, Math.min(args.timeout_ms || 60000, 15000));
      const modelFromArg = args.model ? normalizeModelTier("chatgpt", { model: args.model }) || String(args.model).trim() : null;
      const expectedModel = modelFromArg || (requestedThinkingLevel === "extended" ? "Thinking" : null);
      let selected_model: string | null = null;

      if (expectedModel) {
        const selection = await selectChatgptModel(page, expectedModel);
        if (!selection.ok) return selectModelDrift("webai_chatgpt_select_model", selection, requestedThinkingLevel);
        selected_model = selection.expected;
      }

      return safeOutput({
        ok: true,
        selected_model,
        selected_thinking_level: requestedThinkingLevel,
        errorCode: null
      });
    });
  } catch (error) {
    if (error instanceof WebAiToolError) return selectModelToolError(error, null, requestedThinkingLevel);
    throw error;
  } finally { releaseProfileLease(args.profile, lease); }
}

export async function webAiClaudeSelectModel(args: any, runtime?: BrowserToolRuntime): Promise<Record<string, unknown>> {
  // Path C Claude Wave B3: RPC is the production default; WEBAI_CLAUDE_SELECT_MODEL_BACKEND is the only emergency DOM override.
  const override = String(process.env.WEBAI_CLAUDE_SELECT_MODEL_BACKEND || "").trim().toLowerCase();
  if (override === "dom" || override === "extension-assisted-cdp") {
    console.error("[webai_claude_select_model] backend=dom-extension");
    return selectClaudeModelWithExtensionBackend(args, runtimeOrDefault(runtime));
  }
  if (override === "managed-cdp") {
    console.error("[webai_claude_select_model] backend=dom-managed");
    return selectClaudeModelWithManagedBackend(args, runtimeOrDefault(runtime));
  }
  if (override && override !== "rpc") {
    console.error("[webai_claude_select_model] backend=invalid");
    return selectModelInvalidArgs("webai_claude_select_model", `WEBAI_CLAUDE_SELECT_MODEL_BACKEND must be "rpc", "dom", "managed-cdp", or "extension-assisted-cdp", got ${String(process.env.WEBAI_CLAUDE_SELECT_MODEL_BACKEND)}`);
  }
  console.error("[webai_claude_select_model] backend=rpc");
  const { webAiClaudeSelectModelRpc } = require("./claude_select_model_rpc");
  return webAiClaudeSelectModelRpc(args, runtime);
}

async function selectClaudeModelWithManagedBackend(args: any, runtime: Required<BrowserToolRuntime>): Promise<Record<string, unknown>> {
  const invalid = validateStandaloneSelectModelArgs("webai_claude_select_model", args);
  if (invalid) return invalid;
  const lease = acquireProfileLease(args.profile);
  const requestedThinkingLevel = args.thinking_level ? String(args.thinking_level) : null;
  let selected_model: string | null = null;
  try {
    return await withManagedPage(args, runtime, targetUrlFor("claude", args), async (page) => {
      if (args.model) {
        const expectedModel = String(args.model).trim();
        const selection = await selectClaudeModel(page, expectedModel);
        if (!selection.ok) return selectModelDrift("webai_claude_select_model", selection, requestedThinkingLevel);
        selected_model = selection.expected;
      }

      if (requestedThinkingLevel === "extended") {
        await setClaudeAdaptiveThinking(page);
      }

      return safeOutput({
        ok: true,
        selected_model,
        selected_thinking_level: requestedThinkingLevel,
        errorCode: null
      });
    });
  } catch (error) {
    if (error instanceof WebAiToolError) return selectModelToolError(error, selected_model, requestedThinkingLevel);
    throw error;
  } finally { releaseProfileLease(args.profile, lease); }
}

export async function webAiGeminiSelectModel(args: any, runtime?: BrowserToolRuntime): Promise<Record<string, unknown>> {
  // Path C Gemini Wave B3: RPC is the production default; DOM is an explicit env override only, never a runtime fallback after RPC failure.
  const override = String(process.env.WEBAI_GEMINI_SELECT_MODEL_BACKEND || "").trim().toLowerCase();
  if (override === "dom" || override === "extension-assisted-cdp") {
    console.error("[webai_gemini_select_model] backend=dom-extension");
    return selectGeminiModelWithExtensionBackend(args, runtimeOrDefault(runtime));
  }
  if (override === "managed-cdp") {
    console.error("[webai_gemini_select_model] backend=dom-managed");
    return selectGeminiModelWithManagedBackend(args, runtimeOrDefault(runtime));
  }
  if (override && override !== "rpc") {
    console.error("[webai_gemini_select_model] backend=invalid");
    return selectModelInvalidArgs("webai_gemini_select_model", `WEBAI_GEMINI_SELECT_MODEL_BACKEND must be "rpc", "dom", "managed-cdp", or "extension-assisted-cdp", got ${String(process.env.WEBAI_GEMINI_SELECT_MODEL_BACKEND)}`);
  }
  // Path C Gemini Wave C1 (2026-05-27): model 3.1-pro is now RPC_AVAILABLE via
  // the same L5adhe settings template family as flash / flash_lite (capture at
  // .runs/path-c-gemini-rpc/wave-c1-coverage-gaps/webai_gemini_select_model--select_pro).
  // The earlier write-time DOM re-route for 3.1-pro is removed; it flows through
  // the RPC default below alongside the other supported models. DOM stays an
  // explicit env override only (WEBAI_GEMINI_SELECT_MODEL_BACKEND), never a
  // silent runtime fallback.
  console.error("[webai_gemini_select_model] backend=rpc");
  const { webAiGeminiSelectModelRpc } = require("./gemini_select_model_rpc");
  return webAiGeminiSelectModelRpc(args, runtime);
}

async function selectGeminiModelWithManagedBackend(args: any, runtime: Required<BrowserToolRuntime>): Promise<Record<string, unknown>> {
  if (!args.model && !args.thinking_level) {
    return safeOutput({ ok: false, errorCode: ConsumerErrorCodes.INVALID_ARGS, error_code: ConsumerErrorCodes.INVALID_ARGS, message: "webai_gemini_select_model requires at least one of: model, thinking_level" });
  }
  if (args.model && !isSupportedGeminiModelOption(args.model)) {
    return safeOutput({ ok: false, errorCode: ConsumerErrorCodes.INVALID_ARGS, error_code: ConsumerErrorCodes.INVALID_ARGS, message: `webai_gemini_select_model: unsupported model "${args.model}" (allowed: 3.1-flash-lite, 3.5-flash, 3.1-pro)` });
  }
  if (args.thinking_level && !GEMINI_THINKING_OPTION_TEMPLATES[args.thinking_level]) {
    return safeOutput({ ok: false, errorCode: ConsumerErrorCodes.INVALID_ARGS, error_code: ConsumerErrorCodes.INVALID_ARGS, message: `webai_gemini_select_model: unsupported thinking_level "${args.thinking_level}" (allowed: standard, extended)` });
  }
  const lease = acquireProfileLease(args.profile);
  try {
    return await withManagedPage(args, runtime, targetUrlFor("gemini", args), async (page) => {
      // Open the picker once at the start; both branches re-open if it auto-closed.
      const openPicker = async () => {
        // Dismiss any stale cdk-overlay-backdrop (e.g. previously-opened mat-menu / tools drawer)
        // — Angular Material's transparent backdrop intercepts the trigger click otherwise.
        await page.keyboard?.press?.("Escape").catch(() => undefined);
        await page.waitForFunction?.(() => !document.querySelector('.cdk-overlay-backdrop-showing'), undefined, { timeout: 2000 }).catch(() => undefined);
        const trigger = page.locator(GEMINI_MODE_PICKER_TRIGGER_SELECTOR).first();
        await trigger.waitFor({ state: "visible", timeout: 5000 }).catch(() => {
          throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "Gemini mode picker trigger was not found", { selector: GEMINI_MODE_PICKER_TRIGGER_SELECTOR });
        });
        const expanded = await trigger.getAttribute("aria-expanded").catch(() => null);
        if (expanded !== "true") {
          await trigger.click({ timeout: 5000 });
          await page.waitForSelector(`${GEMINI_MODE_PICKER_EXPANDED_SELECTOR}, [role="menuitem"]`, { state: "visible", timeout: 5000 });
        }
      };
      let selected_model: string | null = null;
      let selected_thinking_level: string | null = null;

      if (args.model) {
        await openPicker();
        const modelSelector = GEMINI_MODEL_OPTION_TEMPLATES[args.model] || geminiModelOptionSelector(args.model);
        const opt = page.locator(modelSelector).first();
        await opt.waitFor({ state: "visible", timeout: 5000 }).catch(() => {
          throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, `Gemini model option ${args.model} not found`, { selector: modelSelector });
        });
        await opt.click({ timeout: 5000 });
        selected_model = args.model;
        await page.waitForTimeout?.(300);
      }

      if (args.thinking_level) {
        await openPicker();
        const expander = page.locator(GEMINI_THINKING_EXPANDER_SELECTOR).first();
        await expander.waitFor({ state: "visible", timeout: 5000 }).catch(() => {
          throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "Gemini Thinking level expander was not found", { selector: GEMINI_THINKING_EXPANDER_SELECTOR });
        });
        await expander.click({ timeout: 5000 });
        const lvlOpt = page.locator(GEMINI_THINKING_OPTION_TEMPLATES[args.thinking_level]).first();
        await lvlOpt.waitFor({ state: "visible", timeout: 3000 }).catch(() => {
          throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, `Gemini thinking_level option ${args.thinking_level} not found`, { selector: GEMINI_THINKING_OPTION_TEMPLATES[args.thinking_level] });
        });
        await lvlOpt.click({ timeout: 5000 });
        selected_thinking_level = args.thinking_level;
        await page.waitForTimeout?.(300);
      }

      // Best-effort close (Escape) so downstream commands don't run with picker open.
      await page.keyboard?.press?.("Escape")?.catch?.(() => undefined);
      return safeOutput({ ok: true, selected_model, selected_thinking_level, errorCode: null });
    });
  } finally { releaseProfileLease(args.profile, lease); }
}

export async function webAiGeminiSendPrompt(args: any, runtime?: BrowserToolRuntime): Promise<unknown> {
  // Path C Gemini Wave B1: RPC is the production default; WEBAI_GEMINI_SEND_BACKEND is the only emergency DOM override, never a runtime fallback after RPC failure.
  const override = String(process.env.WEBAI_GEMINI_SEND_BACKEND || "").trim().toLowerCase();
  if (override === "dom" || override === "extension-assisted-cdp") {
    console.error("[webai_gemini_send_prompt] backend=dom-extension");
    return sendGeminiPromptWithExtensionBackend(args, runtimeOrDefault(runtime));
  }
  if (override === "managed-cdp") {
    console.error("[webai_gemini_send_prompt] backend=dom-managed");
    return sendPromptOnPage("gemini", args, runtimeOrDefault(runtime));
  }
  if (override && override !== "rpc") {
    return sendPromptExtensionErrorOutput("gemini", args, Date.now(), new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, `WEBAI_GEMINI_SEND_BACKEND must be "rpc", "dom", "managed-cdp", or "extension-assisted-cdp", got ${String(process.env.WEBAI_GEMINI_SEND_BACKEND)}`));
  }
  // Path C cross-model review N1: web_search and thinking_web_search variants
  // are RPC_NOT_AVAILABLE (gemini_send_prompt_rpc.ts:286-288 throws
  // INVALID_ARGS for any args.web_search request). Route to DOM at write-time
  // rather than letting RPC throw — mirrors webAiGeminiCanvasEdit pattern.
  if (args?.web_search) {
    console.error("[webai_gemini_send_prompt] backend=dom-extension (RPC_NOT_AVAILABLE for web_search variant)");
    return sendGeminiPromptWithExtensionBackend(args, runtimeOrDefault(runtime));
  }
  console.error("[webai_gemini_send_prompt] backend=rpc");
  const { webAiGeminiSendPromptRpc } = require("./gemini_send_prompt_rpc");
  return webAiGeminiSendPromptRpc(args, runtime);
}
export async function webAiChatgptUploadAndQuery(args: any, runtime?: BrowserToolRuntime): Promise<unknown> {
  const backend = args?.backend || "extension-assisted-cdp";
  if (backend === "extension-assisted-cdp") return uploadAndQueryWithExtensionBackend("chatgpt", args, runtimeOrDefault(runtime));
  if (backend === "managed-cdp") return uploadAndQueryOnPage("chatgpt", args, runtimeOrDefault(runtime));
  return uploadExtensionErrorOutput("chatgpt", args, new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, `webai_chatgpt_upload_and_query backend must be "managed-cdp" or "extension-assisted-cdp", got ${String(backend)}`));
}
export async function webAiClaudeUploadAndQuery(args: any, runtime?: BrowserToolRuntime): Promise<unknown> {
  // Path C Claude Wave B2: RPC is the production default; WEBAI_CLAUDE_UPLOAD_BACKEND=dom is the emergency DOM override, never a runtime fallback after RPC failure.
  const override = String(process.env.WEBAI_CLAUDE_UPLOAD_BACKEND || "").trim().toLowerCase();
  if (override === "dom" || override === "extension-assisted-cdp") {
    console.error("[webai_claude_upload_and_query] backend=dom-extension");
    return uploadAndQueryClaudeWithExtensionBackend(args, runtimeOrDefault(runtime));
  }
  if (override === "managed-cdp") {
    console.error("[webai_claude_upload_and_query] backend=dom-managed");
    return uploadAndQueryOnPage("claude", args, runtimeOrDefault(runtime));
  }
  if (override && override !== "rpc") {
    return claudeUploadExtensionErrorOutput(args, new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, `WEBAI_CLAUDE_UPLOAD_BACKEND must be "rpc", "dom", "managed-cdp", or "extension-assisted-cdp", got ${String(process.env.WEBAI_CLAUDE_UPLOAD_BACKEND)}`));
  }
  console.error("[webai_claude_upload_and_query] backend=rpc");
  const { webAiClaudeUploadAndQueryRpc } = require("./claude_upload_rpc");
  return webAiClaudeUploadAndQueryRpc(args, runtime);
}
export async function webAiGeminiUploadAndQuery(args: any, runtime?: BrowserToolRuntime): Promise<unknown> {
  // Path C Gemini Wave B2: RPC is the production default; DOM is an explicit operator override, never a runtime fallback after RPC failure.
  const override = String(process.env.WEBAI_GEMINI_UPLOAD_BACKEND || args?.backend || "").trim().toLowerCase();
  if (override === "dom" || override === "extension-assisted-cdp") {
    console.error("[webai_gemini_upload_and_query] backend=dom-extension");
    return uploadAndQueryWithExtensionBackend("gemini", args, runtimeOrDefault(runtime));
  }
  if (override === "managed-cdp") {
    console.error("[webai_gemini_upload_and_query] backend=dom-managed");
    return uploadAndQueryOnPage("gemini", args, runtimeOrDefault(runtime));
  }
  if (override && override !== "rpc") {
    return uploadExtensionErrorOutput("gemini", args, new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, `WEBAI_GEMINI_UPLOAD_BACKEND/backend must be "rpc", "dom", "managed-cdp", or "extension-assisted-cdp", got ${String(process.env.WEBAI_GEMINI_UPLOAD_BACKEND || args?.backend)}`));
  }
  console.error("[webai_gemini_upload_and_query] backend=rpc");
  const { webAiGeminiUploadAndQueryRpc } = require("./gemini_upload_rpc");
  return webAiGeminiUploadAndQueryRpc(args, runtime);
}
export async function webAiChatgptGenerateFile(args: any, runtime?: BrowserToolRuntime): Promise<unknown> {
  const backend = args?.backend || "extension-assisted-cdp";
  if (backend === "extension-assisted-cdp") return generateChatgptFileWithExtensionBackend(args, runtimeOrDefault(runtime));
  if (backend === "managed-cdp") return generateFileOnPage("chatgpt", args, runtimeOrDefault(runtime));
  return fileErrorOutput(ConsumerErrorCodes.INVALID_ARGS, `webai_chatgpt_generate_file backend must be "managed-cdp" or "extension-assisted-cdp", got ${String(backend)}`);
}
export async function webAiClaudeGenerateFile(args: any, runtime?: BrowserToolRuntime): Promise<unknown> {
  // Path C Claude Wave B4: RPC is the production default for generated artifacts; DOM remains an explicit operator override, never a runtime fallback after RPC failure.
  const selected = String(process.env.WEBAI_CLAUDE_GENERATE_FILE_BACKEND || args?.backend || "rpc").trim().toLowerCase();
  if (selected === "dom" || selected === "extension-assisted-cdp") {
    console.error("[webai_claude_generate_file] backend=dom-extension");
    return generateClaudeFileWithExtensionBackend(args, runtimeOrDefault(runtime));
  }
  if (selected === "managed-cdp") {
    console.error("[webai_claude_generate_file] backend=dom-managed");
    return generateFileOnPage("claude", args, runtimeOrDefault(runtime));
  }
  if (selected && selected !== "rpc") return fileErrorOutput(ConsumerErrorCodes.INVALID_ARGS, `WEBAI_CLAUDE_GENERATE_FILE_BACKEND/backend must be "rpc", "dom", "managed-cdp", or "extension-assisted-cdp", got ${String(process.env.WEBAI_CLAUDE_GENERATE_FILE_BACKEND || args?.backend)}`);
  console.error("[webai_claude_generate_file] backend=rpc");
  const { webAiClaudeGenerateFileRpc } = require("./claude_generate_file_rpc");
  return webAiClaudeGenerateFileRpc(args, runtime);
}
export async function webAiChatgptGenerateImage(args: any, runtime?: BrowserToolRuntime): Promise<unknown> {
  const backend = args?.backend || "extension-assisted-cdp";
  if (backend === "managed-cdp") return generateImageOnPage("chatgpt", args, runtimeOrDefault(runtime));
  if (backend === "extension-assisted-cdp") return generateChatgptImageWithExtensionBackend(args, runtimeOrDefault(runtime));
  return imageErrorOutput(ConsumerErrorCodes.INVALID_ARGS, `webai_chatgpt_generate_image backend must be "managed-cdp" or "extension-assisted-cdp", got ${String(backend)}`);
}
export async function webAiGeminiGenerateImage(args: any, runtime?: BrowserToolRuntime): Promise<unknown> {
  // Path C Gemini Wave B2: RPC is the production default; DOM overrides are explicit and never a post-RPC fallback.
  const override = String(process.env.WEBAI_GEMINI_GENERATE_IMAGE_BACKEND || args?.backend || "").trim().toLowerCase();
  if (override === "dom" || override === "extension-assisted-cdp") {
    console.error("[webai_gemini_generate_image] backend=dom-extension");
    return generateGeminiImageWithExtensionBackend(args, runtimeOrDefault(runtime));
  }
  if (override === "managed-cdp") {
    console.error("[webai_gemini_generate_image] backend=dom-managed");
    return generateImageOnPage("gemini", args, runtimeOrDefault(runtime));
  }
  if (override && override !== "rpc") return imageErrorOutput(ConsumerErrorCodes.INVALID_ARGS, `WEBAI_GEMINI_GENERATE_IMAGE_BACKEND/backend must be "rpc", "dom", "managed-cdp", or "extension-assisted-cdp", got ${String(process.env.WEBAI_GEMINI_GENERATE_IMAGE_BACKEND || args?.backend)}`);
  console.error("[webai_gemini_generate_image] backend=rpc");
  const { webAiGeminiGenerateImageRpc } = require("./gemini_media_rpc");
  return webAiGeminiGenerateImageRpc(args, runtime);
}
export async function webAiGeminiCanvasToDocs(args: any, runtime?: BrowserToolRuntime): Promise<unknown> {
  // Path C Gemini Wave B4: export_docs has no safe captured Docs RPC, so the
  // production path remains DOM by write-time decision; env/arg select DOM backend only.
  const selected = String(process.env.WEBAI_GEMINI_CANVAS_TO_DOCS_BACKEND || args?.backend || "extension-assisted-cdp").trim().toLowerCase();
  if (selected === "dom" || selected === "extension-assisted-cdp") {
    console.error("[webai_gemini_canvas_to_docs] backend=dom-extension rpc_not_available=export_docs");
    return canvasToDocsWithExtensionBackend(args, runtimeOrDefault(runtime));
  }
  if (selected === "managed-cdp") {
    console.error("[webai_gemini_canvas_to_docs] backend=dom-managed rpc_not_available=export_docs");
    return canvasToDocs(args, runtimeOrDefault(runtime));
  }
  return webAiBackendInvalidOutput("webai_gemini_canvas_to_docs", process.env.WEBAI_GEMINI_CANVAS_TO_DOCS_BACKEND || args?.backend);
}
export async function webAiGeminiGenerateVideo(args: any, runtime?: BrowserToolRuntime): Promise<unknown> {
  // Path C Gemini Wave B2: shortest-duration video RPC is the production default; DOM overrides are explicit only.
  const override = String(process.env.WEBAI_GEMINI_GENERATE_VIDEO_BACKEND || args?.backend || "").trim().toLowerCase();
  if (override === "dom" || override === "extension-assisted-cdp") {
    console.error("[webai_gemini_generate_video] backend=dom-extension");
    return generateGeminiVideoWithExtensionBackend(args, runtimeOrDefault(runtime));
  }
  if (override === "managed-cdp") {
    console.error("[webai_gemini_generate_video] backend=dom-managed");
    return startGeminiVideoTask(args, runtimeOrDefault(runtime));
  }
  if (override && override !== "rpc") return videoErrorOutput(ConsumerErrorCodes.INVALID_ARGS, `WEBAI_GEMINI_GENERATE_VIDEO_BACKEND/backend must be "rpc", "dom", "managed-cdp", or "extension-assisted-cdp", got ${String(process.env.WEBAI_GEMINI_GENERATE_VIDEO_BACKEND || args?.backend)}`);
  console.error("[webai_gemini_generate_video] backend=rpc");
  const { webAiGeminiGenerateVideoRpc } = require("./gemini_media_rpc");
  return webAiGeminiGenerateVideoRpc(args, runtime);
}
export async function webAiChatgptCanvasExport(args: any, runtime?: BrowserToolRuntime): Promise<unknown> {
  const backend = args?.backend || "extension-assisted-cdp";
  if (backend === "extension-assisted-cdp") return exportChatgptCanvasWithExtensionBackend(args, runtimeOrDefault(runtime));
  if (backend === "managed-cdp") return exportChatgptCanvas(args, runtimeOrDefault(runtime));
  return webAiBackendInvalidOutput("webai_chatgpt_canvas_export", backend);
}
export async function webAiChatgptPulseGet(args: any, runtime?: BrowserToolRuntime): Promise<unknown> {
  const backend = args?.backend || "extension-assisted-cdp";
  if (backend === "extension-assisted-cdp") return getChatgptPulseWithExtensionBackend(args, runtimeOrDefault(runtime));
  if (backend === "managed-cdp") return getChatgptPulse(args, runtimeOrDefault(runtime));
  return webAiBackendInvalidOutput("webai_chatgpt_pulse_get", backend);
}
export async function webAiChatgptPulseOnboard(args: any, runtime?: BrowserToolRuntime): Promise<unknown> {
  const backend = args?.backend || "extension-assisted-cdp";
  if (backend === "extension-assisted-cdp") return onboardChatgptPulseWithExtensionBackend(args, runtimeOrDefault(runtime));
  if (backend === "managed-cdp") return onboardChatgptPulse(args, runtimeOrDefault(runtime));
  return webAiBackendInvalidOutput("webai_chatgpt_pulse_onboard", backend);
}
export async function webAiChatgptDeepResearch(args: any, runtime?: BrowserToolRuntime): Promise<unknown> {
  const backend = args?.backend || "extension-assisted-cdp";
  if (backend === "extension-assisted-cdp") return startChatgptDeepResearchWithExtensionBackend(args, runtimeOrDefault(runtime));
  if (backend === "managed-cdp") return startChatgptDeepResearch(args, runtimeOrDefault(runtime));
  return webAiBackendInvalidOutput("webai_chatgpt_deep_research", backend);
}
export async function webAiClaudeDeepResearch(args: any, runtime?: BrowserToolRuntime): Promise<unknown> {
  // Path C Claude Wave B4: RPC is the production default; DOM is explicit via env/arg and is not a fallback after RPC failure.
  const selected = String(process.env.WEBAI_CLAUDE_DEEP_RESEARCH_BACKEND || args?.backend || "rpc").trim().toLowerCase();
  if (selected === "dom" || selected === "extension-assisted-cdp") {
    console.error("[webai_claude_deep_research] backend=dom-extension");
    return startClaudeDeepResearchWithExtensionBackend(args, runtimeOrDefault(runtime));
  }
  if (selected === "managed-cdp") {
    console.error("[webai_claude_deep_research] backend=dom-managed");
    return startClaudeDeepResearch(args, runtimeOrDefault(runtime));
  }
  if (selected && selected !== "rpc") return webAiBackendInvalidOutput("webai_claude_deep_research", process.env.WEBAI_CLAUDE_DEEP_RESEARCH_BACKEND || args?.backend);
  console.error("[webai_claude_deep_research] backend=rpc");
  const { webAiClaudeDeepResearchRpc } = require("./claude_deep_research_rpc");
  return webAiClaudeDeepResearchRpc(args, runtime);
}
export async function webAiChatgptConversationManage(args: any, runtime?: BrowserToolRuntime): Promise<unknown> {
  const backend = args?.backend || "extension-assisted-cdp";
  if (backend === "extension-assisted-cdp") return manageChatgptConversationWithExtensionBackend(args, runtimeOrDefault(runtime));
  if (backend === "managed-cdp") return manageChatgptConversation(args, runtimeOrDefault(runtime));
  return webAiBackendInvalidOutput("webai_chatgpt_conversation_manage", backend);
}
export async function webAiClaudeConversationManage(args: any, runtime?: BrowserToolRuntime): Promise<unknown> {
  // Path C Claude Wave B3: RPC is the production default; WEBAI_CLAUDE_CONVERSATION_MANAGE_BACKEND is the only emergency DOM override.
  const override = String(process.env.WEBAI_CLAUDE_CONVERSATION_MANAGE_BACKEND || "").trim().toLowerCase();
  if (override === "dom" || override === "extension-assisted-cdp") {
    console.error("[webai_claude_conversation_manage] backend=dom-extension");
    return manageClaudeConversationWithExtensionBackend(args, runtimeOrDefault(runtime));
  }
  if (override === "managed-cdp") {
    console.error("[webai_claude_conversation_manage] backend=dom-managed");
    return manageClaudeConversation(args, runtimeOrDefault(runtime));
  }
  if (override && override !== "rpc") {
    console.error("[webai_claude_conversation_manage] backend=invalid");
    return safeOutput({ ok: false, errorCode: ConsumerErrorCodes.INVALID_ARGS, error_code: ConsumerErrorCodes.INVALID_ARGS, message: `WEBAI_CLAUDE_CONVERSATION_MANAGE_BACKEND must be "rpc", "dom", "managed-cdp", or "extension-assisted-cdp", got ${String(process.env.WEBAI_CLAUDE_CONVERSATION_MANAGE_BACKEND)}` });
  }
  console.error("[webai_claude_conversation_manage] backend=rpc");
  const { webAiClaudeConversationManageRpc } = require("./claude_conversation_manage_rpc");
  return webAiClaudeConversationManageRpc(args, runtime);
}
export async function webAiChatgptWorkspace(args: any, runtime?: BrowserToolRuntime): Promise<unknown> {
  const backend = args?.backend || "extension-assisted-cdp";
  if (backend === "extension-assisted-cdp") return inspectChatgptWorkspaceWithExtensionBackend(args, runtimeOrDefault(runtime));
  if (backend === "managed-cdp") return inspectChatgptWorkspace(args, runtimeOrDefault(runtime));
  return webAiBackendInvalidOutput("webai_chatgpt_workspace", backend);
}
export async function webAiClaudeWorkspace(args: any, runtime?: BrowserToolRuntime): Promise<unknown> {
  // Path C Claude Wave B3: RPC is the production default; WEBAI_CLAUDE_WORKSPACE_BACKEND is the only emergency DOM override.
  const override = String(process.env.WEBAI_CLAUDE_WORKSPACE_BACKEND || "").trim().toLowerCase();
  if (override === "dom" || override === "extension-assisted-cdp") {
    console.error("[webai_claude_workspace] backend=dom-extension");
    return inspectClaudeWorkspaceWithExtensionBackend(args, runtimeOrDefault(runtime));
  }
  if (override === "managed-cdp") {
    console.error("[webai_claude_workspace] backend=dom-managed");
    return inspectClaudeWorkspace(args, runtimeOrDefault(runtime));
  }
  if (override && override !== "rpc") {
    console.error("[webai_claude_workspace] backend=invalid");
    return safeOutput({ ok: false, errorCode: ConsumerErrorCodes.INVALID_ARGS, error_code: ConsumerErrorCodes.INVALID_ARGS, message: `WEBAI_CLAUDE_WORKSPACE_BACKEND must be "rpc", "dom", "managed-cdp", or "extension-assisted-cdp", got ${String(process.env.WEBAI_CLAUDE_WORKSPACE_BACKEND)}` });
  }
  // Path C cross-model review I2: surface=appearance RPC is 0.64x DOM
  // (.runs/path-c-claude-rpc/wave-b3-workspace-model-conversation/ab-sweep-results.json:178
  // confirms RPC reaches the endpoint with http_status:200 but the
  // experiences/claude_web upstream is just slower than the DOM read).
  // Route appearance to DOM at write-time; other surfaces stay on RPC.
  if (args?.surface === "appearance") {
    console.error("[webai_claude_workspace] backend=dom-extension (surface=appearance is faster on DOM)");
    return inspectClaudeWorkspaceWithExtensionBackend(args, runtimeOrDefault(runtime));
  }
  console.error("[webai_claude_workspace] backend=rpc");
  const { webAiClaudeWorkspaceRpc } = require("./claude_workspace_rpc");
  return webAiClaudeWorkspaceRpc(args, runtime);
}
export async function webAiGeminiDeepResearch(args: any, runtime?: BrowserToolRuntime): Promise<unknown> {
  // Path C Gemini Wave B4: RPC is the production default; DOM is an explicit
  // env/arg override and is never a runtime fallback after RPC failure.
  const selected = String(process.env.WEBAI_GEMINI_DEEP_RESEARCH_BACKEND || args?.backend || "rpc").trim().toLowerCase();
  if (selected === "dom" || selected === "extension-assisted-cdp") {
    console.error("[webai_gemini_deep_research] backend=dom-extension");
    return startGeminiDeepResearchWithExtensionBackend(args, runtimeOrDefault(runtime));
  }
  if (selected === "managed-cdp") {
    console.error("[webai_gemini_deep_research] backend=dom-managed");
    return startGeminiDeepResearch(args, runtimeOrDefault(runtime));
  }
  if (selected && selected !== "rpc") return webAiBackendInvalidOutput("webai_gemini_deep_research", process.env.WEBAI_GEMINI_DEEP_RESEARCH_BACKEND || args?.backend);
  console.error("[webai_gemini_deep_research] backend=rpc");
  const { webAiGeminiDeepResearchRpc } = require("./gemini_deep_research_rpc");
  return webAiGeminiDeepResearchRpc(args, runtime);
}
export async function webAiGeminiCanvasEdit(args: any, runtime?: BrowserToolRuntime): Promise<unknown> {
  // Path C Gemini Wave B4: open_canvas routes through RPC by default. Canvas
  // sub-surface edits without a captured inner API stay DOM-only by write-time
  // decision (RPC_NOT_AVAILABLE), not by catching an RPC failure.
  const selected = String(process.env.WEBAI_GEMINI_CANVAS_BACKEND || args?.backend || "rpc").trim().toLowerCase();
  if (selected === "dom" || selected === "extension-assisted-cdp") {
    console.error("[webai_gemini_canvas_edit] backend=dom-extension");
    return editGeminiCanvasWithExtensionBackend(args, runtimeOrDefault(runtime));
  }
  if (selected === "managed-cdp") {
    console.error("[webai_gemini_canvas_edit] backend=dom-managed");
    return editGeminiCanvas(args, runtimeOrDefault(runtime));
  }
  if (selected && selected !== "rpc") return webAiBackendInvalidOutput("webai_gemini_canvas_edit", process.env.WEBAI_GEMINI_CANVAS_BACKEND || args?.backend);
  const { geminiCanvasRpcVariantAvailable, resolveGeminiCanvasRpcVariant, webAiGeminiCanvasRpc } = require("./gemini_canvas_rpc");
  const variant = resolveGeminiCanvasRpcVariant(args || {}, "webai_gemini_canvas_edit");
  if (!geminiCanvasRpcVariantAvailable(variant)) {
    console.error(`[webai_gemini_canvas_edit] backend=dom-extension variant=${variant} rpc_not_available`);
    return editGeminiCanvasWithExtensionBackend(args, runtimeOrDefault(runtime));
  }
  console.error(`[webai_gemini_canvas_edit] backend=rpc variant=${variant}`);
  return webAiGeminiCanvasRpc(args, runtime);
}
export async function webAiGeminiConversationManage(args: any, runtime?: BrowserToolRuntime): Promise<unknown> {
  // Path C Gemini Wave B3: RPC is the production default; DOM is an explicit env override only, never a runtime fallback after RPC failure.
  const override = String(process.env.WEBAI_GEMINI_CONVERSATION_MANAGE_BACKEND || "").trim().toLowerCase();
  if (override === "dom" || override === "extension-assisted-cdp") {
    console.error("[webai_gemini_conversation_manage] backend=dom-extension");
    return manageGeminiConversationWithExtensionBackend(args, runtimeOrDefault(runtime));
  }
  if (override === "managed-cdp") {
    console.error("[webai_gemini_conversation_manage] backend=dom-managed");
    return manageGeminiConversation(args, runtimeOrDefault(runtime));
  }
  if (override && override !== "rpc") {
    console.error("[webai_gemini_conversation_manage] backend=invalid");
    return safeOutput({ ok: false, errorCode: ConsumerErrorCodes.INVALID_ARGS, error_code: ConsumerErrorCodes.INVALID_ARGS, message: `WEBAI_GEMINI_CONVERSATION_MANAGE_BACKEND must be "rpc", "dom", "managed-cdp", or "extension-assisted-cdp", got ${String(process.env.WEBAI_GEMINI_CONVERSATION_MANAGE_BACKEND)}` });
  }
  console.error("[webai_gemini_conversation_manage] backend=rpc");
  const { webAiGeminiConversationManageRpc } = require("./gemini_conversation_manage_rpc");
  return webAiGeminiConversationManageRpc(args, runtime);
}
export async function webAiGeminiWorkspace(args: any, runtime?: BrowserToolRuntime): Promise<unknown> {
  // Path C Gemini Wave B3: RPC is the production default; DOM is an explicit env override only, never a runtime fallback after RPC failure.
  const override = String(process.env.WEBAI_GEMINI_WORKSPACE_BACKEND || "").trim().toLowerCase();
  if (override === "dom" || override === "extension-assisted-cdp") {
    console.error("[webai_gemini_workspace] backend=dom-extension");
    return inspectGeminiWorkspaceWithExtensionBackend(args, runtimeOrDefault(runtime));
  }
  if (override === "managed-cdp") {
    console.error("[webai_gemini_workspace] backend=dom-managed");
    return inspectGeminiWorkspace(args, runtimeOrDefault(runtime));
  }
  if (override && override !== "rpc") {
    console.error("[webai_gemini_workspace] backend=invalid");
    return safeOutput({ ok: false, errorCode: ConsumerErrorCodes.INVALID_ARGS, error_code: ConsumerErrorCodes.INVALID_ARGS, message: `WEBAI_GEMINI_WORKSPACE_BACKEND must be "rpc", "dom", "managed-cdp", or "extension-assisted-cdp", got ${String(process.env.WEBAI_GEMINI_WORKSPACE_BACKEND)}` });
  }
  console.error("[webai_gemini_workspace] backend=rpc");
  const { webAiGeminiWorkspaceRpc } = require("./gemini_workspace_rpc");
  return webAiGeminiWorkspaceRpc(args, runtime);
}

const DEFAULT_GEMINI_MUSIC_PROFILE = "gemini-9225";

function geminiMusicArgs(args: any): any {
  return { ...(args || {}), profile: String(args?.profile || DEFAULT_GEMINI_MUSIC_PROFILE) };
}

function geminiMusicTargetUrlForTab(tabUrlContains?: unknown): string {
  const value = typeof tabUrlContains === "string" ? tabUrlContains.trim() : "";
  if (!value) return GEMINI_MUSIC_URL;
  if (/^https?:\/\//i.test(value)) return value;
  if (/^[A-Za-z0-9_-]{6,}$/.test(value)) return `https://gemini.google.com/app/${value}`;
  return GEMINI_MUSIC_URL;
}

async function openGeminiMusicPollingExtensionPage(backend: any, args: any): Promise<any> {
  const requested = args.url || args.tab_url_contains;
  const target = geminiMusicTargetUrlForTab(requested);
  const timeoutMs = Math.min(args.timeout_ms || 60000, 30000);
  const page = requested
    ? await backend.newTab({ url: target, profile: args.profile, background: false })
    : await backend.claimTab({ url: GEMINI_MUSIC_URL, profile: args.profile });
  await page.navigate(target, { waitUntil: "domcontentloaded", timeoutMs });
  return page;
}

async function extensionSelectorPresent(page: any, selector: string): Promise<boolean> {
  try {
    if (typeof page.queryElements === "function") {
      const elements = await page.queryElements(selector, { limit: 1 });
      return Array.isArray(elements) && elements.length > 0;
    }
    if (typeof page.evaluateReadOnly === "function") {
      return Boolean(await page.evaluateReadOnly(`(() => {
        try { return document.querySelectorAll(arg.selector).length > 0; }
        catch (_) { return false; }
      })()`, { selector }));
    }
  } catch {
    return false;
  }
  return false;
}

function geminiMusicDownloadErrorOutput(args: any, error: any): Record<string, unknown> {
  const errorCode = webAiExtensionErrorCode(error);
  return safeOutput({
    ok: false,
    savedPath: "",
    sha256: "",
    byteSize: 0,
    format: (args?.format as GeminiMusicFormat | undefined) || "mp3",
    errorCode,
    error_code: errorCode,
    message: errorMessageFromUnknown(error, errorCode)
  });
}

function geminiMusicStatusErrorOutput(error: any, extra: Record<string, unknown> = {}): Record<string, unknown> {
  const errorCode = webAiExtensionErrorCode(error);
  return safeOutput({
    ok: false,
    status: "error",
    download_ready: false,
    conversation_url: "",
    errorCode,
    error_code: errorCode,
    message: errorMessageFromUnknown(error, errorCode),
    ...extra
  });
}

async function webAiGeminiMusicDownloadTrackWithExtensionBackend(args: any, runtime: Required<BrowserToolRuntime>): Promise<Record<string, unknown>> {
  const effective = geminiMusicArgs(args);
  const lease = acquireProfileLease(effective.profile);
  let backend: any;
  try {
    backend = getBackend("extension-assisted-cdp", {
      transport: "http",
      httpBridgeUrl: extensionHttpBridgeUrlForArgs(effective)
    });
    await backend.ping();
    const page = await openGeminiMusicPollingExtensionPage(backend, effective);
    const snapshot = await extensionTextSnapshot(page).catch(() => ({ url: geminiMusicTargetUrlForTab(effective.tab_url_contains), text: "" }));
    if (loginRequiredForService("gemini", snapshot.url || "")) {
      return safeOutput({
        ok: false,
        savedPath: "",
        sha256: "",
        byteSize: 0,
        format: (effective.format as GeminiMusicFormat | undefined) || "mp3",
        errorCode: ConsumerErrorCodes.LOGIN_REQUIRED,
        error_code: ConsumerErrorCodes.LOGIN_REQUIRED,
        message: "Gemini login is required before music download"
      });
    }
    const tabUrlContains = effective.tab_url_contains || snapshot.url || GEMINI_MUSIC_URL;
    const result = await stepDownloadTrack({ url: () => snapshot.url || tabUrlContains }, {
      profile: effective.profile,
      tabUrlContains,
      downloadDir: effective.download_dir as string | undefined,
      format: (effective.format as GeminiMusicFormat | undefined) || "mp3",
      timeoutMs: Number(effective.timeout_ms || 90000),
      locateTimeoutMs: Number(effective.locate_timeout_ms || 45000),
      prerenderWaitMs: 2500,
      artifactClick: (options: Record<string, unknown>) => runArtifactClickWithCdpReadinessRetry(runtime, options as any)
    });
    return safeOutput(result);
  } catch (error: any) {
    return geminiMusicDownloadErrorOutput(effective, error);
  } finally {
    await backend?.finalize?.().catch?.(() => undefined);
    releaseProfileLease(effective.profile, lease);
  }
}

async function webAiGeminiMusicTaskStatusWithExtensionBackend(args: any, runtime: Required<BrowserToolRuntime>): Promise<Record<string, unknown>> {
  void runtime;
  const effective = geminiMusicArgs(args);
  const lease = acquireProfileLease(effective.profile);
  let backend: any;
  try {
    backend = getBackend("extension-assisted-cdp", {
      transport: "http",
      httpBridgeUrl: extensionHttpBridgeUrlForArgs(effective)
    });
    await backend.ping();
    const page = await openGeminiMusicPollingExtensionPage(backend, effective);
    const snapshot = await extensionTextSnapshot(page).catch(() => ({ url: geminiMusicTargetUrlForTab(effective.tab_url_contains), text: "" }));
    const conversation_url = snapshot.url || effective.tab_url_contains || GEMINI_MUSIC_URL;
    if (loginRequiredForService("gemini", conversation_url)) {
      return geminiMusicStatusErrorOutput(new WebAiToolError(ConsumerErrorCodes.LOGIN_REQUIRED, "Gemini login is required before music task status"), { conversation_url });
    }
    await page.waitForSelector?.(`${MUSIC_DOWNLOAD_BTN_SELECTOR}, ${MUSIC_STOP_SELECTOR}`, {
      state: "visible",
      timeoutMs: Math.min(effective.timeout_ms || 60000, 15000)
    }).catch?.(() => undefined);
    const downloadReady = await extensionSelectorPresent(page, MUSIC_DOWNLOAD_BTN_SELECTOR);
    const generating = await extensionSelectorPresent(page, MUSIC_STOP_SELECTOR);
    if (downloadReady) return safeOutput({ status: "complete", download_ready: true, conversation_url, errorCode: null });
    if (generating) return safeOutput({ status: "generating", download_ready: false, conversation_url, errorCode: null });
    return safeOutput({ status: "error", download_ready: false, conversation_url, errorCode: null });
  } catch (error: any) {
    return geminiMusicStatusErrorOutput(error);
  } finally {
    await backend?.finalize?.().catch?.(() => undefined);
    releaseProfileLease(effective.profile, lease);
  }
}

export async function webAiGeminiMusicGenerate(args: any, runtime?: BrowserToolRuntime): Promise<Record<string, unknown>> {
  // Path C Gemini Wave B2: verified instrumental music generation now defaults to RPC; DOM is an explicit operator override, never a runtime fallback.
  const override = String(process.env.WEBAI_GEMINI_MUSIC_GENERATE_BACKEND || args?.backend || "").trim().toLowerCase();
  if (override === "dom" || override === "extension-assisted-cdp") {
    console.error("[webai_gemini_music_generate] backend=dom-extension");
    return webAiGeminiMusicGenerateManaged({ ...(args || {}), backend: "extension-assisted-cdp" }, runtimeOrDefault(runtime));
  }
  if (override === "managed-cdp") {
    console.error("[webai_gemini_music_generate] backend=dom-managed");
    return webAiGeminiMusicGenerateManaged({ ...(args || {}), backend: "managed-cdp" }, runtimeOrDefault(runtime));
  }
  if (override && override !== "rpc") {
    return safeOutput({ task_id: "", status: "error", conversation_url: "", ok: false, errorCode: ConsumerErrorCodes.INVALID_ARGS, error_code: ConsumerErrorCodes.INVALID_ARGS, message: `WEBAI_GEMINI_MUSIC_GENERATE_BACKEND/backend must be "rpc", "dom", "managed-cdp", or "extension-assisted-cdp", got ${String(process.env.WEBAI_GEMINI_MUSIC_GENERATE_BACKEND || args?.backend)}` });
  }
  console.error("[webai_gemini_music_generate] backend=rpc");
  const { webAiGeminiMusicGenerateRpc } = require("./gemini_media_rpc");
  return webAiGeminiMusicGenerateRpc(args, runtime);
}

export async function webAiGeminiMusicDownloadTrack(args: any, runtime?: BrowserToolRuntime): Promise<Record<string, unknown>> {
  // Path C Gemini Wave B2: mp3/video download-track captures were RPC_NOT_AVAILABLE
  // (no ready-track/no matching download RPC). This tool remains DOM-only by
  // write-time decision; this is not a runtime fallback after an RPC failure.
  const override = String(process.env.WEBAI_GEMINI_MUSIC_DOWNLOAD_TRACK_BACKEND || args?.backend || "extension-assisted-cdp").trim().toLowerCase();
  if (override === "dom" || override === "extension-assisted-cdp") {
    console.error("[webai_gemini_music_download_track] backend=dom-extension");
    return webAiGeminiMusicDownloadTrackWithExtensionBackend(args, runtimeOrDefault(runtime));
  }
  if (override === "managed-cdp") {
    console.error("[webai_gemini_music_download_track] backend=dom-managed");
    return webAiGeminiMusicDownloadTrackManaged(args, runtimeOrDefault(runtime));
  }
  // Path C cross-model review N1: mp3/video download-track is RPC_NOT_AVAILABLE
  // (gemini_media_rpc.ts:755 returns INVALID_ARGS for any download-track call).
  // Route explicit backend=rpc requests to DOM at write-time rather than
  // returning INVALID_ARGS — mirrors webAiGeminiCanvasEdit pattern.
  if (override === "rpc") {
    console.error("[webai_gemini_music_download_track] backend=dom-extension (RPC_NOT_AVAILABLE for mp3/video download-track)");
    return webAiGeminiMusicDownloadTrackWithExtensionBackend(args, runtimeOrDefault(runtime));
  }
  return safeOutput({ ok: false, savedPath: "", sha256: "", byteSize: 0, format: String(args?.format || "mp3"), errorCode: ConsumerErrorCodes.INVALID_ARGS, error_code: ConsumerErrorCodes.INVALID_ARGS, message: `WEBAI_GEMINI_MUSIC_DOWNLOAD_TRACK_BACKEND/backend must be "dom", "managed-cdp", or "extension-assisted-cdp" because mp3/video are RPC_NOT_AVAILABLE, got ${String(process.env.WEBAI_GEMINI_MUSIC_DOWNLOAD_TRACK_BACKEND || args?.backend)}` });
}

export async function webAiGeminiMusicTaskStatus(args: any, runtime?: BrowserToolRuntime): Promise<Record<string, unknown>> {
  const backend = args?.backend || "extension-assisted-cdp";
  if (backend === "extension-assisted-cdp") return webAiGeminiMusicTaskStatusWithExtensionBackend(args, runtimeOrDefault(runtime));
  if (backend === "managed-cdp") return webAiGeminiMusicTaskStatusManaged(args, runtimeOrDefault(runtime));
  return webAiBackendInvalidOutput("webai_gemini_music_task_status", backend);
}

function webAiTaskStatusFromDatabase(args: any, database: CapabilityDatabase): Record<string, unknown> {
  const record = database.getWebAiTask(args.task_id);
  if (!record) return safeOutput({ status: "failed", errorCode: ConsumerErrorCodes.INVALID_ARGS });
  const current = maybeMarkStaleVideoTask(database, record);
  return safeOutput({ status: current.status, progress_label: current.progress_label, result: current.result, errorCode: current.errorCode });
}

function webAiTaskStatusRecordResult(record?: WebAiTaskRecord): Record<string, unknown> {
  return isRecord(record?.result) ? record!.result as Record<string, unknown> : {};
}

async function webAiTaskStatusWithExtensionBackend(args: any, runtime: Required<BrowserToolRuntime>): Promise<Record<string, unknown>> {
  const database = runtime.database || new CapabilityDatabase();
  const taskId = String(args?.task_id || "");
  const record = database.getWebAiTask(taskId);
  const result = webAiTaskStatusRecordResult(record);
  const tabUrlContains = args?.tab_url_contains || result.conversation_url || result.chat_url || result.url;
  if (taskId.startsWith("gemini_music_") || /gemini\.google\.com\/app/i.test(String(tabUrlContains || ""))) {
    const musicStatus = await webAiGeminiMusicTaskStatusWithExtensionBackend({
      ...args,
      profile: args?.profile || record?.profile || DEFAULT_GEMINI_MUSIC_PROFILE,
      tab_url_contains: tabUrlContains,
      backend: "extension-assisted-cdp"
    }, runtime);
    return safeOutput({ task_id: taskId, ...musicStatus });
  }
  return webAiTaskStatusFromDatabase(args, database);
}

export async function webAiTaskStatus(args: any, runtime?: BrowserToolRuntime): Promise<unknown> {
  const backend = args?.backend || "extension-assisted-cdp";
  if (backend === "extension-assisted-cdp") return webAiTaskStatusWithExtensionBackend(args, runtimeOrDefault(runtime));
  if (backend === "managed-cdp") return webAiTaskStatusFromDatabase(args, runtime?.database || new CapabilityDatabase());
  return webAiBackendInvalidOutput("webai_task_status", backend);
}

export async function webAiLiteratureTaskStatus(args: any): Promise<unknown> {
  const taskId = String(args?.task_id || "");
  const record = getLiteratureTaskStatus(taskId);
  if (!record) {
    return safeOutput({
      ok: false,
      task_id: taskId,
      status: "fail",
      db_slug: "",
      doc_id: "",
      queued_at: 0,
      started_at: null,
      completed_at: null,
      result_path: null,
      error: "task not found",
      errorCode: ConsumerErrorCodes.INVALID_ARGS,
      message: "Literature download task not found"
    });
  }
  return safeOutput({
    ok: record.status !== "fail",
    task_id: record.task_id,
    status: record.status,
    db_slug: record.db_slug,
    doc_id: record.doc_id,
    queued_at: record.queued_at,
    started_at: record.started_at,
    completed_at: record.completed_at,
    result_path: record.result_path,
    error: record.error,
    errorCode: record.status === "fail" ? ConsumerErrorCodes.UNKNOWN : null,
    message: record.status === "done"
      ? "Literature download completed"
      : record.status === "fail"
        ? "Literature download failed"
        : "Literature download task is pending"
  });
}

export async function webAiClaudeDesignCreateProject(args: any, runtime?: BrowserToolRuntime): Promise<unknown> {
  // Path C Claude Wave C1: create_project now has RPC; generate + present remain
  // TRUE_RPC_NOT_AVAILABLE per .runs/path-c-claude-rpc/wave-c1-coverage-gaps/INVENTORY.md
  // (generate needs Connect+proto streaming; present is client-side route nav).
  // Wave C1 re-capture via DOM-nav surfaced Omelette CreateProject accepting
  // application/json Connect-unary with body {name} → {projectId}.
  const backend = process.env.WEBAI_CLAUDE_DESIGN_BACKEND || args?.backend || "rpc";
  if (backend === "rpc") {
    console.error("[webai_claude_design_create_project] backend=rpc");
    const { webAiClaudeDesignCreateProjectRpc } = require("./claude_design_rpc");
    return webAiClaudeDesignCreateProjectRpc(args, runtime);
  }
  if (backend === "dom") return webAiClaudeDesignCreateProjectWithExtensionBackend(args, runtimeOrDefault(runtime));
  if (backend === "extension-assisted-cdp") return webAiClaudeDesignCreateProjectWithExtensionBackend(args, runtimeOrDefault(runtime));
  if (backend === "managed-cdp") return webAiClaudeDesignCreateProjectManaged(args, runtimeOrDefault(runtime));
  return webAiBackendInvalidOutput("webai_claude_design_create_project", backend);
}

export async function webAiClaudeDesignGenerate(args: any, runtime?: BrowserToolRuntime): Promise<unknown> {
  // Path C cross-model review I3: design generate has no replayable RPC
  // (CLAUDE_DESIGN_RPC_AVAILABILITY.generate.rpcAvailable === false).
  // Route to the existing DOM driver at write-time rather than returning
  // INVALID_ARGS when callers ask for "rpc" — mirrors the gold-standard
  // Gemini canvas dispatcher pattern (webAiGeminiCanvasEdit).
  const backend = process.env.WEBAI_CLAUDE_DESIGN_BACKEND || args?.backend || "extension-assisted-cdp";
  if (backend === "rpc") {
    console.error("[webai_claude_design_generate] backend=dom-extension (RPC_NOT_AVAILABLE for op=generate)");
    return webAiClaudeDesignGenerateWithExtensionBackend(args, runtimeOrDefault(runtime));
  }
  if (backend === "dom") return webAiClaudeDesignGenerateWithExtensionBackend(args, runtimeOrDefault(runtime));
  if (backend === "extension-assisted-cdp") return webAiClaudeDesignGenerateWithExtensionBackend(args, runtimeOrDefault(runtime));
  if (backend === "managed-cdp") return webAiClaudeDesignGenerateManaged(args, runtimeOrDefault(runtime));
  return webAiBackendInvalidOutput("webai_claude_design_generate", backend);
}

export async function webAiClaudeDesignGetHtml(args: any, runtime?: BrowserToolRuntime): Promise<unknown> {
  // Path C Claude Wave B4: get_html uses DOM-navigate-then-RPC against Claude Design's mounted Omelette GetFile endpoint; DOM is explicit only, not a fallback after RPC failure.
  const backend = String(process.env.WEBAI_CLAUDE_DESIGN_BACKEND || args?.backend || "rpc").trim().toLowerCase();
  if (backend === "dom" || backend === "extension-assisted-cdp") {
    console.error("[webai_claude_design_get_html] backend=dom-extension");
    return webAiClaudeDesignGetHtmlWithExtensionBackend(args, runtimeOrDefault(runtime));
  }
  if (backend === "managed-cdp") {
    console.error("[webai_claude_design_get_html] backend=dom-managed");
    return webAiClaudeDesignGetHtmlManaged(args, runtimeOrDefault(runtime));
  }
  if (backend === "rpc") {
    console.error("[webai_claude_design_get_html] backend=rpc");
    const { webAiClaudeDesignGetHtmlRpc } = require("./claude_design_rpc");
    return webAiClaudeDesignGetHtmlRpc(args, runtime);
  }
  return webAiBackendInvalidOutput("webai_claude_design_get_html", backend);
}

export async function webAiClaudeDesignPresent(args: any, runtime?: BrowserToolRuntime): Promise<unknown> {
  // Path C cross-model review I3: design present has no replayable RPC
  // (CLAUDE_DESIGN_RPC_AVAILABILITY.present.rpcAvailable === false).
  // Route to the existing DOM driver at write-time rather than returning
  // INVALID_ARGS when callers ask for "rpc" — mirrors the gold-standard
  // Gemini canvas dispatcher pattern (webAiGeminiCanvasEdit).
  const backend = process.env.WEBAI_CLAUDE_DESIGN_BACKEND || args?.backend || "extension-assisted-cdp";
  if (backend === "rpc") {
    console.error("[webai_claude_design_present] backend=dom-extension (RPC_NOT_AVAILABLE for op=present)");
    return webAiClaudeDesignPresentWithExtensionBackend(args, runtimeOrDefault(runtime));
  }
  if (backend === "dom") return webAiClaudeDesignPresentWithExtensionBackend(args, runtimeOrDefault(runtime));
  if (backend === "extension-assisted-cdp") return webAiClaudeDesignPresentWithExtensionBackend(args, runtimeOrDefault(runtime));
  if (backend === "managed-cdp") return webAiClaudeDesignPresentManaged(args, runtimeOrDefault(runtime));
  return webAiBackendInvalidOutput("webai_claude_design_present", backend);
}

function sendPromptSchemaWithBackend<T>(schema: RuntimeSchema<T>, service: string): RuntimeSchema<T & { backend?: "managed-cdp" | "extension-assisted-cdp" }> {
  const json = schema.toJsonSchema();
  return objectSchema<T & { backend?: "managed-cdp" | "extension-assisted-cdp" }>({
    ...(json.properties || {}),
    backend: webAiBackendSchema(`Browser backend for ${service} prompt routing; defaults to extension-assisted-cdp`)
  }, json.required || []);
}

function selectModelSchemaWithBackend<T>(schema: RuntimeSchema<T>, service: string): RuntimeSchema<T & { backend?: "managed-cdp" | "extension-assisted-cdp" }> {
  const json = schema.toJsonSchema();
  return objectSchema<T & { backend?: "managed-cdp" | "extension-assisted-cdp" }>({
    ...(json.properties || {}),
    backend: webAiBackendSchema(`Browser backend for ${service} model selection routing; defaults to extension-assisted-cdp`)
  }, json.required || []);
}

function uploadSchemaWithBackend<T>(schema: RuntimeSchema<T>, service: string): RuntimeSchema<T & { backend?: "managed-cdp" | "extension-assisted-cdp" }> {
  const json = schema.toJsonSchema();
  return objectSchema<T & { backend?: "managed-cdp" | "extension-assisted-cdp" }>({
    ...(json.properties || {}),
    backend: webAiBackendSchema(`Browser backend for ${service} upload routing; defaults to extension-assisted-cdp`)
  }, json.required || []);
}

function generateFileSchemaWithBackend<T>(schema: RuntimeSchema<T>, service: string): RuntimeSchema<T & { backend?: "managed-cdp" | "extension-assisted-cdp" }> {
  const json = schema.toJsonSchema();
  return objectSchema<T & { backend?: "managed-cdp" | "extension-assisted-cdp" }>({
    ...(json.properties || {}),
    backend: webAiBackendSchema(`Browser backend for ${service} generate-file routing; defaults to extension-assisted-cdp`)
  }, json.required || []);
}

function readToolSchemaWithBackend<T>(schema: RuntimeSchema<T>, service: string, noun: string): RuntimeSchema<T & { backend?: "managed-cdp" | "extension-assisted-cdp" }> {
  const json = schema.toJsonSchema();
  return objectSchema<T & { backend?: "managed-cdp" | "extension-assisted-cdp" }>({
    ...(json.properties || {}),
    backend: webAiBackendSchema(`Browser backend for ${service} ${noun} routing; defaults to extension-assisted-cdp`)
  }, json.required || []);
}

function extensionDriverSchemaWithBackend<T>(schema: RuntimeSchema<T>, service: string, noun: string): RuntimeSchema<T & { backend?: "managed-cdp" | "extension-assisted-cdp" }> {
  const json = schema.toJsonSchema();
  return objectSchema<T & { backend?: "managed-cdp" | "extension-assisted-cdp" }>({
    ...(json.properties || {}),
    backend: webAiBackendSchema(`Browser backend for ${service} ${noun} routing; defaults to extension-assisted-cdp`)
  }, json.required || []);
}

function conversationManageSchemaWithBackend<T>(schema: RuntimeSchema<T>, service: string): RuntimeSchema<T & { backend?: "managed-cdp" | "extension-assisted-cdp"; action: string }> {
  const json = schema.toJsonSchema();
  const properties = { ...(json.properties || {}) };
  const action = properties.action;
  if (Array.isArray(action?.enum) && !action.enum.includes("list")) {
    properties.action = {
      ...action,
      enum: [...action.enum, "list"]
    };
  }
  return objectSchema<T & { backend?: "managed-cdp" | "extension-assisted-cdp"; action: string }>({
    ...properties,
    backend: webAiBackendSchema(`Browser backend for ${service} conversation management routing; defaults to extension-assisted-cdp`)
  }, json.required || []);
}

function subMcpSchema(name: string): RuntimeSchema<any> {
  const spec = subMcpToolSpecs.find((tool) => tool.name === name);
  if (!spec) throw new Error(`Missing sub-MCP schema for ${name}`);
  return spec.schema;
}

const webAiChatgptSendPromptWithBackendInput = sendPromptSchemaWithBackend(webAiChatgptSendPromptInput, "ChatGPT");
const webAiGeminiSendPromptWithBackendInput = sendPromptSchemaWithBackend(webAiGeminiSendPromptInput, "Gemini");
const webAiChatgptSelectModelWithBackendInput = selectModelSchemaWithBackend(webAiChatgptSelectModelInput, "ChatGPT");
const webAiClaudeSelectModelWithBackendInput = selectModelSchemaWithBackend(webAiClaudeSelectModelInput, "Claude");
const webAiGeminiSelectModelWithBackendInput = selectModelSchemaWithBackend(webAiGeminiSelectModelInput, "Gemini");
const webAiChatgptUploadAndQueryWithBackendInput = uploadSchemaWithBackend(webAiUploadAndQueryInput, "ChatGPT");
const webAiGeminiUploadAndQueryWithBackendInput = uploadSchemaWithBackend(webAiUploadAndQueryInput, "Gemini");
const webAiChatgptGenerateFileWithBackendInput = generateFileSchemaWithBackend(webAiGenerateFileInput, "ChatGPT");
const webAiChatgptConversationManageWithBackendInput = conversationManageSchemaWithBackend(webAiChatgptConversationManageInput, "ChatGPT");
const webAiClaudeConversationManageWithBackendInput = conversationManageSchemaWithBackend(webAiClaudeConversationManageInput, "Claude");
const webAiGeminiConversationManageWithBackendInput = conversationManageSchemaWithBackend(webAiGeminiConversationManageInput, "Gemini");
const webAiChatgptWorkspaceWithBackendInput = readToolSchemaWithBackend(webAiChatgptWorkspaceInput, "ChatGPT", "workspace");
const webAiClaudeWorkspaceWithBackendInput = readToolSchemaWithBackend(webAiClaudeWorkspaceInput, "Claude", "workspace");
const webAiGeminiWorkspaceWithBackendInput = readToolSchemaWithBackend(webAiGeminiWorkspaceInput, "Gemini", "workspace");
const webAiChatgptDeepResearchWithBackendInput = deepResearchSchemaWithBackend(webAiChatgptDeepResearchInput, "ChatGPT");
const webAiClaudeDeepResearchWithBackendInput = deepResearchSchemaWithBackend(webAiClaudeDeepResearchInput, "Claude");
const webAiGeminiDeepResearchWithBackendInput = deepResearchSchemaWithBackend(webAiGeminiDeepResearchInput, "Gemini");
const webAiChatgptCanvasExportWithBackendInput = extensionDriverSchemaWithBackend(webAiChatgptCanvasExportInput, "ChatGPT", "canvas export");
const webAiChatgptPulseGetWithBackendInput = extensionDriverSchemaWithBackend(webAiChatgptPulseGetInput, "ChatGPT", "pulse read");
const webAiChatgptPulseOnboardWithBackendInput = extensionDriverSchemaWithBackend(webAiChatgptPulseOnboardInput, "ChatGPT", "pulse onboarding");
const webAiGeminiCanvasToDocsWithBackendInput = extensionDriverSchemaWithBackend(webAiCanvasToDocsInput, "Gemini", "canvas-to-docs");
const webAiGeminiCanvasEditWithBackendInput = extensionDriverSchemaWithBackend(webAiGeminiCanvasEditInput, "Gemini", "canvas edit");
const webAiClaudeDesignCreateProjectWithBackendInput = extensionDriverSchemaWithBackend(subMcpSchema("webai_claude_design_create_project"), "Claude Design", "create-project");
const webAiClaudeDesignGenerateWithBackendInput = extensionDriverSchemaWithBackend(subMcpSchema("webai_claude_design_generate"), "Claude Design", "generate");
const webAiClaudeDesignGetHtmlWithBackendInput = extensionDriverSchemaWithBackend(subMcpSchema("webai_claude_design_get_html"), "Claude Design", "get-html");
const webAiClaudeDesignPresentWithBackendInput = extensionDriverSchemaWithBackend(subMcpSchema("webai_claude_design_present"), "Claude Design", "present");
const webAiGeminiMusicDownloadTrackWithBackendInput = extensionDriverSchemaWithBackend(subMcpSchema("webai_gemini_music_download_track"), "Gemini Music", "download-track");
const webAiGeminiMusicTaskStatusWithBackendInput = extensionDriverSchemaWithBackend(subMcpSchema("webai_gemini_music_task_status"), "Gemini Music", "task-status");
const webAiTaskStatusJson = webAiTaskStatusInput.toJsonSchema();
const webAiTaskStatusWithBackendInput = objectSchema<Record<string, unknown>>({
  ...(webAiTaskStatusJson.properties || {}),
  profile: scalar.string("Optional browser profile for extension-polled task status"),
  tab_url_contains: scalar.string("Optional conversation URL fragment for extension-polled task status"),
  backend: webAiBackendSchema("Browser backend for task-status routing; defaults to extension-assisted-cdp")
}, webAiTaskStatusJson.required || []);
const webAiLiteratureTaskStatusSchema = webAiLiteratureTaskStatusInput;
const webAiLiteratureDownloadPdfSchema = webAiLiteratureDownloadPdfInput;
const webAiPaywalledLiteratureDownloadPdfSchema = webAiPaywalledLiteratureDownloadPdfInput;
const webAiBibliographicOnlyLiteratureDownloadPdfSchema = webAiBibliographicOnlyLiteratureDownloadPdfInput;
const webAiChatgptCodexSubmitTaskWithBackendInput = objectSchema<Record<string, unknown>>({
  prompt: scalar.string("ChatGPT Codex task prompt; submitted only to the allowlisted LT-0I/CN- environment"),
  repo: scalar.string("Must be LT-0I/CN- when supplied; other repositories are refused"),
  branch: scalar.string("Optional branch selected in the already-bound LT-0I/CN- environment"),
  confirmed: { ...scalar.boolean("Required true to submit the Codex task"), default: false },
  profile: { ...scalar.string("Managed ChatGPT browser profile"), default: "chatgpt" },
  backend: webAiBackendSchema("Browser backend for ChatGPT Codex submit-task routing; defaults to extension-assisted-cdp")
}, ["prompt", "profile"]);
const webAiChatgptCodexListEnvsWithBackendInput = objectSchema<Record<string, unknown>>({
  profile: { ...scalar.string("Managed ChatGPT browser profile"), default: "chatgpt" },
  backend: webAiBackendSchema("Browser backend for ChatGPT Codex environment-list routing; defaults to extension-assisted-cdp")
}, ["profile"]);
const webAiChatgptCodexTaskStatusWithBackendInput = objectSchema<Record<string, unknown>>({
  task_id: scalar.string("ChatGPT Codex task id"),
  profile: { ...scalar.string("Managed ChatGPT browser profile"), default: "chatgpt" },
  backend: webAiBackendSchema("Browser backend for ChatGPT Codex task-status routing; defaults to extension-assisted-cdp")
}, ["task_id", "profile"]);
const webAiChatgptCodexGetDiffWithBackendInput = objectSchema<Record<string, unknown>>({
  task_id: scalar.string("ChatGPT Codex task id whose completed LT-0I/CN- diff should be read"),
  profile: { ...scalar.string("Managed ChatGPT browser profile"), default: "chatgpt" },
  backend: webAiBackendSchema("Browser backend for ChatGPT Codex diff-read routing; defaults to extension-assisted-cdp")
}, ["task_id", "profile"]);

const coreToolSpecs: ToolSpec[] = [

  {
    name: "wah_capability_query",
    description: "Query manifest-backed capabilities and legacy tool aliases without exposing local browser internals.",
    schema: wahCapabilityQueryInput,
    handler: async (args, runtime) => wahCapabilityQuery(args, runtime)
  },
  {
    name: "wah_adapter_health",
    description: "Return adapter and manifest health for a provider, including generated-tool availability.",
    schema: wahAdapterHealthInput,
    handler: async (args) => wahAdapterHealth(args)
  },
  {
    name: "wah_policy_explain",
    description: "Explain the policy, safety class, approvals, and stable error codes for a capability.",
    schema: wahPolicyExplainInput,
    handler: async (args) => wahPolicyExplain(args)
  },
  {
    name: "wah_task_start",
    description: "Start a manifest-backed task or return its dry-run execution plan.",
    schema: wahTaskStartInput,
    handler: async (args, runtime) => wahTaskStart(args, runtime)
  },
  {
    name: "wah_task_status",
    description: "Read status and event metadata for a manifest-backed task run.",
    schema: wahTaskStatusInput,
    handler: async (args, runtime) => wahTaskStatus(args, runtime)
  },
  {
    name: "wah_task_cancel",
    description: "Request cancellation for a manifest-backed task run.",
    schema: wahTaskCancelInput,
    handler: async (args, runtime) => wahTaskCancel(args, runtime)
  },
  {
    name: "wah_task_resume",
    description: "Resume or re-plan a manifest-backed task run from persisted evidence.",
    schema: wahTaskResumeInput,
    handler: async (args, runtime) => wahTaskResume(args, runtime)
  },
  {
    name: "wah_artifact_get",
    description: "Read redacted metadata for a persisted run artifact by id or path.",
    schema: wahArtifactGetInput,
    handler: async (args, runtime) => wahArtifactGet(args, runtime)
  },
  {
    name: "consumer_health",
    description: "Return a consumer-safe health summary without CDP endpoints, profile paths, page URLs, snapshots, cookies, or tokens.",
    schema: consumerHealthInput,
    handler: async (args, runtime) => consumerHealth({ target: args.target, profile: args.profile, launcher: runtime.launcher })
  },
  {
    name: "webai_chatgpt_send_prompt",
    description: "Send a prompt to ChatGPT and return redacted response metadata.",
    schema: webAiChatgptSendPromptWithBackendInput,
    handler: async (args, runtime) => webAiChatgptSendPrompt(args, runtime)
  },
  {
    name: "webai_chatgpt_select_model",
    description: "Select a ChatGPT model and/or thinking level without sending a prompt.",
    schema: webAiChatgptSelectModelWithBackendInput,
    handler: async (args, runtime) => webAiChatgptSelectModel(args, runtime)
  },
  {
    name: "webai_claude_send_prompt",
    description: "Send a prompt to Claude and return redacted response metadata.",
    schema: webAiClaudeSendPromptInput,
    handler: async (args, runtime) => webAiClaudeSendPrompt(args, runtime)
  },
  {
    name: "webai_claude_select_model",
    description: "Select a Claude model and/or thinking level without sending a prompt.",
    schema: webAiClaudeSelectModelWithBackendInput,
    handler: async (args, runtime) => webAiClaudeSelectModel(args, runtime)
  },
  {
    name: "webai_gemini_send_prompt",
    description: "Send a prompt to Gemini and return redacted response metadata.",
    schema: webAiGeminiSendPromptWithBackendInput,
    handler: async (args, runtime) => webAiGeminiSendPrompt(args, runtime)
  },
  {
    name: "webai_gemini_select_model",
    description: "Select a Gemini model and/or thinking level without sending a prompt.",
    schema: webAiGeminiSelectModelWithBackendInput,
    handler: async (args, runtime) => webAiGeminiSelectModel(args, runtime)
  },
  {
    name: "webai_chatgpt_upload_and_query",
    description: "Upload files to ChatGPT and ask a prompt about them.",
    schema: webAiChatgptUploadAndQueryWithBackendInput,
    handler: async (args, runtime) => webAiChatgptUploadAndQuery(args, runtime)
  },
  {
    name: "webai_claude_upload_and_query",
    description: "Upload up to three files to Claude and ask a prompt about them.",
    schema: webAiClaudeUploadAndQueryInput,
    handler: async (args, runtime) => webAiClaudeUploadAndQuery(args, runtime)
  },
  {
    name: "webai_gemini_upload_and_query",
    description: "Upload files to Gemini and ask a prompt about them.",
    schema: webAiGeminiUploadAndQueryWithBackendInput,
    handler: async (args, runtime) => webAiGeminiUploadAndQuery(args, runtime)
  },
  {
    name: "webai_chatgpt_generate_file",
    description: "Ask ChatGPT to generate a downloadable file artifact and return sha256 metadata.",
    schema: webAiChatgptGenerateFileWithBackendInput,
    handler: async (args, runtime) => webAiChatgptGenerateFile(args, runtime)
  },
  {
    name: "webai_claude_generate_file",
    description: "Ask Claude to generate a downloadable artifact and return sha256 metadata.",
    schema: webAiClaudeGenerateFileInput,
    handler: async (args, runtime) => webAiClaudeGenerateFile(args, runtime)
  },
  {
    name: "webai_chatgpt_generate_image",
    description: "Ask ChatGPT to generate an image and return download metadata.",
    schema: webAiChatgptGenerateImageInput,
    handler: async (args, runtime) => webAiChatgptGenerateImage(args, runtime)
  },
  {
    name: "webai_gemini_generate_image",
    description: "Ask Gemini to generate an image and return download metadata.",
    schema: webAiGenerateImageInput,
    handler: async (args, runtime) => webAiGeminiGenerateImage(args, runtime)
  },
  {
    name: "webai_gemini_canvas_to_docs",
    description: "Generate a Gemini Canvas and export it to Google Docs after publish-safety checks.",
    schema: webAiGeminiCanvasToDocsWithBackendInput,
    handler: async (args, runtime) => webAiGeminiCanvasToDocs(args, runtime)
  },
  {
    name: "webai_gemini_generate_video",
    description: "Queue an async Gemini video generation task and return a task id immediately.",
    schema: webAiGenerateVideoInput,
    handler: async (args, runtime) => webAiGeminiGenerateVideo(args, runtime)
  },
  {
    name: "webai_gemini_deep_research",
    description: "Start a Gemini Deep research task and return a task id immediately; poll with webai_task_status.",
    schema: webAiGeminiDeepResearchWithBackendInput,
    handler: async (args, runtime) => webAiGeminiDeepResearch(args, runtime)
  },
  {
    name: "webai_gemini_canvas_edit",
    description: "Open or edit a Gemini Canvas using direct canvas-body edits or observe-only AI edit controls.",
    schema: webAiGeminiCanvasEditWithBackendInput,
    handler: async (args, runtime) => webAiGeminiCanvasEdit(args, runtime)
  },
  {
    name: "webai_gemini_conversation_manage",
    description: "Enumerate Gemini conversation menu items, guard sharing, or search conversations without mutating data.",
    schema: webAiGeminiConversationManageWithBackendInput,
    handler: async (args, runtime) => webAiGeminiConversationManage(args, runtime)
  },
  {
    name: "webai_gemini_workspace",
    description: "Navigate read-only Gemini workspace/settings surfaces and return a short summary.",
    schema: webAiGeminiWorkspaceWithBackendInput,
    handler: async (args, runtime) => webAiGeminiWorkspace(args, runtime)
  },
  {
    name: "webai_task_status",
    description: "Return status/result metadata for an async webai task.",
    schema: webAiTaskStatusWithBackendInput,
    handler: async (args, runtime) => webAiTaskStatus(args, runtime)
  },
  {
    name: "webai_literature_task_status",
    description: "Return status/result metadata for a queued academic literature download task.",
    schema: webAiLiteratureTaskStatusSchema,
    handler: async (args) => webAiLiteratureTaskStatus(args)
  },
  {
    name: "webai_arxiv_download_pdf",
    description: "Download an open-access arXiv PDF by arXiv id, honoring the literature queue quota.",
    schema: webAiLiteratureDownloadPdfSchema,
    handler: async (args) => webAiArxivDownloadPdf(args)
  },
  {
    name: "webai_scoap3_download_pdf",
    description: "Download an open-access SCOAP3 PDF by article id or direct URL, honoring the literature queue quota.",
    schema: webAiLiteratureDownloadPdfSchema,
    handler: async (args) => webAiScoap3DownloadPdf(args)
  },
  {
    name: "webai_mdpi_download_pdf",
    description: "Download an open-access MDPI article PDF by article id, honoring the literature queue quota.",
    schema: webAiLiteratureDownloadPdfSchema,
    handler: async (args) => webAiMdpiDownloadPdf(args)
  },
  {
    name: "webai_frontiers_download_pdf",
    description: "Download an open-access Frontiers article PDF by article path, honoring the literature queue quota.",
    schema: webAiLiteratureDownloadPdfSchema,
    handler: async (args) => webAiFrontiersDownloadPdf(args)
  },
  {
    name: "webai_pubscholar_download_pdf",
    description: "Resolve and download an open-access PubScholar article PDF from its record page, honoring the literature queue quota.",
    schema: webAiLiteratureDownloadPdfSchema,
    handler: async (args) => webAiPubscholarDownloadPdf(args)
  },
  {
    name: "webai_scielo_download_pdf",
    description: "Download an open-access SciELO PDF from a journal/article PID pair, honoring the literature queue quota.",
    schema: webAiLiteratureDownloadPdfSchema,
    handler: async (args) => webAiScieloDownloadPdf(args)
  },
  {
    name: "webai_inspirehep_download_pdf",
    description: "Resolve an INSPIREHEP record to its arXiv mirror or document PDF and download it, honoring the literature queue quota.",
    schema: webAiLiteratureDownloadPdfSchema,
    handler: async (args) => webAiInspirehepDownloadPdf(args)
  },
  {
    name: "webai_aip_download_pdf",
    description: "Download an AIP Publishing PDF through an authenticated research browser profile, honoring the literature queue quota.",
    schema: webAiPaywalledLiteratureDownloadPdfSchema,
    handler: async (args) => webAiAipDownloadPdf(args)
  },
  {
    name: "webai_aps_download_pdf",
    description: "Download an APS Journals PDF through an authenticated research browser profile, honoring the literature queue quota.",
    schema: webAiPaywalledLiteratureDownloadPdfSchema,
    handler: async (args) => webAiApsDownloadPdf(args)
  },
  {
    name: "webai_iop_download_pdf",
    description: "Download an IOPscience PDF through an authenticated research browser profile, honoring the literature queue quota.",
    schema: webAiPaywalledLiteratureDownloadPdfSchema,
    handler: async (args) => webAiIopDownloadPdf(args)
  },
  {
    name: "webai_optica_download_pdf",
    description: "Download an Optica Publishing Group PDF through an authenticated research browser profile, honoring the literature queue quota.",
    schema: webAiPaywalledLiteratureDownloadPdfSchema,
    handler: async (args) => webAiOpticaDownloadPdf(args)
  },
  {
    name: "webai_opticsjournal_download_pdf",
    description: "Download an Opticsjournal PDF through an authenticated research browser profile, honoring the literature queue quota.",
    schema: webAiPaywalledLiteratureDownloadPdfSchema,
    handler: async (args) => webAiOpticsjournalDownloadPdf(args)
  },
  {
    name: "webai_siam_download_pdf",
    description: "Download a SIAM Publications PDF through an authenticated research browser profile, honoring the literature queue quota.",
    schema: webAiPaywalledLiteratureDownloadPdfSchema,
    handler: async (args) => webAiSiamDownloadPdf(args)
  },
  {
    name: "webai_aiaa_download_pdf",
    description: "Download an AIAA Aerospace Research Central PDF through an authenticated research browser profile, honoring the literature queue quota.",
    schema: webAiPaywalledLiteratureDownloadPdfSchema,
    handler: async (args) => webAiAiaaDownloadPdf(args)
  },
  {
    name: "webai_asce_download_pdf",
    description: "Download an ASCE Library PDF through an authenticated research browser profile, honoring the literature queue quota.",
    schema: webAiPaywalledLiteratureDownloadPdfSchema,
    handler: async (args) => webAiAsceDownloadPdf(args)
  },
  {
    name: "webai_asme_download_pdf",
    description: "Download an ASME Digital Collection PDF through an authenticated research browser profile, honoring the literature queue quota.",
    schema: webAiPaywalledLiteratureDownloadPdfSchema,
    handler: async (args) => webAiAsmeDownloadPdf(args)
  },
  {
    name: "webai_ieee_download_pdf",
    description: "Download an IEEE Xplore PDF through an authenticated research browser profile, honoring the literature queue quota; hard paywalls may time out.",
    schema: webAiPaywalledLiteratureDownloadPdfSchema,
    handler: async (args) => webAiIeeeDownloadPdf(args)
  },
  {
    name: "webai_iest_download_pdf",
    description: "Download a Journal of the IEST PDF through an authenticated research browser profile, honoring the literature queue quota.",
    schema: webAiPaywalledLiteratureDownloadPdfSchema,
    handler: async (args) => webAiIestDownloadPdf(args)
  },
  {
    name: "webai_iet_download_pdf",
    description: "Download an IET Digital Library PDF through an authenticated research browser profile, honoring the literature queue quota.",
    schema: webAiPaywalledLiteratureDownloadPdfSchema,
    handler: async (args) => webAiIetDownloadPdf(args)
  },
  {
    name: "webai_sae_download_pdf",
    description: "Download an SAE publication PDF through an authenticated research browser profile, honoring the literature queue quota.",
    schema: webAiPaywalledLiteratureDownloadPdfSchema,
    handler: async (args) => webAiSaeDownloadPdf(args)
  },
  {
    name: "webai_acs_download_pdf",
    description: "Download an ACS Publications PDF through an authenticated research browser profile, honoring the literature queue quota.",
    schema: webAiPaywalledLiteratureDownloadPdfSchema,
    handler: async (args) => webAiAcsDownloadPdf(args)
  },
  {
    name: "webai_cellpress_download_pdf",
    description: "Download a Cell Press PDF through an authenticated research browser profile, honoring the literature queue quota.",
    schema: webAiPaywalledLiteratureDownloadPdfSchema,
    handler: async (args) => webAiCellpressDownloadPdf(args)
  },
  {
    name: "webai_nature_download_pdf",
    description: "Download a Nature PDF through an authenticated research browser profile, honoring the literature queue quota.",
    schema: webAiPaywalledLiteratureDownloadPdfSchema,
    handler: async (args) => webAiNatureDownloadPdf(args)
  },
  {
    name: "webai_rsc_download_pdf",
    description: "Download a Royal Society of Chemistry PDF through an authenticated research browser profile, honoring the literature queue quota.",
    schema: webAiPaywalledLiteratureDownloadPdfSchema,
    handler: async (args) => webAiRscDownloadPdf(args)
  },
  {
    name: "webai_royalsoc_download_pdf",
    description: "Download a Royal Society Publishing PDF through an authenticated research browser profile, honoring the literature queue quota.",
    schema: webAiPaywalledLiteratureDownloadPdfSchema,
    handler: async (args) => webAiRoyalsocDownloadPdf(args)
  },
  {
    name: "webai_cambridge_download_pdf",
    description: "Download a Cambridge Core PDF through an authenticated research browser profile, honoring the literature queue quota.",
    schema: webAiPaywalledLiteratureDownloadPdfSchema,
    handler: async (args) => webAiCambridgeDownloadPdf(args)
  },
  {
    name: "webai_degruyter_download_pdf",
    description: "Download a De Gruyter Brill PDF through an authenticated research browser profile, honoring the literature queue quota.",
    schema: webAiPaywalledLiteratureDownloadPdfSchema,
    handler: async (args) => webAiDegruyterDownloadPdf(args)
  },
  {
    name: "webai_emerald_download_pdf",
    description: "Download an Emerald Insight PDF through an authenticated research browser profile, honoring the literature queue quota.",
    schema: webAiPaywalledLiteratureDownloadPdfSchema,
    handler: async (args) => webAiEmeraldDownloadPdf(args)
  },
  {
    name: "webai_sciencedirect_download_pdf",
    description: "Download a ScienceDirect PDF through an authenticated research browser profile, honoring the literature queue quota; institutional access gates may surface ELEMENT_NOT_FOUND.",
    schema: webAiPaywalledLiteratureDownloadPdfSchema,
    handler: async (args) => webAiSciencedirectDownloadPdf(args)
  },
  {
    name: "webai_springer_download_pdf",
    description: "Download a SpringerLink PDF through an authenticated research browser profile, honoring the literature queue quota.",
    schema: webAiPaywalledLiteratureDownloadPdfSchema,
    handler: async (args) => webAiSpringerDownloadPdf(args)
  },
  {
    name: "webai_tandf_download_pdf",
    description: "Download a Taylor & Francis Online PDF through an authenticated research browser profile, honoring the literature queue quota.",
    schema: webAiPaywalledLiteratureDownloadPdfSchema,
    handler: async (args) => webAiTandfDownloadPdf(args)
  },
  {
    name: "webai_wiley_download_pdf",
    description: "Download a Wiley Online Library PDF through an authenticated research browser profile, honoring the literature queue quota.",
    schema: webAiPaywalledLiteratureDownloadPdfSchema,
    handler: async (args) => webAiWileyDownloadPdf(args)
  },
  {
    name: "webai_acm_download_pdf",
    description: "Download an ACM Digital Library PDF through an authenticated research browser profile, honoring the literature queue quota.",
    schema: webAiPaywalledLiteratureDownloadPdfSchema,
    handler: async (args) => webAiAcmDownloadPdf(args)
  },
  {
    name: "webai_crc_download_pdf",
    description: "Download a CRC Press / Taylor & Francis book PDF through an authenticated research browser profile, honoring the literature queue quota.",
    schema: webAiPaywalledLiteratureDownloadPdfSchema,
    handler: async (args) => webAiCrcDownloadPdf(args)
  },
  {
    name: "webai_dblp_download_pdf",
    description: "Return an INVALID_ARGS diagnostic because dblp is bibliographic-only and does not serve PDFs.",
    schema: webAiBibliographicOnlyLiteratureDownloadPdfSchema,
    handler: async (args) => webAiDblpDownloadPdf(args)
  },
  {
    name: "webai_incopat_download_pdf",
    description: "Download an IncoPat patent PDF through an authenticated research browser profile, honoring the literature queue quota.",
    schema: webAiPaywalledLiteratureDownloadPdfSchema,
    handler: async (args) => webAiIncopatDownloadPdf(args)
  },
  {
    name: "webai_proquest_download_pdf",
    description: "Download a ProQuest dissertation PDF through an authenticated research browser profile, honoring the literature queue quota.",
    schema: webAiPaywalledLiteratureDownloadPdfSchema,
    handler: async (args) => webAiProquestDownloadPdf(args)
  },
  {
    name: "webai_wanfang_download_pdf",
    description: "Download a Wanfang Data literature PDF through an authenticated research browser profile, honoring the literature queue quota.",
    schema: webAiPaywalledLiteratureDownloadPdfSchema,
    handler: async (args) => webAiWanfangDownloadPdf(args)
  },
  {
    name: "webai_worldsci_download_pdf",
    description: "Download a World Scientific PDF through an authenticated research browser profile, honoring the literature queue quota.",
    schema: webAiPaywalledLiteratureDownloadPdfSchema,
    handler: async (args) => webAiWorldsciDownloadPdf(args)
  },
  {
    name: "webai_wos_download_pdf",
    description: "Return an INVALID_ARGS diagnostic because Web of Science is bibliographic/metadata-only and does not serve PDFs.",
    schema: webAiBibliographicOnlyLiteratureDownloadPdfSchema,
    handler: async (args) => webAiWosDownloadPdf(args)
  },
  {
    name: "webai_chatgpt_canvas_export",
    description: "Export an existing ChatGPT Canvas through the canvas Download dropdown, opening the canvas panel when available, and return artifact metadata.",
    schema: webAiChatgptCanvasExportWithBackendInput,
    handler: async (args, runtime) => webAiChatgptCanvasExport(args, runtime)
  },
  {
    name: "webai_chatgpt_pulse_get",
    description: "Read the ChatGPT Pulse digest state without onboarding or synthesizing content.",
    schema: webAiChatgptPulseGetWithBackendInput,
    handler: async (args, runtime) => webAiChatgptPulseGet(args, runtime)
  },
  {
    name: "webai_chatgpt_pulse_onboard",
    description: "Run the confirmed ChatGPT Pulse onboarding flow and select Quick news recap without connecting Gmail.",
    schema: webAiChatgptPulseOnboardWithBackendInput,
    handler: async (args, runtime) => webAiChatgptPulseOnboard(args, runtime)
  },
  {
    name: "webai_chatgpt_deep_research",
    description: "Start a ChatGPT Deep research task and return a task id immediately; poll with webai_task_status.",
    schema: webAiChatgptDeepResearchWithBackendInput,
    handler: async (args, runtime) => webAiChatgptDeepResearch(args, runtime)
  },
  {
    name: "webai_claude_deep_research",
    description: "Start a Claude Deep Research task and return a task id immediately; poll with webai_task_status.",
    schema: webAiClaudeDeepResearchWithBackendInput,
    handler: async (args, runtime) => webAiClaudeDeepResearch(args, runtime)
  },
  {
    name: "webai_chatgpt_conversation_manage",
    description: "Open ChatGPT share dialog or navigate read-only settings surfaces; kebab-gated operations return human handoff.",
    schema: webAiChatgptConversationManageWithBackendInput,
    handler: async (args, runtime) => webAiChatgptConversationManage(args, runtime)
  },
  {
    name: "webai_claude_conversation_manage",
    description: "Search Claude conversations, guard sharing behind explicit confirmation, or report sidebar kebab handoff.",
    schema: webAiClaudeConversationManageWithBackendInput,
    handler: async (args, runtime) => webAiClaudeConversationManage(args, runtime)
  },
  {
    name: "webai_chatgpt_workspace",
    description: "Navigate read-only ChatGPT workspace/settings surfaces and return a short summary.",
    schema: webAiChatgptWorkspaceWithBackendInput,
    handler: async (args, runtime) => webAiChatgptWorkspace(args, runtime)
  },
  {
    name: "webai_claude_workspace",
    description: "Navigate read-only Claude workspace/settings surfaces and return a short summary.",
    schema: webAiClaudeWorkspaceWithBackendInput,
    handler: async (args, runtime) => webAiClaudeWorkspace(args, runtime)
  },
  {
    name: "browser_launch",
    description: "Launch or reuse a project-managed visible Chrome/Edge browser profile through CDP.",
    schema: browserLaunchInput,
    handler: async (args, runtime) => runtime.launcher.launch(args)
  },
  {
    name: "browser_status",
    description: "Return managed browser status: executable, profile dir, CDP endpoint, pages, and connection state.",
    schema: browserStatusInput,
    handler: async (args, runtime) => runtime.launcher.status(args.profile)
  },
  {
    name: "browser_pages",
    description: "List browser tabs/pages and the active page id.",
    schema: browserStatusInput,
    handler: async (args, runtime) => runtime.launcher.pages(args.profile)
  },
  {
    name: "browser_open",
    description: "Open a URL in the active visible browser page.",
    schema: browserOpenInput,
    handler: async (args, runtime) => withManagedPage(args, runtime, args.url, async (page) => ({ ok: true, url: page.url?.() || args.url }))
  },
  {
    name: "browser_read",
    description: "Read the active page as a structured snapshot: text, elements, forms, tables, lists, iframes, and optional screenshot/accessibility data.",
    schema: browserReadInput,
    handler: async (args, runtime) => withManagedPage(args, runtime, args.url, async (page) => readPageSnapshot(page, args))
  },
  {
    name: "capability_update",
    description: "Discover UI elements/capabilities for a target and store them in the local capability database.",
    schema: capabilityUpdateInput,
    handler: async (args, runtime) => {
      const snapshot = args.fixture ? readHtmlSnapshotFromFile(args.fixture) : await withManagedPage(args, runtime, args.url || targetBaseUrl(args.target), async (page) => readPageSnapshot(page, { includeAccessibility: true, screenshot: false }));
      return new CapabilityUpdater(runtime.database).updateFromSnapshot({ target: args.target, kind: args.kind, profile: args.profile, snapshot });
    }
  },
  {
    name: "capability_query",
    description: "Search capability records by target, category, and text.",
    schema: capabilityQueryInput,
    handler: async (args, runtime) => runtime.database.queryCapabilities(args)
  },
  {
    name: "capability_export",
    description: "Export capability database data as JSON, optionally filtered by target.",
    schema: capabilityExportInput,
    handler: async (args, runtime) => {
      const exported = runtime.database.exportJson(args.target);
      if (args.out) { fs.mkdirSync(path.dirname(path.resolve(args.out)), { recursive: true }); fs.writeFileSync(args.out, JSON.stringify(exported, null, 2), "utf-8"); }
      return args.out ? { out: path.resolve(args.out), exportedAt: exported.exportedAt } : exported;
    }
  },
  {
    name: "workflow_compile",
    description: "Compile a YAML/JSON workflow that references abstract capabilities into concrete browser actions.",
    schema: workflowCompileInput,
    handler: async (args, runtime) => new WorkflowCompiler(runtime.database).compileFile(args.file)
  },
  {
    name: "workflow_run",
    description: "Run or dry-run a compiled workflow with safety gates.",
    schema: workflowRunInput,
    handler: async (args, runtime) => {
      const plan = workflowExecutePlan(args, runtime.database);
      if (args.dryRun !== false) return stripForbidden(await new WorkflowExecutor({ database: runtime.database, actionExecutor: executor(runtime.session) }).runPlan(plan, { dryRun: true }));
      const approvalGates = workflowApprovalGates(plan);
      if (approvalGates.length) return workflowApprovalRequiredResponse(plan, approvalGates, runtime.database);
      return stripForbidden(await runWorkflowPlanInManagedPage(args, runtime, plan));
    }
  },
  {
    name: "workflow_execute",
    description: "Compile or execute an inline workflow definition or pre-compiled action plan, returning a structured final result when executed.",
    schema: workflowExecuteInput,
    handler: async (args: WorkflowExecuteArgs, runtime) => {
      try {
        const plan = workflowExecutePlan(args, runtime.database);
        if (args.dryRun !== false) return { ok: true, status: "dry-run", plan };

        const approvalGates = workflowApprovalGates(plan);
        if (approvalGates.length) return workflowApprovalRequiredResponse(plan, approvalGates, runtime.database);

        const result = await runWorkflowPlanInManagedPage(args, runtime, plan);
        return stripForbidden({
          ok: result.ok,
          status: workflowExecuteStatus(result.ok),
          plan: result.plan,
          finalResult: result.finalResult,
          stepResults: result.results
        });
      } catch (error) {
        return { ok: false, status: "error", error: error instanceof Error ? error.message : String(error) };
      }
    }
  },
  {
    name: "site_registry_import",
    description: "Import paid research database site registry entries into the local capability database.",
    schema: siteRegistryImportInput,
    handler: async (args, runtime) => new SiteRegistryImporter(runtime.database).importFile(args.path)
  },
  {
    name: "research_inventory_import",
    description: "Import the academic research database seed into the local capability database.",
    schema: researchInventoryImportInput,
    handler: async (args, runtime) => new ResearchDbImporter(runtime.database).importInventorySeed(args.path ?? "configs/research/research_inventory.json", { stemOnly: !!args.stem_only })
  },
  ...legacyResearchToolSpecs,
  {
    name: "capability_library_import",
    description: "Import the editable capability library seed into the authoritative integration registry table.",
    schema: capabilityLibraryImportInput,
    handler: async (args, runtime) => new CapabilityLibraryImporter(runtime.database).importFile(args.path)
  },
  {
    name: "site_capture_map",
    description: "Capture a site map for a research database target. With a fixture, this runs without a real login.",
    schema: siteCaptureMapInput,
    handler: async (args, runtime) => {
      const snapshot = args.fixture ? readHtmlSnapshotFromFile(args.fixture) : await withManagedPage(args, runtime, args.url, async (page) => readPageSnapshot(page, { includeAccessibility: true }));
      const siteMap = captureSiteMapForSnapshot(args.site, snapshot, `profile=${args.profile || "default"}`);
      const saved = saveSiteMap(siteMap);
      return { saved, siteMap };
    }
  },

  // Backwards-compatible tool names from the first package version.
  {
    name: "browser_start",
    description: "Start a visible persistent browser session or connect to a user-started CDP browser when configured.",
    schema: browserStartInput,
    handler: async (_args, runtime) => { await runtime.session.start(); return { started: true, pages: await runtime.session.pages() }; }
  },
  {
    name: "browser_screenshot",
    description: "Capture a full-page screenshot and return the local path.",
    schema: browserReadInput,
    handler: async (_args, runtime) => { const snapshot = await readPageSnapshot(runtime.session.activePage(), { screenshot: true }); return { screenshotPath: snapshot.screenshotPath }; }
  },
  {
    name: "browser_click",
    description: "Click an element by selector or semantic target. Risky actions require confirmation.",
    schema: browserActionInput,
    handler: async (args, runtime) => executor(runtime.session).execute({ ...args, type: "click" })
  },
  {
    name: "browser_type",
    description: "Type/fill text into an input, textarea, contenteditable, or semantic target. Prompt sending workflows require confirmation.",
    schema: browserActionInput,
    handler: async (args, runtime) => executor(runtime.session).execute({ ...args, type: "type" })
  },
  {
    name: "browser_select",
    description: "Select an option in a select/listbox control.",
    schema: browserActionInput,
    handler: async (args, runtime) => executor(runtime.session).execute({ ...args, type: "select" })
  },
  {
    name: "browser_press",
    description: "Press a key globally or on a target element.",
    schema: browserActionInput,
    handler: async (args, runtime) => executor(runtime.session).execute({ ...args, type: "press" })
  },
  {
    name: "browser_wait",
    description: "Wait for text, selector, navigation, download, or a timeout.",
    schema: browserActionInput,
    handler: async (args, runtime) => executor(runtime.session).execute({ ...args, type: "wait" })
  },
  {
    name: "browser_downloads",
    description: "List files downloaded through browser-native download handling.",
    schema: browserStartInput,
    handler: async (_args, runtime) => ({ downloads: runtime.session.downloads.list() })
  },
  {
    name: "browser_run_recipe",
    description: "Run a YAML recipe from configs/recipes against the active browser session.",
    schema: recipeRunInput,
    handler: async (args, runtime) => {
      const recipe = loadRecipeById(args.id);
      const engine = new RecipeEngine({ executor: executor(runtime.session), getActivePage: () => runtime.session.activePage() });
      return engine.run(recipe, args.variables || {});
    }
  },
  {
    name: "browser_capture_site_map",
    description: "Capture a versioned site map snapshot for adapter maintenance.",
    schema: siteMapInput,
    handler: async (args, runtime) => {
      const snapshot = await readPageSnapshot(runtime.session.activePage(), { includeAccessibility: true });
      const siteMap = captureSiteMapForSnapshot(args.site, snapshot, args.notes);
      const savedPath = saveSiteMap(siteMap);
      return { path: savedPath, siteMap };
    }
  },
  {
    name: "browser_update_adapter_notes",
    description: "Append notes for UI changes, selectors, or workflow updates to configs/adapters/notes/<site>.md.",
    schema: notesInput,
    handler: async (args) => {
      const notesDir = path.resolve(process.cwd(), "configs/adapters/notes");
      fs.mkdirSync(notesDir, { recursive: true });
      const filePath = path.join(notesDir, `${safeFilename(args.site)}.md`);
      fs.appendFileSync(filePath, `\n\n## ${new Date().toISOString()}\n\n${args.notes}\n`, "utf-8");
      return { path: filePath };
    }
  }
];

const subMcpToolSpecOverrides: Record<string, ToolSpec> = {
  webai_gemini_music_download_track: {
    name: "webai_gemini_music_download_track",
    description: "Download a Gemini Music track via the required two-stage CDP artifact-click menu (MP3 or video).",
    schema: webAiGeminiMusicDownloadTrackWithBackendInput,
    handler: async (args, runtime) => webAiGeminiMusicDownloadTrack(args, runtime)
  },
  webai_gemini_music_task_status: {
    name: "webai_gemini_music_task_status",
    description: "Inspect Gemini Music browser state for download-ready vs still-generating status.",
    schema: webAiGeminiMusicTaskStatusWithBackendInput,
    handler: async (args, runtime) => webAiGeminiMusicTaskStatus(args, runtime)
  },
  webai_chatgpt_codex_submit_task: {
    name: "webai_chatgpt_codex_submit_task",
    description: "Submit a confirmed ChatGPT Codex task to the hard-allowlisted LT-0I/CN- environment and return the task id.",
    schema: webAiChatgptCodexSubmitTaskWithBackendInput,
    handler: async (args, runtime) => webAiChatgptCodexSubmitTask(args, runtime)
  },
  webai_chatgpt_codex_list_envs: {
    name: "webai_chatgpt_codex_list_envs",
    description: "List only the hard-allowlisted ChatGPT Codex LT-0I/CN- environment; return SUBMCP_NOT_PROVISIONED if absent.",
    schema: webAiChatgptCodexListEnvsWithBackendInput,
    handler: async (args, runtime) => webAiChatgptCodexListEnvs(args, runtime)
  },
  webai_chatgpt_codex_task_status: {
    name: "webai_chatgpt_codex_task_status",
    description: "Read a ChatGPT Codex task status only when the task page proves LT-0I/CN- ownership.",
    schema: webAiChatgptCodexTaskStatusWithBackendInput,
    handler: async (args, runtime) => webAiChatgptCodexTaskStatus(args, runtime)
  },
  webai_chatgpt_codex_get_diff: {
    name: "webai_chatgpt_codex_get_diff",
    description: "Read the completed ChatGPT Codex unified diff for an allowlisted LT-0I/CN- task without clicking Create PR or other publish controls.",
    schema: webAiChatgptCodexGetDiffWithBackendInput,
    handler: async (args, runtime) => webAiChatgptCodexGetDiff(args, runtime)
  },
  webai_claude_design_create_project: {
    name: "webai_claude_design_create_project",
    description: "Create a Claude Design project in the in-process claude-design sub-MCP module.",
    schema: webAiClaudeDesignCreateProjectWithBackendInput,
    handler: async (args, runtime) => webAiClaudeDesignCreateProject(args, runtime)
  },
  webai_claude_design_generate: {
    name: "webai_claude_design_generate",
    description: "Generate a Claude Design artifact with Sonnet or Haiku only, waiting for the real /serve/<name>.html iframe readiness signal; Opus is intentionally unsupported.",
    schema: webAiClaudeDesignGenerateWithBackendInput,
    handler: async (args, runtime) => webAiClaudeDesignGenerate(args, runtime)
  },
  webai_claude_design_get_html: {
    name: "webai_claude_design_get_html",
    description: "Save and fingerprint verified real Claude Design HTML viewer markup without returning raw HTML; bootstrap/loader stubs fail artifact verification.",
    schema: webAiClaudeDesignGetHtmlWithBackendInput,
    handler: async (args, runtime) => webAiClaudeDesignGetHtml(args, runtime)
  },
  webai_claude_design_present: {
    name: "webai_claude_design_present",
    description: "Open Claude Design Present mode and return the spawned presentation URL.",
    schema: webAiClaudeDesignPresentWithBackendInput,
    handler: async (args, runtime) => webAiClaudeDesignPresent(args, runtime)
  }
};

export const toolSpecs: ToolSpec[] = [
  ...coreToolSpecs,
  ...subMcpToolSpecs.map((spec) => subMcpToolSpecOverrides[spec.name] || spec)
];

export function listMcpTools(): McpToolDefinition[] {
  return toolSpecs.map((tool) => ({ name: tool.name, description: tool.description, inputSchema: tool.schema.toJsonSchema() }));
}

const DEFAULT_MCP_TOOL_INVOCATION_TIMEOUT_MS = 180000;
const MAX_MCP_TOOL_INVOCATION_TIMEOUT_MS = 900000;
const MCP_TOOL_TIMEOUT_ENV_KEYS = ["WEBAI_MCP_TOOL_TIMEOUT_MS", "MCP_TOOL_TIMEOUT_MS"];

// #16 R2 (2026-05-21): per-tool deadline overrides for the heavy-generation
// surfaces where the assistant turn alone can run 3-5 min on Heavy/Thinking
// models before the file or image card emits — confirmed live 2026-05-21 on
// chatgpt-9223 (smoke .runs/issue-fix-loop/issue16-r2-smoke/02-chatgpt-pptx-v2
// → 3m 20s of "Thought for ..." before file card). The default 180s ceiling
// would race the model and emit a misleading COMMAND_TIMEOUT envelope before
// the artifactClick locate budget could engage. All other tools retain the
// 180s default. Consumer cycle#26 (smoke 09, 2026-05-21) further showed the
// pptx file-card can stream in at 6-9 min into the run on Thinking-class
// paths — webai_chatgpt_generate_file therefore receives 900000ms (15 min)
// and MAX_MCP_TOOL_INVOCATION_TIMEOUT_MS is widened to 900000 to admit it.
const MCP_TOOL_INVOCATION_TIMEOUT_OVERRIDES_MS: Record<string, number> = {
  webai_chatgpt_generate_file: 900000,
  webai_chatgpt_generate_image: 600000,
  webai_gemini_generate_image: 600000
};
const MCP_TOOL_INVOCATION_FORMAT_TIMEOUT_OVERRIDES_MS: Record<string, Record<string, number>> = {
  webai_claude_generate_file: { pptx: 360000 },
  webai_chatgpt_generate_file: { pptx: 900000 }
};

interface HonestErrorEnvelope {
  ok: false;
  errorCode: ConsumerErrorCode;
  error_code: ConsumerErrorCode;
  error: string;
  evidence: Record<string, unknown>;
}

class McpInvocationDeadlineError extends Error {
  errorCode = ConsumerErrorCodes.COMMAND_TIMEOUT;
  evidence: Record<string, unknown>;

  constructor(tool: string, timeoutMs: number) {
    super(`${ConsumerErrorCodes.COMMAND_TIMEOUT}: MCP tool invocation exceeded ${timeoutMs}ms deadline`);
    this.evidence = { tool, timeout_ms: timeoutMs };
  }
}

function mcpToolInvocationTimeoutMs(tool?: string, args?: unknown): number {
  for (const key of MCP_TOOL_TIMEOUT_ENV_KEYS) {
    const raw = process.env[key];
    if (!raw) continue;
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed > 0) return Math.min(Math.max(Math.floor(parsed), 1000), MAX_MCP_TOOL_INVOCATION_TIMEOUT_MS);
  }
  const expectedExtension = isRecord(args) ? normalizedExpectedExtension(args.expected_extension) : "";
  const formatOverride = tool && expectedExtension ? MCP_TOOL_INVOCATION_FORMAT_TIMEOUT_OVERRIDES_MS[tool]?.[expectedExtension] : undefined;
  if (formatOverride) {
    return Math.min(formatOverride, MAX_MCP_TOOL_INVOCATION_TIMEOUT_MS);
  }
  if (tool && MCP_TOOL_INVOCATION_TIMEOUT_OVERRIDES_MS[tool]) {
    return Math.min(MCP_TOOL_INVOCATION_TIMEOUT_OVERRIDES_MS[tool], MAX_MCP_TOOL_INVOCATION_TIMEOUT_MS);
  }
  return DEFAULT_MCP_TOOL_INVOCATION_TIMEOUT_MS;
}

async function runWithMcpToolDeadline<T>(tool: string, timeoutMs: number, run: () => Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new McpInvocationDeadlineError(tool, timeoutMs)), timeoutMs);
    (timer as any)?.unref?.();
  });
  try {
    return await Promise.race([run(), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function withMcpToolDeadline<T>(tool: string, run: () => Promise<T>): Promise<T> {
  const timeoutMs = mcpToolInvocationTimeoutMs(tool);
  return runWithMcpToolDeadline(tool, timeoutMs, run);
}

async function withMcpToolDeadlineForArgs<T>(tool: string, args: unknown, run: () => Promise<T>): Promise<T> {
  const timeoutMs = mcpToolInvocationTimeoutMs(tool, args);
  return runWithMcpToolDeadline(tool, timeoutMs, run);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    const json = JSON.stringify(error);
    return json === undefined ? String(error) : json;
  } catch {
    return String(error);
  }
}

function safeJsonSnippet(value: unknown, maxLength = 600): string {
  let text: string;
  try {
    text = typeof value === "string" ? value : JSON.stringify(value);
  } catch {
    text = String(value);
  }
  if (text === undefined) text = String(value);
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}

function evidenceRecord(value: unknown): Record<string, unknown> {
  if (isRecord(value)) return value;
  if (value === undefined || value === null) return {};
  return { value };
}

function normalizedErrorEnvelope(errorCode: ConsumerErrorCode, message: string, evidence: Record<string, unknown> = {}): HonestErrorEnvelope {
  const safeEvidence = stripForbidden(Object.keys(evidence).length ? evidence : { message });
  return {
    ok: false,
    errorCode,
    error_code: errorCode,
    error: message,
    evidence: safeEvidence
  };
}

function isTimeoutLikeError(error: unknown): boolean {
  const name = isRecord(error) && typeof error.name === "string" ? error.name : error instanceof Error ? error.name : "";
  const message = errorMessage(error);
  return /TimeoutError/i.test(name) || /\btimeout\b|\btimed\s*out\b|Timeout\s+\d+ms\s+exceeded/i.test(message);
}

function isHardGateError(error: unknown): boolean {
  return error instanceof ForbiddenOutputFieldError
    || error instanceof PromptPolicyDeniedError
    || error instanceof ConfirmationRequiredError;
}

function mapMcpToolError(tool: string, error: unknown, stage: string): HonestErrorEnvelope {
  if (isHardGateError(error)) throw error;

  const candidate = error as { errorCode?: unknown; evidence?: unknown; name?: unknown };
  const message = errorMessage(error);
  const baseEvidence = {
    tool,
    stage,
    message,
    ...(typeof candidate?.name === "string" ? { error_name: candidate.name } : {})
  };

  if (stage === "schema") {
    return normalizedErrorEnvelope(ConsumerErrorCodes.INVALID_ARGS, message || "Invalid MCP tool arguments", baseEvidence);
  }

  if (isConsumerErrorCode(candidate?.errorCode)) {
    return normalizedErrorEnvelope(candidate.errorCode, message || candidate.errorCode, {
      ...baseEvidence,
      ...evidenceRecord(candidate.evidence)
    });
  }

  if (candidate?.errorCode !== undefined) {
    return normalizedErrorEnvelope(ConsumerErrorCodes.UNKNOWN, message || "MCP tool failed with non-taxonomy error code", {
      ...baseEvidence,
      original_error_code: String(candidate.errorCode),
      ...evidenceRecord(candidate.evidence)
    });
  }

  if (isTimeoutLikeError(error)) {
    return normalizedErrorEnvelope(ConsumerErrorCodes.COMMAND_TIMEOUT, message || "MCP tool invocation timed out", baseEvidence);
  }

  return normalizedErrorEnvelope(ConsumerErrorCodes.UNKNOWN, message || "MCP tool invocation failed", {
    ...baseEvidence,
    cause_type: typeof error
  });
}

function nonEmptyResultErrorCode(value: unknown): unknown {
  if (value === null || value === undefined || value === "") return undefined;
  return value;
}

function invalidResultErrorCode(tool: string, result: unknown): HonestErrorEnvelope | undefined {
  if (!isRecord(result)) return undefined;
  for (const field of ["errorCode", "error_code"]) {
    if (!(field in result)) continue;
    const value = nonEmptyResultErrorCode(result[field]);
    if (value === undefined) continue;
    if (isConsumerErrorCode(value)) continue;
    return normalizedErrorEnvelope(ConsumerErrorCodes.UNKNOWN, `MCP tool returned non-taxonomy ${field}`, {
      tool,
      field,
      original_error_code: String(value),
      result_snippet: safeJsonSnippet(result)
    });
  }
  return undefined;
}

interface UnhydratedFinding {
  path: string;
  reason: string;
  snippet: string;
}

function isResultRowsKey(key: string): boolean {
  return /^(items|results|records|rows|articles)$/i.test(key);
}

function isBlank(value: unknown): boolean {
  return value === null || value === undefined || (typeof value === "string" && value.trim() === "");
}

function hasNonEmptyIdentifier(row: Record<string, unknown>): boolean {
  return ["url", "id", "identifier", "doi", "arxiv_id", "record_id", "key"].some((key) => !isBlank(row[key]));
}

function looksLikeEmptyFacetChromeRow(row: Record<string, unknown>): boolean {
  if (!("title" in row) || !isBlank(row.title) || hasNonEmptyIdentifier(row)) return false;
  const values = Object.values(row);
  const allBlankish = values.every((value) => isBlank(value) || (Array.isArray(value) && value.length === 0));
  const facetSignal = Object.keys(row).some((key) => /facet|filter|count|label|checkbox|class|text/i.test(key))
    || values.some((value) => typeof value === "string" && /\bfacet\b|\bfilter\b|show\s+all|refine|li\.empty/i.test(value));
  return allBlankish || facetSignal;
}

function findTemplateMarker(value: unknown, pathName: string): UnhydratedFinding | undefined {
  if (typeof value === "string") {
    if (/{{[^}]*}}|<li[^>]*class=["'][^"']*\bempty\b[^"']*["']|li\.empty/i.test(value)) {
      return { path: pathName, reason: "template_or_placeholder_marker", snippet: safeJsonSnippet(value, 240) };
    }
    return undefined;
  }
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index++) {
      const finding = findTemplateMarker(value[index], `${pathName}[${index}]`);
      if (finding) return finding;
    }
    return undefined;
  }
  if (isRecord(value)) {
    for (const [key, child] of Object.entries(value)) {
      const finding = findTemplateMarker(child, `${pathName}.${key}`);
      if (finding) return finding;
    }
  }
  return undefined;
}

function detectUnhydratedSuccess(value: unknown, pathName = "$", parentKey = ""): UnhydratedFinding | undefined {
  if (Array.isArray(value)) {
    if (!value.length) return undefined;
    if (isResultRowsKey(parentKey)) {
      for (let index = 0; index < value.length; index++) {
        const itemPath = `${pathName}[${index}]`;
        const marker = findTemplateMarker(value[index], itemPath);
        if (marker) return marker;
        if (isRecord(value[index]) && looksLikeEmptyFacetChromeRow(value[index] as Record<string, unknown>)) {
          return { path: itemPath, reason: "empty_result_row_or_facet_chrome", snippet: safeJsonSnippet(value[index], 300) };
        }
      }
    }
    for (let index = 0; index < value.length; index++) {
      const finding = detectUnhydratedSuccess(value[index], `${pathName}[${index}]`, parentKey);
      if (finding) return finding;
    }
    return undefined;
  }
  if (!isRecord(value)) return undefined;
  for (const [key, child] of Object.entries(value)) {
    const finding = detectUnhydratedSuccess(child, `${pathName}.${key}`, key);
    if (finding) return finding;
  }
  return undefined;
}

function resultHasError(result: unknown): boolean {
  if (!isRecord(result)) return false;
  const code = nonEmptyResultErrorCode(result.errorCode) ?? nonEmptyResultErrorCode(result.error_code);
  return isConsumerErrorCode(code);
}

function validateMcpToolResult(tool: string, result: unknown): unknown {
  assertNoForbidden(result);
  const invalidCode = invalidResultErrorCode(tool, result);
  if (invalidCode) return invalidCode;
  if (!resultHasError(result)) {
    const unhydrated = detectUnhydratedSuccess(result);
    if (unhydrated) {
      return normalizedErrorEnvelope(ConsumerErrorCodes.ARTIFACT_VERIFICATION_FAILED, "MCP tool returned unhydrated/template output instead of real contract data", {
        tool,
        ...unhydrated
      });
    }
  }
  return result;
}

export async function callMcpTool(name: string, args: unknown, runtime?: BrowserToolRuntime): Promise<unknown> {
  const spec = toolSpecs.find((tool) => tool.name === name);
  if (!spec) {
    return normalizedErrorEnvelope(ConsumerErrorCodes.INVALID_ARGS, `Unknown MCP tool: ${name}`, {
      tool: name,
      available_tool_count: toolSpecs.length
    });
  }
  let stage = "schema";
  try {
    const parsed = spec.schema.parse(args || {});
    stage = "runtime";
    const resolvedRuntime = runtimeOrDefault(runtime);
    if (typeof parsed.target === "string") resolvedRuntime.session.setTarget(parsed.target);
    else if (typeof parsed.site === "string") resolvedRuntime.session.setTarget(parsed.site);
    stage = "handler";
    const result = await withMcpToolDeadlineForArgs(name, parsed, () => spec.handler(parsed, resolvedRuntime));
    stage = "contract";
    return validateMcpToolResult(name, result);
  } catch (error) {
    if (isHardGateError(error)) throw error;
    return mapMcpToolError(name, error, stage);
  }
}
