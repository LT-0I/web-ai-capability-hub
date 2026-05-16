const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
import { CapabilityDatabase } from "../src/capabilities/database";
import { assertNoForbidden, forbiddenOutputFieldList, stripForbidden } from "../src/mcp/forbiddenFields";
import { callMcpTool, toolSpecs } from "../src/mcp/tools";
import { listMcpResources, readMcpResource } from "../src/mcp/resources";
import { ConsumerErrorCodes } from "../src/consumer/errorCodes";

function readJson(file: string): any {
  return JSON.parse(fs.readFileSync(path.resolve(process.cwd(), file), "utf-8"));
}

function tempCapabilityDb(): CapabilityDatabase {
  const dir = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "wah-forbidden-db-"));
  return new CapabilityDatabase({ dbPath: path.join(dir, "capability.json"), preferSqlite: false });
}

function assertNoForbiddenKeys(value: unknown, forbiddenFields: string[]): void {
  const found: string[] = [];
  const visit = (node: any): void => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) { node.forEach(visit); return; }
    for (const [key, child] of Object.entries(node)) {
      if (forbiddenFields.includes(key)) found.push(key);
      visit(child);
    }
  };
  visit(value);
  assert.deepEqual([...new Set(found)], []);
}

function populatedDb(): CapabilityDatabase {
  const db = tempCapabilityDb();
  db.upsertServiceTarget({ target_id: "chatgpt", kind: "web-ai", base_url: "https://chatgpt.com", display_name: "ChatGPT", metadata: { html: "<secret>" } });
  db.insertBrowserProfile({
    profile_name: "p",
    browser_type: "chromium",
    profile_dir: "/tmp/profile-secret",
    cdp_endpoint: "http://127.0.0.1:9223",
    cdp_port: 9223,
    executable_path: "/bin/chrome",
    last_status: "running"
  });
  db.insertPageCapture({
    target_id: "chatgpt",
    url: "https://chatgpt.com/",
    title: "ChatGPT",
    profile: "p",
    metadata: { cdp_endpoint: "http://127.0.0.1:9223", safe: true }
  });
  db.upsertCapabilities([{ id: "cap-1", target_id: "chatgpt", category: "chat", name: "send", description: "send prompt", inputs: { prompt: "string" }, outputs: { cdp_port: 9223, ok: true }, status: "active", confidence: 1, evidence: { profile_dir: "/tmp/profile-secret" }, updated_at: new Date(0).toISOString() }]);
  db.addWorkflowDefinition({ id: "wf-1", target_id: "chatgpt", profile: "p", definition: { steps: [], executable_path: "/bin/chrome" }, created_at: new Date(0).toISOString(), updated_at: new Date(0).toISOString() });
  db.addWorkflowRun({ id: "run-1", workflow_id: "wf-1", target_id: "chatgpt", profile: "p", mode: "dry", status: "done", started_at: new Date(0).toISOString(), result: { cdp_endpoint: "http://127.0.0.1:9223" } });
  db.importSiteRegistry([{ site_id: "site-1", title: "Site", kind: "research-database", base_url: "https://example.test", raw: { profile_dir: "/tmp/profile-secret", ok: true }, imported_at: new Date(0).toISOString() }]);
  db.importIntegrationRegistry([{ feature_id: "feat-1", service: "chatgpt", name: "Feature", status: "IMPLEMENTED_GREEN", mcp_tool: "webai_chatgpt_send_prompt", raw: { cdp_port: 9223, ok: true }, imported_at: new Date(0).toISOString() }]);
  return db;
}

test("forbidden field set exactly matches the consumer contract", () => {
  const contractFields = readJson("configs/consumer-contract.json").forbidden_output_fields;
  assert.deepEqual([...forbiddenOutputFieldList].sort(), [...contractFields].sort());
  assert.deepEqual([...contractFields].sort(), [...forbiddenOutputFieldList].sort());
  assert.ok(forbiddenOutputFieldList.includes("cdp_endpoint"));
  assert.ok(forbiddenOutputFieldList.includes("cdp_port"));
});

test("stripForbidden and assertNoForbidden are recursive across nested objects and arrays", () => {
  const unsafe = {
    ok: true,
    nested: { profile_dir: "/tmp/profile", keep: "yes" },
    list: [{ cdp_endpoint: "http://127.0.0.1:9223", child: { cdp_port: 9223, keep: 1 } }]
  };
  assert.throws(() => assertNoForbidden(unsafe), (error: any) => {
    assert.equal(error.errorCode, ConsumerErrorCodes.SAFE_OUTPUT_REDACTION_REQUIRED);
    assert.deepEqual(error.evidence.fields.sort(), ["cdp_endpoint", "cdp_port", "profile_dir"].sort());
    return true;
  });
  const stripped = stripForbidden(unsafe);
  assert.deepEqual(stripped, { ok: true, nested: { keep: "yes" }, list: [{ child: { keep: 1 } }] });
  assertNoForbidden(stripped);
  assert.notEqual(stripped, unsafe);
});

test("readMcpResource strips forbidden fields for every listed URI", () => {
  const db = populatedDb();
  const forbiddenFields = readJson("configs/consumer-contract.json").forbidden_output_fields;
  for (const resource of listMcpResources()) {
    const uri = resource.uri.replace("{targetId}", "chatgpt");
    const result = readMcpResource(uri, db);
    assertNoForbiddenKeys(result, forbiddenFields);
  }
});

test("callMcpTool rejects forbidden fields at the boundary when a handler omits safeOutput", async (t: any) => {
  const name = "test_forbidden_boundary_backstop";
  toolSpecs.push({
    name,
    description: "test-only forbidden output backstop",
    schema: { parse: (value: any) => value || {}, toJsonSchema: () => ({ type: "object" }) } as any,
    handler: async () => ({ ok: true, nested: [{ cdp_endpoint: "http://127.0.0.1:9223" }] })
  });
  t.after(() => {
    const index = toolSpecs.findIndex((tool) => tool.name === name);
    if (index >= 0) toolSpecs.splice(index, 1);
  });

  await assert.rejects(() => callMcpTool(name, {}), (error: any) => {
    assert.equal(error.errorCode, ConsumerErrorCodes.SAFE_OUTPUT_REDACTION_REQUIRED);
    assert.deepEqual(error.evidence.fields, ["cdp_endpoint"]);
    return true;
  });
});
