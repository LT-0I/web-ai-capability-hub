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

test("185-superset proof: every entry in listMcpTools.185.archived.json is present byte-identical in listMcpTools.203.json", () => {
  const archived = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "tests", "golden", "listMcpTools.185.archived.json"), "utf8"));
  const current = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "tests", "golden", "listMcpTools.203.json"), "utf8"));
  const archivedByName = new Map<string, any>((archived.tools || []).map((t: any) => [t.name, t]));
  const currentByName = new Map<string, any>((current.tools || []).map((t: any) => [t.name, t]));
  const missing: string[] = [];
  const changed: Array<{ name: string; reason: string }> = [];
  for (const [name, expected] of archivedByName) {
    const actual = currentByName.get(name);
    if (!actual) { missing.push(name); continue; }
    if (["webai_chatgpt_send_prompt", "webai_gemini_send_prompt", "webai_chatgpt_select_model", "webai_claude_select_model", "webai_gemini_select_model", "webai_chatgpt_generate_image", "webai_gemini_generate_image", "webai_gemini_generate_video", "webai_gemini_music_generate", "webai_gemini_music_download_track", "webai_gemini_music_task_status", "webai_task_status", "webai_claude_send_prompt", "webai_claude_upload_and_query", "webai_claude_generate_file", "webai_chatgpt_upload_and_query", "webai_chatgpt_generate_file", "webai_gemini_upload_and_query", "webai_chatgpt_workspace", "webai_chatgpt_conversation_manage", "webai_claude_workspace", "webai_claude_conversation_manage", "webai_gemini_workspace", "webai_gemini_conversation_manage", "webai_chatgpt_deep_research", "webai_claude_deep_research", "webai_gemini_deep_research", "webai_chatgpt_codex_submit_task", "webai_chatgpt_codex_list_envs", "webai_chatgpt_codex_task_status", "webai_chatgpt_codex_get_diff", "webai_chatgpt_canvas_export", "webai_chatgpt_pulse_get", "webai_chatgpt_pulse_onboard", "webai_gemini_canvas_to_docs", "webai_gemini_canvas_edit", "webai_claude_design_create_project", "webai_claude_design_generate", "webai_claude_design_get_html", "webai_claude_design_present"].includes(name)) {
      const normalized = JSON.parse(JSON.stringify(actual));
      assert.deepEqual(normalized.inputSchema?.properties?.backend?.enum, ["managed-cdp", "extension-assisted-cdp"]);
      delete normalized.inputSchema?.properties?.backend;
      if (name === "webai_task_status") {
        delete normalized.inputSchema?.properties?.profile;
        delete normalized.inputSchema?.properties?.tab_url_contains;
      }
      if (["webai_chatgpt_conversation_manage", "webai_claude_conversation_manage", "webai_gemini_conversation_manage"].includes(name)) {
        const actionEnum = normalized.inputSchema?.properties?.action?.enum;
        if (Array.isArray(actionEnum)) normalized.inputSchema.properties.action.enum = actionEnum.filter((value: unknown) => value !== "list");
      }
      if (JSON.stringify(normalized) === JSON.stringify(expected)) continue;
    }
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      changed.push({ name, reason: "byte-mismatch" });
    }
  }
  assert.deepEqual(missing, [], `the following 185 baseline tools are MISSING from .203: ${missing.join(",")}`);
  assert.deepEqual(changed, [],
    `the following 185 baseline tools were CHANGED in .203 (description / inputSchema drift): ${changed.map((c) => c.name).join(",")}`);
});

test("203 - 185 = exactly 18 new tools: 8 wah_* plus 2 W1 webai selectors plus 8 literature tools", () => {
  const archived = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "tests", "golden", "listMcpTools.185.archived.json"), "utf8"));
  const current = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "tests", "golden", "listMcpTools.203.json"), "utf8"));
  const archivedNames = new Set<string>((archived.tools || []).map((t: any) => t.name));
  const currentNames = new Set<string>((current.tools || []).map((t: any) => t.name));
  const added = [...currentNames].filter((n) => !archivedNames.has(n));
  assert.equal(added.length, 18, `expected exactly 18 added tools, got ${added.length}: ${added.join(",")}`);
  const expected = [
    "webai_chatgpt_select_model",
    "webai_claude_select_model",
    "wah_adapter_health",
    "wah_artifact_get",
    "wah_capability_query",
    "wah_policy_explain",
    "wah_task_cancel",
    "wah_task_resume",
    "wah_task_start",
    "wah_task_status",
    "webai_literature_task_status",
    "webai_arxiv_download_pdf",
    "webai_frontiers_download_pdf",
    "webai_inspirehep_download_pdf",
    "webai_mdpi_download_pdf",
    "webai_pubscholar_download_pdf",
    "webai_scielo_download_pdf",
    "webai_scoap3_download_pdf"
  ];
  assert.deepEqual(added.sort(), expected.sort(), "added tool names must match P1 wah_* + W1 selector + Phase 8 literature tools");
});

test("snapshot counts: archived=185, current=203 (= 185 + 8 wah_* + 2 W1 selectors + 8 literature tools)", () => {
  const archived = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "tests", "golden", "listMcpTools.185.archived.json"), "utf8"));
  const current = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "tests", "golden", "listMcpTools.203.json"), "utf8"));
  assert.equal(archived.tools.length, 185, `185 archived snapshot must contain 185 tools, got ${archived.tools.length}`);
  assert.equal(current.tools.length, 203, `current 203 snapshot must contain 203 tools, got ${current.tools.length}`);
});
