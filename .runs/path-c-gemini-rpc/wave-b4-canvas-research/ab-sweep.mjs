#!/usr/bin/env node
/*
Path C Gemini Wave B4 A/B sweep.

Protocol:
- One profile only: gemini-9225 / CDP 9225.
- Clean dist must already exist from `rm -rf dist && npm run build`.
- Compare explicit DOM override (managed-cdp by default) against production-default RPC.
- Canvas sub-surface edit/export variants that lack a captured inner API are
  recorded as RPC_NOT_AVAILABLE skips, not silently omitted.
- canvas_to_docs--export_docs is destructive because it creates a real Google
  Doc; no safe dry-run path exists for the Docs export RPC, so it is skipped.
*/
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const outDir = path.join(root, '.runs/path-c-gemini-rpc/wave-b4-canvas-research');
const resultsPath = path.join(outDir, 'ab-sweep-results.json');
const PROFILE = 'gemini-9225';
const CDP_PORT = 9225;
const PACE_MS = Math.max(30000, Number(process.env.WEBAI_GEMINI_AB_PACE_MS || 30000));
const DOM_BACKEND = process.env.WEBAI_GEMINI_AB_DOM_BACKEND || 'managed-cdp';
const startedAt = new Date().toISOString();
let lastCallAt = 0;
let stopReason = null;
const results = [];

const RPC_VARIANTS = [
  {
    variant: 'canvas_open_canvas',
    source_variant: 'webai_gemini_canvas_edit--open_canvas',
    kind: 'canvas',
    tool: 'webAiGeminiCanvasEdit',
    env: 'WEBAI_GEMINI_CANVAS_BACKEND',
    args: {
      prompt: 'Path C Wave B4 Canvas RPC_OPEN_CANVAS: create a short canvas note with exactly this token: RPC_OPEN_CANVAS.',
      confirmed: true,
      response_timeout_ms: 120000,
      timeout_ms: 60000
    }
  },
  {
    variant: 'deep_research_start',
    source_variant: 'webai_gemini_deep_research--start',
    kind: 'deep_research',
    tool: 'webAiGeminiDeepResearch',
    env: 'WEBAI_GEMINI_DEEP_RESEARCH_BACKEND',
    args: {
      prompt: 'Path C Wave B4 Deep Research RPC_DEEP_RESEARCH: create a brief safe research plan for validating an RPC migration. Do not start the research automatically.',
      confirmed: true,
      response_timeout_ms: 120000,
      timeout_ms: 60000
    }
  }
];

const RPC_NOT_AVAILABLE = [
  {
    variant: 'canvas_direct_edit',
    source_variant: 'webai_gemini_canvas_edit--direct_edit',
    kind: 'canvas',
    skipped: true,
    reason: 'RPC_NOT_AVAILABLE_DOM_ONLY',
    justification: 'Wave A capture was a generic GPRiHf telemetry batchexecute body after the Canvas surface was already mounted; no standalone semantic inner API was captured for direct text mutation.'
  },
  {
    variant: 'canvas_ai_length',
    source_variant: 'webai_gemini_canvas_edit--ai_length',
    kind: 'canvas',
    skipped: true,
    reason: 'RPC_NOT_AVAILABLE_DOM_ONLY',
    justification: 'Wave A capture was a generic GPRiHf telemetry batchexecute body; the length action appears to be client-side Canvas sub-surface behavior without a verified semantic RPC.'
  },
  {
    variant: 'canvas_ai_tone',
    source_variant: 'webai_gemini_canvas_edit--ai_tone',
    kind: 'canvas',
    skipped: true,
    reason: 'RPC_NOT_AVAILABLE_DOM_ONLY',
    justification: 'Wave A capture was a generic GPRiHf telemetry batchexecute body; the tone action appears to be client-side Canvas sub-surface behavior without a verified semantic RPC.'
  },
  {
    variant: 'canvas_to_docs_export_docs',
    source_variant: 'webai_gemini_canvas_to_docs--export_docs',
    kind: 'canvas_to_docs',
    skipped: true,
    reason: 'DESTRUCTIVE_RPC_NOT_AVAILABLE',
    justification: 'Export creates a real Google Doc and Wave A replay generated Canvas content rather than a Docs export/create-doc RPC; no safe dry-run RPC path is available.'
  }
];

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
async function pace(label) {
  const delta = Date.now() - lastCallAt;
  if (lastCallAt && delta < PACE_MS) {
    const wait = PACE_MS - delta;
    console.log(`[ab-sweep] pacing ${wait}ms before ${label}`);
    await sleep(wait);
  }
  lastCallAt = Date.now();
}

