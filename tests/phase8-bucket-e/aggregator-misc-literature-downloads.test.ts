import test from "node:test";
import assert from "node:assert/strict";
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "webai-phase8-bucket-e-"));
process.env.WEBAI_LITERATURE_RATE_LIMIT_DB = path.join(tempRoot, "literature-rate-limit.sqlite");
process.env.WEBAI_LITERATURE_QUEUE_DB = path.join(tempRoot, "literature-queue.sqlite");

type RuntimeModules = {
  tools: typeof import("../../src/mcp/tools");
  quota: typeof import("../../src/runtime/literature/quota");
  queue: typeof import("../../src/runtime/literature/queue");
  drivers: typeof import("../../src/runtime/literature/drivers");
  configs: {
    acm: typeof import("../../src/mcp/submcp/literature/acm");
    crc: typeof import("../../src/mcp/submcp/literature/crc");
    dblp: typeof import("../../src/mcp/submcp/literature/dblp");
    incopat: typeof import("../../src/mcp/submcp/literature/incopat");
    proquest: typeof import("../../src/mcp/submcp/literature/proquest");
    wanfang: typeof import("../../src/mcp/submcp/literature/wanfang");
    worldsci: typeof import("../../src/mcp/submcp/literature/worldsci");
    wos: typeof import("../../src/mcp/submcp/literature/wos");
  };
};

let runtimeModules: Promise<RuntimeModules> | undefined;
async function loadRuntimeModules(): Promise<RuntimeModules> {
  runtimeModules ||= Promise.all([
    import("../../src/mcp/tools"),
    import("../../src/runtime/literature/quota"),
    import("../../src/runtime/literature/queue"),
    import("../../src/runtime/literature/drivers"),
    import("../../src/mcp/submcp/literature/acm"),
    import("../../src/mcp/submcp/literature/crc"),
    import("../../src/mcp/submcp/literature/dblp"),
    import("../../src/mcp/submcp/literature/incopat"),
    import("../../src/mcp/submcp/literature/proquest"),
    import("../../src/mcp/submcp/literature/wanfang"),
    import("../../src/mcp/submcp/literature/worldsci"),
    import("../../src/mcp/submcp/literature/wos")
  ]).then(([tools, quota, queue, drivers, acm, crc, dblp, incopat, proquest, wanfang, worldsci, wos]) => ({
    tools,
    quota,
    queue,
    drivers,
    configs: { acm, crc, dblp, incopat, proquest, wanfang, worldsci, wos }
  }));
  return runtimeModules;
}

interface PaywalledCase {
  slug: "acm" | "crc" | "incopat" | "proquest" | "wanfang" | "worldsci";
  mcp: string;
  cli: string;
  tsExport: string;
  defaultProfile: string;
  firstSelector: string;
  noPdfDocId: string;
  directQueuedUrl?: string;
}

const paywalledCases: PaywalledCase[] = [
  {
    slug: "acm",
    mcp: "webai_acm_download_pdf",
    cli: "webai:acm:download-pdf",
    tsExport: "webAiAcmDownloadPdf",
    defaultProfile: "research-acm",
    firstSelector: "a.btn-pdf",
    noPdfDocId: "10.1145/1234567.890123",
    directQueuedUrl: "https://dl.acm.org/doi/pdf/10.1145/1234567.890123"
  },
  {
    slug: "crc",
    mcp: "webai_crc_download_pdf",
    cli: "webai:crc:download-pdf",
    tsExport: "webAiCrcDownloadPdf",
    defaultProfile: "research-crc",
    firstSelector: "a.pdf",
    noPdfDocId: "crc-book-without-resolved-url"
  },
  {
    slug: "incopat",
    mcp: "webai_incopat_download_pdf",
    cli: "webai:incopat:download-pdf",
    tsExport: "webAiIncopatDownloadPdf",
    defaultProfile: "research-incopat",
    firstSelector: "a[href*=\"/pdf\" i]",
    noPdfDocId: "CN123456789A",
    directQueuedUrl: "https://www.incopat.com/patent/CN123456789A/pdf"
  },
  {
    slug: "proquest",
    mcp: "webai_proquest_download_pdf",
    cli: "webai:proquest:download-pdf",
    tsExport: "webAiProquestDownloadPdf",
    defaultProfile: "research-proquest",
    firstSelector: "a#downloadPDFLink",
    noPdfDocId: "proquest-dissertation-without-resolved-url"
  },
  {
    slug: "wanfang",
    mcp: "webai_wanfang_download_pdf",
    cli: "webai:wanfang:download-pdf",
    tsExport: "webAiWanfangDownloadPdf",
    defaultProfile: "research-wanfang",
    firstSelector: "a.downloadliterature",
    noPdfDocId: "wanfang-record-without-resolved-url"
  },
  {
    slug: "worldsci",
    mcp: "webai_worldsci_download_pdf",
    cli: "webai:worldsci:download-pdf",
    tsExport: "webAiWorldsciDownloadPdf",
    defaultProfile: "research-worldsci",
    firstSelector: "a[data-track*=\"pdf\" i]",
    noPdfDocId: "10.1142/S0218127424500010",
    directQueuedUrl: "https://www.worldscientific.com/doi/pdf/10.1142/S0218127424500010"
  }
];

