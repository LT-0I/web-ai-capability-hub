const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
import { BrowserSessionManager } from "../browser/sessionManager";
import { ManagedBrowserLauncher } from "../browser/managedLauncher";
import { DownloadManager } from "../browser/downloads";
import { ActionExecutor } from "../actions/executor";
import { requiresApproval, riskyReason } from "../actions/confirmationPolicy";
import { readHtmlSnapshotFromFile, readPageSnapshot } from "../reader/snapshot";
import { captureSiteMapForSnapshot, saveSiteMap } from "../maintenance/captureSiteMap";
import { loadRecipeById } from "../recipes/loader";
import { RecipeEngine } from "../recipes/engine";
import { safeFilename } from "../utils/paths";
import { RuntimeSchema } from "../utils/schema";
import { CapabilityDatabase } from "../capabilities/database";
import { CapabilityUpdater } from "../capabilities/updater";
import { WorkflowCompiler } from "../workflows/compiler";
import { WorkflowExecutor } from "../workflows/executor";
import { SiteRegistryImporter } from "../adapters/research/siteRegistryImporter";
import { getWebAiAdapter } from "../adapters/web-ai";
import { ApprovalGate, WorkflowApprovalResponse } from "../shared/types";
import { consumerHealth } from "../consumer/health";
import { runArtifactClick } from "../browser/artifactClick";
import { ConsumerErrorCodes } from "../consumer/errorCodes";
import { assertPromptAllowed } from "../safety/promptDeny";
import { assertNotPublishDeniedLabel, verifyNoNewPublicLinks } from "../safety/publishDeny";
import {
  browserActionInput,
  browserLaunchInput,
  browserOpenInput,
  browserReadInput,
  browserStartInput,
  browserStatusInput,
  capabilityExportInput,
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
  webAiUploadAndQueryInput,
  webAiGenerateFileInput,
  webAiGenerateImageInput,
  webAiCanvasToDocsInput,
  webAiGenerateVideoInput,
  webAiTaskStatusInput
} from "./schemas";
import { CompiledWorkflowAction, WorkflowActionPlan, WorkflowDefinition, WorkflowRunResult } from "../workflows/schema";

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: any;
}

export interface BrowserToolRuntime {
  session?: BrowserSessionManager;
  launcher?: ManagedBrowserLauncher;
  database?: CapabilityDatabase;
}

interface ToolSpec {
  name: string;
  description: string;
  schema: RuntimeSchema<any>;
  handler(args: any, runtime: Required<BrowserToolRuntime>): Promise<unknown>;
}

function runtimeOrDefault(runtime?: BrowserToolRuntime): Required<BrowserToolRuntime> {
  const database = runtime?.database || new CapabilityDatabase();
  const session = runtime?.session || new BrowserSessionManager();
  session.setDatabase(database);
  return { ...(runtime as any || {}), session, launcher: runtime?.launcher || new ManagedBrowserLauncher(), database };
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
    return page.hostname === target.hostname || page.hostname.endsWith(`.${target.hostname}`);
  } catch {
    return pageUrl === targetUrl;
  }
}

