// Verify Gemini login + read at/bl/fsid tokens via canonical snapshot reader.
import { cdpSession, pickGeminiAppPage, evalExpr, sleep } from "./cdp-lib.mjs";

async function main() {
  const target = await pickGeminiAppPage();
  if (!target) { console.log(JSON.stringify({ ok: false, reason: "no gemini/app page" })); process.exit(2); }
  const session = await cdpSession(target.webSocketDebuggerUrl);
  await session.send("Runtime.enable");
  await session.send("Page.enable");
  await session.send("Page.bringToFront");

  // Bounded-poll past SPA hydration: wait for WIZ_global_data + composer + login signal.
  let snap = null;
  for (let i = 0; i < 25; i++) {
    snap = await evalExpr(session, `(() => {
      const html = String(document.documentElement?.innerHTML || "");
      const w = window.WIZ_global_data || {};
      const composer = !!document.querySelector('rich-textarea, [contenteditable="true"][role="textbox"]');
      const loginLink = /accounts\\.google\\.com|Sign in/i.test(html.slice(0, 5000));
      return {
        href: location.href,
        at: w.SNlM0e || "",
        bl: w.cfb2h || "",
        fsid: String(w.FdrFJe || ""),
        ua: navigator.userAgent,
        composer,
        loginLink,
        bodyLen: document.body ? document.body.innerText.length : 0
      };
    })()`);
    if (snap && snap.at && snap.bl && snap.fsid && snap.composer) break;
    await sleep(700);
  }
  const loggedIn = Boolean(snap?.at && snap?.bl && snap?.fsid && snap?.composer && !/accounts\.google\.com|signin/i.test(snap?.href || ""));
  console.log(JSON.stringify({
    ok: loggedIn,
    href: snap?.href,
    has_at: !!snap?.at,
    at_len: snap?.at?.length || 0,
    has_bl: !!snap?.bl,
    bl: snap?.bl,
    has_fsid: !!snap?.fsid,
    composer: snap?.composer,
    loginLink: snap?.loginLink,
    bodyLen: snap?.bodyLen,
    ua: snap?.ua
  }, null, 2));
  session.close();
  process.exit(loggedIn ? 0 : 3);
}
main().catch((e) => { console.error("probe error:", e); process.exit(1); });
