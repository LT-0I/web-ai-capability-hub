#!/usr/bin/env node
// R7: matches production fillPromptBox path (box.fill first, NOT keyboard.type).
// Hypothesis: Playwright .fill() on Gemini's contenteditable inserts text but
// does not dispatch the events Angular needs to enable Send. Probes R1-R6 used
// keyboard.type() (the production fallback path, not the primary), so they
// passed. This probe also captures Send button aria-disabled before/after click
// to confirm whether Send is enabled at click time.

import { chromium } from 'playwright';

const CDP = process.env.CDP || 'http://127.0.0.1:9225';
const FRESH_URL = 'https://gemini.google.com/app';
const PROMPT = 'probe r7: short ping';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function readSendState(page, label) {
  const data = await page.evaluate(() => {
    const visible = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
    const composer = document.querySelector('div[role="textbox"][aria-label="Enter a prompt for Gemini"]');
    const sendBtns = Array.from(document.querySelectorAll('button[aria-label="Send message"]'));
    const sendVisible = sendBtns.filter(visible);
    const sendFirst = sendBtns[0];
    const stopVisible = Array.from(document.querySelectorAll('button[aria-label="Stop response"]')).filter(visible);
    return {
      url: location.href,
      composer_text_len: composer ? (composer.textContent || '').length : -1,
      composer_text_head: composer ? (composer.textContent || '').slice(0, 60) : '',
      composer_visible: composer ? visible(composer) : false,
      send_count: sendBtns.length,
      send_visible_count: sendVisible.length,
      send_first_aria_disabled: sendFirst ? sendFirst.getAttribute('aria-disabled') : null,
      send_first_disabled_prop: sendFirst ? sendFirst.disabled : null,
      send_first_visible: sendFirst ? visible(sendFirst) : null,
      send_first_class: sendFirst ? (sendFirst.className || '').split(/\s+/).slice(0, 4).join(' ') : null,
      stop_visible: stopVisible.length,
    };
  });
  console.log(`[${label}]`, JSON.stringify(data));
  return data;
}

async function main() {
  const browser = await chromium.connectOverCDP(CDP);
  const ctx = browser.contexts()[0];
  const existing = ctx.pages().find(p => /\/app\/[a-f0-9]+/i.test(p.url() || ''));
  if (!existing) { console.log('no /app/<id> tab'); process.exit(2); }
  console.log(`[probe-r7] reusing ${existing.url()}`);
  await existing.bringToFront();

  await existing.goto(FRESH_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });

  const t0 = Date.now();
  const composerSel = 'div[role="textbox"][aria-label="Enter a prompt for Gemini"][contenteditable="true"]';
  const composer = existing.locator(composerSel).first();
  await composer.waitFor({ state: 'visible', timeout: 15000 });
  const tBoxReady = Date.now() - t0;
  console.log(`[probe-r7] composer visible after ${tBoxReady}ms`);
  await readSendState(existing, `0.box-ready +${tBoxReady}ms`);

  // KEY DIFFERENCE: use box.fill() (matches production fillPromptBox primary path)
  console.log(`[probe-r7] calling box.fill() (production primary path)`);
  try {
    await composer.fill(PROMPT, { timeout: 3000 });
    console.log(`[probe-r7] box.fill() succeeded at +${Date.now() - t0}ms`);
  } catch (e) {
    console.log(`[probe-r7] box.fill() threw: ${e.message}`);
  }
  await readSendState(existing, `1.post-fill +${Date.now() - t0}ms`);
  await sleep(250);
  await readSendState(existing, `2.post-fill+250ms +${Date.now() - t0}ms`);

  // Try clicking Send (matching attemptSend via robustClickLocator → raw CDP path)
  const send = existing.locator('button[aria-label="Send message"]').first();
  const sendCount = await send.count().catch(() => 0);
  console.log(`[probe-r7] send count at click time = ${sendCount}`);

  if (sendCount > 0) {
    // First try playwright .click() (would catch aria-disabled in strict mode)
    const clickResult = await send.click({ timeout: 3000 }).then(() => 'ok').catch(e => `err: ${e.message.slice(0, 200)}`);
    console.log(`[probe-r7] send.click() result: ${clickResult} at +${Date.now() - t0}ms`);
  } else {
    console.log('[probe-r7] FALLBACK: keyboard Enter');
    await existing.keyboard.press('Enter');
  }
  await sleep(250);
  await readSendState(existing, `3.post-click+250ms +${Date.now() - t0}ms`);
  await sleep(2000);
  await readSendState(existing, `4.post-click+2.25s +${Date.now() - t0}ms`);
  await sleep(6000);
  await readSendState(existing, `5.post-click+8.25s +${Date.now() - t0}ms`);

  // If we reproduced the bug (composer still has text), now try the recovery
  // path: keyboard.type() the same prompt and see if Send becomes enabled.
  console.log(`\n[probe-r7] RECOVERY: clearing + keyboard.type() to compare`);
  await composer.click({ timeout: 3000 });
  await existing.keyboard.press('Control+A').catch(() => {});
  await existing.keyboard.press('Delete').catch(() => {});
  await sleep(200);
  await readSendState(existing, `6.cleared +${Date.now() - t0}ms`);
  await existing.keyboard.type(PROMPT, { delay: 5 });
  await sleep(250);
  await readSendState(existing, `7.post-keyboard-type +${Date.now() - t0}ms`);

  await browser.close().catch(() => {});
}

main().catch(e => { console.error('fatal:', e); process.exit(1); });
