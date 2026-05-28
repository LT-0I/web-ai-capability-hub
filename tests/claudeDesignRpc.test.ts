import test from "node:test";
import assert from "node:assert/strict";

import {
  buildClaudeDesignCreateProjectPayload,
  buildClaudeDesignGetHtmlPayload,
  CLAUDE_DESIGN_RPC_AVAILABILITY,
  ClaudeDesignRpcFetch,
  claudeDesignRpcAvailability,
  webAiClaudeDesignCreateProjectRpcWithFetch,
  webAiClaudeDesignGenerateRpc,
  webAiClaudeDesignGetHtmlRpcWithFetch,
  webAiClaudeDesignPresentRpc
} from "../src/mcp/claude_design_rpc";
import { ConsumerErrorCodes } from "../src/consumer/errorCodes";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const PROJECT_URL = "https://claude.ai/design/p/6b373bb0-fe5f-4558-8040-ea03c3becb4a?file=index.html";
const CREATE_PROJECT_ENDPOINT = "https://claude.ai/design/anthropic.omelette.api.v1alpha.OmeletteService/CreateProject";

test("Claude Design Wave C1 records create_project + get_html on RPC and known-DOM-only write variants for generate/present", () => {
  for (const operation of ["generate", "present"] as const) {
    const record = claudeDesignRpcAvailability(operation);
    assert.equal(record.rpcAvailable, false);
    assert.match(record.reason, /known-DOM-only|did not capture a stable replayable write RPC|protobuf schema|client-side/i);
    assert.ok(record.surfaceUrlPattern.startsWith("https://claude.ai/design"));
    assert.ok(record.mountSelectors.length >= 1);
    assert.deepEqual(CLAUDE_DESIGN_RPC_AVAILABILITY[operation], record);
  }
  const getHtml = claudeDesignRpcAvailability("get_html");
  assert.equal(getHtml.rpcAvailable, true);
  assert.match(getHtml.endpoint || "", /OmeletteService\/GetFile/);
  assert.ok(getHtml.mountSelectors.some((selector) => selector.includes("iframe")));

  const createProject = claudeDesignRpcAvailability("create_project");
  assert.equal(createProject.rpcAvailable, true);
  assert.match(createProject.endpoint || "", /OmeletteService\/CreateProject/);
  assert.match(createProject.reason, /CreateProject|Omelette|application\/json/i);
  assert.ok(createProject.mountSelectors.some((selector) => selector.includes("create-project-button") || selector.includes("Project name")));
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

test("Claude Design create_project payload uses captured Omelette CreateProject minimal shape", () => {
  // Captured probe-json-rpc CreateProject_JSON_minimal: body {name} → {projectId}
  assert.deepEqual(buildClaudeDesignCreateProjectPayload({ name: "Wave C1 throwaway" }), {
    name: "Wave C1 throwaway"
  });
  assert.throws(() => buildClaudeDesignCreateProjectPayload({ name: "" }));
  assert.throws(() => buildClaudeDesignCreateProjectPayload({}));
});

test("Claude Design create_project RPC navigates to design root then issues Connect-unary application/json POST and parses projectId", async () => {
  const order: string[] = [];
  let requestUrl = "";
  let requestBody: any = null;
  const projectId = "f8f89aef-684b-4a8e-b84b-e989183390b6";
  const fetchRpc: ClaudeDesignRpcFetch = async (request) => {
    order.push("fetch");
    assert.equal(order[0], "navigate");
    requestUrl = request.url;
    requestBody = JSON.parse(request.body);
    return {
      status: 200,
      contentType: "application/json",
      text: JSON.stringify({ projectId }),
      elapsedMs: 41
    };
  };
  const result: any = await webAiClaudeDesignCreateProjectRpcWithFetch(
    { profile: "claude-9224", name: "Wave C1 throwaway" },
    fetchRpc,
    {
      navigate: async (surfaceUrl, mountSelectors) => {
        order.push("navigate");
        assert.equal(surfaceUrl, "https://claude.ai/design");
        assert.ok(mountSelectors.some((selector) => selector.includes("create-project-button") || selector.includes("Project name")));
      }
    }
  );

  assert.deepEqual(order, ["navigate", "fetch"]);
  assert.equal(requestUrl, CREATE_PROJECT_ENDPOINT);
  assert.deepEqual(requestBody, { name: "Wave C1 throwaway" });
  assert.equal(result.errorCode, null);
  assert.equal(result.projectId, projectId);
  assert.equal(result.projectUrl, `https://claude.ai/design/p/${projectId}`);
  assert.equal(result.http_status, 200);
  assert.equal(result.backend, "rpc");
  assert.equal(result.rpc_endpoint, CREATE_PROJECT_ENDPOINT);
  assert.equal(result.wait_ms, 41);
});

test("Claude Design create_project RPC surfaces stable error code on non-200 HTTP", async () => {
  const fetchRpc: ClaudeDesignRpcFetch = async () => ({
    status: 429,
    contentType: "application/json",
    text: JSON.stringify({ code: "rate_limit", message: "rate limit hit" }),
    elapsedMs: 8
  });
  const result: any = await webAiClaudeDesignCreateProjectRpcWithFetch(
    { profile: "claude-9224", name: "throwaway" },
    fetchRpc,
    { navigate: async () => undefined }
  );
  assert.equal(result.ok, false);
  assert.equal(result.errorCode, ConsumerErrorCodes.SUBMCP_QUOTA_EXHAUSTED);
  assert.equal(result.http_status, 429);
  assert.equal(result.projectId, null);
  assert.equal(result.backend, "rpc");
});

test("Claude Design create_project RPC fails closed when response omits projectId", async () => {
  const fetchRpc: ClaudeDesignRpcFetch = async () => ({
    status: 200,
    contentType: "application/json",
    text: JSON.stringify({ unrelated: "field" }),
    elapsedMs: 5
  });
  const result: any = await webAiClaudeDesignCreateProjectRpcWithFetch(
    { profile: "claude-9224", name: "throwaway" },
    fetchRpc,
    { navigate: async () => undefined }
  );
  assert.equal(result.ok, false);
  assert.equal(result.errorCode, ConsumerErrorCodes.INVALID_JSON);
  assert.equal(result.projectId, null);
});

test("Claude Design generate + present unavailable RPC entrypoints fail closed instead of falling back to DOM", async () => {
  const results = await Promise.all([
    webAiClaudeDesignGenerateRpc({ project_url: "https://claude.ai/design/p/example", prompt: "x" }),
    webAiClaudeDesignPresentRpc({ project_url: "https://claude.ai/design/p/example?file=index.html" })
  ]);
  for (const result of results as any[]) {
    assert.equal(result.ok, false);
    assert.equal(result.errorCode, ConsumerErrorCodes.INVALID_ARGS);
    assert.equal(result.rpc_available, false);
    assert.match(result.reason, /known-DOM-only|RPC_NOT_AVAILABLE|protobuf|client-side/i);
  }
});
