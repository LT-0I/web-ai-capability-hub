#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { chromium } = require('playwright');

const ROOT = process.cwd();
const OUT = path.join(ROOT, '.runs/wave-18-proquest/probes/proquest-deep.json');
const PROFILE = 'research-proquest';
const DEFAULT_PORT = 9222;

function sh(args, opts = {}) {
  const started = Date.now();
  try {
    const stdout = execFileSync(process.execPath, ['dist/src/cli.js', ...args], { cwd: ROOT, encoding: 'utf8', timeout: opts.timeout || 60000 });
    return { ok: true, code: 0, stdout, stderr: '', ms: Date.now() - started };
  } catch (error) {
    return { ok: false, code: error.status ?? null, stdout: String(error.stdout || ''), stderr: String(error.stderr || error.message || ''), ms: Date.now() - started };
  }
}
function parseJson(text) { try { return JSON.parse(text); } catch { return null; } }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function textSample(s, n = 2200) { return String(s || '').replace(/\s+/g, ' ').trim().slice(0, n); }
function uniqueBy(arr, keyFn) { const seen = new Set(); return arr.filter(x => { const k = keyFn(x); if (seen.has(k)) return false; seen.add(k); return true; }); }
function classify(body, title, url) {
  const hay = `${title || ''} ${url || ''} ${body || ''}`;
  const institution = /访问权限提供者|Access\s+provided\s+by|NANJING UNIVERSITY OF AERONAUTICS AND ASTRONAUTICS/i.test(hay);
  const login = /login|log\s*in|sign\s*in|institutional\s+login|Shibboleth|OpenAthens|find\s+your\s+institution|登录|登入|请先登录|认证|身份验证/i.test(hay);
  const unavailable = /Document unavailable|文档不可用|订阅内容不包括此文档|not available|no longer available/i.test(hay);
  const noResults = /未返回结果|No results|0\s+results/i.test(hay);
  const results = /检索结果|resultsHeaderBarItem|\d[\d,]*\s+(?:results|个检索结果)/i.test(hay);
  if (institution && !login) return 'SESSION_AUTHENTICATED';
  if (unavailable && institution) return 'AUTHENTICATED_DOCUMENT_UNAVAILABLE';
  if (results && institution) return 'AUTHENTICATED_RESULTS';
  if (noResults && institution) return 'AUTHENTICATED_NO_RESULTS';
  if (login && !institution) return 'LOGIN_REQUIRED';
  if (institution) return 'SESSION_AUTHENTICATED';
  if (login) return 'LOGIN_OR_MARKETING';
  return 'UNKNOWN';
}
async function dismissProquest(page) {
  for (const selector of [
    '#onetrust-accept-btn-handler',
    'button:has-text("Accept All")',
    'button:has-text("全部接受")',
    '._pendo-close-guide',
    '#pendo-close-guide',
    '[aria-label="Close"]',
  ]) {
    await page.locator(selector).first().click({ timeout: 1200 }).catch(() => undefined);
  }
  const restore = page.locator('#restoresession_confirm').first();
  if (await restore.count().catch(() => 0)) {
    const visible = await restore.isVisible({ timeout: 500 }).catch(() => false);
    if (visible) {
      for (const selector of [
        '#restoresession_confirm button:has-text("Start new session")',
        '#restoresession_confirm a:has-text("Start new session")',
        '#restoresession_confirm button:has-text("New session")',
        '#restoresession_confirm a:has-text("New session")',
        '#restoresession_confirm button:has-text("继续")',
        '#restoresession_confirm a:has-text("继续")',
        '#restoresession_confirm button:has-text("新会话")',
        '#restoresession_confirm a:has-text("新会话")',
        '#restoresession_confirm [data-dismiss="modal"]',
        '#restoresession_confirm button.close',
        '#restoresession_confirm button',
        '#restoresession_confirm a',
      ]) {
        const loc = page.locator(selector).first();
        if (await loc.count().catch(() => 0)) {
          await loc.click({ timeout: 2000 }).catch(() => undefined);
          await sleep(1000);
          break;
        }
      }
    }
  }
}
async function collectPage(page, label, requestedUrl, response, extra = {}) {
  await dismissProquest(page);
  await page.waitForLoadState('domcontentloaded', { timeout: 8000 }).catch(() => undefined);
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => undefined);
  await sleep(1000);
  const data = await page.evaluate(() => {
    const abs = (v) => { try { return new URL(v || '', location.href).href; } catch { return ''; } };
    const visible = (el) => {
      const r = el.getBoundingClientRect?.();
      const style = getComputedStyle(el);
      return !!r && r.width > 1 && r.height > 1 && style.visibility !== 'hidden' && style.display !== 'none';
    };
    const anchors = Array.from(document.querySelectorAll('a[href]')).map((a, i) => ({
      index: i,
      href: a.getAttribute('href') || '',
      url: abs(a.getAttribute('href') || ''),
      text: (a.innerText || a.textContent || a.getAttribute('title') || a.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 400),
      title: a.getAttribute('title') || '',
      aria: a.getAttribute('aria-label') || '',
      id: a.id || '',
      className: String(a.className || '').slice(0, 200),
      visible: visible(a),
    }));
    const pdfish = Array.from(document.querySelectorAll('a[href],iframe[src],embed[src],object[data],[data-pdf-url],[data-url],button,[role="button"]')).map((el, i) => {
      const raw = el.getAttribute('href') || el.getAttribute('src') || el.getAttribute('data') || el.getAttribute('data-pdf-url') || el.getAttribute('data-url') || '';
      return {
        index: i,
        tag: el.tagName,
        id: el.id || '',
        className: String(el.className || '').slice(0, 200),
        raw,
        url: raw ? abs(raw) : '',
        text: (el.innerText || el.textContent || el.getAttribute('title') || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 400),
        title: el.getAttribute('title') || '',
        aria: el.getAttribute('aria-label') || '',
        visible: visible(el),
      };
    }).filter(x => /pdf|full\s*text|fulltext|download|下载|全文|docview|blob:/i.test(`${x.raw} ${x.url} ${x.text} ${x.title} ${x.aria} ${x.id} ${x.className}`));
    const results = Array.from(document.querySelectorAll('li.resultItem, .resultItem')).slice(0, 25).map((el, i) => {
      const a = el.querySelector('a[href*="/docview/"], a.resultTitle[href], .resultTitle a[href], h3 a[href], h2 a[href], a[href]');
      return {
        index: i,
        title: (a?.textContent || el.querySelector('a.resultTitle, .truncatedResultsTitle, h3, h2')?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 500),
        href: a?.getAttribute('href') || '',
        url: a ? abs(a.getAttribute('href') || '') : '',
        text: (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 1000),
      };
    });
    const header = document.querySelector('div.resultsHeaderBarItem, .resultsHeaderBarItem')?.textContent || '';
    const bodyText = (document.body?.innerText || '').replace(/\s+/g, ' ').trim();
    return { hrefs: anchors, pdfish, results, resultHeader: header.replace(/\s+/g, ' ').trim(), bodyText };
  }).catch(e => ({ error: e.message || String(e), hrefs: [], pdfish: [], results: [], resultHeader: '', bodyText: '' }));
  const docviewLinks = uniqueBy((data.hrefs || []).filter(a => /\/docview\/\d+/i.test(a.url || '') && !/docunavailable/i.test(a.url || '')), x => (x.url || '').replace(/[?#].*$/, ''));
  const fulltextPdfLinks = uniqueBy((data.pdfish || []).filter(a => /fulltextpdf|downloadpdf|\.pdf|blob:/i.test(`${a.url || ''} ${a.raw || ''} ${a.text || ''}`)), x => `${x.url || x.raw || x.text}`);
  const title = await page.title().catch(() => '');
  const url = page.url();
  return {
    label,
    requested_url: requestedUrl,
    response_status: response?.status?.() ?? null,
    response_url: response?.url?.() || null,
    final_url: url,
    title,
    classification: classify(data.bodyText, title, url),
    result_header: data.resultHeader || '',
    docview_link_count: docviewLinks.length,
    docview_links: docviewLinks.slice(0, 15),
    result_items: (data.results || []).slice(0, 10),
    pdfish: fulltextPdfLinks.slice(0, 30),
    body_prefix: textSample(data.bodyText),
    ...extra,
  };
}
async function gotoCollect(page, label, url) {
  let response = null;
  let error = null;
  try { response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }); }
  catch (e) { error = e.message || String(e); }
  return await collectPage(page, label, url, response, { error });
}
async function runAdvancedSearch(page) {
  const label = 'advanced-search-ui';
  const requestedUrl = 'https://www.proquest.com/advanced?accountid=16605';
  const response = await page.goto(requestedUrl, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(e => ({ _error: e.message || String(e) }));
  await dismissProquest(page);
  let action = { filled: false, clicked: false, error: null };
  try {
    await page.locator('#queryTermField').first().fill('noft(renewable energy 2024)', { timeout: 10000 });
    action.filled = true;
    await dismissProquest(page);
    await page.locator('#searchToResultPage').first().click({ timeout: 10000 });
    action.clicked = true;
    await page.waitForLoadState('domcontentloaded', { timeout: 30000 }).catch(() => undefined);
    await page.waitForFunction(() => /results|结果|empty/i.test(location.href) || !!document.querySelector('div.resultsHeaderBarItem, li.resultItem'), null, { timeout: 45000 }).catch(() => undefined);
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
  } catch (e) {
    action.error = e.message || String(e);
  }
  return await collectPage(page, label, requestedUrl, response && !response._error ? response : null, { action, navigation_error: response?._error || null });
}
async function requestProbe(context, url) {
  try {
    const res = await context.request.get(url, { timeout: 60000, headers: { Accept: 'application/pdf,text/html;q=0.9,*/*;q=0.8' } });
    const headers = res.headers();
    const body = Buffer.from(await res.body());
    return {
      url,
      ok: res.ok(),
      status: res.status(),
      final_url: res.url(),
      content_type: headers['content-type'] || '',
      content_disposition: headers['content-disposition'] || '',
      first5: body.subarray(0, 5).toString('utf8'),
      size: body.length,
      body_prefix: body.subarray(0, 1200).toString('utf8').replace(/\s+/g, ' ').slice(0, 1200),
    };
  } catch (e) {
    return { url, ok: false, error: e.message || String(e) };
  }
}
async function discoverArticleAndPdf(page, context, candidateUrl) {
  const out = { candidate_url: candidateUrl, article: null, candidate_pdf_urls: [], request_probes: [], click_probe: null };
  const article = await gotoCollect(page, 'article-docview', candidateUrl);
  out.article = article;
  const docId = /\/docview\/(\d+)/i.exec(candidateUrl)?.[1] || /\/docview\/(\d+)/i.exec(article.final_url || '')?.[1] || null;
  const urls = [];
  for (const p of article.pdfish || []) if (p.url && /^https?:|^blob:/.test(p.url)) urls.push(p.url);
  if (docId) {
    urls.push(`https://www.proquest.com/docview/${docId}/fulltextPDF`);
    urls.push(`https://www.proquest.com/docview/${docId}/fulltextPDF?accountid=16605`);
  }
  out.candidate_pdf_urls = uniqueBy(urls.filter(Boolean), x => x).slice(0, 12);
  for (const url of out.candidate_pdf_urls.filter(u => /^https?:/i.test(u)).slice(0, 8)) {
    out.request_probes.push(await requestProbe(context, url));
  }
  const pdfClickSelector = 'a#downloadPDFLink, a[href*="fulltextPDF" i], a[aria-label*="PDF" i], a[title*="PDF" i], a:has-text("PDF"), a:has-text("全文"), a:has-text("下载")';
  try {
    const loc = page.locator(pdfClickSelector).first();
    const count = await loc.count().catch(() => 0);
    if (count) {
      const before = context.pages().map(p => p.url());
      const responses = [];
      const onResponse = async (res) => {
        const u = res.url();
        if (/proquest\.com|blob:|fulltext|pdf|docview/i.test(u)) responses.push({ url: u, status: res.status(), content_type: res.headers()['content-type'] || '' });
      };
      page.on('response', onResponse);
      await loc.click({ timeout: 10000 }).catch(e => { throw e; });
      await sleep(8000);
      page.off('response', onResponse);
      out.click_probe = { selector: pdfClickSelector, count, page_url_after: page.url(), pages_before: before, pages_after: context.pages().map(p => p.url()), responses: responses.slice(-40), after: await collectPage(page, 'article-after-pdf-click', page.url(), null) };
    } else {
      out.click_probe = { selector: pdfClickSelector, count: 0 };
    }
  } catch (e) {
    out.click_probe = { selector: pdfClickSelector, error: e.message || String(e), page_url_after: page.url() };
  }
  return out;
}
async function main() {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const started_at = new Date().toISOString();
  const statusRun = sh(['browser:status', '--profile', PROFILE, '--output-json'], { timeout: 30000 });
  let status = parseJson(statusRun.stdout);
  let launchRun = null;
  if (!status?.connected) {
    launchRun = sh(['browser:launch', '--profile', PROFILE, '--cdp-port', String(DEFAULT_PORT), '--url', 'https://www.proquest.com/', '--json'], { timeout: 90000 });
    status = parseJson(launchRun.stdout) || status;
  }
  const endpoint = status?.cdpEndpoint || `http://127.0.0.1:${status?.cdpPort || DEFAULT_PORT}`;
  const browser = await chromium.connectOverCDP(endpoint);
  const context = browser.contexts()[0] || await browser.newContext();
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const network = [];
  page.on('response', res => {
    const u = res.url();
    if (/proquest\.com|pq-static|pendo|fulltext|docview|pdf|blob:/i.test(u)) {
      network.push({ url: u, status: res.status(), content_type: res.headers()['content-type'] || '', location: res.headers()['location'] || '' });
      if (network.length > 300) network.shift();
    }
  });
  const entrypoints = [];
  for (const [label, url] of [
    ['home', 'https://www.proquest.com/'],
    ['databases', 'https://www.proquest.com/databases'],
    ['direct-results', 'https://www.proquest.com/results?DBId=ALL&Subjects=renewable'],
    ['topic-browse', 'https://www.proquest.com/topics/renewable+energy'],
  ]) {
    entrypoints.push(await gotoCollect(page, label, url));
  }
  const advanced = await runAdvancedSearch(page);
  entrypoints.push(advanced);
  const allDocviews = [];
  for (const ep of entrypoints) {
    for (const d of ep.docview_links || []) allDocviews.push(d.url);
    for (const r of ep.result_items || []) if (/\/docview\/\d+/i.test(r.url || '')) allDocviews.push(r.url);
  }
  const docviewUrls = uniqueBy(allDocviews.filter(Boolean), u => u.replace(/[?#].*$/, '')).slice(0, 5);
  let article_flow = null;
  if (docviewUrls.length) article_flow = await discoverArticleAndPdf(page, context, docviewUrls[0]);
  await page.close().catch(() => undefined);
  await browser.close().catch(() => undefined);
  const output = {
    wave: '18-proquest',
    started_at,
    finished_at: new Date().toISOString(),
    profile: PROFILE,
    headed_chrome: true,
    browser_status: { ok: statusRun.ok, code: statusRun.code, parsed: status, stdout_prefix: statusRun.stdout.slice(0, 2000), stderr: statusRun.stderr },
    browser_launch_if_needed: launchRun ? { ok: launchRun.ok, code: launchRun.code, stdout_prefix: launchRun.stdout.slice(0, 2000), stderr: launchRun.stderr } : null,
    entrypoints,
    discovered_docview_urls: docviewUrls,
    article_flow,
    network_tail: network.slice(-120),
    conclusion: null,
  };
  const hasAuth = entrypoints.some(e => /^AUTHENTICATED|SESSION_AUTHENTICATED/.test(e.classification || ''));
  const hasLoginWall = entrypoints.some(e => e.classification === 'LOGIN_REQUIRED');
  const pdfPass = article_flow?.request_probes?.some(p => p.first5 === '%PDF-') || false;
  const clickPdfResponse = article_flow?.click_probe?.responses?.find(r => /application\/pdf/i.test(r.content_type || ''));
  if (pdfPass) output.conclusion = { gate: 'PDF_AVAILABLE', message: 'Session produced a %PDF- response from a ProQuest PDF candidate.' };
  else if (clickPdfResponse) output.conclusion = { gate: 'PDF_RESPONSE_VIA_CLICK_FLOW', message: 'Session produced an application/pdf media.proquest.com response after clicking the fulltextPDF control.', response: clickPdfResponse };
  else if (!hasAuth && hasLoginWall) output.conclusion = { gate: 'LOGIN_REQUIRED', message: 'ProQuest requires institutional login before article/PDF discovery.' };
  else if (!docviewUrls.length) output.conclusion = { gate: hasAuth ? 'NO_ARTICLE_CANDIDATES_WITH_AUTHENTICATED_SESSION' : 'LOGIN_REQUIRED_OR_NO_SESSION', message: 'No docview article candidates found from required entry points.' };
  else output.conclusion = { gate: 'DOCVIEW_FOUND_BUT_NO_PDF', message: 'Docview found but tested PDF candidates did not return %PDF-.' };
  fs.writeFileSync(OUT, JSON.stringify(output, null, 2));
  console.log(JSON.stringify({ out: OUT, conclusion: output.conclusion, docviewUrls }, null, 2));
}
main().catch(error => {
  const output = { wave: '18-proquest', failed_at: new Date().toISOString(), error: error?.stack || error?.message || String(error) };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(output, null, 2));
  console.error(output.error);
  process.exit(1);
});
