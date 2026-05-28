// Wave C2 music_download_track capture. No download-ready track exists in the session
// (find-existing-track + check-music-conversation both negative), so we generate ONE
// short instrumental track (minimal quota) and capture:
//   (A) the generate StreamGenerate response (does it embed the audio media URL?),
//   (B) the FULL network trace when "Download track" is clicked (does the button trigger
//       a clean GET to a media URL we can reconstruct from snapshot at+cookies, or a
//       client-side blob/ObjectURL with no replayable roundtrip?).
// This single generation definitively answers download-track replayability.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { cdpSession, pickGeminiAppPage, sleep } from "./../cdp-lib.mjs";

const OUT_DIR = join(process.cwd(), ".runs/path-c-gemini-rpc/wave-c2-coverage-gaps/webai_gemini_music_download_track");

async function main() {
  const target = await pickGeminiAppPage();
  if (!target) { console.error("NO_GEMINI_PAGE"); process.exit(2); }
  const session = await cdpSession(target.webSocketDebuggerUrl);
  await session.send("Page.enable");
  await session.send("Network.enable");
  await session.send("Runtime.enable");
  await session.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: OUT_DIR }).catch(() => {});
  await session.send("Page.bringToFront");

  // Network recorder: capture ALL requests (we want to see what Download triggers).
  const allReqs = new Map();
  const streamGenerate = [];
  const downloadPhase = { active: false, requests: [] };
  session.on("Network.requestWillBeSent", (p) => {
    const rec = { requestId: p.requestId, url: p.request.url, method: p.request.method, postData: p.request.postData, type: p.type, ts: Date.now() };
    allReqs.set(p.requestId, rec);
    if (/StreamGenerate/.test(p.request.url) && p.request.method === "POST") streamGenerate.push(rec);
    if (downloadPhase.active) downloadPhase.requests.push({ url: p.request.url, method: p.request.method, type: p.type, hasPost: !!p.request.postData });
  });
  session.on("Network.responseReceived", (p) => { const r = allReqs.get(p.requestId); if (r) { r.status = p.response.status; r.mimeType = p.response.mimeType; r.respHeaders = p.response.headers; } });
  const streamBodies = new Map();
  session.on("Network.loadingFinished", async (p) => {
    const r = allReqs.get(p.requestId);
    if (r && /StreamGenerate/.test(r.url)) {
      try { const body = await session.send("Network.getResponseBody", { requestId: p.requestId }); streamBodies.set(p.requestId, body.body); } catch {}
    }
  });
  // Track downloads initiated by the browser.
  const downloads = [];
  session.on("Page.downloadWillBegin", (p) => { downloads.push({ url: p.url, suggestedFilename: p.suggestedFilename }); });
  session.on("Browser.downloadWillBegin", (p) => { downloads.push({ url: p.url, suggestedFilename: p.suggestedFilename }); });

  // 1. Activate Create music + send a short instrumental prompt.
  const activate = await session.send("Runtime.evaluate", { awaitPromise: true, returnByValue: true, expression: `((async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const visible = (el) => Boolean(el && el.getClientRects().length && getComputedStyle(el).visibility !== "hidden");
    const text = (el) => String(el?.innerText || el?.textContent || el?.getAttribute?.("aria-label") || "").trim();
    for (let i=0;i<3;i++){ document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})); await sleep(120); }
    // already active?
    if ([...document.querySelectorAll('button')].some((b)=>visible(b)&&/Deselect Music/i.test(b.getAttribute('aria-label')||''))) return { ok:true, step:'already' };
    const opener = [...document.querySelectorAll('button[aria-label="Upload & tools"]')].find(visible);
    if (!opener) return { ok:false, step:'no-opener' };
    opener.click(); await sleep(900);
    let item = [...document.querySelectorAll('[role="menuitemcheckbox"], button')].find((el)=>visible(el)&&text(el)==='Create music');
    if (!item) {
      const more = [...document.querySelectorAll('button')].find((el)=>visible(el)&&/More tools/i.test(text(el)||el.getAttribute('aria-label')||''));
      if (more){ more.click(); await sleep(900); item = [...document.querySelectorAll('[role="menuitemcheckbox"], button')].find((el)=>visible(el)&&text(el)==='Create music'); }
    }
    if (!item) return { ok:false, step:'no-create-music' };
    item.click(); await sleep(1500);
    const active = [...document.querySelectorAll('button')].some((b)=>visible(b)&&/Deselect Music/i.test(b.getAttribute('aria-label')||''));
    return { ok: active, step: active?'activated':'click-no-active' };
  })())` });
  console.error("[music] activate:", JSON.stringify(activate.result.value));
  if (!activate.result.value?.ok) {
    writeFileSync(join(OUT_DIR, "music-capture-result.json"), JSON.stringify({ phase: "activate", result: activate.result.value, note: "could not activate Create music" }, null, 2));
    session.close(); process.exit(3);
  }

  // 2. Fill the music composer + send.
  await sleep(500);
  await session.send("Runtime.evaluate", { returnByValue: true, expression: `(() => {
    const c = document.querySelector('div[role="textbox"][contenteditable="true"][data-placeholder="Describe your track"], rich-textarea [contenteditable="true"], [contenteditable="true"][role="textbox"]');
    if (c){ c.focus(); c.textContent=''; c.dispatchEvent(new Event('input',{bubbles:true})); }
    return !!c;
  })()` });
  await sleep(300);
  await session.send("Input.insertText", { text: "A short 20-second calm lofi piano loop, instrumental." });
  await sleep(400);
  await session.send("Runtime.evaluate", { returnByValue: true, expression: `(() => { const c=document.querySelector('div[role="textbox"][contenteditable="true"], rich-textarea [contenteditable="true"], [contenteditable="true"][role="textbox"]'); if(c) c.dispatchEvent(new Event('input',{bubbles:true})); return c?c.innerText.length:0; })()` });
  // prime-wait Send
  let sendXY;
  for (let i=0;i<25;i++){
    const st = await session.send("Runtime.evaluate", { returnByValue: true, expression: `(() => { const b=document.querySelector('button[aria-label="Send message"]'); if(!b) return {e:false}; const r=b.getBoundingClientRect(); return {e:true, dis:b.disabled||b.getAttribute('aria-disabled')==='true', x:r.x+r.width/2, y:r.y+r.height/2}; })()` });
    const v = st.result.value;
    if (v?.e && !v.dis){ sendXY={x:v.x,y:v.y}; break; }
    await sleep(120);
  }
  if (sendXY){
    await session.send("Input.dispatchMouseEvent", { type:"mousePressed", x:sendXY.x, y:sendXY.y, button:"left", clickCount:1 });
    await session.send("Input.dispatchMouseEvent", { type:"mouseReleased", x:sendXY.x, y:sendXY.y, button:"left", clickCount:1 });
  } else {
    await session.send("Input.dispatchKeyEvent", { type:"keyDown", key:"Enter", code:"Enter", windowsVirtualKeyCode:13 });
    await session.send("Input.dispatchKeyEvent", { type:"keyUp", key:"Enter", code:"Enter", windowsVirtualKeyCode:13 });
  }
  console.error("[music] sent, waiting for track (up to 180s)...");

  // 3. Wait for the Download track button (track ready).
  let ready = false;
  for (let i=0;i<180;i++){
    await sleep(1000);
    const st = await session.send("Runtime.evaluate", { returnByValue: true, expression: `(() => {
      const dl = document.querySelector('button[aria-label="Download track"]');
      const stop = document.querySelector('button[aria-label="Stop response"]');
      const quota = /limit|quota|too many|try again later/i.test((document.body.innerText||'').slice(-600));
      return { hasDl: !!dl, generating: !!stop, quota };
    })()` });
    const v = st.result.value;
    if (v.quota){ console.error("[music] quota signal"); break; }
    if (v.hasDl && !v.generating){ ready = true; break; }
  }
  console.error("[music] track ready:", ready);

  // Save generate StreamGenerate response(s) for media-URL analysis.
  const genBodies = streamGenerate.map((r) => ({ url: r.url.replace(/(_reqid=)[^&]+/, "$11").replace(/(f\.sid=)[^&]+/, "$10"), body: streamBodies.get(r.requestId) || "" }));
  writeFileSync(join(OUT_DIR, "generate-stream-bodies.json"), JSON.stringify(genBodies.map((g)=>({ url:g.url, bytes:g.body.length })), null, 2));
  if (genBodies.length) writeFileSync(join(OUT_DIR, "generate-response-stream.txt"), genBodies[genBodies.length-1].body);

  // Extract audio URLs embedded in the generate response.
  let embeddedAudioUrls = [];
  try {
    const { extractGeminiMediaUrls } = await import(join(process.cwd(), "dist/src/mcp/gemini_media_rpc.js"));
    const allUrls = genBodies.flatMap((g)=> g.body ? extractGeminiMediaUrls(g.body) : []);
    embeddedAudioUrls = allUrls.filter((u)=>/\.(mp3|wav|m4a|aac|mp4|webm)(?:[?#]|$)|audio\/|video\/|googleusercontent|usercontent/i.test(u));
  } catch (e) { console.error("[music] extract err:", e.message); }

  if (!ready) {
    writeFileSync(join(OUT_DIR, "music-capture-result.json"), JSON.stringify({ phase:"generate", track_ready:false, generate_stream_count: streamGenerate.length, embedded_audio_urls: embeddedAudioUrls, note:"track not ready (quota or timeout) — see generate-response-stream.txt" }, null, 2));
    session.close(); process.exit(3);
  }

  // 4. DOWNLOAD PHASE: click "Download track" + record every network request + downloads.
  downloadPhase.active = true;
  const dlBtn = await session.send("Runtime.evaluate", { returnByValue: true, expression: `(() => { const b=document.querySelector('button[aria-label="Download track"]'); if(!b) return null; const r=b.getBoundingClientRect(); return {x:r.x+r.width/2, y:r.y+r.height/2}; })()` });
  if (dlBtn.result.value){
    const { x, y } = dlBtn.result.value;
    await session.send("Input.dispatchMouseEvent", { type:"mousePressed", x, y, button:"left", clickCount:1 });
    await session.send("Input.dispatchMouseEvent", { type:"mouseReleased", x, y, button:"left", clickCount:1 });
  }
  // A menu may appear (MP3 / Video). Pick MP3.
  await sleep(1200);
  await session.send("Runtime.evaluate", { returnByValue: true, expression: `((async () => {
    const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
    const visible=(el)=>Boolean(el&&el.getClientRects().length);
    const items=[...document.querySelectorAll('[role="menuitem"], button, a')].filter(visible);
    const mp3=items.find((el)=>/\\bMP3\\b/i.test((el.innerText||el.textContent||'')));
    if(mp3){ mp3.click(); return 'clicked-mp3'; }
    return 'no-mp3-menu';
  })())` });
  // wait for any download/network
  await sleep(6000);
  downloadPhase.active = false;

  // Try to fetch the download-phase request bodies for any *download* / media GET.
  const dlReqs = downloadPhase.requests.filter((r)=>!/cspreport|fonts|gstatic\/images|productlogos|csi\?|log\?|gen_204/i.test(r.url));

  const result = {
    phase: "download",
    track_ready: true,
    generate_stream_count: streamGenerate.length,
    embedded_audio_urls_in_generate_response: embeddedAudioUrls,
    download_phase_requests: dlReqs,
    browser_downloads: downloads,
    decision_hint: ""
  };
  // Decision logic
  const directMediaGet = dlReqs.find((r)=>r.method==='GET' && /\.(mp3|wav|m4a|aac|mp4|webm)(?:[?#]|$)|audio\/|video\/|googleusercontent|usercontent|generativelanguage|videoplayback/i.test(r.url));
  const blobDownload = downloads.some((d)=>/^blob:/i.test(d.url||'')) || dlReqs.some((r)=>/^blob:/i.test(r.url));
  if (embeddedAudioUrls.length && directMediaGet) {
    result.decision_hint = "REPLAYABLE: audio URL embedded in generate StreamGenerate response AND Download click does a plain GET to a media URL -> reconstructable from snapshot at+cookies (mirror downloadMediaUrl).";
  } else if (embeddedAudioUrls.length && !directMediaGet && !blobDownload) {
    result.decision_hint = "LIKELY REPLAYABLE: audio URL embedded in generate response; Download click may reuse the already-known URL (GET). Reconstructable via generate-response media URL + GET.";
  } else if (blobDownload) {
    result.decision_hint = "TRUE_RPC_NOT_AVAILABLE: Download is a client-side blob:/ObjectURL with no replayable network roundtrip.";
  } else {
    result.decision_hint = "INCONCLUSIVE: see download_phase_requests + browser_downloads.";
  }
  writeFileSync(join(OUT_DIR, "music-capture-result.json"), JSON.stringify(result, null, 2));
  console.error("[music] RESULT:", JSON.stringify(result, null, 2));
  session.close();
  process.exit(0);
}
main().catch((e) => { console.error("[music] error:", e); process.exit(1); });
