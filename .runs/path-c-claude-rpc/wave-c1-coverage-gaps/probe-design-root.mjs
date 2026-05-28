#!/usr/bin/env node
// Probe what's actually on https://claude.ai/design root.

import { chromium } from "playwright";

const browser = await chromium.connectOverCDP(process.env.CLAUDE_CDP || "http://127.0.0.1:9224");
try {
  let page = null;
  for (const context of browser.contexts()) {
    for (const p of context.pages()) {
      if (/claude\.ai\//.test(p.url())) { page = p; break; }
    }
    if (page) break;
  }
  if (!page) {
    page = await (browser.contexts()[0] || await browser.newContext()).newPage();
  }
  await page.goto("https://claude.ai/design", { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => undefined);
  await page.bringToFront();
  await new Promise((r) => setTimeout(r, 3000));

  const info = await page.evaluate(() => {
    const items = [];
    const allButtons = document.querySelectorAll("button");
    for (const btn of Array.from(allButtons).slice(0, 50)) {
      const text = (btn.innerText || btn.textContent || "").trim();
      const aria = btn.getAttribute("aria-label") || "";
      const testid = btn.getAttribute("data-testid") || "";
      if (text || aria || testid) items.push({ tag: "button", text: text.slice(0, 60), aria, testid });
    }
    const inputs = document.querySelectorAll("input, textarea, [contenteditable=true]");
    for (const inp of Array.from(inputs)) {
      items.push({
        tag: inp.tagName.toLowerCase(),
        placeholder: inp.getAttribute("placeholder") || "",
        testid: inp.getAttribute("data-testid") || "",
        aria: inp.getAttribute("aria-label") || "",
        contenteditable: inp.getAttribute("contenteditable") || ""
      });
    }
    return { url: location.href, title: document.title, items };
  });
  console.log(JSON.stringify(info, null, 2));
} finally {
  await browser.close();
}
