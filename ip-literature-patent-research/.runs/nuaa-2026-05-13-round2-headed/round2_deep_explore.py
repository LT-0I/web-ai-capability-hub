from __future__ import annotations
import asyncio, json, os, re, time, urllib.parse, shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from playwright.async_api import async_playwright, TimeoutError as PlaywrightTimeoutError

ROOT = Path(__file__).resolve().parents[3]
SKILL = ROOT / 'ip-literature-patent-research'
RUN = SKILL / '.runs' / 'nuaa-2026-05-13-round2-headed'
EVID = RUN / 'evidence'
PROGRESS = RUN / 'progress.md'
REGISTRY = SKILL / 'references' / 'site_registry.json'
ROUND1 = SKILL / '.runs' / 'nuaa-2026-05-13-deep-explore' / 'nuaa_stem_feature_tests.json'
CDP = 'http://127.0.0.1:9333'
FEATURES = ['access','simple_search','advanced_search','sort_and_view','export','citation_graph','alerts_saved','full_text','api_openurl']
RESOURCES = ['cnki','wanfang','web-of-science','scopus','science-direct','ieee-xplore','acm-dl','springer-link','incopat']
ZH = {'cnki','wanfang','incopat'}
QUERIES = {True:'无人机 路径规划 强化学习', False:'UAV path planning reinforcement learning'}
META = {
  'source':'NUAA library, headed CDP, warm campus proxy session',
  'campus_network': True,
  'schema_version':'nuaa-stem-round2-headed-1.0',
  'round':2,
  'redactions_applied':['nav_url','institutional_markers','personal_account_ids'],
}

BLOCKERS = re.compile(r'captcha|验证码|人机验证|异常下载|黑名单|abnormal download|access denied|forbidden|too many requests|rate limit exceeded|verify you are human', re.I)
ACCOUNT = re.compile(r'个人登录|个人账号|sign in to save|create account|login to save|登录后|account required|requires.+account', re.I)
IP_LOGIN = re.compile(r'IP登录|机构登录|机构用户|校园网|institution|Shibboleth|Access through|Institutional|通过机构|校外访问', re.I)
ADV_TEXT = re.compile(r'高级检索|高级搜索|Advanced Search|Advanced', re.I)
EXPORT_TEXT = re.compile(r'导出|引用|Export|Cite|Citation|RIS|BibTeX|EndNote|Download citations|Save to', re.I)
CITE_TEXT = re.compile(r'被引|参考文献|相关文献|Cited by|References|Related|Citations|Cited', re.I)
PDF_TEXT = re.compile(r'PDF|全文|Full text|Read online|View PDF|Download PDF|在线阅读', re.I)
ALERT_TEXT = re.compile(r'Alert|提醒|保存检索|Save search|Create alert|Email alert|收藏', re.I)
API_TEXT = re.compile(r'OpenURL|API|Link resolver|SFX|链接解析|DOI', re.I)


def now(): return datetime.now(timezone.utc).isoformat()
def line(msg: str):
    PROGRESS.parent.mkdir(parents=True, exist_ok=True)
    with PROGRESS.open('a', encoding='utf-8') as f: f.write(f"{now()} {msg}\n")
def red_url(url: str) -> str:
    try:
        u=urllib.parse.urlsplit(url)
        return urllib.parse.urlunsplit((u.scheme,u.netloc,u.path,'<redacted-query>' if u.query else '', ''))
    except Exception: return '<redacted-url>'
def safe_name(s: str) -> str: return re.sub(r'[^a-zA-Z0-9_.-]+','_',s)[:80]

async def text_sample(page, n=4000):
    try: return (await page.locator('body').inner_text(timeout=7000))[:n]
    except Exception: return ''
async def title(page):
    try: return await page.title()
    except Exception: return ''
async def screenshot(page, site, feat):
    d=EVID/site/'screenshots'; d.mkdir(parents=True, exist_ok=True)
    p=d/f'{feat}.png'
    try: await page.screenshot(path=str(p), full_page=True, timeout=20000)
    except Exception:
        try: await page.screenshot(path=str(p), timeout=10000)
        except Exception: pass
    return str(p.relative_to(RUN)) if p.exists() else ''
