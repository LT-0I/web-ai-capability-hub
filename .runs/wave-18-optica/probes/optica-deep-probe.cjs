const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');

const root = process.cwd();
const outPath = path.resolve(root, '.runs/wave-18-optica/probes/optica-deep.json');
const outDir = path.dirname(outPath);
fs.mkdirSync(outDir, { recursive: true });

const profile = 'research-optica';
const profileDir = path.resolve(root, 'data/browser-profiles/research-optica');
const chrome = process.env.CHROME_BIN || '/usr/bin/google-chrome';
const port = Number(process.env.OPTICA_PROBE_CDP_PORT || 35118);
const endpoint = `http://127.0.0.1:${port}`;
const articleUri = 'ol-51-10-2872';
const doi = '10.1364/OL.531116';
const entries = [
  { label: 'abstract', url: `https://opg.optica.org/ol/abstract.cfm?uri=${articleUri}` },
  { label: 'viewmedia-journal-seq0', url: `https://opg.optica.org/ol/viewmedia.cfm?uri=${articleUri}&seq=0` },
  { label: 'doi-redirect', url: `https://doi.org/${doi}` },
  { label: 'viewmedia-root-seq0', url: `https://opg.optica.org/viewmedia.cfm?uri=${articleUri}&seq=0` },
  { label: 'abstract-root', url: `https://opg.optica.org/abstract.cfm?URI=${articleUri}` },
  { label: 'fulltext', url: `https://opg.optica.org/ol/fulltext.cfm?uri=${articleUri}` },
  { label: 'viewmedia-html', url: `https://opg.optica.org/ol/viewmedia.cfm?uri=${articleUri}&html=true` },
  { label: 'upcoming-pdf', url: `https://opg.optica.org/ol/upcoming_pdf.cfm?uri=${articleUri}` },
  { label: 'cd-pattern-guess', url: `https://opg.optica.org/ol/cd-${articleUri.replace(/^ol-/, '')}.pdf` }
];

