const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const outDir = path.join('.runs', 'postship-fix-wave-9', 'workflows');
const probeDir = path.join('.runs', 'postship-fix-wave-9', 'probes');
fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(probeDir, { recursive: true });

const workflows = [
  { cluster: 'C', name: 'gemini-send-web-search-mgr', file: 'examples/workflows/gemini-gemini-send-web-search-mgr.yaml', timeoutMs: 240_000 },
  { cluster: 'C', name: 'gemini-veo-quota-error-mgr', file: 'examples/workflows/gemini-gemini-veo-quota-error-mgr.yaml', timeoutMs: 300_000 },
  { cluster: 'D', name: 'gemini-image-draft', file: 'examples/workflows/gemini-image-draft.yaml', timeoutMs: 180_000 },
  { cluster: 'D', name: 'research-database-search-dry-run', file: 'examples/workflows/research-database-search-dry-run.yaml', timeoutMs: 180_000 },
  { cluster: 'A', name: 'gemini-gemini-canvas-edit-mgr', file: 'examples/workflows/gemini-gemini-canvas-edit-mgr.yaml', timeoutMs: 240_000 },
  { cluster: 'A', name: 'gemini-canvas-to-docs-mgr', file: 'examples/workflows/gemini-canvas-to-docs-mgr.yaml', timeoutMs: 450_000 },
  { cluster: 'H', name: 'chatgpt-codex-submit-task-ext-fallback', file: 'examples/workflows/chatgpt-chatgpt-codex-submit-task-ext-fallback.yaml', timeoutMs: 390_000, chatgpt: true },
  { cluster: 'H', name: 'chatgpt-generate-file-pptx-ext', file: 'examples/workflows/chatgpt-chatgpt-generate-file-pptx-ext.yaml', timeoutMs: 420_000, chatgpt: true, probe: 'chatgpt-pptx-chip.json' },
  { cluster: 'E', name: 'claude-design-generate-mgr', file: 'examples/workflows/claude-claude-design-generate-mgr.yaml', timeoutMs: 520_000, probe: 'claude-design-hang.json' },
  { cluster: 'E', name: 'claude-design-present-mgr', file: 'examples/workflows/claude-claude-design-present-mgr.yaml', timeoutMs: 240_000, probe: 'claude-design-hang.json' },
  { cluster: 'F', name: 'claude-generate-file-pptx-ext', file: 'examples/workflows/claude-claude-generate-file-pptx-ext.yaml', timeoutMs: 420_000, probe: 'claude-pptx-handoff.json' },
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const summaryPath = path.join(outDir, 'summary.json');
const results = [];
let lastChatgptFinishedMs = 0;
let stoppedForRateLimit = false;

function tail(text, n = 4000) {
  if (!text) return '';
  return text.length <= n ? text : text.slice(text.length - n);
}

function tryJson(text) {
  if (!text || !text.trim()) return null;
  try { return JSON.parse(text.trim()); } catch {}
  const trimmed = text.trim();
  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first >= 0 && last > first) {
    try { return JSON.parse(trimmed.slice(first, last + 1)); } catch {}
  }
  return null;
}

function rateLimited(text, parsed) {
  const haystack = `${text || ''}\n${parsed ? JSON.stringify(parsed) : ''}`;
  return /(?:\b429\b|rate\s*limit|too many requests)/i.test(haystack);
}

function workflowPass(close, timedOut, parsedStdout, parsedStderr) {
  if (timedOut || close.code !== 0) return false;
  if (parsedStdout && typeof parsedStdout === 'object' && parsedStdout.ok === false) return false;
  if (parsedStderr && typeof parsedStderr === 'object' && parsedStderr.ok === false) return false;
  return true;
}

function summarizeWorkflowJson(parsed) {
  if (!parsed || typeof parsed !== 'object') return null;
  const firstFailed = Array.isArray(parsed.results) ? parsed.results.find((r) => !r.ok) : null;
  return {
    ok: parsed.ok,
    id: parsed.id || parsed.plan?.id,
    status: parsed.status,
    errorCode: parsed.errorCode || firstFailed?.data?.errorCode,
    message: parsed.message || firstFailed?.message,
    runId: parsed.runId,
  };
}

