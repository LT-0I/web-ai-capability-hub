import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  ClaudeGenerateFileRpcFetch,
  extractClaudeGeneratedFileArtifacts,
  webAiClaudeGenerateFileRpcWithFetch
} from "../src/mcp/claude_generate_file_rpc";
import { decodeClaudeRpcSseEnvelope } from "../src/mcp/claude_send_prompt_rpc";

const CAPTURE_ROOT = path.join(process.cwd(), ".runs/path-c-claude-rpc/wave-a-captures");

const ORG_UUID = "9a23efa1-be5a-4da2-8039-74492ab9877e";
const CONVERSATION_UUID = "703edfc7-662f-4a00-9f93-ad228335e257";
const CSV_STREAM = [
  { type: "message_start", message: { model: "claude-sonnet-4-6", uuid: "11111111-1111-4111-8111-111111111111" } },
  { type: "content_block_start", index: 1, content_block: { type: "tool_use", name: "create_file" } },
  { type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: JSON.stringify({ file_text: "status\nOK\n", path: "/mnt/user-data/outputs/status.csv" }) } },
  { type: "content_block_stop", index: 1 },
  { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Done" } },
  { type: "message_stop" }
].map((event) => `data: ${JSON.stringify(event)}\n\n`).join("");
const HTML_STREAM = [
  { type: "message_start", message: { model: "claude-sonnet-4-6", uuid: "22222222-2222-4222-8222-222222222222" } },
  { type: "content_block_start", index: 1, content_block: { type: "tool_use", name: "show_widget" } },
  { type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: JSON.stringify({ widget_code: "<!DOCTYPE html><html><body><p>OK</p></body></html>\n", title: "ok" }) } },
  { type: "content_block_stop", index: 1 },
  { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "There it is." } },
  { type: "message_stop" }
].map((event) => `data: ${JSON.stringify(event)}\n\n`).join("");

function tempDir(name: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `${name}-`));
}

const sse = (events: any[]): string => events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("");

// Real DOCX fixture (PK-zip OOXML) reused as the simulated downloaded binary.
const DOCX_FIXTURE = path.resolve("ip-literature-patent-research/.runs/literature-review-rl-antiuav-2026-05-13/phase1-resmoke4-downloads/phase1-resmoke4-export.docx");

// Defect A scenario: Claude runs its code-execution sandbox (bash_tool) whose
// display_content.json_block only carries the SHELL SOURCE that builds the docx, with
// NO present_files / create_file pointing at a downloadable binary. The pre-fix code
// wrote this JS/shell text verbatim as a .docx (a §2.3-banned disguised fallback).
const DOCX_CODE_ONLY_STREAM = sse([
  { type: "message_start", message: { model: "claude-sonnet-4-6", uuid: "33333333-3333-4333-8333-333333333333" } },
  { type: "content_block_start", index: 1, content_block: { type: "tool_use", name: "bash_tool" } },
  { type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: JSON.stringify({ command: "npm install -g docx && node -e \"...\"", description: "Create the document" }) } },
  { type: "content_block_delta", index: 1, delta: { display_content: { json_block: JSON.stringify({ language: "bash", code: "npm install -g docx && node -e \"...build docx...\"" }) } } },
  { type: "content_block_stop", index: 1 },
  { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Here's your Word document!" } },
  { type: "message_stop" }
]);

// Defect A fix: Claude produced a REAL binary docx in its sandbox and announced it via
// present_files; the tool must fetch that real binary and validate its magic bytes.
const DOCX_PRESENT_FILES_STREAM = sse([
  { type: "message_start", message: { model: "claude-sonnet-4-6", uuid: "44444444-4444-4444-8444-444444444444" } },
  { type: "content_block_start", index: 1, content_block: { type: "tool_use", name: "bash_tool" } },
  { type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: JSON.stringify({ command: "node create_doc.js", description: "build" }) } },
  { type: "content_block_stop", index: 1 },
  { type: "content_block_start", index: 2, content_block: { type: "tool_use", name: "present_files" } },
  { type: "content_block_delta", index: 2, delta: { type: "input_json_delta", partial_json: JSON.stringify({ filepaths: ["/mnt/user-data/outputs/Diag_Docx.docx"] }) } },
  { type: "content_block_stop", index: 2 },
  { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Your file is ready!" } },
  { type: "message_stop" }
]);

