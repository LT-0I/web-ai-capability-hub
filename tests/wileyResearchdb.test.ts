const test = require("node:test");
const assert = require("node:assert/strict");
import { buildWileySearchUrl, buildWileyFilterUrl, buildWileyCitationUrl, parseWileyResultCount, parseWileyItemsFromHtml, parseWileyItemsFromVisibleText } from "../src/mcp/researchdb/wiley/flow";

test("Wiley URL builders preserve verified Literatum query, facet, and citation parameters", () => {
  assert.equal(
    buildWileySearchUrl({ query: "unmanned aerial vehicle", area: "Title", query2: "control", area2: "AllField", page_size: 10 }),
    "https://onlinelibrary.wiley.com/action/doSearch?field1=Title&text1=unmanned+aerial+vehicle&field2=AllField&text2=control&field3=AllField&text3=&publication=&Ppub=&startPage=0&pageSize=10"
  );
  const filter = buildWileyFilterUrl({ query: "unmanned aerial vehicle", area: "Title", query2: "control", after_year: 2022, before_year: 2026, series_key: "iet-cmu", concept_id: "Soil", access: true, page_size: 10 });
  assert.equal(filter, "https://onlinelibrary.wiley.com/action/doSearch?field1=Title&text1=unmanned+aerial+vehicle&field2=AllField&text2=control&field3=AllField&text3=&publication=&Ppub=&startPage=0&pageSize=10&AfterYear=2022&BeforeYear=2026&SeriesKey=iet-cmu&ConceptID=Soil&access=on");
  assert.equal(buildWileyCitationUrl("10.1049/cmu2.12107"), "https://onlinelibrary.wiley.com/action/showCitFormats?doi=10.1049%2Fcmu2.12107");
});

test("Wiley result/count parsing works from deterministic fixture DOM", () => {
  const html = `
    <html><head><title>[Publication Title: unmanned aerial vehicle] AND [Articles & Chapters: control] : Search</title></head><body>
      <nav><a>Articles &amp; Chapters (770)</a><a>Journals: 668 results</a><a>Books: 101 results</a></nav>
      <div class="search__item">
        <h3><a>A survey on unmanned aerial vehicle relaying networks</a></h3>
        <span>Waleed Ejaz, Taimoor Q. Duong and Markku Juntti</span>
        <span>22 March 2022</span><em>IET Communications</em>
        <a href="https://doi.org/10.1049/cmu2.12107">https://doi.org/10.1049/cmu2.12107</a>
      </div>
      <div class="search__item">
        <h3><a>Robust control for unmanned aerial vehicle systems</a></h3>
        <span>Jane Doe and John Roe</span><span>2024</span><em>Journal of Field Robotics</em>
        <a>https://doi.org/10.1002/rob.22001</a>
      </div>
    </body></html>`;
  assert.equal(parseWileyResultCount("Articles & Chapters (770) Journals: 668 results Books: 101 results"), 770);
  const items = parseWileyItemsFromHtml(html);
  assert.equal(items.length, 2);
  assert.equal(items[0].title, "A survey on unmanned aerial vehicle relaying networks");
  assert.equal(items[0].doi, "10.1049/cmu2.12107");
  assert.equal(items[0].year, 2022);
  assert.equal(items[1].doi, "10.1002/rob.22001");
});

test("Wiley visible-text fallback extracts items without live network", () => {
  const text = "Articles & Chapters (770) Full Access A survey on unmanned aerial vehicle relaying networks Waleed Ejaz, Taimoor Q. Duong and Markku Juntti 22 March 2022 IET Communications https://doi.org/10.1049/cmu2.12107 Download PDF";
  const items = parseWileyItemsFromVisibleText(text);
  assert.equal(items[0].doi, "10.1049/cmu2.12107");
  assert.equal(items[0].year, 2022);
});
