const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const childProcess = require("node:child_process");
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
import { assertNotPublishDeniedLabel } from "../safety/publishDeny";
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
import { WebAiTaskRecord, WebAiTaskStatus } from "../capabilities/schemas";

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
const serviceDefaults: Record<WebAiService, { url: string; promptSelector: string }> = {
  chatgpt: { url: "https://chatgpt.com/", promptSelector: "#prompt-textarea" },
  claude: { url: "https://claude.ai/new", promptSelector: '[contenteditable="true"], #prompt-textarea' },
  gemini: { url: "https://gemini.google.com/app", promptSelector: 'div[role="textbox"][aria-label="Enter a prompt for Gemini"]' }
};

const profileLeases = new Map<string, string>();
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
const GEMINI_FRESH_COMPOSER_URL = "https://gemini.google.com/app?hl=en";
const GEMINI_RESPONSE_SELECTOR = "main";
const GEMINI_TURN_SELECTOR = 'main [role="article"], main article, main [class*="turn" i], main [class*="response" i]';
const GEMINI_REGENERATE_BUTTON_SELECTOR = 'button[data-test-id="regenerate-button"]';
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
const GEMINI_UPLOAD_TRIGGER_SELECTOR = "button[aria-label=\"Open upload file menu\"]";
const GEMINI_UPLOAD_FILES_SELECTOR = "button[data-test-id=\"local-images-files-uploader-button\"]";
const GEMINI_UPLOAD_CHIP_SELECTOR = "button[aria-label*=\"Remove file\"]";
const CHATGPT_IMAGE_MENU_BUTTON_SELECTOR = "#composer-plus-btn";
const CHATGPT_CREATE_IMAGE_RADIO_SELECTOR = '[role="menuitemradio"]:has-text("Create image")';
// After selecting "Create image" the Radix menu closes and the menuitemradio is
// REMOVED from the DOM (it never flips aria-checked while mounted). The reliable
// "image mode active" signal is the composer pill that replaces it.
const CHATGPT_IMAGE_MODE_ACTIVE_SELECTOR = 'button[aria-label="Image, click to remove"], button[aria-label*="image aspect ratio" i]';
const CHATGPT_IMAGE_RENDERED_SELECTOR = 'button[aria-label="Edit image"]';
// Observed live 2026-05-15 (this Extended Pro account): the inline image-hover
// toolbar has ONLY "Edit image" + "Share this image" — NO download there. The
// real download path is: click the generated image itself → ChatGPT opens a
// full-screen viewer ([role="dialog"], z-[120] absolute inset-0) whose toolbar
// contains a direct (no aria-haspopup) button[aria-label="Save"]. Two-step
// CDP artifact-click: open the viewer (image), then click Save.
const CHATGPT_IMAGE_OPEN_VIEWER_SELECTOR = 'img[alt^="Generated image" i]';
const CHATGPT_IMAGE_DOWNLOAD_BUTTON_SELECTOR = '[role="dialog"] button[aria-label="Save"]';
const GEMINI_CREATE_IMAGE_BUTTON_SELECTOR = 'button[aria-label*="Create image"]';
const GEMINI_TOOLBOX_DRAWER_BUTTON_SELECTOR = "button.toolbox-drawer-button";
const GEMINI_CREATE_IMAGE_MENUITEM_SELECTOR = '[role="menuitemcheckbox"]:has-text("Create image")';
const GEMINI_IMAGE_PROMPT_SELECTOR = 'rich-textarea .ql-editor[contenteditable="true"]';
const GEMINI_IMAGE_RENDERED_SELECTOR = 'button[data-test-id="more-menu-button"]';
// Live-observed 2026-05-15 (gemini-9225, account "Shark 7", Fast tier).
// Canvas → Google Docs export flow:
//   1. Tools drawer (button.toolbox-drawer-button) → Canvas menuitemcheckbox
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
const GEMINI_CANVAS_SHARE_BUTTON_SELECTOR = 'button[data-test-id="share-button"]';
const GEMINI_CANVAS_EXPORT_DOCS_SELECTOR = 'button[data-test-id="export-to-docs-button"]';
const GOOGLE_DOCS_URL_RE = /^https:\/\/docs\.google\.com\/document\/d\/([^/?#]+)/;
// Veo video generation flow (same composer): Tools drawer → Create video
// menuitemcheckbox; in-progress copy "Generating your video…"; when ready a
// video player with button[aria-label="Download video"] (class
// download-button) renders. ~105s observed for an 8s clip on Fast tier.
const GEMINI_CREATE_VIDEO_MENUITEM_SELECTOR = '[role="menuitemcheckbox"]:has-text("Create video")';
const GEMINI_CREATE_VIDEO_ZERO_STATE_SELECTOR = 'button[aria-label="Create video, button, tap to use tool"]';
const GEMINI_VIDEO_MODE_ACTIVE_SELECTOR = 'button[aria-label="Deselect Create video"]';
const GEMINI_VIDEO_DOWNLOAD_BUTTON_SELECTOR = 'button[aria-label="Download video"]';

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

  if (service === "gemini") {
    try {
      await page.waitForFunction?.(
        ({ stopSelector, turnSelector, assistantCountBefore }: any) => {
          const visible = (el: Element) => !!((el as HTMLElement).offsetWidth || (el as HTMLElement).offsetHeight || (el as HTMLElement).getClientRects().length);
          const stopVisible = Array.from(document.querySelectorAll(stopSelector)).some(visible);
          const turnCount = document.querySelectorAll(turnSelector).length;
          return stopVisible || turnCount > assistantCountBefore;
        },
        { stopSelector, turnSelector: GEMINI_TURN_SELECTOR, assistantCountBefore },
        { timeout: phaseATimeout }
      );
    } catch (_error) {
      return { completion_detected: false, wait_ms: Math.min(elapsed(), timeoutMs) };
    }

    const remaining = Math.max(1, timeoutMs - elapsed());
    try {
      await page.waitForFunction?.(
        ({ stopSelector, regenerateSelector }: any) => {
          const visible = (el: Element) => !!((el as HTMLElement).offsetWidth || (el as HTMLElement).offsetHeight || (el as HTMLElement).getClientRects().length);
          const stopVisible = Array.from(document.querySelectorAll(stopSelector)).some(visible);
          // NOTE: do NOT gate on the Send button being enabled. After a Gemini
          // response the composer is empty, so Send is aria-disabled="true"
          // indefinitely; requiring it never converges. The regenerate-button
          // (response-action toolbar) + no Stop + stable text is the reliable,
          // sufficient completion signal (dom-probe-r2 §C, confirmed live r6).
          const regeneratePresent = Array.from(document.querySelectorAll(regenerateSelector)).some(visible);
          const stableTarget = document.querySelector("main") as HTMLElement | null;
          const textLength = stableTarget?.textContent?.length || 0;
          const state = (window as any).__webAiCompletionStable || ((window as any).__webAiCompletionStable = { length: -1, since: Date.now() });
          if (state.length !== textLength) {
            state.length = textLength;
            state.since = Date.now();
          }
          return regeneratePresent && !stopVisible && Date.now() - state.since >= 1500;
        },
        { stopSelector, sendSelector, regenerateSelector: GEMINI_REGENERATE_BUTTON_SELECTOR },
        { timeout: remaining }
      );
      return { completion_detected: true, wait_ms: elapsed() };
    } catch (_error) {
      return { completion_detected: false, wait_ms: Math.min(elapsed(), timeoutMs) };
    }
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
  const attemptSend = async () => {
    if (forceEnterToSend) { await page.keyboard?.press("Enter"); return; }
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
  const imageSelector = service === "chatgpt" ? CHATGPT_IMAGE_RENDERED_SELECTOR : GEMINI_IMAGE_RENDERED_SELECTOR;
  try {
    await page.waitForSelector?.(imageSelector, { state: "visible", timeout: Math.min(120000, timeoutMs || 120000) });
  } catch (error: any) {
    throw new WebAiToolError(ConsumerErrorCodes.COMMAND_TIMEOUT, `${service} generated image toolbar did not render before timeout`, { selector: imageSelector, cause: error?.message || String(error) });
  }
}

async function clickIfPresent(page: any, selector: string): Promise<void> {
  const loc = page.locator?.(selector).first?.();
  if (!loc) return;
  if (await loc.count?.().catch(() => 0)) await loc.click?.({ timeout: 1500 }).catch(() => undefined);
}

async function requireAndClick(page: any, selector: string, message: string): Promise<any> {
  const loc = page.locator?.(selector).first?.();
  if (!loc || !(await loc.count?.().catch(() => 0))) throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, message, { selector });
  await loc.click?.({ timeout: 5000 });
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
    await radio.click?.({ timeout: 8000 });
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
    if (typeof before === "string" && before.includes("Deselect Create image")) return;
    await zeroStateButton.click?.({ timeout: 5000 });
    if (typeof page.waitForTimeout === "function") await page.waitForTimeout(250).catch(() => undefined);
    const after = typeof zeroStateButton.getAttribute === "function" ? await zeroStateButton.getAttribute("aria-label").catch(() => "") : "";
    if (typeof after === "string" && after.includes("Deselect Create image")) return;
  }

  try {
    await requireAndClick(page, GEMINI_TOOLBOX_DRAWER_BUTTON_SELECTOR, "Gemini Tools drawer button was not found");
    await page.waitForSelector?.(GEMINI_CREATE_IMAGE_MENUITEM_SELECTOR, { state: "visible", timeout: 8000 });
    const menuItem = page.locator?.(GEMINI_CREATE_IMAGE_MENUITEM_SELECTOR).first?.();
    if (menuItem && await menuItem.count?.().catch(() => 0)) {
      const before = typeof menuItem.getAttribute === "function" ? await menuItem.getAttribute("aria-checked").catch(() => undefined) : undefined;
      if (before === "true" || before === "mixed") return;
      await menuItem.click?.({ timeout: 5000 });
      if (typeof page.waitForTimeout === "function") await page.waitForTimeout(250).catch(() => undefined);
      const after = typeof menuItem.getAttribute === "function" ? await menuItem.getAttribute("aria-checked").catch(() => undefined) : undefined;
      const checked = typeof menuItem.isChecked === "function" ? await menuItem.isChecked().catch(() => false) : false;
      if (after === "true" || after === "mixed" || checked) return;
    }
  } catch (_error) {
    // Fall through to a stable ELEMENT_NOT_FOUND with both real UI affordances in evidence.
  }

  throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "Gemini Create image tool did not activate from the zero-state chip or Tools drawer", { selector: `${GEMINI_CREATE_IMAGE_BUTTON_SELECTOR} OR ${GEMINI_TOOLBOX_DRAWER_BUTTON_SELECTOR} -> ${GEMINI_CREATE_IMAGE_MENUITEM_SELECTOR}` });
}

