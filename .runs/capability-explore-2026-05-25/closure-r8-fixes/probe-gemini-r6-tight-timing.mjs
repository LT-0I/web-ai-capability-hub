#!/usr/bin/env node
// R6 verification: tight-timing reproduction of production.
// Reuse existing /app/<id> tab, goto /app, wait ONLY for composer visible
// (no extra hydration wait), then immediately type + try send.
// Expectation: send_total=0 at click time, attemptSend falls back to Enter,
// Enter doesn't submit, composer keeps text, COMMAND_TIMEOUT after 8s.

import { chromium } from 'playwright';

const CDP = process.env.CDP || 'http://127.0.0.1:9225';
const FRESH_URL = 'https://gemini.google.com/app';
const PROMPT = 'probe r6: short ping';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function snap(page, label) {
  const d = await page.evaluate(() => {
    const visible = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
    const sendVisible = Array.from(document.querySelectorAll('button[aria-label="Send message"]')).filter(visible);
    const composer = document.querySelector('div[role="textbox"][aria-label="Enter a prompt for Gemini"]');
    const stopVisible = Array.from(document.querySelectorAll('button[aria-label="Stop response"]')).filter(visible);
    return {
      url: location.href,
      send_visible: sendVisible.length,
      composer_text_len: composer ? (composer.textContent || '').length : -1,
      composer_visible: composer ? visible(composer) : false,
      stop_visible: stopVisible.length,
    };
  });
  console.log(`[${label}]`, JSON.stringify(d));
  return d;
}

async function main() {
  const browser = await chromium.connectOverCDP(CDP);
  const ctx = browser.contexts()[0];
  const existing = ctx.pages().find(p => /\/app\/[a-f0-9]+/i.test(p.url() || ''));
  if (!existing) { console.log('no /app/<id> tab'); process.exit(2); }
  console.log(`[probe-r6] reusing ${existing.url()}`);
  await existing.bringToFront();

  // Mimic navigateGeminiFreshIfNeeded
  await existing.goto(FRESH_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });

  // Mimic box.waitFor (returns FAST when composer visible)
  const t0 = Date.now();
  const composer = existing.locator('div[role="textbox"][aria-label="Enter a prompt for Gemini"][contenteditable="true"]').first();
  await composer.waitFor({ state: 'visible', timeout: 15000 });
  const tBoxReady = Date.now() - t0;
  console.log(`[probe-r6] composer visible after ${tBoxReady}ms`);
  await snap(existing, `0.box-ready +${tBoxReady}ms`);

  // Mimic fillPromptBox (using fill then type fallback)
  await composer.click({ timeout: 3000 });
  await existing.keyboard.type(PROMPT, { delay: 5 });
  const tTyped = Date.now() - t0;
  console.log(`[probe-r6] typed at +${tTyped}ms`);
  await snap(existing, `1.typed +${tTyped}ms`);

  // Mimic sendPromptAndConfirmSubmitted attemptSend
  const send = existing.locator('button[aria-label="Send message"]').first();
  const sendCount = await send.count().catch(() => 0);
  console.log(`[probe-r6] sendButton.count() at +${Date.now() - t0}ms = ${sendCount}`);

  if (sendCount > 0) {
    await send.click({ timeout: 3000 }).catch(e => console.log('click err:', e.message));
    console.log(`[probe-r6] clicked send at +${Date.now() - t0}ms`);
  } else {
    console.log('[probe-r6] FALLBACK: sendButton not found → keyboard.press("Enter")');
    await existing.keyboard.press('Enter');
  }
  await sleep(250);
  await snap(existing, `2.post-send-attempt +${Date.now() - t0}ms`);
  await sleep(2000);
  await snap(existing, `3.post-send +${Date.now() - t0}ms`);
  await sleep(6000);
  await snap(existing, `4.post-send +${Date.now() - t0}ms`);

  await browser.close().catch(() => {});
}

main().catch(e => { console.error('fatal:', e); process.exit(1); });
