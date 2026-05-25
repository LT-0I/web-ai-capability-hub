import test from "node:test";
import assert from "node:assert/strict";
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "webai-phase8-bucket-b-"));
process.env.WEBAI_LITERATURE_RATE_LIMIT_DB = path.join(tempRoot, "literature-rate-limit.sqlite");
process.env.WEBAI_LITERATURE_QUEUE_DB = path.join(tempRoot, "literature-queue.sqlite");

const PDF_BYTES = Buffer.from("%PDF-1.7\nphase8-bucket-b\n%%EOF\n", "utf8");

type RuntimeModules = {
  tools: typeof import("../../src/mcp/tools");
  quota: typeof import("../../src/runtime/literature/quota");
  queue: typeof import("../../src/runtime/literature/queue");
  drivers: typeof import("../../src/runtime/literature/drivers");
};

let runtimeModules: Promise<RuntimeModules> | undefined;
async function loadRuntimeModules(): Promise<RuntimeModules> {
  runtimeModules ||= Promise.all([
    import("../../src/mcp/tools"),
    import("../../src/runtime/literature/quota"),
    import("../../src/runtime/literature/queue"),
    import("../../src/runtime/literature/drivers")
  ]).then(([tools, quota, queue, drivers]) => ({ tools, quota, queue, drivers }));
  return runtimeModules;
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } });
}

function pdfResponse(): Response {
  return new Response(PDF_BYTES, { status: 200, headers: { "content-type": "application/pdf" } });
}

function htmlResponse(html: string): Response {
  return new Response(html, { status: 200, headers: { "content-type": "text/html" } });
}

function installFetchMock(t: any, handler: (url: string) => Response): string[] {
  const original = (globalThis as any).fetch;
  const calls: string[] = [];
  (globalThis as any).fetch = async (input: any) => {
    const url = typeof input === "string" ? input : input?.url || String(input);
    calls.push(url);
    return handler(url);
  };
  t.after(() => { (globalThis as any).fetch = original; });
  return calls;
}

interface DriverCase {
  slug: string;
  mcp: string;
  cli: string;
  tsExport: string;
  docId: string;
  fetchHandler: (url: string) => Response;
  expectedCall: RegExp;
}

const cases: DriverCase[] = [
  {
    slug: "arxiv",
    mcp: "webai_arxiv_download_pdf",
    cli: "webai:arxiv:download-pdf",
    tsExport: "webAiArxivDownloadPdf",
    docId: "2401.12345",
    fetchHandler: () => pdfResponse(),
    expectedCall: /^https:\/\/arxiv\.org\/pdf\/2401\.12345\.pdf$/
  },
  {
    slug: "scoap3",
    mcp: "webai_scoap3_download_pdf",
    cli: "webai:scoap3:download-pdf",
    tsExport: "webAiScoap3DownloadPdf",
    docId: "123456",
    fetchHandler: (url) => url.includes("/api/records/") ? jsonResponse({ files: [{ url: "https://repo.scoap3.org/files/123456.pdf" }] }) : pdfResponse(),
    expectedCall: /^https:\/\/repo\.scoap3\.org\/files\/123456\.pdf$/
  },
  {
    slug: "mdpi",
    mcp: "webai_mdpi_download_pdf",
    cli: "webai:mdpi:download-pdf",
    tsExport: "webAiMdpiDownloadPdf",
    docId: "2076-3417/15/1/2",
    fetchHandler: () => pdfResponse(),
    expectedCall: /^https:\/\/www\.mdpi\.com\/2076-3417\/15\/1\/2\/pdf$/
  },
  {
    slug: "frontiers",
    mcp: "webai_frontiers_download_pdf",
    cli: "webai:frontiers:download-pdf",
    tsExport: "webAiFrontiersDownloadPdf",
    docId: "articles/10.3389/fcell.2024.001/full",
    fetchHandler: () => pdfResponse(),
    expectedCall: /^https:\/\/www\.frontiersin\.org\/articles\/10\.3389\/fcell\.2024\.001\/full\/pdf\?download=$/
  },
  {
    slug: "pubscholar",
    mcp: "webai_pubscholar_download_pdf",
    cli: "webai:pubscholar:download-pdf",
    tsExport: "webAiPubscholarDownloadPdf",
    docId: "record-abc",
    fetchHandler: (url) => url.endsWith("/record-abc") ? htmlResponse('<article data-pdf-url="/files/record-abc.pdf"></article>') : pdfResponse(),
    expectedCall: /^https:\/\/pubscholar\.cn\/files\/record-abc\.pdf$/
  },
  {
    slug: "scielo",
    mcp: "webai_scielo_download_pdf",
    cli: "webai:scielo:download-pdf",
    tsExport: "webAiScieloDownloadPdf",
    docId: "jatm/pidABC123",
    fetchHandler: () => pdfResponse(),
    expectedCall: /^https:\/\/www\.scielo\.br\/j\/jatm\/a\/pidABC123\/\?lang=en&format=pdf$/
  },
  {
    slug: "inspirehep",
    mcp: "webai_inspirehep_download_pdf",
    cli: "webai:inspirehep:download-pdf",
    tsExport: "webAiInspirehepDownloadPdf",
    docId: "987654",
    fetchHandler: (url) => url.includes("/api/literature/") ? jsonResponse({ metadata: { arxiv_eprints: [{ value: "2401.54321" }] } }) : pdfResponse(),
    expectedCall: /^https:\/\/arxiv\.org\/pdf\/2401\.54321\.pdf$/
  }
];

