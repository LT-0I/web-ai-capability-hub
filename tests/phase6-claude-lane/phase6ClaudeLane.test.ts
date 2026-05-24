import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

import { defaultHttpBridgeUrlForProfile } from "../../src/runtime/extension/httpBridgeClient";
import { VENDOR_BROWSER_TOOL_NAMES } from "../../src/runtime/extension/protocol";
import { createExtensionAssistedCdpBackend } from "../../src/browser/backends/extensionAssistedCdpBackend";
import { registerBackend } from "../../src/browser/backends";
import { webAiClaudeGenerateFile, webAiClaudeSendPrompt, webAiClaudeUploadAndQuery } from "../../src/mcp/tools";
import { ConsumerErrorCodes } from "../../src/consumer/errorCodes";

async function startClaudeMockMcpServer(options: { failTools?: boolean } = {}) {
  const calls: string[] = [];
  const requestUrls: string[] = [];
  let sent = false;
  const server = http.createServer(async (req, res) => {
    requestUrls.push(`${req.method} ${req.url}`);
    if (req.method === "GET" && req.url === "/ping") {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ status: "ok" }));
      return;
    }
    if (req.url !== "/mcp" || req.method !== "POST") {
      res.statusCode = 404;
      res.end(JSON.stringify({ error: "not found" }));
      return;
    }
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("end", () => {
      const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
      res.setHeader("content-type", "application/json");
      if (body.method === "initialize") {
        res.setHeader("mcp-session-id", "phase6-session");
        res.end(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: { protocolVersion: "2024-11-05" } }));
        return;
      }
      if (body.method === "notifications/initialized") {
        res.statusCode = 202;
        res.end();
        return;
      }
      assert.equal(body.method, "tools/call");
      const name = body.params?.name;
      calls.push(name);
      if (options.failTools) {
        res.end(JSON.stringify({ jsonrpc: "2.0", id: body.id, error: { code: -32000, message: "native host disconnected" } }));
        return;
      }
      const args = body.params?.arguments || {};
      const ok = (payload: any) => res.end(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: { content: [{ type: "text", text: JSON.stringify(payload) }], isError: false } }));
      if (name === VENDOR_BROWSER_TOOL_NAMES.NAVIGATE) {
        ok({ success: true, tabId: args.tabId || 7, windowId: args.windowId || 1, url: args.url || "https://claude.ai/new", title: "Claude" });
        return;
      }
      if (name === VENDOR_BROWSER_TOOL_NAMES.WEB_FETCHER) {
        ok({ success: true, url: "https://claude.ai/chat/mock", title: "Claude", textContent: sent ? "Prompt\nClaude response complete" : "Claude composer ready" });
        return;
      }
      if (name === VENDOR_BROWSER_TOOL_NAMES.JAVASCRIPT) {
        const code = String(args.code || "");
        if (code.includes("capturedAt")) {
          ok({ success: true, result: { assets: [{ url: "https://claude.ai/assets/app.js", type: "script", initiatorType: "script" }], capturedAt: "2026-05-24T00:00:00.000Z" } });
          return;
        }
        if (code.includes("performance.getEntriesByType")) {
          ok({ success: true, result: [{ url: "https://claude.ai/assets/app.js", type: "script", initiatorType: "script" }] });
          return;
        }
        if (code.includes("group/thumbnail")) {
          ok({ success: true, result: { ready: true, seen: ["fixture.txt"], loading: false } });
          return;
        }
        if (code.includes("serializeElement")) {
          ok({ success: true, result: sent ? [{ index: 0, tagName: "div", text: "Claude response complete", selector: "div.msg", attributes: {} }] : [] });
          return;
        }
        ok({ success: true, result: { ok: true } });
        return;
      }
      if (name === VENDOR_BROWSER_TOOL_NAMES.CLICK) {
        sent = true;
        ok({ success: true, message: "clicked" });
        return;
      }
      if (name === VENDOR_BROWSER_TOOL_NAMES.FILL) {
        ok({ success: true, message: "filled" });
        return;
      }
      if (name === VENDOR_BROWSER_TOOL_NAMES.FILE_UPLOAD) {
        ok({ success: true, selector: args.selector, fileCount: 1, files: [args.filePath] });
        return;
      }
      if (name === VENDOR_BROWSER_TOOL_NAMES.CLOSE_TABS) {
        ok({ success: true });
        return;
      }
      ok({ success: true });
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return {
    url: `http://127.0.0.1:${address.port}/mcp`,
    calls,
    requestUrls,
    close: () => new Promise<void>((resolve) => server.close(() => resolve()))
  };
}

