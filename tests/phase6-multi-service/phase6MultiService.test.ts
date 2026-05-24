import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

import { ConsumerErrorCodes } from "../../src/consumer/errorCodes";
import { VENDOR_BROWSER_TOOL_NAMES } from "../../src/runtime/extension/protocol";
import { defaultHttpBridgeUrlForProfile } from "../../src/runtime/extension/httpBridgeClient";
import { listMcpTools, webAiGeminiGenerateImage, webAiGeminiGenerateVideo, webAiGeminiMusicGenerate } from "../../src/mcp/tools";

type ToolCall = { name: string; args: Record<string, unknown> };

function tempDownloadDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "wah-p6-"));
}

async function startMockMcpServer() {
  const toolCalls: ToolCall[] = [];
  const server = http.createServer(async (req, res) => {
    if (req.method === "GET" && req.url === "/ping") {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ status: "ok", message: "pong" }));
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
      const name = String(body.params?.name || "");
      const args = (body.params?.arguments || {}) as Record<string, unknown>;
      toolCalls.push({ name, args });
      res.end(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: { content: [{ type: "text", text: JSON.stringify(mockVendorPayload(name, args)) }], isError: false } }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return {
    port: address.port,
    toolCalls,
    close: () => new Promise<void>((resolve) => server.close(() => resolve()))
  };
}

function mockVendorPayload(name: string, args: Record<string, unknown>): Record<string, unknown> {
  if (name === VENDOR_BROWSER_TOOL_NAMES.NAVIGATE) {
    return { success: true, tabId: args.tabId || 8, windowId: args.windowId || 1, url: args.url || "https://gemini.google.com/app", title: "Gemini" };
  }
  if (name === VENDOR_BROWSER_TOOL_NAMES.GET_WINDOWS_AND_TABS) {
    return { success: true, windows: [{ windowId: 1, tabs: [{ id: 8, tabId: 8, url: "https://gemini.google.com/app", title: "Gemini", active: true }] }] };
  }
  if (name === VENDOR_BROWSER_TOOL_NAMES.SWITCH_TAB) {
    return { success: true, tabId: args.tabId || 8, windowId: args.windowId || 1, url: "https://gemini.google.com/app", title: "Gemini" };
  }
  if (name === VENDOR_BROWSER_TOOL_NAMES.WEB_FETCHER) {
    return { success: true, url: "https://gemini.google.com/app/c/phase6", title: "Gemini", textContent: "Gemini ready" };
  }
  if (name === VENDOR_BROWSER_TOOL_NAMES.JAVASCRIPT) {
    const code = String(args.code || "");
    if (code.includes("performance.getEntriesByType") && code.includes("capturedAt")) {
      return { success: true, result: { capturedAt: "2026-05-24T00:00:00.000Z", assets: [{ url: "https://gemini.example/generated.png", type: "image", initiatorType: "img" }, { url: "https://gemini.example/generated.mp4", type: "video", initiatorType: "video" }, { url: "https://gemini.example/generated.mp3", type: "audio", initiatorType: "audio" }] } };
    }
    if (code.includes("performance.getEntriesByType")) {
      return { success: true, result: [{ url: "https://gemini.example/generated.png", type: "image", initiatorType: "img" }] };
    }
    if (code.includes("document.querySelectorAll")) {
      return { success: true, result: [{ index: 0, tagName: "BUTTON", text: "Download", selector: "button[aria-label='Download']", attributes: { "aria-label": "Download" } }] };
    }
    return { success: true, result: { ok: true } };
  }
  if (name === VENDOR_BROWSER_TOOL_NAMES.CLICK || name === VENDOR_BROWSER_TOOL_NAMES.FILL || name === VENDOR_BROWSER_TOOL_NAMES.CLOSE_TABS) {
    return { success: true };
  }
  return { success: true };
}

