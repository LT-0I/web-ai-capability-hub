#!/usr/bin/env node
import fs from 'node:fs/promises';
import fssync from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { chromium } from 'playwright';

const ROOT = process.cwd();
const OUT = path.resolve('.runs/path-c-claude-rpc/wave-b4-artifact-research-design/captures-recaptured');
const WAVE_A = path.resolve('.runs/path-c-claude-rpc/wave-a-captures');
const CDP = process.env.CDP_URL || 'http://127.0.0.1:9224';
const MIN_GAP_MS = Number(process.env.RECAPTURE_GAP_MS || 30000);
const PROJECT_URL = process.env.CLAUDE_DESIGN_PROJECT_URL || 'https://claude.ai/design/p/6b373bb0-fe5f-4558-8040-ea03c3becb4a';
const HTML_CHAT_URL = process.env.CLAUDE_HTML_CHAT_URL || 'https://claude.ai/chat/703edfc7-662f-4a00-9f93-ad228335e257';
const ORG_ID = '9a23efa1-be5a-4da2-8039-74492ab9877e';
const HTML_CONV_ID = '703edfc7-662f-4a00-9f93-ad228335e257';
const DESIGN = {
  root: 'https://claude.ai/design',
  nameInput: 'input[placeholder="Project name"]',
  create: '[data-testid="create-project-button"], button:has-text("Create")',
  composer: 'textarea[data-testid="chat-composer-input"], textarea',
  send: '[data-testid="chat-send-button"], button[aria-label*="Send" i]',
  mount: 'textarea[data-testid="chat-composer-input"], input[placeholder="Project name"], iframe[data-testid="html-viewer-iframe"], iframe[src*="claudeusercontent.com"], button:has-text("Present")',
  iframe: 'iframe[data-testid="html-viewer-iframe"], iframe[data-testid="present-mode-iframe"], iframe[src*="claudeusercontent.com"]',
  present: 'xpath=//button[contains(normalize-space(.),"Present")]'
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function ensureDir(d){ await fs.mkdir(d,{recursive:true}); }
async function writeJson(file,obj){ await fs.writeFile(file, JSON.stringify(obj,null,2)); }
function safeName(s){ return String(s).replace(/[^a-zA-Z0-9_.=-]+/g,'_'); }
function apiPath(url='') { try { const u = new URL(url); return `${u.pathname}${u.search}`.replace(/\/api\/organizations\/[0-9a-f-]{36}/ig, '/api/organizations/<org>').replace(/\/(chat_conversations|conversations|artifacts|projects)\/[0-9a-f-]{36}/ig, '/$1/<id>'); } catch { return url; } }
function isRisk(text='', url=''){ return /429|rate.?limit|usage limit|too many requests|account locked|captcha|verify you are human|just a moment/i.test(`${url}\n${text}`); }
async function guard(page, operation){
  const text = await page.locator('body').innerText({ timeout: 3000 }).catch(()=> '');
  const url = page.url();
  if (/\/login|\/signup/.test(url)) throw Object.assign(new Error(`LOGIN_REQUIRED at ${url}`), { stop_reason: 'LOGIN_REQUIRED' });
  if (isRisk(text, url)) throw Object.assign(new Error(`BLOCKED_ACCOUNT_RISK at ${url}`), { stop_reason: 'BLOCKED_ACCOUNT_RISK', operation });
}
async function attach(page, records){
  page.on('request', req => {
    const url = req.url();
    if (!/claude\.ai|claudeusercontent\.com|anthropic\.com/.test(url)) return;
    const rec = { seq: records.length + 1, ts: new Date().toISOString(), event: 'request', method: req.method(), url, resourceType: req.resourceType(), postData: req.postData() || '' };
    records.push(rec);
  });
  page.on('response', async res => {
    const url = res.url();
    if (!/claude\.ai|claudeusercontent\.com|anthropic\.com/.test(url)) return;
    const rec = records.find(r => r.url === url && !r.status) || { seq: records.length + 1, ts: new Date().toISOString(), event: 'response', method: '', url, resourceType: '', postData: '' };
    rec.status = res.status();
    rec.contentType = res.headers()['content-type'] || '';
    if (!records.includes(rec)) records.push(rec);
    if (/application\/json|text\/event-stream|text\/html|text\/plain/.test(rec.contentType || '') && String(url).length < 400) {
      rec.bodyPreview = (await res.text().catch(()=> '')).slice(0, 2000);
    }
  });
}
async function clickFirst(page, selector){
  const loc = page.locator(selector).first();
  await loc.waitFor({ state: 'visible', timeout: 30000 });
  await loc.click({ timeout: 15000, force: true });
}
async function fillFirst(page, selector, text){
  const loc = page.locator(selector).first();
  await loc.waitFor({ state: 'visible', timeout: 30000 });
  await loc.fill(text, { timeout: 10000 }).catch(async () => { await loc.click(); await page.keyboard.insertText(text); });
}
async function snapshot(page){
  return await page.evaluate(() => ({
    url: location.href,
    title: document.title,
    text: (document.body?.innerText || '').slice(0, 2500),
    iframes: Array.from(document.querySelectorAll('iframe')).map(el => ({ src: el.getAttribute('src'), testid: el.getAttribute('data-testid'), srcdocLen: (el.getAttribute('srcdoc') || '').length })),
    resources: performance.getEntriesByType('resource').map(e => ({ name: e.name, initiatorType: e.initiatorType, duration: e.duration })).filter(e => /claude\.ai|claudeusercontent\.com|anthropic\.com/.test(e.name)).slice(-80)
  }));
}
async function saveOperation(operation, page, records, actionResult, extra={}){
  const dir = path.join(OUT, safeName(operation));
  await ensureDir(dir);
  const snap = await snapshot(page).catch(e => ({ error: String(e), url: page.url() }));
  await writeJson(path.join(dir, 'network-log.json'), { operation, actionResult, records, snapshot: snap, extra });
  const claudeApi = records.filter(r => (/^https:\/\/claude\.ai\/api\//.test(r.url || '') || /^https:\/\/claude\.ai\/design\/anthropic\.omelette\.api/.test(r.url || '')) && !/event_logging|rum/.test(r.url || ''));
  const primary = claudeApi.find(r => /completion|tool_result|design|projects|artifacts/.test(r.url || '')) || claudeApi[0] || null;
  const summary = {
    operation_id: operation,
    capture_status: primary ? 'CAPTURED' : 'RPC_NOT_AVAILABLE',
    blocker: primary ? '' : 'No replayable Claude same-origin RPC roundtrip after DOM navigation to mounted Claude surface; observed only client-side DOM/claudeusercontent activity',
    surface_url: snap.url || page.url(),
    mount_selectors: operation.includes('design') ? [DESIGN.mount] : ['main', 'iframe', 'button[aria-label*="Download" i]'],
    endpoint_count: new Set(claudeApi.map(r => r.url)).size,
    endpoints: [...new Set(claudeApi.map(r => r.url))],
    api_paths: [...new Set(claudeApi.map(r => apiPath(r.url)))],
    primary_endpoint: primary?.url || '',
    primary_api_path: primary ? apiPath(primary.url) : '',
    captured_at: new Date().toISOString(),
    extra
  };
  await writeJson(path.join(dir, 'capture-summary.json'), summary);
  return summary;
}
function capturedHtmlBody(){
  const p = path.join(WAVE_A, 'webai_claude_generate_file--html_artifact/requests/request-24.body.txt');
  const parsed = JSON.parse(fssync.readFileSync(p, 'utf8'));
  parsed.prompt = `${parsed.prompt} DOM_NAV_RECAPTURE_${Date.now()}`;
  if (parsed.turn_message_uuids) parsed.turn_message_uuids = { human_message_uuid: crypto.randomUUID(), assistant_message_uuid: crypto.randomUUID() };
  return JSON.stringify(parsed);
}
async function htmlArtifact(page){
  await page.goto(HTML_CHAT_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('main, iframe, button[aria-label*="Download" i]', { state: 'attached', timeout: 30000 }).catch(()=>{});
  await guard(page, 'webai_claude_generate_file--html_artifact');
  const records = [];
  await attach(page, records);
  const body = capturedHtmlBody();
  const fetchResult = await page.evaluate(async ({ url, body }) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 120000);
    try {
      const response = await fetch(url, { method: 'POST', credentials: 'include', headers: { accept: 'text/event-stream', 'content-type': 'application/json' }, body, signal: controller.signal });
      const text = await response.text();
      return { status: response.status, statusText: response.statusText, contentType: response.headers.get('content-type'), url: response.url, textPreview: text.slice(0, 3000), bytes: text.length };
    } finally {
      clearTimeout(timer);
    }
  }, { url: `https://claude.ai/api/organizations/${ORG_ID}/chat_conversations/${HTML_CONV_ID}/completion`, body });
  await sleep(2000);
  return saveOperation('webai_claude_generate_file--html_artifact', page, records, { fetchResult }, { bodyPreview: body.slice(0, 1000) });
}
async function designCreate(page){
  await page.goto(DESIGN.root, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector(DESIGN.nameInput, { state: 'visible', timeout: 30000 });
  await guard(page, 'webai_claude_design_create_project--basic');
  const records = [];
  await attach(page, records);
  await fillFirst(page, DESIGN.nameInput, `Wave B4 RPC ${Date.now()}`);
  await clickFirst(page, DESIGN.create);
  await page.waitForURL(/\/design\/p\//, { timeout: 45000 }).catch(()=>{});
  await sleep(5000);
  return saveOperation('webai_claude_design_create_project--basic', page, records, { currentUrl: page.url() });
}
async function designGenerate(page){
  await page.goto(PROJECT_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector(DESIGN.mount, { state: 'attached', timeout: 30000 }).catch(()=>{});
  await guard(page, 'webai_claude_design_generate--html');
  const records = [];
  await attach(page, records);
  const prompt = `RPC_CLAUDE_DESIGN_GENERATE_B4_${Date.now()}: Create a tiny HTML page that says OK.`;
  await fillFirst(page, DESIGN.composer, prompt);
  await clickFirst(page, DESIGN.send).catch(async () => page.keyboard.press('Enter'));
  await page.waitForSelector(DESIGN.iframe, { state: 'attached', timeout: 120000 }).catch(()=>{});
  await sleep(5000);
  return saveOperation('webai_claude_design_generate--html', page, records, { prompt, currentUrl: page.url() });
}
async function designGetHtml(page){
  const viewer = PROJECT_URL.includes('?') ? `${PROJECT_URL}&file=index.html` : `${PROJECT_URL}?file=index.html`;
  await page.goto(viewer, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector(DESIGN.iframe, { state: 'attached', timeout: 30000 }).catch(()=>{});
  await guard(page, 'webai_claude_design_get_html--existing_project');
  const records = [];
  await attach(page, records);
  const read = await page.evaluate(async () => {
    const iframe = document.querySelector('iframe[data-testid="html-viewer-iframe"], iframe[src*="claudeusercontent.com"]');
    const src = iframe?.getAttribute('src') || '';
    let fetched = null;
    if (src) {
      try {
        const response = await fetch(src, { credentials: 'include' });
        const text = await response.text();
        fetched = { status: response.status, url: response.url, contentType: response.headers.get('content-type'), textPreview: text.slice(0, 1200), bytes: text.length };
      } catch (error) { fetched = { error: String(error) }; }
    }
    return { iframeSrc: src, fetched };
  });
  await sleep(3000);
  return saveOperation('webai_claude_design_get_html--existing_project', page, records, { read });
}
async function designPresent(page){
  const viewer = PROJECT_URL.includes('?') ? `${PROJECT_URL}&file=index.html` : `${PROJECT_URL}?file=index.html`;
  await page.goto(viewer, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector(DESIGN.mount, { state: 'attached', timeout: 30000 }).catch(()=>{});
  await guard(page, 'webai_claude_design_present--existing_project');
  const records = [];
  await attach(page, records);
  const beforePages = page.context().pages();
  await clickFirst(page, DESIGN.present).catch(()=>{});
  await sleep(5000);
  const newPages = page.context().pages().filter(p => !beforePages.includes(p));
  const presentUrl = newPages[0]?.url?.() || page.url();
  for (const p of newPages) await p.close({ runBeforeUnload: false }).catch(()=>{});
  return saveOperation('webai_claude_design_present--existing_project', page, records, { presentUrl });
}
async function cleanup(context, keep){
  for (const p of context.pages()) {
    if (p === keep || p.isClosed()) continue;
    const url = p.url();
    if (url === 'about:blank' || /claude\.ai|claudeusercontent\.com/.test(url)) await p.close({ runBeforeUnload: false }).catch(()=>{});
  }
}
async function main(){
  await ensureDir(OUT);
  const ops = [htmlArtifact, designGetHtml, designPresent, designCreate, designGenerate];
  const browser = await chromium.connectOverCDP(CDP);
  const context = browser.contexts()[0] || await browser.newContext();
  const page = await context.newPage();
  const summaries = [];
  try {
    for (let i=0; i<ops.length; i++) {
      if (i > 0) await sleep(MIN_GAP_MS);
      const summary = await ops[i](page);
      summaries.push(summary);
      if (summary.extra?.fetchResult?.status === 429 || /429|rate.?limit|usage limit/i.test(JSON.stringify(summary))) {
        throw Object.assign(new Error('BLOCKED_ACCOUNT_RISK'), { stop_reason: 'BLOCKED_ACCOUNT_RISK' });
      }
      console.log(JSON.stringify(summary, null, 2));
    }
    await writeJson(path.join(OUT, 'recapture-summary.json'), { summaries, finished_at: new Date().toISOString() });
  } finally {
    await cleanup(context, page).catch(()=>{});
    await page.goto('https://claude.ai/new', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(()=>{});
    await cleanup(context, page).catch(()=>{});
    await browser.close().catch(()=>{});
  }
}
main().catch(async e => {
  await ensureDir(OUT).catch(()=>{});
  await writeJson(path.join(OUT, 'recapture-blocked.json'), { error: String(e?.message || e), stop_reason: e?.stop_reason || '', at: new Date().toISOString() }).catch(()=>{});
  console.error(e.stack || String(e));
  process.exit(e?.stop_reason === 'BLOCKED_ACCOUNT_RISK' ? 42 : 1);
});
