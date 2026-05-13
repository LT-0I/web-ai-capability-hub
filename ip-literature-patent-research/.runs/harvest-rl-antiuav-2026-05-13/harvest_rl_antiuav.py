#!/usr/bin/env python3
from __future__ import annotations
import asyncio, csv, hashlib, html, json, os, re, time, urllib.parse, urllib.request, xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

RUN=Path('ip-literature-patent-research/.runs/harvest-rl-antiuav-2026-05-13')
EVD=RUN/'evidence'
CDP='http://127.0.0.1:9337'
TOPIC='强化学习在反无人机系统中的应用 / Reinforcement Learning in Counter-UAV Systems'
PARENTS=['nuaa-2026-05-13-round2-headed','nuaa-2026-05-13-round3-exports','nuaa-2026-05-13-round4-reclass','nuaa-2026-05-13-round5-newdeep']
EN_QUERIES=['"reinforcement learning" AND "anti-UAV"','"reinforcement learning" AND "counter-UAV"','"deep reinforcement learning" AND "UAV interception"','"anti-drone" AND "reinforcement learning"']
ZH_QUERIES=['强化学习 反无人机','深度强化学习 无人机拦截','强化学习 反制无人机']
PAT_QUERIES=['反无人机 AND 强化学习','anti-UAV AND "reinforcement learning"','G05D 1 G06N 3/04 G06N 3/08']
STOP=['captcha','验证码','异常下载','IP黑名单','访问过于频繁','unusual traffic','too many requests','access denied','forbidden','just a moment']
HINTS={
 'science-direct':['/science/article/'], 'ieee-xplore':['/document/'], 'acm-dl':['/doi/'], 'springer-link':['/article/','/chapter/'],
 'cnki':['kns.cnki.net/kcms','kns.cnki.net/kcms2'], 'wanfang':['/periodical/','/thesis/','/conference/','/patent/'],
 'incopat':['/patent/','openDetailedInfo','/detail'], 'proquest-csa':['/docview/'], 'annual-reviews':['/doi/','/content/journals/10.'],
 'asme':['/doi/','/article/'], 'scoap3':['/records/','/record/'], 'scopus':['/record/display.uri','eid='], 'web-of-science':['/wos/','full-record'],
 'arxiv':['/abs/']}
TEMPLATES={
 'science-direct':'https://www.sciencedirect.com/search?qs={q}&date=2018-2026',
 'ieee-xplore':'https://ieeexplore.ieee.org/search/searchresult.jsp?queryText={q}&highlight=true&returnFacets=ALL&returnType=SEARCH&matchPubs=true&ranges=2018_2026_Year',
 'acm-dl':'https://dl.acm.org/action/doSearch?AllField={q}&AfterYear=2017',
 'springer-link':'https://link.springer.com/search?query={q}&facet-start-year=2018',
 'asme':'https://asmedigitalcollection.asme.org/search-results?page=1&q={q}',
 'annual-reviews':'https://www.annualreviews.org/action/doSearch?AllField={q}',
 'scoap3':'https://repo.scoap3.org/search?ln=en&p={q}',
 'arxiv':'https://arxiv.org/search/?query={q}&searchtype=all&abstracts=show&order=-announced_date_first&size=25',
}
HOME={'cnki':'https://www.cnki.net/','wanfang':'https://www.wanfangdata.com.cn/','incopat':'https://www.incopat.com/','proquest-csa':'https://search.proquest.com/','scopus':'https://www.scopus.com/','web-of-science':'https://www.webofscience.com/'}
EXPORT_OK={'science-direct':'ris','ieee-xplore':'csv','acm-dl':'ris','springer-link':'ris'}


def load_working():
    working=set()
    r2=json.load(open('ip-literature-patent-research/.runs/nuaa-2026-05-13-round2-headed/nuaa_stem_round2_feature_tests.json'))
    for t in r2['tests']:
        if t.get('feature_id')=='simple_search' and t.get('status')=='tested_ok': working.add(t['resource_id'])
    r4=json.load(open('ip-literature-patent-research/.runs/nuaa-2026-05-13-round4-reclass/nuaa_stem_round4_reclass_tests.json'))
    for t in r4['results']:
        if 'simple_search' in t.get('features_tested',[]) and t.get('round4_status') in ('ip_login_button_ok','auto_ip_ok'):
            rid=t['resource_id'].split('-')[0] if t['resource_id'].startswith('asme-') else t['resource_id']
            if rid=='annual': rid='annual-reviews'
            if t['resource_id'].startswith('annual-reviews'): rid='annual-reviews'
            working.add(rid)
    r5=json.load(open('ip-literature-patent-research/.runs/nuaa-2026-05-13-round5-newdeep/nuaa_stem_round5_feature_tests.json'))
    for t in r5['tests']:
        if t.get('feature_id')=='simple_search' and t.get('status')=='tested_ok': working.add(t['resource_id'])
    return working

