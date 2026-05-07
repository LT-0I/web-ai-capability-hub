#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
import { BrowserSessionManager } from "./browser/sessionManager";
import { ManagedBrowserLauncher, BrowserCloseMode } from "./browser/managedLauncher";
import { BrowserProfileStore } from "./browser/profileStore";
import { DownloadManager } from "./browser/downloads";
import { activeManagedPage } from "./browser/managedPageRouting";
import { allocateSession, freeSession, listSessions } from "./browser/sessionPool";
import { TabRegistry } from "./browser/tabRegistry";
import { getStoragePaths } from "./utils/paths";
import { readHtmlSnapshotFromFile, readPageSnapshot } from "./reader/snapshot";
import { ActionExecutor } from "./actions/executor";
import { loadRecipeById, listRecipes } from "./recipes/loader";
import { RecipeEngine } from "./recipes/engine";
import { listAdapters } from "./adapters/adapterLoader";
import { listWebAiAdapters, getWebAiAdapter } from "./adapters/web-ai";
import { captureSiteMapForSnapshot, saveSiteMap } from "./maintenance/captureSiteMap";
import { diffSiteMapFiles, latestSiteMapPath } from "./maintenance/diffSiteMap";
import { startMcpServer } from "./mcp/server";
import { listMcpTools } from "./mcp/tools";
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

interface ParsedArgs { options: Record<string, string | boolean>; positionals: string[]; }

function parseArgs(args: string[]): ParsedArgs {
  const options: Record<string, string | boolean> = {};
  const positionals: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--") { positionals.push(...args.slice(i + 1)); break; }
    if (arg.startsWith("--")) {
      const eq = arg.indexOf("=");
      if (eq > 2) { options[arg.slice(2, eq)] = arg.slice(eq + 1); continue; }
      const key = arg.slice(2);
      const next = args[i + 1];
      if (!next || next.startsWith("--")) options[key] = true;
      else { options[key] = next; i++; }
    } else positionals.push(arg);
  }
  return { options, positionals };
}

function asString(value: string | boolean | undefined, fallback?: string): string | undefined { return typeof value === "string" ? value : fallback; }
function asNumber(value: string | boolean | undefined): number | undefined { return typeof value === "string" ? Number(value) : undefined; }
function wantJson(options: Record<string, string | boolean>): boolean { return options.json === true || options.json === "true"; }
function output(value: unknown, options: Record<string, string | boolean> = {}): void { console.log(wantJson(options) ? JSON.stringify(value, null, 2) : typeof value === "string" ? value : JSON.stringify(value, null, 2)); }

