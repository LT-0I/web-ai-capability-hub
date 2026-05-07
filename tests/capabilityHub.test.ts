const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const http = require("node:http");
const crypto = require("node:crypto");
import { buildLaunchArguments, detachLaunchedProcess, readCdpPages, waitForCdpVersion } from "../src/browser/managedLauncher";
import { findBrowserExecutable } from "../src/browser/executableDiscovery";
import { BrowserProfileStore } from "../src/browser/profileStore";
import { readHtmlSnapshotFromFile } from "../src/reader/snapshot";
import { CapabilityDatabase } from "../src/capabilities/database";
import { CapabilityExtractor } from "../src/capabilities/extractor";
import { CapabilityUpdater } from "../src/capabilities/updater";
import { WorkflowCompiler } from "../src/workflows/compiler";
import { WorkflowExecutor } from "../src/workflows/executor";
import { SiteRegistryImporter } from "../src/adapters/research/siteRegistryImporter";
import { callMcpTool, listMcpTools } from "../src/mcp/tools";
import { browserLaunchInput, capabilityQueryInput } from "../src/mcp/schemas";
import { serializeMcpToolError } from "../src/mcp/server";
import { ConfirmationRequiredError } from "../src/actions/confirmationPolicy";
import { FakePage } from "./helpers";

function tempDir(): string { return fs.mkdtempSync(path.join(os.tmpdir(), "wah-test-")); }
function tempDb(): CapabilityDatabase { return new CapabilityDatabase({ dbPath: path.join(tempDir(), "capability.sqlite"), preferSqlite: false }); }
function expectedArtifactId(targetId: string, kind: string, artifactPath: string): string {
  return `art_${crypto.createHash("sha1").update(`${targetId}:${kind}:${artifactPath}`).digest("hex")}`;
}

test("managed CDP launch arguments and executable discovery are deterministic", () => {
  const args = buildLaunchArguments({ cdpHost: "127.0.0.1", cdpPort: 9333, profileDir: "C:/wah/profile", url: "https://gemini.google.com/app" });
  assert.ok(args.includes("--remote-debugging-port=9333"));
  assert.ok(args.includes("--user-data-dir=C:/wah/profile"));
  assert.equal(args.at(-1), "https://gemini.google.com/app");

  const fake = path.join(tempDir(), process.platform === "win32" ? "chrome.exe" : "chrome");
  fs.writeFileSync(fake, "");
  const previous = process.env.WAH_BROWSER_EXECUTABLE;
  process.env.WAH_BROWSER_EXECUTABLE = fake;
  try { assert.equal(findBrowserExecutable()?.path, fake); }
  finally { if (previous === undefined) delete process.env.WAH_BROWSER_EXECUTABLE; else process.env.WAH_BROWSER_EXECUTABLE = previous; }

  let unrefCalled = false;
  detachLaunchedProcess({ unref: () => { unrefCalled = true; } });
  assert.equal(unrefCalled, true);
});

