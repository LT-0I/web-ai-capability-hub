#!/usr/bin/env node
// Now we know Chat requires "messages_request" as TYPE_BYTES (nested proto).
// In Connect+JSON, TYPE_BYTES is encoded as a base64 string.
// Try with empty bytes / some shapes to confirm we'd still need a proto schema.

import { chromium } from "playwright";

const PROJECT_ID = "f8f89aef-684b-4a8e-b84b-e989183390b6";
const browser = await chromium.connectOverCDP("http://127.0.0.1:9224");
try {
  let page = null;
  for (const ctx of browser.contexts()) {
    for (const p of ctx.pages()) {
      if (/claude\.ai\/design/.test(p.url())) { page = p; break; }
    }
    if (page) break;
  }
  if (!page) page = await browser.contexts()[0].newPage();
  await page.bringToFront();

  const candidates = [
    { projectId: PROJECT_ID, messages_request: "" },
    { projectId: PROJECT_ID, messages_request: btoa("test") },
    { projectId: PROJECT_ID, messagesRequest: btoa("test") }
  ];

  for (const body of candidates) {
    const result = await page.evaluate(async ({ url, body }) => {
      try {
        const payload = new TextEncoder().encode(JSON.stringify(body));
        const envelope = new Uint8Array(5 + payload.length);
        envelope[0] = 0;
        const len = payload.length;
        envelope[1] = (len >>> 24) & 0xff;
        envelope[2] = (len >>> 16) & 0xff;
        envelope[3] = (len >>> 8) & 0xff;
        envelope[4] = len & 0xff;
        envelope.set(payload, 5);
        const r = await fetch(url, {
          method: "POST",
          credentials: "include",
          headers: {
            "accept": "application/connect+json",
            "content-type": "application/connect+json",
            "connect-protocol-version": "1"
          },
          body: envelope
        });
        const buf = await r.arrayBuffer();
        const view = new Uint8Array(buf);
        const txt = new TextDecoder().decode(view);
        return { status: r.status, byteLen: buf.byteLength, text: txt.slice(0, 800) };
      } catch (e) { return { error: String(e?.message || e) }; }
    }, { url: "https://claude.ai/design/anthropic.omelette.api.v1alpha.OmeletteService/Chat", body });
    console.log("====", JSON.stringify(body), "====");
    console.log(JSON.stringify(result, null, 2).slice(0, 1500));
  }
} finally {
  await browser.close();
}
