#!/usr/bin/env node
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { performance } = require('node:perf_hooks');
const { chromium } = require('playwright');

const repoRoot = process.cwd();
const outDir = path.join(repoRoot, '.runs/path-c-claude-rpc/wave-b4-artifact-research-design');
const resultsPath = path.join(outDir, 'ab-sweep-results.json');
const downloadsDir = path.join(outDir, 'ab-downloads');
const delayMs = Number(process.env.WEBAI_AB_SWEEP_DELAY_MS || 30000);
const profile = 'claude-9224';
const cdpEndpoint = 'http://127.0.0.1:9224';
const distToolsPath = path.join(repoRoot, 'dist/src/mcp/tools.js');
const tools = require(distToolsPath);

function existingCdpRuntime() {
  const status = { profile, profileDir: `/tmp/${profile}`, cdpEndpoint, cdpPort: 9224, connected: true, launchedByPackage: false, pages: [] };
  return { launcher: { launch: async () => status, status: async () => status, connectOverCdp: async () => chromium.connectOverCDP(cdpEndpoint) } };
}
const runtime = existingCdpRuntime();

const cases = [
  {
    family: 'generate_file',
    variant: 'csv_artifact',
    fn: 'webAiClaudeGenerateFile',
    env: 'WEBAI_CLAUDE_GENERATE_FILE_BACKEND',
    domBackend: 'extension-assisted-cdp',
    args: { profile, cdp_port: 9224, prompt: 'B4_AB_CSV_2026_05_27: Create a CSV file with one column status and one row OK.', expected_extension: 'csv', download_dir: path.join(downloadsDir, 'csv'), timeout_ms: 180000, response_timeout_ms: 180000 },
    expected: /status\s*,?\s*OK|status\s*\n\s*OK/i
  },
  {
    family: 'generate_file',
    variant: 'html_artifact',
    fn: 'webAiClaudeGenerateFile',
    env: 'WEBAI_CLAUDE_GENERATE_FILE_BACKEND',
    domBackend: 'extension-assisted-cdp',
    args: { profile, cdp_port: 9224, prompt: 'B4_AB_HTML_2026_05_27: Create a tiny HTML artifact with the visible text OK.', expected_extension: 'html', download_dir: path.join(downloadsDir, 'html'), timeout_ms: 180000, response_timeout_ms: 180000 },
    expected: /OK/i
  },
  {
    family: 'deep_research',
    variant: 'start',
    fn: 'webAiClaudeDeepResearch',
    env: 'WEBAI_CLAUDE_DEEP_RESEARCH_BACKEND',
    domBackend: 'extension-assisted-cdp',
    args: { profile, cdp_port: 9224, prompt: 'B4_AB_DEEP_RESEARCH_2026_05_27: Start a minimal deep research task about why apples float. Keep it short.', timeout_ms: 180000, response_timeout_ms: 180000 }
  },
  {
    family: 'design',
    variant: 'get_html_existing_project',
    fn: 'webAiClaudeDesignGetHtml',
    env: 'WEBAI_CLAUDE_DESIGN_BACKEND',
    domBackend: 'extension-assisted-cdp',
    args: { profile, cdp_port: 9224, project_url: 'https://claude.ai/design/p/6b373bb0-fe5f-4558-8040-ea03c3becb4a?file=index.html', download_dir: path.join(downloadsDir, 'design'), timeout_ms: 90000 },
    expected: /OK/i
  }
];

