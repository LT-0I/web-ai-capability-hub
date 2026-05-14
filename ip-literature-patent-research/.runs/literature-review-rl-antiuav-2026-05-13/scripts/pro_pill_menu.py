import asyncio,json
from playwright.async_api import async_playwright
async def main():
 async with async_playwright() as p:
  b=await p.chromium.connect_over_cdp('http://127.0.0.1:9223')
  pg=[x for x in b.contexts[0].pages if 'chatgpt.com' in x.url][0]
  await pg.locator('button').filter(has_text='进阶专业').first.click(timeout=3000)
  await pg.wait_for_timeout(1000)
  print((await pg.locator('body').inner_text())[-2000:])
  print(json.dumps(await pg.evaluate('''() => [...document.querySelectorAll('[role="menuitemradio"], [role="menuitem"], button, div')].map((e,i)=>{const t=(e.innerText||'').trim(); const r=e.getBoundingClientRect(); return {i,tag:e.tagName,role:e.getAttribute('role'),text:t.slice(0,120),aria:e.getAttribute('aria-label'),rect:{x:r.x,y:r.y,w:r.width,h:r.height}}}).filter(o=>o.rect.w>0&&o.rect.h>0&&o.rect.x>800&&o.text)'''),ensure_ascii=False,indent=2)[:12000])
asyncio.run(main())
