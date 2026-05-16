const test = require("node:test");
const assert = require("node:assert/strict");
import { buildSaeSearchUrl, buildSaeFilterUrl, parseSaeResultCount, parseSaeItemsFromHtml, parseSaeItemsFromVisibleText } from "../src/mcp/researchdb/sae/flow";

test("SAE URL builders preserve verified Angular hash query and facet refinement contract", () => {
  assert.equal(
    buildSaeSearchUrl({ query: "unmanned aerial vehicle" }),
    "https://saemobilus.sae.org/search#q=unmanned%2520aerial%2520vehicle"
  );
  assert.equal(
    buildSaeFilterUrl({ query: "unmanned aerial vehicle", facet: "Technical Paper" }),
    "https://saemobilus.sae.org/search#q=unmanned%2520aerial%2520vehicle&sub_group=Technical%2520Paper"
  );
});

test("SAE result/count parsing works from deterministic fixture DOM", () => {
  const html = `
    <html><body>
      <div>Items (1,946)</div>
      <div class="search-result-card">
        <a href="/content/2023-01-0130/">Study of Phase Change Thermal Management Architecture for Series-Hybrid Powertrain in Unmanned Aerial Vehicles</a>
        <span>Kokate, Rohan and Virk, Akashdeep Singh</span>
        <span>WCX SAE World Congress Experience</span>
        <span>SAE International 2023</span>
        <a>https://doi.org/10.4271/2023-01-0130</a>
      </div>
      <div class="search-result-card">
        <a>Study on the Current Status and Evaluation Methods of Noise Certification for Unmanned Aerial Vehicles</a>
        <span>Qin, Jiaxu and Fu, Jinhua</span>
        <span>SAE 2023 Intelligent Urban Air Mobility Symposium</span>
        <span>2023</span>
        <a>10.4271/2023-01-7078</a>
      </div>
    </body></html>`;
  assert.equal(parseSaeResultCount("Items (1,946)"), 1946);
  const items = parseSaeItemsFromHtml(html);
  assert.equal(items.length, 2);
  assert.equal(items[0].title, "Study of Phase Change Thermal Management Architecture for Series-Hybrid Powertrain in Unmanned Aerial Vehicles");
  assert.equal(items[0].doi, "10.4271/2023-01-0130");
  assert.equal(items[0].year, 2023);
  assert.equal(items[1].doi, "10.4271/2023-01-7078");
});

test("SAE visible-text fallback extracts deterministic result rows without live network", () => {
  const text = "Items (851) Technical Paper Study of Phase Change Thermal Management Architecture for Series-Hybrid Powertrain in Unmanned Aerial Vehicles Kokate, Rohan and Virk, Akashdeep Singh WCX SAE World Congress Experience SAE International 2023 https://doi.org/10.4271/2023-01-0130 Abstract";
  const items = parseSaeItemsFromVisibleText(text);
  assert.equal(items[0].doi, "10.4271/2023-01-0130");
  assert.equal(items[0].year, 2023);
});