const skipped = [
  { family: 'design', variant: 'create_project_basic', status: 'RPC_NOT_AVAILABLE', justification: 'No stable replayable write RPC captured in Wave B4; known-DOM-only by write-time decision.' },
  { family: 'design', variant: 'generate_html', status: 'RPC_NOT_AVAILABLE', justification: 'No stable replayable streaming/write RPC captured in Wave B4; known-DOM-only by write-time decision.' },
  { family: 'design', variant: 'present_existing_project', status: 'RPC_NOT_AVAILABLE', justification: 'Observed as mounted viewer/presentation navigation without required replayable data RPC; known-DOM-only by write-time decision.' }
];

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function mkdirp(dir) { fs.mkdirSync(dir, { recursive: true }); }
function errorCode(value) { return value?.errorCode || value?.error_code || null; }
function accountRisk(value) { return /PLAN_OR_QUOTA_REQUIRED|SUBMCP_QUOTA_EXHAUSTED|\b429\b|rate.?limit|message_limit|quota|lockout|account.*locked/i.test(JSON.stringify(value || {})); }
function fileText(result) {
  const file = result?.path || result?.savedPath;
  if (typeof file === 'string' && file && fs.existsSync(file)) return fs.readFileSync(file, 'utf8').slice(0, 2000);
  return String(result?.response_text || result?.summary || result?.message || '').slice(0, 2000);
}
function redactResult(result) {
  if (!result || typeof result !== 'object') return result;
  const clone = JSON.parse(JSON.stringify(result));
  for (const key of ['response_text', 'summary', 'message']) if (typeof clone[key] === 'string' && clone[key].length > 500) clone[key] = `${clone[key].slice(0, 500)}…`;
  return clone;
}
function outputOk(testCase, call) {
  const out = call.output || {};
  if (call.error || errorCode(out) != null) return false;
  if (testCase.family === 'generate_file') return Boolean((out.path || out.savedPath) && fs.existsSync(out.path || out.savedPath) && testCase.expected.test(fileText(out)));
  if (testCase.family === 'deep_research') return Boolean(out.status === 'queued');
  if (testCase.family === 'design') return Boolean(out.savedPath && fs.existsSync(out.savedPath) && testCase.expected.test(fileText(out)));
  return true;
}
function domBaselineDegraded(call) {
  const haystack = JSON.stringify(call || {});
  return /CHROME_EXTENSION_NOT_CONNECTED|CDP endpoint did not become ready|ELEMENT_NOT_FOUND|querySelectorAll/i.test(haystack);
}
function checksum(file) {
  if (!file || !fs.existsSync(file)) return null;
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}
function summarizeCall(testCase, call) {
  const out = call.output || {};
  const file = out.path || out.savedPath || '';
  return { ...call, output: redactResult(out), text_preview: fileText(out).slice(0, 300), file_sha256: checksum(file) };
}

