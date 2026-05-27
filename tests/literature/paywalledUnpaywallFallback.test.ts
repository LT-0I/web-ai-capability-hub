import test from "node:test";
import assert from "node:assert/strict";
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "webai-unpaywall-fallback-"));
process.env.WEBAI_LITERATURE_RATE_LIMIT_DB = path.join(tempRoot, "literature-rate-limit.sqlite");
process.env.WEBAI_LITERATURE_QUEUE_DB = path.join(tempRoot, "literature-queue.sqlite");

const profileDir = path.join(tempRoot, "profile");
fs.mkdirSync(profileDir, { recursive: true });
fs.writeFileSync(path.join(profileDir, "state"), "ok");

const originalFetch = globalThis.fetch;
const originalFetchTimeoutEnv = process.env.WEBAI_UNPAYWALL_PDF_FETCH_TIMEOUT_MS;
let fetchCalls: string[] = [];
let publisherMode: "throw" | "pdf" = "throw";
const publisherPdf = Buffer.from("%PDF-1.4\n% publisher fixture\n");
const unpaywallPdf = Buffer.from("%PDF-1.4\n% unpaywall fixture\n");

const fakeCdp = {
  on: () => undefined,
  send: async () => ({})
};

function apiResponse(url: string, ok: boolean, buffer: Buffer, contentType: string, status = ok ? 200 : 403): any {
  return {
    ok: () => ok,
    status,
    url: () => url,
    headers: () => ({ "content-type": contentType }),
    body: async () => buffer
  };
}

const fakeContext: any = {
  request: {
    get: async (url: string) => apiResponse(String(url), true, publisherPdf, "application/pdf")
  },
  newCDPSession: async () => fakeCdp,
  newPage: async () => fakePage,
  pages: () => [fakePage]
};

const fakePage: any = {
  context: () => fakeContext,
  goto: async (url: string) => apiResponse(String(url), false, Buffer.from("<html></html>"), "text/html", 403),
  waitForLoadState: async () => undefined,
  waitForTimeout: async () => undefined,
  mouse: { move: async () => undefined },
  evaluate: async () => [],
  locator: () => ({ first() { return this; }, count: async () => 0 }),
  url: () => "https://publisher.example/paper.pdf",
  close: async () => undefined
};

const fakeBrowser: any = {
  contexts: () => [fakeContext],
  newBrowserCDPSession: async () => fakeCdp,
  close: async () => undefined
};

function installFakeBrowserLauncher(): void {
  const profilePool = require("../../src/runtime/pool/profilePool");
  profilePool.createManagedBrowserLauncher = () => ({
    profileStore: {
      profilesRoot: tempRoot,
      list: () => [{ profileName: "test-profile", profileDir }]
    },
    launch: async () => ({ cdpEndpoint: "http://127.0.0.1:0", launchedByPackage: true }),
    connectOverCdp: async () => {
      if (publisherMode === "throw") throw new Error("publisher gate");
      return fakeBrowser;
    }
  });
}

let paywalledModule: Promise<typeof import("../../src/mcp/submcp/literature/paywalled")> | undefined;
async function paywalled() {
  installFakeBrowserLauncher();
  paywalledModule ||= import("../../src/mcp/submcp/literature/paywalled");
  return paywalledModule;
}

function config(): import("../../src/mcp/submcp/literature/paywalled").PaywalledLiteratureConfig {
  return {
    db_slug: "unit-unpaywall",
    display_name: "Unit Paywalled Publisher",
    default_profile: "test-profile",
    selectors: [],
    metadata_tool: null,
    unpaywall_fallback: true
  };
}

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalFetchTimeoutEnv === undefined) delete process.env.WEBAI_UNPAYWALL_PDF_FETCH_TIMEOUT_MS;
  else process.env.WEBAI_UNPAYWALL_PDF_FETCH_TIMEOUT_MS = originalFetchTimeoutEnv;
  fetchCalls = [];
  publisherMode = "throw";
});

