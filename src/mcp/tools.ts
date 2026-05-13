const fs = require("node:fs");
const path = require("node:path");
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
  workflowRunInput
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
  return { session, launcher: runtime?.launcher || new ManagedBrowserLauncher(), database };
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

export const toolSpecs: ToolSpec[] = [
  {
    name: "consumer_health",
    description: "Return a consumer-safe health summary without CDP endpoints, profile paths, page URLs, snapshots, cookies, or tokens.",
    schema: consumerHealthInput,
    handler: async (args, runtime) => consumerHealth({ target: args.target, profile: args.profile, launcher: runtime.launcher })
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
