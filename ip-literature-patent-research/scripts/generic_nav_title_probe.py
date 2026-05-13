from __future__ import annotations

import argparse
import asyncio
import csv
import json
import re
import sys
import time
import urllib.parse
from pathlib import Path
from typing import Any


SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

import browser_research_runner as browser_runner  # noqa: E402


NAV_URL_REDACTION = "[REDACTED_NAV_URL]"
RESOURCE_ROW_SELECTOR = "table.list tbody tr, table tbody tr"
PRIVATE_NAV_PARTS = ["lib." + "nu" + "aa", "nu" + "aa", "engine2/m", "websiteId=", "wfwfid=", "pageId="]
SENSITIVE_QUERY_KEYS = {"state", "authrequest", "token", "code", "redirect_uri", "requestidentifier"}


def now_stamp() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%S%z")


def split_list(value: str | None) -> list[str]:
    return [item.strip() for item in re.split(r"[;\n,]+", str(value or "")) if item.strip()]


def redact(value: Any) -> Any:
    if isinstance(value, str):
        if any(part.lower() in value.lower() for part in PRIVATE_NAV_PARTS):
            return NAV_URL_REDACTION
        if value.startswith(("http://", "https://")):
            try:
                parsed = urllib.parse.urlparse(value)
                query = parsed.query
                query_keys = {key.lower() for key in urllib.parse.parse_qs(query).keys()}
                if query and (len(query) > 120 or query_keys & SENSITIVE_QUERY_KEYS):
                    value = urllib.parse.urlunparse(parsed._replace(query="[REDACTED_QUERY]", fragment=""))
            except Exception:
                pass
        return browser_runner.redact_private_text(value)
    if isinstance(value, list):
        return [redact(item) for item in value]
    if isinstance(value, dict):
        return {key: redact(item) for key, item in value.items()}
    return value


def classify(final_url: str, title: str, text: str) -> str:
    combined = f"{title} {text[:5000]}".lower()
    if final_url.startswith("chrome-error://") or redact(final_url) == NAV_URL_REDACTION or "数字资源导航" in title:
        return "navigation_error"
    if any(
        marker in combined
        for marker in [
            "just a moment",
            "security verification",
            "not a bot",
            "captcha",
            "access denied",
            "entitlements",
            "blocked",
        ]
    ):
        return "needs_human_or_blocked"
    if any(marker in title.lower() for marker in ["sign in", "login", "log in"]) or "登录" in title:
        return "login_required_or_unknown"
    if any(marker in combined for marker in ["登录", "sign in", "login"]) and not any(
        marker in combined for marker in ["search", "advanced search", "browse", "publications", "journals", "standards"]
    ):
        return "login_required_or_unknown"
    if final_url.startswith("http") and len(text.strip()) > 80:
        return "reachable_or_accessible"
    return "reachable_unknown"


def load_resources(args: argparse.Namespace) -> list[dict[str, str]]:
    resources: list[dict[str, str]] = []
    if args.resource_file:
        data = json.loads(Path(args.resource_file).read_text(encoding="utf-8"))
        if isinstance(data, dict):
            data = data.get("resources") or []
        for item in data:
            if isinstance(item, str):
                resources.append({"id": browser_runner.safe_name(item), "title": item, "category": ""})
            else:
                resources.append(
                    {
                        "id": str(item.get("id") or browser_runner.safe_name(item.get("title") or "")),
                        "title": str(item.get("title") or ""),
                        "category": str(item.get("category") or ""),
                    }
                )
    for title in split_list(args.resource_titles):
        resources.append({"id": browser_runner.safe_name(title), "title": title, "category": ""})
    return [item for item in resources if item.get("title")]


async def search_rows(page: Any, nav_url: str, title: str, timeout_ms: int) -> list[dict[str, Any]]:
    await page.goto(nav_url, wait_until="domcontentloaded", timeout=timeout_ms)
    await page.wait_for_timeout(1200)
    search_box = page.locator("input#searchInput-custom").first
    await search_box.fill("", timeout=5000)
    await search_box.fill(title, timeout=5000)
    await page.locator("button.btn-search").first.click(timeout=5000)
    await page.wait_for_timeout(2200)
    return await page.evaluate(
        """(selector) => Array.from(document.querySelectorAll(selector)).map((row, index) => {
            const cells = Array.from(row.querySelectorAll('td')).map(td => (td.innerText || td.textContent || '').replace(/\\s+/g, ' ').trim());
            return {index, title: cells[0] || '', row_text: cells.join(' | '), subject: cells[2] || '', resource_type: cells[3] || ''};
        }).filter(row => row.title)""",
        RESOURCE_ROW_SELECTOR,
    )


def choose_row(rows: list[dict[str, Any]], title: str) -> dict[str, Any] | None:
    for row in rows:
        if str(row.get("title") or "") == title:
            return row
    title_key = re.sub(r"\s+", "", title).lower()
    for row in rows:
        row_key = re.sub(r"\s+", "", str(row.get("title") or "")).lower()
        if title_key and (title_key in row_key or row_key in title_key):
            return row
    return rows[0] if len(rows) == 1 else None


