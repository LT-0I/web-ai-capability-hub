# Automated Maintenance Loop — local sweep → issue → gated self-heal

This project drives real web UIs whose DOM and workflows drift frequently. The
maintenance loop is deliberately **local-first** because GitHub-hosted runners do
not have the required visible Chrome sessions, CDP ports, `DISPLAY`, `XAUTHORITY`,
or logged-in browser profiles.

The loop has two independent parts:

1. **Detect and file** (`scripts/maintenance-sweep.sh` →
   `scripts/maintenance-sweep.ts`): read the local registry, launch only the
   required managed Chrome profiles, run read-only checks, classify failures, and
   open deduplicated GitHub issues for genuine drift.
2. **Self-heal with gates** (`scripts/issuefix-trigger.sh --apply`): consume open
   `drift` issues, dispatch the existing Codex/OMX issue-fix flow, and push only
   after build, tests, and lock checks are green. The default mode is dry-run.

No new CLI command, MCP tool, public contract field, golden snapshot, or
consumer-facing surface is introduced by this scaffold.

---

## Architecture

```text
local cron/systemd timer
  └─ scripts/maintenance-sweep.sh
       ├─ DISPLAY=:0 XAUTHORITY=/run/user/1000/gdm/Xauthority
       ├─ rm -rf dist && npm run build
       ├─ copy scripts/maintenance-sweep.ts → dist/scripts/maintenance-sweep.js
       └─ node dist/scripts/maintenance-sweep.js
            ├─ read integration_registry from data/capability-hub.sqlite
            ├─ select web-AI + implemented/OK managed targets
            ├─ launch only needed Chrome profiles via scripts/launch-web-ais.sh
            ├─ run capability:health-check per web-AI target
            ├─ run consumer:health as the minimal positive web-AI smoke
            ├─ classify GREEN / DRIFT / WALL / needs_review / skipped
            ├─ write .runs/maintenance-sweep/<timestamp>/... evidence JSON
            └─ create GitHub issue if DRIFT and no open drift issue matches target

open GitHub drift issue
  └─ scripts/issuefix-trigger.sh --apply       # optional, default dry-run
       ├─ gh issue list --label drift --state open
       ├─ write .omc/codex-prompts/issuefix-auto-<n>.md
       ├─ omx exec ... -o .omc/codex-out/issuefix-auto-<n>.md
       ├─ mandatory gate: build + npm test + 8-lock checks
       ├─ commit without auto-close keywords
       ├─ push origin main as n0the2nt1ge2-png using per-command token helper
       └─ comment: Fixed in `<sha>` (on `main`).

consumer / LT-0I
  └─ re-pin, verify, and close the issue manually/externally
```

### Existing components reused

- `src/capabilities/healthCheck.ts`: selector verification and blocked-page
  detection (`sign in`, login, 401/403/429/5xx, CAPTCHA/access-denied markers).
- `consumer:health`: narrow connectivity and login-like health smoke for safe
  consumers.
- `snapshot:capture` / `snapshot:diff`: optional site-map probes when a drift
  issue needs deeper root cause evidence.
- `.omc/ISSUE_FIX_LOOP.md`: identity separation and existing issue-fix loop
  signal contract.
- `scripts/launch-web-ais.sh`: canonical Chrome profile/port launcher
  (`chatgpt` 9223, `claude-9224` 9224, `gemini-9225` 9225).

---

## Sweep target selection

`maintenance-sweep.ts` reads `integration_registry` and selects:

- web-AI services `chatgpt`, `claude`, and `gemini` when they have rows in the
  included statuses;
- literature/research rows as registry targets for reporting, currently skipped
  unless a safe feature-specific smoke exists.

Default included statuses:

- `IMPLEMENTED_GREEN`
- `OK_EXT_BACKEND`
- `OK_MANAGED_CDP_ONLY`

`OK_DEFERRED` is skipped by default because it usually represents login,
institutional access, or paywall/plan walls. Use `--include-deferred` only for a
controlled, low-frequency local run.

Useful filters:

```bash
scripts/maintenance-sweep.sh --target chatgpt
scripts/maintenance-sweep.sh --service chatgpt,claude --dry-run
scripts/maintenance-sweep.sh --include-deferred --service literature --dry-run
```

---

## Drift vs wall classification

The sweep opens issues only for **DRIFT**.

### GREEN

- `capability:health-check` has no `missing` or `ambiguous` selectors;
- the web-AI `consumer:health` positive smoke reports `ok`.

### DRIFT — issue candidate

A target is classified as DRIFT when at least one of these is true and the page is
not blocked by a wall:

- health-check selector result has `missing > 0`;
- health-check selector result has `ambiguous > 0`;
- smoke/command error code is a non-wall drift code such as
  `ELEMENT_NOT_FOUND`, `MODEL_SELECTION_DRIFT`, `IFRAME_NOT_FOUND`,
  `UI_DRIFT_DETECTED`, or `HEAL_CONFIDENCE_LOW`.

Before creating an issue, the script queries:

```bash
gh issue list --label drift --state open --json number,title,body,url,labels
```

and skips creation if the open issue title/body already mentions the same target,
feature id, service, or MCP tool.

### WALL — recorded but not filed

A target is classified as WALL and **does not open an issue** when the evidence
indicates environment/account access rather than a driver bug:

- health-check result has `blocked > 0`;
- `consumer:health` reports `status: "blocked"` or `loginLikeState:
  "unhealthy"`;
- error code is `LOGIN_REQUIRED` or `PLAN_OR_QUOTA_REQUIRED`;
- snapshot text matches login/access/CAPTCHA/HTTP wall markers already handled by
  `snapshotLooksBlocked()`.

This preserves the §2.3 honest-failure boundary: no CAPTCHA bypass, no synthetic
success, no credential capture, and no issue spam for missing login/institutional
access.

### needs_review / skipped

- `needs_review`: command failed without a stable wall/drift code, or the health
  report asks for review. The sweep records evidence but does not file.
- `skipped`: registry row has no safe selector target or positive-smoke recipe
  yet. Current literature download rows fall here to avoid accidental mass
  downloads or paywall probing.

---

## Evidence layout

Each run writes to `.runs/maintenance-sweep/<timestamp>/`:

- `sweep-report.json`: whole-run summary with target counts and issue actions;
- `sweep-report.partial.json`: updated after each target for crash recovery;
- `<target>/evidence.json`: health-check command, smoke command, raw stdout/stderr
  snippets, parsed JSON summaries, and classification reasons;
- `<target>-issue-body.md`: body used for a newly created issue;
- `browser-launch.json` / `browser-close.json`: launcher evidence when browsers
  are managed by the sweep.

The sweep script is read-only with respect to code and local secrets. It writes
only `.runs` artifacts and, when enabled, GitHub labels/issues.

---

## Enable with cron

Install the crontab on the machine that owns the visible browser profiles:

```cron
# Daily web-AI drift sweep at 03:00 local time. Logs and JSON land in .runs/.
0 3 * * * cd /home/l1u/workspace/noeticmind/web-ai-capability-hub && \
  DISPLAY=:0 XAUTHORITY=/run/user/1000/gdm/Xauthority \
  scripts/maintenance-sweep.sh --service chatgpt,claude,gemini \
  >> .runs/maintenance-sweep/cron.log 2>&1
```

Recommended cadence:

- web-AI (`chatgpt`, `claude`, `gemini`): daily or twice daily if active
  workflows depend on them;
- literature/research databases: weekly or manual targeted runs only after a
  feature-specific smoke is defined;
- World Scientific / `worldsci`: keep low frequency. Past runs hit IP/access
  blocking; treat walls as environment state, not driver drift.

---

## Enable with systemd timer

`~/.config/systemd/user/web-ai-maintenance-sweep.service`:

```ini
[Unit]
Description=web-ai-capability-hub local maintenance sweep

[Service]
Type=oneshot
WorkingDirectory=/home/l1u/workspace/noeticmind/web-ai-capability-hub
Environment=DISPLAY=:0
Environment=XAUTHORITY=/run/user/1000/gdm/Xauthority
ExecStart=/home/l1u/workspace/noeticmind/web-ai-capability-hub/scripts/maintenance-sweep.sh --service chatgpt,claude,gemini
```