// Activate a Gemini Tools-drawer mode (Canvas / Create video) and confirm via
// the active-mode "Deselect <tool>" pill — the live-observed activation signal
// (2026-05-15): clicking the menuitemcheckbox closes the drawer and replaces
// the mode-picker affordance with button[aria-label="Deselect <tool>"], exactly
// like "Deselect Create image". An optional zero-state chip is tried first.
async function activateGeminiToolMode(page: any, opts: { menuItemSelector: string; activeSelector: string; zeroStateSelector?: string; toolName: string }): Promise<void> {
  const isActive = async () => {
    const loc = page.locator?.(opts.activeSelector).first?.();
    return !!loc && !!(await loc.count?.().catch(() => 0));
  };
  if (await isActive()) return;
  if (opts.zeroStateSelector) {
    const zero = page.locator?.(opts.zeroStateSelector).first?.();
    const zeroVisible = typeof page.waitForSelector === "function"
      ? await page.waitForSelector(opts.zeroStateSelector, { state: "visible", timeout: 4000 }).then(() => true).catch(() => false)
      : false;
    if (zeroVisible && zero && await zero.count?.().catch(() => 0)) {
      await zero.click?.({ timeout: 5000 }).catch(() => undefined);
      if (typeof page.waitForTimeout === "function") await page.waitForTimeout(400).catch(() => undefined);
      if (await isActive()) return;
    }
  }
  try {
    // The Gemini composer + Tools-drawer button mount AFTER domcontentloaded
    // via Angular hydration; an instant requireAndClick races that render and
    // spuriously throws ELEMENT_NOT_FOUND at ~0ms (same class as the upload
    // trigger race). Wait for the button to actually be visible (bounded)
    // before clicking — confirmed live present on the fresh composer.
    if (typeof page.waitForSelector === "function") {
      await page.waitForSelector(GEMINI_TOOLBOX_DRAWER_BUTTON_SELECTOR, { state: "visible", timeout: 15000 });
    }
    await requireAndClick(page, GEMINI_TOOLBOX_DRAWER_BUTTON_SELECTOR, "Gemini Tools drawer button was not found");
    await page.waitForSelector?.(opts.menuItemSelector, { state: "visible", timeout: 8000 });
    await requireAndClick(page, opts.menuItemSelector, `Gemini ${opts.toolName} menu item was not found`);
    await page.waitForSelector?.(opts.activeSelector, { state: "visible", timeout: 8000 });
    if (await isActive()) return;
  } catch (_error) {
    // Fall through to a stable ELEMENT_NOT_FOUND with both affordances in evidence.
  }
  throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, `Gemini ${opts.toolName} tool did not activate from the zero-state chip or Tools drawer`, { selector: `${opts.zeroStateSelector || ""} OR ${GEMINI_TOOLBOX_DRAWER_BUTTON_SELECTOR} -> ${opts.menuItemSelector} -> ${opts.activeSelector}` });
}

