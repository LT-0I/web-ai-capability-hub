const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");

import {
  buildGeminiMediaStreamRequest,
  extractGeminiMediaUrls,
  GeminiMediaRpcFetch,
  isGeminiVideoGenPlaceholderUrl,
  webAiGeminiGenerateImageRpcWithFetch,
  webAiGeminiGenerateVideoRpcWithFetch,
  webAiGeminiMusicDownloadTrackRpc,
  webAiGeminiMusicGenerateRpcWithFetch
} from "../src/mcp/gemini_media_rpc";
import { GeminiRpcPayloadTemplate } from "../src/mcp/gemini_upload_rpc";

const cdpSnapshot = {
  at: "AT-media-fixture",
  bl: "boq_assistant-bard-web-server_media_fixture_p0",
  fsid: "-3032064702953450126",
  cookieHeader: "SID=fixture; __Secure-1PSID=fixture",
  userAgent: "Mozilla/5.0 Media Fixture",
  pageUrl: "https://gemini.google.com/app?hl=en"
};

function fixtureTemplate(kind: "image" | "video" | "music"): GeminiRpcPayloadTemplate {
  const inner = Array.from({ length: 81 }, () => null) as any[];
  inner[0] = ["{{prompt}}", 0, null, null, null, null, 0];
  if (kind === "video") inner[0][9] = [null, null, null, null, null, null, [[null, null, null, 1]]];
  inner[1] = ["en"];
  inner[2] = ["", "", "", null, null, null, null, null, null, ""];
  inner[3] = `!opaque-${kind}-fixture-token`;
  inner[4] = "0123456789abcdef0123456789abcdef";
  inner[17] = [[0]];
  inner[41] = [1];
  inner[49] = kind === "image" ? 14 : kind === "video" ? 11 : 21;
  inner[53] = 0;
  if (kind === "video") {
    inner[54] = [];
    inner[55] = [[16]];
  }
  inner[59] = "11111111-2222-3333-4444-555555555555";
  inner[61] = [];
  inner[68] = 2;
  inner[79] = 1;
  inner[80] = 1;
  return { f_req_template: [null, inner] };
}

function minimalGeminiMediaStream(text: string, mediaUrl: string): string {
  const nested: any[] = [];
  nested[1] = ["c_media_fixture", "r_media_fixture"];
  nested[4] = [["rc_media_fixture", [`${text}\n${mediaUrl}`], null, null, null, null, true, null, [1], "und"]];
  nested[26] = [[[[null, [null, 0, `${text}\n${mediaUrl}`]]]]];
  const payload = JSON.stringify([["wrb.fr", null, JSON.stringify(nested)]]);
  return `)]}'\n\n${payload.length}\n${payload}\n`;
}

function innerFromBody(body: string | undefined): any[] {
  assert.equal(typeof body, "string");
  const fReq = new URLSearchParams(body as string).get("f.req");
  assert.equal(typeof fReq, "string");
  const top = JSON.parse(fReq as string);
  return JSON.parse(top[1]);
}

test("Gemini media RPC URL extractor ignores Gemini chrome assets and keeps media URLs", () => {
  const stream = minimalGeminiMediaStream("done", "https://lh3.googleusercontent.com/generated-image.png?foo=1");
  const urls = extractGeminiMediaUrls(stream);
  assert.deepEqual(urls, ["https://lh3.googleusercontent.com/generated-image.png?foo=1"]);
});

test("Gemini media RPC URL extractor ignores Gemini app branding assets", () => {
  const stream = minimalGeminiMediaStream("try this app", "https://www.gstatic.com/images/branding/productlogos/gemini/v4/192px.svg");
  assert.deepEqual(extractGeminiMediaUrls(stream), []);
});

