const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const zlib = require("node:zlib");
import { CapabilityDatabase } from "../src/capabilities/database";

function tempDir(): string { return fs.mkdtempSync(path.join(os.tmpdir(), "wah-workflow-dispatch-")); }
function tempDb(): CapabilityDatabase { return new CapabilityDatabase({ dbPath: path.join(tempDir(), "capability.sqlite"), preferSqlite: false }); }

function crc32(buf: Buffer): number {
  let crc = ~0;
  for (const byte of buf) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return ~crc >>> 0;
}

function makeZip(entries: Record<string, string | Buffer>): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(entries)) {
    const nameBuf = Buffer.from(name);
    const bytes = Buffer.isBuffer(content) ? content : Buffer.from(content);
    const compressed = zlib.deflateRawSync(bytes);
    const crc = crc32(bytes);
    const local = Buffer.alloc(30 + nameBuf.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(bytes.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    nameBuf.copy(local, 30);
    localParts.push(local, compressed);

    const central = Buffer.alloc(46 + nameBuf.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(bytes.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    nameBuf.copy(central, 46);
    centralParts.push(central);
    offset += local.length + compressed.length;
  }
  const central = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(entries).length, 8);
  end.writeUInt16LE(Object.keys(entries).length, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...localParts, central, end]);
}

function fakeDocx(filePath: string): string {
  const paragraphs = Array.from({ length: 4 }, (_, i) => `<w:p><w:r><w:t>Paragraph ${i} RL 强化学习 anti UAV content.</w:t></w:r></w:p>`).join("");
  const xml = `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs}</w:body></w:document>`;
  fs.writeFileSync(filePath, makeZip({ "word/document.xml": xml }));
  return filePath;
}

function plan(actions: any[], definition: any = {}): any {
  return { id: "dispatch-test", target: "chatgpt", compiledAt: new Date(0).toISOString(), actions, warnings: [], definition };
}

function action(stepId: string, type: string, target: Record<string, unknown>): any {
  return { stepId, action: { type, target, confirmed: true }, requiresApproval: false };
}

test("workflow executor dispatches artifactClick and records succeeded event", async () => {
  const artifactModule = require("../src/browser/artifactClick");
  const original = artifactModule.runArtifactClick;
  const calls: any[] = [];
  const outPath = path.join(tempDir(), "fake.docx");
  artifactModule.runArtifactClick = async (options: any) => {
    calls.push(options);
    return { path: outPath, sha256: "abc123", size: 42, downloadGuid: "guid", bbox: { x: 1, y: 2, width: 3, height: 4 }, elapsedMs: 5 };
  };
  try {
    const { WorkflowExecutor } = require("../src/workflows/executor");
    const db = tempDb();
    const result = await new WorkflowExecutor({ database: db }).runPlan(plan([
      action("capture", "artifactClick", { command: "browser:artifact-click", profile: "chatgpt", url: "{{inputs.url}}", "button-selector": "button.export", "download-dir": "{{inputs.dir}}" })
    ]), { runId: "run_artifact_success", inputs: { url: "https://example.test/c", dir: tempDir() } });

    assert.equal(result.ok, true);
    assert.equal((result.results[0].data as any).path, outPath);
    assert.equal(calls[0].buttonSelector, "button.export");
    assert.equal(calls[0].url, "https://example.test/c");
    assert.equal(db.listRunEvents("run_artifact_success").some((event) => event.step_id === "capture" && event.status === "succeeded"), true);
  } finally {
    artifactModule.runArtifactClick = original;
  }
});

test("workflow executor propagates ArtifactClickError code into failed event", async () => {
  const artifactModule = require("../src/browser/artifactClick");
  const original = artifactModule.runArtifactClick;
  artifactModule.runArtifactClick = async () => { throw new artifactModule.ArtifactClickError("IFRAME_NOT_FOUND", "missing iframe", { frameCount: 0 }); };
  try {
    const { WorkflowExecutor } = require("../src/workflows/executor");
    const db = tempDb();
    await assert.rejects(
      () => new WorkflowExecutor({ database: db }).runPlan(plan([action("capture", "artifactClick", { profile: "chatgpt", buttonSelector: "button", downloadDir: tempDir() })]), { runId: "run_artifact_error" }),
      (error: any) => error.errorCode === "IFRAME_NOT_FOUND"
    );
    const failed = db.listRunEvents("run_artifact_error").find((event) => event.step_id === "capture" && event.status === "failed");
    assert.equal(failed?.error_code, "IFRAME_NOT_FOUND");
  } finally {
    artifactModule.runArtifactClick = original;
  }
});

test("workflow executor dispatches verifyDocxMin and propagates ok output", async () => {
  const { WorkflowExecutor } = require("../src/workflows/executor");
  const docxPath = fakeDocx(path.join(tempDir(), "ok.docx"));
  const db = tempDb();
  const result = await new WorkflowExecutor({ database: db }).runPlan(plan([
    action("verify", "verifyDocxMin", { command: "verify:docx-min", path: docxPath, minParagraphs: 3, minChars: 20, topicRegex: "RL", recordSha256: true })
  ]), { runId: "run_verify_success" });

  assert.equal(result.ok, true);
  assert.equal((result.results[0].data as any).ok, true);
  assert.equal((result.results[0].data as any).topicMatched, true);
  assert.equal(typeof (result.results[0].data as any).sha256, "string");
});

test("workflow executor fails verifyDocxMin with DOCX_VERIFICATION_FAILED", async () => {
  const { WorkflowExecutor } = require("../src/workflows/executor");
  const docxPath = fakeDocx(path.join(tempDir(), "fail.docx"));
  const db = tempDb();
  await assert.rejects(
    () => new WorkflowExecutor({ database: db }).runPlan(plan([
      action("verify", "verifyDocxMin", { path: docxPath, minParagraphs: 999, minChars: 20, topicRegex: "RL" })
    ]), { runId: "run_verify_failed" }),
    (error: any) => error.errorCode === "DOCX_VERIFICATION_FAILED"
  );
  const failed = db.listRunEvents("run_verify_failed").find((event) => event.step_id === "verify" && event.status === "failed");
  assert.equal(failed?.error_code, "DOCX_VERIFICATION_FAILED");
});

test("workflow executor resolves step output templates into later custom action args", async () => {
  const artifactModule = require("../src/browser/artifactClick");
  const original = artifactModule.runArtifactClick;
  const docxPath = fakeDocx(path.join(tempDir(), "templated.docx"));
  artifactModule.runArtifactClick = async () => ({ path: docxPath, sha256: "def456", size: fs.statSync(docxPath).size, downloadGuid: "guid", bbox: { x: 0, y: 0, width: 1, height: 1 }, elapsedMs: 1 });
  try {
    const { WorkflowExecutor } = require("../src/workflows/executor");
    const result = await new WorkflowExecutor({ database: tempDb() }).runPlan(plan([
      action("s1", "artifactClick", { profile: "chatgpt", buttonSelector: "button", downloadDir: tempDir() }),
      action("s2", "verifyDocxMin", { path: "{{steps.s1.outputs.path}}", minParagraphs: 3, minChars: 20, topicRegex: "强化学习" })
    ]), { runId: "run_template" });

    assert.equal(result.ok, true);
    assert.equal((result.results[1].data as any).path, docxPath);
    assert.equal((result.results[1].data as any).ok, true);
  } finally {
    artifactModule.runArtifactClick = original;
  }
});

test("workflow run failing step writes terminal failed row with finished_at and rethrows", async () => {
  const artifactModule = require("../src/browser/artifactClick");
  const original = artifactModule.runArtifactClick;
  artifactModule.runArtifactClick = async () => { throw new artifactModule.ArtifactClickError("ELEMENT_NOT_FOUND", "missing", { selector: "button" }); };
  try {
    const { WorkflowExecutor } = require("../src/workflows/executor");
    const db = tempDb();
    await assert.rejects(
      () => new WorkflowExecutor({ database: db }).runPlan(plan([action("capture", "artifactClick", { profile: "chatgpt", buttonSelector: "button", downloadDir: tempDir() })]), { runId: "run_terminal_failed" }),
      (error: any) => error.errorCode === "ELEMENT_NOT_FOUND"
    );
    const run = db.getWorkflowRun("run_terminal_failed");
    assert.equal(run?.status, "failed");
    assert.equal(typeof run?.finished_at, "string");
    assert.match(run?.finished_at || "", /^\d{4}-\d{2}-\d{2}T/);
  } finally {
    artifactModule.runArtifactClick = original;
  }
});

test("workflow run all-succeed steps writes terminal succeeded row", async () => {
  const { WorkflowExecutor } = require("../src/workflows/executor");
  const db = tempDb();
  const result = await new WorkflowExecutor({
    database: db,
    actionExecutor: { execute: async (action: any) => ({ ok: true, action, message: "ok", data: { ok: true } }) } as any
  }).runPlan(plan([action("generic", "read", {})]), { runId: "run_terminal_succeeded" });
  const run = db.getWorkflowRun("run_terminal_succeeded");
  assert.equal(result.ok, true);
  assert.equal(run?.status, "succeeded");
  assert.equal(typeof run?.finished_at, "string");
});
