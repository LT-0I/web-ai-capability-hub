#!/usr/bin/env node
// Probe whether Omelette CreateProject accepts application/json bodies
// (Connect protocol auto-negotiates JSON vs proto). The get_html driver
// already does this for GetFile so we test CreateProject and Chat shapes.

import { chromium } from "playwright";

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

  // Make sure we're on the design surface so we have same-origin cookies + tab-id
  if (!/claude\.ai\/design/.test(page.url())) {
    await page.goto("https://claude.ai/design", { waitUntil: "domcontentloaded" });
    await new Promise((r) => setTimeout(r, 2000));
  }
  await page.bringToFront();

  const tests = [
    {
      name: "CreateProject_JSON",
      url: "https://claude.ai/design/anthropic.omelette.api.v1alpha.OmeletteService/CreateProject",
      body: {
        name: "Wave C1 JSON probe " + Date.now(),
        modes: [
          { name: "Hi-fi design", prompt: "Create a high-fidelity polished design." },
          { name: "Interactive prototype", prompt: "Create an interactive prototype." }
        ],
        defaultMode: "prototype"
      }
    },
    {
      name: "CreateProject_JSON_minimal",
      url: "https://claude.ai/design/anthropic.omelette.api.v1alpha.OmeletteService/CreateProject",
      body: { name: "Wave C1 minimal " + Date.now() }
    },
    {
      name: "GetProject_JSON",
      url: "https://claude.ai/design/anthropic.omelette.api.v1alpha.OmeletteService/GetProject",
      body: { projectId: "f8f89aef-684b-4a8e-b84b-e989183390b6" }
    }
  ];

  for (const t of tests) {
    const result = await page.evaluate(async ({ url, body }) => {
      try {
        const r = await fetch(url, {
          method: "POST",
          credentials: "include",
          headers: { "accept": "application/json", "content-type": "application/json", "connect-protocol-version": "1" },
          body: JSON.stringify(body)
        });
        const text = await r.text();
        const headers = {};
        r.headers.forEach((v, k) => { headers[k] = v; });
        return { status: r.status, contentType: r.headers.get("content-type"), text: text.slice(0, 2000), headers };
      } catch (e) {
        return { error: String(e?.message || e) };
      }
    }, { url: t.url, body: t.body });
    console.log("====", t.name, "====");
    console.log(JSON.stringify(result, null, 2).slice(0, 2200));
  }
} finally {
  await browser.close();
}
