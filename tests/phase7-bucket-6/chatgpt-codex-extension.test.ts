import test from "node:test";
import assert from "node:assert/strict";

import { ConsumerErrorCodes } from "../../src/consumer/errorCodes";
import { createExtensionAssistedCdpBackend } from "../../src/browser/backends/extensionAssistedCdpBackend";
import { registerBackend } from "../../src/browser/backends";
import {
  callMcpTool,
  webAiChatgptCodexGetDiff,
  webAiChatgptCodexListEnvs,
  webAiChatgptCodexSubmitTask,
  webAiChatgptCodexTaskStatus
} from "../../src/mcp/tools";

const TASK_ID = `task_e_${"1".repeat(32)}`;
const PREVIOUS_TASK_ID = `task_e_${"0".repeat(32)}`;
const ENV_ID = "6a07e4ffdafc8191b77e6cff2264cd9a";

type CodexRoute = "cloud" | "envs" | "task";

function selectorOf(target: any): string {
  return typeof target === "string" ? target : target?.selector || "unknown";
}

function routeFromUrl(url: string): CodexRoute {
  if (url.includes("/settings/environments")) return "envs";
  if (url.includes("/tasks/")) return "task";
  return "cloud";
}

function fakeCodexPage(calls: string[], initialUrl: string) {
  let url = initialUrl;
  let route = routeFromUrl(initialUrl);
  let selectedEnv = false;
  let submitted = false;
  let prompt = "";

  const taskText = () => [
    `LT-0I/CN- ${ENV_ID}`,
    "Worked for 1m Give thumbs up feedback",
    "File (1)",
    "src/index.ts +1 -0",
    "@@ -1 +1",
    "+hello",
    "Create PR"
  ].join(" ");

  const visibleText = () => {
    if (route === "envs") return `LT-0I/CN- LT-0I/CN- ${ENV_ID} owner@example.com May 25, 2026`;
    if (route === "task" || submitted) return taskText();
    return `ChatGPT Codex cloud ready ${selectedEnv ? "LT-0I/CN-" : ""} ${prompt}`;
  };

  return {
    navigate: async (nextUrl: string) => {
      calls.push(`navigate:${routeFromUrl(nextUrl)}`);
      url = nextUrl;
      route = routeFromUrl(nextUrl);
      return { url };
    },
    textSnapshot: async () => ({ url, title: "ChatGPT Codex", text: visibleText() }),
    waitForSelector: async (selector: string) => {
      calls.push(`wait:${selector}`);
      return undefined;
    },
    fill: async (target: any, value: string) => {
      calls.push(`fill:${selectorOf(target)}:${value.slice(0, 16)}`);
      prompt = value;
    },
    click: async (target: any) => {
      const selector = selectorOf(target);
      calls.push(`click:${selector}`);
      if (selector.includes("View all code environments")) selectedEnv = false;
      if (selector.includes("LT-0I/CN-")) selectedEnv = true;
      if (selector.includes("Submit")) {
        submitted = true;
        route = "task";
        url = `https://chatgpt.com/codex/cloud/tasks/${TASK_ID}`;
      }
    },
    evaluateReadOnly: async (_expression: string, arg: any) => {
      switch (arg?.operation) {
        case "selectorText":
          if (arg.selector === "button[aria-label='View all code environments']") return selectedEnv ? "LT-0I/CN-" : "Select environment";
          if (arg.selector === "button[aria-label=\"Toggle file list diffs\"]") return "File (1)";
          if (String(arg.selector || "").includes("Worked for")) return "Worked for 1m";
          return "";
        case "elementCount":
          if (arg.selector === 'button[aria-label="Cancel task"]') return 0;
          if (arg.selector === 'button[aria-label="Give thumbs up feedback"]') return 1;
          if (arg.selector === 'button[aria-label^="View file "]') return 1;
          return 1;
        case "codexEnvRows":
          return [{ text: `LT-0I/CN- LT-0I/CN- ${ENV_ID} owner@example.com May 25, 2026`, href: `/codex/cloud/settings/environment/${ENV_ID}` }];
        case "codexTopTaskHref":
          return `/codex/cloud/tasks/${submitted ? TASK_ID : PREVIOUS_TASK_ID}`;
        case "codexFileButtonLabels":
          return ["View file src/index.ts"];
        case "codexButtonTextCount":
          return arg.text === "Create PR" ? 1 : 0;
        default:
          return null;
      }
    },
    assetsList: async () => [],
    assetsBundle: async () => ({ assets: [], capturedAt: "2026-05-25T00:00:00.000Z" }),
    finalize: async () => undefined
  } as any;
}

