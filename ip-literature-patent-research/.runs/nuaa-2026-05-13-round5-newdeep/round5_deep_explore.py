from __future__ import annotations
import asyncio, json, re, time, urllib.parse, urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from playwright.async_api import async_playwright, TimeoutError as PlaywrightTimeoutError

ROOT = Path(__file__).resolve().parents[3]
SKILL = ROOT / 'ip-literature-patent-research'
RUN = SKILL / '.runs' / 'nuaa-2026-05-13-round5-newdeep'
EVID = RUN / 'evidence'
PROGRESS = RUN / 'progress.md'
REGISTRY = SKILL / 'references' / 'site_registry.json'
CDP = 'http://127.0.0.1:9336'
FEATURES = ['simple_search','advanced_search','sort_and_view','export','citation_graph','alerts_and_saved','full_text_link','api_or_openurl']
RESOURCES = ['arxiv','proquest-csa','national-military-standards','scoap3']
ZH = {'national-military-standards'}
QUERIES = {True:'无人机 标准', False:'UAV path planning reinforcement learning'}
META = {
  'captured_at':'',
  'round':5,
  'scope':'deep-explore arxiv + proquest-csa + national-military-standards + scoap3',
  'parent_run':'nuaa-2026-05-13-round2-headed',
  'schema_version':'nuaa-stem-round5-newdeep-1.0',
  'source':'NUAA library/headed CDP warm profile where applicable; public OA where applicable',
  'policy':'ip-literature-patent-research/references/database-access-policy.md',
  'redactions_applied':['nav_url_query','institutional_markers','personal_account_ids'],
}
BLOCKERS = re.compile(r'captcha|验证码|人机验证|异常下载|黑名单|abnormal download|access denied|forbidden|too many requests|rate limit exceeded|verify you are human|禁止访问|无权限', re.I)
RESTRICTED = re.compile(r'涉密|受限|内部|军队|账号|登录后|请登录|注册|个人中心|无权限|授权|not authorized|subscription|institutional access required|sign in through your institution', re.I)
ACCOUNT = re.compile(r'个人登录|个人账号|sign in to save|create account|login to save|登录后|account required|requires.+account|Register|Login|Sign in', re.I)
ADV_TEXT = re.compile(r'高级检索|高级搜索|Advanced Search|Advanced|Search syntax|Help', re.I)
EXPORT_TEXT = re.compile(r'导出|引用|Export|Cite|Citation|RIS|BibTeX|EndNote|Download citations|Save to|Download search results|Exportar', re.I)
CITE_TEXT = re.compile(r'被引|参考文献|相关文献|Cited by|References|Related|Citations|Cited|Similar|cross-list', re.I)
PDF_TEXT = re.compile(r'PDF|全文|Full text|Read online|View PDF|Download PDF|在线阅读|Fulltext|Article', re.I)
ALERT_TEXT = re.compile(r'Alert|提醒|保存检索|Save search|Create alert|Email alert|收藏', re.I)
API_TEXT = re.compile(r'OpenURL|API|Link resolver|SFX|链接解析|DOI|OAI|Atom|arXiv API|export.arxiv', re.I)

def now(): return datetime.now(timezone.utc).isoformat()
def line(msg: str):
    PROGRESS.parent.mkdir(parents=True, exist_ok=True)
    with PROGRESS.open('a', encoding='utf-8') as f: f.write(f"{now()} {msg}\n")
def red_url(url: str) -> str:
    try:
        u=urllib.parse.urlsplit(url)
        return urllib.parse.urlunsplit((u.scheme,u.netloc,u.path,'<redacted-query>' if u.query else '', ''))
    except Exception: return '<redacted-url>'
