const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
import { CapabilityDatabase } from "../src/capabilities/database";
import { runHealthCheck } from "../src/capabilities/healthCheck";
import { CapabilityRecord } from "../src/capabilities/schemas";

function tempDir(): string { return fs.mkdtempSync(path.join(os.tmpdir(), "wah-health-test-")); }
function tempDb(): CapabilityDatabase { return new CapabilityDatabase({ dbPath: path.join(tempDir(), "capability.sqlite"), preferSqlite: false }); }

function capability(overrides: Partial<CapabilityRecord> & { name: string }): CapabilityRecord {
  const { name, ...rest } = overrides;
  return {
    id: CapabilityDatabase.stableId("cap", `health:${name}`),
    target_id: "health-target",
    category: "chat",
    name,
    description: `Curated description for ${name}`,
    inputs: { text: "string" },
    outputs: { result: "string" },
    preconditions: ["User is on the target page"],
    selectors: ["#present"],
    status: "active",
    confidence: 0.9,
    evidence: { source: "manual" },
    updated_at: "2026-01-01T00:00:00.000Z",
    ...rest
  };
}

class HealthCheckFakeLocator {
  constructor(private page: HealthCheckFakePage, private selector: string) {}
  async count(): Promise<number> {
    this.page.countCalls.push(this.selector);
    const value = this.page.counts[this.selector];
    if (value instanceof Error) throw value;
    return value ?? 0;
  }
}

class HealthCheckFakePage {
  countCalls: string[] = [];
  constructor(
    public counts: Record<string, number | Error>,
    private snapshotText = "Main panel ready",
    private snapshotTitle = "Health Fixture"
  ) {}
  url(): string { return "https://example.test/app"; }
  async title(): Promise<string> { return this.snapshotTitle; }
  locator(selector: string): HealthCheckFakeLocator { return new HealthCheckFakeLocator(this, selector); }
  async evaluate(): Promise<any> {
    return {
      visibleText: this.snapshotText,
      elements: [],
      forms: [],
      tables: [],
      lists: [],
      iframes: []
    };
  }
}

test("health check reports selector results without applying database changes", async () => {
  const db = tempDb();
  db.upsertCapabilities([
    capability({ name: "ok_capability", selectors: ["#present"], status: "active" }),
    capability({ name: "missing_capability", selectors: ["#missing"], status: "unknown" }),
    capability({ name: "ambiguous_capability", selectors: ["#throws"], status: "active" }),
    capability({ name: "needs_review_capability", selectors: [], status: "active" }),
    capability({ name: "deprecated_capability", selectors: ["#present"], status: "deprecated" })
  ]);
  const page = new HealthCheckFakePage({ "#present": 1, "#missing": 0, "#throws": new Error("strict selector failed") });

  const report = await runHealthCheck({ targetId: "health-target", profile: "test-profile", db, page });

  assert.equal(report.target_id, "health-target");
  assert.equal(report.total, 4);
  assert.equal(report.ok, 1);
  assert.equal(report.missing, 1);
  assert.equal(report.ambiguous, 1);
  assert.equal(report.needs_review, 1);
  assert.equal(report.blocked, 0);
  assert.deepEqual(report.items.map((item) => [item.name, item.result]), [
    ["ok_capability", "ok"],
    ["missing_capability", "missing"],
    ["ambiguous_capability", "ambiguous"],
    ["needs_review_capability", "needs_review"]
  ]);
  assert.deepEqual(report.items.find((item) => item.name === "missing_capability")?.selectors_checked, ["#missing"]);

  const unchanged = db.getCapabilityByName("health-target", "missing_capability");
  assert.equal(unchanged?.status, "unknown");
  assert.equal(unchanged?.description, "Curated description for missing_capability");
});

test("health check apply updates only status, confidence, and updated_at for non-ok results", async () => {
  const db = tempDb();
  const original = capability({
    name: "missing_capability",
    selectors: ["#missing"],
    status: "active",
    confidence: 0.88,
    description: "Manually curated semantic description",
    inputs: { query: "string", limit: "number" },
    outputs: { rows: "array" },
    preconditions: ["Institutional access is active"],
    evidence: { curated: true, page: "main panel" }
  });
  const ok = capability({ name: "ok_capability", selectors: ["#present"], status: "active", updated_at: "2026-01-01T00:00:00.000Z" });
  db.upsertCapabilities([original, ok]);
  const page = new HealthCheckFakePage({ "#present": 1, "#missing": 0 });

  const report = await runHealthCheck({ targetId: "health-target", profile: "test-profile", db, page, apply: true });

  assert.equal(report.missing, 1);
  const updated = db.getCapabilityByName("health-target", "missing_capability");
  assert.equal(updated?.status, "missing");
  assert.ok((updated?.confidence || 1) < original.confidence);
  assert.notEqual(updated?.updated_at, original.updated_at);
  assert.equal(updated?.description, original.description);
  assert.deepEqual(updated?.inputs, original.inputs);
  assert.deepEqual(updated?.outputs, original.outputs);
  assert.deepEqual(updated?.preconditions, original.preconditions);
  assert.deepEqual(updated?.selectors, original.selectors);
  assert.deepEqual(updated?.evidence, original.evidence);

  const stillOk = db.getCapabilityByName("health-target", "ok_capability");
  assert.equal(stillOk?.status, "active");
  assert.equal(stillOk?.updated_at, ok.updated_at);
});

test("health check marks all active capabilities blocked when the fresh page is a login or error page", async () => {
  const db = tempDb();
  db.upsertCapabilities([capability({ name: "search", selectors: ["#search"] })]);
  const page = new HealthCheckFakePage({ "#search": 1 }, "Please sign in to continue", "Sign in required");

  const report = await runHealthCheck({ targetId: "health-target", profile: "test-profile", db, page });

  assert.equal(report.total, 1);
  assert.equal(report.blocked, 1);
  assert.equal(report.items[0].result, "blocked");
  assert.deepEqual(report.items[0].selectors_checked, []);
  assert.deepEqual(page.countCalls, []);
});
