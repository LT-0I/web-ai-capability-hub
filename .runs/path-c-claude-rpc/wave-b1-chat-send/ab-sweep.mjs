#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const OUT_DIR = path.join(process.cwd(), ".runs/path-c-claude-rpc/wave-b1-chat-send");
const OUT_PATH = path.join(OUT_DIR, "ab-sweep-results.json");
const PROFILE = "claude-9224";
const CDP_PORT = 9224;
const MIN_GAP_MS = Number(process.env.CLAUDE_AB_MIN_GAP_MS || 30000);

const { webAiClaudeSendPrompt } = await import(pathToFileUrl(path.join(process.cwd(), "dist/src/mcp/tools.js")));

function pathToFileUrl(filePath) {
  const resolved = path.resolve(filePath).replace(/\\/g, "/");
  return `file://${resolved.startsWith("/") ? "" : "/"}${resolved}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function wordSet(value) {
  const words = normalizeText(value).toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
  return new Set(words);
}

function textSimilarity(a, b) {
  const left = wordSet(a);
  const right = wordSet(b);
  if (!left.size && !right.size) return 1;
  if (!left.size || !right.size) return 0;
  let intersection = 0;
  for (const item of left) if (right.has(item)) intersection += 1;
  return intersection / (left.size + right.size - intersection);
}

function resultErrorCode(result) {
  return result?.errorCode || result?.error_code || null;
}

function accountRisk(result) {
  const code = resultErrorCode(result);
  const haystack = JSON.stringify(result || {});
  return code === "PLAN_OR_QUOTA_REQUIRED" || /\b429\b|rate.?limit|message_limit|quota|lockout|account.*locked/i.test(haystack);
}

function correctByExpectation(variant, text) {
  const normalized = normalizeText(text).toLowerCase();
  switch (variant) {
    case "basic": return /(^|\D)4(\D|$)/.test(normalized);
    case "thinking": return /391/.test(normalized);
    case "web_search": return normalized.length >= 12;
    case "style_concise": return /photosynthesis/.test(normalized) && normalized.length >= 20;
    case "style_explanatory": return /photosynthesis|plants|light/.test(normalized) && normalized.length >= 20;
    case "incognito": return /ok[_\s-]*incognito/.test(normalized);
    case "model_haiku": return /ok[_\s-]*haiku/.test(normalized);
    case "model_sonnet": return /ok[_\s-]*sonnet/.test(normalized);
    case "reuse_conversation": return /ok[_\s-]*reuse/.test(normalized);
    case "attachment_mode_none": return /ok[_\s-]*(no[_\s-]*)?attach/.test(normalized);
    default: return normalized.length > 0;
  }
}

const variants = [
  { variant: "basic", args: { prompt: "what is 2+2? Reply with only the number." } },
  { variant: "thinking", args: { prompt: "show your reasoning briefly for 17×23, then end with ANSWER: 391.", thinking: true } },
  { variant: "web_search", args: { prompt: "what's the weather in Beijing today? Reply in one short sentence.", web_search: true } },
  { variant: "style_concise", args: { prompt: "Define photosynthesis in one short sentence.", style: "concise" } },
  { variant: "style_explanatory", args: { prompt: "Explain photosynthesis in one short sentence for a student.", style: "explanatory" } },
  { variant: "incognito", args: { prompt: "Reply with only OK_INCOGNITO.", incognito: true } },
  { variant: "model_haiku", args: { prompt: "Reply with only OK_HAIKU.", model: "Haiku 4.5" } },
  { variant: "model_sonnet", args: { prompt: "Reply with only OK_SONNET.", model: "Sonnet 4.6" } },
  { variant: "reuse_conversation", args: { prompt: "Continue this conversation and reply with only OK_REUSE.", reuse_conversation: true } },
  { variant: "attachment_mode_none", args: { prompt: "Reply with only OK_NO_ATTACH.", attachment_mode: "none" } }
];

let lastClaudeCallAt = 0;

async function pace(label) {
  const now = Date.now();
  const elapsed = now - lastClaudeCallAt;
  if (lastClaudeCallAt && elapsed < MIN_GAP_MS) {
    const waitMs = MIN_GAP_MS - elapsed;
    console.error(`[ab-sweep] pacing ${waitMs}ms before ${label}`);
    await sleep(waitMs);
  }
  lastClaudeCallAt = Date.now();
}

async function callClaude(backend, args) {
  await pace(`${backend}:${args.prompt.slice(0, 32)}`);
  const previous = process.env.WEBAI_CLAUDE_SEND_BACKEND;
  process.env.WEBAI_CLAUDE_SEND_BACKEND = backend === "dom" ? "managed-cdp" : "rpc";
  const started = Date.now();
  try {
    const result = await webAiClaudeSendPrompt({
      profile: PROFILE,
      cdp_port: CDP_PORT,
      cdpPort: CDP_PORT,
      response_timeout_ms: 120000,
      timeout_ms: 60000,
      ...args
    });
    const latencyMs = Date.now() - started;
    return {
      ok: resultErrorCode(result) == null && Boolean(result?.completion_detected ?? result?.response_text),
      latency_ms: latencyMs,
      response_text: result?.response_text || "",
      errorCode: resultErrorCode(result),
      conversation_id: result?.conversation_id || null,
      chat_url: result?.chat_url || null,
      model_used: result?.model_used || null,
      http_status: result?.http_status ?? null,
      raw: result
    };
  } catch (error) {
    return {
      ok: false,
      latency_ms: Date.now() - started,
      response_text: "",
      errorCode: error?.errorCode || error?.code || "THROWN",
      message: error?.message || String(error)
    };
  } finally {
    if (previous === undefined) delete process.env.WEBAI_CLAUDE_SEND_BACKEND;
    else process.env.WEBAI_CLAUDE_SEND_BACKEND = previous;
  }
}

function writeResults(results) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(results, null, 2));
}

const buildTools = path.join(process.cwd(), "dist/src/mcp/tools.js");
let lastConversationUrl = null;

const results = {
  started_at: new Date().toISOString(),
  profile: PROFILE,
  cdp_port: CDP_PORT,
  min_gap_ms: MIN_GAP_MS,
  dist_tools_mtime_ms: fs.existsSync(buildTools) ? fs.statSync(buildTools).mtimeMs : null,
  variants: [],
  pass_count: 0,
  blocked_account_risk: false,
  verdict: "RUNNING"
};
writeResults(results);

for (const entry of variants) {
  const variantArgs = { ...entry.args };
  if (entry.variant === "reuse_conversation" && lastConversationUrl) variantArgs.url = lastConversationUrl;
  console.error(`[ab-sweep] variant=${entry.variant} DOM`);
  const dom = await callClaude("dom", variantArgs);
  if (accountRisk(dom)) {
    results.blocked_account_risk = true;
    results.verdict = "BLOCKED_ACCOUNT_RISK";
    results.variants.push({ variant: entry.variant, dom, rpc: null, pass: false, blocker: "DOM account risk" });
    writeResults(results);
    process.exitCode = 2;
    break;
  }

  console.error(`[ab-sweep] variant=${entry.variant} RPC`);
  if (typeof dom.chat_url === "string" && /\/chat\//.test(dom.chat_url)) lastConversationUrl = dom.chat_url;
  const rpc = await callClaude("rpc", variantArgs);
  if (accountRisk(rpc)) {
    results.blocked_account_risk = true;
    results.verdict = "BLOCKED_ACCOUNT_RISK";
    results.variants.push({ variant: entry.variant, dom, rpc, pass: false, blocker: "RPC account risk" });
    writeResults(results);
    process.exitCode = 2;
    break;
  }

  const similarity = textSimilarity(dom.response_text, rpc.response_text);
  const latencyRatio = rpc.latency_ms > 0 ? dom.latency_ms / rpc.latency_ms : 0;
  const rpcCorrect = rpc.ok && correctByExpectation(entry.variant, rpc.response_text);
  const pass = Boolean(dom.ok && rpcCorrect && latencyRatio >= 1.2);
  results.variants.push({
    variant: entry.variant,
    prompt: variantArgs.prompt,
    dom,
    rpc,
    text_similarity: similarity,
    latency_ratio_dom_over_rpc: latencyRatio,
    rpc_correct: rpcCorrect,
    pass
  });
  if (typeof rpc.chat_url === "string" && /\/chat\//.test(rpc.chat_url)) lastConversationUrl = rpc.chat_url;
  results.pass_count = results.variants.filter((item) => item.pass).length;
  results.verdict = results.pass_count >= 8 ? "PASS_THRESHOLD" : "RUNNING";
  writeResults(results);
}

if (!results.blocked_account_risk) {
  results.completed_at = new Date().toISOString();
  results.pass_count = results.variants.filter((item) => item.pass).length;
  results.verdict = results.pass_count >= 8 ? "PASS" : "NEEDS_WORK";
  writeResults(results);
  if (results.pass_count < 8) process.exitCode = 1;
}