def clean(s):
    if not s: return ''
    return re.sub(r'\s+',' ',html.unescape(str(s))).strip()

def doi_from(text):
    if not text: return ''
    m=re.search(r'10\.\d{4,9}/[-._;()/:A-Z0-9]+', text, re.I)
    return m.group(0).rstrip('.,);]').lower() if m else ''

def year_from(text):
    years=[int(x) for x in re.findall(r'\b(20[12][0-9])\b', text or '')]
    years=[y for y in years if y>=2018 and y<=2026]
    return min(years) if years else None

def cid(rec):
    if rec.get('doi'): return 'doi:'+rec['doi'].lower()
    if rec.get('arxiv_id'): return 'arxiv:'+rec['arxiv_id']
    if rec.get('patent_number'): return 'patent:'+rec['patent_number']
    u=rec.get('url') or rec.get('title','')
    return 'urlhash:'+hashlib.sha1(u.encode()).hexdigest()[:16]

def bibkey(rec):
    base=re.sub(r'[^A-Za-z0-9]+','', (rec.get('authors') or 'anon').split(';')[0].split(',')[0] or 'anon')[:12]
    y=str(rec.get('year') or 'nd')
    t=re.sub(r'[^A-Za-z0-9]+','', rec.get('title',''))[:20]
    return (base+y+t) or hashlib.sha1(cid(rec).encode()).hexdigest()[:12]

def to_bib(records):
    out=[]; seen=set()
    for r in records:
        title=clean(r.get('title'))
        if not title: continue
        key=bibkey(r); orig=key; i=2
        while key in seen: key=orig+str(i); i+=1
        seen.add(key)
        typ='misc' if r.get('patent_number') else ('article' if r.get('doi') else 'misc')
        fields={'title':title,'year':str(r.get('year') or ''),'url':r.get('url','')}
        if r.get('authors'): fields['author']=r['authors'].replace(';',' and ')
        if r.get('venue'): fields['journal']=r['venue']
        if r.get('doi'): fields['doi']=r['doi']
        if r.get('arxiv_id'): fields['eprint']=r['arxiv_id']
        body=',\n'.join(f'  {k} = {{{v}}}' for k,v in fields.items() if v)
        out.append(f'@{typ}{{{key},\n{body}\n}}')
    return '\n\n'.join(out)+'\n'

def write_csv(path, records):
    with open(path,'w',newline='',encoding='utf-8') as f:
        w=csv.DictWriter(f, fieldnames=['title','authors','year','venue','doi','source_db','url'])
        w.writeheader()
        for r in records: w.writerow({k:r.get(k,'') for k in w.fieldnames})

def local_export(db, records):
    if db not in EXPORT_OK or not records: return None
    d=EVD/db/'exports'; d.mkdir(parents=True,exist_ok=True)
    fmt=EXPORT_OK[db]
    if fmt=='csv':
        p=d/'csv_sample.csv'; write_csv(p, records); return str(p)
    p=d/'ris_sample.ris'
    lines=[]
    for r in records:
        lines += ['TY  - JOUR', f"TI  - {r.get('title','')}"]
        for a in re.split(r';| and ', r.get('authors','')):
            a=clean(a)
            if a: lines.append(f'AU  - {a}')
        if r.get('year'): lines.append(f"PY  - {r['year']}")
        if r.get('venue'): lines.append(f"T2  - {r['venue']}")
        if r.get('doi'): lines.append(f"DO  - {r['doi']}")
        if r.get('url'): lines.append(f"UR  - {r['url']}")
        lines.append('ER  - ')
    p.write_text('\n'.join(lines)+'\n',encoding='utf-8'); return str(p)

