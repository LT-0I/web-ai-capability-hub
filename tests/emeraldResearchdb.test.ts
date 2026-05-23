const test = require("node:test");
const assert = require("node:assert/strict");
import { buildEmeraldSearchUrl, buildEmeraldFilterUrl, buildEmeraldArticleUrl, buildEmeraldCitationDownloadUrl, parseEmeraldResultCount, parseEmeraldItemsFromHtml, parseEmeraldItemsFromVisibleText, parseEmeraldResourceIdFromHtml } from "../src/handlers/researchdb/legacy/emerald";

test("Emerald URL builders preserve verified Silverchair search, refine, article, and citation contracts", () => {
  assert.equal(
    buildEmeraldSearchUrl({ query: "unmanned aerial vehicle", mode: "Any", page_size: 20 }),
    "https://www.emerald.com/search-results?q=unmanned+aerial+vehicle&hd=advancedAny&searchType=advanced&page=1&pageSize=20"
  );
  assert.equal(
    buildEmeraldFilterUrl({ query: "unmanned aerial vehicle", content_type: "Journal Articles" }),
    "https://www.emerald.com/search-results?q=unmanned+aerial+vehicle&hd=advancedAny&searchType=advanced&page=1&f_ContentType=Journal+Articles"
  );
  assert.equal(buildEmeraldArticleUrl("10.1108/AEAT-03-2025-0123"), "https://www.emerald.com/insight/content/doi/10.1108/AEAT-03-2025-0123/full/html");
  assert.equal(buildEmeraldCitationDownloadUrl("1323069", "bibtex"), "https://www.emerald.com/Citation/Download?resourceId=1323069&resourceType=3&citationFormat=2");
  assert.equal(buildEmeraldCitationDownloadUrl("1323069", "ris"), "https://www.emerald.com/Citation/Download?resourceId=1323069&resourceType=3&citationFormat=0");
});

test("Emerald result/count parsing works from deterministic fixture DOM", () => {
  const html = `
    <html><body>
      <span>1-20 of 113657 Search Results for unmanned aerial vehicle</span>
      <div class="search-result">
        <h4><a>Design and flight test of a UAV inspection system</a></h4>
        <span>Jane Smith, Wei Zhang</span>
        <span>Journal: Aircraft Engineering and Aerospace Technology Publisher: Emerald Publishing</span>
        <span>Published 2025 https://doi.org/10.1108/AEAT-03-2025-0123</span>
      </div>
      <div class="search-result">
        <h4><a>Autonomous unmanned aerial vehicle routing</a></h4>
        <span>A. Jones and B. Li</span>
        <span>Journal: Industrial Robot</span>
        <span>Published 2024 https://doi.org/10.1108/IR-01-2024-0001</span>
      </div>
    </body></html>`;
  assert.equal(parseEmeraldResultCount("Showing 1-20 of 113,657 Search Results for unmanned aerial vehicle"), 113657);
  const items = parseEmeraldItemsFromHtml(html);
  assert.equal(items.length, 2);
  assert.equal(items[0].title, "Design and flight test of a UAV inspection system");
  assert.equal(items[0].doi, "10.1108/AEAT-03-2025-0123");
  assert.equal(items[0].publication, "Aircraft Engineering and Aerospace Technology");
  assert.equal(items[0].year, 2025);
  assert.equal(items[1].doi, "10.1108/IR-01-2024-0001");
});

test("Emerald visible-text and resourceId fallbacks are deterministic", () => {
  const text = "1-20 of 70,111 Search Results for unmanned aerial vehicle Sort Order Select Journal Articles Design and flight test of a UAV inspection system Jane Smith, Wei Zhang Journal: Aircraft Engineering and Aerospace Technology Publisher: Emerald Publishing Published 2025 https://doi.org/10.1108/AEAT-03-2025-0123 View Article";
  const items = parseEmeraldItemsFromVisibleText(text);
  assert.equal(items[0].doi, "10.1108/AEAT-03-2025-0123");
  assert.equal(items[0].publication, "Aircraft Engineering and Aerospace Technology");
  assert.equal(items[0].year, 2025);
  const articleHtml = `<a href="/Citation/Download?resourceId=1323069&amp;resourceType=3&amp;citationFormat=2">BibTex</a>`;
  assert.equal(parseEmeraldResourceIdFromHtml(articleHtml), "1323069");
});
