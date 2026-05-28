#!/usr/bin/env node
"use strict";

// Intentionally written as Node-compatible CommonJS despite the .ts suffix.
// Existing repo scripts use this pattern for build-time utility scripts; the
// wrapper copies this file to dist/scripts/maintenance-sweep.js after a fresh
// build without changing tsconfig or public contract surfaces.

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const FIXER_USER = "n0the2nt1ge2-png";
const DEFAULT_REPO = "LT-0I/web-ai-capability-hub";
const WALL_ERROR_CODES = new Set(["LOGIN_REQUIRED", "PLAN_OR_QUOTA_REQUIRED"]);
const DRIFT_ERROR_CODES = new Set(["ELEMENT_NOT_FOUND", "MODEL_SELECTION_DRIFT", "IFRAME_NOT_FOUND", "UI_DRIFT_DETECTED", "HEAL_CONFIDENCE_LOW"]);
const DEFAULT_ACTIVE_STATUSES = ["IMPLEMENTED_GREEN", "OK_EXT_BACKEND", "OK_MANAGED_CDP_ONLY"];
const DEFERRED_STATUS = "OK_DEFERRED";
const WEB_AI_TARGETS = {
  chatgpt: { service: "chatgpt", targetId: "chatgpt", profile: "chatgpt", launchProfile: "chatgpt", url: "https://chatgpt.com/", toolLabel: "web-AI / ChatGPT" },
  claude: { service: "claude", targetId: "claude", profile: "claude-9224", launchProfile: "claude-9224", url: "https://claude.ai/", toolLabel: "web-AI / Claude" },
  gemini: { service: "gemini", targetId: "gemini", profile: "gemini-9225", launchProfile: "gemini-9225", url: "https://gemini.google.com/", toolLabel: "web-AI / Gemini" }
};

function usage() {
  return `Usage: node dist/scripts/maintenance-sweep.js [options]\n\nLocal read-only drift sweep: launch required browsers, run health checks, classify drift vs wall, and open deduplicated GitHub issues.\n\nOptions:\n  --include-deferred          Include OK_DEFERRED login/paywall rows (default: skip)\n  --status <csv>              Override included integration_registry statuses\n  --target <id[,id]>          Limit to target/service/feature/tool ids; repeatable\n  --service <id[,id]>         Limit to services (chatgpt, claude, gemini, literature); repeatable\n  --max-targets <n>           Limit selected targets (debugging)\n  --run-dir <path>            Evidence output directory (default: .runs/maintenance-sweep/<timestamp>)\n  --repo <owner/name>         GitHub repo for issues (default: gh repo view, then ${DEFAULT_REPO})\n  --dry-run                   Run checks but do not create labels/issues\n  --no-issues                 Never create labels/issues\n  --skip-launch               Assume required browsers are already running\n  --keep-browsers             Do not close browsers at the end\n  --command-timeout-ms <n>    Per-check timeout (default: 300000)\n  --help                      Show this help\n\nSafety: this script only reads local DB/browser state and writes .runs evidence; the only external mutation is deduplicated issue/label creation unless --dry-run/--no-issues is used.`;
}

function parseArgs(argv) {
  const options = {
    includeDeferred: false,
    statuses: undefined,
    targets: [],
    services: [],
    maxTargets: undefined,
    runDir: undefined,
    repo: process.env.GH_REPO || undefined,
    dryRun: false,
    issues: true,
    launch: true,
    closeBrowsers: true,
    commandTimeoutMs: 300000,
    help: false
  };

  function readValue(index, flag) {
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
    return value;
  }

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--include-deferred") options.includeDeferred = true;
    else if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--no-issues") options.issues = false;
    else if (arg === "--skip-launch") options.launch = false;
    else if (arg === "--keep-browsers") options.closeBrowsers = false;
    else if (arg === "--status") { options.statuses = csv(readValue(i, arg)); i++; }
    else if (arg.startsWith("--status=")) options.statuses = csv(arg.slice("--status=".length));
    else if (arg === "--target") { options.targets.push(...csv(readValue(i, arg))); i++; }
    else if (arg.startsWith("--target=")) options.targets.push(...csv(arg.slice("--target=".length)));
    else if (arg === "--service") { options.services.push(...csv(readValue(i, arg))); i++; }
    else if (arg.startsWith("--service=")) options.services.push(...csv(arg.slice("--service=".length)));
    else if (arg === "--max-targets") { options.maxTargets = positiveInt(readValue(i, arg), arg); i++; }
    else if (arg.startsWith("--max-targets=")) options.maxTargets = positiveInt(arg.slice("--max-targets=".length), "--max-targets");
    else if (arg === "--run-dir") { options.runDir = readValue(i, arg); i++; }
    else if (arg.startsWith("--run-dir=")) options.runDir = arg.slice("--run-dir=".length);
    else if (arg === "--repo") { options.repo = readValue(i, arg); i++; }
    else if (arg.startsWith("--repo=")) options.repo = arg.slice("--repo=".length);
    else if (arg === "--command-timeout-ms") { options.commandTimeoutMs = positiveInt(readValue(i, arg), arg); i++; }
    else if (arg.startsWith("--command-timeout-ms=")) options.commandTimeoutMs = positiveInt(arg.slice("--command-timeout-ms=".length), "--command-timeout-ms");
    else throw new Error(`Unknown option: ${arg}`);
  }

  options.targets = Array.from(new Set(options.targets));
  options.services = Array.from(new Set(options.services.map((value) => value.toLowerCase())));
  if (options.dryRun) options.issues = false;
  return options;
}