test("Gemini media request builder preserves captured image/video/music mode markers", () => {
  const image = buildGeminiMediaStreamRequest({ prompt: "draw", __payloadTemplate: fixtureTemplate("image") }, cdpSnapshot, "image");
  const video = buildGeminiMediaStreamRequest({ prompt: "film", __payloadTemplate: fixtureTemplate("video") }, cdpSnapshot, "video");
  const music = buildGeminiMediaStreamRequest({ prompt: "play", __payloadTemplate: fixtureTemplate("music") }, cdpSnapshot, "music");
  assert.equal(innerFromBody(image.body)[49], 14);
  assert.equal(innerFromBody(video.body)[49], 11);
  assert.deepEqual(innerFromBody(video.body)[55], [[16]]);
  assert.equal(innerFromBody(music.body)[49], 21);
});

function mediaFetchFor(kind: "image" | "video" | "music", expectedPrompt: string, mediaUrl: string, mediaBytes: any, seen: any[]): GeminiMediaRpcFetch {
  return async (request) => {
    seen.push(request);
    if (request.kind === "stream-generate") {
      assert.equal(request.mediaKind, kind);
      assert.match(request.url, /StreamGenerate/);
      assert.equal(new URLSearchParams(request.body).get("at"), cdpSnapshot.at);
      const inner = innerFromBody(request.body);
      assert.equal(inner[0][0], expectedPrompt);
      if (kind === "image") assert.equal(inner[49], 14);
      if (kind === "video") {
        assert.equal(inner[49], 11);
        assert.deepEqual(inner[55], [[16]]);
      }
      if (kind === "music") assert.equal(inner[49], 21);
      return { status: 200, text: minimalGeminiMediaStream(`${kind} ready`, mediaUrl), headers: {} as Record<string, string> };
    }
    assert.equal(request.kind, "media-download");
    assert.equal(request.url, mediaUrl);
    const contentType = kind === "image" ? "image/png" : kind === "video" ? "video/mp4" : "audio/mpeg";
    return { status: 200, text: "", base64: mediaBytes.toString("base64"), contentType, headers: { "content-disposition": `attachment; filename="fixture-${kind}.${kind === "image" ? "png" : kind === "video" ? "mp4" : "mp3"}"` } };
  };
}

test("Gemini image RPC submits captured image body and saves the generated image response", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gemini-image-rpc-"));
  const seen: any[] = [];
  // Real PNG magic bytes (89 50 4E 47 0D 0A 1A 0A) — content-type alone no longer certifies an image.
  const bytes = Buffer.from("\x89PNG\r\n\x1a\nfixture-png-bytes", "binary");
  const result = await webAiGeminiGenerateImageRpcWithFetch({
    profile: "gemini-9225",
    prompt: "draw a small blue square",
    download_dir: root,
    __cdpSnapshot: cdpSnapshot,
    __payloadTemplate: fixtureTemplate("image")
  }, mediaFetchFor("image", "draw a small blue square", "https://example.test/generated.png", bytes, seen));

  assert.equal(result.errorCode, null);
  assert.equal(result.size_bytes, bytes.length);
  assert.equal(result.sha256, crypto.createHash("sha256").update(bytes).digest("hex"));
  assert.equal(fs.readFileSync(String(result.path)).toString("binary"), bytes.toString("binary"));
  assert.equal(seen.filter((call) => call.kind === "stream-generate").length, 1);
  assert.equal(seen.filter((call) => call.kind === "media-download").length, 1);
});

test("Gemini video RPC submits shortest-duration captured video body and saves the generated video", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gemini-video-rpc-"));
  const bytes = Buffer.from("\x00\x00\x00\x18ftypmp42fixture", "binary");
  const result = await webAiGeminiGenerateVideoRpcWithFetch({
    profile: "gemini-9225",
    prompt: "2s clip of a paper plane",
    download_dir: root,
    __cdpSnapshot: cdpSnapshot,
    __payloadTemplate: fixtureTemplate("video")
  }, mediaFetchFor("video", "2s clip of a paper plane", "https://example.test/generated.mp4", bytes, []));

  assert.equal(result.errorCode, null);
  assert.equal(result.download_filename, "fixture-video.mp4");
  assert.equal(result.size_bytes, bytes.length);
});

