import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { ConsumerErrorCodes } from "../../src/consumer/errorCodes";
import { createExtensionAssistedCdpBackend } from "../../src/browser/backends/extensionAssistedCdpBackend";
import { registerBackend } from "../../src/browser/backends";
import {
  callMcpTool,
  webAiChatgptCanvasExport,
  webAiChatgptPulseGet,
  webAiChatgptPulseOnboard,
  webAiClaudeDesignCreateProject,
  webAiClaudeDesignGenerate,
  webAiClaudeDesignGetHtml,
  webAiClaudeDesignPresent,
  webAiGeminiCanvasEdit,
  webAiGeminiCanvasToDocs
} from "../../src/mcp/tools";

const DOWNLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "phase7-b7-"));
const PROJECT_URL = "https://claude.ai/design/p/phase7b7";

type FakeState = {
  docsUrl?: string;
  presentUrl?: string;
};

function selectorOf(target: any): string {
  return typeof target === "string" ? target : target?.selector || "unknown";
}

function serviceFromUrl(url: string): "chatgpt" | "gemini" | "claude-design" {
  if (url.includes("gemini")) return "gemini";
  if (url.includes("claude.ai/design")) return "claude-design";
  return "chatgpt";
}

function fakeExtensionPage(service: "chatgpt" | "gemini" | "claude-design", initialUrl: string, profile: string, calls: string[], state: FakeState) {
  let url = initialUrl;
  let prompt = "";
  let pulseOnboarded = false;
  let quickNewsSelected = false;
  let canvasHtml = "<p>initial Gemini canvas body</p>";
  let designFileName = url.includes("file=") ? "phase7.html" : "";
  let designHtml = "<!doctype html><html><body><main>Phase 7 Bucket 7 Claude Design HTML</main></body></html>";

  return {
    navigate: async (nextUrl: string) => {
      if (nextUrl === "https://chatgpt.com/pulse" && profile.includes("pulse-onboard") && !pulseOnboarded) url = "https://chatgpt.com/";
      else url = nextUrl;
      calls.push(`${service}:navigate:${url}`);
      return { url };
    },
    textSnapshot: async () => {
      let text = `${service} ready ${prompt}`;
      if (service === "chatgpt" && url.includes("/pulse")) {
        text = "Pulse Curate May 25, 2026 Markets, science, and engineering updates are ready. This digest has enough substantive text! Curate for tomorrow";
      }
      if (service === "chatgpt" && url === "https://chatgpt.com/") text = "Pulse onboarding dialog Get started Quick news recap";
      if (service === "claude-design") text = "Claude Design ready";
      return { url, title: service, text };
    },
    waitForSelector: async (selector: string) => {
      calls.push(`${service}:wait:${selector}`);
      return undefined;
    },
    queryElements: async (selector: string) => {
      calls.push(`${service}:query:${selector}`);
      return [{ text: selector, selector }];
    },
    fill: async (target: any, value: string) => {
      const selector = selectorOf(target);
      calls.push(`${service}:fill:${selector}:${String(value).slice(0, 18)}`);
      prompt = String(value);
      if (selector.includes("contenteditable") || selector.includes("//div")) canvasHtml = `<p>${value}</p>`;
    },
    click: async (target: any) => {
      const selector = selectorOf(target);
      calls.push(`${service}:click:${selector}`);
      if (selector.includes("Quick news recap")) quickNewsSelected = true;
      if (selector.includes("Skip for now")) { pulseOnboarded = true; url = "https://chatgpt.com/pulse"; }
      if (selector.includes("export-to-docs-button")) state.docsUrl = "https://docs.google.com/document/d/doc-phase7b7/edit";
      if (selector.includes("create-project-button")) url = PROJECT_URL;
      if (selector.includes("chat-send-button")) { designFileName = "phase7.html"; url = `${PROJECT_URL}?file=${designFileName}`; }
      if (selector.includes("Present") || selector.includes("//button[contains")) state.presentUrl = `${PROJECT_URL}?file=${designFileName || "phase7.html"}&present=1`;
    },
    evaluateReadOnly: async (_expression: string, arg?: any) => {
      switch (arg?.operation) {
        case "pulseState":
          if (profile.includes("pulse-onboard") && !pulseOnboarded) {
            return { route: "https://chatgpt.com/", visibleText: "Pulse onboarding Get started Quick news recap", hasActions: false, hasDialog: true, hasGetStarted: true };
          }
          if (profile.includes("pulse-onboard") && pulseOnboarded) {
            return { route: "https://chatgpt.com/pulse", visibleText: "Your first Pulse is in the works", hasActions: false, hasDialog: false, hasGetStarted: false };
          }
          return { route: "https://chatgpt.com/pulse", visibleText: "Pulse Curate May 25, 2026 Markets, science, and engineering updates are ready. This digest has enough substantive text! Curate for tomorrow", hasActions: true, hasDialog: false, hasGetStarted: false };
        case "pulseQuickNewsSelected":
          return quickNewsSelected;
        case "canvasMarkup":
          return canvasHtml;
        case "domSettled":
          return true;
        case "currentUrl":
          return url;
        case "designFileState":
          return { projectUrl: url, fileName: designFileName || "phase7.html", iframeSrc: `/v1/design/projects/phase7b7/serve/${designFileName || "phase7.html"}`, hasIframe: true };
        case "designIframeHtml":
          return designHtml;
        default:
          return { url, promptPresent: true, stopVisible: false, assistantCount: 1 };
      }
    },
    assetsList: async () => [],
    assetsBundle: async () => ({ assets: [], capturedAt: "2026-05-25T00:00:00.000Z" }),
    close: async () => undefined,
    finalize: async () => undefined
  } as any;
}

