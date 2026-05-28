#!/usr/bin/env node
// Probe Connect+JSON framed envelope for Chat. Envelope: 1 flag byte
// + 4-byte BE length + JSON payload (then for streaming, multiple frames).

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
  if (!page) page = await browser.contexts()[0].newPage();
  await page.bringToFront();

  // Minimal candidate Chat body — we don't know the exact field names yet.
  // Try a "message"-style shape based on captured 0001 SendMultiplayerMessage hint.
  const candidates = [
    { projectId: PROJECT_ID, message: "say OK" },
    { projectId: PROJECT_ID, prompt: "say OK" },
    { projectId: PROJECT_ID, content: "say OK" },
    { projectId: PROJECT_ID, chatId: "00000000-0000-4000-8000-000000000000", message: "say OK" },
    {
      projectId: PROJECT_ID,
      chatId: "00000000-0000-4000-8000-000000000000",
      messages: [{ role: "user", content: "say OK" }]
    }
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
        let textPreview = "";
        try {
          textPreview = new TextDecoder().decode(view);
        } catch (e) {
          textPreview = "[decode-fail]";
        }
        return { status: r.status, byteLen: buf.byteLength, text: textPreview.slice(0, 800) };
      } catch (e) { return { error: String(e?.message || e) }; }
    }, { url: "https://claude.ai/design/anthropic.omelette.api.v1alpha.OmeletteService/Chat", body });
    console.log("====", JSON.stringify(Object.keys(body)), "====");
    console.log(JSON.stringify(result, null, 2).slice(0, 1500));
  }
} finally {
  await browser.close();
}
