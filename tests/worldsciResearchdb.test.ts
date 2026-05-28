const test = require("node:test");
const assert = require("node:assert/strict");
import { buildWorldsciSearchUrl, buildWorldsciFilterUrl, buildWorldsciCitationUrl, parseWorldsciResultCount, parseWorldsciItemsFromHtml, parseWorldsciItemsFromVisibleText } from "../src/handlers/researchdb/legacy/worldsci";

test("World Scientific URL builders preserve verified Literatum query, facet, and citation parameters", () => {
  assert.equal(
    buildWorldsciSearchUrl({ query: "unmanned aerial vehicle", area: "Title" }),
    "https://www.worldscientific.com/action/doSearch?field1=Title&text1=unmanned+aerial+vehicle&field2=AllField&text2=&publication=&Ppub="
  );
  const filter = buildWorldsciFilterUrl({ query: "unmanned aerial vehicle", area: "Title", content_item_type: "research-article", pub_type: "journal", after_year: 2020, before_year: 2026, contrib_raw: "Xin, Bin", concept_id: "130276", access: "open", sort_by: "downloaded" });
  assert.equal(filter, "https://www.worldscientific.com/action/doSearch?field1=Title&text1=unmanned+aerial+vehicle&field2=AllField&text2=&publication=&Ppub=&PubType=journal&ContentItemType=research-article&AfterYear=2020&BeforeYear=2026&ContribRaw=Xin%2C+Bin&ConceptID=130276&openAccess=true&sortBy=downloaded");
  assert.equal(buildWorldsciCitationUrl("10.1142/S2301385018500115"), "https://www.worldscientific.com/action/showCitFormats?doi=10.1142%2FS2301385018500115");
});

test("World Scientific result/count parsing works from deterministic fixture DOM", () => {
  const html = `
    <html><head><title>Publication Title: unmanned aerial vehicle : Search</title></head><body>
      <span class="result__count">124</span>
      <ul class="rlist rlist--inline">
        <li class="clearfix separator search__item">
          <h4 class="meta__title"><a href="/doi/10.1142/S2301385018500115">Collision Avoidance Design on Unmanned Aerial Vehicle in 3D Space</a></h4>
          <span class="hlFld-ContribAuthor">Yucong Lin, Xiaojun Wu and Bin Xin</span>
          <span>Unmanned Systems Vol. 6, No. 4 (2018)</span>
          <a href="/doi/10.1142/S2301385018500115">https://doi.org/10.1142/S2301385018500115</a>
        </li>
        <li class="clearfix separator search__item">
          <div class="meta__title"><a href="/doi/10.1142/S2301385024500012">UAV Swarm Collision Avoidance</a></div>
          <span>Jane Li and Qiang Wang</span><span>Unmanned Systems 2024</span>
          <a href="/doi/10.1142/S2301385024500012">doi</a>
        </li>
      </ul>
    </body></html>`;
  assert.equal(parseWorldsciResultCount("124"), 124);
  const items = parseWorldsciItemsFromHtml(html);
  assert.equal(items.length, 2);
  assert.equal(items[0].title, "Collision Avoidance Design on Unmanned Aerial Vehicle in 3D Space");
  assert.equal(items[0].doi, "10.1142/S2301385018500115");
  assert.equal(items[0].year, 2018);
  assert.equal(items[1].doi, "10.1142/S2301385024500012");
});

test("World Scientific visible-text fallback extracts DOI records without live network", () => {
  const text = "124 Export Citation Collision Avoidance Design on Unmanned Aerial Vehicle in 3D Space Yucong Lin and Xiaojun Wu Unmanned Systems Vol. 6, No. 4 (2018) https://doi.org/10.1142/S2301385018500115 PDF";
  const items = parseWorldsciItemsFromVisibleText(text);
  assert.equal(items[0].doi, "10.1142/S2301385018500115");
  assert.equal(items[0].year, 2018);
});

test("World Scientific IP-block page yields no spurious result items (honest-error precondition)", () => {
  const blockedHtml = `<html><body><h1>IP ADDRESS BLOCKED</h1><p>Your IP address has been blocked due to excessive site usage.</p></body></html>`;
  assert.equal(parseWorldsciItemsFromHtml(blockedHtml).length, 0);
  assert.equal(parseWorldsciItemsFromVisibleText("IP ADDRESS BLOCKED Your IP address has been blocked due to excessive site usage").length, 0);
});

test("World Scientific citation URL builder encodes the DOI slash for the export entry point", () => {
  assert.equal(
    buildWorldsciCitationUrl("10.1142/S2301385024500012"),
    "https://www.worldscientific.com/action/showCitFormats?doi=10.1142%2FS2301385024500012"
  );
});