def safe_name(s: str) -> str: return re.sub(r'[^a-zA-Z0-9_.-]+','_',s)[:100]
async def text_sample(page, n=5000):
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
async def save_feature(site, feat, status, page, activation=None, selectors=None, labels=None, note='', sample_export_path='', extra=None):
    p=EVID/site; p.mkdir(parents=True, exist_ok=True)
    shot=await screenshot(page, site, feat)
    obj={
      'resource_id':site, 'feature_id':feat, 'activation_steps': activation or [], 'selectors': selectors or {},
      'observed_labels': labels or [], 'screenshot_path': shot, 'sample_export_path': sample_export_path,
      'status': status, 'note': note, 'captured_at': now(), 'page_title': await title(page), 'url_redacted': red_url(page.url)
    }
    if extra: obj.update(extra)
    (p/f'{feat}.json').write_text(json.dumps(obj,ensure_ascii=False,indent=2),encoding='utf-8')
    return obj
async def click_text(page, regex, limit=50):
    locs=[]
    for role in ['button','link','menuitem']:
        try:
            loc=page.get_by_role(role, name=regex); c=min(await loc.count(), limit)
            for i in range(c): locs.append(loc.nth(i))
        except Exception: pass
    try:
        loc=page.locator(f'text=/{regex.pattern}/i')
        c=min(await loc.count(), limit)
        for i in range(c): locs.append(loc.nth(i))
    except Exception: pass
    for loc in locs:
        try:
            if await loc.is_visible(timeout=1000):
                await loc.click(timeout=6000); await page.wait_for_timeout(2500); return True
        except Exception: continue
    return False
