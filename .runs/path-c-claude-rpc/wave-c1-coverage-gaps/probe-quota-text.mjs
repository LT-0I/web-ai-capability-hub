#!/usr/bin/env node
// Probe whether body innerText on /design matches the over-broad QUOTA_TEXT_RE
// in claude_design_rpc.ts (likely false positive from menu/link text).

import { chromium } from "playwright";

const QUOTA_TEXT_RE = /quota|limit reached|usage limit|try again later|too many requests|rate limit/i;

const browser = await chromium.connectOverCDP("http://127.0.0.1:9224");
try {
  let page = null;
  for (const ctx of browser.contexts()) {
    for (const p of ctx.pages()) {
      if (/claude\.ai\//.test(p.url())) { page = p; break; }
    }
    if (page) break;
  }
  if (!page) page = await browser.contexts()[0].newPage();

  console.log("currentUrl:", page.url());
  await page.goto("https://claude.ai/design", { waitUntil: "domcontentloaded" });
  await new Promise((r) => setTimeout(r, 3000));
  await page.bringToFront();

  const text = await page.locator("body").innerText({ timeout: 3000 }).catch(() => "");
  console.log("bodyLen:", text.length);
  console.log("matchesQuotaRE:", QUOTA_TEXT_RE.test(text));
  const m = text.match(QUOTA_TEXT_RE);
  if (m) {
    const i = text.toLowerCase().search(QUOTA_TEXT_RE);
    console.log("matchTerm:", JSON.stringify(m[0]));
    console.log("matchIndex:", i);
    console.log("contextSnippet:", JSON.stringify(text.slice(Math.max(0, i - 80), i + 160)));
  }

  // Also probe the actual minimal CreateProject RPC — confirm it still works
  const rpcResult = await page.evaluate(async () => {
    try {
      const r = await fetch("https://claude.ai/design/anthropic.omelette.api.v1alpha.OmeletteService/CreateProject", {
        method: "POST",
        credentials: "include",
        headers: { "accept": "application/json", "content-type": "application/json", "connect-protocol-version": "1" },
        body: JSON.stringify({ name: "Wave C1 quota-probe " + Date.now() })
      });
      return { status: r.status, contentType: r.headers.get("content-type"), text: (await r.text()).slice(0, 400) };
    } catch (e) { return { error: String(e?.message || e) }; }
  });
  console.log("rpcDirect:", JSON.stringify(rpcResult, null, 2));

  if (rpcResult.status === 200 && rpcResult.text.includes("projectId")) {
    const parsed = JSON.parse(rpcResult.text);
    const cleanup = await page.evaluate(async (projectId) => {
      const r = await fetch("https://claude.ai/design/anthropic.omelette.api.v1alpha.OmeletteService/DeleteProject", {
        method: "POST",
        credentials: "include",
        headers: { "accept": "application/json", "content-type": "application/json", "connect-protocol-version": "1" },
        body: JSON.stringify({ projectId })
      });
      return { projectId, status: r.status };
    }, parsed.projectId);
    console.log("cleanupDirectProbe:", JSON.stringify(cleanup));
  }
} finally {
  await browser.close();
}