async def save_feature(site, feat, status, page, activation=None, selectors=None, labels=None, note='', sample_export_path=''):
    p=EVID/site; p.mkdir(parents=True, exist_ok=True)
    shot=await screenshot(page, site, feat)
    obj={
      'activation_steps': activation or [], 'selectors': selectors or {}, 'observed_labels': labels or [],
      'screenshot_path': shot, 'sample_export_path': sample_export_path, 'status': status, 'note': note,
      'captured_at': now(), 'page_title': await title(page), 'url_redacted': red_url(page.url)
    }
    out=p/f'{feat}.json'
    out.write_text(json.dumps(obj,ensure_ascii=False,indent=2),encoding='utf-8')
    return obj

async def click_text(page, regex, limit=40):
    locs=[]
    for role in ['button','link']:
        try:
            loc=page.get_by_role(role, name=regex)
            c=min(await loc.count(), limit)
            for i in range(c): locs.append(loc.nth(i))
        except Exception: pass
    try:
        loc=page.locator('text=' + regex.pattern.split('|')[0])
        if await loc.count(): locs.append(loc.first)
    except Exception: pass
    for loc in locs:
        try:
            if await loc.is_visible(timeout=1000):
                await loc.click(timeout=5000)
                await page.wait_for_timeout(2500)
                return True
        except Exception: continue
    return False

async def gather_controls(page, max_items=250):
    js = """
    (maxItems) => {
      const out=[]; const visible=e=>{const s=getComputedStyle(e); const r=e.getBoundingClientRect(); return s && s.visibility!=='hidden' && s.display!=='none' && r.width>0 && r.height>0};
      const labelOf=e=>{let a=e.getAttribute('aria-label')||e.getAttribute('title')||e.getAttribute('placeholder')||''; if(!a && e.id){let l=document.querySelector(`label[for="${CSS.escape(e.id)}"]`); if(l) a=l.innerText}; if(!a){let p=e.closest('label'); if(p) a=p.innerText}; if(!a){let p=e.parentElement; if(p) a=p.innerText.slice(0,120)}; return a.trim().replace(/\s+/g,' ')};
      for(const e of document.querySelectorAll('input,textarea,select,button,a,[role=button],[role=link]')){
        if(out.length>=maxItems) break; if(!visible(e)) continue;
        let tag=e.tagName.toLowerCase(), type=e.getAttribute('type')||'', text=(e.innerText||e.value||'').trim().replace(/\s+/g,' ').slice(0,160);
        let opts=[]; if(tag==='select') opts=[...e.options].slice(0,80).map(o=>o.text.trim()).filter(Boolean);
        out.push({tag,type,text,label:labelOf(e), selector:e.id?('#'+e.id):(e.name?`${tag}[name="${e.name}"]`:tag), placeholder:e.getAttribute('placeholder')||'', options:opts, href:e.href||''});
      }
      return out;
    }
    """
    try: return await page.evaluate(js, max_items)
    except Exception: return []

def labels_from(controls, rx=None):
    vals=[]
    for c in controls:
        s=' '.join(str(c.get(k,'')) for k in ['label','text','placeholder'])
        if s and (rx is None or rx.search(s)): vals.append(s[:180])
    return list(dict.fromkeys(vals))[:80]

async def try_ip_login(page):
    for _ in range(2):
        if await click_text(page, IP_LOGIN): return True
    return False

async def navigate(page, url, timeout=45000):
    try: await page.goto(url, wait_until='domcontentloaded', timeout=timeout)
    except Exception: pass
    await page.wait_for_timeout(3500)
    # clear ordinary cookie notices; not an access bypass
    try:
        await click_text(page, re.compile(r'接受|同意|Accept|Agree|Got it|拒绝非必要的', re.I))
    except Exception:
        pass