test("phase7 bucket6 backend=extension-assisted-cdp routes all ChatGPT codex_* tools to the extension backend", async (t) => {
  const calls: string[] = [];
  registerBackend("extension-assisted-cdp", () => ({
    kind: "extension-assisted-cdp",
    ping: async () => ({ ok: true, kind: "extension-assisted-cdp", connected: true }),
    listTabs: async () => [],
    claimTab: async () => { throw new Error("codex extension driver should open an isolated tab"); },
    newTab: async (options: any) => {
      calls.push(`new:${routeFromUrl(String(options?.url || ""))}`);
      return fakeCodexPage(calls, String(options?.url || "https://chatgpt.com/codex/cloud"));
    },
    finalize: async () => undefined
  }) as any);
  t.after(() => registerBackend("extension-assisted-cdp", createExtensionAssistedCdpBackend));

  const runtime: any = { launcher: { launch: async () => { throw new Error("managed path must not run"); } } };
  const listEnvs: any = await callMcpTool("webai_chatgpt_codex_list_envs", { profile: "p7-codex-ext", backend: "extension-assisted-cdp" }, runtime);
  const submit: any = await callMcpTool("webai_chatgpt_codex_submit_task", { profile: "p7-codex-ext", prompt: "inventory", confirmed: true, repo: "LT-0I/CN-", backend: "extension-assisted-cdp" }, runtime);
  const status: any = await callMcpTool("webai_chatgpt_codex_task_status", { profile: "p7-codex-ext", task_id: TASK_ID, backend: "extension-assisted-cdp" }, runtime);
  const diff: any = await callMcpTool("webai_chatgpt_codex_get_diff", { profile: "p7-codex-ext", task_id: TASK_ID, backend: "extension-assisted-cdp" }, runtime);

  assert.equal(listEnvs.status, "ok");
  assert.equal(listEnvs.envs[0].env_id, ENV_ID);
  assert.equal(submit.task_id, TASK_ID);
  assert.equal(submit.status, "submitted");
  assert.equal(status.status, "complete");
  assert.equal(status.done, true);
  assert.equal(diff.status, "complete");
  assert.deepEqual(diff.files, ["src/index.ts"]);
  assert.match(diff.diff_text, /@@ -1 \+1/);
  assert.deepEqual(calls.filter((entry) => entry.startsWith("new:")).sort(), ["new:cloud", "new:envs", "new:task", "new:task"]);
});

test("phase7 bucket6 backend=managed-cdp still routes all ChatGPT codex_* tools to managed-cdp", async (t) => {
  let extensionFactoryCalls = 0;
  registerBackend("extension-assisted-cdp", () => {
    extensionFactoryCalls += 1;
    throw new Error("extension backend must not be touched");
  });
  t.after(() => registerBackend("extension-assisted-cdp", createExtensionAssistedCdpBackend));
  const runtime: any = { launcher: { launch: async () => { throw new Error("managed path touched"); } } };

  const submit: any = await webAiChatgptCodexSubmitTask({ profile: "p7-codex-managed", prompt: "inventory", confirmed: true, backend: "managed-cdp" }, runtime);
  const listEnvs: any = await webAiChatgptCodexListEnvs({ profile: "p7-codex-managed", backend: "managed-cdp" }, runtime);
  const status: any = await webAiChatgptCodexTaskStatus({ profile: "p7-codex-managed", task_id: TASK_ID, backend: "managed-cdp" }, runtime);
  const diff: any = await webAiChatgptCodexGetDiff({ profile: "p7-codex-managed", task_id: TASK_ID, backend: "managed-cdp" }, runtime);

  assert.equal(extensionFactoryCalls, 0);
  for (const result of [submit, listEnvs, status, diff]) {
    assert.equal(result.errorCode, ConsumerErrorCodes.UNKNOWN);
    assert.match(String(result.message), /managed path touched/);
  }
});

test("phase7 bucket6 invalid backend returns INVALID_ARGS for all ChatGPT codex_* tools", async () => {
  const submit: any = await webAiChatgptCodexSubmitTask({ profile: "p7-codex-invalid", prompt: "inventory", confirmed: true, backend: "bogus" }, {} as any);
  const listEnvs: any = await webAiChatgptCodexListEnvs({ profile: "p7-codex-invalid", backend: "bogus" }, {} as any);
  const status: any = await webAiChatgptCodexTaskStatus({ profile: "p7-codex-invalid", task_id: TASK_ID, backend: "bogus" }, {} as any);
  const diff: any = await webAiChatgptCodexGetDiff({ profile: "p7-codex-invalid", task_id: TASK_ID, backend: "bogus" }, {} as any);

  assert.equal(submit.errorCode, ConsumerErrorCodes.INVALID_ARGS);
  assert.match(String(submit.message), /webai_chatgpt_codex_submit_task backend must be "managed-cdp" or "extension-assisted-cdp", got bogus/);
  assert.equal(listEnvs.errorCode, ConsumerErrorCodes.INVALID_ARGS);
  assert.match(String(listEnvs.message), /webai_chatgpt_codex_list_envs backend must be "managed-cdp" or "extension-assisted-cdp", got bogus/);
  assert.equal(status.errorCode, ConsumerErrorCodes.INVALID_ARGS);
  assert.match(String(status.message), /webai_chatgpt_codex_task_status backend must be "managed-cdp" or "extension-assisted-cdp", got bogus/);
  assert.equal(diff.errorCode, ConsumerErrorCodes.INVALID_ARGS);
  assert.match(String(diff.message), /webai_chatgpt_codex_get_diff backend must be "managed-cdp" or "extension-assisted-cdp", got bogus/);
});
