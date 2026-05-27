#!/usr/bin/env python3
import json
import os
import re
import shlex
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
RUN_DIR = ROOT / ".runs" / "research-100p-livecov" / "agent-07"
DOWNLOAD_DIR = RUN_DIR / "downloads"
CLI = ["node", "dist/src/cli.js"]
BASE_ENV = os.environ.copy()
BASE_ENV.update({"DISPLAY": ":0", "XAUTHORITY": "/run/user/1000/gdm/Xauthority"})

DBS = {
    "opticsjournal": {
        "profile": "research-opticsjournal",
        "port": 9360,
        "query": "激光",
        "ops": {
            "search": ["research:opticsjournal:search", "激光", "--page-size", "5"],
            "filter": ["research:opticsjournal:filter", "激光", "--pubyear", "2025"],
            "export": ["research:opticsjournal:export", "激光", "--format", "enw", "--download-dir", str(DOWNLOAD_DIR / "opticsjournal"), "--confirmed"],
        },
    },
    "proquest": {
        "profile": "research-proquest",
        "port": 9361,
        "query": "machine learning",
        "ops": {
            "search": ["research:proquest:search", "machine learning", "--page-size", "5"],
            "filter": ["research:proquest:filter", "machine learning", "--full-text", "--page-size", "5"],
            "export": ["research:proquest:export", "machine learning", "--full-text", "--format", "ris", "--download-dir", str(DOWNLOAD_DIR / "proquest"), "--confirmed"],
        },
    },
    "pubscholar": {
        "profile": "research-pubscholar",
        "port": 9362,
        "query": "机器学习",
        "ops": {
            "search": ["research:pubscholar:search", "机器学习", "--field", "标题", "--page-size", "5"],
            "filter": ["research:pubscholar:filter", "机器学习", "--field", "标题", "--full-text"],
            "export": ["research:pubscholar:export", "机器学习", "--field", "标题", "--format", "ris", "--download-dir", str(DOWNLOAD_DIR / "pubscholar"), "--confirmed"],
        },
    },
    "royalsoc": {
        "profile": "research-royalsoc",
        "port": 9363,
        "query": "evolution",
        "ops": {
            "search": ["research:royalsoc:search", "evolution", "--page", "1"],
            "filter": ["research:royalsoc:filter", "evolution", "--journal", "Royal Society Open Science", "--page", "1"],
            # export args are filled after search from first retrieved record
            "export": None,
        },
    },
}

MODULE_MISSING = "Cannot find module"

def iso_now():
    return datetime.now(timezone.utc).isoformat()


def trim(text, limit=200000):
    if text is None:
        return ""
    if len(text) <= limit:
        return text
    return text[:limit] + f"\n...<truncated {len(text)-limit} chars>"


def wait_for_cli(timeout=90):
    deadline = time.time() + timeout
    while time.time() < deadline:
        if (ROOT / "dist" / "src" / "cli.js").exists():
            return True
        time.sleep(1)
    return (ROOT / "dist" / "src" / "cli.js").exists()


def run_cmd(args, timeout=180, env=None, retries=3):
    attempts = []
    full = CLI + args
    for attempt in range(1, retries + 1):
        wait_for_cli()
        started = iso_now()
        t0 = time.time()
        try:
            proc = subprocess.run(full, cwd=ROOT, env=env or BASE_ENV, text=True, capture_output=True, timeout=timeout)
            out, err, code = proc.stdout, proc.stderr, proc.returncode
        except subprocess.TimeoutExpired as e:
            out = e.stdout or ""
            err = e.stderr or ""
            code = 124
        elapsed = time.time() - t0
        rec = {
            "attempt": attempt,
            "command": shlex.join(full),
            "started_at": started,
            "elapsed_seconds": round(elapsed, 3),
            "exit_code": code,
            "stdout": trim(out),
            "stderr": trim(err),
        }
        attempts.append(rec)
        if code == 0:
            break
        if MODULE_MISSING in (out + err) and attempt < retries:
            time.sleep(3)
            continue
        break
    return attempts[-1] | {"attempts": attempts}


def parse_json(stdout):
    if not stdout.strip():
        return None
    try:
        return json.loads(stdout)
    except Exception:
        # Some commands can emit logs before JSON; try last JSON object.
        starts = [m.start() for m in re.finditer(r"\{", stdout)]
        for idx in reversed(starts):
            try:
                return json.loads(stdout[idx:])
            except Exception:
                pass
    return None


def find_error_code(text):
    for code in [
        "ELEMENT_NOT_FOUND", "FETCH_FAILED", "PARSING_ERROR", "COMMAND_TIMEOUT", "ARTIFACT_DOWNLOAD_TIMEOUT",
        "ARTIFACT_VERIFICATION_FAILED", "LOGIN_REQUIRED", "HUMAN_HANDOFF_REQUIRED", "PLAN_OR_QUOTA_REQUIRED",
        "PROFILE_NOT_FOUND", "INVALID_ARGS", "NETWORK_ERROR", "AUTH_REQUIRED"
    ]:
        if code in text:
            return code
    m = re.search(r"\b([A-Z][A-Z0-9]+(?:_[A-Z0-9]+)+)\b", text)
    return m.group(1) if m else "UNKNOWN"


