import test from "node:test";
import assert from "node:assert/strict";
import { NativeMessagingClient, decode, encode } from "../src/runtime/extension/nativeMessagingClient";
import { ExtensionAssistedPagePort, BackendNotImplementedError } from "../src/browser/backends/extensionAssistedCdpBackend";

const mockHostScript = String.raw`
let buffer = Buffer.alloc(0);
function write(message) {
  const payload = Buffer.from(JSON.stringify(message), 'utf8');
  const header = Buffer.alloc(4);
  header.writeUInt32LE(payload.length, 0);
  process.stdout.write(Buffer.concat([header, payload]));
}
function drain() {
  while (buffer.length >= 4) {
    const length = buffer.readUInt32LE(0);
    if (buffer.length < length + 4) return;
    const request = JSON.parse(buffer.subarray(4, 4 + length).toString('utf8'));
    buffer = buffer.subarray(4 + length);
    if (request.method === 'browser.ping') {
      write({ jsonrpc: '2.0', id: request.id, result: { ok: true } });
    } else {
      write({ jsonrpc: '2.0', id: request.id, result: { method: request.method, params: request.params } });
    }
  }
}
process.stdin.on('data', (chunk) => { buffer = Buffer.concat([buffer, chunk]); drain(); });
`;

test("nativeMessagingClient: encode/decode uses 4-byte little-endian JSON framing", () => {
  const message = { jsonrpc: "2.0", id: 7, method: "browser.ping", params: { ok: true } };
  const frame = encode(message);
  assert.equal((frame as any).readUInt32LE(0), Buffer.byteLength(JSON.stringify(message)));
  const decoded = decode<typeof message>(Buffer.concat([(frame as any).subarray(0, 5), (frame as any).subarray(5)]));
  assert.deepEqual(decoded.messages, [message]);
  assert.equal(decoded.remaining.length, 0);
});

test("nativeMessagingClient: spawn-host mode round-trips JSON-RPC over stdio", async (t) => {
  const client = new NativeMessagingClient({
    mode: "spawn-host",
    hostPath: process.execPath,
    hostArgs: ["-e", mockHostScript],
    timeoutMs: 1000,
    bootstrapTimeoutMs: 1000
  });
  t.after(() => client.dispose());

  await client.connect();
  const result = await client.request("get_windows_and_tabs", { sample: true });
  assert.deepEqual(result, { method: "get_windows_and_tabs", params: { sample: true } });
});

test("nativeMessagingClient: bootstrap reports CHROME_EXTENSION_NOT_CONNECTED when host exits", async () => {
  const client = new NativeMessagingClient({
    mode: "spawn-host",
    hostPath: process.execPath,
    hostArgs: ["-e", "process.exit(0)"],
    timeoutMs: 500,
    bootstrapTimeoutMs: 500
  });
  await assert.rejects(() => client.connect(), (error: any) => {
    assert.equal(error.errorCode, "CHROME_EXTENSION_NOT_CONNECTED");
    return true;
  });
  await client.dispose();
});

test("extensionAssistedCdpBackend: remaining deferred tab stubs name their vendor wire method", async () => {
  const port = new ExtensionAssistedPagePort(123);
  await assert.rejects(() => port.press("Enter"), (error: any) => {
    assert.ok(error instanceof BackendNotImplementedError);
    assert.equal(error.name, "BackendNotImplementedError");
    assert.equal(error.wireMethod, "chrome_keyboard");
    assert.match(error.message, /chrome_keyboard/);
    return true;
  });
});
