const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
import { probeUrl } from "../src/maintenance/probe";

async function withServer(body: string, fn: (url: string) => Promise<void>, statusCode = 200): Promise<void> {
  const server = http.createServer((req: any, res: any) => {
    res.statusCode = statusCode;
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.end(body);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as any).port;
  try {
    await fn(`http://127.0.0.1:${port}/`);
  } finally {
    server.close();
  }
}

test("probeUrl classifies blocked marker pages", async () => {
  await withServer("<title>Access Denied</title><p>captcha required</p>", async (url) => {
    const result = await probeUrl(url, { timeoutMs: 1000 });
    assert.equal(result.status, "blocked");
    assert.equal(result.httpStatus, 403);
    assert.equal(result.title, "Access Denied");
  }, 403);
});

test("probeUrl classifies institutional login wall pages", async () => {
  await withServer("<title>Scopus</title><a>Sign in through your institution</a>", async (url) => {
    const result = await probeUrl(url, { timeoutMs: 1000 });
    assert.equal(result.status, "reachable_login_wall");
    assert.equal(result.httpStatus, 200);
    assert.equal(result.title, "Scopus");
  });
});

test("probeUrl classifies known portal pages as reachable", async () => {
  await withServer("<title>PubMed</title><main>Search biomedical literature at NCBI</main>", async (url) => {
    const result = await probeUrl(url, { timeoutMs: 1000 });
    assert.equal(result.status, "reachable");
    assert.equal(result.httpStatus, 200);
    assert.equal(result.title, "PubMed");
  });
});
