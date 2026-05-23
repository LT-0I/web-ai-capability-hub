import test from "node:test";
import assert from "node:assert/strict";
import { HealService } from "../../src/runtime/heal/service";
import { RuntimeLeaseStore } from "../../src/runtime/pool/leaseStore";

function tempPath(label: string): string { return `/tmp/${label}-${Date.now()}-${Math.random()}.sqlite`; }

function missPage(): any {
  const loc: any = { first: () => loc, count: async () => 0, click: async () => undefined, fill: async () => undefined, innerText: async () => "" };
  return {
    locator: () => loc,
    getByRole: () => ({ count: async () => 0 })
  };
}

function hitPage(): any {
  const loc: any = { first: () => loc, count: async () => 1, click: async () => undefined, fill: async () => undefined, innerText: async () => "" };
  return {
    locator: () => loc,
    getByRole: () => ({ count: async () => 1 })
  };
}

test("p2 heal D7: report mode NEVER mutates selector even when primary misses and an aria-fallback is found", async () => {
  // page where primary misses (count=0) but aria fallback hits (count=1)
  const store = new RuntimeLeaseStore(tempPath("p2-heal-d7"));
  const heal = new HealService(store);
  const aria: any = { count: async () => 1, first: () => undefined };
  const page = { locator: () => ({ first: () => ({ count: async () => 0 }), count: async () => 0 }), getByRole: () => aria };
  const result = await heal.resolve(page, {
    runId: "r1", manifestId: "m1", selectorRole: "primary",
    primarySelector: "[data-original='primary']",
    ariaRole: "button", ariaName: "Send",
    nearText: "Send prompt", domFingerprint: "fp1",
    healPolicy: "report"
  });
  assert.equal(result.degraded, true, "report-mode fallback must be marked degraded");
  assert.equal(result.healPolicy, "report");
  assert.equal(result.selector, "[data-original='primary']", "report mode MUST preserve original selector (D7 invariant)");
});

test("p2 heal D7: report-mode drift_events row records all 5 component scores after miss", async () => {
  const store = new RuntimeLeaseStore(tempPath("p2-heal-scores"));
  const heal = new HealService(store);
  await heal.resolve(missPage(), {
    runId: "r-scores", manifestId: "m-scores", selectorRole: "primary",
    primarySelector: "[data-x]",
    ariaRole: "button", ariaName: "X",
    nearText: "X click", domFingerprint: "fp",
    healPolicy: "report"
  });
  const drift = store.listDriftEvents().filter((row: any) => row.run_id === "r-scores");
  assert.ok(drift.length >= 1, "drift_events must accumulate on miss");
  const scores = JSON.parse(drift[0].component_scores_json);
  for (const key of ["ariaMatch", "nearTextJaccard", "bboxOverlap", "domStructureSimilarity", "roleExactMatch"]) {
    assert.ok(key in scores, `component_scores must include ${key}`);
    assert.equal(typeof scores[key], "number", `${key} must be numeric`);
  }
});

test("p2 heal D7: UI_DRIFT_DETECTED returned when best candidate scores above confidence threshold (≥0.5)", async () => {
  const store = new RuntimeLeaseStore(tempPath("p2-heal-uidrift"));
  const heal = new HealService(store);
  // hit page: primary missed, aria role+name matches → enters report-mode result path with high score
  const aria: any = { count: async () => 1 };
  const page = { locator: () => ({ first: () => ({ count: async () => 0 }), count: async () => 0 }), getByRole: () => aria };
  const result = await heal.resolve(page, {
    runId: "r-ui", manifestId: "m-ui", selectorRole: "primary",
    primarySelector: "[data-x]",
    ariaRole: "button", ariaName: "Send",
    nearText: "Send", healPolicy: "report"
  });
  assert.equal(result.degraded, true);
  assert.ok(result.confidence >= 0.5, `aria-hit confidence should be >=0.5, got ${result.confidence}`);
  assert.equal(result.errorCode, "UI_DRIFT_DETECTED", "high-confidence fallback should be UI_DRIFT_DETECTED");
});

test("p2 heal D7: HEAL_CONFIDENCE_LOW returned when no candidate hits and Jaccard score < 0.5", async () => {
  const store = new RuntimeLeaseStore(tempPath("p2-heal-low"));
  const heal = new HealService(store);
  const result = await heal.resolve(missPage(), {
    runId: "r-low", manifestId: "m-low", selectorRole: "primary",
    primarySelector: "[data-orig]",
    ariaRole: "button", ariaName: "completely_unrelated",
    nearText: "unrelated", healPolicy: "report"
  });
  assert.equal(result.degraded, true);
  assert.ok(result.confidence < 0.5, `unrelated heal should be <0.5, got ${result.confidence}`);
  assert.equal(result.errorCode, "HEAL_CONFIDENCE_LOW");
  assert.equal(result.selector, "[data-orig]", "must still preserve primary selector on low-confidence miss");
});

test("p2 heal: primary selector HIT does NOT emit drift_events row and is not degraded", async () => {
  const store = new RuntimeLeaseStore(tempPath("p2-heal-hit"));
  const heal = new HealService(store);
  const result = await heal.resolve(hitPage(), {
    runId: "r-hit", manifestId: "m-hit", selectorRole: "primary",
    primarySelector: "[data-x]", healPolicy: "report"
  });
  assert.equal(result.degraded, false);
  assert.equal(result.ok, true);
  const drift = store.listDriftEvents().filter((row: any) => row.run_id === "r-hit");
  assert.equal(drift.length, 0, "primary hit must NOT produce drift_events");
});