test("phase7 bucket7 backend=extension-assisted-cdp routes all 9 canvas/pulse/design tools to the extension backend", async (t) => {
  const calls: string[] = [];
  const state: FakeState = {};
  registerBackend("extension-assisted-cdp", () => ({
    kind: "extension-assisted-cdp",
    ping: async () => ({ ok: true, kind: "extension-assisted-cdp", connected: true }),
    listTabs: async () => [
      ...(state.docsUrl ? [{ id: "docs", kind: "extension-assisted-cdp", url: state.docsUrl }] : []),
      ...(state.presentUrl ? [{ id: "present", kind: "extension-assisted-cdp", url: state.presentUrl }] : [])
    ],
    claimTab: async (options: any) => {
      const url = String(options?.url || "https://chatgpt.com/");
      const profile = String(options?.profile || "");
      const service = serviceFromUrl(url);
      calls.push(`claim:${service}`);
      return fakeExtensionPage(service, url, profile, calls, state);
    },
    newTab: async (options: any) => {
      const url = String(options?.url || "about:blank");
      const profile = String(options?.profile || "");
      const service = serviceFromUrl(url);
      calls.push(`new:${service}`);
      return fakeExtensionPage(service, url, profile, calls, state);
    },
    finalize: async () => undefined
  }) as any);
  t.after(() => registerBackend("extension-assisted-cdp", createExtensionAssistedCdpBackend));

  const runtime: any = {
    launcher: { launch: async () => { throw new Error("managed path must not run"); } },
    artifactClick: async (options: any) => {
      calls.push(`artifact:${options.buttonSelector}`);
      return { path: path.join(DOWNLOAD_DIR, "canvas.md"), sha256: "a".repeat(64), size_bytes: 42 };
    }
  };

  const canvas: any = await callMcpTool("webai_chatgpt_canvas_export", { profile: "p7-canvas-ext", tab_url_contains: "https://chatgpt.com/c/canvas", download_dir: DOWNLOAD_DIR, backend: "extension-assisted-cdp" }, runtime);
  const pulseGet: any = await callMcpTool("webai_chatgpt_pulse_get", { profile: "p7-pulse-get-ext", backend: "extension-assisted-cdp" }, runtime);
  const pulseOnboard: any = await callMcpTool("webai_chatgpt_pulse_onboard", { profile: "p7-pulse-onboard-ext", confirmed: true, backend: "extension-assisted-cdp" }, runtime);
  const docs: any = await callMcpTool("webai_gemini_canvas_to_docs", { profile: "p7-gemini-docs-ext", prompt: "make a canvas", backend: "extension-assisted-cdp" }, runtime);
  const edit: any = await callMcpTool("webai_gemini_canvas_edit", { profile: "p7-gemini-edit-ext", prompt: "make a canvas", edit_text: "edited", confirmed: true, backend: "extension-assisted-cdp" }, runtime);
  const create: any = await callMcpTool("webai_claude_design_create_project", { profile: "p7-design-create-ext", name: "Phase 7", backend: "extension-assisted-cdp" }, runtime);
  const generate: any = await callMcpTool("webai_claude_design_generate", { profile: "p7-design-generate-ext", project_url: PROJECT_URL, prompt: "make UI", backend: "extension-assisted-cdp" }, runtime);
  const html: any = await callMcpTool("webai_claude_design_get_html", { profile: "p7-design-html-ext", project_url: `${PROJECT_URL}?file=phase7.html`, download_dir: DOWNLOAD_DIR, backend: "extension-assisted-cdp" }, runtime);
  const present: any = await callMcpTool("webai_claude_design_present", { profile: "p7-design-present-ext", project_url: `${PROJECT_URL}?file=phase7.html`, backend: "extension-assisted-cdp" }, runtime);

  assert.equal(canvas.path.endsWith("canvas.md"), true);
  assert.equal(canvas.byteSize, 42);
  assert.equal(pulseGet.status, "ready");
  assert.match(pulseGet.digest_text, /engineering updates/);
  assert.equal(pulseOnboard.onboarded, true);
  assert.equal(pulseOnboard.final_status, "pending");
  assert.equal(docs.docs_doc_id, "doc-phase7b7");
  assert.equal(edit.canvas_opened, true);
  assert.equal(edit.edit_applied, true);
  assert.equal(create.projectId, "phase7b7");
  assert.equal(generate.status, "generated");
  assert.equal(generate.fileName, "phase7.html");
  assert.equal(html.byteSize > 40, true);
  assert.equal(fs.existsSync(html.savedPath), true);
  assert.match(present.presentUrl, /present=1/);
  assert.deepEqual(calls.filter((entry) => entry.startsWith("new:") || entry.startsWith("claim:")).sort(), [
    "claim:chatgpt",
    "claim:claude-design",
    "claim:claude-design",
    "claim:claude-design",
    "new:chatgpt",
    "new:chatgpt",
    "new:claude-design",
    "new:gemini",
    "new:gemini"
  ]);
});

