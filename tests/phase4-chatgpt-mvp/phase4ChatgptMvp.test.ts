import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

import { HttpBridgeClient } from "../../src/runtime/extension/httpBridgeClient";
import { NativeMessagingBridgeError } from "../../src/runtime/extension/nativeMessagingClient";
import { VENDOR_BROWSER_TOOL_NAMES } from "../../src/runtime/extension/protocol";
import { ExtensionAssistedPagePort, createExtensionAssistedCdpBackend } from "../../src/browser/backends/extensionAssistedCdpBackend";
import { BridgeClient } from "../../src/runtime/extension/bridgeClient";
import { getBackend, registerBackend } from "../../src/browser/backends";
import { webAiChatgptGenerateImage, listMcpTools } from "../../src/mcp/tools";
import { ConsumerErrorCodes } from "../../src/consumer/errorCodes";

function tempDownloadDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "wah-p4-"));
}

async function startMockMcpServer(handler: (body: any, req: http.IncomingMessage, res: http.ServerResponse) => void | Promise<void>) {
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
    req.on("end", async () => {
      const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
      await handler(body, req, res);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return {
    url: `http://127.0.0.1:${address.port}/mcp`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve()))
  };
}

test("phase4 HTTP bridge client maps 200 success through MCP tools/call", async (t) => {
  const seen: string[] = [];
  const server = await startMockMcpServer((body, _req, res) => {
    seen.push(body.method);
    res.setHeader("content-type", "application/json");
    if (body.method === "initialize") {
      res.setHeader("mcp-session-id", "session-a");
      res.end(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: { protocolVersion: "2024-11-05" } }));
      return;
    }
    if (body.method === "notifications/initialized") {
      res.statusCode = 202;
      res.end();
      return;
    }
    assert.equal(body.method, "tools/call");
    assert.equal(body.params.name, VENDOR_BROWSER_TOOL_NAMES.NAVIGATE);
    res.end(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: { content: [{ type: "text", text: '{"success":true,"url":"https://example.com"}' }], isError: false } }));
  });
  t.after(async () => { await server.close(); });
  const client = new HttpBridgeClient({ httpBridgeUrl: server.url, timeoutMs: 1000 });
  const result: any = await client.request(VENDOR_BROWSER_TOOL_NAMES.NAVIGATE, { url: "https://example.com" });
  assert.equal(result.content[0].type, "text");
  assert.deepEqual(seen, ["initialize", "notifications/initialized", "tools/call"]);
  await client.dispose();
});

test("phase4 HTTP bridge client maps 200 JSON-RPC error to Chrome extension code", async (t) => {
  const server = await startMockMcpServer((body, _req, res) => {
    res.setHeader("content-type", "application/json");
    if (body.method === "initialize") {
      res.setHeader("mcp-session-id", "session-b");
      res.end(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: {} }));
      return;
    }
    if (body.method === "notifications/initialized") {
      res.statusCode = 202;
      res.end();
      return;
    }
    res.end(JSON.stringify({ jsonrpc: "2.0", id: body.id, error: { code: -32000, message: "Debugger is already attached" } }));
  });
  t.after(async () => { await server.close(); });
  const client = new HttpBridgeClient({ httpBridgeUrl: server.url, timeoutMs: 1000 });
  await assert.rejects(() => client.request(VENDOR_BROWSER_TOOL_NAMES.JAVASCRIPT, { code: "return 1" }), (error: any) => {
    assert.equal(error.errorCode, ConsumerErrorCodes.CHROME_EXTENSION_DEBUGGER_UNAVAILABLE);
    return true;
  });
});

test("phase4 HTTP bridge client maps 404 and 500 to CHROME_EXTENSION_NOT_CONNECTED", async (t) => {
  for (const status of [404, 500]) {
    const server = await startMockMcpServer((_body, _req, res) => {
      res.statusCode = status;
      res.end(JSON.stringify({ error: `HTTP ${status}` }));
    });
    t.after(async () => { await server.close(); });
    const client = new HttpBridgeClient({ httpBridgeUrl: server.url, timeoutMs: 1000 });
    await assert.rejects(() => client.request(VENDOR_BROWSER_TOOL_NAMES.NAVIGATE, { url: "https://example.com" }), (error: any) => {
      assert.equal(error.errorCode, ConsumerErrorCodes.CHROME_EXTENSION_NOT_CONNECTED);
      return true;
    });
  }
});

