import asyncio,json
from playwright.async_api import async_playwright
async def main():
 async with async_playwright() as p:
  b=await p.chromium.connect_over_cdp('http://127.0.0.1:9223')
  pg=[x for x in b.contexts[0].pages if 'chatgpt.com' in x.url][0]
  await pg.wait_for_timeout(20000)
  data=await pg.evaluate('''() => {
   const btn=document.querySelector('[data-testid="send-button"]');
   const ed=document.querySelector('#prompt-textarea');
   return {btn_outer:btn?.outerHTML, ed_outer:ed?.outerHTML.slice(0,1000), active:document.activeElement?.outerHTML?.slice(0,300), text:ed?.innerText, btnDisabled:btn?.disabled, btnClass:btn?.className};
  }''')
  print(json.dumps(data, ensure_ascii=False, indent=2))
asyncio.run(main())
