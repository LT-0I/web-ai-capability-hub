#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { spawn, spawnSync } = require('node:child_process');
const { chromium } = require('playwright');

const root = process.cwd();
const runDir = path.join(root, '.runs', 'wave-17');
const resultsDir = path.join(runDir, 'results');
const downloadsDir = path.join(runDir, 'downloads');
const probesDir = path.join(runDir, 'probes');
for (const dir of [runDir, resultsDir, downloadsDir, probesDir]) fs.mkdirSync(dir, { recursive: true });

const DB_ORDER = ['aps','asce','emerald','optica','opticsjournal','proquest','pubscholar','royalsoc','sae','siam'];
const HUNT_URLS = {
  aps: 'https://journals.aps.org/prl/recent',
  asce: 'https://ascelibrary.org/action/showPublications',
  emerald: 'https://www.emerald.com/insight/content',
  optica: 'https://opg.optica.org/ol/issue.cfm',
  opticsjournal: 'https://www.opticsjournal.net/',
  proquest: 'https://www.proquest.com/search?query=renewable%20energy%202024',
  pubscholar: 'https://pubscholar.cn/search?q=2024',
  royalsoc: 'https://royalsocietypublishing.org/journal/rsos/articles',
  sae: 'https://www.sae.org/publications/technical-papers',
  siam: 'https://epubs.siam.org/loi/sjnaam'
};
const PAYWALLED = new Set(['aps','asce','emerald','optica','opticsjournal','proquest','royalsoc','sae','siam']);
const MAX_ARTICLE_ATTEMPTS = Number(process.env.W17_MAX_ARTICLE_ATTEMPTS || 3); // first + max 2 retries
const BETWEEN_DB_MS = Number(process.env.W17_BETWEEN_DB_MS || 15000);
const SMOKE_TIMEOUT_MS = Number(process.env.W17_SMOKE_TIMEOUT_MS || 150000);
const STARTED_AT = Date.now();
const MAX_TOTAL_MS = Number(process.env.W17_MAX_TOTAL_MS || 6 * 60 * 60 * 1000);
const only = new Set(String(process.env.W17_ONLY || '').split(',').map(s => s.trim()).filter(Boolean));
const todo = DB_ORDER.filter(db => !only.size || only.has(db));

function nowIso() { return new Date().toISOString(); }
function log(...args) { console.log(`[${nowIso()}]`, ...args); }
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function writeJson(file, value) { fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n'); }
function readJson(file, fallback) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } }
function normalizePath(file) { return typeof file === 'string' ? file.replace(/^<home>/, process.env.HOME || '') : file; }
function pdfMagic(file) { try { return fs.readFileSync(normalizePath(file)).subarray(0,5).toString(); } catch { return null; } }
function jsonFrom(text) { const s = String(text || ''); const a = s.indexOf('{'); const b = s.lastIndexOf('}'); if (a < 0 || b < a) return null; try { return JSON.parse(s.slice(a, b + 1)); } catch { return null; } }
function sanitizeName(s) { return String(s || '').replace(/[\\/]+/g, '_').replace(/[^a-zA-Z0-9_.-]+/g, '_').slice(0, 120) || 'article'; }
function canonicalUrl(u) { try { const x = new URL(u); x.hash = ''; return x.toString(); } catch { return String(u || ''); } }
function elapsedExceeded() { return Date.now() - STARTED_AT > MAX_TOTAL_MS; }