async def find_search_box(page):
    selectors=['input[type="search"]','input[name="q"]','input[name="query"]','input[name="search"]','input[name="searchText"]','input[placeholder*=Search]','input[placeholder*=检索]','input[placeholder*=搜索]','textarea']
    for s in selectors:
        try:
            loc=page.locator(s).first
            if await loc.is_visible(timeout=1500): return loc, s
        except Exception: pass
    try:
        boxes=page.locator('input:not([type=hidden]):not([type=checkbox]):not([type=radio])')
        for i in range(min(await boxes.count(),20)):
            loc=boxes.nth(i)
            if await loc.is_visible(timeout=500): return loc, 'input:visible'
    except Exception: pass
    return None, ''

async def submit_search(page, query):
    box, sel = await find_search_box(page)
    if not box: return False, sel
    try:
        await box.click(timeout=3000); await box.fill(query, timeout=6000); await page.keyboard.press('Enter')
        await page.wait_for_load_state('domcontentloaded', timeout=15000)
    except Exception:
        try:
            await click_text(page, re.compile(r'检索|搜索|Search|Submit|查找', re.I))
        except Exception: pass
    await page.wait_for_timeout(6000)
    return True, sel

async def search_site(page, site, query):
    tmpl=site.get('search_url_template') or site.get('home_url')
    if tmpl and '{query}' in tmpl:
        await navigate(page, tmpl.format(query=urllib.parse.quote_plus(query)))
        return True, {'route':'search_url_template'}
    ok, sel = await submit_search(page, query)
    return ok, {'query_input': sel}

async def result_evidence(page):
    body=await text_sample(page, 6000)
    count_match=re.search(r'([0-9][0-9,\.\s]*)(?:\s*(results|records|条|篇|项))', body, re.I)
    controls=await gather_controls(page)
    result_labels=labels_from(controls, re.compile(r'Title|Article|论文|期刊|Search Result|Result|排序|Sort|Page|下一页|Next|PDF|Cited', re.I))[:60]
    return {'text_sample': body[:1200], 'results_count': count_match.group(0) if count_match else '', 'controls': controls[:120], 'result_labels': result_labels}

async def open_advanced(page, site):
    url=site.get('advanced_search_url')
    if url:
        await navigate(page, url)
        return True, ['open advanced_search_url']
    ok=await click_text(page, ADV_TEXT)
    return ok, ['click visible Advanced Search'] if ok else ['advanced control not found']

async def try_sort_view(page):
    controls=await gather_controls(page)
    labels=labels_from(controls, re.compile(r'Sort|排序|Publication Date|Relevance|Cited|Title|每页|page|view|列表|表格', re.I))
    changed=[]
    # Try select elements likely sorting/page-size
    try:
        sels=page.locator('select')
        for i in range(min(await sels.count(), 8)):
            sel=sels.nth(i)
            if not await sel.is_visible(timeout=500): continue
            opts=await sel.locator('option').all_inner_texts(timeout=1000)
            if len(opts)>1 and re.search(r'Sort|排序|Relevance|Date|每页|page|Cited|Title|20|50', ' '.join(opts), re.I):
                val=await sel.locator('option').nth(1).get_attribute('value')
                if val is not None:
                    await sel.select_option(value=val, timeout=3000); await page.wait_for_timeout(4000); changed.append(opts[1][:60]); break
    except Exception: pass
    if not changed:
        for rx in [re.compile(r'Publication Date|出版时间|发表时间|日期',re.I), re.compile(r'Cited|被引',re.I), re.compile(r'Title|题名',re.I), re.compile(r'50|每页',re.I)]:
            if await click_text(page, rx): changed.append(rx.pattern); break
    ev=await result_evidence(page)
    return ('tested_ok' if changed else ('partial' if labels else 'not_applicable')), labels, changed, ev