`~/.config/systemd/user/web-ai-maintenance-sweep.timer`:

```ini
[Unit]
Description=Run web-ai-capability-hub maintenance sweep daily

[Timer]
OnCalendar=*-*-* 03:00:00
Persistent=true
RandomizedDelaySec=10m

[Install]
WantedBy=timers.target
```

Enable:

```bash
systemctl --user daemon-reload
systemctl --user enable --now web-ai-maintenance-sweep.timer
systemctl --user list-timers web-ai-maintenance-sweep.timer
```

---

## GitHub issue behavior

The sweep uses the fixer account without switching global gh state:

```bash
TOK=$(gh auth token --user n0the2nt1ge2-png)
GH_TOKEN="$TOK" gh issue create --repo LT-0I/web-ai-capability-hub ...
```

It ensures labels `drift`, `auto-detected`, and `needs-human` exist, then creates
issues with:

- title containing target and tool/service;
- labels `drift` and `auto-detected`;
- body fields for `target`, `target_id`, `errorCode`, evidence JSON path,
  health-check/smoke summaries, reproduce command, and safety notes.

Manual reports should use `.github/ISSUE_TEMPLATE/drift-report.yml`.

---

## Optional self-heal trigger

Default dry-run:

```bash
scripts/issuefix-trigger.sh
```

This lists open `drift` issues and writes prompt files under
`.omc/codex-prompts/issuefix-auto-<n>.md`. It does not dispatch Codex, modify
code, commit, push, or comment.

Apply mode:

```bash
scripts/issuefix-trigger.sh --apply --limit 3
```

For each issue, apply mode:

0. refuses to start if the workspace is already dirty outside `.runs/` and `.omc/` evidence paths, so unrelated local edits cannot be swept into an unattended commit;
1. extracts target/error/evidence from the issue body;
2. writes `.omc/codex-prompts/issuefix-auto-<n>.md`;
3. runs the existing `omx exec` dispatch shape from `CLAUDE.md` §2.1;
4. runs the mandatory gate;
5. commits with a Lore-style message that avoids auto-close keywords;
6. pushes `origin main` using the per-command fixer token helper;
7. comments `Fixed in <sha>` for the consumer to re-pin and validate.

Consumer-side acceptance and issue closure remain external/manual. The trigger
never closes drift issues itself.

---

## Mandatory self-heal gate

Any failure stops before push, labels the issue `needs-human`, and comments the
reason.

```bash
rm -rf dist && npm run build
npm test
npm run verify:contract-version
npm run verify:golden
npm run verify:generated-clean
```

Additional guard in `issuefix-trigger.sh` before commit:

- no staged `configs/consumer-contract.json`;
- no staged `docs/CONSUMER_CONTRACT.md`;
- no staged `tests/golden/`;
- no staged `src/generated/`;
- no staged `package.json` / `package-lock.json`.

This script intentionally forbids force-push, git config mutation, and
`--no-verify`.

---

## Unattended push risk and mitigation

`issuefix-trigger.sh --apply` can modify and push `main` without a human in the
loop. That is useful only for narrow selector drift, and it carries real risk.
Mitigations built into the scaffold:

- dry-run by default;
- explicit `--apply` required for any code modification/push path;
- Codex receives a scoped prompt and stops before commit/push;
- full build + full test suite + 8-lock checks are mandatory;
- public contract/golden/generated/package files are rejected before commit;
- normal push only, no force-push;
- commit message avoids `Closes` / `Fixes` / `Resolves` so the consumer remains
  responsible for issue closure after re-pin;
- GitHub writes use `GH_TOKEN=$(gh auth token --user n0the2nt1ge2-png)` per
  command and never `gh auth switch`.

If the gate fails, or the evidence points to login/quota/paywall/access denial,
automation must stop with an honest diagnostic and a `needs-human` label.
