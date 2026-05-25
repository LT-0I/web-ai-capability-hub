#!/usr/bin/env node
// R5 verification: reproduce the production scenario where the tab was at /app/<id>
// then navigateGeminiFreshIfNeeded does goto(/app) on the SAME tab.
// If the post-navigate composer has stale state OR the send button count
// becomes > 1 (old + new), R5 is confirmed.

import { chromium } from 'playwright';

const CDP = process.env.CDP || 'http://127.0.0.1:9225';
const FRESH_URL = 'https://gemini.google.com/app';
const PROMPT = 'probe r5: count to three';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function snapshot(page, label) {
  const data = await page.evaluate(() => {
    const visible = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
    const composers = Array.from(document.querySelectorAll('div[role="textbox"][aria-label="Enter a prompt for Gemini"][contenteditable="true"]'));
    const sendBtnsAll = Array.from(document.querySelectorAll('button[aria-label="Send message"]'));
    const stopBtnsAll = Array.from(document.querySelectorAll('button[aria-label="Stop response"]'));
    return {
      url: location.href,
      composer_total: composers.length,
      composer_visible: composers.filter(visible).length,
      composer_first_text_len: composers[0] ? (composers[0].textContent || '').length : -1,
      composer_first_visible: composers[0] ? visible(composers[0]) : false,
      send_total: sendBtnsAll.length,
      send_visible: sendBtnsAll.filter(visible).length,
      send_first_visible: sendBtnsAll[0] ? visible(sendBtnsAll[0]) : false,
      stop_total: stopBtnsAll.length,
      stop_visible: stopBtnsAll.filter(visible).length,
    };
  });
  console.log(`[${label}]`, JSON.stringify(data));
  return data;
}

async function main() {
  console.log(`[probe-r5] connecting to ${CDP}`);
  const browser = await chromium.connectOverCDP(CDP);
  const ctx = browser.contexts()[0];

  // Find an existing /app/<id> tab to reuse (like production)
  const existing = ctx.pages().find(p => /\/app\/[a-f0-9]+/i.test(p.url() || ''));
  if (!existing) {
    console.log('[probe-r5] WARN: no /app/<id> tab found, opening one first');
    process.exit(2);
  }
  console.log(`[probe-r5] reusing existing tab at ${existing.url()}`);
  await existing.bringToFront();

  await snapshot(existing, '0.pre-nav (existing /app/<id>)');

  // Mimic navigateGeminiFreshIfNeeded -> page.goto(GEMINI_FRESH_URL)
  console.log('[probe-r5] goto /app (mimics navigateGeminiFreshIfNeeded fallback)');
  await existing.goto(FRESH_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(1500);
  await snapshot(existing, '1.post-goto +1.5s');

  await sleep(4000);
  await snapshot(existing, '2.post-goto +5.5s');

  console.log('[probe-r5] typing prompt');
  const composer = existing.locator('div[role="textbox"][aria-label="Enter a prompt for Gemini"][contenteditable="true"]').first();
  await composer.click({ timeout: 3000 });
  await existing.keyboard.type(PROMPT, { delay: 10 });
  await sleep(250);
  await snapshot(existing, '3.post-type-250ms');

  console.log('[probe-r5] Playwright click on send.first() (also test raw CDP later)');
  const send = existing.locator('button[aria-label="Send message"]').first();
  await send.click({ timeout: 3000 });
  await sleep(250);
  await snapshot(existing, '4.post-click +250ms');
  await sleep(2000);
  await snapshot(existing, '5.post-click +2.25s');
  await sleep(6000);
  await snapshot(existing, '6.post-click +8.25s');

  await browser.close().catch(() => {});
  console.log('[probe-r5] done — DID NOT close the reused tab');
}

main().catch(e => { console.error('[probe-r5] fatal:', e); process.exit(1); });