test("Gemini music RPC submits captured instrumental body and saves the generated track", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gemini-music-rpc-"));
  const bytes = Buffer.from("ID3fixture-mp3");
  const result = await webAiGeminiMusicGenerateRpcWithFetch({
    profile: "gemini-9225",
    prompt: "instrumental ambient loop",
    confirmed: true,
    download_dir: root,
    __cdpSnapshot: cdpSnapshot,
    __payloadTemplate: fixtureTemplate("music")
  }, mediaFetchFor("music", "instrumental ambient loop", "https://example.test/generated.mp3", bytes, []));

  assert.equal(result.errorCode, null);
  assert.equal(result.status, "complete");
  assert.equal(result.download_filename, "fixture-music.mp3");
  assert.equal(result.size_bytes, bytes.length);
});

test("Gemini music download-track RPC remains explicitly RPC_NOT_AVAILABLE for mp3/video (Wave C2: browser-credential-bound)", async () => {
  // Path C Gemini Wave C2 confirmed against a live ready track: the signed audio URL
  // (contribution.usercontent.google.com/download?c=...) is only fetchable inside the
  // browser's credentialed context; a reconstructed headless fetch redirects to the
  // Google sign-in page. There is no replayable pure-RPC shape, so both formats stay
  // TRUE_RPC_NOT_AVAILABLE and the dispatcher keeps them DOM-only.
  for (const format of ["mp3", "video"]) {
    const result = await webAiGeminiMusicDownloadTrackRpc({ format });
    assert.equal(result.errorCode, "INVALID_ARGS");
    assert.equal(result.error_code, "INVALID_ARGS");
    assert.equal(result.format, format);
    assert.match(String(result.message), /RPC_NOT_AVAILABLE/);
  }
});

// ---- Async video (Veo) chip -> signed-media-URL resolution ----------------------------
// Ground truth (.runs/fix-claude-gemini-defects/gemini/diag): video generation is async
// (minutes). The StreamGenerate response carries only the placeholder chip
// `http://googleusercontent.com/video_gen_chip/0`; the real signed media URL
// (contribution.usercontent.google.com/download?c=...&filename=...mp4) is resolved
// client-side in the conversation DOM once the video finishes.

const VIDEO_CHIP_URL = "http://googleusercontent.com/video_gen_chip/0";
const READY_VIDEO_URL = "https://contribution.usercontent.google.com/download?c=READYTOKEN&filename=the_last_page.mp4&opi=1";
const MP4_BYTES = Buffer.from("\x00\x00\x00\x20ftypisom\x00\x00\x02\x00fixture-mp4", "binary");

test("Gemini video gen chip placeholder is never treated as a downloadable media URL", () => {
  assert.equal(isGeminiVideoGenPlaceholderUrl(VIDEO_CHIP_URL), true);
  assert.equal(isGeminiVideoGenPlaceholderUrl("https://googleusercontent.com/video_gen_chip/3"), true);
  assert.equal(isGeminiVideoGenPlaceholderUrl(READY_VIDEO_URL), false);
  // A chip-only StreamGenerate stream must yield no downloadable candidates.
  const stream = minimalGeminiMediaStream("I'm generating your video. Check back in a few minutes.", VIDEO_CHIP_URL);
  assert.deepEqual(extractGeminiMediaUrls(stream), []);
});

// Fetch for the async-video path: StreamGenerate returns chip-only; media-download returns
// the supplied bytes for the ready signed URL.
function chipOnlyVideoFetch(downloadUrl: string, bytes: any, downloads: any[]): GeminiMediaRpcFetch {
  return async (request) => {
    if (request.kind === "stream-generate") {
      return { status: 200, text: minimalGeminiMediaStream("I'm generating your video. Check back in a few minutes.", VIDEO_CHIP_URL), headers: {} as Record<string, string> };
    }
    downloads.push(request.url);
    assert.equal(request.url, downloadUrl);
    return { status: 200, text: "", base64: bytes.toString("base64"), contentType: "video/mp4", headers: { "content-disposition": 'attachment; filename="the_last_page.mp4"' } };
  };
}

