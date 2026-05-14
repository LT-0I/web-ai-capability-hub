import asyncio, json, time
from pathlib import Path
from playwright.async_api import async_playwright
from round2_common import RUN, SCRIPTS, safe_shot, save_page_artifacts, full_button_dump, try_direct_download_candidates, verify_office_file

URL='https://chatgpt.com/c/6a055a9b-7f0c-83e8-a558-898911b65109'
async def main():
    result={'lead':'lead1_existing_pptx_chat','url':URL,'started':time.strftime('%Y-%m-%dT%H:%M:%S')}
    async with async_playwright() as p:
        browser=await p.chromium.connect_over_cdp('http://127.0.0.1:9223')
        page=None
        for pg in browser.contexts[0].pages:
            if URL in pg.url:
                page=pg; break
        if page is None:
            page=await browser.contexts[0].new_page(); await page.goto(URL, wait_until='domcontentloaded', timeout=60000)
        await page.bring_to_front(); await page.set_viewport_size({'width':1400,'height':950})
        await page.wait_for_load_state('domcontentloaded', timeout=30000)
        await page.wait_for_timeout(8000)
        result['title']=await page.title(); result['current_url']=page.url
        result['screenshot']=await safe_shot(page,'round2-lead1-existing-pptx-chat.png',full_page=True)
        await save_page_artifacts(page,'round2-lead1')
        dump=await full_button_dump(page,'round2-lead1')
        body=await page.locator('body').inner_text(timeout=5000)
        result['body_contains_pptx']='.pptx' in body.lower()
        result['body_tail']=body[-3000:]
        dl=await try_direct_download_candidates(page,'round2-lead1',expected_ext='.pptx',mode='pptx')
        result['download_result']={'worked':dl['worked'],'final':dl.get('final')}
        if dl['worked']:
            from round2_common import ROUND2_PPTX, FINAL_PPTX
            import shutil
            shutil.copy2(ROUND2_PPTX, FINAL_PPTX)
            result['copied_to_final']=str(FINAL_PPTX)
            result['verify_round2']=await verify_office_file(ROUND2_PPTX,'pptx')
            result['verify_final']=await verify_office_file(FINAL_PPTX,'pptx')
        (SCRIPTS/'round2-lead1-result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
        print(json.dumps(result,ensure_ascii=False,indent=2))
asyncio.run(main())
