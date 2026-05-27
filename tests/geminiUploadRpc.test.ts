const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

import {
  buildGeminiUploadCompletionFReq,
  GeminiRpcPayloadTemplate,
  GeminiUploadRecord,
  GeminiUploadRpcFetch,
  webAiGeminiUploadAndQueryRpcWithFetch
} from "../src/mcp/gemini_upload_rpc";

const cdpSnapshot = {
  at: "AT-upload-fixture",
  bl: "boq_assistant-bard-web-server_upload_fixture_p0",
  fsid: "4562813662076479580",
  cookieHeader: "SID=fixture; __Secure-1PSID=fixture",
  userAgent: "Mozilla/5.0 Upload Fixture",
  pageUrl: "https://gemini.google.com/app?hl=en"
};

function fixtureTemplate(): GeminiRpcPayloadTemplate {
  const inner = Array.from({ length: 81 }, () => null) as any[];
  inner[0] = ["{{prompt}}", 0, null, [[["/contrib_service/ttl_1d/captured", 3, null, "text/plain"], "{{file_name}}", null, null, null, null, null, null, [0]]], null, null, 0];
  inner[1] = ["en"];
  inner[2] = ["", "", "", null, null, null, null, null, null, ""];
  inner[3] = "!opaque-upload-fixture-token";
  inner[4] = "0123456789abcdef0123456789abcdef";
  inner[17] = [[0]];
  inner[53] = 0;
  inner[59] = "11111111-2222-3333-4444-555555555555";
  inner[79] = 1;
  inner[80] = 1;
  return { f_req_template: [null, inner] };
}

function minimalGeminiStream(text: string): string {
  const nested: any[] = [];
  nested[1] = ["c_upload_fixture", "r_upload_fixture"];
  nested[4] = [["rc_upload_fixture", [text], null, null, null, null, true, null, [1], "und"]];
  nested[26] = [[[[null, [null, 0, text]]]]];
  const payload = JSON.stringify([["wrb.fr", null, JSON.stringify(nested)]]);
  return `)]}'\n\n${payload.length}\n${payload}\n`;
}

function innerFromFReq(fReq: string): any[] {
  const top = JSON.parse(fReq);
  return JSON.parse(top[1]);
}

function innerFromRequestBody(body: string | undefined): any[] {
  assert.equal(typeof body, "string");
  const fReq = new URLSearchParams(body as string).get("f.req");
  assert.equal(typeof fReq, "string");
  return innerFromFReq(fReq as string);
}

function tempFile(root: string, name: string, content: string): string {
  const file = path.join(root, name);
  fs.writeFileSync(file, content, "utf8");
  return file;
}

function uploadFetchFor(expectedFiles: Record<string, string>, expectedPrompt: string, expectedText: string, seen: any[]): GeminiUploadRpcFetch {
  let uploadIndex = 0;
  return async (request) => {
    seen.push(request);
    if (request.kind === "upload-start") {
      assert.equal(request.url, "https://push.clients6.google.com/upload/");
      assert.equal(request.headers["x-goog-upload-command"], "start");
      assert.equal(request.headers["x-goog-upload-protocol"], "resumable");
      assert.equal(request.headers["x-tenant-id"], "bard-storage");
      assert.equal(request.body, `File name: ${request.file?.fileName}`);
      assert.equal(request.headers["x-goog-upload-header-content-length"], String(Buffer.from(expectedFiles[String(request.file?.fileName)]).length));
      return { status: 200, text: "", headers: { "x-goog-upload-url": `https://push.clients6.google.com/upload/?upload_id=fixture-${++uploadIndex}` } };
    }
    if (request.kind === "upload-finalize") {
      assert.match(request.url, /upload_id=fixture-/);
      assert.equal(request.headers["x-goog-upload-command"], "upload, finalize");
      assert.equal(request.headers["x-goog-upload-offset"], "0");
      const expected = expectedFiles[String(request.file?.fileName)];
      assert.equal(Buffer.from(String(request.bodyBase64), "base64").toString("utf8"), expected);
      return { status: 200, text: `/contrib_service/ttl_1d/${request.file?.fileName}-uri`, headers: {} as Record<string, string> };
    }
    assert.equal(request.kind, "completion");
    assert.match(request.url, /StreamGenerate/);
    assert.equal(new URLSearchParams(request.body).get("at"), cdpSnapshot.at);
    const inner = innerFromRequestBody(request.body);
    assert.equal(inner[0][0], expectedPrompt);
    const attachments = inner[0][3];
    assert.equal(attachments.length, Object.keys(expectedFiles).length);
    assert.deepEqual(attachments.map((item: any) => item[1]), Object.keys(expectedFiles));
    assert.deepEqual(attachments.map((item: any) => item[0][3]), Object.keys(expectedFiles).map(() => "text/plain"));
    assert.ok(attachments.every((item: any) => String(item[0][0]).startsWith("/contrib_service/ttl_1d/")));
    return { status: 200, text: minimalGeminiStream(expectedText), headers: {} as Record<string, string> };
  };
}

test("Gemini upload RPC completion f.req maps uploaded file URIs into the captured attachment slot", () => {
  const records: GeminiUploadRecord[] = [
    { fileName: "one.txt", mimeType: "text/plain", sizeBytes: 3, uri: "/contrib_service/ttl_1d/one" },
    { fileName: "two.txt", mimeType: "text/plain", sizeBytes: 3, uri: "/contrib_service/ttl_1d/two" }
  ];
  const inner = innerFromFReq(buildGeminiUploadCompletionFReq("summarize", fixtureTemplate(), records));
  assert.equal(inner[0][0], "summarize");
  assert.equal(inner[0][3][0][0][0], "/contrib_service/ttl_1d/one");
  assert.equal(inner[0][3][1][1], "two.txt");
  assert.equal(inner[3], "!opaque-upload-fixture-token");
});

const UPLOAD_VARIANTS: Array<{ name: string; files: Record<string, string>; prompt: string; text: string }> = [
  { name: "upload_single", files: { "single.txt": "alpha one" }, prompt: "Summarize single upload", text: "single summary" },
  { name: "upload_multi", files: { "first.txt": "alpha", "second.txt": "beta" }, prompt: "Compare both uploads", text: "multi summary" },
  { name: "upload_and_query", files: { "question.txt": "what is inside" }, prompt: "Answer from the upload", text: "upload answer" }
];

for (const variant of UPLOAD_VARIANTS) {
  test(`Gemini upload RPC ${variant.name} sends resumable upload then StreamGenerate with captured body shape`, async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), `gemini-upload-${variant.name}-`));
    const filePaths = Object.entries(variant.files).map(([name, content]) => tempFile(root, name, content));
    const calls: any[] = [];
    const result = await webAiGeminiUploadAndQueryRpcWithFetch({
      profile: "gemini-9225",
      prompt: variant.prompt,
      files: filePaths,
      __cdpSnapshot: cdpSnapshot,
      __payloadTemplate: fixtureTemplate(),
      __now: () => 1000
    }, uploadFetchFor(variant.files, variant.prompt, variant.text, calls));

    assert.equal(result.errorCode, null);
    assert.equal(result.completion_detected, true);
    assert.equal(result.response_text, variant.text);
    assert.deepEqual(result.files_in_chip, Object.keys(variant.files));
    assert.equal(calls.filter((call) => call.kind === "upload-start").length, filePaths.length);
    assert.equal(calls.filter((call) => call.kind === "upload-finalize").length, filePaths.length);
    assert.equal(calls.filter((call) => call.kind === "completion").length, 1);
  });
}
