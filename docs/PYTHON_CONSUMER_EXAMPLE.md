# Python consumer example for `consumer-contract-1.2.0`

This example shows the smallest dependency-free Python pattern for calling the hub's consumer-safe health probe. It still re-sanitizes output defensively before logging or returning data.

```python
from __future__ import annotations

import json
import subprocess
from pathlib import Path
from typing import Any

HUB_DIR = Path("/absolute/path/to/web-ai-capability-hub")
HUB_CLI = HUB_DIR / "dist" / "src" / "cli.js"
CONTRACT_VERSION = "consumer-contract-1.2.0"

ERROR_CODES = {
    "HUB_NOT_BUILT",
    "BROWSER_NOT_LAUNCHED",
    "PROFILE_NOT_FOUND",
    "TARGET_PAGE_MISSING",
    "LOGIN_REQUIRED",
    "CAPABILITY_DB_NOT_INIT",
    "COMMAND_TIMEOUT",
    "INVALID_ARGS",
    "INVALID_JSON",
    "POLICY_APPROVAL_REQUIRED",
    "HUMAN_HANDOFF_REQUIRED",
    "MODE_UNCERTAIN",
    "POSTCONDITION_TIMEOUT",
    "ARTIFACT_VERIFICATION_FAILED",
    "ARTIFACT_DOWNLOAD_TIMEOUT",
    "ELEMENT_OUT_OF_VIEWPORT",
    "ELEMENT_NOT_FOUND",
    "IFRAME_NOT_FOUND",
    "RESUME_REQUIRES_CONFIRMATION",
    "IDEMPOTENCY_MISMATCH",
    "PROFILE_LOCKED",
    "PROFILE_LEASE_BUSY",
    "UNKNOWN",
}

FORBIDDEN_FIELDS = {
    "cdpEndpoint",
    "webSocketDebuggerUrl",
    "profileDir",
    "profile_dir",
    "executablePath",
    "executable_path",
    "cookies",
    "cookie",
    "tokens",
    "token",
    "Authorization",
    "authorization",
    "accountEmail",
    "account_email",
    "email",
    "dom",
    "html",
    "screenshot",
    "screenshotPath",
    "rawSnapshot",
    "snapshot",
}


def sanitize(value: Any) -> Any:
    if isinstance(value, dict):
        return {k: sanitize(v) for k, v in value.items() if k not in FORBIDDEN_FIELDS}
    if isinstance(value, list):
        return [sanitize(item) for item in value]
    return value


def hub_health(target: str, profile: str, timeout_seconds: float = 5.0) -> dict[str, Any]:
    if not HUB_CLI.exists():
        return {
            "ok": False,
            "target": target,
            "profile": profile,
            "connected": False,
            "pageCount": 0,
            "loginLikeState": "not_implemented",
            "status": "needs_review",
            "errorCode": "HUB_NOT_BUILT",
            "message": "Hub dist CLI is missing; run npm run build in the hub repo.",
            "checkedAt": "",
        }

    cmd = [
        "node",
        str(HUB_CLI),
        "consumer:health",
        "--target",
        target,
        "--profile",
        profile,
        "--json",
    ]

    try:
        completed = subprocess.run(
            cmd,
            cwd=str(HUB_DIR),
            check=False,
            capture_output=True,
            text=True,
            timeout=timeout_seconds,
        )
    except subprocess.TimeoutExpired:
        return {
            "ok": False,
            "target": target,
            "profile": profile,
            "connected": False,
            "pageCount": 0,
            "loginLikeState": "not_implemented",
            "status": "needs_review",
            "errorCode": "COMMAND_TIMEOUT",
            "message": "Timed out while calling hub consumer health.",
            "checkedAt": "",
        }

    try:
        parsed = json.loads(completed.stdout)
    except json.JSONDecodeError:
        return {
            "ok": False,
            "target": target,
            "profile": profile,
            "connected": False,
            "pageCount": 0,
            "loginLikeState": "not_implemented",
            "status": "needs_review",
            "errorCode": "INVALID_JSON",
            "message": "Hub returned non-JSON output.",
            "checkedAt": "",
        }

    safe = sanitize(parsed)
    code = safe.get("errorCode")
    if code is not None and code not in ERROR_CODES:
        safe["errorCode"] = "UNKNOWN"
        safe["message"] = "Hub returned an unrecognized consumer error code."
    return safe


result = hub_health("chatgpt", "chatgpt")
if result["ok"]:
    print("Hub target is healthy")
elif result["errorCode"] == "TARGET_PAGE_MISSING":
    print("Open the target page in the visible browser profile, then retry")
elif result["errorCode"] == "LOGIN_REQUIRED":
    print("Complete manual login in the visible browser, then retry")
else:
    print(f"Hub health unavailable: {result['errorCode']}")
```

Notes:

- Use an absolute, allowlisted `HUB_DIR` in production consumers.
- Keep live hub checks behind explicit environment gates when appropriate.
- Branch on `errorCode`, not `message`.
- Re-sanitize even though `consumer:health` is already designed to be safe.