async def probe_resource(context: Any, nav_url: str, resource: dict[str, str], args: argparse.Namespace) -> dict[str, Any]:
    page = await context.new_page()
    started = time.monotonic()
    result: dict[str, Any] = {
        "generated_at": now_stamp(),
        "id": resource["id"],
        "resource_title": resource["title"],
        "category": resource.get("category") or "",
    }
    try:
        rows = await search_rows(page, nav_url, resource["title"], args.timeout_ms)
        row = choose_row(rows, resource["title"])
        result["matched_row"] = row
        if not row:
            result["status"] = "not_found_in_navigation"
            result["elapsed_ms"] = int((time.monotonic() - started) * 1000)
            return redact(result)
        row_index = int(row["index"])
        target = None
        try:
            async with page.expect_popup(timeout=7000) as popup_info:
                await page.locator(RESOURCE_ROW_SELECTOR).nth(row_index).locator("td").first.click(timeout=5000)
            target = await popup_info.value
            await target.wait_for_load_state("domcontentloaded", timeout=min(args.timeout_ms, 18000))
            await target.wait_for_timeout(2500)
        except Exception as exc:
            result["popup_error"] = str(exc)
            before = list(context.pages)
            try:
                await page.locator(RESOURCE_ROW_SELECTOR).nth(row_index).locator("td").first.click(timeout=5000)
            except Exception as click_exc:
                result["click_error"] = str(click_exc)
            await page.wait_for_timeout(4500)
            after = list(context.pages)
            new_pages = [candidate for candidate in after if candidate not in before]
            target = new_pages[-1] if new_pages else page
        title = ""
        text = ""
        final_url = ""
        try:
            title = await target.title()
        except Exception:
            pass
        try:
            text = await target.locator("body").inner_text(timeout=5000)
        except Exception:
            pass
        try:
            final_url = target.url
        except Exception:
            pass
        result.update(
            {
                "status": classify(final_url, title, text),
                "final_url": final_url,
                "page_title": title,
                "text_sample": text[:1000],
                "elapsed_ms": int((time.monotonic() - started) * 1000),
            }
        )
        if target is not page:
            try:
                await target.close()
            except Exception:
                pass
    except Exception as exc:
        result["status"] = "probe_error"
        result["error"] = str(exc)
        result["elapsed_ms"] = int((time.monotonic() - started) * 1000)
    finally:
        try:
            await page.close()
        except Exception:
            pass
    return redact(result)


def write_reports(results: list[dict[str, Any]], out_dir: Path) -> dict[str, str]:
    out_dir.mkdir(parents=True, exist_ok=True)
    summary: dict[str, int] = {}
    for item in results:
        status = str(item.get("status") or "unknown")
        summary[status] = summary.get(status, 0) + 1
    payload = {"generated_at": now_stamp(), "summary": summary, "results": results}
    json_path = out_dir / "generic_title_access.json"
    md_path = out_dir / "generic_title_access.md"
    csv_path = out_dir / "generic_title_access.csv"
    json_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    with csv_path.open("w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.DictWriter(handle, fieldnames=["id", "resource_title", "category", "status", "final_url", "page_title"])
        writer.writeheader()
        for item in results:
            writer.writerow({key: item.get(key, "") for key in writer.fieldnames})
    lines = [
        "# Generic Title-Click Access Probe",
        "",
        f"Summary: {summary}",
        "",
        "| ID | Resource | Category | Status | Final URL | Title |",
        "|---|---|---|---|---|---|",
    ]
    for item in results:
        lines.append(
            "| {id} | {resource_title} | {category} | {status} | {final_url} | {page_title} |".format(
                **{key: str(item.get(key, "")).replace("|", "\\|") for key in ["id", "resource_title", "category", "status", "final_url", "page_title"]}
            )
        )
    md_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return {"json": str(json_path), "md": str(md_path), "csv": str(csv_path)}


async def run_async(args: argparse.Namespace) -> dict[str, str]:
    try:
        from playwright.async_api import async_playwright
    except Exception as exc:
        raise SystemExit("Playwright is required. Install with: python -m pip install playwright") from exc

    resources = load_resources(args)
    if not resources:
        raise SystemExit("Provide --resource-titles or --resource-file.")
    async with async_playwright() as p:
        browser = await p.chromium.connect_over_cdp(args.cdp_endpoint)
        context = browser.contexts[0] if browser.contexts else await browser.new_context()
        results = []
        for resource in resources:
            try:
                result = await asyncio.wait_for(probe_resource(context, args.nav_url, resource, args), timeout=max(1, args.site_timeout_ms / 1000))
            except asyncio.TimeoutError:
                result = redact(
                    {
                        "generated_at": now_stamp(),
                        "id": resource["id"],
                        "resource_title": resource["title"],
                        "category": resource.get("category") or "",
                        "status": "timeout",
                        "elapsed_ms": args.site_timeout_ms,
                    }
                )
            results.append(result)
            print(f"{result.get('id')}\t{result.get('status')}\t{result.get('final_url', '')}\t{result.get('page_title', '')}")
    return write_reports(results, Path(args.out_dir))


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Probe online navigation entries by exact resource title clicks.")
    parser.add_argument("--nav-url", required=True)
    parser.add_argument("--resource-titles")
    parser.add_argument("--resource-file", type=Path)
    parser.add_argument("--out-dir", type=Path, required=True)
    parser.add_argument("--cdp-endpoint", default="http://127.0.0.1:9333")
    parser.add_argument("--timeout-ms", type=int, default=22000)
    parser.add_argument("--site-timeout-ms", type=int, default=75000)
    return parser


def main() -> int:
    outputs = asyncio.run(run_async(build_parser().parse_args()))
    print(json.dumps(outputs, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