class MockBridgeClient implements BridgeClient {
  calls: Array<{ method: string; params: any }> = [];
  async ping(): Promise<unknown> { return { ok: true }; }
  async dispose(): Promise<void> {}
  async request(method: any, params?: any): Promise<any> {
    this.calls.push({ method, params });
    if (method === VENDOR_BROWSER_TOOL_NAMES.NAVIGATE) return { content: [{ type: "text", text: JSON.stringify({ success: true, tabId: params.tabId || 7, windowId: params.windowId || 1, url: params.url, title: "Example" }) }] };
    if (method === VENDOR_BROWSER_TOOL_NAMES.WEB_FETCHER) return { content: [{ type: "text", text: JSON.stringify({ success: true, url: "https://example.com", title: "Title", textContent: "Visible text" }) }] };
    if (method === VENDOR_BROWSER_TOOL_NAMES.JAVASCRIPT) {
      if (String(params.code).includes("performance.getEntriesByType") && String(params.code).includes("capturedAt")) return { content: [{ type: "text", text: JSON.stringify({ success: true, result: { assets: [{ url: "https://example.com/a.png", type: "image", initiatorType: "img" }], capturedAt: "2026-05-24T00:00:00.000Z" } }) }] };
      if (String(params.code).includes("performance.getEntriesByType")) return { content: [{ type: "text", text: JSON.stringify({ success: true, result: [{ url: "https://example.com/a.js", type: "script", initiatorType: "script" }] }) }] };
      if (String(params.code).includes("document.querySelectorAll")) return { content: [{ type: "text", text: JSON.stringify({ success: true, result: [{ index: 0, tagName: "IMG", text: "Alt", selector: "img", attributes: { alt: "Alt" } }] }) }] };
      if (String(params.code).includes("2 + 2")) return { content: [{ type: "text", text: JSON.stringify({ success: true, result: 4 }) }] };
      return { content: [{ type: "text", text: JSON.stringify({ success: true, result: { ok: true } }) }] };
    }
    return { content: [{ type: "text", text: JSON.stringify({ success: true }) }] };
  }
}

test("phase4 backend tab.* methods call vendor wire names and normalize return shapes", async () => {
  const client = new MockBridgeClient();
  const port = new ExtensionAssistedPagePort(client, 7, 1);

  const tab = await port.navigate("https://example.com", { timeoutMs: 5000 });
  assert.equal(tab.url, "https://example.com");
  assert.equal(client.calls.at(-1)?.method, VENDOR_BROWSER_TOOL_NAMES.NAVIGATE);
  assert.equal(client.calls.at(-1)?.params.tabId, 7);

  await port.waitForSelector("#ready", { state: "visible", timeoutMs: 1234 });
  assert.equal(client.calls.at(-1)?.method, VENDOR_BROWSER_TOOL_NAMES.JAVASCRIPT);
  assert.match(client.calls.at(-1)?.params.code, /document\.querySelector/);

  const elements = await port.queryElements("img", { limit: 1 });
  assert.deepEqual(elements, [{ index: 0, tagName: "img", text: "Alt", selector: "img", attributes: { alt: "Alt" } }]);
  assert.match(client.calls.at(-1)?.params.code, /slice\(0, limit\)/);

  await port.click({ selector: "button.save" }, { timeoutMs: 2222, button: "left" });
  assert.equal(client.calls.at(-1)?.method, VENDOR_BROWSER_TOOL_NAMES.CLICK);
  assert.equal(client.calls.at(-1)?.params.selector, "button.save");

  await port.fill({ selector: "textarea" }, "hello", { timeoutMs: 3333 });
  assert.equal(client.calls.at(-1)?.method, VENDOR_BROWSER_TOOL_NAMES.FILL);
  assert.equal(client.calls.at(-1)?.params.value, "hello");

  assert.equal(await port.evaluateReadOnly<number>("2 + 2"), 4);

  const snapshot = await port.textSnapshot({ selector: "main" });
  assert.deepEqual(snapshot, { url: "https://example.com", title: "Title", text: "Visible text" });
  assert.equal(client.calls.at(-1)?.method, VENDOR_BROWSER_TOOL_NAMES.WEB_FETCHER);

  const assets = await port.assetsList();
  assert.deepEqual(assets, [{ url: "https://example.com/a.js", type: "script", initiatorType: "script" }]);
  assert.match(client.calls.at(-1)?.params.code, /performance\.getEntriesByType\('resource'\)/);
  assert.match(client.calls.at(-1)?.params.code, /picture > source/);

  const bundle = await port.assetsBundle();
  assert.equal(bundle.capturedAt, "2026-05-24T00:00:00.000Z");
  assert.equal(bundle.assets[0].url, "https://example.com/a.png");
  assert.equal(client.calls.at(-1)?.method, VENDOR_BROWSER_TOOL_NAMES.JAVASCRIPT);

  await port.close();
  assert.equal(client.calls.at(-1)?.method, VENDOR_BROWSER_TOOL_NAMES.CLOSE_TABS);
  assert.deepEqual(client.calls.at(-1)?.params.tabIds, [7]);
});

