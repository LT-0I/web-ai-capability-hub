import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const outDir = '.runs/postship-fix-wave-7/probes';
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, 'file-chip-selectors.json');
const prompt = "Generate a CSV file with 3 rows. Provide it as a downloadable .csv file, not inline text.";
const selectors = [
  '[data-message-author-role="assistant"] [data-attachment]',
  '[data-message-author-role="assistant"] [data-attachment-type="file"]',
  '[data-message-author-role="assistant"] a[download]',
  '[data-message-author-role="assistant"] [role="button"][aria-label*="Download"]',
  '[data-message-author-role="assistant"] a[href*="/interpreter/download"]',
  '[data-message-author-role="assistant"] a[href*="/estuary/content"]',
  '[data-message-author-role="assistant"] button[aria-label*="Download" i]',
  '[data-message-author-role="assistant"] div.flex.flex-row.justify-between:has(div.truncate.text-sm.font-medium) button:first-of-type',
  '[data-message-author-role="assistant"] [data-testid*="file" i]',
  '[data-message-author-role="assistant"] [class*="file" i]',
  '[data-message-author-role="assistant"] [class*="attachment" i]'
];
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function closeConversationTabs(context) {
  for (const p of context.pages()) {
    const url = p.url();
    if (/^https:\/\/chatgpt\.com\/c\//.test(url)) await p.close().catch(() => {});
  }
}
async function firstVisible(page, selector, timeout = 30000) {
  const loc = page.locator(selector).first();
  await loc.waitFor({ state: 'visible', timeout });
  return loc;
}
async function sendPrompt(page) {
  await page.goto('https://chatgpt.com/?model=gpt-4o', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
  const composerSelectors = ['#prompt-textarea', 'textarea[data-testid="prompt-textarea"]', 'div[contenteditable="true"][id="prompt-textarea"]', 'main form [contenteditable="true"]'];
  let composer;
  for (const s of composerSelectors) {
    try { composer = await firstVisible(page, s, 10000); break; } catch {}
  }
  if (!composer) throw new Error('composer not found');
  await composer.click({ timeout: 10000 });
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A').catch(() => {});
  await page.keyboard.type(prompt, { delay: 2 });
  const sendSelectors = [
    'button[data-testid="send-button"]',
    'button[aria-label="Send prompt"]',
    'button[aria-label="Send message"]',
    'form button:has(svg):not([disabled])'
  ];
  let sent = false;
  for (const s of sendSelectors) {
    const loc = page.locator(s).last();
    try { await loc.waitFor({ state: 'visible', timeout: 8000 }); await loc.click({ timeout: 8000 }); sent = true; break; } catch {}
  }
  if (!sent) throw new Error('send button not found/clickable');
}
async function collect(page, matchedSelector = '') {
  return await page.evaluate(({ selectors, matchedSelector }) => {
    const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();
    const assistantMessages = Array.from(document.querySelectorAll('[data-message-author-role="assistant"]'));
    const finalAssistant = assistantMessages.at(-1) || null;
    const counts = selectors.map((selector) => {
      let count = 0, error = null, first = null;
      try {
        const nodes = Array.from(document.querySelectorAll(selector));
        count = nodes.length;
        first = nodes[0] ? {
          tag: nodes[0].tagName,
          role: nodes[0].getAttribute('role'),
          ariaLabel: nodes[0].getAttribute('aria-label'),
          dataAttachment: nodes[0].getAttribute('data-attachment'),
          dataAttachmentType: nodes[0].getAttribute('data-attachment-type'),
          href: nodes[0].getAttribute('href'),
          download: nodes[0].getAttribute('download'),
          className: typeof nodes[0].className === 'string' ? nodes[0].className : '',
          text: clean(nodes[0].innerText || nodes[0].textContent).slice(0, 300),
          outerHTML: nodes[0].outerHTML.slice(0, 2000)
        } : null;
      } catch (e) { error = String(e?.message || e); }
      return { selector, count, error, first };
    });
    const downloadish = Array.from((finalAssistant || document).querySelectorAll('a,button,[role="button"], [data-attachment], [data-attachment-type], [data-testid]')).map((el) => ({
      tag: el.tagName,
      role: el.getAttribute('role'),
      ariaLabel: el.getAttribute('aria-label'),
      dataTestId: el.getAttribute('data-testid'),
      dataAttachment: el.getAttribute('data-attachment'),
      dataAttachmentType: el.getAttribute('data-attachment-type'),
      href: el.getAttribute('href'),
      download: el.getAttribute('download'),
      className: typeof el.className === 'string' ? el.className : '',
      text: clean(el.innerText || el.textContent).slice(0, 500),
      outerHTML: el.outerHTML.slice(0, 3000)
    })).filter(x => /download|csv|file|attachment|sandbox|interpreter|estuary/i.test([x.ariaLabel,x.dataTestId,x.dataAttachment,x.dataAttachmentType,x.href,x.download,x.className,x.text].join(' '))).slice(-30);
    return {
      probedAt: new Date().toISOString(),
      url: location.href,
      title: document.title,
      prompt: arguments[0]?.prompt,
      matchedSelector,
      assistantMessageCount: assistantMessages.length,
      finalAssistantText: clean(finalAssistant?.innerText || finalAssistant?.textContent).slice(0, 4000),
      finalAssistantHTML: (finalAssistant?.outerHTML || '').slice(0, 120000),
      counts,
      downloadish
    };
  }, { selectors, matchedSelector, prompt });
}

const browser = await chromium.connectOverCDP('http://127.0.0.1:9223');
const context = browser.contexts()[0] || await browser.newContext();
await closeConversationTabs(context);
let page = context.pages().find(p => /^https:\/\/chatgpt\.com\/?/.test(p.url())) || await context.newPage();
try {
  await sendPrompt(page);
  const deadline = Date.now() + 210000;
  let matched = '';
  let lastText = '';
  while (Date.now() < deadline && !matched) {
    const text = await page.locator('body').innerText({ timeout: 5000 }).catch(() => '');
    lastText = text;
    if (/429|too many requests|rate limit|unusual activity/i.test(text)) {
      throw new Error('RATE_LIMIT_SIGNAL: ' + text.slice(0, 1000));
    }
    for (const s of selectors) {
      const count = await page.locator(s).count().catch(() => 0);
      if (count > 0) { matched = s; break; }
    }
    if (matched) break;
    // if stop button gone and no file, keep waiting for hydration; chip can lag post-stream
    await sleep(2000);
  }
  await sleep(5000);
  const result = await collect(page, matched);
  result.lastBodyTextSample = lastText.slice(-4000);
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ ok: true, outPath, matched, url: page.url() }, null, 2));
} catch (e) {
  const result = { probedAt: new Date().toISOString(), ok: false, error: String(e?.stack || e), url: page.url(), partial: await collect(page, '').catch(err => ({ collectError: String(err) })) };
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
  console.error(JSON.stringify({ ok: false, outPath, error: String(e?.message || e), url: page.url() }, null, 2));
  process.exitCode = /RATE_LIMIT_SIGNAL/.test(String(e?.message || e)) ? 42 : 1;
} finally {
  // Leave only ChatGPT home tab; close generated conversation tab after capturing DOM evidence.
  await closeConversationTabs(context);
  const home = context.pages().find(p => p.url() === 'https://chatgpt.com/' || /^https:\/\/chatgpt\.com\/?(?:$|[?#])/.test(p.url()));
  if (!home) {
    const p = await context.newPage();
    await p.goto('https://chatgpt.com/', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
  }
  await browser.close();
}
