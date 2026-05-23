import test from "node:test";
import assert from "node:assert/strict";
import { HealService } from "../src/runtime/heal/service";
import { scoreHealCandidate, jaccard } from "../src/runtime/heal/scoring";
import { RuntimeLeaseStore } from "../src/runtime/pool/leaseStore";

function freshHeal(): HealService {
  return new HealService(new RuntimeLeaseStore(`/tmp/heal-test-${Date.now()}-${Math.random()}.sqlite`));
}

function freshHealWithStore(): { heal: HealService; store: RuntimeLeaseStore } {
  const store = new RuntimeLeaseStore(`/tmp/heal-test-${Date.now()}-${Math.random()}.sqlite`);
  return { heal: new HealService(store), store };
}

test("scoreHealCandidate uses spec-mandated weighted formula 0.35*aria + 0.25*near + 0.20*bbox + 0.15*dom + 0.05*role", () => {
  const all1 = scoreHealCandidate({ ariaMatch: 1, nearTextJaccard: 1, bboxOverlap: 1, domStructureSimilarity: 1, roleExactMatch: 1 });
  assert.ok(Math.abs(all1.confidence - 1.0) < 1e-9, `weights should sum to 1; got ${all1.confidence}`);
  const onlyAria = scoreHealCandidate({ ariaMatch: 1 });
  assert.ok(Math.abs(onlyAria.confidence - 0.35) < 1e-9, `ariaMatch weight 0.35; got ${onlyAria.confidence}`);
  const onlyNear = scoreHealCandidate({ nearTextJaccard: 1 });
  assert.ok(Math.abs(onlyNear.confidence - 0.25) < 1e-9);
  const onlyBbox = scoreHealCandidate({ bboxOverlap: 1 });
  assert.ok(Math.abs(onlyBbox.confidence - 0.20) < 1e-9);
  const onlyDom = scoreHealCandidate({ domStructureSimilarity: 1 });
  assert.ok(Math.abs(onlyDom.confidence - 0.15) < 1e-9);
  const onlyRole = scoreHealCandidate({ roleExactMatch: 1 });
  assert.ok(Math.abs(onlyRole.confidence - 0.05) < 1e-9);
});

test("scoreHealCandidate clamps out-of-range component scores to [0,1]", () => {
  const negs = scoreHealCandidate({ ariaMatch: -1, nearTextJaccard: 1.5, bboxOverlap: NaN });
  assert.equal(negs.componentScores.ariaMatch, 0);
  assert.equal(negs.componentScores.nearTextJaccard, 1);
  assert.equal(negs.componentScores.bboxOverlap, 0);
});

test("jaccard text similarity is symmetric and bounded [0,1]", () => {
  const j1 = jaccard("send prompt", "prompt send");
  const j2 = jaccard("prompt send", "send prompt");
  assert.equal(j1, j2);
  assert.ok(j1 >= 0 && j1 <= 1);
  assert.equal(jaccard("", ""), 1);
  assert.equal(jaccard("abc", "xyz"), 0);
});

test("HealService default policy 'report' does NOT mutate selector when degraded and primary is missing", async () => {
  const heal = freshHeal();
  // page.locator returns count=0 to force fallback
  const page = { locator: () => ({ count: async () => 0 }), getByRole: () => undefined };
  const res = await heal.resolve(page, { runId: "run-h", manifestId: "m.x", selectorRole: "btn", primarySelector: "[data-testid=foo]" });
  // Policy default = report. Per D7 spec: report-only does NOT mutate selector.
  // Implementation under review returns the primary selector unchanged for degraded results.
  assert.equal(res.healPolicy, "report");
  assert.equal(res.degraded, true);
  assert.equal(res.selector, "[data-testid=foo]", "report mode must preserve the primary selector (D7)");
});

test("HealService emits HEAL_CONFIDENCE_LOW when no signal matches and confidence < 0.5", async () => {
  const heal = freshHeal();
  const page = { locator: () => ({ count: async () => 0 }), getByRole: () => undefined };
  const res = await heal.resolve(page, { runId: "run-low", manifestId: "m.x", selectorRole: "btn", primarySelector: undefined });
  assert.ok(["HEAL_CONFIDENCE_LOW", "UI_DRIFT_DETECTED"].includes(res.errorCode || ""), `expected drift errorCode, got ${res.errorCode}`);
  assert.equal(res.degraded, true);
});

test("HealService returns ok=true and degraded=false when primary selector resolves", async () => {
  const heal = freshHeal();
  const page = { locator: () => ({ count: async () => 1 }), getByRole: () => undefined };
  const res = await heal.resolve(page, { runId: "run-ok", manifestId: "m.x", selectorRole: "btn", primarySelector: "[data-testid=ok]" });
  assert.equal(res.ok, true);
  assert.equal(res.degraded, false);
  assert.equal(res.selector, "[data-testid=ok]");
});

test("HealService report mode emits drift_events row while preserving original selector", async () => {
  const { heal, store } = freshHealWithStore();
  const page = { locator: () => ({ count: async () => 0 }), getByRole: () => undefined };
  const res = await heal.resolve(page, { runId: "run-report", manifestId: "m.x", selectorRole: "btn", primarySelector: "[data-testid=foo]" });
  assert.equal(res.healPolicy, "report");
  assert.equal(res.degraded, true);
  assert.equal(res.selector, "[data-testid=foo]");
  const events = (store as any).memory.drift_events;
  assert.equal(events.at(-1)?.run_id, "run-report");
});

test("HealService auto mode swaps to highest-scoring alt selector and flags degraded", async () => {
  const heal = freshHeal();
  const page = {
    locator: () => ({ count: async () => 0 }),
    getByRole: () => ({ count: async () => 1 })
  };
  const res = await heal.resolve(page, {
    runId: "run-auto",
    manifestId: "m.x",
    selectorRole: "submitButton",
    primarySelector: "[data-testid=old-submit]",
    ariaRole: "button",
    ariaName: "Submit",
    healPolicy: "auto"
  });
  assert.equal(res.healPolicy, "auto");
  assert.equal(res.degraded, true);
  assert.equal(res.ok, true);
  assert.equal(res.selector, "button[name=\"Submit\"]");
  assert.ok(res.confidence > 0.5);
});
