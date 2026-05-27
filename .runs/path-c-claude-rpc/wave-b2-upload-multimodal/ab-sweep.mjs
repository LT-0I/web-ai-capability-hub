#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = process.cwd();
const resultsPath = path.join(__dirname, "ab-sweep-results.json");
const fixtureDir = path.join(__dirname, "tmp-fixtures");
const PACE_MS = 30_000;
const PROFILE = "claude-9224";
const CDP_ENDPOINT = "http://127.0.0.1:9224";
const INITIAL_MARK = "webai_path_c_claude_b2_initial_page";

const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
  "base64"
);

const cases = [
  {
    variant: "upload_single",
    prompt: "B2_UPLOAD_SINGLE_2026-05-27: Read the uploaded text and reply OK SINGLE.",
    expected: /OK\s+SINGLE/i,
    fixtures: [{ name: "b2-upload-single.txt", content: "B2 single fixture\n".padEnd(1024, "s") }]
  },
  {
    variant: "upload_multi",
    prompt: "B2_UPLOAD_MULTI_2026-05-27: Read the uploaded text files and reply OK MULTI.",
    expected: /OK\s+MULTI/i,
    fixtures: [
      { name: "b2-upload-multi-a.txt", content: "B2 multi fixture A\n".padEnd(1024, "a") },
      { name: "b2-upload-multi-b.txt", content: "B2 multi fixture B\n".padEnd(1024, "b") },
      { name: "b2-upload-multi-c.txt", content: "B2 multi fixture C\n".padEnd(1024, "c") }
    ]
  },
  {
    variant: "upload_and_query",
    prompt: "B2_UPLOAD_AND_QUERY_2026-05-27: Read the markdown and reply OK QUERY.",
    expected: /OK\s+QUERY/i,
    fixtures: [{ name: "b2-upload-query.md", content: ("# B2 query fixture\nToken: OK QUERY\n").padEnd(1024, "q") }]
  },
  {
    variant: "upload_image",
    prompt: "B2_UPLOAD_IMAGE_2026-05-27: Acknowledge the tiny image and reply OK IMAGE.",
    expected: /OK\s+IMAGE|OK/i,
    fixtures: [{ name: "b2-upload-image.png", content: PNG_1X1 }]
  },
  {
    variant: "upload_markdown",
    prompt: "B2_UPLOAD_MARKDOWN_2026-05-27: Read the markdown and reply OK MARKDOWN.",
    expected: /OK\s+MARKDOWN/i,
    fixtures: [{ name: "b2-upload-markdown.md", content: ("# B2 markdown fixture\nToken: OK MARKDOWN\n").padEnd(1024, "m") }]
  }
];

function writeFixtures() {
  fs.rmSync(fixtureDir, { recursive: true, force: true });
  fs.mkdirSync(fixtureDir, { recursive: true });
  for (const testCase of cases) {
    const variantDir = path.join(fixtureDir, testCase.variant);
    fs.mkdirSync(variantDir, { recursive: true });
    for (const fixture of testCase.fixtures) {
      fs.writeFileSync(path.join(variantDir, fixture.name), fixture.content);
    }
  }
}

