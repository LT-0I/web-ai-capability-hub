#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const OUT_DIR = path.resolve('.runs/path-c-gemini-rpc/wave-b1-chat-send');
const OUT_FILE = path.join(OUT_DIR, 'ab-sweep-results.json');
const PROFILE = 'gemini-9225';
const CDP_PORT = 9225;
const PACING_MS = Number(process.env.WEBAI_GEMINI_AB_PACING_MS || 30000);
const RESPONSE_TIMEOUT_MS = Number(process.env.WEBAI_GEMINI_AB_RESPONSE_TIMEOUT_MS || 120000);

const variants = [
  {
    variant: 'basic',
    prompt: 'Path C Wave B1 basic check: what is 2+2? Answer with only the number.',
    args: {}
  },
  {
    variant: 'thinking_extended',
    prompt: 'Path C Wave B1 thinking check: compute 17 times 23, show one short reasoning line and the final answer.',
    args: { thinking: true }
  },
  {
    variant: 'model_flash',
    prompt: 'Path C Wave B1 Flash check: what is 5+5? Answer with only the number.',
    args: { model: '3.5-flash' }
  },
  {
    variant: 'model_flash_lite',
    prompt: 'Path C Wave B1 Flash-Lite check: what is 4+4? Answer with only the number.',
    args: { model: '3.1-flash-lite' }
  },
  {
    variant: 'reuse_conversation',
    prompt: 'Path C Wave B1 reuse check: what is 6+6? Answer with only the number.',
    args: { reuse_conversation: true }
  }
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokens(value) {
  const normalized = normalizeText(value);
  return normalized ? normalized.split(' ') : [];
}

function similarity(a, b) {
  const aTokens = new Set(tokens(a));
  const bTokens = new Set(tokens(b));
  if (!aTokens.size && !bTokens.size) return 1;
  if (!aTokens.size || !bTokens.size) return 0;
  let overlap = 0;
  for (const token of aTokens) if (bTokens.has(token)) overlap += 1;
  return overlap / Math.max(aTokens.size, bTokens.size);
}

function isQuotaRisk(result) {
  const joined = JSON.stringify(result || {});
  return /PLAN_OR_QUOTA_REQUIRED|\b429\b|rate.?limit|quota/i.test(joined);
}

async function loadBuiltTools() {
  const toolsPath = path.resolve('dist/src/mcp/tools.js');
  if (!fs.existsSync(toolsPath)) throw new Error(`Missing clean build output: ${toolsPath}`);
  return await import(pathToFileURL(toolsPath).href);
}

async function loadLauncher() {
  const launcherPath = path.resolve('dist/src/runtime/pool/profilePool.js');
  const mod = await import(pathToFileURL(launcherPath).href);
  return mod.createManagedBrowserLauncher();
}

async function runOne(webAiGeminiSendPrompt, runtime, variant, backendLabel) {
  const previous = process.env.WEBAI_GEMINI_SEND_BACKEND;
  if (backendLabel === 'rpc') delete process.env.WEBAI_GEMINI_SEND_BACKEND;
  else process.env.WEBAI_GEMINI_SEND_BACKEND = backendLabel;
  const started = Date.now();
  try {
    const result = await webAiGeminiSendPrompt({
      profile: PROFILE,
      cdpPort: CDP_PORT,
      prompt: variant.prompt,
      response_timeout_ms: RESPONSE_TIMEOUT_MS,
      timeout_ms: 60000,
      ...variant.args
    }, runtime);
    const wall_ms = Date.now() - started;
    return { backend: backendLabel === 'rpc' ? 'rpc' : 'dom', wall_ms, result };
  } finally {
    if (previous === undefined) delete process.env.WEBAI_GEMINI_SEND_BACKEND;
    else process.env.WEBAI_GEMINI_SEND_BACKEND = previous;
  }
}

function textOf(run) {
  return String(run?.result?.response_text || '');
}

function runOk(run) {
  return run?.result?.errorCode === null && run?.result?.completion_detected === true && textOf(run).trim().length > 0;
}

async function closeNonEssentialTabs(launcher) {
  const status = await launcher.launch({ profile: PROFILE, url: 'https://gemini.google.com/app?hl=en', cdpPort: CDP_PORT }).catch((error) => ({ connected: false, lastError: error?.message || String(error) }));
  if (!status.connected || !status.cdpEndpoint) return { ok: false, message: status.lastError || 'CDP endpoint unavailable' };
  const origin = new URL(status.cdpEndpoint).origin;
  const pages = await fetch(`${origin}/json/list`).then((r) => r.json()).catch(() => []);
  const pageTabs = pages.filter((page) => page?.type === 'page');
  const keep = pageTabs.find((page) => /gemini\.google\.com\/app/i.test(String(page.url || ''))) || pageTabs[0];
  const closed = [];
  for (const page of pageTabs) {
    if (!keep || page.id === keep.id) continue;
    await fetch(`${origin}/json/close/${encodeURIComponent(page.id)}`).catch(() => undefined);
    closed.push({ id: page.id, url: page.url });
  }
  return { ok: true, kept: keep ? { id: keep.id, url: keep.url } : null, closed };
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const { webAiGeminiSendPrompt } = await loadBuiltTools();
  const launcher = await loadLauncher();
  const runtime = { launcher };
  await launcher.launch({ profile: PROFILE, url: 'https://gemini.google.com/app?hl=en', cdpPort: CDP_PORT }).catch(() => undefined);

  const started_at = new Date().toISOString();
  const results = [];
  let blocked = false;

  for (let i = 0; i < variants.length; i += 1) {
    const variant = variants[i];
    console.log(`[ab-sweep] ${variant.variant} DOM`);
    const dom = await runOne(webAiGeminiSendPrompt, runtime, variant, 'dom');
    if (isQuotaRisk(dom.result)) { blocked = true; results.push({ variant: variant.variant, prompt: variant.prompt, dom, rpc: null, success: false, blocker: 'BLOCKED_ACCOUNT_RISK' }); break; }
    console.log(`[ab-sweep] pacing ${PACING_MS}ms`);
    await sleep(PACING_MS);

    console.log(`[ab-sweep] ${variant.variant} RPC`);
    const rpc = await runOne(webAiGeminiSendPrompt, runtime, variant, 'rpc');
    if (isQuotaRisk(rpc.result)) { blocked = true; results.push({ variant: variant.variant, prompt: variant.prompt, dom, rpc, success: false, blocker: 'BLOCKED_ACCOUNT_RISK' }); break; }

    const sim = similarity(textOf(dom), textOf(rpc));
    const success = runOk(dom) && runOk(rpc) && sim >= 0.2;
    const domLatency = Number(dom.result?.wait_ms || dom.result?.elapsed_ms || dom.wall_ms || 0);
    const rpcLatency = Number(rpc.result?.wait_ms || rpc.result?.elapsed_ms || rpc.wall_ms || 0);
    results.push({
      variant: variant.variant,
      prompt: variant.prompt,
      dom,
      rpc,
      similarity: sim,
      speedup: rpcLatency > 0 ? domLatency / rpcLatency : null,
      success
    });

    if (i < variants.length - 1) {
      console.log(`[ab-sweep] pacing ${PACING_MS}ms`);
      await sleep(PACING_MS);
    }
  }

  const passed = results.filter((result) => result.success).length;
  const attempted = results.length;
  const closeTabs = await closeNonEssentialTabs(launcher);
  const summary = {
    started_at,
    finished_at: new Date().toISOString(),
    profile: PROFILE,
    cdp_port: CDP_PORT,
    pacing_ms: PACING_MS,
    verified_count: variants.length,
    attempted,
    passed,
    failed: attempted - passed,
    functional_threshold: variants.length - 1,
    verdict: blocked ? 'BLOCKED_ACCOUNT_RISK' : (passed >= variants.length - 1 ? 'PASS' : 'NEEDS_WORK'),
    close_tabs: closeTabs
  };
  const payload = { summary, results };
  fs.writeFileSync(OUT_FILE, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`[ab-sweep] wrote ${OUT_FILE}`);
  console.log(JSON.stringify(summary, null, 2));
  if (blocked) process.exit(42);
  if (summary.verdict !== 'PASS') process.exit(1);
}

main().catch(async (error) => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const payload = {
    summary: {
      started_at: null,
      finished_at: new Date().toISOString(),
      profile: PROFILE,
      cdp_port: CDP_PORT,
      verdict: /429|quota|rate.?limit/i.test(error?.message || '') ? 'BLOCKED_ACCOUNT_RISK' : 'NEEDS_WORK',
      error: error?.stack || error?.message || String(error)
    },
    results: []
  };
  fs.writeFileSync(OUT_FILE, `${JSON.stringify(payload, null, 2)}\n`);
  console.error(error?.stack || error?.message || String(error));
  process.exit(payload.summary.verdict === 'BLOCKED_ACCOUNT_RISK' ? 42 : 1);
});
