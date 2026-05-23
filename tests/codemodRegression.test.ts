import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const SRC_DIR = path.join(REPO_ROOT, "src");

function walk(dir: string, files: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (entry.name.endsWith(".ts")) files.push(full);
  }
  return files;
}

test("codemod gate: grep 'new ManagedBrowserLauncher' returns ZERO matches outside src/runtime/pool/profilePool.ts", () => {
  const files = walk(SRC_DIR);
  const offenders: string[] = [];
  for (const f of files) {
    const rel = path.relative(REPO_ROOT, f);
    if (rel === path.join("src", "runtime", "pool", "profilePool.ts")) continue;
    const content = fs.readFileSync(f, "utf8");
    if (/new\s+ManagedBrowserLauncher\s*\(/.test(content)) offenders.push(rel);
  }
  assert.deepEqual(offenders, [],
    `codemod left direct 'new ManagedBrowserLauncher()' calls outside profilePool.ts:\n${offenders.join("\n")}`);
});

test("185-superset proof: every entry in listMcpTools.185.archived.json is present byte-identical in listMcpTools.193.json", () => {
  const archived = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "tests", "golden", "listMcpTools.185.archived.json"), "utf8"));
  const current = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "tests", "golden", "listMcpTools.193.json"), "utf8"));
  const archivedByName = new Map<string, any>((archived.tools || []).map((t: any) => [t.name, t]));
  const currentByName = new Map<string, any>((current.tools || []).map((t: any) => [t.name, t]));
  const missing: string[] = [];
  const changed: Array<{ name: string; reason: string }> = [];
  for (const [name, expected] of archivedByName) {
    const actual = currentByName.get(name);
    if (!actual) { missing.push(name); continue; }
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      changed.push({ name, reason: "byte-mismatch" });
    }
  }
  assert.deepEqual(missing, [], `the following 185 baseline tools are MISSING from .193: ${missing.join(",")}`);
  assert.deepEqual(changed, [],
    `the following 185 baseline tools were CHANGED in .193 (description / inputSchema drift): ${changed.map((c) => c.name).join(",")}`);
});

test("193 - 185 = exactly 8 new tools, all of which start with wah_", () => {
  const archived = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "tests", "golden", "listMcpTools.185.archived.json"), "utf8"));
  const current = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "tests", "golden", "listMcpTools.193.json"), "utf8"));
  const archivedNames = new Set<string>((archived.tools || []).map((t: any) => t.name));
  const currentNames = new Set<string>((current.tools || []).map((t: any) => t.name));
  const added = [...currentNames].filter((n) => !archivedNames.has(n));
  assert.equal(added.length, 8, `expected exactly 8 added tools, got ${added.length}: ${added.join(",")}`);
  for (const name of added) {
    assert.ok(name.startsWith("wah_"), `added tool ${name} must start with wah_`);
  }
  const expected = [
    "wah_adapter_health",
    "wah_artifact_get",
    "wah_capability_query",
    "wah_policy_explain",
    "wah_task_cancel",
    "wah_task_resume",
    "wah_task_start",
    "wah_task_status"
  ];
  assert.deepEqual(added.sort(), expected, "added wah_* names must match spec §7 ledger");
});

test("snapshot counts: archived=185, current=193 (= 185 + 8 wah_*)", () => {
  const archived = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "tests", "golden", "listMcpTools.185.archived.json"), "utf8"));
  const current = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "tests", "golden", "listMcpTools.193.json"), "utf8"));
  assert.equal(archived.tools.length, 185, `185 archived snapshot must contain 185 tools, got ${archived.tools.length}`);
  assert.equal(current.tools.length, 193, `current 193 snapshot must contain 193 tools, got ${current.tools.length}`);
});
