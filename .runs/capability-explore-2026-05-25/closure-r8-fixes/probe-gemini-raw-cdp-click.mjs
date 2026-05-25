#!/usr/bin/env node
// R4 verification: reproduce production's raw-CDP-click on fresh /app composer.
// If this reproduces the failure (composer not cleared, no pending state) where
// the playwright .click() probe succeeded, R4 (raw CDP misses early click before
// Angular handler binding) is confirmed.

import { chromium } from 'playwright';

const CDP = process.env.CDP || 'http://127.0.0.1:9225';
const FRESH_URL = 'https://gemini.google.com/app';
const PROMPT = 'probe r4: count to three';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function snapshot(page, label) {
  const data = await page.evaluate(() => {
    const visible = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
    const composer = document.querySelector('div[role="textbox"][aria-label="Enter a prompt for Gemini"][contenteditable="true"][data-placeholder="Ask Gemini"]');
    const sendBtns = Array.from(document.querySelectorAll('button[aria-label="Send message"]')).filter(visible);
    const stopBtns = Array.from(document.querySelectorAll('button[aria-label="Stop response"]')).filter(visible);
    return {
      composer_text_len: composer ? (composer.textContent || '').length : -1,
      composer_text_head: composer ? (composer.textContent || '').slice(0, 60) : '',
      send_visible: sendBtns.length,
      stop_visible: stopBtns.length,
    };
  });
  console.log(`[${label}]`, JSON.stringify(data));
  return data;
}

async function rawCdpClick(page, locator) {
  // Mimic robustClickLocator's raw CDP path
  const handles = await locator.elementHandles();
  const handle = handles[0];
  await handle.scrollIntoViewIfNeeded({ timeout: 2000 }).catch(() => {});
  const box = await handle.boundingBox();
  if (!box) throw new Error('no bbox');
  const cdp = await page.context().newCDPSession(page);
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  const startX = Math.max(0, x - 40);
  const startY = Math.max(0, y - 40);
  for (let i = 1; i <= 5; i++) {
    const ratio = i / 5;
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: startX + (x - startX) * ratio, y: startY + (y - startY) * ratio, button: 'none', buttons: 0 });
  }
  await sleep(80);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 });
  await cdp.detach().catch(() => {});
}

async function main() {
  console.log(`[probe-r4] connecting to ${CDP}`);
  const browser = await chromium.connectOverCDP(CDP);
  const ctx = browser.contexts()[0];
  const page = await ctx.newPage();
  await page.goto(FRESH_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(1500);
  await snapshot(page, '1.post-nav-1.5s');

  console.log('[probe-r4] typing prompt');
  const composer = page.locator('div[role="textbox"][aria-label="Enter a prompt for Gemini"][contenteditable="true"]').first();
  await composer.click({ timeout: 3000 });
  await page.keyboard.type(PROMPT, { delay: 10 });
  await sleep(250); // mimics production's waitForTimeout(250) before send
  await snapshot(page, '2.post-type-250ms');

  console.log('[probe-r4] RAW CDP click on send button (mimics production)');
  const send = page.locator('button[aria-label="Send message"]').first();
  await rawCdpClick(page, send);
  await sleep(250);
  await snapshot(page, '3.post-raw-cdp-click-250ms');
  await sleep(2000);
  await snapshot(page, '4.post-raw-cdp-click-2.25s');
  await sleep(6000);
  await snapshot(page, '5.post-raw-cdp-click-8.25s');

  console.log('[probe-r4] closing probe tab');
  await page.close().catch(() => {});
  await browser.close().catch(() => {});
}

main().catch(e => { console.error('[probe-r4] fatal:', e); process.exit(1); });