async function withSession(fn: (session: BrowserSessionManager) => Promise<unknown>, options: Record<string, string | boolean> = {}): Promise<unknown> {
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

async function withManagedPage(fn: (page: any) => Promise<unknown>, options: Record<string, string | boolean> = {}, targetUrl?: string): Promise<unknown> {
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

function help(): string {
  return `Web AI Capability Database and Workflow Hub

${policyNotice()}

Core commands:
  browser:launch --profile <name> [--url <url>] [--cdp-port <port>] [--json]
  browser:status --profile <name> [--json]
  browser:pages --profile <name> [--json]
  browser:tab:alloc --profile <name> --url <url> --tab-id <id> [--json]
  browser:tab:list --profile <name> [--json]
  browser:tab:free --tab-id <id> [--json]
  browser:close --profile <name> --mode disconnect|close-process|leave-open [--json]
  browser:profiles [--json]

  capability:init-db [--json]
  capability:update --target <id> --profile <name> [--kind web-ai|research-database] [--fixture <html>] [--tab-id <id>] [--json]
  capability:health-check --target <id> --profile <name> [--url <url>] [--apply] [--json]
  capability:query --target <id> --text <query> [--json]
  capability:export --target <id> --out <path> [--json]

  workflow:list [--json]
  workflow:compile <workflow.yaml|json> [--json]
  workflow:test <workflow.yaml|json> [--json]
  workflow:run <workflow.yaml|json> [--dry-run] [--json]

  site:registry:import <site_registry.json> [--json]
  site:capture-map --site <id> [--profile research-default] [--fixture <html>] [--json]
  scheduler:run --interval-minutes <n> [--json]

MCP and compatibility commands:
  mcp
  mcp:tools [--json]
  mcp:resources [--json]
  adapter:list [--json]
  web-ai:adapters [--json]
  recipe:list [--json]
  browser:start|browser:open|browser:read|browser:screenshot [--tab-id <id>]
  recipe <id> --key value
  snapshot:capture --site <site> [--url <url>] [--tab-id <id>]
  snapshot:diff --site <site> --previous <path> --current <path>`;
}

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);
  const { options, positionals } = parseArgs(rest);
  if (!command || command === "help" || command === "--help" || command === "-h") { console.log(help()); return; }

  if (command === "mcp") { await startMcpServer(); return; }
  if (command === "mcp:tools") { output(listMcpTools(), options); return; }
  if (command === "mcp:resources") { output(listMcpResources(), options); return; }
  if (command === "adapter:list") { output(listAdapters(), options); return; }
  if (command === "web-ai:adapters") { output(listWebAiAdapters(), options); return; }
  if (command === "recipe:list") { output(listRecipes().map((recipe) => ({ id: recipe.id, name: recipe.name, adapter: recipe.adapter })), options); return; }

  if (command === "browser:launch") {
    const launcher = new ManagedBrowserLauncher();
    output(await launcher.launch({ profile: asString(options.profile), url: asString(options.url), cdpPort: asNumber(options["cdp-port"] || options.cdpPort), executablePath: asString(options.executable || options.executablePath) }), options);
    return;
  }
  if (command === "browser:status") {
    output(await new ManagedBrowserLauncher().status(asString(options.profile)), options);
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
    output(await new ManagedBrowserLauncher().close(asString(options.profile), mode), options);
    return;
  }
  if (command === "browser:profiles") {
    output(new BrowserProfileStore().list(), options);
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
    const snapshot = fixture
      ? readHtmlSnapshotFromFile(path.resolve(fixture))
      : await withManagedPage(async (page) => readPageSnapshot(page, { includeAccessibility: true, screenshot: options.screenshot === true }), options, targetUrl) as any;
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
    const file = positionals[0] || asString(options.file);
    if (!file) throw new Error("workflow:run requires a workflow YAML/JSON file");
    const dryRun = options["dry-run"] === true || options.dryRun === true;
    if (dryRun) output(await new WorkflowExecutor({ database: new CapabilityDatabase() }).runFile(file, { dryRun: true }), options);
    else {
      const workflow = readConfigFile(path.resolve(file));
      const workflowOptions = { ...options, profile: asString(options.profile) || workflow.profile || workflow.target };
      const workflowUrl = asString(options.url) || targetBaseUrl(workflow.target);
      const result = await withManagedPage(async (page) => {
        const downloads = new DownloadManager(path.join(process.cwd(), "data", "downloads"));
        return new WorkflowExecutor({ database: new CapabilityDatabase(), actionExecutor: new ActionExecutor({ getActivePage: () => page, openUrl: async (url) => { await page.goto(url, { waitUntil: "domcontentloaded" }); return page; }, downloads }) }).runFile(file, { dryRun: false });
      }, workflowOptions, workflowUrl);
      output(result, options);
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
    if (asString(options["tab-id"] || options.tabId)) {
      output(await withManagedPage(async (page) => readPageSnapshot(page, { screenshot: command === "browser:screenshot" || options.screenshot === true, includeAccessibility: true }), options, asString(options.url)), options);
      return;
    }
    output(await withSession(async (session) => {
      const page = session.activePage() || await session.newPage();
      return readPageSnapshot(page, { screenshot: command === "browser:screenshot" || options.screenshot === true, includeAccessibility: true });
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
        const snapshot = await readPageSnapshot(page, { includeAccessibility: true });
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

main().catch((error) => {
  const parsed = parseArgs(process.argv.slice(3));
  const message = error instanceof Error ? error.message : String(error);
  if (wantJson(parsed.options)) console.error(JSON.stringify({ ok: false, error: message }, null, 2));
  else console.error(message);
  process.exitCode = 1;
});
