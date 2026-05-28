#!/usr/bin/env node
// Capture webai_gemini_canvas_to_docs --variant=export_docs:
//   Page is already in canvas conversation with a response; click "Show more options" -> "Export to Docs",
//   intercept the Network requests to gemini.google.com/_/* AND docs.google.com to identify the create-doc RPC.
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const OUT_DIR = join(process.cwd(), ".runs/path-c-gemini-rpc/wave-c1-coverage-gaps/webai_gemini_canvas_to_docs--export_docs");
mkdirSync(OUT_DIR, { recursive: true });

async function cdpSession(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", () => resolve(), { once: true });
    ws.addEventListener("error", () => reject(new Error("ws err")), { once: true });
  });
  let id = 0; const pending = new Map(); const handlers = new Map();
  ws.addEventListener("message", (ev) => {
    const m = JSON.parse(String(ev.data));
    if (m.id != null && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
    if (m.method && handlers.has(m.method)) handlers.get(m.method).forEach((h) => { try { h(m.params); } catch {} });
  });
  function send(method, params = {}) {
    const reqId = ++id; ws.send(JSON.stringify({ id: reqId, method, params }));
    return new Promise((resolve, reject) => pending.set(reqId, (msg) => msg.error ? reject(new Error(method + " " + JSON.stringify(msg.error))) : resolve(msg.result)));
  }
  function on(event, handler) { if (!handlers.has(event)) handlers.set(event, []); handlers.get(event).push(handler); }
  return { send, on, close: () => ws.close() };
}

async function main() {
  const pages = await (await fetch("http://127.0.0.1:9225/json/list")).json();
  // Use the page with conversation in URL (has model response with Export to Docs option)
  const target = pages.find((p) => p.type === "page" && /gemini\.google\.com\/app\/[a-f0-9]+/.test(p.url))
              || pages.find((p) => p.type === "page" && /gemini\.google\.com\/app/.test(p.url));
  if (!target) throw new Error("No Gemini page");
  console.error("[capture-docs] page", target.url);
  const session = await cdpSession(target.webSocketDebuggerUrl);
  await session.send("Page.enable");
  await session.send("Network.enable");
  await session.send("Runtime.enable");
  await session.send("Page.bringToFront");

  // Capture ALL gemini/_/* + docs.google.com requests, plus batchexecute and StreamGenerate explicitly
  const requests = new Map();
  const captured = [];
  session.on("Network.requestWillBeSent", (p) => {
    if (/gemini\.google\.com\/_\/|docs\.google\.com|drive\.google\.com|googleusercontent.*chip/i.test(p.request.url) && p.request.method === "POST") {
      requests.set(p.requestId, { url: p.request.url, method: p.request.method, headers: p.request.headers, postData: p.request.postData, ts: Date.now() });
    } else if (/docs\.google\.com|drive\.google\.com/.test(p.request.url)) {
      requests.set(p.requestId, { url: p.request.url, method: p.request.method, headers: p.request.headers, postData: p.request.postData, ts: Date.now() });
    }
  });
  session.on("Network.responseReceived", (p) => { if (requests.has(p.requestId)) requests.get(p.requestId).status = p.response.status; });
  session.on("Network.loadingFinished", async (p) => {
    if (requests.has(p.requestId)) {
      try {
        const body = await session.send("Network.getResponseBody", { requestId: p.requestId });
        const req = requests.get(p.requestId);
        captured.push({ ...req, responseBody: body });
        console.error("[capture-docs]", req.method, req.url.slice(0, 100));
      } catch (e) { /* getResponseBody may fail for navigation responses */ }
    }
  });

  // Drive: open Show more options menu, click Export to Docs
  const driver = await session.send("Runtime.evaluate", {
    awaitPromise: true, returnByValue: true,
    expression: `((async () => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const visible = (el) => Boolean(el && el.getClientRects().length && getComputedStyle(el).visibility !== "hidden");
      for (let i = 0; i < 3; i++) { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await sleep(150); }
      const showMore = document.querySelector('button[aria-label="Show more options"]');
      if (!showMore) return { ok: false, step: 'no-show-more' };
      showMore.click();
      // Poll for Export to Docs item (menu hydrates asynchronously)
      let exportDocs = null;
      for (let i = 0; i < 30 && !exportDocs; i++) {
        const items = [...document.querySelectorAll('[role="menuitem"], button[mat-menu-item]')].filter(visible);
        exportDocs = items.find((el) => /Export\\s*to\\s*Docs/i.test(el.innerText || el.getAttribute('aria-label') || ''));
        if (!exportDocs) await sleep(200);
      }
      if (!exportDocs) return { ok: false, step: 'no-export' };
      exportDocs.click();
      // Export takes a few seconds (round-trip to create the doc)
      await sleep(12000);
      return { ok: true };
    })())`
  });
  console.error("[capture-docs] driver:", JSON.stringify(driver.result.value));

  // Drain more
  await new Promise((r) => setTimeout(r, 5000));
  writeFileSync(join(OUT_DIR, "raw-captures.json"), JSON.stringify({ driverResult: driver.result.value, count: captured.length, summaries: captured.map((c) => ({ url: c.url, method: c.method, status: c.status, bytes: c.responseBody?.body?.length || 0, postDataLen: c.postData?.length || 0 })) }, null, 2));
  console.error("[capture-docs] captured", captured.length, "POST requests");
  for (const c of captured) {
    console.error("  ", c.method, c.status, c.url.slice(0, 120));
  }

  // Save all captured request/response bodies for offline analysis
  for (let i = 0; i < captured.length; i++) {
    const c = captured[i];
    const safe = String(i).padStart(2, "0");
    writeFileSync(join(OUT_DIR, `req-${safe}.json`), JSON.stringify({ url: c.url, method: c.method, status: c.status, headers: c.headers, postData: c.postData, response: c.responseBody?.body?.slice?.(0, 50000) }, null, 2));
  }

  // Look for an obvious "create doc" request (POST to docs.google.com create endpoint OR batchexecute with rpcid for export)
  const createDoc = captured.find((c) => /docs\.google\.com\/(?:create|document\/u\/0\/d\/.*\/create)/i.test(c.url));
  const batchexExport = captured.find((c) => /batchexecute\?rpcids=[A-Za-z]+/.test(c.url) && c.postData && /export|docs/i.test(c.postData));
  console.error("[capture-docs] createDoc:", createDoc?.url?.slice(0, 100) || "<none>");
  console.error("[capture-docs] batchexExport:", batchexExport?.url?.slice(0, 100) || "<none>");
  session.close();
  process.exit(0);
}
main().catch((e) => { console.error("[capture-docs] error:", e); process.exit(1); });