function csv(value) {
  return String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
}

function positiveInt(value, flag) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new Error(`${flag} must be a positive integer`);
  return n;
}

function timestampForPath(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}

function findRepoRoot(start) {
  let current = path.resolve(start);
  while (true) {
    if (fs.existsSync(path.join(current, "package.json")) && fs.existsSync(path.join(current, "src"))) return current;
    const parent = path.dirname(current);
    if (parent === current) throw new Error("Could not find repo root containing package.json and src/");
    current = parent;
  }
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeJson(file, value) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function runCommand(root, command, args, opts = {}) {
  const startedAt = new Date().toISOString();
  const result = spawnSync(command, args, {
    cwd: opts.cwd || root,
    env: { ...process.env, ...(opts.env || {}) },
    encoding: "utf8",
    timeout: opts.timeoutMs,
    maxBuffer: opts.maxBuffer || 50 * 1024 * 1024
  });
  const finishedAt = new Date().toISOString();
  return {
    command,
    args,
    displayCommand: [command, ...args].join(" "),
    exitCode: typeof result.status === "number" ? result.status : null,
    signal: result.signal || null,
    error: result.error ? String(result.error.message || result.error) : null,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    startedAt,
    finishedAt,
    ok: result.status === 0 && !result.error
  };
}

function parseJsonOutput(stdout) {
  const trimmed = String(stdout || "").trim();
  if (!trimmed) return undefined;
  try { return JSON.parse(trimmed); } catch (_) { /* fall through */ }
  const firstBrace = trimmed.indexOf("{");
  const firstBracket = trimmed.indexOf("[");
  const first = firstBrace === -1 ? firstBracket : firstBracket === -1 ? firstBrace : Math.min(firstBrace, firstBracket);
  if (first >= 0) {
    try { return JSON.parse(trimmed.slice(first)); } catch (_) { return undefined; }
  }
  return undefined;
}

function loadDatabase(root) {
  const modulePath = path.join(root, "dist", "src", "capabilities", "database.js");
  if (!fs.existsSync(modulePath)) throw new Error(`Built database module missing: ${modulePath}. Run rm -rf dist && npm run build first.`);
  const { CapabilityDatabase } = require(modulePath);
  const db = new CapabilityDatabase();
  db.init();
  return db;
}

function includedStatuses(options) {
  if (options.statuses && options.statuses.length) return new Set(options.statuses);
  const statuses = new Set(DEFAULT_ACTIVE_STATUSES);
  if (options.includeDeferred) statuses.add(DEFERRED_STATUS);
  return statuses;
}

function buildInventory(db, options) {
  const statuses = includedStatuses(options);
  const rows = db.listIntegrationRegistry().filter((row) => statuses.has(row.status));
  const services = options.services.length ? new Set(options.services) : undefined;
  const filters = options.targets.length ? new Set(options.targets) : undefined;
  const serviceTargets = new Map(db.listTargets().map((target) => [target.target_id, target]));

  const targets = [];
  for (const service of Object.keys(WEB_AI_TARGETS)) {
    if (services && !services.has(service)) continue;
    const registryRows = rows.filter((row) => row.service === service);
    if (!registryRows.length && !matchesAny(filters, [service, WEB_AI_TARGETS[service].targetId])) continue;
    const target = {
      ...WEB_AI_TARGETS[service],
      id: WEB_AI_TARGETS[service].targetId,
      kind: "web-ai",
      registryRows,
      mcpTools: unique(registryRows.map((row) => row.mcp_tool).filter(Boolean)),
      serviceTarget: serviceTargets.get(WEB_AI_TARGETS[service].targetId) || null
    };
    if (filters && !targetMatches(target, filters)) continue;
    targets.push(target);
  }

  for (const row of rows) {
    if (row.service !== "literature") continue;
    if (services && !services.has("literature")) continue;
    const slug = literatureSlug(row);
    const target = {
      id: row.feature_id,
      kind: "literature",
      service: "literature",
      featureId: row.feature_id,
      slug,
      profile: undefined,
      launchProfile: undefined,
      url: row.raw?.base_url || row.raw?.url || undefined,
      toolLabel: row.mcp_tool || row.name,
      registryRows: [row],
      mcpTools: row.mcp_tool ? [row.mcp_tool] : [],
      serviceTarget: serviceTargets.get(row.feature_id) || (slug ? serviceTargets.get(slug) : null) || null
    };
    if (filters && !targetMatches(target, filters)) continue;
    targets.push(target);
  }

  const limited = options.maxTargets ? targets.slice(0, options.maxTargets) : targets;
  return { targets: limited, selectedStatuses: Array.from(statuses).sort(), totalRegistryRows: rows.length };
}

function unique(items) {
  return Array.from(new Set(items));
}

function literatureSlug(row) {
  if (typeof row.raw?.db_slug === "string") return row.raw.db_slug;
  if (typeof row.mcp_tool === "string") {
    const match = /^webai_([a-z0-9]+)_download_pdf$/.exec(row.mcp_tool);
    if (match) return match[1];
  }
  const match = /^literature-([a-z0-9]+)-/.exec(row.feature_id || "");
  return match?.[1];
}

function matchesAny(filters, values) {
  if (!filters) return true;
  return values.some((value) => value && filters.has(value));
}

function targetMatches(target, filters) {
  return matchesAny(filters, [
    target.id,
    target.service,
    target.featureId,
    target.slug,
    target.profile,
    target.launchProfile,
    ...(target.mcpTools || [])
  ]);
}

function launchBrowsers(root, targets, options, runDir) {
  const profiles = unique(targets.filter((target) => target.kind === "web-ai").map((target) => target.launchProfile).filter(Boolean));
  if (!profiles.length || !options.launch) return { profiles, launch: null };
  const env = { PROFILES: profiles.join(" ") };
  const launch = runCommand(root, "bash", ["scripts/launch-web-ais.sh", "launch"], { env, timeoutMs: 180000 });
  writeJson(path.join(runDir, "browser-launch.json"), { profiles, launch: redactedCommandResult(launch) });
  if (!launch.ok) throw new Error(`Browser launch failed for ${profiles.join(", ")}; see ${path.join(runDir, "browser-launch.json")}`);
  return { profiles, launch };
}

function closeBrowsers(root, profiles, options, runDir) {
  if (!profiles.length || !options.closeBrowsers || !options.launch) return null;
  const env = { PROFILES: profiles.join(" ") };
  const close = runCommand(root, "bash", ["scripts/launch-web-ais.sh", "close"], { env, timeoutMs: 120000 });
  writeJson(path.join(runDir, "browser-close.json"), { profiles, close: redactedCommandResult(close) });
  return close;
}

function redactedCommandResult(result) {
  return { ...result, stdout: truncate(result.stdout, 20000), stderr: truncate(result.stderr, 20000) };
}

function truncate(value, max) {
  const text = String(value || "");
  return text.length > max ? `${text.slice(0, max)}\n...[truncated ${text.length - max} bytes]` : text;
}

function runCliJson(root, args, timeoutMs) {
  const result = runCommand(root, "node", ["dist/src/cli.js", ...args], { timeoutMs });
  return { result: redactedCommandResult(result), json: parseJsonOutput(result.stdout) };
}

function sweepTarget(root, target, options, runDir) {
  if (target.kind === "web-ai") return sweepWebAiTarget(root, target, options, runDir);
  return sweepRegistryOnlyTarget(target, runDir);
}

function sweepWebAiTarget(root, target, options, runDir) {
  const targetDir = path.join(runDir, safeFileName(target.id));
  ensureDir(targetDir);

  const healthArgs = ["capability:health-check", "--target", target.targetId, "--profile", target.profile, "--url", target.url, "--json"];
  const health = runCliJson(root, healthArgs, options.commandTimeoutMs);
  const smokeArgs = ["consumer:health", "--target", target.service, "--profile", target.profile, "--json"];
  const smoke = runCliJson(root, smokeArgs, options.commandTimeoutMs);

  const classification = classifyWebAi(health, smoke);
  const evidence = {
    target: publicTarget(target),
    checkedAt: new Date().toISOString(),
    classification,
    healthCheck: { args: healthArgs, ...health },
    positiveSmoke: { args: smokeArgs, ...smoke },
    safety: {
      readOnly: true,
      noCredentialCapture: true,
      noWallBypass: true,
      noCodeMutation: true
    }
  };
  const evidencePath = path.join(targetDir, "evidence.json");
  writeJson(evidencePath, evidence);
  return { ...classification, target: publicTarget(target), evidencePath: relativePath(evidencePath), healthSummary: summarizeHealth(health.json), smokeSummary: summarizeSmoke(smoke.json) };
}

function sweepRegistryOnlyTarget(target, runDir) {
  const targetDir = path.join(runDir, safeFileName(target.id));
  ensureDir(targetDir);
  const classification = {
    status: "skipped",
    errorCode: null,
    reasons: [
      "No selector-health service target or safe positive-smoke recipe is registered for this integration_registry literature feature.",
      "Skipped instead of opening a false drift issue; configure a feature-specific smoke before enabling live research checks."
    ],
    issueEligible: false
  };
  const evidence = {
    target: publicTarget(target),
    checkedAt: new Date().toISOString(),
    classification,
    registryRows: target.registryRows,
    safety: {
      readOnly: true,
      noMassDownload: true,
      noCredentialCapture: true,
      noWallBypass: true,
      noCodeMutation: true
    }
  };
  const evidencePath = path.join(targetDir, "evidence.json");
  writeJson(evidencePath, evidence);
  return { ...classification, target: publicTarget(target), evidencePath: relativePath(evidencePath), healthSummary: null, smokeSummary: null };
}

function classifyWebAi(health, smoke) {
  const reasons = [];
  const healthJson = health.json;
  const smokeJson = smoke.json;
  const healthCommandError = health.result.ok ? null : commandErrorCode(health.result, healthJson);
  const smokeCommandError = smoke.result.ok ? null : commandErrorCode(smoke.result, smokeJson);
  const smokeCode = typeof smokeJson?.errorCode === "string" ? smokeJson.errorCode : smokeCommandError;

  if (healthCommandError) reasons.push(`health-check command error: ${healthCommandError}`);
  if (smokeCommandError && smokeCommandError !== smokeCode) reasons.push(`positive-smoke command error: ${smokeCommandError}`);
  if (smokeCode) reasons.push(`positive-smoke errorCode: ${smokeCode}`);

  if (healthJson && Number(healthJson.blocked || 0) > 0) reasons.push(`health-check blocked=${healthJson.blocked}`);
  if (smokeJson?.status === "blocked") reasons.push("consumer:health status=blocked");
  if (smokeJson?.loginLikeState === "unhealthy") reasons.push("consumer:health loginLikeState=unhealthy");
  if (smokeCode && WALL_ERROR_CODES.has(smokeCode)) {
    return { status: "wall", errorCode: smokeCode, reasons, issueEligible: false };
  }
  if (healthCommandError && WALL_ERROR_CODES.has(healthCommandError)) {
    return { status: "wall", errorCode: healthCommandError, reasons, issueEligible: false };
  }
  if ((healthJson && Number(healthJson.blocked || 0) > 0) || smokeJson?.status === "blocked") {
    return { status: "wall", errorCode: smokeCode || "LOGIN_REQUIRED", reasons, issueEligible: false };
  }

  if (healthJson && Number(healthJson.missing || 0) > 0) reasons.push(`health-check missing=${healthJson.missing}`);
  if (healthJson && Number(healthJson.ambiguous || 0) > 0) reasons.push(`health-check ambiguous=${healthJson.ambiguous}`);
  if (smokeCode && DRIFT_ERROR_CODES.has(smokeCode)) reasons.push(`drift errorCode=${smokeCode}`);
  if (healthCommandError && DRIFT_ERROR_CODES.has(healthCommandError)) reasons.push(`health-check drift errorCode=${healthCommandError}`);

  if ((healthJson && (Number(healthJson.missing || 0) > 0 || Number(healthJson.ambiguous || 0) > 0)) || (smokeCode && DRIFT_ERROR_CODES.has(smokeCode)) || (healthCommandError && DRIFT_ERROR_CODES.has(healthCommandError))) {
    return { status: "drift", errorCode: smokeCode || healthCommandError || "HEALTH_CHECK_SELECTOR_DRIFT", reasons, issueEligible: true };
  }

  if (!health.result.ok || !smoke.result.ok) {
    const code = smokeCode || healthCommandError || "UNKNOWN";
    return { status: "needs_review", errorCode: code, reasons: reasons.length ? reasons : ["A command failed without a wall/drift error code."], issueEligible: false };
  }

  if (healthJson && Number(healthJson.needs_review || 0) > 0) {
    return { status: "needs_review", errorCode: "HEALTH_CHECK_NEEDS_REVIEW", reasons: [`health-check needs_review=${healthJson.needs_review}`], issueEligible: false };
  }

  return { status: "green", errorCode: null, reasons: ["health-check and positive smoke did not report wall or drift"], issueEligible: false };
}

function commandErrorCode(result, json) {
  if (typeof json?.errorCode === "string") return json.errorCode;
  const text = `${result.stdout || ""}\n${result.stderr || ""}`;
  for (const code of [...WALL_ERROR_CODES, ...DRIFT_ERROR_CODES, "COMMAND_TIMEOUT", "UNKNOWN", "BROWSER_NOT_LAUNCHED", "PROFILE_NOT_FOUND", "TARGET_PAGE_MISSING"]) {
    if (text.includes(code)) return code;
  }
  if (result.signal === "SIGTERM" || /timed out|timeout/i.test(String(result.error || result.stderr))) return "COMMAND_TIMEOUT";
  return result.ok ? null : "UNKNOWN";
}

function summarizeHealth(report) {
  if (!report || typeof report !== "object") return null;
  return {
    target_id: report.target_id,
    checked_at: report.checked_at,
    total: report.total,
    ok: report.ok,
    missing: report.missing,
    ambiguous: report.ambiguous,
    blocked: report.blocked,
    needs_review: report.needs_review,
    failingItems: Array.isArray(report.items)
      ? report.items.filter((item) => item.result && item.result !== "ok").slice(0, 20).map((item) => ({ name: item.name, category: item.category, result: item.result, selectors_checked: item.selectors_checked }))
      : []
  };
}

function summarizeSmoke(smoke) {
  if (!smoke || typeof smoke !== "object") return null;
  return {
    ok: smoke.ok,
    target: smoke.target,
    profile: smoke.profile,
    connected: smoke.connected,
    pageCount: smoke.pageCount,
    loginLikeState: smoke.loginLikeState,
    status: smoke.status,
    errorCode: smoke.errorCode,
    message: smoke.message,
    checkedAt: smoke.checkedAt
  };
}

function publicTarget(target) {
  return {
    id: target.id,
    kind: target.kind,
    service: target.service,
    featureId: target.featureId,
    slug: target.slug,
    profile: target.profile,
    url: target.url,
    toolLabel: target.toolLabel,
    mcpTools: target.mcpTools,
    registryFeatureCount: target.registryRows?.length || 0,
    registryStatuses: unique((target.registryRows || []).map((row) => row.status)).sort()
  };
}

function safeFileName(value) {
  return String(value).replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "target";
}

function relativePath(file) {
  return path.relative(process.cwd(), file) || file;
}

function detectRepo(root, explicitRepo) {
  if (explicitRepo) return explicitRepo;
  const result = runCommand(root, "gh", ["repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner"], { timeoutMs: 10000 });
  if (result.ok && result.stdout.trim()) return result.stdout.trim();
  return DEFAULT_REPO;
}

function getFixerToken(root) {
  const result = runCommand(root, "gh", ["auth", "token", "--user", FIXER_USER], { timeoutMs: 10000 });
  if (!result.ok || !result.stdout.trim()) throw new Error(`Could not obtain gh token for ${FIXER_USER}: ${result.stderr || result.error || "empty token"}`);
  return result.stdout.trim();
}

function runGh(root, token, args, timeoutMs = 30000) {
  return runCommand(root, "gh", args, { env: { GH_TOKEN: token }, timeoutMs });
}

function ensureLabels(root, token, repo) {
  const labels = [
    ["drift", "d73a4a", "Automatically detected UI/selector drift"],
    ["auto-detected", "6f42c1", "Created by local maintenance-sweep automation"],
    ["needs-human", "ededed", "Automation stopped at a human review gate"]
  ];
  const results = [];
  for (const [name, color, description] of labels) {
    results.push(runGh(root, token, ["label", "create", name, "--repo", repo, "--color", color, "--description", description, "--force"], 30000));
  }
  return results;
}

function listOpenDriftIssues(root, token, repo) {
  const result = runGh(root, token, ["issue", "list", "--repo", repo, "--label", "drift", "--state", "open", "--limit", "200", "--json", "number,title,body,url,labels"], 30000);
  if (!result.ok) throw new Error(`gh issue list failed: ${result.stderr || result.error}`);
  const parsed = parseJsonOutput(result.stdout);
  return Array.isArray(parsed) ? parsed : [];
}

function issueMatchesTarget(issue, targetResult) {
  const haystack = `${issue.title || ""}\n${issue.body || ""}`.toLowerCase();
  const values = [targetResult.target.id, targetResult.target.service, targetResult.target.featureId, ...(targetResult.target.mcpTools || [])]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase());
  return values.some((value) => haystack.includes(`target: ${value}`) || haystack.includes(`target_id: ${value}`) || haystack.includes(`target_id=${value}`) || haystack.includes(value));
}

