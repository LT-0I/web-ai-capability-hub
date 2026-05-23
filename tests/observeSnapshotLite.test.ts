import test from "node:test";
import assert from "node:assert/strict";
import { captureLiteSnapshot, liteSnapshotFromRoleTree } from "../src/observe/snapshot/lite";

test("liteSnapshotFromRoleTree produces a snapshot ≤ 4 KB serialized (token-budget contract)", () => {
  // Build a fairly large role tree to stress the trimmer
  const big: any = { role: "main", children: [] };
  for (let i = 0; i < 200; i++) {
    big.children.push({ role: "row", name: `row-${i}-${"x".repeat(50)}`, children: [] });
  }
  const snap = liteSnapshotFromRoleTree("https://example.com", "Example", big);
  const serialized = JSON.stringify(snap);
  assert.ok(Buffer.byteLength(serialized, "utf8") <= 4096,
    `serialized lite snapshot must be ≤ 4096 bytes, got ${Buffer.byteLength(serialized, "utf8")}`);
});

test("liteSnapshotFromRoleTree computes a stable state_hash across re-snapshots when DOM unchanged", () => {
  const tree = { role: "main", children: [{ role: "btn", name: "Submit" }] };
  const a = liteSnapshotFromRoleTree("https://example.com", "T", tree);
  const b = liteSnapshotFromRoleTree("https://example.com", "T", tree);
  assert.equal(a.state_hash, b.state_hash, "stable hash for stable inputs");
  // Different inputs → different hash
  const c = liteSnapshotFromRoleTree("https://example.com", "T2", tree);
  assert.notEqual(a.state_hash, c.state_hash);
});

test("liteSnapshotFromRoleTree handles a null role_tree gracefully", () => {
  const s = liteSnapshotFromRoleTree("https://example.com", "T", null);
  assert.equal(s.role_tree, null);
  assert.ok(s.state_hash.length > 0);
});

test("captureLiteSnapshot handles a page object with no accessibility API", async () => {
  const page = { url: () => "https://example.com", title: async () => "Test", accessibility: undefined };
  const snap = await captureLiteSnapshot(page);
  assert.equal(snap.url, "https://example.com");
  assert.equal(snap.title, "Test");
  assert.equal(snap.role_tree, null);
});

test("captureLiteSnapshot reduces deep nested AX trees to ≤ 6 levels", async () => {
  function nestedAx(depth: number): any {
    if (depth === 0) return { role: "leaf", name: "leaf" };
    return { role: `lvl${depth}`, children: [nestedAx(depth - 1)] };
  }
  const page = {
    url: () => "x",
    title: async () => "y",
    accessibility: { snapshot: async () => nestedAx(20) }
  };
  const snap = await captureLiteSnapshot(page);
  // Walk depth and assert ≤ 7 (root + 6 nested per reduceAxNode limit)
  function depth(node: any): number {
    if (!node || !node.children || !node.children.length) return 1;
    return 1 + Math.max(...node.children.map(depth));
  }
  assert.ok(depth(snap.role_tree) <= 7, `tree depth must be ≤ 7 (root+6), got ${depth(snap.role_tree)}`);
});
