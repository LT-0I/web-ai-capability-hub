#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

FIXER_USER="${FIXER_USER:-n0the2nt1ge2-png}"
REPO="${GH_REPO:-LT-0I/web-ai-capability-hub}"
APPLY=0
LIMIT=20
ONLY_ISSUE=""

usage() {
  cat <<USAGE
Usage: scripts/issuefix-trigger.sh [--apply] [--repo owner/name] [--limit N] [--issue N]

Default is dry-run: list open drift issues and write .omc/codex-prompts/issuefix-auto-<n>.md only.
--apply dispatches omx exec, runs mandatory gates, commits, pushes main, and posts Fixed in <sha> only when every gate is green.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --apply) APPLY=1; shift ;;
    --repo) REPO="$2"; shift 2 ;;
    --repo=*) REPO="${1#--repo=}"; shift ;;
    --limit) LIMIT="$2"; shift 2 ;;
    --limit=*) LIMIT="${1#--limit=}"; shift ;;
    --issue) ONLY_ISSUE="$2"; shift 2 ;;
    --issue=*) ONLY_ISSUE="${1#--issue=}"; shift ;;
    --help|-h) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage >&2; exit 2 ;;
  esac
done

run_id="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
run_dir=".runs/issuefix-trigger/$run_id"
mkdir -p "$run_dir" .omc/codex-prompts .omc/codex-out
log_file="$run_dir/issuefix-trigger.log"

log() { printf '[issuefix-trigger] %s\n' "$*" | tee -a "$log_file"; }

fixer_token() {
  gh auth token --user "$FIXER_USER"
}

gh_fix() {
  local tok="$1"; shift
  GH_TOKEN="$tok" gh "$@"
}

ensure_issue_labels() {
  local tok="$1"
  gh_fix "$tok" label create needs-human --repo "$REPO" --color ededed --description "Automation stopped at a human review gate" --force >/dev/null || true
}

extract_field() {
  local body_file="$1" pattern="$2"
  grep -Eim1 "$pattern" "$body_file" | sed -E 's/^[[:space:]-]*[^:]+:[[:space:]]*`?([^`[:space:]]+).*/\1/' || true
}

