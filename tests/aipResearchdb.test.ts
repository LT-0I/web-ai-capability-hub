const test = require("node:test");
const assert = require("node:assert/strict");
import { buildAipSearchUrl, buildAipFilterUrl, buildAipCitationDownloadUrl, parseAipResultCount, parseAipItemsFromHtml, parseAipItemsFromVisibleText } from "../src/mcp/researchdb/aip/flow";

test("AIP URL builders preserve verified Silverchair search, f_* refine, and citation contracts", () => {
  assert.equal(
    buildAipSearchUrl({ query: "(unmanned aerial vehicle) AND (aerodynamics)", page_size: 20 }),
    "https://pubs.aip.org/search-results?page=1&q=%28unmanned+aerial+vehicle%29+AND+%28aerodynamics%29&pageSize=20"
  );
  assert.equal(
    buildAipFilterUrl({ query: "unmanned aerial vehicle", journal: "Physics of Fluids" }),
    "https://pubs.aip.org/search-results?page=1&q=unmanned+aerial+vehicle&fl_SiteID=1&f_JournalDisplayName=Physics+of+Fluids"
  );
  assert.equal(
    buildAipFilterUrl({ query: "unmanned aerial vehicle", content_type: "Journal Articles", from_date: "2026/01/01", to_date: "2026/12/31" }),
    "https://pubs.aip.org/search-results?page=1&q=unmanned+aerial+vehicle&fl_SiteID=1&f_ContentType=Journal+Articles&rg_PublicationDate=2026%2F01%2F01-2026%2F12%2F31"
  );
  assert.equal(buildAipCitationDownloadUrl("3388419", "bibtex"), "https://pubs.aip.org/Citation/Download?resourceId=3388419&resourceType=3&citationFormat=2");
  assert.equal(buildAipCitationDownloadUrl("3388419", "ris"), "https://pubs.aip.org/Citation/Download?resourceId=3388419&resourceType=3&citationFormat=0");
});

test("AIP result/count parsing works from deterministic fixture DOM", () => {
  const html = `
    <html><body>
      <span>1-20 of 785 Search Results for (unmanned aerial vehicle) AND (aerodynamics)</span>
      <div class="al-search-result">
        <h4><a href="/aip/pof/article/38/4/045156/3388419/Numerical-study-of-coupled-sidewall-crosswind">Numerical study of coupled sidewall–crosswind effects on hovering unmanned aerial vehicle rotors</a></h4>
        <span>Jie Wang, Wei Zhang</span>
        <span>Journal: Physics of Fluids Publisher: AIP Publishing Article Type: Research Article</span>
        <span>Published Online: April 1, 2026 https://doi.org/10.1063/5.0326126</span>
      </div>
      <div class="al-search-result">
        <h4><a href="/aip/apl/article/120/1/010101/1234567/UAV-flow-control">UAV flow control using synthetic jets</a></h4>
        <span>A. Smith and B. Li</span>
        <span>Journal: Applied Physics Letters Publisher: AIP Publishing</span>
        <span>Published 2024 https://doi.org/10.1063/5.0123456</span>
      </div>
    </body></html>`;
  assert.equal(parseAipResultCount("Availability Available 1-20 of 2,377 Search Results for unmanned aerial vehicle"), 2377);
  const items = parseAipItemsFromHtml(html);
  assert.equal(items.length, 2);
  assert.equal(items[0].title, "Numerical study of coupled sidewall–crosswind effects on hovering unmanned aerial vehicle rotors");
  assert.equal(items[0].doi, "10.1063/5.0326126");
  assert.equal(items[0].publication, "Physics of Fluids");
  assert.equal(items[0].year, 2026);
  assert.equal(items[0].resource_id, "3388419");
  assert.equal(items[1].doi, "10.1063/5.0123456");
});

test("AIP visible-text fallback extracts DOI records without live network", () => {
  const text = "1-20 of 785 Search Results for (unmanned aerial vehicle) AND (aerodynamics) Save search Sort by Sort Order Select JOURNAL ARTICLES Numerical study of coupled sidewall–crosswind effects on hovering unmanned aerial vehicle rotors Free Jie Wang, Wei Zhang Journal: Physics of Fluids Publisher: AIP Publishing Article Type: Research Article Physics of Fluids 38, 045156 (2026). https://doi.org/10.1063/5.0326126 Published Online: April 1, 2026 View Article";
  const items = parseAipItemsFromVisibleText(text);
  assert.equal(items[0].title, "Numerical study of coupled sidewall–crosswind effects on hovering unmanned aerial vehicle rotors");
  assert.equal(items[0].publication, "Physics of Fluids");
  assert.equal(items[0].doi, "10.1063/5.0326126");
  assert.equal(items[0].year, 2026);
});
