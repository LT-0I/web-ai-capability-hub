import test from "node:test";
import assert from "node:assert/strict";
import { runLegacyAlias } from "../src/facade/legacy/aliases";
import { RuntimeLeaseStore } from "../src/runtime/pool/leaseStore";
import { HealService } from "../src/runtime/heal/service";
import { CapabilityDatabase } from "../src/capabilities/database";
import { CancelRegistry } from "../src/runtime/cancel/registry";

function tempPath(label: string): string { return `/tmp/${label}-${Date.now()}-${Math.random()}.sqlite`; }

function missPage(): any {
  const locator = (_selector: string) => {
    const loc: any = {
      first: () => loc,
      count: async () => 0,
      click: async () => undefined,
      fill: async () => undefined,
      innerText: async () => ""
    };
    return loc;
  };
  return {
    locator,
    getByRole: () => ({ count: async () => 1 }),
    title: async () => "P2 fixture",
    url: () => "https://example.test/p2",
    keyboard: { press: async () => undefined }
  };
}

function runtime() {
  const store = new RuntimeLeaseStore(tempPath("legacy-ee-store"));
  const db = new CapabilityDatabase({ dbPath: tempPath("legacy-ee-db"), preferSqlite: false });
  return { database: db, leaseStore: store, cancelRegistry: new CancelRegistry(store), healService: new HealService(store), page: missPage() };
}

const samples = [
  { tool: "webai_chatgpt_send_prompt", args: { profile: "", prompt: "hello" } },
  { tool: "webai_claude_send_prompt", args: { profile: "", prompt: "hello" } },
  { tool: "webai_gemini_send_prompt", args: { profile: "", prompt: "hello" } },
  { tool: "research_acm_search", args: { query: "browser agents" } },
  { tool: "research_ieee_filter", args: { query: "browser agents" } },
  { tool: "research_wiley_export", args: { query: "browser agents", confirmed: true } }
];

for (const sample of samples) {
  test(`legacy MCP body ${sample.tool} runs full ExecutionEngine state machine`, async () => {
    const result = await runLegacyAlias(sample.tool, sample.args, runtime() as any);
    assert.equal(result.ok, true);
    assert.equal(result.status, "completed");
    assert.deepEqual(result.events.map((event) => event.state), [
      "Created",
      "PolicyCheck",
      "Planning",
      "Observing",
      "Executing",
      "Extracting",
      "PersistingEvidence",
      "Completed"
    ]);
    const kinds = result.runEvents.map((event) => event.kind);
    assert.ok(kinds.includes("action.observe"), `${sample.tool} missing action.observe`);
    assert.ok(kinds.includes("action.type") || kinds.includes("action.click"), `${sample.tool} missing action.type/action.click`);
    assert.ok(kinds.includes("persist.evidence"), `${sample.tool} missing persist.evidence`);
  });
}
