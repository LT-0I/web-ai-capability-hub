#!/usr/bin/env node
// Capture webai_gemini_send_prompt --variant=web_search: type prompt with web-search tool active,
// hit Send, intercept the StreamGenerate POST.
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const OUT_DIR = join(process.cwd(), ".runs/path-c-gemini-rpc/wave-c1-coverage-gaps/webai_gemini_send_prompt--web_search");
mkdirSync(OUT_DIR, { recursive: true });

async function cdpSession(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", () => resolve(), { once: true });
    ws.addEventListener("error", () => reject(new Error("ws err")), { once: true });
  });
  let id = 0;
  const pending = new Map();
  const handlers = new Map();
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
  const target = pages.find((p) => p.type === "page" && /gemini\.google\.com\/app/.test(p.url));
  const session = await cdpSession(target.webSocketDebuggerUrl);
  await session.send("Page.enable");
  await session.send("Network.enable");
  await session.send("Runtime.enable");
  await session.send("Page.bringToFront");

  // Track StreamGenerate POSTs
  const requests = new Map();
  const captured = [];
  session.on("Network.requestWillBeSent", (p) => {
    if (/StreamGenerate/.test(p.request.url) && p.request.method === "POST") {
      requests.set(p.requestId, { url: p.request.url, headers: p.request.headers, postData: p.request.postData, ts: Date.now() });
    }
  });
  session.on("Network.responseReceived", (p) => { if (requests.has(p.requestId)) requests.get(p.requestId).status = p.response.status; });
  session.on("Network.loadingFinished", async (p) => {
    if (requests.has(p.requestId)) {
      try {
        const body = await session.send("Network.getResponseBody", { requestId: p.requestId });
        captured.push({ ...requests.get(p.requestId), responseBody: body });
        console.error("[capture-ws] StreamGenerate response", body.body.length, "bytes");
      } catch (e) { console.error("[capture-ws] body err:", e.message); }
    }
  });

  // Drive: navigate to fresh, enable web-search tool (under Upload & tools menu), then type + send.
  const driver = await session.send("Runtime.evaluate", {
    awaitPromise: true, returnByValue: true,
    expression: `((async () => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const visible = (el) => Boolean(el && el.getClientRects().length && getComputedStyle(el).visibility !== "hidden");
      // Aggressive overlay dismiss
      for (let i = 0; i < 4; i++) { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await sleep(150); }
      // Open Upload & tools, then activate Search-the-web variant
      const opener = document.querySelector('button[aria-label="Upload & tools"]');
      if (!opener) return { ok: false, step: "no-tools-opener" };
      opener.click();
      await sleep(800);
      // Web search toggle is "Google Search" menuitemcheckbox. On current Gemini build it's behind a "More tools" submenu.
      let items = [...document.querySelectorAll('[role="menuitemcheckbox"], [role="menuitem"], button')].filter(visible);
      let search = items.find((el) => /Google\\s*Search/i.test(el.innerText || el.getAttribute('aria-label') || ''));
      if (!search) {
        const more = items.find((el) => /More\\s*tools/i.test(el.innerText || el.getAttribute('aria-label') || ''));
        if (more) { more.click(); await sleep(800); }
        items = [...document.querySelectorAll('[role="menuitemcheckbox"], [role="menuitem"], button')].filter(visible);
        search = items.find((el) => /Google\\s*Search/i.test(el.innerText || el.getAttribute('aria-label') || ''));
      }
      if (!search) return { ok: false, step: "no-search-tool", items: items.slice(0, 30).map((i) => (i.innerText || '').slice(0, 60)) };
      search.click();
      await sleep(800);
      // Close any opener overlay
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await sleep(300);
      // Type prompt into composer
      const composer = document.querySelector('rich-textarea, [contenteditable="true"][role="textbox"], textarea');
      if (!composer) return { ok: false, step: "no-composer" };
      composer.focus();
      // Use document.execCommand for contenteditable
      const prompt = "search the web: what is the capital of France?";
      if (composer.tagName === 'TEXTAREA') {
        composer.value = prompt;
        composer.dispatchEvent(new Event('input', { bubbles: true }));
      } else {
        document.execCommand('insertText', false, prompt);
      }
      await sleep(900);
      const sendBtn = document.querySelector('button[aria-label="Send message"]');
      if (!sendBtn) return { ok: false, step: "no-send" };
      sendBtn.click();
      // Wait for StreamGenerate response to complete (may take 5-20s)
      await sleep(8000);
      return { ok: true };
    })())`
  });
  console.error("[capture-ws] driver:", JSON.stringify(driver.result.value));

  // Wait for any in-flight response
  await new Promise((r) => setTimeout(r, 5000));
  writeFileSync(join(OUT_DIR, "raw-captures.json"), JSON.stringify({ driverResult: driver.result.value, count: captured.length, summaries: captured.map((c) => ({ url: c.url, bytes: c.responseBody?.body?.length || 0 })) }, null, 2));
  console.error("[capture-ws] captured", captured.length, "StreamGenerate responses");

  if (!captured.length) { console.error("[capture-ws] NO_CAPTURE - tool may not exist or click failed"); process.exit(2); }

  // Save the first (most recent prompt response should be last; we save all)
  const first = captured[captured.length - 1];
  const params = new URLSearchParams(first.postData);
  const fReqRaw = params.get("f.req");
  const fReq = fReqRaw ? JSON.parse(fReqRaw) : null;
  const endpoint = first.url
    .replace(/(bl=)[^&]+/, "$1boq_assistant-bard-web-server_fixture_p0")
    .replace(/(f\.sid=)[^&]+/, "$10")
    .replace(/(_reqid=)[^&]+/, "$11");
  const template = {
    operation_id: "webai_gemini_send_prompt--web_search",
    tool: "webai_gemini_send_prompt",
    variant: "web_search",
    endpoint,
    endpoint_kind: "stream_generate",
    rpc_id: "StreamGenerate",
    headers_template: {
      accept: "*/*",
      "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
      origin: "https://gemini.google.com",
      referer: "https://gemini.google.com/",
      "user-agent": "Mozilla/5.0 Fixture",
      "x-browser-channel": "stable",
      "x-browser-year": "2026",
      "x-goog-ext-525001261-jspb": first.headers["x-goog-ext-525001261-jspb"] || "[1]",
      "x-goog-ext-73010989-jspb": first.headers["x-goog-ext-73010989-jspb"] || "[0]",
      "x-same-domain": "1"
    },
    form_template: { "f.req": fReqRaw, at: "[RUNTIME_AT_TOKEN]" },
    f_req_template: fReq,
    placeholders: {}
  };
  writeFileSync(join(OUT_DIR, "payload-template.json"), JSON.stringify(template, null, 2));
  writeFileSync(join(OUT_DIR, "response-stream.txt"), first.responseBody?.body || "");
  console.error("[capture-ws] payload template + response saved");

  // Diff against basic by extracting inner f.req for posterity
  try {
    const inner = JSON.parse(fReq[1]);
    writeFileSync(join(OUT_DIR, "inner-fReq.json"), JSON.stringify(inner, null, 2));
    console.error("[capture-ws] inner[0] prompt:", inner[0]?.[0]?.slice?.(0, 60));
    console.error("[capture-ws] inner[6,17,18,30,79,80,17[0]]:", inner[6], inner[17], inner[18], inner[30], inner[79], inner[80]);
  } catch (e) {}

  session.close();
  process.exit(0);
}
main().catch((e) => { console.error("[capture-ws] error:", e); process.exit(1); });
