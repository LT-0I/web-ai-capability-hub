import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { ConsumerErrorCodes } from "../../src/consumer/errorCodes";
import { classifyChromeExtensionBridgeError, HttpBridgeClient } from "../../src/runtime/extension/httpBridgeClient";
import { webAiChatgptGenerateImage } from "../../src/mcp/tools";

function tempDownloadDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "wah-p5-failure-"));
}

async function startMockMcpServer(
  handler: (req: http.IncomingMessage, res: http.ServerResponse, body: any) => void | Promise<void>
): Promise<{ url: string; close: () => Promise<void> }> {
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("end", async () => {
      const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
      await handler(req, res, body);
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

async function closedLocalPort(): Promise<number> {
  const server = http.createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const port = address.port;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

function assertNoManagedCdpEvidence(value: unknown): void {
  const serialized = JSON.stringify(value);
  assert.equal(serialized.includes("managed-cdp"), false, "extension failure output must not include managed-cdp evidence");
  assert.equal((value as any)?.pageReadyEvidence?.backend, undefined);
}

test("phase5 classifier maps not-connected bridge failures", () => {
  assert.equal(
    classifyChromeExtensionBridgeError(Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:12306"), { code: "ECONNREFUSED" })),
    ConsumerErrorCodes.CHROME_EXTENSION_NOT_CONNECTED
  );
  assert.equal(
    classifyChromeExtensionBridgeError({ message: "Chrome extension native-server HTTP 500: internal error" }),
    ConsumerErrorCodes.CHROME_EXTENSION_NOT_CONNECTED
  );
  assert.equal(
    classifyChromeExtensionBridgeError(new Error("The operation was aborted due to timeout")),
    ConsumerErrorCodes.CHROME_EXTENSION_NOT_CONNECTED
  );
});

test("phase5 classifier maps permission-denied bridge failures", () => {
  for (const payload of [
    { error: "Missing host permission" },
    { error: "chrome.scripting requires permission" },
    { error: "cannot access contents of url" }
  ]) {
    assert.equal(classifyChromeExtensionBridgeError(payload), ConsumerErrorCodes.CHROME_EXTENSION_PERMISSION_DENIED);
  }
});

test("phase5 classifier maps debugger-unavailable bridge failures", () => {
  for (const payload of [
    { error: "Another debugger is already attached" },
    { error: "Failed to attach to debuggee" },
    { error: "DevTools is open on this tab" }
  ]) {
    assert.equal(classifyChromeExtensionBridgeError(payload), ConsumerErrorCodes.CHROME_EXTENSION_DEBUGGER_UNAVAILABLE);
  }
});

test("phase5 HTTP bridge maps ECONNREFUSED to CHROME_EXTENSION_NOT_CONNECTED", async () => {
  const port = await closedLocalPort();
  const client = new HttpBridgeClient({ httpBridgeUrl: `http://127.0.0.1:${port}/mcp`, timeoutMs: 250 });
  await assert.rejects(() => client.connect(), (error: any) => {
    assert.equal(error.errorCode, ConsumerErrorCodes.CHROME_EXTENSION_NOT_CONNECTED);
    return true;
  });
});

test("phase5 HTTP bridge maps 5xx to CHROME_EXTENSION_NOT_CONNECTED", async (t) => {
  const server = await startMockMcpServer((_req, res) => {
    res.statusCode = 503;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ error: "native server unavailable" }));
  });
  t.after(async () => { await server.close(); });
  const client = new HttpBridgeClient({ httpBridgeUrl: server.url, timeoutMs: 500 });
  await assert.rejects(() => client.connect(), (error: any) => {
    assert.equal(error.errorCode, ConsumerErrorCodes.CHROME_EXTENSION_NOT_CONNECTED);
    return true;
  });
});

test("phase5 HTTP bridge maps timeout to CHROME_EXTENSION_NOT_CONNECTED", async (t) => {
  const server = await startMockMcpServer(() => undefined);
  t.after(async () => { await server.close(); });
  const client = new HttpBridgeClient({ httpBridgeUrl: server.url, timeoutMs: 25 });
  await assert.rejects(() => client.connect(), (error: any) => {
    assert.equal(error.errorCode, ConsumerErrorCodes.CHROME_EXTENSION_NOT_CONNECTED);
    return true;
  });
});

for (const scenario of [
  {
    code: ConsumerErrorCodes.CHROME_EXTENSION_NOT_CONNECTED,
    handler: (_req: http.IncomingMessage, res: http.ServerResponse) => {
      res.statusCode = 500;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ error: "native server disconnected" }));
    }
  },
  {
    code: ConsumerErrorCodes.CHROME_EXTENSION_PERMISSION_DENIED,
    handler: (_req: http.IncomingMessage, res: http.ServerResponse, body: any) => {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ jsonrpc: "2.0", id: body.id, error: { code: -32000, message: "Missing host permission" } }));
    }
  },
  {
    code: ConsumerErrorCodes.CHROME_EXTENSION_DEBUGGER_UNAVAILABLE,
    handler: (_req: http.IncomingMessage, res: http.ServerResponse, body: any) => {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ jsonrpc: "2.0", id: body.id, error: { code: -32000, message: "Another debugger is already attached" } }));
    }
  }
]) {
  test(`phase5 full ChatGPT extension path surfaces ${scenario.code} without managed-CDP fallback`, async (t) => {
    const server = await startMockMcpServer(scenario.handler);
    t.after(async () => { await server.close(); });
    let managedLaunchCalls = 0;
    const runtime: any = {
      launcher: { launch: async () => { managedLaunchCalls += 1; throw new Error("managed fallback must not run"); } },
      artifactClick: async () => { throw new Error("artifactClick must not run"); }
    };

    const result: any = await webAiChatgptGenerateImage({
      profile: `p5-${scenario.code.toLowerCase()}`,
      prompt: "make image",
      download_dir: tempDownloadDir(),
      backend: "extension-assisted-cdp",
      http_bridge_url: server.url
    }, runtime);

    assert.equal(result.errorCode, scenario.code);
    assert.equal(managedLaunchCalls, 0);
    assertNoManagedCdpEvidence(result);
  });
}