test("CDP health check and page list parsing use /json endpoints", async () => {
  const server = http.createServer((req: any, res: any) => {
    res.setHeader("content-type", "application/json");
    if (req.url === "/json/version") res.end(JSON.stringify({ Browser: "MockChrome/1", webSocketDebuggerUrl: "ws://127.0.0.1/devtools/browser/mock" }));
    else if (req.url === "/json/list") res.end(JSON.stringify([{ id: "1", type: "page", title: "Mock", url: "https://example.test" }]));
    else { res.statusCode = 404; res.end("{}"); }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as any).port;
  try {
    const version = await waitForCdpVersion("127.0.0.1", port, 1000);
    assert.equal(version.Browser, "MockChrome/1");
    const pages = await readCdpPages("127.0.0.1", port);
    assert.equal(pages[0].title, "Mock");
  } finally { server.close(); }
});

test("profile store persists per-profile CDP metadata", () => {
  const store = new BrowserProfileStore(tempDir());
  const profile = store.upsert({ profileName: "gemini", browserType: "chrome", cdpEndpoint: "http://127.0.0.1:9222", cdpPort: 9222, processId: 12345, lastStatus: "connected" });
  assert.ok(profile.profileDir.includes("gemini"));
  assert.equal(store.get("gemini").cdpPort, 9222);
  assert.equal(store.get("gemini").processId, 12345);
  assert.equal(store.list().length, 1);
});

test("capability extractor and database store, query, export, import, and version capabilities", () => {
  const db = tempDb();
  const snapshot = readHtmlSnapshotFromFile(path.resolve(process.cwd(), "fixtures/mock-web-ai.html"));
  const extracted = new CapabilityExtractor().extract(snapshot, { targetId: "gemini", captureId: "capture-test" });
  assert.ok(extracted.uiElements.length > 0);
  assert.ok(extracted.capabilities.some((capability) => capability.name === "enter_prompt"));
  assert.ok(extracted.capabilities.some((capability) => capability.name === "open_image_generation"));

  const result = new CapabilityUpdater(db).updateFromSnapshot({ target: "gemini", kind: "web-ai", profile: "gemini", snapshot });
  assert.equal(result.target, "gemini");
  assert.ok(db.queryCapabilities({ target: "gemini", text: "image generation" }).some((capability) => capability.name === "open_image_generation"));
  new CapabilityUpdater(db).updateFromSnapshot({ target: "gemini", kind: "web-ai", profile: "gemini", snapshot: { ...snapshot, title: "Mock Web AI Console Updated" } });
  const exported = db.exportJson("gemini");
  assert.ok(exported.capability_versions.length >= exported.capabilities.length);

  const db2 = tempDb();
  const imported = db2.importJson(exported);
  assert.ok(imported.imported.capabilities > 0);
  assert.ok(db2.queryCapabilities({ target: "gemini", text: "prompt" }).length > 0);
});

test("database inserts artifacts with deterministic ids and replaces existing rows", () => {
  const db = tempDb();
  const artifactPath = "data/downloads/export.csv";

  const inserted = db.insertArtifact({
    target_id: "gemini",
    capture_id: null,
    kind: "download",
    path: artifactPath,
    metadata: { suggestedFilename: "export.csv", url: "https://example.test/export.csv", failure: null }
  });
  const replaced = db.insertArtifact({
    target_id: "gemini",
    capture_id: null,
    kind: "download",
    path: artifactPath,
    metadata: { suggestedFilename: "export-latest.csv", url: "https://example.test/export.csv", failure: "interrupted" }
  });

  assert.equal(inserted.id, expectedArtifactId("gemini", "download", artifactPath));
  assert.equal(replaced.id, inserted.id);
  const exported = db.exportJson("gemini");
  assert.equal(exported.artifacts.length, 1);
  assert.equal(exported.artifacts[0].id, inserted.id);
  assert.equal(exported.artifacts[0].kind, "download");
  assert.deepEqual(exported.artifacts[0].metadata, { suggestedFilename: "export-latest.csv", url: "https://example.test/export.csv", failure: "interrupted" });
});

test("capability updater stores screenshot artifacts and references artifact ids from captures", () => {
  const db = tempDb();
  const snapshot = {
    ...readHtmlSnapshotFromFile(path.resolve(process.cwd(), "fixtures/mock-web-ai.html")),
    screenshotPath: "data/screenshots/gemini-home.png"
  };

  const result = new CapabilityUpdater(db).updateFromSnapshot({ target: "gemini", kind: "web-ai", profile: "gemini", snapshot });

  const exported = db.exportJson("gemini");
  const expectedId = expectedArtifactId("gemini", "screenshot", snapshot.screenshotPath);
  assert.equal(exported.artifacts.length, 1);
  assert.equal(exported.artifacts[0].id, expectedId);
  assert.equal(exported.artifacts[0].capture_id, result.captureId);
  assert.equal(exported.artifacts[0].kind, "screenshot");
  assert.deepEqual(exported.artifacts[0].metadata, { url: snapshot.url, title: snapshot.title });
  assert.equal(exported.page_captures[0].id, result.captureId);
  assert.deepEqual(exported.page_captures[0].artifact_refs, [expectedId]);
});

test("site registry importer preserves uploaded registry entries", () => {
  const db = tempDb();
  const importer = new SiteRegistryImporter(db);
  const file = fs.existsSync(path.resolve(process.cwd(), "../reference-ip-literature-patent-research/references/site_registry.json"))
    ? path.resolve(process.cwd(), "../reference-ip-literature-patent-research/references/site_registry.json")
    : path.resolve(process.cwd(), "fixtures/site_registry.sample.json");
  const result = importer.importFile(file);
  assert.ok(result.imported > 5);
  assert.ok(result.sites.includes("cnki"));
  assert.ok(db.listTargets().some((target) => target.target_id === "cnki"));
});

test("workflow YAML parsing, compilation, safety gates, and dry-run execution work without browser login", async () => {
  const db = tempDb();
  const snapshot = readHtmlSnapshotFromFile(path.resolve(process.cwd(), "fixtures/mock-web-ai.html"));
  new CapabilityUpdater(db).updateFromSnapshot({ target: "gemini", kind: "web-ai", profile: "gemini", snapshot });
  const workflowPath = path.resolve(process.cwd(), "examples/workflows/gemini-image-draft.yaml");
  const plan = new WorkflowCompiler(db).compileFile(workflowPath);
  assert.equal(plan.id, "gemini-image-draft");
  assert.equal(plan.actions.length, 3);
  assert.equal(plan.actions.some((action) => action.action.type === "type"), true);
  const result = await new WorkflowExecutor({ database: db }).runFile(workflowPath, { dryRun: true });
  assert.equal(result.ok, true);
  assert.equal(result.dryRun, true);
});

function writeRiskyWorkflow(dir: string): string {
  const workflowPath = path.join(dir, "risky-workflow.json");
  fs.writeFileSync(workflowPath, JSON.stringify({
    id: "approval-handshake-test",
    target: "test-target",
    profile: "test-profile",
    mode: "manual-approval",
    steps: [
      { id: "send-step", use_capability: "send_message" }
    ]
  }), "utf-8");
  return workflowPath;
}

function fakeLauncherForPage(page: FakePage): any {
  return {
    launch: async () => ({ profile: "test-profile", cdpEndpoint: "mock-cdp" }),
    connectOverCdp: async () => ({
      contexts: () => [{ pages: () => [page] }],
      close: async () => { page.events.push("browser:close"); }
    })
  };
}

test("workflow_execute returns structured approval_required before launching browser actions", async () => {
  const db = tempDb();
  const workflowPath = writeRiskyWorkflow(tempDir());
  let launched = false;
  const result = await callMcpTool("workflow_execute", { file: workflowPath, dryRun: false }, {
    database: db,
    launcher: {
      launch: async () => {
        launched = true;
        throw new Error("approval gate should return before browser launch");
      }
    } as any
  }) as any;

  assert.equal(launched, false);
  assert.equal(result.ok, false);
  assert.equal(result.status, "approval_required");
  assert.deepEqual(result.approvalGates, [{
    stepId: "send-step",
    action: "send_message",
    reason: "Target or content looks sensitive: button / send "
  }]);
  assert.equal(result.plan.actions.length, 1);
  assert.equal(result.plan.actions[0].requiresApproval, true);
});

test("workflow_execute accepts approvedStepIds and confirms gated action before execution", async () => {
  const db = tempDb();
  const workflowPath = writeRiskyWorkflow(tempDir());
  const page = new FakePage("https://example.test");
  const result = await callMcpTool("workflow_execute", { file: workflowPath, dryRun: false, approvedStepIds: ["send-step"] }, {
    database: db,
    launcher: fakeLauncherForPage(page)
  }) as any;

  assert.equal(result.ok, true);
  assert.equal(result.plan.actions[0].action.confirmed, true);
  assert.ok(page.events.includes("click:button:/send/i"));
});

test("MCP server serializes ConfirmationRequiredError as structured approval_required JSON", () => {
  const action = { type: "click" as const, selector: "#send" };
  const result = serializeMcpToolError(new ConfirmationRequiredError(action, "Target or content looks sensitive: #send"));

  assert.deepEqual(result, {
    ok: false,
    status: "approval_required",
    requiredFor: action,
    reason: "Target or content looks sensitive: #send"
  });
});

test("MCP schemas include managed browser and capability workflow tools", () => {
  const names = listMcpTools().map((tool) => tool.name);
  for (const expected of ["browser_launch", "browser_status", "capability_update", "capability_query", "capability_export", "workflow_compile", "workflow_run", "workflow_execute", "site_registry_import", "site_capture_map"]) {
    assert.ok(names.includes(expected), `${expected} missing`);
  }
  assert.equal(browserLaunchInput.safeParse({ profile: "gemini", url: "https://gemini.google.com/app" }).success, true);
  assert.equal(capabilityQueryInput.safeParse({ target: "gemini", text: "image" }).success, true);
});
