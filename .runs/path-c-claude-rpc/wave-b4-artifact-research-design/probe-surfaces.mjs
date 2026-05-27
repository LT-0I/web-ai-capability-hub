#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const OUT = path.resolve('.runs/path-c-claude-rpc/wave-b4-artifact-research-design');
const CDP = process.env.CDP_URL || 'http://127.0.0.1:9224';
const PROJECT_URL = process.env.CLAUDE_DESIGN_PROJECT_URL || 'https://claude.ai/design/p/6b373bb0-fe5f-4558-8040-ea03c3becb4a';
const HTML_CHAT_URL = process.env.CLAUDE_HTML_CHAT_URL || 'https://claude.ai/chat/703edfc7-662f-4a00-9f93-ad228335e257';
const SEL = {
  designMount: 'textarea[data-testid="chat-composer-input"], input[placeholder="Project name"], iframe[data-testid="html-viewer-iframe"], iframe[src*="claudeusercontent.com"], button:has-text("Present")',
  artifactMount: 'main, [data-testid*="artifact" i], iframe, button[aria-label*="Download" i]'
};
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function ensureDir(d){ await fs.mkdir(d,{recursive:true}); }
async function pageInfo(page, label){
  await page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(()=>{});
  await sleep(2500);
  const info = await page.evaluate(() => {
    const entries = performance.getEntriesByType('resource').map(e => ({ name: e.name, initiatorType: e.initiatorType, duration: e.duration }));
    const iframes = Array.from(document.querySelectorAll('iframe')).map((el) => ({ src: el.getAttribute('src'), srcdocLen: (el.getAttribute('srcdoc')||'').length, testid: el.getAttribute('data-testid') }));
    const scripts = Array.from(document.scripts).map(s => s.src).filter(Boolean).slice(-20);
    return { url: location.href, title: document.title, text: (document.body?.innerText || '').slice(0, 4000), entries, iframes, scripts };
  });
  await fs.writeFile(path.join(OUT, `${label}.json`), JSON.stringify(info, null, 2));
  return info;
}
async function main(){
  await ensureDir(OUT);
  const browser = await chromium.connectOverCDP(CDP);
  const context = browser.contexts()[0] || await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto(PROJECT_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector(SEL.designMount, { state: 'attached', timeout: 30000 }).catch(()=>{});
    const design = await pageInfo(page, 'surface-design-project');
    const viewerUrl = PROJECT_URL.includes('?') ? `${PROJECT_URL}&file=index.html` : `${PROJECT_URL}?file=index.html`;
    await page.goto(viewerUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector(SEL.designMount, { state: 'attached', timeout: 30000 }).catch(()=>{});
    const designViewer = await pageInfo(page, 'surface-design-viewer');
    await page.goto(HTML_CHAT_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector(SEL.artifactMount, { state: 'attached', timeout: 30000 }).catch(()=>{});
    const artifact = await pageInfo(page, 'surface-html-artifact-chat');
    console.log(JSON.stringify({ ok: true, designUrl: design.url, designViewerUrl: designViewer.url, artifactUrl: artifact.url, designIframeCount: designViewer.iframes.length, artifactIframeCount: artifact.iframes.length }, null, 2));
  } finally {
    await page.close({ runBeforeUnload: false }).catch(()=>{});
    await browser.close().catch(()=>{});
  }
}
main().catch(e => { console.error(e.stack || String(e)); process.exit(1); });
