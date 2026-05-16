const test = require("node:test");
const assert = require("node:assert/strict");
import { buildDegruyterLuceneQuery, buildDegruyterSearchUrl, buildDegruyterFilterUrl, buildDegruyterDocumentUrl, buildDegruyterCitationUrl, parseDegruyterResultCount, parseDegruyterItemsFromHtml, parseDegruyterItemsFromVisibleText } from "../src/mcp/researchdb/degruyter/flow";

test("De Gruyter URL builders preserve verified advanced-search replay and facet parameters", () => {
  assert.equal(
    buildDegruyterLuceneQuery({ title: "unmanned aerial vehicle", family_name: "Zhang", min_pub_year: 2018 }),
    "(title:(unmanned aerial vehicle) AND familyName:(Zhang)) AND pubDate:[2018-01-01 TO *]"
  );
  const search = buildDegruyterSearchUrl({ title: "unmanned aerial vehicle", min_pub_year: 2018, page_size: 10 });
  assert.equal(search, "https://www.degruyterbrill.com/search?query=title%3A%28unmanned+aerial+vehicle%29+AND+pubDate%3A%5B2018-01-01+TO+*%5D&pageSize=10&sortBy=relevance&documentVisibility=available");
  const filter = buildDegruyterFilterUrl({ title: "unmanned aerial vehicle", min_pub_year: 2018, document_type_facet: "article", language: "English" });
  assert.equal(filter, "https://www.degruyterbrill.com/search?query=title%3A%28unmanned+aerial+vehicle%29+AND+pubDate%3A%5B2018-01-01+TO+*%5D&sortBy=relevance&documentVisibility=available&documentTypeFacet=article&language=English");
  assert.equal(buildDegruyterDocumentUrl("10.1515/secm-2025-0073"), "https://www.degruyterbrill.com/document/doi/10.1515/secm-2025-0073/html");
  assert.equal(buildDegruyterCitationUrl("10.1515/secm-2025-0073", "ris"), "https://www.degruyterbrill.com/document/doi/10.1515/secm-2025-0073/machineReadableCitation/RIS");
});

test("De Gruyter count and item parsing works from deterministic fixture DOM", () => {
  const html = `
    <html><body>
      <div class="searchInfo"><span>1</span> of <span>1</span> results for unmanned aerial vehicle</div>
      <div id="searchResultsItems">
        <div class="searchResult" data-doi="10.1515/secm-2025-0073">
          <h2><a href="/document/doi/10.1515/secm-2025-0073/html">Dynamic response of sandwich plates subject to underwater explosion</a></h2>
          <div class="authors">Li Zhang, Ana Smith and Bo Wang</div>
          <span>Published 2025</span><span>Journal: Science and Engineering of Composite Materials</span>
          <a href="https://doi.org/10.1515/secm-2025-0073">DOI</a>
        </div>
      </div>
    </body></html>`;
  assert.equal(parseDegruyterResultCount("1 of 1 results for title:(unmanned aerial vehicle)"), 1);
  const items = parseDegruyterItemsFromHtml(html);
  assert.equal(items.length, 1);
  assert.equal(items[0].title, "Dynamic response of sandwich plates subject to underwater explosion");
  assert.equal(items[0].doi, "10.1515/secm-2025-0073");
  assert.equal(items[0].year, 2025);
  assert.equal(items[0].url, "https://www.degruyterbrill.com/document/doi/10.1515/secm-2025-0073/html");
});

test("De Gruyter visible-text fallback extracts DOI-backed items without live network", () => {
  const text = "5 of 5 results for title:(unmanned aerial vehicle) Filter Results Advanced control allocation for unmanned aerial vehicle Authors: Chen Zhang Published 2025 https://doi.org/10.1515/secm-2025-0073 HTML PDF";
  const items = parseDegruyterItemsFromVisibleText(text);
  assert.equal(items[0].doi, "10.1515/secm-2025-0073");
  assert.equal(items[0].year, 2025);
});
