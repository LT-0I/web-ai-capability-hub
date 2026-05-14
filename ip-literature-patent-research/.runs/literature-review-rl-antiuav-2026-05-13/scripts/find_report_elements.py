import asyncio, json
from pathlib import Path
from playwright.async_api import async_playwright
RUN=Path('ip-literature-patent-research/.runs/literature-review-rl-antiuav-2026-05-13')
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.connect_over_cdp('http://127.0.0.1:9223')
  page=[pg for pg in browser.contexts[0].pages if 'chatgpt.com' in pg.url][0]
  await page.wait_for_timeout(1000)
  info=await page.evaluate('''() => {
    const terms=['深度研究报告','研究报告','导出','下载','Export','Download','Word','docx','markdown','PDF','分享','更多操作'];
    const out=[];
    const els=[...document.querySelectorAll('button,a,div,span,[role="button"],[role="menuitem"]')];
    for (const [i,e] of els.entries()){
      const t=(e.innerText||e.textContent||'').trim();
      const aria=e.getAttribute('aria-label')||'';
      const title=e.getAttribute('title')||'';
      const hit=terms.some(term=>t.includes(term)||aria.includes(term)||title.includes(term));
      if(hit) {
        const r=e.getBoundingClientRect();
        out.push({idx:i, tag:e.tagName, text:t.slice(0,300), aria, title, role:e.getAttribute('role'), testid:e.getAttribute('data-testid'), cls:String(e.className).slice(0,120), rect:{x:r.x,y:r.y,w:r.width,h:r.height}})
      }
    }
    return out;
  }''')
  print(json.dumps(info, ensure_ascii=False, indent=2)[:30000])
asyncio.run(main())
