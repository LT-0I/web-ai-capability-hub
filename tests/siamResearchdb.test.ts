const test = require("node:test");
const assert = require("node:assert/strict");
import { buildSiamSearchUrl, buildSiamFilterUrl, buildSiamCitationUrl, parseSiamResultCount, parseSiamItemsFromHtml, parseSiamItemsFromVisibleText } from "../src/handlers/researchdb/legacy/siam";

test("SIAM URL builders preserve verified Literatum query and facet parameters", () => {
  assert.equal(
    buildSiamSearchUrl({ query: "optimization AND convergence", area: "Title", page_size: 50 }),
    "https://epubs.siam.org/action/doSearch?field1=Title&text1=optimization+AND+convergence&pageSize=50"
  );
  const filter = buildSiamFilterUrl({ query: "optimization AND convergence", area: "Title", after_year: 2022, before_year: 2024, pub_type: "103", series_key: "sjope8", contrib_raw: "Allmaras, Steven", concept_id: "abc123", page_size: 20 });
  assert.equal(filter, "https://epubs.siam.org/action/doSearch?field1=Title&text1=optimization+AND+convergence&pageSize=20&AfterYear=2022&BeforeYear=2024&PubType=103&SeriesKey=sjope8&ContribRaw=Allmaras%2C+Steven&ConceptID=abc123");
  assert.equal(buildSiamCitationUrl("10.1137/20M1338721"), "https://epubs.siam.org/action/showCitFormats?doi=10.1137%2F20M1338721");
});

test("SIAM result/count parsing works from deterministic fixture DOM", () => {
  const html = `
    <html><body>
      <div class="result__count">15</div>
      <ul class="rlist search-result__body items-results">
        <li class="search__item">
          <input name="doi" class="issue-Item__checkbox" value="10.1137/20M1338721" />
          <h5><a href="/doi/10.1137/20M1338721">Convergence of Anisotropic Mesh Adaptation via Metric Optimization</a></h5>
          <span class="hlFld-ContribAuthor">Steven Allmaras and Dimitri J. Mavriplis</span>
          <span>2022</span><em>SIAM Journal on Numerical Analysis</em>
        </li>
        <li>
          <a href="/doi/10.1137/21M1412345">An Optimization Method for Convergent Algorithms</a>
          <span>Jane Doe, John Roe</span><span>2024</span><em>SIAM Journal on Optimization</em>
        </li>
      </ul>
    </body></html>`;
  assert.equal(parseSiamResultCount("15"), 15);
  assert.equal(parseSiamResultCount("Results: 1 - 15 of 15"), 15);
  const items = parseSiamItemsFromHtml(html);
  assert.equal(items.length, 2);
  assert.equal(items[0].title, "Convergence of Anisotropic Mesh Adaptation via Metric Optimization");
  assert.equal(items[0].doi, "10.1137/20M1338721");
  assert.equal(items[0].year, 2022);
  assert.equal(items[1].journal, "SIAM Journal on Optimization");
});

test("SIAM visible-text fallback extracts items without live network", () => {
  const text = "Results: 1 - 15 of 15 Convergence of Anisotropic Mesh Adaptation via Metric Optimization Steven Allmaras and Dimitri J. Mavriplis 2022 SIAM Journal on Numerical Analysis https://doi.org/10.1137/20M1338721 First Page Read Now";
  const items = parseSiamItemsFromVisibleText(text);
  assert.equal(items[0].doi, "10.1137/20M1338721");
  assert.equal(items[0].year, 2022);
});