function classify(parsed, raw, timedOut) {
  const hay = `${raw.stdout || ''}\n${raw.stderr || ''}\n${parsed?.message || ''}`;
  if (timedOut) return 'TIMEOUT';
  if (parsed?.ok && (!parsed?.path || pdfMagic(parsed.path) === '%PDF-')) return 'GREEN';
  const code = parsed?.errorCode || 'UNKNOWN';
  if (/429|rate.?limit|too many requests/i.test(hay)) return 'DEFERRED_RATE_LIMIT';
  if (code === 'PROFILE_NOT_FOUND') return 'NO_AUTH';
  if (/\b(401|403|418)\b|forbidden|unauthori[sz]ed|access denied|cookieAbsent|cookies_not_supported|login|sign in|institution|captcha|bot|akamai|cloudflare/i.test(hay)) return 'NO_AUTH';
  if (code === 'ELEMENT_NOT_FOUND') return 'SELECTOR_DRIFT';
  if (/\b404\b|not found|did not produce a PDF|non-pdf|text\/html|application\/xml/i.test(hay)) return 'URL_RESOLVE_FAIL';
  if (code === 'ARTIFACT_DOWNLOAD_TIMEOUT' || code === 'ARTIFACT_VERIFICATION_FAILED') return 'URL_RESOLVE_FAIL';
  return `FAIL_${code}`;
}

async function findFreePort(host = '127.0.0.1') {
  return await new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.on('error', reject);
    srv.listen(0, host, () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
  });
}

async function waitForCdp(port, timeoutMs = 65000) {
  const deadline = Date.now() + timeoutMs;
  let lastErr = null;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(1500) });
      if (res.ok) return await res.json();
      lastErr = new Error(`HTTP ${res.status}`);
    } catch (err) { lastErr = err; }
    await sleep(500);
  }
  throw new Error(`CDP endpoint did not become ready on ${port}: ${lastErr?.message || lastErr}`);
}

function chromeExecutable() {
  const candidates = [
    process.env.WAH_BROWSER_EXECUTABLE,
    process.env.CHROME_BIN,
    '/opt/google/chrome/chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser'
  ].filter(Boolean);
  for (const c of candidates) if (fs.existsSync(c)) return c;
  throw new Error('Chrome executable not found');
}

function profileDirFor(db) { return path.resolve(root, 'data', 'browser-profiles', `research-${db}`); }

function launchChromeForDb(db, url, port) {
  const profileDir = profileDirFor(db);
  fs.mkdirSync(profileDir, { recursive: true });
  const args = [
    `--remote-debugging-address=127.0.0.1`,
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    url
  ];
  const out = fs.openSync(path.join(runDir, `${db}-chrome.out.log`), 'a');
  const err = fs.openSync(path.join(runDir, `${db}-chrome.err.log`), 'a');
  const child = spawn(chromeExecutable(), args, {
    cwd: root,
    env: { ...process.env, DISPLAY: process.env.DISPLAY || ':0' },
    detached: true,
    stdio: ['ignore', out, err]
  });
  child.unref();
  return { child, profileDir, port, endpoint: `http://127.0.0.1:${port}` };
}

function killProfileChrome(db) {
  const profileDir = profileDirFor(db);
  const relProfileDir = path.join('data', 'browser-profiles', `research-${db}`);
  const patterns = [profileDir, relProfileDir];
  const killed = [];
  for (const pattern of patterns) {
    const pgrep = spawnSync('pgrep', ['-f', pattern], { encoding: 'utf8' });
    for (const raw of String(pgrep.stdout || '').split(/\s+/).filter(Boolean)) {
      const pid = Number(raw);
      if (!pid || pid === process.pid || killed.includes(pid)) continue;
      try { process.kill(pid, 'SIGTERM'); killed.push(pid); } catch {}
    }
  }
  return killed;
}

async function gotoSettled(page, url, label) {
  const record = { requested_url: url, label, response_status: null, final_url: null, error: null };
  try {
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 70000 });
    record.response_status = response?.status?.() ?? null;
  } catch (err) {
    record.error = err?.message || String(err);
  }
  await page.waitForLoadState('networkidle', { timeout: 25000 }).catch(() => undefined);
  await page.waitForTimeout(3000);
  record.final_url = page.url();
  return record;
}

