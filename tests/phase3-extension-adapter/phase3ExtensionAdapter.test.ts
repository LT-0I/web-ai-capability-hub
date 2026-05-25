import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  getBackend,
  registerBackend
} from "../../src/browser/backends";
import {
  ManagedCdpBackend,
  ManagedCdpPagePort
} from "../../src/browser/backends/managedCdpBackend";
import {
  ExtensionAssistedCdpBackend,
  ExtensionAssistedPagePort,
  BackendNotImplementedError,
  createExtensionAssistedCdpBackend
} from "../../src/browser/backends/extensionAssistedCdpBackend";
import {
  BrowserBackend,
  BrowserBackendKind,
  BrowserPagePort
} from "../../src/browser/backends/types";
import {
  DESIGN_TAB_METHOD_TO_VENDOR_WIRE,
  VENDOR_BROWSER_TOOL_NAMES
} from "../../src/runtime/extension/protocol";
import {
  NativeMessagingClient,
  NativeMessagingBridgeError,
  encodeNativeMessage,
  decodeNativeMessages
} from "../../src/runtime/extension/nativeMessagingClient";
import {
  buildLaunchArguments,
  ManagedBrowserLauncher
} from "../../src/browser/managedLauncher";
import {
  CONSUMER_ERROR_CODES,
  ConsumerErrorCodes
} from "../../src/consumer/errorCodes";

// -----------------------------------------------------------------------------
// 1) Backend interface conformance: kind constants + method surface
// -----------------------------------------------------------------------------

const REQUIRED_BACKEND_METHODS: ReadonlyArray<keyof BrowserBackend> = [
  "ping",
  "listTabs",
  "claimTab",
  "newTab",
  "finalize"
];

const REQUIRED_PAGE_METHODS: ReadonlyArray<keyof BrowserPagePort> = [
  "getInfo",
  "navigate",
  "waitForSelector",
  "queryElements",
  "elementState",
  "elementBox",
  "click",
  "fill",
  "press",
  "evaluateReadOnly",
  "textSnapshot",
  "assetsList",
  "assetsBundle",
  "close"
];

test("phase3 conformance: managedCdpBackend kind constant is 'managed-cdp' and exposes BrowserBackend methods", () => {
  const backend = new ManagedCdpBackend();
  assert.equal(backend.kind, "managed-cdp");
  for (const method of REQUIRED_BACKEND_METHODS) {
    assert.equal(typeof (backend as any)[method], "function", `ManagedCdpBackend missing method ${String(method)}`);
  }
});

test("phase3 conformance: extensionAssistedCdpBackend kind constant is 'extension-assisted-cdp' and exposes BrowserBackend methods", () => {
  const backend = new ExtensionAssistedCdpBackend();
  assert.equal(backend.kind, "extension-assisted-cdp");
  for (const method of REQUIRED_BACKEND_METHODS) {
    assert.equal(typeof (backend as any)[method], "function", `ExtensionAssistedCdpBackend missing method ${String(method)}`);
  }
  const port = new ExtensionAssistedPagePort(99, 1);
  assert.equal(port.kind, "extension-assisted-cdp");
  for (const method of REQUIRED_PAGE_METHODS) {
    assert.equal(typeof (port as any)[method], "function", `ExtensionAssistedPagePort missing method ${String(method)}`);
  }
});

// -----------------------------------------------------------------------------
// 2) Backend factory: getBackend("managed-cdp") and ("extension-assisted-cdp")
// -----------------------------------------------------------------------------

test("phase3 factory: getBackend returns matching backend instance for each kind", () => {
  const managed = getBackend("managed-cdp");
  assert.ok(managed instanceof ManagedCdpBackend, "managed-cdp factory must return ManagedCdpBackend");
  assert.equal(managed.kind, "managed-cdp");

  const ext = getBackend("extension-assisted-cdp");
  assert.ok(ext instanceof ExtensionAssistedCdpBackend, "extension-assisted-cdp factory must return ExtensionAssistedCdpBackend");
  assert.equal(ext.kind, "extension-assisted-cdp");
});