// Defect B scenario: a markdown request answered as INLINE assistant text only (no
// create_file / present_files). Pre-fix this hit chooseArtifact==null -> spurious
// ARTIFACT_DOWNLOAD_TIMEOUT, while csv happened to emit a create_file. The fix uses the
// decoded inline responseText as a legitimate text artifact.
const MD_INLINE_STREAM = sse([
  { type: "message_start", message: { model: "claude-sonnet-4-6", uuid: "55555555-5555-4555-8555-555555555555" } },
  { type: "content_block_start", index: 0, content_block: { type: "text" } },
  { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "# Notes\n\n- First bullet\n- Second bullet\n" } },
  { type: "content_block_stop", index: 0 },
  { type: "message_stop" }
]);

// Defect B (download path): a markdown request answered with a create_file remotePath.
const MD_CREATE_FILE_STREAM = sse([
  { type: "message_start", message: { model: "claude-sonnet-4-6", uuid: "66666666-6666-4666-8666-666666666666" } },
  { type: "content_block_start", index: 1, content_block: { type: "tool_use", name: "create_file" } },
  { type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: JSON.stringify({ path: "/mnt/user-data/outputs/notes.md", file_text: "# Notes\n\n- a\n- b\n" }) } },
  { type: "content_block_stop", index: 1 },
  { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Done" } },
  { type: "message_stop" }
]);

