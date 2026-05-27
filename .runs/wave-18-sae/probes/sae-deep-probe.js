#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const childProcess = require('node:child_process');
const { chromium } = require('playwright');

const root = process.cwd();
const outPath = path.resolve(root, '.runs/wave-18-sae/probes/sae-deep.json');
const screenshotDir = path.resolve(root, '.runs/wave-18-sae/probes/screenshots');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.mkdirSync(screenshotDir, { recursive: true });

const entrypoints = [
  'https://www.sae.org/publications/technical-papers/',
  'https://www.sae.org/publications/technical-papers/recent/',
  'https://www.sae.org/search/?qt=&sort=relevance',
  'https://www.sae.org/publications/technical-papers/content/2024-01-1000/'
];
const extraSearches = [
  'https://www.sae.org/search?qt=2024-01-1000&sort=relevance#all=sub_group:Technical%20Paper',
  'https://www.sae.org/search?qt=cybersecurity&sort=relevance#all=sub_group:Technical%20Paper'
];
const paperIdRe = /\b\d{4}-\d{2}-\d{4}\b/i;

function sh(cmd, args) {
  return childProcess.execFileSync(cmd, args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}
function parseJson(s) { try { return JSON.parse(s); } catch (e) { return { parse_error: e.message, raw: s }; } }
function compactText(text, max = 1200) { return String(text || '').replace(/\s+/g, ' ').trim().slice(0, max); }
function isHtmlStart(buf) { return /^\s*<(?:!doctype\s+html|html|head|body|script|meta)\b/i.test(buf.toString('utf8', 0, Math.min(buf.length, 512))); }
function paperIdFromUrl(url) { return (paperIdRe.exec(String(url || '')) || [null])[0]; }
function uniq(values) { return [...new Set(values.filter(Boolean))]; }

async function waitSettled(page) {
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => undefined);
  await page.waitForTimeout(5000);
  await page.locator('#onetrust-accept-btn-handler').click({ timeout: 2500 }).catch(() => undefined);
  await page.waitForTimeout(300);
}