test("Gemini video RPC keeps polling while still-generating, then downloads + magic-byte-validates the ready signed URL", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gemini-video-poll-ready-"));
  const downloads: any[] = [];
  const sleeps: number[] = [];
  let attempts = 0;
  const result = await webAiGeminiGenerateVideoRpcWithFetch({
    profile: "gemini-9225",
    prompt: "2s clip of a red paper plane",
    download_dir: root,
    __cdpSnapshot: cdpSnapshot,
    __payloadTemplate: fixtureTemplate("video"),
    __sleep: async (ms: number) => { sleeps.push(ms); },
    // (a) still-generating for the first two polls, then (b) ready on the third.
    __pollVideoDom: async () => {
      attempts += 1;
      if (attempts < 3) return { url: attempts === 1 ? null : VIDEO_CHIP_URL, status: "generating your video", quota: false };
      return { url: READY_VIDEO_URL, status: "video is ready", quota: false };
    }
  }, chipOnlyVideoFetch(READY_VIDEO_URL, MP4_BYTES, downloads));

  assert.equal(result.errorCode, null);
  assert.equal(attempts, 3, "polled until the real signed URL appeared");
  assert.deepEqual(downloads, [READY_VIDEO_URL], "downloaded the ready signed URL, never the chip");
  assert.equal(result.media_url, READY_VIDEO_URL);
  assert.equal(result.size_bytes, MP4_BYTES.length);
  assert.equal(result.download_filename, "the_last_page.mp4");
  assert.equal(fs.readFileSync(String(result.path)).length, MP4_BYTES.length);
  assert.ok(sleeps.length >= 2, "slept between polls while generating");
});

test("Gemini video RPC fails honestly with ARTIFACT_DOWNLOAD_TIMEOUT when the video never resolves within the bounded wait", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gemini-video-poll-timeout-"));
  const downloads: any[] = [];
  let clock = 0;
  let attempts = 0;
  const result = await webAiGeminiGenerateVideoRpcWithFetch({
    profile: "gemini-9225",
    prompt: "2s clip that never finishes",
    download_dir: root,
    response_timeout_ms: 30000, // below the 5-minute async budget; budget still applies
    __cdpSnapshot: cdpSnapshot,
    __payloadTemplate: fixtureTemplate("video"),
    __now: () => clock,
    __sleep: async () => { clock += 60000; }, // advance the controllable clock each interval
    __pollVideoDom: async () => { attempts += 1; return { url: VIDEO_CHIP_URL, status: "generating your video", quota: false }; }
  }, chipOnlyVideoFetch(READY_VIDEO_URL, MP4_BYTES, downloads));

  assert.equal(result.errorCode, "ARTIFACT_DOWNLOAD_TIMEOUT");
  assert.equal(result.error_code, "ARTIFACT_DOWNLOAD_TIMEOUT");
  assert.equal(result.path, "");
  assert.equal(downloads.length, 0, "never downloaded the chip placeholder");
  assert.ok(attempts >= 1, "polled at least once before timing out");
});

test("Gemini video RPC surfaces PLAN_OR_QUOTA_REQUIRED when the conversation signals a Veo quota wall", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gemini-video-poll-quota-"));
  const downloads: any[] = [];
  const result = await webAiGeminiGenerateVideoRpcWithFetch({
    profile: "gemini-9225",
    prompt: "2s clip blocked by quota",
    download_dir: root,
    __cdpSnapshot: cdpSnapshot,
    __payloadTemplate: fixtureTemplate("video"),
    __sleep: async () => {},
    __pollVideoDom: async () => ({ url: null, status: "video generation limit reached", quota: true })
  }, chipOnlyVideoFetch(READY_VIDEO_URL, MP4_BYTES, downloads));

  assert.equal(result.errorCode, "PLAN_OR_QUOTA_REQUIRED");
  assert.equal(downloads.length, 0, "never downloaded anything when quota-walled");
});

