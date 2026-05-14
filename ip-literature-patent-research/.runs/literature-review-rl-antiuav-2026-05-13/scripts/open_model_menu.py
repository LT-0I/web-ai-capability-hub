import asyncio,json
from playwright.async_api import async_playwright
async def main():
 async with async_playwright() as p:
  b=await p.chromium.connect_over_cdp('http://127.0.0.1:9223')
  pg=[x for x in b.contexts[0].pages if 'chatgpt.com' in x.url][0]
  await pg.locator('button').filter(has_text='Thinking').first.click()
  await pg.wait_for_timeout(1000)
  print((await pg.locator('body').inner_text())[-1000:])
  elems=await pg.evaluate('''() => [...document.querySelectorAll('[role="menuitem"], [role="option"], button, div')].map((e,i)=>{const t=(e.innerText||'').trim(); const r=e.getBoundingClientRect(); return {i,tag:e.tagName,role:e.getAttribute('role'),text:t.slice(0,100),aria:e.getAttribute('aria-label'),cls:String(e.className).slice(0,80),rect:{x:r.x,y:r.y,w:r.width,h:r.height}}}).filter(o=>o.text.includes('Pro')||o.text.includes('Thinking')||o.text.includes('Instant')||o.text.includes('5.5')||o.text.includes('配置'))''')
  print(json.dumps(elems,ensure_ascii=False,indent=2))
asyncio.run(main())
