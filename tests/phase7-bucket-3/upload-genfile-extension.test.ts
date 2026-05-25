import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { ConsumerErrorCodes } from "../../src/consumer/errorCodes";
import { createExtensionAssistedCdpBackend } from "../../src/browser/backends/extensionAssistedCdpBackend";
import { registerBackend } from "../../src/browser/backends";
import { webAiChatgptGenerateFile, webAiChatgptUploadAndQuery, webAiGeminiUploadAndQuery } from "../../src/mcp/tools";

type Service = "chatgpt" | "gemini";

function serviceFromUrl(url: string): Service {
  return url.includes("gemini") ? "gemini" : "chatgpt";
}

function tempDir(prefix = "wah-p7-b3-"): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function selectorOf(target: any): string {
  return typeof target === "string" ? target : target?.selector || "unknown";
}

function fakeExtensionPage(service: Service, calls: string[]) {
  const uploaded: string[] = [];
  let sent = false;
  const baseUrl = service === "chatgpt" ? "https://chatgpt.com/?phase7b3=1" : "https://gemini.google.com/app?phase7b3=1";
  const chatUrl = service === "chatgpt" ? "https://chatgpt.com/c/phase7b3" : "https://gemini.google.com/app/phase7b3";
  return {
    navigate: async () => ({ url: baseUrl }),
    textSnapshot: async () => ({
      url: sent ? chatUrl : baseUrl,
      title: service,
      text: sent ? `${service} response complete ${uploaded.join(" ")}` : `${service} ready ${uploaded.join(" ")}`
    }),
    waitForSelector: async (selector: string) => {
      if (selector.includes("Not now")) throw new Error("optional dialog absent");
      calls.push(`${service}:wait:${selector}`);
      return undefined;
    },
    queryElements: async () => [],
    click: async (target: any) => {
      const selector = selectorOf(target);
      calls.push(`${service}:click:${selector}`);
      if (selector.includes("send-button") || selector.includes("Send message")) sent = true;
    },
    fill: async (target: any, value: string) => {
      calls.push(`${service}:fill:${selectorOf(target)}:${value.slice(0, 16)}`);
    },
    uploadFile: async (selector: string, filePath: string) => {
      calls.push(`${service}:upload:${selector}:${path.basename(filePath)}`);
      uploaded.push(path.basename(filePath));
    },
    evaluateReadOnly: async (expression: string, arg?: any) => {
      if (expression.includes("sendReady")) {
        const expected = Array.isArray(arg?.filenames) ? arg.filenames : [];
        return { ready: expected.every((name: string) => uploaded.includes(name)), seen: [...uploaded], sendReady: true };
      }
      if (expression.includes("assistantCount")) {
        return {
          url: sent ? chatUrl : baseUrl,
          assistantCount: sent ? 1 : 0,
          latestText: sent ? `${service} response complete` : "",
          stopVisible: false,
          doneVisible: true
        };
      }
      return false;
    },
    assetsList: async () => [],
    assetsBundle: async () => ({ assets: [], capturedAt: "2026-05-25T00:00:00.000Z" }),
    finalize: async () => undefined
  } as any;
}

