const test = require("node:test");
const assert = require("node:assert/strict");
import { main } from "../src/cli";

async function captureStdout(fn: () => Promise<void>): Promise<string> {
  const originalLog = console.log;
  const lines: string[] = [];
  console.log = (...args: any[]) => { lines.push(args.join(" ")); };
  try { await fn(); }
  finally { console.log = originalLog; }
  return lines.join("\n");
}

test("chatgpt Deep Research DOCX workflow dry-runs artifact capture and verifier wiring", async () => {
  const stdout = await captureStdout(() => main([
    "workflow:run",
    "configs/workflows/chatgpt-deep-research-docx.yaml",
    "--input", "conversationUrl=https://chatgpt.com/c/6a04a213-5648-83e8-b9d0-6134aef56831",
    "--input", "outputDir=/abs/path/run-out",
    "--dry-run",
    "--output-json"
  ]));
  const result = JSON.parse(stdout);
  assert.equal(result.ok, true);
  assert.equal(result.dryRun, true);
  assert.equal(result.plan.id, "chatgpt_deep_research_export_docx");
  assert.equal(result.plan.actions.length, 2);

  const capture = result.plan.actions.find((action: any) => action.stepId === "capture_docx");
  assert.equal(capture.action.type, "artifactClick");
  assert.equal(capture.action.target.command, "browser:artifact-click");
  assert.equal(capture.action.target.profile, "chatgpt");
  assert.equal(capture.action.target.url, "{{inputs.conversationUrl}}");
  assert.equal(capture.action.target.buttonSelector, "button[aria-label=\"导出\"]");
  assert.equal(capture.action.target.followUpTextRegex, "(下载\\s*DOCX|DOCX|Word|导出.*Word)");
  assert.equal(capture.action.target.viewportWidth, 1500);
  assert.equal(capture.action.target.viewportHeight, 1000);
  assert.equal(capture.action.target.prerenderWaitMs, 15000);
  assert.equal(capture.action.target.scrollMainToY, 900);
  assert.equal(capture.action.target.scrollMainWaitMs, 1000);
  assert.equal(capture.action.target.locateTimeoutMs, 12000);
  assert.equal(capture.action.target.timeoutMs, 90000);
  assert.equal(capture.action.target.downloadDir, "{{inputs.outputDir}}");
  assert.equal(capture.action.target.filenamePattern, "*.docx");
  assert.equal(capture.action.target.verifyMinBytes, 20000);

  const verify = result.plan.actions.find((action: any) => action.stepId === "verify_docx");
  assert.equal(verify.action.type, "verifyDocxMin");
  assert.equal(verify.action.target.command, "verify:docx-min");
  assert.equal(verify.action.target.path, "{{steps.capture_docx.path}}");
  assert.equal(verify.action.target.minParagraphs, 50);
  assert.equal(verify.action.target.minChars, 5000);
  assert.equal(verify.action.target.topicRegex, "{{inputs.topicRegex}}");
  assert.equal(verify.action.target.recordSha256, true);
});
