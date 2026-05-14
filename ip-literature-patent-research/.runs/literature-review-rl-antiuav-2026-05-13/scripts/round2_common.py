import asyncio, json, re, time, shutil
from pathlib import Path
from typing import Any, Dict, List, Optional
from playwright.async_api import TimeoutError as PlaywrightTimeoutError

RUN = Path('ip-literature-patent-research/.runs/literature-review-rl-antiuav-2026-05-13')
SCRIPTS = RUN / 'scripts'
SHOTS = RUN / 'round2-screenshots'
SHOTS.mkdir(parents=True, exist_ok=True)
FINAL_PPTX = RUN / '强化学习在反无人机系统中的应用-组会汇报.pptx'
FINAL_DOCX = RUN / '强化学习在反无人机系统中的应用-文献综述.docx'
ROUND2_PPTX = RUN / 'round2-chatgpt-pro-generated-presentation.pptx'
ROUND2_DOCX = RUN / 'round2-deep-research-export.docx'

PPT_PAT = re.compile(r'(\.pptx|powerpoint|ppt|组会汇报|幻灯片|演示文稿|presentation)', re.I)
DOC_PAT = re.compile(r'(\.docx|word|文档|导出|export|deep research|研究报告|报告)', re.I)
DOWNLOAD_PAT = re.compile(r'(download|下载|save|保存|export|导出)', re.I)
IN_PROGRESS_PAT = re.compile(r'(正在|生成|分析|thinking|working|running|我会把|create a PowerPoint|制作|直接生成|可下载|I need to create)', re.I)

async def page_text(page, limit=None):
    try:
        txt = await page.locator('body').inner_text(timeout=5000)
    except Exception:
        txt = ''
    return txt if limit is None else txt[-limit:]

async def safe_shot(page, name, full_page=False):
    path = SHOTS / name
    try:
        await page.screenshot(path=str(path), full_page=full_page, timeout=30000)
        return str(path.relative_to(RUN))
    except Exception as e:
        return {'screenshot_error': repr(e)}

async def save_page_artifacts(page, prefix):
    try:
        (SCRIPTS / f'{prefix}-body.txt').write_text(await page_text(page), encoding='utf-8')
    except Exception: pass
    try:
        html = await page.content()
        (SCRIPTS / f'{prefix}-page.html').write_text(html, encoding='utf-8')
    except Exception: pass

async def collect_elements_in_frame(frame):
    return await frame.evaluate('''() => {
      const clean = s => (s || '').replace(/\s+/g,' ').trim().slice(0,700);
      const xp = (el) => {
        const parts=[]; let node=el;
        for (let depth=0; node && node.nodeType===1 && depth<5; depth++, node=node.parentElement) {
          let p=node.tagName.toLowerCase();
          if (node.id) p += '#' + node.id;
          const dt=node.getAttribute('data-testid'); if (dt) p += `[data-testid="${dt}"]`;
          const al=node.getAttribute('aria-label'); if (al) p += `[aria="${clean(al).slice(0,80)}"]`;
          parts.unshift(p);
        }
        return parts.join(' > ');
      };
      return Array.from(document.querySelectorAll('button,a,[role="button"],[data-testid],input[type="button"],input[type="submit"]')).map((el,idx)=>{
        const r=el.getBoundingClientRect();
        let parent=el.parentElement, ctx='';
        for (let i=0; parent && i<4; i++, parent=parent.parentElement) ctx += ' || ' + clean(parent.innerText || parent.textContent || '');
        return {
          idx, tag: el.tagName.toLowerCase(), role: el.getAttribute('role'),
          text: clean(el.innerText || el.textContent || ''),
          aria: el.getAttribute('aria-label') || '', title: el.getAttribute('title') || '',
          testid: el.getAttribute('data-testid') || '', href: el.getAttribute('href') || '', download: el.getAttribute('download') || '',
          disabled: !!el.disabled || el.getAttribute('aria-disabled') === 'true', visible: !!(r.width && r.height),
          box: {x:r.x,y:r.y,w:r.width,h:r.height}, path: xp(el), context: clean(ctx)
        };
      });
    }''')

async def full_button_dump(page, prefix):
    frames=[]
    for i,fr in enumerate(page.frames):
        item={'frame_index':i, 'url':fr.url}
        try:
            item['title']=await fr.title()
        except Exception: item['title']=''
        try:
            body=await fr.locator('body').inner_text(timeout=2000)
            item['dom_snippet']=body[:1200]
        except Exception as e:
            item['dom_snippet_error']=repr(e)
        try:
            item['elements']=await collect_elements_in_frame(fr)
        except Exception as e:
            item['elements_error']=repr(e)
        frames.append(item)
    out={'url':page.url,'title':await page.title(),'ts':time.strftime('%Y-%m-%dT%H:%M:%S'),'frames':frames}
    (SCRIPTS/f'{prefix}-button-dump.json').write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf-8')
    return out

async def enumerate_frames(page, prefix):
    out=[]
    for i,fr in enumerate(page.frames):
        rec={'frame_index':i,'url':fr.url}
        try:
            rec['title']=await fr.title()
        except Exception: pass
        try:
            rec['snippet']=(await fr.locator('body').inner_text(timeout=2000))[:1500]
        except Exception as e:
            rec['snippet_error']=repr(e)
        out.append(rec)
    (SCRIPTS/f'{prefix}-frames.json').write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf-8')
    return out