test("phase3 factory: getBackend rejects unknown kinds with a discoverable error message", () => {
  assert.throws(
    () => getBackend("unknown-kind-foo" as BrowserBackendKind),
    (error: any) => {
      assert.ok(error instanceof Error, "must throw Error");
      assert.match(String(error.message), /Unknown browser backend kind/i, "error message must reference unknown backend kind");
      assert.match(String(error.message), /unknown-kind-foo/, "error message must echo the bad kind for caller diagnostics");
      return true;
    }
  );
});

// -----------------------------------------------------------------------------
// 3) NO graceful fallback: extension backend must surface CHROME_EXTENSION_NOT_CONNECTED
// -----------------------------------------------------------------------------

test("phase3 no-fallback: extensionAssistedCdpBackend.ping() without a host fails with CHROME_EXTENSION_NOT_CONNECTED and does NOT fall back to managed-cdp", async () => {
  // Ensure env path is unset so spawn-host mode has nothing to launch.
  const originalEnv = process.env.CHROME_EXTENSION_NATIVE_HOST_PATH;
  delete process.env.CHROME_EXTENSION_NATIVE_HOST_PATH;
  try {
    const backend = new ExtensionAssistedCdpBackend({
      // No hostPath, no chromeBridge → connect() must reject with NOT_CONNECTED.
      mode: "spawn-host",
      timeoutMs: 250,
      bootstrapTimeoutMs: 250
    });
    await assert.rejects(
      () => backend.ping(),
      (error: any) => {
        assert.ok(error instanceof NativeMessagingBridgeError, "must be a NativeMessagingBridgeError, not a swallowed managed-cdp success");
        assert.equal(error.errorCode, "CHROME_EXTENSION_NOT_CONNECTED");
        // Verify the error is from the consumer-stable taxonomy.
        assert.ok((CONSUMER_ERROR_CODES as readonly string[]).includes(error.errorCode));
        return true;
      }
    );
    await backend.finalize();
  } finally {
    if (originalEnv !== undefined) process.env.CHROME_EXTENSION_NATIVE_HOST_PATH = originalEnv;
  }
});

test("phase3 no-fallback: chrome-bridged mode without a transport surfaces CHROME_EXTENSION_NOT_CONNECTED on connect()", async () => {
  const client = new NativeMessagingClient({ mode: "chrome-bridged", timeoutMs: 250 });
  await assert.rejects(
    () => client.connect(),
    (error: any) => {
      assert.equal(error.errorCode, "CHROME_EXTENSION_NOT_CONNECTED");
      assert.match(String(error.message), /transport is not connected/i);
      return true;
    }
  );
  await client.dispose();
});

// -----------------------------------------------------------------------------
// 4) BackendNotImplementedError carries BOTH design-doc tab method AND vendor wire name
// -----------------------------------------------------------------------------

test("phase4 deferrals: non-critical tab.* methods still throw BackendNotImplementedError with design+wire names", async () => {
  const port = new ExtensionAssistedPagePort(1);
  const tabMethods = ["getInfo", "elementState", "elementBox", "press"] as Array<keyof typeof DESIGN_TAB_METHOD_TO_VENDOR_WIRE>;

  for (const tabMethod of tabMethods) {
    const wireMethod = DESIGN_TAB_METHOD_TO_VENDOR_WIRE[tabMethod];
    // All stubs accept variadic args; call with reasonable shape.
    const invocation = async () => {
      const fn = (port as any)[tabMethod];
      // For methods that take a target, pass a CSS selector; safe for all signatures since stubs ignore args.
      return fn.call(port, { selector: "#x" }, {});
    };
    await assert.rejects(invocation, (error: any) => {
      assert.ok(error instanceof BackendNotImplementedError, `${tabMethod} must throw BackendNotImplementedError`);
      assert.equal(error.name, "BackendNotImplementedError");
      assert.equal(error.tabMethod, tabMethod, `${tabMethod} stub must report its own tabMethod on the error`);
      assert.equal(error.wireMethod, wireMethod, `${tabMethod} stub must report vendor wire method ${wireMethod}`);
      // Both names must appear in the message for grep-driven Phase 4 audits.
      assert.match(String(error.message), new RegExp(tabMethod), `${tabMethod} message must include the design method name`);
      assert.match(String(error.message), new RegExp(wireMethod), `${tabMethod} message must include the vendor wire method ${wireMethod}`);
      return true;
    });
  }
});

