const test = require("node:test");
const assert = require("node:assert/strict");
import { listAdapters, adapterForUrl } from "../src/adapters/adapterLoader";

test("adapter loader validates required adapters", () => {
  const adapters = listAdapters();
  const ids = adapters.map((adapter) => adapter.id).sort();
  assert.deepEqual(ids, ["chatgpt", "claude", "cnki", "gemini", "ieee-xplore", "pubmed", "research-generic", "scopus", "web-of-science"]);
  assert.equal(adapterForUrl("https://chatgpt.com/c/123", adapters)?.id, "chatgpt");
  assert.equal(adapterForUrl("https://example-database.test/search", adapters)?.id, "research-generic");
  assert.equal(adapterForUrl("https://pubmed.ncbi.nlm.nih.gov/?term=uav", adapters)?.id, "pubmed");
  assert.equal(adapterForUrl("https://kns.cnki.net/kns8s/AdvSearch", adapters)?.id, "cnki");
});

test("research database adapters expose source registry fields and capability hints", () => {
  const adapters = listAdapters();
  const pubmed = adapters.find((adapter) => adapter.id === "pubmed") as any;
  assert.equal(pubmed.name, "PubMed");
  assert.equal(pubmed.base_url, "https://pubmed.ncbi.nlm.nih.gov/");
  assert.equal(pubmed.search_url, "https://pubmed.ncbi.nlm.nih.gov/?term={query}");
  assert.equal(pubmed.login_mode, "public");
  assert.equal(pubmed.ip_login, false);
  assert.deepEqual(pubmed.capability_hints.search_input.selectors, ["input[name='term']"]);
  assert.deepEqual(pubmed.capability_hints.filter_panel.selectors, []);
  assert.deepEqual(pubmed.capability_hints.export_button.selectors, []);

  const cnki = adapters.find((adapter) => adapter.id === "cnki") as any;
  assert.equal(cnki.name, "CNKI");
  assert.equal(cnki.base_url, "https://www.cnki.net/");
  assert.equal(cnki.search_url, "https://www.cnki.net/");
  assert.equal(cnki.login_mode, "licensed_ip_or_institutional");
  assert.equal(cnki.ip_login, true);
  assert.deepEqual(cnki.capability_hints.search_input.selectors, ["textarea", "input#txt_search", "input[type='text']", "input[name='txt_1_sel']"]);
});
