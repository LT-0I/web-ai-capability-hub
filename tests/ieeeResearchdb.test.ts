const test = require("node:test");
const assert = require("node:assert/strict");
import { buildIeeeSearchUrl, buildIeeeFilterUrl, parseIeeeResultCount, parseIeeeItemsFromHtml, parseIeeeItemsFromVisibleText } from "../src/handlers/researchdb/legacy/ieee";

test("IEEE URL builders preserve verified boolean query and URL refinement contract", () => {
  assert.equal(
    buildIeeeSearchUrl({ query: "unmanned aerial vehicle", terms: [
      { term: "unmanned aerial vehicle", field: "All Metadata" },
      { term: "reinforcement learning", field: "All Metadata", operator: "AND" }
    ] }),
    "https://ieeexplore.ieee.org/search/searchresult.jsp?action=search&newsearch=true&matchBoolean=true&queryText=%28%22All+Metadata%22%3Aunmanned+aerial+vehicle%29+AND+%28%22All+Metadata%22%3Areinforcement+learning%29"
  );
  const filter = buildIeeeFilterUrl({ query: "unmanned aerial vehicle", terms: [
    { term: "unmanned aerial vehicle", field: "All Metadata" },
    { term: "reinforcement learning", field: "All Metadata", operator: "AND" }
  ], content_type: "Journals", page_size: 25 });
  assert.equal(filter, "https://ieeexplore.ieee.org/search/searchresult.jsp?action=search&newsearch=true&matchBoolean=true&queryText=%28%22All+Metadata%22%3Aunmanned+aerial+vehicle%29+AND+%28%22All+Metadata%22%3Areinforcement+learning%29&rowsPerPage=25&refinements=ContentType%3AJournals");
});

test("IEEE result/count parsing works from deterministic fixture DOM", () => {
  const html = `
    <html><head><title>IEEE Xplore Search Results</title></head><body>
      <span>Showing 1-25 of 6,949 results</span>
      <div class="List-results-items">
        <h2><a>Deep Reinforcement Learning for UAV Navigation in Complex Environments</a></h2>
        <div>J. Chen, A. Smith and R. Gupta</div>
        <div>Published in: 2024 IEEE International Conference on Robotics and Automation</div>
        <div>Date of Publication: 2024 DOI: 10.1109/ICRA57147.2024.10610000</div>
      </div>
      <div class="List-results-items">
        <h2><a>Multi-agent Reinforcement Learning for Unmanned Aerial Vehicles</a></h2>
        <div>Y. Wang; L. Liu</div>
        <div>Published in: IEEE Transactions on Aerospace and Electronic Systems</div>
        <div>Year: 2023 DOI: 10.1109/TAES.2023.1234567</div>
      </div>
    </body></html>`;
  assert.equal(parseIeeeResultCount("Showing 1-25 of 6,949 results for (\"All Metadata\":uav)"), 6949);
  const items = parseIeeeItemsFromHtml(html);
  assert.equal(items.length, 2);
  assert.equal(items[0].title, "Deep Reinforcement Learning for UAV Navigation in Complex Environments");
  assert.equal(items[0].doi, "10.1109/ICRA57147.2024.10610000");
  assert.equal(items[0].year, 2024);
  assert.equal(items[1].doi, "10.1109/TAES.2023.1234567");
});

test("IEEE visible-text fallback extracts items without live network", () => {
  const text = "Showing 1-25 of 2,934 results Article Deep Reinforcement Learning for UAV Navigation Published in: IEEE Access Date of Publication: 2024 DOI: 10.1109/ACCESS.2024.1234567 Abstract: example";
  const items = parseIeeeItemsFromVisibleText(text);
  assert.equal(items[0].title, "Deep Reinforcement Learning for UAV Navigation");
  assert.equal(items[0].publication, "IEEE Access");
  assert.equal(items[0].doi, "10.1109/ACCESS.2024.1234567");
});

