import asyncio, json, time, shutil, re
from pathlib import Path
from playwright.async_api import async_playwright
from round2_common import RUN,SCRIPTS,SHOTS,safe_shot,save_page_artifacts,full_button_dump,enumerate_frames,verify_office_file,ROUND2_DOCX,FINAL_DOCX
URL='https://chatgpt.com/c/6a04a213-5648-83e8-b9d0-6134aef56831'
TITLE_PAT=re.compile(r'强化学习.*反无人机|反无人机.*强化学习|深度研究|研究报告|report',re.I)
EXPORT_PAT=re.compile(r'docx|word|export|导出|下载|download|保存|save|报告|文档',re.I)
async def dump_named(page, name):
    dump=await full_button_dump(page,name)
    # additionally write exact requested name for phase A round2 button dump
    if name=='phaseA-round2':
        (RUN/'phaseA-round2-button-dump.json').write_text(json.dumps(dump,ensure_ascii=False,indent=2),encoding='utf-8')
        (SCRIPTS/'phaseA-round2-button-dump.json').write_text(json.dumps(dump,ensure_ascii=False,indent=2),encoding='utf-8')
    return dump
async def try_docx_download(page, label):
    log=[]
    for fr_i,fr in enumerate(page.frames):
        try: handles=await fr.locator('button,a,[role="button"]').element_handles()
        except Exception as e: log.append({'frame':fr_i,'err':repr(e)}); continue
        candidates=[]
        for idx,h in enumerate(handles):
            try:
                meta=await h.evaluate('''el=>{const clean=s=>(s||'').replace(/\s+/g,' ').trim(); const r=el.getBoundingClientRect(); let p=el,ctx=''; for(let i=0;p&&i<5;i++,p=p.parentElement) ctx += clean(p.innerText||p.textContent||'')+' || '; return {text:clean(el.innerText||el.textContent||''),aria:el.getAttribute('aria-label')||'',title:el.getAttribute('title')||'',testid:el.getAttribute('data-testid')||'',href:el.getAttribute('href')||'',download:el.getAttribute('download')||'',box:{x:r.x,y:r.y,w:r.width,h:r.height},ctx:ctx.slice(0,1600)}}''')
            except Exception: continue
            blob=' '.join(str(meta.get(k,'')) for k in meta)
            if EXPORT_PAT.search(blob) and meta['box']['w'] and meta['box']['h']:
                score=0
                low=blob.lower()
                if 'docx' in low: score+=12
                if 'word' in low: score+=10
                if 'export' in low or '导出' in low: score+=7
                if 'download' in low or '下载' in low: score+=4
                if '报告' in low or 'report' in low: score+=2
                if 'share' in low or '分享' in low: score-=4
                if score>=4: candidates.append((score,idx,h,meta))
        candidates.sort(key=lambda t:t[0], reverse=True)
        log.append({'frame':fr_i,'url':fr.url,'candidate_count':len(candidates),'top':[{'score':s,'idx':i,'meta':m} for s,i,h,m in candidates[:25]]})
        for score,idx,h,meta in candidates[:12]:
            try:
                log.append({'trying':label,'frame':fr_i,'idx':idx,'score':score,'meta':meta})
                async with page.expect_download(timeout=8000) as dl_info:
                    await h.click(force=True,timeout=3000)
                dl=await dl_info.value
                raw=RUN/('round2-docx-raw-'+dl.suggested_filename.replace('/','_'))
                await dl.save_as(str(raw)); log.append({'downloaded':dl.suggested_filename,'raw':str(raw.relative_to(RUN))})
                if dl.suggested_filename.lower().endswith('.docx'):
                    shutil.copy2(raw,ROUND2_DOCX); shutil.copy2(raw,FINAL_DOCX); log.append({'accepted':str(ROUND2_DOCX.relative_to(RUN)),'final':str(FINAL_DOCX.relative_to(RUN))})
                    (SCRIPTS/f'phaseA-round2-docx-download-{label}.json').write_text(json.dumps(log,ensure_ascii=False,indent=2),encoding='utf-8')
                    return True,log
            except Exception as e:
                log.append({'failed':label,'frame':fr_i,'idx':idx,'err':repr(e)[:400]})
                try: await page.keyboard.press('Escape')
                except Exception: pass
                await page.wait_for_timeout(500)
    (SCRIPTS/f'phaseA-round2-docx-download-{label}.json').write_text(json.dumps(log,ensure_ascii=False,indent=2),encoding='utf-8')
    return False,log