function resultErrorCode(result, thrown) {
  return result?.errorCode || result?.error_code || thrown?.errorCode || thrown?.code || null;
}

function isAccountRisk(run) {
  const blob = JSON.stringify(run || {});
  return /PLAN_OR_QUOTA_REQUIRED|\b429\b|quota|lockout|rate.?limit|too many requests/i.test(blob);
}

function runOk(run) {
  return !run.thrown && (run.errorCode === null || run.errorCode === undefined || run.errorCode === '');
}

function verifyVariant(variant, dom, rpc) {
  if (!runOk(dom) || !runOk(rpc)) return false;
  if (variant.kind === 'canvas') {
    return dom.result?.canvas_opened === true
      && rpc.result?.canvas_opened === true
      && String(rpc.result?.canvas_html_after || '').trim().length > 0;
  }
  if (variant.kind === 'deep_research') {
    return dom.result?.status === 'queued'
      && rpc.result?.status === 'queued'
      && String(rpc.result?.response_text || '').trim().length > 0;
  }
  return false;
}

function writeJson(closeTabs = null) {
  const attempted = results.filter((result) => !result.skipped).length;
  const passed = results.filter((result) => result.success).length;
  const skipped = results.filter((result) => result.skipped).length;
  const failed = results.filter((result) => !result.skipped && !result.success).length;
  const rpcDriverCount = RPC_VARIANTS.length;
  const functionalThreshold = rpcDriverCount - 1;
  const summary = {
    profile: PROFILE,
    cdp_port: CDP_PORT,
    dom_backend: DOM_BACKEND,
    pace_ms: PACE_MS,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    rpc_driver_count: rpcDriverCount,
    attempted,
    passed,
    failed,
    skipped,
    functional_threshold: functionalThreshold,
    stopReason,
    close_tabs: closeTabs,
    verdict: stopReason === 'BLOCKED_ACCOUNT_RISK'
      ? 'BLOCKED_ACCOUNT_RISK'
      : (passed >= functionalThreshold ? 'PASS' : 'NEEDS_WORK')
  };
  fs.writeFileSync(resultsPath, JSON.stringify({ summary, results }, null, 2) + '\n');
  return summary;
}

async function loadBuiltTools() {
  const toolsPath = path.join(root, 'dist/src/mcp/tools.js');
  if (!fs.existsSync(toolsPath)) throw new Error(`Missing clean build output: ${toolsPath}`);
  return require(toolsPath);
}

async function loadLauncher() {
  const launcherPath = path.join(root, 'dist/src/runtime/pool/profilePool.js');
  const mod = require(launcherPath);
  return mod.createManagedBrowserLauncher();
}

async function cdpPages() {
  return await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`).then((response) => response.json()).catch(() => []);
}

async function closeNonEssentialTabs(launcher) {
  try {
    const status = await launcher.launch({ profile: PROFILE, url: 'https://gemini.google.com/app?hl=en', cdpPort: CDP_PORT }).catch((error) => ({ connected: false, lastError: error?.message || String(error) }));
    if (!status?.connected && status?.lastError) return { ok: false, message: status.lastError };
    const pages = await cdpPages();
    const pageTabs = pages.filter((page) => page?.type === 'page');
    const keep = pageTabs.find((page) => /gemini\.google\.com\/app/i.test(String(page.url || ''))) || pageTabs[0];
    const closed = [];
    for (const page of pageTabs) {
      if (!keep || page.id === keep.id) continue;
      await fetch(`http://127.0.0.1:${CDP_PORT}/json/close/${encodeURIComponent(page.id)}`).catch(() => undefined);
      closed.push({ id: page.id, url: page.url });
    }
    return { ok: true, kept: keep ? { id: keep.id, url: keep.url } : null, closed };
  } catch (error) {
    return { ok: false, message: error?.message || String(error) };
  }
}