// ---- Content-integrity gate (§2.3): content-type alone must NEVER certify an artifact -----
// codex REQUEST-CHANGES: a 200 carrying `content-type: video/mp4` over non-video/garbage bytes
// must fail honestly (ARTIFACT_DOWNLOAD_TIMEOUT, no file saved), never be saved as a real video.
// Magic bytes are REQUIRED; the content-type header is only a secondary hint.

// Fetch that serves StreamGenerate normally but returns caller-chosen bytes + content-type
// for the media-download leg (lets us forge a video/mp4 header over garbage).
function forgedDownloadFetch(kind: "image" | "video" | "music", mediaUrl: string, bytes: any, contentType: string, downloads: any[]): GeminiMediaRpcFetch {
  return async (request) => {
    if (request.kind === "stream-generate") {
      return { status: 200, text: minimalGeminiMediaStream(`${kind} ready`, mediaUrl), headers: {} as Record<string, string> };
    }
    downloads.push(request.url);
    return { status: 200, text: "", base64: bytes.toString("base64"), contentType, headers: { "content-disposition": `attachment; filename="forged.${kind === "image" ? "png" : kind === "video" ? "mp4" : "mp3"}"` } };
  };
}

test("Gemini video RPC rejects content-type video/mp4 over non-video bytes (magic-byte required, no file saved)", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gemini-video-forged-ct-"));
  const downloads: any[] = [];
  const garbage = Buffer.from("not a video");
  const result = await webAiGeminiGenerateVideoRpcWithFetch({
    profile: "gemini-9225",
    prompt: "2s clip of a paper plane",
    download_dir: root,
    __cdpSnapshot: cdpSnapshot,
    __payloadTemplate: fixtureTemplate("video"),
    __sleep: async () => {},
    __pollVideoDom: async () => ({ url: READY_VIDEO_URL, status: "video is ready", quota: false })
  }, forgedDownloadFetch("video", READY_VIDEO_URL, garbage, "video/mp4", downloads));

  assert.equal(result.errorCode, "ARTIFACT_DOWNLOAD_TIMEOUT", "content-type alone must not certify a video");
  assert.equal(result.error_code, "ARTIFACT_DOWNLOAD_TIMEOUT");
  assert.equal(result.path, "", "no artifact path is returned for unverified bytes");
  assert.deepEqual(downloads, [READY_VIDEO_URL], "did attempt the download, then rejected on magic-byte mismatch");
  assert.equal(fs.readdirSync(root).length, 0, "zero files saved when bytes are not a real video");
});

test("Gemini image RPC rejects content-type image/png over non-image bytes (magic-byte required, no file saved)", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gemini-image-forged-ct-"));
  const downloads: any[] = [];
  const garbage = Buffer.from("not an image");
  const result = await webAiGeminiGenerateImageRpcWithFetch({
    profile: "gemini-9225",
    prompt: "draw a small blue square",
    download_dir: root,
    __cdpSnapshot: cdpSnapshot,
    __payloadTemplate: fixtureTemplate("image")
  }, forgedDownloadFetch("image", "https://example.test/generated.png", garbage, "image/png", downloads));

  assert.equal(result.errorCode, "ARTIFACT_DOWNLOAD_TIMEOUT", "content-type alone must not certify an image");
  assert.equal(result.path, "");
  assert.equal(fs.readdirSync(root).length, 0, "zero files saved when bytes are not a real image");
});

