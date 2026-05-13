from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any


DEFAULT_REGISTRY = Path(__file__).resolve().parents[1] / "references" / "site_registry.json"


def now_stamp() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%S%z")


def load_registry(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def find_site(registry: dict[str, Any], site_id: str) -> dict[str, Any]:
    for site in registry["sites"]:
        if site["id"] == site_id:
            return site
    raise SystemExit(f"Unknown site id: {site_id}")


def split_keywords(raw: str) -> list[str]:
    return [part.strip() for part in re.split(r"[;,，；\n]+", raw or "") if part.strip()]


def query_string(keywords: list[str]) -> str:
    if not keywords:
        return ""
    if len(keywords) == 1:
        return keywords[0]
    return " AND ".join(f'"{kw}"' if " " in kw and not kw.startswith('"') else kw for kw in keywords)


def cmd_make_plan(args: argparse.Namespace) -> int:
    keywords = split_keywords(args.keywords)
    synonyms = split_keywords(args.synonyms or "")
    plan = {
        "created_at": now_stamp(),
        "mode": args.mode,
        "topic": args.topic,
        "keywords": keywords,
        "synonyms": synonyms,
        "query": args.query or query_string(keywords),
        "languages": split_keywords(args.languages or "zh,en"),
        "date_from": args.date_from,
        "date_to": args.date_to,
        "sites": split_keywords(args.sites or ""),
        "filters": {
            "authors_or_inventors": split_keywords(args.people or ""),
            "organizations_or_assignees": split_keywords(args.organizations or ""),
            "ipc_cpc": split_keywords(args.ipc_cpc or ""),
            "document_types": split_keywords(args.document_types or ""),
        },
        "evidence_required": [
            "database",
            "query",
            "filters",
            "timestamp",
            "result_count",
            "export_or_snapshot_path",
        ],
    }
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(plan, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({"status": "created", "plan": str(out)}, indent=2, ensure_ascii=False))
    return 0


def build_search_url(site: dict[str, Any], query: str) -> str | None:
    template = site.get("search_url_template")
    if not template:
        return None
    return str(template).format(query=urllib.parse.quote_plus(query))


def fetch_search_url(url: str, out_dir: Path, site_id: str) -> dict[str, Any]:
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "Mozilla/5.0 HBA-IP-Research-Search/1.0"},
    )
    started = time.monotonic()
    with urllib.request.urlopen(req, timeout=30) as resp:
        raw = resp.read(1_500_000)
        final_url = resp.geturl()
        ctype = resp.headers.get("content-type", "")
    digest = hashlib.sha256(raw).hexdigest()
    html_path = out_dir / f"{site_id}_{digest[:12]}.html"
    html_path.write_bytes(raw)
    return {
        "status": "saved",
        "site_id": site_id,
        "url": url,
        "final_url": final_url,
        "content_type": ctype,
        "sha256": digest,
        "size_bytes": len(raw),
        "elapsed_ms": int((time.monotonic() - started) * 1000),
        "html_path": str(html_path),
    }


async def browser_search(site: dict[str, Any], query: str, out_dir: Path) -> dict[str, Any]:
    try:
        from playwright.async_api import async_playwright
    except ImportError as exc:
        return {"status": "blocked_missing_playwright", "error": str(exc)}

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False)
        page = await browser.new_page()
        try:
            url = build_search_url(site, query) or site["home_url"]
            await page.goto(url, wait_until="domcontentloaded", timeout=60000)
            if "{query}" not in str(site.get("search_url_template") or ""):
                selectors = site.get("search_box_selectors") or []
                filled = False
                for selector in selectors:
                    try:
                        locator = page.locator(selector).first
                        await locator.wait_for(timeout=4000)
                        await locator.fill(query)
                        await locator.press("Enter")
                        filled = True
                        break
                    except Exception:
                        continue
                if not filled:
                    return {"status": "blocked_no_search_box", "url": page.url}
                await page.wait_for_load_state("networkidle", timeout=30000)
            html = await page.content()
            screenshot = out_dir / f"{site['id']}_search.png"
            await page.screenshot(path=str(screenshot), full_page=True)
            digest = hashlib.sha256(html.encode("utf-8", errors="replace")).hexdigest()
            html_path = out_dir / f"{site['id']}_{digest[:12]}.html"
            html_path.write_text(html, encoding="utf-8")
            return {
                "status": "saved",
                "site_id": site["id"],
                "url": page.url,
                "sha256": digest,
                "html_path": str(html_path),
                "screenshot": str(screenshot),
            }
        finally:
            await browser.close()