test("phase7 bucket3 backend=extension-assisted-cdp routes ChatGPT upload, ChatGPT generate_file, and Gemini upload to the extension backend", async (t) => {
  const calls: string[] = [];
  registerBackend("extension-assisted-cdp", () => ({
    kind: "extension-assisted-cdp",
    ping: async () => ({ ok: true, kind: "extension-assisted-cdp", connected: true }),
    listTabs: async () => [],
    claimTab: async (options: any) => {
      const service = serviceFromUrl(String(options?.url || ""));
      calls.push(`claim:${service}`);
      return fakeExtensionPage(service, calls);
    },
    newTab: async (options: any) => {
      const service = serviceFromUrl(String(options?.url || ""));
      calls.push(`new:${service}`);
      return fakeExtensionPage(service, calls);
    },
    finalize: async () => undefined
  }) as any);
  t.after(() => registerBackend("extension-assisted-cdp", createExtensionAssistedCdpBackend));

  const dir = tempDir();
  const file = path.join(dir, "fixture.txt");
  fs.writeFileSync(file, "phase 7 b3 smoke", "utf8");
  let artifactCalls = 0;
  const runtime: any = {
    launcher: { launch: async () => { throw new Error("managed path must not run"); } },
    artifactClick: async (args: any) => {
      artifactCalls += 1;
      assert.equal(args.profile, "p7-chatgpt-genfile-ext");
      assert.equal(args.pageReadyEvidence.backend, "extension-assisted-cdp");
      const artifactPath = path.join(dir, "hello.py");
      fs.writeFileSync(artifactPath, "print('hello')\n", "utf8");
      return { path: artifactPath, sha256: "abc", size: 15, downloadFilename: "hello.py" };
    }
  };

  const chatgptUpload: any = await webAiChatgptUploadAndQuery({ profile: "p7-chatgpt-upload-ext", files: [file], prompt: "summarize", backend: "extension-assisted-cdp", response_timeout_ms: 2500 }, runtime);
  const chatgptFile: any = await webAiChatgptGenerateFile({ profile: "p7-chatgpt-genfile-ext", prompt: "write print hello", expected_extension: "py", download_dir: dir, backend: "extension-assisted-cdp", response_timeout_ms: 2500 }, runtime);
  const geminiUpload: any = await webAiGeminiUploadAndQuery({ profile: "p7-gemini-upload-ext", files: [file], prompt: "summarize", backend: "extension-assisted-cdp", response_timeout_ms: 2500 }, runtime);

  assert.equal(chatgptUpload.errorCode, null);
  assert.deepEqual(chatgptUpload.attachment_names, ["fixture.txt"]);
  assert.equal(chatgptFile.errorCode, null);
  assert.equal(chatgptFile.download_filename, "hello.py");
  assert.equal(geminiUpload.errorCode, null);
  assert.deepEqual(geminiUpload.files_in_chip, ["fixture.txt"]);
  assert.equal(artifactCalls, 1);
  assert.deepEqual(calls.filter((entry) => entry.startsWith("new:")).sort(), ["new:chatgpt", "new:chatgpt", "new:gemini"]);
  assert.equal(calls.some((entry) => entry.includes(":upload:input#upload-files:fixture.txt")), true);
  assert.equal(calls.some((entry) => entry.includes(":upload:input[type=\"file\"]") && entry.endsWith(":fixture.txt")), true);
});

test("phase7 bucket3 backend=managed-cdp still routes these tools to managed-cdp", async (t) => {
  let extensionFactoryCalls = 0;
  registerBackend("extension-assisted-cdp", () => {
    extensionFactoryCalls += 1;
    throw new Error("extension backend must not be touched");
  });
  t.after(() => registerBackend("extension-assisted-cdp", createExtensionAssistedCdpBackend));
  const dir = tempDir();
  const file = path.join(dir, "fixture.txt");
  fs.writeFileSync(file, "phase 7 b3 smoke", "utf8");
  const runtime: any = { launcher: { launch: async () => { throw new Error("managed path touched"); } } };

  await assert.rejects(
    () => webAiChatgptUploadAndQuery({ profile: "p7-chatgpt-managed", files: [file], prompt: "hello", backend: "managed-cdp" }, runtime),
    /managed path touched/
  );
  await assert.rejects(
    () => webAiChatgptGenerateFile({ profile: "p7-chatgpt-genfile-managed", prompt: "write print hello", expected_extension: "py", download_dir: dir, backend: "managed-cdp" }, runtime),
    /managed path touched/
  );
  await assert.rejects(
    () => webAiGeminiUploadAndQuery({ profile: "p7-gemini-managed", files: [file], prompt: "hello", backend: "managed-cdp" }, runtime),
    /managed path touched/
  );
  assert.equal(extensionFactoryCalls, 0);
});

test("phase7 bucket3 invalid backend returns INVALID_ARGS for these tools", async () => {
  const chatgptUpload: any = await webAiChatgptUploadAndQuery({ profile: "p7-chatgpt-invalid", files: [], prompt: "hello", backend: "bogus" }, {} as any);
  const chatgptFile: any = await webAiChatgptGenerateFile({ profile: "p7-chatgpt-genfile-invalid", prompt: "write print hello", expected_extension: "py", download_dir: "/tmp", backend: "bogus" }, {} as any);
  const geminiUpload: any = await webAiGeminiUploadAndQuery({ profile: "p7-gemini-invalid", files: [], prompt: "hello", backend: "bogus" }, {} as any);

  assert.equal(chatgptUpload.errorCode, ConsumerErrorCodes.INVALID_ARGS);
  assert.match(String(chatgptUpload.message), /webai_chatgpt_upload_and_query backend must be "managed-cdp" or "extension-assisted-cdp", got bogus/);
  assert.equal(chatgptFile.errorCode, ConsumerErrorCodes.INVALID_ARGS);
  assert.match(String(chatgptFile.message), /webai_chatgpt_generate_file backend must be "managed-cdp" or "extension-assisted-cdp", got bogus/);
  assert.equal(geminiUpload.errorCode, ConsumerErrorCodes.INVALID_ARGS);
  assert.match(String(geminiUpload.message), /webai_gemini_upload_and_query backend must be "managed-cdp" or "extension-assisted-cdp", got bogus/);
});
