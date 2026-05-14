import asyncio, json, time, shutil
from pathlib import Path
from playwright.async_api import async_playwright
from round2_common import RUN,SCRIPTS,safe_shot,save_page_artifacts,full_button_dump,verify_office_file,ROUND2_PPTX,ROUND2_DOCX,FINAL_PPTX,FINAL_DOCX
URL='https://chatgpt.com/c/69f9dc41-3668-83e8-b1c5-b9f3653ce2bb'
async def click_near_file_card(page, exts):
    log=[]
    buttons=await page.locator('button,a,[role="button"]').element_handles()
    c=[]
    for idx,h in enumerate(buttons):
        try:
            meta=await h.evaluate('''el=>{const r=el.getBoundingClientRect();let p=el,ctx='';for(let i=0;p&&i<5;i++,p=p.parentElement)ctx+=(p.innerText||p.textContent||'')+' || ';return {text:(el.innerText||'').trim(),aria:el.getAttribute('aria-label')||'',href:el.getAttribute('href')||'',box:{x:r.x,y:r.y,w:r.width,h:r.height},ctx:ctx.slice(0,1200)}}''')
        except Exception: continue
        blob=(meta['text']+' '+meta['aria']+' '+meta['href']+' '+meta['ctx']).lower()
        if any(ext in blob for ext in exts) and meta['box']['w'] and meta['box']['h']:
            c.append((idx,h,meta)); log.append({'candidate_idx':idx,'meta':meta})
    c.sort(key=lambda t:(t[2]['box']['y'], -t[2]['box']['x']))
    for idx,h,meta in c[:12]:
        try:
            log.append({'trying':idx,'meta':meta})
            async with page.expect_download(timeout=7000) as dl_info:
                await h.click(force=True, timeout=3000)
            dl=await dl_info.value
            raw=RUN/('round2-lead2-raw-'+dl.suggested_filename.replace('/','_'))
            await dl.save_as(str(raw)); log.append({'downloaded':dl.suggested_filename,'raw':str(raw.relative_to(RUN))})
            if dl.suggested_filename.lower().endswith('.pptx'):
                shutil.copy2(raw, ROUND2_PPTX); shutil.copy2(raw, FINAL_PPTX); return {'worked':True,'kind':'pptx','log':log}
            if dl.suggested_filename.lower().endswith('.docx'):
                shutil.copy2(raw, ROUND2_DOCX); shutil.copy2(raw, FINAL_DOCX); return {'worked':True,'kind':'docx','log':log}
        except Exception as e:
            log.append({'failed':idx,'err':repr(e)[:300]})
            try: await page.keyboard.press('Escape')
            except Exception: pass
            await page.wait_for_timeout(500)
    return {'worked':False,'log':log}
async def main():
    result={'lead':'lead2_file_download_ready','url':URL,'started':time.strftime('%Y-%m-%dT%H:%M:%S')}
    async with async_playwright() as p:
        b=await p.chromium.connect_over_cdp('http://127.0.0.1:9223')
        page=await b.contexts[0].new_page(); await page.goto(URL, wait_until='domcontentloaded', timeout=60000)
        await page.bring_to_front(); await page.set_viewport_size({'width':1400,'height':950}); await page.wait_for_timeout(8000)
        result['title']=await page.title(); result['current_url']=page.url
        result['screenshot']=await safe_shot(page,'round2-lead2-file-download-ready.png',full_page=True)
        await save_page_artifacts(page,'round2-lead2')
        await full_button_dump(page,'round2-lead2')
        body=await page.locator('body').inner_text(timeout=5000)
        result['contains_exts']={ext:(ext in body.lower()) for ext in ['.pptx','.docx','.xlsx','.pdf']}
        result['body_tail']=body[-3000:]
        if result['contains_exts']['.pptx'] or result['contains_exts']['.docx']:
            dl=await click_near_file_card(page,['.pptx','.docx'])
            result['download_attempt']=dl
        result['verify_pptx']=await verify_office_file(FINAL_PPTX,'pptx')
        result['verify_docx']=await verify_office_file(FINAL_DOCX,'docx')
        (SCRIPTS/'round2-lead2-result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
        print(json.dumps(result,ensure_ascii=False,indent=2))
asyncio.run(main())