function tempDir(prefix = "wah-p6-"): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test("phase6 defaultHttpBridgeUrlForProfile maps known profiles and unknown default", () => {
  assert.equal(defaultHttpBridgeUrlForProfile("chatgpt"), "http://127.0.0.1:12306/mcp");
  assert.equal(defaultHttpBridgeUrlForProfile("claude-9224"), "http://127.0.0.1:12307/mcp");
  assert.equal(defaultHttpBridgeUrlForProfile("gemini"), "http://127.0.0.1:12308/mcp");
  assert.equal(defaultHttpBridgeUrlForProfile("gemini-9225"), "http://127.0.0.1:12308/mcp");
  assert.equal(defaultHttpBridgeUrlForProfile("unknown"), "http://127.0.0.1:12306/mcp");
});

test("phase6 Claude send_prompt backend=managed-cdp does not construct extension backend", async (t) => {
  let extensionFactoryCalls = 0;
  registerBackend("extension-assisted-cdp", () => {
    extensionFactoryCalls += 1;
    throw new Error("extension backend must not be touched");
  });
  t.after(() => registerBackend("extension-assisted-cdp", createExtensionAssistedCdpBackend));
  const runtime: any = {
    launcher: { launch: async () => { throw new Error("managed path touched"); } }
  };
  await assert.rejects(
    () => webAiClaudeSendPrompt({ profile: "claude-9224", prompt: "hello", backend: "managed-cdp" }, runtime),
    /managed path touched/
  );
  assert.equal(extensionFactoryCalls, 0);
});

test("phase6 Claude send_prompt extension backend calls vendor tools through HTTP bridge", async (t) => {
  const server = await startClaudeMockMcpServer();
  t.after(async () => { await server.close(); });
  const result: any = await webAiClaudeSendPrompt({ profile: "claude-9224", prompt: "hello", backend: "extension-assisted-cdp", http_bridge_url: server.url, response_timeout_ms: 2500 }, {} as any);
  assert.equal(result.errorCode, null);
  assert.equal(result.response_text, "Claude response complete");
  assert.ok(server.requestUrls.every((url) => url.endsWith("/mcp")), server.requestUrls.join("\n"));
  for (const expected of [VENDOR_BROWSER_TOOL_NAMES.NAVIGATE, VENDOR_BROWSER_TOOL_NAMES.WEB_FETCHER, VENDOR_BROWSER_TOOL_NAMES.JAVASCRIPT, VENDOR_BROWSER_TOOL_NAMES.FILL, VENDOR_BROWSER_TOOL_NAMES.CLICK]) {
    assert.ok(server.calls.includes(expected), `missing vendor call ${expected}; saw ${server.calls.join(",")}`);
  }
});

test("phase6 Claude upload_and_query extension backend uploads via vendor file tool", async (t) => {
  const server = await startClaudeMockMcpServer();
  t.after(async () => { await server.close(); });
  const dir = tempDir();
  const file = path.join(dir, "fixture.txt");
  fs.writeFileSync(file, "fixture", "utf8");
  const result: any = await webAiClaudeUploadAndQuery({ profile: "claude-9224", files: [file], prompt: "summarize", backend: "extension-assisted-cdp", http_bridge_url: server.url, response_timeout_ms: 2500 }, {} as any);
  assert.equal(result.errorCode, null);
  assert.deepEqual(result.attachment_names, ["fixture.txt"]);
  assert.ok(server.calls.includes(VENDOR_BROWSER_TOOL_NAMES.FILE_UPLOAD), server.calls.join(","));
  assert.ok(server.calls.includes(VENDOR_BROWSER_TOOL_NAMES.FILL), server.calls.join(","));
});

test("phase6 Claude generate_file extension backend keeps download on artifactClick plane", async (t) => {
  const server = await startClaudeMockMcpServer();
  t.after(async () => { await server.close(); });
  const dir = tempDir();
  let artifactCalls = 0;
  const runtime: any = {
    artifactClick: async (args: any) => {
      artifactCalls += 1;
      assert.equal(args.profile, "claude-9224");
      assert.equal(args.pageReadyEvidence.backend, "extension-assisted-cdp");
      const artifactPath = path.join(dir, "answer.md");
      fs.writeFileSync(artifactPath, "# answer\n", "utf8");
      return { path: artifactPath, sha256: "abc", size: 9, downloadFilename: "answer.md" };
    }
  };
  const result: any = await webAiClaudeGenerateFile({ profile: "claude-9224", prompt: "write markdown", expected_extension: "md", download_dir: dir, backend: "extension-assisted-cdp", http_bridge_url: server.url, response_timeout_ms: 2500 }, runtime);
  assert.equal(result.errorCode, null);
  assert.equal(result.download_filename, "answer.md");
  assert.equal(artifactCalls, 1);
  assert.ok(server.calls.includes(VENDOR_BROWSER_TOOL_NAMES.CLICK), server.calls.join(","));
});

test("phase6 Claude send_prompt bogus backend returns INVALID_ARGS", async () => {
  const result: any = await webAiClaudeSendPrompt({ profile: "claude-9224", prompt: "hello", backend: "bogus" }, {} as any);
  assert.equal(result.errorCode, ConsumerErrorCodes.INVALID_ARGS);
  assert.match(String(result.message), /webai_claude_send_prompt backend must be/);
});