def classify(op, code, parsed, stdout, stderr):
    if code != 0:
        return "FAIL_" + find_error_code((stderr or "") + "\n" + (stdout or ""))
    if parsed is None:
        return "FAIL_PARSING_ERROR"
    if op in ("search", "filter"):
        rc = parsed.get("result_count") if isinstance(parsed, dict) else None
        items = parsed.get("items") if isinstance(parsed, dict) else None
        item_count = parsed.get("item_count") if isinstance(parsed, dict) else None
        if isinstance(rc, int) and rc > 0 and ((isinstance(items, list) and len(items) > 0) or (isinstance(item_count, int) and item_count > 0)):
            return "PASS"
        return "FAIL_PARSING_ERROR"
    if op == "export":
        if isinstance(parsed, dict):
            artifact = parsed.get("artifact_path")
            bytes_ = parsed.get("bytes")
            sha = parsed.get("sha256")
            if artifact and isinstance(bytes_, int) and bytes_ > 0 and sha:
                return "PASS"
        return "FAIL_ARTIFACT_VERIFICATION_FAILED"
    return "PASS"


def write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def close_profile(db, cfg):
    return run_cmd(["browser:close", "--profile", cfg["profile"], "--mode", "close-process", "--release-lease", "--force", "--json"], timeout=45, retries=5)


def launch_profile(db, cfg):
    return run_cmd(["browser:launch", "--profile", cfg["profile"], "--cdp-port", str(cfg["port"]), "--json"], timeout=90, retries=5)


def op_args(db, op, cfg, prior):
    args = cfg["ops"][op]
    if args is not None:
        return args
    if db == "royalsoc" and op == "export":
        search = prior.get("search", {}).get("parsed") or {}
        items = search.get("items") or []
        first = items[0] if items else {}
        resource_id = first.get("resource_id") if isinstance(first, dict) else None
        doi = first.get("doi") if isinstance(first, dict) else None
        cmd = ["research:royalsoc:export"]
        if resource_id:
            cmd += ["--resource-id", str(resource_id)]
        elif doi:
            cmd += [str(doi)]
        else:
            # Known public Royal Society DOI fallback only if search parsing did not expose an ID.
            cmd += ["10.1098/rsos.171615"]
        cmd += ["--format", "ris", "--download-dir", str(DOWNLOAD_DIR / "royalsoc"), "--confirmed"]
        return cmd
    raise RuntimeError(f"No args for {db} {op}")


def smoke_db(db, cfg):
    profile, port = cfg["profile"], cfg["port"]
    db_result = {"db": db, "profile": profile, "cdp_port": port, "started_at": iso_now(), "tools": {}}
    preclose = close_profile(db, cfg)
    write_json(RUN_DIR / f"{db}-preclose.json", {"db": db, "phase": "preclose", "result": preclose, "parsed": parse_json(preclose.get("stdout", ""))})
    launch = launch_profile(db, cfg)
    launch_parsed = parse_json(launch.get("stdout", ""))
    write_json(RUN_DIR / f"{db}-launch.json", {"db": db, "phase": "launch", "result": launch, "parsed": launch_parsed})
    db_result["launch"] = {"exit_code": launch["exit_code"], "parsed": launch_parsed, "stderr": launch.get("stderr", "")}
    prior = {}
    if launch["exit_code"] != 0:
        db_result["launch_classification"] = "FAIL_" + find_error_code(launch.get("stderr", "") + launch.get("stdout", ""))
    try:
        for op in ["search", "filter", "export"]:
            args = op_args(db, op, cfg, prior)
            args = args + ["--profile", profile, "--cdp-port", str(port), "--json"]
            result = run_cmd(args, timeout=240 if op != "export" else 300, retries=5)
            parsed = parse_json(result.get("stdout", ""))
            classification = classify(op, result["exit_code"], parsed, result.get("stdout", ""), result.get("stderr", ""))
            evidence = {
                "db": db,
                "tool": f"research_{db}_{op}",
                "op": op,
                "profile": profile,
                "cdp_port": port,
                "query": cfg.get("query"),
                "classification": classification,
                "result": result,
                "parsed": parsed,
                "launch_exit_code": launch["exit_code"],
                "captured_at": iso_now(),
            }
            write_json(RUN_DIR / f"{db}-{op}.json", evidence)
            db_result["tools"][op] = {"classification": classification, "evidence": str(RUN_DIR / f"{db}-{op}.json"), "exit_code": result["exit_code"]}
            prior[op] = evidence
    finally:
        close = close_profile(db, cfg)
        write_json(RUN_DIR / f"{db}-close.json", {"db": db, "phase": "close", "result": close, "parsed": parse_json(close.get("stdout", "")), "captured_at": iso_now()})
        db_result["close"] = {"exit_code": close["exit_code"], "stderr": close.get("stderr", "")}
        db_result["finished_at"] = iso_now()
        write_json(RUN_DIR / f"{db}-summary.json", db_result)
    return db_result


def main():
    RUN_DIR.mkdir(parents=True, exist_ok=True)
    DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)
    selected = sys.argv[1:] or list(DBS.keys())
    all_results = []
    for db in selected:
        if db not in DBS:
            raise SystemExit(f"unknown db {db}")
        print(f"== smoke {db} ==", flush=True)
        res = smoke_db(db, DBS[db])
        all_results.append(res)
        print(json.dumps(res["tools"], ensure_ascii=False, indent=2), flush=True)
    write_json(RUN_DIR / "agent-07-run-summary.json", {"started_or_updated_at": iso_now(), "results": all_results})

if __name__ == "__main__":
    main()
