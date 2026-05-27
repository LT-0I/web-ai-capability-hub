import test from "node:test";
import assert from "node:assert/strict";
import { resolveUnpaywallOaPdf } from "../../src/mcp/submcp/literature/unpaywall";

const originalFetch = globalThis.fetch;

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

test("resolveUnpaywallOaPdf returns best OA PDF URL metadata", async () => {
  let requested = "";
  globalThis.fetch = (async (url: string | URL | Request) => {
    requested = String(url);
    return jsonResponse({
      best_oa_location: {
        url_for_pdf: "https://repo.example/paper.pdf",
        url: "https://repo.example/landing",
        host_type: "repository",
        license: "cc-by",
        version: "acceptedVersion"
      }
    });
  }) as any;

  const result = await resolveUnpaywallOaPdf("10.1234/example", "unit@example.test");
  assert.equal(result.url, "https://repo.example/paper.pdf");
  assert.equal(result.host_type, "repository");
  assert.equal(result.license, "cc-by");
  assert.equal(result.version, "acceptedVersion");
  assert.match(requested, /api\.unpaywall\.org\/v2\/10\.1234%2Fexample\?email=unit%40example\.test/);
});

test("resolveUnpaywallOaPdf maps 404 DOI misses to null result", async () => {
  globalThis.fetch = (async () => jsonResponse({ message: "not found" }, 404)) as any;

  assert.deepEqual(await resolveUnpaywallOaPdf("10.1234/missing", "unit@example.test"), {
    url: null,
    host_type: null,
    license: null,
    version: null
  });
});

test("resolveUnpaywallOaPdf throws RPC_RATE_LIMITED on 429", async () => {
  globalThis.fetch = (async () => jsonResponse({ error: "rate" }, 429)) as any;

  await assert.rejects(
    () => resolveUnpaywallOaPdf("10.1234/rate", "unit@example.test"),
    (error: any) => error?.errorCode === "RPC_RATE_LIMITED"
  );
});

test("resolveUnpaywallOaPdf throws INVALID_JSON on malformed JSON", async () => {
  globalThis.fetch = (async () => new Response("{not-json", {
    status: 200,
    headers: { "content-type": "application/json" }
  })) as any;

  await assert.rejects(
    () => resolveUnpaywallOaPdf("10.1234/bad-json", "unit@example.test"),
    (error: any) => error?.errorCode === "INVALID_JSON"
  );
});
