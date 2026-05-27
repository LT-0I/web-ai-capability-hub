#!/usr/bin/env node
/*
Path C Gemini Wave B3 A/B sweep.

Protocol:
- One profile only: gemini-9225 / CDP 9225.
- Pace every tool invocation by at least 30s unless WEBAI_GEMINI_AB_PACE_MS is set.
- Compare explicit DOM override (managed-cdp) against production-default RPC.
- No destructive calls are executed: conversation rename/delete must return
  POLICY_APPROVAL_REQUIRED and share is called without confirmed=true so both
  drivers return SENSITIVE_CONTENT_GUARD.
- No-output / settings ops are verified by stable postcondition fields plus, for
  select_model, a read-only CDP trigger-text readback after each driver run.
  The readback never mutates state and is recorded as evidence; RPC success is
  based on canonical output + L5adhe/MaZiqc ack because these Wave A captures are
  batchexecute ACK-style streams, not text responses.
*/
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const outDir = path.join(root, '.runs/path-c-gemini-rpc/wave-b3-workspace-model-conversation');
const resultsPath = path.join(outDir, 'ab-sweep-results.json');
const PROFILE = 'gemini-9225';
const CDP_PORT = 9225;
const PACE_MS = Number(process.env.WEBAI_GEMINI_AB_PACE_MS || 30000);
const DOM_BACKEND = process.env.WEBAI_GEMINI_AB_DOM_BACKEND || 'managed-cdp';
const startedAt = new Date().toISOString();
let lastCallAt = 0;
let stopReason = null;
const results = [];

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
async function pace() {
  const delta = Date.now() - lastCallAt;
  if (lastCallAt && delta < PACE_MS) {
    const wait = PACE_MS - delta;
    console.log(`[ab-sweep] pacing ${wait}ms`);
    await sleep(wait);
  }
  lastCallAt = Date.now();
}

function writeJson(closeTabs = null) {
  const passed = results.filter((result) => result.success).length;
  const skipped = results.filter((result) => result.skipped).length;
  const attempted = results.length;
  const summary = {
    profile: PROFILE,
    cdp_port: CDP_PORT,
    dom_backend: DOM_BACKEND,
    pace_ms: PACE_MS,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    verified_count: VARIANTS.length,
    attempted,
    passed,
    failed: attempted - passed - skipped,
    skipped,
    functional_threshold: VARIANTS.length - 2,
    stopReason,
    close_tabs: closeTabs,
    verdict: stopReason === 'BLOCKED_ACCOUNT_RISK'
      ? 'BLOCKED_ACCOUNT_RISK'
      : (passed >= VARIANTS.length - 2 ? 'PASS' : 'NEEDS_WORK')
  };
  fs.writeFileSync(resultsPath, JSON.stringify({ summary, results }, null, 2) + '\n');
  return summary;
}

function resultErrorCode(result, thrown) {
  return result?.errorCode || result?.error_code || thrown?.errorCode || thrown?.code || null;
}

function isAccountRisk(result, thrown) {
  const blob = `${resultErrorCode(result, thrown) || ''} ${result?.message || ''} ${result?.reason || ''} ${thrown?.message || ''}`;
  return /PLAN_OR_QUOTA_REQUIRED|\b429\b|quota|lockout|rate.?limit|too many requests/i.test(blob);
}

async function cdpCommand(wsUrl, method, params = {}) {
  const ws = new WebSocket(wsUrl);
  let nextId = 0;
  const pending = new Map();
  ws.addEventListener('message', (event) => {
    let msg;
    try { msg = JSON.parse(String(event.data)); } catch { return; }
    if (!msg.id || !pending.has(msg.id)) return;
    const entry = pending.get(msg.id);
    pending.delete(msg.id);
    clearTimeout(entry.timer);
    if (msg.error) entry.reject(new Error(JSON.stringify(msg.error)));
    else entry.resolve(msg.result);
  });
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', () => reject(new Error(`CDP websocket error for ${wsUrl}`)), { once: true });
  });
  try {
    const id = ++nextId;
    ws.send(JSON.stringify({ id, method, params }));
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`CDP ${method} timed out`));
      }, 5000);
      pending.set(id, { resolve, reject, timer });
    });
  } finally {
    for (const entry of pending.values()) clearTimeout(entry.timer);
    ws.close();
  }
}