test("phase7 bucket7 backend=managed-cdp still routes all 9 canvas/pulse/design tools to managed-cdp", async (t) => {
  let extensionFactoryCalls = 0;
  registerBackend("extension-assisted-cdp", () => {
    extensionFactoryCalls += 1;
    throw new Error("extension backend must not be touched");
  });
  t.after(() => registerBackend("extension-assisted-cdp", createExtensionAssistedCdpBackend));

  const runtime: any = {
    launcher: { launch: async () => { throw new Error("managed path touched"); } },
    artifactClick: async () => { throw new Error("managed path touched"); }
  };

  const cases: Array<() => Promise<any>> = [
    () => webAiChatgptCanvasExport({ profile: "p7-canvas-managed", tab_url_contains: "https://chatgpt.com/c/canvas", download_dir: DOWNLOAD_DIR, backend: "managed-cdp" }, runtime),
    () => webAiChatgptPulseGet({ profile: "p7-pulse-get-managed", backend: "managed-cdp" }, runtime),
    () => webAiChatgptPulseOnboard({ profile: "p7-pulse-onboard-managed", confirmed: true, backend: "managed-cdp" }, runtime),
    () => webAiGeminiCanvasToDocs({ profile: "p7-gemini-docs-managed", prompt: "make a canvas", backend: "managed-cdp" }, runtime),
    () => webAiGeminiCanvasEdit({ profile: "p7-gemini-edit-managed", prompt: "make a canvas", confirmed: true, backend: "managed-cdp" }, runtime),
    () => webAiClaudeDesignCreateProject({ profile: "p7-design-create-managed", name: "Phase 7", backend: "managed-cdp" }, runtime),
    () => webAiClaudeDesignGenerate({ profile: "p7-design-generate-managed", project_url: PROJECT_URL, prompt: "make UI", backend: "managed-cdp" }, runtime),
    () => webAiClaudeDesignGetHtml({ profile: "p7-design-html-managed", project_url: PROJECT_URL, download_dir: DOWNLOAD_DIR, backend: "managed-cdp" }, runtime),
    () => webAiClaudeDesignPresent({ profile: "p7-design-present-managed", project_url: PROJECT_URL, backend: "managed-cdp" }, runtime)
  ];
  const results = await Promise.allSettled(cases.map((run) => run()));
  assert.equal(results.length, 9);
  assert.equal(extensionFactoryCalls, 0);
});

test("phase7 bucket7 invalid backend returns INVALID_ARGS for all 9 canvas/pulse/design tools", async () => {
  const cases: Array<[string, () => Promise<any>]> = [
    ["webai_chatgpt_canvas_export", () => webAiChatgptCanvasExport({ profile: "p7-canvas-invalid", tab_url_contains: "https://chatgpt.com/c/canvas", download_dir: DOWNLOAD_DIR, backend: "bogus" })],
    ["webai_chatgpt_pulse_get", () => webAiChatgptPulseGet({ profile: "p7-pulse-get-invalid", backend: "bogus" })],
    ["webai_chatgpt_pulse_onboard", () => webAiChatgptPulseOnboard({ profile: "p7-pulse-onboard-invalid", confirmed: true, backend: "bogus" })],
    ["webai_gemini_canvas_to_docs", () => webAiGeminiCanvasToDocs({ profile: "p7-gemini-docs-invalid", prompt: "make a canvas", backend: "bogus" })],
    ["webai_gemini_canvas_edit", () => webAiGeminiCanvasEdit({ profile: "p7-gemini-edit-invalid", prompt: "make a canvas", confirmed: true, backend: "bogus" })],
    ["webai_claude_design_create_project", () => webAiClaudeDesignCreateProject({ profile: "p7-design-create-invalid", name: "Phase 7", backend: "bogus" })],
    ["webai_claude_design_generate", () => webAiClaudeDesignGenerate({ profile: "p7-design-generate-invalid", project_url: PROJECT_URL, prompt: "make UI", backend: "bogus" })],
    ["webai_claude_design_get_html", () => webAiClaudeDesignGetHtml({ profile: "p7-design-html-invalid", project_url: PROJECT_URL, download_dir: DOWNLOAD_DIR, backend: "bogus" })],
    ["webai_claude_design_present", () => webAiClaudeDesignPresent({ profile: "p7-design-present-invalid", project_url: PROJECT_URL, backend: "bogus" })]
  ];
  for (const [tool, run] of cases) {
    const result: any = await run();
    assert.equal(result.errorCode, ConsumerErrorCodes.INVALID_ARGS, tool);
    assert.match(String(result.message), new RegExp(`${tool} backend must be "managed-cdp" or "extension-assisted-cdp", got bogus`));
  }
});
