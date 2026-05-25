import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { chromium } from 'playwright';

const RUN_DIR = '.runs/capability-explore-2026-05-25/gemini';
const DOWNLOAD_DIR = '/tmp/explore-2026-05-25/gemini';
const CHAT_ID = '260e7fc538aef136';
const PROMPT = 'Quick deep research: list 3 recent open-source LLM frameworks since 2025-01, one-sentence each. Deliver as a downloadable report.';
const HB = path.join(RUN_DIR, 'heartbeat.log');
const OUT = path.join(RUN_DIR, 'gemini-deep-research-mgr.monitor.json');
const REPORT_TXT = path.join(DOWNLOAD_DIR, 'gemini-deep-research-mgr-response.txt');
const deadline = Date.now() + 15 * 60 * 1000;
fs.mkdirSync(RUN_DIR, { recursive: true });
fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
function hb(msg) { fs.appendFileSync(HB, `${new Date().toISOString()} ${msg}\n`); }
function sha256(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function size(file) { try { return fs.statSync(file).size; } catch { return 0; } }
function latestDownloaded() {
  const files = fs.readdirSync(DOWNLOAD_DIR).map(name => path.join(DOWNLOAD_DIR, name)).filter(p => fs.statSync(p).isFile());
  return files.map(p => ({ path: p, size: size(p), mtime: fs.statSync(p).mtimeMs })).sort((a,b)=>b.mtime-a.mtime)[0] || null;
}
const frameworkTerms = [
  'LangGraph','LlamaIndex','Haystack','DSPy','AutoGen','CrewAI','Agno','Pydantic AI','smolagents','OpenAI Agents','Semantic Kernel','TensorZero','Letta','Crawl4AI','vLLM','SGLang','KTransformers','FastAgency','BeeAI','Mastra'
];
function frameworkHits(text) {
  const lower = text.toLowerCase();
  return frameworkTerms.filter(t => lower.includes(t.toLowerCase()));
}
function listLikeCount(text) {
  return (text.match(/(^|\n)\s*(?:[-*•]|\d+[.)])\s+\S+/g) || []).length;
}
function gateFromText(text) {
  const hits = frameworkHits(text);
  return {
    ok: hits.length >= 3 || (/framework/i.test(text) && listLikeCount(text) >= 3 && text.length > 400),
    framework_hits: hits,
    list_like_count: listLikeCount(text),
    response_chars: text.length
  };
}
async function extract(page) {
  return await page.evaluate(() => {
    const clean = (s) => (s || '').replace(/\s+\n/g, '\n').replace(/\n\s+/g, '\n').replace(/[ \t]+/g, ' ').trim();
    const responses = [...document.querySelectorAll('model-response')];
    const latest = responses.at(-1);
    const text = latest ? clean(latest.innerText || latest.textContent || '') : '';
    const body = clean(document.body.innerText || '');
    const buttons = [...document.querySelectorAll('button,[role="button"],[role="menuitem"],a')]
      .filter(el => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden'; })
      .map(el => ({ tag: el.tagName, role: el.getAttribute('role'), aria: el.getAttribute('aria-label'), text: clean(el.innerText || el.textContent || ''), href: el.getAttribute('href') || '', rect: (() => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; })() }));
    return { url: location.href, title: document.title, latest_response_text: text, body_text_tail: body.slice(-5000), buttons };
  });
}
async function clickIfPresent(page, patterns, label) {
  const candidates = await page.locator('button, [role="button"], [role="menuitem"], a').all();
  for (const loc of candidates) {
    const visible = await loc.isVisible().catch(() => false);
    if (!visible) continue;
    const aria = await loc.getAttribute('aria-label').catch(() => '') || '';
    const text = (await loc.innerText().catch(() => '') || '').replace(/\s+/g, ' ').trim();
    const hay = `${aria} ${text}`;
    if (patterns.some((re) => re.test(hay))) {
      await loc.click({ force: true, timeout: 5000 }).catch(() => undefined);
      hb(`clicked ${label}: ${hay.slice(0,120)}`);
      return hay;
    }
  }
  return null;
}

hb('G8 monitor start');
const browser = await chromium.connectOverCDP('http://127.0.0.1:9225');
const page = browser.contexts().flatMap(c => c.pages()).find(p => p.url().includes(CHAT_ID)) || browser.contexts().flatMap(c => c.pages()).find(p => p.url().includes('gemini.google.com/app'));
if (!page) throw new Error('Gemini target page not found');
await page.bringToFront().catch(() => undefined);
let startClicks = 0;
let downloadClicks = 0;
let last = null;
let terminal = null;
let lastLog = 0;
while (Date.now() < deadline) {
  await page.waitForTimeout(5000);
  last = await extract(page);
  const gate = gateFromText(last.latest_response_text || '');
  const dl = latestDownloaded();
  const stopVisible = await page.locator('button[aria-label*="Stop" i], button:has-text("Stop")').first().isVisible().catch(() => false);
  const start = startClicks < 2 ? await clickIfPresent(page, [/start research/i, /start researching/i, /begin research/i, /^start$/i, /run research/i], 'start-research') : null;
  if (start) { startClicks++; await page.waitForTimeout(5000); continue; }
  const download = downloadClicks < 2 ? await clickIfPresent(page, [/download( report)?/i, /export/i, /save as/i], 'download-report') : null;
  if (download) { downloadClicks++; await page.waitForTimeout(8000); }
  const currentDl = latestDownloaded();
  const artifactOk = currentDl && currentDl.size > 4096;
  if (artifactOk) {
    terminal = { ok: true, gate: 'download_artifact', artifact: currentDl, text_gate: gate, latest_response_text: last.latest_response_text };
    break;
  }
  if (gate.ok && !stopVisible) {
    fs.writeFileSync(REPORT_TXT, last.latest_response_text);
    terminal = { ok: true, gate: 'response_text', artifact: { path: REPORT_TXT, size: size(REPORT_TXT), sha256: sha256(REPORT_TXT) }, text_gate: gate, latest_response_text: last.latest_response_text };
    break;
  }
  if (Date.now() - lastLog > 30000) {
    hb(`G8 monitor progress chars=${gate.response_chars} hits=${gate.framework_hits.join('|') || '-'} list=${gate.list_like_count} stop=${stopVisible} dl=${dl ? `${dl.path}:${dl.size}` : '-'}`);
    lastLog = Date.now();
    fs.writeFileSync(OUT, JSON.stringify({ ok: false, in_progress: true, gate, stopVisible, latest_download: dl, last: { url: last.url, title: last.title, latest_response_text: (last.latest_response_text || '').slice(0,4000), body_text_tail: (last.body_text_tail || '').slice(-2000) } }, null, 2));
  }
}
if (!terminal) {
  last = last || await extract(page);
  const gate = gateFromText(last.latest_response_text || '');
  await page.screenshot({ path: path.join(RUN_DIR, 'g8-monitor-timeout.png'), fullPage: false }).catch(() => undefined);
  terminal = { ok: false, errorCode: 'COMMAND_TIMEOUT', error_code: 'COMMAND_TIMEOUT', gate, latest_download: latestDownloaded(), latest_response_text: last.latest_response_text, body_text_tail: last.body_text_tail };
}
fs.writeFileSync(OUT, JSON.stringify(terminal, null, 2));
hb(`G8 monitor done ok=${terminal.ok} gate=${terminal.gate || terminal.errorCode}`);
await browser.close();
if (!terminal.ok) process.exit(1);
