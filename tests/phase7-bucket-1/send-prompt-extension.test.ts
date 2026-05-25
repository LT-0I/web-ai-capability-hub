import test from "node:test";
import assert from "node:assert/strict";

import { ConsumerErrorCodes } from "../../src/consumer/errorCodes";
import { createExtensionAssistedCdpBackend } from "../../src/browser/backends/extensionAssistedCdpBackend";
import { registerBackend } from "../../src/browser/backends";
import { webAiChatgptSendPrompt, webAiGeminiSendPrompt } from "../../src/mcp/tools";

type Service = "chatgpt" | "gemini";

function fakeExtensionPage(service: Service) {
  let sent = false;
  const url = service === "chatgpt" ? "https://chatgpt.com/c/phase7b1" : "https://gemini.google.com/app/phase7b1";
  return {
    navigate: async () => ({ url }),
    textSnapshot: async () => ({ url, title: service, text: sent ? `${service} response complete` : `${service} ready` }),
    waitForSelector: async (selector: string) => {
      if (selector.includes("Not now")) throw new Error("optional dialog absent");
      return undefined;
    },
    queryElements: async () => [],
    fill: async () => undefined,
    click: async () => { sent = true; },
    evaluateReadOnly: async (_expression: string, arg: any) => ({
      url,
      assistantCount: sent ? 1 : 0,
      latestText: sent ? `${service} response complete` : "",
      stopVisible: false,
      doneVisible: Boolean(sent && arg?.doneSelector)
    })
  } as any;
}

test("phase7 bucket1 send_prompt backend=extension-assisted-cdp routes ChatGPT and Gemini to the extension backend", async (t) => {
  const calls: string[] = [];
  registerBackend("extension-assisted-cdp", () => ({
    kind: "extension-assisted-cdp",
    ping: async () => ({ ok: true, kind: "extension-assisted-cdp", connected: true }),
    listTabs: async () => [],
    claimTab: async (options: any) => {
      const service: Service = String(options?.url || "").includes("gemini") ? "gemini" : "chatgpt";
      calls.push(`claim:${service}`);
      return fakeExtensionPage(service);
    },
    newTab: async (options: any) => {
      const service: Service = String(options?.url || "").includes("gemini") ? "gemini" : "chatgpt";
      calls.push(`new:${service}`);
      return fakeExtensionPage(service);
    },
    finalize: async () => undefined
  }) as any);
  t.after(() => registerBackend("extension-assisted-cdp", createExtensionAssistedCdpBackend));

  const runtime: any = { launcher: { launch: async () => { throw new Error("managed path must not run"); } } };
  const chatgpt: any = await webAiChatgptSendPrompt({ profile: "p7-chatgpt-ext", prompt: "hello", backend: "extension-assisted-cdp", response_timeout_ms: 2500 }, runtime);
  const gemini: any = await webAiGeminiSendPrompt({ profile: "p7-gemini-ext", prompt: "hello", backend: "extension-assisted-cdp", response_timeout_ms: 2500 }, runtime);

  assert.equal(chatgpt.errorCode, null);
  assert.equal(chatgpt.response_text, "chatgpt response complete");
  assert.equal(gemini.errorCode, null);
  assert.equal(gemini.response_text, "gemini response complete");
  assert.deepEqual(calls.sort(), ["new:chatgpt", "new:gemini"]);
});

test("phase7 bucket1 send_prompt backend=managed-cdp still routes ChatGPT and Gemini to managed-cdp", async (t) => {
  let extensionFactoryCalls = 0;
  registerBackend("extension-assisted-cdp", () => {
    extensionFactoryCalls += 1;
    throw new Error("extension backend must not be touched");
  });
  t.after(() => registerBackend("extension-assisted-cdp", createExtensionAssistedCdpBackend));
  const runtime: any = { launcher: { launch: async () => { throw new Error("managed path touched"); } } };

  await assert.rejects(
    () => webAiChatgptSendPrompt({ profile: "p7-chatgpt-managed", prompt: "hello", backend: "managed-cdp" }, runtime),
    /managed path touched/
  );
  await assert.rejects(
    () => webAiGeminiSendPrompt({ profile: "p7-gemini-managed", prompt: "hello", backend: "managed-cdp" }, runtime),
    /managed path touched/
  );
  assert.equal(extensionFactoryCalls, 0);
});

test("phase7 bucket1 send_prompt invalid backend returns INVALID_ARGS with Claude-style backend message", async () => {
  const chatgpt: any = await webAiChatgptSendPrompt({ profile: "p7-chatgpt-invalid", prompt: "hello", backend: "bogus" }, {} as any);
  const gemini: any = await webAiGeminiSendPrompt({ profile: "p7-gemini-invalid", prompt: "hello", backend: "bogus" }, {} as any);

  assert.equal(chatgpt.errorCode, ConsumerErrorCodes.INVALID_ARGS);
  assert.match(String(chatgpt.message), /webai_chatgpt_send_prompt backend must be "managed-cdp" or "extension-assisted-cdp", got bogus/);
  assert.equal(gemini.errorCode, ConsumerErrorCodes.INVALID_ARGS);
  assert.match(String(gemini.message), /webai_gemini_send_prompt backend must be "managed-cdp" or "extension-assisted-cdp", got bogus/);
});
