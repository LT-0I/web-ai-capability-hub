// Wave C2 web_search capture (v2). The current Gemini build has NO "Google Search" tool
// toggle (discover-websearch-toggle.mjs proved: only Create image/video/Canvas/Deep
// research/Create music/Guided learning exist). Gemini grounds with Google Search
// automatically. We drive a NORMAL send with a web-grounding prompt via real CDP Input
// events (typed so the rich-textarea model state hydrates the Send button), then submit
// via the Send button (CDP mouse) or CDP Enter, capture StreamGenerate, diff vs basic.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { cdpSession, pickGeminiAppPage, sleep } from "./cdp-lib.mjs";

const OUT_DIR = join(process.cwd(), ".runs/path-c-gemini-rpc/wave-c2-coverage-gaps/webai_gemini_send_prompt--web_search");

async function main() {
  const target = await pickGeminiAppPage();
  if (!target) { console.error("NO_GEMINI_PAGE"); process.exit(2); }
  const session = await cdpSession(target.webSocketDebuggerUrl);
  await session.send("Page.enable");
  await session.send("Network.enable");
  await session.send("Runtime.enable");
  await session.send("Page.bringToFront");

  const requests = new Map();
  const captured = [];
  session.on("Network.requestWillBeSent", (p) => {
    if (/StreamGenerate/.test(p.request.url) && p.request.method === "POST") {
      requests.set(p.requestId, { url: p.request.url, headers: p.request.headers, postData: p.request.postData, ts: Date.now() });
      console.error("[capture-ws] StreamGenerate POST seen");
    }
  });
  session.on("Network.responseReceived", (p) => { if (requests.has(p.requestId)) requests.get(p.requestId).status = p.response.status; });
  session.on("Network.loadingFinished", async (p) => {
    if (requests.has(p.requestId)) {
      try {
        const body = await session.send("Network.getResponseBody", { requestId: p.requestId });
        captured.push({ ...requests.get(p.requestId), responseBody: body.body });
        console.error("[capture-ws] StreamGenerate response", body.body.length, "bytes");
      } catch (e) { console.error("[capture-ws] body err:", e.message); }
    }
  });

  const prompt = "Use Google Search to answer: who is the current Prime Minister of the United Kingdom as of today, and cite the source URL.";

  // 1. Clear composer + focus (textContent, not innerHTML).
  await session.send("Runtime.evaluate", { returnByValue: true, expression: `(() => {
    for (let i=0;i<3;i++) document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
    const c = document.querySelector('rich-textarea [contenteditable="true"], [contenteditable="true"][role="textbox"]');
    if (c) { c.focus(); c.textContent=''; c.dispatchEvent(new Event('input',{bubbles:true})); }
    return !!c;
  })()` });
  await sleep(300);

  // 2. Type the prompt via CDP Input.insertText (drives the editor model).
  await session.send("Input.insertText", { text: prompt });
  await sleep(300);
  await session.send("Runtime.evaluate", { returnByValue: true, expression: `(() => {
    const c = document.querySelector('rich-textarea [contenteditable="true"], [contenteditable="true"][role="textbox"]');
    if (c) c.dispatchEvent(new Event('input',{bubbles:true}));
    return c ? c.innerText.length : 0;
  })()` });

  // 3. Prime-wait the Send button to become genuinely enabled (hydration 250-700ms).
  let enabled = false;
  let sendXY;
  for (let i = 0; i < 25; i++) {
    const st = await session.send("Runtime.evaluate", { returnByValue: true, expression: `(() => {
      const b = document.querySelector('button[aria-label="Send message"]');
      if (!b) return { exists:false };
      const r = b.getBoundingClientRect();
      return { exists:true, disabled: b.disabled || b.getAttribute('aria-disabled')==='true', x: r.x + r.width/2, y: r.y + r.height/2 };
    })()` });
    const v = st.result.value;
    if (v?.exists && !v.disabled) { enabled = true; sendXY = { x: v.x, y: v.y }; break; }
    await sleep(120);
  }
  console.error("[capture-ws] send enabled:", enabled);

  // 4. Submit: CDP mouse click on the (now-enabled) Send button; CDP Enter if not enabled.
  if (enabled && sendXY) {
    await session.send("Input.dispatchMouseEvent", { type: "mousePressed", x: sendXY.x, y: sendXY.y, button: "left", clickCount: 1 });
    await session.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: sendXY.x, y: sendXY.y, button: "left", clickCount: 1 });
  } else {
    await session.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
    await session.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
  }

  // 5. Wait for StreamGenerate response.
  for (let i = 0; i < 30 && captured.length === 0; i++) await sleep(700);
  await sleep(3000);

  if (!captured.length) {
    const state = await session.send("Runtime.evaluate", { returnByValue: true, expression: `(() => ({ href: location.href, composerText: (document.querySelector('rich-textarea [contenteditable="true"], [contenteditable="true"][role="textbox"]')||{}).innerText||'' }))()` });
    writeFileSync(join(OUT_DIR, "raw-captures.json"), JSON.stringify({ count: 0, send_enabled: enabled, pageState: state.result.value, note: "NO StreamGenerate captured after submit" }, null, 2));
    console.error("[capture-ws] NO_CAPTURE", JSON.stringify(state.result.value));
    session.close();
    process.exit(3);
  }

  const last = captured[captured.length - 1];
  const params = new URLSearchParams(last.postData);
  const fReqRaw = params.get("f.req");
  const fReq = fReqRaw ? JSON.parse(fReqRaw) : null;
  let inner = null;
  try { inner = Array.isArray(fReq[1]) ? fReq[1] : JSON.parse(fReq[1]); } catch {}

  const endpoint = last.url
    .replace(/(bl=)[^&]+/, "$1boq_assistant-bard-web-server_fixture_p0")
    .replace(/(f\.sid=)[^&]+/, "$10")
    .replace(/(_reqid=)[^&]+/, "$11");

  const template = {
    operation_id: "webai_gemini_send_prompt--web_search",
    tool: "webai_gemini_send_prompt",
    variant: "web_search",
    capture_status: "CAPTURED",
    note: "Current Gemini build has NO Google Search tool toggle; web grounding is automatic. Normal StreamGenerate send.",
    endpoint,
    endpoint_kind: "stream_generate",
    rpc_id: "StreamGenerate",
    headers_template: {
      accept: "*/*",
      "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
      origin: "https://gemini.google.com",
      referer: "https://gemini.google.com/",
      "x-same-domain": "1"
    },
    form_template: { "f.req": fReqRaw, at: "[RUNTIME_AT_TOKEN]" },
    f_req_template: fReq,
    placeholders: {}
  };
  writeFileSync(join(OUT_DIR, "payload-template.json"), JSON.stringify(template, null, 2));
  writeFileSync(join(OUT_DIR, "response-stream.txt"), last.responseBody || "");
  if (inner) writeFileSync(join(OUT_DIR, "inner-fReq.json"), JSON.stringify(inner, null, 2));

  const fs2 = await import("node:fs");
  let basicInner = null;
  try {
    const bt = JSON.parse(fs2.readFileSync(join(process.cwd(), ".runs/path-c-gemini-rpc/wave-a-captures/webai_gemini_send_prompt--basic/payload-template.json"), "utf8"));
    basicInner = Array.isArray(bt.f_req_template[1]) ? bt.f_req_template[1] : JSON.parse(bt.f_req_template[1]);
  } catch {}
  const diff = [];
  if (inner && basicInner) {
    const n = Math.max(inner.length, basicInner.length);
    for (let i = 0; i < n; i++) {
      if ([0, 2, 3, 4, 59].includes(i)) continue; // volatile slots
      const a = JSON.stringify(basicInner[i] ?? null);
      const b = JSON.stringify(inner[i] ?? null);
      if (a !== b) diff.push({ slot: i, basic: a.slice(0, 80), websearch: b.slice(0, 80) });
    }
  }

  const body = last.responseBody || "";
  const grounding = /grounding|search_results|googleusercontent|\/url\?q=|youtube|citation|"url"\s*:\s*"https?|supportmetadata/i.test(body);
  const groundingUrls = (body.match(/https?:\/\/[^"\\\s]{8,80}/g) || []).filter((u) => !/gstatic|googleusercontent\.com\/[a-z]+\/[a-z]/.test(u)).slice(0, 8);

  const summary = {
    count: captured.length,
    status: last.status,
    response_bytes: body.length,
    inner_length: inner?.length,
    slot_diff_vs_basic: diff,
    grounding_signals_in_response: grounding,
    sample_urls_in_response: groundingUrls,
    decision_hint: diff.length === 0
      ? "IDENTICAL payload to basic StreamGenerate -> web_search is auto-grounding; replayable via the existing StreamGenerate machinery (RPC strict gain vs prior UNAVAILABLE)."
      : "payload differs -> web_search needs a distinct slot delta; inspect slot_diff_vs_basic."
  };
  writeFileSync(join(OUT_DIR, "raw-captures.json"), JSON.stringify({ send_enabled: enabled, ...summary }, null, 2));
  console.error("[capture-ws] SUMMARY:", JSON.stringify(summary, null, 2));

  session.close();
  process.exit(0);
}
main().catch((e) => { console.error("[capture-ws] error:", e); process.exit(1); });
