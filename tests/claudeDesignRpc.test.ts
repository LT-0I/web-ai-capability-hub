import test from "node:test";
import assert from "node:assert/strict";

import {
  buildClaudeDesignGetHtmlPayload,
  CLAUDE_DESIGN_RPC_AVAILABILITY,
  ClaudeDesignRpcFetch,
  claudeDesignRpcAvailability,
  webAiClaudeDesignCreateProjectRpc,
  webAiClaudeDesignGenerateRpc,
  webAiClaudeDesignGetHtmlRpcWithFetch,
  webAiClaudeDesignPresentRpc
} from "../src/mcp/claude_design_rpc";
import { ConsumerErrorCodes } from "../src/consumer/errorCodes";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const PROJECT_URL = "https://claude.ai/design/p/6b373bb0-fe5f-4558-8040-ea03c3becb4a?file=index.html";

test("Claude Design Wave B4 records get_html RPC and known-DOM-only write variants", () => {
  for (const operation of ["create_project", "generate", "present"] as const) {
    const record = claudeDesignRpcAvailability(operation);
    assert.equal(record.rpcAvailable, false);
    assert.match(record.reason, /known-DOM-only|did not capture a stable replayable write RPC/i);
    assert.ok(record.surfaceUrlPattern.startsWith("https://claude.ai/design"));
    assert.ok(record.mountSelectors.length >= 1);
    assert.deepEqual(CLAUDE_DESIGN_RPC_AVAILABILITY[operation], record);
  }
  const getHtml = claudeDesignRpcAvailability("get_html");
  assert.equal(getHtml.rpcAvailable, true);
  assert.match(getHtml.endpoint || "", /OmeletteService\/GetFile/);
  assert.ok(getHtml.mountSelectors.some((selector) => selector.includes("iframe")));
});

test("Claude Design get_html RPC payload uses captured Omelette GetFile shape", () => {
  assert.deepEqual(buildClaudeDesignGetHtmlPayload({ project_url: PROJECT_URL }), {
    projectId: "6b373bb0-fe5f-4558-8040-ea03c3becb4a",
    path: "index.html",
    raw: true
  });
});

test("Claude Design get_html RPC navigates to mounted surface before same-origin fetch and decodes file bytes", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "claude-design-rpc-"));
  try {
    const order: string[] = [];
    let requestBody: any = null;
    const html = "<!DOCTYPE html><html><body><p>OK</p></body></html>\n";
    const fetchRpc: ClaudeDesignRpcFetch = async (request) => {
      order.push("fetch");
      assert.equal(order[0], "navigate");
      assert.match(request.url, /\/design\/anthropic\.omelette\.api\.v1alpha\.OmeletteService\/GetFile$/);
      requestBody = JSON.parse(request.body);
      return {
        status: 200,
        contentType: "application/json",
        text: JSON.stringify({ content: Buffer.from(html, "utf8").toString("base64"), contentType: "text/html", version: "3" }),
        elapsedMs: 17
      };
    };
    const result: any = await webAiClaudeDesignGetHtmlRpcWithFetch(
      { profile: "claude-9224", project_url: PROJECT_URL, download_dir: dir },
      fetchRpc,
      {
        navigate: async (surfaceUrl, mountSelectors) => {
          order.push("navigate");
          assert.equal(surfaceUrl, PROJECT_URL);
          assert.ok(mountSelectors.some((selector) => selector.includes("iframe")));
        }
      }
    );

    assert.deepEqual(order, ["navigate", "fetch"]);
    assert.deepEqual(requestBody, { projectId: "6b373bb0-fe5f-4558-8040-ea03c3becb4a", path: "index.html", raw: true });
    assert.equal(result.errorCode, null);
    assert.equal(result.byteSize, Buffer.byteLength(html));
    assert.equal(result.fileName, "index.html");
    assert.equal(result.http_status, 200);
    assert.equal(result.wait_ms, 17);
    assert.equal(fs.readFileSync(result.savedPath, "utf8"), html);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("Claude Design get_html payload decodes file path from captured-style project URLs", () => {
  assert.deepEqual(buildClaudeDesignGetHtmlPayload({ project_url: PROJECT_URL }), {
    projectId: "6b373bb0-fe5f-4558-8040-ea03c3becb4a",
    path: "index.html",
    raw: true
  });
  assert.deepEqual(buildClaudeDesignGetHtmlPayload({ project_url: "https://claude.ai/design/p/abcdef01-2345-6789-abcd-ef0123456789?file=src/app.html" }), {
    projectId: "abcdef01-2345-6789-abcd-ef0123456789",
    path: "src/app.html",
    raw: true
  });
  assert.deepEqual(buildClaudeDesignGetHtmlPayload({ project_url: "https://claude.ai/design/p/abcdef01-2345-6789-abcd-ef0123456789" }), {
    projectId: "abcdef01-2345-6789-abcd-ef0123456789",
    path: "index.html",
    raw: true
  });
});

test("Claude Design get_html RPC decodes base64 content payload from captured-shape OmeletteService response", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "claude-design-rpc-decode-"));
  try {
    const html = "<!DOCTYPE html><html><body><h1>Decoded From Fixture</h1></body></html>";
    const fetchRpc: ClaudeDesignRpcFetch = async () => ({
      status: 200,
      contentType: "application/json",
      text: JSON.stringify({ content: Buffer.from(html, "utf8").toString("base64"), contentType: "text/html", version: "7" }),
      elapsedMs: 22
    });
    const result: any = await webAiClaudeDesignGetHtmlRpcWithFetch(
      { profile: "claude-9224", project_url: PROJECT_URL, download_dir: dir },
      fetchRpc,
      { navigate: async () => undefined }
    );
    assert.equal(result.errorCode, null);
    assert.equal(result.byteSize, Buffer.byteLength(html));
    assert.equal(fs.readFileSync(result.savedPath, "utf8"), html);
    assert.equal(result.fileName, "index.html");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("Claude Design unavailable RPC entrypoints fail closed instead of falling back to DOM", async () => {
  const results = await Promise.all([
    webAiClaudeDesignCreateProjectRpc({ name: "x" }),
    webAiClaudeDesignGenerateRpc({ project_url: "https://claude.ai/design/p/example", prompt: "x" }),
    webAiClaudeDesignPresentRpc({ project_url: "https://claude.ai/design/p/example?file=index.html" })
  ]);
  for (const result of results as any[]) {
    assert.equal(result.ok, false);
    assert.equal(result.errorCode, ConsumerErrorCodes.INVALID_ARGS);
    assert.equal(result.rpc_available, false);
    assert.match(result.reason, /known-DOM-only|RPC_NOT_AVAILABLE/i);
  }
});