test("Claude generate_file RPC docx with only sandbox code (no downloadable binary) fails honestly with ARTIFACT_VERIFICATION_FAILED and writes nothing", async () => {
  const dir = tempDir("claude-genfile-rpc-docx-codeonly");
  try {
    const order: string[] = [];
    const fetchRpc: ClaudeGenerateFileRpcFetch = async (request) => {
      order.push(request.kind);
      assert.equal(request.kind, "completion");
      return { status: 200, contentType: "text/event-stream; charset=utf-8", text: DOCX_CODE_ONLY_STREAM, elapsedMs: 21 };
    };
    const result: any = await webAiClaudeGenerateFileRpcWithFetch(
      { profile: "claude-9224", prompt: "Create a Word .docx about automated testing.", expected_extension: "docx", download_dir: dir },
      fetchRpc,
      { orgId: ORG_UUID, conversationId: CONVERSATION_UUID }
    );
    // Never attempted a download (no real artifact) and never wrote a disguised text file.
    assert.deepEqual(order, ["completion"]);
    assert.equal(result.errorCode, "ARTIFACT_VERIFICATION_FAILED");
    assert.equal(result.path, "");
    assert.equal(fs.readdirSync(dir).length, 0, "must not write any .docx when only inline text/code is produced");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("Claude generate_file RPC docx with present_files downloads the real binary and passes OOXML magic-byte validation", async () => {
  const dir = tempDir("claude-genfile-rpc-docx-real");
  try {
    const realBytes = fs.readFileSync(DOCX_FIXTURE);
    const realBase64 = fs.readFileSync(DOCX_FIXTURE, "base64");
    const order: string[] = [];
    const fetchRpc: ClaudeGenerateFileRpcFetch = async (request) => {
      order.push(request.kind);
      if (request.kind === "completion") return { status: 200, contentType: "text/event-stream; charset=utf-8", text: DOCX_PRESENT_FILES_STREAM, elapsedMs: 30 };
      assert.equal(request.remotePath, "/mnt/user-data/outputs/Diag_Docx.docx");
      assert.match(request.url, /wiggle\/download-file/);
      return { status: 200, contentType: "application/octet-stream", text: "", base64: realBase64, headers: { "content-disposition": "attachment; filename*=utf-8''Diag_Docx.docx" } };
    };
    const result: any = await webAiClaudeGenerateFileRpcWithFetch(
      { profile: "claude-9224", prompt: "Create a Word .docx and make it downloadable.", expected_extension: "docx", download_dir: dir },
      fetchRpc,
      { orgId: ORG_UUID, conversationId: CONVERSATION_UUID }
    );
    assert.deepEqual(order, ["completion", "download"]);
    assert.equal(result.errorCode, null);
    assert.equal(result.artifact_source, "present_files");
    assert.ok(result.path.toLowerCase().endsWith(".docx"));
    const saved = fs.readFileSync(result.path);
    assert.deepEqual(saved.subarray(0, 4), Buffer.from([0x50, 0x4b, 0x03, 0x04]), "saved docx must be a real PK-zip binary");
    assert.equal(saved.length, realBytes.length);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("Claude generate_file RPC docx whose downloaded payload is not a real OOXML zip fails with ARTIFACT_VERIFICATION_FAILED", async () => {
  const dir = tempDir("claude-genfile-rpc-docx-badbytes");
  try {
    const fetchRpc: ClaudeGenerateFileRpcFetch = async (request) => {
      if (request.kind === "completion") return { status: 200, contentType: "text/event-stream; charset=utf-8", text: DOCX_PRESENT_FILES_STREAM, elapsedMs: 30 };
      // Download succeeds (200) but returns text, not a PK-zip OOXML container.
      return { status: 200, contentType: "text/plain", text: "this is not a docx", elapsedMs: 5 };
    };
    const result: any = await webAiClaudeGenerateFileRpcWithFetch(
      { profile: "claude-9224", prompt: "Create a Word .docx.", expected_extension: "docx", download_dir: dir },
      fetchRpc,
      { orgId: ORG_UUID, conversationId: CONVERSATION_UUID }
    );
    assert.equal(result.errorCode, "ARTIFACT_VERIFICATION_FAILED");
    assert.equal(fs.readdirSync(dir).length, 0, "invalid downloaded binary must be cleaned up, not left as a fake .docx");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("Claude generate_file RPC md rendered inline (no create_file) saves the inline markdown instead of spuriously timing out", async () => {
  const dir = tempDir("claude-genfile-rpc-md-inline");
  try {
    const order: string[] = [];
    const fetchRpc: ClaudeGenerateFileRpcFetch = async (request) => {
      order.push(request.kind);
      assert.equal(request.kind, "completion");
      return { status: 200, contentType: "text/event-stream; charset=utf-8", text: MD_INLINE_STREAM, elapsedMs: 12 };
    };
    const result: any = await webAiClaudeGenerateFileRpcWithFetch(
      { profile: "claude-9224", prompt: "Create a markdown .md file with a heading and bullets.", expected_extension: "md", download_dir: dir },
      fetchRpc,
      { orgId: ORG_UUID, conversationId: CONVERSATION_UUID }
    );
    assert.deepEqual(order, ["completion"]);
    assert.equal(result.errorCode, null);
    assert.equal(result.artifact_source, "display_content");
    assert.ok(result.path.toLowerCase().endsWith(".md"));
    assert.match(fs.readFileSync(result.path, "utf8"), /# Notes/);
    assert.match(fs.readFileSync(result.path, "utf8"), /First bullet/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("Claude generate_file RPC md returned as create_file downloads the streamed remote markdown", async () => {
  const dir = tempDir("claude-genfile-rpc-md-createfile");
  try {
    const order: string[] = [];
    const fetchRpc: ClaudeGenerateFileRpcFetch = async (request) => {
      order.push(request.kind);
      if (request.kind === "completion") return { status: 200, contentType: "text/event-stream; charset=utf-8", text: MD_CREATE_FILE_STREAM, elapsedMs: 18 };
      assert.equal(request.remotePath, "/mnt/user-data/outputs/notes.md");
      return { status: 200, contentType: "text/markdown", text: "# Notes\n\n- a\n- b\n", elapsedMs: 4, headers: { "content-disposition": "attachment; filename=\"notes.md\"" } };
    };
    const result: any = await webAiClaudeGenerateFileRpcWithFetch(
      { profile: "claude-9224", prompt: "Create a markdown .md file.", expected_extension: "md", download_dir: dir },
      fetchRpc,
      { orgId: ORG_UUID, conversationId: CONVERSATION_UUID }
    );
    assert.deepEqual(order, ["completion", "download"]);
    assert.equal(result.errorCode, null);
    assert.equal(result.download_filename, "notes.md");
    assert.match(fs.readFileSync(result.path, "utf8"), /# Notes/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("Claude generate_file RPC extractClaudeGeneratedFileArtifacts surfaces present_files filepaths as a downloadable artifact", () => {
  const artifacts = extractClaudeGeneratedFileArtifacts(DOCX_PRESENT_FILES_STREAM);
  const present = artifacts.find((artifact) => artifact.source === "present_files");
  assert.ok(present, "expected a present_files artifact");
  assert.equal(present?.remotePath, "/mnt/user-data/outputs/Diag_Docx.docx");
  assert.equal(present?.fileName, "Diag_Docx.docx");
});

test("Claude generate_file RPC extractClaudeGeneratedFileArtifacts decodes widget tool_use from captured html_artifact SSE fixture", () => {
  const fixturePath = path.join(CAPTURE_ROOT, "webai_claude_generate_file--html_artifact/response-stream.txt");
  const stream = fs.readFileSync(fixturePath, "utf8");
  const artifacts = extractClaudeGeneratedFileArtifacts(stream);
  const widget = artifacts.find((artifact) => artifact.source === "widget");
  assert.ok(widget, "expected widget artifact from captured fixture");
  assert.equal(widget?.content, "OK");
  assert.equal(widget?.fileName, "ok.html");
  const decoded = decodeClaudeRpcSseEnvelope(stream);
  assert.equal(decoded.modelUsed, "claude-sonnet-4-6");
  assert.equal(decoded.messageUuid, "019e69ea-d422-78e0-93b2-4854c9dc9e64");
  assert.match(decoded.responseText, /There it is/);
});

test("Claude generate_file RPC csv_artifact sends captured completion shape then downloads streamed remote file", async () => {
  const dir = tempDir("claude-genfile-rpc-csv");
  try {
    const stream = CSV_STREAM;
    const order: string[] = [];
    let completionPayload: any = null;
    const fetchRpc: ClaudeGenerateFileRpcFetch = async (request) => {
      order.push(request.kind);
      if (request.kind === "completion") {
        assert.match(request.url, new RegExp(`/api/organizations/${ORG_UUID}/chat_conversations/${CONVERSATION_UUID}/completion$`));
        completionPayload = JSON.parse(String(request.body || "{}"));
        return { status: 200, contentType: "text/event-stream; charset=utf-8", text: stream, elapsedMs: 31 };
      }
      assert.match(request.url, new RegExp(`/api/organizations/${ORG_UUID}/conversations/${CONVERSATION_UUID}/wiggle/download-file`));
      assert.equal(request.remotePath, "/mnt/user-data/outputs/status.csv");
      return { status: 200, contentType: "text/csv", text: "status\nOK\n", elapsedMs: 4, headers: { "content-disposition": "attachment; filename=\"status.csv\"" } };
    };

    const result: any = await webAiClaudeGenerateFileRpcWithFetch(
      { profile: "claude-9224", prompt: "RPC_CLAUDE_ARTIFACT_CSV_2026-05-27: Create a CSV file with one column status and one row OK.", expected_extension: "csv", download_dir: dir },
      fetchRpc,
      { orgId: ORG_UUID, conversationId: CONVERSATION_UUID }
    );

    assert.deepEqual(order, ["completion", "download"]);
    assert.equal(completionPayload.prompt, "RPC_CLAUDE_ARTIFACT_CSV_2026-05-27: Create a CSV file with one column status and one row OK.");
    assert.equal(completionPayload.model, "claude-sonnet-4-6");
    assert.equal(result.errorCode, null);
    assert.equal(result.download_filename, "status.csv");
    assert.equal(fs.readFileSync(result.path, "utf8"), "status\nOK\n");
    assert.equal(result.conversation_id, CONVERSATION_UUID);
    assert.equal(result.http_status, 200);
    assert.equal(result.wait_ms, 31);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("Claude generate_file RPC html_artifact saves streamed widget HTML after same-origin completion", async () => {
  const dir = tempDir("claude-genfile-rpc-html");
  try {
    const stream = HTML_STREAM;
    const artifacts = extractClaudeGeneratedFileArtifacts(stream);
    assert.ok(artifacts.some((artifact) => artifact.source === "widget" && artifact.content.includes("OK")));
    const order: string[] = [];
    const fetchRpc: ClaudeGenerateFileRpcFetch = async (request) => {
      order.push(request.kind);
      assert.equal(request.kind, "completion");
      const payload = JSON.parse(String(request.body || "{}"));
      assert.equal(payload.prompt, "RPC_CLAUDE_ARTIFACT_HTML_2026-05-27: Create a tiny HTML artifact with the text OK.");
      return { status: 200, contentType: "text/event-stream; charset=utf-8", text: stream, elapsedMs: 42 };
    };

    const result: any = await webAiClaudeGenerateFileRpcWithFetch(
      { profile: "claude-9224", prompt: "RPC_CLAUDE_ARTIFACT_HTML_2026-05-27: Create a tiny HTML artifact with the text OK.", expected_extension: "html", download_dir: dir },
      fetchRpc,
      { orgId: ORG_UUID, conversationId: CONVERSATION_UUID }
    );

    assert.deepEqual(order, ["completion"]);
    assert.equal(result.errorCode, null);
    assert.equal(result.download_filename.endsWith(".html"), true);
    assert.match(fs.readFileSync(result.path, "utf8"), /OK/);
    assert.equal(result.artifact_source, "widget");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