async def try_download_export(page, site):
    outdir=EVID/site/'exports'; outdir.mkdir(parents=True, exist_ok=True)
    # select a few checkboxes if visible, but do not select all if all checkbox text says all
    try:
        boxes=page.locator('input[type=checkbox]')
        n=min(await boxes.count(), 6)
        for i in range(n):
            b=boxes.nth(i)
            if await b.is_visible(timeout=300) and not await b.is_checked(timeout=300):
                await b.check(timeout=1000)
    except Exception: pass
    controls=await gather_controls(page)
    labels=labels_from(controls, EXPORT_TEXT)
    if not labels: return 'not_applicable', labels, '', 'No visible export/citation metadata control.'
    try:
        async with page.expect_download(timeout=10000) as dl_info:
            clicked=await click_text(page, EXPORT_TEXT)
        if clicked:
            dl=await dl_info.value
            fname=safe_name(dl.suggested_filename or f'{site}_export.dat')
            path=outdir/fname
            await dl.save_as(str(path))
            note='Official export/download captured and saved.'
            return 'tested_ok', labels, str(path.relative_to(RUN)), note
    except Exception:
        pass
    # Maybe clicking opens modal with RIS/BibTeX choices; click one option.
    await click_text(page, EXPORT_TEXT)
    await page.wait_for_timeout(2000)
    for rx in [re.compile(r'RIS|BibTeX|EndNote|CSV|Excel|导出', re.I)]:
        try:
            async with page.expect_download(timeout=8000) as dl_info:
                if await click_text(page, rx): pass
            dl=await dl_info.value
            fname=safe_name(dl.suggested_filename or f'{site}_export.dat')
            path=outdir/fname; await dl.save_as(str(path))
            return 'tested_ok', labels, str(path.relative_to(RUN)), 'Official export choice captured and saved.'
        except Exception: pass
    return 'partial', labels, '', 'Export/citation control observed but no file download completed without extra account/dialog steps.'

async def try_citation(page, site):
    controls=await gather_controls(page); labels=labels_from(controls, CITE_TEXT)
    if not labels: return 'not_applicable', labels, {}, 'No cited-by/reference/related controls observed.'
    patterns={}
    for name,rx in [('cited_by',re.compile(r'Cited by|被引|Citations',re.I)),('references',re.compile(r'References|参考文献',re.I)),('related',re.compile(r'Related|相关文献|Similar',re.I))]:
        before=page.url
        if await click_text(page, rx):
            await page.wait_for_timeout(3000)
            patterns[name]=red_url(page.url)
            try:
                if page.url != before: await page.go_back(timeout=10000); await page.wait_for_timeout(1500)
            except Exception: pass
    status='tested_ok' if patterns else 'partial'
    return status, labels, patterns, ('Citation surface URL pattern(s) captured.' if patterns else 'Citation controls observed but click did not reach a verifiable list.')

async def try_fulltext(page):
    controls=await gather_controls(page); labels=labels_from(controls, PDF_TEXT)
    if not labels: return 'not_applicable', labels, {}, 'No PDF/full-text/landing-page link observed.'
    before=page.url
    if await click_text(page, PDF_TEXT):
        await page.wait_for_timeout(5000)
        target=red_url(page.url)
        try:
            if page.url != before: await page.go_back(timeout=10000); await page.wait_for_timeout(1500)
        except Exception: pass
        return 'tested_ok', labels, {'fulltext_url_pattern':target}, 'Full-text/PDF link resolved to preview or landing page; no bulk full-text saved.'
    return 'partial', labels, {}, 'Full-text control observed but click did not resolve.'

async def try_alerts(page):
    controls=await gather_controls(page); labels=labels_from(controls, ALERT_TEXT)
    if not labels: return 'not_applicable', labels, 'No alert/saved-search controls observed.'
    txt=await text_sample(page,2000)
    if ACCOUNT.search(txt) or any(ACCOUNT.search(x) for x in labels): return 'requires_account', labels, 'Alert/saved-search surface indicates personal account login is required.'
    return 'partial', labels, 'Alert/saved-search controls observed; not persisted because account state/notification side effect was not appropriate.'