const result = {
  db: 'optica',
  profile,
  profileDir,
  chrome,
  headed: true,
  port,
  started_at: new Date().toISOString(),
  article_uri: articleUri,
  doi,
  launch: null,
  entries: [],
  cookie_snapshots: [],
  alternative_request_probes: [],
  conclusions: [],
  ended_at: null
};

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function httpGetJson(url, timeoutMs = 1000) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch (error) { reject(error); }
      });
    });
    req.on('timeout', () => { req.destroy(new Error('timeout')); });
    req.on('error', reject);
  });
}
async function waitForCdp() {
  const deadline = Date.now() + 45000;
  let lastError = null;
  while (Date.now() < deadline) {
    try { return await httpGetJson(`${endpoint}/json/version`, 1500); }
    catch (error) { lastError = error; await sleep(500); }
  }
  throw lastError || new Error('CDP did not become ready');
}
function redactCookie(cookie) {
  return {
    name: cookie.name,
    domain: cookie.domain,
    path: cookie.path,
    expires: cookie.expires,
    httpOnly: cookie.httpOnly,
    secure: cookie.secure,
    sameSite: cookie.sameSite,
    value_redacted: true
  };
}
function headersOf(response) {
  try { return response ? response.headers() : {}; } catch { return {}; }
}
function detectCaptcha(url, title, body) {
  const hay = `${url || ''}\n${title || ''}\n${body || ''}`;
  return /\/captcha(?:\/|\?|$)|Captcha|enter the letters|Optica has implemented a process/i.test(hay);
}
function magic(buffer) {
  return Buffer.from(buffer || []).subarray(0, 5).toString('utf8');
}
async function pageSummary(page, response, label, navError, responses, downloads, popups) {
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
  await page.waitForTimeout(5000);
  const title = await page.title().catch(() => '');
  const url = page.url();
  const body = await page.locator('body').innerText({ timeout: 5000 }).catch(() => '');
  const candidates = await page.evaluate(() => {
    const attrs = ['href', 'src', 'data-pdf-url', 'data-url', 'aria-label', 'title', 'download'];
    function txt(el) { return ((el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim()).slice(0, 200); }
    return Array.from(document.querySelectorAll('a,iframe,embed,object,[data-pdf-url],[data-url]')).map((el, index) => ({
      index,
      tag: el.tagName.toLowerCase(),
      text: txt(el),
      attrs: Object.fromEntries(attrs.map((name) => [name, el.getAttribute(name)]).filter(([, value]) => !!value))
    })).filter((entry) => /pdf|download|full.?text|viewmedia|\.pdf/i.test(`${entry.text} ${Object.values(entry.attrs).join(' ')}`)).slice(0, 40);
  }).catch((error) => [{ error: error.message }]);
  return {
    label,
    requested_url: undefined,
    nav_error: navError ? String(navError.message || navError) : null,
    response_status: response ? response.status() : null,
    response_url: response ? response.url() : null,
    response_headers: headersOf(response),
    final_url: url,
    title,
    captcha_detected: detectCaptcha(url, title, body),
    body_sample: body.replace(/\s+/g, ' ').slice(0, 1000),
    pdf_candidates: candidates,
    responses,
    downloads,
    popups
  };
}
async function snapshotCookies(context, label) {
  const cookies = await context.cookies('https://opg.optica.org').catch(() => []);
  const snap = { label, at: new Date().toISOString(), count: cookies.length, cookies: cookies.map(redactCookie).sort((a, b) => a.name.localeCompare(b.name)) };
  result.cookie_snapshots.push(snap);
  return snap;
}
async function requestProbe(context, label, url) {
  const started = Date.now();
  try {
    const response = await context.request.get(url, {
      timeout: 60000,
      maxRedirects: 8,
      headers: { Accept: 'application/pdf,text/html;q=0.9,*/*;q=0.8' }
    });
    const body = Buffer.from(await response.body());
    return {
      label,
      url,
      ok: response.ok(),
      status: response.status(),
      final_url: response.url(),
      content_type: response.headers()['content-type'] || '',
      magic: magic(body),
      size: body.length,
      captcha_detected: detectCaptcha(response.url(), '', body.subarray(0, 2000).toString('utf8')),
      body_prefix: body.subarray(0, 600).toString('utf8').replace(/\s+/g, ' '),
      duration_ms: Date.now() - started
    };
  } catch (error) {
    return { label, url, ok: false, error: String(error.message || error), duration_ms: Date.now() - started };
  }
}

(async () => {
  let chromeProc = null;
  let browser = null;
  try {
    const stderrPath = path.resolve(outDir, 'optica-chrome.err.log');
    const stdoutPath = path.resolve(outDir, 'optica-chrome.out.log');
    const out = fs.openSync(stdoutPath, 'a');
    const err = fs.openSync(stderrPath, 'a');
    const args = [
      `--remote-debugging-port=${port}`,
      '--remote-debugging-address=127.0.0.1',
      `--user-data-dir=${profileDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-dev-shm-usage',
      '--window-size=1400,1000',
      'about:blank'
    ];
    chromeProc = spawn(chrome, args, { detached: true, stdio: ['ignore', out, err], env: { ...process.env, DISPLAY: process.env.DISPLAY || ':0' } });
    result.launch = { args: [chrome, ...args], pid: chromeProc.pid, stdoutPath, stderrPath };
    chromeProc.unref();
    const version = await waitForCdp();
    result.launch.version = version;
    browser = await chromium.connectOverCDP(endpoint);
    const context = browser.contexts()[0] || await browser.newContext({ acceptDownloads: true });
    await snapshotCookies(context, 'initial');

    for (const entry of entries.slice(0, 3)) {
      const page = await context.newPage();
      const responses = [];
      const downloads = [];
      const popups = [];
      page.on('response', (res) => {
        const req = res.request();
        responses.push({
          url: res.url(),
          status: res.status(),
          content_type: res.headers()['content-type'] || '',
          location: res.headers()['location'] || null,
          resource_type: req.resourceType(),
          redirected_from: req.redirectedFrom()?.url() || null
        });
      });
      page.on('download', (download) => downloads.push({ url: download.url(), suggestedFilename: download.suggestedFilename() }));
      page.on('popup', (popup) => popups.push({ initial_url: popup.url() }));
      let response = null;
      let navError = null;
      try { response = await page.goto(entry.url, { waitUntil: 'domcontentloaded', timeout: 60000 }); }
      catch (error) { navError = error; }
      const summary = await pageSummary(page, response, entry.label, navError, responses, downloads, popups);
      summary.requested_url = entry.url;
      result.entries.push(summary);
      await snapshotCookies(context, `after-${entry.label}`);
      await page.close().catch(() => undefined);
    }

    for (const entry of entries.slice(3)) {
      result.alternative_request_probes.push(await requestProbe(context, entry.label, entry.url));
      await snapshotCookies(context, `after-request-${entry.label}`);
    }

    const captchaLabels = result.entries.filter((entry) => entry.captcha_detected).map((entry) => entry.label);
    const pdfCandidates = result.entries.flatMap((entry) => entry.pdf_candidates || []);
    const pdfResponses = result.entries.flatMap((entry) => entry.responses || []).filter((entry) => /application\/pdf|\.pdf(?:$|[?#])/i.test(`${entry.content_type} ${entry.url}`));
    const successfulPdfAlt = result.alternative_request_probes.filter((entry) => entry.magic === '%PDF-');
    result.conclusions.push(`headed research-optica captcha labels: ${captchaLabels.join(', ') || 'none'}`);
    result.conclusions.push(`abstract-page PDF candidates before captcha: ${pdfCandidates.length ? JSON.stringify(pdfCandidates.slice(0, 3)) : 'none observed'}`);
    result.conclusions.push(`PDF responses observed during navigation: ${pdfResponses.length}`);
    result.conclusions.push(`alternative direct-PDF request probes with %PDF-: ${successfulPdfAlt.map((entry) => entry.label).join(', ') || 'none'}`);
  } catch (error) {
    result.error = String(error.stack || error.message || error);
  } finally {
    result.ended_at = new Date().toISOString();
    fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
    await browser?.close?.().catch(() => undefined);
    if (chromeProc?.pid) {
      try { process.kill(-chromeProc.pid, 'SIGTERM'); } catch {}
      await sleep(1500);
      try { process.kill(-chromeProc.pid, 'SIGKILL'); } catch {}
    }
  }
})().catch((error) => {
  result.error = String(error.stack || error.message || error);
  result.ended_at = new Date().toISOString();
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
  process.exitCode = 1;
});