async def click_candidate_and_download(page, el, label, final_path, expected_ext, log):
    before=set(p.name for p in RUN.glob('*'))
    try:
        async with page.expect_download(timeout=20000) as dlinfo:
            await el.click(timeout=5000, force=True)
        dl=await dlinfo.value
        suggested=dl.suggested_filename or ''
        tmp = RUN / ('round2-raw-download-' + suggested.replace('/','_'))
        await dl.save_as(str(tmp))
        log.append({'clicked':label,'downloaded':suggested,'saved_raw':str(tmp.relative_to(RUN))})
        if suggested.lower().endswith(expected_ext):
            shutil.copy2(tmp, final_path)
            log.append({'accepted_download':str(final_path.relative_to(RUN)),'source_suggested':suggested})
            return True
        return False
    except Exception as e:
        log.append({'click_download_failed':label,'error':repr(e)[:500]})
        return False

async def try_direct_download_candidates(page, prefix, expected_ext='.pptx', mode='pptx'):
    log=[]
    final = ROUND2_PPTX if expected_ext=='.pptx' else ROUND2_DOCX
    # Build candidates from current DOM in main frame; iframes cannot easily be clicked from JS handles across frames, loop frames.
    for fr_i,fr in enumerate(page.frames):
        try:
            els = await fr.locator('button,a,[role="button"]').element_handles()
        except Exception as e:
            log.append({'frame':fr_i,'elements_error':repr(e)[:200]}); continue
        scored=[]
        for idx,h in enumerate(els):
            try:
                meta = await h.evaluate('''(el) => {
                  const clean=s=>(s||'').replace(/\s+/g,' ').trim().slice(0,1000);
                  let parent=el, ctx=''; for(let i=0; parent && i<5; i++, parent=parent.parentElement) ctx += ' || ' + clean(parent.innerText||parent.textContent||'');
                  const r=el.getBoundingClientRect();
                  return {text:clean(el.innerText||el.textContent||''), aria:el.getAttribute('aria-label')||'', title:el.getAttribute('title')||'', testid:el.getAttribute('data-testid')||'', href:el.getAttribute('href')||'', download:el.getAttribute('download')||'', visible:!!(r.width&&r.height), box:{x:r.x,y:r.y,w:r.width,h:r.height}, ctx};
                }''')
            except Exception: continue
            blob=' '.join(str(meta.get(k,'')) for k in ['text','aria','title','testid','href','download','ctx'])
            score=0
            pat = PPT_PAT if mode=='pptx' else DOC_PAT
            if pat.search(blob): score+=5
            if DOWNLOAD_PAT.search(blob): score+=3
            if expected_ext in blob.lower(): score+=8
            if meta.get('visible'): score+=1
            # avoid sidebar/history/menu junk unless strongly file-shaped
            if any(x in blob.lower() for x in ['download apps','下载应用','share chat','分享']): score-=5
            if score>=4:
                scored.append((score,idx,h,meta))
        scored.sort(key=lambda x:x[0], reverse=True)
        log.append({'frame':fr_i,'url':fr.url,'candidate_count':len(scored),'top_candidates':[{'score':s,'idx':idx,'meta':m} for s,idx,h,m in scored[:20]]})
        for score,idx,h,meta in scored[:15]:
            if not meta.get('visible') and score<10: continue
            label=f'frame{fr_i}:idx{idx}:score{score}:{meta.get("text") or meta.get("aria") or meta.get("testid")}'
            ok = await click_candidate_and_download(page, h, label, final, expected_ext, log)
            if ok:
                (SCRIPTS/f'{prefix}-download-log.json').write_text(json.dumps(log,ensure_ascii=False,indent=2),encoding='utf-8')
                return {'worked':True,'final':str(final),'log':log}
            try: await page.keyboard.press('Escape')
            except Exception: pass
            await page.wait_for_timeout(500)
    (SCRIPTS/f'{prefix}-download-log.json').write_text(json.dumps(log,ensure_ascii=False,indent=2),encoding='utf-8')
    return {'worked':False,'log':log}

async def open_or_reuse_chat(browser, url):
    ctx=browser.contexts[0]
    for pg in ctx.pages:
        if pg.url.split('?')[0] == url.split('?')[0]:
            await pg.bring_to_front(); return pg
    pg = await ctx.new_page()
    await pg.goto(url, wait_until='domcontentloaded', timeout=60000)
    await pg.bring_to_front()
    return pg

async def verify_office_file(path: Path, kind: str):
    if not path.exists(): return {'exists':False}
    rec={'exists':True,'size':path.stat().st_size}
    try:
        import zipfile
        with zipfile.ZipFile(path) as z:
            names=z.namelist()
            rec['zip_entries']=len(names)
            rec['has_content_types']='[Content_Types].xml' in names
            if kind=='pptx': rec['slide_count']=len([n for n in names if re.match(r'ppt/slides/slide\d+\.xml$', n)])
            if kind=='docx': rec['has_document_xml']='word/document.xml' in names
    except Exception as e: rec['verify_error']=repr(e)
    return rec

async def merge_selectors(update: Dict[str,Any]):
    path=RUN/'selectors-log.json'
    try: data=json.loads(path.read_text(encoding='utf-8'))
    except Exception: data={}
    data.update(update)
    path.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