test("Gemini music RPC rejects content-type audio/mpeg over non-audio bytes (magic-byte required, no file saved)", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gemini-music-forged-ct-"));
  const downloads: any[] = [];
  const garbage = Buffer.from("not audio at all");
  const result = await webAiGeminiMusicGenerateRpcWithFetch({
    profile: "gemini-9225",
    prompt: "instrumental ambient loop",
    confirmed: true,
    download_dir: root,
    __cdpSnapshot: cdpSnapshot,
    __payloadTemplate: fixtureTemplate("music")
  }, forgedDownloadFetch("music", "https://example.test/generated.mp3", garbage, "audio/mpeg", downloads));

  assert.equal(result.errorCode, "ARTIFACT_DOWNLOAD_TIMEOUT", "content-type alone must not certify audio");
  assert.equal(result.status, "error", "music failure shape reports status=error, no artifact");
  assert.equal(fs.readdirSync(root).length, 0, "zero files saved when bytes are not real audio");
});

test("Gemini video RPC still accepts real ftyp magic bytes (regression guard)", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gemini-video-real-ftyp-"));
  const downloads: any[] = [];
  const result = await webAiGeminiGenerateVideoRpcWithFetch({
    profile: "gemini-9225",
    prompt: "2s clip of a paper plane",
    download_dir: root,
    __cdpSnapshot: cdpSnapshot,
    __payloadTemplate: fixtureTemplate("video"),
    __sleep: async () => {},
    __pollVideoDom: async () => ({ url: READY_VIDEO_URL, status: "video is ready", quota: false })
  }, forgedDownloadFetch("video", READY_VIDEO_URL, MP4_BYTES, "video/mp4", downloads));

  assert.equal(result.errorCode, null, "real ftyp bytes are still accepted");
  assert.equal(result.size_bytes, MP4_BYTES.length);
  assert.equal(fs.readFileSync(String(result.path)).length, MP4_BYTES.length);
});

test("Gemini video RPC clamps oversized timeout_ms to VIDEO_POLL_MAX_TIMEOUT_MS and still returns ARTIFACT_DOWNLOAD_TIMEOUT (never hangs past MCP deadline)", async () => {
  // Reproduces the codex REQUEST-CHANGES blocker: a caller supplying timeout_ms >= 900000
  // (at or above the MCP invocation deadline) must not make the poll cap exceed 840000ms,
  // otherwise the poll would outlive the 900000ms MCP deadline and emit generic COMMAND_TIMEOUT
  // instead of the tool's own honest ARTIFACT_DOWNLOAD_TIMEOUT.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gemini-video-poll-clamp-"));
  const downloads: any[] = [];
  let clock = 0;
  let attempts = 0;
  const result = await webAiGeminiGenerateVideoRpcWithFetch({
    profile: "gemini-9225",
    prompt: "2s clip that never finishes with huge timeout",
    download_dir: root,
    timeout_ms: 1200000, // 20 min — exceeds the 900000ms MCP deadline; must be clamped to 840000
    __cdpSnapshot: cdpSnapshot,
    __payloadTemplate: fixtureTemplate("video"),
    __now: () => clock,
    __sleep: async () => { clock += 60000; }, // each interval advances clock by 60s
    __pollVideoDom: async () => { attempts += 1; return { url: VIDEO_CHIP_URL, status: "generating your video", quota: false }; }
  }, chipOnlyVideoFetch(READY_VIDEO_URL, MP4_BYTES, downloads));

  assert.equal(result.errorCode, "ARTIFACT_DOWNLOAD_TIMEOUT", "oversized timeout_ms must be clamped; tool returns its own honest error code, not a generic one");
  assert.equal(result.error_code, "ARTIFACT_DOWNLOAD_TIMEOUT");
  assert.equal(result.path, "");
  assert.equal(downloads.length, 0, "never downloaded the chip placeholder");
  assert.ok(attempts >= 1, "polled at least once before timing out");
  // The effective cap is 840000ms; with 60000ms-per-sleep the loop exits at or before
  // clock = 840000, well within the 900000ms MCP deadline.
  assert.ok(clock <= 900000, `poll clock ${clock}ms must stay under the 900000ms MCP invocation deadline`);
});
