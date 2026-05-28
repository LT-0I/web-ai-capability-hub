// Find an already-generated, download-ready Gemini Music track in the session so we can
// capture the download request WITHOUT consuming generation quota. Strategy: open the
// sidebar conversation history, look for titles hinting at music, OR check the current
// page for a "Download track" button. Reports any conversation URL with a ready track.
import { cdpSession, pickGeminiAppPage, evalExpr, sleep } from "./cdp-lib.mjs";

async function main() {
  const target = await pickGeminiAppPage();
  if (!target) { console.error("NO_GEMINI_PAGE"); process.exit(2); }
  const session = await cdpSession(target.webSocketDebuggerUrl);
  await session.send("Runtime.enable");
  await session.send("Page.enable");
  await session.send("Page.bringToFront");
  await sleep(500);

  // 1. Current page: any Download track button?
  const cur = await evalExpr(session, `(() => {
    const dl = document.querySelector('button[aria-label="Download track"]');
    const audio = document.querySelectorAll('audio, [aria-label*="track" i], [data-test-id*="music" i]').length;
    return { href: location.href, hasDownloadBtn: !!dl, audioish: audio };
  })()`);
  console.error("[find] current page:", JSON.stringify(cur));

  // 2. Open sidebar + enumerate recent conversation titles.
  const hist = await evalExpr(session, `((async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const sb = document.querySelector('button[aria-label="Open sidebar"], button[data-test-id="side-nav-sparkle-button"]');
    if (sb) { sb.click(); await sleep(900); }
    const links = [...document.querySelectorAll('[data-test-id="conversation"], a[href*="/app/"], [role="listitem"]')];
    const items = links.map((el) => ({
      title: (el.innerText || el.textContent || '').trim().slice(0, 60),
      href: el.getAttribute('href') || (el.querySelector('a')||{}).href || ''
    })).filter((x) => x.title);
    // close sidebar
    if (sb) { sb.click(); await sleep(300); }
    return items.slice(0, 40);
  })())`);
  const musicHits = (hist || []).filter((h) => /music|song|track|tune|melody|instrumental|🎸|beat|lofi|jazz/i.test(h.title));
  console.error("[find] sidebar count:", (hist || []).length, "music-hit titles:", JSON.stringify(musicHits, null, 2));

  console.log(JSON.stringify({ current: cur, music_history_hits: musicHits, total_history: (hist || []).length }, null, 2));
  session.close();
  process.exit(0);
}
main().catch((e) => { console.error("[find] error:", e); process.exit(1); });
