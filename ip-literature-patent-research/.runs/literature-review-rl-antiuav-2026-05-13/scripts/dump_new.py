import asyncio,json
from playwright.async_api import async_playwright
async def main():
 async with async_playwright() as p:
  b=await p.chromium.connect_over_cdp('http://127.0.0.1:9223')
  pg=[x for x in b.contexts[0].pages if 'chatgpt.com' in x.url][0]
  await pg.keyboard.press('Escape')
  await pg.wait_for_timeout(500)
  print(await pg.title(), pg.url)
  print((await pg.locator('body').inner_text())[-2000:])
  print(json.dumps(await pg.locator('button').evaluate_all("els=>els.map((e,i)=>({i,txt:e.innerText,aria:e.getAttribute('aria-label'),testid:e.getAttribute('data-testid'),role:e.getAttribute('role'),rect:(()=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}})()})).slice(-80)"),ensure_ascii=False,indent=2))
asyncio.run(main())