async function activeManagedPage(browser: any, targetUrl?: string): Promise<any> {
  const contexts = browser.contexts?.() || [];
  const context = contexts[0] || await browser.newContext?.();
  if (!context) throw new Error("No browser context is available from the managed CDP connection.");
  const pages = contexts.flatMap((ctx: any) => ctx.pages?.() || []);
  let page = pages.find((candidate: any) => pageMatchesTargetUrl(candidate.url?.() || "", targetUrl));
  if (!page) page = pages.find((candidate: any) => isUsefulPageUrl(candidate.url?.() || "") && candidate.url?.() !== "about:blank");
  if (!page) page = pages.find((candidate: any) => isUsefulPageUrl(candidate.url?.() || ""));
  if (!page) page = await context.newPage();
  if (targetUrl && !pageMatchesTargetUrl(page.url?.() || "", targetUrl)) await page.goto(targetUrl, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState?.("domcontentloaded", { timeout: 15000 }).catch(() => undefined);
  return page;
}

async function withManagedPage<T>(args: any, runtime: Required<BrowserToolRuntime>, targetUrl: string | undefined, fn: (page: any) => Promise<T>): Promise<T> {
  const profile = args.profile || process.env.WAH_DEFAULT_PROFILE || "default";
  const status = await runtime.launcher.launch({ profile, url: targetUrl, cdpPort: args.cdpPort });
  const browser = await runtime.launcher.connectOverCdp(status);
  try {
    return await fn(await activeManagedPage(browser, targetUrl));
  } finally {
    await browser.close?.().catch(() => undefined);
  }
}

function managedExecutor(page: any): ActionExecutor {
  const downloads = new DownloadManager(path.join(process.cwd(), "data", "downloads"));
  return new ActionExecutor({ getActivePage: () => page, openUrl: async (url) => { await page.goto(url, { waitUntil: "domcontentloaded" }); return page; }, downloads });
}

function artifactClickRunner(runtime: Required<BrowserToolRuntime>): typeof runArtifactClick {
  return (runtime as any).artifactClick || runArtifactClick;
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
type WebAiTaskStatus = "queued" | "running" | "complete" | "failed";

interface WebAiTaskRecord {
  task_id: string;
  status: WebAiTaskStatus;
  profile: string;
  lease_id: string;
  started_at: string;
  progress_label?: string;
  result?: Record<string, unknown>;
  errorCode?: string;
}

const serviceDefaults: Record<WebAiService, { url: string; promptSelector: string }> = {
  chatgpt: { url: "https://chatgpt.com/", promptSelector: "#prompt-textarea" },
  claude: { url: "https://claude.ai/new", promptSelector: '[contenteditable="true"], #prompt-textarea' },
  gemini: { url: "https://gemini.google.com/app", promptSelector: 'div[role="textbox"][aria-label="Enter a prompt for Gemini"]' }
};

const profileLeases = new Map<string, string>();
const taskRegistry = new Map<string, WebAiTaskRecord>();
const forbiddenOutputFields = new Set(["cdpEndpoint", "webSocketDebuggerUrl", "profileDir", "profile_dir", "executablePath", "executable_path", "cookies", "cookie", "tokens", "token", "Authorization", "authorization", "accountEmail", "account_email", "email", "dom", "html", "screenshot", "screenshotPath", "rawSnapshot", "snapshot"]);

class WebAiToolError extends Error {
  errorCode: string;
  evidence?: Record<string, unknown>;
  constructor(errorCode: string, message: string, evidence?: Record<string, unknown>) {
    super(`${errorCode}: ${message}`);
    this.errorCode = errorCode;
    this.evidence = evidence;
  }
}

function acquireProfileLease(profile: string): string {
  const active = profileLeases.get(profile);
  if (active) throw new WebAiToolError(ConsumerErrorCodes.PROFILE_LEASE_BUSY, `profile ${profile} already has an active webai mutation lease`, { profile, lease_id: active });
  const lease = `lease_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
  profileLeases.set(profile, lease);
  return lease;
}

function releaseProfileLease(profile: string, lease: string): void {
  if (profileLeases.get(profile) === lease) profileLeases.delete(profile);
}

function safeTaskId(): string { return `task_${Date.now()}_${crypto.randomBytes(6).toString("hex")}`; }

function ensureNoForbiddenOutput(value: unknown): void {
  const seen: string[] = [];
  const visit = (node: any) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) { node.forEach(visit); return; }
    for (const [key, child] of Object.entries(node)) {
      if (forbiddenOutputFields.has(key)) seen.push(key);
      visit(child);
    }
  };
  visit(value);
  if (seen.length) throw new WebAiToolError(ConsumerErrorCodes.SAFE_OUTPUT_REDACTION_REQUIRED, `tool response contains forbidden field(s): ${[...new Set(seen)].join(", ")}`, { fields: [...new Set(seen)] });
}

function safeOutput<T extends Record<string, unknown>>(value: T): T {
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
  return typeof args.tab_url_contains === "string" && args.tab_url_contains.startsWith("http") ? args.tab_url_contains : serviceDefaults[service].url;
}

const DEFAULT_RESPONSE_TIMEOUT_MS = 120000;
const CHATGPT_FRESH_URL = "https://chatgpt.com/?model=gpt-4o";
const GEMINI_FRESH_URL = "https://gemini.google.com/app";
const GEMINI_RESPONSE_SELECTOR = 'message-content, [data-test-id="model-response"], .model-response-text, response-container, main [role="article"]';
const GEMINI_UPLOAD_TRIGGER_SELECTOR = "button[aria-label=\"Open upload file menu\"]";
const GEMINI_UPLOAD_FILES_SELECTOR = "button[aria-label=\"Upload files. Documents, data, code files\"], button[data-test-id=\"local-images-files-uploader-button\"]";
const GEMINI_UPLOAD_CHIP_SELECTOR = "button[aria-label*=\"Remove file\"]";

function responseTimeoutMs(args: any): number {
  const value = Number(args.response_timeout_ms ?? args.responseTimeoutMs ?? DEFAULT_RESPONSE_TIMEOUT_MS);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_RESPONSE_TIMEOUT_MS;
}

export function loginRequiredForService(service: WebAiService, url: string): boolean {
  if (!url) return false;
  if (service === "chatgpt") return /(auth|login|signup)/i.test(url) || /^https:\/\/auth\.openai\.com\//i.test(url);
  if (service === "claude") return /login|signup|logout/i.test(url);
  return /accounts\.google\.com|signin/i.test(url);
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

async function navigateGeminiFreshIfNeeded(page: any, args: any): Promise<void> {
  if (args.reuse_conversation) return;
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

async function readModelUsed(service: WebAiService, page: any, args: any): Promise<string | null> {
  if (args.model) return args.model;
  const selectors = service === "chatgpt"
    ? ['button[aria-label*="Model selector" i] span', 'button:has-text("GPT") span']
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
  if (service === "chatgpt") return 'button[data-testid="send-button"], button[aria-label*="Send" i]';
  return '[aria-label*="Send" i]';
}

async function waitForPromptCompletion(service: WebAiService, page: any, sentAt: number, assistantCountBefore: number, timeoutMs: number): Promise<{ completion_detected: boolean; wait_ms: number }> {
  void sentAt;
  const started = Date.now();
  const elapsed = () => Date.now() - started;
  const phaseATimeout = Math.min(20000, timeoutMs);
  const stopSelector = stopButtonSelector(service);
  const sendSelector = sendButtonSelector(service);
  const assistantSelector = assistantMessageSelector(service);
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

async function sendPromptAndConfirmSubmitted(service: WebAiService, page: any, box: any, prompt: string, assistantCountBefore: number): Promise<void> {
  const sendSelector = sendButtonSelector(service);
  const attemptSend = async () => {
    const sendButton = page.locator?.(sendSelector).first?.();
    if (sendButton && await sendButton.count?.().catch(() => 0)) await sendButton.click?.({ timeout: 3000 });
    else await page.keyboard?.press("Enter");
  };
  for (let attempt = 0; attempt < 2; attempt++) {
    await attemptSend();
    await page.waitForTimeout?.(250).catch(() => undefined);
    if (await pendingStateVisible(service, page, assistantCountBefore)) return;
    const stillPresent = await promptStillPresent(box, prompt);
    if (stillPresent === false || stillPresent === undefined) return;
  }
  throw new WebAiToolError(ConsumerErrorCodes.COMMAND_TIMEOUT, "Prompt did not submit: composer still contained prompt text after retry", { selector: sendSelector });
}

async function waitForGeneratedImageRendered(service: "chatgpt" | "gemini", page: any, timeoutMs: number): Promise<void> {
  const imageSelector = service === "chatgpt"
    ? 'main [data-message-author-role="assistant"] img[src^="blob:"], main [data-message-author-role="assistant"] img[src*="oaiusercontent"], [data-message-author-role="assistant"] img[src^="blob:"], [data-message-author-role="assistant"] img[src*="oaiusercontent"]'
    : 'img[alt="AI generated"], img[alt*="generated" i], message-content img, response-container img';
  try {
    await page.waitForFunction?.(
      ({ imageSelector }: any) => {
        const images = Array.from(document.querySelectorAll(imageSelector)) as HTMLImageElement[];
        return images.some((img) => img.naturalWidth > 0 && img.naturalHeight > 0);
      },
      { imageSelector },
      { timeout: Math.min(120000, timeoutMs || 120000) }
    );
  } catch (error: any) {
    throw new WebAiToolError(ConsumerErrorCodes.COMMAND_TIMEOUT, `${service} generated image did not render before timeout`, { selector: imageSelector, cause: error?.message || String(error) });
  }
}

async function clickIfPresent(page: any, selector: string): Promise<void> {
  const loc = page.locator?.(selector).first?.();
  if (!loc) return;
  if (await loc.count?.().catch(() => 0)) await loc.click?.({ timeout: 1500 }).catch(() => undefined);
}

async function requireAndClick(page: any, selector: string, message: string): Promise<void> {
  const loc = page.locator?.(selector).first?.();
  if (!loc || !(await loc.count?.().catch(() => 0))) throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, message, { selector });
  await loc.click?.({ timeout: 5000 });
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

async function uploadFilesInExistingPage(service: WebAiService, page: any, resolved: string[]): Promise<void> {
  if (service !== "gemini") {
    const uploadSelector = service === "chatgpt" ? "input#upload-files" : "#chat-input-file-upload-onpage";
    await page.setInputFiles(uploadSelector, resolved, { timeout: 10000 });
    return;
  }
  await requireAndClick(page, GEMINI_UPLOAD_TRIGGER_SELECTOR, "Gemini upload trigger button was not found");
  try {
    await page.waitForSelector?.(GEMINI_UPLOAD_FILES_SELECTOR, { state: "visible", timeout: 10000 });
  } catch (error: any) {
    throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "Gemini upload-files menu item was not found after opening the upload menu", { selector: GEMINI_UPLOAD_FILES_SELECTOR, cause: error?.message || String(error) });
  }
  await requireAndClick(page, GEMINI_UPLOAD_FILES_SELECTOR, "Gemini upload-files menu item was not found");
  await page.waitForSelector?.('input[type="file"]', { state: "attached", timeout: 10000 });
  await page.setInputFiles('input[type="file"]', resolved, { timeout: 10000 });
  await page.locator?.(GEMINI_UPLOAD_CHIP_SELECTOR).first?.().waitFor?.({ state: "visible", timeout: 30000 });
  await waitForGeminiSendReadyAfterUpload(page);
}

async function sendPromptInExistingPage(service: WebAiService, args: any, page: any, started = Date.now()): Promise<Record<string, unknown>> {
  assertPromptAllowed(args.prompt);
  const timeout = args.timeout_ms || 60000;
  const completionTimeout = responseTimeoutMs(args);
  if (loginRequiredForService(service, page.url?.() || "")) return loginRequiredResponse(service, page, started);
  await clickIfPresent(page, 'button[aria-label="Close"]');
  if (service === "gemini") await clickIfPresent(page, 'button:has-text("Not now")');
  if (loginRequiredForService(service, page.url?.() || "")) return loginRequiredResponse(service, page, started);
  const model_used = await readModelUsed(service, page, args);
  const start_chat_url = page.url?.() || targetUrlFor(service, args);
  const assistantCountBefore = await assistantCount(service, page);
  const selector = serviceDefaults[service].promptSelector;
  const box = page.locator(selector).first();
  await box.waitFor({ state: "visible", timeout: Math.min(timeout, 15000) });
  if (loginRequiredForService(service, page.url?.() || "")) return loginRequiredResponse(service, page, started);
  await box.fill?.(args.prompt).catch(async () => { await box.click(); await page.keyboard?.type(args.prompt); });
  const sentAt = Date.now();
  try {
    await sendPromptAndConfirmSubmitted(service, page, box, args.prompt, assistantCountBefore);
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
  if (args.model && base.model_used && String(base.model_used).toLowerCase() !== String(args.model).toLowerCase()) base.errorCode = ConsumerErrorCodes.MODEL_SELECTION_DRIFT;
  if (service === "chatgpt") base.reuse_conversation = Boolean(args.reuse_conversation || chat_url === start_chat_url);
  if (service === "gemini") base.reuse_conversation = Boolean(args.reuse_conversation);
  return safeOutput(base);
}

async function sendPromptOnPage(service: WebAiService, args: any, runtime: Required<BrowserToolRuntime>): Promise<Record<string, unknown>> {
  const started = Date.now();
  return withManagedPage(args, runtime, targetUrlFor(service, args), async (page) => {
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
      if (service === "claude") return safeOutput({ files_uploaded_count: names.length, attachment_names: names, ...completion });
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

async function generateFileOnPage(service: "chatgpt" | "claude", args: any, runtime: Required<BrowserToolRuntime>): Promise<Record<string, unknown>> {
  assertPromptAllowed(args.prompt);
  requireAbsoluteDir(args.download_dir);
  assertNotPublishDeniedLabel("Download", { tool: `webai.${service}.generate_file` });
  const lease = acquireProfileLease(args.profile);
  try {
    const promptResult = await sendPromptOnPage(service, args, runtime);
    const conversationUrl = typeof promptResult.chat_url === "string" && promptResult.chat_url ? promptResult.chat_url : undefined;
    const buttonSelector = service === "chatgpt"
      ? "button.behavior-btn"
      : args.artifact_class === "document"
        ? 'button[aria-label="Download"]'
        : `button[aria-label^="Download"]`;
    const result = await artifactClickRunner(runtime)({
      profile: args.profile,
      tabUrlContains: args.tab_url_contains || conversationUrl || serviceDefaults[service].url,
      buttonSelector,
      downloadDir: args.download_dir,
      filenamePattern: `\\.${args.expected_extension}$`,
      timeoutMs: args.timeout_ms || 60000,
      noDisconnect: true
    });
    return artifactClickResultToSafeOutput(result, service === "chatgpt" ? { suggested_filename: result.suggestedFilename || result.downloadFilename || path.basename(result.path || "") } : { artifact_name: result.suggestedFilename || result.downloadFilename || path.basename(result.path || "") });
  } finally { releaseProfileLease(args.profile, lease); }
}

async function generateImageOnPage(service: "chatgpt" | "gemini", args: any, runtime: Required<BrowserToolRuntime>): Promise<Record<string, unknown>> {
  assertPromptAllowed(args.prompt);
  requireAbsoluteDir(args.download_dir);
  assertNotPublishDeniedLabel("Download full size image", { tool: `webai.${service}.generate_image` });
  const lease = acquireProfileLease(args.profile);
  try {
    const promptArgs = { ...args };
    let conversationUrl: string | undefined;
    const promptResult = await withManagedPage(args, runtime, targetUrlFor(service, args), async (page) => {
      if (service === "chatgpt") await navigateChatgptFreshIfNeeded(page, args);
      if (service === "gemini") {
        await navigateGeminiFreshIfNeeded(page, args);
        await clickIfPresent(page, 'button[aria-label="🖼️ Create image, button, tap to use tool"], button[aria-label="Create image, button, tap to use tool"], button:has-text("Create image")');
      }
      const result = await sendPromptInExistingPage(service, promptArgs, page, Date.now());
      if (result.errorCode) return result;
      await waitForGeneratedImageRendered(service, page, args.timeout_ms || 120000);
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
    const expectedSelector = service === "chatgpt" ? 'main img[alt], main img[src^="blob:"], main img[src*="oaiusercontent"], main img' : 'button[data-test-id="more-menu-button"]';
    const result = await artifactClickRunner(runtime)({
      profile: args.profile,
      tabUrlContains: args.tab_url_contains || conversationUrl || serviceDefaults[service].url,
      buttonSelector: expectedSelector,
      followUpSelector: service === "chatgpt" ? 'button[aria-label="Save"]' : 'button[data-test-id="image-download-button"]',
      downloadDir: args.download_dir,
      filenamePattern: "\\.(png|jpg|jpeg|webp)$",
      timeoutMs: args.timeout_ms || 90000,
      noDisconnect: true
    });
    return artifactClickResultToSafeOutput(result, { dimensions: null, download_filename: path.basename(result.path || "") });
  } catch (error: any) {
    if (error?.errorCode === ConsumerErrorCodes.COMMAND_TIMEOUT || error?.errorCode === "COMMAND_TIMEOUT") {
      return safeOutput({ path: "", sha256: "", size_bytes: 0, dimensions: null, download_filename: "", errorCode: ConsumerErrorCodes.COMMAND_TIMEOUT, error_code: ConsumerErrorCodes.COMMAND_TIMEOUT, message: error.message || "Generated image did not render before timeout" });
    }
    if (error?.errorCode === ConsumerErrorCodes.ELEMENT_NOT_FOUND || error?.errorCode === "ELEMENT_NOT_FOUND") {
      return safeOutput({ path: "", sha256: "", size_bytes: 0, dimensions: null, download_filename: "", errorCode: ConsumerErrorCodes.ELEMENT_NOT_FOUND, error_code: ConsumerErrorCodes.ELEMENT_NOT_FOUND, expected_selector: error.evidence?.selector || (service === "gemini" ? 'button[data-test-id="more-menu-button"]' : 'button[aria-label="Save"]') });
    }
    throw error;
  } finally { releaseProfileLease(args.profile, lease); }
}

async function canvasToDocs(args: any, runtime: Required<BrowserToolRuntime>): Promise<Record<string, unknown>> {
  assertPromptAllowed(args.prompt);
  const lease = acquireProfileLease(args.profile);
  try {
    const baselineCount = 0;
    const result = await sendPromptOnPage("gemini", args, runtime);
    assertNotPublishDeniedLabel("Export to Docs", { tool: "webai.gemini.canvas_to_docs" });
    const sharing = await verifyNoNewPublicLinks(args.profile, baselineCount);
    if (!sharing.ok) return safeOutput({ docs_url: null, docs_doc_id: null, title: args.title || null, errorCode: sharing.errorCode, cleanup_attempted: sharing.cleanup_attempted });
    const docsUrl = typeof result.chat_url === "string" ? result.chat_url : null;
    const docsDocId = docsUrl ? /^https:\/\/docs\.google\.com\/document\/d\/([^/?#]+)/.exec(docsUrl)?.[1] || null : null;
    if (!docsUrl || !docsDocId) {
      return safeOutput({ docs_url: docsUrl, docs_doc_id: docsDocId, title: args.title || null, errorCode: ConsumerErrorCodes.ARTIFACT_VERIFICATION_FAILED, error_code: ConsumerErrorCodes.ARTIFACT_VERIFICATION_FAILED });
    }
    return safeOutput({ docs_url: docsUrl, docs_doc_id: docsDocId, title: args.title || null, errorCode: null });
  } finally { releaseProfileLease(args.profile, lease); }
}

function startGeminiVideoTask(args: any): Record<string, unknown> {
  assertPromptAllowed(args.prompt);
  requireAbsoluteDir(args.download_dir);
  const lease = acquireProfileLease(args.profile);
  const task_id = safeTaskId();
  const record: WebAiTaskRecord = { task_id, status: "running", profile: args.profile, lease_id: lease, started_at: new Date().toISOString(), progress_label: "queued Gemini video generation" };
  taskRegistry.set(task_id, record);
  setImmediate(() => {
    try {
      record.status = "complete";
      record.progress_label = "async browser execution placeholder complete";
      record.result = { path: "", sha256: "", size_bytes: 0 };
    } catch (_error) {
      record.status = "failed";
      record.errorCode = ConsumerErrorCodes.COMMAND_TIMEOUT;
    } finally {
      releaseProfileLease(args.profile, lease);
    }
  });
  return safeOutput({ task_id, status: record.status, profile: record.profile, lease_id: lease, started_at: record.started_at });
}

export async function webAiChatgptSendPrompt(args: any, runtime?: BrowserToolRuntime): Promise<unknown> { return sendPromptOnPage("chatgpt", args, runtimeOrDefault(runtime)); }
export async function webAiClaudeSendPrompt(args: any, runtime?: BrowserToolRuntime): Promise<unknown> { return sendPromptOnPage("claude", args, runtimeOrDefault(runtime)); }
export async function webAiGeminiSendPrompt(args: any, runtime?: BrowserToolRuntime): Promise<unknown> { return sendPromptOnPage("gemini", args, runtimeOrDefault(runtime)); }
export async function webAiChatgptUploadAndQuery(args: any, runtime?: BrowserToolRuntime): Promise<unknown> { return uploadAndQueryOnPage("chatgpt", args, runtimeOrDefault(runtime)); }
export async function webAiClaudeUploadAndQuery(args: any, runtime?: BrowserToolRuntime): Promise<unknown> { return uploadAndQueryOnPage("claude", args, runtimeOrDefault(runtime)); }
export async function webAiGeminiUploadAndQuery(args: any, runtime?: BrowserToolRuntime): Promise<unknown> { return uploadAndQueryOnPage("gemini", args, runtimeOrDefault(runtime)); }
export async function webAiChatgptGenerateFile(args: any, runtime?: BrowserToolRuntime): Promise<unknown> { return generateFileOnPage("chatgpt", args, runtimeOrDefault(runtime)); }
export async function webAiClaudeGenerateFile(args: any, runtime?: BrowserToolRuntime): Promise<unknown> { return generateFileOnPage("claude", args, runtimeOrDefault(runtime)); }
export async function webAiChatgptGenerateImage(args: any, runtime?: BrowserToolRuntime): Promise<unknown> { return generateImageOnPage("chatgpt", args, runtimeOrDefault(runtime)); }
export async function webAiGeminiGenerateImage(args: any, runtime?: BrowserToolRuntime): Promise<unknown> { return generateImageOnPage("gemini", args, runtimeOrDefault(runtime)); }
export async function webAiGeminiCanvasToDocs(args: any, runtime?: BrowserToolRuntime): Promise<unknown> { return canvasToDocs(args, runtimeOrDefault(runtime)); }
export async function webAiGeminiGenerateVideo(args: any): Promise<unknown> { return startGeminiVideoTask(args); }
export async function webAiTaskStatus(args: any): Promise<unknown> {
  const record = taskRegistry.get(args.task_id);
  if (!record) return safeOutput({ status: "failed", errorCode: ConsumerErrorCodes.INVALID_ARGS });
  return safeOutput({ status: record.status, progress_label: record.progress_label, result: record.result, errorCode: record.errorCode });
}

export const toolSpecs: ToolSpec[] = [
  {
    name: "consumer_health",
    description: "Return a consumer-safe health summary without CDP endpoints, profile paths, page URLs, snapshots, cookies, or tokens.",
    schema: consumerHealthInput,
    handler: async (args, runtime) => consumerHealth({ target: args.target, profile: args.profile, launcher: runtime.launcher })
  },
  {
    name: "webai_chatgpt_send_prompt",
    description: "Send a prompt to ChatGPT and return redacted response metadata.",
    schema: webAiSendPromptInput,
    handler: async (args, runtime) => webAiChatgptSendPrompt(args, runtime)
  },
  {
    name: "webai_claude_send_prompt",
    description: "Send a prompt to Claude and return redacted response metadata.",
    schema: webAiSendPromptInput,
    handler: async (args, runtime) => webAiClaudeSendPrompt(args, runtime)
  },
  {
    name: "webai_gemini_send_prompt",
    description: "Send a prompt to Gemini and return redacted response metadata.",
    schema: webAiSendPromptInput,
    handler: async (args, runtime) => webAiGeminiSendPrompt(args, runtime)
  },
  {
    name: "webai_chatgpt_upload_and_query",
    description: "Upload files to ChatGPT and ask a prompt about them.",
    schema: webAiUploadAndQueryInput,
    handler: async (args, runtime) => webAiChatgptUploadAndQuery(args, runtime)
  },
  {
    name: "webai_claude_upload_and_query",
    description: "Upload up to three files to Claude and ask a prompt about them.",
    schema: webAiUploadAndQueryInput,
    handler: async (args, runtime) => webAiClaudeUploadAndQuery(args, runtime)
  },
  {
    name: "webai_gemini_upload_and_query",
    description: "Upload files to Gemini and ask a prompt about them.",
    schema: webAiUploadAndQueryInput,
    handler: async (args, runtime) => webAiGeminiUploadAndQuery(args, runtime)
  },
  {
    name: "webai_chatgpt_generate_file",
    description: "Ask ChatGPT to generate a downloadable file artifact and return sha256 metadata.",
    schema: webAiGenerateFileInput,
    handler: async (args, runtime) => webAiChatgptGenerateFile(args, runtime)
  },
  {
    name: "webai_claude_generate_file",
    description: "Ask Claude to generate a downloadable artifact and return sha256 metadata.",
    schema: webAiGenerateFileInput,
    handler: async (args, runtime) => webAiClaudeGenerateFile(args, runtime)
  },
  {
    name: "webai_chatgpt_generate_image",
    description: "Ask ChatGPT to generate an image and return download metadata.",
    schema: webAiGenerateImageInput,
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
    schema: webAiCanvasToDocsInput,
    handler: async (args, runtime) => webAiGeminiCanvasToDocs(args, runtime)
  },
  {
    name: "webai_gemini_generate_video",
    description: "Queue an async Gemini video generation task and return a task id immediately.",
    schema: webAiGenerateVideoInput,
    handler: async (args) => webAiGeminiGenerateVideo(args)
  },
  {
    name: "webai_task_status",
    description: "Return status/result metadata for an async webai task.",
    schema: webAiTaskStatusInput,
    handler: async (args) => webAiTaskStatus(args)
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
      if (args.dryRun !== false) return new WorkflowExecutor({ database: runtime.database, actionExecutor: executor(runtime.session) }).runPlan(plan, { dryRun: true });
      const approvalGates = workflowApprovalGates(plan);
      if (approvalGates.length) return workflowApprovalRequiredResponse(plan, approvalGates, runtime.database);
      return runWorkflowPlanInManagedPage(args, runtime, plan);
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
        return {
          ok: result.ok,
          status: workflowExecuteStatus(result.ok),
          plan: result.plan,
          finalResult: result.finalResult,
          stepResults: result.results
        };
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

export function listMcpTools(): McpToolDefinition[] {
  return toolSpecs.map((tool) => ({ name: tool.name, description: tool.description, inputSchema: tool.schema.toJsonSchema() }));
}

export async function callMcpTool(name: string, args: unknown, runtime?: BrowserToolRuntime): Promise<unknown> {
  const spec = toolSpecs.find((tool) => tool.name === name);
  if (!spec) throw new Error(`Unknown MCP tool: ${name}`);
  const parsed = spec.schema.parse(args || {});
  const resolvedRuntime = runtimeOrDefault(runtime);
  if (typeof parsed.target === "string") resolvedRuntime.session.setTarget(parsed.target);
  else if (typeof parsed.site === "string") resolvedRuntime.session.setTarget(parsed.site);
  return spec.handler(parsed, resolvedRuntime);
}