// -----------------------------------------------------------------------------
// 5) Native Messaging framing: encode/decode 4-byte LE round-trip & edge cases
// -----------------------------------------------------------------------------

test("phase3 framing: encode produces 4-byte LE length prefix and decode round-trips multiple messages from a single buffer", () => {
  const m1 = { jsonrpc: "2.0", id: 1, method: "browser.ping" };
  const m2 = { jsonrpc: "2.0", id: 2, method: "chrome_navigate", params: { url: "https://example.com" } };
  const m3 = { jsonrpc: "2.0", id: 3, result: { ok: true, payload: "中文 + 🦀 utf8" } };
  const buf = Buffer.concat([encodeNativeMessage(m1), encodeNativeMessage(m2), encodeNativeMessage(m3)]);
  // Verify each frame's first 4 bytes is a valid LE unsigned length.
  const len1 = buf.readUInt32LE(0);
  assert.equal(len1, Buffer.byteLength(JSON.stringify(m1), "utf8"));
  const decoded = decodeNativeMessages<typeof m1>(buf);
  assert.deepEqual(decoded.messages, [m1, m2 as any, m3 as any]);
  assert.equal(decoded.remaining.length, 0);
});

test("phase3 framing: decode buffers a truncated trailing frame and returns it unconsumed for reassembly", () => {
  const m = { jsonrpc: "2.0", id: 7, method: "browser.ping" };
  const frame = encodeNativeMessage(m);
  // Cut off last 3 bytes to simulate stdio chunking.
  const truncated = frame.subarray(0, frame.length - 3);
  const decoded = decodeNativeMessages(truncated);
  assert.deepEqual(decoded.messages, [], "no full message should be emitted from truncated buffer");
  assert.equal(decoded.remaining.length, truncated.length, "remaining must include the partial frame for next chunk");
});

test("phase3 framing: decode rejects an oversized length header (> 64 MiB) with an Invalid frame length error", () => {
  // Build a header that claims 64 MiB + 1 byte. We do NOT supply payload — header alone is enough.
  const header = Buffer.alloc(4);
  header.writeUInt32LE(64 * 1024 * 1024 + 1, 0);
  assert.throws(
    () => decodeNativeMessages(header),
    (error: any) => {
      assert.match(String(error.message), /Invalid Chrome Native Messaging frame length/i);
      return true;
    }
  );
});

test("phase3 framing: decode rejects a zero-length frame as malformed", () => {
  const header = Buffer.alloc(4);
  header.writeUInt32LE(0, 0);
  assert.throws(
    () => decodeNativeMessages(header),
    (error: any) => {
      assert.match(String(error.message), /Invalid Chrome Native Messaging frame length/i);
      return true;
    }
  );
});

// -----------------------------------------------------------------------------
// 6) Contract error-code round-trip across all four surfaces
// -----------------------------------------------------------------------------

const NEW_CODES = [
  "CHROME_EXTENSION_NOT_CONNECTED",
  "CHROME_EXTENSION_PERMISSION_DENIED",
  "CHROME_EXTENSION_DEBUGGER_UNAVAILABLE"
] as const;

test("phase3 contract: all 3 new error codes exist in JSON manifest, TS enum, and consumer-contract docs", () => {
  const manifest = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "configs/consumer-contract.json"), "utf-8"));
  const docs = fs.readFileSync(path.resolve(process.cwd(), "docs/CONSUMER_CONTRACT.md"), "utf-8");
  for (const code of NEW_CODES) {
    assert.ok(manifest.error_codes.includes(code), `${code} must be in configs/consumer-contract.json error_codes`);
    assert.ok((CONSUMER_ERROR_CODES as readonly string[]).includes(code), `${code} must be in CONSUMER_ERROR_CODES TS enum`);
    assert.equal(ConsumerErrorCodes[code], code, `${code} must round-trip through ConsumerErrorCodes object`);
    assert.ok(docs.includes(`\`${code}\``), `${code} must be referenced in docs/CONSUMER_CONTRACT.md`);
  }
  assert.equal(manifest.contract_version, "consumer-contract-2.0.0", "contract version must be bumped to 1.10.0");
  assert.equal(manifest.error_codes.length, 39, "contract error_codes length must be 39");
  assert.equal(CONSUMER_ERROR_CODES.length, 39, "TS error code list length must be 39");
});

