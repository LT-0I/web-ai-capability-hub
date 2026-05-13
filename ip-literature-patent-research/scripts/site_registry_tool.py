from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


DEFAULT_REGISTRY = Path(__file__).resolve().parents[1] / "references" / "site_registry.json"
REQUIRED_FIELDS = {"id", "name", "type", "home_url", "login_mode", "requires_browser", "access_markers", "login_markers", "stop_markers"}


def load(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def save(path: Path, data: dict[str, Any]) -> None:
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def validate_registry(data: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    sites = data.get("sites")
    if not isinstance(sites, list):
        return ["registry must contain a sites list"]
    seen: set[str] = set()
    for idx, site in enumerate(sites):
        missing = sorted(REQUIRED_FIELDS - set(site))
        if missing:
            errors.append(f"site[{idx}] missing fields: {', '.join(missing)}")
        site_id = str(site.get("id") or "")
        if not site_id:
            errors.append(f"site[{idx}] has empty id")
        elif site_id in seen:
            errors.append(f"duplicate id: {site_id}")
        seen.add(site_id)
        if site.get("type") not in {"literature", "patent", "mixed"}:
            errors.append(f"{site_id}: type must be literature, patent, or mixed")
        if not str(site.get("home_url") or "").startswith(("http://", "https://")):
            errors.append(f"{site_id}: home_url must be http(s)")
        for list_key in ("access_markers", "login_markers", "stop_markers"):
            if not isinstance(site.get(list_key), list):
                errors.append(f"{site_id}: {list_key} must be a list")
    return errors


def cmd_validate(args: argparse.Namespace) -> int:
    errors = validate_registry(load(Path(args.registry)))
    if errors:
        print("\n".join(errors))
        return 1
    print("OK")
    return 0


def cmd_list(args: argparse.Namespace) -> int:
    for site in load(Path(args.registry))["sites"]:
        print(f"{site['id']}\t{site.get('type')}\t{site.get('login_mode')}\t{site.get('home_url')}")
    return 0


def cmd_get(args: argparse.Namespace) -> int:
    data = load(Path(args.registry))
    for site in data["sites"]:
        if site["id"] == args.site:
            print(json.dumps(site, indent=2, ensure_ascii=False))
            return 0
    print(f"not found: {args.site}")
    return 1


def coerce_value(raw: str) -> Any:
    raw = raw.strip()
    if raw.lower() == "true":
        return True
    if raw.lower() == "false":
        return False
    if raw.startswith("[") or raw.startswith("{"):
        return json.loads(raw)
    return raw


def cmd_set(args: argparse.Namespace) -> int:
    path = Path(args.registry)
    data = load(path)
    target = None
    for site in data["sites"]:
        if site["id"] == args.site:
            target = site
            break
    if target is None:
        print(f"not found: {args.site}")
        return 1
    for pair in args.set:
        if "=" not in pair:
            print(f"expected key=value: {pair}")
            return 1
        key, raw = pair.split("=", 1)
        target[key] = coerce_value(raw)
    errors = validate_registry(data)
    if errors:
        print("\n".join(errors))
        return 1
    save(path, data)
    print(f"updated {args.site}")
    return 0


def cmd_add(args: argparse.Namespace) -> int:
    path = Path(args.registry)
    data = load(path)
    if any(site["id"] == args.id for site in data["sites"]):
        print(f"already exists: {args.id}")
        return 1
    site = {
        "id": args.id,
        "name": args.name,
        "type": args.type,
        "home_url": args.home_url,
        "search_url_template": args.search_url_template or args.home_url,
        "login_mode": args.login_mode,
        "requires_browser": args.requires_browser,
        "access_markers": args.access_marker or [],
        "login_markers": args.login_marker or [],
        "stop_markers": args.stop_marker or ["captcha", "验证码"],
        "search_box_selectors": args.selector or ["input[type='text']", "textarea"],
        "notes": args.notes or "",
        "source_urls": args.source_url or [args.home_url],
    }
    data["sites"].append(site)
    data["sites"].sort(key=lambda item: item["id"])
    errors = validate_registry(data)
    if errors:
        print("\n".join(errors))
        return 1
    save(path, data)
    print(f"added {args.id}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Maintain site_registry.json profiles.")
    p.add_argument("--registry", default=str(DEFAULT_REGISTRY))
    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("validate").set_defaults(func=cmd_validate)
    sub.add_parser("list").set_defaults(func=cmd_list)
    get = sub.add_parser("get")
    get.add_argument("site")
    get.set_defaults(func=cmd_get)
    setp = sub.add_parser("set")
    setp.add_argument("site")
    setp.add_argument("--set", action="append", required=True, help="key=value; JSON allowed for arrays/objects.")
    setp.set_defaults(func=cmd_set)
    add = sub.add_parser("add")
    add.add_argument("--id", required=True)
    add.add_argument("--name", required=True)
    add.add_argument("--type", choices=["literature", "patent", "mixed"], required=True)
    add.add_argument("--home-url", required=True)
    add.add_argument("--search-url-template")
    add.add_argument("--login-mode", default="licensed_ip_or_account")
    add.add_argument("--requires-browser", action="store_true")
    add.add_argument("--access-marker", action="append")
    add.add_argument("--login-marker", action="append")
    add.add_argument("--stop-marker", action="append")
    add.add_argument("--selector", action="append")
    add.add_argument("--source-url", action="append")
    add.add_argument("--notes")
    add.set_defaults(func=cmd_add)
    return p


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
