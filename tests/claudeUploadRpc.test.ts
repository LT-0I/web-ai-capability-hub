import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  ClaudeUploadRpcFetch,
  ClaudeUploadRpcRequest,
  webAiClaudeUploadAndQueryRpcWithFetch
} from "../src/mcp/claude_upload_rpc";

const ORG_UUID = "9a23efa1-be5a-4da2-8039-74492ab9877e";
const CONVERSATION_UUID = "ef7a8aa2-fe72-4e09-8697-0bf6b5ef080d";
const CAPTURE_ROOT = path.join(process.cwd(), ".runs/path-c-claude-rpc/wave-a-captures");

const UUIDS = [
  "5c08cba5-011c-45f3-9187-fa830547d7bc",
  "31089c4d-e01c-4b96-820a-91508ba4fc57",
  "b96fcf5a-ae65-4e6e-8aa6-9a8bdbc8f6ca",
  "cc09f733-f343-4e63-8a93-555cdadbe109",
  "6731d667-9da0-497c-bc00-25d30f1636f0",
  "df2ba834-da0a-426a-9a21-aa9c09ed4832"
];

function minimalSse(text = " OK", model = "claude-sonnet-4-6"): string {
  return [
    "event: conversation_ready",
    "data: {\"type\":\"conversation_ready\"}",
    "",
    "event: message_start",
    `data: ${JSON.stringify({ type: "message_start", message: { id: "chatcompl_fixture", type: "message", role: "assistant", model, uuid: UUIDS[0], content: [] } })}`,
    "",
    "event: content_block_start",
    "data: {\"type\":\"content_block_start\",\"index\":0,\"content_block\":{\"type\":\"text\",\"text\":\"\"}}",
    "",
    "event: content_block_delta",
    `data: ${JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text } })}`,
    "",
    "event: content_block_stop",
    "data: {\"type\":\"content_block_stop\",\"index\":0}",
    "",
    "event: message_stop",
    "data: {\"type\":\"message_stop\"}",
    ""
  ].join("\n");
}

function eventsJsonToSse(events: Array<{ event?: string; data?: unknown }>): string {
  return events
    .map((event) => `${event.event ? `event: ${event.event}\n` : ""}data: ${JSON.stringify(event.data ?? {})}\n\n`)
    .join("");
}

function captureDir(variant: string): string {
  return path.join(CAPTURE_ROOT, `webai_claude_upload_and_query--${variant}`);
}

function loadCapturedSse(variant: string, fallbackText: string): string {
  const responseJsonPath = path.join(captureDir(variant), "response-stream.json");
  if (fs.existsSync(responseJsonPath)) {
    const parsed = JSON.parse(fs.readFileSync(responseJsonPath, "utf8"));
    if (Array.isArray(parsed.events) && parsed.events.length) return eventsJsonToSse(parsed.events);
  }
  return minimalSse(fallbackText);
}

function writeFixture(dir: string, name: string, content: string | Buffer): string {
  const filePath = path.join(dir, name);
  fs.writeFileSync(filePath, content);
  return filePath;
}

const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
  "base64"
);

type VariantCase = {
  variant: string;
  prompt: string;
  files: Array<{ name: string; content: string | Buffer; mime: string; image?: boolean }>;
  expectedText: string;
};

const VARIANTS: VariantCase[] = [
  {
    variant: "upload_single",
    prompt: "RPC_CLAUDE_UPLOAD_SINGLE_2026-05-27: Reply with OK only.",
    files: [{ name: "claude-wave-a-upload-single.txt", content: "Token RPC_CLAUDE_UPLOAD_SINGLE_2026-05-27: Reply with OK only.\n".padEnd(124, "x"), mime: "text/plain" }],
    expectedText: " OK"
  },
  {
    variant: "upload_multi",
    prompt: "RPC_CLAUDE_UPLOAD_MULTI_2026-05-27: Reply with OK only.",
    files: [
      { name: "claude-wave-a-upload-a.txt", content: "Token RPC_CLAUDE_UPLOAD_MULTI_2026-05-27 A\n".padEnd(118, "a"), mime: "text/plain" },
      { name: "claude-wave-a-upload-b.txt", content: "Token RPC_CLAUDE_UPLOAD_MULTI_2026-05-27 B\n".padEnd(118, "b"), mime: "text/plain" },
      { name: "claude-wave-a-upload-c.txt", content: "Token RPC_CLAUDE_UPLOAD_MULTI_2026-05-27 C\n".padEnd(118, "c"), mime: "text/plain" }
    ],
    expectedText: " OK"
  },
  {
    variant: "upload_and_query",
    prompt: "RPC_CLAUDE_UPLOAD_QUERY_2026-05-27: Read the uploaded file and reply OK plus the token if visible.",
    files: [{ name: "claude-wave-a-query.txt", content: "Claude Wave A upload fixture claude-wave-a-query.txt\nToken RPC_CLAUDE_UPLOAD_QUERY_2026-05-27: Read the uploaded file and reply OK plus the token if visible.\n", mime: "text/plain" }],
    expectedText: " OK RPC_CLAUDE_UPLOAD_QUERY_2026-05-27"
  },
  {
    variant: "upload_image",
    prompt: "RPC_CLAUDE_UPLOAD_IMAGE_2026-05-27: Acknowledge the tiny image with OK only.",
    files: [{ name: "claude-wave-a-image.png", content: PNG_1X1, mime: "image/png", image: true }],
    expectedText: " OK"
  },
  {
    variant: "upload_markdown",
    prompt: "RPC_CLAUDE_UPLOAD_MD_2026-05-27: Read the markdown and reply OK only.",
    files: [{ name: "claude-wave-a-markdown.md", content: "Claude Wave A upload fixture claude-wave-a-markdown.md\nToken RPC_CLAUDE_UPLOAD_MD_2026-05-27: Read the markdown and reply OK only.\n", mime: "text/markdown" }],
    expectedText: " OK"
  }
];