const bibliographicCases = [
  {
    slug: "dblp",
    mcp: "webai_dblp_download_pdf",
    cli: "webai:dblp:download-pdf",
    tsExport: "webAiDblpDownloadPdf",
    message: "dblp is bibliographic-only; use the resolved arXiv/DOI URL from research_dblp_get_metadata to call the appropriate publisher driver (e.g. webai_arxiv_download_pdf, webai_acm_download_pdf, ...)"
  },
  {
    slug: "wos",
    mcp: "webai_wos_download_pdf",
    cli: "webai:wos:download-pdf",
    tsExport: "webAiWosDownloadPdf",
    message: "wos is bibliographic/metadata-only; use the resolved DOI URL from research_wos_get_metadata to call the appropriate publisher driver (e.g. webai_acm_download_pdf, webai_wiley_download_pdf, ...)"
  }
];

function contract(): any {
  return JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "configs/consumer-contract.json"), "utf8"));
}

test("phase8 bucket E refuses to create a fresh logged-out browser profile", async () => {
  const { tools } = await loadRuntimeModules();
  const result: any = await tools.callMcpTool("webai_acm_download_pdf", {
    doc_id: "10.1145/missing-profile",
    profile: `phase8e-missing-profile-${Date.now()}`,
    output_dir: path.join(tempRoot, "acm", "missing-profile")
  });
  assert.equal(result.ok, false);
  assert.equal(result.errorCode, "PROFILE_NOT_FOUND");
  assert.match(result.message, /refusing to spawn a fresh logged-out Chrome/);
});