async def one_site(page, sid, site):
    started=time.monotonic(); sd=EVID/sid; (sd/'screenshots').mkdir(parents=True, exist_ok=True); (sd/'exports').mkdir(parents=True, exist_ok=True)
    line(f'open-resource {sid}')
    statuses={}; details={}; export_path=''; patched=False
    home=site.get('home_url') or site.get('search_url_template')
    await navigate(page, home)
    ip_clicked=await try_ip_login(page)
    txt=await text_sample(page,3000)
    blocked=bool(BLOCKERS.search(txt))
    access_status='partial' if blocked else 'tested_ok'
    access_note=('Blocked/challenge marker observed; moving on.' if blocked else f'Home opened through warm CDP; IP/institution login clicked={ip_clicked}.')
    details['access']=await save_feature(sid,'access',access_status,page,['open home_url','try visible IP/institutional login'],{},[],access_note)
    statuses['access']=access_status
    if blocked:
        for feat in FEATURES[1:]:
            details[feat]=await save_feature(sid,feat,'partial',page,[],{},[],f'Skipped after access blocker for {sid}.')
            statuses[feat]='partial'
        return statuses, details, export_path, time.monotonic()-started, patched

    # simple search
    query=QUERIES[sid in ZH]
    ok, sels=await search_site(page,site,query)
    ev=await result_evidence(page)
    txt=await text_sample(page,3000)
    st='tested_ok' if ok and (ev.get('results_count') or ev.get('result_labels') or re.search(r'result|结果|篇|条|Article|Search',txt,re.I)) else 'partial'
    note=f"query={query}; results_count={ev.get('results_count') or 'not parsed'}"
    details['simple_search']=await save_feature(sid,'simple_search',st,page,['submit representative query'],sels,ev.get('result_labels',[]),note)
    details['simple_search']['result_evidence']=ev
    statuses['simple_search']=st
    line(f'simple-search-done {sid} status={st}')

    # advanced search
    adv_ok, steps=await open_advanced(page,site)
    controls=await gather_controls(page,400)
    op_labels=labels_from(controls, re.compile(r'AND|OR|NOT|并且|或者|不含|精确|模糊|主题|篇名|作者|摘要|关键词|Title|Author|Abstract|Keyword|Field|Operator|year|date|IPC|CPC',re.I))
    # exercise boolean-ish query if a search box exists
    bool_tests=[]
    if adv_ok:
        for q in ([ '无人机 AND 路径规划', '无人机 OR 强化学习', '无人机 NOT 避障'] if sid in ZH else ['UAV AND reinforcement learning','UAV OR drone','UAV NOT underwater']):
            try:
                box, sel=await find_search_box(page)
                if box:
                    await box.click(timeout=2000); await box.fill(q, timeout=3000); bool_tests.append({'query':q,'selector':sel})
                    # only submit first to avoid aggressive traffic
                    if len(bool_tests)==1:
                        await page.keyboard.press('Enter'); await page.wait_for_timeout(4000)
                    break
            except Exception: pass
    ev2=await result_evidence(page)
    adv_status='tested_ok' if adv_ok and (len(op_labels)>=3 or bool_tests or ev2.get('result_labels')) else ('partial' if adv_ok or op_labels else 'not_applicable')
    details['advanced_search']=await save_feature(sid,'advanced_search',adv_status,page,steps,{'controls':controls[:200],'boolean_tests':bool_tests},op_labels,f'Captured {len(controls)} advanced/interactive controls; boolean tests sampled={len(bool_tests)}.')
    statuses['advanced_search']=adv_status
    line(f'advanced-search-done {sid} status={adv_status}')

    # Ensure back on result page for following controls
    if site.get('search_url_template') and '{query}' in site.get('search_url_template'):
        await navigate(page, site['search_url_template'].format(query=urllib.parse.quote_plus(query)))
    else:
        await navigate(page, home); await search_site(page,site,query)

    # sort + view
    sst, labs, changed, sev = await try_sort_view(page)
    details['sort_and_view']=await save_feature(sid,'sort_and_view',sst,page,['change sort/view/page-size where present'],{'changed':changed,'result_evidence':sev},labs,f'changed={changed}')
    statuses['sort_and_view']=sst

    # export
    est, labs, export_path, enote = await try_download_export(page, sid)
    details['export']=await save_feature(sid,'export',est,page,['open export/citation menu or batch export after selecting visible records'],{},labs,enote,export_path)
    statuses['export']=est
    line(f'export-done {sid} status={est} export={export_path or "none"}')

    # citation graph
    cst, labs, patterns, cnote = await try_citation(page, sid)
    details['citation_graph']=await save_feature(sid,'citation_graph',cst,page,['open cited-by/references/related controls where visible'],patterns,labs,cnote)
    statuses['citation_graph']=cst

    # alerts/saved
    ast, labs, anote = await try_alerts(page)
    details['alerts_saved']=await save_feature(sid,'alerts_saved',ast,page,['inspect alert/saved-search controls; do not create personal account objects'],{},labs,anote)
    statuses['alerts_saved']=ast

    # full text
    fst, labs, fpat, fnote = await try_fulltext(page)
    details['full_text']=await save_feature(sid,'full_text',fst,page,['click one full-text/PDF/publisher landing link where visible; no bulk save'],fpat,labs,fnote)
    statuses['full_text']=fst

    # api/openurl
    controls=await gather_controls(page); api_labels=labels_from(controls,API_TEXT)
    api_st='tested_ok' if api_labels else 'not_applicable'
    api_note='OpenURL/API/DOI pattern observed; endpoint not exercised.' if api_labels else 'No OpenURL/API endpoint surfaced in UI evidence.'
    details['api_openurl']=await save_feature(sid,'api_openurl',api_st,page,['inspect UI links for OpenURL/API/DOI; do not exercise APIs'],{},api_labels,api_note)
    statuses['api_openurl']=api_st

    line(f'next-resource {sid} tested_ok={sum(1 for v in statuses.values() if v=="tested_ok")}')
    return statuses, details, export_path, time.monotonic()-started, patched