async function closeChatgptConversationTabs() {
  try {
    const { chromium } = require('playwright');
    const browser = await chromium.connectOverCDP('http://127.0.0.1:9223', { timeout: 15000 });
    try {
      const context = browser.contexts()[0] || await browser.newContext();
      const pages = context.pages();
      const keep = await context.newPage();
      await keep.goto('https://chatgpt.com/', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => undefined);
      for (const page of pages) {
        const url = String(page.url?.() || '');
        if (/https:\/\/(?:chatgpt|chat)\.com\//i.test(url)) await page.close({ runBeforeUnload: false }).catch(() => undefined);
      }
    } finally {
      await browser.close().catch(() => undefined);
    }
  } catch (error) {
    fs.writeFileSync(path.join(probeDir, 'chatgpt-close-tabs-error.json'), JSON.stringify({ at: new Date().toISOString(), error: String(error?.stack || error) }, null, 2));
  }
}

async function captureCdpProbe(port, outName, kind) {
  try {
    const { chromium } = require('playwright');
    const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 15000 });
    const contexts = browser.contexts();
    const pages = contexts.flatMap((context) => context.pages());
    const payload = { kind, capturedAt: new Date().toISOString(), port, pages: [] };
    for (const page of pages) {
      const url = String(page.url?.() || '');
      const title = await page.title().catch(() => '');
      const data = await page.evaluate((probeKind) => {
        const visible = (el) => {
          const r = el.getBoundingClientRect();
          const s = getComputedStyle(el);
          return !!(r.width && r.height && s.visibility !== 'hidden' && s.display !== 'none');
        };
        const summarize = (el, index) => ({
          index,
          tag: el.tagName,
          role: el.getAttribute('role'),
          aria: el.getAttribute('aria-label'),
          testid: el.getAttribute('data-testid') || el.getAttribute('data-test-id'),
          href: el.getAttribute('href'),
          download: el.getAttribute('download'),
          text: (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 180),
          visible: visible(el),
          classes: String(el.className || '').slice(0, 160),
        });
        const buttons = Array.from(document.querySelectorAll('button, a, [role="button"], [role="menuitem"], [data-testid], [data-test-id]')).map(summarize).filter((x) => {
          const text = `${x.text} ${x.aria || ''} ${x.testid || ''} ${x.href || ''}`;
          if (probeKind === 'chatgpt-pptx') return /download|pptx|presentation|file|attachment/i.test(text);
          if (probeKind === 'claude-pptx') return /download|pptx|presentation|file|attachment|view/i.test(text);
          if (probeKind === 'claude-design') return /present|open|html|iframe|design|download/i.test(text);
          return true;
        }).slice(0, 80);
        const iframes = Array.from(document.querySelectorAll('iframe')).map((iframe, index) => ({
          index,
          src: iframe.getAttribute('src'),
          testid: iframe.getAttribute('data-testid') || iframe.getAttribute('data-test-id'),
          title: iframe.getAttribute('title'),
          visible: visible(iframe),
        }));
        return { location: location.href, buttons, iframes, bodyText: (document.body?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 2000) };
      }, kind).catch((error) => ({ evaluateError: String(error?.message || error) }));
      payload.pages.push({ url, title, data, frameUrls: page.frames().map((f) => String(f.url?.() || '')).slice(0, 30) });
    }
    await browser.close().catch(() => undefined);
    fs.writeFileSync(path.join(probeDir, outName), JSON.stringify(payload, null, 2));
  } catch (error) {
    fs.writeFileSync(path.join(probeDir, outName), JSON.stringify({ kind, capturedAt: new Date().toISOString(), port, error: String(error?.stack || error) }, null, 2));
  }
}

async function captureProbeForWorkflow(workflow) {
  if (workflow.name === 'chatgpt-generate-file-pptx-ext') await captureCdpProbe(9223, 'chatgpt-pptx-chip.json', 'chatgpt-pptx');
  if (workflow.name === 'claude-design-generate-mgr' || workflow.name === 'claude-design-present-mgr') await captureCdpProbe(9224, 'claude-design-hang.json', 'claude-design');
  if (workflow.name === 'claude-generate-file-pptx-ext') await captureCdpProbe(9224, 'claude-pptx-handoff.json', 'claude-pptx');
}

