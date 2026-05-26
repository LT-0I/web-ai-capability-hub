const { chromium } = require('playwright');
const fs = require('fs');
const provider = process.argv[2];
const port = Number(process.argv[3]);
const outPath = process.argv[4];
const projectUrl = process.argv[5];
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function sampleFrames(page) {
  return await page.evaluate(() => Array.from(document.querySelectorAll('iframe')).map((iframe, index) => {
    const rect = iframe.getBoundingClientRect();
    let ready = null, href = null, error = null, textLen = null;
    try {
      const doc = iframe.contentDocument;
      ready = doc?.readyState || null;
      href = doc?.location?.href || null;
      textLen = (doc?.body?.innerText || '').length;
    } catch (e) { error = String(e && e.message || e); }
    return { index, src: iframe.getAttribute('src'), title: iframe.getAttribute('title'), testid: iframe.getAttribute('data-testid'), visible: rect.width > 0 && rect.height > 0, rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }, ready, href, textLen, error };
  })).catch(e => [{ error: String(e) }]);
}
async function probeGemini(page, out) {
  out.urlBefore = page.url(); out.titleBefore = await page.title().catch(String);
  const start = Date.now();
  const events = [];
  const tick = async (label) => events.push({ t: Date.now() - start, label, frames: await sampleFrames(page), frameUrls: page.frames().map(f => f.url()) });
  await tick('initial');
  let canvas = page.locator('[role="menuitemcheckbox"]:has-text("Canvas"), [role="menuitem"]:has-text("Canvas")').first();
  if (await canvas.count().catch(() => 0) < 1) {
    await page.locator('button[aria-label="Upload & tools"]').first().click({ force: true, timeout: 10000 });
    await sleep(700);
  }
  await tick('tools-opened');
  canvas = page.locator('[role="menuitemcheckbox"]:has-text("Canvas"), [role="menuitem"]:has-text("Canvas")').first();
  out.canvasCount = await canvas.count().catch(e => String(e));
  const checked = await canvas.getAttribute('aria-checked').catch(() => null);
  out.canvasCheckedBefore = checked;
  if (checked !== 'true') await canvas.click({ timeout: 10000 });
  await sleep(1000); await tick('canvas-toggled');
  const composer = page.locator('rich-textarea div[contenteditable="true"], div[role="textbox"][contenteditable="true"][aria-label*="Gemini"], div[contenteditable="true"]').first();
  await composer.fill('Use Canvas to draft a simple HTML page with a heading "Wave 8 iframe probe" and one paragraph. Do not open external apps.');
  await sleep(500); await tick('prompt-filled');
  const send = page.locator('button[aria-label="Send message"], button[aria-label="Send"], button.send-button').first();
  out.sendCount = await send.count().catch(e => String(e));
  await send.click({ force: true, timeout: 10000 });
  await tick('prompt-sent');
  const deadline = Date.now() + 120000;
  let lastKey = '';
  while (Date.now() < deadline) {
    await sleep(2000);
    const frames = await sampleFrames(page);
    const key = JSON.stringify(frames.map(f => [f.src, f.ready, f.href, f.textLen, f.visible]));
    if (key !== lastKey) { events.push({ t: Date.now() - start, label: 'poll-change', frames, frameUrls: page.frames().map(f => f.url()) }); lastKey = key; }
    const shareVisible = await page.locator('button[aria-label*="Share"], button:has-text("Share")').first().isVisible().catch(() => false);
    const editableCount = await page.locator('div[contenteditable="true"]').count().catch(() => 0);
    if (shareVisible && editableCount > 1) { out.readyAtMs = Date.now() - start; await tick('ready-detected'); break; }
  }
  out.events = events;
  out.urlAfter = page.url();
  out.titleAfter = await page.title().catch(String);
}
async function probeClaude(page, out) {
  const start = Date.now(); const events = [];
  const tick = async (label) => events.push({ t: Date.now() - start, label, frames: await sampleFrames(page), frameUrls: page.frames().map(f => f.url()) });
  if (projectUrl) await page.goto(projectUrl, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(e => { out.gotoError = String(e); });
  await sleep(2000); await tick('project-opened');
  const prompt = page.locator('div[contenteditable="true"], textarea').last();
  out.promptCount = await page.locator('div[contenteditable="true"], textarea').count().catch(e => String(e));
  await prompt.fill('Generate a simple HTML page titled Wave 8 iframe probe with one paragraph.');
  await sleep(500); await tick('prompt-filled');
  const send = page.locator('button[aria-label="Send Message"], button[aria-label="Send message"], button:has(svg)').last();
  out.sendCount = await send.count().catch(e => String(e));
  await send.click({ timeout: 10000 }).catch(e => { out.sendError = String(e); });
  await tick('prompt-sent');
  const deadline = Date.now() + 120000; let lastKey='';
  while (Date.now() < deadline) {
    await sleep(2000);
    const frames = await sampleFrames(page);
    const key = JSON.stringify(frames.map(f => [f.src, f.ready, f.href, f.textLen, f.visible, f.testid]));
    if (key !== lastKey) { events.push({ t: Date.now() - start, label: 'poll-change', frames, frameUrls: page.frames().map(f => f.url()) }); lastKey=key; }
    if (frames.some(f => /claudeusercontent|html-viewer|present-mode|serve|file=/.test([f.src,f.testid,f.href].join(' ')) && (f.visible || (f.textLen || 0) > 20))) { out.readyAtMs = Date.now() - start; await tick('ready-detected'); break; }
  }
  out.events = events; out.urlAfter = page.url(); out.titleAfter = await page.title().catch(String);
}
(async () => {
  const out = { provider, port, capturedAt: new Date().toISOString(), ok: false };
  try {
    const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
    const pages = browser.contexts().flatMap(c => c.pages());
    let page = pages.find(p => provider === 'gemini' ? /^https:\/\/gemini\.google\.com\/app(?:$|[/?#])/.test(p.url()) : /claude\.ai/.test(p.url())) || pages.find(p => provider === 'gemini' ? /gemini\.google\.com/.test(p.url()) : /claude\.ai/.test(p.url())) || pages[0] || await browser.contexts()[0].newPage();
    await page.bringToFront?.().catch?.(() => undefined);
    page.on('framenavigated', frame => { (out.frameNavigations ||= []).push({ t: Date.now(), url: frame.url(), name: frame.name() }); });
    if (provider === 'gemini') await probeGemini(page, out);
    else await probeClaude(page, out);
    out.ok = true;
    await browser.close();
  } catch (e) { out.error = String(e.stack || e); }
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(JSON.stringify({ ok: out.ok, error: out.error, readyAtMs: out.readyAtMs, events: out.events?.length }, null, 2));
})();