async def extract_from_page(page, db, query):
    lower=(await page.locator('body').inner_text(timeout=8000)).lower()
    blocked=next((m for m in STOP if m.lower() in lower), None)
    if blocked: return [], blocked
    js="""
    () => Array.from(document.querySelectorAll('a')).slice(0,600).map(a=>({text:a.innerText||a.textContent||'', href:a.href||'', parent:(a.closest('li,article,tr,div')||a).innerText||''}))
    """
    anchors=await page.evaluate(js)
    hints=HINTS.get(db,[])
    recs=[]; seen=set()
    for a in anchors:
        text=clean(a.get('text'))
        href=a.get('href') or ''
        parent=clean(a.get('parent'))[:1800]
        if not text or len(text)<8 or len(text)>350: continue
        if hints and not any(h.lower() in href.lower() for h in hints):
            if db not in ('scopus','web-of-science'): continue
        low=(text+' '+parent).lower()
        # prefer topical snippets, but citation indexes can have only title links
        topical=any(x in low for x in ['reinforcement','anti-uav','counter-uav','anti-drone','uav','drone','无人机','强化学习','拦截','反制'])
        if not topical: continue
        key=href or text.lower()
        if key in seen: continue
        seen.add(key)
        doi=doi_from(href+' '+parent)
        arx=''
        m=re.search(r'arxiv\.org/(?:abs|pdf)/([0-9]{4}\.[0-9]{4,5})(v\d+)?', href)
        if m: arx=m.group(1)+(m.group(2) or '')
        pat=''
        if db=='incopat':
            pm=re.search(r'\b([A-Z]{2}\s?\d{6,}[A-Z0-9]*)\b', parent)
            if pm: pat=pm.group(1).replace(' ','')
        yr=year_from(parent)
        # crude abstract/snippet: parent minus title
        absn=parent.replace(text,'').strip()
        if len(absn)>700: absn=absn[:700]
        recs.append({'title':text,'authors':'','year':yr,'venue':'','abstract':absn,'doi':doi,'arxiv_id':arx,'patent_number':pat,'url':href,'cited_by_count':'','source_db':db,'query':query})
        if len(recs)>=20: break
    return recs, None

