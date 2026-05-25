#!/usr/bin/env node
// R8: EXACT production mimic of sendPromptAndConfirmSubmitted timing.
// R7 revealed: Send button count=0 immediately after box.fill(), only appears
// ~250ms later. Production's attemptSend runs WITHOUT pre-wait, so the first
// attempt falls through the count-0 branch into page.keyboard.press("Enter").
// On Gemini's contenteditable, Enter inserts a newline rather than submitting,
// so the composer text grows from "prompt" to "prompt\n". The 2nd attempt
// (250ms later) finds Send button but the state may already be inconsistent.

import { chromium } from 'playwright';

const CDP = process.env.CDP || 'http://127.0.0.1:9225';
const FRESH_URL = 'https://gemini.google.com/app';
const PROMPT = 'probe r8: short ping';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function snap(page, label, t0) {
  const d = await page.evaluate(() => {
    const visible = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
    const composer = document.querySelector('div[role="textbox"][aria-label="Enter a prompt for Gemini"]');
    const sendBtns = Array.from(document.querySelectorAll('button[aria-label="Send message"]'));
    const stopBtns = Array.from(document.querySelectorAll('button[aria-label="Stop response"]'));
    return {
      url: location.href,
      composer_text_len: composer ? (composer.textContent || '').length : -1,
      composer_text_head: composer ? (composer.textContent || '').slice(0, 80) : '',
      composer_innerHTML_head: composer ? (composer.innerHTML || '').slice(0, 200) : '',
      send_count: sendBtns.length,
      send_first_disabled: sendBtns[0] ? (sendBtns[0].getAttribute('aria-disabled') || sendBtns[0].disabled) : null,
      stop_visible: stopBtns.filter(visible).length,
    };
  });
  console.log(`[+${Date.now() - t0}ms ${label}]`, JSON.stringify(d));
  return d;
}

async function main() {
  const browser = await chromium.connectOverCDP(CDP);
  const ctx = browser.contexts()[0];
  const existing = ctx.pages().find(p => /\/app\/[a-f0-9]+/i.test(p.url() || ''));
  if (!existing) { console.log('no /app/<id> tab'); process.exit(2); }
  console.log(`[probe-r8] reusing ${existing.url()}`);
  await existing.bringToFront();

  await existing.goto(FRESH_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });

  const t0 = Date.now();
  const composer = existing.locator('div[role="textbox"][aria-label="Enter a prompt for Gemini"][contenteditable="true"]').first();
  await composer.waitFor({ state: 'visible', timeout: 15000 });
  console.log(`[probe-r8] composer visible @+${Date.now() - t0}ms`);

  // === EXACT MIMIC OF fillPromptBox ===
  console.log(`[probe-r8] fillPromptBox: box.fill()`);
  await composer.fill(PROMPT);
  // Note: production immediately proceeds to sendPromptAndConfirmSubmitted with no sleep
  await snap(existing, 'POST-FILL (production immediately starts attemptSend here)', t0);

  // === EXACT MIMIC OF sendPromptAndConfirmSubmitted ===
  const sendSel = 'button[aria-label="Send message"]';
  const sendLoc = existing.locator(sendSel).first();

  console.log(`\n[probe-r8] === attempt 1 (production attemptSend) ===`);
  const sendCountA1 = await sendLoc.count().catch(() => 0);
  console.log(`[probe-r8] attempt 1: sendButton count=${sendCountA1}`);
  if (sendCountA1 > 0) {
    console.log(`[probe-r8] attempt 1: would robustClickLocator → CDP click`);
    await sendLoc.click({ timeout: 3000 }).catch(e => console.log('click err:', e.message));
  } else {
    console.log(`[probe-r8] attempt 1: count=0 → page.keyboard.press("Enter") [THE BUG]`);
    await existing.keyboard.press('Enter');
  }
  await snap(existing, 'POST attempt-1', t0);
  await sleep(250);
  await snap(existing, 'POST attempt-1 +250ms (production pendingState check here)', t0);

  console.log(`\n[probe-r8] === attempt 2 ===`);
  const sendCountA2 = await sendLoc.count().catch(() => 0);
  console.log(`[probe-r8] attempt 2: sendButton count=${sendCountA2}`);
  if (sendCountA2 > 0) {
    await sendLoc.click({ timeout: 3000 }).catch(e => console.log('click err:', e.message));
  } else {
    await existing.keyboard.press('Enter');
  }
  await snap(existing, 'POST attempt-2', t0);
  await sleep(250);
  await snap(existing, 'POST attempt-2 +250ms', t0);

  // Drain the 8s floor loop
  for (const checkpoint of [2000, 4000, 6000]) {
    await sleep(2000);
    await snap(existing, `POST attempt-2 +${checkpoint + 250}ms (8s floor polling)`, t0);
  }

  await browser.close().catch(() => {});
}

main().catch(e => { console.error('fatal:', e); process.exit(1); });