async function cdpPages() {
  return await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`).then((r) => r.json()).catch(() => []);
}

async function currentGeminiConversationUrl() {
  const pages = await cdpPages();
  const page = pages.find((candidate) => candidate?.type === 'page' && /gemini\.google\.com\/app\/[A-Za-z0-9_-]+/i.test(String(candidate.url || '')));
  return page?.url || '';
}

async function readModelPickerText() {
  const pages = await cdpPages();
  const page = pages.find((candidate) => candidate?.type === 'page' && /gemini\.google\.com/i.test(String(candidate.url || '')) && candidate.webSocketDebuggerUrl);
  if (!page?.webSocketDebuggerUrl) return { ok: false, message: 'no Gemini CDP page for readback' };
  const expression = `(() => {
    const trigger = document.querySelector('button[data-test-id="bard-mode-menu-button"], button[aria-label^="Open mode picker"]');
    return {
      href: location.href,
      text: String(trigger?.innerText || trigger?.textContent || '').trim(),
      aria: String(trigger?.getAttribute('aria-label') || '').trim()
    };
  })()`;
  try {
    const result = await cdpCommand(page.webSocketDebuggerUrl, 'Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    return { ok: true, ...(result?.result?.value || {}) };
  } catch (error) {
    return { ok: false, message: error?.message || String(error) };
  }
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

async function callTool(tools, runtime, variant, backendKind) {
  await pace();
  const envKey = variant.env;
  const previous = process.env[envKey];
  if (backendKind === 'rpc') delete process.env[envKey];
  else process.env[envKey] = DOM_BACKEND;
  const started = Date.now();
  let result = null;
  let thrown = null;
  try {
    const args = { profile: PROFILE, cdpPort: CDP_PORT, timeout_ms: 60000, ...variant.args };
    result = await tools[variant.tool](args, runtime);
  } catch (error) {
    thrown = { message: error?.message || String(error), stack: error?.stack || null, errorCode: error?.errorCode || error?.code || null };
  } finally {
    if (previous === undefined) delete process.env[envKey];
    else process.env[envKey] = previous;
  }
  const elapsed_ms = Date.now() - started;
  const readback = variant.readback ? await variant.readback() : null;
  return {
    backend: backendKind === 'rpc' ? 'rpc' : 'dom',
    env_value: backendKind === 'rpc' ? '(default)' : DOM_BACKEND,
    elapsed_ms,
    result,
    thrown,
    errorCode: resultErrorCode(result, thrown),
    readback
  };
}

function okNoError(run) {
  return !run.thrown && (run.errorCode === null || run.errorCode === undefined || run.errorCode === '');
}

function expectedGuard(run, expectedCode) {
  return !run.thrown && run.errorCode === expectedCode;
}

function verifyVariant(variant, dom, rpc) {
  if (variant.expectedErrorCode) return expectedGuard(dom, variant.expectedErrorCode) && expectedGuard(rpc, variant.expectedErrorCode);
  if (!okNoError(dom) || !okNoError(rpc)) return false;
  if (variant.kind === 'workspace') return dom.result?.surface === variant.args.surface && rpc.result?.surface === variant.args.surface && Boolean(rpc.result?.rpc_ack);
  if (variant.kind === 'select_model') {
    const modelOk = variant.args.model ? (dom.result?.selected_model === variant.args.model && rpc.result?.selected_model === variant.args.model) : true;
    const thinkingOk = variant.args.thinking_level ? (dom.result?.selected_thinking_level === variant.args.thinking_level && rpc.result?.selected_thinking_level === variant.args.thinking_level) : true;
    return modelOk && thinkingOk && Boolean(rpc.result?.rpc_ack);
  }
  if (variant.kind === 'conversation') {
    if (variant.args.action === 'menu_enumerate') return Array.isArray(dom.result?.items) && Array.isArray(rpc.result?.items) && Boolean(rpc.result?.rpc_ack);
    if (variant.args.action === 'share') return dom.result?.dialog_opened === true && rpc.result?.dialog_opened === true;
    return Boolean(rpc.result?.rpc_ack) && ('results_count' in (rpc.result || {}) || Array.isArray(rpc.result?.items));
  }
  return false;
}

async function closeNonEssentialTabs(launcher) {
  try {
    await launcher.launch({ profile: PROFILE, url: 'https://gemini.google.com/app?hl=en', cdpPort: CDP_PORT }).catch(() => undefined);
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

const workspaceSurfaces = ['gems', 'scheduled', 'study', 'workspace_integration', 'connected_apps', 'personalization'];
const VARIANTS = [
  ...workspaceSurfaces.map((surface) => ({
    tool: 'webAiGeminiWorkspace',
    env: 'WEBAI_GEMINI_WORKSPACE_BACKEND',
    kind: 'workspace',
    variant: `workspace_${surface}`,
    args: { surface }
  })),
  { tool: 'webAiGeminiSelectModel', env: 'WEBAI_GEMINI_SELECT_MODEL_BACKEND', kind: 'select_model', variant: 'select_flash', args: { model: '3.5-flash' }, readback: readModelPickerText },
  { tool: 'webAiGeminiSelectModel', env: 'WEBAI_GEMINI_SELECT_MODEL_BACKEND', kind: 'select_model', variant: 'select_flash_lite', args: { model: '3.1-flash-lite' }, readback: readModelPickerText },
  { tool: 'webAiGeminiSelectModel', env: 'WEBAI_GEMINI_SELECT_MODEL_BACKEND', kind: 'select_model', variant: 'thinking_standard', args: { thinking_level: 'standard' }, readback: readModelPickerText },
  { tool: 'webAiGeminiSelectModel', env: 'WEBAI_GEMINI_SELECT_MODEL_BACKEND', kind: 'select_model', variant: 'thinking_extended', args: { thinking_level: 'extended' }, readback: readModelPickerText },
  { tool: 'webAiGeminiConversationManage', env: 'WEBAI_GEMINI_CONVERSATION_MANAGE_BACKEND', kind: 'conversation', variant: 'conversation_list', args: { action: 'list' } },
  { tool: 'webAiGeminiConversationManage', env: 'WEBAI_GEMINI_CONVERSATION_MANAGE_BACKEND', kind: 'conversation', variant: 'conversation_search', args: { action: 'search', query: 'Path C' } },
  { tool: 'webAiGeminiConversationManage', env: 'WEBAI_GEMINI_CONVERSATION_MANAGE_BACKEND', kind: 'conversation', variant: 'conversation_menu_enumerate', args: { action: 'menu_enumerate' } },
  { tool: 'webAiGeminiConversationManage', env: 'WEBAI_GEMINI_CONVERSATION_MANAGE_BACKEND', kind: 'conversation', variant: 'conversation_share_guard', args: { action: 'share' }, expectedErrorCode: 'SENSITIVE_CONTENT_GUARD' },
  { tool: 'webAiGeminiConversationManage', env: 'WEBAI_GEMINI_CONVERSATION_MANAGE_BACKEND', kind: 'conversation', variant: 'conversation_rename_guard', args: { action: 'rename' }, expectedErrorCode: 'POLICY_APPROVAL_REQUIRED' },
  { tool: 'webAiGeminiConversationManage', env: 'WEBAI_GEMINI_CONVERSATION_MANAGE_BACKEND', kind: 'conversation', variant: 'conversation_delete_guard', args: { action: 'delete' }, expectedErrorCode: 'POLICY_APPROVAL_REQUIRED' }
];

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const tools = await loadBuiltTools();
  const launcher = await loadLauncher();
  const runtime = { launcher };
  await launcher.launch({ profile: PROFILE, url: 'https://gemini.google.com/app?hl=en', cdpPort: CDP_PORT }).catch(() => undefined);
  const conversationUrl = process.env.WEBAI_GEMINI_B3_CONVERSATION_URL || await currentGeminiConversationUrl();
  for (const variant of VARIANTS) {
    if (variant.variant === 'conversation_menu_enumerate' && conversationUrl) variant.args.tab_url_contains = conversationUrl;
    console.log(`[ab-sweep] ${variant.variant} DOM (${DOM_BACKEND})`);
    const dom = await callTool(tools, runtime, variant, 'dom');
    if (isAccountRisk(dom.result, dom.thrown)) {
      stopReason = 'BLOCKED_ACCOUNT_RISK';
      results.push({ variant: variant.variant, kind: variant.kind, dom, rpc: null, success: false, blocker: stopReason });
      writeJson();
      break;
    }
    console.log(`[ab-sweep] ${variant.variant} RPC`);
    const rpc = await callTool(tools, runtime, variant, 'rpc');
    if (isAccountRisk(rpc.result, rpc.thrown)) {
      stopReason = 'BLOCKED_ACCOUNT_RISK';
      results.push({ variant: variant.variant, kind: variant.kind, dom, rpc, success: false, blocker: stopReason });
      writeJson();
      break;
    }
    const success = verifyVariant(variant, dom, rpc);
    results.push({
      variant: variant.variant,
      kind: variant.kind,
      args: variant.args,
      expectedErrorCode: variant.expectedErrorCode || null,
      dom,
      rpc,
      success,
      verifier: variant.expectedErrorCode
        ? 'expected canonical guard code from both drivers'
        : (variant.kind === 'select_model' ? 'selected field equality + RPC ack + read-only picker readback evidence' : 'DOM-compatible success shape + RPC ack')
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
  stopReason = /429|quota|rate.?limit/i.test(error?.message || '') ? 'BLOCKED_ACCOUNT_RISK' : 'UNCAUGHT_ERROR';
  results.push({ variant: 'uncaught', success: false, error: error?.stack || error?.message || String(error) });
  writeJson();
  console.error(error?.stack || error?.message || String(error));
  process.exit(stopReason === 'BLOCKED_ACCOUNT_RISK' ? 42 : 1);
});
