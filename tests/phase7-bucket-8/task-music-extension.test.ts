import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { ConsumerErrorCodes } from "../../src/consumer/errorCodes";
import { CapabilityDatabase } from "../../src/capabilities/database";
import { createExtensionAssistedCdpBackend } from "../../src/browser/backends/extensionAssistedCdpBackend";
import { registerBackend } from "../../src/browser/backends";
import {
  callMcpTool,
  webAiGeminiMusicDownloadTrack,
  webAiGeminiMusicTaskStatus,
  webAiTaskStatus
} from "../../src/mcp/tools";

const TASK_ID = "gemini_music_phase7b8";
const MUSIC_URL = "https://gemini.google.com/app/phase7b8";

function tempDir(prefix = "phase7-b8-"): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function fakeGeminiMusicPage(calls: string[]) {
  let url = MUSIC_URL;
  return {
    navigate: async (nextUrl: string) => {
      url = nextUrl || url;
      calls.push(`navigate:${url}`);
      return { url };
    },
    textSnapshot: async () => ({ url, title: "Gemini Music", text: "Gemini Music track ready Download track" }),
    queryElements: async (selector: string) => {
      calls.push(`query:${selector}`);
      if (selector === 'button[aria-label="Download track"]') return [{ selector, text: "Download track" }];
      if (selector === 'button[aria-label="Stop response"]') return [];
      return [];
    },
    waitForSelector: async (selector: string) => {
      calls.push(`wait:${selector}`);
      return undefined;
    },
    finalize: async () => undefined
  } as any;
}

test("phase7 bucket8 backend=extension-assisted-cdp routes task_status and Gemini music polling tools to the extension backend", async (t) => {
  const calls: string[] = [];
  const dir = tempDir();
  registerBackend("extension-assisted-cdp", () => ({
    kind: "extension-assisted-cdp",
    ping: async () => ({ ok: true, kind: "extension-assisted-cdp", connected: true }),
    listTabs: async () => [],
    claimTab: async (options: any) => {
      calls.push(`claim:${String(options?.url || "")}:${String(options?.profile || "")}`);
      return fakeGeminiMusicPage(calls);
    },
    newTab: async (options: any) => {
      calls.push(`new:${String(options?.url || "")}:${String(options?.profile || "")}`);
      return fakeGeminiMusicPage(calls);
    },
    finalize: async () => undefined
  }) as any);
  t.after(() => registerBackend("extension-assisted-cdp", createExtensionAssistedCdpBackend));

  let artifactCalls = 0;
  const runtime: any = {
    launcher: { launch: async () => { throw new Error("managed path must not run"); } },
    artifactClick: async (options: any) => {
      artifactCalls += 1;
      assert.equal(options.profile, "p7-music-ext");
      assert.equal(options.tabUrlContains, MUSIC_URL);
      const savedPath = path.join(dir, "phase7-b8.mp3");
      fs.writeFileSync(savedPath, "phase7-b8-mp3", "utf8");
      return { path: savedPath, sha256: "b".repeat(64), size: 13, downloadFilename: "phase7-b8.mp3" };
    }
  };

  const common = { profile: "p7-music-ext", tab_url_contains: MUSIC_URL, backend: "extension-assisted-cdp" };
  const genericStatus: any = await callMcpTool("webai_task_status", { ...common, task_id: TASK_ID }, runtime);
  const musicStatus: any = await callMcpTool("webai_gemini_music_task_status", common, runtime);
  const download: any = await callMcpTool("webai_gemini_music_download_track", { ...common, download_dir: dir, format: "mp3" }, runtime);

  assert.equal(genericStatus.task_id, TASK_ID);
  assert.equal(genericStatus.status, "complete");
  assert.equal(genericStatus.download_ready, true);
  assert.equal(musicStatus.status, "complete");
  assert.equal(musicStatus.download_ready, true);
  assert.equal(download.savedPath.endsWith("phase7-b8.mp3"), true);
  assert.equal(download.byteSize, 13);
  assert.equal(artifactCalls, 1);
  assert.deepEqual(calls.filter((entry) => entry.startsWith("new:")).sort(), [
    `new:${MUSIC_URL}:p7-music-ext`,
    `new:${MUSIC_URL}:p7-music-ext`,
    `new:${MUSIC_URL}:p7-music-ext`
  ]);
});

test("phase7 bucket8 backend=managed-cdp preserves existing managed/database routes", async (t) => {
  let extensionFactoryCalls = 0;
  registerBackend("extension-assisted-cdp", () => {
    extensionFactoryCalls += 1;
    throw new Error("extension backend must not be touched");
  });
  t.after(() => registerBackend("extension-assisted-cdp", createExtensionAssistedCdpBackend));

  const dbPath = path.join(tempDir(), "capability.json");
  const database = new CapabilityDatabase({ dbPath, preferSqlite: false });
  database.upsertWebAiTask({
    task_id: "task_phase7_b8_managed",
    status: "done",
    profile: "p7-music-managed",
    lease_id: "lease_phase7_b8",
    started_at: new Date().toISOString(),
    progress_label: "done"
  });
  const managedRuntime: any = { database, launcher: { launch: async () => { throw new Error("managed path touched"); } } };

  const genericStatus: any = await webAiTaskStatus({ task_id: "task_phase7_b8_managed", backend: "managed-cdp" }, managedRuntime);
  assert.equal(genericStatus.status, "done");
  assert.equal(genericStatus.progress_label, "done");

  await assert.rejects(
    () => webAiGeminiMusicTaskStatus({ profile: "p7-music-managed", tab_url_contains: MUSIC_URL, backend: "managed-cdp" }, managedRuntime),
    /managed path touched/
  );
  await assert.rejects(
    () => webAiGeminiMusicDownloadTrack({ profile: "p7-music-managed", tab_url_contains: MUSIC_URL, download_dir: tempDir(), backend: "managed-cdp" }, managedRuntime),
    /managed path touched/
  );
  assert.equal(extensionFactoryCalls, 0);
});

test("phase7 bucket8 invalid backend returns INVALID_ARGS for task_status and Gemini music polling tools", async () => {
  const genericStatus: any = await webAiTaskStatus({ task_id: TASK_ID, backend: "bogus" }, {} as any);
  const musicStatus: any = await webAiGeminiMusicTaskStatus({ profile: "p7-music-invalid", tab_url_contains: MUSIC_URL, backend: "bogus" }, {} as any);
  const download: any = await webAiGeminiMusicDownloadTrack({ profile: "p7-music-invalid", tab_url_contains: MUSIC_URL, download_dir: tempDir(), backend: "bogus" }, {} as any);

  assert.equal(genericStatus.errorCode, ConsumerErrorCodes.INVALID_ARGS);
  assert.match(String(genericStatus.message), /webai_task_status backend must be "managed-cdp" or "extension-assisted-cdp", got bogus/);
  assert.equal(musicStatus.errorCode, ConsumerErrorCodes.INVALID_ARGS);
  assert.match(String(musicStatus.message), /webai_gemini_music_task_status backend must be "managed-cdp" or "extension-assisted-cdp", got bogus/);
  assert.equal(download.errorCode, ConsumerErrorCodes.INVALID_ARGS);
  assert.match(String(download.message), /webai_gemini_music_download_track backend must be "managed-cdp" or "extension-assisted-cdp", got bogus/);
});
