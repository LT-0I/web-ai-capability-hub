const test = require("node:test");
const assert = require("node:assert/strict");
import { buildWosAdvancedSearchUrl, parseWosResultCount, parseWosItemsFromHtml, parseWosItemsFromVisibleText } from "../src/mcp/researchdb/wos/flow";

test("Web of Science URL builder preserves verified advanced-search route and optional query metadata", () => {
  assert.equal(buildWosAdvancedSearchUrl(), "https://www.webofscience.com/wos/woscc/advanced-search");
  assert.equal(
    buildWosAdvancedSearchUrl({ query: 'TS=("unmanned aerial vehicle" AND "reinforcement learning")', page_size: 50 }),
    "https://www.webofscience.com/wos/woscc/advanced-search?query=TS%3D%28%22unmanned+aerial+vehicle%22+AND+%22reinforcement+learning%22%29&pageSize=50"
  );
});

test("Web of Science result count parsing works from deterministic title and body fixtures", () => {
  assert.equal(parseWosResultCount('TS=("unmanned aerial vehicle" AND "reinforcement learning") – 1,916 – Web of Science Core Collection'), 1916);
  assert.equal(parseWosResultCount("Refine Results 1,299 results from Web of Science Core Collection Article (Document Types)"), 1299);
});

test("Web of Science HTML item parser extracts deterministic summary records", () => {
  const html = `
    <html><body>
      <app-summary-record>
        <a href="/wos/woscc/full-record/WOS:0001">Reinforcement learning for unmanned aerial vehicle path planning</a>
        <div>By: Zhang, Wei; Li, Ming</div>
        <span class="source-title">Aerospace Science and Technology</span>
        <div>Published: 2025 DOI: 10.1016/j.ast.2025.109999 Document Type: Article</div>
      </app-summary-record>
      <app-summary-record>
        <a href="/wos/woscc/full-record/WOS:0002">Multi-agent control of UAV swarms with deep reinforcement learning</a>
        <div>By: Smith, Jane; Doe, John</div>
        <div>Source: IEEE ACCESS Published: 2024 DOI: 10.1109/ACCESS.2024.1234567</div>
      </app-summary-record>
    </body></html>`;
  const items = parseWosItemsFromHtml(html);
  assert.equal(items.length, 2);
  assert.equal(items[0].title, "Reinforcement learning for unmanned aerial vehicle path planning");
  assert.equal(items[0].doi, "10.1016/j.ast.2025.109999");
  assert.equal(items[0].year, 2025);
  assert.equal(items[1].doi, "10.1109/ACCESS.2024.1234567");
});

test("Web of Science visible-text fallback extracts deterministic result rows", () => {
  const text = 'Sort by: Relevance 1. Reinforcement learning for unmanned aerial vehicle path planning By: Zhang, Wei; Li, Ming Source: Aerospace Science and Technology Published: 2025 DOI: 10.1016/j.ast.2025.109999 2. Multi-agent control of UAV swarms with deep reinforcement learning By: Smith, Jane; Doe, John Source: IEEE ACCESS Published: 2024 DOI: 10.1109/ACCESS.2024.1234567';
  const items = parseWosItemsFromVisibleText(text);
  assert.equal(items.length, 2);
  assert.equal(items[0].authors[0], "Zhang, Wei");
  assert.equal(items[0].year, 2025);
  assert.equal(items[1].source, "IEEE ACCESS");
});
