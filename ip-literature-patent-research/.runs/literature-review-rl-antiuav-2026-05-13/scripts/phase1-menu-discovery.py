import asyncio
import json
import re
from pathlib import Path

from playwright.async_api import async_playwright

RUN = Path(__file__).resolve().parents[1]
URL = "https://chatgpt.com/c/6a04a213-5648-83e8-b9d0-6134aef56831"
ALL_PATH = RUN / "phase1-menu-discovery-all.json"
CAND_PATH = RUN / "phase1-menu-discovery-candidates.json"
SHOT_PATH = RUN / "phase1-menu-discovery.png"
RESULT_RE = re.compile(r"DOCX|Word|下载\s*DOCX|导出|Download", re.I)
QUERY = '[role="menuitem"], button, a, [role="button"], li, div[tabindex]'


def trunc(value, n=200):
    value = (value or "").replace("\n", " ").strip()
    return value[:n]


async def pick_page(browser):
    ctx = browser.contexts[0]
    matches = [pg for pg in ctx.pages if pg.url.split("?")[0] == URL]
    target = sorted(matches, key=lambda pg: len(pg.frames), reverse=True)[0] if matches else None
    if target is None:
        matches = [pg for pg in ctx.pages if "chatgpt.com/c/" in pg.url]
        target = sorted(matches, key=lambda pg: len(pg.frames), reverse=True)[0] if matches else None
    if target is None:
        target = await ctx.new_page()
    # Reload to force Deep Research sandbox frames to reattach in fresh smoke state.
    await target.goto(URL, wait_until="domcontentloaded", timeout=60000)
    await target.bring_to_front()
    await target.set_viewport_size({"width": 1500, "height": 1000})
    await target.wait_for_timeout(15000)
    return target


async def scroll_main(page):
    return await page.evaluate(
        """(top) => {
          const els = Array.from(document.querySelectorAll('*')).filter(
            el => el.scrollHeight > el.clientHeight + 50 && getComputedStyle(el).overflowY === 'auto');
          const main = els.find(el => el.getBoundingClientRect().x > 200 && el.clientHeight > 900);
          if (main) main.scrollTop = top;
          return { ranScroll: !!main, candidates: els.length, scrolledTo: top };
        }""",
        900,
    )


async def frame_offset(frame):
    x = y = 0
    cur = frame
    while getattr(cur, "parent_frame", None):
        try:
            owner = await cur.frame_element()
            obox = await owner.bounding_box()
            if obox:
                x += obox.get("x", 0)
                y += obox.get("y", 0)
        except Exception:
            pass
        cur = cur.parent_frame
    return {"x": x, "y": y}


def with_offset(box, off):
    return {**box, "x": box.get("x", 0) + off.get("x", 0), "y": box.get("y", 0) + off.get("y", 0)}


async def raw_click(cdp, box):
    x = box["x"] + box["width"] / 2
    y = box["y"] + box["height"] / 2
    await cdp.send("Input.dispatchMouseEvent", {"type": "mouseMoved", "x": x, "y": y})
    await cdp.send("Input.dispatchMouseEvent", {"type": "mousePressed", "x": x, "y": y, "button": "left", "buttons": 1, "clickCount": 1})
    await cdp.send("Input.dispatchMouseEvent", {"type": "mouseReleased", "x": x, "y": y, "button": "left", "buttons": 0, "clickCount": 1})


async def click_export(page, cdp):
    best = None
    for fr_i, fr in enumerate(page.frames):
        try:
            handles = await fr.locator('button[aria-label="导出"]').element_handles()
        except Exception:
            continue
        for h_i, h in enumerate(handles):
            try:
                box = await h.bounding_box()
            except Exception:
                box = None
            if box:
                best = (fr_i, h_i, box)
                break
        if best:
            break
    if not best:
        raise RuntimeError('No visible button[aria-label="导出"] found')
    await raw_click(cdp, best[2])
    return {"frame_index": best[0], "handle_index": best[1], "bbox": best[2]}


async def dump_elements(page):
    all_rows = []
    candidates = []
    for fr_i, fr in enumerate(page.frames):
        try:
            handles = await fr.locator(QUERY).element_handles()
        except Exception as e:
            all_rows.append({"frame_index": fr_i, "frame_url": fr.url, "error": repr(e)})
            continue
        off = {"x": 0, "y": 0}
        for idx, h in enumerate(handles):
            try:
                meta = await h.evaluate(
                    """(el) => {
                      const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
                      const r = el.getBoundingClientRect();
                      const nthOfType = (node) => {
                        if (!node || !node.parentElement) return 1;
                        return Array.from(node.parentElement.children).filter(x => x.tagName === node.tagName).indexOf(node) + 1;
                      };
                      const selectorPath = (node) => {
                        const parts = [];
                        for (let p = node; p && p.nodeType === 1 && parts.length < 8; p = p.parentElement) {
                          const tag = p.tagName.toLowerCase();
                          const testid = p.getAttribute('data-testid');
                          const aria = p.getAttribute('aria-label');
                          const role = p.getAttribute('role');
                          let part = tag;
                          if (testid) part += `[data-testid="${CSS.escape(testid)}"]`;
                          else if (aria) part += `[aria-label="${CSS.escape(aria)}"]`;
                          else if (role) part += `[role="${CSS.escape(role)}"]`;
                          else part += `:nth-of-type(${nthOfType(p)})`;
                          parts.unshift(part);
                          if (testid) break;
                        }
                        return parts.join(' > ');
                      };
                      return {
                        tag: el.tagName.toLowerCase(),
                        role: el.getAttribute('role') || '',
                        innerText: clean(el.innerText || el.textContent || '').slice(0, 200),
                        ariaLabel: el.getAttribute('aria-label') || '',
                        href: el.getAttribute('href') || '',
                        dataTestid: el.getAttribute('data-testid') || '',
                        y: r.y,
                        bbox: { x: r.x, y: r.y, width: r.width, height: r.height },
                        selectorPath: selectorPath(el)
                      };
                    }"""
                )
                if isinstance(meta.get("bbox"), dict):
                    meta["localBbox"] = meta["bbox"]
                    meta["bbox"] = with_offset(meta["bbox"], off)
                    meta["y"] = meta["bbox"].get("y")
                row = {"frame_index": fr_i, "frame_url": fr.url, "element_index": idx, **meta}
            except Exception as e:
                row = {"frame_index": fr_i, "frame_url": fr.url, "element_index": idx, "error": repr(e)}
            all_rows.append(row)
            blob = " ".join(str(row.get(k, "")) for k in ("innerText", "ariaLabel", "href"))
            y = row.get("y")
            if isinstance(y, (int, float)) and 0 <= y <= 1000 and RESULT_RE.search(blob):
                candidates.append(row)
    return all_rows, candidates


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.connect_over_cdp("http://127.0.0.1:9223")
        page = await pick_page(browser)
        cdp = await browser.contexts[0].new_cdp_session(page)
        scroll_result = await scroll_main(page)
        await page.wait_for_timeout(1000)
        click_result = await click_export(page, cdp)
        await page.wait_for_timeout(2000)
        all_rows, candidates = await dump_elements(page)
        await page.screenshot(path=str(SHOT_PATH), full_page=False, timeout=20000)
        payload = {"url": page.url, "frame_count": len(page.frames), "scroll": scroll_result, "click": click_result, "query": QUERY, "items": all_rows}
        ALL_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        CAND_PATH.write_text(json.dumps(candidates, ensure_ascii=False, indent=2), encoding="utf-8")
        print(json.dumps(candidates, ensure_ascii=False, indent=2))
        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
