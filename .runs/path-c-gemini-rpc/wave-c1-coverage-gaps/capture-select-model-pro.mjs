#!/usr/bin/env node
// Capture webai_gemini_select_model variant=select_pro by clicking "3.1 Pro" menuitem.
// Saves payload-template.json + response-stream.{txt,json} matching wave-b3 schema.
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const OUT_DIR = join(process.cwd(), ".runs/path-c-gemini-rpc/wave-c1-coverage-gaps/webai_gemini_select_model--select_pro");
mkdirSync(OUT_DIR, { recursive: true });

async function listPages() {
  const res = await fetch("http://127.0.0.1:9225/json/list");
  return res.json();
}
async function cdpSession(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", () => resolve(), { once: true });
    ws.addEventListener("error", (e) => reject(new Error("CDP ws error " + (e?.message || ""))), { once: true });
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
    const reqId = ++id;
    ws.send(JSON.stringify({ id: reqId, method, params }));
    return new Promise((resolve, reject) => pending.set(reqId, (msg) => msg.error ? reject(new Error(method + " " + JSON.stringify(msg.error))) : resolve(msg.result)));
  }
  function on(event, handler) {
    if (!handlers.has(event)) handlers.set(event, []);
    handlers.get(event).push(handler);
  }
  return { ws, send, on, close: () => ws.close() };
}