def cmd_run(args: argparse.Namespace) -> int:
    registry = load_registry(Path(args.registry))
    plan = json.loads(Path(args.plan).read_text(encoding="utf-8"))
    sites = [args.site] if args.site else (plan.get("sites") or [])
    if not sites:
        if plan.get("mode") == "patent":
            sites = ["incopat", "patentscope", "espacenet"]
        elif plan.get("mode") == "literature":
            sites = ["web-of-science", "scopus", "cnki", "pubmed"]
        else:
            sites = ["web-of-science", "scopus", "cnki", "incopat", "patentscope"]
    query = args.query or plan.get("query") or query_string(plan.get("keywords") or [])
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    results = []
    for site_id in sites:
        site = find_site(registry, site_id)
        if site.get("requires_browser") and not args.live:
            results.append({"site_id": site_id, "status": "dry_run_requires_browser", "query": query, "home_url": site.get("home_url")})
            continue
        if site.get("requires_browser") and args.live:
            import asyncio

            results.append(asyncio.run(browser_search(site, query, out_dir)))
            continue
        url = build_search_url(site, query)
        if args.live and url:
            try:
                results.append(fetch_search_url(url, out_dir, site_id))
            except Exception as exc:
                results.append({"site_id": site_id, "status": "error", "error": str(exc), "url": url})
        else:
            results.append({"site_id": site_id, "status": "dry_run_url_ready", "query": query, "url": url})
    report = {"generated_at": now_stamp(), "plan": str(Path(args.plan).resolve()), "query": query, "results": results}
    report_path = out_dir / "research_run.json"
    report_path.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2, ensure_ascii=False))
    return 0


def normalize_row(row: dict[str, str], source: str) -> dict[str, Any]:
    lowered = {k.lower().strip(): v for k, v in row.items()}
    def pick(*names: str) -> str:
        for name in names:
            if name in lowered and lowered[name]:
                return lowered[name].strip()
        return ""

    return {
        "source": source,
        "title": pick("title", "题名", "篇名", "专利名称", "invention title"),
        "authors_or_inventors": pick("authors", "author", "作者", "inventors", "发明人"),
        "year": pick("year", "publication year", "发表时间", "公开年"),
        "doi_or_publication": pick("doi", "publication number", "公开号", "patent number", "专利号"),
        "abstract": pick("abstract", "摘要"),
        "raw": row,
    }


def cmd_normalize_export(args: argparse.Namespace) -> int:
    path = Path(args.input)
    delimiter = "\t" if path.suffix.lower() in {".tsv", ".tab"} else ","
    rows = []
    with path.open("r", encoding=args.encoding, errors="replace", newline="") as f:
        reader = csv.DictReader(f, delimiter=delimiter)
        for row in reader:
            rows.append(normalize_row(dict(row), args.source or path.stem))
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps({"generated_at": now_stamp(), "count": len(rows), "records": rows}, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({"status": "normalized", "count": len(rows), "out": str(out)}, indent=2, ensure_ascii=False))
    return 0


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Plan and run controlled literature/patent database research sessions.")
    sub = p.add_subparsers(dest="cmd", required=True)

    plan = sub.add_parser("make-plan")
    plan.add_argument("--mode", choices=["literature", "patent", "combined"], required=True)
    plan.add_argument("--topic", required=True)
    plan.add_argument("--keywords", required=True)
    plan.add_argument("--synonyms")
    plan.add_argument("--query")
    plan.add_argument("--languages")
    plan.add_argument("--date-from")
    plan.add_argument("--date-to")
    plan.add_argument("--sites")
    plan.add_argument("--people")
    plan.add_argument("--organizations")
    plan.add_argument("--ipc-cpc")
    plan.add_argument("--document-types")
    plan.add_argument("--out", required=True)
    plan.set_defaults(func=cmd_make_plan)

    run = sub.add_parser("run")
    run.add_argument("--registry", default=str(DEFAULT_REGISTRY))
    run.add_argument("--plan", required=True)
    run.add_argument("--site")
    run.add_argument("--query")
    run.add_argument("--out-dir", required=True)
    run.add_argument("--live", action="store_true")
    run.set_defaults(func=cmd_run)

    norm = sub.add_parser("normalize-export")
    norm.add_argument("--input", required=True)
    norm.add_argument("--out", required=True)
    norm.add_argument("--source")
    norm.add_argument("--encoding", default="utf-8-sig")
    norm.set_defaults(func=cmd_normalize_export)
    return p


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