async def main():
    result={'lead':'lead4_deep_research_docx','url':URL,'started':time.strftime('%Y-%m-%dT%H:%M:%S')}
    async with async_playwright() as p:
        b=await p.chromium.connect_over_cdp('http://127.0.0.1:9223')
        page=await b.contexts[0].new_page(); await page.goto(URL, wait_until='domcontentloaded', timeout=60000)
        await page.bring_to_front(); await page.set_viewport_size({'width':1500,'height':1000})
        await page.wait_for_timeout(12000)
        result['title']=await page.title(); result['current_url']=page.url
        # top screenshot and initial dumps
        await save_page_artifacts(page,'phaseA-round2-initial')
        result['frames_initial']=await enumerate_frames(page,'phaseA-round2')
        result['top_full_page_screenshot']=await safe_shot(page,'phaseA-round2-full-page.png',full_page=True)
        dump=await dump_named(page,'phaseA-round2')
        result['frame_count']=len(dump.get('frames',[]))
        result['button_dump_paths']=['phaseA-round2-button-dump.json','scripts/phaseA-round2-button-dump.json','scripts/phaseA-round2-button-dump.json']
        # Try candidate download before interactions
        ok,log=await try_docx_download(page,'initial')
        result['initial_docx_download']=ok
        if ok:
            result['verify_docx']=await verify_office_file(FINAL_DOCX,'docx')
        # Hover report title/direct text candidates
        hover_results=[]
        for pat in ['强化学习在反无人机系统中的应用','强化学习在反无人机','深度研究','报告']:
            try:
                loc=page.get_by_text(pat, exact=False).first
                await loc.scroll_into_view_if_needed(timeout=5000)
                await loc.hover(timeout=5000)
                await page.wait_for_timeout(5000)
                hover_results.append({'pattern':pat,'worked':True})
                await safe_shot(page,f'phaseA-round2-hover-title-{len(hover_results)}.png',full_page=False)
                await dump_named(page,f'phaseA-round2-hover-title-{len(hover_results)}')
                if not result.get('docx_after_hover'):
                    ok2,log2=await try_docx_download(page,f'hover-title-{len(hover_results)}')
                    result['docx_after_hover']=ok2
                    if ok2: break
            except Exception as e:
                hover_results.append({'pattern':pat,'worked':False,'error':repr(e)[:300]})
        result['hover_title_results']=hover_results
        # Hover top-right of likely assistant/report card: locate wide section/article containing title/report
        try:
            main_box=await page.locator('main').bounding_box()
            x=(main_box['x']+main_box['w']-90) if main_box else 1180
            y=(main_box['y']+140) if main_box else 180
            await page.mouse.move(x,y); await page.wait_for_timeout(5000)
            result['hover_top_right']={'worked':True,'x':x,'y':y,'screenshot':await safe_shot(page,'phaseA-round2-hover-top-right-report-card.png',full_page=False)}
            await dump_named(page,'phaseA-round2-hover-top-right')
            if not result.get('docx_after_hover'):
                ok3,log3=await try_docx_download(page,'hover-top-right')
                result['docx_after_hover_top_right']=ok3
        except Exception as e:
            result['hover_top_right']={'worked':False,'error':repr(e)[:300]}
        # Bottom area screenshot
        try:
            await page.evaluate('window.scrollTo(0, document.body.scrollHeight)')
            await page.wait_for_timeout(3000)
            result['bottom_screenshot']=await safe_shot(page,'phaseA-round2-bottom-area.png',full_page=False)
            await dump_named(page,'phaseA-round2-bottom')
        except Exception as e:
            result['bottom_error']=repr(e)
        # Keyboard shortcuts requested
        shortcut_results=[]
        for keys in ['Control+Shift+S','Control+S']:
            try:
                await page.keyboard.press(keys)
                await page.wait_for_timeout(3000)
                shot=await safe_shot(page,'phaseA-round2-shortcut-'+keys.replace('+','-')+'.png',full_page=False)
                shortcut_results.append({'keys':keys,'worked':True,'screenshot':shot,'body_tail':(await page.locator('body').inner_text(timeout=3000))[-1000:]})
                await page.keyboard.press('Escape'); await page.wait_for_timeout(1000)
                await dump_named(page,'phaseA-round2-shortcut-'+keys.replace('+','-'))
                if not (ROUND2_DOCX.exists()):
                    ok4,log4=await try_docx_download(page,'shortcut-'+keys.replace('+','-'))
                    if ok4: result['docx_after_shortcut']=keys
            except Exception as e:
                shortcut_results.append({'keys':keys,'worked':False,'error':repr(e)[:300]})
                try: await page.keyboard.press('Escape')
                except Exception: pass
        result['shortcut_results']=shortcut_results
        result['final_verify_docx']=await verify_office_file(FINAL_DOCX,'docx')
        result['round2_docx_verify']=await verify_office_file(ROUND2_DOCX,'docx')
        (SCRIPTS/'round2-lead4-result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
        print(json.dumps(result,ensure_ascii=False,indent=2))
asyncio.run(main())