async function withMockBridge<T>(t: any, profile: string, fn: (ctx: { seenUrls: string[]; toolCalls: ToolCall[] }) => Promise<T>): Promise<T> {
  const server = await startMockMcpServer();
  const originalFetch = globalThis.fetch;
  const originalEnv = process.env.CHROME_EXTENSION_HTTP_BRIDGE_URL;
  const seenUrls: string[] = [];
  delete process.env.CHROME_EXTENSION_HTTP_BRIDGE_URL;
  (globalThis as any).fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const original = new URL(input instanceof Request ? input.url : String(input));
    seenUrls.push(original.toString());
    const redirected = new URL(original.toString());
    redirected.hostname = "127.0.0.1";
    redirected.port = String(server.port);
    return originalFetch(redirected, init);
  };
  t.after(async () => {
    (globalThis as any).fetch = originalFetch;
    if (originalEnv === undefined) delete process.env.CHROME_EXTENSION_HTTP_BRIDGE_URL;
    else process.env.CHROME_EXTENSION_HTTP_BRIDGE_URL = originalEnv;
    await server.close();
  });
  void profile;
  return fn({ seenUrls, toolCalls: server.toolCalls });
}

function artifactRuntime(filename: string): any {
  return {
    artifactClick: async () => ({ path: path.join(tempDownloadDir(), filename), sha256: "sha", size: 12, downloadFilename: filename }),
    launcher: { launch: async () => { throw new Error("managed path must not run"); } }
  };
}

function assertExtensionToolsAndProfileUrl(ctx: { seenUrls: string[]; toolCalls: ToolCall[] }, expectedProfileUrl: string): void {
  assert.ok(ctx.seenUrls.includes(expectedProfileUrl), `expected fetch to use ${expectedProfileUrl}; saw ${ctx.seenUrls.join(", ")}`);
  const names = ctx.toolCalls.map((call) => call.name);
  for (const expected of [
    VENDOR_BROWSER_TOOL_NAMES.NAVIGATE,
    VENDOR_BROWSER_TOOL_NAMES.WEB_FETCHER,
    VENDOR_BROWSER_TOOL_NAMES.JAVASCRIPT,
    VENDOR_BROWSER_TOOL_NAMES.CLICK,
    VENDOR_BROWSER_TOOL_NAMES.FILL
  ]) {
    assert.ok(names.includes(expected), `missing vendor tool call ${expected}; saw ${names.join(", ")}`);
  }
}

test("phase6 defaultHttpBridgeUrlForProfile maps canonical multi-Chrome ports", () => {
  assert.equal(defaultHttpBridgeUrlForProfile("chatgpt"), "http://127.0.0.1:12306/mcp");
  assert.equal(defaultHttpBridgeUrlForProfile("claude-9224"), "http://127.0.0.1:12307/mcp");
  assert.equal(defaultHttpBridgeUrlForProfile("gemini"), "http://127.0.0.1:12308/mcp");
  assert.equal(defaultHttpBridgeUrlForProfile("gemini-9225"), "http://127.0.0.1:12308/mcp");
  assert.equal(defaultHttpBridgeUrlForProfile("unknown"), "http://127.0.0.1:12306/mcp");
  assert.equal(defaultHttpBridgeUrlForProfile(undefined), "http://127.0.0.1:12306/mcp");
});

test("phase6 Gemini image managed-cdp path does not touch the HTTP bridge", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  (globalThis as any).fetch = async () => { fetchCalls += 1; throw new Error("HTTP bridge touched"); };
  try {
    await assert.rejects(
      () => webAiGeminiGenerateImage({ profile: "gemini-managed", prompt: "make image", download_dir: tempDownloadDir(), backend: "managed-cdp" }, artifactRuntime("managed.png")),
      /managed path must not run/
    );
    assert.equal(fetchCalls, 0);
  } finally {
    (globalThis as any).fetch = originalFetch;
  }
});

test("phase6 Gemini image extension-assisted-cdp uses vendor tools and gemini profile port", async (t) => {
  await withMockBridge(t, "gemini", async (ctx) => {
    const result: any = await webAiGeminiGenerateImage({ profile: "gemini", prompt: "make image", download_dir: tempDownloadDir(), backend: "extension-assisted-cdp" }, artifactRuntime("generated.png"));
    assert.equal(result.errorCode, null);
    assertExtensionToolsAndProfileUrl(ctx, "http://127.0.0.1:12308/mcp");
  });
});