test("phase4 evaluateReadOnly rejects common write patterns", async () => {
  const port = new ExtensionAssistedPagePort(new MockBridgeClient(), 1);
  for (const expression of [
    "document.querySelector('input').value = 'x'",
    "document.querySelector('button').click()",
    "document.body.appendChild(document.createElement('div'))"
  ]) {
    await assert.rejects(() => port.evaluateReadOnly(expression), (error: any) => {
      assert.equal(error.errorCode, ConsumerErrorCodes.CHROME_EXTENSION_PERMISSION_DENIED);
      return true;
    });
  }
});

test("phase4/6 contract and MCP schema expose backend enum on opted-in image tools", () => {
  const manifest = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "configs/consumer-contract.json"), "utf8"));
  const row = manifest.commands.find((command: any) => command.mcp_name === "webai_chatgpt_generate_image");
  assert.ok(row.optional_args.includes("backend"));
  const tool: any = listMcpTools().find((item) => item.name === "webai_chatgpt_generate_image");
  assert.deepEqual(tool.inputSchema.properties.backend.enum, ["managed-cdp", "extension-assisted-cdp"]);
  const gemini: any = listMcpTools().find((item) => item.name === "webai_gemini_generate_image");
  assert.deepEqual(gemini.inputSchema.properties.backend.enum, ["managed-cdp", "extension-assisted-cdp"]);
});

test("phase4 tool routing defaults to extension backend and keeps managed as explicit opt-in", async (t) => {
  let extensionFactoryCalls = 0;
  let managedLaunchCalls = 0;
  const fakePage = {
    navigate: async () => ({ id: "7", kind: "extension-assisted-cdp", tabId: 7, url: "https://chatgpt.com/" }),
    waitForSelector: async () => undefined,
    click: async () => undefined,
    fill: async () => undefined,
    queryElements: async () => [{ index: 0, tagName: "img", text: "", selector: "img", attributes: {} }],
    textSnapshot: async () => ({ url: "https://chatgpt.com/c/abc", title: "ChatGPT", text: "" }),
    assetsList: async () => [],
    assetsBundle: async () => ({ assets: [{ url: "https://images.example/generated.png", type: "image", initiatorType: "img" }], capturedAt: "2026-05-24T00:00:00.000Z" })
  };
  registerBackend("extension-assisted-cdp", () => {
    extensionFactoryCalls += 1;
    return {
      kind: "extension-assisted-cdp",
      ping: async () => ({ ok: true, kind: "extension-assisted-cdp", connected: true }),
      listTabs: async () => [],
      claimTab: async () => fakePage as any,
      newTab: async () => fakePage as any,
      finalize: async () => undefined
    } as any;
  });
  t.after(() => registerBackend("extension-assisted-cdp", createExtensionAssistedCdpBackend));

  const runtime: any = {
    artifactClick: async () => ({ path: path.join(tempDownloadDir(), "generated.png"), sha256: "abc", size: 12, downloadFilename: "generated.png" }),
    launcher: { launch: async () => { managedLaunchCalls += 1; throw new Error("managed path touched"); } }
  };
  const result: any = await webAiChatgptGenerateImage({ profile: "p4-ext", prompt: "make image", download_dir: tempDownloadDir(), backend: "extension-assisted-cdp" }, runtime);
  assert.equal(result.errorCode, null);
  assert.equal(extensionFactoryCalls, 1);
  assert.equal(managedLaunchCalls, 0);

  await assert.rejects(
    () => webAiChatgptGenerateImage({ profile: "p4-managed", prompt: "make image", download_dir: tempDownloadDir(), backend: "managed-cdp" }, runtime),
    /managed path touched/
  );
  const defaultResult: any = await webAiChatgptGenerateImage({ profile: "p4-default", prompt: "make image", download_dir: tempDownloadDir() }, runtime);
  assert.equal(defaultResult.errorCode, null);
  assert.equal(extensionFactoryCalls, 2, "explicit extension + default path both construct the extension backend");
  assert.equal(managedLaunchCalls, 1);
});

test("phase4 no graceful fallback: unreachable HTTP endpoint surfaces CHROME_EXTENSION_NOT_CONNECTED", async () => {
  let managedLaunchCalls = 0;
  const runtime: any = {
    launcher: { launch: async () => { managedLaunchCalls += 1; throw new Error("managed fallback must not run"); } },
    artifactClick: async () => { throw new Error("artifactClick must not run"); }
  };
  const result: any = await webAiChatgptGenerateImage({
    profile: "p4-no-fallback",
    prompt: "make image",
    download_dir: tempDownloadDir(),
    backend: "extension-assisted-cdp",
    http_bridge_url: "http://127.0.0.1:9/mcp"
  }, runtime);
  assert.equal(result.errorCode, ConsumerErrorCodes.CHROME_EXTENSION_NOT_CONNECTED);
  assert.equal(managedLaunchCalls, 0);
});