function filesFor(testCase) {
  return testCase.fixtures.map((fixture) => path.join(fixtureDir, testCase.variant, fixture.name));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let lastCallEnded = 0;
async function pace() {
  if (!lastCallEnded) return;
  const remaining = PACE_MS - (Date.now() - lastCallEnded);
  if (remaining > 0) await sleep(remaining);
}

function accountRisk(result) {
  const text = JSON.stringify(result || {});
  return /PLAN_OR_QUOTA_REQUIRED|429|rate.?limit|message_limit|quota|lockout|account/i.test(text);
}

async function callDriver(backend, testCase, webAiClaudeUploadAndQuery) {
  await pace();
  const previous = process.env.WEBAI_CLAUDE_UPLOAD_BACKEND;
  process.env.WEBAI_CLAUDE_UPLOAD_BACKEND = backend;
  const started = Date.now();
  try {
    const result = await webAiClaudeUploadAndQuery({
      profile: PROFILE,
      files: filesFor(testCase),
      prompt: testCase.prompt,
      timeout_ms: 60_000,
      response_timeout_ms: 120_000
    });
    const latency_ms = Date.now() - started;
    lastCallEnded = Date.now();
    return { backend, latency_ms, result };
  } catch (error) {
    const latency_ms = Date.now() - started;
    lastCallEnded = Date.now();
    return { backend, latency_ms, thrown: error?.stack || error?.message || String(error) };
  } finally {
    if (previous === undefined) delete process.env.WEBAI_CLAUDE_UPLOAD_BACKEND;
    else process.env.WEBAI_CLAUDE_UPLOAD_BACKEND = previous;
  }
}

function responseText(call) {
  return String(call?.result?.response_text || "");
}

function okCall(call) {
  return Boolean(call?.result && !call.result.errorCode && !call.result.error_code && responseText(call).trim());
}

function rowPass(testCase, dom, rpc) {
  const rpcText = responseText(rpc);
  const domText = responseText(dom);
  const textOk = testCase.expected.test(rpcText);
  const domOk = okCall(dom) && testCase.expected.test(domText);
  const rpcOk = okCall(rpc) && textOk;
  const speedup = dom?.latency_ms && rpc?.latency_ms ? dom.latency_ms / Math.max(1, rpc.latency_ms) : 0;
  return { pass: Boolean(domOk && rpcOk && speedup >= 1.2), speedup, domOk, rpcOk, textOk };
}

async function markInitialClaudePages() {
  let browser;
  try {
    browser = await chromium.connectOverCDP(CDP_ENDPOINT);
    for (const context of browser.contexts()) {
      for (const page of context.pages()) {
        const url = page.url?.() || "";
        if (/^https:\/\/(www\.)?claude\.ai\//.test(url)) {
          await page.evaluate((key) => sessionStorage.setItem(key, "1"), INITIAL_MARK).catch(() => undefined);
        }
      }
    }
  } catch {
    // Best-effort cleanup marker only; the sweep itself will surface CDP failures.
  } finally {
    await browser?.close?.().catch(() => undefined);
  }
}

async function closeNonEssentialClaudeTabs() {
  let browser;
  try {
    browser = await chromium.connectOverCDP(CDP_ENDPOINT);
    for (const context of browser.contexts()) {
      for (const page of context.pages()) {
        const url = page.url?.() || "";
        if (!/^https:\/\/(www\.)?claude\.ai\//.test(url)) continue;
        const initial = await page.evaluate((key) => sessionStorage.getItem(key) === "1", INITIAL_MARK).catch(() => false);
        if (!initial) await page.close?.().catch(() => undefined);
      }
    }
  } catch (error) {
    return { ok: false, message: error?.message || String(error) };
  } finally {
    await browser?.close?.().catch(() => undefined);
  }
  return { ok: true };
}

function saveResults(payload) {
  fs.writeFileSync(resultsPath, `${JSON.stringify(payload, null, 2)}\n`);
}

async function main() {
  writeFixtures();
  await markInitialClaudePages();
  const { webAiClaudeUploadAndQuery } = await import(path.join(repoRoot, "dist/src/mcp/tools.js"));
  const rows = [];
  let verdict = "NEEDS_WORK";
  let blockedAccountRisk = false;
  try {
    for (const testCase of cases) {
      const dom = await callDriver("dom", testCase, webAiClaudeUploadAndQuery);
      if (accountRisk(dom.result) || accountRisk(dom.thrown)) {
        blockedAccountRisk = true;
        rows.push({ variant: testCase.variant, dom, rpc: null, pass: false, blocker: "account_risk_after_dom" });
        break;
      }
      const rpc = await callDriver("rpc", testCase, webAiClaudeUploadAndQuery);
      if (accountRisk(rpc.result) || accountRisk(rpc.thrown)) {
        blockedAccountRisk = true;
        rows.push({ variant: testCase.variant, dom, rpc, pass: false, blocker: "account_risk_after_rpc" });
        break;
      }
      const evalResult = rowPass(testCase, dom, rpc);
      rows.push({ variant: testCase.variant, expected: String(testCase.expected), dom, rpc, ...evalResult });
      saveResults({ generated_at: new Date().toISOString(), profile: PROFILE, pace_ms: PACE_MS, rows, pass_count: rows.filter((row) => row.pass).length, verdict: "IN_PROGRESS" });
    }
    const passCount = rows.filter((row) => row.pass).length;
    verdict = blockedAccountRisk ? "BLOCKED_ACCOUNT_RISK" : (passCount >= 4 ? "SHIPPED_CANDIDATE" : "NEEDS_WORK");
    const speedups = rows.filter((row) => row.speedup).map((row) => row.speedup).sort((a, b) => a - b);
    const medianSpeedup = speedups.length ? speedups[Math.floor(speedups.length / 2)] : 0;
    saveResults({
      generated_at: new Date().toISOString(),
      profile: PROFILE,
      pace_ms: PACE_MS,
      rows,
      pass_count: passCount,
      median_speedup: medianSpeedup,
      verdict
    });
    if (blockedAccountRisk) process.exitCode = 42;
    else if (passCount < 4) process.exitCode = 1;
  } finally {
    fs.rmSync(fixtureDir, { recursive: true, force: true });
    const closeResult = await closeNonEssentialClaudeTabs();
    const current = JSON.parse(fs.readFileSync(resultsPath, "utf8"));
    current.fixture_dir_deleted = !fs.existsSync(fixtureDir);
    current.close_tabs = closeResult;
    fs.writeFileSync(resultsPath, `${JSON.stringify(current, null, 2)}\n`);
  }
}

main().catch((error) => {
  fs.rmSync(fixtureDir, { recursive: true, force: true });
  saveResults({ generated_at: new Date().toISOString(), profile: PROFILE, verdict: "NEEDS_WORK", fatal: error?.stack || error?.message || String(error) });
  process.exitCode = 1;
});