let lastLiveCallEnded = 0;
async function pace(label) {
  const elapsed = Date.now() - lastLiveCallEnded;
  const wait = lastLiveCallEnded ? Math.max(0, delayMs - elapsed) : 0;
  if (wait > 0) {
    console.error(`[ab-sweep] pacing ${Math.ceil(wait / 1000)}s before ${label}`);
    await sleep(wait);
  }
}
function setEnv(name, value) {
  const previous = process.env[name];
  if (value) process.env[name] = value;
  else delete process.env[name];
  return () => { if (previous === undefined) delete process.env[name]; else process.env[name] = previous; };
}
async function callDriver(testCase, backendKind) {
  const backend = backendKind === 'dom' ? testCase.domBackend : 'rpc';
  await pace(`${testCase.family}/${testCase.variant}/${backendKind}`);
  const restore = setEnv(testCase.env, backend);
  const started = performance.now();
  let output = null;
  let error = null;
  try {
    output = await tools[testCase.fn]({ ...testCase.args }, runtime);
  } catch (err) {
    error = { message: err?.message || String(err), stack: err?.stack || '' };
  } finally {
    lastLiveCallEnded = Date.now();
    restore();
  }
  const latency_ms = Math.round(performance.now() - started);
  const call = { backend, latency_ms, output, error };
  if (accountRisk(call)) throw Object.assign(new Error('BLOCKED_ACCOUNT_RISK'), { blockedAccountRisk: true, call });
  return call;
}
async function closeNonEssentialClaudeTabs() {
  let browser;
  try {
    browser = await chromium.connectOverCDP(cdpEndpoint);
    for (const context of browser.contexts()) {
      let keptNew = false;
      for (const page of context.pages()) {
        const url = page.url() || '';
        if (url === 'about:blank' || url.startsWith('chrome://')) { await page.close().catch(() => undefined); continue; }
        if (!/^https:\/\/(www\.)?claude\.ai\//.test(url)) continue;
        if (/^https:\/\/claude\.ai\/(new)?(?:[?#].*)?$/.test(url) && !keptNew) { keptNew = true; continue; }
        await page.close().catch(() => undefined);
      }
      if (!keptNew) {
        const page = await context.newPage();
        await page.goto('https://claude.ai/new', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => undefined);
      }
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error?.message || String(error) };
  } finally {
    await browser?.close?.().catch(() => undefined);
  }
}
function save(payload) { fs.writeFileSync(resultsPath, `${JSON.stringify(payload, null, 2)}\n`); }

mkdirp(outDir);
fs.rmSync(downloadsDir, { recursive: true, force: true });
mkdirp(downloadsDir);
const results = {
  started_at: new Date().toISOString(),
  profile,
  cdpEndpoint,
  delay_ms: delayMs,
  dist_tools_mtime_ms: fs.existsSync(distToolsPath) ? fs.statSync(distToolsPath).mtimeMs : null,
  variants_with_rpc_driver: cases.length,
  rows: [],
  skipped,
  pass_count: 0,
  verdict: 'RUNNING'
};
save(results);

try {
  for (const testCase of cases) {
    console.error(`[ab-sweep] ${testCase.family}/${testCase.variant} DOM`);
    const dom = await callDriver(testCase, 'dom');
    console.error(`[ab-sweep] ${testCase.family}/${testCase.variant} RPC`);
    const rpc = await callDriver(testCase, 'rpc');
    const domOk = outputOk(testCase, dom);
    const rpcOk = outputOk(testCase, rpc);
    const speedup = rpc.latency_ms > 0 ? Number((dom.latency_ms / rpc.latency_ms).toFixed(2)) : null;
    const domDegraded = !domOk && domBaselineDegraded(dom);
    const pass = Boolean(rpcOk && (domOk || domDegraded));
    results.rows.push({ variant: testCase.variant, family: testCase.family, pass, pass_basis: domOk ? 'dom_and_rpc_ok' : (domDegraded ? 'rpc_expected_output_dom_baseline_degraded' : 'rpc_or_dom_failed'), domOk, rpcOk, dom_baseline_degraded: domDegraded, speedup_dom_over_rpc: speedup, dom: summarizeCall(testCase, dom), rpc: summarizeCall(testCase, rpc) });
    results.pass_count = results.rows.filter((row) => row.pass).length;
    results.verdict = results.pass_count >= cases.length - 1 ? 'PASS_THRESHOLD' : 'RUNNING';
    save(results);
  }
  results.completed_at = new Date().toISOString();
  results.pass_count = results.rows.filter((row) => row.pass).length;
  results.verdict = results.pass_count >= cases.length - 1 ? 'PASS' : 'NEEDS_WORK';
  const closeResult = await closeNonEssentialClaudeTabs();
  results.close_tabs = closeResult;
  save(results);
  if (results.verdict !== 'PASS') process.exitCode = 1;
} catch (error) {
  results.completed_at = new Date().toISOString();
  results.blocked = error?.blockedAccountRisk ? 'BLOCKED_ACCOUNT_RISK' : (error?.message || String(error));
  results.verdict = error?.blockedAccountRisk ? 'BLOCKED_ACCOUNT_RISK' : 'NEEDS_WORK';
  if (error?.call) results.blocked_call = summarizeCall({ expected: /.*/ }, error.call);
  results.close_tabs = await closeNonEssentialClaudeTabs();
  save(results);
  process.exitCode = error?.blockedAccountRisk ? 42 : 1;
}
