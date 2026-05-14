import asyncio, json
from pathlib import Path
from playwright.async_api import async_playwright
RUN=Path('ip-literature-patent-research/.runs/literature-review-rl-antiuav-2026-05-13')
async def dump(page, name):
 txt=await page.locator('body').inner_text(timeout=5000)
 (RUN/'scripts'/f'{name}.txt').write_text(txt, encoding='utf-8')
 html=await page.content()
 (RUN/'scripts'/f'{name}.html').write_text(html, encoding='utf-8')
 print('URL', page.url, 'title', await page.title())
 print(txt[:5000])
 btns=await page.locator('button').evaluate_all("els=>els.slice(0,200).map((e,i)=>({i,txt:e.innerText,aria:e.getAttribute('aria-label'),title:e.getAttribute('title'),testid:e.getAttribute('data-testid'),cls:e.className}))")
 print(json.dumps(btns, ensure_ascii=False, indent=2)[:12000])
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.connect_over_cdp('http://127.0.0.1:9223')
  ctx=browser.contexts[0]; page=[pg for pg in ctx.pages if 'chatgpt.com' in pg.url][0]
  await page.wait_for_timeout(1000)
  await dump(page,'home_dump')
asyncio.run(main())
