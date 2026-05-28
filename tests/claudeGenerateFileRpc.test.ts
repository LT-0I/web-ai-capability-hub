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
