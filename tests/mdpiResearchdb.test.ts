const test = require("node:test");
const assert = require("node:assert/strict");
import { buildMdpiSearchUrl, buildMdpiFilterUrl, buildMdpiArticleUrl, parseMdpiResultCount, parseMdpiItemsFromHtml, parseMdpiItemsFromVisibleText } from "../src/handlers/researchdb/legacy/mdpi";

test("MDPI URL builders preserve verified GET search and facet parameters", () => {
  assert.equal(
    buildMdpiSearchUrl({ query: "unmanned aerial vehicle anti-jamming", journal: "drones", article_type: "research-article", year_from: 2020, year_to: 2025, view: "default" }),
    "https://www.mdpi.com/search?q=unmanned+aerial+vehicle+anti-jamming&journal=drones&article_type=research-article&year_from=2020&year_to=2025&view=default"
  );
  const filter = buildMdpiFilterUrl({ query: "unmanned aerial vehicle anti-jamming", journal: "drones", article_type: "research-article", year_from: 2020, year_to: 2025, view: "default", page_count: 50, sort: "pubdate", country: "CHINA" });
  assert.equal(filter, "https://www.mdpi.com/search?q=unmanned+aerial+vehicle+anti-jamming&journal=drones&article_type=research-article&year_from=2020&year_to=2025&view=default&sort=pubdate&page_count=50&countries=CHINA");
  assert.equal(buildMdpiArticleUrl({ article_path: "/2504-446X/8/10/548" }), "https://www.mdpi.com/2504-446X/8/10/548");
});

test("MDPI result/count parsing works from deterministic fixture DOM", () => {
  const html = `
    <html><body>
      <div>Search Results (2)</div>
      <div class="generic-item article-item">
        <input class="article-list-checkbox" name="articles_ids[]" value="1491574" />
        <a class="title-link" href="/2504-446X/8/10/548">Research on a High-Dynamics Acquisition Algorithm for New Binary Offset Carrier Signal in UAV Communication</a>
        <span>by Rui Zhang, Xiaoming Liu and Lei Wang</span>
        <span>Drones 2024, 8(10), 548</span>
        <span>https://doi.org/10.3390/drones8100548</span>
      </div>
      <div class="generic-item article-item">
        <input class="article-list-checkbox" name="articles_ids[]" value="1379523" />
        <a class="title-link" href="/2504-446X/7/9/415">Anti-Jamming UAV Communications with Reinforcement Learning</a>
        <span>by Yongfang Li and Tianyu Zhao</span>
        <span>Drones 2023, 7(9), 415</span>
        <span>doi:10.3390/drones7090415</span>
      </div>
    </body></html>`;
  assert.equal(parseMdpiResultCount("Search Results (1,234) Search Parameters"), 1234);
  const items = parseMdpiItemsFromHtml(html);
  assert.equal(items.length, 2);
  assert.equal(items[0].title, "Research on a High-Dynamics Acquisition Algorithm for New Binary Offset Carrier Signal in UAV Communication");
  assert.equal(items[0].article_path, "/2504-446X/8/10/548");
  assert.equal(items[0].article_id, "1491574");
  assert.equal(items[0].doi, "10.3390/drones8100548");
  assert.equal(items[0].journal, "Drones");
  assert.equal(items[0].year, 2024);
});

test("MDPI visible-text fallback extracts items without live network", () => {
  const text = "Search Results (2) Open AccessArticle Research on a High-Dynamics Acquisition Algorithm for New Binary Offset Carrier Signal in UAV Communication by Rui Zhang, Xiaoming Liu and Lei Wang Drones 2024, 8(10), 548 https://doi.org/10.3390/drones8100548 24 pages Open AccessArticle Anti-Jamming UAV Communications by Yongfang Li Drones 2023, 7(9), 415 https://doi.org/10.3390/drones7090415";
  const items = parseMdpiItemsFromVisibleText(text);
  assert.equal(items.length, 2);
  assert.equal(items[0].doi, "10.3390/drones8100548");
  assert.equal(items[0].year, 2024);
});