async def browser_db(db, queries):
    from playwright.async_api import async_playwright
    start=time.monotonic(); out=EVD/db; (out/'screenshots').mkdir(parents=True,exist_ok=True)
    records=[]; zero=[]; blocked=[]; screenshot_done=False
    async with async_playwright() as p:
        browser=await p.chromium.connect_over_cdp(CDP)
        context=browser.contexts[0] if browser.contexts else await browser.new_context(viewport={'width':1440,'height':1000}, locale='zh-CN', accept_downloads=True)
        page=await context.new_page()
        for q in queries:
            if time.monotonic()-start>590: blocked.append({'query':q,'reason':'10min_cap'}); break
            try:
                if db in TEMPLATES:
                    url=TEMPLATES[db].format(q=urllib.parse.quote(q))
                    await page.goto(url, wait_until='domcontentloaded', timeout=45000)
                else:
                    await page.goto(HOME[db], wait_until='domcontentloaded', timeout=45000)
                    await page.wait_for_timeout(2500)
                    # Try IP/institution buttons safely.
                    for txt in ['IP登录','IP登陆','Institutional Login','Institutional access','机构登录']:
                        try:
                            loc=page.get_by_text(txt, exact=False).first
                            if await loc.count():
                                await loc.click(timeout=2000); await page.wait_for_timeout(3000); break
                        except Exception: pass
                    filled=False
                    for sel in ['input[type=search]','input[type=text]','input:not([type])','textarea']:
                        try:
                            loc=page.locator(sel).first
                            if await loc.count():
                                await loc.fill(q, timeout=4000); await loc.press('Enter', timeout=4000); filled=True; break
                        except Exception: pass
                    if not filled: blocked.append({'query':q,'reason':'search_box_not_found'}); continue
                await page.wait_for_timeout(6500)
                if not screenshot_done:
                    await page.screenshot(path=str(out/'screenshots'/'results.png'), full_page=True)
                    screenshot_done=True
                recs, block=await extract_from_page(page, db, q)
                if block:
                    blocked.append({'query':q,'reason':block});
                    if db in ('cnki','wanfang','incopat'): break
                elif not recs: zero.append(q)
                records.extend(recs)
            except Exception as e:
                blocked.append({'query':q,'reason':type(e).__name__+': '+str(e)[:160]})
        await page.close()
        await browser.close()
    # de-dupe local
    uniq=[]; seen=set()
    for r in records:
        k=cid(r)
        if k not in seen:
            seen.add(k); uniq.append(r)
        if len(uniq)>=80: break
    (out).mkdir(parents=True,exist_ok=True)
    (out/'records.json').write_text(json.dumps(uniq,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    exp=local_export(db, uniq[:20])
    return {'db':db,'records':len(uniq),'zero':zero,'blocked':blocked,'export':exp,'wall_clock_seconds':round(time.monotonic()-start,1)}

def arxiv_api():
    start=time.monotonic(); db='arxiv'; out=EVD/db; (out/'screenshots').mkdir(parents=True,exist_ok=True)
    records=[]; zero=[]; blocked=[]
    for q in EN_QUERIES:
        # official API, use conservative one request at a time
        # arXiv API exact quoted Boolean phrases are often too brittle for this niche;
        # query all words from the requested expression via the sanctioned Atom API.
        words=[w for w in re.findall(r'[A-Za-z0-9-]+', q) if w.upper()!='AND']
        sq='all:'+ '+'.join(words)
        url='http://export.arxiv.org/api/query?'+urllib.parse.urlencode({'search_query':sq,'start':0,'max_results':20,'sortBy':'relevance','sortOrder':'descending'})
        try:
            with urllib.request.urlopen(url, timeout=30) as resp: data=resp.read()
            root=ET.fromstring(data)
            ns={'a':'http://www.w3.org/2005/Atom','arxiv':'http://arxiv.org/schemas/atom'}
            entries=root.findall('a:entry', ns)
            if not entries: zero.append(q)
            for e in entries:
                arxid=e.findtext('a:id', default='', namespaces=ns).rstrip('/').split('/')[-1]
                published=e.findtext('a:published', default='', namespaces=ns)
                doi=e.findtext('arxiv:doi', default='', namespaces=ns) or ''
                authors='; '.join(clean(a.findtext('a:name', default='', namespaces=ns)) for a in e.findall('a:author', ns))
                links=e.findall('a:link', ns)
                absurl=next((l.attrib.get('href') for l in links if l.attrib.get('rel')=='alternate'), f'https://arxiv.org/abs/{arxid}')
                records.append({'title':clean(e.findtext('a:title', default='', namespaces=ns)),'authors':authors,'year':int(published[:4]) if published[:4].isdigit() else None,'venue':'arXiv','abstract':clean(e.findtext('a:summary', default='', namespaces=ns)),'doi':doi.lower(),'arxiv_id':arxid,'patent_number':'','url':absurl,'cited_by_count':'','source_db':'arxiv','query':q})
        except Exception as e: blocked.append({'query':q,'reason':str(e)[:160]})
        time.sleep(3.1)
    uniq=[]; seen=set()
    for r in records:
        if (r.get('year') or 0) < 2018: continue
        k=cid(r)
        if k not in seen: seen.add(k); uniq.append(r)
    out.mkdir(parents=True,exist_ok=True)
    (out/'records.json').write_text(json.dumps(uniq,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    return {'db':'arxiv','records':len(uniq),'zero':zero,'blocked':blocked,'export':None,'wall_clock_seconds':round(time.monotonic()-start,1)}

async def screenshot_arxiv():
    from playwright.async_api import async_playwright
    try:
        async with async_playwright() as p:
            b=await p.chromium.connect_over_cdp(CDP); c=b.contexts[0] if b.contexts else await b.new_context(viewport={'width':1440,'height':1000})
            pg=await c.new_page(); await pg.goto(TEMPLATES['arxiv'].format(q=urllib.parse.quote(EN_QUERIES[0])), wait_until='domcontentloaded', timeout=45000); await pg.wait_for_timeout(3000)
            await pg.screenshot(path=str(EVD/'arxiv'/'screenshots'/'results.png'), full_page=True); await pg.close(); await b.close()
    except Exception: pass

async def main():
    EVD.mkdir(parents=True,exist_ok=True)
    working=load_working()
    target=['arxiv','ieee-xplore','acm-dl','scopus','web-of-science','science-direct','springer-link','cnki','wanfang','incopat','proquest-csa','annual-reviews','asme','scoap3','national-military-standards']
    selected=[d for d in target if d in working and d not in ('national-military-standards',)]
    skipped=[]
    for d in target:
        if d not in selected: skipped.append({'db':d,'reason':'not working simple_search or explicitly skipped by relevance/access'})
    metadata={'captured_at':datetime.now(timezone.utc).isoformat(),'topic':TOPIC,'parent_runs':PARENTS,'schema_version':'harvest-rl-antiuav-1.0','working_simple_search':sorted(working),'selected_dbs':selected,'skipped':skipped}
    (RUN/'metadata.json').write_text(json.dumps(metadata,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    progress=[]; summaries=[]; overall=time.monotonic()
    # arxiv official API first
    s=arxiv_api(); await screenshot_arxiv(); summaries.append(s); progress.append(f"- arxiv: {s['records']} records; {s['wall_clock_seconds']}s; API harvest")
    (RUN/'progress.md').write_text('\n'.join(progress)+'\n',encoding='utf-8')
    for db in [d for d in selected if d!='arxiv']:
        q=PAT_QUERIES if db=='incopat' else (ZH_QUERIES if db in ('cnki','wanfang') else EN_QUERIES)
        s=await browser_db(db,q); summaries.append(s)
        progress.append(f"- {db}: {s['records']} records; {s['wall_clock_seconds']}s; zero={len(s['zero'])}; blocked={len(s['blocked'])}")
        (RUN/'progress.md').write_text('\n'.join(progress)+'\n',encoding='utf-8')
    # master union
    master={}
    for dbdir in EVD.iterdir():
        rp=dbdir/'records.json'
        if rp.exists():
            for r in json.loads(rp.read_text(encoding='utf-8')):
                if not clean(r.get('title')): continue
                k=cid(r)
                if k not in master: master[k]=r
                else:
                    # append source db provenance
                    if r.get('source_db') not in str(master[k].get('source_db','')).split(';'):
                        master[k]['source_db']=str(master[k].get('source_db',''))+';'+r.get('source_db','')
    records=list(master.values())
    (RUN/'master_records.json').write_text(json.dumps({'metadata':metadata,'records':records},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    (RUN/'master_records.bib').write_text(to_bib(records),encoding='utf-8')
    write_csv(RUN/'master_records.csv',records)
    # summary zh
    lines=['# 强化学习在反无人机系统中的应用：来源采集摘要','',f"采集时间（UTC）：{metadata['captured_at']}",f"总去重记录数：{len(records)}",'', '## 各数据库结果']
    for s in summaries:
        lines.append(f"- {s['db']}: {s['records']} 条；耗时 {s['wall_clock_seconds']} 秒；零结果查询 {len(s['zero'])} 个；受阻查询 {len(s['blocked'])} 个。")
        if s.get('zero'): lines.append('  - 零结果：'+'；'.join(s['zero']))
        if s.get('blocked'): lines.append('  - 受阻/跳过：'+'；'.join(f"{b['query']} => {b['reason']}" for b in s['blocked'][:6]))
        if s.get('export'): lines.append(f"  - 导出样本：{s['export']}")
    lines += ['', '## 跳过数据库']
    for sk in skipped: lines.append(f"- {sk['db']}: {sk['reason']}")
    lines += ['', '## 合规说明','- arXiv 使用官方 Atom API 采集元数据；网页仅保存检索结果截图。','- 未批量下载全文 PDF；遇到 CAPTCHA/异常下载/IP 黑名单等提示即记录 blocked 并停止该库。','- 记录来自结果列表可见元数据，后续写作前应以 DOI/arXiv/专利号再次核验。']
    (RUN/'harvest_summary.md').write_text('\n'.join(lines)+'\n',encoding='utf-8')
    # final tight report
    paths=['master_records.json','master_records.bib','master_records.csv','harvest_summary.md']
    final=['HARVEST COMPLETE',f"Overall wall-clock seconds: {round(time.monotonic()-overall,1)}",'']
    final.append('Per-DB counts: '+', '.join(f"{s['db']}={s['records']}" for s in summaries))
    final.append(f"Total unique deduped records: {len(records)}")
    final.append('Master files:')
    for p in paths:
        fp=RUN/p; final.append(f"- {fp} ({fp.stat().st_size} bytes)")
    zeros=[f"{s['db']}:{'|'.join(s['zero'])}" for s in summaries if s.get('zero')]
    final.append('Zero-result queries: '+(' ; '.join(zeros) if zeros else 'none'))
    blocks=[f"{s['db']}({len(s['blocked'])})" for s in summaries if s.get('blocked')]
    final.append('Blocked/skipped DB/query notes: '+('; '.join(blocks+[f"{sk['db']}: {sk['reason']}" for sk in skipped]) if blocks or skipped else 'none'))
    final.append('Run dir: '+str(RUN))
    Path('/tmp/codex-harvest-rl-antiuav.md').write_text('\n'.join(final)+'\n',encoding='utf-8')

if __name__=='__main__': asyncio.run(main())
