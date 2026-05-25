#!/usr/bin/env node
// Read-only-ish CDP probe to diagnose gemini-conversation-reuse B blocker.
// Attaches to existing gemini-9225 Chrome, opens a fresh /app tab, measures
// composer + send button DOM state at 4 checkpoints: post-nav, post-hydrate,
// post-type, post-send-click.
//
// NO production code modified. Single test prompt to one fresh tab.
//
// Usage: node /tmp/probe-gemini-fresh-composer.mjs

import { chromium } from 'playwright';

const CDP = process.env.CDP || 'http://127.0.0.1:9225';
const FRESH_URL = 'https://gemini.google.com/app';
const PROMPT = 'probe diagnostic: count to three';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function snapshot(page, label) {
  const data = await page.evaluate(({ composerSel, sendSelStrict, sendSelLoose, sendSelSubmit, stopSel, turnSel }) => {
    const all = (sel) => Array.from(document.querySelectorAll(sel));
    const visible = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
    const composers = all(composerSel);
    const composer = composers[0] || null;
    const sendStrict = all(sendSelStrict);
    const sendLoose = all(sendSelLoose);
    const sendSubmit = all(sendSelSubmit);
    const sendCandidates = Array.from(new Set([...sendStrict, ...sendLoose, ...sendSubmit]));
    const sendDetails = sendCandidates.map(b => ({
      aria_label: b.getAttribute('aria-label'),
      aria_disabled: b.getAttribute('aria-disabled'),
      disabled: b.disabled,
      visible: visible(b),
      data_test_id: b.getAttribute('data-test-id'),
      tag: b.tagName.toLowerCase(),
      class_head: (b.className || '').split(/\s+/).slice(0, 3).join(' '),
    }));
    const stop = all(stopSel);
    const turns = all(turnSel);
    return {
      url: location.href,
      composer_count: composers.length,
      composer_state: composer ? {
        textContent_len: (composer.textContent || '').length,
        textContent_head: (composer.textContent || '').slice(0, 80),
        aria_disabled: composer.getAttribute('aria-disabled'),
        contenteditable: composer.getAttribute('contenteditable'),
        visible: visible(composer),
      } : null,
      send_strict_count: sendStrict.length,
      send_loose_count: sendLoose.length,
      send_submit_count: sendSubmit.length,
      send_visible_candidates: sendDetails.filter(d => d.visible),
      stop_count_visible: stop.filter(visible).length,
      turn_count: turns.length,
      // All button aria-labels in the composer area (likely bottom of page)
      bottom_button_labels: Array.from(document.querySelectorAll('button[aria-label]')).map(b => b.getAttribute('aria-label')).filter(Boolean).slice(0, 30),
    };
  }, {
    composerSel: 'div[role="textbox"][aria-label="Enter a prompt for Gemini"][contenteditable="true"][data-placeholder="Ask Gemini"]',
    sendSelStrict: 'button[aria-label="Send message"]',
    sendSelLoose: 'button[aria-label*="Send" i]',
    sendSelSubmit: 'button[aria-label*="Submit" i], button[type="submit"], button[data-test-id*="send" i]',
    stopSel: 'button[aria-label*="Stop" i], button[data-test-id*="stop" i]',
    turnSel: 'main [role="article"], main article, main [class*="turn" i], main [class*="response" i]',
  });
  console.log(`\n=== ${label} ===`);
  console.log(JSON.stringify(data, null, 2));
  return data;
}

async function main() {
  console.log(`[probe] connecting to ${CDP}`);
  const browser = await chromium.connectOverCDP(CDP);
  const ctx = browser.contexts()[0];
  if (!ctx) {
    console.error('[probe] no context');
    process.exit(1);
  }
  console.log(`[probe] context has ${ctx.pages().length} existing pages`);
  // Open new tab for fresh /app probe
  const page = await ctx.newPage();
  console.log(`[probe] new page opened, navigating to ${FRESH_URL}`);
  await page.goto(FRESH_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(1500); // small initial settling
  const s1 = await snapshot(page, '1. POST-NAV +1.5s (matches current code path)');

  await sleep(4000); // extra hydration window
  const s2 = await snapshot(page, '2. POST-HYDRATE +5.5s total (SPA fully ready)');

  // Try to type into composer (using contenteditable approach)
  console.log('\n[probe] typing prompt into composer...');
  const composerSel = 'div[role="textbox"][aria-label="Enter a prompt for Gemini"][contenteditable="true"][data-placeholder="Ask Gemini"]';
  const composer = page.locator(composerSel).first();
  const composerCount = await composer.count().catch(() => 0);
  if (composerCount === 0) {
    console.log('[probe] WARN: no composer found, skipping type/send');
  } else {
    await composer.click({ timeout: 3000 }).catch(e => console.log('[probe] composer click err:', e.message));
    await page.keyboard.type(PROMPT, { delay: 10 });
    await sleep(500);
    const s3 = await snapshot(page, '3. POST-TYPE +0.5s');

    // Try clicking send button
    console.log('\n[probe] clicking send button...');
    const sendStrict = page.locator('button[aria-label="Send message"]').first();
    const sendLoose = page.locator('button[aria-label*="Send" i]').first();
    const sendStrictCount = await sendStrict.count().catch(() => 0);
    const sendLooseCount = await sendLoose.count().catch(() => 0);
    console.log(`[probe] strict send button count=${sendStrictCount}, loose=${sendLooseCount}`);
    let clicked = false;
    if (sendStrictCount > 0) {
      await sendStrict.click({ timeout: 3000 }).then(() => { clicked = true; }).catch(e => console.log('[probe] strict click err:', e.message));
    }
    if (!clicked && sendLooseCount > 0) {
      await sendLoose.click({ timeout: 3000 }).then(() => { clicked = true; }).catch(e => console.log('[probe] loose click err:', e.message));
    }
    if (!clicked) {
      console.log('[probe] no send button — pressing Enter as fallback');
      await page.keyboard.press('Enter');
    }
    await sleep(1500);
    const s4 = await snapshot(page, '4. POST-SEND-CLICK +1.5s');

    // Wait a bit more to see if response starts
    await sleep(5000);
    const s5 = await snapshot(page, '5. POST-SEND +6.5s total wait');
  }

  // Close the probe tab (don't pollute the profile with extra tabs)
  console.log('\n[probe] closing probe tab');
  await page.close().catch(() => {});
  await browser.close().catch(() => {});
  console.log('[probe] done');
}

main().catch(e => { console.error('[probe] fatal:', e); process.exit(1); });
