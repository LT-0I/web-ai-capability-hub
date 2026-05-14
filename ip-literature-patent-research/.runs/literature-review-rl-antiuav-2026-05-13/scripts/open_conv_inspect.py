import asyncio, json
from pathlib import Path
from playwright.async_api import async_playwright
RUN=Path('ip-literature-patent-research/.runs/literature-review-rl-antiuav-2026-05-13')
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.connect_over_cdp('http://127.0.0.1:9223')
  ctx=browser.contexts[0]; page=[pg for pg in ctx.pages if 'chatgpt.com' in pg.url][0]
  await page.get_by_text('强化学习在反无人机应用', exact=True).click(timeout=10000)
  await page.wait_for_load_state('domcontentloaded')
  await page.wait_for_timeout(8000)
  await page.screenshot(path=str(RUN/'phaseA-screenshots/02-conversation-open.png'), full_page=False)
  txt=await page.locator('body').inner_text(timeout=10000)
  (RUN/'scripts/conversation_body.txt').write_text(txt, encoding='utf-8')
  (RUN/'scripts/conversation.html').write_text(await page.content(), encoding='utf-8')
  print('url', page.url, 'title', await page.title(), 'len', len(txt))
  print(txt[:3000]); print('---tail---'); print(txt[-3000:])
  buttons=await page.locator('button').evaluate_all("els=>els.map((e,i)=>({i,txt:e.innerText,aria:e.getAttribute('aria-label'),title:e.getAttribute('title'),testid:e.getAttribute('data-testid')})).slice(0,300)")
  print(json.dumps(buttons, ensure_ascii=False, indent=2)[:20000])
asyncio.run(main())