async function main() {
  const pages = await listPages();
  const target = pages.find((p) => p.type === "page" && /gemini\.google\.com\/app/.test(p.url));
  if (!target) throw new Error("No Gemini app page in 9225");
  console.error("[capture-pro] page", target.id, target.url);
  const session = await cdpSession(target.webSocketDebuggerUrl);
  await session.send("Page.enable");
  await session.send("Network.enable");
  await session.send("Runtime.enable");
  await session.send("Page.bringToFront");

  // Snapshot baseline request count, then capture only POST-click L5adhe requests
  const requests = new Map();
  const captured = [];
  session.on("Network.requestWillBeSent", (p) => {
    if (/batchexecute\?rpcids=L5adhe/.test(p.request.url) && p.request.method === "POST") {
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
        // Decode posted mode_id for visibility
        try {
          const params = new URLSearchParams(req.postData);
          const fReq = JSON.parse(params.get("f.req"));
          const nested = JSON.parse(fReq[0][0][1]);
          console.error("[capture-pro] captured L5adhe POST; mode_id=", nested[0][99], "; settingKey=", nested[1]?.[0]?.[0]);
        } catch (e) { console.error("[capture-pro] decode err:", e.message); }
      } catch (e) { console.error("[capture-pro] body err:", e.message); }
    }
  });

  // Pre-action: also dispatch a baseline read so we can compare what page-load batchexecute looks like
  const preCount = captured.length;
  await new Promise((r) => setTimeout(r, 800));

  // Drive: click bard-mode-menu-button, then click "3.1 Pro" menuitem
  const driverResult = await session.send("Runtime.evaluate", {
    awaitPromise: true, returnByValue: true,
    expression: `((async () => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const visible = (el) => Boolean(el && el.getClientRects().length && getComputedStyle(el).visibility !== "hidden");
      // 1. Aggressively dismiss any stale overlay/mat-menu (multiple Escape ticks).
      for (let i = 0; i < 4; i++) { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await sleep(150); }
      // Also tear down any mat-menu panel directly to ensure trigger.click opens (not closes).
      const stale = document.querySelectorAll('.mat-mdc-menu-panel, [role="menu"]');
      const staleCount = stale.length;
      const trigger = document.querySelector('button[data-test-id="bard-mode-menu-button"]');
      if (!trigger || !visible(trigger)) return { ok: false, step: "no-trigger", staleCount };
      const beforeLabel = trigger.getAttribute('aria-label') || '';
      const beforeExpanded = trigger.getAttribute('aria-expanded') || '';
      trigger.scrollIntoView({block:'center'});
      // If trigger reports expanded, click once to close, then click to open.
      if (beforeExpanded === 'true') { trigger.click(); await sleep(400); }
      trigger.click();
      await sleep(1500);
      let menuitems = [];
      for (let i = 0; i < 40 && menuitems.length === 0; i++) {
        menuitems = [...document.querySelectorAll('[role="menuitem"], [role="menuitemradio"], button[mat-menu-item]')].filter(visible);
        if (menuitems.length === 0) await sleep(200);
      }
      const pro = menuitems.find((el) => /3\\.1\\s*Pro/i.test(el.innerText || '') || /\\bPro\\b/.test(el.getAttribute('aria-label') || ''));
      if (!pro) return { ok: false, step: "no-pro", count: menuitems.length, texts: menuitems.map((m) => (m.innerText || '').slice(0, 60)), staleCount, beforeExpanded };
      pro.click();
      await sleep(2500);
      const after = document.querySelector('button[data-test-id="bard-mode-menu-button"]');
      return { ok: true, beforeLabel, afterLabel: after?.getAttribute('aria-label') || '', staleCount };
    })())`
  });
  console.error("[capture-pro] driver:", JSON.stringify(driverResult.result.value).slice(0, 400));

  // Settle
  await new Promise((r) => setTimeout(r, 2500));

  const postClick = captured.slice(preCount);
  writeFileSync(join(OUT_DIR, "raw-captures.json"), JSON.stringify({ driverResult: driverResult.result.value, allCaptured: captured, postClick }, null, 2));
  console.error("[capture-pro] total captured", captured.length, "post-click", postClick.length);

  // Find the L5adhe POST containing nested[0][99] != known Flash/Flash-Lite mode ids and nested[1][0][0]=="last_selected_mode_id_on_web"
  const KNOWN = { flash: "8c46e95b1a07cecc", flash_lite: "56fdd199312815e2" };
  let chosen = null;
  for (const req of postClick.length ? postClick : captured) {
    try {
      const params = new URLSearchParams(req.postData);
      const fReq = JSON.parse(params.get("f.req"));
      const nested = JSON.parse(fReq[0][0][1]);
      const modeId = nested[0][99];
      const settingKey = nested[1]?.[0]?.[0];
      if (settingKey === "last_selected_mode_id_on_web" && modeId && modeId !== KNOWN.flash && modeId !== KNOWN.flash_lite) {
        chosen = { req, fReq, modeId };
        break;
      }
    } catch {}
  }

  if (!chosen) {
    console.error("[capture-pro] No Pro-mode L5adhe POST found. Either click failed, no change occurred, or Pro shares a known mode_id.");
    process.exit(2);
  }

  console.error("[capture-pro] PRO MODE ID:", chosen.modeId);
  const req = chosen.req;
  const params = new URLSearchParams(req.postData);
  const fReqRaw = params.get("f.req");
  const endpoint = req.url
    .replace(/(bl=)[^&]+/, "$1boq_assistant-bard-web-server_fixture_p0")
    .replace(/(f\.sid=)[^&]+/, "$10")
    .replace(/(_reqid=)[^&]+/, "$11");
  const template = {
    operation_id: "webai_gemini_select_model--select_pro",
    tool: "webai_gemini_select_model",
    variant: "select_pro",
    endpoint,
    endpoint_kind: "batchexecute",
    rpc_id: "L5adhe",
    headers_template: {
      accept: "*/*",
      "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
      origin: "https://gemini.google.com",
      referer: "https://gemini.google.com/",
      "user-agent": "Mozilla/5.0 Fixture",
      "x-browser-channel": "stable",
      "x-browser-year": "2026",
      "x-goog-ext-525001261-jspb": req.headers["x-goog-ext-525001261-jspb"] || "[1]",
      "x-goog-ext-73010989-jspb": req.headers["x-goog-ext-73010989-jspb"] || "[0]",
      "x-same-domain": "1"
    },
    form_template: { "f.req": fReqRaw, at: "[RUNTIME_AT_TOKEN]" },
    f_req_template: chosen.fReq,
    placeholders: {}
  };
  writeFileSync(join(OUT_DIR, "payload-template.json"), JSON.stringify(template, null, 2));
  writeFileSync(join(OUT_DIR, "response-stream.txt"), req.responseBody?.body || "");
  writeFileSync(join(OUT_DIR, "response-stream.json"), JSON.stringify({ text: req.responseBody?.body || "" }, null, 2));
  console.error("[capture-pro] payload template saved");
  session.close();
  process.exit(0);
}
main().catch((e) => { console.error("[capture-pro] error:", e); process.exit(1); });
