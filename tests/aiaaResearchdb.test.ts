const test = require("node:test");
const assert = require("node:assert/strict");
import { buildAiaaSearchUrl, buildAiaaFilterUrl, buildAiaaCitationUrl, parseAiaaResultCount, parseAiaaItemsFromHtml, parseAiaaItemsFromVisibleText } from "../src/mcp/researchdb/aiaa/flow";

test("AIAA URL builders preserve verified Literatum query and facet parameters", () => {
  assert.equal(
    buildAiaaSearchUrl({ query: "hypersonic AND boundary layer transition", area: "AllField", page_size: 50 }),
    "https://arc.aiaa.org/action/doSearch?field1=AllField&text1=hypersonic+AND+boundary+layer+transition&pageSize=50"
  );
  const filter = buildAiaaFilterUrl({ query: "hypersonic", area: "Title", after_year: 2022, before_year: 2024, series_key: "6.asm", contrib_raw: "Yang, Vigor", concept_id: "134748", page_size: 20 });
  assert.equal(filter, "https://arc.aiaa.org/action/doSearch?field1=Title&text1=hypersonic&pageSize=20&AfterYear=2022&BeforeYear=2024&SeriesKey=6.asm&ContribRaw=Yang%2C+Vigor&ConceptID=134748");
  assert.equal(buildAiaaCitationUrl("10.2514/6.2019-0199"), "https://arc.aiaa.org/action/showCitFormats?doi=10.2514%2F6.2019-0199");
});

test("AIAA result/count parsing works from deterministic fixture DOM", () => {
  const html = `
    <html><head><title>[Publication Title: scramjet]</title></head><body>
      <h1>Search Results (1,778)</h1>
      <div class="search__item">
        <h4><a>Scramjet Operability and RDE Design for RDE Piloted Scramjet</a></h4>
        <span class="hlFld-ContribAuthor">Ryan I. Druss, Marc D. Polanka and Timothy Ombrello</span>
        <span>7-11 January 2019</span><em>AIAA Scitech 2019 Forum</em>
        <a href="https://doi.org/10.2514/6.2019-0199">https://doi.org/10.2514/6.2019-0199</a>
      </div>
      <div class="search__item">
        <h4><a>Noise Generated in a Scramjet Combustor</a></h4>
        <span>Ramprakash Ananthapadmanaban and David J. Mee</span>
        <span>8 April 2024</span><em>Journal of Spacecraft and Rockets</em>
        <a>https://doi.org/10.2514/1.A35779</a>
      </div>
    </body></html>`;
  assert.equal(parseAiaaResultCount("Search Results (1,778) Results: 1 - 20 of 1,778"), 1778);
  const items = parseAiaaItemsFromHtml(html);
  assert.equal(items.length, 2);
  assert.equal(items[0].title, "Scramjet Operability and RDE Design for RDE Piloted Scramjet");
  assert.equal(items[0].doi, "10.2514/6.2019-0199");
  assert.equal(items[0].year, 2019);
  assert.equal(items[1].doi, "10.2514/1.A35779");
});

test("AIAA visible-text fallback extracts items without live network", () => {
  const text = "Search Results (234) Results: 1 - 20 of 234 Full Access Scramjet Operability and RDE Design for RDE Piloted Scramjet Ryan I. Druss, Marc D. Polanka and Frederick Schauer 7-11 January 2019AIAA Scitech 2019 Forum https://doi.org/10.2514/6.2019-0199 First Page Read Now";
  const items = parseAiaaItemsFromVisibleText(text);
  assert.equal(items[0].doi, "10.2514/6.2019-0199");
  assert.equal(items[0].year, 2019);
});
