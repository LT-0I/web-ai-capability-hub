#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');

const root = process.cwd();
const runDir = path.join(root, '.runs', 'wave-18-royalsoc');
const probesDir = path.join(runDir, 'probes');
for (const dir of [runDir, probesDir]) fs.mkdirSync(dir, { recursive: true });

const profile = 'research-royalsoc';
const profileDir = path.join(root, 'data', 'browser-profiles', profile);
const entrypoints = [
  { label: 'journal-home', url: 'https://royalsocietypublishing.org/journal/rsos' },
  { label: 'current-issue-toc', url: 'https://royalsocietypublishing.org/toc/rsos/current' },
  { label: 'articles-query', url: 'https://royalsocietypublishing.org/journal/rsos/articles?queryID=$%7Bquery0%7D' },
  { label: 'list-of-issues', url: 'https://royalsocietypublishing.org/loi/rsos' }
];

function nowIso() { return new Date().toISOString(); }
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function writeJson(file, value) { fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n'); }
function chromeExecutable() {
  const candidates = [process.env.WAH_BROWSER_EXECUTABLE, process.env.CHROME_BIN, '/usr/bin/google-chrome', '/opt/google/chrome/chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].filter(Boolean);
  for (const candidate of candidates) if (fs.existsSync(candidate)) return candidate;
  throw new Error('Chrome executable not found');
}
async function findFreePort(host = '127.0.0.1') {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, host, () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}
async function waitForCdp(port, timeoutMs = 65000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(1500) });
      if (response.ok) return await response.json();
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await sleep(500);
  }
  throw new Error(`CDP endpoint did not become ready on ${port}: ${lastError?.message || lastError}`);
}
function launchChrome(port) {
  fs.mkdirSync(profileDir, { recursive: true });
  const args = [
    '--remote-debugging-address=127.0.0.1',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    entrypoints[0].url
  ];
  const out = fs.openSync(path.join(runDir, 'chrome.out.log'), 'a');
  const err = fs.openSync(path.join(runDir, 'chrome.err.log'), 'a');
  const child = spawn(chromeExecutable(), args, {
    cwd: root,
    env: { ...process.env, DISPLAY: process.env.DISPLAY || ':0' },
    detached: true,
    stdio: ['ignore', out, err]
  });
  child.unref();
  return child;
}
async function dismissCookieBanners(page) {
  const selectors = [
    'button#onetrust-accept-btn-handler',
    'button:has-text("Accept all")',
    'button:has-text("Accept All")',
    'button:has-text("Allow all")',
    'button:has-text("I Accept")',
    'button:has-text("Accept")',
    '[aria-label*="accept" i]'
  ];
  for (const selector of selectors) {
    const loc = page.locator(selector).first();
    if (await loc.count().catch(() => 0)) {
      await loc.click({ timeout: 2000 }).catch(() => undefined);
      await page.waitForTimeout(500).catch(() => undefined);
    }
  }
}
async function gotoSettled(page, url, label) {
  const record = { label, requested_url: url, response_status: null, response_url: null, response_headers: null, final_url: null, title: null, error: null };
  try {
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 70000 });
    record.response_status = response?.status?.() ?? null;
    record.response_url = response?.url?.() ?? null;
    const headers = response?.headers?.() || {};
    record.response_headers = {
      content_type: headers['content-type'] || null,
      server: headers.server || null,
      cache_status: headers['cf-cache-status'] || headers['x-cache'] || null
    };
  } catch (error) {
    record.error = error?.message || String(error);
  }
  await page.waitForLoadState('networkidle', { timeout: 25000 }).catch(() => undefined);
  await page.waitForTimeout(5000);
  await dismissCookieBanners(page);
  record.final_url = page.url();
  record.title = await page.title().catch(() => null);
  return record;
}
async function triggerScroll(page) {
  return await page.evaluate(async () => {
    const before = {
      y: window.scrollY,
      height: document.documentElement.scrollHeight,
      doi1098: document.querySelectorAll('a[href*="/doi/10.1098/"]').length,
      doiAny: document.querySelectorAll('a[href*="/doi/"]').length,
      carouselish: document.querySelectorAll('[class*="carousel" i], [class*="slider" i], [class*="swiper" i], [class*="slick" i]').length
    };
    const maxY = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight, 0);
    for (let y = 0; y <= maxY; y += 700) {
      window.scrollTo(0, y);
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    window.scrollTo(0, 0);
    await new Promise(resolve => setTimeout(resolve, 500));
    const horizontalScrollers = Array.from(document.querySelectorAll('section, div, ul, ol')).filter((el) => el.scrollWidth > el.clientWidth + 50).length;
    const after = {
      y: window.scrollY,
      height: document.documentElement.scrollHeight,
      doi1098: document.querySelectorAll('a[href*="/doi/10.1098/"]').length,
      doiAny: document.querySelectorAll('a[href*="/doi/"]').length,
      carouselish: document.querySelectorAll('[class*="carousel" i], [class*="slider" i], [class*="swiper" i], [class*="slick" i]').length,
      horizontalScrollers
    };
    return { before, after };
  }).catch((error) => ({ error: error?.message || String(error) }));
}
async function collectPageEvidence(page, label) {
  const evidence = await page.evaluate((labelArg) => {
    function absolute(raw) {
      try { return new URL(raw || '', location.href).href; } catch { return ''; }
    }
    function text(el) {
      return ((el?.innerText || el?.textContent || '')).replace(/\s+/g, ' ').trim();
    }
    function visible(el) {
      const rect = el?.getBoundingClientRect?.();
      return !!rect && rect.width > 2 && rect.height > 2;
    }
    function closestText(el) {
      const container = el.closest('article, li, .issue-item, .toc__section, .accordion-tabbed__content, .card, .journal-info, .widget, section, div') || el.parentElement || el;
      return text(container).slice(0, 900);
    }
    const anchors = Array.from(document.querySelectorAll('a[href]'));
    const doi1098Anchors = anchors
      .filter((a) => absolute(a.getAttribute('href')).includes('/doi/10.1098/'))
      .map((a, index) => ({ index, href: a.getAttribute('href'), url: absolute(a.getAttribute('href')), text: text(a), title: a.getAttribute('title') || '', aria: a.getAttribute('aria-label') || '', visible: visible(a), context: closestText(a) }))
      .slice(0, 40);
    const candidates = anchors.map((a, index) => {
      const url = absolute(a.getAttribute('href'));
      const hay = `${url} ${text(a)} ${a.getAttribute('title') || ''} ${a.getAttribute('aria-label') || ''}`;
      const m = /\/doi\/(?:abs\/|full\/|epdf\/)?(10\.1098\/[^?#\s/]+(?:\.[^?#\s/]+)?)/i.exec(decodeURIComponent(url));
      if (!m || /\/doi\/pdf\//i.test(url) || /citation|figure|suppl|metrics|reference/i.test(hay)) return null;
      return { index, url, href: a.getAttribute('href'), text: text(a), title: a.getAttribute('title') || '', aria: a.getAttribute('aria-label') || '', visible: visible(a), doi: m[1].replace(/[.,;]+$/, ''), context: closestText(a), label: labelArg };
    }).filter(Boolean);
    const pdfLinks = anchors
      .filter((a) => /\/doi\/pdf\/10\.1098\//i.test(absolute(a.getAttribute('href'))))
      .map((a, index) => ({ index, url: absolute(a.getAttribute('href')), text: text(a), visible: visible(a), context: closestText(a).slice(0, 400) }))
      .slice(0, 20);
    const meta = Array.from(document.querySelectorAll('meta[name], meta[property]')).map((m) => ({ name: m.getAttribute('name') || m.getAttribute('property'), content: m.getAttribute('content') })).filter((m) => /citation|dc\.|prism|article/i.test(m.name || '')).slice(0, 80);
    return {
      url: location.href,
      title: document.title,
      readyState: document.readyState,
      body_sample: text(document.body).slice(0, 1500),
      counts: {
        anchors: anchors.length,
        doi1098_selector: document.querySelectorAll('a[href*="/doi/10.1098/"]').length,
        doi_any: document.querySelectorAll('a[href*="/doi/"]').length,
        pdf_1098: pdfLinks.length,
        candidates: candidates.length,
        carouselish: document.querySelectorAll('[class*="carousel" i], [class*="slider" i], [class*="swiper" i], [class*="slick" i]').length
      },
      doi1098_selector_samples: doi1098Anchors,
      candidates: candidates.slice(0, 60),
      pdf_links: pdfLinks,
      meta
    };
  }, label).catch((error) => ({ error: error?.message || String(error), url: page.url() }));
  return evidence;
}
function candidateScore(candidate) {
  let score = 0;
  const hay = `${candidate.url || ''} ${candidate.text || ''} ${candidate.context || ''}`;
  if (/10\.1098\/rsos\./i.test(hay)) score += 60;
  if (/2026/.test(hay)) score += 25;
  if (candidate.visible) score += 10;
  if (/research article|research articles|article|paper/i.test(hay)) score += 5;
  if (/correction|editorial|erratum|retraction|cover|front matter/i.test(hay)) score -= 40;
  return score;
}
function uniqueCandidates(candidates) {
  const seen = new Set();
  return candidates.filter((candidate) => {
    const key = String(candidate.doi || candidate.url || '').toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
async function extractArticle(page, candidate, attempt) {
  const nav = await gotoSettled(page, candidate.url, `article-${attempt}`);
  const article = await page.evaluate(() => {
    const pick = (...selectors) => {
      for (const selector of selectors) {
        const el = document.querySelector(selector);
        const value = el?.getAttribute('content') || el?.textContent || '';
        if (value.trim()) return value.trim();
      }
      return '';
    };
    const text = (document.body?.innerText || '').replace(/\s+/g, ' ').trim();
    const anchors = Array.from(document.querySelectorAll('a[href]')).map((a) => {
      let url = '';
      try { url = new URL(a.getAttribute('href') || '', location.href).href; } catch {}
      return { url, text: ((a.innerText || a.textContent || a.getAttribute('title') || a.getAttribute('aria-label') || '')).replace(/\s+/g, ' ').trim() };
    }).filter((a) => /pdf|\/doi\/pdf\//i.test(`${a.url} ${a.text}`)).slice(0, 20);
    return {
      final_url: location.href,
      title: pick('meta[name="citation_title"]', 'meta[property="og:title"]') || document.querySelector('h1')?.textContent?.replace(/\s+/g, ' ').trim() || document.title,
      doi: pick('meta[name="citation_doi"]', 'meta[name="dc.Identifier"]', 'meta[name="DC.Identifier"]', 'meta[name="prism.doi"]'),
      publication_date: pick('meta[name="citation_publication_date"]', 'meta[name="dc.Date"]', 'meta[name="DC.Date"]', 'meta[property="article:published_time"]'),
      journal: pick('meta[name="citation_journal_title"]', 'meta[name="prism.publicationName"]'),
      canonical: document.querySelector('link[rel="canonical"]')?.href || location.href,
      open_access_text_seen: /open access/i.test(text),
      has_pdf_selector: document.querySelectorAll('a[href*="/doi/pdf/10.1098/"]').length,
      pdf_links: anchors,
      body_sample: text.slice(0, 1500)
    };
  }).catch((error) => ({ error: error?.message || String(error), final_url: page.url() }));
  const doi = String(article.doi || candidate.doi || '').match(/10\.1098\/[^\s;,.]+(?:\.[^\s;,.]+)?/i)?.[0] || candidate.doi || null;
  return { attempt, candidate, navigation: nav, ...article, doi };
}
async function testPdfRoute(context, page, doi) {
  const pdfUrl = `https://royalsocietypublishing.org/doi/pdf/${doi}`;
  const result = { pdf_url: pdfUrl, request: null, headed_navigation: null };
  try {
    const response = await context.request.get(pdfUrl, {
      timeout: 60000,
      headers: { Accept: 'application/pdf,text/html;q=0.9,*/*;q=0.8' }
    });
    const body = Buffer.from(await response.body());
    const headers = response.headers();
    result.request = {
      status: response.status(),
      ok: response.ok(),
      final_url: response.url(),
      content_type: headers['content-type'] || null,
      content_length: headers['content-length'] || null,
      first5: body.subarray(0, 5).toString(),
      bytes: body.length,
      body_sample: body.subarray(0, 160).toString('utf8')
    };
  } catch (error) {
    result.request = { error: error?.message || String(error) };
  }
  const pdfPage = await context.newPage();
  try {
    const nav = await gotoSettled(pdfPage, pdfUrl, 'pdf-route-headed-navigation');
    result.headed_navigation = {
      ...nav,
      page_url: pdfPage.url(),
      title: await pdfPage.title().catch(() => null),
      text_sample: await pdfPage.locator('body').innerText({ timeout: 3000 }).catch(() => '')
    };
  } catch (error) {
    result.headed_navigation = { error: error?.message || String(error), page_url: pdfPage.url() };
  } finally {
    await pdfPage.close().catch(() => undefined);
  }
  return result;
}

(async () => {
  const started_at = nowIso();
  const port = await findFreePort();
  const child = launchChrome(port);
  const cdpVersion = await waitForCdp(port);
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  const context = browser.contexts()[0] || await browser.newContext();
  let page = context.pages().find((p) => /^https?:/.test(p.url())) || await context.newPage();
  const pages = [];
  const allCandidates = [];
  let selectedArticle = null;
  let pdfRoute = null;
  try {
    for (const entry of entrypoints) {
      const navigation = await gotoSettled(page, entry.url, entry.label);
      const initial = await collectPageEvidence(page, `${entry.label}:initial`);
      const scroll = await triggerScroll(page);
      await page.waitForTimeout(1000);
      const afterScroll = await collectPageEvidence(page, `${entry.label}:after-scroll`);
      const pageRecord = { entry, navigation, initial, scroll, after_scroll: afterScroll };
      pages.push(pageRecord);
      for (const candidate of [...(initial.candidates || []), ...(afterScroll.candidates || [])]) allCandidates.push(candidate);
    }
    const ranked = uniqueCandidates(allCandidates).sort((a, b) => candidateScore(b) - candidateScore(a)).slice(0, 12);
    const articlePage = await context.newPage();
    const articleAttempts = [];
    for (let i = 0; i < Math.min(8, ranked.length); i++) {
      const article = await extractArticle(articlePage, ranked[i], i + 1);
      article.score = candidateScore(ranked[i]);
      articleAttempts.push(article);
      if (!selectedArticle && /2026/.test(`${article.publication_date || ''} ${article.body_sample || ''} ${article.candidate?.context || ''}`) && /10\.1098\/rsos\./i.test(article.doi || '')) {
        selectedArticle = article;
        break;
      }
      if (!selectedArticle && /10\.1098\/rsos\./i.test(article.doi || '')) selectedArticle = article;
    }
    await articlePage.close().catch(() => undefined);
    if (selectedArticle?.doi) pdfRoute = await testPdfRoute(context, page, selectedArticle.doi);
    const output = {
      db: 'royalsoc',
      profile,
      profile_dir: profileDir,
      headed_chrome: true,
      port,
      chrome_pid: child.pid,
      cdp_browser: cdpVersion.Browser || null,
      started_at,
      captured_at: nowIso(),
      entrypoints,
      pages,
      ranked_candidates: ranked,
      selected_article: selectedArticle,
      pdf_route: pdfRoute
    };
    writeJson(path.join(probesDir, 'royalsoc-deep.json'), output);
    console.log(JSON.stringify({ ok: true, port, selected_doi: selectedArticle?.doi || null, pdf_first5: pdfRoute?.request?.first5 || null, probe: path.join(probesDir, 'royalsoc-deep.json') }, null, 2));
  } finally {
    await browser.close().catch(() => undefined);
    try { process.kill(-child.pid, 'SIGTERM'); } catch {}
  }
})().catch((error) => {
  const failure = { ok: false, error: error?.stack || error?.message || String(error), captured_at: nowIso() };
  writeJson(path.join(probesDir, 'royalsoc-deep.json'), failure);
  console.error(failure.error);
  process.exit(1);
});
