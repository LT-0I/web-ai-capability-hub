#!/usr/bin/env node
/*
Path C Claude Wave B3 live A/B sweep.

Protocol:
- Runs only against the existing claude-9224 CDP profile (port 9224).
- Enforces 30s minimum pacing between live driver calls by default.
- DOM side uses explicit env-var emergency overrides; RPC side clears those env vars so production default is exercised.
- Read-only/no-op cases compare canonical fields (summary/results_count/errorCode).
- select_model is a reversible settings toggle; after each DOM/RPC driver call the script reads /api/account/settings via same-origin CDP fetch and checks that the expected model id or paprika_mode value is visible in the returned settings blob.
- action_share is intentionally non-destructive: it is run without confirmed:true, so both DOM and RPC must return SENSITIVE_CONTENT_GUARD and no public share endpoint is called.
- action_sidebar_options is a known safe handoff path; both DOM and RPC must return HUMAN_HANDOFF_REQUIRED.
*/

import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const fs = require("node:fs");
const path = require("node:path");
const { performance } = require("node:perf_hooks");
const { chromium } = require("playwright");

const repoRoot = process.cwd();
const outDir = path.join(repoRoot, ".runs/path-c-claude-rpc/wave-b3-workspace-model-conversation");
const resultsPath = path.join(outDir, "ab-sweep-results.json");
const delayMs = Number(process.env.WEBAI_AB_SWEEP_DELAY_MS || 30000);
const profile = "claude-9224";
const cdpEndpoint = "http://127.0.0.1:9224";

const tools = require(path.join(repoRoot, "dist/src/mcp/tools.js"));

function existingCdpRuntime() {
  const status = {
    profile,
    profileDir: `/tmp/${profile}`,
    cdpEndpoint,
    cdpPort: 9224,
    connected: true,
    launchedByPackage: false,
    pages: []
  };
  return {
    launcher: {
      launch: async () => status,
      status: async () => status,
      connectOverCdp: async () => chromium.connectOverCDP(cdpEndpoint)
    }
  };
}

const runtime = existingCdpRuntime();

const ENV_BY_FAMILY = {
  workspace: "WEBAI_CLAUDE_WORKSPACE_BACKEND",
  select_model: "WEBAI_CLAUDE_SELECT_MODEL_BACKEND",
  conversation_manage: "WEBAI_CLAUDE_CONVERSATION_MANAGE_BACKEND"
};

