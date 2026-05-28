// Discover the DOM path to the web-search ("Google Search"/"Deep Search"/"Web") tool toggle
// in the current Gemini build. Enumerate the Upload & tools menu + any submenus.
import { cdpSession, pickGeminiAppPage, evalExpr, sleep } from "./cdp-lib.mjs";

async function main() {
  const target = await pickGeminiAppPage();
  if (!target) { console.log(JSON.stringify({ ok: false, reason: "no gemini/app page" })); process.exit(2); }
  const session = await cdpSession(target.webSocketDebuggerUrl);
  await session.send("Runtime.enable");
  await session.send("Page.enable");
  await session.send("Page.bringToFront");
  await sleep(800);

  const result = await evalExpr(session, `((async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const visible = (el) => Boolean(el && el.getClientRects().length && getComputedStyle(el).visibility !== "hidden" && getComputedStyle(el).display !== "none");
    const describe = (el) => ({
      tag: el.tagName,
      role: el.getAttribute('role'),
      aria: el.getAttribute('aria-label'),
      testid: el.getAttribute('data-test-id') || el.getAttribute('data-testid'),
      text: (el.innerText || el.textContent || '').trim().slice(0, 60),
      checked: el.getAttribute('aria-checked')
    });
    const out = { steps: [] };

    // dismiss overlays
    for (let i = 0; i < 3; i++) { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await sleep(120); }

    // open Upload & tools
    const opener = document.querySelector('button[aria-label="Upload & tools"]');
    if (!opener) { out.steps.push({ step: "no-opener" }); return out; }
    opener.click();
    await sleep(900);

    let items = [...document.querySelectorAll('[role="menuitemcheckbox"], [role="menuitem"], button')].filter(visible);
    out.steps.push({ step: "menu-open", items: items.map(describe).filter((d) => d.aria || d.text || d.testid) });

    // look for any web/search/deep/research toggle
    const searchRe = /Google\\s*Search|Web\\s*Search|Deep\\s*Search|Search\\s*the\\s*web|\\bWeb\\b|Browse/i;
    let search = items.find((el) => searchRe.test((el.innerText || '') + ' ' + (el.getAttribute('aria-label') || '')));
    if (!search) {
      // try More tools submenu
      const more = items.find((el) => /More\\s*tools/i.test((el.innerText || '') + ' ' + (el.getAttribute('aria-label') || '')) || /more-tools/i.test(el.getAttribute('data-test-id') || ''));
      if (more) {
        more.click();
        await sleep(900);
        items = [...document.querySelectorAll('[role="menuitemcheckbox"], [role="menuitem"], button')].filter(visible);
        out.steps.push({ step: "more-tools-open", items: items.map(describe).filter((d) => d.aria || d.text || d.testid) });
        search = items.find((el) => searchRe.test((el.innerText || '') + ' ' + (el.getAttribute('aria-label') || '')));
      } else {
        out.steps.push({ step: "no-more-tools" });
      }
    }
    out.found_search = search ? describe(search) : null;
    // leave menu open state captured; close after
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    return out;
  })())`);

  console.log(JSON.stringify(result, null, 2));
  session.close();
  process.exit(0);
}
main().catch((e) => { console.error("discover error:", e); process.exit(1); });
