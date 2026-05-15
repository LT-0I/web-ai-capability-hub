---
name: web-ai-launch-browsers
description: Correctly launch ChatGPT/Claude/Gemini Chrome instances with persistent profiles and CDP ports for web-AI automation in this repo. Use this whenever a subagent or orchestrator needs the three web-AI browsers up and reachable.
---

# Skill: web-ai-launch-browsers

## When to use

- Before any `webai:*:send-prompt` / `upload-and-query` / `generate-file` / `generate-image` runs.
- When `curl http://127.0.0.1:9222/json/version` (or 9223/9224/9225) returns "connection refused" — i.e. CDP not in listening state.
- When `node dist/src/cli.js browser:status --profile <name>` returns `connected: false`.

## What it does

Brings up persistent system google-chrome instances for the three web AI profiles, each on its own CDP port, each writing to its own per-profile dir, all reachable via `node dist/src/cli.js webai:*` commands.

## ⚠️ The single most important rule

**Use `browser:launch`, NOT `browser:start`.**

| Command | Path | Result |
|---|---|---|
| `browser:launch --profile <name> --cdp-port <port>` | `ManagedBrowserLauncher` | ✅ system google-chrome, real CDP port, correct per-profile dir |
| `browser:start --profile <name>` | v0 legacy `withSession` | ❌ silently IGNORES `--profile`, launches playwright Chromium with `--remote-debugging-pipe` to default `data/browser-profile` (singular) — port never listens |

`browser:start` is a v0 holdover with no profile-awareness. It is being deprecated in `src/cli.ts` (see `INVALID_ARGS` guard).

## The canonical profile → port mapping

| Service | Profile name | CDP port | Profile dir |
|---|---|---|---|
| ChatGPT | `chatgpt` | 9223 | `data/browser-profiles/chatgpt/` |
| Claude | **`claude-9224`** | **9224** | `data/browser-profiles/claude-9224/` |
| Gemini | `gemini-9225` | 9225 | `data/browser-profiles/gemini-9225/` |

> **Do NOT use `claude` (port 9222)** — that profile is the legacy logged-out account. The active Claude session lives in `claude-9224`. See user-memory `project_claude_profile_9224.md`.

## Canonical launch incantation

```bash
cd /home/l1u/workspace/noeticmind/web-ai-capability-hub

# Each launch is a foreground call that returns when chrome is ready
# (it does NOT block — managedLauncher waits for /json/version then prints the JSON record).

DISPLAY=:0 XAUTHORITY=/run/user/1000/gdm/Xauthority \
  node dist/src/cli.js browser:launch --profile chatgpt --cdp-port 9223 --json

DISPLAY=:0 XAUTHORITY=/run/user/1000/gdm/Xauthority \
  node dist/src/cli.js browser:launch --profile claude-9224 --cdp-port 9224 --json

DISPLAY=:0 XAUTHORITY=/run/user/1000/gdm/Xauthority \
  node dist/src/cli.js browser:launch --profile gemini-9225 --cdp-port 9225 --json
```

Run them **serially** (one after another, never in parallel). Parallel launches race on the global `SingletonLock` file in the default profile dir.

## Why `DISPLAY` / `XAUTHORITY` matter

Without them, system google-chrome launches headless. Cloudflare and similar bot-protection layers will block the session as soon as you try to load `chatgpt.com` / `claude.ai` / `gemini.google.com`. With them, chrome opens a real window on the user's screen and the user can verify login state.

`/run/user/1000/gdm/Xauthority` is the standard GDM path on this host. If a different display manager is in use, the user must export `XAUTHORITY` explicitly first.

## Verification (after each launch)

```bash
# 1. CDP version on the expected port
curl -sS http://127.0.0.1:9223/json/version | grep '"Browser"'   # ChatGPT
curl -sS http://127.0.0.1:9224/json/version | grep '"Browser"'   # Claude
curl -sS http://127.0.0.1:9225/json/version | grep '"Browser"'   # Gemini

# 2. profile status
node dist/src/cli.js browser:status --profile chatgpt --json
node dist/src/cli.js browser:status --profile claude-9224 --json
node dist/src/cli.js browser:status --profile gemini-9225 --json
```

Each should report `connected: true` and `cdpPort` matching the table above.

## If you hit SingletonLock errors

Symptom: `Failed to create .../SingletonLock: 文件已存在 (17)` or `ProcessSingleton` errors.

Cause: a previous Chromium process crashed or you ran a parallel launch.

Fix:
```bash
# Identify and kill any orphan chrome processes
pkill -KILL -f 'chromium-1217/chrome-linux64/chrome' || true
pkill -KILL -f '/usr/bin/google-chrome' || true

# Remove stale lock files (per profile)
for p in chatgpt claude-9224 gemini-9225; do
  rm -f data/browser-profiles/$p/Singleton{Lock,Cookie,Socket}
done
rm -f data/browser-profile/Singleton{Lock,Cookie,Socket}

# Then re-run the canonical launch above
```

## Open a service homepage to verify login

After launching, allocate a tab and navigate to each homepage so the user (or a subagent) can verify login state:

```bash
node dist/src/cli.js browser:tab:alloc --profile chatgpt     --url https://chatgpt.com/         --tab-id check-chatgpt   --json
node dist/src/cli.js browser:tab:alloc --profile claude-9224 --url https://claude.ai/           --tab-id check-claude    --json
node dist/src/cli.js browser:tab:alloc --profile gemini-9225 --url https://gemini.google.com/   --tab-id check-gemini    --json
```

Free them after the check:
```bash
for t in check-chatgpt check-claude check-gemini; do
  node dist/src/cli.js browser:tab:free --tab-id $t --json
done
```

## What this skill is NOT for

- Login flows (CAPTCHA / SSO) — the user must drive those in the visible Chrome window.
- Cookie inspection — see the cookie-inspection runbook (use Python sqlite3 module on a copy of `<profile>/Default/Cookies`).
- Closing browsers — use `node dist/src/cli.js browser:close --profile <name>`.
