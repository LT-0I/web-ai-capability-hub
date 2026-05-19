const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
import { verifyDocxMin, verifyOoxmlPackage } from "../src/verifiers/docxMin";
import { main } from "../src/cli";

const fixture = path.resolve("ip-literature-patent-research/.runs/literature-review-rl-antiuav-2026-05-13/phase1-resmoke4-downloads/phase1-resmoke4-export.docx");

function tempFile(name: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "docx-min-"));
  return path.join(dir, name);
}

async function captureStdout(fn: () => Promise<void>): Promise<{ stdout: string; exitCode: string | number | undefined }> {
  const originalLog = console.log;
  const originalExitCode = process.exitCode;
  const lines: string[] = [];
  console.log = (...args: any[]) => { lines.push(args.join(" ")); };
  process.exitCode = undefined;
  let exitCode: string | number | undefined;
  try { await fn(); exitCode = process.exitCode; }
  finally { console.log = originalLog; process.exitCode = originalExitCode; }
  return { stdout: lines.join("\n"), exitCode };
}

test("verifyDocxMin passes the Round-3/Phase-1 DOCX fixture", () => {
  assert.ok(fs.existsSync(fixture), "expected real DOCX fixture to be present");
  const result = verifyDocxMin(fixture, { minParagraphs: 50, minChars: 5000, topicRegex: /强化学习|RL/, recordSha256: true });
  assert.equal(result.ok, true);
  assert.equal(result.failures.length, 0);
  assert.equal(result.size, 31520);
  assert.equal(result.sha256, "9c1ebc65b137a1f063659e7f6d310375f1735537219bed3aa7ec94b8a2572727");
  assert.ok(result.paragraphs >= 50);
  assert.ok(result.chars >= 5000);
  assert.equal(result.topicMatched, true);
});

test("verifyOoxmlPackage accepts the Round-3/Phase-1 DOCX fixture", () => {
  assert.ok(fs.existsSync(fixture), "expected real DOCX fixture to be present");
  assert.equal(verifyOoxmlPackage(fixture, "docx").ok, true);
});

test("verifyOoxmlPackage rejects renamed non-zip bytes", () => {
  const file = tempFile("renamed.docx");
  fs.writeFileSync(file, "not a zip");
  const result = verifyOoxmlPackage(file, "docx");
  assert.equal(result.ok, false);
});

test("verifyOoxmlPackage rejects a truncated ZIP local header", () => {
  const file = tempFile("truncated.docx");
  fs.writeFileSync(file, Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  const result = verifyOoxmlPackage(file, "docx");
  assert.equal(result.ok, false);
});

test("verifyOoxmlPackage rejects a real DOCX when XLSX is expected", () => {
  const result = verifyOoxmlPackage(fixture, "xlsx");
  assert.equal(result.ok, false);
});

test("verifyDocxMin fails paragraph threshold clearly", () => {
  const result = verifyDocxMin(fixture, { minParagraphs: 10000, minChars: 1, recordSha256: false });
  assert.equal(result.ok, false);
  assert.equal(result.sha256, undefined);
  assert.ok(result.failures.some((failure) => failure.startsWith("MIN_PARAGRAPHS_NOT_MET")));
});

test("verifyDocxMin fails char threshold clearly", () => {
  const result = verifyDocxMin(fixture, { minParagraphs: 1, minChars: 1000000 });
  assert.equal(result.ok, false);
  assert.ok(result.failures.some((failure) => failure.startsWith("MIN_CHARS_NOT_MET")));
});

test("verifyDocxMin fails topic regex no-match", () => {
  const result = verifyDocxMin(fixture, { minParagraphs: 1, minChars: 1, topicRegex: /definitely-not-in-this-report-xyz/ });
  assert.equal(result.ok, false);
  assert.equal(result.topicMatched, false);
  assert.ok(result.failures.includes("TOPIC_REGEX_NOT_MATCHED"));
});

test("verifyDocxMin reports invalid non-zip file", () => {
  const file = tempFile("not-a.docx");
  fs.writeFileSync(file, "not a zip");
  const result = verifyDocxMin(file, { minParagraphs: 1, minChars: 1, topicRegex: /RL/ });
  assert.equal(result.ok, false);
  assert.equal(result.paragraphs, 0);
  assert.equal(result.chars, 0);
  assert.equal(result.topicMatched, false);
  assert.ok(result.failures.some((failure) => failure.startsWith("INVALID_DOCX_ZIP")));
});

test("verify:docx-min CLI emits verifier JSON and sets failing exitCode", async () => {
  const { stdout, exitCode } = await captureStdout(() => main(["verify:docx-min", "--path", fixture, "--min-paragraphs", "10000", "--min-chars", "1", "--output-json"]));
  const parsed = JSON.parse(stdout);
  assert.equal(parsed.ok, false);
  assert.equal(exitCode, 1);
  assert.ok(parsed.failures.some((failure: string) => failure.startsWith("MIN_PARAGRAPHS_NOT_MET")));
});
