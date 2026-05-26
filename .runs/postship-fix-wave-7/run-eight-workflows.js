#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, '.runs/postship-fix-wave-7/workflows');
fs.mkdirSync(OUT_DIR, { recursive: true });

const workflows = [
  { cluster: 'G', id: 'chatgpt-generate-file-csv-ext', file: 'examples/workflows/chatgpt-chatgpt-generate-file-csv-ext.yaml', generateFile: true },
  { cluster: 'G', id: 'chatgpt-generate-file-docx-ext', file: 'examples/workflows/chatgpt-chatgpt-generate-file-docx-ext.yaml', generateFile: true },
  { cluster: 'G', id: 'chatgpt-generate-file-md-ext', file: 'examples/workflows/chatgpt-chatgpt-generate-file-md-ext.yaml', generateFile: true },
  { cluster: 'G', id: 'chatgpt-generate-file-pptx-ext', file: 'examples/workflows/chatgpt-chatgpt-generate-file-pptx-ext.yaml', generateFile: true },
  { cluster: 'F#50', id: 'chatgpt-generate-file-py-ext', file: 'examples/workflows/chatgpt-chatgpt-generate-file-py-ext.yaml', generateFile: true },
  { cluster: 'H', id: 'chatgpt-canvas-create-export-ext', file: 'examples/workflows/chatgpt-canvas-create-export-ext.yaml' },
  { cluster: 'H', id: 'chatgpt-codex-submit-task-ext-fallback', file: 'examples/workflows/chatgpt-chatgpt-codex-submit-task-ext-fallback.yaml' },
  { cluster: 'H', id: 'chatgpt-send-web-search-ext', file: 'examples/workflows/chatgpt-chatgpt-send-web-search-ext.yaml' }
];