test("phase6 no graceful fallback: extension bridge failure surfaces CHROME_EXTENSION_NOT_CONNECTED", async (t) => {
  const server = await startClaudeMockMcpServer({ failTools: true });
  t.after(async () => { await server.close(); });
  let managedLaunchCalls = 0;
  const runtime: any = {
    launcher: { launch: async () => { managedLaunchCalls += 1; throw new Error("managed fallback must not run"); } }
  };
  const result: any = await webAiClaudeSendPrompt({ profile: "claude-9224", prompt: "hello", backend: "extension-assisted-cdp", http_bridge_url: server.url }, runtime);
  assert.equal(result.errorCode, ConsumerErrorCodes.CHROME_EXTENSION_NOT_CONNECTED);
  assert.equal(managedLaunchCalls, 0);
});

test("phase6 Claude wrappers pass profile-default bridge URL when env and arg are unset", async (t) => {
  const oldEnv = process.env.CHROME_EXTENSION_HTTP_BRIDGE_URL;
  delete process.env.CHROME_EXTENSION_HTTP_BRIDGE_URL;
  let seenUrl = "";
  registerBackend("extension-assisted-cdp", (options?: any) => {
    seenUrl = options?.httpBridgeUrl || "";
    let sent = false;
    const page = {
      navigate: async () => ({ url: "https://claude.ai/new" }),
      textSnapshot: async () => ({ url: "https://claude.ai/chat/mock", title: "Claude", text: sent ? "Prompt\nClaude response complete" : "Claude composer ready" }),
      waitForSelector: async () => undefined,
      queryElements: async (selector: string) => sent && selector.includes("message") ? [{ text: "Claude response complete" }] : [],
      fill: async () => undefined,
      click: async () => { sent = true; },
      assetsList: async () => [],
      assetsBundle: async () => ({ assets: [], capturedAt: "2026-05-24T00:00:00.000Z" })
    };
    return {
      kind: "extension-assisted-cdp",
      ping: async () => ({ ok: true, kind: "extension-assisted-cdp", connected: true }),
      listTabs: async () => [],
      claimTab: async () => page,
      newTab: async () => page,
      finalize: async () => undefined
    } as any;
  });
  t.after(() => {
    if (oldEnv === undefined) delete process.env.CHROME_EXTENSION_HTTP_BRIDGE_URL;
    else process.env.CHROME_EXTENSION_HTTP_BRIDGE_URL = oldEnv;
    registerBackend("extension-assisted-cdp", createExtensionAssistedCdpBackend);
  });
  const result: any = await webAiClaudeSendPrompt({ profile: "claude-9224", prompt: "hello", backend: "extension-assisted-cdp", response_timeout_ms: 2500 }, {} as any);
  assert.equal(result.errorCode, null);
  assert.equal(seenUrl, defaultHttpBridgeUrlForProfile("claude-9224"));
});

test("phase6 Claude bridge URL precedence is env over explicit arg over profile default", async (t) => {
  const oldEnv = process.env.CHROME_EXTENSION_HTTP_BRIDGE_URL;
  process.env.CHROME_EXTENSION_HTTP_BRIDGE_URL = "http://127.0.0.1:65530/mcp";
  let seenUrl = "";
  registerBackend("extension-assisted-cdp", (options?: any) => {
    seenUrl = options?.httpBridgeUrl || "";
    let sent = false;
    const page = {
      navigate: async () => ({ url: "https://claude.ai/new" }),
      textSnapshot: async () => ({ url: "https://claude.ai/chat/mock", title: "Claude", text: sent ? "Prompt\nClaude response complete" : "Claude composer ready" }),
      waitForSelector: async () => undefined,
      queryElements: async (selector: string) => sent && selector.includes("message") ? [{ text: "Claude response complete" }] : [],
      fill: async () => undefined,
      click: async () => { sent = true; },
      assetsList: async () => [],
      assetsBundle: async () => ({ assets: [], capturedAt: "2026-05-24T00:00:00.000Z" })
    };
    return {
      kind: "extension-assisted-cdp",
      ping: async () => ({ ok: true, kind: "extension-assisted-cdp", connected: true }),
      listTabs: async () => [],
      claimTab: async () => page,
      newTab: async () => page,
      finalize: async () => undefined
    } as any;
  });
  t.after(() => {
    if (oldEnv === undefined) delete process.env.CHROME_EXTENSION_HTTP_BRIDGE_URL;
    else process.env.CHROME_EXTENSION_HTTP_BRIDGE_URL = oldEnv;
    registerBackend("extension-assisted-cdp", createExtensionAssistedCdpBackend);
  });
  const result: any = await webAiClaudeSendPrompt({
    profile: "claude-9224",
    prompt: "hello",
    backend: "extension-assisted-cdp",
    http_bridge_url: "http://127.0.0.1:65531/mcp",
    response_timeout_ms: 2500
  }, {} as any);
  assert.equal(result.errorCode, null);
  assert.equal(seenUrl, "http://127.0.0.1:65530/mcp");
});
