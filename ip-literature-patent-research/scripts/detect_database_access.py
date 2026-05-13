from __future__ import annotations

import argparse
import html.parser
import json
import ssl
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any


class TitleParser(html.parser.HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.in_title = False
        self.parts: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag.lower() == "title":
            self.in_title = True

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() == "title":
            self.in_title = False

    def handle_data(self, data: str) -> None:
        if self.in_title:
            self.parts.append(data)

    @property
    def title(self) -> str:
        return " ".join(" ".join(self.parts).split())[:300]


def load_registry(path: Path) -> dict[str, Any]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if "sites" not in data or not isinstance(data["sites"], list):
        raise ValueError("registry must contain a sites list")
    ids = [site.get("id") for site in data["sites"]]
    duplicates = sorted({x for x in ids if ids.count(x) > 1})
    if duplicates:
        raise ValueError(f"duplicate site ids: {duplicates}")
    return data


def text_markers(text: str, markers: list[str]) -> list[str]:
    low = text.lower()
    return [m for m in markers if m and m.lower() in low]


def fetch_url(url: str, timeout_s: int) -> dict[str, Any]:
    started = time.monotonic()
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 HBA-IP-Research-Probe/1.0",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
    )
    try:
        context = ssl.create_default_context()
        with urllib.request.urlopen(req, timeout=timeout_s, context=context) as resp:
            raw = resp.read(512_000)
            ctype = resp.headers.get("content-type", "")
            charset = resp.headers.get_content_charset() or "utf-8"
            text = raw.decode(charset, errors="replace")
            return {
                "ok": True,
                "status_code": int(resp.status),
                "final_url": resp.geturl(),
                "content_type": ctype,
                "elapsed_ms": int((time.monotonic() - started) * 1000),
                "text": text,
                "error": None,
            }
    except urllib.error.HTTPError as exc:
        body = exc.read(256_000).decode("utf-8", errors="replace")
        return {
            "ok": False,
            "status_code": int(exc.code),
            "final_url": exc.geturl(),
            "content_type": exc.headers.get("content-type", ""),
            "elapsed_ms": int((time.monotonic() - started) * 1000),
            "text": body,
            "error": str(exc),
        }
    except Exception as exc:
        return {
            "ok": False,
            "status_code": None,
            "final_url": url,
            "content_type": None,
            "elapsed_ms": int((time.monotonic() - started) * 1000),
            "text": "",
            "error": str(exc),
        }


def classify(site: dict[str, Any], fetched: dict[str, Any]) -> dict[str, Any]:
    text = fetched.get("text") or ""
    parser = TitleParser()
    try:
        parser.feed(text)
    except Exception:
        pass
    access_hits = text_markers(text, list(site.get("access_markers") or []))
    login_hits = text_markers(text, list(site.get("login_markers") or []))
    stop_hits = text_markers(text, list(site.get("stop_markers") or []))
    status_code = fetched.get("status_code")
    title_low = parser.title.lower()
    looks_like_challenge = any(
        marker in title_low
        for marker in ("just a moment", "access denied", "403", "captcha", "验证码")
    )
    if status_code in {401, 403}:
        status = "blocked_or_forbidden"
    elif stop_hits and looks_like_challenge:
        status = "hard_stop_marker"
    elif fetched.get("ok") and access_hits and login_hits and stop_hits:
        status = "reachable_login_may_be_required_security_marker_present"
    elif fetched.get("ok") and access_hits and stop_hits:
        status = "reachable_security_marker_present"
    elif fetched.get("ok") and access_hits and not login_hits:
        status = "reachable_possible_access"
    elif fetched.get("ok") and access_hits and login_hits:
        status = "reachable_login_may_be_required"
    elif fetched.get("ok"):
        status = "reachable_unknown_access"
    else:
        status = "unreachable"
    return {
        "id": site.get("id"),
        "name": site.get("name"),
        "type": site.get("type"),
        "status": status,
        "login_mode": site.get("login_mode"),
        "home_url": site.get("home_url"),
        "final_url": fetched.get("final_url"),
        "status_code": status_code,
        "elapsed_ms": fetched.get("elapsed_ms"),
        "title": parser.title,
        "access_markers_found": access_hits,
        "login_markers_found": login_hits,
        "stop_markers_found": stop_hits,
        "error": fetched.get("error"),
        "requires_browser": bool(site.get("requires_browser")),
        "notes": site.get("notes"),
    }


def write_markdown(results: list[dict[str, Any]], path: Path) -> None:
    lines = [
        "# Database Access Detection",
        "",
        f"Generated: {time.strftime('%Y-%m-%dT%H:%M:%S%z')}",
        "",
        "| Site | Type | Status | HTTP | Markers | Notes |",
        "|---|---|---|---|---|---|",
    ]
    for r in results:
        markers = ", ".join(r.get("access_markers_found") or r.get("login_markers_found") or r.get("stop_markers_found") or [])
        lines.append(
            "| {name} | {type} | {status} | {code} | {markers} | {notes} |".format(
                name=str(r.get("name") or r.get("id")).replace("|", "\\|"),
                type=r.get("type") or "",
                status=r.get("status") or "",
                code=r.get("status_code") or "",
                markers=markers.replace("|", "\\|"),
                notes=str(r.get("notes") or "").replace("|", "\\|")[:200],
            )
        )
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def cmd_detect(args: argparse.Namespace) -> int:
    registry = load_registry(Path(args.registry))
    selected = set(args.site or [])
    results = []
    for site in registry["sites"]:
        if selected and site["id"] not in selected:
            continue
        fetched = fetch_url(site["home_url"], args.timeout)
        result = classify(site, fetched)
        results.append(result)
        if args.sleep:
            time.sleep(args.sleep)
    payload = {"generated_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"), "results": results}
    if args.out_json:
        out = Path(args.out_json)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    if args.out_md:
        write_markdown(results, Path(args.out_md))
    print(json.dumps(payload, indent=2, ensure_ascii=False))
    return 0


def cmd_list(args: argparse.Namespace) -> int:
    registry = load_registry(Path(args.registry))
    for site in registry["sites"]:
        print(f"{site['id']}\t{site.get('type')}\t{site.get('name')}\t{site.get('home_url')}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Probe literature/patent database access from the current network.")
    sub = parser.add_subparsers(dest="cmd", required=True)
    detect = sub.add_parser("detect")
    detect.add_argument("--registry", default=str(Path(__file__).resolve().parents[1] / "references" / "site_registry.json"))
    detect.add_argument("--site", action="append", help="Limit to one site id; repeatable.")
    detect.add_argument("--timeout", type=int, default=12)
    detect.add_argument("--sleep", type=float, default=0.0)
    detect.add_argument("--out-json")
    detect.add_argument("--out-md")
    detect.set_defaults(func=cmd_detect)
    ls = sub.add_parser("list")
    ls.add_argument("--registry", default=str(Path(__file__).resolve().parents[1] / "references" / "site_registry.json"))
    ls.set_defaults(func=cmd_list)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