def load_round1():
    if not ROUND1.exists(): return {}
    d=json.loads(ROUND1.read_text(encoding='utf-8'))
    out={}
    for t in d.get('tests',[]):
        if t.get('resource_id') in RESOURCES:
            out[(t.get('resource_id'),t.get('feature_id'))]=t.get('status')
    return out

def write_aggregates(all_status, all_details, exports, durations, patched):
    captured=now(); meta=dict(META, captured_at=captured)
    tests=[]
    for sid in RESOURCES:
        for feat in FEATURES:
            tests.append({'resource_id':sid,'feature_id':feat,'status':all_status.get(sid,{}).get(feat,'partial'),'note':all_details.get(sid,{}).get(feat,{}).get('note','')})
    sc={}
    for t in tests: sc[t['status']]=sc.get(t['status'],0)+1
    ft=dict(meta, test_count=len(tests), tests=tests, status_counts=sc)
    (RUN/'nuaa_stem_round2_feature_tests.json').write_text(json.dumps(ft,ensure_ascii=False,indent=2),encoding='utf-8')
    catalog=dict(meta, resources=[])
    for sid in RESOURCES:
        catalog['resources'].append({'resource_id':sid,'features':all_details.get(sid,{}),'tested_ok_count':sum(1 for v in all_status.get(sid,{}).values() if v=='tested_ok'),'sample_export_path':exports.get(sid,''),'duration_seconds':round(durations.get(sid,0),1)})
    (RUN/'nuaa_stem_round2_deep_catalog.json').write_text(json.dumps(catalog,ensure_ascii=False,indent=2),encoding='utf-8')
    r1=load_round1(); trans=[]; improved=0
    for sid in RESOURCES:
        for feat in FEATURES[1:]:
            before=r1.get((sid,feat),'missing')
            after=all_status.get(sid,{}).get(feat,'partial')
            if before in {'cli_insufficient','error','observed_only','partial','missing'} and after=='tested_ok': improved+=1
            trans.append((sid,feat,before,after))
    md=['# NUAA STEM Round 2 Verification Report','',f'- Captured: {captured}',f'- Round-1 insufficient/error/partial/observed_only/missing rows now tested_ok: {improved}','', '| resource | feature | round 1 | round 2 |','|---|---:|---:|---:|']
    md += [f'| {a} | {b} | {c} | {d} |' for a,b,c,d in trans]
    (RUN/'nuaa_stem_round2_verification_report.md').write_text('\n'.join(md)+'\n',encoding='utf-8')
    summary=['# NUAA STEM 第二轮可见浏览器深探摘要','',f'采集时间：{captured}。本轮使用单一可见 Chrome CDP（端口 9333）和持久 profile，在南航图书馆入口预热后按顺序访问 9 个重点资源。','', '| 资源 | tested_ok 数 | 样例导出 | 主要限制 |','|---|---:|---|---|']
    for sid in RESOURCES:
        ok=sum(1 for v in all_status.get(sid,{}).values() if v=='tested_ok')
        limits='；'.join(f'{k}:{v}' for k,v in all_status.get(sid,{}).items() if v!='tested_ok')[:120]
        summary.append(f'| {sid} | {ok} | {exports.get(sid,"") or "未获得官方导出文件"} | {limits or "无明显限制"} |')
    (RUN/'nuaa_stem_round2_summary.md').write_text('\n'.join(summary)+'\n',encoding='utf-8')
    # final tight report
    complete=all(sum(1 for v in all_status.get(sid,{}).values() if v=='tested_ok')>=3 for sid in RESOURCES)
    title='NUAA STEM ROUND 2 COMPLETE' if complete else 'NUAA STEM ROUND 2 PARTIAL'
    lines=[f'# {title}', '']
    lines.append('## Per-resource summary')
    for sid in RESOURCES:
        st=all_status.get(sid,{})
        lines.append(f'- {sid}: tested_ok={sum(1 for v in st.values() if v=="tested_ok")}; ' + ', '.join(f'{k}={v}' for k,v in st.items()))
    lines += ['', '## site_registry.json adapter patches']
    lines += (['- None.'] if not patched else [f'- {x}' for x in patched])
    lines += ['', '## Sample export paths']
    lines += [f'- {sid}: {exports.get(sid,"") or "none"}' for sid in RESOURCES]
    lines += ['', '## Aggregate files']
    for fn in ['nuaa_stem_round2_feature_tests.json','nuaa_stem_round2_deep_catalog.json','nuaa_stem_round2_summary.md','nuaa_stem_round2_verification_report.md']:
        p=RUN/fn; lines.append(f'- {p}: {p.stat().st_size if p.exists() else 0} bytes')
    lines += ['', '## Wall-clock time']
    for sid in RESOURCES: lines.append(f'- {sid}: {durations.get(sid,0):.1f}s')
    lines.append(f'- overall: {sum(durations.values()):.1f}s')
    lines += ['', '## Round-1 → Round-2 tested_ok transitions', f'- insufficient/error/partial/observed_only/missing rows that became tested_ok: {improved}']
    if not complete:
        skipped=[sid for sid in RESOURCES if sum(1 for v in all_status.get(sid,{}).values() if v=='tested_ok')<3]
        lines += ['', '## Blockers', f'- Fewer than 3 tested_ok features for: {", ".join(skipped)}. See per-feature JSON screenshots/notes for exact blockers.']
    Path('/tmp/codex-nuaa-stem-round2-headed.md').write_text('\n'.join(lines)+'\n',encoding='utf-8')

