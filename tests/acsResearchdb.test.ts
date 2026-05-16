const test = require("node:test");
const assert = require("node:assert/strict");
import { buildAcsSearchUrl, buildAcsFilterUrl, buildAcsCitationUrl, parseAcsResultCount, parseAcsItemsFromHtml, parseAcsItemsFromVisibleText } from "../src/mcp/researchdb/acs/flow";

test("ACS URL builders preserve verified doSearch and showCitFormats contracts", () => {
  assert.equal(
    buildAcsSearchUrl({ query: "unmanned aerial vehicle", title_query: "trajectory optimization", page_size: 20 }),
    "https://pubs.acs.org/action/doSearch?field1=AllField&text1=unmanned+aerial+vehicle&field2=Title&text2=trajectory+optimization&publication=&accessType=allContent&Earliest=&pageSize=20"
  );
  const filter = buildAcsFilterUrl({ query: "unmanned aerial vehicle", title_query: "trajectory optimization", earliest: "[20250516 TO 202605162359]", pub_type: "journals", series_key: "acsodf", page_size: 20 });
  assert.equal(filter, "https://pubs.acs.org/action/doSearch?field1=AllField&text1=unmanned+aerial+vehicle&field2=Title&text2=trajectory+optimization&publication=&accessType=allContent&Earliest=%5B20250516+TO+202605162359%5D&pageSize=20&PubType=journals&SeriesKey=acsodf");
  assert.equal(buildAcsCitationUrl("10.1021/acsomega.5c06815"), "https://pubs.acs.org/action/showCitFormats?doi=10.1021%2Facsomega.5c06815");
});

test("ACS result/count parsing works from deterministic fixture DOM", () => {
  const html = `
    <html><body>
      <div>CONTENT TYPE Journal Article 8</div>
      <div>RESULTS: 1 - 2of8</div>
      <div class="issue-item">
        <h5><a href="/doi/10.1021/acsomega.5c06815">Deployment of Solid-Supported Natural Deep Eutectic Solvents via Unmanned Aerial Vehicles</a></h5>
        <span>Thirunavukkarasu Indiran, Hernán Alvarez and Chi Kit Ao</span>
        <span>Published May 28, 2025</span><em>ACS Omega</em>
        <a href="/doi/10.1021/acsomega.5c06815">https://doi.org/10.1021/acsomega.5c06815</a>
      </div>
      <div class="issue-item">
        <h5><a href="/doi/10.1021/acsami.5c01043">Trajectory Optimization for Materials Interfaces</a></h5>
        <span>Jaewan Ahn and Junseong Ahn</span><span>2025</span><em>ACS Applied Materials & Interfaces</em>
        <a>https://doi.org/10.1021/acsami.5c01043</a>
      </div>
    </body></html>`;
  assert.equal(parseAcsResultCount("NARROW RESULTS CONTENT TYPE Journal Article 8 RESULTS: 1 - 2of8"), 8);
  const items = parseAcsItemsFromHtml(html);
  assert.equal(items.length, 2);
  assert.equal(items[0].title, "Deployment of Solid-Supported Natural Deep Eutectic Solvents via Unmanned Aerial Vehicles");
  assert.equal(items[0].doi, "10.1021/acsomega.5c06815");
  assert.equal(items[0].year, 2025);
  assert.equal(items[1].publication, "ACS Applied Materials & Interfaces");
});

test("ACS visible-text fallback extracts items without live network", () => {
  const text = "NARROW RESULTS RESULTS: 1 - 1of8 Article Deployment of Solid-Supported Natural Deep Eutectic Solvents via Unmanned Aerial Vehicles Thirunavukkarasu Indiran and Hernán Alvarez Published May 28, 2025 ACS Omega https://doi.org/10.1021/acsomega.5c06815 PDF Export Citation";
  const items = parseAcsItemsFromVisibleText(text);
  assert.equal(items[0].doi, "10.1021/acsomega.5c06815");
  assert.equal(items[0].year, 2025);
});
