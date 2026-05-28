#!/usr/bin/env node
// Wave C1 live A/B sweep for webai_gemini_select_model --model=3.1-pro.
//   A) DOM driver: open bard-mode-menu, click "3.1 Pro", verify trigger label flips to Pro.
//   B) RPC driver: replay the captured L5adhe settings POST (last_selected_mode_id_on_web ->
//      e6fa609c3fa255c0) with a live `at` token, verify the wrb.fr / L5adhe ack.
// 3.1-pro was UNAVAILABLE on RPC before Wave C1, so a functionally-correct RPC ack is a
// strict gain (no speedup requirement). 30s gap between the two live calls.
// Profile: gemini-9225 ONLY. No CAPTCHA bypass, no stealth.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const CDP = "http://127.0.0.1:9225";
const FIX_DIR = join(process.cwd(), ".runs/path-c-gemini-rpc/wave-c1-coverage-gaps/webai_gemini_select_model--select_pro");
const OUT = join(process.cwd(), ".runs/path-c-gemini-rpc/wave-c1-coverage-gaps/ab-sweep-results.json");
const PRO_MODE_ID = "e6fa609c3fa255c0";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function listPages() {
  return (await fetch(`${CDP}/json/list`)).json();
}
async function cdpSession(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", () => resolve(), { once: true });
    ws.addEventListener("error", (e) => reject(new Error("CDP ws error " + (e?.message || ""))), { once: true });
  });
  let id = 0;
  const pending = new Map();
  ws.addEventListener("message", (ev) => {
    const m = JSON.parse(String(ev.data));
    if (m.id != null && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  });
  function send(method, params = {}) {
    const reqId = ++id;
    ws.send(JSON.stringify({ id: reqId, method, params }));
    return new Promise((resolve, reject) => pending.set(reqId, (msg) => msg.error ? reject(new Error(method + " " + JSON.stringify(msg.error))) : resolve(msg.result)));
  }
  return { ws, send, close: () => ws.close() };
}
async function evalInPage(session, fnSrc) {
  const r = await session.send("Runtime.evaluate", { awaitPromise: true, returnByValue: true, expression: fnSrc });
  if (r.exceptionDetails) throw new Error("eval exception: " + JSON.stringify(r.exceptionDetails).slice(0, 300));
  return r.result.value;
}

async function main() {
  const pages = await listPages();
  const target = pages.find((p) => p.type === "page" && /gemini\.google\.com\/app/.test(p.url));
  if (!target) throw new Error("No Gemini app page in 9225");
  const session = await cdpSession(target.webSocketDebuggerUrl);
  await session.send("Page.enable");
  await session.send("Runtime.enable");
  await session.send("Page.bringToFront");

  const results = { startedAt: new Date().toISOString(), profile: "gemini-9225", page: target.url, mode_id: PRO_MODE_ID };

  // ---- A) DOM driver: select 3.1 Pro via the bard-mode-menu ----
  const domStart = Date.now();
  const dom = await evalInPage(session, `((async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const visible = (el) => Boolean(el && el.getClientRects().length && getComputedStyle(el).visibility !== "hidden");
    for (let i = 0; i < 4; i++) { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await sleep(150); }
    const trigger = document.querySelector('button[data-test-id="bard-mode-menu-button"]');
    if (!trigger || !visible(trigger)) return { ok: false, step: "no-trigger" };
    const beforeLabel = trigger.getAttribute('aria-label') || trigger.innerText || '';
    if ((trigger.getAttribute('aria-expanded') || '') === 'true') { trigger.click(); await sleep(400); }
    trigger.click();
    await sleep(1500);
    let items = [];
    for (let i = 0; i < 40 && items.length === 0; i++) {
      items = [...document.querySelectorAll('[role="menuitem"], [role="menuitemradio"], button[mat-menu-item]')].filter(visible);
      if (items.length === 0) await sleep(200);
    }
    const pro = items.find((el) => /3\\.1\\s*Pro/i.test(el.innerText || '') || /\\bPro\\b/.test(el.getAttribute('aria-label') || ''));
    if (!pro) return { ok: false, step: "no-pro", count: items.length, texts: items.map((m) => (m.innerText || '').slice(0, 50)) };
    pro.click();
    await sleep(2500);
    const after = document.querySelector('button[data-test-id="bard-mode-menu-button"]');
    const afterLabel = after?.getAttribute('aria-label') || after?.innerText || '';
    return { ok: /pro/i.test(afterLabel), beforeLabel, afterLabel };
  })())`);
  results.dom = { ...dom, elapsed_ms: Date.now() - domStart };
  console.error("[ab] DOM:", JSON.stringify(results.dom).slice(0, 300));

  // ---- 30s gap between live calls ----
  console.error("[ab] sleeping 30s between DOM and RPC calls...");
  await sleep(30000);

  // ---- B) RPC driver: replay captured L5adhe POST with a live `at` token ----
  const template = JSON.parse(readFileSync(join(FIX_DIR, "payload-template.json"), "utf8"));
  const fReqRaw = template.form_template["f.req"];
  const rpcStart = Date.now();
  const rpc = await evalInPage(session, `((async () => {
    const at = (window.WIZ_global_data && window.WIZ_global_data.SNlM0e) || null;
    if (!at) return { ok: false, step: "no-at-token" };
    const bl = (window.WIZ_global_data && window.WIZ_global_data.cfb2h) || "boq_assistant-bard-web-server_fixture_p0";
    const fsid = (window.WIZ_global_data && window.WIZ_global_data.FdrFJe) || "0";
    const url = "https://gemini.google.com/_/BardChatUi/data/batchexecute?rpcids=L5adhe&source-path=%2Fapp&bl=" + encodeURIComponent(bl) + "&f.sid=" + encodeURIComponent(fsid) + "&hl=en&_reqid=" + Math.floor(Math.random()*1e6) + "&rt=c";
    const body = new URLSearchParams();
    body.set("f.req", ${JSON.stringify(fReqRaw)});
    body.set("at", at);
    const t0 = performance.now();
    const resp = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded;charset=UTF-8", "x-same-domain": "1" },
      credentials: "include",
      body: body.toString()
    });
    const text = await resp.text();
    const elapsed = Math.round(performance.now() - t0);
    const ack = /\\"wrb.fr\\",\\"L5adhe\\"/.test(text) || text.includes('wrb.fr');
    return { ok: resp.status === 200 && ack, status: resp.status, ack, elapsed_ms: elapsed, snippet: text.slice(0, 200) };
  })())`);
  results.rpc = { ...rpc, fetch_elapsed_ms: Date.now() - rpcStart };
  console.error("[ab] RPC:", JSON.stringify(results.rpc).slice(0, 300));

  // ---- Verdict ----
  results.dom_ok = Boolean(results.dom.ok);
  results.rpc_ok = Boolean(results.rpc.ok);
  // RPC was UNAVAILABLE before Wave C1: a functionally-correct RPC ack alone = PASS.
  results.verdict = results.rpc_ok ? "PASS" : "FAIL";
  results.note = "select_pro RPC was UNAVAILABLE pre-Wave-C1; functional RPC ack is a strict gain regardless of DOM/speedup.";
  writeFileSync(OUT, JSON.stringify(results, null, 2));
  console.error("[ab] VERDICT:", results.verdict, "| dom_ok:", results.dom_ok, "| rpc_ok:", results.rpc_ok);
  session.close();
  process.exit(results.rpc_ok ? 0 : 3);
}
main().catch((e) => { console.error("[ab] error:", e); process.exit(1); });