function mockUploadResponse(request: ClaudeUploadRpcRequest, uuid: string): Record<string, unknown> {
  assert.equal(request.kind, "upload");
  assert.ok(request.file);
  const file = request.file!;
  const base = {
    success: true,
    path: `/mnt/user-data/uploads/${file.fileName}`,
    sanitized_name: file.fileName,
    file_kind: file.image ? "image" : "blob",
    file_uuid: uuid,
    file_name: file.fileName,
    created_at: file.image ? "2026-05-27T14:25:49.781546Z" : null,
    user_uuid: null,
    size_bytes: file.sizeBytes,
    uuid
  };
  if (!file.image) return base;
  return {
    ...base,
    thumbnail_url: `/api/${ORG_UUID}/files/${uuid}/thumbnail`,
    preview_url: `/api/${ORG_UUID}/files/${uuid}/preview`,
    thumbnail_asset: { url: `/api/${ORG_UUID}/files/${uuid}/thumbnail`, file_variant: "thumbnail", image_width: 1, image_height: 1 },
    preview_asset: { url: `/api/${ORG_UUID}/files/${uuid}/preview`, file_variant: "preview", image_width: 1, image_height: 1 }
  };
}

for (const variantCase of VARIANTS) {
  test(`Claude upload RPC ${variantCase.variant} uploads first then sends completion with attachments`, async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `claude-upload-rpc-${variantCase.variant}-`));
    try {
      const filePaths = variantCase.files.map((file) => writeFixture(tempDir, file.name, file.content));
      const order: string[] = [];
      const uploadUuids = variantCase.files.map((_, index) => UUIDS[index + (variantCase.variant === "upload_image" ? 4 : 0)] || UUIDS[index]);
      let completionPayload: any = null;
      let uploadIndex = 0;
      const sse = loadCapturedSse(variantCase.variant, variantCase.expectedText);

      const fetchRpc: ClaudeUploadRpcFetch = async (request) => {
        if (request.kind === "upload") {
          order.push("upload");
          assert.match(request.url, new RegExp(`/api/organizations/${ORG_UUID}/conversations/${CONVERSATION_UUID}/wiggle/upload-file$`));
          assert.ok(request.file?.base64);
          assert.equal(request.file?.fileName, variantCase.files[uploadIndex].name);
          assert.equal(request.file?.mimeType, variantCase.files[uploadIndex].mime);
          assert.equal(request.file?.image, Boolean(variantCase.files[uploadIndex].image));
          const response = mockUploadResponse(request, uploadUuids[uploadIndex]);
          uploadIndex += 1;
          return { status: 200, contentType: "application/json", text: JSON.stringify(response), elapsedMs: 5 };
        }

        order.push("completion");
        assert.match(request.url, new RegExp(`/api/organizations/${ORG_UUID}/chat_conversations/${CONVERSATION_UUID}/completion$`));
        completionPayload = JSON.parse(String(request.body || "{}"));
        return { status: 200, contentType: "text/event-stream; charset=utf-8", text: sse, elapsedMs: 17 };
      };

      const result: any = await webAiClaudeUploadAndQueryRpcWithFetch(
        { profile: "claude-9224", files: filePaths, prompt: variantCase.prompt },
        fetchRpc,
        { orgId: ORG_UUID, conversationId: CONVERSATION_UUID }
      );

      assert.deepEqual(order, [...variantCase.files.map(() => "upload"), "completion"]);
      assert.equal(uploadIndex, variantCase.files.length);
      assert.equal(result.errorCode, null);
      assert.equal(result.response_text, variantCase.expectedText);
      assert.equal(result.completion_detected, true);
      assert.equal(result.wait_ms, 17);
      assert.equal(result.http_status, 200);
      assert.equal(result.conversation_id, CONVERSATION_UUID);
      assert.equal(result.chat_url, `https://claude.ai/chat/${CONVERSATION_UUID}`);
      assert.equal(result.model_used, "claude-sonnet-4-6");
      assert.equal(result.files_uploaded_count, variantCase.files.length);
      assert.deepEqual(result.attachment_names, variantCase.files.map((file) => file.name));

      assert.equal(completionPayload.prompt, variantCase.prompt);
      assert.equal(completionPayload.model, "claude-sonnet-4-6");
      assert.match(completionPayload.turn_message_uuids.human_message_uuid, /^[0-9a-f-]{36}$/i);
      assert.match(completionPayload.turn_message_uuids.assistant_message_uuid, /^[0-9a-f-]{36}$/i);

      if (variantCase.files.every((file) => file.image)) {
        assert.deepEqual(completionPayload.attachments, []);
        assert.deepEqual(completionPayload.files, uploadUuids);
      } else {
        assert.deepEqual(completionPayload.files, []);
        assert.equal(completionPayload.attachments.length, variantCase.files.length);
        for (const [index, attachment] of completionPayload.attachments.entries()) {
          const expected = variantCase.files[index];
          assert.equal(attachment.file_name, expected.name);
          assert.equal(attachment.file_type, expected.mime);
          assert.equal(attachment.file_size, Buffer.byteLength(expected.content));
          assert.equal(attachment.origin, "user_upload");
          assert.equal(attachment.kind, "file");
          assert.equal(attachment.path, `/mnt/user-data/uploads/${expected.name}`);
          assert.match(attachment.extracted_content, /RPC_CLAUDE_UPLOAD_/);
        }
      }
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
}