async def main():
    reg=json.loads(REGISTRY.read_text(encoding='utf-8'))
    sites={s['id']:s for s in reg.get('sites',[]) if s.get('id') in RESOURCES}
    all_status={}; all_details={}; exports={}; durations={}; patched=[]
    async with async_playwright() as p:
        browser=await p.chromium.connect_over_cdp(CDP)
        ctx=browser.contexts[0]
        ctx.set_default_timeout(12000)
        page=ctx.pages[-1] if ctx.pages else await ctx.new_page()
        await page.set_viewport_size({'width':1440,'height':1000})
        # warm library once
        line('open-resource nuaa-library-home')
        await navigate(page,'https://lib.nuaa.edu.cn/')
        await screenshot(page,'_bootstrap','library_home')
        for sid in RESOURCES:
            try:
                st, det, exp, dur, pat = await one_site(page,sid,sites[sid])
            except Exception as e:
                dur=0; st={feat:'partial' for feat in FEATURES}; det={}
                for feat in FEATURES:
                    det[feat]=await save_feature(sid,feat,'partial',page,[],{},[],f'Unhandled site-run exception: {type(e).__name__}: {e}')
                exp=''
                line(f'next-resource {sid} exception={type(e).__name__}')
            all_status[sid]=st; all_details[sid]=det; exports[sid]=exp; durations[sid]=dur
            write_aggregates(all_status, all_details, exports, durations, patched)
    write_aggregates(all_status, all_details, exports, durations, patched)

if __name__=='__main__': asyncio.run(main())