write_prompt() {
  local issue_number="$1" title_file="$2" body_file="$3" prompt_file="$4"
  local title target code evidence
  title="$(cat "$title_file")"
  target="$(extract_field "$body_file" 'target(_id)?:')"
  code="$(extract_field "$body_file" 'errorCode:')"
  evidence="$(extract_field "$body_file" 'evidence:')"
  [[ -n "$target" ]] || target="UNKNOWN"
  [[ -n "$code" ]] || code="UNKNOWN"
  cat > "$prompt_file" <<PROMPT
# Issue-fix auto task for #$issue_number

Repo path: $repo_root
GitHub issue: https://github.com/$REPO/issues/$issue_number
Title: $title

## Task
Fix the drift reported for target \`$target\` with error code \`$code\`.
Use the issue body and evidence path below as the source of truth. Prefer the smallest selector/navigation repair that restores the existing public contract.

Evidence path from issue: \`$evidence\`

## Constraints
- Follow CLAUDE.md §2.1 dispatch expectations and repository AGENTS.md.
- Do not add CLI commands, MCP tools, public output fields, contract versions, or golden snapshots.
- Do not touch credentials, bypass login/paywall/CAPTCHA walls, or synthesize success.
- Do not use auto-close commit keywords (Closes/Fixes/Resolves #$issue_number).
- Keep changes small and scoped to the drift root cause.

## Acceptance / gate (the wrapper enforces this after your run)
1. \`rm -rf dist && npm run build\`
2. \`npm test\`
3. \`npm run verify:contract-version\`
4. \`npm run verify:golden\`
5. \`npm run verify:generated-clean\`
6. No forbidden public contract/golden/generated/package drift.

## Expected evidence
Report changed files, root cause, and exact verification commands/results. If this is a wall (LOGIN_REQUIRED / PLAN_OR_QUOTA_REQUIRED / access denial), stop and report honest wall instead of editing.

## Stop condition
Stop after implementing the minimal fix and before committing or pushing. The trigger wrapper owns gate, commit, push, and issue comment.
PROMPT
}

mark_needs_human() {
  local tok="$1" issue="$2" reason="$3"
  ensure_issue_labels "$tok"
  gh_fix "$tok" issue edit "$issue" --repo "$REPO" --add-label needs-human >/dev/null || true
  gh_fix "$tok" issue comment "$issue" --repo "$REPO" --body "Automation stopped before push. Reason: $reason" >/dev/null || true
}

forbidden_staged_paths() {
  git diff --cached --name-only | grep -E '^(configs/consumer-contract\.json|docs/CONSUMER_CONTRACT\.md|tests/golden/|src/generated/|package\.json|package-lock\.json)$' || true
}

apply_workspace_blockers() {
  git status --porcelain | grep -Ev '^(\?\? | M | D )?\.runs/|^\?\? \.omc/codex-prompts/|^\?\? \.omc/codex-out/' || true
}

require_clean_apply_workspace() {
  local blockers
  blockers="$(apply_workspace_blockers)"
  if [[ -n "$blockers" ]]; then
    echo "Refusing --apply with pre-existing dirty workspace outside .runs/.omc evidence:" >&2
    echo "$blockers" >&2
    echo "Clean or isolate the tree before unattended self-heal so unrelated changes cannot be committed." >&2
    exit 3
  fi
}

run_gate() {
  rm -rf dist && npm run build
  npm test
  npm run verify:contract-version
  npm run verify:golden
  npm run verify:generated-clean
}

commit_and_push() {
  local tok="$1" issue="$2" gate_log="$3"
  git add -A -- . ':(exclude).runs/**' ':(exclude).omc/codex-prompts/**' ':(exclude).omc/codex-out/**'
  local forbidden
  forbidden="$(forbidden_staged_paths)"
  if [[ -n "$forbidden" ]]; then
    git reset >/dev/null
    echo "Forbidden public/lock files staged: $forbidden" >&2
    return 3
  fi
  if git diff --cached --quiet; then
    echo "No staged code changes after issue-fix dispatch" >&2
    return 4
  fi
  local msg
  msg="$run_dir/commit-$issue.txt"
  cat > "$msg" <<MSG
Stabilize automated drift issue #$issue

Constraint: Automated push requires clean build, full tests, and 8-lock verification before publishing.
Rejected: Auto-closing issue keywords | Consumer validation closes issues after re-pin.
Confidence: medium
Scope-risk: narrow
Directive: Keep future drift repairs selector-scoped unless the issue proves a contract change is required.
Tested: rm -rf dist && npm run build; npm test; npm run verify:contract-version; npm run verify:golden; npm run verify:generated-clean
Not-tested: Consumer-side LT-0I acceptance remains manual after Fixed-in comment.
MSG
  git commit -F "$msg"
  local sha
  sha="$(git rev-parse HEAD)"
  git -c credential.helper= \
      -c credential."https://github.com".helper="!f(){ echo username=x-access-token; echo password=$tok; };f" \
      push origin main
  gh_fix "$tok" issue comment "$issue" --repo "$REPO" --body-file - <<COMMENT
Fixed in \`$sha\` (on \`main\`).

Root cause / change: see commit \`$sha\`.
Verification: mandatory trigger gate passed. Log: \`$gate_log\`.
Locks unchanged: verify:contract-version, verify:golden, and verify:generated-clean all passed.
COMMENT
}

log "repo=$repo_root gh_repo=$REPO mode=$([[ $APPLY -eq 1 ]] && echo apply || echo dry-run)"
if [[ "$APPLY" -eq 1 ]]; then
  require_clean_apply_workspace
fi
TOK="$(fixer_token)"
issues_json="$run_dir/issues.json"
if [[ -n "$ONLY_ISSUE" ]]; then
  gh_fix "$TOK" issue view "$ONLY_ISSUE" --repo "$REPO" --json number,title,body,url > "$issues_json.tmp"
  node -e "const fs=require('fs'); const v=JSON.parse(fs.readFileSync(process.argv[1],'utf8')); process.stdout.write(JSON.stringify([v], null, 2)+'\\n')" "$issues_json.tmp" > "$issues_json"
else
  gh_fix "$TOK" issue list --repo "$REPO" --label drift --state open --limit "$LIMIT" --json number,title,body,url > "$issues_json"
fi

count="$(node -e "const fs=require('fs'); const a=JSON.parse(fs.readFileSync(process.argv[1],'utf8')); console.log(a.length)" "$issues_json")"
log "open drift issues=$count"

node - <<'NODE' "$issues_json" "$run_dir"
const fs = require('fs');
const path = require('path');
const issues = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const runDir = process.argv[3];
for (const issue of issues) {
  const dir = path.join(runDir, `issue-${issue.number}`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'title.txt'), issue.title || '', 'utf8');
  fs.writeFileSync(path.join(dir, 'body.md'), issue.body || '', 'utf8');
}
NODE

for issue_dir in "$run_dir"/issue-*; do
  [[ -d "$issue_dir" ]] || continue
  issue="${issue_dir##*/issue-}"
  prompt_file=".omc/codex-prompts/issuefix-auto-$issue.md"
  out_file=".omc/codex-out/issuefix-auto-$issue.md"
  write_prompt "$issue" "$issue_dir/title.txt" "$issue_dir/body.md" "$prompt_file"
  log "prepared prompt for #$issue -> $prompt_file"
  if [[ "$APPLY" -ne 1 ]]; then
    continue
  fi

  log "dispatching omx exec for #$issue"
  if ! omx exec -C "$repo_root" --skip-git-repo-check --dangerously-bypass-approvals-and-sandbox --enable fast_mode -c model_reasoning_effort="xhigh" -o "$out_file" - < "$prompt_file" 2>&1 | tee "$issue_dir/omx-exec.log"; then
    mark_needs_human "$TOK" "$issue" "omx exec failed; see $issue_dir/omx-exec.log"
    continue
  fi

  gate_log="$issue_dir/gate.log"
  log "running mandatory gate for #$issue"
  if ! run_gate 2>&1 | tee "$gate_log"; then
    mark_needs_human "$TOK" "$issue" "mandatory gate failed; see $gate_log"
    continue
  fi

  if ! commit_and_push "$TOK" "$issue" "$gate_log" 2>&1 | tee "$issue_dir/push.log"; then
    mark_needs_human "$TOK" "$issue" "commit/push gate failed; see $issue_dir/push.log"
    continue
  fi
  log "# $issue fixed, pushed, and commented"
done

log "complete"