async function inspectPage(page, url, label) {
  const startedAt = new Date().toISOString();
  let navError = null;
  let status = null;
  try {
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
    status = response ? response.status() : null;
  } catch (e) {
    navError = e && e.message || String(e);
  }
  await waitSettled(page);
  const finalUrl = page.url();
  const title = await page.title().catch(() => '');
  const text = await page.locator('body').innerText({ timeout: 10000 }).catch(() => '');
  const data = await page.evaluate(() => {
    const abs = (href) => { try { return new URL(href, location.href).toString(); } catch { return null; } };
    const linkRows = Array.from(document.querySelectorAll('a,button')).map((el) => {
      const href = el.getAttribute('href') ? abs(el.getAttribute('href')) : null;
      const text = ((el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim()).slice(0, 220);
      return { tag: el.tagName, text, href, aria: el.getAttribute('aria-label') || '', title: el.getAttribute('title') || '' };
    });
    const headerText = Array.from(document.querySelectorAll('header,[role="banner"],.header,.site-header,.global-header')).map((el) => (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim()).filter(Boolean).join(' | ').slice(0, 1200);
    return { headerText, linkRows };
  }).catch((e) => ({ eval_error: e.message, linkRows: [] }));
  const lower = text.toLowerCase();
  const articleLinks = (data.linkRows || []).filter((x) => {
    const href = x.href || '';
    if (/#menu=/.test(href)) return false;
    return /\/papers\//i.test(href) || /\/publications\/technical-papers\/content\/[^/#?]+/i.test(href) || /saemobilus\.sae\.org\/(?:papers|content)\//i.test(href);
  }).slice(0, 40);
  const pdfDownloadLinks = (data.linkRows || []).filter((x) => /pdf|download|file_download/i.test(`${x.href || ''} ${x.text} ${x.aria} ${x.title}`)).slice(0, 40);
  const screenshot = path.join(screenshotDir, `${label.replace(/[^a-z0-9_-]+/gi, '-')}.png`);
  await page.screenshot({ path: screenshot, fullPage: true }).catch(() => undefined);
  return {
    label,
    requested_url: url,
    started_at: startedAt,
    status,
    nav_error: navError,
    final_url: finalUrl,
    title,
    text_probe: compactText(text),
    screenshot: path.relative(root, screenshot),
    has_login_link: (data.linkRows || []).some((x) => /log\s*in|login|sign\s*in/i.test(`${x.text} ${x.title} ${x.aria} ${x.href || ''}`)),
    has_purchase_text: /\bsingle purchase\b|\bsubscription purchase\b|add to cart|purchase|buy now/.test(lower),
    has_subscription_text: /for subscribers|subscribers can|subscription|subscribe/.test(lower),
    has_locked_text: /document locked|access denied|full access|you do not have access|not entitled|\block\b/.test(lower),
    has_access_granted_text: /access granted|access provided by|authenticated access|institutional access enabled/i.test(text),
    header_probe: compactText((data && data.headerText) || '', 800),
    article_link_count: articleLinks.length,
    article_links: articleLinks,
    pdf_download_links: pdfDownloadLinks,
    all_links_matching_paper_or_download: (data.linkRows || []).filter((x) => /papers|technical-papers|download|pdf|saemobilus|doi\.org\/10\.4271/i.test(`${x.href || ''} ${x.text}`)).slice(0, 80),
    eval_error: data.eval_error || null
  };
}

async function inspectDownload(context, url, label) {
  let out = { label, requested_url: url };
  try {
    const response = await context.request.get(url, {
      timeout: 90000,
      headers: { accept: 'application/pdf,text/html;q=0.9,*/*;q=0.8' }
    });
    const body = Buffer.from(await response.body());
    const headers = response.headers();
    out = {
      ...out,
      ok: response.ok(),
      status: response.status(),
      final_url: response.url(),
      content_type: headers['content-type'] || '',
      content_length_header: headers['content-length'] || '',
      bytes: body.length,
      first_bytes_latin1: body.subarray(0, 80).toString('latin1'),
      is_pdf: body.length >= 5 && body.subarray(0, 5).toString() === '%PDF-',
      is_html: isHtmlStart(body),
      html_text_probe: isHtmlStart(body) ? compactText(body.toString('utf8'), 1000) : null
    };
  } catch (e) {
    out.error = e && e.message || String(e);
  }
  return out;
}

async function main() {
  const result = {
    db: 'sae',
    profile: 'research-sae',
    created_at: new Date().toISOString(),
    headed_chrome_only: true,
    entrypoints,
    extra_searches: extraSearches,
    launch: null,
    pages: [],
    extra_pages: [],
    candidate_paper: null,
    download_tests: [],
    conclusion: null
  };

  try {
    result.launch = parseJson(sh('node', ['dist/src/cli.js', 'browser:launch', '--profile', 'research-sae', '--url', entrypoints[0], '--output-json']));
  } catch (e) {
    result.launch = { error: e.message, stdout: e.stdout && e.stdout.toString(), stderr: e.stderr && e.stderr.toString() };
    fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
    process.exit(2);
  }

  const endpoint = result.launch && result.launch.cdpEndpoint;
  if (!endpoint) throw new Error('No cdpEndpoint from browser:launch');
  const browser = await chromium.connectOverCDP(endpoint);
  try {
    const context = browser.contexts()[0] || await browser.newContext();
    const page = context.pages()[0] || await context.newPage();
    page.setDefaultTimeout(30000);
    for (let i = 0; i < entrypoints.length; i++) result.pages.push(await inspectPage(page, entrypoints[i], `entry-${i + 1}`));
    for (let i = 0; i < extraSearches.length; i++) result.extra_pages.push(await inspectPage(page, extraSearches[i], `extra-search-${i + 1}`));

    const articleHrefs = uniq(result.pages.concat(result.extra_pages).flatMap((p) => (p.article_links || []).map((x) => x.href)));
    const paperHref = articleHrefs.find((u) => /\/papers\//i.test(u) && paperIdFromUrl(u));
    const contentHref = articleHrefs.find((u) => /\/publications\/technical-papers\/content\//i.test(u) && paperIdFromUrl(u));
    const chosen = paperHref || contentHref || 'https://www.sae.org/papers/post-eol-cybersecurity-validation-automotive-production-units-2026-26-0608';
    const id = paperIdFromUrl(chosen) || '2026-26-0608';
    result.candidate_paper = {
      id,
      doi: `10.4271/${id}`,
      article_url: chosen,
      content_route: `https://www.sae.org/publications/technical-papers/content/${id}`,
      download_route: `https://www.sae.org/publications/technical-papers/content/${id}/download`,
      mobilus_content_route: `https://saemobilus.sae.org/content/${id}`
    };

    result.extra_pages.push(await inspectPage(page, result.candidate_paper.article_url, 'candidate-www-paper'));
    result.extra_pages.push(await inspectPage(page, result.candidate_paper.mobilus_content_route, 'candidate-mobilus-paper'));

    const mobilusPaperUrl = page.url().startsWith('https://saemobilus.sae.org/') ? page.url().replace(/[?#].*$/, '') : `https://saemobilus.sae.org/content/${id}`;
    for (const [label, url] of [
      ['www-content-download-pattern', result.candidate_paper.download_route],
      ['www-paper-download-pattern', `${result.candidate_paper.article_url.replace(/[?#].*$/, '')}/download`],
      ['mobilus-content-download-pattern', `https://saemobilus.sae.org/content/${id}/download`],
      ['mobilus-paper-download-pattern', `${mobilusPaperUrl}/download`]
    ]) {
      result.download_tests.push(await inspectDownload(context, url, label));
    }

    const allPages = result.pages.concat(result.extra_pages);
    const anyPdf = result.download_tests.find((x) => x.is_pdf);
    const realArticleLinks = allPages.some((p) => (p.article_links || []).some((x) => /\/papers\//i.test(x.href || '') || /saemobilus\.sae\.org\/(?:papers|content)\//i.test(x.href || '')));
    const wallSignals = allPages.some((p) => p.has_login_link || p.has_purchase_text || p.has_subscription_text || p.has_locked_text);
    const institutionSignals = allPages.some((p) => p.has_access_granted_text);
    result.conclusion = {
      article_links_found: realArticleLinks,
      candidate_id: id,
      institution_recognized: institutionSignals,
      subscription_wall_signals: wallSignals,
      direct_download_pattern_yields_pdf: !!anyPdf,
      gate: anyPdf ? 'PASS_PDF' : 'LOGIN_REQUIRED',
      note: anyPdf ? 'A direct SAE download route returned %PDF-.' : 'SAE pages expose abstracts/metadata and subscriber download controls, but all tested download routes returned HTML rather than %PDF- in research-sae.'
    };
  } finally {
    await browser.close().catch(() => undefined);
    fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
  }
  console.log(JSON.stringify({ outPath, gate: result.conclusion && result.conclusion.gate, candidate: result.candidate_paper, download_tests: result.download_tests }, null, 2));
}

main().catch((e) => {
  const partial = { db: 'sae', profile: 'research-sae', created_at: new Date().toISOString(), fatal_error: e && e.stack || String(e) };
  fs.writeFileSync(outPath, JSON.stringify(partial, null, 2));
  console.error(e && e.stack || e);
  process.exit(1);
});