for (const item of paywalledCases) {
  test(`${item.mcp} routes, validates args, honors selector/direct-url shape, and queues on quota`, async () => {
    const { tools, quota, queue, configs } = await loadRuntimeModules();
    const row = contract().commands.find((command: any) => command.mcp_name === item.mcp);
    assert.equal(row?.cli_name, item.cli);
    assert.equal(row?.ts_export, item.tsExport);
    assert.deepEqual(row?.required_args, ["doc_id"]);
    for (const arg of ["pdf_url", "profile", "output_dir", "cdp_port"]) assert.ok(row?.optional_args?.includes(arg), `${item.mcp} missing optional ${arg}`);
    assert.equal(typeof (tools as any)[item.tsExport], "function");
    assert.equal((configs as any)[item.slug][`${item.slug}PaywalledLiteratureConfig`]?.default_profile, item.defaultProfile);
    assert.equal((configs as any)[item.slug][`${item.slug}PaywalledLiteratureConfig`]?.selectors?.[0], item.firstSelector);

    const spec = tools.listMcpTools().find((tool) => tool.name === item.mcp) as any;
    assert.ok(spec, `${item.mcp} missing from listMcpTools`);
    assert.equal(spec.inputSchema?.properties?.doc_id?.type, "string");
    assert.equal(spec.inputSchema?.properties?.pdf_url?.type, "string");
    assert.equal(spec.inputSchema?.properties?.profile?.type, "string");
    assert.equal(spec.inputSchema?.properties?.output_dir?.type, "string");
    assert.equal(spec.inputSchema?.properties?.cdp_port?.type, "number");
    assert.deepEqual(spec.inputSchema?.required, ["doc_id"]);

    const invalid: any = await tools.callMcpTool(item.mcp, {});
    assert.equal(invalid.ok, false);
    assert.equal(invalid.errorCode, "INVALID_ARGS");

    const noPdfUrlArgs: any = { doc_id: item.noPdfDocId, output_dir: path.join(tempRoot, item.slug, "no-pdf-url") };
    if (item.directQueuedUrl) noPdfUrlArgs.profile = `phase8e-no-profile-${item.slug}-${Date.now()}`;
    const noPdfUrl: any = await tools.callMcpTool(item.mcp, noPdfUrlArgs);
    assert.equal(noPdfUrl.ok, false);
    if (item.directQueuedUrl) {
      assert.equal(noPdfUrl.errorCode, "PROFILE_NOT_FOUND");
    } else {
      assert.equal(noPdfUrl.errorCode, "ELEMENT_NOT_FOUND");
      assert.match(noPdfUrl.message, new RegExp(`research_${item.slug}_get_metadata`));
      assert.match(noPdfUrl.message, /pass pdf_url/);
    }

    for (let i = 0; i < 20; i++) {
      quota.recordLiteratureDownload(item.slug, `cap-${i}`, `/tmp/${item.slug}-${i}.pdf`, `sha-${i}`, null, Date.now() + i);
    }
    const queuedDocId = item.directQueuedUrl ? item.noPdfDocId : `10.9999/${item.slug}/queued`;
    const queuedArgs: any = {
      doc_id: queuedDocId,
      profile: item.defaultProfile,
      output_dir: path.join(tempRoot, item.slug, "queued")
    };
    if (!item.directQueuedUrl) queuedArgs.pdf_url = `https://example.test/${item.slug}/queued.pdf`;
    const queued: any = await (tools as any)[item.tsExport](queuedArgs);
    assert.equal(queued.ok, true);
    assert.equal(queued.errorCode, "LITERATURE_QUEUED");
    assert.match(queued.task_id, /^[0-9a-f-]{36}$/i);
    assert.equal(queued.path, null);
    assert.equal(queued.sha256, null);

    if (item.directQueuedUrl) {
      const claimed = queue.claimNextTaskForDb(item.slug, Date.now());
      assert.equal(claimed?.task_id, queued.task_id);
      assert.equal(claimed?.requested_url, item.directQueuedUrl);
    } else {
      const status = queue.getLiteratureTaskStatus(queued.task_id);
      assert.equal(status?.db_slug, item.slug);
      assert.equal(status?.doc_id, queuedDocId);
      assert.equal(status?.status, "queued");
    }
  });
}

for (const item of bibliographicCases) {
  test(`${item.mcp} routes but honestly returns INVALID_ARGS wrong-tool diagnostic`, async () => {
    const { tools } = await loadRuntimeModules();
    const row = contract().commands.find((command: any) => command.mcp_name === item.mcp);
    assert.equal(row?.cli_name, item.cli);
    assert.equal(row?.ts_export, item.tsExport);
    assert.deepEqual(row?.required_args, ["doc_id"]);
    assert.equal(row?.optional_args, undefined);
    assert.equal(typeof (tools as any)[item.tsExport], "function");

    const spec = tools.listMcpTools().find((tool) => tool.name === item.mcp) as any;
    assert.ok(spec, `${item.mcp} missing from listMcpTools`);
    assert.equal(spec.inputSchema?.properties?.doc_id?.type, "string");
    assert.equal(spec.inputSchema?.properties?.pdf_url, undefined);
    assert.deepEqual(spec.inputSchema?.required, ["doc_id"]);

    const result: any = await tools.callMcpTool(item.mcp, { doc_id: `${item.slug}-record` });
    assert.equal(result.ok, false);
    assert.equal(result.errorCode, "INVALID_ARGS");
    assert.equal(result.message, item.message);
    assert.equal(result.path, null);
    assert.equal(result.sha256, null);
  });
}

test("phase8 bucket E literature drivers self-register", async () => {
  const { drivers: { getLiteratureDriver } } = await loadRuntimeModules();
  for (const item of [...paywalledCases, ...bibliographicCases]) {
    assert.equal(typeof getLiteratureDriver(item.slug), "function", `${item.slug} driver missing`);
  }
});