async function activateGeminiCanvasMode(page: any): Promise<void> {
  await activateGeminiToolMode(page, { menuItemSelector: GEMINI_CANVAS_MENUITEM_SELECTOR, activeSelector: GEMINI_CANVAS_MODE_ACTIVE_SELECTOR, toolName: "Canvas" });
}

async function activateGeminiVideoMode(page: any): Promise<void> {
  await activateGeminiToolMode(page, { menuItemSelector: GEMINI_CREATE_VIDEO_MENUITEM_SELECTOR, activeSelector: GEMINI_VIDEO_MODE_ACTIVE_SELECTOR, zeroStateSelector: GEMINI_CREATE_VIDEO_ZERO_STATE_SELECTOR, toolName: "Create video" });
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
  // The Gemini composer (and its upload-trigger button) mounts AFTER
  // domcontentloaded via Angular; an instant count() check races the render
  // and spuriously throws ELEMENT_NOT_FOUND at wait_ms=0. Wait for the button
  // to actually be present/visible first (bounded), then click.
  try {
    await page.waitForSelector?.(GEMINI_UPLOAD_TRIGGER_SELECTOR, { state: "visible", timeout: 15000 });
  } catch (error: any) {
    throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "Gemini upload trigger button was not found", { selector: GEMINI_UPLOAD_TRIGGER_SELECTOR, cause: error?.message || String(error) });
  }
  await requireAndClick(page, GEMINI_UPLOAD_TRIGGER_SELECTOR, "Gemini upload trigger button was not found");
  try {
    await page.waitForSelector?.(GEMINI_UPLOAD_FILES_SELECTOR, { state: "visible", timeout: 10000 });
  } catch (error: any) {
    throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "Gemini upload-files menu item was not found after opening the upload menu", { selector: GEMINI_UPLOAD_FILES_SELECTOR, cause: error?.message || String(error) });
  }
  let chooser: any;
  try {
    [chooser] = await Promise.all([
      page.waitForEvent?.("filechooser", { timeout: 15000 }),
      requireAndClick(page, GEMINI_UPLOAD_FILES_SELECTOR, "Gemini upload-files menu item was not found"),
    ]);
  } catch (error: any) {
    if (error instanceof WebAiToolError) throw error;
    throw new WebAiToolError(ConsumerErrorCodes.COMMAND_TIMEOUT, "Gemini upload did not open a file chooser", { selector: GEMINI_UPLOAD_FILES_SELECTOR, cause: error?.message || String(error) });
  }
  if (!chooser || typeof chooser.setFiles !== "function") {
    throw new WebAiToolError(ConsumerErrorCodes.COMMAND_TIMEOUT, "Gemini file chooser was not intercepted", { selector: GEMINI_UPLOAD_FILES_SELECTOR });
  }
  await chooser.setFiles(resolved);
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
  const selector = args.__promptSelector || serviceDefaults[service].promptSelector;
  const box = page.locator(selector).first();
  await box.waitFor({ state: "visible", timeout: Math.min(timeout, 15000) });
  if (loginRequiredForService(service, page.url?.() || "")) return loginRequiredResponse(service, page, started);
  await box.fill?.(args.prompt).catch(async () => { await box.click(); await page.keyboard?.type(args.prompt); });
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
    const openSelector = service === "chatgpt" ? CHATGPT_IMAGE_OPEN_VIEWER_SELECTOR : GEMINI_IMAGE_RENDERED_SELECTOR;
    const downloadSelector = service === "chatgpt" ? CHATGPT_IMAGE_DOWNLOAD_BUTTON_SELECTOR : 'button[data-test-id="image-download-button"]';
    const result = await artifactClickRunner(runtime)({
      profile: args.profile,
      tabUrlContains: args.tab_url_contains || conversationUrl || serviceDefaults[service].url,
      buttonSelector: openSelector,
      followUpSelector: downloadSelector,
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
      // 1. Activate Canvas mode (Tools drawer -> Canvas; ELEMENT_NOT_FOUND if absent).
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
      const result = await sendPromptInExistingPage("gemini", { ...args, __promptSelector: GEMINI_IMAGE_PROMPT_SELECTOR, __forceEnterToSend: true, __expectImageResponse: true }, page, Date.now());
      if (result.errorCode) return safeOutput({ docs_url: null, docs_doc_id: null, title, errorCode: result.errorCode, ...(result.error_code ? { error_code: result.error_code } : {}) });
      // 3. Wait for the Canvas document to finish rendering (its share/export
      //    button is the authoritative "Canvas ready" marker), then open the
      //    export menu and click "Export to Docs".
      const canvasReadyTimeout = Number(args.response_timeout_ms) > 0 ? Number(args.response_timeout_ms) : DEFAULT_RESPONSE_TIMEOUT_MS;
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
// fresh composer -> activate Create video (Tools drawer / zero-state chip) ->
// send prompt -> "Generating your video..." (~1-2 min) -> a video player with
// button[aria-label="Download video"] renders -> CDP artifact-click downloads
// the file. ~105s observed for an 8s clip on Fast tier. Honest terminal
// errorCode (no synthesis) when any stage genuinely fails.
async function runGeminiVideoGeneration(args: any, runtime: Required<BrowserToolRuntime>, record: WebAiTaskRecord): Promise<void> {
  const timeoutMs = Number(args.timeout_ms) > 0 ? Number(args.timeout_ms) : 300000;
  let conversationUrl: string | undefined;
  await withManagedPage(args, runtime, targetUrlFor("gemini", args), async (page) => {
    record.progress_label = "navigating Gemini composer";
    await navigateGeminiFreshIfNeeded(page, { ...args, __forceFreshComposer: true });
    if (loginRequiredForService("gemini", page.url?.() || "")) throw new WebAiToolError(ConsumerErrorCodes.LOGIN_REQUIRED, "Gemini login required for video generation");
    record.progress_label = "activating Create video mode";
    await activateGeminiVideoMode(page);
    record.progress_label = "submitting video prompt";
    const result = await sendPromptInExistingPage("gemini", { ...args, __promptSelector: GEMINI_IMAGE_PROMPT_SELECTOR, __expectImageResponse: true, __forceEnterToSend: true }, page, Date.now());
    if (result.errorCode) throw new WebAiToolError(String(result.errorCode), "Gemini video prompt failed before generation started");
    record.progress_label = "generating video (this can take 1-2 min)";
    try {
      await page.waitForSelector?.(GEMINI_VIDEO_DOWNLOAD_BUTTON_SELECTOR, { state: "visible", timeout: timeoutMs });
    } catch (error: any) {
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
  const started = Date.parse(record.started_at);
  const budgetExceeded = Number.isFinite(started) && Date.now() - started > timeoutMs;
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
  const active = runtime.database.getActiveWebAiTaskForProfile(args.profile);
  if (active) {
    const current = maybeMarkStaleVideoTask(runtime.database, active);
    if (["queued", "running"].includes(current.status)) throw new WebAiToolError(ConsumerErrorCodes.PROFILE_LEASE_BUSY, `profile ${args.profile} already has an active webai mutation lease`, { profile: args.profile, lease_id: active.lease_id });
  }
  const task_id = safeTaskId();
  const lease = `lease_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
  let record: WebAiTaskRecord = { task_id, status: "running", profile: args.profile, lease_id: lease, started_at: new Date().toISOString(), progress_label: "queued Gemini video generation", timeout_ms: videoTaskTimeoutMs(args) };
  record = persistVideoTask(runtime.database, record);
  try {
    const spawned = (runtime as any).spawnVideoWorker ? (runtime as any).spawnVideoWorker(task_id, args, runtime.database) : spawnDetachedGeminiVideoWorker(task_id, args, runtime.database);
    if (spawned?.pid) {
      const latest = runtime.database.getWebAiTask(task_id) || record;
      persistVideoTask(runtime.database, { ...latest, worker_pid: spawned.pid });
    }
  } catch (error: any) {
    persistVideoTask(runtime.database, { ...record, status: "failed", errorCode: ConsumerErrorCodes.COMMAND_TIMEOUT, progress_label: `failed: ${ConsumerErrorCodes.COMMAND_TIMEOUT}` });
  }
  return safeOutput({ task_id, status: record.status, profile: record.profile, lease_id: lease, started_at: record.started_at });
}

export async function runGeminiVideoTaskWorker(taskId: string, args: any, database = new CapabilityDatabase()): Promise<void> {
  const runtime = runtimeOrDefault({ database });
  let record = database.getWebAiTask(taskId);
  if (!record) {
    record = { task_id: taskId, status: "running", profile: args.profile, lease_id: `lease_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`, started_at: new Date().toISOString(), progress_label: "queued Gemini video generation", timeout_ms: videoTaskTimeoutMs(args), worker_pid: process.pid };
  } else {
    record = { ...record, status: "running", worker_pid: process.pid };
  }
  persistVideoTask(database, record);
  try {
    await runGeminiVideoGeneration(args, runtime, record);
    persistVideoTask(database, { ...record, status: "done", progress_label: "video generated and downloaded" });
  } catch (error: any) {
    const errorCode = (error instanceof WebAiToolError && error.errorCode) ? error.errorCode : ConsumerErrorCodes.COMMAND_TIMEOUT;
    persistVideoTask(database, { ...record, status: "failed", errorCode, progress_label: `failed: ${errorCode}` });
  }
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
export async function webAiGeminiGenerateVideo(args: any, runtime?: BrowserToolRuntime): Promise<unknown> { return startGeminiVideoTask(args, runtimeOrDefault(runtime)); }
export async function webAiTaskStatus(args: any, runtime?: BrowserToolRuntime): Promise<unknown> {
  const database = runtime?.database || new CapabilityDatabase();
  const record = database.getWebAiTask(args.task_id);
  if (!record) return safeOutput({ status: "failed", errorCode: ConsumerErrorCodes.INVALID_ARGS });
  const current = maybeMarkStaleVideoTask(database, record);
  return safeOutput({ status: current.status, progress_label: current.progress_label, result: current.result, errorCode: current.errorCode });
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
    handler: async (args, runtime) => webAiGeminiGenerateVideo(args, runtime)
  },
  {
    name: "webai_task_status",
    description: "Return status/result metadata for an async webai task.",
    schema: webAiTaskStatusInput,
    handler: async (args, runtime) => webAiTaskStatus(args, runtime)
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