async function runOne(workflow, index, attempt = 0) {
  if (workflow.chatgpt && lastChatgptFinishedMs) {
    const wait = Math.max(0, 30_000 - (Date.now() - lastChatgptFinishedMs));
    if (wait > 0) {
      console.log(`[chatgpt-rate-cap] sleeping ${wait}ms before ${workflow.name}`);
      await sleep(wait);
    }
  }
  const startedAt = new Date();
  console.log(`\n[${index + 1}/${workflows.length}] START ${workflow.name} attempt=${attempt + 1} ${startedAt.toISOString()} timeout=${workflow.timeoutMs}`);
  const base = attempt ? `${workflow.name}.retry${attempt}` : workflow.name;
  const stdoutPath = path.join(outDir, `${base}.json`);
  const stderrPath = path.join(outDir, `${base}.stderr`);
  const metaPath = path.join(outDir, `${base}.meta.json`);
  for (const p of [stdoutPath, stderrPath, metaPath]) { try { fs.rmSync(p, { force: true }); } catch {} }
  const child = spawn('node', ['dist/src/cli.js', 'workflow:run', workflow.file, '--json'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, DISPLAY: process.env.DISPLAY || ':0', PW_CHROMIUM_ATTACH_TO_OTHER: '1' },
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk.toString(); fs.appendFileSync(stdoutPath, chunk); });
  child.stderr.on('data', (chunk) => { stderr += chunk.toString(); fs.appendFileSync(stderrPath, chunk); process.stderr.write(chunk); });

  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    child.kill('SIGTERM');
    setTimeout(() => { if (!child.killed) child.kill('SIGKILL'); }, 10_000).unref();
  }, workflow.timeoutMs);

  const close = await new Promise((resolve) => child.on('close', (code, signal) => resolve({ code, signal })));
  clearTimeout(timer);
  const finishedAt = new Date();
  const parsedStdout = tryJson(stdout);
  const parsedStderr = tryJson(stderr);
  const hitRateLimit = workflow.chatgpt && rateLimited(`${stdout}\n${stderr}`, parsedStdout || parsedStderr);
  const pass = workflowPass(close, timedOut, parsedStdout, parsedStderr);
  const result = {
    name: workflow.name,
    cluster: workflow.cluster,
    file: workflow.file,
    attempt: attempt + 1,
    pass,
    exitCode: close.code,
    signal: close.signal,
    timedOut,
    rateLimited: hitRateLimit,
    deferredRateLimit: false,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt - startedAt,
    stdoutPath,
    stderrPath,
    stdoutTail: tail(stdout, 2500),
    stderrTail: tail(stderr, 3000),
    parsedStdoutSummary: summarizeWorkflowJson(parsedStdout),
    parsedStderrSummary: summarizeWorkflowJson(parsedStderr),
  };

  if (workflow.chatgpt) {
    lastChatgptFinishedMs = Date.now();
    await closeChatgptConversationTabs();
  }

  if (hitRateLimit && attempt === 0) {
    result.retryScheduledAfterMs = 180_000;
    fs.writeFileSync(metaPath, JSON.stringify(result, null, 2));
    console.log(`[${index + 1}/${workflows.length}] 429/RATE LIMIT ${workflow.name}; sleeping 180000ms then retrying once`);
    await sleep(180_000);
    return runOne(workflow, index, 1);
  }
  if (hitRateLimit && attempt > 0) {
    result.deferredRateLimit = true;
    result.pass = false;
    stoppedForRateLimit = true;
  }

  fs.writeFileSync(metaPath, JSON.stringify(result, null, 2));
  results.push(result);
  fs.writeFileSync(summaryPath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    passCount: results.filter((r) => r.pass).length,
    total: results.length,
    stoppedForRateLimit,
    results,
  }, null, 2));
  console.log(`[${index + 1}/${workflows.length}] ${result.pass ? 'PASS' : result.deferredRateLimit ? 'DEFERRED_RATE_LIMIT' : 'FAIL'} ${workflow.name} duration=${result.durationMs}ms exit=${close.code}${timedOut ? ' timedOut' : ''}`);
  await captureProbeForWorkflow(workflow);
  return result;
}

(async () => {
  for (let i = 0; i < workflows.length; i += 1) {
    await runOne(workflows[i], i);
    if (stoppedForRateLimit) break;
    if (i < workflows.length - 1) {
      const isChatGap = workflows[i].chatgpt || workflows[i + 1].chatgpt;
      const gap = isChatGap ? 30_000 : 10_000;
      console.log(`[sleep] ${gap}ms for ${isChatGap ? 'chatgpt rate cap/tab hygiene' : 'tab hygiene'}`);
      await sleep(gap);
    }
  }
  const passCount = results.filter((r) => r.pass).length;
  console.log(`\nSUMMARY ${passCount}/${results.length} PASS${stoppedForRateLimit ? ' (stopped for DEFERRED_RATE_LIMIT)' : ''}`);
  process.exit(!stoppedForRateLimit && passCount >= 6 ? 0 : 2);
})().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});
