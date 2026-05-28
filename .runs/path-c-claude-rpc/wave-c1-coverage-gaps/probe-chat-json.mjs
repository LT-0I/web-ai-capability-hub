#!/usr/bin/env node
// Probe whether Omelette Chat (Connect streaming) accepts JSON.
// Connect streaming over HTTP uses application/connect+json mime.
// If that doesn't accept, the JSON RPC path is closed for generate.

import { chromium } from "playwright";

const PROJECT_ID = process.argv[2] || "f8f89aef-684b-4a8e-b84b-e989183390b6";
const browser = await chromium.connectOverCDP("http://127.0.0.1:9224");
try {
  let page = null;
  for (const ctx of browser.contexts()) {
    for (const p of ctx.pages()) {
      if (/claude\.ai\/design/.test(p.url())) { page = p; break; }
    }
    if (page) break;
  }
  if (!page) {
    page = await browser.contexts()[0].newPage();
    await page.goto(`https://claude.ai/design/p/${PROJECT_ID}?file=index.html`, { waitUntil: "domcontentloaded" });
    await new Promise((r) => setTimeout(r, 2000));
  }
  await page.bringToFront();

  // Minimal Chat body — we'll try plain JSON and connect+json
  const body = {
    projectId: PROJECT_ID,
    chatId: "00000000-0000-4000-8000-000000000000",
    message: "RPC_CLAUDE_CHAT_JSON_PROBE: say OK"
  };

  for (const ct of ["application/json", "application/connect+json"]) {
    const result = await page.evaluate(async ({ url, body, ct }) => {
      try {
        const r = await fetch(url, {
          method: "POST",
          credentials: "include",
          headers: {
            "accept": ct,
            "content-type": ct,
            "connect-protocol-version": "1"
          },
          body: JSON.stringify(body)
        });
        const text = await r.text();
        const headers = {};
        r.headers.forEach((v, k) => { headers[k] = v; });
        return { status: r.status, contentType: r.headers.get("content-type"), text: text.slice(0, 600), headers };
      } catch (e) { return { error: String(e?.message || e) }; }
    }, { url: "https://claude.ai/design/anthropic.omelette.api.v1alpha.OmeletteService/Chat", body, ct });
    console.log("====", ct, "====");
    console.log(JSON.stringify(result, null, 2).slice(0, 1500));
  }
} finally {
  await browser.close();
}
