const test = require("node:test");
const assert = require("node:assert/strict");
import {
  assertNoForbidden,
  forbiddenOutputFieldList,
  stripForbidden
} from "../src/mcp/forbiddenFields";
import { ConsumerErrorCodes } from "../src/consumer/errorCodes";

// I1 (Path C cross-model review): captureGeminiBatchRpcSnapshot in
// src/mcp/gemini_workspace_rpc.ts returns { at, bl, fsid, cookieHeader,
// userAgent, pageUrl } and currently lives only on args.__cdpSnapshot
// (in-memory header source for /batchexecute). To prevent a future refactor
// from accidentally returning the raw snapshot in a tool result, these keys
// must be enforced by assertNoForbidden at the MCP tool boundary.
const GEMINI_BATCH_RPC_FORBIDDEN_KEYS = ["cookieHeader", "at", "bl", "fsid"] as const;
const CDP_CONNECT_FORBIDDEN_KEYS = ["cdpEndpoint", "webSocketDebuggerUrl"] as const;

test("forbidden list registers every Gemini batch-RPC snapshot key", () => {
  for (const key of GEMINI_BATCH_RPC_FORBIDDEN_KEYS) {
    assert.ok(
      forbiddenOutputFieldList.includes(key),
      `forbiddenOutputFieldList missing Gemini snapshot key '${key}'`
    );
  }
  for (const key of CDP_CONNECT_FORBIDDEN_KEYS) {
    assert.ok(
      forbiddenOutputFieldList.includes(key),
      `forbiddenOutputFieldList missing CDP connect key '${key}'`
    );
  }
});

test("assertNoForbidden flags each Gemini snapshot key individually", () => {
  for (const key of GEMINI_BATCH_RPC_FORBIDDEN_KEYS) {
    const payload = { ok: true, [key]: "leak" };
    assert.throws(
      () => assertNoForbidden(payload),
      (error: any) => {
        assert.equal(error.errorCode, ConsumerErrorCodes.SAFE_OUTPUT_REDACTION_REQUIRED);
        assert.deepEqual(error.evidence.fields, [key]);
        return true;
      },
      `assertNoForbidden did not reject top-level forbidden key '${key}'`
    );
  }
});

test("assertNoForbidden flags each CDP connect key individually", () => {
  for (const key of CDP_CONNECT_FORBIDDEN_KEYS) {
    const payload = { ok: true, [key]: "leak" };
    assert.throws(
      () => assertNoForbidden(payload),
      (error: any) => {
        assert.equal(error.errorCode, ConsumerErrorCodes.SAFE_OUTPUT_REDACTION_REQUIRED);
        assert.deepEqual(error.evidence.fields, [key]);
        return true;
      },
      `assertNoForbidden did not reject top-level forbidden key '${key}'`
    );
  }
});

test("assertNoForbidden rejects a full simulated Gemini CDP snapshot output", () => {
  const leakedSnapshot = {
    ok: true,
    profile: "gemini-9225",
    pageUrl: "https://gemini.google.com/app",
    userAgent: "Mozilla/5.0",
    // The six keys reviewer I1 flagged.
    cookieHeader: "SAPISID=abc; __Secure-1PSID=def",
    at: "AOOh0PXXXXXXXXXX",
    bl: "boq_assistant-bard-web-server_XXXXXXXXXX",
    fsid: "1234567890",
    cdpEndpoint: "http://127.0.0.1:9225",
    webSocketDebuggerUrl: "ws://127.0.0.1:9225/devtools/browser/abc"
  };
  assert.throws(
    () => assertNoForbidden(leakedSnapshot),
    (error: any) => {
      assert.equal(error.errorCode, ConsumerErrorCodes.SAFE_OUTPUT_REDACTION_REQUIRED);
      const flagged: string[] = [...error.evidence.fields].sort();
      const expected = [...GEMINI_BATCH_RPC_FORBIDDEN_KEYS, ...CDP_CONNECT_FORBIDDEN_KEYS].sort();
      assert.deepEqual(flagged, expected);
      return true;
    }
  );
});

test("assertNoForbidden flags nested Gemini snapshot leaks (e.g. result.snapshot.cookieHeader)", () => {
  const nested = {
    ok: true,
    result: {
      profile: "gemini-9225",
      snapshot: {
        cookieHeader: "leak",
        at: "leak",
        bl: "leak",
        fsid: "leak"
      }
    }
  };
  assert.throws(
    () => assertNoForbidden(nested),
    (error: any) => {
      assert.equal(error.errorCode, ConsumerErrorCodes.SAFE_OUTPUT_REDACTION_REQUIRED);
      const flagged: string[] = [...error.evidence.fields].sort();
      // "snapshot" is itself a forbidden key, so it MUST also be flagged
      // alongside the four nested CDP-snapshot keys.
      assert.deepEqual(
        flagged,
        ["at", "bl", "cookieHeader", "fsid", "snapshot"].sort()
      );
      return true;
    }
  );
});

test("stripForbidden removes Gemini snapshot keys while keeping safe fields", () => {
  const unsafe = {
    ok: true,
    pageUrl: "https://gemini.google.com/app",
    userAgent: "Mozilla/5.0",
    cookieHeader: "leak",
    at: "leak",
    bl: "leak",
    fsid: "leak"
  };
  const safe = stripForbidden(unsafe);
  assert.deepEqual(safe, {
    ok: true,
    pageUrl: "https://gemini.google.com/app",
    userAgent: "Mozilla/5.0"
  });
  // Should not throw on the stripped output.
  assertNoForbidden(safe);
});