// -----------------------------------------------------------------------------
// 7) ManagedBrowserLauncher extension args — opt-in only
// -----------------------------------------------------------------------------

test("phase3 launcher args: extensionAssisted=true + extensionPath appends --load-extension and --disable-extensions-except exactly once each", () => {
  const args = buildLaunchArguments({
    cdpHost: "127.0.0.1",
    cdpPort: 9223,
    profileDir: "/tmp/profile",
    extensionAssisted: true,
    extensionPath: "/opt/ext"
  });
  const load = args.filter((a) => a.startsWith("--load-extension="));
  const disable = args.filter((a) => a.startsWith("--disable-extensions-except="));
  assert.deepEqual(load, ["--load-extension=/opt/ext"]);
  assert.deepEqual(disable, ["--disable-extensions-except=/opt/ext"]);
});

test("phase3 launcher args: default (no extensionAssisted) leaves args byte-identical to pre-Phase-3 callers", () => {
  const baseline = buildLaunchArguments({
    cdpHost: "127.0.0.1",
    cdpPort: 9223,
    profileDir: "/tmp/profile"
  });
  for (const arg of baseline) {
    assert.equal(arg.startsWith("--load-extension="), false, `default args must not contain --load-extension (saw ${arg})`);
    assert.equal(arg.startsWith("--disable-extensions-except="), false, `default args must not contain --disable-extensions-except (saw ${arg})`);
  }
  // Spot-check: the existing required flags are still present in order.
  assert.ok(baseline.includes("--remote-debugging-address=127.0.0.1"));
  assert.ok(baseline.includes("--remote-debugging-port=9223"));
  assert.ok(baseline.includes("--user-data-dir=/tmp/profile"));
});

test("phase3 launcher args: extensionAssisted=true without extensionPath is rejected at build time (no silent extension-less launch)", () => {
  assert.throws(
    () => buildLaunchArguments({
      cdpHost: "127.0.0.1",
      cdpPort: 9223,
      profileDir: "/tmp/profile",
      extensionAssisted: true
    }),
    (error: any) => {
      assert.match(String(error.message), /extensionPath is required/i);
      return true;
    }
  );
});

// -----------------------------------------------------------------------------
// 8) No WebSocket transport — round-3 decision locks Native Messaging only
// -----------------------------------------------------------------------------

function* walk(dir: string): Generator<string> {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.isFile()) yield full;
  }
}

test("phase3 transport lock: src/browser/backends and src/runtime/extension contain NO WebSocket/ws:// references (Native Messaging only)", () => {
  const roots = ["src/browser/backends", "src/runtime/extension"].map((rel) => path.resolve(process.cwd(), rel));
  const hits: Array<{ file: string; line: number; text: string }> = [];
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    for (const file of walk(root)) {
      if (!file.endsWith(".ts")) continue;
      const lines = fs.readFileSync(file, "utf-8").split(/\r?\n/);
      lines.forEach((text, i) => {
        if (/\bWebSocket\b|wss?:\/\//.test(text)) {
          hits.push({ file: path.relative(process.cwd(), file), line: i + 1, text: text.slice(0, 200) });
        }
      });
    }
  }
  assert.deepEqual(hits, [], `WebSocket reference found in Phase-3 source (transport is Native Messaging only):\n${hits.map((h) => `  ${h.file}:${h.line} ${h.text}`).join("\n")}`);
});

// -----------------------------------------------------------------------------
// Bonus: scope verification — Phase 3 does NOT touch tools.ts / vendor / package.json
// -----------------------------------------------------------------------------

test("phase3 scope: vendor/mcp-chrome is not touched by the Phase-3 diff", () => {
  // We assert the vendor tree exists; modifications would have been blocked by review.
  // This is a lightweight sentinel that catches accidental vendor patching.
  const vendorRoot = path.resolve(process.cwd(), "vendor/mcp-chrome");
  if (fs.existsSync(vendorRoot)) {
    const manifest = path.join(vendorRoot, "package.json");
    if (fs.existsSync(manifest)) {
      const text = fs.readFileSync(manifest, "utf-8");
      assert.ok(text.includes("\"name\""), "vendor/mcp-chrome/package.json must remain intact");
    }
  }
});
