#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = process.cwd();
const outDir = path.join(root, ".runs/path-d-single-point/gemini");
const outPath = path.join(outDir, "ab-results.json");
const profile = process.env.GEMINI_PROFILE || "gemini-9225";
const cdpPort = Number(process.env.GEMINI_CDP_PORT || 9225);
const prompts = [
  "what is 2+2?",
  "list three programming languages",
  "summarize the SR-71 in one sentence"
];

const { webAiGeminiSendPrompt } = require(path.join(root, "dist/src/mcp/tools.js"));
const { webAiGeminiSendPromptRpc } = require(path.join(root, "dist/src/mcp/gemini_send_prompt_rpc.js"));

function words(text) {
  return new Set(String(text || "").toLowerCase().match(/[a-z0-9]+/g) || []);
}

function textOverlap(a, b) {
  const aw = words(a);
  const bw = words(b);
  if (!aw.size && !bw.size) return 1;
  if (!aw.size || !bw.size) return 0;
  let intersection = 0;
  for (const word of aw) if (bw.has(word)) intersection += 1;
  return Number((intersection / Math.max(aw.size, bw.size)).toFixed(3));
}

function percentile(values, p) {
  const nums = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!nums.length) return null;
  const index = Math.min(nums.length - 1, Math.ceil((p / 100) * nums.length) - 1);
  return nums[index];
}

async function callDriver(label, fn, args) {
  const started = Date.now();
  try {
    const result = await fn(args);
    const latencyMs = Date.now() - started;
    return {
      label,
      ok: result?.errorCode == null && result?.completion_detected === true && Boolean(String(result?.response_text || "").trim()),
      latency_ms: latencyMs,
      driver_elapsed_ms: result?.elapsed_ms ?? null,
      response_text: result?.response_text || "",
      completion_detected: result?.completion_detected ?? false,
      errorCode: result?.errorCode ?? null,
      error_code: result?.error_code ?? null,
      chat_url: result?.chat_url || "",
      model_used: result?.model_used ?? null,
      message: result?.message || ""
    };
  } catch (error) {
    return {
      label,
      ok: false,
      latency_ms: Date.now() - started,
      response_text: "",
      completion_detected: false,
      errorCode: error?.errorCode || "UNKNOWN",
      error_code: error?.errorCode || "UNKNOWN",
      message: error?.message || String(error)
    };
  }
}

async function cdpPages() {
  try {
    const response = await fetch(`http://127.0.0.1:${cdpPort}/json/list`);
    if (!response.ok) return [];
    return await response.json();
  } catch {
    return [];
  }
}

async function closeNewGeminiTabs(baselineIds) {
  const pages = await cdpPages();
  const closed = [];
  for (const page of pages) {
    if (page.type !== "page") continue;
    if (baselineIds.has(page.id)) continue;
    if (!String(page.url || "").includes("gemini.google.com")) continue;
    try {
      await fetch(`http://127.0.0.1:${cdpPort}/json/close/${page.id}`);
      closed.push({ id: page.id, url: page.url });
    } catch { /* best-effort tab cleanup */ }
  }
  return closed;
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const baselinePages = await cdpPages();
  const baselineIds = new Set(baselinePages.map((page) => page.id));
  const started_at = new Date().toISOString();
  const results = [];

  for (const prompt of prompts) {
    const dom = await callDriver("dom", webAiGeminiSendPrompt, {
      profile,
      prompt,
      backend: "managed-cdp",
      cdpPort,
      timeout_ms: 60000,
      response_timeout_ms: 120000
    });
    const rpc = await callDriver("rpc", webAiGeminiSendPromptRpc, {
      profile,
      prompt,
      cdpPort,
      timeout_ms: 60000,
      response_timeout_ms: 120000
    });
    results.push({
      prompt,
      dom,
      rpc,
      similarity: textOverlap(dom.response_text, rpc.response_text),
      latency_ratio_rpc_over_dom: dom.latency_ms > 0 ? Number((rpc.latency_ms / dom.latency_ms).toFixed(3)) : null
    });
  }

  const domLatencies = results.map((item) => item.dom.latency_ms);
  const rpcLatencies = results.map((item) => item.rpc.latency_ms);
  const closedTabs = await closeNewGeminiTabs(baselineIds);
  const output = {
    service: "gemini",
    profile,
    cdpPort,
    started_at,
    finished_at: new Date().toISOString(),
    prompts,
    summary: {
      dom_success_rate: results.filter((item) => item.dom.ok).length / results.length,
      rpc_success_rate: results.filter((item) => item.rpc.ok).length / results.length,
      dom_latency_median_ms: percentile(domLatencies, 50),
      dom_latency_p95_ms: percentile(domLatencies, 95),
      rpc_latency_median_ms: percentile(rpcLatencies, 50),
      rpc_latency_p95_ms: percentile(rpcLatencies, 95),
      median_latency_ratio_rpc_over_dom: percentile(results.map((item) => item.latency_ratio_rpc_over_dom), 50),
      min_similarity: Math.min(...results.map((item) => item.similarity))
    },
    results,
    closed_tabs: closedTabs
  };
  fs.writeFileSync(outPath, `${JSON.stringify(output, null, 2)}\n`);
  console.log(JSON.stringify(output.summary, null, 2));
  if (output.summary.dom_success_rate !== 1 || output.summary.rpc_success_rate !== 1) process.exitCode = 2;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
