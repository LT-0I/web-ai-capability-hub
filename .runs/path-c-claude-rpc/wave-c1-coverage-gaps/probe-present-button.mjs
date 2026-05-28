#!/usr/bin/env node
// Probe whether Present is purely client-side route change vs has an RPC.

import { chromium } from "playwright";

const PROJECT_URL = process.argv[2] || "https://claude.ai/design/p/f8f89aef-684b-4a8e-b84b-e989183390b6";

const browser = await chromium.connectOverCDP("http://127.0.0.1:9224");
try {
  let page = null;
  for (const ctx of browser.contexts()) {
    for (const p of ctx.pages()) {
      if (/claude\.ai/.test(p.url())) { page = p; break; }
    }
    if (page) break;
  }
  if (!page) page = await browser.contexts()[0].newPage();

  await page.goto(`${PROJECT_URL}?file=index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => undefined);
  await page.bringToFront();
  await new Promise((r) => setTimeout(r, 3000));

  // Find all Present-like buttons
  const present = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll("button"));
    return buttons.filter((b) => /present/i.test((b.innerText || b.textContent || "").trim())).map((b) => ({
      text: (b.innerText || b.textContent || "").trim().slice(0, 80),
      aria: b.getAttribute("aria-label") || "",
      testid: b.getAttribute("data-testid") || "",
      class: (b.className || "").toString().slice(0, 80),
      rect: b.getBoundingClientRect()
    }));
  });
  console.log("PRESENT BUTTONS:", JSON.stringify(present, null, 2));

  if (present.length > 0) {
    const before = page.url();
    console.log("URL BEFORE:", before);

    // listen for new tabs/popups
    const newPagePromise = new Promise((resolve) => {
      const ctx = page.context();
      const handler = (p) => { ctx.off("page", handler); resolve(p); };
      ctx.on("page", handler);
      setTimeout(() => { ctx.off("page", handler); resolve(null); }, 8000);
    });

    await page.locator('button:has-text("Present")').first().click({ timeout: 5000 }).catch((e) => console.log("click err", e.message));
    await new Promise((r) => setTimeout(r, 5000));
    console.log("URL AFTER:", page.url());

    const newPage = await newPagePromise;
    if (newPage) {
      console.log("NEW TAB URL:", newPage.url());
      await new Promise((r) => setTimeout(r, 2000));
      console.log("NEW TAB URL (after wait):", newPage.url());
      try { await newPage.close(); } catch (_) {}
    }
  }
} finally {
  await browser.close();
}