function contract(): any {
  return JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "configs/consumer-contract.json"), "utf8"));
}

for (const item of cases) {
  test(`${item.mcp} routes, validates args, queues on quota, downloads, and records ledger`, async (t: any) => {
    const { tools, quota, queue } = await loadRuntimeModules();
    const calls = installFetchMock(t, item.fetchHandler);
    const outputDir = path.join(tempRoot, item.slug, crypto.randomBytes(4).toString("hex"));

    const row = contract().commands.find((command: any) => command.mcp_name === item.mcp);
    assert.equal(row?.cli_name, item.cli);
    assert.equal(row?.ts_export, item.tsExport);
    assert.deepEqual(row?.required_args, ["doc_id"]);
    assert.equal(typeof (tools as any)[item.tsExport], "function");
    assert.ok(tools.listMcpTools().some((tool) => tool.name === item.mcp));

    const invalid: any = await tools.callMcpTool(item.mcp, {});
    assert.equal(invalid.ok, false);
    assert.equal(invalid.errorCode, "INVALID_ARGS");

    assert.equal(quota.assertLiteratureQuota(item.slug, Date.now()).allowed, true);
    const result: any = await tools.callMcpTool(item.mcp, { doc_id: item.docId, output_dir: outputDir });
    assert.equal(result.ok, true);
    assert.equal(result.task_id, null);
    assert.equal(result.errorCode, null);
    assert.equal(result.message, "Literature PDF downloaded");
    assert.ok(path.isAbsolute(result.path));
    assert.equal(fs.readFileSync(result.path).toString("utf8"), PDF_BYTES.toString("utf8"));
    assert.equal(result.size, PDF_BYTES.length);
    assert.equal(result.sha256, crypto.createHash("sha256").update(PDF_BYTES).digest("hex"));
    assert.equal(quota.countDownloadsLast24h(item.slug, Date.now()), 1);
    assert.ok(calls.some((url) => item.expectedCall.test(url)), `${item.mcp} resolver did not fetch expected PDF URL; calls=${JSON.stringify(calls)}`);

    for (let i = 0; i < 20; i++) {
      quota.recordLiteratureDownload(item.slug, `cap-${i}`, `/tmp/${item.slug}-${i}.pdf`, `sha-${i}`, null, Date.now() + i);
    }
    const queued: any = await (tools as any)[item.tsExport]({ doc_id: item.docId, output_dir: path.join(tempRoot, item.slug, "queued") });
    assert.equal(queued.ok, true);
    assert.equal(queued.errorCode, "LITERATURE_QUEUED");
    assert.match(queued.task_id, /^[0-9a-f-]{36}$/i);
    assert.equal(queued.path, null);
    assert.equal(queued.sha256, null);
    const status = queue.getLiteratureTaskStatus(queued.task_id);
    assert.equal(status?.db_slug, item.slug);
    assert.equal(status?.doc_id, item.docId);
    assert.equal(status?.status, "queued");
  });
}

test("phase8 bucket B literature drivers self-register", async () => {
  const { drivers: { getLiteratureDriver } } = await loadRuntimeModules();
  for (const item of cases) {
    assert.equal(typeof getLiteratureDriver(item.slug), "function", `${item.slug} driver missing`);
  }
});