function createIssueForDrift(root, token, repo, targetResult, runDir) {
  const existing = listOpenDriftIssues(root, token, repo).find((issue) => issueMatchesTarget(issue, targetResult));
  if (existing) return { skipped: true, reason: "existing-open-drift-issue", issue: { number: existing.number, url: existing.url, title: existing.title } };

  const title = `[drift] ${targetResult.target.id} ${targetResult.target.toolLabel || targetResult.target.kind} UI drift`;
  const body = issueBody(targetResult);
  const bodyPath = path.join(runDir, `${safeFileName(targetResult.target.id)}-issue-body.md`);
  fs.writeFileSync(bodyPath, body, "utf8");
  const result = runGh(root, token, ["issue", "create", "--repo", repo, "--title", title, "--body-file", bodyPath, "--label", "drift", "--label", "auto-detected"], 30000);
  if (!result.ok) return { skipped: false, error: result.stderr || result.error || result.stdout, bodyPath: relativePath(bodyPath) };
  return { skipped: false, url: result.stdout.trim(), bodyPath: relativePath(bodyPath), title };
}

function issueBody(targetResult) {
  const health = targetResult.healthSummary;
  const smoke = targetResult.smokeSummary;
  const failingItems = health?.failingItems?.length ? JSON.stringify(health.failingItems, null, 2) : "[]";
  return `## Automated drift report\n\n- target: ${targetResult.target.id}\n- target_id: ${targetResult.target.id}\n- kind: ${targetResult.target.kind}\n- service/tool: ${(targetResult.target.mcpTools || []).join(", ") || targetResult.target.toolLabel || targetResult.target.service}\n- errorCode: ${targetResult.errorCode || "HEALTH_CHECK_SELECTOR_DRIFT"}\n- detectedAt: ${new Date().toISOString()}\n- evidence: ${targetResult.evidencePath}\n\n### Classification\n\nDRIFT was selected only because the health check reported selector \`missing\`/\`ambiguous\` or the positive smoke surfaced a non-wall drift code such as \`ELEMENT_NOT_FOUND\` / \`MODEL_SELECTION_DRIFT\`. LOGIN_REQUIRED / PLAN_OR_QUOTA_REQUIRED / blocked pages are classified as WALL and are not filed.\n\nReasons:\n${(targetResult.reasons || []).map((reason) => `- ${reason}`).join("\n")}\n\n### Health-check summary\n\n\`\`\`json\n${JSON.stringify({ health, smoke }, null, 2)}\n\`\`\`\n\nFailing health-check items (first 20):\n\n\`\`\`json\n${failingItems}\n\`\`\`\n\n### Reproduce locally\n\n\`\`\`bash\nexport DISPLAY=:0\nexport XAUTHORITY=/run/user/1000/gdm/Xauthority\nrm -rf dist && npm run build\nscripts/maintenance-sweep.sh --target ${shellQuote(targetResult.target.id)} --dry-run\nnode dist/src/cli.js capability:health-check --target ${shellQuote(targetResult.target.id)} --profile ${shellQuote(targetResult.target.profile || targetResult.target.id)} --url ${shellQuote(targetResult.target.url || "<registered-base-url>")} --json\n\`\`\`\n\n### Safety\n\nThe sweep did not edit code, push commits, record credentials, or bypass login/paywall/CAPTCHA walls.\n`;
}

