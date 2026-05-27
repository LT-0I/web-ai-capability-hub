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
  const bytes = Buffer.from("fixture-png-bytes");
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
  assert.equal(fs.readFileSync(String(result.path)).toString("utf8"), "fixture-png-bytes");
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

test("Gemini music download-track RPC remains explicitly RPC_NOT_AVAILABLE for mp3/video", async () => {
  const result = await webAiGeminiMusicDownloadTrackRpc({ format: "mp3" });
  assert.equal(result.errorCode, "INVALID_ARGS");
  assert.equal(result.error_code, "INVALID_ARGS");
  assert.match(String(result.message), /RPC_NOT_AVAILABLE/);
});
