#!/usr/bin/env node
// Delete the throwaway projects created during Wave C1 capture + probes.

import { chromium } from "playwright";

const PROJECTS = [
  "f8f89aef-684b-4a8e-b84b-e989183390b6", // wave-c1 create_project capture
  "e3cd0e32-43d4-47ce-95bc-47ecbe24f147", // probe-json-rpc CreateProject_JSON
  "1448fa84-f1ce-4633-971a-68d01ef6ec7b"  // probe-json-rpc CreateProject_JSON_minimal
];

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
  if (!/claude\.ai\/design/.test(page.url())) {
    await page.goto("https://claude.ai/design", { waitUntil: "domcontentloaded" });
    await new Promise((r) => setTimeout(r, 2000));
  }
  await page.bringToFront();

  for (const projectId of PROJECTS) {
    const result = await page.evaluate(async (projectId) => {
      try {
        const r = await fetch("https://claude.ai/design/anthropic.omelette.api.v1alpha.OmeletteService/DeleteProject", {
          method: "POST",
          credentials: "include",
          headers: { "accept": "application/json", "content-type": "application/json", "connect-protocol-version": "1" },
          body: JSON.stringify({ projectId })
        });
        return { projectId, status: r.status, text: (await r.text()).slice(0, 200) };
      } catch (e) { return { projectId, error: String(e?.message || e) }; }
    }, projectId);
    console.log(JSON.stringify(result));
  }
} finally {
  await browser.close();
}