function shellQuote(value) {
  const text = String(value);
  if (/^[A-Za-z0-9_./:@-]+$/.test(text)) return text;
  return `'${text.replace(/'/g, `'"'"'`)}'`;
}

function countByStatus(results) {
  const counts = { targets: results.length, green: 0, drift: 0, wall: 0, skipped: 0, needs_review: 0 };
  for (const result of results) {
    if (Object.prototype.hasOwnProperty.call(counts, result.status)) counts[result.status] += 1;
  }
  return counts;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return 0;
  }

  const root = findRepoRoot(__dirname);
  process.chdir(root);
  const runDir = path.resolve(options.runDir || path.join(root, ".runs", "maintenance-sweep", timestampForPath()));
  ensureDir(runDir);

  const db = loadDatabase(root);
  const inventory = buildInventory(db, options);
  const repo = detectRepo(root, options.repo);
  const report = {
    ok: true,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    repo,
    runDir: relativePath(runDir),
    options: {
      includeDeferred: options.includeDeferred,
      selectedStatuses: inventory.selectedStatuses,
      targets: options.targets,
      services: options.services,
      dryRun: options.dryRun,
      issues: options.issues,
      launch: options.launch,
      closeBrowsers: options.closeBrowsers,
      commandTimeoutMs: options.commandTimeoutMs
    },
    inventory: {
      selectedTargets: inventory.targets.map(publicTarget),
      totalRegistryRows: inventory.totalRegistryRows
    },
    counts: { targets: 0, green: 0, drift: 0, wall: 0, skipped: 0, needs_review: 0 },
    results: [],
    issues: [],
    errors: []
  };

  let launchedProfiles = [];
  try {
    const launch = launchBrowsers(root, inventory.targets, options, runDir);
    launchedProfiles = launch.profiles;
    for (const target of inventory.targets) {
      const result = sweepTarget(root, target, options, runDir);
      report.results.push(result);
      writeJson(path.join(runDir, "sweep-report.partial.json"), { ...report, counts: countByStatus(report.results) });
    }

    report.counts = countByStatus(report.results);

    const driftResults = report.results.filter((result) => result.status === "drift" && result.issueEligible);
    if (options.issues && driftResults.length) {
      const token = getFixerToken(root);
      const labelResults = ensureLabels(root, token, repo);
      report.issues.push({ labelsEnsured: labelResults.map((result) => ({ ok: result.ok, stderr: truncate(result.stderr, 1000) })) });
      for (const drift of driftResults) {
        const issue = createIssueForDrift(root, token, repo, drift, runDir);
        report.issues.push({ target: drift.target.id, ...issue });
        if (issue.error) report.ok = false;
      }
    } else if (!options.issues && driftResults.length) {
      report.issues.push({ dryRun: options.dryRun, noIssues: true, wouldCreate: driftResults.map((result) => result.target.id) });
    }
  } catch (error) {
    report.ok = false;
    report.errors.push(error instanceof Error ? error.stack || error.message : String(error));
  } finally {
    try { closeBrowsers(root, launchedProfiles, options, runDir); }
    catch (error) { report.ok = false; report.errors.push(`browser close failed: ${error instanceof Error ? error.message : String(error)}`); }
    report.finishedAt = new Date().toISOString();
    report.counts = countByStatus(report.results);
    writeJson(path.join(runDir, "sweep-report.json"), report);
  }

  console.log(JSON.stringify({ ok: report.ok, runDir: report.runDir, counts: report.counts, issues: report.issues }, null, 2));
  return report.ok ? 0 : 1;
}

main().then((code) => { process.exitCode = code; }).catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
