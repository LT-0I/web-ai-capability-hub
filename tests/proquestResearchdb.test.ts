const test = require("node:test");
const assert = require("node:assert/strict");
import { buildProquestAdvancedSearchUrl, buildProquestInlineNoftQuery, parseProquestResultCount, parseProquestItemsFromHtml, parseProquestItemsFromDomRows } from "../src/handlers/researchdb/legacy/proquest";

test("ProQuest URL and inline noft query builders preserve verified advanced-search route", () => {
  assert.equal(buildProquestAdvancedSearchUrl(), "https://www.proquest.com/advanced?accountid=16605");
  assert.equal(buildProquestInlineNoftQuery("unmanned aerial vehicle"), "noft(unmanned aerial vehicle)");
  assert.equal(buildProquestInlineNoftQuery("noft(unmanned aerial vehicle) AND noft(control)"), "noft(unmanned aerial vehicle) AND noft(control)");
});

test("ProQuest result-count parser handles Chinese and English result headers", () => {
  assert.equal(parseProquestResultCount("11,273 个检索结果"), 11273);
  assert.equal(parseProquestResultCount("检索结果: 10,755"), 10755);
  assert.equal(parseProquestResultCount("10,755 results"), 10755);
});

test("ProQuest HTML item parser extracts deterministic result rows", () => {
  const html = `
    <html><body>
      <div class="resultsHeaderBarItem">11,273 个检索结果</div>
      <ol>
        <li class="resultItem" id="citation1">
          <a class="resultTitle">Distributed Robust Formation Tracking Control for Quadrotor UAVs</a>
          <div>Author: Zhang, Wei; Li, Ming</div>
          <div>Source: Aerospace; Published: 2023; AN 2882251388</div>
        </li>
        <li class="resultItem" id="citation2">
          <a class="resultTitle">Robust Control of Unmanned Aerial Vehicle Swarms</a>
          <div>Author: Smith, Jane</div>
          <div>Source: Control Engineering; Published: 2024; AN 2999999999</div>
        </li>
      </ol>
    </body></html>`;
  const items = parseProquestItemsFromHtml(html);
  assert.equal(items.length, 2);
  assert.equal(items[0].title, "Distributed Robust Formation Tracking Control for Quadrotor UAVs");
  assert.equal(items[0].year, 2023);
  assert.equal(items[0].accession_number, "2882251388");
  assert.equal(items[1].accession_number, "2999999999");
});

test("ProQuest DOM-row parser extracts title and accession number from CDP dumps", () => {
  const items = parseProquestItemsFromDomRows([{ title: "Distributed Robust Formation Tracking Control for Quadrotor UAVs", text: "Distributed Robust Formation Tracking Control for Quadrotor UAVs Author: Zhang, Wei Source: Aerospace Published: 2023 AN 2882251388" }]);
  assert.equal(items.length, 1);
  assert.equal(items[0].title, "Distributed Robust Formation Tracking Control for Quadrotor UAVs");
  assert.equal(items[0].authors[0], "Zhang");
  assert.equal(items[0].year, 2023);
  assert.equal(items[0].accession_number, "2882251388");
});
