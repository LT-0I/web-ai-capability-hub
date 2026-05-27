#!/usr/bin/env node
import childProcess from "node:child_process";
import * as fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const OUT_DIR = path.join(ROOT, ".runs/path-d-single-point/claude");
const OUT_FILE = path.join(OUT_DIR, "ab-results.json");
const BUILD_DIR = process.env.PATH_D_CLAUDE_BUILD_DIR || "/tmp/path-d-claude-rpc-ab-build";
const PROFILE = process.env.PATH_D_CLAUDE_PROFILE || "claude-9224";
const CDP_PORT = Number(process.env.PATH_D_CLAUDE_CDP_PORT || 9224);
const RESPONSE_TIMEOUT_MS = Number(process.env.PATH_D_CLAUDE_RESPONSE_TIMEOUT_MS || 120000);
const TIMEOUT_MS = Number(process.env.PATH_D_CLAUDE_TIMEOUT_MS || 60000);

const PROMPTS = [
  "what is 2+2?",
  "list three programming languages",
  "summarize the SR-71 in one sentence"
];

function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)];
}

function normalize(text) {
  return canonicalAnswerText(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function canonicalAnswerText(text) {
  let value = String(text || "").replace(/^\s*Claude responded:\s*/i, "").trim();
  for (let repeats = 2; repeats <= 4; repeats += 1) {
    if (value.length % repeats !== 0) continue;
    const unit = value.slice(0, value.length / repeats);
    if (unit.repeat(repeats) === value) return unit.trim();
  }
  return value;
}

function textOverlap(a, b) {
  const stopwords = new Set("a an the and or but in on at of to for with from by as is was were be been being it its this that here are three one sentence responded claude".split(" "));
  const left = new Set(normalize(a).split(/\s+/).filter((token) => token && !stopwords.has(token)));
  const right = new Set(normalize(b).split(/\s+/).filter((token) => token && !stopwords.has(token)));
  if (!left.size && !right.size) return 1;
  if (!left.size || !right.size) return 0;
  let intersection = 0;
  for (const token of left) if (right.has(token)) intersection += 1;
  return intersection / Math.min(left.size, right.size);
}

function runTsc() {
  childProcess.execFileSync("npx", ["tsc", "-p", "tsconfig.json", "--outDir", BUILD_DIR], {
    cwd: ROOT,
    stdio: "inherit",
    env: { ...process.env, NODE_PATH: path.join(ROOT, "node_modules") }
  });
  const moduleLink = path.join(BUILD_DIR, "node_modules");
  if (!fsSync.existsSync(moduleLink)) fsSync.symlinkSync(path.join(ROOT, "node_modules"), moduleLink, "dir");
}

function loadDrivers() {
  runTsc();
  const require = createRequire(path.join(BUILD_DIR, "noop.js"));
  return {
    dom: require(path.join(BUILD_DIR, "src/mcp/tools.js")).webAiClaudeSendPrompt,
    rpc: require(path.join(BUILD_DIR, "src/mcp/claude_send_prompt_rpc.js")).webAiClaudeSendPromptRpc
  };
}

async function callDriver(kind, fn, prompt) {
  const started = Date.now();
  try {
    const args = {
      profile: PROFILE,
      prompt,
      timeout_ms: TIMEOUT_MS,
      response_timeout_ms: RESPONSE_TIMEOUT_MS,
      cdpPort: CDP_PORT
    };
    if (kind === "dom") args.backend = "managed-cdp";
    const result = await fn(args);
    const measured = Date.now() - started;
    return {
      ok: !result?.errorCode,
      errorCode: result?.errorCode || null,
      latency_ms: typeof result?.elapsed_ms === "number" ? result.elapsed_ms : measured,
      measured_latency_ms: measured,
      response_text: String(result?.response_text || ""),
      chat_url: result?.chat_url || null,
      completion_detected: Boolean(result?.completion_detected),
      message: result?.message || null
    };
  } catch (error) {
    return {
      ok: false,
      errorCode: error?.errorCode || error?.code || "THROWN",
      latency_ms: Date.now() - started,
      measured_latency_ms: Date.now() - started,
      response_text: "",
      chat_url: null,
      completion_detected: false,
      message: error?.message || String(error)
    };
  }
}

async function closeNonEssentialClaudeTabs() {
  try {
    const { chromium } = await import("playwright");
    const browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`);
    try {
      const pages = browser.contexts().flatMap((context) => context.pages());
      const claudePages = pages.filter((page) => /https:\/\/(?:www\.)?claude\.ai\//.test(page.url()));
      const [keep, ...extra] = claudePages;
      for (const page of extra) await page.close({ runBeforeUnload: false }).catch(() => undefined);
      if (keep && !/\/new(?:[?#]|$)/.test(new URL(keep.url()).pathname + new URL(keep.url()).search)) {
        await keep.goto(CLAUDE_FRESH_URL, { waitUntil: "domcontentloaded", timeout: 15000 }).catch(() => undefined);
      }
    } finally {
      await browser.close().catch(() => undefined);
    }
  } catch {
    // Cleanup is best-effort; the results JSON records validation, not tab state.
  }
}

const CLAUDE_FRESH_URL = "https://claude.ai/new";

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const started_at = new Date().toISOString();
  const results = [];
  let setup_error = null;
  try {
    const { dom, rpc } = loadDrivers();
    for (const prompt of PROMPTS) {
      const domResult = await callDriver("dom", dom, prompt);
      const rpcResult = await callDriver("rpc", rpc, prompt);
      results.push({
        prompt,
        dom: domResult,
        rpc: rpcResult,
        similarity: textOverlap(domResult.response_text, rpcResult.response_text),
        latency_ratio_rpc_over_dom: domResult.latency_ms > 0 ? rpcResult.latency_ms / domResult.latency_ms : null
      });
    }
  } catch (error) {
    setup_error = error?.message || String(error);
  } finally {
    await closeNonEssentialClaudeTabs();
  }

  const domLatencies = results.filter((row) => row.dom.ok).map((row) => row.dom.latency_ms);
  const rpcLatencies = results.filter((row) => row.rpc.ok).map((row) => row.rpc.latency_ms);
  const domSuccesses = results.filter((row) => row.dom.ok).length;
  const rpcSuccesses = results.filter((row) => row.rpc.ok).length;
  const similarities = results.map((row) => row.similarity);
  const minSimilarity = similarities.length ? Math.min(...similarities) : 0;
  const summary = {
    started_at,
    finished_at: new Date().toISOString(),
    profile: PROFILE,
    cdp_port: CDP_PORT,
    setup_error,
    dom: {
      success_rate: PROMPTS.length ? domSuccesses / PROMPTS.length : 0,
      median_latency_ms: percentile(domLatencies, 0.5),
      p95_latency_ms: percentile(domLatencies, 0.95)
    },
    rpc: {
      success_rate: PROMPTS.length ? rpcSuccesses / PROMPTS.length : 0,
      median_latency_ms: percentile(rpcLatencies, 0.5),
      p95_latency_ms: percentile(rpcLatencies, 0.95)
    },
    min_similarity: minSimilarity,
    verdict: !setup_error && domSuccesses === PROMPTS.length && rpcSuccesses === PROMPTS.length && minSimilarity >= 0.2
      ? "GREENLIGHT_FOR_PATH_C"
      : "NEEDS_WORK"
  };

  const payload = { summary, results };
  await fs.writeFile(OUT_FILE, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(JSON.stringify(summary, null, 2));
  if (summary.verdict !== "GREENLIGHT_FOR_PATH_C") process.exitCode = 1;
}

await main();