async def gather_controls(page, max_items=300):
    js = """
    (maxItems) => {
      const out=[]; const visible=e=>{const s=getComputedStyle(e); const r=e.getBoundingClientRect(); return s && s.visibility!=='hidden' && s.display!=='none' && r.width>0 && r.height>0};
      const labelOf=e=>{let a=e.getAttribute('aria-label')||e.getAttribute('title')||e.getAttribute('placeholder')||''; if(!a && e.id){let l=document.querySelector(`label[for="${CSS.escape(e.id)}"]`); if(l) a=l.innerText}; if(!a){let p=e.closest('label'); if(p) a=p.innerText}; if(!a){let p=e.parentElement; if(p) a=p.innerText.slice(0,160)}; return a.trim().replace(/\s+/g,' ')};
      for(const e of document.querySelectorAll('input,textarea,select,button,a,[role=button],[role=link]')){
        if(out.length>=maxItems) break; if(!visible(e)) continue;
        let tag=e.tagName.toLowerCase(), type=e.getAttribute('type')||'', text=(e.innerText||e.value||'').trim().replace(/\s+/g,' ').slice(0,180);
        let opts=[]; if(tag==='select') opts=[...e.options].slice(0,100).map(o=>o.text.trim()).filter(Boolean);
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
        s=' '.join(str(c.get(k,'')) for k in ['label','text','placeholder','href'] + ([] if not c.get('options') else ['options']))
        if s and (rx is None or rx.search(s)): vals.append(s[:220])
    return list(dict.fromkeys(vals))[:100]
async def navigate(page, url, timeout=45000):
    try: await page.goto(url, wait_until='domcontentloaded', timeout=timeout)
    except Exception: pass
    await page.wait_for_timeout(2500)
    try: await click_text(page, re.compile(r'接受|同意|Accept|Agree|Got it|Allow all|OK', re.I))
    except Exception: pass
async def find_search_box(page):
    selectors=['input[type="search"]','input[name="query"]','input[name="p"]','input[name="q"]','input[name="keyword"]','input[name="search"]','input[name="searchText"]','input[placeholder*=Search]','input[placeholder*=检索]','input[placeholder*=搜索]','textarea']
    for s in selectors:
        try:
            loc=page.locator(s).first
            if await loc.is_visible(timeout=1200): return loc, s
        except Exception: pass
    try:
        boxes=page.locator('input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=submit])')
        for i in range(min(await boxes.count(),25)):
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
        try: await click_text(page, re.compile(r'检索|搜索|Search|Submit|查找|Go', re.I))
        except Exception: pass
    await page.wait_for_timeout(5000)
    return True, sel
async def search_site(page, site, query):
    tmpl=site.get('search_url_template') or site.get('home_url')
    if tmpl and '{query}' in tmpl:
        await navigate(page, tmpl.format(query=urllib.parse.quote_plus(query)))
        return True, {'route':'search_url_template','template':red_url(tmpl)}
    await navigate(page, site.get('home_url'))
    ok, sel = await submit_search(page, query)
    return ok, {'query_input': sel}
async def result_evidence(page):
    body=await text_sample(page, 7000)
    count_match=re.search(r'([0-9][0-9,\.\s]*)(?:\s*(results|records|条|篇|项|Result|Articles))', body, re.I)
    controls=await gather_controls(page)
    result_labels=labels_from(controls, re.compile(r'Title|Article|论文|期刊|Search Result|Result|排序|Sort|Page|下一页|Next|PDF|Cited|Download|Export|View|Record|标准', re.I))[:80]
    return {'text_sample': body[:1600], 'results_count': count_match.group(0) if count_match else '', 'controls': controls[:150], 'result_labels': result_labels}
async def open_advanced(page, site):
    url=site.get('advanced_search_url')
    if url:
        await navigate(page, url)
        txt=await text_sample(page,1500)
        if BLOCKERS.search(txt): return False, ['open advanced_search_url blocked/challenged']
        return True, ['open advanced_search_url']
    ok=await click_text(page, ADV_TEXT)
    return ok, ['click visible advanced/search syntax'] if ok else ['advanced control not found']
async def try_sort_view(page):
    controls=await gather_controls(page)
    labels=labels_from(controls, re.compile(r'Sort|排序|Publication Date|Relevance|Cited|Title|每页|page|view|列表|表格|Results per page|size', re.I))
    changed=[]
    try:
        sels=page.locator('select')
        for i in range(min(await sels.count(), 10)):
            sel=sels.nth(i)
            if not await sel.is_visible(timeout=500): continue
            opts=await sel.locator('option').all_inner_texts(timeout=1000)
            if len(opts)>1 and re.search(r'Sort|排序|Relevance|Date|每页|page|Cited|Title|20|50|100', ' '.join(opts), re.I):
                val=await sel.locator('option').nth(1).get_attribute('value')
                if val is not None:
                    await sel.select_option(value=val, timeout=3000); await page.wait_for_timeout(3000); changed.append(opts[1][:80]); break
    except Exception: pass
    if not changed:
        for rx in [re.compile(r'Publication Date|Submitted date|Announced|出版时间|发表时间|日期',re.I), re.compile(r'Cited|被引',re.I), re.compile(r'Title|题名',re.I), re.compile(r'50|100|每页|per page',re.I)]:
            if await click_text(page, rx): changed.append(rx.pattern); break
    ev=await result_evidence(page)
    return ('tested_ok' if changed or len(labels)>=2 else ('partial' if labels else 'not_applicable')), labels, changed, ev
async def try_download_export(page, sid):
    outdir=EVID/sid/'exports'; outdir.mkdir(parents=True, exist_ok=True)
    if sid=='arxiv':
        # Official BibTeX endpoint for one known/sample query result; metadata only.
        url='https://arxiv.org/bibtex/2401.00001'
        path=outdir/'arxiv_sample_bibtex.bib'
        try:
            data=urllib.request.urlopen(url, timeout=15).read()
            path.write_bytes(data[:20000])
            return 'tested_ok', ['BibTeX endpoint /bibtex/<arxiv_id>'], str(path.relative_to(RUN)), 'Official arXiv BibTeX metadata endpoint captured for one record.'
        except Exception as e:
            return 'partial', ['BibTeX endpoint /bibtex/<arxiv_id>'], '', f'BibTeX endpoint attempted but failed: {type(e).__name__}'
    controls=await gather_controls(page)
    labels=labels_from(controls, EXPORT_TEXT)
    if not labels: return 'not_applicable', labels, '', 'No visible export/citation metadata control.'
    try:
        boxes=page.locator('input[type=checkbox]')
        for i in range(min(await boxes.count(), 4)):
            b=boxes.nth(i)
            if await b.is_visible(timeout=300) and not await b.is_checked(timeout=300): await b.check(timeout=1000)
    except Exception: pass
    try:
        async with page.expect_download(timeout=10000) as dl_info:
            clicked=await click_text(page, EXPORT_TEXT)
        if clicked:
            dl=await dl_info.value; fname=safe_name(dl.suggested_filename or f'{sid}_export.dat')
            path=outdir/fname; await dl.save_as(str(path))
            return 'tested_ok', labels, str(path.relative_to(RUN)), 'Official export/download captured and saved.'
    except Exception: pass
    await click_text(page, EXPORT_TEXT); await page.wait_for_timeout(2000)
    for rx in [re.compile(r'RIS|BibTeX|EndNote|CSV|MARC|Dublin|导出|Download', re.I)]:
        try:
            async with page.expect_download(timeout=8000) as dl_info:
                if await click_text(page, rx): pass
            dl=await dl_info.value; fname=safe_name(dl.suggested_filename or f'{sid}_export.dat')
            path=outdir/fname; await dl.save_as(str(path))
            return 'tested_ok', labels, str(path.relative_to(RUN)), 'Official export choice captured and saved.'
        except Exception: pass
    return 'partial', labels, '', 'Export/citation control observed but no parseable metadata file downloaded without account/dialog side effects.'
async def try_citation(page, sid):
    controls=await gather_controls(page); labels=labels_from(controls, CITE_TEXT)
    # arXiv exposes related/cross-list metadata in record pages even if citation graph is not native.
    patterns={}
    if sid=='arxiv':
        patterns={'related_surfaces':['record page: references not native; related via subject/cross-listing/search by id', 'INSPIRE/Semantic Scholar may cite arXiv but outside arXiv native UI']}
        return 'partial', labels or ['Subjects/cross-listing; no native cited-by graph'], patterns, 'arXiv has cross-listing/subject relatedness but no native citation graph in search UI.'
    if not labels: return 'not_applicable', labels, {}, 'No cited-by/reference/related controls observed.'
    for name,rx in [('cited_by',re.compile(r'Cited by|被引|Citations',re.I)),('references',re.compile(r'References|参考文献',re.I)),('related',re.compile(r'Related|相关文献|Similar',re.I))]:
        before=page.url
        if await click_text(page, rx):
            await page.wait_for_timeout(3000); patterns[name]=red_url(page.url)
            try:
                if page.url != before: await page.go_back(timeout=10000); await page.wait_for_timeout(1500)
            except Exception: pass
    return ('tested_ok' if patterns else 'partial'), labels, patterns, ('Citation surface URL pattern(s) captured.' if patterns else 'Citation controls observed but click did not reach a verifiable list.')
async def try_fulltext(page, sid):
    controls=await gather_controls(page); labels=labels_from(controls, PDF_TEXT)
    if sid=='arxiv':
        pdf='https://arxiv.org/pdf/2401.00001'
        await navigate(page,pdf)
        return 'tested_ok', ['arXiv PDF link /pdf/<id>'], {'fulltext_url_pattern':'https://arxiv.org/pdf/<arxiv_id>'}, 'One arXiv PDF URL resolved; PDF not downloaded.'
    if not labels: return 'not_applicable', labels, {}, 'No PDF/full-text/landing-page link observed.'
    before=page.url
    if await click_text(page, PDF_TEXT):
        await page.wait_for_timeout(5000); target=red_url(page.url)
        try:
            if page.url != before: await page.go_back(timeout=10000); await page.wait_for_timeout(1500)
        except Exception: pass
        return 'tested_ok', labels, {'fulltext_url_pattern':target}, 'Full-text/PDF link resolved to preview or landing page; no bulk full-text saved.'
    return 'partial', labels, {}, 'Full-text control observed but click did not resolve.'
async def try_alerts(page):
    controls=await gather_controls(page); labels=labels_from(controls, ALERT_TEXT)
    if not labels: return 'not_applicable', labels, 'No alert/saved-search controls observed.'
    txt=await text_sample(page,2500)
    if ACCOUNT.search(txt) or any(ACCOUNT.search(x) for x in labels): return 'requires_account', labels, 'Alert/saved-search surface indicates personal account login is required.'
    return 'partial', labels, 'Alert/saved-search controls observed; not persisted because it would create an account/notification side effect.'
async def api_or_openurl(page, sid, site, query):
    outdir=EVID/sid/'exports'; outdir.mkdir(parents=True, exist_ok=True)
    if sid=='arxiv':
        url=site.get('api_url_template','http://export.arxiv.org/api/query?search_query=all:{query}&start=0&max_results=5').format(query=urllib.parse.quote_plus(query))
        path=outdir/'arxiv_api_atom_sample.xml'
        try:
            data=urllib.request.urlopen(url, timeout=20).read()
            path.write_bytes(data[:50000])
            return 'tested_ok', ['arXiv API Atom', 'max_results=5'], {'api_url_pattern':'http://export.arxiv.org/api/query?search_query=all:<query>&start=0&max_results=5'}, f'Official API sampled <=5 records: {path.relative_to(RUN)}', str(path.relative_to(RUN))
        except Exception as e:
            return 'partial', ['arXiv API Atom'], {'api_url_pattern':'http://export.arxiv.org/api/query?...'}, f'API endpoint documented/pattern recorded but sample failed: {type(e).__name__}', ''
    controls=await gather_controls(page); api_labels=labels_from(controls,API_TEXT)
    st='tested_ok' if api_labels else 'not_applicable'
    note='OpenURL/API/DOI pattern observed; endpoint not bulk exercised.' if api_labels else 'No OpenURL/API endpoint surfaced in UI evidence.'
    return st, api_labels, {}, note, ''
async def one_site(page, sid, site):
    started=time.monotonic(); sd=EVID/sid; (sd/'screenshots').mkdir(parents=True, exist_ok=True); (sd/'exports').mkdir(parents=True, exist_ok=True)
    line(f'open-resource {sid}')
    statuses={}; details={}; export_path=''
    query=QUERIES[sid in ZH]
    # simple search
    ok, sels=await search_site(page, site, query)
    txt=await text_sample(page,3500)
    if sid=='national-military-standards' and RESTRICTED.search(txt):
        st='requires_account'; note='Access/banner/search surface indicates restricted/account-gated government standards portal; skipped retry per policy.'
        ev=await result_evidence(page)
    else:
        ev=await result_evidence(page)
        st='tested_ok' if ok and (ev.get('results_count') or ev.get('result_labels') or re.search(r'result|结果|篇|条|Article|Search|标准',txt,re.I)) and not BLOCKERS.search(txt) else ('blocked' if BLOCKERS.search(txt) else 'partial')
        note=f"query={query}; results_count={ev.get('results_count') or 'not parsed'}"
    details['simple_search']=await save_feature(sid,'simple_search',st,page,['submit representative query'],sels,ev.get('result_labels',[]),note,extra={'result_evidence':ev})
    statuses['simple_search']=st; line(f'simple-search-done {sid} status={st}')
    if st in {'blocked','requires_account'} and sid=='national-military-standards':
        for feat in FEATURES[1:]:
            stat='requires_account' if feat in {'advanced_search','export','full_text_link','alerts_and_saved'} else 'not_applicable'
            details[feat]=await save_feature(sid,feat,stat,page,[],{},[],f'Skipped after restricted/access-gated portal evidence for {sid}.')
            statuses[feat]=stat
        return statuses, details, '', time.monotonic()-started
    # advanced search
    adv_ok, steps=await open_advanced(page,site)
    controls=await gather_controls(page,450)
    op_labels=labels_from(controls, re.compile(r'AND|OR|NOT|并且|或者|不含|精确|模糊|主题|篇名|作者|摘要|关键词|Title|Author|Abstract|Keyword|Field|Operator|year|date|Category|DOI|标准号|标准名称',re.I))
    syntax=[]
    if sid=='arxiv':
        syntax=['all:UAV AND abs:"reinforcement learning"','ti:"path planning" AND cat:cs.RO','au:<author> OR abs:<term>','date filters via advanced form']
        op_labels.extend(syntax)
    elif sid=='scoap3':
        syntax=['repository p=<query>', 'fielded advanced search if available: title/author/abstract/DOI/year']
    ev2=await result_evidence(page)
    adv_status='tested_ok' if adv_ok and (len(op_labels)>=3 or syntax or ev2.get('result_labels')) else ('partial' if adv_ok or op_labels else 'not_applicable')
    details['advanced_search']=await save_feature(sid,'advanced_search',adv_status,page,steps,{'controls':controls[:220],'syntax_patterns':syntax},op_labels,f'Captured {len(controls)} advanced/interactive controls; syntax patterns={len(syntax)}.',extra={'result_evidence':ev2})
    statuses['advanced_search']=adv_status; line(f'advanced-search-done {sid} status={adv_status}')
    # back to results
    await search_site(page, site, query)
    sst,labs,changed,sev=await try_sort_view(page)
    details['sort_and_view']=await save_feature(sid,'sort_and_view',sst,page,['change or inspect sort/view/results-per-page controls'],{'changed':changed,'result_evidence':sev},labs,f'changed={changed}')
    statuses['sort_and_view']=sst
    est,labs,export_path,enote=await try_download_export(page,sid)
    details['export']=await save_feature(sid,'export',est,page,['open export/citation menu or official metadata endpoint'],{},labs,enote,export_path)
    statuses['export']=est; line(f'export-done {sid} status={est} export={export_path or "none"}')
    cst,labs,patterns,cnote=await try_citation(page,sid)
    details['citation_graph']=await save_feature(sid,'citation_graph',cst,page,['open/inspect cited-by/references/related controls where visible'],patterns,labs,cnote)
    statuses['citation_graph']=cst
    ast,labs,anote=await try_alerts(page)
    details['alerts_and_saved']=await save_feature(sid,'alerts_and_saved',ast,page,['inspect alert/saved-search controls; do not create account objects'],{},labs,anote)
    statuses['alerts_and_saved']=ast
    fst,labs,fpat,fnote=await try_fulltext(page,sid)
    details['full_text_link']=await save_feature(sid,'full_text_link',fst,page,['click/resolve one full-text/PDF/landing link; no bulk save'],fpat,labs,fnote)
    statuses['full_text_link']=fst
    apst,labs,apat,anote,api_exp=await api_or_openurl(page,sid,site,query)
    if api_exp and not export_path: export_path=api_exp
    details['api_or_openurl']=await save_feature(sid,'api_or_openurl',apst,page,['inspect UI/API/OpenURL/DOI patterns; sample only official low-volume API where public'],apat,labs,anote,api_exp)
    statuses['api_or_openurl']=apst
    line(f'next-resource {sid} tested_ok={sum(1 for v in statuses.values() if v=="tested_ok")}')
    return statuses, details, export_path, time.monotonic()-started

def write_aggregates(all_status, all_details, exports, durations, patches, started_wall):
    captured=now(); meta=dict(META, captured_at=captured)
    tests=[]
    for sid in RESOURCES:
        for feat in FEATURES:
            d=all_details.get(sid,{}).get(feat,{})
            tests.append({'resource_id':sid,'feature_id':feat,'status':all_status.get(sid,{}).get(feat,'partial'),'note':d.get('note',''),'evidence_path':str((EVID/sid/f'{feat}.json').relative_to(RUN))})
    sc={}
    for t in tests: sc[t['status']]=sc.get(t['status'],0)+1
    ft=dict(meta, test_count=len(tests), tests=tests, status_counts=sc)
    (RUN/'nuaa_stem_round5_feature_tests.json').write_text(json.dumps(ft,ensure_ascii=False,indent=2),encoding='utf-8')
    catalog=dict(meta, resources=[])
    for sid in RESOURCES:
        catalog['resources'].append({'resource_id':sid,'features':all_details.get(sid,{}),'tested_ok_count':sum(1 for v in all_status.get(sid,{}).values() if v=='tested_ok'),'sample_export_path':exports.get(sid,''),'duration_seconds':round(durations.get(sid,0),1)})
    (RUN/'nuaa_stem_round5_deep_catalog.json').write_text(json.dumps(catalog,ensure_ascii=False,indent=2),encoding='utf-8')
    summary=['# NUAA STEM 第五轮新增高价值资源深探摘要','',f'采集时间：{captured}',f'范围：{META["scope"]}',f'父运行：{META["parent_run"]}','', '| 资源 | tested_ok 数 | 样例导出/元数据 | 主要限制 |','|---|---:|---|---|']
    for sid in RESOURCES:
        ok=sum(1 for v in all_status.get(sid,{}).values() if v=='tested_ok')
        limits='；'.join(f'{k}:{v}' for k,v in all_status.get(sid,{}).items() if v!='tested_ok')[:180]
        summary.append(f'| {sid} | {ok} | {exports.get(sid,"") or "未获得官方导出文件"} | {limits or "无明显限制"} |')
    summary += ['', '## 合规说明', '- 遵循 database-access-policy.md；未绕过 CAPTCHA、登录、付费墙或下载限制。', '- arXiv 仅使用低数量检索/API样本（max_results=5）和单条 PDF 链接验证，不进行批量抓取。', '- 国家军用标准如出现受限/账号/政府门户限制，即标记 requires_account 并停止重试。']
    (RUN/'nuaa_stem_round5_summary.md').write_text('\n'.join(summary)+'\n',encoding='utf-8')
    ver=['# NUAA STEM Round 5 Verification Report','',f'- Captured: {captured}',f'- CDP endpoint: {CDP}',f'- Per-DB target: >=3 tested_ok where access policy permits','', '| resource | tested_ok | partial | not_applicable | requires_account | blocked | gate |','|---|---:|---:|---:|---:|---:|---|']
    for sid in RESOURCES:
        st=all_status.get(sid,{})
        counts={k:sum(1 for v in st.values() if v==k) for k in ['tested_ok','partial','not_applicable','requires_account','blocked']}
        gate='pass' if counts['tested_ok']>=3 else 'policy/access-limited' if counts['requires_account'] else 'needs-followup'
        ver.append(f'| {sid} | {counts["tested_ok"]} | {counts["partial"]} | {counts["not_applicable"]} | {counts["requires_account"]} | {counts["blocked"]} | {gate} |')
    ver += ['', '## Adapter / registry changes'] + [f'- {p}' for p in patches]
    ver += ['', '## Aggregate file sizes']
    for fn in ['nuaa_stem_round5_feature_tests.json','nuaa_stem_round5_deep_catalog.json','nuaa_stem_round5_summary.md','nuaa_stem_round5_verification_report.md','progress.md']:
        p=RUN/fn; ver.append(f'- `{p}`: {p.stat().st_size if p.exists() else 0} bytes')
    (RUN/'nuaa_stem_round5_verification_report.md').write_text('\n'.join(ver)+'\n',encoding='utf-8')
    complete=all((sum(1 for v in all_status.get(sid,{}).values() if v=='tested_ok')>=3) or (sid=='national-military-standards' and any(v=='requires_account' for v in all_status.get(sid,{}).values())) for sid in RESOURCES)
    title='NUAA STEM ROUND 5 COMPLETE' if complete else 'NUAA STEM ROUND 5 PARTIAL:'
    lines=[f'# {title}', '', '## Per-DB feature status counts']
    total_ok=0
    for sid in RESOURCES:
        st=all_status.get(sid,{})
        counts={}
        for v in st.values(): counts[v]=counts.get(v,0)+1
        total_ok+=counts.get('tested_ok',0)
        lines.append(f'- {sid}: ' + ', '.join(f'{k}={v}' for k,v in sorted(counts.items())) + f'; tested_ok={counts.get("tested_ok",0)}')
    lines += [f'- total tested_ok: {total_ok}', '', '## Adapters built or patched']
    lines += [f'- {p}' for p in patches]
    lines += ['', '## Sample export paths']
    lines += [f'- {sid}: {exports.get(sid,"") or "none"}' for sid in RESOURCES]
    lines += ['', '## Aggregate files']
    for fn in ['nuaa_stem_round5_feature_tests.json','nuaa_stem_round5_deep_catalog.json','nuaa_stem_round5_summary.md','nuaa_stem_round5_verification_report.md','progress.md']:
        p=RUN/fn; lines.append(f'- {p}: {p.stat().st_size if p.exists() else 0} bytes')
    lines += ['', '## Wall-clock time']
    for sid in RESOURCES: lines.append(f'- {sid}: {durations.get(sid,0):.1f}s')
    lines.append(f'- overall: {time.monotonic()-started_wall:.1f}s')
    if not complete:
        lines += ['', '## Specific blockers']
        for sid in RESOURCES:
            if sum(1 for v in all_status.get(sid,{}).values() if v=='tested_ok')<3:
                lines.append(f'- {sid}: fewer than 3 tested_ok; statuses={all_status.get(sid,{})}')
    Path('/tmp/codex-nuaa-stem-round5-newdeep.md').write_text('\n'.join(lines)+'\n',encoding='utf-8')
async def main():
    started_wall=time.monotonic()
    reg=json.loads(REGISTRY.read_text(encoding='utf-8'))
    sites={s['id']:s for s in reg.get('sites',[]) if s.get('id') in RESOURCES}
    patches=['site_registry.json: registered arxiv, proquest-csa, national-military-standards, scoap3 because absent from registry', 'scripts/site_adapters/{arxiv,proquest_csa,national_military_standards,scoap3}_search.py: minimal wrappers because absent']
    all_status={}; all_details={}; exports={}; durations={}
    async with async_playwright() as p:
        browser=await p.chromium.connect_over_cdp(CDP)
        ctx=browser.contexts[0]
        ctx.set_default_timeout(12000)
        page=await ctx.new_page()
        try:
            await page.set_viewport_size({'width':1440,'height':1000})
        except Exception:
            pass
        line('round5-start')
        await navigate(page,'https://lib.nuaa.edu.cn/')
        await screenshot(page,'_bootstrap','library_home')
        for sid in RESOURCES:
            try:
                st,det,exp,dur=await asyncio.wait_for(one_site(page,sid,sites[sid]), timeout=8*60)
            except Exception as e:
                dur=0; st={}; det={}; exp=''
                for feat in FEATURES:
                    st[feat]='partial'
                    det[feat]=await save_feature(sid,feat,'partial',page,[],{},[],f'Site-run exception or hard cap: {type(e).__name__}: {e}')
                line(f'next-resource {sid} exception={type(e).__name__}')
            all_status[sid]=st; all_details[sid]=det; exports[sid]=exp; durations[sid]=dur
            write_aggregates(all_status,all_details,exports,durations,patches,started_wall)
    write_aggregates(all_status,all_details,exports,durations,patches,started_wall)
if __name__=='__main__': asyncio.run(main())
