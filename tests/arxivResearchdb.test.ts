const test = require("node:test");
const assert = require("node:assert/strict");
import { buildArxivSearchUrl, buildArxivFilterUrl, buildArxivBibtexUrl, normalizeArxivId, parseArxivResultCount, parseArxivItemsFromHtml, parseArxivItemsFromVisibleText } from "../src/handlers/researchdb/legacy/arxiv";

test("arXiv URL builders preserve verified advanced-search, refine, and bibtex endpoints", () => {
  assert.equal(
    buildArxivSearchUrl({ terms: [
      { term: "unmanned aerial vehicle", field: "title" },
      { term: "obstacle avoidance", field: "abstract", operator: "AND" }
    ], page_size: 50 }),
    "https://arxiv.org/search/advanced?advanced=1&terms-0-operator=AND&terms-0-term=unmanned+aerial+vehicle&terms-0-field=title&terms-1-operator=AND&terms-1-term=obstacle+avoidance&terms-1-field=abstract&classification-physics_archives=all&classification-include_cross_list=include&date-filter_by=all_dates&date-year=&date-from_date=&date-to_date=&date-date_type=submitted_date&abstracts=show&size=50&order=-announced_date_first"
  );
  assert.equal(
    buildArxivFilterUrl({ terms: [
      { term: "unmanned aerial vehicle", field: "title" },
      { term: "obstacle avoidance", field: "abstract", operator: "AND" }
    ], subject: "computer_science", year: 2021, page_size: 50 }),
    "https://arxiv.org/search/advanced?advanced=1&terms-0-operator=AND&terms-0-term=unmanned+aerial+vehicle&terms-0-field=title&terms-1-operator=AND&terms-1-term=obstacle+avoidance&terms-1-field=abstract&classification-physics_archives=all&classification-include_cross_list=include&date-filter_by=specific_year&date-year=2021&date-from_date=&date-to_date=&date-date_type=submitted_date&abstracts=show&size=50&order=-announced_date_first&classification-computer_science=y"
  );
  assert.equal(buildArxivBibtexUrl("arXiv:2112.13819"), "https://arxiv.org/bibtex/2112.13819");
  assert.equal(normalizeArxivId("https://arxiv.org/abs/2112.13819v2"), "2112.13819v2");
});

test("arXiv result/count parsing works from deterministic fixture DOM", () => {
  const html = `
    <html><body>
      <h1 class="title is-clearfix">Showing 1–20 of 20 results</h1>
      <ol>
        <li class="arxiv-result">
          <p class="list-title"><a href="/abs/2112.13819">arXiv:2112.13819</a> [cs.RO]</p>
          <p class="title is-5 mathjax">Trajectory Planning for Hybrid Unmanned Aerial Vehicles</p>
          <p class="authors">Authors: Gabriela Pinheiro, Carlos X. Rosero and Marcelo H. Ang Jr</p>
          <span class="abstract-full">Abstract: This work presents obstacle avoidance for a hybrid UAV. ▽ More</span>
          <p>Submitted 26 December, 2021; doi 10.48550/arXiv.2112.13819</p>
        </li>
        <li class="arxiv-result">
          <p class="list-title"><a href="/abs/2112.13724">arXiv:2112.13724</a> [cs.RO]</p>
          <p class="title is-5 mathjax">Obstacle avoidance for unmanned aerial vehicles</p>
          <p class="authors">Authors: Jane Smith and Wei Zhang</p><p>Submitted 2021</p>
        </li>
      </ol>
    </body></html>`;
  assert.equal(parseArxivResultCount("Showing 1–20 of 20 results"), 20);
  const items = parseArxivItemsFromHtml(html);
  assert.equal(items.length, 2);
  assert.equal(items[0].id, "2112.13819");
  assert.equal(items[0].title, "Trajectory Planning for Hybrid Unmanned Aerial Vehicles");
  assert.equal(items[0].year, 2021);
  assert.equal(items[0].abs_url, "https://arxiv.org/abs/2112.13819");
  assert.equal(items[1].id, "2112.13724");
});

test("arXiv visible-text fallback extracts records without live network", () => {
  const text = "Showing 1–4 of 4 results arXiv:2112.13819 [pdf, ps, other] cs.RO Trajectory Planning for Hybrid Unmanned Aerial Vehicles Authors: Gabriela Pinheiro and Marcelo H. Ang Jr Abstract: This work includes obstacle avoidance. Submitted 26 December, 2021";
  const items = parseArxivItemsFromVisibleText(text);
  assert.equal(items[0].id, "2112.13819");
  assert.equal(items[0].year, 2021);
  assert.equal(items[0].abs_url, "https://arxiv.org/abs/2112.13819");
});
