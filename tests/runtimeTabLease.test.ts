import test from "node:test";
import assert from "node:assert/strict";
import { acquireTab } from "../src/runtime/pool/tabLease";
import { RuntimeLeaseStore } from "../src/runtime/pool/leaseStore";

function freshStore(): RuntimeLeaseStore {
  return new RuntimeLeaseStore(`/tmp/tl-test-${Date.now()}-${Math.random()}.sqlite`);
}

test("acquireTab REJECTS missing urlMatch with INVALID_ARGS (CLAUDE.md §2.3 ban on pages()[0])", async () => {
  const store = freshStore();
  await assert.rejects(
    () => acquireTab({ profileId: "chatgpt", profileLeaseId: "p_1", cdpEndpoint: "http://127.0.0.1:9223", urlMatch: "" }, store),
    (err: any) => err.errorCode === "INVALID_ARGS" && /urlMatch/.test(err.message)
  );
});

test("acquireTab REJECTS whitespace-only urlMatch with INVALID_ARGS", async () => {
  const store = freshStore();
  await assert.rejects(
    () => acquireTab({ profileId: "chatgpt", profileLeaseId: "p_1", cdpEndpoint: "http://127.0.0.1:9223", urlMatch: "   " }, store),
    (err: any) => err.errorCode === "INVALID_ARGS"
  );
});

test("acquireTab REJECTS undefined urlMatch with INVALID_ARGS", async () => {
  const store = freshStore();
  await assert.rejects(
    () => acquireTab({ profileId: "chatgpt", profileLeaseId: "p_1", cdpEndpoint: "http://127.0.0.1:9223" } as any, store),
    (err: any) => err.errorCode === "INVALID_ARGS"
  );
});

test("acquireTab default TTL is 300s when omitted (5-min per spec)", async () => {
  // We can verify TTL is applied at the store layer without needing a CDP connection.
  const store = freshStore();
  const row = store.acquireTabLease("profile-lease-id", "https://chatgpt.com", undefined);
  assert.equal(row.ttl_seconds, 300, "default TTL should be 300s per spec M3 tab_lease");
});

test("acquireTab honors caller-supplied TTL", async () => {
  const store = freshStore();
  const row = store.acquireTabLease("profile-lease-id", "https://chatgpt.com", 42);
  assert.equal(row.ttl_seconds, 42);
});