function now() { return new Date().toISOString(); }
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function outFile(id, suffix) { return path.join(OUT_DIR, `${id}${suffix}`); }
function detect429(...texts) { return /(?:\b429\b|rate limit|too many requests|too many messages|temporarily unavailable)/i.test(texts.filter(Boolean).join('\n')); }
function parseJsonFromText(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return undefined;
  try { return JSON.parse(trimmed); } catch {}
  const lines = trimmed.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    try { return JSON.parse(lines[i]); } catch {}
  }
  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first >= 0 && last > first) {
    try { return JSON.parse(trimmed.slice(first, last + 1)); } catch {}
  }
  return undefined;
}
function stepFailures(parsed) {
  const results = Array.isArray(parsed?.results) ? parsed.results : [];
  return results.filter((r) => r && r.ok === false).map((r) => ({ stepId: r.stepId, code: r.errorCode || r.error_code, message: r.message || r.error || '' }));
}
async function closeChatgptTabs(label) {
  const event = { at: now(), label, ok: false, closed: 0, home: false, error: undefined };
  try {
    const { ManagedBrowserLauncher } = require(path.join(ROOT, 'dist/src/browser/managedLauncher.js'));
    const launcher = new ManagedBrowserLauncher();
    const status = await launcher.launch({ profile: 'chatgpt', url: 'https://chatgpt.com/', reuseExisting: true });
    const browser = await launcher.connectOverCdp(status);
    const context = browser.contexts()[0] || await browser.newContext();
    let homePage;
    for (const page of context.pages()) {
      const url = page.url();
      const isHome = /^https:\/\/chatgpt\.com\/?(?:[?#].*)?$/i.test(url);
      const isChatgpt = /^https:\/\/chatgpt\.com(?:\/|$)/i.test(url);
      if (isHome && !homePage) { homePage = page; continue; }
      if (isChatgpt) { await page.close().catch(() => undefined); event.closed += 1; }
    }
    if (!homePage || homePage.isClosed?.()) {
      homePage = await context.newPage();
      await homePage.goto('https://chatgpt.com/', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => undefined);
    } else if (!/^https:\/\/chatgpt\.com\/?(?:[?#].*)?$/i.test(homePage.url())) {
      await homePage.goto('https://chatgpt.com/', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => undefined);
    }
    event.home = true;
    event.ok = true;
    await launcher.close('chatgpt', 'disconnect').catch(() => undefined);
  } catch (error) {
    event.error = error instanceof Error ? error.message : String(error);
  }
  fs.appendFileSync(path.join(OUT_DIR, 'chatgpt-tab-discipline.jsonl'), `${JSON.stringify(event)}\n`);
  console.log(`[${now()}] tab discipline ${label}: ${event.ok ? 'ok' : 'failed'} closed=${event.closed}${event.error ? ` error=${event.error}` : ''}`);
  return event;
}
function runOnce(workflow, attempt) {
  return new Promise((resolve) => {
    const tag = attempt === 1 ? '' : `.attempt${attempt}`;
    const stdoutFile = outFile(workflow.id, `${tag}.stdout`);
    const stderrFile = outFile(workflow.id, `${tag}.stderr`);
    const jsonFile = outFile(workflow.id, `${tag}.json`);
    const startedAt = now();
    const child = spawn(process.execPath, ['dist/src/cli.js', 'workflow:run', workflow.file, '--json'], { cwd: ROOT, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', (chunk) => { const s = String(chunk); stdout += s; process.stdout.write(s); });
    child.stderr.on('data', (chunk) => { const s = String(chunk); stderr += s; process.stderr.write(s); });
    child.on('error', (error) => { stderr += `\n${error.stack || error.message || String(error)}\n`; });
    child.on('close', (code, signal) => {
      const finishedAt = now();
      fs.writeFileSync(stdoutFile, stdout);
      fs.writeFileSync(stderrFile, stderr);
      const parsed = parseJsonFromText(stdout) || parseJsonFromText(stderr);
      if (parsed !== undefined) fs.writeFileSync(jsonFile, JSON.stringify(parsed, null, 2));
      const ok = code === 0 && parsed && parsed.ok === true;
      const rateLimited = detect429(stdout, stderr, parsed ? JSON.stringify(parsed) : '');
      const record = {
        id: workflow.id,
        file: workflow.file,
        cluster: workflow.cluster,
        attempt,
        startedAt,
        finishedAt,
        exitCode: code,
        signal,
        ok: !!ok,
        rateLimited,
        outputJson: parsed !== undefined ? path.relative(ROOT, jsonFile) : undefined,
        stdout: path.relative(ROOT, stdoutFile),
        stderr: path.relative(ROOT, stderrFile),
        failures: parsed ? stepFailures(parsed) : [],
        finalResultKind: parsed?.finalResult?.kind,
        runId: parsed?.runId
      };
      fs.writeFileSync(outFile(workflow.id, `${tag}.result.json`), JSON.stringify(record, null, 2));
      resolve(record);
    });
  });
}
async function runWorkflow(workflow) {
  await closeChatgptTabs(`before-${workflow.id}`);
  console.log(`\n[${now()}] RUN ${workflow.id}`);
  let record = await runOnce(workflow, 1);
  if (record.rateLimited) {
    console.log(`[${now()}] 429/rate-limit detected for ${workflow.id}; sleeping 180s then retrying once`);
    await closeChatgptTabs(`after-429-${workflow.id}`);
    await sleep(180000);
    await closeChatgptTabs(`before-retry-${workflow.id}`);
    record = await runOnce(workflow, 2);
    if (record.rateLimited) record.stoppedOnSecond429 = true;
  }
  await closeChatgptTabs(`after-${workflow.id}`);
  return record;
}
async function main() {
  const startedAt = now();
  const results = [];
  for (let i = 0; i < workflows.length; i += 1) {
    if (i > 0) {
      const prev = workflows[i - 1];
      const pauseMs = prev.generateFile ? 45000 : 30000;
      console.log(`[${now()}] rate cap sleep ${pauseMs / 1000}s before next ChatGPT YAML`);
      await sleep(pauseMs);
    }
    const record = await runWorkflow(workflows[i]);
    results.push(record);
    console.log(`[${now()}] RESULT ${record.id}: ${record.ok ? 'PASS' : 'FAIL'} exit=${record.exitCode}${record.rateLimited ? ' rateLimited=true' : ''}${record.failures.length ? ` failures=${JSON.stringify(record.failures)}` : ''}`);
    if (record.stoppedOnSecond429) {
      for (const wf of workflows.slice(i + 1)) results.push({ id: wf.id, file: wf.file, cluster: wf.cluster, ok: false, deferred: true, reason: 'DEFERRED_RATE_LIMIT' });
      break;
    }
  }
  const pass = results.filter((r) => r.ok).length;
  const completed = results.filter((r) => !r.deferred).length;
  const deferred = results.filter((r) => r.deferred).length;
  const summary = {
    startedAt,
    finishedAt: now(),
    pass,
    fail: completed - pass,
    deferred,
    total: workflows.length,
    completed,
    shipGate: pass >= 5 && deferred === 0 ? 'PASS' : pass >= 5 ? 'PASS_PARTIAL_RATE_LIMIT' : 'STOP_BLOCKER',
    results
  };
  fs.writeFileSync(path.join(OUT_DIR, 'summary.json'), JSON.stringify(summary, null, 2));
  const md = [
    '# Post-ship fix wave 7 workflow re-smoke',
    '',
    `- Finished: ${summary.finishedAt}`,
    `- Result: ${pass}/${completed} PASS${deferred ? `, ${deferred} deferred` : ''} (gate: >=5/8 PASS)`,
    `- Ship gate: ${summary.shipGate}`,
    '',
    '| Cluster | Workflow | Result | Exit | Notes |',
    '|---|---|---:|---:|---|',
    ...results.map((r) => `| ${r.cluster} | ${r.id} | ${r.deferred ? 'DEFERRED_RATE_LIMIT' : r.ok ? 'PASS' : 'FAIL'} | ${r.exitCode ?? ''} | ${[
      r.rateLimited ? '429/rate-limit observed' : '',
      r.failures?.map((f) => `${f.stepId || '?'}:${f.code || ''}:${String(f.message || '').slice(0, 120).replace(/\|/g, '/')}`).join('; '),
      r.finalResultKind ? `final=${r.finalResultKind}` : '',
      r.reason || ''
    ].filter(Boolean).join('; ')} |`),
    ''
  ].join('\n');
  fs.writeFileSync(path.join(OUT_DIR, 'summary.md'), md);
  console.log(`\n${md}`);
  if (pass < 5) process.exitCode = 2;
}
main().catch((error) => { console.error(error?.stack || error); process.exitCode = 1; });
