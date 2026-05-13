const test = require("node:test");
const assert = require("node:assert/strict");
import { listAdapters, adapterForUrl } from "../src/adapters/adapterLoader";
import { chatgptAdapter } from "../src/adapters/web-ai/chatgpt";
import { claudeAdapter } from "../src/adapters/web-ai/claude";

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


function anchorNames(adapter: { semanticAnchors: Array<{ id: string; names: string[] }> }, id: string): string[] {
  const anchor = adapter.semanticAnchors.find((item) => item.id === id);
  if (!anchor) throw new Error(`missing semantic anchor ${id}`);
  return anchor.names;
}

function targetPatterns(adapter: any, id: string): string[] {
  const target = adapter.semanticTargets.find((item: any) => item.id === id);
  if (!target) throw new Error(`missing semantic target ${id}`);
  return target.namePatterns;
}

test("ChatGPT web adapter semantic anchors include English and Chinese names", () => {
  assert.deepEqual(anchorNames(chatgptAdapter, "sendButton").filter((name) => ["send", "发送"].includes(name)), ["send", "发送"]);
  assert.ok(anchorNames(chatgptAdapter, "promptBox").includes("询问 ChatGPT"));
  assert.ok(anchorNames(chatgptAdapter, "cancel").includes("取消"));
  assert.ok(anchorNames(chatgptAdapter, "close").includes("关闭"));
});

test("Claude web adapter semantic anchors include English and Chinese names", () => {
  assert.deepEqual(anchorNames(claudeAdapter, "sendButton").filter((name) => ["send", "发送"].includes(name)), ["send", "发送"]);
  assert.ok(anchorNames(claudeAdapter, "promptBox").includes("和 Claude 对话"));
  assert.ok(anchorNames(claudeAdapter, "projectSelector").includes("项目"));
  assert.ok(anchorNames(claudeAdapter, "close").includes("关闭"));
});

test("ChatGPT config semantic targets include English and Chinese name patterns", () => {
  const chatgpt = listAdapters().find((adapter) => adapter.id === "chatgpt") as any;
  assert.deepEqual(targetPatterns(chatgpt, "sendButton").filter((name) => ["send", "发送"].includes(name)), ["send", "发送"]);
  assert.ok(targetPatterns(chatgpt, "promptBox").includes("询问 ChatGPT"));
  assert.ok(targetPatterns(chatgpt, "modelSelector").includes("切换模型"));
  assert.ok(targetPatterns(chatgpt, "close").includes("关闭"));
});

test("Claude config semantic targets include English and Chinese name patterns", () => {
  const claude = listAdapters().find((adapter) => adapter.id === "claude") as any;
  assert.deepEqual(targetPatterns(claude, "sendButton").filter((name) => ["send", "发送"].includes(name)), ["send", "发送"]);
  assert.ok(targetPatterns(claude, "promptBox").includes("和 Claude 对话"));
  assert.ok(targetPatterns(claude, "artifactPanel").includes("工件"));
  assert.ok(targetPatterns(claude, "close").includes("关闭"));
});
