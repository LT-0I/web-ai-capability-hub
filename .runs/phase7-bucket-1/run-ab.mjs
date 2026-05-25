#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const outDir = path.resolve('.runs/phase7-bucket-1');
const resultsPath = path.join(outDir, 'ab-results.json');
const summaryPath = path.join(outDir, 'ab-summary.md');
const failPath = path.join(outDir, 'ab-results-FAIL.md');
const N = Number(process.env.PHASE7_AB_N || 20);
const services = ['chatgpt', 'gemini'];
const backends = ['managed-cdp', 'extension-assisted-cdp'];

function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function delayMsFor(service, backend, i) {
  const seed = `${service}:${backend}:${i}`.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return 4000 + (seed % 4001);
}
function percentile(values, p) {
  const nums = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!nums.length) return null;
  const idx = Math.min(nums.length - 1, Math.ceil((p / 100) * nums.length) - 1);
  return nums[idx];
}
function parseJsonOutput(stdout) {
  const trimmed = stdout.trim();
  if (!trimmed) return null;
  try { return JSON.parse(trimmed); } catch {}
  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first >= 0 && last > first) {
    try { return JSON.parse(trimmed.slice(first, last + 1)); } catch {}
  }
  return null;
}
function chatUrlHasId(service, chatUrl) {
  if (typeof chatUrl !== 'string') return false;
  return service === 'chatgpt' ? /\/c\/[^/?#]+/.test(chatUrl) : /\/app\/[^/?#]+/.test(chatUrl);
}
async function runCli(service, backend, i) {
  const prompt = `phase7 b1 ab #${i}: short ping`;
  const args = [
    'dist/src/cli.js',
    `webai:${service}:send-prompt`,
    '--profile', service === 'chatgpt' ? 'chatgpt-9223' : 'gemini-9225',
    '--backend', backend,
    '--prompt', prompt,
    '--response-timeout-ms', '60000',
    '--json'
  ];
  const started = Date.now();
  let stdout = '';
  let stderr = '';
  const code = await new Promise((resolve) => {
    const child = spawn(process.execPath, args, { cwd: process.cwd(), env: process.env });
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', (error) => { stderr += error.stack || error.message; resolve(127); });
    child.on('close', (exitCode) => resolve(exitCode ?? 0));
  });
  const measuredElapsed = Date.now() - started;
  const parsed = parseJsonOutput(stdout);
  const errorCode = parsed?.errorCode ?? parsed?.error_code ?? (code === 0 ? null : `CLI_EXIT_${code}`);
  const responseText = typeof parsed?.response_text === 'string' ? parsed.response_text : '';
  const chatUrl = typeof parsed?.chat_url === 'string' ? parsed.chat_url : null;
  const elapsedMs = Number.isFinite(Number(parsed?.elapsed_ms)) ? Number(parsed.elapsed_ms) : measuredElapsed;
  const waitMs = Number.isFinite(Number(parsed?.wait_ms)) ? Number(parsed.wait_ms) : null;
  return {
    service,
    backend,
    index: i,
    success: errorCode === null && responseText.trim().length > 0 && chatUrlHasId(service, chatUrl),
    wait_ms: waitMs,
    elapsed_ms: elapsedMs,
    measured_elapsed_ms: measuredElapsed,
    errorCode,
    chat_url: chatUrl,
    response_text_length: responseText.trim().length,
    exit_code: code,
    stdout: parsed ? undefined : stdout.slice(-2000),
    stderr: stderr ? stderr.slice(-2000) : undefined
  };
}
function aggregate(calls, aborted) {
  const histogram = {};
  for (const call of calls) {
    const key = call.errorCode === null ? 'null' : String(call.errorCode);
    histogram[key] = (histogram[key] || 0) + 1;
  }
  return {
    attempts: calls.length,
    target_n: N,
    cell_aborted_high_latency: Boolean(aborted),
    success_rate: calls.length ? calls.filter((call) => call.success).length / calls.length : 0,
    wait_ms_p50: percentile(calls.map((call) => call.wait_ms), 50),
    wait_ms_p95: percentile(calls.map((call) => call.wait_ms), 95),
    elapsed_ms_p50: percentile(calls.map((call) => call.elapsed_ms), 50),
    elapsed_ms_p95: percentile(calls.map((call) => call.elapsed_ms), 95),
    mean_elapsed_ms: calls.length ? Math.round(calls.reduce((sum, call) => sum + (Number(call.elapsed_ms) || 0), 0) / calls.length) : null,
    error_code_histogram: histogram
  };
}
function cellKey(service, backend) { return `${service}:${backend}`; }
function markdownTable(results, verdict) {
  const lines = [
    '# Phase 7 Bucket 1 A/B Summary',
    '',
    '| service | backend | attempts | success_rate | wait p50/p95 ms | elapsed p50/p95 ms | mean elapsed ms | errors | aborted |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- |'
  ];
  for (const service of services) {
    for (const backend of backends) {
      const cell = results.aggregates[cellKey(service, backend)];
      lines.push(`| ${service} | ${backend} | ${cell.attempts}/${cell.target_n} | ${cell.success_rate.toFixed(2)} | ${cell.wait_ms_p50 ?? 'n/a'}/${cell.wait_ms_p95 ?? 'n/a'} | ${cell.elapsed_ms_p50 ?? 'n/a'}/${cell.elapsed_ms_p95 ?? 'n/a'} | ${cell.mean_elapsed_ms ?? 'n/a'} | \`${JSON.stringify(cell.error_code_histogram)}\` | ${cell.cell_aborted_high_latency ? 'yes' : 'no'} |`);
    }
  }
  lines.push('', verdict, '');
  return lines.join('\n');
}

await mkdir(outDir, { recursive: true });
const allCalls = [];
const aggregates = {};
for (const service of services) {
  for (const backend of backends) {
    const calls = [];
    let aborted = false;
    for (let i = 1; i <= N; i += 1) {
      const call = await runCli(service, backend, i);
      calls.push(call);
      allCalls.push(call);
      const meanElapsed = calls.reduce((sum, item) => sum + (Number(item.elapsed_ms) || 0), 0) / calls.length;
      await writeFile(resultsPath, JSON.stringify({ generated_at: new Date().toISOString(), n: N, calls: allCalls, aggregates }, null, 2));
      if (meanElapsed > 45000) {
        aborted = true;
        break;
      }
      if (i < N) await delay(delayMsFor(service, backend, i));
    }
    aggregates[cellKey(service, backend)] = aggregate(calls, aborted);
    await writeFile(resultsPath, JSON.stringify({ generated_at: new Date().toISOString(), n: N, calls: allCalls, aggregates }, null, 2));
  }
}
const gates = services.map((service) => {
  const managed = aggregates[cellKey(service, 'managed-cdp')];
  const ext = aggregates[cellKey(service, 'extension-assisted-cdp')];
  return {
    service,
    managed_success_rate: managed.success_rate,
    extension_success_rate: ext.success_rate,
    threshold: managed.success_rate - 0.05,
    pass: ext.success_rate >= managed.success_rate - 0.05
  };
});
const pass = gates.every((gate) => gate.pass);
const verdict = pass ? 'B1 VALIDATION PASS — recommend GO on B2-B8' : 'B1 VALIDATION FAIL — STOP Phase 7 B2-B8';
const canonical = { generated_at: new Date().toISOString(), n: N, services, backends, gates, verdict, calls: allCalls, aggregates };
await writeFile(resultsPath, JSON.stringify(canonical, null, 2));
await writeFile(summaryPath, markdownTable(canonical, verdict));
if (!pass) {
  await writeFile(failPath, `${markdownTable(canonical, verdict)}\n\n## Per-call data\n\n\`\`\`json\n${JSON.stringify(allCalls, null, 2)}\n\`\`\`\n`);
}
console.log(JSON.stringify({ verdict, gates, resultsPath, summaryPath, failPath: pass ? null : failPath }, null, 2));