test("phase6 Gemini video extension-assisted-cdp uses vendor tools and gemini-9225 profile port", async (t) => {
  await withMockBridge(t, "gemini-9225", async (ctx) => {
    const result: any = await webAiGeminiGenerateVideo({ profile: "gemini-9225", prompt: "make video", download_dir: tempDownloadDir(), backend: "extension-assisted-cdp" }, artifactRuntime("generated.mp4"));
    assert.equal(result.errorCode, null);
    assertExtensionToolsAndProfileUrl(ctx, "http://127.0.0.1:12308/mcp");
  });
});

test("phase6 Gemini music extension-assisted-cdp uses vendor tools and gemini profile port", async (t) => {
  await withMockBridge(t, "gemini", async (ctx) => {
    const result: any = await webAiGeminiMusicGenerate({ profile: "gemini", prompt: "gentle instrumental piano", confirmed: true, backend: "extension-assisted-cdp" }, artifactRuntime("generated.mp3"));
    assert.equal(result.errorCode, null);
    assertExtensionToolsAndProfileUrl(ctx, "http://127.0.0.1:12308/mcp");
  });
});

test("phase6 Gemini contract and MCP schemas expose backend enum on all three tools", () => {
  const manifest = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "configs/consumer-contract.json"), "utf8"));
  const tools = new Map(listMcpTools().map((tool: any) => [tool.name, tool]));
  for (const name of ["webai_gemini_generate_image", "webai_gemini_generate_video", "webai_gemini_music_generate"]) {
    const row = manifest.commands.find((command: any) => command.mcp_name === name);
    assert.ok(row?.optional_args?.includes("backend"), `${name} contract optional_args missing backend`);
    assert.deepEqual((tools.get(name) as any)?.inputSchema?.properties?.backend?.enum, ["managed-cdp", "extension-assisted-cdp"], `${name} schema backend enum`);
  }
});

test("phase6 explicit http_bridge_url overrides the gemini profile default port", async (t) => {
  await withMockBridge(t, "gemini", async (ctx) => {
    const explicitUrl = "http://127.0.0.1:54321/mcp";
    const result: any = await webAiGeminiGenerateImage({ profile: "gemini", prompt: "make image", download_dir: tempDownloadDir(), backend: "extension-assisted-cdp", http_bridge_url: explicitUrl }, artifactRuntime("explicit.png"));
    assert.equal(result.errorCode, null);
    assert.ok(ctx.seenUrls.includes(explicitUrl), `expected explicit URL ${explicitUrl}; saw ${ctx.seenUrls.join(", ")}`);
    assert.equal(ctx.seenUrls.includes("http://127.0.0.1:12308/mcp"), false, "explicit http_bridge_url must win over profile default");
  });
});

test("phase6 Gemini image invalid backend returns INVALID_ARGS", async () => {
  const result: any = await webAiGeminiGenerateImage({ profile: "gemini-invalid", prompt: "make image", download_dir: tempDownloadDir(), backend: "bogus" }, artifactRuntime("invalid.png"));
  assert.equal(result.errorCode, ConsumerErrorCodes.INVALID_ARGS);
});

test("phase6 no graceful fallback: extension bridge connection errors surface CHROME_EXTENSION_NOT_CONNECTED", async () => {
  let managedLaunchCalls = 0;
  const runtime: any = {
    launcher: { launch: async () => { managedLaunchCalls += 1; throw new Error("managed fallback must not run"); } },
    artifactClick: async () => { throw new Error("artifactClick must not run"); }
  };
  const result: any = await webAiGeminiGenerateImage({
    profile: "gemini-no-fallback",
    prompt: "make image",
    download_dir: tempDownloadDir(),
    backend: "extension-assisted-cdp",
    http_bridge_url: "http://127.0.0.1:9/mcp"
  }, runtime);
  assert.equal(result.errorCode, ConsumerErrorCodes.CHROME_EXTENSION_NOT_CONNECTED);
  assert.equal(managedLaunchCalls, 0);
});