const CASES = [
  { family: "workspace", variant: "surface_projects", fn: "webAiClaudeWorkspace", args: { profile, surface: "projects" }, domBackend: "managed-cdp", field: "summary" },
  { family: "workspace", variant: "surface_integrations", fn: "webAiClaudeWorkspace", args: { profile, surface: "integrations" }, domBackend: "managed-cdp", field: "summary" },
  { family: "workspace", variant: "surface_skills", fn: "webAiClaudeWorkspace", args: { profile, surface: "skills" }, domBackend: "managed-cdp", field: "summary" },
  { family: "workspace", variant: "surface_appearance", fn: "webAiClaudeWorkspace", args: { profile, surface: "appearance" }, domBackend: "managed-cdp", field: "summary" },
  { family: "workspace", variant: "surface_style_presets", fn: "webAiClaudeWorkspace", args: { profile, surface: "style_presets" }, domBackend: "managed-cdp", field: "summary" },
  { family: "select_model", variant: "haiku", fn: "webAiClaudeSelectModel", args: { profile, model: "Haiku 4.5" }, domBackend: "managed-cdp", noOutput: true, expectSetting: { default_model: "claude-haiku-4-5-20251001" } },
  { family: "select_model", variant: "sonnet", fn: "webAiClaudeSelectModel", args: { profile, model: "Sonnet 4.6" }, domBackend: "managed-cdp", noOutput: true, expectSetting: { default_model: "claude-sonnet-4-6" } },
  { family: "select_model", variant: "adaptive_on", fn: "webAiClaudeSelectModel", args: { profile, thinking_level: "extended" }, domBackend: "managed-cdp", noOutput: true, expectSetting: { paprika_mode: "extended" } },
  { family: "conversation_manage", variant: "action_list", fn: "webAiClaudeConversationManage", args: { profile, action: "list" }, domBackend: "extension-assisted-cdp", field: "results_count" },
  { family: "conversation_manage", variant: "action_search", fn: "webAiClaudeConversationManage", args: { profile, action: "search", query: "definitely-no-such-wave-b3-token" }, domBackend: "managed-cdp", field: "results_count" },
  { family: "conversation_manage", variant: "action_share", fn: "webAiClaudeConversationManage", args: { profile, action: "share" }, domBackend: "managed-cdp", noOutput: true, expectErrorCode: "SENSITIVE_CONTENT_GUARD", skipReason: "safe guard path; confirmed:true would open share controls and is not used in A/B" },
  { family: "conversation_manage", variant: "action_sidebar_options", fn: "webAiClaudeConversationManage", args: { profile, action: "sidebar_options" }, domBackend: "managed-cdp", noOutput: true, expectErrorCode: "HUMAN_HANDOFF_REQUIRED" }
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let lastLiveCallAt = 0;
async function pace(label) {
  const elapsed = Date.now() - lastLiveCallAt;
  const wait = lastLiveCallAt ? Math.max(0, delayMs - elapsed) : 0;
  if (wait > 0) {
    console.error(`[ab-sweep] pacing ${Math.ceil(wait / 1000)}s before ${label}`);
    await sleep(wait);
  }
}

function setBackend(family, backend) {
  for (const envName of Object.values(ENV_BY_FAMILY)) delete process.env[envName];
  if (backend) process.env[ENV_BY_FAMILY[family]] = backend;
}

async function callDriver(testCase, backendKind) {
  const label = `${testCase.family}/${testCase.variant}/${backendKind}`;
  await pace(label);
  setBackend(testCase.family, backendKind === "dom" ? testCase.domBackend : "");
  const started = performance.now();
  let output;
  let error;
  try {
    output = await tools[testCase.fn]({ ...testCase.args }, runtime);
  } catch (err) {
    error = { message: err?.message || String(err), stack: err?.stack };
  } finally {
    lastLiveCallAt = Date.now();
    setBackend(testCase.family, "");
  }
  const latency_ms = Math.round(performance.now() - started);
  const status = output?.errorCode || output?.error_code || (error ? "THREW" : null);
  if (status === "PLAN_OR_QUOTA_REQUIRED" || /429|rate.?limit|lockout/i.test(JSON.stringify(output || error || {}))) {
    throw Object.assign(new Error("BLOCKED_ACCOUNT_RISK"), { blockedAccountRisk: true, output, error });
  }
  return { latency_ms, output: redactOutput(output), error };
}

function redactOutput(value) {
  if (!value || typeof value !== "object") return value;
  const clone = JSON.parse(JSON.stringify(value));
  for (const key of ["response_text", "message", "summary"]) {
    if (typeof clone[key] === "string" && clone[key].length > 500) clone[key] = `${clone[key].slice(0, 500)}…`;
  }
  if (Array.isArray(clone.items)) clone.items = clone.items.slice(0, 5);
  if (Array.isArray(clone.results)) clone.results = clone.results.slice(0, 5);
  return clone;
}

async function readAccountSettings() {
  let browser;
  try {
    browser = await chromium.connectOverCDP(cdpEndpoint);
    const context = browser.contexts()[0] || await browser.newContext();
    let page = context.pages().find((candidate) => /(^|\.)claude\.ai$/i.test(new URL(candidate.url() || "https://claude.ai").hostname));
    if (!page) {
      page = await context.newPage();
      await page.goto("https://claude.ai/new", { waitUntil: "domcontentloaded", timeout: 30000 });
    }
    const response = await page.evaluate(async () => {
      const res = await fetch("/api/account/settings", { method: "GET", credentials: "include", headers: { accept: "application/json" } });
      const text = await res.text();
      return { status: res.status, text };
    });
    return response;
  } finally {
    await browser?.close?.().catch(() => undefined);
  }
}

async function verifySetting(expectSetting) {
  if (!expectSetting) return { checked: false, ok: true };
  const response = await readAccountSettings();
  const text = String(response.text || "");
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch {}
  const expected = expectSetting.default_model || expectSetting.paprika_mode;
  const ok = response.status >= 200 && response.status < 300 && text.includes(String(expected));
  return { checked: true, ok, status: response.status, expected, preview: text.slice(0, 500), jsonKeys: json && typeof json === "object" ? Object.keys(json).slice(0, 20) : [] };
}

function compareCase(testCase, dom, rpc, domSetting, rpcSetting) {
  const domOut = dom.output || {};
  const rpcOut = rpc.output || {};
  const domOk = !dom.error && (domOut.errorCode == null || domOut.errorCode === testCase.expectErrorCode);
  const rpcOk = !rpc.error && (rpcOut.errorCode == null || rpcOut.errorCode === testCase.expectErrorCode);
  const speedup = rpc.latency_ms > 0 ? Number((dom.latency_ms / rpc.latency_ms).toFixed(2)) : null;
  let similar = false;
  if (testCase.expectErrorCode) similar = domOut.errorCode === testCase.expectErrorCode && rpcOut.errorCode === testCase.expectErrorCode;
  else if (testCase.field) similar = typeof domOut[testCase.field] === typeof rpcOut[testCase.field] && rpcOut.errorCode == null;
  else similar = rpcOk;
  const noOutputOk = testCase.noOutput ? (!testCase.expectSetting || Boolean(domSetting?.ok && rpcSetting?.ok)) && (!testCase.expectErrorCode || similar) : false;
  const pass = Boolean(domOk && rpcOk && similar && (noOutputOk || (speedup !== null && speedup >= 1.2)));
  return { domOk, rpcOk, similar, speedup, noOutputOk, pass };
}

async function closeNonEssentialClaudeTabs() {
  let browser;
  try {
    browser = await chromium.connectOverCDP(cdpEndpoint);
    for (const context of browser.contexts()) {
      const pages = context.pages();
      let keptNew = false;
      for (const page of pages) {
        const url = page.url() || "";
        if (url === "about:blank" || url.startsWith("chrome://")) {
          await page.close().catch(() => undefined);
          continue;
        }
        if (/^https:\/\/claude\.ai\/(new)?(?:[?#].*)?$/.test(url)) {
          if (keptNew) await page.close().catch(() => undefined);
          else keptNew = true;
        }
      }
    }
  } catch (error) {
    return { ok: false, message: error?.message || String(error) };
  } finally {
    await browser?.close?.().catch(() => undefined);
  }
  return { ok: true };
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const results = {
    started_at: new Date().toISOString(),
    profile,
    cdpEndpoint,
    delay_ms: delayMs,
    cases: [],
    pass_count: 0,
    total: CASES.length,
    verdict: "NEEDS_WORK"
  };

  try {
    for (const testCase of CASES) {
      console.error(`[ab-sweep] ${testCase.family}/${testCase.variant} DOM`);
      const dom = await callDriver(testCase, "dom");
      const domSetting = await verifySetting(testCase.expectSetting);
      console.error(`[ab-sweep] ${testCase.family}/${testCase.variant} RPC`);
      const rpc = await callDriver(testCase, "rpc");
      const rpcSetting = await verifySetting(testCase.expectSetting);
      const comparison = compareCase(testCase, dom, rpc, domSetting, rpcSetting);
      const row = { family: testCase.family, variant: testCase.variant, args: testCase.args, dom_backend: testCase.domBackend, skipReason: testCase.skipReason || null, dom, rpc, domSetting, rpcSetting, comparison };
      results.cases.push(row);
      results.pass_count = results.cases.filter((entry) => entry.comparison.pass).length;
      fs.writeFileSync(resultsPath, JSON.stringify({ ...results, updated_at: new Date().toISOString() }, null, 2));
      console.error(`[ab-sweep] ${testCase.variant} ${comparison.pass ? "PASS" : "FAIL"} speedup=${comparison.speedup}`);
    }
  } catch (error) {
    if (error?.blockedAccountRisk) {
      results.verdict = "BLOCKED_ACCOUNT_RISK";
      results.blocker = { message: error.message, output: error.output, error: error.error };
    } else {
      results.blocker = { message: error?.message || String(error), stack: error?.stack };
    }
  } finally {
    results.finished_at = new Date().toISOString();
    results.pass_count = results.cases.filter((entry) => entry.comparison.pass).length;
    if (results.verdict !== "BLOCKED_ACCOUNT_RISK") results.verdict = results.pass_count >= 9 ? "PASS_THRESHOLD_MET" : "NEEDS_WORK";
    results.close_tabs = await closeNonEssentialClaudeTabs();
    fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
  }

  console.log(JSON.stringify({ resultsPath, pass_count: results.pass_count, total: results.total, verdict: results.verdict }, null, 2));
  if (results.verdict === "BLOCKED_ACCOUNT_RISK") process.exit(2);
  if (results.pass_count < 9) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