async function dismissCookieBanners(page) {
  const selectors = [
    'button:has-text("Accept")', 'button:has-text("Accept all")', 'button:has-text("I Accept")', 'button:has-text("Agree")',
    'button:has-text("同意")', 'button:has-text("接受")', 'button:has-text("继续")', 'button#onetrust-accept-btn-handler',
    'a:has-text("Accept")', '[aria-label*="accept" i]'
  ];
  for (const sel of selectors) {
    const loc = page.locator(sel).first();
    if (await loc.count().catch(() => 0)) {
      await loc.click({ timeout: 1500 }).catch(() => undefined);
      await page.waitForTimeout(300).catch(() => undefined);
    }
  }
}

function deriveDocIdFromUrl(db, url) {
  const decoded = decodeURIComponent(String(url || ''));
  const doiPatterns = [
    /\/doi\/(?:abs|full|pdf|epdf)?\/?(10\.\d{4,9}\/[^?#\s]+)/i,
    /\/abstract\/(10\.\d{4,9}\/[^?#\s]+)/i,
    /\/pdf\/(10\.\d{4,9}\/[^?#\s]+)/i,
    /\/content\/doi\/(10\.\d{4,9}\/[^?#\s/]+(?:\/[^?#\s/]+)?)/i,
    /(10\.\d{4,9}\/[^?#\s]+)/i
  ];
  for (const re of doiPatterns) {
    const m = re.exec(decoded);
    if (m?.[1]) return m[1].replace(/\/$/, '');
  }
  if (db === 'sae') {
    const m = /\/content\/([0-9]{4}-[0-9]{2}-[0-9]{4,6})/i.exec(decoded);
    if (m) return `10.4271/${m[1]}`;
  }
  if (db === 'proquest') {
    const m = /\/docview\/(\d+)/i.exec(decoded);
    if (m) return `central:${m[1]}`;
  }
  if (db === 'opticsjournal') {
    const m = /\/Articles\/(OJ[0-9A-Za-z]+)\//i.exec(decoded);
    if (m) return m[1];
  }
  if (db === 'optica') {
    const uri = /[?&]uri=([^&#]+)/i.exec(decoded)?.[1];
    if (uri) return `optica:${uri}`;
  }
  if (db === 'pubscholar') return decoded;
  return null;
}

async function extractArticleMeta(page, db) {
  const meta = await page.evaluate(() => {
    const pick = (...selectors) => {
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        const value = el?.getAttribute('content') || el?.textContent || '';
        if (value.trim()) return value.trim();
      }
      return '';
    };
    const h1 = (document.querySelector('h1')?.textContent || '').replace(/\s+/g, ' ').trim();
    const title = pick('meta[name="citation_title"]', 'meta[property="og:title"]', 'meta[name="dc.Title"]') || h1 || document.title || '';
    const doi = pick('meta[name="citation_doi"]', 'meta[name="dc.Identifier"]', 'meta[name="DC.Identifier"]', 'meta[name="prism.doi"]');
    const canonical = document.querySelector('link[rel="canonical"]')?.href || location.href;
    const bodySample = (document.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 1000);
    return { title, doi, canonical, url: location.href, bodySample };
  }).catch(() => ({ title: '', doi: '', canonical: page.url(), url: page.url(), bodySample: '' }));
  const cleanDoi = String(meta.doi || '').match(/10\.\d{4,9}\/.+/)?.[0]?.replace(/^doi:/i, '').replace(/\s+$/, '').replace(/[;,.]$/, '') || '';
  const docId = cleanDoi || deriveDocIdFromUrl(db, meta.url) || deriveDocIdFromUrl(db, meta.canonical) || (db === 'pubscholar' ? meta.url : null);
  return { ...meta, doi: cleanDoi || null, doc_id: docId };
}

async function extractCandidates(page, db) {
  const anchors = await page.evaluate((dbArg) => {
    const out = [];
    const navish = /(login|sign\s*in|subscribe|alerts?|cart|purchase|privacy|terms|about|contact|help|account|institution|references?|citation|metrics|figure|image|supplement|supporting|editorial\s*board|advance online publication|most read|topdownload|download排行|论文下载排行|general requirements|author-center|journals-overview)/i;
    const els = Array.from(document.querySelectorAll('a[href]'));
    for (let i = 0; i < els.length; i++) {
      const a = els[i];
      const hrefRaw = a.getAttribute('href') || '';
      let url;
      try { url = new URL(hrefRaw, location.href).href; } catch { continue; }
      if (/^(javascript|mailto|tel):/i.test(hrefRaw) || /#/.test(url.replace(location.origin + location.pathname, ''))) continue;
      const text = ((a.innerText || a.textContent || a.getAttribute('title') || a.getAttribute('aria-label') || '')).replace(/\s+/g, ' ').trim();
      const hay = `${url} ${text}`;
      if (navish.test(hay)) continue;
      const rect = a.getBoundingClientRect?.();
      const visible = !!rect && rect.width > 2 && rect.height > 2;
      let kind = '';
      let order = 99;
      if (/\/doi\/(?:abs|full|epdf)?\/?10\./i.test(url) && !/\/doi\/pdf\//i.test(url)) { kind = 'doi'; order = 1; }
      else if (/\/article\//i.test(url)) { kind = 'article'; order = 2; }
      else if (/\/pii\//i.test(url)) { kind = 'pii'; order = 3; }
      else if (dbArg === 'aps' && /\/abstract\/10\.1103\//i.test(url)) { kind = 'aps-abstract'; order = 1; }
      else if (dbArg === 'emerald' && /\/insight\/content\/doi\/10\./i.test(url) && !/\/full\/pdf/i.test(url)) { kind = 'emerald-doi'; order = 1; }
      else if (dbArg === 'optica' && /(fulltext|abstract)\.cfm\?uri=/i.test(url)) { kind = 'optica-fulltext'; order = 2; }
      else if (dbArg === 'opticsjournal' && /\/Articles\/OJ[^/]+\/(FullText|Abstract)/i.test(url)) { kind = 'opticsjournal-article'; order = 2; }
      else if (dbArg === 'proquest' && /\/docview\/\d+/i.test(url) && !/docunavailable/i.test(url)) { kind = 'proquest-docview'; order = 2; }
      else if (dbArg === 'sae' && /\/publications\/technical-papers\/content\//i.test(url) && !/download/i.test(url)) { kind = 'sae-content'; order = 2; }
      else if (/\/doi\/10\./i.test(url) && !/\/doi\/pdf/i.test(url)) { kind = 'doi'; order = 1; }
      if (!kind) continue;
      if (/\b(pdf|download|supplement|supporting|erratum|correction|editorial)\b/i.test(text) && !/article|paper|research/i.test(text)) continue;
      out.push({ url, href: hrefRaw, text, title: a.getAttribute('title') || '', aria: a.getAttribute('aria-label') || '', index: i, visible, kind, order });
    }
    return out;
  }, db).catch(() => []);
  const seen = new Set();
  return anchors
    .sort((a, b) => a.order - b.order || (b.visible ? 1 : 0) - (a.visible ? 1 : 0) || a.index - b.index)
    .filter(c => { const key = canonicalUrl(c.url).replace(/\?.*$/, ''); if (seen.has(key)) return false; seen.add(key); return true; })
    .slice(0, 10);
}

async function fallbackNavigateForCandidates(page, db, currentCandidates, trail) {
  if (currentCandidates.length) return currentCandidates;
  if (db === 'asce') {
    for (const u of ['https://ascelibrary.org/toc/jcemd4/current', 'https://ascelibrary.org/action/showMostRecentArticles']) {
      trail.push(await gotoSettled(page, u, 'asce-direct-recent-fallback'));
      await dismissCookieBanners(page);
      const directCandidates = await extractCandidates(page, db);
      if (directCandidates.length) return directCandidates;
    }
    const journal = await page.evaluate(() => Array.from(document.querySelectorAll('a[href]')).map(a => {
      try { return { url: new URL(a.getAttribute('href') || '', location.href).href, text: (a.textContent || '').replace(/\s+/g, ' ').trim() }; } catch { return null; }
    }).filter(Boolean).find(x => /ascelibrary\.org\/(journal|toc)\//i.test(x.url) && !/proceedings|books|standards|magazine/i.test(`${x.url} ${x.text}`)) || null).catch(() => null);
    if (journal?.url) {
      trail.push(await gotoSettled(page, journal.url, 'asce-first-publication'));
      await dismissCookieBanners(page);
      let c = await extractCandidates(page, db);
      if (c.length) return c;
      const current = await page.evaluate(() => Array.from(document.querySelectorAll('a[href]')).map(a => {
        try { return new URL(a.getAttribute('href') || '', location.href).href; } catch { return ''; }
      }).find(u => /\/(toc|loi)\/[^/?#]+\/(current|latest)/i.test(u) || /\/toc\/[^/?#]+\/current/i.test(u)) || '').catch(() => '');
      if (current) {
        trail.push(await gotoSettled(page, current, 'asce-current-issue'));
        await dismissCookieBanners(page);
        c = await extractCandidates(page, db);
        if (c.length) return c;
      }
    }
  }
  if (db === 'emerald') {
    const urls = ['https://www.emerald.com/insight/search?q=2024&showAll=true', 'https://www.emerald.com/insight/'];
    for (const u of urls) {
      trail.push(await gotoSettled(page, u, 'emerald-search-fallback'));
      await dismissCookieBanners(page);
      const c = await extractCandidates(page, db);
      if (c.length) return c;
    }
  }
  if (db === 'proquest') {
    // Use the site search UI when the direct search URL does not render docview anchors.
    await page.locator('input[type="search"], input[name="q"], input[name="queryTermField"], input[aria-label*="Search" i]').first().fill('renewable energy 2024', { timeout: 4000 }).catch(() => undefined);
    await page.keyboard.press('Enter').catch(() => undefined);
    await page.waitForLoadState('networkidle', { timeout: 25000 }).catch(() => undefined);
    await page.waitForTimeout(3000).catch(() => undefined);
    trail.push({ label: 'proquest-search-ui', final_url: page.url() });
    const c = await extractCandidates(page, db);
    if (c.length) return c;
  }
  if (db === 'opticsjournal') {
    const urls = ['https://www.opticsjournal.net/Articles/TopDownload', 'https://www.opticsjournal.net/Journals/zgjg.htm'];
    for (const u of urls) {
      trail.push(await gotoSettled(page, u, 'opticsjournal-fallback'));
      await dismissCookieBanners(page);
      const c = await extractCandidates(page, db);
      if (c.length) return c;
    }
  }
  if (db === 'sae') {
    const urls = ['https://www.sae.org/publications/technical-papers/content', 'https://www.sae.org/search/?qt=2024&sector=(%22AUTOC%22)&sort=relevance'];
    for (const u of urls) {
      trail.push(await gotoSettled(page, u, 'sae-fallback'));
      await dismissCookieBanners(page);
      const c = await extractCandidates(page, db);
      if (c.length) return c;
    }
  }
  if (db === 'siam') {
    const current = await page.evaluate(() => Array.from(document.querySelectorAll('a[href]')).map(a => {
      try { return new URL(a.getAttribute('href') || '', location.href).href; } catch { return ''; }
    }).find(u => /\/toc\/[^/?#]+\/current|\/doi\/abs\/10\./i.test(u)) || '').catch(() => '');
    if (current) {
      trail.push(await gotoSettled(page, current, 'siam-current-or-first-doi'));
      await dismissCookieBanners(page);
      const c = await extractCandidates(page, db);
      if (c.length) return c;
    }
  }
  return [];
}

async function clickCandidateAndExtract(page, db, candidate, attemptIndex) {
  const beforeUrl = page.url();
  let clickResult = false;
  try {
    clickResult = await page.evaluate((targetUrl) => {
      const anchors = Array.from(document.querySelectorAll('a[href]'));
      const found = anchors.find(a => {
        try { return new URL(a.getAttribute('href') || '', location.href).href === targetUrl; } catch { return false; }
      });
      if (!found) return false;
      found.setAttribute('target', '_self');
      found.click();
      return true;
    }, candidate.url);
  } catch { clickResult = false; }
  await page.waitForLoadState('domcontentloaded', { timeout: 25000 }).catch(() => undefined);
  await page.waitForLoadState('networkidle', { timeout: 25000 }).catch(() => undefined);
  await page.waitForTimeout(3000).catch(() => undefined);
  if (!clickResult || page.url() === beforeUrl) {
    await gotoSettled(page, candidate.url, `article-goto-${attemptIndex}`);
  }
  await dismissCookieBanners(page);
  const meta = await extractArticleMeta(page, db);
  return {
    db,
    attempt: attemptIndex,
    candidate,
    click_result: clickResult,
    doc_id: meta.doc_id,
    doi: meta.doi,
    article_url: meta.canonical || meta.url || page.url(),
    landed_url: page.url(),
    title: meta.title,
    captured_at: nowIso(),
    body_sample: meta.bodySample
  };
}

async function huntDb(db) {
  const profile = `research-${db}`;
  const port = await findFreePort();
  killProfileChrome(db);
  const launch = launchChromeForDb(db, HUNT_URLS[db], port);
  await waitForCdp(port);
  const browser = await chromium.connectOverCDP(launch.endpoint);
  const context = browser.contexts()[0] || await browser.newContext();
  let page = context.pages().find(p => /^https?:/.test(p.url())) || await context.newPage();
  const trail = [];
  try {
    trail.push(await gotoSettled(page, HUNT_URLS[db], 'hunt-url'));
    await dismissCookieBanners(page);
    let candidates = await extractCandidates(page, db);
    candidates = await fallbackNavigateForCandidates(page, db, candidates, trail);
    const probe = { db, profile, port, hunt_url: HUNT_URLS[db], trail, candidates, captured_at: nowIso(), page_url: page.url(), page_title: await page.title().catch(() => '') };
    writeJson(path.join(probesDir, `${db}-hunt-probe.json`), probe);
    const attempts = [];
    const max = Math.min(MAX_ARTICLE_ATTEMPTS, candidates.length);
    for (let i = 0; i < max; i++) {
      if (i > 0) {
        await gotoSettled(page, probe.page_url || HUNT_URLS[db], `return-to-hunt-${i}`);
        await dismissCookieBanners(page);
      }
      const article = await clickCandidateAndExtract(page, db, candidates[i], i + 1);
      attempts.push(article);
      writeJson(path.join(probesDir, `${db}-article-${i + 1}.json`), article);
    }
    return { db, profile, port, launch, browser, context, attempts, candidates, trail };
  } catch (err) {
    return { db, profile, port, launch, browser, context, attempts: [], candidates: [], trail, hunt_error: err?.stack || err?.message || String(err) };
  }
}

async function closeHuntTabs(context) {
  const pages = context?.pages?.() || [];
  for (const p of pages) await p.close({ runBeforeUnload: false }).catch(() => undefined);
}

function smokeAttempt(db, profile, port, article, attemptNo) {
  const outDir = path.join(downloadsDir, db, `attempt-${attemptNo}`);
  fs.mkdirSync(outDir, { recursive: true });
  const docId = db === 'pubscholar' ? (article.article_url || article.landed_url || article.doc_id) : (article.doc_id || article.article_url || article.landed_url);
  const args = ['dist/src/cli.js', `webai:${db}:download-pdf`, '--doc-id', docId, '--output-dir', outDir, '--output-json'];
  if (PAYWALLED.has(db)) {
    args.push('--profile', profile, '--cdp-port', String(port));
    if (article.article_url || article.landed_url) args.push('--pdf-url', article.article_url || article.landed_url);
  }
  const start = Date.now();
  const cp = spawnSync('node', args, { cwd: root, env: { ...process.env, DISPLAY: process.env.DISPLAY || ':0' }, encoding: 'utf8', timeout: SMOKE_TIMEOUT_MS, maxBuffer: 40 * 1024 * 1024 });
  const duration = Date.now() - start;
  const timedOut = Boolean(cp.error && /timed out|ETIMEDOUT/i.test(cp.error.message || '')) || cp.signal === 'SIGTERM';
  const parsed = jsonFrom(cp.stdout) || jsonFrom(cp.stderr) || {};
  const result = {
    db,
    profile: PAYWALLED.has(db) ? profile : null,
    attempt: attemptNo,
    doc_id: docId,
    hunted_doc_id: article.doc_id || null,
    article_url: article.article_url || null,
    landed_url: article.landed_url || null,
    title: article.title || null,
    command: ['node', ...args],
    classification: classify(parsed, { stdout: cp.stdout, stderr: cp.stderr }, timedOut),
    ok: Boolean(parsed.ok),
    errorCode: parsed.errorCode || null,
    message: parsed.message || null,
    path: parsed.path || null,
    sha256: parsed.sha256 || null,
    size: parsed.size || null,
    downloaded_at: parsed.downloaded_at || null,
    duration_ms: duration,
    exit_status: cp.status,
    signal: cp.signal || null,
    spawn_error: cp.error?.message || null,
    stdout: cp.stdout,
    stderr: cp.stderr,
    pdf_magic: parsed.path ? pdfMagic(parsed.path) : null,
    captured_at: nowIso()
  };
  writeJson(path.join(resultsDir, `${db}-attempt-${attemptNo}.json`), result);
  return result;
}

function summarizeMarkdown(allResults, huntedCatalog) {
  const final = allResults.map(r => r.final_result).filter(Boolean);
  const green = final.filter(r => r.classification === 'GREEN').length;
  const lines = [
    '# Wave 17 hunt real DOIs + re-smoke',
    '',
    `Generated: ${nowIso()}`,
    `Wave 17 NEW GREEN: ${green}/10`,
    `Cumulative paywalled-GREEN delta: 25/38 → ${25 + green}/38`,
    '',
    '## Per-DB hunt outcome',
    '',
    '| DB | Outcome | Doc ID | Article URL | Title |',
    '|---|---|---|---|---|'
  ];
  for (const row of allResults) {
    const h = huntedCatalog[row.db];
    const outcome = row.hunt_error ? `extraction failed: ${row.hunt_error.split('\n')[0]}` : h ? 'URL found' : 'page blocked / no candidate';
    lines.push(`| ${row.db} | ${outcome.replace(/\|/g, '\\|')} | ${String(h?.doc_id || '').replace(/\|/g, '\\|')} | ${String(h?.article_url || '').replace(/\|/g, '\\|')} | ${String(h?.title || '').replace(/\|/g, '\\|').slice(0, 120)} |`);
  }
  lines.push('', '## Per-DB re-smoke result with hunted doc_id', '', '| DB | Result | Error | Size | Attempts | Hunted doc_id | Message |', '|---|---|---|---:|---:|---|---|');
  for (const row of allResults) {
    const r = row.final_result;
    lines.push(`| ${row.db} | ${r?.classification || 'NOT_RUN'} | ${r?.errorCode || ''} | ${r?.size || ''} | ${row.smoke_results?.length || 0} | ${String(r?.doc_id || huntedCatalog[row.db]?.doc_id || '').replace(/\|/g, '\\|')} | ${String(r?.message || row.hunt_error || '').replace(/\|/g, '\\|').slice(0, 180)} |`);
  }
  lines.push('', '## Hunted-DOIs catalog', '', '```json', JSON.stringify(huntedCatalog, null, 2), '```', '');
  return lines.join('\n');
}

(async () => {
  const allResults = readJson(path.join(runDir, 'wave17-results.json'), []);
  const huntedCatalog = readJson(path.join(runDir, 'hunted-dois.json'), {});
  const rateLimitConsecutive = new Map();
  for (let i = 0; i < todo.length; i++) {
    const db = todo[i];
    if (elapsedExceeded()) { log('STOP total hunt+smoke time exceeded budget'); break; }
    log(`START ${db}`);
    let hunt;
    const row = { db, started_at: nowIso(), smoke_results: [] };
    try {
      hunt = await huntDb(db);
      Object.assign(row, { hunt_error: hunt.hunt_error || null, candidates_seen: hunt.candidates?.length || 0, trail: hunt.trail });
      await closeHuntTabs(hunt.context).catch(() => undefined);
      const attempts = hunt.attempts || [];
      if (!attempts.length) row.hunt_error = row.hunt_error || 'No article candidates found';
      for (let j = 0; j < attempts.length; j++) {
        const article = attempts[j];
        if (article?.doc_id || article?.article_url) {
          if (!huntedCatalog[db]) {
            huntedCatalog[db] = { doc_id: article.doc_id || article.article_url, article_url: article.article_url || article.landed_url, title: article.title || '', captured_at: article.captured_at };
            writeJson(path.join(runDir, 'hunted-dois.json'), huntedCatalog);
          }
          const smoke = smokeAttempt(db, hunt.profile, hunt.port, article, j + 1);
          row.smoke_results.push(smoke);
          log(`${db} attempt ${j + 1}: ${smoke.classification} ${smoke.errorCode || ''} ${smoke.size || ''}`);
          if (smoke.classification === 'DEFERRED_RATE_LIMIT') {
            const n = (rateLimitConsecutive.get(db) || 0) + 1;
            rateLimitConsecutive.set(db, n);
            if (n >= 2) { log(`${db} deferred after 2 consecutive 429/rate-limit classifications`); break; }
          } else {
            rateLimitConsecutive.set(db, 0);
          }
          if (smoke.classification === 'GREEN') break;
        }
      }
      row.final_result = row.smoke_results.find(r => r.classification === 'GREEN') || row.smoke_results[row.smoke_results.length - 1] || null;
    } catch (err) {
      row.hunt_error = err?.stack || err?.message || String(err);
      log(`${db} ERROR`, row.hunt_error.split('\n')[0]);
    } finally {
      await hunt?.browser?.close?.().catch(() => undefined);
      killProfileChrome(db);
      row.finished_at = nowIso();
      const existingIdx = allResults.findIndex(r => r.db === db);
      if (existingIdx >= 0) allResults[existingIdx] = row; else allResults.push(row);
      writeJson(path.join(runDir, 'wave17-results.json'), allResults);
      fs.writeFileSync(path.join(runDir, 'smoke-matrix.md'), summarizeMarkdown(allResults, huntedCatalog));
      if (i < todo.length - 1) {
        log(`sleep ${BETWEEN_DB_MS}ms before next DB`);
        await sleep(BETWEEN_DB_MS);
      }
    }
  }
  const final = allResults.filter(r => todo.includes(r.db)).map(r => r.final_result).filter(Boolean);
  const green = final.filter(r => r.classification === 'GREEN').length;
  log(`DONE Wave17 GREEN ${green}/${todo.length}`);
  fs.writeFileSync(path.join(runDir, 'smoke-matrix.md'), summarizeMarkdown(allResults, huntedCatalog));
})().catch((err) => {
  console.error(err?.stack || err?.message || String(err));
  process.exit(1);
});
