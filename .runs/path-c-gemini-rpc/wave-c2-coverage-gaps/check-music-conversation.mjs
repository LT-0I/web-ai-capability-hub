// Navigate to the "Music Generation Issue" conversation and check whether it holds a
// download-ready track (Download track button / audio element). Non-destructive: read-only.
import { cdpSession, pickGeminiAppPage, evalExpr, sleep } from "./cdp-lib.mjs";

const CONV_URL = "https://gemini.google.com/app/3d9b5f53bbfd8cdf";

async function main() {
  const target = await pickGeminiAppPage();
  if (!target) { console.error("NO_GEMINI_PAGE"); process.exit(2); }
  const session = await cdpSession(target.webSocketDebuggerUrl);
  await session.send("Runtime.enable");
  await session.send("Page.enable");
  await session.send("Page.bringToFront");

  await session.send("Page.navigate", { url: CONV_URL });
  // bounded-poll past hydration
  let info = null;
  for (let i = 0; i < 30; i++) {
    await sleep(700);
    info = await evalExpr(session, `(() => {
      const dl = document.querySelector('button[aria-label="Download track"]');
      const stop = document.querySelector('button[aria-label="Stop response"]');
      const audios = [...document.querySelectorAll('audio')].map((a)=>({src:a.currentSrc||a.src||'', dur:a.duration}));
      const moreBtns = [...document.querySelectorAll('button[aria-label*="more" i], button[aria-label*="More" i], button[aria-label*="options" i]')].map((b)=>b.getAttribute('aria-label')).slice(0,8);
      const text = (document.body.innerText||'').slice(0,400);
      return { href: location.href, hasDownloadBtn: !!dl, generating: !!stop, audios, moreBtns, text };
    })()`);
    if (info && (info.hasDownloadBtn || info.audios?.length) && !info.generating) break;
  }
  console.log(JSON.stringify(info, null, 2));
  session.close();
  process.exit(0);
}
main().catch((e) => { console.error("[check] error:", e); process.exit(1); });