function installUnpaywallHit(): void {
  globalThis.fetch = (async (url: string | URL | Request) => {
    const text = String(url);
    fetchCalls.push(text);
    if (/api\.unpaywall\.org/.test(text)) {
      return new Response(JSON.stringify({ best_oa_location: { url_for_pdf: "https://repo.example/oa.pdf", host_type: "repository" } }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }
    return new Response(unpaywallPdf, { status: 200, headers: { "content-type": "application/pdf" } });
  }) as any;
}

test("publisher fails, Unpaywall hits, PDF is written with oa_source=unpaywall", async () => {
  installUnpaywallHit();
  const { runPaywalledLiteratureDownloadPdfTool } = await paywalled();
  const output: any = await runPaywalledLiteratureDownloadPdfTool(config(), {
    doc_id: "10.1234/unit-hit",
    pdf_url: "https://publisher.example/paper.pdf",
    profile: "test-profile",
    output_dir: path.join(tempRoot, "hit"),
    unpaywall_email: "unit@example.test"
  });

  assert.equal(output.ok, true);
  assert.equal(output.oa_source, "unpaywall");
  assert.ok(output.path);
  assert.equal(fs.readFileSync(output.path).subarray(0, 5).toString(), "%PDF-");
  assert.equal(output.size, unpaywallPdf.length);
  assert.equal(fetchCalls.length, 2);
});

test("publisher fails, Unpaywall misses, LOGIN_REQUIRED carries no-OA hint", async () => {
  globalThis.fetch = (async (url: string | URL | Request) => {
    fetchCalls.push(String(url));
    return new Response(JSON.stringify({ best_oa_location: null }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  }) as any;
  const { runPaywalledLiteratureDownloadPdfTool } = await paywalled();
  const output: any = await runPaywalledLiteratureDownloadPdfTool(config(), {
    doc_id: "10.1234/unit-miss",
    pdf_url: "https://publisher.example/paper.pdf",
    profile: "test-profile",
    output_dir: path.join(tempRoot, "miss"),
    unpaywall_email: "unit@example.test"
  });

  assert.equal(output.ok, false);
  assert.equal(output.errorCode, "LOGIN_REQUIRED");
  assert.equal(output.oa_source, "none");
  assert.match(output.message, /Tried Unpaywall — no OA copy found/);
  assert.equal(fetchCalls.length, 1);
});

test("publisher fails, Unpaywall OA fetch timeout returns honest LOGIN_REQUIRED hint", async () => {
  process.env.WEBAI_UNPAYWALL_PDF_FETCH_TIMEOUT_MS = "5";
  globalThis.fetch = (async (url: string | URL | Request) => {
    const text = String(url);
    fetchCalls.push(text);
    if (/api\.unpaywall\.org/.test(text)) {
      return new Response(JSON.stringify({ best_oa_location: { url_for_pdf: "https://repo.example/hangs.pdf" } }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }
    return new Promise(() => undefined);
  }) as any;
  const { runPaywalledLiteratureDownloadPdfTool } = await paywalled();
  const output: any = await runPaywalledLiteratureDownloadPdfTool(config(), {
    doc_id: "10.1234/unit-timeout",
    pdf_url: "https://publisher.example/paper.pdf",
    profile: "test-profile",
    output_dir: path.join(tempRoot, "timeout"),
    unpaywall_email: "unit@example.test"
  });

  assert.equal(output.ok, false);
  assert.equal(output.errorCode, "LOGIN_REQUIRED");
  assert.equal(output.oa_source, "none");
  assert.match(output.message, /Tried Unpaywall — Unpaywall OA PDF fetch failed: timed out after 5ms/);
  assert.deepEqual(fetchCalls.map((url) => /api\.unpaywall\.org/.test(url) ? "api" : "pdf"), ["api", "pdf"]);
});

test("publisher fails, no email provided, no Unpaywall request is made", async () => {
  globalThis.fetch = (async (url: string | URL | Request) => {
    fetchCalls.push(String(url));
    throw new Error("Unpaywall should not be called without email");
  }) as any;
  const { runPaywalledLiteratureDownloadPdfTool } = await paywalled();
  const output: any = await runPaywalledLiteratureDownloadPdfTool(config(), {
    doc_id: "10.1234/unit-no-email",
    pdf_url: "https://publisher.example/paper.pdf",
    profile: "test-profile",
    output_dir: path.join(tempRoot, "no-email")
  });

  assert.equal(output.ok, false);
  assert.equal(output.errorCode, "LOGIN_REQUIRED");
  assert.equal(output.oa_source, "none");
  assert.match(output.message, /Unpaywall not configured/);
  assert.equal(fetchCalls.length, 0);
});

test("publisher succeeds with oa_source=publisher and does not call Unpaywall", async () => {
  publisherMode = "pdf";
  globalThis.fetch = (async (url: string | URL | Request) => {
    fetchCalls.push(String(url));
    throw new Error("Unpaywall should not be called after publisher success");
  }) as any;
  const { runPaywalledLiteratureDownloadPdfTool } = await paywalled();
  const output: any = await runPaywalledLiteratureDownloadPdfTool(config(), {
    doc_id: "10.1234/unit-publisher",
    pdf_url: "https://publisher.example/paper.pdf",
    profile: "test-profile",
    output_dir: path.join(tempRoot, "publisher"),
    unpaywall_email: "unit@example.test"
  });

  assert.equal(output.ok, true);
  assert.equal(output.oa_source, "publisher");
  assert.ok(output.path);
  assert.equal(fs.readFileSync(output.path).subarray(0, 5).toString(), "%PDF-");
  assert.equal(fetchCalls.length, 0);
});

test("custom paywalled download handlers preserve oa_source on guarded outputs", async () => {
  const contract = JSON.parse(fs.readFileSync(path.join(process.cwd(), "configs/consumer-contract.json"), "utf8"));
  for (const name of ["webai_proquest_download_pdf", "webai_incopat_download_pdf", "webai_wanfang_download_pdf", "webai_asce_download_pdf"]) {
    const row = contract.commands.find((entry: any) => entry.mcp_name === name);
    assert.ok(row, `${name} exists in consumer contract`);
    assert.ok(row.output_keys.always_present.includes("oa_source"), `${name} declares oa_source`);
  }

  const { webAiProquestDownloadPdf } = await import("../../src/mcp/submcp/literature/proquest");
  const { webAiAsceDownloadPdf } = await import("../../src/mcp/submcp/literature/asce");
  assert.equal((await webAiProquestDownloadPdf({}) as any).oa_source, "none");
  assert.equal((await webAiAsceDownloadPdf({}) as any).oa_source, "none");

  for (const relPath of ["src/mcp/submcp/literature/incopat.ts", "src/mcp/submcp/literature/wanfang.ts"]) {
    assert.match(fs.readFileSync(path.join(process.cwd(), relPath), "utf8"), /oa_source:\s*"none"/, `${relPath} has guarded oa_source output`);
  }
});
