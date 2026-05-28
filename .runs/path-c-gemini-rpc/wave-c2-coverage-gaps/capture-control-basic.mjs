// Control capture: a PLAIN prompt (no web-grounding trigger) on the SAME current model,
// to isolate whether inner[79]==3 in the web_search capture is a web-search flag or just
// the current model's encoding. If basic-on-this-model shows inner[79]==1, then 3 is the
// web-search delta. If basic-on-this-model also shows 3, then 79 encodes the model and
// web_search is NOT a distinct payload slot (auto-grounding only).
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
      requests.set(p.requestId, { url: p.request.url, postData: p.request.postData, ts: Date.now() });
    }
  });
  session.on("Network.loadingFinished", async (p) => {
    if (requests.has(p.requestId)) {
      try { const body = await session.send("Network.getResponseBody", { requestId: p.requestId }); captured.push({ ...requests.get(p.requestId), responseBody: body.body }); console.error("[ctrl] response", body.body.length); } catch (e) { console.error("[ctrl] body err", e.message); }
    }
  });

  // Plain arithmetic/definition prompt: no fresh-fact grounding needed.
  const prompt = "Write a haiku about a quiet mountain lake. Do not search the web.";

  await session.send("Runtime.evaluate", { returnByValue: true, expression: `(() => {
    for (let i=0;i<3;i++) document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
    const c = document.querySelector('rich-textarea [contenteditable="true"], [contenteditable="true"][role="textbox"]');
    if (c) { c.focus(); c.textContent=''; c.dispatchEvent(new Event('input',{bubbles:true})); }
    return !!c;
  })()` });
  await sleep(300);
  await session.send("Input.insertText", { text: prompt });
  await sleep(300);
  await session.send("Runtime.evaluate", { returnByValue: true, expression: `(() => { const c=document.querySelector('rich-textarea [contenteditable="true"], [contenteditable="true"][role="textbox"]'); if(c) c.dispatchEvent(new Event('input',{bubbles:true})); return c?c.innerText.length:0; })()` });

  let enabled = false, sendXY;
  for (let i = 0; i < 25; i++) {
    const st = await session.send("Runtime.evaluate", { returnByValue: true, expression: `(() => { const b=document.querySelector('button[aria-label="Send message"]'); if(!b) return {exists:false}; const r=b.getBoundingClientRect(); return {exists:true, disabled:b.disabled||b.getAttribute('aria-disabled')==='true', x:r.x+r.width/2, y:r.y+r.height/2}; })()` });
    const v = st.result.value;
    if (v?.exists && !v.disabled) { enabled = true; sendXY = { x: v.x, y: v.y }; break; }
    await sleep(120);
  }
  if (enabled && sendXY) {
    await session.send("Input.dispatchMouseEvent", { type: "mousePressed", x: sendXY.x, y: sendXY.y, button: "left", clickCount: 1 });
    await session.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: sendXY.x, y: sendXY.y, button: "left", clickCount: 1 });
  } else {
    await session.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
    await session.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
  }
  for (let i = 0; i < 25 && captured.length === 0; i++) await sleep(700);
  await sleep(2000);

  if (!captured.length) { console.error("[ctrl] NO_CAPTURE"); session.close(); process.exit(3); }
  const last = captured[captured.length - 1];
  const fReqRaw = new URLSearchParams(last.postData).get("f.req");
  const fReq = JSON.parse(fReqRaw);
  const inner = Array.isArray(fReq[1]) ? fReq[1] : JSON.parse(fReq[1]);
  const body = last.responseBody || "";
  const urls = (body.match(/https?:\/\/[^"\\\s]{8,80}/g) || []).filter((u) => !/gstatic|googleusercontent/.test(u)).slice(0, 5);

  const out = {
    capture: "control-basic-same-model",
    inner_79: inner[79],
    inner_80: inner[80],
    inner_30: JSON.stringify(inner[30]),
    inner_17: JSON.stringify(inner[17]),
    response_bytes: body.length,
    has_grounding_urls: urls.length > 0,
    sample_urls: urls
  };
  writeFileSync(join(OUT_DIR, "control-basic.json"), JSON.stringify(out, null, 2));
  console.error("[ctrl] RESULT:", JSON.stringify(out, null, 2));
  session.close();
  process.exit(0);
}
main().catch((e) => { console.error("[ctrl] error:", e); process.exit(1); });
