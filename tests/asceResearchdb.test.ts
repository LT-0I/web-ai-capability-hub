const test = require("node:test");
const assert = require("node:assert/strict");
import { buildAsceSearchUrl, buildAsceFilterUrl, buildAsceCitationUrl, parseAsceResultCount, parseAsceItemsFromHtml, parseAsceItemsFromVisibleText } from "../src/handlers/researchdb/legacy/asce";

test("ASCE URL builders preserve verified Atypon query, facet, and citation parameters", () => {
  assert.equal(
    buildAsceSearchUrl({ query: "bridge fatigue", query2: "steel girder", area: "AllField", area2: "AllField", page_size: 20 }),
    "https://ascelibrary.org/action/doSearch?field1=AllField&text1=bridge+fatigue&field2=AllField&text2=steel+girder&ConceptID=&publication=&Ppub=&pageSize=20"
  );
  const filter = buildAsceFilterUrl({ query: "bridge fatigue", query2: "steel girder", content_item_type: "research-article", contrib_raw: "Frangopol, Dan M", concept_id: "12345", after_year: 2018, before_year: 2024 });
  assert.equal(filter, "https://ascelibrary.org/action/doSearch?field1=AllField&text1=bridge+fatigue&field2=AllField&text2=steel+girder&ConceptID=12345&publication=&Ppub=&AfterYear=2018&BeforeYear=2024&ContentItemType=research-article&ContribRaw=Frangopol%2C+Dan+M");
  assert.equal(buildAsceCitationUrl("10.1061/(ASCE)AS.1943-5525.0000913"), "https://ascelibrary.org/action/showCitFormats?doi=10.1061%2F%28ASCE%29AS.1943-5525.0000913");
});

test("ASCE result/count parsing works from deterministic fixture DOM", () => {
  const html = `
    <html><body>
      <div class="search__item">
        <h4><a href="/doi/10.1061/%28ASCE%29AS.1943-5525.0000913">Truck Weight Limit for Simply Supported Steel Girder Bridges Based on Bridge Fatigue Reliability</a></h4>
        <span>Wei Wang, Lu Deng, Xuhui He, C. S. Cai and Tao Bi</span>
        <span>Jul 6, 2018</span><em>Journal of Aerospace Engineering</em>
      </div>
      <div class="search__item">
        <h4><a href="/doi/10.1061/%28ASCE%291084-0702%282000%295%3A1%2858%29">Simplified Inelastic Design of Steel Girder Bridges</a></h4>
        <span>Michael G. Barker, Bryan A. Hartnagel, Charles G. Schilling and Burl E. Dishongh</span>
        <span>Feb 1, 2000</span><em>Journal of Bridge Engineering</em>
      </div>
    </body></html>`;
  assert.equal(parseAsceResultCount("ARTICLE TYPE Technical Paper 1808 Chapters/Proceedings Papers 461 Discussion 105 Case Study 67 Editor's Note 58 AUTHOR Frangopol, Dan M 37"), 2499);
  assert.equal(parseAsceResultCount("1 - 20 of 2,652 results for bridge fatigue AND steel girder"), 2652);
  const items = parseAsceItemsFromHtml(html);
  assert.equal(items.length, 2);
  assert.equal(items[0].title, "Truck Weight Limit for Simply Supported Steel Girder Bridges Based on Bridge Fatigue Reliability");
  assert.equal(items[0].doi, "10.1061/(ASCE)AS.1943-5525.0000913");
  assert.equal(items[0].year, 2018);
  assert.equal(items[1].doi, "10.1061/(ASCE)1084-0702(2000)5:1(58)");
});

test("ASCE visible-text fallback extracts fixture items without live network", () => {
  const text = "1 - 20of1808result forbridge fatigue AND steel girder FULL ACCESSTechnical PapersJul 6, 2018 Truck Weight Limit for Simply Supported Steel Girder Bridges Based on Bridge Fatigue Reliability Wei Wang , Lu Deng , Xuhui He , C. S. Cai and Tao Bi Journal of Aerospace EngineeringVolume 31, Issue 6 https://doi.org/10.1061/(ASCE)AS.1943-5525.0000913 Abstract PDF";
  assert.equal(parseAsceResultCount(text), 1808);
  const items = parseAsceItemsFromVisibleText(text);
  assert.equal(items[0].doi, "10.1061/(ASCE)AS.1943-5525.0000913");
  assert.equal(items[0].year, 2018);
});
