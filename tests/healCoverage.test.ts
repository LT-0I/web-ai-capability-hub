import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import { runLegacyAlias } from "../src/facade/legacy/aliases";
import { RuntimeLeaseStore } from "../src/runtime/pool/leaseStore";
import { HealService } from "../src/runtime/heal/service";
import { CapabilityDatabase } from "../src/capabilities/database";
import { CancelRegistry } from "../src/runtime/cancel/registry";

function missPage(): any {
  const locator = () => {
    const loc: any = { first: () => loc, count: async () => 0, click: async () => undefined, fill: async () => undefined, innerText: async () => "" };
    return loc;
  };
  return { locator, getByRole: () => ({ count: async () => 1 }), title: async () => "", url: () => "https://example.test", keyboard: { press: async () => undefined } };
}

test("heal report-mode candidates cover at least 60% of selector misses across six legacy samples", async () => {
  const dbPath = path.join(process.cwd(), "data", "drift_events.sqlite");
  const store = new RuntimeLeaseStore(dbPath);
  const before = store.listDriftEvents().length;
  const runtime = {
    database: new CapabilityDatabase({ dbPath: `/tmp/heal-coverage-${Date.now()}.json`, preferSqlite: false }),
    leaseStore: store,
    cancelRegistry: new CancelRegistry(store),
    healService: new HealService(store),
    page: missPage()
  };
  const samples = [
    ["webai_chatgpt_send_prompt", { prompt: "hello" }],
    ["webai_claude_send_prompt", { prompt: "hello" }],
    ["webai_gemini_send_prompt", { prompt: "hello" }],
    ["research_acm_search", { query: "browser agents" }],
    ["research_ieee_filter", { query: "browser agents" }],
    ["research_wiley_export", { query: "browser agents", confirmed: true }]
  ] as const;
  let misses = 0;
  for (const [tool, args] of samples) {
    const result = await runLegacyAlias(tool, args, runtime as any);
    assert.equal(result.status, "completed");
    misses += result.runEvents.filter((event) => event.kind === "selector.resolve" && event.status === "failed").length;
  }
  const driftEvents = store.listDriftEvents().slice(before);
  assert.ok(misses > 0, "sample run should encounter selector misses");
  assert.ok(driftEvents.length >= Math.ceil(misses * 0.6), `expected >=60% coverage; misses=${misses}, drift_events=${driftEvents.length}`);
  assert.equal(fs.existsSync(dbPath), true, "data/drift_events.sqlite should be visible after report-mode heal events");
});