async function callTool(tools, runtime, variant, backendKind) {
  await pace(`${variant.variant} ${backendKind}`);
  const previous = process.env[variant.env];
  if (backendKind === 'rpc') delete process.env[variant.env];
  else process.env[variant.env] = DOM_BACKEND;
  const started = Date.now();
  let result = null;
  let thrown = null;
  try {
    const args = { profile: PROFILE, cdpPort: CDP_PORT, ...variant.args };
    result = await tools[variant.tool](args, runtime);
  } catch (error) {
    thrown = { message: error?.message || String(error), stack: error?.stack || null, errorCode: error?.errorCode || error?.code || null };
  } finally {
    if (previous === undefined) delete process.env[variant.env];
    else process.env[variant.env] = previous;
  }
  const elapsed_ms = Date.now() - started;
  return {
    backend: backendKind === 'rpc' ? 'rpc' : 'dom',
    env_key: variant.env,
    env_value: backendKind === 'rpc' ? '(default)' : DOM_BACKEND,
    elapsed_ms,
    response_field: variant.kind === 'canvas'
      ? { canvas_opened: result?.canvas_opened, canvas_html_after_len: String(result?.canvas_html_after || '').length }
      : { status: result?.status, response_text_len: String(result?.response_text || '').length, chat_url: result?.chat_url || null },
    result,
    thrown,
    errorCode: resultErrorCode(result, thrown)
  };
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  for (const skipped of RPC_NOT_AVAILABLE) results.push(skipped);
  writeJson();

  const tools = await loadBuiltTools();
  const launcher = await loadLauncher();
  const runtime = { launcher };
  await launcher.launch({ profile: PROFILE, url: 'https://gemini.google.com/app?hl=en', cdpPort: CDP_PORT }).catch(() => undefined);

  for (const variant of RPC_VARIANTS) {
    console.log(`[ab-sweep] ${variant.variant} DOM (${DOM_BACKEND})`);
    const dom = await callTool(tools, runtime, variant, 'dom');
    if (isAccountRisk(dom)) {
      stopReason = 'BLOCKED_ACCOUNT_RISK';
      results.push({ variant: variant.variant, source_variant: variant.source_variant, kind: variant.kind, dom, rpc: null, success: false, blocker: stopReason });
      writeJson();
      break;
    }

    console.log(`[ab-sweep] ${variant.variant} RPC`);
    const rpc = await callTool(tools, runtime, variant, 'rpc');
    if (isAccountRisk(rpc)) {
      stopReason = 'BLOCKED_ACCOUNT_RISK';
      results.push({ variant: variant.variant, source_variant: variant.source_variant, kind: variant.kind, dom, rpc, success: false, blocker: stopReason });
      writeJson();
      break;
    }

    const success = verifyVariant(variant, dom, rpc);
    results.push({
      variant: variant.variant,
      source_variant: variant.source_variant,
      kind: variant.kind,
      args: variant.args,
      dom,
      rpc,
      success,
      verifier: variant.kind === 'canvas'
        ? 'DOM/RPC canvas_opened plus non-empty RPC canvas_html_after'
        : 'DOM/RPC queued plus non-empty RPC response_text'
    });
    writeJson();
  }

  const closeTabs = await closeNonEssentialTabs(launcher);
  const summary = writeJson(closeTabs);
  console.log(JSON.stringify(summary, null, 2));
  if (summary.verdict === 'BLOCKED_ACCOUNT_RISK') process.exit(42);
  if (summary.verdict !== 'PASS') process.exit(1);
}

main().catch(async (error) => {
  stopReason = /429|quota|rate.?limit|lockout/i.test(error?.message || '') ? 'BLOCKED_ACCOUNT_RISK' : 'UNCAUGHT_ERROR';
  results.push({ variant: 'uncaught', success: false, error: error?.stack || error?.message || String(error) });
  writeJson();
  console.error(error?.stack || error?.message || String(error));
  process.exit(stopReason === 'BLOCKED_ACCOUNT_RISK' ? 42 : 1);
});
