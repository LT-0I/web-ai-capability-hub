const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { chromium } = require('playwright');

const DOI = '10.1061/JCEMD4.COENG-18065';
const ARTICLE_URL = `https://ascelibrary.org/doi/${DOI}`;
const DIRECT_PDF_URL = `https://ascelibrary.org/doi/pdf/${DOI}`;
const RUN_DIR = path.resolve('.runs/wave-18-asce');
const PROBE_OUT = path.join(RUN_DIR, 'probes', 'asce-deep.json');
const DOWNLOAD_DIR = path.join(RUN_DIR, 'downloads', 'probe');
const PROFILE_DIR = path.resolve('data/browser-profiles/research-asce');

function ensureDir(dir) { fs.mkdirSync(dir, { recursive: true }); return dir; }
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function sha256(buf) { return crypto.createHash('sha256').update(buf).digest('hex'); }
function safeSample(buf, max = 600) { return buf.subarray(0, max).toString('utf8').replace(/[\u0000-\u001f]+/g, ' ').slice(0, max); }
function relevantUrl(url) {
  return /ascelibrary\.org|doi|pdf|download|readcube|access|login|signin|saml|shibboleth|auth|captcha|cloudflare|akamai|silverchair|atypon/i.test(String(url || ''));
}
function shortHeaders(headers) {
  const out = {};
  for (const key of ['content-type', 'content-disposition', 'location', 'set-cookie', 'x-cache', 'cf-ray', 'server']) {
    const v = headers[key] || headers[key.toLowerCase()] || headers[key.toUpperCase()];
    if (v) out[key] = String(v).slice(0, key === 'set-cookie' ? 220 : 500);
  }
  return out;
}
function removeStaleProfileLocks() {
  for (const name of ['SingletonLock', 'SingletonCookie', 'SingletonSocket']) {
    const file = path.join(PROFILE_DIR, name);
    try { fs.rmSync(file, { force: true }); } catch {}
  }
}
function attachNetwork(page, bucket, statusState) {
  page.on('request', (req) => {
    const url = req.url();
    if (!relevantUrl(url) && bucket.requests.length > 250) return;
    const redirectedFrom = req.redirectedFrom();
    bucket.requests.push({
      at: new Date().toISOString(),
      method: req.method(),
      url,
      resourceType: req.resourceType(),
      redirectedFrom: redirectedFrom ? redirectedFrom.url() : null
    });
    if (bucket.requests.length > 400) bucket.requests.shift();
  });
  page.on('response', async (res) => {
    const url = res.url();
    const status = res.status();
    if (status === 429) statusState.consecutive429 += 1;
    else if (status) statusState.consecutive429 = 0;
    if (!relevantUrl(url) && ![301, 302, 303, 307, 308, 401, 403, 429].includes(status)) return;
    let headers = {};
    try { headers = await res.allHeaders(); } catch { try { headers = res.headers(); } catch {} }
    bucket.responses.push({
      at: new Date().toISOString(),
      status,
      url,
      requestMethod: res.request()?.method?.() || null,
      fromServiceWorker: typeof res.fromServiceWorker === 'function' ? res.fromServiceWorker() : undefined,
      headers: shortHeaders(headers)
    });
    if (bucket.responses.length > 400) bucket.responses.shift();
  });
  page.on('dialog', async (dialog) => {
    bucket.dialogs.push({ type: dialog.type(), message: dialog.message() });
    await dialog.dismiss().catch(() => undefined);
  });
  page.on('console', (msg) => {
    const text = msg.text();
    if (/pdf|download|access|error|denied|forbidden|login|auth/i.test(text)) {
      bucket.console.push({ type: msg.type(), text: text.slice(0, 500) });
    }
  });
}
async function inspectDom(page) {
  return await page.evaluate(() => {
    const visible = (el) => {
      if (!el) return false;
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none' && style.opacity !== '0';
    };
    const txt = (el) => ((el.innerText || el.textContent || '') + '').replace(/\s+/g, ' ').trim();
    let counter = 0;
    const all = Array.from(document.querySelectorAll('a,button,[role="button"],[onclick],[aria-label],[title]'));
    const candidates = all.map((el) => {
      const index = counter++;
      el.setAttribute('data-wave18-index', String(index));
      const rect = el.getBoundingClientRect();
      const text = txt(el);
      const aria = el.getAttribute('aria-label') || '';
      const title = el.getAttribute('title') || '';
      const href = el.href || el.getAttribute('href') || '';
      const cls = el.getAttribute('class') || '';
      const id = el.getAttribute('id') || '';
      const role = el.getAttribute('role') || '';
      const hay = `${text} ${aria} ${title} ${href} ${cls} ${id} ${role}`;
      return {
        index,
        tag: el.tagName.toLowerCase(),
        text: text.slice(0, 220),
        aria: aria.slice(0, 220),
        title: title.slice(0, 220),
        href,
        id,
        className: cls.slice(0, 220),
        role,
        visible: visible(el),
        disabled: !!el.disabled || el.getAttribute('aria-disabled') === 'true',
        box: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) },
        matched: /\b(pdf|download|read|full text|access|get access|view)\b/i.test(hay)
      };
    }).filter((entry) => entry.matched);
    const modalCandidates = Array.from(document.querySelectorAll('[role="dialog"],[aria-modal="true"],.modal,.Modal,.reveal-modal,[class*="modal" i],[class*="dialog" i],[class*="overlay" i]'))
      .filter(visible)
      .map((el) => ({ tag: el.tagName.toLowerCase(), id: el.id || '', className: (el.getAttribute('class') || '').slice(0, 220), text: txt(el).slice(0, 700) }));
    const bodyText = (document.body?.innerText || '').replace(/\s+/g, ' ').trim();
    return {
      url: location.href,
      title: document.title,
      readyState: document.readyState,
      candidates,
      modalCandidates,
      bodySample: bodyText.slice(0, 1800),
      flags: {
        hasPdfText: /\bPDF\b/i.test(bodyText),
        hasDownloadText: /download/i.test(bodyText),
        hasReadText: /\bread\b/i.test(bodyText),
        hasGetAccess: /get access|access through your institution|purchase|subscribe/i.test(bodyText),
        hasLogin: /log\s*in|sign\s*in|institutional login|shibboleth|athens/i.test(bodyText),
        hasPasswordInput: !!document.querySelector('input[type="password"]'),
        antiBotLike: /请稍候|just a moment|checking your browser|enable javascript|captcha|access denied/i.test(bodyText + ' ' + document.title)
      }
    };
  }).catch((error) => ({ error: error.message, url: page.url(), title: null, candidates: [], modalCandidates: [], flags: {} }));
}
function scoreCandidate(c) {
  const hay = `${c.text} ${c.aria} ${c.title} ${c.href} ${c.className}`;
  let score = 0;
  if (c.visible) score += 20;
  if (/\/doi\/pdf\//i.test(c.href)) score += 60;
  if (/\bdownload pdf\b/i.test(hay)) score += 55;
  if (/\bpdf\b/i.test(hay)) score += 45;
  if (/download/i.test(hay)) score += 20;
  if (/read\s*online|ePDF|epdf/i.test(hay)) score += 10;
  if (/citation|references|permissions|share|figures|tables|metrics/i.test(hay)) score -= 80;
  if (c.disabled) score -= 100;
  return score;
}
async function saveDownload(download, label) {
  const suggestedFilename = await download.suggestedFilename().catch(() => null);
  const target = path.join(DOWNLOAD_DIR, `${Date.now()}-${label}-${suggestedFilename || 'download.bin'}`.replace(/[^a-zA-Z0-9_.-]+/g, '_'));
  await download.saveAs(target).catch(() => undefined);
  let info = { suggestedFilename, url: download.url(), savedPath: fs.existsSync(target) ? target : null };
  if (info.savedPath) {
    const buf = fs.readFileSync(info.savedPath);
    info.size = buf.length;
    info.magic = buf.subarray(0, 5).toString();
    info.sha256 = sha256(buf);
  }
  return info;
}
async function probeArticleAndClick(context, statusState, result) {
  const page = await context.newPage();
  const bucket = { requests: [], responses: [], dialogs: [], console: [] };
  const popups = [];
  page.on('popup', (popup) => popups.push(popup));
  attachNetwork(page, bucket, statusState);
  const probe = { articleUrl: ARTICLE_URL, network: bucket, attempts: [], click: null, closed: false };
  try {
    for (let attempt = 1; attempt <= 2; attempt++) {
      const entry = { attempt, startedAt: new Date().toISOString() };
      try {
        const response = await page.goto(ARTICLE_URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
        entry.goto = { status: response ? response.status() : null, url: response ? response.url() : null, headers: response ? shortHeaders(await response.allHeaders().catch(() => response.headers())) : {} };
        await page.waitForLoadState('networkidle', { timeout: 45000 }).catch((error) => { entry.networkidleError = error.message; });
        await page.waitForTimeout(5000);
        entry.dom = await inspectDom(page);
      } catch (error) {
        entry.error = error.message;
        entry.dom = await inspectDom(page);
      }
      probe.attempts.push(entry);
      if (statusState.consecutive429 >= 2) return probe;
      if (entry.dom?.flags?.antiBotLike && attempt < 2) {
        entry.retryAfterMs = 15000;
        await sleep(15000);
        continue;
      }
      break;
    }
    const dom = probe.attempts[probe.attempts.length - 1]?.dom || await inspectDom(page);
    const clickCandidates = [...(dom.candidates || [])]
      .map((c) => ({ ...c, score: scoreCandidate(c) }))
      .filter((c) => c.score > 0)
      .sort((a, b) => b.score - a.score);
    probe.clickCandidates = clickCandidates.slice(0, 25);
    if (clickCandidates.length) {
      const target = clickCandidates[0];
      const clickInfo = { target, beforeUrl: page.url(), beforePages: context.pages().map((p) => p.url()), startedAt: new Date().toISOString() };
      const popupPromise = context.waitForEvent('page', { timeout: 12000 }).catch(() => null);
      const downloadPromise = page.waitForEvent('download', { timeout: 45000 }).catch(() => null);
      try {
        const locator = page.locator(`[data-wave18-index="${target.index}"]`).first();
        await locator.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => undefined);
        await page.waitForTimeout(500);
        await locator.click({ timeout: 12000 });
        clickInfo.clickError = null;
      } catch (error) {
        clickInfo.clickError = error.message;
        try {
          await page.evaluate((idx) => {
            const el = document.querySelector(`[data-wave18-index="${idx}"]`);
            if (el) el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
          }, String(target.index));
          clickInfo.domDispatchTried = true;
        } catch (evalError) {
          clickInfo.domDispatchError = evalError.message;
        }
      }
      await page.waitForTimeout(6000);
      const [download, popup] = await Promise.all([downloadPromise, popupPromise]);
      if (download) clickInfo.download = await saveDownload(download, 'click');
      if (popup) {
        popups.push(popup);
        await popup.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => undefined);
        await popup.waitForTimeout(2500).catch(() => undefined);
        clickInfo.popup = { url: popup.url(), title: await popup.title().catch(() => ''), dom: await inspectDom(popup).catch((e) => ({ error: e.message })) };
      }
      clickInfo.afterUrl = page.url();
      clickInfo.afterTitle = await page.title().catch(() => '');
      clickInfo.afterDom = await inspectDom(page);
      clickInfo.afterPages = context.pages().map((p) => p.url());
      probe.click = clickInfo;
    }
    return probe;
  } finally {
    for (const popup of popups.reverse()) await popup.close({ runBeforeUnload: false }).catch(() => undefined);
    await page.close({ runBeforeUnload: false }).catch(() => undefined);
    probe.closed = true;
  }
}
async function probeDirectFetch(context, statusState) {
  const probe = { url: DIRECT_PDF_URL, via: 'context.request.get with active profile cookies', startedAt: new Date().toISOString() };
  try {
    const response = await context.request.get(DIRECT_PDF_URL, {
      timeout: 90000,
      headers: { Accept: 'application/pdf,text/html;q=0.9,*/*;q=0.8', Referer: ARTICLE_URL }
    });
    const headers = response.headers();
    const body = Buffer.from(await response.body());
    if (response.status() === 429) statusState.consecutive429 += 1; else statusState.consecutive429 = 0;
    probe.status = response.status();
    probe.ok = response.ok();
    probe.finalUrl = response.url();
    probe.headers = shortHeaders(headers);
    probe.size = body.length;
    probe.magic = body.subarray(0, 5).toString();
    probe.sha256 = sha256(body);
    probe.sample = safeSample(body);
    if (probe.magic === '%PDF-') {
      const pdfPath = path.join(DOWNLOAD_DIR, 'direct-fetch.pdf');
      fs.writeFileSync(pdfPath, body);
      probe.savedPath = pdfPath;
    }
  } catch (error) {
    probe.error = error.message;
  }
  return probe;
}
async function probeDirectNavigation(context, statusState) {
  const page = await context.newPage();
  const bucket = { requests: [], responses: [], dialogs: [], console: [] };
  attachNetwork(page, bucket, statusState);
  const probe = { url: DIRECT_PDF_URL, via: 'page.goto', network: bucket, startedAt: new Date().toISOString(), closed: false };
  try {
    const downloadPromise = page.waitForEvent('download', { timeout: 45000 }).catch(() => null);
    try {
      const response = await page.goto(DIRECT_PDF_URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
      probe.goto = { status: response ? response.status() : null, url: response ? response.url() : null, headers: response ? shortHeaders(await response.allHeaders().catch(() => response.headers())) : {} };
      await page.waitForLoadState('networkidle', { timeout: 20000 }).catch((error) => { probe.networkidleError = error.message; });
      await page.waitForTimeout(5000);
    } catch (error) {
      probe.gotoError = error.message;
      await page.waitForTimeout(5000).catch(() => undefined);
    }
    const download = await downloadPromise;
    if (download) probe.download = await saveDownload(download, 'direct-nav');
    probe.finalUrl = page.url();
    probe.title = await page.title().catch(() => '');
    probe.dom = await inspectDom(page);
    return probe;
  } finally {
    await page.close({ runBeforeUnload: false }).catch(() => undefined);
    probe.closed = true;
  }
}
(async () => {
  ensureDir(path.dirname(PROBE_OUT));
  ensureDir(DOWNLOAD_DIR);
  const result = {
    wave: '18-asce',
    startedAt: new Date().toISOString(),
    headedChrome: true,
    display: process.env.DISPLAY || null,
    xauthority: process.env.XAUTHORITY || null,
    profile: 'research-asce',
    profileDir: PROFILE_DIR,
    doi: DOI,
    articleUrl: ARTICLE_URL,
    directPdfUrl: DIRECT_PDF_URL,
    probes: {},
    stop: null
  };
  const statusState = { consecutive429: 0 };
  removeStaleProfileLocks();
  let context;
  try {
    context = await chromium.launchPersistentContext(PROFILE_DIR, {
      headless: false,
      executablePath: '/usr/bin/google-chrome',
      acceptDownloads: true,
      downloadsPath: DOWNLOAD_DIR,
      viewport: { width: 1440, height: 1000 },
      locale: 'en-US',
      args: [
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-background-networking',
        '--disable-features=Translate,AutomationControlled',
        '--start-maximized'
      ]
    });
    const keeperPage = context.pages()[0] || await context.newPage();
    result.userAgent = await keeperPage.evaluate(() => navigator.userAgent).catch((e) => `ua-error:${e.message}`);
    result.keeperPage = { url: keeperPage.url() };
    result.probes.articleAndClick = await probeArticleAndClick(context, statusState, result);
    if (statusState.consecutive429 >= 2) result.stop = 'two consecutive 429 responses during article/click probe';
    if (!result.stop) result.probes.directFetch = await probeDirectFetch(context, statusState);
    if (statusState.consecutive429 >= 2) result.stop = 'two consecutive 429 responses before direct navigation probe';
    if (!result.stop) result.probes.directNavigation = await probeDirectNavigation(context, statusState);
  } catch (error) {
    result.error = error.stack || error.message;
  } finally {
    await context?.close?.().catch(() => undefined);
    result.finishedAt = new Date().toISOString();
    fs.writeFileSync(PROBE_OUT, JSON.stringify(result, null, 2));
    console.log(JSON.stringify({ out: PROBE_OUT, stop: result.stop, error: result.error || null }, null, 2));
  }
})();
